# AI Trip Builder

The crew answers questions. The app builds the trip.

---

## 1. Competitive reality

**This exists.** Open Links Golf launched **Birdie** (Oct 2025): group preferences in, day-by-day itinerary with courses, lodging, dining, flights, interactive map, weather and daylight awareness, share-for-input, and OTA booking. Open Links also built GOLF.com's Course Finder — ~16,000 US courses with access type, green-fee bands, designer, walkability, and GOLF's Top 100. **They own the grounding layer and the media distribution.**

Adjacent players: [GolfTrip.ai](https://www.golftrip.ai/) (human concierge with a chatbot front end), [Outing.golf](https://www.outing.golf/) (group preference collection and voting, no AI generation), [plan.golf](https://plan.golf/) (date voting, manual itinerary). Traditional operators — Golfbreaks, PerryGolf, Golf Zoo, Haversham & Baker — are human agents with no surveys and no AI.

**None of the big golf apps do trip planning at all.** 18Birdies, Hole19, SwingU, Golfshot all point their AI at swing analysis and club selection.

### Where you actually win

AI itinerary generation is table stakes. Assume it gets commoditized within 18 months. Your defensible position is everything *around* the plan:

| Birdie has | You have |
|---|---|
| A form | A crew that already exists, with a chat history and a shared want-to-play list |
| A generated itinerary | A trip object that becomes real rounds, real scorecards, real bets, real expense splits |
| Share a link for input | Preferences from people who already play together, weighted by who actually shows up |
| A plan | The review afterward, which feeds the next crew's want-to-play list |

**Design implication:** never present this as "AI plans your trip." Present it as *"your crew already told us what they want — here's the trip."* The want-to-play overlap ("6 of you saved Sand Valley") is the input Birdie can't have.

---

## 2. The preference survey

Each member answers independently. Takes 90 seconds. **Budget is collected privately.**

| Question | Type | Notes |
|---|---|---|
| Availability | Date ranges | Multi-select, intersected across the group |
| Budget, all-in per person | Range slider | **Private.** Never shown to other members. |
| Willing to fly, or drive only? | Choice + max drive hours | |
| Setting | Multi-select | City / mountains / coast / lake / desert / countryside |
| Course priority | Rank | Bucket-list marquee · Great value · Variety · Walkability · Pure difficulty |
| Golf intensity | Choice | 36 a day · 18 and done · Mix |
| Nightlife | Choice | Full send · A couple of big nights · Dinner and bed · Dry trip |
| Non-golf activities | Multi-select | Fishing · Hiking · Spa · Casino · Great dining · Live music · Nothing, just golf |
| Lodging style | Choice | On-property resort · House rental together · Hotel in town · Cheap and functional |
| **One must-have** | Free text or pick | "I want to play Sweetens" / "one big steak dinner" |
| **One veto** | Free text or pick | "No 5am tee times" / "not another Scottsdale trip" |

Pre-fill everything possible from existing data — home location, saved courses, past trips, handicap. A returning crew should be answering three questions, not twelve.

---

## 3. Reconciliation: allocate, don't average

**Averaging preferences produces the beige itinerary nobody wanted.** If half the group wants nightlife and half wants early tee times, the mean is a mediocre trip for everyone.

Allocate instead:

1. **Hard constraints, applied as filters:**
   - Dates = intersection of availability
   - Budget = the group's **lowest comfortable number**, with optional upgrades surfaced separately. Never plan to the average — that's how the richest guy anchors the trip and someone quietly drops out.
   - Vetoes are absolute. No scoring, no weighting. A veto removes candidates.

2. **Must-haves are satisfied individually, across different days.** Every member's one must-have appears somewhere in the trip. Don't blend them — schedule them. Dave gets his late night on Tuesday, Tom gets his 7am on Wednesday.

3. **Soft preferences score destination and course candidates.** Weight by attendance confidence — someone who's "maybe" counts less than someone who's already paid.

4. **Surface the trade explicitly.** This is the part that makes it feel intelligent rather than arbitrary:

   > *"Dave wanted nightlife and Tom didn't — Tuesday's the late one, Wednesday's an early tee with a 9am shotgun. Marcus vetoed Scottsdale so we went with Sand Valley."*

   Groups don't need the perfect trip. They need to see that the trade was made deliberately, so they argue with the plan instead of with each other.

---

## 4. Grounding: the part that actually matters

Measured LLM POI hallucination runs **2–10% (Claude 3.5 Sonnet), 5–13% (GPT-4o), 12–27% (Command R+)**. Adding web search sometimes made it *worse*. Grounding in a structured API drove it to **0% across all models**.

### The catastrophic failure mode: course access

**Recommending a private club to four guys who can't play it kills the feature's credibility permanently.** And public/private is too coarse. Real constraints look like:

- Bandon Dunes is **walking only** — no carts except documented ADA. Caddies ~$50/bag plus tip.
- Resort guests book roughly a year out with priority; non-guests get a shorter window and thin availability.
- Peak green fee $345, winter $125 — same course, same name.

A model asked to plan Bandon will cheerfully put your crew in carts in July at winter rates.

### The pipeline — non-negotiable

```
1. RETRIEVE   Structured query against your own course DB.
              Filter: region, access_type IN (public, resort, municipal),
              fee band, holes, walkability. Private is excluded AT THE
              QUERY LAYER — never as a prompt hint.

2. CONSTRAIN  Pass ONLY the retrieved ID list to the model.
              The model composes an itinerary by referencing IDs.
              It is never asked to name a course from memory.

3. VALIDATE   Reject any itinerary containing an ID outside the
              retrieved set. Hard fail → regenerate. No exceptions,
              no soft warnings.

4. COMPUTE    Drive times from a routing API. Daylight and tee-time
              feasibility from arithmetic. The model does NO geography
              and NO math — those are the two things it's worst at and
              the two things groups notice immediately.

5. RENDER     Cards carry retrieved facts (fee, access, distance,
              booking window). Prose is generated FROM the cards.
              Never generate the two independently — that's exactly how
              Layla and Mindtrip ended up with trains departing before
              arrival and 5-night bookings on 4-night trips.
```

### Required UI honesty

- **Access badge on every course card**: "Resort guests only — book ~1 year out", "Public", "Municipal", "Walking only"
- **Every price labeled an estimate** with an as-of date, unless it came from a live tee-time API
- Link out to the course's own booking page — never imply you hold inventory
- Weather and seasonality surfaced, not buried

### The eval set

Build 30–50 held-out trip scenarios. Score every prompt or model change on:

| Metric | Threshold |
|---|---|
| Access violations (private course recommended) | **0%. Non-negotiable.** |
| Course existence (all IDs resolve) | 100% |
| Drive-time feasibility | 100% |
| Daylight feasibility (36 holes actually fits) | 100% |
| Budget adherence | within 10% |

This is the Expedia lesson: their Romie assistant failed because "the bot's answers floated free of Expedia's real inventory, rates, and reservations." The fix took a year of data plumbing and evaluation frameworks — **not** a better model. Build the evals before the feature.

---

## 5. Data sources

### Course access data — buy this
**[usgolfdata.com](https://usgolfdata.com/)** — ~15,000 US courses with **Course Status (Public / Private / Municipal / Resort)**, ratings, yardages, contacts. **$399 flat**, or $0.25/course.

This is the single highest-ROI purchase in the entire project. It's the field that prevents the catastrophic failure mode, and GolfCourseAPI's coverage of it is unverified. Buy it before building this feature.

### POI data — Foursquare, not Google
**Google Places has a caching trap.** Maps Platform Service-Specific Terms §10.3: you may cache **latitude/longitude for up to 30 days** and `place_id` **indefinitely**. Everything else — names, hours, ratings, reviews, photos, price level — **may not be stored in your database**. §10.2 also bars displaying Places content alongside a non-Google map.

Practical effect: you cannot pre-build a curated golf-destination POI database from Google, and every itinerary view re-bills you.

| Source | Use | Cost |
|---|---|---|
| **Foursquare Places** | Primary POI backbone — restaurants, bars, activities. **Storable.** | 10k free Pro calls, then **$15 CPM** |
| **OSM / Overpass** | Free geography that never changes — regions, lakes, mountains. ODbL attribution. | Free |
| **Google Places Details (Essentials)** | Only for high-value fields Foursquare lacks. Honor the 30-day rule. | $5/1k, 10k free/mo |

### Destination context — hand-curate it
No structured dataset of golf-trip destinations exists. It's all editorial (Golf Digest's buddies-trip lists, PGA.com, LINKS, GolfPass).

**Hand-curate 30–50 US destinations** — Bandon, Pinehurst, Streamsong, Sand Valley, Scottsdale, Myrtle Beach, Kohler, Pebble/Monterey, Palm Springs, Hilton Head, Gulf Shores, Traverse City, etc. For each: the anchor courses, the setting tags, nightlife reality, non-golf options, seasonality, typical all-in cost band, drive-vs-fly.

That's a weekend of work and it's a genuine asset. It's also the layer that makes your recommendations feel like they came from someone who's actually been, rather than from a model.

> **Do not scrape Golf Digest / GOLF / GolfWeek rankings.** Editorial IP, no public licensing tier, and a reputational hazard. GOLF's lists are in Course Finder via a licensed partnership you won't get.

---

## 6. Monetization — accessible, but small

**Good news:** travel affiliates are dramatically more accessible than GolfNow. No audience threshold, no BDM gatekeeping.

| Program | Access | Rate |
|---|---|---|
| **Stay22** | Self-serve, no minimum. Aggregates Booking/Expedia/Vrbo in one integration. | Commission split from 30% |
| **Viator** | Basic API access instantly on signup | ~8% CPA, 30-day cookie |
| **Booking.com Affiliate** | Direct application, reviewed in days | 25–40% of Booking's commission (≈3.75–6% of booking value) |
| **Expedia Travel Creator** | "Apply in minutes" | Up to 4%, **7-day cookie** |

**Dead ends, confirmed:** Amadeus Self-Service was **decommissioned July 17, 2026**. Airbnb's affiliate program is credit-only with **zero cash commission**. Expedia Rapid/EAN, Hotelbeds, RateHawk, Skyscanner all require partner contracts and an existing audience.

### The arithmetic, honestly

At 10,000 users, 500 trips planned/year, 8-person groups, 3 nights, $3,000 lodging per trip:

| | |
|---|---|
| Booked through your link (15% attach — generous) | 75 trips |
| Lodging GMV | $225,000 |
| Commission at 5% | $11,250 |
| Activities | +$1,440 |
| Less cancellations (~20%) | −$2,540 |
| **Less cookie-window loss** — golf trips are planned 3–6 months ahead; Expedia's cookie is 7 days | −$5,080 |
| Less Google Places costs | −$600 |
| **Net** | **~$4,400/year** |

**That's a rounding error.** Two percent of 10,000 users paying $8/month is $19,200/year with no attribution risk, no cookie decay, and no 60–150 day payment lag.

**Conclusion:** wire up Stay22 and Viator because they're nearly free to integrate and they'll roughly cover your Places bill. Do not build a business model on them. The real revenue paths are subscription, and — more interesting — **direct sponsorship from resorts in your top destinations**, who pay meaningfully more for a qualified 8-person group lead than any OTA pays for a click.

FTC 16 CFR Part 255 requires clear disclosure **adjacent to each affiliate CTA**, not buried in terms.

---

## 7. Build scope

Slots in as **M7, roughly 4 weeks**, after trips exist in M5. Pushes total timeline to ~27 weeks.

| Week | Work |
|---|---|
| 1 | Buy usgolfdata, import access types. Hand-curate 30–50 destinations. Build the eval set (30–50 scenarios) **before** any generation code. |
| 2 | Preference survey UI, private budget handling, group invite-and-collect flow, reconciliation logic (hard filters → must-have allocation → soft scoring). |
| 3 | Retrieval + constrained generation + validator. Deterministic drive-time and daylight computation. Card-first rendering. |
| 4 | Foursquare POI integration, Stay22 + Viator links, "why we chose this" explanation surface, run evals, iterate. |

**Definition of done:** 50 eval scenarios run with **zero access violations**, zero unresolvable course IDs, and zero infeasible drive times. Then — and only then — a real crew plans a real trip with it.

---

## 8. Open questions

1. Does GolfCourseAPI include an access/status field? If yes, how accurate? (Determines whether usgolfdata is required or merely useful.)
2. Foursquare's current terms on persisting POI data under the specific plan you sign up for — verify before building the cache.
3. Whether resort direct-sponsorship is viable — worth one exploratory call to Bandon or Streamsong group sales once you have trip volume to point at.
