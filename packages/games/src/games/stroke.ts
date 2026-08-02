/**
 * Stroke play — straight low total, gross or net. Everyone antes the stake and
 * the low score takes the pot; ties split it, remainder cents to the lowest ids.
 *
 * Only holes every player has finished count, so the money line is meaningful
 * mid-round and nobody is punished for the group being on different holes.
 */
import type { Card } from '../card';
import { formatCents, Pot, splitCents } from '../money';
import type { BreakdownLine, GameResult, StrokeConfig } from '../types';

export function computeStroke(config: StrokeConfig, card: Card): GameResult {
  const useNet = config.handicap.mode === 'net';
  const pot = new Pot(card.playerIds);
  const breakdown: BreakdownLine[] = [];

  const commonHoles = card.holes.filter((h) => card.isFullyScored(h.number));

  if (commonHoles.length === 0 || card.playerIds.length < 2) {
    breakdown.push({
      holes: card.holes.length ? [card.holes[0]!.number] : [1],
      players: card.playerIds,
      text: 'No hole has a score from everyone yet.',
    });
    return { perPlayer: pot.toPerPlayer(), breakdown, isComplete: card.isComplete };
  }

  const totals = card.playerIds.map((id) => ({
    id,
    total: commonHoles.reduce(
      (sum, hole) => sum + ((useNet ? card.net(id, hole.number) : card.gross(id, hole.number)) ?? 0),
      0,
    ),
  }));

  const low = Math.min(...totals.map((t) => t.total));
  const winners = totals.filter((t) => t.total === low).map((t) => t.id);
  const holeSpan = [commonHoles[0]!.number, commonHoles[commonHoles.length - 1]!.number];

  const potCents = config.stakeCents * card.playerIds.length;
  for (const id of card.playerIds) pot.add(id, -config.stakeCents);
  for (const [id, share] of splitCents(potCents, winners)) pot.add(id, share);

  breakdown.push({
    holes: holeSpan,
    players: winners,
    amountCents: potCents,
    text:
      winners.length === 1
        ? `${card.name(winners[0]!)} low with ${low}${useNet ? ' net' : ''} over ${
            commonHoles.length
          } holes. Pot ${formatCents(potCents)}.`
        : `Tied at ${low}${useNet ? ' net' : ''}: ${winners
            .map((id) => card.name(id))
            .join(', ')}. Pot ${formatCents(potCents)} split.`,
  });

  for (const entry of totals) {
    breakdown.push({
      holes: holeSpan,
      players: [entry.id],
      text: `${card.name(entry.id)} — ${entry.total}${useNet ? ' net' : ''} thru ${
        commonHoles.length
      }.`,
    });
  }

  return { perPlayer: pot.toPerPlayer(), breakdown, isComplete: card.isComplete };
}
