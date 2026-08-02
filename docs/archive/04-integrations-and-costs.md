# Integrations, Costs, and Constraints

Everything verified as of **August 2026**. Re-check pricing before committing — it moves.

---

## Running costs

### Pre-launch (M0–M6)

| Item | Cost |
|---|---|
| Supabase Free → Pro | $0 → **$25/mo** (move to Pro before beta; free tier pauses inactive projects) |
| GolfCourseAPI | Free (50 req/day) → **$9.99/mo** (10k/day) |
| Apple Developer | **$99/yr** |
| Google Play | **$25 one-time** |
| EAS Build | Free tier is usually enough solo; **$19/mo** if you exceed it |
| Sentry | Free tier fine |
| PostHog | Free tier fine (1M events/mo) |
| LLM calls for course matching | **~$5–20/mo** at low volume |
| Domains | **~$50–100/yr** across .com/.app/.golf |

**Realistic pre-launch burn: $40–70/month.** This is the good news — the whole thing is cheap until you have users.

### Post-launch, at scale

| Item | Cost |
|---|---|
| Supabase Pro + usage | $25/mo + bandwidth/storage overages |
| GolfCourseAPI | $24.99/mo (100k req/day) |
| Push, storage, images | Scales with users |
| **GPS data upgrade, if needed** | Golf Intelligence: **$399/mo** (10k credits) → $999 → $2,499 |

> The $399/mo tier is the cliff. Only cross it if GolfCourseAPI's GPS data proves inadequate. Test its actual green coordinates in M0 before assuming you'll need it.

---

## Course data

**Primary: GolfCourseAPI** — ~30,000 courses worldwide, GPS/green coordinates, free tier 50 req/day, $9.99/mo for 10k/day, $24.99/mo for 100k/day.

**Open question to resolve in M0:** does it return true front/center/back green points, or a single centroid? Front and back matter for real GPS distances. If centroid only, you can derive them from a green polygon and the tee→green bearing — but you need the polygon.

**OpenStreetMap as a supplement:** golf courses are tagged in OSM (`golf=green`, `golf=fairway`, `golf=tee`). A developer building a golf course browser confirmed OSM works as a base layer and is licensed for it — but had to cross-reference commercial data and course websites, and users still found gaps. Hole-level detail is described as "largely absent" in some regions.

> **License trap:** OSM is ODbL, which is share-alike. Deriving a proprietary green-coordinate database from OSM has real obligations. Get legal clarity before you build on it. Run an Overpass query for US `golf=green` counts before betting anything on this path — it's a 10-minute check.

**Expect bad data on municipal courses.** Build a manual scorecard entry fallback. This is not optional.

---

## Tee time booking

**Posture: outbound deep links only at v1.** No inventory, no revenue, no in-app checkout.

### Why

| Competitor | What they actually do |
|---|---|
| **Hole19** | 42,000 courses, VC-funded — **no booking at all** |
| **18Birdies** | GolfNow partnership, redirect-style "Book Now" |
| **SwingU** | No in-app booking |
| **Golfshot** | Has tee times, partner undisclosed |

Nobody built their own supply. GolfNow's publicly named integration partner was **18Birdies at 950k users** — that's the observable qualifying bar. Every alternative path (TeeWire, TeeTime Central, Supreme Golf, Golfmanager, foreUP) is a signed commercial agreement with unpublished terms.

The existence of a commercial market for GolfNow *scrapers* is itself the tell: the API isn't obtainable.

### What to do

1. Deep link out to GolfNow / Supreme Golf search for the course and date
2. Log every click in `booking_clicks`
3. Apply to **GolfNow Affiliate & Partner** (affiliate.gnsvc.com) and **Supreme Golf** at M3
4. Keep `lib/providers/booking.ts` behind an interface so a real API drops in without a rewrite

Your click data is the argument in the application. Nothing else you have will be.

### Do not

Scrape GolfNow or course tee sheets. Fragile, legally grey, and it poisons the partnership you're trying to get.

---

## Social save (Instagram / TikTok)

### Share sheet — solved
**`expo-share-intent` v8.0.1** (published July 2026, peer dep `expo ^57`). Config plugin generates the iOS Share Extension and Android `ACTION_SEND` intent filter.

- Requires `expo prebuild` + custom dev client. **Does not work in Expo Go.**
- `react-native-receive-sharing-intent` is **abandoned** (last publish 2022). Don't use it.
- If you want an in-extension UI (save without app-switching), `expo-share-extension` does that instead.

### What you actually receive

| Platform | Payload |
|---|---|
| **TikTok** | Short link. Public unauthenticated **oEmbed** returns `title` = **full caption**, plus author and thumbnail. This is everything you need. |
| **Instagram** | Reel URL and effectively nothing else. Meta **removed `author_name`, `author_url`, and `thumbnail_url` from oEmbed on Nov 3, 2025**. Tokenless since June 15, 2026, so it's easy to call — it just returns almost nothing. |

**Verify in M3 (5 minutes, decides the whole IG path):** does Instagram's tokenless oEmbed `html` blockquote still contain caption text?

### Bulk import of existing saved posts

Confirmed: **there is no API for this on either platform's standard developer surface.**

- TikTok Display API scopes are `user.info.*`, `video.list|publish|upload` — **zero scope for favorites or bookmarks**
- Instagram Basic Display API was **shut down Dec 2024**; its successor exposes the user's own media, not saved posts
- **TikTok Data Portability API** *does* expose "Favourite Videos" with date + link, under `portability.*` scopes — but it's a **separate application with UX mockups and ~3–4 week review**. Possibly EEA-restricted; unverified.
- Meta "Export Your Information" reportedly includes saved posts; not verified against Meta's own docs, and a ZIP-upload flow is high-friction anyway

**Decision:** v1 is share-to-save, one at a time. Bulk import is a v2 investigation.

### Legal
- TikTok oEmbed is a sanctioned public API — no exposure
- *Meta v. Bright Data* (N.D. Cal., Jan 2024) held Meta's ToS don't bind **logged-out** scraping of public data. Helpful, but it does **not** cover logged-in scraping
- **Never** build logged-in Instagram scraping. Ban risk for your users, and outside any safe harbor.

---

## Course matching

Caption → course is the hard part.

- LLM entity extraction from caption text
- Fuzzy match against `courses`
- **Google Places `searchText`** with `golf_course` type bias as fallback (also gives coordinates and photos)
- Expect **~70–85% auto-match on famous courses, much worse on munis**

**Design for the miss.** The "did you mean?" confirm step is the feature. Do not attempt full automation.

---

## Legal and compliance

| Item | Note |
|---|---|
| **Handicap** | You may compute an informational index. You may **not** call it a WHS or GHIN handicap without an allied golf association relationship. Label it clearly. |
| **Gambling** | Side games track social bets between friends and settle via outbound links. **Do not process payments in-app.** In-app money movement for wagers changes your regulatory posture entirely. Keep Venmo/Cash App as deep links out. |
| **App Store 4.7 / gambling rules** | Score-and-settle between friends is fine. Anything resembling real-money wagering infrastructure is not. |
| **Trademark** | Justia-based screening is a stale proxy. Commission a real USPTO/TSDR clearance in Classes 9, 41, and 25 before any logo spend. |
| **Privacy** | Location data (GPS) triggers App Store privacy labels and a real privacy policy. Budget for both by M6. |
| **Minors** | Set a 13+ (realistically 17+ given alcohol-adjacent content and social features) age gate. |

---

## Open questions to resolve, in priority order

1. **M0:** Does GolfCourseAPI return true front/center/back green points? Determines whether you need $399/mo GPS data.
2. **M0:** How bad is municipal course data? Determines how much manual-entry fallback you need.
3. **M3:** Does Instagram's tokenless oEmbed HTML contain caption text?
4. **M3:** Does TikTok's Android share payload include the caption directly?
5. **M3:** Is TikTok's Data Portability API geo-restricted to the EEA?
6. **Anytime:** OSM `golf=green` coverage in the US, via an Overpass query.
