/**
 * Playing handicap and stroke allocation — Technical Spec §5.1.
 *
 * Order of operations, which is not negotiable because it changes who pays whom:
 *   course handicap → allowance % → round → low-man subtraction.
 */
import { roundHalfUp } from './money';
import type { Hole, Player } from './types';

export interface CourseHandicapInput {
  /** Handicap index, may be negative for a plus player. */
  index: number;
  slope: number;
  /** Course rating for the tee played. */
  rating: number;
  /** Par for the tee played. */
  par: number;
  /** 9 or 18. A 9-hole round halves the 18-hole course handicap. */
  holeCount?: 9 | 18;
  /**
   * Mixed tees: the (rating − par) differential of this player's tee relative to
   * the round's base tee, added so players off different tees compete fairly.
   */
  teeDifferential?: number;
}

/**
 * WHS course handicap: round(index × slope / 113 + (rating − par)).
 * Not the pre-2020 index × slope / 113 — the difference is 2–4 strokes.
 */
export function courseHandicap(input: CourseHandicapInput): number {
  const raw = (input.index * input.slope) / 113 + (input.rating - input.par);
  const withTees = raw + (input.teeDifferential ?? 0);
  const eighteen = roundHalfUp(withTees);
  if (input.holeCount === 9) {
    return roundHalfUp(eighteen / 2);
  }
  return eighteen;
}

/** Playing handicap: round(courseHandicap × allowancePct). Rounds once, at the end. */
export function playingHandicap(courseHcp: number, allowancePct = 100): number {
  return roundHalfUp((courseHcp * allowancePct) / 100);
}

/**
 * Low-man adjustment: every player's handicap drops by the lowest player's, so
 * the low man plays off scratch.
 */
export function applyLowMan(players: Player[], enabled: boolean): Map<string, number> {
  const out = new Map<string, number>();
  if (players.length === 0) return out;
  const lowest = enabled ? Math.min(...players.map((p) => p.playingHandicap)) : 0;
  for (const player of players) {
    out.set(player.roundPlayerId, player.playingHandicap - lowest);
  }
  return out;
}

/**
 * Strokes received on each hole for a given playing handicap.
 *
 * Allocation is by stroke index across the holes actually played: a handicap of
 * 9 gets one stroke on the 9 lowest-index holes; 20 gets one on every hole plus
 * a second on indexes 1 and 2. A plus player *gives* strokes back, starting at
 * the highest index.
 */
export function allocateStrokes(handicap: number, holes: Hole[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const hole of holes) out.set(hole.number, 0);
  if (holes.length === 0 || handicap === 0) return out;

  // Ties on stroke index are broken by hole number so allocation is deterministic.
  const byIndex = [...holes].sort(
    (a, b) => a.strokeIndex - b.strokeIndex || a.number - b.number,
  );
  const n = byIndex.length;
  const magnitude = Math.abs(handicap);
  const base = Math.floor(magnitude / n);
  const remainder = magnitude - base * n;
  const sign = handicap < 0 ? -1 : 1;

  byIndex.forEach((hole, i) => {
    // Positive handicaps take the extra stroke on the hardest holes; plus
    // players give strokes back on the easiest.
    const extra = sign > 0 ? (i < remainder ? 1 : 0) : i >= n - remainder ? 1 : 0;
    const value = sign * (base + extra);
    out.set(hole.number, value === 0 ? 0 : value); // never hand back −0
  });
  return out;
}
