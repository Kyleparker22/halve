/**
 * Skins — low score on the hole wins it. Ties carry the skin forward when
 * carryover is on. With validation on, a skin only counts if the winner is at
 * or under par; otherwise it carries too.
 */
import type { Card } from '../card';
import { formatCents, Pot } from '../money';
import type { BreakdownLine, GameResult, SkinsConfig } from '../types';

function describeScore(netToPar: number): string {
  if (netToPar <= -3) return 'made an albatross';
  if (netToPar === -2) return 'eagled';
  if (netToPar === -1) return 'birdied';
  if (netToPar === 0) return 'made par';
  if (netToPar === 1) return 'bogeyed';
  return `made ${netToPar} over`;
}

export function computeSkins(config: SkinsConfig, card: Card): GameResult {
  const useNet = config.handicap.mode === 'net';
  const pot = new Pot(card.playerIds);
  const breakdown: BreakdownLine[] = [];
  const stake = config.stakeCents;

  let carried: number[] = [];

  for (const hole of card.holes) {
    if (!card.isContested(hole.number)) continue;

    const scored = card.playerIds
      .map((id) => ({ id, value: useNet ? card.net(id, hole.number) : card.gross(id, hole.number) }))
      .filter((entry): entry is { id: string; value: number } => entry.value !== null);

    if (scored.length < 2) continue;

    const low = Math.min(...scored.map((s) => s.value));
    const leaders = scored.filter((s) => s.value === low);

    if (leaders.length > 1) {
      if (config.carryover) {
        carried.push(hole.number);
        breakdown.push({
          holes: [hole.number],
          players: leaders.map((l) => l.id),
          text: `Hole ${hole.number} — tied at ${low}. Skin carries.`,
        });
      } else {
        breakdown.push({
          holes: [hole.number],
          players: leaders.map((l) => l.id),
          text: `Hole ${hole.number} — tied at ${low}. No skin.`,
        });
      }
      continue;
    }

    const winner = leaders[0]!;
    const netToPar = winner.value - card.par(hole.number);

    if (config.validation && netToPar > 0) {
      if (config.carryover) carried.push(hole.number);
      breakdown.push({
        holes: [hole.number],
        players: [winner.id],
        text: `Hole ${hole.number} — ${card.name(winner.id)} low with a ${describeScore(
          netToPar,
        )}, but did not validate. ${config.carryover ? 'Skin carries.' : 'No skin.'}`,
      });
      continue;
    }

    const skins = 1 + carried.length;
    const losers = card.playerIds.filter((id) => id !== winner.id);
    const amount = stake * skins;
    pot.transfer(losers, [winner.id], amount);

    const carriedText = carried.length
      ? ` ${skins} skins (carried from ${carried.join(', ')})`
      : ' 1 skin';
    // "from Todd" beats "from each of 1" — a breakdown is read by someone who
    // wants to argue with it.
    const fromWhom =
      losers.length === 1
        ? `from ${card.name(losers[0]!)}`
        : `from each of ${losers.length} players`;

    breakdown.push({
      holes: [hole.number, ...carried].sort((a, b) => a - b),
      players: [winner.id],
      amountCents: amount * losers.length,
      text:
        `Hole ${hole.number} — ${card.name(winner.id)} ${describeScore(netToPar)}.` +
        `${carriedText} @ ${formatCents(stake)} = ${formatCents(amount)} ${fromWhom}.`,
    });
    carried = [];
  }

  if (carried.length > 0) {
    breakdown.push({
      holes: [...carried],
      players: card.playerIds,
      text: `${carried.length} skin${carried.length === 1 ? '' : 's'} still carrying (holes ${carried.join(
        ', ',
      )}). Nobody wins them unless a hole is won.`,
    });
  }

  return { perPlayer: pot.toPerPlayer(), breakdown, isComplete: card.isComplete };
}
