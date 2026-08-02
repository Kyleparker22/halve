# Product Spec

> **Working name:** `APPNAME` — placeholder. Single find-and-replace across the repo when the name lands.
> **Scope decision:** full feature set. **Sequencing:** usable deliverable at every milestone. **Booking:** outbound deep links from v1.

---

## 1. What this is

A golf app for people who play with the same buddies. It replaces the group text, the spreadsheet, the Venmo argument, and the six saved Reels of courses you keep meaning to play.

**Primary user:** US golfer, 25–45, plays 20–40 rounds a year with a rotating cast of 4–8 regulars, takes 1–2 golf trips a year, follows golf content on Instagram and TikTok.

**The one-line pitch:** everything your golf group already does badly in five different apps, in one place.

---

## 2. Why this can win

The incumbents are built for the **solo golfer improving their game** — GPS, stats, handicap. 18Birdies, Hole19, SwingU, Golfshot are all fundamentally single-player tools with a social tab bolted on.

Nobody has built for the **group**. The actual jobs golfers do together — figuring out who's in, keeping the bet straight, planning the trip, settling up, deciding where to go next — happen in text threads and Google Sheets.

**The differentiated loop nobody has:**

```
Friend posts a trip review  →  you save it to Want to Play
        ↑                                    ↓
   you review it                      it seeds trip planning
        ↑                                    ↓
   you play it        ←         you book it (deep link)
```

Every other feature in this spec is table stakes that keeps people in the app between rounds. **That loop is the product.**

---

## 3. Feature set

### 3.1 Crews
The core social unit. A crew is a named, persistent group.

- Create a crew, invite by link or phone contacts
- Crew roster with roles (owner, member)
- Crew home: upcoming rounds, recent scores, active bets, crew chat
- A user belongs to many crews (work crew, college buddies, Saturday regulars)
- Lightweight — no admin ceremony, no approval queues

### 3.2 Rounds
- **Schedule:** pick course, date, tee time, invite crew members
- **RSVP:** in / out / maybe, visible to everyone, with a nudge action
- **Groupings:** auto-split into foursomes, drag to rearrange
- **Live scoring:** hole-by-hole for the whole group, any player can enter for any player, offline-first with sync on reconnect
- **Score entry modes:** strokes only (fast) or strokes + putts + fairway + GIN (detailed)
- **Round chat:** thread scoped to the round, auto-archives after
- **Post-round card:** shareable summary image

### 3.3 Side games and settlement
The feature that makes the app non-optional on Saturday.

- **Supported games:** Skins (with/without carryover), Nassau (front/back/total, presses), Wolf, Match play, Best ball, Stableford, Bingo Bango Bongo
- Multiple concurrent games per round
- Handicap strokes applied per game config (full, 80%, none)
- **Live standings** update as scores are entered
- **Running ledger:** who owes who, across all rounds, per crew — the season-long balance
- **Settle up:** mark settled, with an outbound Venmo/Cash App deep link prefilled with amount and note
- Dispute-resistant: every score entry is attributed and timestamped

### 3.4 Want to Play
The differentiated feature. A bucket list fed by the content you already consume.

- **Share to save:** tap Share on an Instagram Reel or TikTok, pick `APPNAME`, the course lands in your list
- **TikTok:** caption is retrievable via public oEmbed → course auto-detected → user confirms
- **Instagram:** only the URL is retrievable (Meta stripped metadata from oEmbed in Nov 2025) → embed rendered, user tags the course in one tap
- **Manual add** from course search, always available
- **Every save keeps the source link** so you can reopen the original post
- List views: map, list, by region, by "who else wants to play this"
- **Crew overlap:** "4 of your crew want to play Sweetens Cove" → one tap to start a trip
- Mark as played → prompts a review → review posts to feed → feeds someone else's list

### 3.5 Trips
- Create a trip: dates, destination, invited crew members
- **Course itinerary:** day-by-day, tee times, links to booking
- **Roster and rooming**
- **Expense splitting:** who paid what, running per-person balance, settle-up links
- **Trip chat**
- **Packing/notes** shared doc
- **Post-trip review:** overall rating, per-course ratings, "would you go back," photos
- Trip reviews are the highest-value content in the feed

### 3.6 AI trip builder

Each crew member answers a 90-second survey — dates, budget (private), setting, course priorities, golf intensity, nightlife appetite, non-golf activities, lodging style, plus **one must-have and one veto**. The app builds the trip.

Key design decisions, detailed in `06-ai-trip-builder.md`:

- **Allocate, don't average.** Averaging preferences produces the beige trip nobody wanted. Vetoes are absolute filters; every member's must-have gets scheduled on some day; budget plans to the group's *lowest comfortable* number, not the mean.
- **Budget is collected privately** so the richest member doesn't anchor the trip.
- **The model never names a course.** Candidates are retrieved from our own database by structured filter, and any itinerary referencing a course outside that set is hard-rejected and regenerated.
- **Private courses are excluded at the query layer.** Recommending a club the crew physically cannot play is the one unrecoverable failure.
- **Seeded by the want-to-play list** — "6 of you saved Sand Valley" is an input no competitor has.

### 3.7 Social feed
Solves the dead-feed problem: golfers only play twice a week, so scores alone can't carry a feed.

Feed item types:
- **Round completed** — score, course, playing partners, notable holes
- **Bag update** — new club added, with brand/model
- **Course saved** — added to want-to-play (with the source post)
- **Round booked** — playing X on Saturday
- **Trip booked** — heading to Bandon in October
- **Trip completed** — with rating and review
- **Course review** — rating, text, photos
- **Milestones** — personal best, first sub-80, course #50

Feed is **friends-and-crews only** by default. No global feed, no strangers, no influencers. Reactions and comments on every item.

### 3.8 The Bag
- Add clubs: type, brand, model, shaft, loft, acquired date
- Bag view, shareable
- Adding a club posts to the feed — this is deliberate; gear is what golfers actually talk about
- Optional: distance per club, fed by round data later

### 3.9 Chat
- **Crew chat** — persistent, per crew
- **Round chat** — scoped, auto-archives
- **Trip chat** — scoped to trip
- **DMs** — one-to-one
- Text, photos, reactions, replies. Push notifications with per-thread mute.

### 3.10 GPS and stats
Parity with the incumbents so nobody needs a second app.

- Distances to front / center / back of green
- Hazard and layup distances where data exists
- Shot tracking (optional, tap-to-mark)
- Stats: scoring average, fairways, GIR, putts, scrambling, by course and over time
- Handicap index calculation (informational — not a licensed WHS/GHIN number; see legal note in `04`)

### 3.11 Booking
Honest posture: **you do not have tee time inventory and will not have it at launch.**

- Every course page has a **"Find tee times"** button that deep-links out to GolfNow / Supreme Golf search for that course and date
- No in-app checkout, no revenue share at v1
- Clicks are tracked — that data is the argument in your GolfNow partner application
- The booking layer is built behind an interface so a real API drops in without a rewrite if a partnership lands

**Why:** Hole19 has 42,000 courses and VC funding and does no booking at all. 18Birdies got its GolfNow deal at 950k users. Booking is a business-development problem, not an engineering one.

---

## 4. Explicit non-goals for v1

- Tournament / league management for clubs
- Swing video analysis or AI coaching
- Equipment marketplace or resale
- Public/global social graph or discovery of strangers
- Official WHS handicap posting (requires an allied golf association relationship)
- Web app — mobile only

---

## 5. Success criteria per milestone

The real test is not downloads. It's **whether your own crew keeps using it without you asking.**

| Milestone | The question it answers |
|---|---|
| M1 | Does the crew score a real round on it instead of a paper card? |
| M2 | Does the bet get settled in-app instead of by argument? |
| M3 | Does anyone save a Reel without being told to? |
| M4 | Does anyone open the app on a day they didn't play? |
| M5 | Does a trip actually get planned in it? |
| M6 | Would they be annoyed if you shut it off? |

If M1 fails, nothing after it matters. Do not build M2 until M1 passes.
