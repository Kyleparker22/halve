/**
 * course-search — the course data adapter.
 *
 * Two rules from the specs drive the shape of this:
 *   1. The provider key is server-side only. The app never sees it, which is
 *      why search is proxied through here rather than called from the client.
 *   2. Cache aggressively. Fetch from the provider on first search, upsert into
 *      courses/tees/holes, and serve from Postgres forever after. The free tier
 *      is small and a round in progress must never touch a third party.
 *
 * The provider is wrapped in a normalise step so it can be swapped —
 * GolfCourseAPI today, golfapi.io or a CSV dump later — without the client
 * knowing. If no key is configured the function degrades to a local-only
 * search rather than failing, so the app still works on seeded data.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

interface NormalisedHole {
  number: number;
  par: number;
  yardage: number | null;
  stroke_index: number;
}

interface NormalisedTee {
  name: string;
  gender: string;
  par: number;
  yardage: number | null;
  rating: number | null;
  slope: number | null;
  holes: NormalisedHole[];
}

interface NormalisedCourse {
  external_id: string;
  name: string;
  club_name: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  hole_count: number;
  needs_review: boolean;
  tees: NormalisedTee[];
  raw: unknown;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/**
 * Stroke index is required — net games are unplayable without it. When the
 * provider omits it, fall back to hardest-hole-first by yardage so the round
 * is playable, and flag the course so the UI can ask a human to correct it.
 */
function deriveStrokeIndexes(holes: Array<{ par: number; yardage: number | null }>): number[] {
  const order = holes
    .map((hole, i) => ({ i, yardage: hole.yardage ?? 0, par: hole.par }))
    .sort((a, b) => b.yardage - a.yardage || b.par - a.par || a.i - b.i);

  const indexes = new Array<number>(holes.length);
  order.forEach((entry, rank) => {
    indexes[entry.i] = rank + 1;
  });
  return indexes;
}

function normalise(raw: Record<string, unknown>): NormalisedCourse | null {
  const id = String(raw.id ?? raw.course_id ?? '');
  const name = String(raw.course_name ?? raw.name ?? '').trim();
  if (!id || !name) return null;

  const location = (raw.location ?? {}) as Record<string, unknown>;
  const teeGroups = (raw.tees ?? {}) as Record<string, unknown>;

  const tees: NormalisedTee[] = [];
  let needsReview = false;

  for (const [gender, list] of Object.entries(teeGroups)) {
    if (!Array.isArray(list)) continue;
    for (const entry of list as Array<Record<string, unknown>>) {
      const rawHoles = Array.isArray(entry.holes) ? (entry.holes as Array<Record<string, unknown>>) : [];
      if (rawHoles.length !== 9 && rawHoles.length !== 18) continue;

      const base = rawHoles.map((hole, i) => ({
        number: i + 1,
        par: Number(hole.par ?? 4),
        yardage: hole.yardage === undefined || hole.yardage === null ? null : Number(hole.yardage),
      }));

      const provided = rawHoles.map((hole) =>
        hole.handicap === undefined || hole.handicap === null ? null : Number(hole.handicap),
      );
      const complete =
        provided.every((v) => v !== null && v >= 1 && v <= base.length) &&
        new Set(provided).size === base.length;

      if (!complete) needsReview = true;
      const indexes = complete ? (provided as number[]) : deriveStrokeIndexes(base);

      tees.push({
        name: String(entry.tee_name ?? entry.name ?? 'Default'),
        gender: gender.startsWith('f') ? 'F' : 'M',
        par: Number(entry.par_total ?? base.reduce((sum, h) => sum + h.par, 0)),
        yardage: entry.total_yards === undefined ? null : Number(entry.total_yards),
        rating: entry.course_rating === undefined ? null : Number(entry.course_rating),
        slope: entry.slope_rating === undefined ? null : Number(entry.slope_rating),
        holes: base.map((hole, i) => ({ ...hole, stroke_index: indexes[i]! })),
      });
    }
  }

  if (tees.length === 0) return null;

  return {
    external_id: id,
    name,
    club_name: raw.club_name ? String(raw.club_name) : null,
    city: location.city ? String(location.city) : null,
    state: location.state ? String(location.state) : null,
    country: location.country ? String(location.country) : 'US',
    hole_count: tees[0]!.holes.length,
    needs_review: needsReview,
    tees,
    raw,
  };
}

Deno.serve(async (request: Request) => {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return json({ error: 'missing authorization' }, 401);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const providerKey = Deno.env.get('GOLFCOURSE_API_KEY');

  const { query } = (await request.json()) as { query?: string };
  const term = (query ?? '').trim();
  if (term.length < 2) return json({ courses: [], source: 'none' });

  // Only signed-in users may search; this also keeps the provider quota from
  // being burned by anyone who finds the URL.
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: who } = await caller.auth.getUser();
  if (!who?.user) return json({ error: 'not signed in' }, 401);

  const admin = createClient(url, serviceKey);

  // Multi-course clubs name their courses "East", "North", "Black" — the part
  // a person searches for is in club_name. Matching only name finds nothing.
  const matches = `name.ilike.%${term}%,club_name.ilike.%${term}%`;

  const local = await admin
    .from('courses')
    .select('id, name, club_name, city, state, needs_review')
    .or(matches)
    .limit(20);

  if (!providerKey) {
    return json({ courses: local.data ?? [], source: 'cache-only' });
  }

  /**
   * The cache is the hot path, and "have we asked this before?" is the only
   * question that answers reliably. Counting local matches does not: a search
   * for one specific course legitimately returns one row, and treating that as
   * a cache miss sends every such search to the provider forever.
   *
   * A term is re-asked at most monthly, so new courses still appear eventually.
   * Negative results are remembered too — a course the provider does not have
   * would otherwise be re-queried on every search.
   */
  const cacheKey = term.toLowerCase();
  const { data: seen } = await admin
    .from('course_search_log')
    .select('searched_at')
    .eq('term', cacheKey)
    .maybeSingle();

  const FRESH_MS = 30 * 24 * 60 * 60 * 1000;
  if (seen && Date.now() - new Date(seen.searched_at).getTime() < FRESH_MS) {
    return json({ courses: local.data ?? [], source: 'cache' });
  }

  let fetched: NormalisedCourse[] = [];
  try {
    const response = await fetch(
      `https://api.golfcourseapi.com/v1/search?search_query=${encodeURIComponent(term)}`,
      { headers: { Authorization: `Key ${providerKey}` } },
    );
    if (response.ok) {
      const payload = (await response.json()) as { courses?: Array<Record<string, unknown>> };
      fetched = (payload.courses ?? [])
        .map(normalise)
        .filter((c): c is NormalisedCourse => c !== null)
        .slice(0, 10);
    }
  } catch (error) {
    // A provider outage must never break search — the cache still answers.
    console.error('provider search failed', error);
  }

  for (const course of fetched) {
    const { data: saved, error } = await admin
      .from('courses')
      .upsert(
        {
          source: 'golfcourseapi',
          external_id: course.external_id,
          name: course.name,
          club_name: course.club_name,
          city: course.city,
          state: course.state,
          country: course.country,
          hole_count: course.hole_count,
          needs_review: course.needs_review,
          raw: course.raw,
        },
        { onConflict: 'source,external_id' },
      )
      .select('id')
      .single();
    if (error || !saved) continue;

    for (const tee of course.tees) {
      const { data: savedTee } = await admin
        .from('tees')
        .upsert(
          {
            course_id: saved.id,
            name: tee.name,
            gender: tee.gender,
            par: tee.par,
            yardage: tee.yardage,
            rating: tee.rating,
            slope: tee.slope,
          },
          { onConflict: 'course_id,name,gender' },
        )
        .select('id')
        .single();
      if (!savedTee) continue;

      // Replace rather than merge: a provider correcting its data should not
      // leave a half-old card behind.
      await admin.from('holes').delete().eq('tee_id', savedTee.id);
      await admin
        .from('holes')
        .insert(tee.holes.map((hole) => ({ tee_id: savedTee.id, ...hole })));
    }
  }

  // Record the term even when the provider returned nothing, so a course it
  // does not carry is asked for once a month rather than on every search.
  await admin
    .from('course_search_log')
    .upsert({ term: cacheKey, hits: fetched.length, searched_at: new Date().toISOString() });

  const merged = await admin
    .from('courses')
    .select('id, name, club_name, city, state, needs_review')
    .or(matches)
    .limit(20);

  return json({ courses: merged.data ?? [], source: 'provider' });
});
