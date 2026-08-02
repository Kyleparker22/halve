# M0 Kickoff Prompt

Paste this into Claude Code in an empty directory. It sets up the toolchain and ships the foundation.

**Before you start:**
1. Create a Supabase account and a new project (free tier is fine)
2. Get a GolfCourseAPI key at golfcourseapi.com (free tier)
3. Have your Supabase project URL, anon key, and service role key ready
4. Replace `APPNAME` throughout with the final name once decided — for now it's a placeholder

---

## The prompt

````
I'm building a golf social and coordination app. This is milestone M0: the foundation.
Nothing user-facing beyond auth, profile, and course search — the goal is a correct,
well-structured base that the next five milestones build on without rework.

## Product context

The app is for golfers who play with the same group of buddies. Core features
(NOT in this milestone, but the architecture must accommodate them):
crews, scheduled rounds, offline-first live scoring, side bets with settlement,
a "want to play" course list fed by sharing Instagram/TikTok posts into the app,
a social feed, golf bag tracking, trips with expense splitting, chat, and GPS distances.

## Stack — use exactly this

- Expo SDK 57+, React Native, TypeScript (strict)
- Expo Router for navigation
- Supabase: Postgres, Auth, Realtime, Storage, Edge Functions
- TanStack Query for server state, Zustand for local UI state
- Sentry for errors, PostHog for analytics
- EAS Build

## Critical constraint: custom dev client from day one

Later milestones need `expo-share-intent`, which requires `expo prebuild` and a custom
dev client. Set this up NOW so we never fight the toolchain mid-project. Do not build
anything that only works in Expo Go.

## Repository structure

apps/mobile/          — the Expo app
packages/games/       — pure TypeScript side-game scoring logic (empty for now, but scaffold it with a test setup)
packages/shared/      — types generated from the Supabase schema, shared constants
supabase/migrations/  — numbered SQL migrations, the ONLY way schema changes
supabase/functions/   — Edge Functions
docs/                 — I'll add specs here

Use a monorepo. pnpm workspaces.

## What to build in M0

### 1. Project scaffolding
- Expo app with TypeScript strict mode, Expo Router, prebuild configured
- pnpm workspace with the packages above
- ESLint + Prettier
- GitHub Actions: typecheck, lint, and `packages/games` tests on every push
- `.env.example` documenting every required variable

### 2. Supabase setup
- Local Supabase via CLI, migration workflow documented in the README
- `profiles` table extending auth.users:
  id (uuid PK, FK to auth.users), handle (text unique, 3-20 chars lowercase),
  display_name, avatar_url, home_course_id, handicap_index (numeric 4,1),
  bio, onboarded_at, created_at, updated_at
- RLS ON. Policy: anyone authenticated can read; users can only write their own row.
- Trigger to auto-create a profile row on signup

### 3. Auth
- Phone OTP as primary (golfers won't remember passwords)
- Sign in with Apple (required by App Store when offering third-party auth)
- Onboarding flow: handle, display name, avatar upload to Supabase Storage, home course
- Session persistence, auto-refresh, proper signed-out state

### 4. Course data
Schema (all with RLS: authenticated read, service-role write only):

- `courses`: external_id (text unique), name, club_name, city, state, country,
  lat, lng, holes (int), raw (jsonb), synced_at
- `course_tees`: course_id FK, name, gender, rating (numeric 4,1), slope (int), total_yards
- `course_holes`: course_tee_id FK, hole_number, par, yards, handicap_index (stroke index 1-18),
  green_front_lat, green_front_lng, green_center_lat, green_center_lng, green_back_lat, green_back_lng

Then:
- An Edge Function `course-search` that proxies GolfCourseAPI. The API key must NEVER
  reach the client bundle.
- Upsert results into our tables so we build a local cache (their free tier is 50 req/day —
  cache aggressively, and add a `synced_at` staleness check before refetching)
- Postgres trigram index (pg_trgm) on course name + club name for fast local search
- Course search UI: search-as-you-type, results list, course detail screen showing
  tees and hole-by-hole par/yardage/stroke index

### 5. Observability
- Sentry wired for JS errors and native crashes
- PostHog with a few basic events (signup completed, course searched, course viewed)

### 6. Provider abstraction
Create `lib/providers/` with thin interfaces so external services can be swapped later:
- `courses.ts` — GolfCourseAPI behind an interface
- `booking.ts` — stub that returns a deep-link URL for a course + date (real implementation in M3)

## Two things I need you to investigate and report back on

These determine later architecture, so answer them explicitly in the README:

1. **Does GolfCourseAPI return true front/center/back green coordinates, or only a
   single centroid per green?** Fetch a real course and show me the actual response
   shape. This decides whether we need a $399/mo GPS data provider later.

2. **How complete is the tee and hole data for municipal courses?** Query a few small
   public courses (not famous ones) and report what's missing. This determines how much
   manual scorecard-entry fallback we need to build.

## Style

- TypeScript strict, no `any`
- Small focused files, colocate components with routes where sensible
- Comment the non-obvious "why," not the "what"
- No premature abstraction — but do keep the provider interfaces above

## Definition of done

I can install the dev build on a real iPhone, sign up with my phone number, complete
onboarding with an avatar, search for my home course by name, and see its scorecard
with par, yardage, and stroke index per hole.

Start by proposing the file structure and the migration plan. Wait for my approval
before writing code.
````

---

## After M0 completes

Verify these yourself before moving to M1 — don't take the agent's word:

- [ ] Dev build installs on a physical device (not just simulator)
- [ ] Phone OTP works end to end with a real number
- [ ] Course search returns real results and caches them locally
- [ ] The GolfCourseAPI key does **not** appear anywhere in the client bundle (`grep` the build output)
- [ ] RLS actually blocks cross-user profile writes — test with two accounts
- [ ] `pnpm test` runs in `packages/games` even though it's empty
- [ ] CI passes on a fresh clone
- [ ] Both investigation questions are answered in the README with real API responses

The GPS coordinate question is the one that matters most. If GolfCourseAPI only gives
centroids, you need to know now, not in week 21.
