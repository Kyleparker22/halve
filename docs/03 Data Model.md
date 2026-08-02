---
type: spec
date: 2026-08-02
project: Halve
status: v1 — reviewed and corrected
---

# Halve — Data Model

Postgres 15+ / Supabase. Migration-ready SQL. **Table order in this document is the migration order — do not reorder it.** Cross-cycle foreign keys are added via `ALTER TABLE` at the end (§12).

## 0. Conventions & invariants

- Primary keys `uuid default gen_random_uuid()`; timestamps `timestamptz`
- **Money is `integer` cents. Never float.**
- Enums are Postgres types, not text-with-check
- **RLS on every table.** Views must be `security_invoker`.
- Every FK column used in an RLS policy or a hot query has an index (§11)

---

## 1. Enums

```sql
create type crew_role        as enum ('owner','admin','member');
create type round_status     as enum ('draft','scheduled','in_progress','completed','cancelled');
create type rsvp_status      as enum ('invited','in','out','maybe');
create type round_visibility as enum ('crew','friends_of_friends');
create type game_type        as enum ('nassau','skins','match','stroke','bestball','wolf','stableford');
create type ledger_source    as enum ('game','trip_expense','manual','adjustment');
create type ledger_status    as enum ('open','settled','void');
create type settle_method    as enum ('venmo','cashapp','cash','other');
create type settle_status    as enum ('draft','requested','confirmed','cancelled');
create type trip_status      as enum ('planning','confirmed','active','completed','cancelled');
create type member_status    as enum ('invited','in','out','maybe');
create type handicap_source  as enum ('self','ghin','computed');
```

## 2. Courses

Defined first — `profiles` references it.

```sql
create table courses (
  id           uuid primary key default gen_random_uuid(),
  source       text not null,              -- 'golfcourseapi' | 'golfapi' | 'manual'
  external_id  text,
  name         text not null,
  club_name    text,
  city text, state text, country text,
  lat numeric(9,6), lng numeric(9,6),
  hole_count   int not null default 18,
  needs_review boolean not null default false,   -- true when provider omitted stroke index
  raw          jsonb,
  updated_at   timestamptz default now(),
  unique (source, external_id)
);
create index courses_search_idx on courses
  using gin (to_tsvector('english', name || ' ' || coalesce(city,'')));

create table tees (
  id        uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  name      text not null,
  gender    text,
  par       int not null,
  yardage   int,
  rating    numeric(4,1),                        -- course rating
  slope     int check (slope between 55 and 155),
  unique (course_id, name, gender)
);
create index tees_course_idx on tees (course_id);

create table holes (
  id           uuid primary key default gen_random_uuid(),
  tee_id       uuid not null references tees(id) on delete cascade,
  number       int not null check (number between 1 and 18),
  par          int not null check (par between 3 and 6),
  yardage      int,
  stroke_index int not null check (stroke_index between 1 and 18),
  unique (tee_id, number)
);
create index holes_tee_idx on holes (tee_id);
```

> **Stroke index is required** — net games are unplayable without it. If the provider omits it, apply a default and set `courses.needs_review = true` so the UI can prompt for a correction.

## 3. Identity

```sql
create table profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  handle          text unique not null check (handle ~ '^[a-z0-9_]{3,20}$'),
  display_name    text not null,
  avatar_url      text,
  phone_hash      text,                    -- sha256 of E.164, client-side hashed
  home_course_id  uuid references courses(id) on delete set null,
  handicap_index  numeric(4,1),            -- self-reported, unofficial
  handicap_source handicap_source default 'self',
  deleted_at      timestamptz,             -- tombstone; see §10
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create index profiles_phone_hash_idx on profiles (phone_hash);

-- Push tokens: one row per device, not one column per user.
create table devices (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  push_token  text not null unique,
  platform    text not null check (platform in ('ios','android')),
  last_seen_at timestamptz default now(),
  created_at  timestamptz default now()
);
create index devices_profile_idx on devices (profile_id);

create table friendships (
  profile_id uuid references profiles(id) on delete cascade,
  friend_id  uuid references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (profile_id, friend_id),
  check (profile_id <> friend_id)
);
create index friendships_friend_idx on friendships (friend_id);
```

Friendships are stored bidirectionally — a trigger inserts the reciprocal row.

## 4. Crews & guests

```sql
create table crews (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  avatar_url  text,
  invite_code text unique not null,        -- nanoid(10)
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz default now()
);

create table crew_members (
  crew_id    uuid references crews(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  role       crew_role not null default 'member',
  joined_at  timestamptz default now(),
  primary key (crew_id, profile_id)
);
create index crew_members_profile_idx on crew_members (profile_id);
```

**Guests are crew-scoped and persistent**, not per-round. A recurring guest keeps continuity across rounds, trips, and the season ledger.

```sql
create table crew_guests (
  id         uuid primary key default gen_random_uuid(),
  crew_id    uuid not null references crews(id) on delete cascade,
  name       text not null,
  vouched_by uuid not null references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  unique (crew_id, name)
);
create index crew_guests_crew_idx on crew_guests (crew_id);
```

> A guest's money always resolves to `vouched_by`. See §7 for how self-referential entries are handled.

## 5. Trips

Defined before `rounds`, which references `trips`.

```sql
create table trips (
  id          uuid primary key default gen_random_uuid(),
  crew_id     uuid not null references crews(id) on delete cascade,
  name        text not null,
  destination text,
  start_date  date not null,
  end_date    date not null,
  cover_url   text,
  status      trip_status not null default 'planning',
  invite_code text unique not null,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz default now(),
  check (end_date >= start_date)
);
create index trips_crew_idx on trips (crew_id);

create table rooms (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references trips(id) on delete cascade,
  name       text not null,
  capacity   int not null check (capacity > 0),
  cost_cents integer not null default 0,
  paid_by    uuid references profiles(id) on delete set null   -- who fronted it
);
create index rooms_trip_idx on rooms (trip_id);

create table trip_members (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references trips(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  guest_id   uuid references crew_guests(id) on delete cascade,
  status     member_status not null default 'invited',
  arrives_at timestamptz,
  departs_at timestamptz,
  room_id    uuid references rooms(id) on delete set null,
  check ((profile_id is not null) <> (guest_id is not null)),
  unique (trip_id, profile_id),
  unique (trip_id, guest_id)
);
create index trip_members_trip_idx on trip_members (trip_id);
create index trip_members_profile_idx on trip_members (profile_id);
```

> **Trip members need not be crew members** (people join by link). See §7 for how their ledger entries stay visible to them.

```sql
create table trip_expenses (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid not null references trips(id) on delete cascade,
  description  text not null,
  amount_cents integer not null check (amount_cents > 0),
  paid_by      uuid not null references trip_members(id) on delete restrict,
  room_id      uuid references rooms(id) on delete set null,  -- set when auto-generated from a room
  receipt_url  text,
  created_at   timestamptz default now()
);
create index trip_expenses_trip_idx on trip_expenses (trip_id);

create table trip_expense_shares (
  expense_id     uuid references trip_expenses(id) on delete cascade,
  trip_member_id uuid references trip_members(id) on delete cascade,
  amount_cents   integer not null check (amount_cents >= 0),
  primary key (expense_id, trip_member_id)
);
create index trip_expense_shares_member_idx on trip_expense_shares (trip_member_id);
```

> **Expenses reference `trip_members.id`, not `profiles.id`** — so guests can pay and be charged. **Invariant:** `sum(shares.amount_cents) = expense.amount_cents`, enforced by a deferred constraint trigger. Even splits distribute remainder cents to the first N members ordered by `trip_members.id` so the total is always exact and the result is deterministic.
>
> **Room costs auto-generate an expense**: on room assignment change, upsert a `trip_expenses` row with `room_id` set, `amount_cents = rooms.cost_cents`, `paid_by = rooms.paid_by`, and shares split evenly across current occupants.

## 6. Rounds & scores

```sql
create table rounds (
  id                  uuid primary key default gen_random_uuid(),
  crew_id             uuid references crews(id) on delete cascade,
  trip_id             uuid references trips(id) on delete cascade,
  course_id           uuid not null references courses(id),
  tee_id              uuid references tees(id),
  name                text,
  scheduled_at        timestamptz not null,
  timezone            text not null,              -- IANA
  hole_count          int not null default 18 check (hole_count in (9,18)),
  nine                text check (nine in ('front','back')),  -- which nine, when hole_count = 9
  status              round_status not null default 'scheduled',
  visibility          round_visibility not null default 'crew',
  max_players         int default 4,
  booking_provider    text,
  booking_external_id text,
  booking_url         text,
  booking_status      text,
  created_by          uuid references profiles(id) on delete set null,
  completed_at        timestamptz,
  created_at          timestamptz default now(),
  check (crew_id is not null or trip_id is not null)
);
create index rounds_crew_idx on rounds (crew_id, scheduled_at desc);
create index rounds_trip_idx on rounds (trip_id);

create table round_players (
  id               uuid primary key default gen_random_uuid(),
  round_id         uuid not null references rounds(id) on delete cascade,
  profile_id       uuid references profiles(id) on delete cascade,
  guest_id         uuid references crew_guests(id) on delete cascade,
  rsvp             rsvp_status not null default 'invited',
  playing_handicap int,                              -- see Technical Spec §5.1
  tee_id           uuid references tees(id),
  position         int,
  created_at       timestamptz default now(),
  check ((profile_id is not null) <> (guest_id is not null)),
  unique (round_id, profile_id),
  unique (round_id, guest_id)
);
create index round_players_round_idx on round_players (round_id);
create index round_players_profile_idx on round_players (profile_id);
create index round_players_guest_idx on round_players (guest_id);
```

> **`round_players.id` is the scoring identity everywhere.** Scores and game results reference it, never `profiles.id`. Guests are first-class. The two partial-unique constraints prevent both duplicate members and duplicate guests in one round (NULLs are distinct in Postgres, so a single `unique(round_id, profile_id)` would not have caught duplicate guests).

```sql
create table scores (
  id              uuid primary key default gen_random_uuid(),
  round_player_id uuid not null references round_players(id) on delete cascade,
  hole_number     int not null check (hole_number between 1 and 18),
  strokes         int check (strokes between 1 and 20),   -- null = did not complete
  putts           int,
  penalties       int,
  version         bigint not null default 1,              -- server-assigned, monotonic
  client_id       uuid not null,
  client_updated_at timestamptz not null,
  updated_by      uuid references profiles(id) on delete set null,
  updated_at      timestamptz default now(),
  unique (round_player_id, hole_number)
);
create index scores_player_idx on scores (round_player_id);
```

> **`round_id` is deliberately absent.** The round is derivable through `round_players`, and a denormalized client-supplied `round_id` is spoofable — an attacker can pass a `round_id` they *can* write to while targeting a `round_player_id` they cannot. Query round scores via the join.

### 6.1 Offline sync contract

Conflict resolution is **server-assigned version, not client clock.** Phone clocks drift — a device set five hours fast would otherwise write a row no later write could ever beat.

```sql
create or replace function public.upsert_score(
  p_round_player_id uuid, p_hole_number int,
  p_strokes int, p_putts int, p_penalties int,
  p_client_id uuid, p_client_updated_at timestamptz,
  p_base_version bigint          -- version the client last saw; 0 for a new row
) returns scores language plpgsql security invoker as $$
declare result scores;
begin
  insert into scores (round_player_id, hole_number, strokes, putts, penalties,
                      version, client_id, client_updated_at, updated_by)
  values (p_round_player_id, p_hole_number, p_strokes, p_putts, p_penalties,
          1, p_client_id, least(p_client_updated_at, now()), auth.uid())
  on conflict (round_player_id, hole_number) do update
    set strokes = excluded.strokes,
        putts = excluded.putts,
        penalties = excluded.penalties,
        version = scores.version + 1,
        client_id = excluded.client_id,
        client_updated_at = excluded.client_updated_at,
        updated_by = excluded.updated_by,
        updated_at = now()
    where scores.version <= p_base_version
  returning * into result;

  if result is null then
    -- Lost the race. Return the current row so the client can reconcile
    -- rather than silently believing its write landed.
    select * into result from scores
      where round_player_id = p_round_player_id and hole_number = p_hole_number;
  end if;
  return result;
end $$;
```

**Three rules the client must honor:**

1. **Always send the complete row** (`strokes`, `putts`, `penalties`), merged from the last known server state. The `DO UPDATE` overwrites all three; sending a partial row wipes fields another device set.
2. **Always inspect the return value.** If `returned.version <> expected`, the write lost — reconcile local state to the returned row and surface it. Never treat a 2xx as "my write landed"; the conflict path is a no-op that returns success.
3. `client_updated_at` is clamped server-side to `now()` and used only for display and audit, never for conflict resolution.

## 7. Games & ledger

```sql
create table games (
  id          uuid primary key default gen_random_uuid(),
  round_id    uuid references rounds(id) on delete cascade,
  trip_id     uuid references trips(id) on delete cascade,
  type        game_type not null,
  name        text,
  config      jsonb not null,      -- SOLE source of truth for stake and options; zod-validated
  created_by  uuid references profiles(id) on delete set null,
  computed_at timestamptz,
  created_at  timestamptz default now(),
  check (round_id is not null or trip_id is not null)
);
create index games_round_idx on games (round_id);
create index games_trip_idx on games (trip_id);
```

> **`stake_cents` lives only inside `config`.** An earlier draft duplicated it as a column; two sources of truth for a money value is a bug waiting to happen.

```sql
create table game_participants (
  game_id         uuid references games(id) on delete cascade,
  round_player_id uuid references round_players(id) on delete cascade,
  team_id         text,
  primary key (game_id, round_player_id)
);
create index game_participants_player_idx on game_participants (round_player_id);

create table game_results (
  id              uuid primary key default gen_random_uuid(),
  game_id         uuid not null references games(id) on delete cascade,
  round_player_id uuid not null references round_players(id) on delete cascade,
  amount_cents    integer not null,     -- signed; MUST sum to 0 per game
  breakdown       jsonb not null,       -- this player's slice of the narrative
  computed_at     timestamptz default now(),
  unique (game_id, round_player_id)
);
create index game_results_game_idx on game_results (game_id);
create index game_results_player_idx on game_results (round_player_id);
```

**Sum-to-zero is enforced in the database, not only in an edge function** — an anon-key client could otherwise insert directly and bypass it:

```sql
create or replace function public.assert_game_results_balance() returns trigger
language plpgsql as $$
declare total integer;
begin
  select coalesce(sum(amount_cents),0) into total
    from game_results where game_id = coalesce(new.game_id, old.game_id);
  if total <> 0 then
    raise exception 'game_results for game % sum to % cents, must be 0',
      coalesce(new.game_id, old.game_id), total;
  end if;
  return null;
end $$;

create constraint trigger game_results_balance
  after insert or update or delete on game_results
  deferrable initially deferred
  for each row execute function public.assert_game_results_balance();
```

Writes happen inside a transaction; the check fires at commit, so a multi-row insert is validated as a set.

### 7.1 Ledger

```sql
create table ledger_entries (
  id           uuid primary key default gen_random_uuid(),
  crew_id      uuid not null references crews(id) on delete cascade,
  trip_id      uuid references trips(id) on delete cascade,   -- set for trip-sourced entries
  from_profile uuid not null references profiles(id) on delete restrict,  -- debtor
  to_profile   uuid not null references profiles(id) on delete restrict,  -- creditor
  amount_cents integer not null check (amount_cents > 0),
  source_type  ledger_source not null,
  source_id    uuid,
  note         text,
  status       ledger_status not null default 'open',
  batch_id     uuid,                                          -- FK added in §12
  created_at   timestamptz default now(),
  check (from_profile <> to_profile)
);
create index ledger_crew_status_idx on ledger_entries (crew_id, status);
create index ledger_from_idx on ledger_entries (from_profile, status);
create index ledger_to_idx on ledger_entries (to_profile, status);
create index ledger_batch_idx on ledger_entries (batch_id);
create index ledger_trip_idx on ledger_entries (trip_id);
```

**Immutability trigger:** only `status` and `batch_id` may be updated. Everything else raises. Corrections are new `source_type = 'adjustment'` entries.

### 7.2 The game-results → ledger algorithm (`@halve/ledger`)

This conversion was previously unspecified and is the most likely place to silently invent behavior. It is now fixed:

1. **Resolve identities.** Map every `round_player_id` to a settling profile: a member resolves to themselves; a guest resolves to `crew_guests.vouched_by`.
2. **Aggregate by profile.** Sum signed amounts per resolved profile. A guest and their voucher in the same game collapse into one net position — this is what prevents the `from_profile = to_profile` constraint violation that a naive per-player write produces.
3. **Drop zeroes.** Any profile netting to 0 is omitted.
4. **Decompose deterministically.** Split into debtors (negative) and creditors (positive), sort each **descending by absolute amount, then by `profile_id` ascending** as a tiebreak, and greedily match largest debtor against largest creditor until both lists are exhausted. This is deterministic, produces the minimum number of pairwise entries, and is reproducible for audit.
5. **Write** one `ledger_entries` row per pair, with `source_type='game'`, `source_id=game.id`, and `trip_id` when the round belongs to a trip.

**Property tests:** total debited equals total credited; no self-entries; output is byte-identical across runs for identical input; a guest whose only counterparty is their voucher produces zero rows.

### 7.3 Settlement

Debt simplification produces payments between people who may share **no direct ledger entry** (A owes B, B owes C → A pays C). A single pairwise settlement row cannot express that, so settlements are batched.

```sql
create table settlement_batches (
  id           uuid primary key default gen_random_uuid(),
  crew_id      uuid not null references crews(id) on delete cascade,
  trip_id      uuid references trips(id) on delete cascade,
  created_by   uuid not null references profiles(id) on delete restrict,
  status       settle_status not null default 'draft',
  created_at   timestamptz default now(),
  closed_at    timestamptz
);
create index settlement_batches_crew_idx on settlement_batches (crew_id, status);

create table settlements (
  id           uuid primary key default gen_random_uuid(),
  batch_id     uuid not null references settlement_batches(id) on delete cascade,
  from_profile uuid not null references profiles(id) on delete restrict,
  to_profile   uuid not null references profiles(id) on delete restrict,
  amount_cents integer not null check (amount_cents > 0),
  method       settle_method,
  status       settle_status not null default 'requested',
  external_ref text,                       -- reserved; v1 never holds funds
  confirmed_by uuid references profiles(id) on delete set null,
  created_at   timestamptz default now(),
  confirmed_at timestamptz,
  check (from_profile <> to_profile)
);
create index settlements_batch_idx on settlements (batch_id);
create index settlements_from_idx on settlements (from_profile, status);
create index settlements_to_idx on settlements (to_profile, status);
```

**Closure rule:** ledger entries are stamped with `batch_id` when the batch is created and move to `status='settled'` **only when every settlement in the batch is `confirmed`.** Partial confirmation leaves them `open` with a visible pending state. Cancelling a batch clears `batch_id` and returns entries to `open`. This prevents an entry being marked settled by a payment between two other people.

**Halve never custodies funds.** `method` records how the user paid outside the app; `external_ref` is reserved for a future licensed provider.

### 7.4 Balances view

```sql
create view crew_balances with (security_invoker = true) as
select crew_id, profile_id, sum(net) as net_cents from (
  select crew_id, to_profile   as profile_id,  amount_cents as net from ledger_entries where status = 'open'
  union all
  select crew_id, from_profile as profile_id, -amount_cents as net from ledger_entries where status = 'open'
) t group by crew_id, profile_id;
```

> **`security_invoker = true` is load-bearing.** Without it the view runs as its owner (`postgres`) and bypasses RLS entirely — a non-member reads every crew's balances while the underlying table correctly returns zero rows. **Every view in this schema must be `security_invoker`, and the RLS test suite must cover views, not just tables.**

## 8. Social

```sql
create table feed_items (
  id           uuid primary key default gen_random_uuid(),
  crew_id      uuid not null references crews(id) on delete cascade,
  actor_id     uuid references profiles(id) on delete set null,
  type         text not null,
  subject_type text, subject_id uuid,
  payload      jsonb not null default '{}',
  created_at   timestamptz default now()
);
create index feed_items_crew_idx on feed_items (crew_id, created_at desc);

create table reactions (
  feed_item_id uuid references feed_items(id) on delete cascade,
  profile_id   uuid references profiles(id) on delete cascade,
  emoji        text not null,
  primary key (feed_item_id, profile_id, emoji)
);

create table messages (
  id        uuid primary key default gen_random_uuid(),
  round_id  uuid references rounds(id) on delete cascade,
  trip_id   uuid references trips(id) on delete cascade,
  crew_id   uuid references crews(id) on delete cascade,
  author_id uuid references profiles(id) on delete set null,
  body      text not null,
  created_at timestamptz default now(),
  check (num_nonnulls(round_id, trip_id, crew_id) = 1)
);
create index messages_round_idx on messages (round_id, created_at desc);
create index messages_trip_idx  on messages (trip_id, created_at desc);
create index messages_crew_idx  on messages (crew_id, created_at desc);
```

## 9. RLS

Enable on **every** table. Helper functions are `security definer` with `set search_path = public`.

```sql
create or replace function public.is_crew_member(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from crew_members where crew_id = target and profile_id = auth.uid());
$$;

create or replace function public.is_crew_admin(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from crew_members
                 where crew_id = target and profile_id = auth.uid() and role in ('owner','admin'));
$$;

create or replace function public.is_trip_member(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from trip_members where trip_id = target and profile_id = auth.uid());
$$;

-- Trip admin = trip creator, or an admin of the owning crew.
create or replace function public.is_trip_admin(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from trips t
    where t.id = target and (t.created_by = auth.uid() or public.is_crew_admin(t.crew_id))
  );
$$;
```

Representative policies:

```sql
create policy "members read crew" on crews
  for select using (is_crew_member(id));

create policy "read rounds" on rounds for select using (
  (crew_id is not null and is_crew_member(crew_id))
  or (trip_id is not null and is_trip_member(trip_id))
);

-- Handles trip-only rounds, which a crew-only policy would make unwritable.
create policy "write rounds" on rounds for all using (
  (crew_id is not null and is_crew_admin(crew_id))
  or (trip_id is not null and is_trip_admin(trip_id))
) with check (
  (crew_id is not null and is_crew_admin(crew_id))
  or (trip_id is not null and is_trip_admin(trip_id))
);

-- Resolves the round through round_players; never trusts a client-supplied round_id.
create policy "players write scores" on scores for all using (
  exists (
    select 1 from round_players rp join rounds r on r.id = rp.round_id
    where rp.id = scores.round_player_id
      and (is_crew_member(r.crew_id) or is_trip_member(r.trip_id))
  )
) with check (
  exists (
    select 1 from round_players rp join rounds r on r.id = rp.round_id
    where rp.id = scores.round_player_id
      and (is_crew_member(r.crew_id) or is_trip_member(r.trip_id))
  )
);

-- Ledger: crew members see the crew's ledger; trip participants who are not crew
-- members still see entries that involve them personally.
create policy "read ledger" on ledger_entries for select using (
  is_crew_member(crew_id)
  or from_profile = auth.uid()
  or to_profile = auth.uid()
);

create policy "read game results" on game_results for select using (
  exists (
    select 1 from games g left join rounds r on r.id = g.round_id
    where g.id = game_results.game_id
      and (is_crew_member(r.crew_id) or is_trip_member(coalesce(r.trip_id, g.trip_id)))
  )
);
```

**`game_results` and `settlements` both need explicit policies** — they were missing in the first draft and are money tables.

### Friend-of-friend visibility

Two hops, defined **once**: reachable = members of my crews, plus members of *their* other crews, plus my explicit friends. The function returns a narrowed row including the vouching edge — `returns setof rounds` would leak every column to non-members and gives the UI no way to render the connection.

```sql
create type open_seat as (
  round_id uuid, course_name text, scheduled_at timestamptz, timezone text,
  open_seats int, host_crew_name text, vouch_profile_id uuid, vouch_display_name text
);

create or replace function public.visible_open_seats()
returns setof open_seat language sql stable security definer set search_path = public as $$
  with my_crews as (
    select crew_id from crew_members where profile_id = auth.uid()
  ),
  reachable as (
    -- hop 1: people in my crews
    select cm.profile_id from crew_members cm join my_crews mc using (crew_id)
    union
    -- hop 2: other crews those people belong to
    select cm2.profile_id from crew_members cm2
      where cm2.crew_id in (
        select cm3.crew_id from crew_members cm3
        where cm3.profile_id in (select cm.profile_id from crew_members cm join my_crews mc using (crew_id))
      )
    union
    -- explicit friends
    select friend_id from friendships where profile_id = auth.uid()
  )
  select r.id, c.name, r.scheduled_at, r.timezone,
         r.max_players - (select count(*) from round_players rp where rp.round_id = r.id and rp.rsvp = 'in'),
         cr.name, p.id, p.display_name
  from rounds r
  join courses c on c.id = r.course_id
  join crews cr on cr.id = r.crew_id
  join profiles p on p.id = r.created_by
  where r.visibility = 'friends_of_friends'
    and r.status = 'scheduled'
    and r.scheduled_at > now()
    and r.crew_id not in (select crew_id from my_crews)
    and r.created_by in (select profile_id from reachable)
    and r.max_players > (select count(*) from round_players rp where rp.round_id = r.id and rp.rsvp = 'in');
$$;
```

## 10. Account deletion

App Store requires in-app account deletion. `profiles.id` cascades from `auth.users`, but ledger and settlement rows use `on delete restrict` — a user with one ledger entry could otherwise never be deleted. **Deletion is a tombstone, not a hard delete:**

1. Set `profiles.deleted_at`, blank `display_name` to "Deleted golfer", null the avatar, phone hash, and handicap; **release the handle** (rename to `deleted_<short-uuid>`).
2. Delete `devices` rows, revoke sessions.
3. Financial history is retained — a deleted user's ledger entries still balance for everyone else. Historical rows referencing them display the tombstoned name.
4. Cascading or nulling the identity out of a ledger entry would break sum-to-zero for the counterparty. Do not do it.

All *non-financial* creator references (`crews.created_by`, `rounds.created_by`, `games.created_by`, `trips.created_by`, `feed_items.actor_id`, `messages.author_id`, `rooms.paid_by`) use `on delete set null` so a hard delete stays possible if legal requirements ever demand it.

## 11. Index checklist

Every FK used in an RLS policy or a hot query is indexed above. Confirm at migration review: `crew_members(profile_id)`, `round_players(round_id/profile_id/guest_id)`, `scores(round_player_id)`, `games(round_id/trip_id)`, `game_results(game_id/round_player_id)`, `ledger_entries(crew_id,status | from | to | batch_id | trip_id)`, `settlements(batch_id/from/to)`, `trip_members(trip_id/profile_id)`, `trip_expenses(trip_id)`, `trip_expense_shares(trip_member_id)`, `rooms(trip_id)`, `messages(round_id/trip_id/crew_id)`, `feed_items(crew_id, created_at desc)`, `devices(profile_id)`, `friendships(friend_id)`.

Under RLS, a missing index turns into a sequential scan with a `security definer` function called per row.

## 12. Cross-cycle foreign keys

Added at the end of `0001_init.sql`, after all tables exist:

```sql
alter table ledger_entries
  add constraint ledger_batch_fk
  foreign key (batch_id) references settlement_batches(id) on delete set null;
```

## 13. Seed data

`supabase/seed.sql` must create: 3 courses with full tee/hole data including stroke indexes (one 9-hole), 2 crews, 6 profiles, 2 crew guests, 1 completed round with full scores and a settled Nassau, 1 upcoming round with an open seat marked `friends_of_friends`, 1 trip in `planning` with rooms, members, and expenses. `supabase db reset` must leave every screen in the app populated.

## 14. Migration order

`courses → tees → holes → profiles → devices → friendships → crews → crew_members → crew_guests → trips → rooms → trip_members → trip_expenses → trip_expense_shares → rounds → round_players → scores → games → game_participants → game_results → settlement_batches → settlements → ledger_entries → views → functions → triggers → ALTER TABLE cross-cycle FKs → RLS policies`

**Do not deviate.** Postgres does not defer FK targets; the earlier draft of this document listed tables in a logical order that would not execute.
