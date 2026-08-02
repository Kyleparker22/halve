/**
 * Bundle the money packages into the edge functions.
 *
 * Technical Spec §5.2: the server recomputes games with the SAME build as the
 * client. Writing the logic twice is the failure mode that destroys trust, so
 * this copies packages/games and packages/ledger verbatim into
 * supabase/functions/_shared and only rewrites relative import specifiers to
 * carry the .ts extension Deno requires.
 *
 * It also emits parity-fixtures.json — inputs plus the results Node produced —
 * which parity-check.ts recomputes under Deno and diffs. If the two runtimes
 * ever disagree, CI fails.
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sharedDir = join(root, 'supabase', 'functions', '_shared');

const PACKAGES = [
  { name: 'games', src: join(root, 'packages', 'games', 'src') },
  { name: 'ledger', src: join(root, 'packages', 'ledger', 'src') },
];

const skip = (path) =>
  path.endsWith('.test.ts') || path.includes(`${'fixtures'}/`) || path.endsWith('/fixtures');

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'fixtures') continue;
      out.push(...walk(full));
    } else if (entry.endsWith('.ts') && !skip(full)) {
      out.push(full);
    }
  }
  return out;
}

/** './types' → './types.ts', '../card' → '../card.ts'. Deno needs the extension. */
function rewriteImports(source) {
  return source.replace(
    /(from\s+|import\s*\()(['"])(\.[^'"]+)(['"])/g,
    (match, prefix, openQuote, specifier, closeQuote) => {
      if (specifier.endsWith('.ts') || specifier.endsWith('.json')) return match;
      return `${prefix}${openQuote}${specifier}.ts${closeQuote}`;
    },
  );
}

rmSync(sharedDir, { recursive: true, force: true });
mkdirSync(sharedDir, { recursive: true });

let copied = 0;
for (const pkg of PACKAGES) {
  for (const file of walk(pkg.src)) {
    const target = join(sharedDir, pkg.name, relative(pkg.src, file));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, rewriteImports(readFileSync(file, 'utf8')));
    copied += 1;
  }
}

// @halve/ledger imports nothing from @halve/games today; if that changes, the
// specifier has to be rewritten to a relative path here.
for (const file of walk(join(sharedDir, 'ledger'))) {
  const source = readFileSync(file, 'utf8');
  if (source.includes('@halve/games')) {
    writeFileSync(file, source.replaceAll('@halve/games', '../games/index.ts'));
  }
}

// --- parity fixtures -------------------------------------------------------

// Imported from the copy that just landed in _shared: it carries the explicit
// .ts specifiers Node's type stripping needs, and it is the exact code the edge
// function will run.
const { computeGame } = await import(pathToFileURL(join(sharedDir, 'games', 'index.ts')).href);

const FRONT_PARS = [4, 4, 3, 5, 4, 4, 4, 3, 5];
const BACK_PARS = [4, 3, 4, 4, 5, 4, 4, 4, 4];
const FRONT_SI = [7, 5, 17, 3, 9, 11, 13, 15, 1];
const BACK_SI = [8, 18, 4, 6, 2, 10, 16, 12, 14];
const holes = [
  ...FRONT_PARS.map((par, i) => ({ number: i + 1, par, strokeIndex: FRONT_SI[i] })),
  ...BACK_PARS.map((par, i) => ({ number: i + 10, par, strokeIndex: BACK_SI[i] })),
];

const players = [
  { roundPlayerId: 'p1', playingHandicap: 4, name: 'Kyle', teamId: 'A' },
  { roundPlayerId: 'p2', playingHandicap: 14, name: 'Todd', teamId: 'A' },
  { roundPlayerId: 'p3', playingHandicap: 22, name: 'Marcus', teamId: 'B' },
  { roundPlayerId: 'p4', playingHandicap: -2, name: 'Dave', teamId: 'B' },
];

const rows = {
  p1: [4, 5, 3, 5, 4, 4, 5, 3, 5, 5, 3, 4, 5, 5, 4, 4, 4, 4],
  p2: [5, 4, 4, 6, 4, 4, 4, 4, 5, 4, 3, 5, 4, 5, 4, 3, 5, 4],
  p3: [5, 4, 4, 5, 4, 5, 4, 4, 6, 4, 4, 4, 5, 6, 4, 3, 5, 5],
  p4: [6, 5, 4, 6, 5, 5, 4, 4, 6, 5, 4, 5, 5, 6, 5, 4, 5, 5],
};
const scores = Object.entries(rows).flatMap(([roundPlayerId, strokes]) =>
  strokes.map((value, i) => ({ roundPlayerId, hole: i + 1, strokes: value })),
);

const configs = [
  { type: 'nassau', stakeCents: 2000, handicap: { mode: 'gross' }, presses: { mode: 'auto', downBy: 2 } },
  { type: 'skins', stakeCents: 500, handicap: { mode: 'net', allowancePct: 100 }, carryover: true, validation: true },
  { type: 'match', stakeCents: 5000, handicap: { mode: 'net', allowancePct: 90 } },
  { type: 'stroke', stakeCents: 333, handicap: { mode: 'gross' } },
  { type: 'bestball', stakeCents: 2500, handicap: { mode: 'net', allowancePct: 90 } },
  { type: 'stableford', stakeCents: 100, handicap: { mode: 'net', allowancePct: 95 } },
  {
    type: 'wolf',
    stakeCents: 200,
    handicap: { mode: 'gross' },
    loneMultiplier: 2,
    blindMultiplier: 3,
    decisions: holes.map((hole, i) => ({
      hole: hole.number,
      ...(i % 3 === 0 ? { lone: 'lone' } : { partnerRoundPlayerId: i % 2 ? 'p2' : 'p3' }),
    })),
  },
];

const fixtures = configs.map((config) => ({
  config,
  expected: computeGame(config, holes, players, scores),
}));

writeFileSync(
  join(sharedDir, 'parity-fixtures.json'),
  `${JSON.stringify({ holes, players, scores, fixtures }, null, 2)}\n`,
);

console.log(`build:functions — copied ${copied} files, wrote ${fixtures.length} parity fixtures`);
