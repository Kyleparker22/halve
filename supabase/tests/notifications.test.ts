/**
 * §8 notifications. The queue had never been proven to fill from real events or
 * to be safe from the client, because nothing drained it and so nobody looked.
 *
 * Two classes of test here. The trigger tests assert that doing the thing a
 * golfer does — inviting, joining, settling — puts the right row in front of
 * the right person. The lockdown test asserts the opposite: that the machinery
 * which writes those rows cannot be reached from a phone.
 */
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { setupDatabase, asUser, SEED, type Db } from './harness';

let db: Db;

beforeAll(async () => {
  db = await setupDatabase();
}, 120_000);

afterAll(async () => {
  await db?.close();
});

beforeEach(async () => {
  await db.exec('delete from notification_queue; delete from notification_batches;');
});

interface QueueRow {
  profile_id: string;
  kind: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
}

const queue = async (): Promise<QueueRow[]> =>
  (await db.query<QueueRow>('select profile_id, kind, title, body, data from notification_queue'))
    .rows;

describe('the client cannot reach the notification machinery', () => {
  /**
   * The one that matters. enqueue_notification is security definer and lives in
   * the schema PostgREST exposes, so before the revoke any signed-in user could
   * post arbitrary text to any other user's lock screen — impersonating the app
   * itself. Nothing about RLS prevents that; only the grant does.
   */
  it('refuses enqueue_notification to a signed-in user', async () => {
    await expect(
      asUser(db, SEED.marcus, () =>
        db.query(
          `select enqueue_notification($1, 'message', 'Halve', 'Send me $50', '{}'::jsonb)`,
          [SEED.kyle],
        ),
      ),
    ).rejects.toThrow(/permission denied/i);

    expect(await queue()).toHaveLength(0);
  });

  it('refuses the reminder scan and the dispatcher to a signed-in user', async () => {
    for (const fn of ['queue_round_reminders()', 'dispatch_push()']) {
      await expect(
        asUser(db, SEED.marcus, () => db.query(`select ${fn}`)),
      ).rejects.toThrow(/permission denied/i);
    }
  });

  it('still allows the service role to enqueue', async () => {
    await db.exec(`
      set role service_role;
      select enqueue_notification('${SEED.kyle}', 'message', 'Hi', 'There', '{}'::jsonb);
      reset role;
    `);
    expect(await queue()).toHaveLength(1);
  });

  it('lets a user read only their own notifications', async () => {
    await db.exec(`
      select enqueue_notification('${SEED.kyle}', 'message', 'For Kyle', 'x', '{}'::jsonb);
      select enqueue_notification('${SEED.todd}', 'message', 'For Todd', 'x', '{}'::jsonb);
    `);
    const seen = await asUser(db, SEED.kyle, async () =>
      (await db.query<{ title: string }>('select title from notification_queue')).rows,
    );
    expect(seen.map((r) => r.title)).toEqual(['For Kyle']);
  });
});

describe('events queue notifications', () => {
  it('notifies invitees of a new round but not the organiser', async () => {
    const round = '11000000-0000-4000-a000-0000000000aa';
    await db.exec(`
      insert into rounds (id, crew_id, course_id, tee_id, name, scheduled_at, timezone,
                          hole_count, status, visibility, max_players, created_by)
      values ('${round}', '${SEED.crewSaturday}',
              'b0000000-0000-4000-a000-000000000001', 'c0000000-0000-4000-a000-000000000001',
              'Next Saturday', now() + interval '3 days', 'America/New_York',
              18, 'scheduled', 'crew', 4, '${SEED.kyle}');
      insert into round_players (round_id, profile_id, rsvp, position) values
        ('${round}', '${SEED.kyle}', 'in', 1),
        ('${round}', '${SEED.todd}', 'invited', 2),
        ('${round}', '${SEED.marcus}', 'invited', 3);
    `);

    const rows = await queue();
    expect(rows.map((r) => r.profile_id).sort()).toEqual([SEED.todd, SEED.marcus].sort());
    expect(rows[0]!.kind).toBe('round_invite');
    // The tap has somewhere to go.
    expect(rows[0]!.data.round_id).toBe(round);
  });

  it('tells the crew when someone joins by code, not the joiner', async () => {
    // Priya redeems the Saturday Regulars code. Kyle owns it, Todd is an admin.
    await asUser(db, SEED.priya, () =>
      db.query(`select join_crew_by_code('sat4some01')`),
    );

    const rows = await queue();
    expect(rows.map((r) => r.profile_id).sort()).toEqual([SEED.kyle, SEED.todd].sort());
    expect(rows.every((r) => r.body.includes('Priya'))).toBe(true);
    expect(rows.some((r) => r.profile_id === SEED.priya)).toBe(false);
  });

  it('tells someone added by an admin that they are in', async () => {
    await db.exec(
      `insert into crew_members (crew_id, profile_id, role)
       values ('${SEED.crewCollege}', '${SEED.todd}', 'member')`,
    );
    const rows = await queue();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.profile_id).toBe(SEED.todd);
    expect(rows[0]!.data.crew_id).toBe(SEED.crewCollege);
  });

  it('names the payee when a settlement opens, and routes to the crew', async () => {
    const batch = '80000000-0000-4000-a000-0000000000aa';
    await db.exec(`
      insert into settlement_batches (id, crew_id, created_by, status)
      values ('${batch}', '${SEED.crewSaturday}', '${SEED.kyle}', 'requested');
      insert into settlements (batch_id, from_profile, to_profile, amount_cents)
      values ('${batch}', '${SEED.marcus}', '${SEED.kyle}', 4000);
    `);

    const rows = await queue();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.profile_id).toBe(SEED.marcus); // the one who owes
    expect(rows[0]!.kind).toBe('settlement_requested');
    expect(rows[0]!.body).toContain('$40.00');
    expect(rows[0]!.data.crew_id).toBe(SEED.crewSaturday);
  });

  it('respects a muted notification kind', async () => {
    // Marcus, who is not yet in College Buddies — Todd was added by the test above.
    await db.exec(
      `insert into notification_prefs (profile_id, kind, enabled)
       values ('${SEED.marcus}', 'crew_invite', false)`,
    );
    await db.exec(
      `insert into crew_members (crew_id, profile_id, role)
       values ('${SEED.crewCollege}', '${SEED.marcus}', 'member')`,
    );
    expect(await queue()).toHaveLength(0);
    await db.exec(`delete from notification_prefs where profile_id = '${SEED.marcus}'`);
  });
});

describe('reminder scan', () => {
  /**
   * The T-1h window used to be [45m, 60m] — fifteen minutes wide, scanned every
   * fifteen minutes. One minute of cron drift and the round fell between two
   * scans and nobody was ever told. A round 70 minutes out proves the widening.
   */
  it('catches a round outside the old narrow window', async () => {
    const round = '11000000-0000-4000-a000-0000000000bb';
    await db.exec(`
      insert into rounds (id, crew_id, course_id, tee_id, name, scheduled_at, timezone,
                          hole_count, status, visibility, max_players, created_by)
      values ('${round}', '${SEED.crewSaturday}',
              'b0000000-0000-4000-a000-000000000001', 'c0000000-0000-4000-a000-000000000001',
              'Soon', now() + interval '70 minutes', 'America/New_York',
              18, 'scheduled', 'crew', 4, '${SEED.kyle}');
      insert into round_players (round_id, profile_id, rsvp, position)
      values ('${round}', '${SEED.todd}', 'in', 1);
      delete from notification_queue;
      select queue_round_reminders();
    `);

    const rows = await queue();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.kind).toBe('round_starting');
    expect(rows[0]!.profile_id).toBe(SEED.todd);
  });

  it('does not remind the same round twice when the scan overlaps', async () => {
    await db.exec('select queue_round_reminders(); select queue_round_reminders();');
    const rows = await queue();
    const keys = rows.map((r) => `${r.profile_id}:${r.kind}:${r.data.round_id}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('score debounce', () => {
  /**
   * `unique (round_id, kind, flushed_at)` constrains nothing while a batch is
   * open, because null is distinct from null. Two players entering a score at
   * once each opened a batch and the crew got two pushes for one event.
   */
  it('allows only one open batch per round', async () => {
    await db.exec(
      `insert into notification_batches (round_id, kind)
       values ('${SEED.completedRound}', 'scores_entered')`,
    );
    await expect(
      db.exec(
        `insert into notification_batches (round_id, kind)
         values ('${SEED.completedRound}', 'scores_entered')`,
      ),
    ).rejects.toThrow();
  });

  it('collapses a flurry of scores into one batch', async () => {
    await db.exec(`
      update scores set strokes = strokes where round_player_id = '${SEED.kylePlayer}';
    `);
    const { rows } = await db.query<{ n: number; count: number }>(
      `select count(*)::int as n, max(event_count)::int as count
         from notification_batches where flushed_at is null`,
    );
    expect(rows[0]!.n).toBe(1);
    expect(rows[0]!.count).toBeGreaterThan(1);
  });
});
