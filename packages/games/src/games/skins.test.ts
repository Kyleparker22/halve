import { describe, expect, it } from 'vitest';
import { computeGame } from '../compute';
import { sumCents } from '../money';
import { COURSE, P1, P2, P3, P4, cards, player } from '../fixtures/course';
import type { SkinsConfig } from '../types';

const money = (result: { perPlayer: { roundPlayerId: string; amountCents: number }[] }) =>
  Object.fromEntries(result.perPlayer.map((p) => [p.roundPlayerId, p.amountCents]));

const players = [player(P1), player(P2), player(P3), player(P4)];

describe('skins — $5, gross, carryover on', () => {
  /**
   * Hand-verified:
   *   1  all 4s              → tie, carries
   *   2  Kyle 5, rest 4      → tie among three, carries
   *   3  Kyle 3              → Kyle takes 3 skins @ $5 = $15 from each of 3 = +$45
   *   4  6 by Dave, rest 5   → tie among three, carries
   *   5  Todd 3              → Todd takes 2 skins = $10 from each of 3 = +$30
   *   6  all 4s              → carries
   *   7  Dave 3              → Dave takes 2 skins = $10 from each of 3 = +$30
   *   8–18 every hole tied   → 11 skins carrying at the end, nobody wins them
   *   Net: Kyle +$25, Todd +$5, Marcus −$35, Dave +$5
   */
  const scores = cards({
    [P1]: [4, 5, 3, 5, 4, 4, 4, 3, 5, 4, 3, 4, 4, 5, 4, 4, 4, 4],
    [P2]: [4, 4, 4, 5, 3, 4, 4, 3, 5, 4, 3, 4, 4, 5, 4, 4, 4, 4],
    [P3]: [4, 4, 4, 5, 4, 4, 4, 3, 5, 4, 3, 4, 4, 5, 4, 4, 4, 4],
    [P4]: [4, 4, 4, 6, 4, 4, 3, 3, 5, 4, 3, 4, 4, 5, 4, 4, 4, 4],
  });

  const config: SkinsConfig = {
    type: 'skins',
    stakeCents: 500,
    handicap: { mode: 'gross' },
    carryover: true,
    validation: false,
  };

  it('pays carried skins to the hole winner', () => {
    const result = computeGame(config, COURSE, players, scores);
    expect(money(result)).toEqual({ [P1]: 2500, [P2]: 500, [P3]: -3500, [P4]: 500 });
    expect(sumCents(result.perPlayer)).toBe(0);
  });

  it('leaves skins carrying through 18 unwon', () => {
    const result = computeGame(config, COURSE, players, scores);
    const tail = result.breakdown[result.breakdown.length - 1]!;
    expect(tail.text).toContain('11 skins still carrying');
    expect(tail.holes).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
  });

  it('writes a breakdown a human can argue with', () => {
    const result = computeGame(config, COURSE, players, scores);
    const line = result.breakdown.find((l) => l.text.startsWith('Hole 3'))!;
    expect(line.text).toBe(
      'Hole 3 — Kyle made par. 3 skins (carried from 1, 2) @ $5 = $15 from each of 3.',
    );
    expect(line.holes).toEqual([1, 2, 3]);
  });
});

describe('skins — carryover off', () => {
  it('throws away a tied hole instead of carrying it', () => {
    const scores = cards({
      [P1]: [4, 3, 4, 4],
      [P2]: [4, 4, 4, 4],
      [P3]: [4, 4, 4, 4],
      [P4]: [4, 4, 4, 4],
    });
    const result = computeGame(
      {
        type: 'skins',
        stakeCents: 500,
        handicap: { mode: 'gross' },
        carryover: false,
        validation: false,
      },
      COURSE,
      players,
      scores,
    );
    // Only hole 2 is won, and it is worth exactly one skin.
    expect(money(result)).toEqual({ [P1]: 1500, [P2]: -500, [P3]: -500, [P4]: -500 });
    expect(result.isComplete).toBe(false);
  });
});

describe('skins — validation', () => {
  it('carries a hole won with a bogey', () => {
    const scores = cards({
      [P1]: [5, 3],
      [P2]: [6, 5],
      [P3]: [6, 5],
      [P4]: [6, 5],
    });
    const result = computeGame(
      {
        type: 'skins',
        stakeCents: 500,
        handicap: { mode: 'gross' },
        carryover: true,
        validation: true,
      },
      COURSE,
      players,
      scores,
    );
    // Hole 1 does not validate, so hole 2's birdie is worth two skins.
    expect(money(result)).toEqual({ [P1]: 3000, [P2]: -1000, [P3]: -1000, [P4]: -1000 });
    expect(result.breakdown[0]!.text).toContain('did not validate');
  });
});

describe('skins — net', () => {
  it('applies handicap strokes by stroke index', () => {
    const scores = cards({ [P1]: [4], [P2]: [5] });
    const gross = computeGame(
      {
        type: 'skins',
        stakeCents: 500,
        handicap: { mode: 'gross' },
        carryover: true,
        validation: false,
      },
      COURSE,
      [player(P1, 0), player(P2, 18)],
      scores,
    );
    expect(money(gross)).toEqual({ [P1]: 500, [P2]: -500 });

    // Hole 1 is stroke index 7, so an 18 handicap gets a shot there and the
    // hole is halved on net.
    const net = computeGame(
      {
        type: 'skins',
        stakeCents: 500,
        handicap: { mode: 'net', allowancePct: 100 },
        carryover: true,
        validation: false,
      },
      COURSE,
      [player(P1, 0), player(P2, 18)],
      scores,
    );
    expect(money(net)).toEqual({ [P1]: 0, [P2]: 0 });
    expect(net.breakdown[0]!.text).toContain('Skin carries');
  });
});

describe('skins — a player picks up', () => {
  it('never lets a null score win a hole and never produces NaN', () => {
    const scores = cards({
      [P1]: [null, 4],
      [P2]: [5, 4],
      [P3]: [4, 4],
      [P4]: [6, 4],
    });
    const result = computeGame(
      {
        type: 'skins',
        stakeCents: 500,
        handicap: { mode: 'gross' },
        carryover: true,
        validation: false,
      },
      COURSE,
      players,
      scores,
    );
    expect(money(result)).toEqual({ [P1]: -500, [P2]: -500, [P3]: 1500, [P4]: -500 });
    for (const entry of result.perPlayer) expect(Number.isFinite(entry.amountCents)).toBe(true);
  });
});
