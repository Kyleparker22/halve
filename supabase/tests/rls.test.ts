/**
 * M0 acceptance: the migration set applies in one pass, the seed loads, and a
 * non-member gets zero rows from every money table AND from the crew_balances
 * view. Testing tables alone would ship the view leak with CI green.
 */
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { setupDatabase, queryAs, asUser, SEED, type Db } from './harness';

let db: Db;

beforeAll(async () => {
  db = await setupDatabase();
}, 120_000);

afterAll(async () => {
  await db?.close();
});

describe('migrations and seed', () => {
  it('applies every migration in one pass and seeds', async () => {
    const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from courses`);
    expect(rows[0]!.n).toBe(3);
  });

  it('seeds the dataset §13 requires', async () => {
    const counts = await db.query<{ what: string; n: number }>(`
      select 'profiles' as what, count(*)::int as n from profiles
      union all select 'crews', count(*)::int from crews
      union all select 'guests', count(*)::int from crew_guests
      union all select 'rounds', count(*)::int from rounds
      union all select 'scores', count(*)::int from scores
      union all select 'games', count(*)::int from games
      union all select 'trips', count(*)::int from trips
      union all select 'rooms', count(*)::int from rooms
      union all select 'expenses', count(*)::int from trip_expenses
    `);
    const byName = Object.fromEntries(counts.rows.map((r) => [r.what, r.n]));
    expect(byName.profiles).toBe(6);
    expect(byName.crews).toBe(2);
    expect(byName.guests).toBe(2);
    expect(byName.rounds).toBe(4);
    expect(byName.scores).toBe(72); // 4 players × 18 holes
    expect(byName.games).toBe(1);
    expect(byName.trips).toBe(1);
    expect(byName.rooms).toBe(2);
    // one hand-logged expense + one auto-generated per occupied room
    expect(byName.expenses).toBe(3);
  });

  it('creates profiles through the signup trigger, not by hand', async () => {
    const { rows } = await db.query<{ handle: string; display_name: string }>(
      `select handle, display_name from profiles where id = $1`,
      [SEED.kyle],
    );
    expect(rows[0]).toEqual({ handle: 'kyle', display_name: 'Kyle Parker' });
  });

  it('enables RLS on every table in public', async () => {
    const { rows } = await db.query<{ tablename: string }>(`
      select tablename from pg_tables
      where schemaname = 'public' and rowsecurity = false
    `);
    expect(rows.map((r) => r.tablename)).toEqual([]);
  });

  it('declares security_invoker on every view', async () => {
    const { rows } = await db.query<{ viewname: string; opts: string[] | null }>(`
      select c.relname as viewname, c.reloptions as opts
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'v'
    `);
    expect(rows.length).toBeGreaterThan(0);
    for (const view of rows) {
      expect(view.opts ?? [], `${view.viewname} must be security_invoker`).toContain(
        'security_invoker=true',
      );
    }
  });
});

describe('a non-member gets zero rows', () => {
  // Priya is in College Buddies. Everything seeded below belongs to the
  // Saturday Regulars crew, which she has no connection to.
  const cases: Array<[string, string]> = [
    ['crews', `select id from crews where id = '${SEED.crewSaturday}'`],
    ['rounds', `select id from rounds`],
    ['round_players', `select id from round_players`],
    ['scores', `select id from scores`],
    ['games', `select id from games`],
    ['game_results', `select id from game_results`],
    ['ledger_entries', `select id from ledger_entries`],
    ['settlements', `select id from settlements`],
    ['settlement_batches', `select id from settlement_batches`],
    ['crew_balances (view)', `select * from crew_balances`],
    ['trips', `select id from trips`],
    ['trip_expenses', `select id from trip_expenses`],
    ['trip_expense_shares', `select * from trip_expense_shares`],
    ['messages', `select id from messages`],
    ['feed_items', `select id from feed_items`],
    ['crew_guests', `select id from crew_guests`],
  ];

  for (const [label, sql] of cases) {
    it(`${label}`, async () => {
      const rows = await queryAs(db, SEED.priya, sql);
      expect(rows).toEqual([]);
    });
  }

  it('positive control — a member sees the same rows', async () => {
    const crews = await queryAs(db, SEED.kyle, `select id from crews where id = $1`, [
      SEED.crewSaturday,
    ]);
    expect(crews).toHaveLength(1);

    const scores = await queryAs(db, SEED.kyle, `select id from scores`);
    expect(scores).toHaveLength(72);

    const balances = await queryAs(db, SEED.kyle, `select * from crew_balances`);
    expect(balances.length).toBeGreaterThan(0);

    const ledger = await queryAs(db, SEED.kyle, `select id from ledger_entries`);
    expect(ledger).toHaveLength(3);
  });

  it('a trip member who is not a crew member still sees their own ledger entries', async () => {
    // Dana is in the crew; use a fresh outsider instead.
    await db.exec(`
      insert into auth.users (id, email, raw_user_meta_data)
      values ('a0000000-0000-4000-a000-0000000000ff', 'outsider@example.com',
              '{"handle":"outsider","display_name":"Outsider"}');
      insert into ledger_entries (crew_id, from_profile, to_profile, amount_cents, source_type, note)
      values ('${SEED.crewSaturday}', 'a0000000-0000-4000-a000-0000000000ff', '${SEED.kyle}',
              500, 'manual', 'cart fee');
    `);
    const rows = await queryAs(
      db,
      'a0000000-0000-4000-a000-0000000000ff',
      `select id, note from ledger_entries`,
    );
    expect(rows).toHaveLength(1);

    // ...but still nothing else from that crew.
    const crews = await queryAs(db, 'a0000000-0000-4000-a000-0000000000ff', `select id from crews`);
    expect(crews).toEqual([]);
  });
});

describe('cross-crew writes are rejected', () => {
  it('a member of crew B cannot write a score for a round_player in crew A', async () => {
    await expect(
      asUser(db, SEED.priya, () =>
        db.query(
          `insert into scores (round_player_id, hole_number, strokes, client_id, client_updated_at)
           values ($1, 1, 3, gen_random_uuid(), now())`,
          [SEED.kylePlayer],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('a member of crew B cannot update an existing score in crew A', async () => {
    const result = await asUser(db, SEED.priya, () =>
      db.query(`update scores set strokes = 1 where round_player_id = $1`, [SEED.kylePlayer]),
    );
    expect(result.affectedRows).toBe(0);
  });

  it('a member of crew B cannot insert a ledger entry into crew A', async () => {
    await expect(
      asUser(db, SEED.priya, () =>
        db.query(
          `insert into ledger_entries (crew_id, from_profile, to_profile, amount_cents, source_type)
           values ($1, $2, $3, 100, 'manual')`,
          [SEED.crewSaturday, SEED.priya, SEED.kyle],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('a round participant can write a score for any other player — by design', async () => {
    await asUser(db, SEED.marcus, () =>
      db.query(
        `select upsert_score($1, 1, 4, null, null, gen_random_uuid(), now(), 999::bigint)`,
        [SEED.kylePlayer],
      ),
    );
    const { rows } = await db.query<{ strokes: number; updated_by: string }>(
      `select strokes, updated_by from scores where round_player_id = $1 and hole_number = 1`,
      [SEED.kylePlayer],
    );
    expect(rows[0]!.strokes).toBe(4);
    expect(rows[0]!.updated_by).toBe(SEED.marcus);
  });
});

describe('money invariants are enforced by the database', () => {
  it('rejects game_results that do not sum to zero', async () => {
    await expect(
      db.exec(`
        begin;
        insert into game_results (game_id, round_player_id, amount_cents, breakdown)
        values ('${SEED.nassau}', '20000000-0000-4000-a000-000000000003', 500, '{}');
        commit;
      `),
    ).rejects.toThrow(/must be 0/);
    await db.exec('rollback;').catch(() => undefined);
  });

  it('accepts a balanced multi-row insert in one transaction', async () => {
    await db.exec(`
      begin;
      insert into games (id, round_id, type, config, created_by)
      values ('30000000-0000-4000-a000-0000000000aa', '${SEED.completedRound}', 'skins',
              '{"type":"skins","stakeCents":500,"handicap":{"mode":"gross"},"carryover":true,"validation":false}',
              '${SEED.kyle}');
      insert into game_results (game_id, round_player_id, amount_cents, breakdown) values
        ('30000000-0000-4000-a000-0000000000aa', '20000000-0000-4000-a000-000000000001', 1500, '{}'),
        ('30000000-0000-4000-a000-0000000000aa', '20000000-0000-4000-a000-000000000002', -500, '{}'),
        ('30000000-0000-4000-a000-0000000000aa', '20000000-0000-4000-a000-000000000003', -500, '{}'),
        ('30000000-0000-4000-a000-0000000000aa', '20000000-0000-4000-a000-000000000004', -500, '{}');
      commit;
    `);
    const { rows } = await db.query<{ total: number }>(
      `select coalesce(sum(amount_cents),0)::int as total from game_results where game_id = $1`,
      ['30000000-0000-4000-a000-0000000000aa'],
    );
    expect(rows[0]!.total).toBe(0);
  });

  it('ledger entries are immutable except for status and batch_id', async () => {
    await expect(
      db.query(`update ledger_entries set amount_cents = 1 where id = $1`, [SEED.openLedgerEntry]),
    ).rejects.toThrow(/immutable/);

    await expect(
      db.query(`update ledger_entries set note = 'nope' where id = $1`, [SEED.openLedgerEntry]),
    ).rejects.toThrow(/immutable/);

    // status and batch_id are the two permitted changes
    await db.query(`update ledger_entries set status = 'void' where id = $1`, [
      SEED.openLedgerEntry,
    ]);
    await db.query(`update ledger_entries set status = 'open' where id = $1`, [
      SEED.openLedgerEntry,
    ]);
  });

  it('rejects expense shares that do not sum to the expense', async () => {
    await expect(
      db.exec(`
        begin;
        insert into trip_expenses (id, trip_id, description, amount_cents, paid_by)
        values ('90000000-0000-4000-a000-0000000000bb', '${SEED.trip}', 'Dinner', 20000,
                '60000000-0000-4000-a000-000000000001');
        insert into trip_expense_shares (expense_id, trip_member_id, amount_cents) values
          ('90000000-0000-4000-a000-0000000000bb', '60000000-0000-4000-a000-000000000001', 5000),
          ('90000000-0000-4000-a000-0000000000bb', '60000000-0000-4000-a000-000000000002', 5000);
        commit;
      `),
    ).rejects.toThrow(/shares sum to/);
    await db.exec('rollback;').catch(() => undefined);
  });

  it('splits an expense cent-exactly, remainder to the lowest member ids', async () => {
    await db.exec(`
      begin;
      insert into trip_expenses (id, trip_id, description, amount_cents, paid_by)
      values ('90000000-0000-4000-a000-0000000000cc', '${SEED.trip}', 'Caddies', 10000,
              '60000000-0000-4000-a000-000000000001');
      select split_expense_evenly('90000000-0000-4000-a000-0000000000cc',
        array['60000000-0000-4000-a000-000000000001'::uuid,
              '60000000-0000-4000-a000-000000000002'::uuid,
              '60000000-0000-4000-a000-000000000003'::uuid]);
      commit;
    `);
    const { rows } = await db.query<{ trip_member_id: string; amount_cents: number }>(
      `select trip_member_id, amount_cents from trip_expense_shares
       where expense_id = '90000000-0000-4000-a000-0000000000cc' order by trip_member_id`,
    );
    expect(rows.map((r) => r.amount_cents)).toEqual([3334, 3333, 3333]);
    expect(rows.reduce((sum, r) => sum + r.amount_cents, 0)).toBe(10000);
  });

  it('auto-generates a room expense split across current occupants', async () => {
    const { rows } = await db.query<{ amount_cents: number; n: number }>(`
      select e.amount_cents, count(s.*)::int as n
      from trip_expenses e join trip_expense_shares s on s.expense_id = e.id
      where e.room_id = '50000000-0000-4000-a000-000000000001'
      group by e.amount_cents
    `);
    expect(rows[0]).toEqual({ amount_cents: 96000, n: 2 });

    // Re-derived when someone changes rooms.
    await db.query(`update trip_members set room_id = $1 where id = $2`, [
      '50000000-0000-4000-a000-000000000001',
      '60000000-0000-4000-a000-000000000003',
    ]);
    const after = await db.query<{ n: number; total: number }>(`
      select count(*)::int as n, sum(s.amount_cents)::int as total
      from trip_expense_shares s join trip_expenses e on e.id = s.expense_id
      where e.room_id = '50000000-0000-4000-a000-000000000001'
    `);
    expect(after.rows[0]).toEqual({ n: 3, total: 96000 });
  });
});

describe('offline sync contract (§6.1)', () => {
  const player = SEED.toddPlayer;

  it('a stale write loses and returns the current server row', async () => {
    await db.query(`delete from scores where round_player_id = $1 and hole_number = 5`, [player]);

    const first = await db.query<{ version: string; strokes: number }>(
      `select * from upsert_score($1, 5, 4, null, null, gen_random_uuid(), now(), 0::bigint)`,
      [player],
    );
    expect(Number(first.rows[0]!.version)).toBe(1);
    expect(first.rows[0]!.strokes).toBe(4);

    const second = await db.query<{ version: string; strokes: number }>(
      `select * from upsert_score($1, 5, 6, null, null, gen_random_uuid(), now(), 1::bigint)`,
      [player],
    );
    expect(Number(second.rows[0]!.version)).toBe(2);
    expect(second.rows[0]!.strokes).toBe(6);

    // A device that never saw version 2 tries to write. It must not win, and it
    // must be told what the server actually holds.
    const stale = await db.query<{ version: string; strokes: number }>(
      `select * from upsert_score($1, 5, 9, null, null, gen_random_uuid(), now(), 1::bigint)`,
      [player],
    );
    expect(Number(stale.rows[0]!.version)).toBe(2);
    expect(stale.rows[0]!.strokes).toBe(6);
  });

  it('a fast client clock cannot win a conflict forever', async () => {
    await db.query(`delete from scores where round_player_id = $1 and hole_number = 6`, [player]);

    // Device with a clock 30 minutes fast writes first.
    await db.query(
      `select upsert_score($1, 6, 7, null, null, gen_random_uuid(), now() + interval '30 minutes', 0::bigint)`,
      [player],
    );
    const clamped = await db.query<{ client_updated_at: Date; strokes: number }>(
      `select client_updated_at, strokes from scores where round_player_id = $1 and hole_number = 6`,
      [player],
    );
    expect(clamped.rows[0]!.client_updated_at.getTime()).toBeLessThanOrEqual(Date.now() + 1000);

    // A correct later write from another device still lands.
    const later = await db.query<{ strokes: number }>(
      `select * from upsert_score($1, 6, 5, null, null, gen_random_uuid(), now(), 1::bigint)`,
      [player],
    );
    expect(later.rows[0]!.strokes).toBe(5);
  });
});

describe('account deletion is a tombstone (§10)', () => {
  it('a profile with ledger history can be deleted without an FK violation', async () => {
    const before = await db.query<{ n: number }>(
      `select count(*)::int as n from ledger_entries
       where from_profile = $1 or to_profile = $1`,
      [SEED.todd],
    );
    expect(before.rows[0]!.n).toBeGreaterThan(0);

    await asUser(db, SEED.todd, () => db.query(`select delete_account()`));

    const profile = await db.query<{
      display_name: string;
      handle: string;
      deleted_at: Date | null;
      avatar_url: string | null;
    }>(`select display_name, handle, deleted_at, avatar_url from profiles where id = $1`, [
      SEED.todd,
    ]);
    expect(profile.rows[0]!.display_name).toBe('Deleted golfer');
    expect(profile.rows[0]!.handle).toMatch(/^deleted_/);
    expect(profile.rows[0]!.deleted_at).not.toBeNull();

    // Financial history survives — it has to, or the counterparty's balance breaks.
    const after = await db.query<{ n: number }>(
      `select count(*)::int as n from ledger_entries
       where from_profile = $1 or to_profile = $1`,
      [SEED.todd],
    );
    expect(after.rows[0]!.n).toBe(before.rows[0]!.n);

    const devices = await db.query<{ n: number }>(
      `select count(*)::int as n from devices where profile_id = $1`,
      [SEED.todd],
    );
    expect(devices.rows[0]!.n).toBe(0);
  });

  it('a hard delete of a profile with ledger history is still refused', async () => {
    // Which guard stops it is not the point and has changed once already: the
    // roster trigger now refuses first, because a profile delete cascades into
    // round_players and would take a scored player's game_results with it. The
    // invariant is that a profile with financial history cannot be erased, by
    // whichever rule gets there first — so match the outcome, not the message.
    await expect(db.query(`delete from profiles where id = $1`, [SEED.kyle])).rejects.toThrow(
      /foreign key|violates|game results|already scored/i,
    );
  });
});
