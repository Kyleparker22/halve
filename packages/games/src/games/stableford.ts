/**
 * Stableford — points against par, standard or modified table. Settles a stake
 * per point of difference between each pair of players, which is how the money
 * game is actually played and is antisymmetric, so it sums to zero for free.
 *
 * A hole with no score is 0 points — that is the real rule for picking up.
 */
import type { Card } from '../card';
import { formatCents, Pot } from '../money';
import type { BreakdownLine, GameResult, PointTable, StablefordConfig } from '../types';
import { STANDARD_STABLEFORD } from '../types';

function pointsFor(table: PointTable, netToPar: number): number {
  const key = String(netToPar);
  if (key in table) return table[key] ?? 0;
  // Clamp outside the table: better than the best listed scores the best value,
  // worse than the worst scores the worst.
  const keys = Object.keys(table)
    .map(Number)
    .sort((a, b) => a - b);
  if (keys.length === 0) return 0;
  const lowest = keys[0]!;
  const highest = keys[keys.length - 1]!;
  if (netToPar < lowest) return table[String(lowest)] ?? 0;
  return table[String(highest)] ?? 0;
}

export function computeStableford(config: StablefordConfig, card: Card): GameResult {
  const useNet = config.handicap.mode === 'net';
  const table = config.table ?? STANDARD_STABLEFORD;
  const pot = new Pot(card.playerIds);
  const breakdown: BreakdownLine[] = [];

  const played = card.playedHoles;
  if (played.length === 0 || card.playerIds.length < 2) {
    breakdown.push({
      holes: card.holes.length ? [card.holes[0]!.number] : [1],
      players: card.playerIds,
      text: 'No holes scored yet.',
    });
    return { perPlayer: pot.toPerPlayer(), breakdown, isComplete: card.isComplete };
  }

  const holeSpan = [played[0]!.number, played[played.length - 1]!.number];
  const totals = new Map<string, number>();

  for (const id of card.playerIds) {
    let points = 0;
    for (const hole of played) {
      const score = useNet ? card.net(id, hole.number) : card.gross(id, hole.number);
      if (score === null) continue; // picked up: zero points, never NaN
      points += pointsFor(table, score - hole.par);
    }
    totals.set(id, points);
    breakdown.push({
      holes: holeSpan,
      players: [id],
      text: `${card.name(id)} — ${points} points thru ${played.length}.`,
    });
  }

  const ids = card.playerIds;
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const a = ids[i]!;
      const b = ids[j]!;
      const diff = (totals.get(a) ?? 0) - (totals.get(b) ?? 0);
      if (diff === 0) continue;
      const amount = Math.abs(diff) * config.stakeCents;
      const winner = diff > 0 ? a : b;
      const loser = diff > 0 ? b : a;
      pot.transfer([loser], [winner], amount);
      breakdown.push({
        holes: holeSpan,
        players: [a, b],
        amountCents: amount,
        text: `${card.name(winner)} beat ${card.name(loser)} by ${Math.abs(diff)} points @ ${formatCents(
          config.stakeCents,
        )} = ${formatCents(amount)}.`,
      });
    }
  }

  return { perPlayer: pot.toPerPlayer(), breakdown, isComplete: card.isComplete };
}
