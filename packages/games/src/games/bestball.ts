/**
 * Best ball — two-person teams, best net score per hole, low team total wins.
 * Losing players each pay the stake; it splits across the winning side.
 */
import type { Card } from '../card';
import { resolveTeams } from '../card';
import { formatCents, Pot } from '../money';
import type { BestBallConfig, BreakdownLine, GameResult } from '../types';

export function computeBestBall(config: BestBallConfig, card: Card): GameResult {
  const useNet = config.handicap.mode === 'net';
  const teams = resolveTeams(card.players, config.teams);
  const pot = new Pot(card.playerIds);
  const breakdown: BreakdownLine[] = [];
  const pick = useNet ? card.bestNet : card.bestGross;

  // A hole counts once every team has a ball on it.
  const commonHoles = card.holes.filter((hole) =>
    [...teams.values()].every((members) => pick(members, hole.number) !== null),
  );

  if (commonHoles.length === 0 || teams.size < 2) {
    breakdown.push({
      holes: card.holes.length ? [card.holes[0]!.number] : [1],
      players: card.playerIds,
      text: 'No hole has a ball from every team yet.',
    });
    return { perPlayer: pot.toPerPlayer(), breakdown, isComplete: card.isComplete };
  }

  const totals = [...teams.entries()].map(([teamId, members]) => {
    const total = commonHoles.reduce((sum, hole) => sum + (pick(members, hole.number) ?? 0), 0);
    return { teamId, members, total };
  });

  const low = Math.min(...totals.map((t) => t.total));
  const winners = totals.filter((t) => t.total === low);
  const losers = totals.filter((t) => t.total > low);
  const holeSpan = [commonHoles[0]!.number, commonHoles[commonHoles.length - 1]!.number];

  for (const team of totals) {
    breakdown.push({
      holes: holeSpan,
      players: team.members,
      text: `${team.members.map((id) => card.name(id)).join(' & ')} — ${team.total}${
        useNet ? ' net' : ''
      } best ball thru ${commonHoles.length}.`,
    });
  }

  if (losers.length === 0) {
    breakdown.push({
      holes: holeSpan,
      players: card.playerIds,
      text: `Tied at ${low}. No money.`,
    });
    return { perPlayer: pot.toPerPlayer(), breakdown, isComplete: card.isComplete };
  }

  const winnerIds = winners.flatMap((t) => t.members);
  const loserIds = losers.flatMap((t) => t.members);
  pot.transfer(loserIds, winnerIds, config.stakeCents);

  breakdown.push({
    holes: holeSpan,
    players: [...winnerIds, ...loserIds],
    amountCents: config.stakeCents * loserIds.length,
    text: `${winners
      .map((t) => t.members.map((id) => card.name(id)).join(' & '))
      .join(', ')} won with ${low}. ${formatCents(config.stakeCents)} from each loser.`,
  });

  return { perPlayer: pot.toPerPlayer(), breakdown, isComplete: card.isComplete };
}
