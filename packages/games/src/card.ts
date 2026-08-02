/**
 * The scoring surface every game reads. Applies the handicap mode and the
 * low-man adjustment once, so no game module repeats that logic.
 */
import { allocateStrokes, applyLowMan } from './handicap';
import { DEFAULT_LOW_MAN, type GameConfig, type Hole, type Player, type Score } from './types';

export interface Card {
  readonly holes: Hole[];
  readonly players: Player[];
  readonly playerIds: string[];
  /** Playing handicap actually used, after allowance and low-man. */
  strokesFor(roundPlayerId: string): number;
  strokesOn(roundPlayerId: string, hole: number): number;
  gross(roundPlayerId: string, hole: number): number | null;
  net(roundPlayerId: string, hole: number): number | null;
  par(hole: number): number;
  /**
   * A score row exists for this player and hole, even if the strokes are null.
   * A null row means "picked up" — the group resolved the hole. No row at all
   * means the hole has not been played yet. Collapsing the two would either
   * hand a free hole to someone who picked up or invent a lead mid-round.
   */
  hasEntry(roundPlayerId: string, hole: number): boolean;
  /** At least two players have resolved this hole — enough to settle it. */
  isContested(hole: number): boolean;
  /** Every participant has an actual score on this hole. */
  isFullyScored(hole: number): boolean;
  /** Every participant has resolved every hole of the round. */
  readonly isComplete: boolean;
  /** Holes with enough scores to settle, in play order. */
  readonly playedHoles: Hole[];
  name(roundPlayerId: string): string;
  /** Lowest net on a hole among the given players; null when none scored. */
  bestNet(roundPlayerIds: string[], hole: number): number | null;
  /** Lowest gross on a hole among the given players; null when none scored. */
  bestGross(roundPlayerIds: string[], hole: number): number | null;
}

export function buildCard(config: GameConfig, holes: Hole[], players: Player[], scores: Score[]): Card {
  const sortedHoles = [...holes].sort((a, b) => a.number - b.number);
  const holeByNumber = new Map(sortedHoles.map((h) => [h.number, h]));
  const playerIds = players.map((p) => p.roundPlayerId);
  const participants = new Set(playerIds);

  const useNet = config.handicap.mode === 'net';
  const allowance = config.handicap.mode === 'net' ? config.handicap.allowancePct : 0;
  const lowManEnabled = config.lowManAdjustment ?? DEFAULT_LOW_MAN[config.type];

  // Allowance applies before the low-man subtraction, and rounds once.
  const allowanced: Player[] = players.map((p) => ({
    ...p,
    playingHandicap: useNet ? Math.floor((p.playingHandicap * allowance) / 100 + 0.5) : 0,
  }));
  const adjusted = applyLowMan(allowanced, useNet && lowManEnabled);

  const strokeMap = new Map<string, Map<number, number>>();
  for (const player of players) {
    const handicap = useNet ? (adjusted.get(player.roundPlayerId) ?? 0) : 0;
    strokeMap.set(player.roundPlayerId, allocateStrokes(handicap, sortedHoles));
  }

  const grossMap = new Map<string, Map<number, number>>();
  const entryMap = new Map<string, Set<number>>();
  for (const score of scores) {
    if (!participants.has(score.roundPlayerId)) continue;
    if (!holeByNumber.has(score.hole)) continue;

    let entries = entryMap.get(score.roundPlayerId);
    if (!entries) {
      entries = new Set();
      entryMap.set(score.roundPlayerId, entries);
    }
    entries.add(score.hole);

    if (score.strokes === null || score.strokes === undefined) continue;
    let byHole = grossMap.get(score.roundPlayerId);
    if (!byHole) {
      byHole = new Map();
      grossMap.set(score.roundPlayerId, byHole);
    }
    byHole.set(score.hole, score.strokes);
  }

  const gross = (id: string, hole: number): number | null => grossMap.get(id)?.get(hole) ?? null;
  const strokesOn = (id: string, hole: number): number => strokeMap.get(id)?.get(hole) ?? 0;
  const net = (id: string, hole: number): number | null => {
    const raw = gross(id, hole);
    return raw === null ? null : raw - strokesOn(id, hole);
  };

  const hasEntry = (id: string, hole: number): boolean => entryMap.get(id)?.has(hole) ?? false;

  const scoredCount = (hole: number): number =>
    playerIds.reduce((count, id) => count + (gross(id, hole) === null ? 0 : 1), 0);
  const entryCount = (hole: number): number =>
    playerIds.reduce((count, id) => count + (hasEntry(id, hole) ? 1 : 0), 0);

  const isFullyScored = (hole: number): boolean => scoredCount(hole) === playerIds.length;
  const isContested = (hole: number): boolean => entryCount(hole) >= Math.min(2, playerIds.length);
  const playedHoles = sortedHoles.filter((h) => isContested(h.number));
  const isComplete =
    playerIds.length > 0 && sortedHoles.every((h) => entryCount(h.number) === playerIds.length);

  const names = new Map(players.map((p) => [p.roundPlayerId, p.name ?? 'Player']));

  const pick = (ids: string[], hole: number, fn: (id: string, hole: number) => number | null) => {
    let best: number | null = null;
    for (const id of ids) {
      const value = fn(id, hole);
      if (value === null) continue;
      if (best === null || value < best) best = value;
    }
    return best;
  };

  return {
    holes: sortedHoles,
    players,
    playerIds,
    strokesFor: (id) => adjusted.get(id) ?? 0,
    strokesOn,
    gross,
    net,
    par: (hole) => holeByNumber.get(hole)?.par ?? 0,
    hasEntry,
    isContested,
    isFullyScored,
    isComplete,
    playedHoles,
    name: (id) => names.get(id) ?? 'Player',
    bestNet: (ids, hole) => pick(ids, hole, net),
    bestGross: (ids, hole) => pick(ids, hole, gross),
  };
}

/** Team membership from config.teams, falling back to Player.teamId. */
export function resolveTeams(
  players: Player[],
  teams?: Record<string, string[]>,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (teams && Object.keys(teams).length > 0) {
    for (const teamId of Object.keys(teams).sort()) {
      const members = (teams[teamId] ?? []).filter((id) =>
        players.some((p) => p.roundPlayerId === id),
      );
      if (members.length > 0) out.set(teamId, members);
    }
    return out;
  }
  for (const player of players) {
    const teamId = player.teamId ?? player.roundPlayerId;
    const existing = out.get(teamId);
    if (existing) existing.push(player.roundPlayerId);
    else out.set(teamId, [player.roundPlayerId]);
  }
  return out;
}

/** A hole's outcome between two sides, by best ball. */
export type HoleOutcome = 'a' | 'b' | 'halve' | 'unplayed';

export function compareSides(
  card: Card,
  sideA: string[],
  sideB: string[],
  hole: number,
  useNet: boolean,
): HoleOutcome {
  const pick = useNet ? card.bestNet : card.bestGross;
  const a = pick(sideA, hole);
  const b = pick(sideB, hole);
  if (a === null && b === null) return 'unplayed';
  // A side with nobody holing out loses the hole; it has no ball in play.
  if (a === null) return 'b';
  if (b === null) return 'a';
  if (a < b) return 'a';
  if (b < a) return 'b';
  return 'halve';
}
