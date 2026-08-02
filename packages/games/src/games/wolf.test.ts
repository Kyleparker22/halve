import { describe, expect, it } from 'vitest';
import { computeGame } from '../compute';
import { sumCents } from '../money';
import { FRONT_NINE, P1, P2, P3, P4, cards, player } from '../fixtures/course';
import type { WolfConfig } from '../types';

const money = (result: { perPlayer: { roundPlayerId: string; amountCents: number }[] }) =>
  Object.fromEntries(result.perPlayer.map((p) => [p.roundPlayerId, p.amountCents]));

const players = [player(P1), player(P2), player(P3), player(P4)];

/**
 * Nine holes, $2 a man, lone 2×, blind 3×. Wolf rotates Kyle → Todd → Marcus →
 * Dave. Hand-verified hole by hole:
 *
 *  1  Kyle wolf, takes Todd     4 v 5  wolf side wins  → Kyle +4, Todd +4, M −4, D −4
 *  2  Todd wolf, LONE           3 v 4  wolf wins 2×    → Todd +12, others −4 each
 *  3  Marcus wolf, LONE         4 v 3  WOLF LOSES 2×   → Marcus −12, others +4 each
 *  4  Dave wolf, takes Kyle     4 v 5  wolf side wins  → Dave +4, Kyle +4, T −4, M −4
 *  5  Kyle wolf, takes Marcus   4 v 4  halved          → no money
 *  6  Todd wolf, takes Kyle     4 v 5  wolf side wins  → Todd +4, Kyle +4, M −4, D −4
 *  7  Marcus wolf, BLIND        4 v 5  wolf wins 3×    → Marcus +18, others −6 each
 *  8  Dave wolf, takes Kyle     3 v 4  wolf side wins  → Dave +4, Kyle +4, T −4, M −4
 *  9  Kyle wolf, LONE           6 v 5  WOLF LOSES 2×   → Kyle −12, others +4 each
 *
 *  Totals: Kyle −$2, Todd +$14, Marcus −$10, Dave −$2
 */
const scores = cards({
  [P1]: [4, 4, 3, 5, 4, 4, 5, 3, 6],
  [P2]: [5, 3, 4, 5, 4, 6, 5, 4, 5],
  [P3]: [5, 4, 4, 5, 4, 5, 4, 4, 5],
  [P4]: [5, 4, 4, 4, 4, 5, 5, 3, 5],
});

const config: WolfConfig = {
  type: 'wolf',
  stakeCents: 200,
  handicap: { mode: 'gross' },
  loneMultiplier: 2,
  blindMultiplier: 3,
  order: [P1, P2, P3, P4],
  decisions: [
    { hole: 1, partnerRoundPlayerId: P2 },
    { hole: 2, lone: 'lone' },
    { hole: 3, lone: 'lone' },
    { hole: 4, partnerRoundPlayerId: P1 },
    { hole: 5, partnerRoundPlayerId: P3 },
    { hole: 6, partnerRoundPlayerId: P1 },
    { hole: 7, lone: 'blind' },
    { hole: 8, partnerRoundPlayerId: P1 },
    { hole: 9, lone: 'lone' },
  ],
};

describe('wolf — nine holes with lone and blind wolves', () => {
  it('matches the hand-verified card', () => {
    const result = computeGame(config, FRONT_NINE, players, scores);
    expect(money(result)).toEqual({ [P1]: -200, [P2]: 1400, [P3]: -1000, [P4]: -200 });
    expect(sumCents(result.perPlayer)).toBe(0);
    expect(result.isComplete).toBe(true);
  });

  it('a lone wolf who loses pays every opponent', () => {
    const line = computeGame(config, FRONT_NINE, players, scores).breakdown.find((l) =>
      l.text.startsWith('Hole 3'),
    )!;
    expect(line.text).toBe('Hole 3 — Marcus lone wolf. Field won at 2×. $4 a man.');
    expect(line.holes).toEqual([3]);
  });

  it('pays the blind wolf at the blind multiplier', () => {
    const result = computeGame(config, FRONT_NINE, players, scores);
    expect(result.breakdown.find((l) => l.text.startsWith('Hole 7'))!.text).toBe(
      'Hole 7 — Marcus blind wolf. Wolf side won at 3×. $6 a man.',
    );
  });

  it('halves a hole where both sides match', () => {
    const result = computeGame(config, FRONT_NINE, players, scores);
    expect(result.breakdown.find((l) => l.text.startsWith('Hole 5'))!.text).toContain(
      'Halved, no money',
    );
  });
});

describe('wolf — missing data', () => {
  it('does not settle a hole with no recorded choice, and says so', () => {
    const result = computeGame(
      { ...config, decisions: config.decisions.filter((d) => d.hole !== 4) },
      FRONT_NINE,
      players,
      scores,
    );
    expect(result.isComplete).toBe(false);
    expect(result.breakdown.find((l) => l.text.startsWith('Hole 4'))!.text).toContain(
      'no choice was recorded',
    );
    // Hole 4 is simply absent from the money.
    expect(money(result)).toEqual({ [P1]: -600, [P2]: 1800, [P3]: -600, [P4]: -600 });
    expect(sumCents(result.perPlayer)).toBe(0);
  });

  it('refuses to play with fewer than three players', () => {
    const result = computeGame(config, FRONT_NINE, [player(P1), player(P2)], scores);
    expect(money(result)).toEqual({ [P1]: 0, [P2]: 0 });
    expect(result.isComplete).toBe(false);
    expect(result.breakdown[0]!.text).toContain('at least three players');
  });

  it('skips holes nobody has scored', () => {
    const result = computeGame(config, FRONT_NINE, players, []);
    expect(money(result)).toEqual({ [P1]: 0, [P2]: 0, [P3]: 0, [P4]: 0 });
    expect(result.isComplete).toBe(false);
  });
});
