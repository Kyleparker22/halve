-- Storylines are blind until the booth says them out loud.
--
-- Shipping them readable was wrong twice over. It kills the surprise — the
-- whole joke is hearing it come out of Marcy's mouth on the third tee, not
-- reading it in a list beforehand. And it makes people self-censor: a storyline
-- with your name visibly attached is a very different thing to write than one
-- nobody can trace.
--
-- So: you see your own, and nothing else. The count is public so the crew can
-- tell the booth is loaded, but the content is not.

drop policy "read storylines" on round_storylines;

create policy "read own storylines" on round_storylines for select to authenticated
  using (submitted_by = auth.uid());

/**
 * How many are waiting, without revealing any of them. Security definer
 * precisely because the caller must not be able to read the rows — it returns
 * a number and nothing else, and only to someone who can see the round.
 */
create or replace function public.storyline_count(p_round_id uuid)
returns int language plpgsql stable security definer set search_path = public as $$
declare v_count int;
begin
  if not public.can_read_round(p_round_id) then
    return 0;
  end if;
  select count(*) into v_count from round_storylines where round_id = p_round_id;
  return v_count;
end $$;

revoke all on function public.storyline_count(uuid) from public, anon;
grant execute on function public.storyline_count(uuid) to authenticated;

comment on function public.storyline_count(uuid) is
  'Number of storylines on a round, without their content. The rows themselves '
  'are readable only by whoever submitted them — the booth is the reveal.';
