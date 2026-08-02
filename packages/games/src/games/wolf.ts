/**
 * Wolf — the wolf rotates by hole, takes a partner or goes alone, and the two
 * sides play best ball for the hole.
 *
 * The wolf's choice is data, not something this package can infer: it is
 * recorded on the scorecard as the group plays and arrives in config.decisions.
 * A hole with no decision recorded is not settled, and the game reports itself
 * incomplete — inventing a choice would invent money.
 */
import type { Card } from '../card';
import { compareSides } from '../card';
import { formatCents, Pot } from '../money';
import type { BreakdownLine, GameResult, WolfConfig } from '../types';

export function computeWolf(config: WolfConfig, card: Card): GameResult {
  const useNet = config.handicap.mode === 'net';
  const pot = new Pot(card.playerIds);
  const breakdown: BreakdownLine[] = [];

  const order = (config.order ?? card.playerIds).filter((id) => card.playerIds.includes(id));
  if (order.length < 3) {
    breakdown.push({
      holes: card.holes.length ? [card.holes[0]!.number] : [1],
      players: card.playerIds,
      text: 'Wolf needs at least three players.',
    });
    return { perPlayer: pot.toPerPlayer(), breakdown, isComplete: false };
  }

  const decisions = new Map(config.decisions.map((d) => [d.hole, d]));
  let missingDecision = false;

  card.holes.forEach((hole, index) => {
    if (!card.isContested(hole.number)) return;

    const wolf = order[index % order.length]!;
    const decision = decisions.get(hole.number);

    if (!decision) {
      missingDecision = true;
      breakdown.push({
        holes: [hole.number],
        players: [wolf],
        text: `Hole ${hole.number} — ${card.name(wolf)} was wolf, but no choice was recorded. Not settled.`,
      });
      return;
    }

    const lone = decision.lone;
    const partner = lone ? undefined : decision.partnerRoundPlayerId;
    const wolfSide = partner ? [wolf, partner] : [wolf];
    const fieldSide = order.filter((id) => !wolfSide.includes(id));

    if (fieldSide.length === 0) {
      return;
    }

    const multiplier = lone === 'blind' ? config.blindMultiplier : lone === 'lone' ? config.loneMultiplier : 1;
    const stake = config.stakeCents * multiplier;
    const outcome = compareSides(card, wolfSide, fieldSide, hole.number, useNet);

    const label = lone === 'blind' ? 'blind wolf' : lone === 'lone' ? 'lone wolf' : `with ${card.name(partner!)}`;

    if (outcome === 'unplayed' || outcome === 'halve') {
      breakdown.push({
        holes: [hole.number],
        players: [...wolfSide, ...fieldSide],
        text: `Hole ${hole.number} — ${card.name(wolf)} ${label}. Halved, no money.`,
      });
      return;
    }

    const wolfWon = outcome === 'a';
    const winners = wolfWon ? wolfSide : fieldSide;
    const losers = wolfWon ? fieldSide : wolfSide;
    // Pairwise: the sides are uneven when the wolf goes alone, so a lone wolf
    // wins from — and loses to — every opponent individually.
    pot.pairwise(losers, winners, stake);

    breakdown.push({
      holes: [hole.number],
      players: [...wolfSide, ...fieldSide],
      amountCents: stake * losers.length * winners.length,
      text:
        `Hole ${hole.number} — ${card.name(wolf)} ${label}. ` +
        `${wolfWon ? 'Wolf side won' : 'Field won'}` +
        `${multiplier > 1 ? ` at ${multiplier}×` : ''}. ` +
        `${formatCents(stake)} a man.`,
    });
  });

  return {
    perPlayer: pot.toPerPlayer(),
    breakdown,
    isComplete: card.isComplete && !missingDecision,
  };
}
