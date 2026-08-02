# Halve

The app for your golf crew — schedule the round, keep the card offline, settle the bets, plan the
trip, and carry the balance forward all season.

Specs live in [`docs/`](docs). Engineering rules live in [`CLAUDE.md`](CLAUDE.md). Read those before
changing anything that touches money.

## Layout

```
apps/mobile        Expo app (expo-router, TypeScript strict)
packages/games     @halve/games   — pure scoring engine, 7 games
packages/ledger    @halve/ledger  — netting, debt simplification, payment links
packages/types     @halve/types   — database + domain types
supabase/          migrations, RLS, seed, edge functions, SQL tests
scripts/           function bundler and the Node/Deno parity gate
```

## Getting started

```bash
pnpm install
cp apps/mobile/.env.example apps/mobile/.env    # fill in your Supabase project
pnpm test                                        # 350 tests, no services needed
```

Running the app needs a Supabase project (local via the CLI, or a hosted one) and a custom dev
client — Expo Go cannot load the native modules this app uses.

```bash
supabase start          # local Postgres + auth + realtime (needs Docker)
supabase db reset       # migrations + seed
pnpm gen:types          # regenerate packages/types/src/database.ts
pnpm --filter @halve/mobile prebuild
pnpm dev
```

## Tests

| Command | What it proves |
|---|---|
| `pnpm test:games` | Every game's payouts against hand-verified scorecards, and that money always sums to zero |
| `pnpm test:ledger` | Guests resolve to vouchers, netting is deterministic, no self-entries, money is conserved |
| `pnpm test:db` | The whole migration set applies in one pass, and RLS actually holds |
| `pnpm vitest run --project offline` | The offline scorecard: local-first writes, version conflicts, force-quit recovery |
| `pnpm coverage` | The 90% gate on `@halve/games` and `@halve/ledger` |

`pnpm test:db` runs the real migration files against [PGlite](https://pglite.dev), an in-process
Postgres, so the schema and every RLS policy are verified without Docker. The only things faked are
the Supabase platform objects the migrations depend on — the `auth` schema, `auth.uid()`, and the
three Supabase roles. See `supabase/tests/harness.ts`.

## The money code

`@halve/games` is pure: no I/O, no clock, no randomness, no dependencies. The server recomputes
every game on round completion using the **same build** — `pnpm build:functions` copies the package
into `supabase/functions/_shared` and rewrites import specifiers for Deno. CI then runs the same
fixtures under both runtimes and fails if they disagree by a single cent.

Three things are enforced in the database, not just in application code:

- `game_results` for a game must sum to zero (deferred constraint trigger)
- `ledger_entries` are immutable except for `status` and `batch_id`
- `trip_expense_shares` must sum to their expense

## What is not built

Deliberately out of scope, per the product spec: GPS rangefinding, shot tracking, official WHS
handicap issuance, open stranger matching, in-app tee-time booking, and any custody of money.

Halve records social wagers between people who already know each other. It never holds funds.
