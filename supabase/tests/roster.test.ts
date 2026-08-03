/**
 * Roster editing. The interesting half is what it refuses to do.
 *
 * scores, game_participants and game_results all reference round_players
 * `on delete cascade`, so removing a player who has been scored does not error
 * — it deletes their scores and their game_results, and the game silently stops
 * summing to zero. The balance trigger fires on insert and update, not on a
 * cascade arriving from another table, so nothing downstream catches it either.
 */
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { setupDatabase, SEED, type Db } from './harness';

let db: Db;

beforeAll(async () => {
  db = await setupDatabase();
}, 120_000);

afterAll(async () => {
  await db?.close();
});

/** A scheduled round with one player who has never touched a card. */
async function freshRound(roundId: string, playerId: string): Promise<void> {
  await db.exec(`
    insert into rounds (id, crew_id, course_id, tee_id, name, scheduled_at, timezone,
                        hole_count, status, visibility, max_players, created_by)
    values ('${roundId}', '${SEED.crewSaturday}',
            'b0000000-0000-4000-a000-000000000001', 'c0000000-0000-4000-a000-000000000001',
            'Roster test', now() + interval '2 days', 'America/New_York',
            18, 'scheduled', 'crew', 4, '${SEED.kyle}');
    insert into round_players (id, round_id, profile_id, rsvp, position)
    values ('${playerId}', '${roundId}', '${SEED.todd}', 'invited', 1);
  `);
}

describe('removing a player', () => {
  it('refuses once they have a score', async () => {
    await expect(
      db.exec(`delete from round_players where id = '${SEED.kylePlayer}'`),
    ).rejects.toThrow(/already scored|game results/i);

    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from scores where round_player_id = '${SEED.kylePlayer}'`,
    );
    expect(rows[0]!.n).toBeGreaterThan(0); // and the scores are still there
  });

  it('refuses when they have game results, even with no scores left', async () => {
    const round = '11000000-0000-4000-a000-0000000000c1';
    const player = '21000000-0000-4000-a000-0000000000c1';
    await freshRound(round, player);

    // A settled two-player game: results must sum to zero.
    const other = '21000000-0000-4000-a000-0000000000c2';
    const game = '31000000-0000-4000-a000-0000000000c1';
    await db.exec(`
      insert into round_players (id, round_id, profile_id, rsvp, position)
      values ('${other}', '${round}', '${SEED.marcus}', 'in', 2);
      insert into games (id, round_id, type, config, created_by)
      values ('${game}', '${round}', 'nassau', '{}'::jsonb, '${SEED.kyle}');
      set constraints all deferred;
      insert into game_results (game_id, round_player_id, amount_cents, breakdown) values
        ('${game}', '${player}', 500, '{}'::jsonb),
        ('${game}', '${other}', -500, '{}'::jsonb);
      set constraints all immediate;
    `);

    await expect(
      db.exec(`delete from round_players where id = '${player}'`),
    ).rejects.toThrow(/game results/i);
  });

  it('allows it before anyone has scored', async () => {
    const round = '11000000-0000-4000-a000-0000000000c3';
    const player = '21000000-0000-4000-a000-0000000000c3';
    await freshRound(round, player);

    await db.exec(`delete from round_players where id = '${player}'`);
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from round_players where id = '${player}'`,
    );
    expect(rows[0]!.n).toBe(0);
  });

  it('takes them out of any game they were entered into', async () => {
    const round = '11000000-0000-4000-a000-0000000000c4';
    const player = '21000000-0000-4000-a000-0000000000c4';
    const game = '31000000-0000-4000-a000-0000000000c4';
    await freshRound(round, player);
    await db.exec(`
      insert into games (id, round_id, type, config, created_by)
      values ('${game}', '${round}', 'skins', '{}'::jsonb, '${SEED.kyle}');
      insert into game_participants (game_id, round_player_id) values ('${game}', '${player}');
    `);

    await db.exec(`delete from round_players where id = '${player}'`);
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from game_participants where game_id = '${game}'`,
    );
    expect(rows[0]!.n).toBe(0);
  });

  /**
   * The guard must not turn into a reason a round can never be deleted. When
   * the parent round goes, round_players cascade, and that is not a roster edit
   * — blocking it would leave undeletable rows behind forever.
   */
  it('does not block deleting the round itself', async () => {
    const round = '11000000-0000-4000-a000-0000000000c5';
    const player = '21000000-0000-4000-a000-0000000000c5';
    await freshRound(round, player);
    await db.exec(`
      insert into scores (round_player_id, hole_number, strokes, client_id, client_updated_at, updated_by)
      values ('${player}', 1, 4, gen_random_uuid(), now(), '${SEED.kyle}');
    `);

    await db.exec(`delete from rounds where id = '${round}'`);
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from round_players where round_id = '${round}'`,
    );
    expect(rows[0]!.n).toBe(0);
  });
});
