import { describe, expect, it } from 'vitest';
import { computeGame } from '../compute';
import { sumCents } from '../money';
import { COURSE, FRONT_NINE, P1, P2, P3, P4, cards, player } from '../fixtures/course';
import type { NassauConfig } from '../types';

const money = (result: { perPlayer: { roundPlayerId: string; amountCents: number }[] }) =>
  Object.fromEntries(result.perPlayer.map((p) => [p.roundPlayerId, p.amountCents]));

describe('nassau — $20 a side, gross, no presses', () => {
  /**
   * Hand-verified, hole by hole. Kyle v Todd:
   *   Front: Kyle wins 1, 3, 4, 8; Todd wins 2, 7 → Kyle 2 up with 1 to play,
   *          closed out on 8 (2&1).
   *   Back:  Todd wins 10, 13, 16; Kyle wins 12, 17 → Todd 1 up.
   *   Total: Kyle 1 up after 18.
   *   Money: Kyle wins front + total, loses back → +$20.
   */
  const scores = cards({
    [P1]: [4, 5, 3, 5, 4, 4, 5, 3, 5, 5, 3, 4, 5, 5, 4, 4, 4, 4],
    [P2]: [5, 4, 4, 6, 4, 4, 4, 4, 5, 4, 3, 5, 4, 5, 4, 3, 5, 4],
  });

  const config: NassauConfig = {
    type: 'nassau',
    stakeCents: 2000,
    handicap: { mode: 'gross' },
    presses: { mode: 'none' },
  };

  it('pays the front, the back and the total separately', () => {
    const result = computeGame(config, COURSE, [player(P1), player(P2)], scores);
    expect(money(result)).toEqual({ [P1]: 2000, [P2]: -2000 });
    expect(sumCents(result.perPlayer)).toBe(0);
    expect(result.isComplete).toBe(true);
  });

  it('narrates each segment with its scoreline', () => {
    const result = computeGame(config, COURSE, [player(P1), player(P2)], scores);
    const text = result.breakdown.map((l) => l.text);
    expect(text.some((t) => t.startsWith('Front — Kyle won 2&1'))).toBe(true);
    expect(text.some((t) => t.startsWith('Back — Todd won 1 up'))).toBe(true);
    expect(text.some((t) => t.startsWith('Total — Kyle won 1 up'))).toBe(true);
  });

  it('every breakdown line cites the holes that produced it', () => {
    const result = computeGame(config, COURSE, [player(P1), player(P2)], scores);
    for (const line of result.breakdown) {
      expect(line.holes.length).toBeGreaterThan(0);
    }
  });
});

describe('nassau — all square', () => {
  it('moves no money when every hole is halved', () => {
    const row = [4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 3, 4, 4, 5, 4, 4, 4, 4];
    const result = computeGame(
      {
        type: 'nassau',
        stakeCents: 2000,
        handicap: { mode: 'gross' },
        presses: { mode: 'none' },
      },
      COURSE,
      [player(P1), player(P2)],
      cards({ [P1]: row, [P2]: row }),
    );
    expect(money(result)).toEqual({ [P1]: 0, [P2]: 0 });
    expect(result.breakdown.every((l) => l.text.includes('No money'))).toBe(true);
  });
});

describe('nassau — stacked auto presses at 2 down', () => {
  /**
   * Front nine engineered to stack four matches:
   *   Kyle wins 1–4, Todd wins 5–9, back nine all halved.
   *   base   : Kyle 4 up after 4, Todd wins the front 1 up
   *   press 1: opens on 3 (base went 2 down after 2) → Todd 2&1
   *   press 2: opens on 5 (press 1 went 2 down after 4) → Todd 3&2
   *   press 3: opens on 7 (press 2 went 2 down after 6) → Todd 2&1
   *   total  : Todd 1 up
   *   Todd wins five matches at $20 → +$100.
   */
  const scores = cards({
    [P1]: [4, 4, 3, 5, 5, 5, 5, 4, 6, 4, 3, 4, 4, 5, 4, 4, 4, 4],
    [P2]: [5, 5, 4, 6, 4, 4, 4, 3, 5, 4, 3, 4, 4, 5, 4, 4, 4, 4],
  });

  const config: NassauConfig = {
    type: 'nassau',
    stakeCents: 2000,
    handicap: { mode: 'gross' },
    presses: { mode: 'auto', downBy: 2 },
  };

  it('settles the base match, three presses and the total', () => {
    const result = computeGame(config, COURSE, [player(P1), player(P2)], scores);
    expect(money(result)).toEqual({ [P1]: -10000, [P2]: 10000 });
    expect(sumCents(result.perPlayer)).toBe(0);
  });

  it('labels each press with where it came from', () => {
    const result = computeGame(config, COURSE, [player(P1), player(P2)], scores);
    const labels = result.breakdown.map((l) => l.segment);
    expect(labels).toContain('Front press 1 (auto after 2)');
    expect(labels).toContain('Front press 2 (auto after 4)');
    expect(labels).toContain('Front press 3 (auto after 6)');
    // The back was halved throughout, so nobody ever went two down there.
    expect(labels.filter((l) => l?.startsWith('Back press'))).toEqual([]);
  });

  it('does not press the total segment', () => {
    const result = computeGame(config, COURSE, [player(P1), player(P2)], scores);
    expect(result.breakdown.some((l) => l.segment?.startsWith('Total press'))).toBe(false);
  });
});

describe('nassau — manual presses', () => {
  it('only opens the presses the players actually called', () => {
    const scores = cards({
      [P1]: [4, 4, 3, 5, 5, 5, 5, 4, 6, 4, 3, 4, 4, 5, 4, 4, 4, 4],
      [P2]: [5, 5, 4, 6, 4, 4, 4, 3, 5, 4, 3, 4, 4, 5, 4, 4, 4, 4],
    });
    const result = computeGame(
      {
        type: 'nassau',
        stakeCents: 2000,
        handicap: { mode: 'gross' },
        presses: { mode: 'manual', presses: [{ hole: 5 }] },
      },
      COURSE,
      [player(P1), player(P2)],
      scores,
    );
    // base front (Todd 1 up) + press from 5 (Todd 3&2) + back (halved) + total (Todd 1 up)
    expect(money(result)).toEqual({ [P1]: -6000, [P2]: 6000 });
    expect(result.breakdown.filter((l) => l.segment?.includes('press'))).toHaveLength(1);
  });
});

describe('nassau — partial round', () => {
  it('shows the standing after four holes without claiming to be final', () => {
    const result = computeGame(
      {
        type: 'nassau',
        stakeCents: 2000,
        handicap: { mode: 'gross' },
        presses: { mode: 'none' },
      },
      COURSE,
      [player(P1), player(P2)],
      cards({
        [P1]: [4, 4, 3, 5],
        [P2]: [5, 5, 4, 6],
      }),
    );
    // Kyle is 4 up in both the front match and the total match: two segments.
    expect(money(result)).toEqual({ [P1]: 4000, [P2]: -4000 });
    expect(result.isComplete).toBe(false);
    expect(result.breakdown.some((l) => l.text.includes('in progress'))).toBe(true);
  });
});

describe('nassau — nine-hole round', () => {
  it('plays one match, not three, and never invents a back nine', () => {
    const result = computeGame(
      {
        type: 'nassau',
        stakeCents: 1000,
        handicap: { mode: 'gross' },
        presses: { mode: 'auto', downBy: 2 },
      },
      FRONT_NINE,
      [player(P1), player(P2)],
      cards({
        [P1]: [4, 4, 3, 5, 5, 5, 5, 4, 6],
        [P2]: [5, 5, 4, 6, 4, 4, 4, 3, 5],
      }),
    );
    const segments = result.breakdown.map((l) => l.segment);
    expect(segments).toContain('Match');
    expect(segments.some((s) => s === 'Front' || s === 'Back' || s === 'Total')).toBe(false);
    expect(sumCents(result.perPlayer)).toBe(0);
  });
});

describe('nassau — 2v2 teams', () => {
  it('settles each player against their counterpart', () => {
    const result = computeGame(
      {
        type: 'nassau',
        stakeCents: 1000,
        handicap: { mode: 'gross' },
        presses: { mode: 'none' },
        teams: { A: [P1, P2], B: [P3, P4] },
      },
      COURSE,
      [player(P1), player(P2), player(P3), player(P4)],
      cards({
        // Team A has the low ball on every hole.
        [P1]: [4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 3, 4, 4, 5, 4, 4, 4, 4],
        [P2]: [5, 5, 4, 6, 5, 5, 5, 4, 6, 5, 4, 5, 5, 6, 5, 5, 5, 5],
        [P3]: [5, 5, 4, 6, 5, 5, 5, 4, 6, 5, 4, 5, 5, 6, 5, 5, 5, 5],
        [P4]: [5, 5, 4, 6, 5, 5, 5, 4, 6, 5, 4, 5, 5, 6, 5, 5, 5, 5],
      }),
    );
    // A wins front, back and total: $10 a side, each loser pays their man.
    expect(money(result)).toEqual({ [P1]: 3000, [P2]: 3000, [P3]: -3000, [P4]: -3000 });
    expect(sumCents(result.perPlayer)).toBe(0);
  });
});
