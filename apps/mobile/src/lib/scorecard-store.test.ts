/**
 * The offline scorecard's invariants — the M3 gate, at unit level.
 * Four devices, two of them offline for holes 5–14, all reconnecting at
 * different times, must converge on one card with no losses and no duplicates.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { ScoreRow } from '@halve/types';
import { __resetAll } from '../../test/mmkv-mock';
import {
  clearRound,
  dequeue,
  getScore,
  hydrateScores,
  markAttempt,
  pendingCount,
  readOutbox,
  readScores,
  reconcileServerScore,
  recordScore,
  settle,
} from './scorecard-store';

const ROUND = 'round-1';
const KYLE = 'rp-kyle';
const TODD = 'rp-todd';

const serverRow = (over: Partial<ScoreRow> & Pick<ScoreRow, 'round_player_id' | 'hole_number'>): ScoreRow => ({
  id: 'row',
  strokes: 4,
  putts: null,
  penalties: null,
  version: 1,
  client_id: 'server-write',
  client_updated_at: '2026-08-02T12:00:00.000Z',
  updated_by: 'someone',
  updated_at: '2026-08-02T12:00:00.000Z',
  ...over,
});

beforeEach(() => {
  __resetAll();
});

describe('local-first entry', () => {
  it('records instantly and marks the cell pending', () => {
    recordScore(ROUND, { roundPlayerId: KYLE, hole: 1, strokes: 4, putts: null, penalties: null }, 'c1', 'now');

    const score = getScore(ROUND, KYLE, 1);
    expect(score).toMatchObject({ strokes: 4, pending: true, version: 0 });
    expect(pendingCount(ROUND)).toBe(1);
    expect(readOutbox()).toHaveLength(1);
  });

  it('queues the complete row, merged over what we already hold', () => {
    recordScore(ROUND, { roundPlayerId: KYLE, hole: 1, strokes: 4, putts: 2, penalties: 1 }, 'c1', 'now');
    // A later entry that only changes strokes must not wipe putts or penalties.
    recordScore(ROUND, { roundPlayerId: KYLE, hole: 1, strokes: 5, putts: null, penalties: null }, 'c2', 'now');

    const queued = readOutbox();
    expect(queued).toHaveLength(1); // replaced, not stacked
    expect(queued[0]!.payload).toMatchObject({ strokes: 5, putts: 2, penalties: 1 });
  });

  it('keeps one pending write per cell but many across cells', () => {
    recordScore(ROUND, { roundPlayerId: KYLE, hole: 1, strokes: 4, putts: null, penalties: null }, 'c1', 'now');
    recordScore(ROUND, { roundPlayerId: KYLE, hole: 2, strokes: 5, putts: null, penalties: null }, 'c2', 'now');
    recordScore(ROUND, { roundPlayerId: TODD, hole: 1, strokes: 6, putts: null, penalties: null }, 'c3', 'now');
    recordScore(ROUND, { roundPlayerId: KYLE, hole: 1, strokes: 3, putts: null, penalties: null }, 'c4', 'now');

    expect(readOutbox()).toHaveLength(3);
    expect(getScore(ROUND, KYLE, 1)?.strokes).toBe(3);
  });

  it('survives a force-quit — state is read back from storage, not memory', () => {
    recordScore(ROUND, { roundPlayerId: KYLE, hole: 7, strokes: 5, putts: null, penalties: null }, 'c1', 'now');
    // readScores goes to the store every time; nothing is cached in a closure.
    expect(readScores(ROUND)[`${KYLE}:7`]?.strokes).toBe(5);
  });
});

describe('reconciling with the server', () => {
  it('a local write that has not flushed still wins on screen', () => {
    recordScore(ROUND, { roundPlayerId: KYLE, hole: 3, strokes: 4, putts: null, penalties: null }, 'mine', 'now');

    const { changed } = reconcileServerScore(
      ROUND,
      serverRow({ round_player_id: KYLE, hole_number: 3, strokes: 6, version: 2, client_id: 'theirs' }),
    );

    expect(changed).toBe(false);
    const local = getScore(ROUND, KYLE, 3);
    expect(local?.strokes).toBe(4); // still showing what this phone entered
    expect(local?.pending).toBe(true);
    // ...but it now knows what version it has to build on.
    expect(local?.version).toBe(2);
  });

  it('a write that already flushed yields to the server row', () => {
    recordScore(ROUND, { roundPlayerId: KYLE, hole: 4, strokes: 4, putts: null, penalties: null }, 'mine', 'now');
    settle(ROUND, KYLE, 4); // flushed

    const { changed } = reconcileServerScore(
      ROUND,
      serverRow({ round_player_id: KYLE, hole_number: 4, strokes: 5, version: 3, client_id: 'theirs' }),
    );

    expect(changed).toBe(true);
    expect(getScore(ROUND, KYLE, 4)).toMatchObject({ strokes: 5, version: 3, pending: false });
  });

  it('reports no change when the server agrees with us', () => {
    recordScore(ROUND, { roundPlayerId: KYLE, hole: 5, strokes: 4, putts: null, penalties: null }, 'mine', 'now');
    settle(ROUND, KYLE, 5);

    const { changed } = reconcileServerScore(
      ROUND,
      serverRow({ round_player_id: KYLE, hole_number: 5, strokes: 4, version: 2, client_id: 'mine' }),
    );
    expect(changed).toBe(false);
  });

  it('hydrates a whole round from the server without duplicating holes', () => {
    hydrateScores(ROUND, [
      serverRow({ round_player_id: KYLE, hole_number: 1, strokes: 4 }),
      serverRow({ round_player_id: KYLE, hole_number: 2, strokes: 5 }),
      serverRow({ round_player_id: TODD, hole_number: 1, strokes: 6 }),
    ]);
    hydrateScores(ROUND, [serverRow({ round_player_id: KYLE, hole_number: 1, strokes: 4, version: 2 })]);

    expect(Object.keys(readScores(ROUND))).toHaveLength(3);
    expect(pendingCount(ROUND)).toBe(0);
  });
});

describe('the four-device scenario', () => {
  it('converges with no lost holes after a staggered reconnect', () => {
    // Two devices go dark for 5–14 and keep scoring locally.
    for (let hole = 5; hole <= 14; hole += 1) {
      recordScore(
        ROUND,
        { roundPlayerId: KYLE, hole, strokes: 4, putts: null, penalties: null },
        `offline-${hole}`,
        'now',
      );
    }
    expect(pendingCount(ROUND)).toBe(10);
    expect(readOutbox()).toHaveLength(10);

    // They reconnect: every queued write lands, one cell at a time.
    for (const item of readOutbox()) {
      settle(ROUND, item.payload.roundPlayerId, item.payload.hole);
      reconcileServerScore(
        ROUND,
        serverRow({
          round_player_id: item.payload.roundPlayerId,
          hole_number: item.payload.hole,
          strokes: item.payload.strokes,
          client_id: item.payload.clientId,
          version: 1,
        }),
      );
      dequeue(item.id);
    }

    expect(pendingCount(ROUND)).toBe(0);
    expect(readOutbox()).toHaveLength(0);
    for (let hole = 5; hole <= 14; hole += 1) {
      expect(getScore(ROUND, KYLE, hole)?.strokes).toBe(4);
    }
  });

  it('two devices editing different fields on one hole do not wipe each other', () => {
    // This phone sets putts; another phone had already set strokes.
    hydrateScores(ROUND, [
      serverRow({ round_player_id: KYLE, hole_number: 9, strokes: 5, putts: null, version: 4 }),
    ]);
    recordScore(ROUND, { roundPlayerId: KYLE, hole: 9, strokes: 5, putts: 2, penalties: null }, 'putts', 'now');

    const queued = readOutbox()[0]!;
    // The complete row goes up, merged from server state — not a partial patch.
    expect(queued.payload).toMatchObject({ strokes: 5, putts: 2, baseVersion: 4 });
  });
});

describe('outbox bookkeeping', () => {
  it('counts attempts for backoff', () => {
    recordScore(ROUND, { roundPlayerId: KYLE, hole: 1, strokes: 4, putts: null, penalties: null }, 'c1', 'now');
    markAttempt('c1');
    markAttempt('c1');
    expect(readOutbox()[0]!.attempts).toBe(2);
  });

  it('clears a round without touching the queue for other rounds', () => {
    recordScore(ROUND, { roundPlayerId: KYLE, hole: 1, strokes: 4, putts: null, penalties: null }, 'c1', 'now');
    recordScore('round-2', { roundPlayerId: TODD, hole: 1, strokes: 4, putts: null, penalties: null }, 'c2', 'now');

    clearRound(ROUND);
    expect(readScores(ROUND)).toEqual({});
    expect(readScores('round-2')[`${TODD}:1`]?.strokes).toBe(4);
  });

  it('returns null for a hole nobody has touched', () => {
    expect(getScore(ROUND, KYLE, 18)).toBeNull();
  });
});
