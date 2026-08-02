# Technical Architecture

## Stack

| Layer | Choice | Why |
|---|---|---|
| App | **Expo (SDK 57+) / React Native, TypeScript** | One codebase, iOS + Android. Share extension requires a custom dev client — plan for it from day one. |
| Navigation | **Expo Router** | File-based, deep-link friendly (needed for share-intent handoff and booking returns). |
| Backend | **Supabase** | Postgres + Auth + Realtime + Storage + Edge Functions in one. Realtime is what makes live scoring and chat cheap. |
| Server state | **TanStack Query** | Caching, retries, optimistic updates. |
| Client state | **Zustand** | Small, no boilerplate. Only for genuinely local UI state. |
| Offline | **TanStack Query persister + an outbox table in SQLite** | Non-negotiable — see below. |
| Course data | **GolfCourseAPI** | ~30k courses, GPS coordinates, $10–25/mo. |
| Share ingestion | **expo-share-intent** | v8.0.1, actively maintained, config plugin generates both platforms. |
| Push | **Expo Notifications** | |
| Errors | **Sentry** | |
| Analytics | **PostHog** | |
| Build/ship | **EAS Build + EAS Submit** | |

---

## The three things that will hurt if you get them wrong

### 1. Offline-first scoring

**Golf courses have no signal.** This is not an edge case, it is the primary condition. If scoring breaks in a dead zone, the app is dead — your crew will go back to paper on the first bad hole and never come back.

Design:
- Every score write goes to a **local outbox** first (SQLite), then syncs
- Each write carries a `client_id` UUID for idempotency
- Conflict rule: **last-write-wins per `(round_player_id, hole_number)`**, with `entered_by` and timestamp preserved so disputes are resolvable by humans
- The round's full course/tee/hole data is **prefetched and cached when the round is created**, not when it starts
- UI never blocks on network. A pending write shows as a subtle sync indicator, never a spinner or an error
- Realtime subscription is an *enhancement* — when other players' scores arrive, merge them. When the socket is down, the app works exactly the same, just without live standings

**Test this deliberately:** airplane mode for 18 holes, then reconnect. Do it before M2.

### 2. Side-game calculation

Put every game's scoring logic in **pure TypeScript functions** in a shared `packages/games` module:

```ts
computeSkins(scores, config, strokeIndexes, handicaps) -> GameResult
computeNassau(...) -> GameResult
computeWolf(...) -> GameResult
```

Reasons:
- They must run **client-side offline** for live standings
- They must run **server-side** (Edge Function) to produce the authoritative settled result
- Same code both places, or you get the "my phone said I won" bug
- **They are trivially unit-testable and you must test them exhaustively.** Wolf in particular has a dozen edge cases (lone wolf, blind wolf, carryover on ties). Money is involved; wrong math destroys trust permanently.

Write the tests first for this module. It is the one place in the app where TDD genuinely pays.

### 3. Share extension

`expo-share-intent` requires `expo prebuild` and a **custom dev client** — it does not work in Expo Go. Set this up in M0, not M3, so you are not discovering the toolchain change halfway through.

Flow:
```
User taps Share in TikTok/Instagram
  → OS share sheet → APPNAME
  → app receives URL (and on Android sometimes a text blob)
  → deep link to /save?url=...
  → Edge Function: resolve metadata
       TikTok  → public oEmbed → full caption
       Instagram → URL only (Meta stripped metadata Nov 2025)
  → LLM extracts candidate course name from caption
  → fuzzy match against courses table + GolfCourseAPI + Google Places fallback
  → confirm screen: "Add Sweetens Cove to Want to Play?" [Yes] [Pick a different course]
  → saved_courses row
```

**Never auto-save without confirmation.** Match confidence on munis and ambiguous names is poor. The confirm screen is the feature, not a fallback.

---

## Repository layout

```
apps/
  mobile/                 Expo app
    app/                  Expo Router routes
      (auth)/
      (tabs)/
        index.tsx         Feed
        crews/
        play/             Rounds + live scoring
        saved/            Want to Play
        profile/
      round/[id]/
      trip/[id]/
      chat/[channelId]/
      save.tsx            Share-intent landing
    components/
    lib/
      supabase.ts
      offline/            Outbox, sync engine
      hooks/
packages/
  games/                  Pure scoring logic + tests
  shared/                 Types generated from Supabase schema, constants
supabase/
  migrations/             Numbered SQL migrations
  functions/
    resolve-share/        Share URL → course match
    settle-game/          Authoritative game result
    fanout-feed/          Feed item creation
  seed/
docs/
```

---

## Environments

- **local** — Supabase CLI, local Postgres, seeded with ~50 real courses
- **staging** — Supabase project, TestFlight / internal track
- **production** — separate Supabase project. Never share a database between staging and prod.

Migrations only via `supabase/migrations`. No console schema edits, ever — you will lose them.

---

## Third-party integration boundaries

Wrap every external service behind a local interface so it can be swapped:

```
lib/providers/
  courses.ts      -> GolfCourseAPI today, iGolf or Golf Intelligence later
  booking.ts      -> deep links today, GolfNow API if a partnership lands
  social.ts       -> TikTok oEmbed, Instagram oEmbed
  matching.ts     -> LLM + fuzzy match + Google Places
```

`booking.ts` matters most. Today it returns a URL. If GolfNow approves you, it returns real tee times and the UI barely changes.

---

## Security notes

- **RLS on every table, no exceptions.** Test with three accounts in different crews.
- Supabase `anon` key ships in the app — that is expected and fine, RLS is the actual boundary.
- Service-role key **only** in Edge Functions, never in the client bundle.
- Course provider API key **only** server-side. Proxy course search through an Edge Function so the key is never in the app.
- Rate-limit the share-resolve function per user — LLM calls cost money and it is trivially abusable.

---

## Performance guardrails

- Feed reads must never join. Denormalize into `feed_items.payload`.
- Live scoring subscribes to one round's rows, not the whole table.
- Course search is server-side with a Postgres trigram index, not a client filter over a big list.
- Prefetch course + tee + hole data on round creation; a round in progress makes zero course queries.
