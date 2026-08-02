/**
 * The invariants that hold for every game, every card. If one of these fails,
 * the engine is wrong and no user should ever see the number it produced.
 */
import { describe, expect, it } from 'vitest';
import { computeGame, partitionBreakdown } from './compute';
import { sumCents } from './money';
import { COURSE, FRONT_NINE, NAMES, P1, P2, P3, P4, cards, player } from './fixtures/course';
import { MODIFIED_STABLEFORD, type GameConfig } from './types';

const PAR_ROW = [4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 3, 4, 4, 5, 4, 4, 4, 4];
const ROSTER = [player(P1, 4), player(P2, 14), player(P3, 22), player(P4, -2)];
const TEAMS = { A: [P1, P2], B: [P3, P4] };

const CONFIGS: GameConfig[] = [
  { type: 'nassau', stakeCents: 2000, handicap: { mode: 'gross' }, presses: { mode: 'none' } },
  {
    type: 'nassau',
    stakeCents: 2000,
    handicap: { mode: 'net', allowancePct: 90 },
    presses: { mode: 'auto', downBy: 2 },
    teams: TEAMS,
  },
  {
    type: 'skins',
    stakeCents: 500,
    handicap: { mode: 'net', allowancePct: 100 },
    carryover: true,
    validation: true,
  },
  { type: 'skins', stakeCents: 500, handicap: { mode: 'gross' }, carryover: false, validation: false },
  { type: 'match', stakeCents: 5000, handicap: { mode: 'gross' }, teams: TEAMS },
  { type: 'match', stakeCents: 5000, handicap: { mode: 'net', allowancePct: 100 } },
  { type: 'stroke', stakeCents: 500, handicap: { mode: 'gross' } },
  { type: 'stroke', stakeCents: 333, handicap: { mode: 'net', allowancePct: 85 } },
  { type: 'bestball', stakeCents: 2500, handicap: { mode: 'net', allowancePct: 90 }, teams: TEAMS },
  {
    type: 'wolf',
    stakeCents: 200,
    handicap: { mode: 'gross' },
    loneMultiplier: 2,
    blindMultiplier: 3,
    decisions: [
      { hole: 1, partnerRoundPlayerId: P2 },
      { hole: 2, lone: 'lone' },
      { hole: 3, lone: 'blind' },
      { hole: 4, partnerRoundPlayerId: P1 },
      { hole: 5, partnerRoundPlayerId: P3 },
      { hole: 6, partnerRoundPlayerId: P4 },
      { hole: 7, lone: 'lone' },
      { hole: 8, partnerRoundPlayerId: P2 },
      { hole: 9, partnerRoundPlayerId: P3 },
      { hole: 10, lone: 'lone' },
      { hole: 11, partnerRoundPlayerId: P1 },
      { hole: 12, partnerRoundPlayerId: P2 },
      { hole: 13, lone: 'blind' },
      { hole: 14, partnerRoundPlayerId: P4 },
      { hole: 15, partnerRoundPlayerId: P1 },
      { hole: 16, lone: 'lone' },
      { hole: 17, partnerRoundPlayerId: P3 },
      { hole: 18, partnerRoundPlayerId: P1 },
    ],
  },
  { type: 'stableford', stakeCents: 100, handicap: { mode: 'gross' } },
  {
    type: 'stableford',
    stakeCents: 100,
    handicap: { mode: 'net', allowancePct: 95 },
    table: MODIFIED_STABLEFORD,
  },
];

const CARDS: Array<{ label: string; scores: ReturnType<typeof cards>; holes: typeof COURSE }> = [
  {
    label: 'a complete 18',
    holes: COURSE,
    scores: cards({
      [P1]: PAR_ROW,
      [P2]: PAR_ROW.map((s, i) => s + (i % 3 === 0 ? 1 : 0)),
      [P3]: PAR_ROW.map((s, i) => s + (i % 2 === 0 ? 2 : 1)),
      [P4]: PAR_ROW.map((s, i) => s - (i % 5 === 0 ? 1 : 0)),
    }),
  },
  {
    label: 'four holes in',
    holes: COURSE,
    scores: cards({
      [P1]: [4, 5, 3, 5],
      [P2]: [5, 4, 4, 6],
      [P3]: [6, 5, 4, 7],
      [P4]: [4, 4, 3, 5],
    }),
  },
  {
    label: 'a card with pick-ups',
    holes: COURSE,
    scores: cards({
      [P1]: PAR_ROW.map((s, i) => (i === 7 ? null : s)),
      [P2]: PAR_ROW.map((s, i) => (i === 7 || i === 11 ? null : s + 1)),
      [P3]: PAR_ROW.map((s) => s + 2),
      [P4]: PAR_ROW.map((s, i) => (i > 15 ? null : s)),
    }),
  },
  {
    label: 'a nine-hole round',
    holes: FRONT_NINE,
    scores: cards({
      [P1]: PAR_ROW.slice(0, 9),
      [P2]: PAR_ROW.slice(0, 9).map((s) => s + 1),
      [P3]: PAR_ROW.slice(0, 9).map((s) => s + 2),
      [P4]: PAR_ROW.slice(0, 9).map((s) => s - 1),
    }),
  },
  { label: 'an empty card', holes: COURSE, scores: [] },
];

describe.each(CONFIGS)('$type', (config) => {
  it.each(CARDS)('conserves money on $label', ({ holes, scores }) => {
    const result = computeGame(config, holes, ROSTER, scores);
    expect(sumCents(result.perPlayer)).toBe(0);
  });

  it.each(CARDS)('never produces NaN on $label', ({ holes, scores }) => {
    const result = computeGame(config, holes, ROSTER, scores);
    for (const entry of result.perPlayer) {
      expect(Number.isInteger(entry.amountCents)).toBe(true);
    }
    for (const line of result.breakdown) {
      expect(line.text).not.toContain('NaN');
      expect(line.text).not.toContain('undefined');
      expect(line.holes.length).toBeGreaterThan(0);
    }
  });

  it.each(CARDS)('is deterministic on $label', ({ holes, scores }) => {
    const first = computeGame(config, holes, ROSTER, scores);
    const second = computeGame(config, holes, ROSTER, scores);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('returns a row for every player, even one who never scored', () => {
    const result = computeGame(config, COURSE, ROSTER, cards({ [P1]: PAR_ROW }));
    expect(result.perPlayer.map((p) => p.roundPlayerId).sort()).toEqual(
      ROSTER.map((p) => p.roundPlayerId).sort(),
    );
    expect(sumCents(result.perPlayer)).toBe(0);
  });
});

describe('completeness', () => {
  it('is false until every player has resolved every hole', () => {
    const partial = computeGame(
      { type: 'stroke', stakeCents: 500, handicap: { mode: 'gross' } },
      COURSE,
      ROSTER,
      cards({ [P1]: [4], [P2]: [4], [P3]: [4], [P4]: [4] }),
    );
    expect(partial.isComplete).toBe(false);
  });

  it('is true when the card is full', () => {
    const full = computeGame(
      { type: 'stroke', stakeCents: 500, handicap: { mode: 'gross' } },
      COURSE,
      ROSTER,
      cards({
        [P1]: PAR_ROW,
        [P2]: PAR_ROW,
        [P3]: PAR_ROW,
        [P4]: PAR_ROW,
      }),
    );
    expect(full.isComplete).toBe(true);
  });
});

describe('partitionBreakdown (§5.3)', () => {
  it('gives each player only their own lines plus a summary', () => {
    const result = computeGame(
      {
        type: 'skins',
        stakeCents: 500,
        handicap: { mode: 'gross' },
        carryover: true,
        validation: false,
      },
      COURSE,
      ROSTER,
      cards({
        [P1]: PAR_ROW.map((s, i) => (i === 0 ? s - 1 : s)),
        [P2]: PAR_ROW,
        [P3]: PAR_ROW,
        [P4]: PAR_ROW,
      }),
    );
    const partitioned = partitionBreakdown(result, NAMES);

    expect(Object.keys(partitioned).sort()).toEqual(ROSTER.map((p) => p.roundPlayerId).sort());
    expect(partitioned[P1]!.summary).toBe('Kyle won $15.');
    expect(partitioned[P2]!.summary).toBe('Todd lost $5.');
    for (const [id, entry] of Object.entries(partitioned)) {
      for (const line of entry.lines) expect(line.players).toContain(id);
    }
    // The full narrative is the union of the rows, not N copies of everything.
    const totalLines = Object.values(partitioned).reduce((n, e) => n + e.lines.length, 0);
    expect(totalLines).toBeLessThan(result.breakdown.length * ROSTER.length);
  });

  it('falls back to a generic name and reports breaking even', () => {
    const result = computeGame(
      { type: 'match', stakeCents: 1000, handicap: { mode: 'gross' } },
      COURSE,
      [player(P1), player(P2)],
      cards({ [P1]: PAR_ROW, [P2]: PAR_ROW }),
    );
    expect(partitionBreakdown(result)[P1]!.summary).toBe('You broke even.');
  });

  it('formats cents in a summary', () => {
    const result = computeGame(
      { type: 'stroke', stakeCents: 333, handicap: { mode: 'gross' } },
      COURSE,
      [player(P1), player(P2), player(P3)],
      cards({ [P1]: PAR_ROW, [P2]: PAR_ROW, [P3]: PAR_ROW.map((s) => s + 1) }),
    );
    expect(partitionBreakdown(result, NAMES)[P1]!.summary).toBe('Kyle won $1.67.');
  });
});
