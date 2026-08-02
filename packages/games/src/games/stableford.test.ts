import { describe, expect, it } from 'vitest';
import { computeGame } from '../compute';
import { sumCents } from '../money';
import { COURSE, P1, P2, P3, cards, player } from '../fixtures/course';
import { MODIFIED_STABLEFORD } from '../types';

const money = (result: { perPlayer: { roundPlayerId: string; amountCents: number }[] }) =>
  Object.fromEntries(result.perPlayer.map((p) => [p.roundPlayerId, p.amountCents]));

const PAR_ROW = [4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 3, 4, 4, 5, 4, 4, 4, 4];
const players = [player(P1), player(P2), player(P3)];

describe('stableford — a dollar a point, standard table', () => {
  /**
   * Standard table: birdie 3, par 2, bogey 1.
   *   Kyle   18 pars                       = 36
   *   Todd   1 birdie, 1 bogey, 16 pars    = 3 + 1 + 32 = 36
   *   Marcus 18 bogeys                     = 18
   * Kyle and Todd are level, and each takes 18 points off Marcus at $1.
   */
  const scores = cards({
    [P1]: PAR_ROW,
    [P2]: PAR_ROW.map((s, i) => (i === 0 ? s - 1 : i === 1 ? s + 1 : s)),
    [P3]: PAR_ROW.map((s) => s + 1),
  });

  it('settles each pair on the point difference', () => {
    const result = computeGame(
      { type: 'stableford', stakeCents: 100, handicap: { mode: 'gross' } },
      COURSE,
      players,
      scores,
    );
    expect(money(result)).toEqual({ [P1]: 1800, [P2]: 1800, [P3]: -3600 });
    expect(sumCents(result.perPlayer)).toBe(0);
  });

  it('shows each player their point total', () => {
    const result = computeGame(
      { type: 'stableford', stakeCents: 100, handicap: { mode: 'gross' } },
      COURSE,
      players,
      scores,
    );
    expect(result.breakdown.some((l) => l.text === 'Kyle — 36 points thru 18.')).toBe(true);
    expect(result.breakdown.some((l) => l.text === 'Marcus — 18 points thru 18.')).toBe(true);
    expect(
      result.breakdown.some((l) => l.text === 'Kyle beat Marcus by 18 points @ $1 = $18.'),
    ).toBe(true);
  });
});

describe('stableford — modified table', () => {
  it('can take points off you', () => {
    // Modified: eagle 5, birdie 2, par 0, bogey −1, double −3.
    const result = computeGame(
      { type: 'stableford', stakeCents: 100, handicap: { mode: 'gross' }, table: MODIFIED_STABLEFORD },
      COURSE,
      [player(P1), player(P2)],
      cards({
        [P1]: [3, 4, 3], // birdie, par, par = 2
        [P2]: [5, 6, 3], // bogey, double, par = −4
      }),
    );
    expect(money(result)).toEqual({ [P1]: 600, [P2]: -600 });
  });

  it('clamps scores beyond the ends of the table', () => {
    const result = computeGame(
      { type: 'stableford', stakeCents: 100, handicap: { mode: 'gross' }, table: MODIFIED_STABLEFORD },
      COURSE,
      [player(P1), player(P2)],
      cards({
        [P1]: [1], // hole-in-one on a par 4: 3 under, best listed value
        [P2]: [9], // 5 over: worst listed value
      }),
    );
    expect(money(result)).toEqual({ [P1]: 1100, [P2]: -1100 });
  });
});

describe('stableford — picking up', () => {
  it('scores a hole with no score as zero points, not NaN', () => {
    const result = computeGame(
      { type: 'stableford', stakeCents: 100, handicap: { mode: 'gross' } },
      COURSE,
      [player(P1), player(P2)],
      cards({ [P1]: [4, 4], [P2]: [4, null] }),
    );
    // Kyle 4 points, Todd 2 — a wiped hole costs the two points it was worth.
    expect(money(result)).toEqual({ [P1]: 200, [P2]: -200 });
    expect(sumCents(result.perPlayer)).toBe(0);
  });

  it('reports nothing scored rather than paying out', () => {
    const result = computeGame(
      { type: 'stableford', stakeCents: 100, handicap: { mode: 'gross' } },
      COURSE,
      players,
      [],
    );
    expect(money(result)).toEqual({ [P1]: 0, [P2]: 0, [P3]: 0 });
    expect(result.breakdown[0]!.text).toBe('No holes scored yet.');
  });
});
