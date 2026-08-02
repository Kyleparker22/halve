/**
 * Nassau — front, back and total, each worth the stake. Presses are manual or
 * automatic, they stack, and each press is its own match from the press hole to
 * the end of its segment.
 */
import type { Card } from '../card';
import { compareSides, resolveTeams } from '../card';
import { Pot } from '../money';
import { runMatch, settleMatch } from './match';
import type { BreakdownLine, GameResult, Hole, NassauConfig, NassauSegment } from '../types';

interface Segment {
  key: NassauSegment | 'match';
  label: string;
  holes: Hole[];
}

function segmentsFor(holes: Hole[]): Segment[] {
  if (holes.length <= 9) {
    // A nine-hole round is one match, not three. There is no back nine to press.
    return [{ key: 'match', label: 'Match', holes }];
  }
  const half = Math.floor(holes.length / 2);
  return [
    { key: 'front', label: 'Front', holes: holes.slice(0, half) },
    { key: 'back', label: 'Back', holes: holes.slice(half) },
    { key: 'total', label: 'Total', holes },
  ];
}

interface PressPlan {
  startIndex: number;
  fromLabel: string;
}

/**
 * Where presses begin inside a segment. Auto: a side that goes `downBy` down is
 * pressed on the next hole, once per match, and a press can itself be pressed.
 */
function planPresses(
  card: Card,
  sideA: string[],
  sideB: string[],
  segment: Segment,
  useNet: boolean,
  config: NassauConfig,
): PressPlan[] {
  if (config.presses.mode === 'none' || segment.key === 'total') return [];

  if (config.presses.mode === 'manual') {
    const plans: PressPlan[] = [];
    for (const press of config.presses.presses) {
      const inferred: NassauSegment = press.segment ?? (press.hole <= 9 ? 'front' : 'back');
      const target = segment.key === 'match' ? inferred : segment.key;
      if (inferred !== target) continue;
      const index = segment.holes.findIndex((h) => h.number === press.hole);
      if (index === -1) continue;
      plans.push({ startIndex: index, fromLabel: `called on ${press.hole}` });
    }
    return plans.sort((a, b) => a.startIndex - b.startIndex);
  }

  const downBy = Math.max(1, config.presses.downBy);
  const plans: PressPlan[] = [];
  interface Live {
    startIndex: number;
    standing: number;
    pressed: boolean;
    closed: boolean;
  }
  const live: Live[] = [{ startIndex: 0, standing: 0, pressed: false, closed: false }];

  segment.holes.forEach((hole, i) => {
    const outcome = compareSides(card, sideA, sideB, hole.number, useNet);
    if (outcome === 'unplayed') return;

    for (const match of live) {
      if (match.closed || match.startIndex > i) continue;
      if (outcome === 'a') match.standing += 1;
      else if (outcome === 'b') match.standing -= 1;
      const remaining = segment.holes.length - (i + 1);
      if (Math.abs(match.standing) > remaining) match.closed = true;
    }

    const spawned: Live[] = [];
    for (const match of live) {
      if (match.pressed || match.closed || match.startIndex > i) continue;
      if (Math.abs(match.standing) < downBy) continue;
      if (i + 1 >= segment.holes.length) continue;
      match.pressed = true;
      const startIndex = i + 1;
      plans.push({ startIndex, fromLabel: `auto after ${hole.number}` });
      spawned.push({ startIndex, standing: 0, pressed: false, closed: false });
    }
    live.push(...spawned);
  });

  return plans.sort((a, b) => a.startIndex - b.startIndex);
}

function nassauForPair(
  card: Card,
  sideA: string[],
  sideB: string[],
  config: NassauConfig,
  pot: Pot,
  breakdown: BreakdownLine[],
  prefix: string,
): void {
  const useNet = config.handicap.mode === 'net';

  for (const segment of segmentsFor(card.holes)) {
    const state = runMatch(card, sideA, sideB, segment.holes, useNet);
    breakdown.push(
      settleMatch(pot, card, state, sideA, sideB, config.stakeCents, `${prefix}${segment.label}`),
    );

    const presses = planPresses(card, sideA, sideB, segment, useNet, config);
    presses.forEach((press, i) => {
      const holes = segment.holes.slice(press.startIndex);
      const pressState = runMatch(card, sideA, sideB, holes, useNet);
      const label = `${prefix}${segment.label} press ${i + 1} (${press.fromLabel})`;
      breakdown.push(settleMatch(pot, card, pressState, sideA, sideB, config.stakeCents, label));
    });
  }
}

export function computeNassau(config: NassauConfig, card: Card): GameResult {
  const teams = resolveTeams(card.players, config.teams);
  const teamIds = [...teams.keys()];
  const pot = new Pot(card.playerIds);
  const breakdown: BreakdownLine[] = [];

  for (let i = 0; i < teamIds.length; i += 1) {
    for (let j = i + 1; j < teamIds.length; j += 1) {
      const sideA = teams.get(teamIds[i]!)!;
      const sideB = teams.get(teamIds[j]!)!;
      const prefix =
        teamIds.length === 2 ? '' : `${card.name(sideA[0]!)} v ${card.name(sideB[0]!)} — `;
      nassauForPair(card, sideA, sideB, config, pot, breakdown, prefix);
    }
  }

  return { perPlayer: pot.toPerPlayer(), breakdown, isComplete: card.isComplete };
}
