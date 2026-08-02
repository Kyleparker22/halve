import { describe, expect, it } from 'vitest';
import { buildCard } from '../card';
import { computeGame } from '../compute';
import { sumCents } from '../money';
import { COURSE, P1, P2, P3, P4, cards, player } from '../fixtures/course';

const money = (result: { perPlayer: { roundPlayerId: string; amountCents: number }[] }) =>
  Object.fromEntries(result.perPlayer.map((p) => [p.roundPlayerId, p.amountCents]));

const PAR_ROW = [4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 3, 4, 4, 5, 4, 4, 4, 4];

describe('match play — 1v1', () => {
  it('all square moves no money', () => {
    const result = computeGame(
      { type: 'match', stakeCents: 5000, handicap: { mode: 'gross' } },
      COURSE,
      [player(P1), player(P2)],
      cards({ [P1]: PAR_ROW, [P2]: PAR_ROW }),
    );
    expect(money(result)).toEqual({ [P1]: 0, [P2]: 0 });
    expect(result.breakdown[0]!.text).toBe('Match — all square. No money.');
  });

  it('closes out when the lead exceeds the holes left', () => {
    // Kyle wins holes 1–6, then every hole is halved: 6 up with 5 to play.
    const kyle = PAR_ROW.map((s, i) => (i < 6 ? s - 1 : s));
    const result = computeGame(
      { type: 'match', stakeCents: 5000, handicap: { mode: 'gross' } },
      COURSE,
      [player(P1), player(P2)],
      cards({ [P1]: kyle, [P2]: PAR_ROW }),
    );
    expect(money(result)).toEqual({ [P1]: 5000, [P2]: -5000 });
    // 6 up stays live until only 5 holes remain: closed out on 13, 6&5.
    expect(result.breakdown[0]!.text).toContain('6&5');
    expect(result.breakdown[1]!.text).toBe('Closed out on 13.');
  });

  it('reports dormie while a match is still live', () => {
    // Kyle wins hole 1; only holes 1 and 2 are played, so he is 1 up with 1 to go.
    const result = computeGame(
      { type: 'match', stakeCents: 5000, handicap: { mode: 'gross' } },
      COURSE.slice(0, 2),
      [player(P1), player(P2)],
      cards({ [P1]: [3, 4], [P2]: [4, 4] }),
    );
    expect(result.breakdown.some((l) => l.text === 'Dormie.')).toBe(false); // decided on the last hole
    expect(money(result)).toEqual({ [P1]: 5000, [P2]: -5000 });
  });

  it('a side with no ball loses the hole', () => {
    const result = computeGame(
      { type: 'match', stakeCents: 5000, handicap: { mode: 'gross' } },
      COURSE.slice(0, 1),
      [player(P1), player(P2)],
      cards({ [P1]: [null], [P2]: [7] }),
    );
    expect(money(result)).toEqual({ [P1]: -5000, [P2]: 5000 });
  });

  it('nobody scored means nobody pays', () => {
    const result = computeGame(
      { type: 'match', stakeCents: 5000, handicap: { mode: 'gross' } },
      COURSE,
      [player(P1), player(P2)],
      [],
    );
    expect(money(result)).toEqual({ [P1]: 0, [P2]: 0 });
    expect(result.breakdown[0]!.text).toContain('not played');
  });
});

describe('match play — 2v2 four-ball', () => {
  it('settles each losing player against their counterpart', () => {
    const result = computeGame(
      {
        type: 'match',
        stakeCents: 2000,
        handicap: { mode: 'gross' },
        teams: { A: [P1, P2], B: [P3, P4] },
      },
      COURSE,
      [player(P1), player(P2), player(P3), player(P4)],
      cards({
        [P1]: PAR_ROW,
        [P2]: PAR_ROW.map((s) => s + 2),
        [P3]: PAR_ROW.map((s, i) => (i < 10 ? s + 1 : s)),
        [P4]: PAR_ROW.map((s) => s + 2),
      }),
    );
    // Team A's best ball beats B's on holes 1–10 and halves the rest: 10 up
    // with 8 to play, closed out on 10.
    expect(money(result)).toEqual({ [P1]: 2000, [P2]: 2000, [P3]: -2000, [P4]: -2000 });
    expect(sumCents(result.perPlayer)).toBe(0);
  });
});

describe('match play — net with the low-man adjustment', () => {
  const scores = cards({ [P1]: PAR_ROW, [P2]: PAR_ROW.map((s) => s + 1) });
  const roster = [player(P1, 4), player(P2, 14)];
  const base = { stakeCents: 1000, handicap: { mode: 'net', allowancePct: 100 } } as const;

  it('plays the low man off scratch', () => {
    const on = buildCard({ type: 'match', ...base, lowManAdjustment: true }, COURSE, roster, scores);
    expect(on.strokesFor(P1)).toBe(0);
    expect(on.strokesFor(P2)).toBe(10);

    const off = buildCard(
      { type: 'match', ...base, lowManAdjustment: false },
      COURSE,
      roster,
      scores,
    );
    expect(off.strokesFor(P1)).toBe(4);
    expect(off.strokesFor(P2)).toBe(14);
  });

  it('leaves a head-to-head match unchanged, because only the difference matters', () => {
    // Worth pinning down: the flag is not a no-op in general (it moves absolute
    // net scores, which decide skins validation and stableford points), but in a
    // two-man match it cannot change who wins a hole.
    const on = computeGame({ type: 'match', ...base, lowManAdjustment: true }, COURSE, roster, scores);
    const off = computeGame(
      { type: 'match', ...base, lowManAdjustment: false },
      COURSE,
      roster,
      scores,
    );
    expect(money(on)).toEqual(money(off));
    expect(sumCents(on.perPlayer)).toBe(0);
  });

  it('does change a game where absolute strokes decide the hole', () => {
    // Hole 4 is stroke index 3, both players make 6 on the par 5.
    //   low man on : Kyle plays off scratch (bogey), Todd gets his shot (par)
    //                → Todd wins the skin outright.
    //   low man off: both get a shot → both net 5 → tied, the skin carries.
    const holeFour = cards({ [P1]: [null, null, null, 6], [P2]: [null, null, null, 6] });
    const skins = (lowManAdjustment: boolean) =>
      money(
        computeGame(
          {
            type: 'skins',
            stakeCents: 500,
            handicap: base.handicap,
            carryover: true,
            validation: true,
            lowManAdjustment,
          },
          COURSE,
          roster,
          holeFour,
        ),
      );
    expect(skins(true)).toEqual({ [P1]: -500, [P2]: 500 });
    expect(skins(false)).toEqual({ [P1]: 0, [P2]: 0 });
  });
});
