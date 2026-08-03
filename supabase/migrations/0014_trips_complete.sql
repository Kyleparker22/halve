-- M6 completion. Three things trips could not do.
--
-- 1. Settle. `trip_expense` is a ledger source that nothing wrote, so a trip
--    could log every dinner and green fee and then have no money to settle.
--    The entries are written by the post-trip-expenses edge function (netting
--    lives in @halve/ledger, not in SQL); what was missing here is a way to
--    read the resulting position per person, scoped to the trip.
-- 2. Have rooms. There was no way to create one, so the room-cost auto-split
--    that already works had nothing to split.
-- 3. Say who is coming and when. arrives_at and departs_at existed and were
--    never written.

-- ---------------------------------------------------------------------------
-- Trip balances. Same shape as crew_balances and the same non-negotiable:
-- security_invoker, or the view runs as postgres and hands every trip's money
-- to anyone who asks.
-- ---------------------------------------------------------------------------
create view trip_balances with (security_invoker = true) as
select trip_id, profile_id, sum(net)::bigint as net_cents from (
  select trip_id, to_profile   as profile_id,  amount_cents as net
    from ledger_entries where status = 'open' and trip_id is not null
  union all
  select trip_id, from_profile as profile_id, -amount_cents as net
    from ledger_entries where status = 'open' and trip_id is not null
) t group by trip_id, profile_id;

-- ---------------------------------------------------------------------------
-- Rooms.
--
-- Capacity is deliberately NOT enforced. It looks like an invariant and is not
-- one: on a real trip someone takes the pull-out couch, and the room's cost
-- still splits across whoever actually slept there — which is exactly what the
-- existing auto-split does and what its test asserts, by putting a third person
-- in a two-bed room. Capacity is guidance for the person assigning rooms, so
-- the UI shows when a room is over, and the database stays out of it.
-- ---------------------------------------------------------------------------

/**
 * Creating a room hits the same wall crews did: the insert returns the row,
 * which needs the select policy to pass, and the policy asks whether the caller
 * is a trip admin — true here, but the round trip is worth avoiding, and this
 * keeps room creation to one authorised call.
 */
create or replace function public.create_room(
  p_trip_id uuid, p_name text, p_capacity int, p_cost_cents int default 0,
  p_paid_by uuid default null
) returns rooms language plpgsql security definer set search_path = public as $$
declare v_room rooms;
begin
  if not public.is_trip_admin(p_trip_id) then
    raise exception 'only a trip admin can add rooms' using errcode = '42501';
  end if;
  if p_capacity < 1 then
    raise exception 'a room has to hold at least one person';
  end if;
  if p_cost_cents < 0 then
    raise exception 'a room cannot cost less than nothing';
  end if;

  insert into rooms (trip_id, name, capacity, cost_cents, paid_by)
  values (p_trip_id, p_name, p_capacity, p_cost_cents, coalesce(p_paid_by, auth.uid()))
  returning * into v_room;

  return v_room;
end $$;



-- ---------------------------------------------------------------------------
-- Trip settlement. open_settlement_batch already takes a trip_id; what did not
-- exist was a way to close a trip once its money is done.
-- ---------------------------------------------------------------------------
create or replace function public.complete_trip(p_trip_id uuid)
returns trips language plpgsql security definer set search_path = public as $$
declare
  v_trip trips;
  v_open int;
begin
  if not public.is_trip_admin(p_trip_id) then
    raise exception 'only a trip admin can complete the trip' using errcode = '42501';
  end if;

  -- Completing a trip with money still moving is how a ledger gets abandoned.
  select count(*) into v_open from ledger_entries
   where trip_id = p_trip_id and status = 'open';
  if v_open > 0 then
    raise exception 'settle the trip ledger first — % entries are still open', v_open
      using errcode = 'check_violation';
  end if;

  update trips set status = 'completed' where id = p_trip_id returning * into v_trip;
  return v_trip;
end $$;

comment on view trip_balances is
  'Net open position per profile within one trip. security_invoker so RLS on '
  'ledger_entries applies — without it every trip''s money is world-readable.';
