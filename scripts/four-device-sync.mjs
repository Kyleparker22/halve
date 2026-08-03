/**
 * The M3 gate (04 Build Plan.md): four devices, one round, two offline for
 * holes 5–14, all reconnecting at staggered times. Final scorecard identical
 * on all four, zero data loss, zero duplicate holes.
 *
 *   node scripts/four-device-sync.mjs
 *
 * What this is and is not. It drives four independent clients against the real
 * hosted database, each with its own outbox, flushing at different times — so
 * it exercises the upsert_score version contract, the conflict path, and
 * convergence. It does not drive four physical handsets: iOS simulators cannot
 * toggle airplane mode, so "offline" here means the client queues locally and
 * does not call the server, which is exactly what the app's outbox does. The
 * on-device NetInfo wiring still needs a human with four phones.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  readFileSync(join(root, 'apps/mobile/.env'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);

const URL_ = env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const EMAIL = 'maestro@example.com';
const PASSWORD = 'maestro-e2e-password';

let token = '';
const api = async (path, init = {}) => {
  const res = await fetch(`${URL_}${path}`, {
    ...init,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token || ANON}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${path} → ${res.status} ${text}`);
  return body;
};

const assert = (cond, message) => {
  if (!cond) {
    console.error(`✗ ${message}`);
    process.exitCode = 1;
    throw new Error(message);
  }
  console.log(`✓ ${message}`);
};

/**
 * One phone. Holds its own view of the card and its own outbox, exactly like
 * scorecard-store does, and only touches the network when it is "online".
 */
class Device {
  constructor(name, online = true) {
    this.name = name;
    this.online = online;
    this.local = new Map(); // cell -> { strokes, version }
    this.outbox = [];
    this.conflicts = [];
  }

  static cell(playerId, hole) {
    return `${playerId}:${hole}`;
  }

  /** Local-first: render immediately, queue the write. */
  enter(playerId, hole, strokes, { clockSkewMs = 0 } = {}) {
    const key = Device.cell(playerId, hole);
    const known = this.local.get(key);
    this.local.set(key, { strokes, version: known?.version ?? 0, pending: true });
    this.outbox = this.outbox.filter((item) => item.key !== key);
    this.outbox.push({
      key,
      playerId,
      hole,
      strokes,
      baseVersion: known?.version ?? 0,
      clientUpdatedAt: new Date(Date.now() + clockSkewMs).toISOString(),
    });
  }

  async flush() {
    if (!this.online) return;
    for (const item of [...this.outbox]) {
      const [row] = await api('/rest/v1/rpc/upsert_score', {
        method: 'POST',
        body: JSON.stringify({
          p_round_player_id: item.playerId,
          p_hole_number: item.hole,
          p_strokes: item.strokes,
          p_putts: null,
          p_penalties: null,
          p_client_id: crypto.randomUUID(),
          p_client_updated_at: item.clientUpdatedAt,
          p_base_version: item.baseVersion,
        }),
      }).then((r) => (Array.isArray(r) ? r : [r]));

      // Rule 2 of the sync contract: inspect the return value. A lost race is
      // a successful call that changed nothing.
      const lost = row.strokes !== item.strokes;
      if (lost) this.conflicts.push({ key: item.key, mine: item.strokes, theirs: row.strokes });
      this.local.set(item.key, { strokes: row.strokes, version: Number(row.version), pending: false });
      this.outbox = this.outbox.filter((q) => q !== item);
    }
  }

  /** What this phone would show after a refresh. */
  async refetch(playerIds) {
    const rows = await api(
      `/rest/v1/scores?select=round_player_id,hole_number,strokes,version&round_player_id=in.(${playerIds.join(',')})&order=round_player_id,hole_number`,
    );
    for (const r of rows) {
      this.local.set(Device.cell(r.round_player_id, r.hole_number), {
        strokes: r.strokes,
        version: Number(r.version),
        pending: false,
      });
    }
    return rows;
  }

  snapshot() {
    return [...this.local.entries()]
      .filter(([, v]) => v.strokes !== null && v.strokes !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v.strokes}`)
      .join('|');
  }
}

// ---------------------------------------------------------------------------

console.log('Four-device sync test — the M3 gate\n');

const auth = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
}).then((r) => r.json());
token = auth.access_token;
if (!token) throw new Error('could not sign in as the e2e user');
const me = auth.user.id;

// A crew this user owns, so they may create rounds.
const crews = await api(
  `/rest/v1/crew_members?select=crew_id,role&profile_id=eq.${me}&role=in.(owner,admin)`,
);
const crewId = crews[0]?.crew_id;
if (!crewId) throw new Error('no crew where this user is an admin — run the Maestro flows first');

const [course] = await api('/rest/v1/courses?select=id&limit=1');
const [tee] = await api(`/rest/v1/tees?select=id&course_id=eq.${course.id}&limit=1`);

await api('/rest/v1/rounds', {
  method: 'POST',
  headers: { Prefer: 'return=minimal' },
  body: JSON.stringify({
    crew_id: crewId,
    course_id: course.id,
    tee_id: tee.id,
    scheduled_at: new Date(Date.now() + 864e5).toISOString(),
    timezone: 'America/New_York',
    hole_count: 18,
    created_by: me,
    name: `sync-test-${Date.now()}`,
  }),
});
const [round] = await api(
  `/rest/v1/rounds?select=id&crew_id=eq.${crewId}&order=created_at.desc&limit=1`,
);

// Four players: the owner plus three guests, so the card is a realistic foursome.
const guests = [];
for (const name of ['Sync Guest A', 'Sync Guest B', 'Sync Guest C']) {
  const unique = `${name} ${Date.now()}`;
  await api('/rest/v1/crew_guests', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ crew_id: crewId, name: unique, vouched_by: me }),
  });
  const [g] = await api(
    `/rest/v1/crew_guests?select=id&crew_id=eq.${crewId}&name=eq.${encodeURIComponent(unique)}`,
  );
  guests.push(g.id);
}

await api('/rest/v1/round_players', {
  method: 'POST',
  headers: { Prefer: 'return=minimal' },
  // PostgREST needs identical keys across a bulk insert, so both columns are
  // always present and one is null.
  body: JSON.stringify([
    { round_id: round.id, profile_id: me, guest_id: null, rsvp: 'in', position: 1 },
    ...guests.map((id, i) => ({
      round_id: round.id,
      profile_id: null,
      guest_id: id,
      rsvp: 'in',
      position: i + 2,
    })),
  ]),
});
const players = (
  await api(`/rest/v1/round_players?select=id&round_id=eq.${round.id}&order=position`)
).map((p) => p.id);

console.log(`round ${round.id} with ${players.length} players\n`);

const [a, b, c, d] = [new Device('A'), new Device('B'), new Device('C'), new Device('D')];
const devices = [a, b, c, d];

// Holes 1–4: everyone online, each device enters for its own player.
for (let hole = 1; hole <= 4; hole += 1) {
  devices.forEach((dev, i) => dev.enter(players[i], hole, 4));
  for (const dev of devices) await dev.flush();
}
console.log('holes 1–4 scored with everyone online');

// Holes 5–14: C and D go dark. They keep scoring locally.
c.online = false;
d.online = false;
for (let hole = 5; hole <= 14; hole += 1) {
  devices.forEach((dev, i) => dev.enter(players[i], hole, 5));
  for (const dev of devices) await dev.flush();
}
console.log('holes 5–14 scored with C and D offline');

// While C is dark, A enters a correction for C's player on hole 7 — the
// someone-else-keeps-the-card case. C's queued write for that cell is now stale.
a.enter(players[2], 7, 3);
await a.flush();
console.log('A corrected C\'s hole 7 to 3 while C was offline');

// Holes 15–18: still only A and B online.
for (let hole = 15; hole <= 18; hole += 1) {
  devices.forEach((dev, i) => dev.enter(players[i], hole, 4));
  for (const dev of devices) await dev.flush();
}

// Staggered reconnect: C first, D a beat later.
c.online = true;
await c.flush();
console.log('C reconnected and drained its outbox');

d.online = true;
await d.flush();
console.log('D reconnected and drained its outbox\n');

// A device whose clock is 30 minutes fast must not win permanently.
b.enter(players[1], 3, 9, { clockSkewMs: 30 * 60 * 1000 });
await b.flush();
a.local.set(Device.cell(players[1], 3), { strokes: 9, version: 0 });
a.enter(players[1], 3, 4);
await a.refetch(players);
a.enter(players[1], 3, 4);
await a.flush();

// --- assertions ------------------------------------------------------------

const rows = await api(
  `/rest/v1/scores?select=round_player_id,hole_number,strokes&round_player_id=in.(${players.join(',')})`,
);

assert(rows.length === 72, `exactly 72 score rows — 4 players × 18 holes (got ${rows.length})`);

const cells = new Set(rows.map((r) => `${r.round_player_id}:${r.hole_number}`));
assert(cells.size === 72, 'zero duplicate holes');

assert(
  rows.every((r) => r.strokes !== null),
  'zero data loss — every hole has a score',
);

for (const dev of devices) await dev.refetch(players);
const snapshots = devices.map((dev) => dev.snapshot());
assert(
  snapshots.every((s) => s === snapshots[0]),
  'final scorecard identical on all four devices',
);

const contested = rows.find((r) => r.round_player_id === players[2] && r.hole_number === 7);
assert(
  contested.strokes === 3,
  `the correction survived C's stale reconnect (hole 7 = ${contested.strokes}, expected 3)`,
);
assert(
  c.conflicts.some((x) => x.key === Device.cell(players[2], 7)),
  'C was told its write lost, rather than silently diverging',
);

const skewed = rows.find((r) => r.round_player_id === players[1] && r.hole_number === 3);
assert(
  skewed.strokes === 4,
  `a 30-minute-fast clock did not win permanently (hole 3 = ${skewed.strokes}, expected 4)`,
);

console.log('\nAll four devices converged. M3 gate criteria met at the sync-contract level.');
