# Build Plan

**Sequencing principle:** something your crew can actually use at the end of every milestone. Not a demo — a thing they'd open on a Saturday.

Total: **~23 weeks** of part-time solo work with Claude Code. Adjust for your actual hours.

---

## M0 — Foundation (weeks 1–2)

*Nothing user-facing. This is the week you set the toolchain so you don't fight it for five months.*

- Expo app, TypeScript, Expo Router, **prebuild + custom dev client from the start**
- EAS Build configured, dev build installed on your phone
- Supabase project (local + staging), migration workflow
- Auth: phone OTP (golfers won't remember a password) with Apple Sign-In as required alternative
- `profiles` table, onboarding, avatar upload
- Courses: GolfCourseAPI proxied via Edge Function, `courses`/`course_tees`/`course_holes` schema, search UI with trigram index
- Sentry + PostHog wired
- CI: typecheck + lint + `packages/games` tests on every push

**Exit test:** you sign up on a real phone and find your home course by name.

---

## M1 — Crews, rounds, live scoring, crew chat (weeks 3–7)

*The make-or-break milestone.*

- Crews: create, invite link, roster, leave
- Rounds: schedule, pick course + tee, invite, RSVP, groupings
- **Live scoring:** hole-by-hole, any player enters for any player
- **Offline outbox + sync engine** — build it here, not later
- Realtime score sync between players in the same round
- Post-round summary card
- Crew chat (Supabase Realtime) + push notifications
- Round chat

**Exit test:** your crew plays a real 18 and scores it entirely in the app, including at least one hole with no signal. If they reach for a paper card, stop and fix it before M2.

---

## M2 — Side games and settlement (weeks 8–10)

- `packages/games` — Skins, Nassau, Wolf, Match, Best ball, Stableford, Bingo Bango Bongo
- **Exhaustive unit tests, written first**
- Handicap stroke allocation via hole stroke index
- Game setup UI: stakes, carryover, handicap %, teams
- Live standings during the round
- Settled results persisted with hole-by-hole breakdown
- Crew ledger: running season balance
- Settle-up with prefilled Venmo / Cash App deep links

**Exit test:** a real bet gets settled in-app and nobody argues about the math.

---

## M3 — Want to Play, share extension, booking links (weeks 11–13)

*The differentiated feature.*

- `expo-share-intent` on both platforms
- `resolve-share` Edge Function: TikTok oEmbed, Instagram URL handling
- LLM course extraction + fuzzy match + Google Places fallback
- **Confirm screen** — the real UX of this feature
- Want to Play list: list view, map view, by region
- Crew overlap: "4 of your crew want to play this"
- Manual add from search
- Mark as played → review prompt
- **Booking deep links** on every course page (GolfNow / Supreme Golf), `booking_clicks` logging
- Submit GolfNow and Supreme Golf partner applications this week

**Exit test:** someone in your crew saves a Reel without you telling them to.

---

## M4 — Feed, bag, reviews, DMs (weeks 14–17)

- `feed_items` with fan-out-on-write, `visibility` policy tested with three accounts
- Feed item types: round completed, bag added, course saved, round booked, trip booked/completed, review, milestone
- Reactions and comments
- The Bag: add/retire clubs, bag view, posts to feed
- Course reviews and trip reviews: rating, would-return, photos
- DMs
- Notification preferences, per-thread mute

**Exit test:** someone opens the app on a day they didn't play golf.

---

## M5 — Trips (weeks 18–20)

- Create trip: dates, destination, invite
- Day-by-day course itinerary, linked to rounds
- Roster and rooming
- Expense splitting with running per-person balance and settle-up links
- Trip chat
- Post-trip review flow → feed
- **Start a trip from a Want to Play overlap** — closes the loop

**Exit test:** an actual trip gets planned in it.

---

## M6 — GPS, stats, launch prep (weeks 21–23)

- GPS distances: front / center / back of green
- Verify your provider returns true front/back points, not just a centroid — resolve this in M0 if you can
- Hazard and layup distances where data exists
- Stats: scoring average, fairways, GIR, putts, scrambling
- Handicap index calculation (informational)
- Onboarding polish, empty states, error states
- App Store and Play listing, screenshots, privacy labels
- TestFlight beta with 3–5 real crews outside your own
- Submit

**Exit test:** a crew you don't know keeps using it for three weeks.

---

## M7 — AI trip builder (weeks 24–27)

*Full detail in `06-ai-trip-builder.md`. Slots in after trips exist.*

- **Week 1:** Buy usgolfdata ($399) and import course access types. Hand-curate 30–50 US golf destinations. **Build the 30–50 scenario eval set before writing any generation code.**
- **Week 2:** Preference survey UI, private budget handling, group collect flow, reconciliation logic (hard filters → must-have allocation → soft scoring)
- **Week 3:** Retrieval + constrained generation + validator. Deterministic drive-time and daylight computation.
- **Week 4:** Foursquare POI integration, Stay22 + Viator affiliate links, "why we chose this" explanation surface, eval iteration

**Exit test:** 50 eval scenarios with **zero access violations**, zero unresolvable course IDs, zero infeasible drive times. Then a real crew plans a real trip with it.

> Note: this pushes total timeline to **~27 weeks**. A competitor (Birdie, by Open Links Golf) already ships AI golf trip planning, so treat generation as table stakes — your edge is that the plan becomes a real trip inside an app your crew already uses.

---

## Parallel track — not code

Do these alongside the build; they have lead times you can't compress.

| When | What |
|---|---|
| Now | Register domains. Trademark clearance with an actual attorney before any logo spend. |
| M0 | Apple Developer account ($99/yr) and Google Play ($25 one-time) — enrollment can take days |
| M3 | GolfNow + Supreme Golf partner applications. Expect silence; apply anyway. |
| M4 | TikTok Data Portability API application (3–4 weeks review) if bulk import matters |
| M5 | Line up 3–5 beta crews outside your own friend group |
| M6 | Privacy policy, terms of service, App Store privacy labels |

---

## Where this plan is most likely to slip

1. **M1 offline sync.** It always takes longer than you think. Budget the whole of week 5 for it alone.
2. **Wolf scoring.** More edge cases than the other six games combined.
3. **Course data quality.** Municipal courses have bad or missing tee/hole data. You will need a manual-entry fallback for scorecards. Discover this in M0, not M2.
4. **iOS share extension review.** Apple sometimes questions share extensions. Build it early, submit a TestFlight build with it before M3 ends.
5. **The name.** Deferred, and that's fine, but it blocks the App Store listing and every asset. Resolve it by M4 at the latest.
