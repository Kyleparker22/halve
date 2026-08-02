---
type: spec
date: 2026-08-02
project: Halve
status: v1 draft
---

# Halve — Technical Spec

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| App | **React Native via Expo (SDK 54+), TypeScript strict** | One codebase, EAS Build for TestFlight, OTA updates for fast beta iteration. |
| Navigation | **expo-router** (file-based) | Deep links map to routes for free — critical for invite links. |
| Backend | **Supabase** (Postgres 15+, Auth, Storage, Realtime, Edge Functions) | Relational shape fits crews/rounds/games/ledger exactly. RLS enforces the crew boundary at the database, not in app code. Kyle knows Postgres. |
| Server state | **TanStack Query v5** + Supabase JS client | Cache, retry, offline persistence. |
| Local state | **Zustand** | Small, for UI-only state (active hole, scorecard draft). |
| Offline | **MMKV** persistence + custom mutation queue | See §6. |
| Push | **expo-notifications** + Expo Push Service | |
| Money math | **`@halve/games`** — pure TS workspace package | Deterministic, fixture-tested, zero deps. See §5. |
| Scheduled jobs | **pg_cron** (Supabase extension) | T-24h and T-1h round reminders are time-based, not event-based. Enable in M0. |
| Errors | **Sentry** (`@sentry/react-native`) | |
| Analytics | **PostHog** | |
| CI | **GitHub Actions** → typecheck, lint, test on PR; **EAS Build** for binaries | |

### Hard rules

- **All money in integer cents.** `amount_cents INTEGER`. Never a float, never a JS `number` for currency arithmetic beyond integer cents. Lint rule to forbid `parseFloat` in the games package.
- **All timestamps `timestamptz`.** Store UTC. Rounds also store an IANA `timezone` string, because a 7:40am tee time means 7:40 local regardless of where the user's phone is.
- **No business logic in components.** Game scoring lives in `@halve/games`, data access in hooks, UI in components.
- **RLS on every table. No exceptions.** A table without a policy is a leak.

## 2. Repo structure

Monorepo, pnpm workspaces.

```
halve/
├── apps/
│   └── mobile/                 # Expo app
│       ├── app/                # expo-router routes
│       │   ├── (auth)/
│       │   ├── (tabs)/         # crews, rounds, trips, profile
│       │   ├── crew/[id]/
│       │   ├── round/[id]/     # incl. /score, /games, /recap
│       │   ├── trip/[id]/
│       │   └── join/[code].tsx # invite deep-link target
│       ├── src/
│       │   ├── components/
│       │   ├── hooks/          # useCrew, useRound, useScorecard, useLedger
│       │   ├── lib/            # supabase client, offline queue, deep links
│       │   └── theme/
│       └── app.json
├── packages/
│   ├── games/                  # @halve/games — pure scoring engine
│   ├── ledger/                 # @halve/ledger — netting + debt simplification
│   └── types/                  # @halve/types — generated Supabase types + shared domain types
├── supabase/
│   ├── migrations/             # numbered SQL migrations
│   ├── functions/              # Deno edge functions
│   └── seed.sql
└── CLAUDE.md
```

## 3. Data model

Full schema in `03 Data Model.md`. Summary of the relational spine:

```
profiles ─┬─< crew_members >─ crews ─┬─< rounds >─┬─< round_players >─ scores
          │                          │            └─< games >─ game_results
          ├─< friendships >          ├─< trips >──┬─< trip_members >─ rooms
          │                          │            └─< trip_expenses >─ expense_shares
          └─< ledger_entries >───────┘
courses ─< tees ─< holes
```

Key decisions:

- **`round_players` is the scoring identity, not `profiles`.** A round player may be a **guest** (name only, no account). Scores, games, and ledger entries all reference `round_players.id`. Guests carry a `vouched_by` profile so their money resolves to a real person.
- **Ledger entries are immutable.** Corrections are new offsetting entries, never edits. An argument about money three weeks later must be reconstructible.
- **`games.config` and `game_results.breakdown` are `jsonb`.** Game formats vary too much for columns; the engine owns the shape and the TS types are the contract.
- **Courses are cached locally.** Fetch from the course API on first search, upsert into `courses`/`tees`/`holes`, serve from Postgres thereafter. Never hit the third-party API on a hot path.

## 4. Auth & authorization

- Supabase Auth: **Apple**, **Google**, **phone OTP** (Twilio). Apple sign-in required by App Store rules once Google is present.
- `profiles.id` is a FK to `auth.users.id`. A trigger creates a profile row on signup.
- **Authorization is RLS, driven by crew membership.** Canonical helper:

```sql
create or replace function public.is_crew_member(target_crew uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from crew_members
    where crew_id = target_crew and profile_id = auth.uid()
  );
$$;
```

Every crew-scoped table policy reduces to `is_crew_member(crew_id)`. Rounds and trips inherit through their `crew_id`. Scores are readable if you can read the round.

- **Friend-of-friend visibility** is a `security definer` function, not a client-side query — the client must never be able to enumerate the graph. The single authoritative definition of "two hops" and the full function body are in `03 Data Model.md` §9 (`visible_open_seats()`). It returns a **narrowed row type carrying the vouching edge**, not `setof rounds`, so non-members never receive a round's full columns and the UI has something to render the connection with.

- **Invite codes** are short, random, non-sequential (`nanoid`, 10 chars), revocable, and optionally single-use.

## 5. Games engine (`@halve/games`)

The most important code in the app. Specify it tightly.

**Contract:**

```ts
type Score  = { roundPlayerId: string; hole: number; strokes: number | null }
type Player = { roundPlayerId: string; playingHandicap: number; teamId?: string }
type Hole   = { number: number; par: number; strokeIndex: number }

type GameConfig =
  | { type: 'nassau';    stakeCents: number; handicap: HandicapMode; presses: PressRule }
  | { type: 'skins';     stakeCents: number; handicap: HandicapMode; carryover: boolean; validation: boolean }
  | { type: 'match';     stakeCents: number; handicap: HandicapMode; teams: TeamSpec }
  | { type: 'stroke';    stakeCents: number; handicap: HandicapMode }
  | { type: 'bestball';  stakeCents: number; handicap: HandicapMode; teams: TeamSpec }
  | { type: 'wolf';      stakeCents: number; handicap: HandicapMode; loneMultiplier: number; blindMultiplier: number }
  | { type: 'stableford';stakeCents: number; handicap: HandicapMode; table: PointTable }

type HandicapMode = { mode: 'gross' } | { mode: 'net'; allowancePct: number }

type GameResult = {
  perPlayer: Array<{ roundPlayerId: string; amountCents: number }>  // MUST sum to 0
  breakdown: BreakdownLine[]   // human-readable, hole-referenced
  isComplete: boolean          // false when holes are still unscored
}

function computeGame(config: GameConfig, holes: Hole[], players: Player[], scores: Score[]): GameResult
```

### 5.1 Playing handicap — specify this or the app computes the wrong money

This decides who pays whom and was the single biggest unstated assumption in the first draft. All of it is fixed:

- **Course Handicap (WHS, current):** `round(index × slope / 113 + (rating − par))`. Not the pre-2020 `index × slope / 113`. The difference is 2–4 strokes on a typical course.
- **Playing Handicap:** `round(courseHandicap × allowancePct)`. Rounding is **half-up** at every step, and rounding happens **once**, at the end.
- **Low-man adjustment — ON by default for match, best ball, skins, and Nassau.** Every player's playing handicap is reduced by the lowest player's, so the low man plays off scratch. This is the near-universal club convention and its absence would silently change every result. It is a per-game config flag (`lowManAdjustment: boolean`), defaulted `true` for those four games and `false` for stroke and stableford.
- **Order of operations:** course handicap → allowance % → round → low-man subtraction. Never the reverse.
- **9-hole rounds:** halve the 18-hole course handicap, round half-up, and allocate against the stroke indexes of the nine actually played (`rounds.nine` is `'front'` or `'back'`). Odd stroke indexes belong to the front nine, even to the back.
- **Mixed tees:** when players use different tees, add each player's `(rating − par)` differential relative to the round's base tee. `round_players.tee_id` exists precisely for this.
- **Stroke allocation:** by `stroke_index`. Handicap 9 gets a stroke on the 9 lowest-index holes; handicap 20 gets one on all 18 plus a second on indexes 1 and 2. Negative handicaps (plus players) *give* strokes back, starting at index 18.

**Invariants — enforce with tests:**

1. `perPlayer` amounts **always sum to exactly zero**. Money is conserved. Assert it in every fixture.
2. `computeGame` is **pure** — no I/O, no `Date.now()`, no randomness. Same inputs, same output, forever.
3. It handles **partial rounds** — the money line must render correctly after hole 4. `isComplete: false`, amounts reflect holes played.
4. It handles **null scores** (player picked up, didn't play the hole) per each game's rules. Never `NaN`, never throw.
5. Every result line in `breakdown` cites the hole(s) that produced it.

**Net stroke allocation:** strokes are allocated by `strokeIndex` — a player with a playing handicap of 9 gets one stroke on the 9 lowest-index holes; handicap 20 gets one on every hole plus a second on indexes 1 and 2.

**Testing:** each game needs a fixture file of real scorecards with hand-verified expected outputs, including the edge cases — all-square matches, skins carrying to 18 and nobody winning, a wolf going lone and losing, a press stack, a player with no score on a hole, a 9-hole round, a plus-handicap player, and mixed tees. **Minimum 90% coverage on this package; it is the only coverage gate in the repo.**

### 5.2 One implementation, two runtimes

The server recomputes games on round completion as the authority. **That must be the same code**, not a second implementation living inside an edge function — a divergent server implementation is exactly the "trust is unrecoverable" failure the risk register names.

- `@halve/games` is published to the workspace as **ESM with no Node built-ins and no dependencies**, so Deno can import it directly.
- The Supabase edge function imports it via a build step that bundles the package into the function directory before deploy (`pnpm build:functions`), or via an import map pointing at the built ESM output. Either is fine; **writing the logic twice is not.**
- CI runs the same fixture suite against both the Node and Deno builds. If they ever disagree, the build fails.

### 5.3 Breakdown shape

`game_results.breakdown` is per `(game_id, round_player_id)`, but `computeGame` returns one narrative for the whole game. **Partition it:** each player's row stores only the lines that reference that player, plus a `summary` string. The full game narrative is reconstructed by unioning the rows, ordered by hole. Do not duplicate the entire breakdown N times.

## 6. Offline scoring

Non-negotiable. Signal dies on the back nine.

**Design:**
- Scorecard state is **local-first**. Every score entry writes immediately to MMKV-backed local state and renders instantly.
- A **mutation queue** persists pending writes. On connectivity restore, flush in order with exponential backoff.
- Conflict resolution is by **server-assigned monotonic `version`**, not client clock — see `03 Data Model.md` §6.1 for the `upsert_score` contract. Phone clocks drift badly on a course with no signal, and a device set hours fast would otherwise write a row no later write could ever beat.
- **Three client rules, all mandatory:**
  1. **Send the complete row** every time (`strokes`, `putts`, `penalties`), merged from last-known server state. The upsert overwrites all three; a partial write silently wipes fields another device set.
  2. **Inspect the return value.** A conflict is a *successful* call that changed nothing and returns the current server row. Never treat a 2xx as confirmation — compare the returned `version` to what you expected, and reconcile local state when it differs.
  3. Treat `client_updated_at` as display metadata only. It is clamped server-side to `now()`.
- Realtime subscription on `scores` merges remote changes into local state when online. Local *unflushed* writes take precedence in the UI; a write that lost a version race is no longer pending and must yield to the server row.
- **Games recompute locally** from local scores. The money line never waits on the network. Server recomputes on round completion as the authority, using the same `@halve/games` build (§5.2).
- Detect connectivity with `@react-native-community/netinfo`; show a subtle "offline — scores saved" banner, never a blocking modal.
- Surface a **"scores updated by <name>"** toast on reconcile, so a player whose entry lost a race finds out on the tee box rather than at settlement.

**Test case that must pass:** four devices, one round, two devices offline for holes 5–14, all reconnect at different times, final scorecard is identical on all four and matches what was entered.

## 7. Third-party services

| Service | Use | Notes |
|---|---|---|
| **Course data** | Course/tee/hole par, yardage, stroke index, rating/slope | Start with **GolfCourseAPI** (`api.golfcourseapi.com`, free tier). Upgrade path: **golfapi.io** (42,000+ courses, REST or full CSV dump, pricing on request). **Do not** buy GPS polygon data (Golf Intelligence starts at $399/mo) — v1 needs no GPS. Wrap in an adapter interface so the source is swappable. |
| **Venmo / Cash App** | Settlement deep links | `venmo://paycharge?txn=pay&recipients=<handle>&amount=<amt>&note=<note>`. No API, no account, no approval. Always provide copy-to-clipboard fallback and check `canOpenURL` first. |
| **Twilio** | Phone OTP via Supabase Auth | Costs real money per SMS — prefer Apple/Google sign-in in the UI hierarchy. |
| **Expo Push** | Notifications | |
| **Sentry / PostHog** | Errors / analytics | |
| **GolfNow Affiliate & Partner API** | Booking — **v2** | Apply now, in parallel with the build. OAuth 2.0, REST/JSON, sandbox available, covers search *and* booking. Application-gated with unpublished terms; approval for a pre-launch app is genuinely uncertain. |

## 8. Notifications

Two mechanisms, both server-side. **Client-scheduled local notifications are not acceptable** — the recipients who matter are the ones who haven't opened the app.

- **Event-driven**: Postgres trigger → edge function → Expo Push.
- **Time-driven**: `pg_cron` job every 15 minutes scanning for rounds crossing the T-24h and T-1h thresholds. Required for the M2 acceptance criteria.

Push tokens live in the `devices` table — one row per device, unique on token, pruned on 410 responses from Expo. A single `push_token` column on `profiles` breaks the moment a user has an iPad or reinstalls.

**Batching**: score-entry and RSVP events are debounced per round with a 5-minute window and collapsed into one push ("3 new scores in Saturday at Innisbrook"). A crew of 8 entering scores must never produce 8 notifications — this is an M7 acceptance criterion and needs the debounce table built in M2 alongside the first notification.

| Event | Recipients |
|---|---|
| Invited to crew / round / trip | Invitee |
| Round T-24h with no RSVP | Non-responders |
| Round starting in 1h | Everyone in |
| Someone requested your open seat | Organizer |
| Round completed, money computed | All players |
| Settlement request received | Payer |
| Settlement confirmed | Both parties |
| Trip roster/room/itinerary change | Trip members |

Every notification type is individually mutable in settings. Batch aggressively — a crew of 8 entering scores must never produce 8 pushes.

## 9. Environments

- `local` — Supabase CLI, seeded courses and fixture crews
- `staging` — Supabase project, EAS internal distribution
- `production` — Supabase project, TestFlight → App Store

Secrets in EAS Secrets and Supabase Vault. **Never in the repo.** The Supabase anon key is public by design; the service role key must never appear in the mobile app.

## 10. Testing

| Layer | Tool | Gate |
|---|---|---|
| Games engine | Vitest + fixtures | **90% coverage, hard gate** |
| Ledger netting | Vitest | Conservation-of-money property tests |
| Hooks / data | Vitest + MSW | Smoke coverage |
| RLS policies | pgTAP or SQL test suite | **Every table: verify a non-member is denied** |
| E2E | Maestro | Two flows: (1) invite → crew → round → score 18 → settle; (2) offline scoring sync |

## 11. Performance & UX constraints

- Scorecard hole-to-hole transition: **< 100ms**, always local, never awaits network.
- Cold start to crew home: **< 2s** on a mid-range Android.
- One-handed operation on the scorecard. Primary tap targets in the bottom third of the screen — the user is standing on a tee box holding a club.
- Dark mode from day one; people score at dusk.
- Accessibility: minimum 44pt touch targets, dynamic type support on score displays.
