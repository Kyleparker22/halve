-- Social feed additions.
--
-- The Social tab aggregates feed_items across every crew you belong to — no new
-- table, no new read surface, and RLS already answers "which crews' feeds may
-- this person see". What was missing is events worth aggregating: a new club in
-- the bag is exactly the kind of thing a friend razzes you about.
--
-- The club NAME is announced. The DISTANCE is not, ever. Bags are private by
-- design because a carry number is mildly embarrassing; a new 7 wood is not.

create or replace function public.feed_club_added() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  -- Announce to every crew the player belongs to. Someone in three crews is
  -- three inserts; fine at this scale, and it keeps the feed crew-scoped so the
  -- existing RLS keeps answering the visibility question.
  for r in select crew_id from crew_members where profile_id = new.profile_id
  loop
    insert into feed_items (crew_id, actor_id, type, subject_type, subject_id, payload)
    values (r.crew_id, new.profile_id, 'club_added', 'profile', new.profile_id,
            jsonb_build_object('club', new.name));
  end loop;
  return new;
end $$;

create trigger player_clubs_feed after insert on player_clubs
  for each row execute function public.feed_club_added();
