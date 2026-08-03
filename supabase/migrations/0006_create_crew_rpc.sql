-- Creating a crew could not work from the client.
--
-- Two problems, one root. The client did `insert into crews ... returning *`,
-- and Postgres requires the SELECT policy to pass for a RETURNING clause. The
-- read policy is is_crew_member(id), which is false at the instant of creation
-- because the owner's crew_members row does not exist yet. The insert itself
-- succeeded; only the RETURNING failed, so it surfaced as "new row violates
-- row-level security policy" — pointing at the wrong thing entirely.
--
-- Separately, creating the crew and creating the owner membership were two
-- statements. If the second failed, the result was an orphan crew that nobody
-- could read, administer or delete.
--
-- One security-definer function fixes both: atomic, and it returns the id
-- after the membership exists.

create or replace function public.create_crew(p_name text, p_invite_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_crew_id uuid;
  v_actor   uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'must be signed in to create a crew';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'a crew needs a name';
  end if;

  insert into crews (name, invite_code, created_by)
  values (btrim(p_name), p_invite_code, v_actor)
  returning id into v_crew_id;

  insert into crew_members (crew_id, profile_id, role)
  values (v_crew_id, v_actor, 'owner');

  return v_crew_id;
end $$;
