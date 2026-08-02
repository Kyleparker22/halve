/**
 * Match play — 1v1 or 2v2, gross or net, with dormie and closeout.
 * Also the engine Nassau runs its segments and presses through.
 */
import type { Card } from '../card';
import { compareSides, resolveTeams } from '../card';
import { formatCents, Pot } from '../money';
import type { BreakdownLine, GameResult, Hole, MatchConfig } from '../types';

export interface MatchState {
  /** Positive = side A is up, negative = side B is up. */
  standing: number;
  /** 'a' | 'b' when decided or provisionally led; 'halve' when all square. */
  leader: 'a' | 'b' | 'halve';
  /** Closed out before the last hole: e.g. 3&2. */
  closedOutOnHole: number | null;
  /** Holes still to play after the last scored hole. */
  holesRemaining: number;
  /** True once the match cannot change hands. */
  decided: boolean;
  /** Holes that were actually settled. */
  holesPlayed: number[];
  /** "3&2", "1 up", "all square", "2 up thru 14". */
  scoreline: string;
}

export function runMatch(
  card: Card,
  sideA: string[],
  sideB: string[],
  holes: Hole[],
  useNet: boolean,
): MatchState {
  let standing = 0;
  let closedOutOnHole: number | null = null;
  const holesPlayed: number[] = [];
  let remainingAtClose = 0;

  holes.forEach((hole, i) => {
    if (closedOutOnHole !== null) return;
    const outcome = compareSides(card, sideA, sideB, hole.number, useNet);
    if (outcome === 'unplayed') return;
    holesPlayed.push(hole.number);
    if (outcome === 'a') standing += 1;
    else if (outcome === 'b') standing -= 1;

    // A win on the last hole is "1 up", not "1&0" — a closeout needs holes left.
    const remaining = holes.length - (i + 1);
    if (remaining > 0 && Math.abs(standing) > remaining) {
      closedOutOnHole = hole.number;
      remainingAtClose = remaining;
    }
  });

  const lastPlayedIndex = holesPlayed.length
    ? holes.findIndex((h) => h.number === holesPlayed[holesPlayed.length - 1])
    : -1;
  const holesRemaining =
    closedOutOnHole !== null ? remainingAtClose : holes.length - (lastPlayedIndex + 1);
  const decided = closedOutOnHole !== null || (holesRemaining === 0 && holesPlayed.length > 0);

  const leader: MatchState['leader'] = standing > 0 ? 'a' : standing < 0 ? 'b' : 'halve';

  let scoreline: string;
  if (holesPlayed.length === 0) {
    scoreline = 'not started';
  } else if (closedOutOnHole !== null) {
    scoreline = `${Math.abs(standing)}&${holesRemaining}`;
  } else if (standing === 0) {
    scoreline = decided ? 'all square' : `all square thru ${holesPlayed.length}`;
  } else {
    const body = `${Math.abs(standing)} up`;
    scoreline = decided ? body : `${body} thru ${holesPlayed.length}`;
  }

  return {
    standing,
    leader,
    closedOutOnHole,
    holesRemaining,
    decided,
    holesPlayed,
    scoreline,
  };
}

/** Settle a decided (or provisional) match into the pot. Returns the line text. */
export function settleMatch(
  pot: Pot,
  card: Card,
  state: MatchState,
  sideA: string[],
  sideB: string[],
  stakeCents: number,
  label: string,
): BreakdownLine {
  const holes = state.holesPlayed.length ? state.holesPlayed : [0];
  const holeSpan = state.holesPlayed.length
    ? [state.holesPlayed[0]!, state.holesPlayed[state.holesPlayed.length - 1]!]
    : [];

  if (state.leader === 'halve' || state.holesPlayed.length === 0) {
    return {
      holes: holeSpan.length ? holeSpan : holes,
      players: [...sideA, ...sideB],
      segment: label,
      text:
        state.holesPlayed.length === 0
          ? `${label} — not played.`
          : `${label} — ${state.scoreline}. No money.`,
    };
  }

  const winners = state.leader === 'a' ? sideA : sideB;
  const losers = state.leader === 'a' ? sideB : sideA;
  pot.transfer(losers, winners, stakeCents);

  const winnerNames = winners.map((id) => card.name(id)).join(' & ');
  const provisional = state.decided ? '' : ' (in progress)';
  return {
    holes: holeSpan,
    players: [...sideA, ...sideB],
    segment: label,
    amountCents: stakeCents * losers.length,
    text: `${label} — ${winnerNames} won ${state.scoreline}${provisional}. ${formatCents(
      stakeCents,
    )} a side.`,
  };
}

export function computeMatch(config: MatchConfig, card: Card): GameResult {
  const useNet = config.handicap.mode === 'net';
  const teams = resolveTeams(card.players, config.teams);
  const teamIds = [...teams.keys()];
  const pot = new Pot(card.playerIds);
  const breakdown: BreakdownLine[] = [];

  // Two sides is the normal case. More than two settles as a round robin so the
  // result is still total and still sums to zero.
  for (let i = 0; i < teamIds.length; i += 1) {
    for (let j = i + 1; j < teamIds.length; j += 1) {
      const sideA = teams.get(teamIds[i]!)!;
      const sideB = teams.get(teamIds[j]!)!;
      const state = runMatch(card, sideA, sideB, card.holes, useNet);
      const label =
        teamIds.length === 2
          ? 'Match'
          : `${card.name(sideA[0]!)} v ${card.name(sideB[0]!)}`;
      breakdown.push(settleMatch(pot, card, state, sideA, sideB, config.stakeCents, label));

      if (state.closedOutOnHole !== null) {
        breakdown.push({
          holes: [state.closedOutOnHole],
          players: [...sideA, ...sideB],
          segment: label,
          text: `Closed out on ${state.closedOutOnHole}.`,
        });
      } else if (!state.decided && Math.abs(state.standing) === state.holesRemaining && state.standing !== 0) {
        breakdown.push({
          holes: state.holesPlayed.length ? [state.holesPlayed[state.holesPlayed.length - 1]!] : [1],
          players: [...sideA, ...sideB],
          segment: label,
          text: 'Dormie.',
        });
      }
    }
  }

  return { perPlayer: pot.toPerPlayer(), breakdown, isComplete: card.isComplete };
}
