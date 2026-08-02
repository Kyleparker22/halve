-- Halve — notifications
-- docs/02 Technical Spec.md §8. Two mechanisms, both server-side: event-driven
-- (trigger → edge function → Expo Push) and time-driven (pg_cron scanning for
-- rounds crossing T-24h and T-1h). Client-scheduled local notifications are not
-- acceptable — the recipients who matter are the ones who haven't opened the app.

create type notification_kind as enum (
  'crew_invite',
  'round_invite',
  'trip_invite',
  'rsvp_nudge',        -- T-24h, no RSVP
  'round_starting',    -- T-1h
  'seat_requested',
  'seat_approved',
  'scores_entered',    -- batched, see notification_batches
  'round_completed',
  'settlement_requested',
  'settlement_confirmed',
  'trip_updated',
  'message'
);

-- Every notification type is individually mutable. Absence of a row means "on".
create table notification_prefs (
  profile_id uuid not null references profiles(id) on delete cascade,
  kind       notification_kind not null,
  enabled    boolean not null default true,
  primary key (profile_id, kind)
);

-- Outbox. The push edge function drains this; it is not the source of truth for
-- anything the user can see in-app.
create table notification_queue (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  kind        notification_kind not null,
  title       text not null,
  body        text not null,
  data        jsonb not null default '{}',
  send_after  timestamptz not null default now(),
  sent_at     timestamptz,
  attempts    int not null default 0,
  created_at  timestamptz default now()
);
create index notification_queue_pending_idx on notification_queue (send_after)
  where sent_at is null;
create index notification_queue_profile_idx on notification_queue (profile_id);

-- Debounce: a crew of 8 entering scores must never produce 8 pushes. Events
-- collapse into one row per (round, kind) inside a 5-minute window.
create table notification_batches (
  id          uuid primary key default gen_random_uuid(),
  round_id    uuid references rounds(id) on delete cascade,
  trip_id     uuid references trips(id) on delete cascade,
  kind        notification_kind not null,
  event_count int not null default 1,
  window_ends_at timestamptz not null default now() + interval '5 minutes',
  flushed_at  timestamptz,
  created_at  timestamptz default now(),
  unique (round_id, kind, flushed_at)
);
create index notification_batches_open_idx on notification_batches (window_ends_at)
  where flushed_at is null;

alter table notification_prefs   enable row level security;
alter table notification_queue   enable row level security;
alter table notification_batches enable row level security;

create policy "own notification prefs" on notification_prefs for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
-- Queue and batches are written by the service role only; users may read their own.
create policy "read own notifications" on notification_queue for select to authenticated
  using (profile_id = auth.uid());

create or replace function public.notification_enabled(p_profile uuid, p_kind notification_kind)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select enabled from notification_prefs
                   where profile_id = p_profile and kind = p_kind), true);
$$;

create or replace function public.enqueue_notification(
  p_profile uuid, p_kind notification_kind, p_title text, p_body text,
  p_data jsonb default '{}', p_send_after timestamptz default now()
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.notification_enabled(p_profile, p_kind) then
    return;
  end if;
  insert into notification_queue (profile_id, kind, title, body, data, send_after)
  values (p_profile, p_kind, p_title, p_body, p_data, p_send_after);
end $$;

-- Score entry debounce. Called by trigger on scores; the flusher (edge function)
-- turns each expired batch into one push per round participant.
create or replace function public.note_score_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_round_id uuid;
begin
  select rp.round_id into v_round_id from round_players rp where rp.id = new.round_player_id;
  if v_round_id is null then
    return new;
  end if;

  update notification_batches
     set event_count = event_count + 1
   where round_id = v_round_id and kind = 'scores_entered' and flushed_at is null;

  if not found then
    insert into notification_batches (round_id, kind) values (v_round_id, 'scores_entered');
  end if;
  return new;
end $$;

create trigger scores_notify after insert or update on scores
  for each row execute function public.note_score_activity();

-- Time-driven reminders. Idempotent: the T-24h and T-1h rows are unique per
-- (profile, round, kind) via the guard select, so re-running the scan is safe.
create or replace function public.queue_round_reminders() returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  -- T-24h: only non-responders
  for r in
    select rp.profile_id, ro.id as round_id, c.name as course_name, ro.scheduled_at
      from rounds ro
      join round_players rp on rp.round_id = ro.id
      join courses c on c.id = ro.course_id
     where ro.status = 'scheduled'
       and rp.profile_id is not null
       and rp.rsvp = 'invited'
       and ro.scheduled_at between now() + interval '23 hours' and now() + interval '24 hours'
  loop
    if not exists (
      select 1 from notification_queue q
      where q.profile_id = r.profile_id and q.kind = 'rsvp_nudge'
        and q.data->>'round_id' = r.round_id::text
    ) then
      perform public.enqueue_notification(
        r.profile_id, 'rsvp_nudge', 'Are you in?',
        'Tomorrow at ' || r.course_name || ' — the crew needs an answer.',
        jsonb_build_object('round_id', r.round_id));
    end if;
  end loop;

  -- T-1h: everyone who said in
  for r in
    select rp.profile_id, ro.id as round_id, c.name as course_name, ro.scheduled_at
      from rounds ro
      join round_players rp on rp.round_id = ro.id
      join courses c on c.id = ro.course_id
     where ro.status = 'scheduled'
       and rp.profile_id is not null
       and rp.rsvp = 'in'
       and ro.scheduled_at between now() + interval '45 minutes' and now() + interval '1 hour'
  loop
    if not exists (
      select 1 from notification_queue q
      where q.profile_id = r.profile_id and q.kind = 'round_starting'
        and q.data->>'round_id' = r.round_id::text
    ) then
      perform public.enqueue_notification(
        r.profile_id, 'round_starting', 'Tee time in an hour',
        r.course_name || ' — see you on the range.',
        jsonb_build_object('round_id', r.round_id));
    end if;
  end loop;
end $$;
