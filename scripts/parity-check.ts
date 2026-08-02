/**
 * Node/Deno parity gate (Technical Spec §5.2).
 *
 * `pnpm build:functions` computes every fixture under Node and records the
 * result. This recomputes them under Deno with the same source and fails on any
 * difference. Two runtimes, one implementation — or the build breaks.
 *
 * Run: deno run --allow-read scripts/parity-check.ts
 */
import { computeGame } from '../supabase/functions/_shared/games/index.ts';
import type { GameConfig, GameResult, Hole, Player, Score } from '../supabase/functions/_shared/games/index.ts';

interface Fixtures {
  holes: Hole[];
  players: Player[];
  scores: Score[];
  fixtures: Array<{ config: GameConfig; expected: GameResult }>;
}

const raw = await Deno.readTextFile(new URL('../supabase/functions/_shared/parity-fixtures.json', import.meta.url));
const { holes, players, scores, fixtures } = JSON.parse(raw) as Fixtures;

let failures = 0;

for (const { config, expected } of fixtures) {
  const actual = computeGame(config, holes, players, scores);
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);

  if (actualJson === expectedJson) {
    console.log(`✓ ${config.type}`);
    continue;
  }

  failures += 1;
  console.error(`✗ ${config.type} — Deno and Node disagree`);
  console.error(`  node: ${expectedJson}`);
  console.error(`  deno: ${actualJson}`);
}

if (failures > 0) {
  console.error(`\n${failures} game(s) diverged between runtimes.`);
  Deno.exit(1);
}

console.log(`\n${fixtures.length} games agree byte for byte across Node and Deno.`);
