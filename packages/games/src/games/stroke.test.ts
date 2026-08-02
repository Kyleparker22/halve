import { describe, expect, it } from 'vitest';
import { computeGame } from '../compute';
import { sumCents } from '../money';
import { COURSE, P1, P2, P3, P4, cards, player } from '../fixtures/course';

const money = (result: { perPlayer: { roundPlayerId: string; amountCents: number }[] }) =>
  Object.fromEntries(result.perPlayer.map((p) => [p.roundPlayerId, p.amountCents]));

const PAR_ROW = [4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 3, 4, 4, 5, 4, 4, 4, 4]; // 72
const players = [player(P1), player(P2), player(P3), player(P4)];

describe('stroke play — everyone antes, low score takes the pot', () => {
  it('pays the outright winner', () => {
    const result = computeGame(
      { type: 'stroke', stakeCents: 500, handicap: { mode: 'gross' } },
      COURSE,
      players,
      cards({
        [P1]: PAR_ROW, // 72
        [P2]: PAR_ROW.map((s, i) => (i < 2 ? s + 1 : s)), // 74
        [P3]: PAR_ROW.map((s, i) => (i < 4 ? s + 1 : s)), // 76
        [P4]: PAR_ROW.map((s, i) => (i < 8 ? s + 1 : s)), // 80
      }),
    );
    expect(money(result)).toEqual({ [P1]: 1500, [P2]: -500, [P3]: -500, [P4]: -500 });
    expect(sumCents(result.perPlayer)).toBe(0);
    expect(result.breakdown[0]!.text).toBe('Kyle low with 72 over 18 holes. Pot $20.');
  });

  it('splits the pot on a tie', () => {
    const result = computeGame(
      { type: 'stroke', stakeCents: 500, handicap: { mode: 'gross' } },
      COURSE,
      players,
      cards({
        [P1]: PAR_ROW,
        [P2]: PAR_ROW,
        [P3]: PAR_ROW.map((s) => s + 1),
        [P4]: PAR_ROW.map((s) => s + 1),
      }),
    );
    expect(money(result)).toEqual({ [P1]: 500, [P2]: 500, [P3]: -500, [P4]: -500 });
  });

  it('splits an odd pot to the cent, deterministically', () => {
    const result = computeGame(
      { type: 'stroke', stakeCents: 333, handicap: { mode: 'gross' } },
      COURSE,
      [player(P1), player(P2), player(P3)],
      cards({ [P1]: PAR_ROW, [P2]: PAR_ROW, [P3]: PAR_ROW.map((s) => s + 1) }),
    );
    // Pot 999 split two ways: 500 / 499, the extra cent to the lower id.
    expect(money(result)).toEqual({ [P1]: 167, [P2]: 166, [P3]: -333 });
    expect(sumCents(result.perPlayer)).toBe(0);
  });

  it('scores only the holes everyone has finished', () => {
    const result = computeGame(
      { type: 'stroke', stakeCents: 500, handicap: { mode: 'gross' } },
      COURSE,
      players,
      cards({
        [P1]: PAR_ROW,
        [P2]: PAR_ROW.map((s) => s + 1),
        [P3]: PAR_ROW.map((s) => s + 1),
        // Dave picked up on 18 — the hole drops out for everyone rather than
        // handing him a win or an invented penalty.
        [P4]: [...PAR_ROW.slice(0, 17), null],
      }),
    );
    // Over 17 holes Kyle and Dave are level on 68, so they split the $20 pot.
    // The round itself is complete — picking up is a resolved hole, not a gap.
    expect(result.isComplete).toBe(true);
    expect(money(result)).toEqual({ [P1]: 500, [P2]: -500, [P3]: -500, [P4]: 500 });
    expect(result.breakdown[0]!.text).toBe('Tied at 68: Kyle, Dave. Pot $20 split.');
    expect(result.breakdown.some((l) => l.text === 'Kyle — 68 thru 17.')).toBe(true);
  });

  it('says nothing has been scored rather than paying out', () => {
    const result = computeGame(
      { type: 'stroke', stakeCents: 500, handicap: { mode: 'gross' } },
      COURSE,
      players,
      [],
    );
    expect(money(result)).toEqual({ [P1]: 0, [P2]: 0, [P3]: 0, [P4]: 0 });
    expect(result.breakdown[0]!.text).toContain('No hole has a score from everyone');
  });

  it('nets by handicap without the low-man adjustment', () => {
    const result = computeGame(
      { type: 'stroke', stakeCents: 500, handicap: { mode: 'net', allowancePct: 100 } },
      COURSE,
      [player(P1, 0), player(P2, 10)],
      cards({ [P1]: PAR_ROW, [P2]: PAR_ROW.map((s) => s + 1) }), // gross 72 v 90
    );
    // Todd plays off 10 by default in stroke play: 90 − 10 = 80, still loses.
    expect(money(result)).toEqual({ [P1]: 500, [P2]: -500 });
  });
});
