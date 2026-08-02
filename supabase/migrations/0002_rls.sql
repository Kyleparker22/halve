-- Halve — Row Level Security
-- docs/03 Data Model.md §9. RLS on every table, no exceptions. A table without a
-- policy is a leak; a view without security_invoker is a bigger one.

-- ---------------------------------------------------------------------------
-- Helper functions. security definer so policies on crew_members do not recurse.
-- ---------------------------------------------------------------------------

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

-- Can I see this round? Crew member, or a member of the trip it belongs to.
create or replace function public.can_read_round(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from rounds r
    where r.id = target
      and (public.is_crew_member(r.crew_id) or public.is_trip_member(r.trip_id))
  );
$$;

create or replace function public.can_admin_round(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from rounds r
    where r.id = target
      and (public.is_crew_admin(r.crew_id) or public.is_trip_admin(r.trip_id) or r.created_by = auth.uid())
  );
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------

alter table courses             enable row level security;
alter table tees                enable row level security;
alter table holes               enable row level security;
alter table profiles            enable row level security;
alter table devices             enable row level security;
alter table friendships         enable row level security;
alter table crews               enable row level security;
alter table crew_members        enable row level security;
alter table crew_guests         enable row level security;
alter table trips               enable row level security;
alter table rooms               enable row level security;
alter table trip_members        enable row level security;
alter table trip_expenses       enable row level security;
alter table trip_expense_shares enable row level security;
alter table rounds              enable row level security;
alter table round_players       enable row level security;
alter table scores              enable row level security;
alter table games               enable row level security;
alter table game_participants   enable row level security;
alter table game_results        enable row level security;
alter table settlement_batches  enable row level security;
alter table settlements         enable row level security;
alter table ledger_entries      enable row level security;
alter table feed_items          enable row level security;
alter table reactions           enable row level security;
alter table messages            enable row level security;

-- ---------------------------------------------------------------------------
-- Course catalogue: readable by any signed-in user, written only by the service
-- role (which bypasses RLS). No write policy is deliberate.
-- ---------------------------------------------------------------------------

create policy "read courses" on courses for select to authenticated using (true);
create policy "read tees"    on tees    for select to authenticated using (true);
create policy "read holes"   on holes   for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

create policy "read profiles"   on profiles for select to authenticated using (true);
create policy "insert own profile" on profiles for insert to authenticated
  with check (id = auth.uid());
create policy "update own profile" on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "own devices" on devices for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy "read own friendships" on friendships for select to authenticated
  using (profile_id = auth.uid() or friend_id = auth.uid());
create policy "write own friendships" on friendships for insert to authenticated
  with check (profile_id = auth.uid());
create policy "delete own friendships" on friendships for delete to authenticated
  using (profile_id = auth.uid() or friend_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Crews
-- ---------------------------------------------------------------------------

create policy "members read crew" on crews for select to authenticated
  using (is_crew_member(id));
create policy "create crew" on crews for insert to authenticated
  with check (created_by = auth.uid());
create policy "admins update crew" on crews for update to authenticated
  using (is_crew_admin(id)) with check (is_crew_admin(id));
create policy "admins delete crew" on crews for delete to authenticated
  using (is_crew_admin(id));

create policy "members read roster" on crew_members for select to authenticated
  using (is_crew_member(crew_id));
-- Bootstrap: the creator inserts their own owner row. Everyone else joins via
-- join_crew_by_code(), which is security definer.
create policy "admins add members" on crew_members for insert to authenticated
  with check (profile_id = auth.uid() or is_crew_admin(crew_id));
create policy "admins update members" on crew_members for update to authenticated
  using (is_crew_admin(crew_id)) with check (is_crew_admin(crew_id));
create policy "leave or remove" on crew_members for delete to authenticated
  using (profile_id = auth.uid() or is_crew_admin(crew_id));

create policy "members read guests" on crew_guests for select to authenticated
  using (is_crew_member(crew_id));
create policy "members write guests" on crew_guests for all to authenticated
  using (is_crew_member(crew_id)) with check (is_crew_member(crew_id));

-- ---------------------------------------------------------------------------
-- Trips. Trip members need not be crew members — people join by link.
-- ---------------------------------------------------------------------------

create policy "read trips" on trips for select to authenticated
  using (is_trip_member(id) or is_crew_member(crew_id));
create policy "create trip" on trips for insert to authenticated
  with check (is_crew_member(crew_id) and created_by = auth.uid());
create policy "update trip" on trips for update to authenticated
  using (is_trip_admin(id)) with check (is_trip_admin(id));
create policy "delete trip" on trips for delete to authenticated
  using (is_trip_admin(id));

create policy "read rooms" on rooms for select to authenticated
  using (is_trip_member(trip_id) or is_crew_member((select crew_id from trips where id = trip_id)));
create policy "write rooms" on rooms for all to authenticated
  using (is_trip_admin(trip_id)) with check (is_trip_admin(trip_id));

create policy "read trip members" on trip_members for select to authenticated
  using (is_trip_member(trip_id) or is_crew_member((select crew_id from trips where id = trip_id)));
create policy "add trip members" on trip_members for insert to authenticated
  with check (is_trip_admin(trip_id) or profile_id = auth.uid());
create policy "update trip members" on trip_members for update to authenticated
  using (is_trip_admin(trip_id) or profile_id = auth.uid())
  with check (is_trip_admin(trip_id) or profile_id = auth.uid());
create policy "remove trip members" on trip_members for delete to authenticated
  using (is_trip_admin(trip_id) or profile_id = auth.uid());

create policy "read trip expenses" on trip_expenses for select to authenticated
  using (is_trip_member(trip_id));
create policy "write trip expenses" on trip_expenses for all to authenticated
  using (is_trip_member(trip_id)) with check (is_trip_member(trip_id));

create policy "read expense shares" on trip_expense_shares for select to authenticated
  using (is_trip_member((select trip_id from trip_expenses where id = expense_id)));
create policy "write expense shares" on trip_expense_shares for all to authenticated
  using (is_trip_member((select trip_id from trip_expenses where id = expense_id)))
  with check (is_trip_member((select trip_id from trip_expenses where id = expense_id)));

-- ---------------------------------------------------------------------------
-- Rounds & scores
-- ---------------------------------------------------------------------------

create policy "read rounds" on rounds for select to authenticated using (
  (crew_id is not null and is_crew_member(crew_id))
  or (trip_id is not null and is_trip_member(trip_id))
);

-- Handles trip-only rounds, which a crew-only policy would make unwritable.
create policy "write rounds" on rounds for all to authenticated using (
  (crew_id is not null and is_crew_admin(crew_id))
  or (trip_id is not null and is_trip_admin(trip_id))
) with check (
  (crew_id is not null and is_crew_admin(crew_id))
  or (trip_id is not null and is_trip_admin(trip_id))
);

create policy "read round players" on round_players for select to authenticated
  using (can_read_round(round_id));
create policy "manage round players" on round_players for insert to authenticated
  with check (can_admin_round(round_id) or profile_id = auth.uid());
-- Any participant may edit the roster row (RSVP, tee, handicap) — someone always
-- keeps the card for the group.
create policy "update round players" on round_players for update to authenticated
  using (can_read_round(round_id)) with check (can_read_round(round_id));
create policy "delete round players" on round_players for delete to authenticated
  using (can_admin_round(round_id) or profile_id = auth.uid());

-- Resolves the round through round_players; never trusts a client-supplied round_id.
create policy "players write scores" on scores for all to authenticated using (
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

-- ---------------------------------------------------------------------------
-- Games. game_results and settlements are money tables and need explicit policies.
-- ---------------------------------------------------------------------------

create policy "read games" on games for select to authenticated using (
  (round_id is not null and can_read_round(round_id))
  or (trip_id is not null and is_trip_member(trip_id))
);
create policy "write games" on games for all to authenticated using (
  (round_id is not null and can_read_round(round_id))
  or (trip_id is not null and is_trip_member(trip_id))
) with check (
  (round_id is not null and can_read_round(round_id))
  or (trip_id is not null and is_trip_member(trip_id))
);

create policy "read game participants" on game_participants for select to authenticated
  using (exists (select 1 from games g where g.id = game_id
                 and ((g.round_id is not null and can_read_round(g.round_id))
                      or (g.trip_id is not null and is_trip_member(g.trip_id)))));
create policy "write game participants" on game_participants for all to authenticated
  using (exists (select 1 from games g where g.id = game_id
                 and ((g.round_id is not null and can_read_round(g.round_id))
                      or (g.trip_id is not null and is_trip_member(g.trip_id)))))
  with check (exists (select 1 from games g where g.id = game_id
                 and ((g.round_id is not null and can_read_round(g.round_id))
                      or (g.trip_id is not null and is_trip_member(g.trip_id)))));

create policy "read game results" on game_results for select to authenticated using (
  exists (
    select 1 from games g left join rounds r on r.id = g.round_id
    where g.id = game_results.game_id
      and (is_crew_member(r.crew_id) or is_trip_member(coalesce(r.trip_id, g.trip_id)))
  )
);
-- Participants may write results (the client computes them offline), and the
-- sum-to-zero constraint trigger is what actually keeps them honest.
create policy "write game results" on game_results for all to authenticated using (
  exists (
    select 1 from games g left join rounds r on r.id = g.round_id
    where g.id = game_results.game_id
      and (is_crew_member(r.crew_id) or is_trip_member(coalesce(r.trip_id, g.trip_id)))
  )
) with check (
  exists (
    select 1 from games g left join rounds r on r.id = g.round_id
    where g.id = game_results.game_id
      and (is_crew_member(r.crew_id) or is_trip_member(coalesce(r.trip_id, g.trip_id)))
  )
);

-- ---------------------------------------------------------------------------
-- Ledger & settlement
-- ---------------------------------------------------------------------------

-- Crew members see the crew ledger; trip participants who are not crew members
-- still see entries that involve them personally.
create policy "read ledger" on ledger_entries for select to authenticated using (
  is_crew_member(crew_id)
  or from_profile = auth.uid()
  or to_profile = auth.uid()
);
create policy "write ledger" on ledger_entries for insert to authenticated
  with check (is_crew_member(crew_id));
-- The immutability trigger restricts *what* may change; this restricts *who*.
create policy "update ledger status" on ledger_entries for update to authenticated
  using (is_crew_member(crew_id) or from_profile = auth.uid() or to_profile = auth.uid())
  with check (is_crew_member(crew_id) or from_profile = auth.uid() or to_profile = auth.uid());

create policy "read batches" on settlement_batches for select to authenticated
  using (is_crew_member(crew_id) or created_by = auth.uid());
create policy "write batches" on settlement_batches for all to authenticated
  using (is_crew_member(crew_id)) with check (is_crew_member(crew_id));

create policy "read settlements" on settlements for select to authenticated using (
  from_profile = auth.uid() or to_profile = auth.uid()
  or exists (select 1 from settlement_batches b
             where b.id = batch_id and is_crew_member(b.crew_id))
);
create policy "write settlements" on settlements for insert to authenticated with check (
  exists (select 1 from settlement_batches b where b.id = batch_id and is_crew_member(b.crew_id))
);
-- Either party may confirm.
create policy "confirm settlements" on settlements for update to authenticated using (
  from_profile = auth.uid() or to_profile = auth.uid()
  or exists (select 1 from settlement_batches b
             where b.id = batch_id and is_crew_member(b.crew_id))
) with check (
  from_profile = auth.uid() or to_profile = auth.uid()
  or exists (select 1 from settlement_batches b
             where b.id = batch_id and is_crew_member(b.crew_id))
);

-- ---------------------------------------------------------------------------
-- Social — everything is crew-scoped. No public feed.
-- ---------------------------------------------------------------------------

create policy "read feed" on feed_items for select to authenticated
  using (is_crew_member(crew_id));
create policy "write feed" on feed_items for insert to authenticated
  with check (is_crew_member(crew_id) and actor_id = auth.uid());

create policy "read reactions" on reactions for select to authenticated
  using (exists (select 1 from feed_items f where f.id = feed_item_id and is_crew_member(f.crew_id)));
create policy "write own reactions" on reactions for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid()
              and exists (select 1 from feed_items f where f.id = feed_item_id and is_crew_member(f.crew_id)));

create policy "read messages" on messages for select to authenticated using (
  (crew_id  is not null and is_crew_member(crew_id))
  or (round_id is not null and can_read_round(round_id))
  or (trip_id  is not null and is_trip_member(trip_id))
);
create policy "send messages" on messages for insert to authenticated with check (
  author_id = auth.uid() and (
    (crew_id  is not null and is_crew_member(crew_id))
    or (round_id is not null and can_read_round(round_id))
    or (trip_id  is not null and is_trip_member(trip_id))
  )
);
create policy "delete own messages" on messages for delete to authenticated
  using (author_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Joining by invite code. The client must never be able to enumerate crews, so
-- the lookup is a security definer function, not a select policy on invite_code.
-- ---------------------------------------------------------------------------

create or replace function public.join_crew_by_code(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_crew_id uuid;
begin
  if auth.uid() is null then
    raise exception 'must be signed in to join a crew';
  end if;
  select id into v_crew_id from crews where invite_code = p_code;
  if v_crew_id is null then
    raise exception 'invite code not found';
  end if;
  insert into crew_members (crew_id, profile_id, role)
  values (v_crew_id, auth.uid(), 'member')
  on conflict (crew_id, profile_id) do nothing;
  return v_crew_id;
end $$;

create or replace function public.join_trip_by_code(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_trip_id uuid;
begin
  if auth.uid() is null then
    raise exception 'must be signed in to join a trip';
  end if;
  select id into v_trip_id from trips where invite_code = p_code;
  if v_trip_id is null then
    raise exception 'invite code not found';
  end if;
  insert into trip_members (trip_id, profile_id, status)
  values (v_trip_id, auth.uid(), 'in')
  on conflict (trip_id, profile_id) do nothing;
  return v_trip_id;
end $$;

-- Crew preview for a join screen: name and size only, never the roster.
create or replace function public.crew_preview(p_code text)
returns table (crew_id uuid, name text, member_count bigint)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, (select count(*) from crew_members m where m.crew_id = c.id)
  from crews c where c.invite_code = p_code;
$$;

-- ---------------------------------------------------------------------------
-- Friend-of-friend visibility (§9). Two hops, defined once, security definer so
-- the client can never enumerate the graph. Returns a narrowed row carrying the
-- vouching edge — setof rounds would leak every column to a non-member.
-- ---------------------------------------------------------------------------

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
         r.max_players - (select count(*)::int from round_players rp where rp.round_id = r.id and rp.rsvp = 'in'),
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

-- Requesting a seat: the requester is not a crew member, so the insert cannot go
-- through the round_players policy. Organizer approval is a separate step.
create table seat_requests (
  id           uuid primary key default gen_random_uuid(),
  round_id     uuid not null references rounds(id) on delete cascade,
  profile_id   uuid not null references profiles(id) on delete cascade,
  status       text not null default 'requested' check (status in ('requested','approved','declined')),
  created_at   timestamptz default now(),
  unique (round_id, profile_id)
);
create index seat_requests_round_idx on seat_requests (round_id, status);
alter table seat_requests enable row level security;

create policy "read own or hosted seat requests" on seat_requests for select to authenticated
  using (profile_id = auth.uid() or can_admin_round(round_id));
create policy "update seat requests" on seat_requests for update to authenticated
  using (can_admin_round(round_id)) with check (can_admin_round(round_id));

create or replace function public.request_open_seat(p_round_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not exists (select 1 from public.visible_open_seats() s where s.round_id = p_round_id) then
    raise exception 'that seat is not visible to you';
  end if;
  insert into seat_requests (round_id, profile_id) values (p_round_id, auth.uid())
  on conflict (round_id, profile_id) do update set status = 'requested'
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.approve_seat_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_req seat_requests;
begin
  select * into v_req from seat_requests where id = p_request_id;
  if v_req is null then
    raise exception 'request not found';
  end if;
  if not public.can_admin_round(v_req.round_id) then
    raise exception 'only the organizer can approve a seat';
  end if;
  update seat_requests set status = 'approved' where id = p_request_id;
  insert into round_players (round_id, profile_id, rsvp)
  values (v_req.round_id, v_req.profile_id, 'in')
  on conflict (round_id, profile_id) do update set rsvp = 'in';
end $$;
