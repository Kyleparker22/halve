-- Notifications, part one: the events that produce them.
--
-- Until now the only things that queued a notification were the two time-driven
-- reminders and round completion. The events that actually matter to a crew —
-- being invited, someone asking for your open seat, a settlement landing — did
-- nothing at all. Technical Spec §8 lists them; these are the triggers.
--
-- All of it is server-side by design: the recipients who matter are the ones
-- who have not opened the app.

/** Invited to a round. Fires for the invitees, never for the organiser. */
create or replace function public.notify_round_invite() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_course text;
  v_when   timestamptz;
  v_by     uuid;
begin
  if new.profile_id is null or new.rsvp <> 'invited' then
    return new;
  end if;

  select c.name, r.scheduled_at, r.created_by into v_course, v_when, v_by
    from rounds r join courses c on c.id = r.course_id
   where r.id = new.round_id;

  if v_by = new.profile_id then
    return new;
  end if;

  perform public.enqueue_notification(
    new.profile_id, 'round_invite', 'You are in?',
    coalesce(v_course, 'A round') || ' — ' || to_char(v_when, 'Dy DD Mon at HH24:MI'),
    jsonb_build_object('round_id', new.round_id));
  return new;
end $$;

create trigger round_players_notify_invite after insert on round_players
  for each row execute function public.notify_round_invite();

/**
 * Crew membership, which happens two ways and wants opposite notifications.
 * Someone redeeming an invite code already knows they joined — the people who
 * want telling are the crew. Someone added by an admin is the one who wants it.
 */
create or replace function public.notify_crew_invite() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_name text;
  v_who  text;
  r      record;
begin
  if new.role = 'owner' then
    return new;   -- the founder does not need telling
  end if;
  select name into v_name from crews where id = new.crew_id;

  if new.profile_id = auth.uid() then
    select display_name into v_who from profiles where id = new.profile_id;
    for r in
      select profile_id from crew_members
       where crew_id = new.crew_id and role in ('owner', 'admin')
         and profile_id <> new.profile_id
    loop
      perform public.enqueue_notification(
        r.profile_id, 'crew_invite', 'Someone joined',
        coalesce(v_who, 'A golfer') || ' is in ' || coalesce(v_name, 'your crew') || '.',
        jsonb_build_object('crew_id', new.crew_id));
    end loop;
  else
    perform public.enqueue_notification(
      new.profile_id, 'crew_invite', 'You are in a crew',
      coalesce(v_name, 'A crew') || ' added you.',
      jsonb_build_object('crew_id', new.crew_id));
  end if;
  return new;
end $$;

create trigger crew_members_notify after insert on crew_members
  for each row execute function public.notify_crew_invite();

/** Someone asked for an open seat — the organiser decides. */
create or replace function public.notify_seat_request() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_host uuid;
  v_who  text;
begin
  select created_by into v_host from rounds where id = new.round_id;
  select display_name into v_who from profiles where id = new.profile_id;
  if v_host is null then
    return new;
  end if;

  if tg_op = 'INSERT' or (old.status <> 'requested' and new.status = 'requested') then
    perform public.enqueue_notification(
      v_host, 'seat_requested', 'Someone wants the open seat',
      coalesce(v_who, 'A golfer') || ' asked to join your round.',
      jsonb_build_object('round_id', new.round_id, 'request_id', new.id));
  elsif new.status = 'approved' and old.status <> 'approved' then
    perform public.enqueue_notification(
      new.profile_id, 'seat_approved', 'You are in',
      'The organiser approved your seat.',
      jsonb_build_object('round_id', new.round_id));
  end if;
  return new;
end $$;

create trigger seat_requests_notify after insert or update on seat_requests
  for each row execute function public.notify_seat_request();

/** Settlement asked for, and settlement confirmed. Both parties, both times. */
create or replace function public.notify_settlement() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_amount text := '$' || to_char(new.amount_cents / 100.0, 'FM999999990.00');
  v_crew   uuid;
  v_payee  text;
  v_payer  text;
  v_data   jsonb;
begin
  select crew_id into v_crew from settlement_batches where id = new.batch_id;
  select display_name into v_payee from profiles where id = new.to_profile;
  select display_name into v_payer from profiles where id = new.from_profile;
  -- crew_id is what the tap needs: a settlement has no screen of its own, it
  -- lives on the crew's settle-up sheet.
  v_data := jsonb_build_object('settlement_id', new.id, 'crew_id', v_crew);

  if tg_op = 'INSERT' then
    perform public.enqueue_notification(
      new.from_profile, 'settlement_requested', 'Time to settle up',
      'You owe ' || coalesce(v_payee, 'someone') || ' ' || v_amount ||
      '. Halve fills in the payment; you pay in your own app.', v_data);
  elsif new.status = 'confirmed' and old.status <> 'confirmed' then
    perform public.enqueue_notification(
      new.to_profile, 'settlement_confirmed', 'Paid',
      coalesce(v_payer, 'Someone') || ' settled ' || v_amount || '.', v_data);
    perform public.enqueue_notification(
      new.from_profile, 'settlement_confirmed', 'Settled',
      v_amount || ' to ' || coalesce(v_payee, 'them') || ' marked paid. You are square.',
      v_data);
  end if;
  return new;
end $$;

create trigger settlements_notify after insert or update on settlements
  for each row execute function public.notify_settlement();
