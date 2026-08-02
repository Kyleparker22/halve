import { describe, expect, it } from 'vitest';
import { computeGame } from '../compute';
import { sumCents } from '../money';
import { COURSE, P1, P2, P3, P4, cards, player } from '../fixtures/course';

const money = (result: { perPlayer: { roundPlayerId: string; amountCents: number }[] }) =>
  Object.fromEntries(result.perPlayer.map((p) => [p.roundPlayerId, p.amountCents]));

const PAR_ROW = [4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 3, 4, 4, 5, 4, 4, 4, 4]; // 72
const players = [player(P1), player(P2), player(P3), player(P4)];
const teams = { A: [P1, P2], B: [P3, P4] };

describe('best ball — two-person teams, low team total', () => {
  it('pays the stake from each losing player', () => {
    const result = computeGame(
      { type: 'bestball', stakeCents: 2500, handicap: { mode: 'gross' }, teams },
      COURSE,
      players,
      cards({
        [P1]: PAR_ROW, // team A best ball = 72
        [P2]: PAR_ROW.map((s) => s + 2),
        [P3]: PAR_ROW.map((s, i) => (i < 6 ? s + 1 : s)), // team B best ball = 78
        [P4]: PAR_ROW.map((s, i) => (i < 6 ? s + 1 : s)),
      }),
    );
    expect(money(result)).toEqual({ [P1]: 2500, [P2]: 2500, [P3]: -2500, [P4]: -2500 });
    expect(sumCents(result.perPlayer)).toBe(0);
    expect(result.breakdown.some((l) => l.text.includes('Kyle & Todd — 72 best ball thru 18'))).toBe(
      true,
    );
  });

  it('pays nothing when the teams tie', () => {
    const result = computeGame(
      { type: 'bestball', stakeCents: 2500, handicap: { mode: 'gross' }, teams },
      COURSE,
      players,
      cards({
        // Both teams have one par ball on every hole.
        [P1]: PAR_ROW.map((s, i) => (i % 2 === 0 ? s : s + 1)),
        [P2]: PAR_ROW.map((s, i) => (i % 2 === 0 ? s + 1 : s)),
        [P3]: PAR_ROW.map((s, i) => (i % 3 === 0 ? s : s + 1)),
        [P4]: PAR_ROW.map((s, i) => (i % 3 === 0 ? s + 1 : s)),
      }),
    );
    expect(money(result)).toEqual({ [P1]: 0, [P2]: 0, [P3]: 0, [P4]: 0 });
    expect(result.breakdown.some((l) => l.text.includes('Tied at 72. No money.'))).toBe(true);
  });

  it('counts a hole only when every team has a ball on it', () => {
    const result = computeGame(
      { type: 'bestball', stakeCents: 1000, handicap: { mode: 'gross' }, teams },
      COURSE,
      players,
      cards({
        [P1]: [4, 4, 3],
        [P2]: [5, null, 4],
        [P3]: [5, 5, null],
        [P4]: [null, 5, null], // team B has no ball on hole 3
      }),
    );
    expect(result.isComplete).toBe(false);
    // Holes 1–2 count: A 8, B 10.
    expect(money(result)).toEqual({ [P1]: 1000, [P2]: 1000, [P3]: -1000, [P4]: -1000 });
    expect(result.breakdown.some((l) => l.text.includes('thru 2'))).toBe(true);
  });

  it('uses net best ball with the low-man adjustment on', () => {
    const result = computeGame(
      {
        type: 'bestball',
        stakeCents: 1000,
        handicap: { mode: 'net', allowancePct: 100 },
        teams,
      },
      COURSE,
      [player(P1, 0), player(P2, 18), player(P3, 6), player(P4, 6)],
      cards({
        [P1]: PAR_ROW.map((s) => s + 2),
        [P2]: PAR_ROW.map((s) => s + 1), // 90 gross, 72 net off 18
        [P3]: PAR_ROW.map((s) => s + 1),
        [P4]: PAR_ROW.map((s) => s + 1), // 90 gross, 84 net off 6
      }),
    );
    expect(money(result)).toEqual({ [P1]: 1000, [P2]: 1000, [P3]: -1000, [P4]: -1000 });
  });

  it('reports honestly when nothing is scored', () => {
    const result = computeGame(
      { type: 'bestball', stakeCents: 1000, handicap: { mode: 'gross' }, teams },
      COURSE,
      players,
      [],
    );
    expect(money(result)).toEqual({ [P1]: 0, [P2]: 0, [P3]: 0, [P4]: 0 });
    expect(result.breakdown[0]!.text).toContain('No hole has a ball from every team');
  });
});
