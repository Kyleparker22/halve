---
type: spec
date: 2026-08-02
project: Halve
status: v1 draft
---

# Halve — Build Plan

Nine milestones, roughly 10–12 weeks. Each milestone is independently demoable — Kyle should be able to open the app at the end of every one and see something real.

**Rule: do not start a milestone until the previous one's acceptance criteria pass.** Claude Code will want to run ahead; don't let it.

---

## M0 — Foundations (3–4 days)

**Build**
- pnpm monorepo: `apps/mobile`, `packages/games`, `packages/ledger`, `packages/types`
- Expo app with expo-router, TypeScript strict, ESLint + Prettier
- Supabase project (local via CLI + staging), migration `0001_init.sql` with the full schema from `03 Data Model.md` — **in the migration order given in §14 of that document**, with cross-cycle FKs added by `ALTER TABLE` at the end
- RLS policies + helper functions (`is_crew_member`, `is_crew_admin`, `is_trip_member`, `is_trip_admin`)
- The `upsert_score` function, the `game_results` sum-to-zero constraint trigger, the `ledger_entries` immutability trigger, and the `trip_expense_shares` total trigger — **all four in M0**, because later milestones assume them
- `pg_cron` enabled; `devices` table for push tokens
- Account-deletion tombstone path (§10 of the data model) — this is a schema decision, not an M8 feature
- `seed.sql` with the full development dataset
- Type generation: `supabase gen types typescript` → `packages/types`
- Sentry + PostHog wired
- GitHub Actions: typecheck, lint, test on PR
- EAS Build configured for internal distribution

**Acceptance**
- `supabase db reset` seeds cleanly on a first run — **the whole migration executes in one pass with no reordering**
- App boots to a placeholder screen on a physical device via Expo Go
- CI green on a trivial PR
- A SQL test proves a non-member gets zero rows from `crews`, `rounds`, `scores`, `ledger_entries`, `game_results`, `settlements` **and from the `crew_balances` view** — views bypass RLS unless declared `security_invoker`, so testing tables alone would ship the leak with CI green
- A test proves a user who is a member of crew B cannot write a score for a `round_player` in crew A
- A test proves a profile with ledger history can be tombstone-deleted without violating a foreign key

---

## M1 — Identity & crews (1 week)

**Build**
- Auth: Apple, Google, phone OTP. Profile-creation trigger on signup.
- Onboarding: display name, `@handle` (uniqueness checked live), avatar upload to Supabase Storage
- Contact matching: hash contacts client-side, match `phone_hash`, show "people you know"
- Handle search
- Create crew, crew home screen, member list, roles
- Invite links: `halve://join/<code>` + universal links, with deferred deep link after install
- Add a guest to a crew — persisted in `crew_guests` with a required voucher, so the same guest carries across rounds, trips, and the season ledger

**Acceptance**
- Two physical devices: user A creates a crew, texts the link, user B installs and joins in under 90 seconds
- Handle collisions rejected with a useful message
- Non-members cannot read the crew by any client query

---

## M2 — Courses & rounds (1 week)

**Build**
- Course data adapter interface + GolfCourseAPI implementation; upsert into `courses`/`tees`/`holes` on first fetch, serve from Postgres after
- Course search UI (text + near-me)
- Handle missing stroke index: flag `needs_review`, apply a sane default, let the user correct it
- Schedule a round: course, tee, date/time with timezone, hole count, roster, max players
- RSVP flow + push notifications (invite, T-24h nudge, T-1h reminder)
- Round detail screen
- "Book on GolfNow" outbound deep link; Organizer can attach a confirmation URL/note

**Acceptance**
- Search "Innisbrook", pick Copperhead, schedule Saturday 8:40, invite the crew, all members get a push and can RSVP
- Course data is fetched once and served from the local DB thereafter (verify with network inspector)

---

## M3 — Live scorecard (2 weeks — the hard one)

**Build**
- Offline mutation queue (MMKV-persisted) + TanStack Query offline persistence
- Scorecard UI: one hole per screen, all players, swipe navigation, +/− steppers defaulting to par, optional putts/penalties behind a toggle
- Full-card view (traditional grid) as a secondary tab
- Realtime sync via Supabase Realtime on `scores`
- Last-write-wins upsert per the contract in `03 Data Model.md`
- Offline banner, pending-write indicator
- Playing handicap computed per `02 Technical Spec.md` §5.1 (WHS course handicap, allowance, low-man adjustment, 9-hole halving, mixed tees), manually overridable
- Round completion flow: review → confirm → `completed`

**Scope note — the M3/M4 seam.** `01 Product Spec.md` §5.4 calls the live money line "the point" of the scorecard, but the games engine is M4. Resolve it this way: **M3 ships the scorecard with gross and net totals only, and no money line.** The money line and the completion-time game computation land in M4. Do not stub a fake money line, and do not start M4 early — M3's sync test is the gate.

**Acceptance — this is the gate for the whole app**
- Four devices, one round. Two go to airplane mode for holes 5–14. All reconnect at staggered times. **Final scorecard identical on all four devices, zero data loss, zero duplicate holes.**
- A device whose clock is set 30 minutes fast cannot permanently win a conflict — a later correct write from another device still lands
- Two devices editing the same hole with different fields (one sets strokes, one sets putts) do not wipe each other's values
- A write that loses a version race surfaces a reconcile toast rather than silently diverging
- Hole-to-hole transition under 100ms with no network
- Kill the app mid-round, reopen, scorecard state intact

---

## M4 — Games engine (1.5 weeks)

**Build**
- `@halve/games` as a pure package: Nassau (with manual + auto presses), Skins (carryover, validation), Match, Stroke, Best ball, Wolf, Stableford
- Net stroke allocation by stroke index, with allowance percentage
- Fixture test suite per game with hand-verified expected outputs, including: all-square match, skins carrying through 18 with no winner, lone wolf losing, stacked presses, a player with a null score, a 9-hole round
- Game setup UI: pick type, stake, handicap mode, low-man toggle, teams, participants
- Live money line on the scorecard, recomputed locally on every score entry
- Server-side recompute on round completion → `game_results`, using the **same** `@halve/games` build (Technical Spec §5.2), not a reimplementation

**Acceptance**
- **90% coverage on `@halve/games`, hard CI gate**
- Every fixture asserts `sum(perPlayer.amountCents) === 0`
- The Node and Deno builds produce byte-identical results across the full fixture suite
- Money line updates within 100ms of a score entry, offline
- A skins breakdown reads like a human wrote it: "Hole 7 — Todd birdied. 3 skins (carried from 5, 6) @ $5 = $15."
- A direct client insert into `game_results` that doesn't sum to zero is rejected by the database, not just by the edge function

---

## M5 — Ledger & settlement (1 week)

**Build**
- `@halve/ledger`: the game-results → ledger decomposition specified in `03 Data Model.md` §7.2 (resolve guests to vouchers → aggregate by profile → drop zeroes → deterministic greedy match), plus debt simplification at settlement time. Property tests prove money conservation and byte-identical output across runs.
- Game results → `ledger_entries` on round completion. **A guest and their voucher in the same game must collapse to a net position** — writing per-player entries produces `from_profile = to_profile` and violates the check constraint, which is the single most common guest scenario.
- Crew ledger screen: net position per member, who-owes-whom matrix, drill-down to source round
- Manual ledger entries with notes
- Settlement flow: create a `settlement_batch` → net → generate Venmo/Cash App deep links with amount, recipient, and note prefilled → each party confirms → **entries close only when every settlement in the batch confirms.** Partial confirmation leaves entries `open` with a visible pending state.
- `canOpenURL` check with copy-to-clipboard fallback
- Season view: running P&L per member, biggest round, streaks
- Plain-English disclosure that Halve records social wagers and never holds funds

**Acceptance**
- A crew of 8 with 20 open entries settles in the minimum number of payments; the netting is verifiably correct
- A batch where A pays C (with no direct A→C entry) correctly closes the underlying A→B and B→C entries — and only after both payments confirm
- A guest who loses money to their own voucher produces zero ledger entries, not a constraint violation
- Tapping settle opens Venmo with amount, recipient, and note already filled
- Ledger entries are immutable — an attempted UPDATE of `amount_cents` is rejected by the trigger

---

## M6 — Trips (2 weeks)

**Build**
- Create trip, invite by link or from crews, per-member status and arrival/departure
- Itinerary: multiple rounds across days and courses, each a full Halve round
- Rooms: define units with capacity and cost, assign members, auto-split cost to occupants
- Pairings generator with a no-repeat constraint across the trip's rounds, manual override
- Trip expenses: log, split even or custom, receipt photo upload. Expenses reference `trip_members.id` so **guests can pay and be charged**.
- Room cost auto-generates an expense split across current occupants, re-derived on every room assignment change
- Trip ledger → one netted settlement batch at trip end
- Trip recap: standings, money leaderboard, low round, photos

**Acceptance**
- A 4-day, 8-person, 4-round trip: rooms assigned, pairings generated with nobody repeating a partner more than once, expenses logged, and the whole thing settles into ≤7 payments
- Even splits are cent-exact — remainder cents distributed deterministically, total always matches
- A trip member who joined by link and is **not** in the owning crew can still see and settle their own ledger entries
- A trip guest can be assigned an expense share and their money resolves to their voucher

---

## M7 — Friend-of-friend fill & feed (1 week)

**Build**
- Mark seats open when scheduling
- `visible_open_seats()` security-definer function per `03 Data Model.md` §9: two hops max, never public, **returning a narrowed row type that includes the vouching edge** — `setof rounds` would leak every column of a round to a non-member and gives the UI nothing to render the connection with
- Open-seat feed showing the vouching connection on every card
- Request → Organizer approval → join roster, with push at each step
- Crew activity feed: completed rounds with scores and money, trips, milestones
- Reactions and comments
- Round and trip chat via Realtime

**Acceptance**
- A user with no connection to a crew cannot see its open seats through any client query, including direct table access
- The vouching path renders correctly on every seat card
- A crew of 8 entering scores produces at most one batched push, not eight

---

## M8 — Polish & beta (1.5 weeks)

**Build**
- Dark mode pass, empty states, error states, loading skeletons
- Notification preferences screen (every type individually mutable)
- Settings, account deletion **UI** (the schema path ships in M0), privacy policy, terms
- App icon, splash, App Store screenshots — **positioned as scorekeeping and expense splitting, never "betting"**
- Maestro E2E: (1) invite → crew → round → score 18 → settle; (2) offline scoring sync
- Performance pass: cold start under 2s on mid-range Android
- TestFlight build, onboard the first real crew

**Acceptance**
- A real crew plays a real round start to finish with no intervention from Kyle
- Crash-free session rate above 99% in Sentry across the first week

---

## Parallel non-code work (start now, not at M8)

| Task | When | Why |
|---|---|---|
| Apply to **GolfNow Affiliate & Partner API** | Week 1 | Weeks-to-months review, uncertain approval. The application is free and the answer shapes v2. |
| Register `halve.golf`, `halvegolf.com`, `playhalve.com` | Immediately | All three verified available. They will not stay that way. |
| Trademark clearance on **HALVE** (classes 9 and 41) | Before public launch | No live exact-match mark found in any class — genuinely rare and worth locking down. |
| Counsel on social-wagering posture | Before public App Store listing | Private TestFlight is fine; a public listing is not. |
| Recruit the first crew | During M3 | You need real users the day M8 lands, not a month later. |

---

## Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| Offline sync loses scores | **Critical** — one lost card and the crew stops using it | M3 is gated on the four-device test. Do not proceed to M4 until it passes. |
| Games engine computes money wrong | **Critical** — trust is unrecoverable | Pure package, 90% coverage gate, hand-verified fixtures, sum-to-zero assertion on every result |
| App Store rejects on gambling grounds | High | Position as scorekeeping/expense-splitting; no "bet" or "gamble" anywhere in the listing; no money custody |
| Course data missing stroke index | Medium | `needs_review` flag + user correction UI; net games are unplayable without it |
| Scope creep from "all four jobs" | High | The milestone gates. Trips (M6) and discovery (M7) come *after* the core loop works. |
| Nobody uses it after the novelty round | High | The ledger is the retention mechanic — that's why M5 exists before trips. Watch the "2+ rounds in 30 days" metric, not signups. |
