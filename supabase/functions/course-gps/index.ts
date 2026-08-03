/**
 * course-gps — imports green and tee coordinates from OpenStreetMap.
 *
 * Golf courses are mapped in OSM as `golf=hole` ways (a line from tee to green,
 * tagged with `ref` = the hole number) and `golf=green` polygons. That is
 * enough to produce front/centre/back yardages, which is what a golfer standing
 * in the fairway actually wants — the scorecard's 412 yards is a fact about the
 * hole, not about where they are.
 *
 * Coverage is uneven and that is stated rather than hidden: a mapped course
 * comes back complete, an unmapped one comes back empty, and `gps_checked_at`
 * is written either way so an unmapped course is not re-queried every round.
 *
 * Data © OpenStreetMap contributors, ODbL. Attribution is required wherever
 * these coordinates are displayed.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

interface Body {
  course_id: string;
  /** Re-import a course that already has points. */
  force?: boolean;
}

interface LatLng {
  lat: number;
  lon: number;
}

interface OverpassWay {
  type: 'way';
  id: number;
  tags?: Record<string, string>;
  geometry?: LatLng[];
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const EARTH_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Metres between two coordinates. Haversine; good to well under a yard here. */
function distance(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.sqrt(s));
}

/**
 * Ray casting, in degrees. Fine at this scale — a golf course is small enough
 * that treating lat/lon as a plane introduces no error that matters for
 * "is this hole inside this club's boundary".
 */
function inside(point: LatLng, polygon: LatLng[]): boolean {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (
      a.lat > point.lat !== b.lat > point.lat &&
      point.lon < ((b.lon - a.lon) * (point.lat - a.lat)) / (b.lat - a.lat) + a.lon
    ) {
      hit = !hit;
    }
  }
  return hit;
}

/** Loose match: "Innisbrook (Copperhead)" against "Copperhead". */
function nameScore(candidate: string | undefined, ...targets: Array<string | null>): number {
  if (!candidate) return 0;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const c = norm(candidate);
  let best = 0;
  for (const target of targets) {
    if (!target) continue;
    const t = norm(target);
    if (!t) continue;
    if (c === t) best = Math.max(best, 3);
    else if (c.includes(t) || t.includes(c)) best = Math.max(best, 2);
    else if (t.split(' ').some((word) => word.length > 3 && c.includes(word))) {
      best = Math.max(best, 1);
    }
  }
  return best;
}

function centroid(points: LatLng[]): LatLng {
  const sum = points.reduce((acc, p) => ({ lat: acc.lat + p.lat, lon: acc.lon + p.lon }), {
    lat: 0,
    lon: 0,
  });
  return { lat: sum.lat / points.length, lon: sum.lon / points.length };
}

/**
 * Front and back of the green along the line of approach.
 *
 * Not the bounding box: a green is approached from a direction, so "front" is
 * the nearest point *as the golfer walks in*, which means projecting every
 * vertex onto the approach vector and taking the extremes. A north-south
 * bounding box on a green approached from the east gives the wrong two points.
 */
function frontAndBack(green: LatLng[], approachFrom: LatLng, centre: LatLng) {
  // Local flat-earth metres — fine over a few hundred metres.
  const mPerDegLat = 111_320;
  const mPerDegLon = 111_320 * Math.cos(toRad(centre.lat));
  const vec = {
    x: (centre.lon - approachFrom.lon) * mPerDegLon,
    y: (centre.lat - approachFrom.lat) * mPerDegLat,
  };
  const length = Math.hypot(vec.x, vec.y);
  if (length < 1) return { front: null, back: null };
  const unit = { x: vec.x / length, y: vec.y / length };

  let front = green[0]!;
  let back = green[0]!;
  let min = Infinity;
  let max = -Infinity;

  for (const point of green) {
    const proj =
      ((point.lon - centre.lon) * mPerDegLon) * unit.x +
      ((point.lat - centre.lat) * mPerDegLat) * unit.y;
    if (proj < min) {
      min = proj;
      front = point;
    }
    if (proj > max) {
      max = proj;
      back = point;
    }
  }
  return { front, back };
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return json({ error: 'POST only' }, 405);

  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return json({ error: 'missing authorization' }, 401);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const { course_id: courseId, force = false } = (await request.json()) as Body;
  if (!courseId) return json({ error: 'course_id required' }, 400);

  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: who } = await caller.auth.getUser();
  if (!who?.user) return json({ error: 'not signed in' }, 401);

  const admin = createClient(url, serviceKey);

  const { data: course, error } = await admin
    .from('courses')
    .select('id, name, club_name, lat, lng, hole_count, gps_source, gps_checked_at')
    .eq('id', courseId)
    .single();
  if (error || !course) return json({ error: 'course not found' }, 404);

  if (!course.lat || !course.lng) {
    return json({ error: 'course has no location', imported: 0 }, 422);
  }

  // A manually placed pin beats anything a polygon centroid can produce, so
  // never overwrite one with an import.
  if (course.gps_source === 'manual' && !force) {
    return json({ imported: 0, source: 'manual', skipped: 'course is manually mapped' });
  }

  /**
   * Re-asking Overpass about an unmapped course on every round is both slow and
   * rude — it is a volunteer-run service. Thirty days is long enough that a
   * newly mapped course still shows up in a reasonable time.
   */
  const FRESH_MS = 30 * 24 * 60 * 60 * 1000;
  if (
    !force &&
    course.gps_checked_at &&
    Date.now() - new Date(course.gps_checked_at).getTime() < FRESH_MS
  ) {
    const { count } = await admin
      .from('hole_points')
      .select('id', { count: 'exact', head: true })
      .eq('course_id', courseId);
    return json({ imported: 0, cached: true, existing: count ?? 0 });
  }

  /**
   * The course boundary is fetched alongside the holes, and it is not optional.
   *
   * A radius search at a multi-course resort returns every course's holes at
   * once — verified at Innisbrook, where a 2km query came back with hole "18"
   * twice. Upserting on (course, hole) would have silently overwritten one with
   * the other and handed a golfer a yardage to the wrong green. So: pull the
   * `leisure=golf_course` polygons too, pick the one that matches this course
   * by name, and keep only the holes inside it.
   */
  const query = `[out:json][timeout:30];
(
  way["leisure"="golf_course"](around:3000,${course.lat},${course.lng});
  relation["leisure"="golf_course"](around:3000,${course.lat},${course.lng});
  way["golf"="green"](around:2500,${course.lat},${course.lng});
  way["golf"="hole"](around:2500,${course.lat},${course.lng});
);
out geom;`;

  let elements: OverpassWay[] = [];
  try {
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        // Overpass asks for a contactable agent; an anonymous flood gets blocked.
        'User-Agent': 'Bagdrop/1.0 (golf scorekeeping; https://bagdrop.golf)',
      },
      body: `data=${encodeURIComponent(query)}`,
    });
    if (!response.ok) {
      return json({ error: `overpass ${response.status}`, imported: 0 }, 502);
    }
    const payload = (await response.json()) as { elements?: OverpassWay[] };
    elements = payload.elements ?? [];
  } catch (caught) {
    console.error('overpass request failed', caught);
    return json({ error: 'could not reach OpenStreetMap', imported: 0 }, 502);
  }

  let greens = elements.filter((e) => e.tags?.golf === 'green' && (e.geometry?.length ?? 0) >= 3);
  let holes = elements.filter((e) => e.tags?.golf === 'hole' && (e.geometry?.length ?? 0) >= 2);

  // Pick this club's boundary and discard everything outside it.
  const boundaries = elements.filter(
    (e) => e.tags?.leisure === 'golf_course' && (e.geometry?.length ?? 0) >= 3,
  );
  let boundaryName: string | null = null;
  if (boundaries.length > 0) {
    const scored = boundaries
      .map((b) => ({
        way: b,
        score: nameScore(b.tags?.name, course.name, (course as { club_name?: string }).club_name ?? null),
      }))
      .sort((a, b) => b.score - a.score);

    // A named match wins. With none, fall back to whichever boundary actually
    // contains the course's own coordinates — better than guessing.
    const chosen =
      scored[0]!.score > 0
        ? scored[0]!.way
        : boundaries.find((b) =>
            inside({ lat: Number(course.lat), lon: Number(course.lng) }, b.geometry!),
          );

    if (chosen) {
      boundaryName = chosen.tags?.name ?? null;
      const polygon = chosen.geometry!;
      holes = holes.filter((h) => inside(h.geometry![h.geometry!.length - 1]!, polygon));
      greens = greens.filter((g) => inside(centroid(g.geometry!), polygon));
    }
  }

  /**
   * Belt and braces. If a boundary was missing or drawn loosely and two holes
   * still claim the same number, write neither — a silently wrong green is far
   * worse than an absent one, because the golfer clubs off it.
   */
  const seen = new Map<number, number>();
  for (const hole of holes) {
    const n = Number(hole.tags?.ref);
    if (Number.isInteger(n)) seen.set(n, (seen.get(n) ?? 0) + 1);
  }
  const ambiguous = new Set([...seen.entries()].filter(([, n]) => n > 1).map(([ref]) => ref));

  const rows: Array<Record<string, unknown>> = [];

  for (const hole of holes) {
    if (ambiguous.has(Number(hole.tags?.ref))) continue;
    const number = Number(hole.tags?.ref);
    if (!Number.isInteger(number) || number < 1 || number > 18) continue;

    const path = hole.geometry!;
    const tee = path[0]!;
    // The hole way runs tee → green, so its last point is at the green.
    const approachEnd = path[path.length - 1]!;

    // Match the green whose centroid is nearest that end. 60m is generous
    // enough for a sloppily drawn way and tight enough not to grab the next
    // hole's green.
    let matched: { green: OverpassWay; centre: LatLng } | null = null;
    let best = 60;
    for (const green of greens) {
      const centre = centroid(green.geometry!);
      const d = distance(approachEnd, centre);
      if (d < best) {
        best = d;
        matched = { green, centre };
      }
    }
    if (!matched) continue;

    // Approach direction comes from the last leg of the hole way, not from the
    // tee — a dogleg's tee is in the wrong direction entirely.
    const approachFrom = path.length >= 2 ? path[path.length - 2]! : tee;
    const { front, back } = frontAndBack(matched.green.geometry!, approachFrom, matched.centre);

    rows.push({
      course_id: courseId,
      hole_number: number,
      green_lat: matched.centre.lat,
      green_lng: matched.centre.lon,
      green_front_lat: front?.lat ?? null,
      green_front_lng: front?.lon ?? null,
      green_back_lat: back?.lat ?? null,
      green_back_lng: back?.lon ?? null,
      tee_lat: tee.lat,
      tee_lng: tee.lon,
      source: 'osm',
      external_ref: `way/${hole.id}`,
      updated_at: new Date().toISOString(),
    });
  }

  if (rows.length > 0) {
    const { error: writeError } = await admin
      .from('hole_points')
      .upsert(rows, { onConflict: 'course_id,hole_number' });
    if (writeError) return json({ error: writeError.message }, 500);
  }

  // Written even when nothing was found — that is the point of the timestamp.
  await admin
    .from('courses')
    .update({
      gps_checked_at: new Date().toISOString(),
      gps_source: rows.length > 0 ? 'osm' : course.gps_source,
    })
    .eq('id', courseId);

  return json({
    imported: rows.length,
    holesFound: holes.length,
    greensFound: greens.length,
    boundary: boundaryName,
    // Surfaced rather than swallowed: an ambiguous hole is a mapping problem
    // someone can fix, either in OSM or by dropping a pin.
    ambiguous: [...ambiguous],
    attribution: '© OpenStreetMap contributors',
  });
});
