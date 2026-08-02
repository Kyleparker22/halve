# Data Model

Postgres via Supabase. All tables have `id uuid primary key default gen_random_uuid()`, `created_at timestamptz default now()`, and `updated_at timestamptz` maintained by trigger unless noted.

**Row Level Security is on for every table.** Policies summarized at the end — get them right early, they are painful to retrofit.

---

## Identity

### `profiles`
Extends `auth.users`. One row per user.

| column | type | notes |
|---|---|---|
| `id` | uuid PK | FK → `auth.users.id` |
| `handle` | text unique | @mention name, lowercase, 3–20 chars |
| `display_name` | text | |
| `avatar_url` | text | Supabase Storage |
| `home_course_id` | uuid | FK → `courses` |
| `handicap_index` | numeric(4,1) | app-calculated, informational |
| `bio` | text | |
| `onboarded_at` | timestamptz | |

### `follows`
Directed social graph, separate from crew membership.

| column | type |
|---|---|
| `follower_id` | uuid FK → profiles |
| `followee_id` | uuid FK → profiles |

PK `(follower_id, followee_id)`. Feed visibility = union of follows and shared crews.

---

## Crews

### `crews`
| column | type | notes |
|---|---|---|
| `name` | text | |
| `avatar_url` | text | |
| `created_by` | uuid FK → profiles | |
| `invite_code` | text unique | short code for join links |

### `crew_members`
| column | type | notes |
|---|---|---|
| `crew_id` | uuid FK → crews | |
| `profile_id` | uuid FK → profiles | |
| `role` | text | `owner` \| `member` |
| `joined_at` | timestamptz | |

PK `(crew_id, profile_id)`.

---

## Courses

Sourced from GolfCourseAPI, cached locally. **Cache aggressively** — the free tier is 50 req/day and you will blow through it in testing.

### `courses`
| column | type | notes |
|---|---|---|
| `external_id` | text unique | provider's ID |
| `name` | text | |
| `club_name` | text | |
| `city`, `state`, `country` | text | |
| `lat`, `lng` | numeric | |
| `holes` | int | 9 or 18 |
| `raw` | jsonb | full provider payload, for fields you haven't modeled yet |
| `synced_at` | timestamptz | |

### `course_tees`
| column | type | notes |
|---|---|---|
| `course_id` | uuid FK → courses | |
| `name` | text | "Blue", "Championship" |
| `gender` | text | `M` \| `F` |
| `rating` | numeric(4,1) | course rating |
| `slope` | int | |
| `total_yards` | int | |

### `course_holes`
| column | type | notes |
|---|---|---|
| `course_tee_id` | uuid FK → course_tees | |
| `hole_number` | int | 1–18 |
| `par` | int | |
| `yards` | int | |
| `handicap_index` | int | stroke index 1–18, **critical for side games** |
| `green_front_lat/lng` | numeric | nullable, for GPS |
| `green_center_lat/lng` | numeric | nullable |
| `green_back_lat/lng` | numeric | nullable |

> Verify before M6 whether your provider returns true front/center/back points or a single centroid. If centroid only, derive front/back from the green polygon and the tee→green bearing.

---

## Rounds and scoring

### `rounds`
| column | type | notes |
|---|---|---|
| `crew_id` | uuid FK → crews | nullable — solo rounds allowed |
| `course_id` | uuid FK → courses | |
| `course_tee_id` | uuid FK → course_tees | |
| `scheduled_at` | timestamptz | |
| `status` | text | `scheduled` \| `in_progress` \| `completed` \| `cancelled` |
| `created_by` | uuid FK → profiles | |
| `booking_url` | text | if booked via deep link |
| `notes` | text | |

### `round_players`
| column | type | notes |
|---|---|---|
| `round_id` | uuid FK → rounds | |
| `profile_id` | uuid FK → profiles | nullable for guests |
| `guest_name` | text | for non-users |
| `rsvp` | text | `in` \| `out` \| `maybe` \| `pending` |
| `grouping` | int | which foursome |
| `playing_handicap` | int | strokes received this round |

### `scores`
The hot table. Index on `(round_id, profile_id, hole_number)`.

| column | type | notes |
|---|---|---|
| `round_id` | uuid FK → rounds | |
| `round_player_id` | uuid FK → round_players | |
| `hole_number` | int | |
| `strokes` | int | |
| `putts` | int | nullable |
| `fairway_hit` | boolean | nullable |
| `gir` | boolean | nullable |
| `penalties` | int | default 0 |
| `entered_by` | uuid FK → profiles | **attribution — kills arguments** |
| `client_id` | text | idempotency key for offline sync |

`unique (round_player_id, hole_number)`.

---

## Side games

### `games`
| column | type | notes |
|---|---|---|
| `round_id` | uuid FK → rounds | |
| `type` | text | `skins` \| `nassau` \| `wolf` \| `match` \| `bestball` \| `stableford` \| `bbb` |
| `config` | jsonb | stake, carryover, handicap %, presses, teams |
| `status` | text | `active` \| `final` |

Multiple games per round is normal.

### `game_participants`
| column | type |
|---|---|
| `game_id` | uuid FK → games |
| `round_player_id` | uuid FK → round_players |
| `team` | text nullable |

### `game_results`
Computed, but **persisted** — you want an immutable record of what was settled.

| column | type | notes |
|---|---|---|
| `game_id` | uuid FK → games | |
| `round_player_id` | uuid FK → round_players | |
| `amount_cents` | int | signed; positive = won |
| `detail` | jsonb | hole-by-hole breakdown for the "why do I owe $12" screen |

### `ledger_entries`
The season-long running balance, per crew.

| column | type | notes |
|---|---|---|
| `crew_id` | uuid FK → crews | |
| `from_profile_id` | uuid FK → profiles | debtor |
| `to_profile_id` | uuid FK → profiles | creditor |
| `amount_cents` | int | |
| `game_id` | uuid FK → games | nullable — manual adjustments allowed |
| `settled_at` | timestamptz | null = outstanding |
| `settle_method` | text | `venmo` \| `cash` \| `cashapp` \| `other` |

---

## Want to Play

### `saved_courses`
| column | type | notes |
|---|---|---|
| `profile_id` | uuid FK → profiles | |
| `course_id` | uuid FK → courses | nullable until matched |
| `status` | text | `want_to_play` \| `played` \| `dismissed` |
| `source` | text | `instagram` \| `tiktok` \| `manual` \| `feed` \| `search` |
| `source_url` | text | the original post — **always keep this** |
| `source_caption` | text | TikTok gives this; Instagram does not |
| `source_thumbnail_url` | text | nullable |
| `raw_match_candidates` | jsonb | what the matcher proposed, for debugging |
| `match_confidence` | numeric | 0–1 |
| `confirmed_at` | timestamptz | null = awaiting user confirmation |
| `note` | text | |

`unique (profile_id, course_id) where course_id is not null`.

> **Design note:** a save with `course_id = null` and `confirmed_at = null` is the "we couldn't identify this, ask the user" state. This will be common. Make that screen good — it is the feature's real UX, not an error path.

---

## The Bag

### `bag_items`
| column | type | notes |
|---|---|---|
| `profile_id` | uuid FK → profiles | |
| `club_type` | text | `driver` \| `3w` \| `5w` \| `hybrid` \| `4i`…`9i` \| `pw` \| `gw` \| `sw` \| `lw` \| `putter` |
| `brand` | text | |
| `model` | text | |
| `loft` | numeric(3,1) | nullable |
| `shaft` | text | nullable |
| `acquired_at` | date | |
| `retired_at` | date | nullable — keeps bag history |
| `avg_distance_yards` | int | nullable, derived later |

---

## Trips

### `trips`
| column | type | notes |
|---|---|---|
| `crew_id` | uuid FK → crews | nullable |
| `name` | text | |
| `destination` | text | |
| `start_date`, `end_date` | date | |
| `status` | text | `planning` \| `booked` \| `completed` \| `cancelled` |
| `created_by` | uuid FK → profiles | |
| `cover_image_url` | text | |

### `trip_members`
`trip_id`, `profile_id`, `rsvp`, `room_assignment` (text, nullable).

### `trip_rounds`
Links a trip to scheduled rounds. `trip_id`, `round_id`, `day_index`.

### `trip_expenses`
| column | type | notes |
|---|---|---|
| `trip_id` | uuid FK → trips | |
| `paid_by` | uuid FK → profiles | |
| `description` | text | |
| `amount_cents` | int | |
| `split_type` | text | `even` \| `custom` |
| `split` | jsonb | `{profile_id: cents}` when custom |

---

## Reviews

### `reviews`
Polymorphic over course and trip.

| column | type | notes |
|---|---|---|
| `profile_id` | uuid FK → profiles | |
| `subject_type` | text | `course` \| `trip` |
| `subject_id` | uuid | course_id or trip_id |
| `rating` | int | 1–5 |
| `would_return` | boolean | |
| `body` | text | |
| `photo_urls` | text[] | |
| `conditions` | jsonb | optional structured: greens, pace, value, staff |

`unique (profile_id, subject_type, subject_id)`.

---

## Feed

### `feed_items`
Denormalized fan-out-on-write. Cheaper to read, and read volume dominates.

| column | type | notes |
|---|---|---|
| `actor_id` | uuid FK → profiles | who did the thing |
| `type` | text | `round_completed` \| `bag_added` \| `course_saved` \| `round_booked` \| `trip_booked` \| `trip_completed` \| `review` \| `milestone` |
| `subject_type` | text | |
| `subject_id` | uuid | |
| `payload` | jsonb | **denormalized render data** — course name, score, club model. Feed rendering must not require joins. |
| `crew_id` | uuid | nullable — scopes visibility |
| `visibility` | text | `followers` \| `crew` \| `private` |

Index `(actor_id, created_at desc)`.

### `reactions`
`profile_id`, `feed_item_id`, `emoji`. PK `(profile_id, feed_item_id, emoji)`.

### `comments`
`profile_id`, `feed_item_id`, `body`, `parent_id` (nullable, one level of nesting only).

---

## Chat

### `channels`
| column | type | notes |
|---|---|---|
| `type` | text | `crew` \| `round` \| `trip` \| `dm` |
| `crew_id` / `round_id` / `trip_id` | uuid | nullable, exactly one set unless `dm` |
| `last_message_at` | timestamptz | for sorting the inbox |

### `channel_members`
`channel_id`, `profile_id`, `last_read_at`, `muted` (boolean). Unread count = messages after `last_read_at`.

### `messages`
| column | type | notes |
|---|---|---|
| `channel_id` | uuid FK → channels | |
| `profile_id` | uuid FK → profiles | |
| `body` | text | |
| `attachment_urls` | text[] | |
| `reply_to_id` | uuid | nullable |
| `client_id` | text | idempotency for optimistic send |

Index `(channel_id, created_at desc)`. Supabase Realtime subscription per open channel.

---

## Analytics

### `booking_clicks`
Small table, large strategic value — this is your GolfNow partnership evidence.

`profile_id`, `course_id`, `round_id` (nullable), `provider` (`golfnow` \| `supreme` \| `other`), `target_url`, `clicked_at`.

---

## RLS policy summary

| Table | Read | Write |
|---|---|---|
| `profiles` | anyone authenticated | self only |
| `crews`, `crew_members` | members of the crew | owner, or self for leaving |
| `rounds`, `round_players` | crew members, or participants | participants |
| `scores` | round participants | round participants (any player may enter for any player — by design) |
| `games`, `game_*` | round participants | round participants |
| `ledger_entries` | the two parties + crew members | the two parties |
| `saved_courses` | self | self |
| `bag_items` | anyone who can see the profile | self |
| `trips`, `trip_*` | trip members | trip members |
| `reviews` | anyone authenticated | author |
| `feed_items` | follows ∪ shared crews, respecting `visibility` | system (via function) |
| `messages` | channel members | channel members |
| `courses`, `course_*` | anyone authenticated | service role only |

> **Warning:** the feed visibility policy is the one that will bite. Write it as a `security definer` function returning the set of visible actor IDs, and test it with three accounts before building the feed UI.
