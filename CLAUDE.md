# Halve — Repo Guide

Read this file first in every session. It is the contract for how this codebase is built.

## What this is

**Halve** is a group-first golf app. The crew — not the individual golfer — is the primary object. Schedule rounds, keep a live group scorecard offline, compute side-game money, carry a running ledger across the season, plan buddies trips, and fill open seats through friends of friends.

Full specs live in `/docs`:
- `01 Product Spec.md` — what we're building and why, feature by feature
- `02 Technical Spec.md` — stack, architecture, engineering rules
- `03 Data Model.md` — full Postgres schema, RLS, invariants
- `04 Build Plan.md` — the milestone sequence and acceptance criteria

**Read the relevant spec section before implementing a feature. Do not infer requirements.**

## Stack

Expo (React Native) + TypeScript strict · expo-router · Supabase (Postgres, Auth, Storage, Realtime, Edge Functions) · TanStack Query · Zustand · MMKV · Vitest · Maestro

pnpm monorepo:
```
apps/mobile        Expo app
packages/games     @halve/games   — pure scoring engine
packages/ledger    @halve/ledger  — netting + debt simplification
packages/types     @halve/types   — generated Supabase types + domain types
supabase/          migrations, edge functions, seed
```

## Non-negotiable rules

1. **Money is integer cents.** `amount_cents: number` where the number is always cents. Never floats, never `parseFloat`, never string math. Game results must sum to exactly zero, enforced by a deferred constraint trigger in the database — not only in application code.
2. **RLS on every table, no exceptions — and `security_invoker = true` on every view.** A view without it runs as `postgres` and bypasses RLS entirely, leaking every crew's data while the underlying table correctly returns nothing. Every table *and every view* needs a test proving a non-member gets zero rows.
3. **`@halve/games` is pure.** No I/O, no `Date.now()`, no randomness, no imports outside the package. Same inputs → same outputs, forever. 90% coverage is a hard CI gate. The server recomputes with the **same build** — never write a second implementation inside an edge function.
4. **Scoring is offline-first.** Every score write goes to local state and the mutation queue first, renders instantly, and syncs later. The scorecard never awaits the network. Ever.
5. **Sync conflicts resolve by server-assigned `version`, never by client clock.** Always send the complete row, and always inspect the return value — a lost conflict is a *successful* call that changed nothing. Treating a 2xx as confirmation is how scores silently diverge.
6. **Ledger entries are immutable.** Only `status` and `batch_id` may be updated. Corrections are new offsetting entries.
7. **Halve never holds money.** Settlement generates prefilled payment deep links to Venmo/Cash App. No custody, no escrow, no wallet. Do not add one.
8. **`round_players.id` is the scoring identity**, not `profiles.id`. Guests have no account and must work everywhere — scores, games, trips, expenses, ledger. Guests are crew-scoped and persistent, and every guest has a voucher.
9. **Never write a ledger entry without resolving guests to vouchers and netting first.** A guest and their voucher in the same game collapse to one position; writing per-player entries produces `from_profile = to_profile` and fails the check constraint.
10. **Timestamps are `timestamptz` in UTC.** Rounds also carry an IANA timezone string; a 7:40am tee time is local time.
11. **No business logic in components.** Scoring math in `@halve/games`, netting in `@halve/ledger`, data access in hooks, presentation in components.
12. **Never commit secrets.** The Supabase anon key is public by design; the service role key must never appear in `apps/mobile`.

## Conventions

- **Files**: components `PascalCase.tsx`, hooks `useThing.ts`, utils `kebab-case.ts`
- **Routes**: expo-router file-based; every shareable object has a deep-linkable route
- **Migrations**: numbered and additive (`0007_add_trip_rooms.sql`). Never edit an applied migration; write a new one. **Table creation order matters** — Postgres does not defer FK targets. Follow `docs/03 Data Model.md` §14 exactly and add cross-cycle FKs via `ALTER TABLE` at the end.
- **Types**: regenerate after every schema change — `pnpm gen:types`
- **Commits**: conventional commits (`feat:`, `fix:`, `chore:`)
- **Branches**: one per milestone ticket, PR into `main`

## Commands

```bash
pnpm install
pnpm dev                  # expo start
pnpm test                 # vitest, all packages
pnpm test:games           # the one that matters
pnpm typecheck
pnpm lint
pnpm gen:types            # supabase gen types → packages/types
supabase start            # local stack
supabase db reset         # re-run migrations + seed
pnpm e2e                  # maestro
```

## Working style

- **Follow the milestone order in `04 Build Plan.md`.** Do not start a milestone until the previous one's acceptance criteria demonstrably pass. M3 (offline scorecard) is a hard gate — the four-device sync test must pass before any game logic is written.
- **Write the test first for anything touching money.** Games and ledger code is the one place in this repo where correctness beats speed, unconditionally.
- **When a spec is ambiguous, ask.** Do not invent product behavior. A wrong guess about how a press works costs more to unwind than a question costs to ask.
- **Prefer boring.** This app's differentiation is in the product, not the architecture. Use the obvious library, the obvious pattern, the obvious query.
- **Every user-visible money number needs a breakdown the user can tap into.** Disputes are the failure mode. "You owe Todd $35" is useless; "Hole 7 — Todd birdied, 3 skins carried, @ $5 = $15" is defensible.

## Things that are deliberately NOT in scope

Do not build these, even if they seem natural:

- GPS rangefinding, shot tracking, swing analysis, AI caddie
- Official USGA/WHS handicap issuance (GHIN API is closed at our scale)
- Open stranger matching or a public discovery feed — friend-of-friend, two hops, never public
- In-app tee-time booking (v1 is outbound deep links; the booking columns exist for later)
- Score import from 18Birdies/TheGrint/Arccos — no usable APIs, and credential sync violates their ToS
- Any form of money custody
- A subscription paywall (v1 is free; the model supports gating later)
