---
type: spec
date: 2026-08-02
project: Halve
status: v1 draft — approved scope
---

# Halve — Product Spec

## 1. One-line

**Halve is the app for your golf crew** — schedule the round, keep the card, settle the bets, plan the trip, and carry the balance forward all season.

## 2. Positioning

Every incumbent golf app is built around **the individual golfer**: my GPS, my stats, my handicap, my round history. 18Birdies, Hole19, Arccos, Golfshot, TheGrint — all of them optimize for a solo user's data.

But golf's actual social unit is **the crew**. The foursome. The Saturday group. The eight guys who go to Pinehurst every October. That group has continuous state — who owes who, who's playing this weekend, who's in for the trip, who's on a heater — and no product holds it.

**Halve is group-first.** The crew is the primary object, not the profile.

### The three things that make it defensible

1. **The season-long crew ledger.** Every side-game app computes who owes whom for *today's round* and then forgets. Halve keeps a running balance inside your crew across every round and every trip, all season. That balance is the reason you open the app on a Tuesday. Nobody does this.
2. **Trips as a first-class object.** Golf Genius charges $149/trip and only handles the on-site tournament. Everyone else in "golf trips" is a travel agency with a booking app. The full stack — multi-course itinerary, roommates, per-person expense ledger, no-repeat pairings, side games, one settlement at the end — is genuinely unowned.
3. **Friend-of-friend fill, not stranger matching.** Open-marketplace golfer matching is a proven graveyard (TeeMates, ConnectTee, Three Putt, GolfLync, Divot, 1UP — dozens of attempts, all sub-1,000 users; the one global survivor, Deemples, only worked by owning tee-time booking in a single dense metro). Halve never asks a stranger to trust a stranger. Open seats surface to **your crews' crews** — people vouched for by someone you play with. It works at 20 users. It has no liquidity problem.

### Non-goals (say no to these, loudly)

- GPS rangefinding, shot tracking, AI caddie, swing analysis. Arccos and 18Birdies own this and it is not why anyone would switch.
- Official USGA/WHS handicap issuance. GHIN API access requires supporting ~10 clubs / 1,400 golfers. Not available, not needed.
- Open stranger matching. See above.
- Custody of wagered money. See §7.
- Being a travel agency. Halve coordinates trips; it does not sell them.

## 3. Users

**Primary — The Organizer.** One per crew. Sends the "who's in Saturday" text, books the tee time, keeps the mental note of who owes what, plans the annual trip. Currently runs on group text + a Google Sheet + Venmo. Halve replaces his spreadsheet and his memory. **If the Organizer doesn't adopt, the crew doesn't adopt.** Every feature decision resolves in his favor.

**Secondary — The Regular.** Shows up, plays, pays. Needs the app to be near-zero effort: RSVP in one tap, scores entered by whoever's keeping the card, settle with one tap. Will not configure anything.

**Tertiary — The Fill-In.** Friend of a Regular. Gets pulled in when the crew is a man short. First touch is an invite link, not an App Store search.

## 4. Core objects

| Object | What it is |
|---|---|
| **Profile** | A golfer. Handle, name, avatar, home course, self-reported handicap index. |
| **Crew** | A persistent group. Has members, a ledger, rounds, and trips. A user can be in many. |
| **Round** | One 9 or 18 at a course on a date. Has a roster, a scorecard, and games. |
| **Trip** | A multi-day container for several rounds, plus lodging, roommates, and expenses. |
| **Game** | A wager attached to a round or trip. Nassau, skins, wolf, match, stableford, best ball. |
| **Ledger** | The running who-owes-whom inside a crew. Fed by games and trip expenses. |
| **Settlement** | A netted payment request that closes out ledger entries. |

## 5. Feature spec

### 5.1 Onboarding & identity

- Sign in with **Apple**, **Google**, or **phone OTP**. Apple sign-in is mandatory for App Store approval given the others exist.
- Profile creation: display name, unique `@handle`, avatar, optional home course, optional handicap index (self-reported, clearly labeled "unofficial").
- **Contact matching**: with permission, hash the user's contacts and match against registered phone numbers. Show "3 people you know are on Halve."
- **Invite links**: every crew, round, and trip has a shareable link. Opening it deep-links into the app (or App Store, then to the target after install via deferred deep link).
- **Handle search**: users are findable by `@handle`. Required for the friend-of-friend graph to function.

**Acceptance:** a brand-new user can go from an SMS invite link to being a member of a crew and RSVP'd to a round in under 90 seconds.

### 5.2 Crews

- Create a crew: name, avatar, invite link.
- Roles: **owner**, **admin**, **member**. Admins can schedule rounds/trips and edit the ledger; members can RSVP and enter scores.
- Crew home screen shows, in priority order: **next round**, **your current ledger balance**, **recent activity**, **members**.
- A crew can hold **guests** — a name with no account, so a foursome isn't blocked by one guy who won't download the app. Guests belong to the crew, not to a single round, so a recurring guest keeps continuity across rounds, trips, and the season ledger. Guests can be scored and appear in games and the ledger; their balance is owed to/from the member who vouched them. When a guest's only counterparty *is* their voucher, the two positions net out and no ledger entry is written.

### 5.3 Rounds

**Scheduling**
- Pick course (search), date, tee time, tee box, number of holes, max players.
- Invite: whole crew, selected members, or open seats (see 5.7).
- RSVP states: in / out / maybe. Push notification on invite and on T-24h if still unanswered.
- Round statuses: `draft → scheduled → in_progress → completed` (plus `cancelled`).

**Booking**
- v1 ships **deep-link booking**: course search results carry an outbound "Book on GolfNow" link, and the Organizer pastes/attaches a confirmation. There is **no self-serve tee-time API** — GolfNow's partner API does support search *and* booking but is application-gated with unpublished terms, and Lightspeed/Chronogolf is hand-provisioned per club.
- **Build the data model so booking drops in without a rewrite**: `rounds.booking_provider`, `booking_external_id`, `booking_url`, `booking_status`. Apply to the GolfNow Affiliate & Partner API in parallel with the build; the affiliate ID slots into the same URL structure later.

### 5.4 Live scorecard

Kyle's call: **build our own.** This is the highest-scope area of v1 and the most important to get right, because it's where the app is used with a phone in one hand and a wedge in the other.

- **Group scorecard**: one round, all players, hole by hole. Any player can enter for anyone (someone always keeps the card).
- Entry UI: big tap targets, one hole per screen, swipe between holes. Score entry defaults to par with +/− steppers. Optional putts and penalties behind a toggle — **off by default**.
- **Offline-first, non-negotiable.** Courses have dead signal. All scoring writes go to a local queue and sync when connectivity returns. Conflict rule: **last-write-wins per (round_player, hole)**, with the writer's ID recorded.
- **Live sync**: when online, other players in the round see scores appear in realtime.
- Running display: gross, net, and **current money position** for every active game — the money line is the point. (Build order: the scorecard ships in M3 with gross and net only; the money line arrives in M4 with the games engine. See `04 Build Plan.md`.)
- Post-round: review screen → confirm → round marked `completed`, games computed, ledger entries written.
- Handicap: playing handicap computed from the player's index and the tee's rating/slope, or entered manually. Allowance percentage configurable per game.

**Acceptance:** four players, one phone in airplane mode for 18 holes, sync on return to signal, no data loss, no duplicate holes.

### 5.5 Games engine

Pure, deterministic, unit-tested. Given a set of scores and a game config, produce per-player amounts and a human-readable breakdown.

**v1 game library**
| Game | Notes |
|---|---|
| **Nassau** | Front / back / total. Presses: manual and auto (auto-press at N down). The most-played format in America. |
| **Skins** | Carryover on/off. Validation on/off. Gross or net. |
| **Match play** | 1v1 or 2v2, gross or net, with dormie/closeout logic. |
| **Stroke play** | Straight low score, gross or net. |
| **Best ball** | 2-person team, best net score per hole. |
| **Wolf** | Rotating wolf, lone wolf multipliers, blind wolf. |
| **Stableford** | Standard and modified point tables. |

Every game must produce a **breakdown a human can argue with**: "Hole 7 — Todd birdied, +1 skin, carryover from 5 and 6, 3 skins @ $5 = $15." Disputes are the failure mode; the narrative is the defense.

Multiple games can run on one round simultaneously (a Nassau *and* a skins game is the normal case).

### 5.6 Ledger & settlement

**The ledger is the retention mechanic.** Treat it as a first-class product surface, not a report.

- Every completed game writes `ledger_entries` into the crew ledger. Trip expenses write there too.
- Crew ledger screen: a matrix of who owes whom, each person's net position, and full drill-down to the originating round or expense.
- **Netting**: before settlement, run debt simplification so a crew of 8 settles in the minimum number of payments, not 28.
- **Settlement — no custody.** Halve computes the amount and generates a **prefilled payment deep link**: Venmo (`venmo://paycharge?txn=pay&recipients=<handle>&amount=<amt>&note=<note>`), Cash App, or copy-to-clipboard for anything else. The user taps once, pays in their own app, and returns; Halve marks the entries settled on confirmation from either party.
- **Halve never holds funds.** Taking custody of wager money is money transmission plus state gambling exposure — which is exactly why every incumbent stops at the ledger. The data model should support a licensed wallet later (`settlements.method`, `settlements.provider`), but v1 does not move money and the app should carry a plain-English disclosure that Halve is a record-keeping tool for social wagers between friends. **Get counsel before shipping anything that custodies funds.**
- Manual adjustments: any member can add a manual ledger entry ("Todd bought lunch, $22, split 4 ways") with a note.
- **Season view**: running P&L per crew member, best/worst months, biggest single round. This is the shareable artifact.

### 5.7 Friend-of-friend fill

- When scheduling, the Organizer can mark seats **open**.
- An open seat is visible to: crew members → their other crews' members → explicit friends. **Two hops maximum. Never public.**
- The seat card always shows the vouching connection: "Open seat — Todd's crew, Saturday 8:40 at Innisbrook." A user only ever sees seats connected to someone they play with.
- Requesting a seat notifies the Organizer, who approves. On approval the requester joins the round roster.
- **No stranger browsing, no swiping, no profile discovery feed.** If it isn't reachable through the graph, it doesn't surface.

### 5.8 Trips

The differentiated feature. A trip is a container with its own roster, itinerary, rooms, expenses, and one settlement at the end.

- **Create**: name, destination, start/end dates, cover image.
- **Roster**: invite from crews or by link. Per-person status (in/out/maybe), arrival and departure times.
- **Itinerary**: multiple rounds across multiple courses and days. Each round is a normal Halve round — same scorecard, same games.
- **Rooms**: define lodging units with capacity and cost; assign people. Cost auto-splits to occupants.
- **Pairings**: generate foursomes per round with a **no-repeat** constraint, so nobody plays with the same guy four days running. Manual override always available.
- **Expenses**: anyone logs an expense (lodging, cart fees, dinner, the guy who fronted the greens fees), split evenly or custom. Feeds the trip ledger.
- **One settlement**: at trip end, all games + all expenses net into a single per-person number and a minimal set of payment links.
- **Trip recap**: standings, money leaderboard, photos, low round, biggest loser. The thing that gets screenshotted in the group text.

### 5.9 Social

Deliberately thin. A feed that exists to make the other features worth opening, not a social network.

- Crew activity feed: rounds completed with scores and money results, trips, milestones (first birdie logged, biggest weekly win, longest streak).
- Reactions and comments on feed items.
- Round chat: a message thread per round and per trip. Realtime.
- **No public feed. No followers. No global leaderboard.** Everything is scoped to crews.

## 6. What is explicitly deferred

| Deferred | Why |
|---|---|
| Real tee-time booking in-app | Partner-gated. Ship deep links, apply to GolfNow in parallel. |
| Score import from 18Birdies/TheGrint/Arccos | No usable APIs; credential sync violates their ToS. Revisit as OCR of a user-supplied scorecard once the native scorecard is proven. |
| Official handicap issuance | GHIN is closed at this scale. Self-reported index is sufficient for games. |
| In-app custody of funds | Legal and licensing. |
| GPS / shot tracking | Not the wedge. |
| Subscription paywall | Free in v1; data model supports gating trips + advanced games later. |

## 7. Legal flags — resolve before public launch

1. **Wagering.** Halve records social wagers between friends. It takes no rake, holds no funds, and offers no house. That is the safest possible posture, but state law varies and this needs a real opinion before a public launch. Ship the beta to a private group; get counsel before the App Store listing goes wide.
2. **App Store review.** Apple's guidelines on real-money gaming are strict. Positioning matters: this is a **scorekeeping and expense-splitting tool**, in the same category as Splitwise. Do not use the words "betting" or "gambling" in the listing, the icon, or the screenshots. "Games," "stakes," "settle up."
3. **Course data licensing.** Verify redistribution terms for whichever course data source is used.
4. **Contact upload.** Hash phone numbers client-side before transmission; never store raw contact books. Disclose in the privacy policy.

## 8. Success metrics

**The one metric that matters in beta:** *crews with 2+ completed rounds in a 30-day window.* Not signups, not downloads. A crew that plays twice through the app has adopted it.

Supporting:
- % of rounds where the scorecard was completed for all 18 holes (scorecard reliability)
- % of completed games that reach a settled ledger state (the loop closing)
- Median time from round completion to settlement
- Open seats filled via friend-of-friend (does the graph actually work)
- Trips created per crew per season

## 9. Phasing

**V1 — full core (~2–3 months, per Kyle's call).** Crews, rounds, live offline scorecard, the seven-game library, crew ledger, no-custody settlement, trips, friend-of-friend fill, thin crew feed. Free.

**V2.** Booking integration if GolfNow approves. Scorecard OCR import. Leagues and season-long competitions. Pro subscription gating trips and advanced games.

**V3.** Course partnerships. Licensed settlement if the legal path is real. Broader discovery only if the graph proves it out.
