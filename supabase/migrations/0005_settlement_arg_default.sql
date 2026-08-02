-- A crew-wide settlement has no trip, so p_trip_id needs a default. Without
-- one the argument is required, and every caller has to invent a value for a
-- parameter that is legitimately absent most of the time.

create or replace function public.open_settlement_batch(
  p_crew_id uuid,
  p_payments jsonb,           -- [{ "from": uuid, "to": uuid, "amount_cents": int }]
  p_trip_id uuid default null
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

-- The old three-argument form, with p_trip_id in the middle and no default.
drop function if exists public.open_settlement_batch(uuid, uuid, jsonb);
