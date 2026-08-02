import { buildCard } from './card';
import { sumCents } from './money';
import { computeBestBall } from './games/bestball';
import { computeMatch } from './games/match';
import { computeNassau } from './games/nassau';
import { computeSkins } from './games/skins';
import { computeStableford } from './games/stableford';
import { computeStroke } from './games/stroke';
import { computeWolf } from './games/wolf';
import type { BreakdownLine, GameConfig, GameResult, Hole, Player, Score } from './types';

/**
 * The one entry point. Pure: same inputs, same output, forever.
 *
 * Throws only when the *engine* is wrong (money did not conserve). Bad or
 * missing scores are handled, never thrown on.
 */
export function computeGame(
  config: GameConfig,
  holes: Hole[],
  players: Player[],
  scores: Score[],
): GameResult {
  const card = buildCard(config, holes, players, scores);

  let result: GameResult;
  switch (config.type) {
    case 'nassau':
      result = computeNassau(config, card);
      break;
    case 'skins':
      result = computeSkins(config, card);
      break;
    case 'match':
      result = computeMatch(config, card);
      break;
    case 'stroke':
      result = computeStroke(config, card);
      break;
    case 'bestball':
      result = computeBestBall(config, card);
      break;
    case 'wolf':
      result = computeWolf(config, card);
      break;
    case 'stableford':
      result = computeStableford(config, card);
      break;
  }

  const total = sumCents(result.perPlayer);
  if (total !== 0) {
    // Unreachable by design. If it ever fires, the game logic is wrong and we
    // must not hand a number to a user.
    throw new Error(`${config.type} result sums to ${total} cents, must be 0`);
  }

  return result;
}

export interface PlayerBreakdown {
  summary: string;
  lines: BreakdownLine[];
}

/**
 * §5.3 — game_results.breakdown is per (game, player). Store only the lines that
 * reference that player plus a summary; the whole narrative is reconstructed by
 * unioning the rows, ordered by hole.
 */
export function partitionBreakdown(
  result: GameResult,
  names: Record<string, string> = {},
): Record<string, PlayerBreakdown> {
  const out: Record<string, PlayerBreakdown> = {};
  for (const { roundPlayerId, amountCents } of result.perPlayer) {
    const lines = result.breakdown.filter((line) => line.players.includes(roundPlayerId));
    const who = names[roundPlayerId] ?? 'You';
    const verb = amountCents > 0 ? 'won' : amountCents < 0 ? 'lost' : 'broke even';
    const money =
      amountCents === 0
        ? ''
        : ` ${Math.abs(amountCents) % 100 === 0 ? `$${Math.abs(amountCents) / 100}` : `$${(Math.abs(amountCents) / 100).toFixed(2)}`}`;
    out[roundPlayerId] = {
      summary: `${who} ${verb}${money}.`,
      lines,
    };
  }
  return out;
}
