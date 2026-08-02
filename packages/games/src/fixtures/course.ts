/**
 * The test course. Par 72, stroke indexes odd on the front and even on the back,
 * which is the real-world convention the 9-hole handicap rule depends on.
 */
import type { Hole, Player, Score } from '../types';

const FRONT_PARS = [4, 4, 3, 5, 4, 4, 4, 3, 5];
const BACK_PARS = [4, 3, 4, 4, 5, 4, 4, 4, 4];
const FRONT_SI = [7, 5, 17, 3, 9, 11, 13, 15, 1];
const BACK_SI = [8, 18, 4, 6, 2, 10, 16, 12, 14];

export const COURSE: Hole[] = [
  ...FRONT_PARS.map((par, i) => ({ number: i + 1, par, strokeIndex: FRONT_SI[i]! })),
  ...BACK_PARS.map((par, i) => ({ number: i + 10, par, strokeIndex: BACK_SI[i]! })),
];

export const FRONT_NINE: Hole[] = COURSE.slice(0, 9);

export const PAR_TOTAL = COURSE.reduce((sum, h) => sum + h.par, 0); // 72

/** Stable ids that sort in play order, so remainder-cent rules are predictable. */
export const P1 = 'rp-1-kyle';
export const P2 = 'rp-2-todd';
export const P3 = 'rp-3-marcus';
export const P4 = 'rp-4-dave';

export const NAMES: Record<string, string> = {
  [P1]: 'Kyle',
  [P2]: 'Todd',
  [P3]: 'Marcus',
  [P4]: 'Dave',
};

export function player(id: string, playingHandicap = 0, teamId?: string): Player {
  return { roundPlayerId: id, playingHandicap, name: NAMES[id] ?? id, ...(teamId ? { teamId } : {}) };
}

/**
 * Turn a scorecard row into Score rows. `null` means no score recorded; a
 * shorter array means the round is still in progress.
 */
export function card(roundPlayerId: string, strokes: Array<number | null>): Score[] {
  return strokes.map((value, i) => ({ roundPlayerId, hole: i + 1, strokes: value }));
}

export function cards(rows: Record<string, Array<number | null>>): Score[] {
  return Object.entries(rows).flatMap(([id, strokes]) => card(id, strokes));
}

/** Sum of a scorecard row, ignoring holes with no score. */
export function total(strokes: Array<number | null>): number {
  return strokes.reduce<number>((sum, s) => sum + (s ?? 0), 0);
}
