-- M7 completion: the feed, reactions and comments.
--
-- feed_items has existed since 0001 and exactly one thing ever wrote to it —
-- settle-round, on round completion. A crew that has scheduled a trip, taken on
-- three new members and booked four rounds sees an empty feed, which reads as a
-- broken screen rather than a quiet one. The events below are the ones a crew
-- actually talks about.
--
-- Comments never existed at all. `messages` is chat, which is a different thing:
-- chat is a room you have to be in, a comment hangs off the thing it is about
-- and is still there next week.

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------
create table feed_comments (
  id           uuid primary key default gen_random_uuid(),
  feed_item_id uuid not null references feed_items(id) on delete cascade,
  profile_id   uuid not null references profiles(id) on delete cascade,
  body         text not null check (length(trim(body)) between 1 and 1000),
  created_at   timestamptz default now()
);
create index feed_comments_item_idx on feed_comments (feed_item_id, created_at);

alter table feed_comments enable row level security;

-- Same rule as reactions: you can see and say things on your own crews' feed.
create policy "read crew comments" on feed_comments for select to authenticated
  using (exists (select 1 from feed_items f
                  where f.id = feed_item_id and public.is_crew_member(f.crew_id)));

create policy "write own comments" on feed_comments for insert to authenticated
  with check (profile_id = auth.uid()
              and exists (select 1 from feed_items f
                           where f.id = feed_item_id and public.is_crew_member(f.crew_id)));

-- Deleting your own is allowed; editing is not. A comment someone replied to
-- should not change out from under the reply.
create policy "delete own comments" on feed_comments for delete to authenticated
  using (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Writing to the feed
--
-- All security definer, all trigger-driven. Doing this from the client would
-- mean every one of these events depends on the phone that caused it still
-- being awake and online, which for a scheduled round is a coin flip.
-- ---------------------------------------------------------------------------

create or replace function public.feed_round_scheduled() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_course text;
begin
  if new.crew_id is null then
    return new;
  end if;
  select name into v_course from courses where id = new.course_id;
  insert into feed_items (crew_id, actor_id, type, subject_type, subject_id, payload)
  values (new.crew_id, new.created_by, 'round_scheduled', 'round', new.id,
          jsonb_build_object('course', v_course, 'scheduled_at', new.scheduled_at,
                             'trip_id', new.trip_id));
  return new;
end $$;

create trigger rounds_feed_scheduled after insert on rounds
  for each row execute function public.feed_round_scheduled();

create or replace function public.feed_member_joined() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'owner' then
    return new;   -- founding a crew is not news to the crew
  end if;
  insert into feed_items (crew_id, actor_id, type, subject_type, subject_id, payload)
  values (new.crew_id, new.profile_id, 'member_joined', 'profile', new.profile_id, '{}'::jsonb);
  return new;
end $$;

create trigger crew_members_feed after insert on crew_members
  for each row execute function public.feed_member_joined();

create or replace function public.feed_trip_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into feed_items (crew_id, actor_id, type, subject_type, subject_id, payload)
  values (new.crew_id, new.created_by, 'trip_created', 'trip', new.id,
          jsonb_build_object('name', new.name, 'destination', new.destination,
                             'start_date', new.start_date));
  return new;
end $$;

create trigger trips_feed after insert on trips
  for each row execute function public.feed_trip_created();

/**
 * Settling is the end of the story a round started, and it is the one people
 * comment on. Fires once per batch rather than per payment — eight settlements
 * closing together is one event, not eight.
 */
create or replace function public.feed_settled() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_count int;
  v_total bigint;
begin
  if new.status <> 'confirmed' or old.status = 'confirmed' then
    return new;
  end if;
  -- Only when the last settlement in the batch confirms.
  select count(*) into v_count from settlements
   where batch_id = new.batch_id and status <> 'confirmed';
  if v_count > 0 then
    return new;
  end if;

  select sum(amount_cents) into v_total from settlements where batch_id = new.batch_id;
  insert into feed_items (crew_id, actor_id, type, subject_type, subject_id, payload)
  select b.crew_id, null, 'settled_up', 'settlement_batch', b.id,
         jsonb_build_object('total_cents', v_total, 'trip_id', b.trip_id)
    from settlement_batches b where b.id = new.batch_id;
  return new;
end $$;

create trigger settlements_feed after update on settlements
  for each row execute function public.feed_settled();

comment on table feed_comments is
  'Comments on a crew feed item. Distinct from messages, which is chat: a '
  'comment hangs off the thing it is about and outlives the conversation.';
