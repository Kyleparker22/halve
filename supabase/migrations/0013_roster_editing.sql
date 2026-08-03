-- Roster editing, and the guard that has to exist before it can be allowed.
--
-- round_players.id is the scoring identity, and scores, game_participants and
-- game_results all reference it `on delete cascade`. So deleting a player who
-- has already been scored does not fail — it silently destroys their scores,
-- and worse, their game_results rows, leaving a game whose results no longer
-- sum to zero. The deferred balance trigger fires on insert and update, not on
-- a cascade from another table, so nothing would catch it. The money would just
-- quietly stop adding up.
--
-- Removal is therefore only ever legal before a player has a score to their
-- name. After that the answer is to mark them out, not to erase them.

create or replace function public.assert_round_player_removable() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_scores  int;
  v_results int;
begin
  -- The round itself is being deleted and this is the cascade, not a roster
  -- edit: the parent row is already gone by the time children are removed.
  if not exists (select 1 from rounds where id = old.round_id) then
    return old;
  end if;

  select count(*) into v_results from game_results where round_player_id = old.id;
  if v_results > 0 then
    raise exception
      'cannot remove a player who has game results — the game would stop summing to zero. Correct with an offsetting entry.'
      using errcode = 'check_violation';
  end if;

  select count(*) into v_scores from scores where round_player_id = old.id;
  if v_scores > 0 then
    raise exception
      'cannot remove a player who has already scored — mark them out instead.'
      using errcode = 'check_violation';
  end if;

  return old;
end $$;

create trigger round_players_removable before delete on round_players
  for each row execute function public.assert_round_player_removable();

-- A player dropped from the roster must also leave any game they were entered
-- into, or computeGame is handed a participant with no card.
create or replace function public.cleanup_round_player() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from game_participants where round_player_id = old.id;
  return old;
end $$;

create trigger round_players_cleanup before delete on round_players
  for each row execute function public.cleanup_round_player();
