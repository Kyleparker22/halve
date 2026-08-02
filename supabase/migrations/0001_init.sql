-- Halve — initial schema
-- Implements docs/03 Data Model.md in full.
-- Table order is the migration order from §14 and must not be reordered:
--   courses → tees → holes → profiles → devices → friendships → crews → crew_members
--   → crew_guests → trips → rooms → trip_members → trip_expenses → trip_expense_shares
--   → rounds → round_players → scores → games → game_participants → game_results
--   → settlement_batches → settlements → ledger_entries → views → functions → triggers
--   → cross-cycle FKs.
-- RLS lives in 0002_rls.sql.

-- ---------------------------------------------------------------------------
-- §1 Enums
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- §2 Courses
-- ---------------------------------------------------------------------------

create table courses (
  id           uuid primary key default gen_random_uuid(),
  source       text not null,                         -- 'golfcourseapi' | 'golfapi' | 'manual'
  external_id  text,
  name         text not null,
  club_name    text,
  city text, state text, country text,
  lat numeric(9,6), lng numeric(9,6),
  hole_count   int not null default 18,
  needs_review boolean not null default false,        -- provider omitted stroke index
  raw          jsonb,
  created_at   timestamptz default now(),
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
  rating    numeric(4,1),
  slope     int check (slope between 55 and 155),
  created_at timestamptz default now(),
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

-- ---------------------------------------------------------------------------
-- §3 Identity
-- ---------------------------------------------------------------------------

create table profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  handle          text unique not null check (handle ~ '^[a-z0-9_]{3,20}$'),
  display_name    text not null,
  avatar_url      text,
  phone_hash      text,                     -- sha256 of E.164, hashed client-side
  home_course_id  uuid references courses(id) on delete set null,
  handicap_index  numeric(4,1),             -- self-reported, unofficial
  handicap_source handicap_source default 'self',
  deleted_at      timestamptz,              -- tombstone; see §10
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create index profiles_phone_hash_idx on profiles (phone_hash);

create table devices (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references profiles(id) on delete cascade,
  push_token   text not null unique,
  platform     text not null check (platform in ('ios','android')),
  last_seen_at timestamptz default now(),
  created_at   timestamptz default now()
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

-- ---------------------------------------------------------------------------
-- §4 Crews & guests
-- ---------------------------------------------------------------------------

create table crews (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  avatar_url  text,
  invite_code text unique not null,                   -- nanoid(10)
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

-- Guests are crew-scoped and persistent, so a recurring guest keeps continuity
-- across rounds, trips and the season ledger. Their money resolves to vouched_by.
create table crew_guests (
  id         uuid primary key default gen_random_uuid(),
  crew_id    uuid not null references crews(id) on delete cascade,
  name       text not null,
  vouched_by uuid not null references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  unique (crew_id, name)
);
create index crew_guests_crew_idx on crew_guests (crew_id);

-- ---------------------------------------------------------------------------
-- §5 Trips
-- ---------------------------------------------------------------------------

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
  created_at timestamptz default now(),
  check ((profile_id is not null) <> (guest_id is not null)),
  unique (trip_id, profile_id),
  unique (trip_id, guest_id)
);
create index trip_members_trip_idx on trip_members (trip_id);
create index trip_members_profile_idx on trip_members (profile_id);

-- Expenses reference trip_members.id, not profiles.id, so guests can pay and be charged.
create table trip_expenses (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid not null references trips(id) on delete cascade,
  description  text not null,
  amount_cents integer not null check (amount_cents > 0),
  paid_by      uuid not null references trip_members(id) on delete restrict,
  room_id      uuid references rooms(id) on delete set null,   -- set when auto-generated from a room
  receipt_url  text,
  created_at   timestamptz default now(),
  unique (room_id)                                             -- one auto-expense per room
);
create index trip_expenses_trip_idx on trip_expenses (trip_id);

create table trip_expense_shares (
  expense_id     uuid references trip_expenses(id) on delete cascade,
  trip_member_id uuid references trip_members(id) on delete cascade,
  amount_cents   integer not null check (amount_cents >= 0),
  primary key (expense_id, trip_member_id)
);
create index trip_expense_shares_member_idx on trip_expense_shares (trip_member_id);

-- ---------------------------------------------------------------------------
-- §6 Rounds & scores
-- ---------------------------------------------------------------------------

create table rounds (
  id                  uuid primary key default gen_random_uuid(),
  crew_id             uuid references crews(id) on delete cascade,
  trip_id             uuid references trips(id) on delete cascade,
  course_id           uuid not null references courses(id),
  tee_id              uuid references tees(id),
  name                text,
  scheduled_at        timestamptz not null,
  timezone            text not null,                            -- IANA
  hole_count          int not null default 18 check (hole_count in (9,18)),
  nine                text check (nine in ('front','back')),     -- which nine, when hole_count = 9
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

-- round_players.id is the scoring identity everywhere. Never profiles.id.
create table round_players (
  id               uuid primary key default gen_random_uuid(),
  round_id         uuid not null references rounds(id) on delete cascade,
  profile_id       uuid references profiles(id) on delete cascade,
  guest_id         uuid references crew_guests(id) on delete cascade,
  rsvp             rsvp_status not null default 'invited',
  playing_handicap int,                                          -- Technical Spec §5.1
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

-- round_id is deliberately absent: it is derivable through round_players and a
-- client-supplied round_id is spoofable.
create table scores (
  id                uuid primary key default gen_random_uuid(),
  round_player_id   uuid not null references round_players(id) on delete cascade,
  hole_number       int not null check (hole_number between 1 and 18),
  strokes           int check (strokes between 1 and 20),        -- null = did not complete
  putts             int,
  penalties         int,
  version           bigint not null default 1,                   -- server-assigned, monotonic
  client_id         uuid not null,
  client_updated_at timestamptz not null,
  updated_by        uuid references profiles(id) on delete set null,
  updated_at        timestamptz default now(),
  unique (round_player_id, hole_number)
);
create index scores_player_idx on scores (round_player_id);

-- ---------------------------------------------------------------------------
-- §7 Games & ledger
-- ---------------------------------------------------------------------------

-- stake_cents lives only inside config. Two sources of truth for money is a bug.
create table games (
  id          uuid primary key default gen_random_uuid(),
  round_id    uuid references rounds(id) on delete cascade,
  trip_id     uuid references trips(id) on delete cascade,
  type        game_type not null,
  name        text,
  config      jsonb not null,
  created_by  uuid references profiles(id) on delete set null,
  computed_at timestamptz,
  created_at  timestamptz default now(),
  check (round_id is not null or trip_id is not null)
);
create index games_round_idx on games (round_id);
create index games_trip_idx on games (trip_id);

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
  amount_cents    integer not null,      -- signed; MUST sum to 0 per game
  breakdown       jsonb not null,        -- this player's slice of the narrative
  computed_at     timestamptz default now(),
  unique (game_id, round_player_id)
);
create index game_results_game_idx on game_results (game_id);
create index game_results_player_idx on game_results (round_player_id);

create table settlement_batches (
  id         uuid primary key default gen_random_uuid(),
  crew_id    uuid not null references crews(id) on delete cascade,
  trip_id    uuid references trips(id) on delete cascade,
  created_by uuid not null references profiles(id) on delete restrict,
  status     settle_status not null default 'draft',
  created_at timestamptz default now(),
  closed_at  timestamptz
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
  external_ref text,                     -- reserved; v1 never holds funds
  confirmed_by uuid references profiles(id) on delete set null,
  created_at   timestamptz default now(),
  confirmed_at timestamptz,
  check (from_profile <> to_profile)
);
create index settlements_batch_idx on settlements (batch_id);
create index settlements_from_idx on settlements (from_profile, status);
create index settlements_to_idx on settlements (to_profile, status);

-- Immutable: only status and batch_id may ever change (trigger below).
create table ledger_entries (
  id           uuid primary key default gen_random_uuid(),
  crew_id      uuid not null references crews(id) on delete cascade,
  trip_id      uuid references trips(id) on delete cascade,
  from_profile uuid not null references profiles(id) on delete restrict,   -- debtor
  to_profile   uuid not null references profiles(id) on delete restrict,   -- creditor
  amount_cents integer not null check (amount_cents > 0),
  source_type  ledger_source not null,
  source_id    uuid,
  note         text,
  status       ledger_status not null default 'open',
  batch_id     uuid,                                                       -- FK added in §12
  created_at   timestamptz default now(),
  check (from_profile <> to_profile)
);
create index ledger_crew_status_idx on ledger_entries (crew_id, status);
create index ledger_from_idx on ledger_entries (from_profile, status);
create index ledger_to_idx on ledger_entries (to_profile, status);
create index ledger_batch_idx on ledger_entries (batch_id);
create index ledger_trip_idx on ledger_entries (trip_id);

-- ---------------------------------------------------------------------------
-- §8 Social
-- ---------------------------------------------------------------------------

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
  created_at   timestamptz default now(),
  primary key (feed_item_id, profile_id, emoji)
);

create table messages (
  id         uuid primary key default gen_random_uuid(),
  round_id   uuid references rounds(id) on delete cascade,
  trip_id    uuid references trips(id) on delete cascade,
  crew_id    uuid references crews(id) on delete cascade,
  author_id  uuid references profiles(id) on delete set null,
  body       text not null,
  created_at timestamptz default now(),
  check (num_nonnulls(round_id, trip_id, crew_id) = 1)
);
create index messages_round_idx on messages (round_id, created_at desc);
create index messages_trip_idx  on messages (trip_id, created_at desc);
create index messages_crew_idx  on messages (crew_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Views  (§7.4)
-- security_invoker is load-bearing: without it the view runs as postgres and
-- bypasses RLS entirely.
-- ---------------------------------------------------------------------------

create view crew_balances with (security_invoker = true) as
select crew_id, profile_id, sum(net)::bigint as net_cents from (
  select crew_id, to_profile   as profile_id,  amount_cents as net from ledger_entries where status = 'open'
  union all
  select crew_id, from_profile as profile_id, -amount_cents as net from ledger_entries where status = 'open'
) t group by crew_id, profile_id;

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Friendships are stored bidirectionally.
create or replace function public.mirror_friendship() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into friendships (profile_id, friend_id)
  values (new.friend_id, new.profile_id)
  on conflict do nothing;
  return new;
end $$;

create or replace function public.unmirror_friendship() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from friendships where profile_id = old.friend_id and friend_id = old.profile_id;
  return old;
end $$;

-- Profile row on signup. Metadata comes from the client at sign-up time;
-- onboarding overwrites both fields immediately after.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  base_handle text;
  candidate   text;
  suffix      int := 0;
begin
  base_handle := lower(regexp_replace(
    coalesce(new.raw_user_meta_data->>'handle', split_part(coalesce(new.email, 'golfer'), '@', 1)),
    '[^a-z0-9_]', '', 'g'));
  if length(base_handle) < 3 then
    base_handle := 'golfer';
  end if;
  base_handle := left(base_handle, 16);
  candidate := base_handle;
  while exists (select 1 from profiles where handle = candidate) loop
    suffix := suffix + 1;
    candidate := left(base_handle, 16) || suffix::text;
  end loop;

  insert into profiles (id, handle, display_name)
  values (new.id, candidate,
          coalesce(new.raw_user_meta_data->>'display_name', initcap(base_handle)));
  return new;
end $$;

-- §6.1 Offline sync contract. Conflict resolution is by server-assigned version,
-- never by client clock.
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
    -- Lost the race. Return the current row so the client can reconcile rather
    -- than silently believing its write landed.
    select * into result from scores
      where round_player_id = p_round_player_id and hole_number = p_hole_number;
  end if;
  return result;
end $$;

-- Sum-to-zero, enforced in the database. An anon-key client could otherwise
-- insert directly and bypass the edge function.
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

-- Ledger entries are immutable. Only status and batch_id may be updated;
-- corrections are new offsetting entries.
create or replace function public.assert_ledger_immutable() returns trigger
language plpgsql as $$
begin
  if new.id           is distinct from old.id
  or new.crew_id      is distinct from old.crew_id
  or new.trip_id      is distinct from old.trip_id
  or new.from_profile is distinct from old.from_profile
  or new.to_profile   is distinct from old.to_profile
  or new.amount_cents is distinct from old.amount_cents
  or new.source_type  is distinct from old.source_type
  or new.source_id    is distinct from old.source_id
  or new.note         is distinct from old.note
  or new.created_at   is distinct from old.created_at then
    raise exception 'ledger_entries are immutable; only status and batch_id may change '
                    '(write an offsetting adjustment entry instead)';
  end if;
  return new;
end $$;

-- Invariant: sum(shares) = expense.amount_cents. Deferred so a multi-row insert
-- is validated as a set at commit.
create or replace function public.assert_expense_shares_balance() returns trigger
language plpgsql as $$
declare
  v_expense_id uuid := coalesce(new.expense_id, old.expense_id);
  v_amount     integer;
  v_total      integer;
begin
  select amount_cents into v_amount from trip_expenses where id = v_expense_id;
  if v_amount is null then
    return null;   -- expense was deleted in this transaction; shares cascaded
  end if;
  select coalesce(sum(amount_cents),0) into v_total
    from trip_expense_shares where expense_id = v_expense_id;
  if v_total <> v_amount then
    raise exception 'expense % shares sum to % cents, expected %', v_expense_id, v_total, v_amount;
  end if;
  return null;
end $$;

create or replace function public.assert_expense_balanced() returns trigger
language plpgsql as $$
declare v_total integer;
begin
  select coalesce(sum(amount_cents),0) into v_total
    from trip_expense_shares where expense_id = new.id;
  if v_total <> new.amount_cents then
    raise exception 'expense % shares sum to % cents, expected %', new.id, v_total, new.amount_cents;
  end if;
  return null;
end $$;

-- Even split, cent-exact and deterministic: remainder cents go to the first N
-- members ordered by trip_members.id.
create or replace function public.split_expense_evenly(p_expense_id uuid, p_member_ids uuid[])
returns void language plpgsql security invoker as $$
declare
  v_amount integer;
  v_n      int := array_length(p_member_ids, 1);
  v_base   integer;
  v_rem    integer;
  v_ids    uuid[];
  i        int;
begin
  if v_n is null or v_n = 0 then
    raise exception 'cannot split expense % across zero members', p_expense_id;
  end if;
  select amount_cents into strict v_amount from trip_expenses where id = p_expense_id;

  select array_agg(m order by m) into v_ids from unnest(p_member_ids) as m;

  v_base := v_amount / v_n;
  v_rem  := v_amount - (v_base * v_n);

  delete from trip_expense_shares where expense_id = p_expense_id;
  for i in 1 .. v_n loop
    insert into trip_expense_shares (expense_id, trip_member_id, amount_cents)
    values (p_expense_id, v_ids[i], v_base + case when i <= v_rem then 1 else 0 end);
  end loop;
end $$;

-- Room cost auto-generates an expense split across current occupants, re-derived
-- on every room assignment change.
create or replace function public.sync_room_expense(p_room_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_room       rooms;
  v_payer      uuid;
  v_expense_id uuid;
  v_occupants  uuid[];
begin
  select * into v_room from rooms where id = p_room_id;
  if not found then
    return;
  end if;

  select array_agg(id order by id) into v_occupants
    from trip_members where room_id = p_room_id;

  if v_room.cost_cents <= 0 or v_occupants is null then
    delete from trip_expenses where room_id = p_room_id;
    return;
  end if;

  -- Payer must be a trip_member: the person who fronted the room, else an occupant.
  select id into v_payer from trip_members
    where trip_id = v_room.trip_id and profile_id = v_room.paid_by;
  if v_payer is null then
    v_payer := v_occupants[1];
  end if;

  select id into v_expense_id from trip_expenses where room_id = p_room_id;
  if v_expense_id is null then
    insert into trip_expenses (trip_id, description, amount_cents, paid_by, room_id)
    values (v_room.trip_id, v_room.name || ' — lodging', v_room.cost_cents, v_payer, p_room_id)
    returning id into v_expense_id;
  else
    update trip_expenses
      set amount_cents = v_room.cost_cents, paid_by = v_payer,
          description = v_room.name || ' — lodging'
      where id = v_expense_id;
  end if;

  perform public.split_expense_evenly(v_expense_id, v_occupants);
end $$;

create or replace function public.on_room_assignment_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.room_id is not distinct from new.room_id then
    return new;
  end if;
  if tg_op <> 'INSERT' and old.room_id is not null then
    perform public.sync_room_expense(old.room_id);
  end if;
  if tg_op <> 'DELETE' and new.room_id is not null then
    perform public.sync_room_expense(new.room_id);
  end if;
  return coalesce(new, old);
end $$;

create or replace function public.on_room_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.sync_room_expense(new.id);
  return new;
end $$;

-- §10 Account deletion is a tombstone, never a hard delete: ledger rows use
-- on delete restrict and a deleted user's entries must still balance for
-- everyone else.
create or replace function public.delete_account(p_profile_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_id uuid := coalesce(p_profile_id, auth.uid());
begin
  if v_id is null then
    raise exception 'no profile to delete';
  end if;
  if p_profile_id is not null and auth.uid() is not null and p_profile_id <> auth.uid() then
    raise exception 'can only delete your own account';
  end if;

  update profiles set
    deleted_at      = now(),
    display_name    = 'Deleted golfer',
    handle          = 'deleted_' || left(replace(v_id::text, '-', ''), 12),
    avatar_url      = null,
    phone_hash      = null,
    handicap_index  = null,
    home_course_id  = null
  where id = v_id;

  delete from devices where profile_id = v_id;
  delete from friendships where profile_id = v_id or friend_id = v_id;
end $$;

-- §7.3 Settlement. Debt simplification produces payments between people with no
-- direct ledger entry, so settlements are batched and entries close only when
-- every settlement in the batch confirms.
create or replace function public.open_settlement_batch(
  p_crew_id uuid,
  p_trip_id uuid,
  p_payments jsonb           -- [{ "from": uuid, "to": uuid, "amount_cents": int }]
) returns uuid language plpgsql security invoker as $$
declare
  v_batch_id uuid;
  v_payment  jsonb;
begin
  insert into settlement_batches (crew_id, trip_id, created_by, status)
  values (p_crew_id, p_trip_id, auth.uid(), 'requested')
  returning id into v_batch_id;

  for v_payment in select * from jsonb_array_elements(p_payments) loop
    insert into settlements (batch_id, from_profile, to_profile, amount_cents, status)
    values (v_batch_id,
            (v_payment->>'from')::uuid,
            (v_payment->>'to')::uuid,
            (v_payment->>'amount_cents')::int,
            'requested');
  end loop;

  update ledger_entries
     set batch_id = v_batch_id
   where crew_id = p_crew_id
     and status = 'open'
     and batch_id is null
     and (p_trip_id is null or trip_id = p_trip_id);

  return v_batch_id;
end $$;

create or replace function public.confirm_settlement(p_settlement_id uuid, p_method settle_method)
returns void language plpgsql security invoker as $$
declare
  v_batch_id uuid;
  v_open     int;
begin
  update settlements
     set status = 'confirmed', method = p_method,
         confirmed_by = auth.uid(), confirmed_at = now()
   where id = p_settlement_id
   returning batch_id into v_batch_id;

  if v_batch_id is null then
    raise exception 'settlement % not found or not visible', p_settlement_id;
  end if;

  select count(*) into v_open from settlements
    where batch_id = v_batch_id and status <> 'confirmed';

  -- Partial confirmation leaves entries open with a visible pending state.
  if v_open = 0 then
    update settlement_batches set status = 'confirmed', closed_at = now() where id = v_batch_id;
    update ledger_entries set status = 'settled' where batch_id = v_batch_id and status = 'open';
  end if;
end $$;

create or replace function public.cancel_settlement_batch(p_batch_id uuid)
returns void language plpgsql security invoker as $$
begin
  update ledger_entries set batch_id = null where batch_id = p_batch_id and status = 'open';
  update settlements set status = 'cancelled' where batch_id = p_batch_id and status <> 'confirmed';
  update settlement_batches set status = 'cancelled', closed_at = now() where id = p_batch_id;
end $$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create trigger courses_touch  before update on courses
  for each row execute function public.touch_updated_at();
create trigger profiles_touch before update on profiles
  for each row execute function public.touch_updated_at();

create trigger friendships_mirror after insert on friendships
  for each row execute function public.mirror_friendship();
create trigger friendships_unmirror after delete on friendships
  for each row execute function public.unmirror_friendship();

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create constraint trigger game_results_balance
  after insert or update or delete on game_results
  deferrable initially deferred
  for each row execute function public.assert_game_results_balance();

create trigger ledger_entries_immutable before update on ledger_entries
  for each row execute function public.assert_ledger_immutable();

create constraint trigger expense_shares_balance
  after insert or update or delete on trip_expense_shares
  deferrable initially deferred
  for each row execute function public.assert_expense_shares_balance();

create constraint trigger expense_balanced
  after insert or update on trip_expenses
  deferrable initially deferred
  for each row execute function public.assert_expense_balanced();

create trigger trip_members_room_sync after insert or update or delete on trip_members
  for each row execute function public.on_room_assignment_change();

create trigger rooms_cost_sync after update of cost_cents, paid_by, name on rooms
  for each row execute function public.on_room_change();

-- ---------------------------------------------------------------------------
-- §12 Cross-cycle foreign keys — Postgres does not defer FK targets, so these
-- are added after every table exists.
-- ---------------------------------------------------------------------------

alter table ledger_entries
  add constraint ledger_batch_fk
  foreign key (batch_id) references settlement_batches(id) on delete set null;
