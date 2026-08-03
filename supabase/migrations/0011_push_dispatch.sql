-- Notifications, part two: making them actually leave the building.
--
-- Everything up to now filled an outbox that nothing ever drained. pg_cron ran
-- queue_round_reminders, which writes rows to notification_queue, and the
-- push-dispatch function that sends them was deployed but never called. The
-- app has therefore never delivered a single notification.
--
-- Four fixes here:
--   1. Schedule the dispatcher (pg_net → the edge function).
--   2. Close a hole: enqueue_notification is security definer in a schema
--      PostgREST exposes, so any signed-in user could push arbitrary text to
--      any other user. Nothing internal should have been callable from a phone.
--   3. Widen the reminder scan windows, which were exactly as wide as the cron
--      interval and so could miss a round entirely.
--   4. Stop concurrent score entry opening two debounce batches for one round.

-- ---------------------------------------------------------------------------
-- 2. Lock down the internals first — this is the security fix, it should land
--    even if the scheduling below is skipped for want of an extension.
-- ---------------------------------------------------------------------------

-- These are called by triggers and by the service role. Never by a client.
revoke all on function public.enqueue_notification(uuid, notification_kind, text, text, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.notification_enabled(uuid, notification_kind) from public, anon, authenticated;
revoke all on function public.queue_round_reminders() from public, anon, authenticated;
revoke all on function public.sync_room_expense(uuid) from public, anon, authenticated;

-- push-dispatch calls enqueue_notification over PostgREST with the service key.
grant execute on function public.enqueue_notification(uuid, notification_kind, text, text, jsonb, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Reminder windows.
--    The T-1h scan looked for rounds between 45 and 60 minutes out — a
--    15-minute window, scanned every 15 minutes. A minute of cron drift and a
--    round falls between two scans and is never reminded at all. The windows
--    are widened to comfortably overlap; the existing "not exists" guard makes
--    re-scanning the same round free, so overlap costs nothing and a miss
--    costs the whole feature.
-- ---------------------------------------------------------------------------
create or replace function public.queue_round_reminders() returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  -- T-24h: only non-responders.
  for r in
    select rp.profile_id, ro.id as round_id, c.name as course_name, ro.scheduled_at
      from rounds ro
      join round_players rp on rp.round_id = ro.id
      join courses c on c.id = ro.course_id
     where ro.status = 'scheduled'
       and rp.profile_id is not null
       and rp.rsvp = 'invited'
       and ro.scheduled_at between now() + interval '22 hours' and now() + interval '25 hours'
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

  -- T-1h: everyone who said in.
  for r in
    select rp.profile_id, ro.id as round_id, c.name as course_name, ro.scheduled_at
      from rounds ro
      join round_players rp on rp.round_id = ro.id
      join courses c on c.id = ro.course_id
     where ro.status = 'scheduled'
       and rp.profile_id is not null
       and rp.rsvp = 'in'
       and ro.scheduled_at between now() + interval '30 minutes' and now() + interval '90 minutes'
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

revoke all on function public.queue_round_reminders() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. One open debounce batch per round.
--    `unique (round_id, kind, flushed_at)` does not constrain open batches at
--    all: flushed_at is null while a batch is open, and null is distinct from
--    null under a default unique index, so two players entering a score at the
--    same moment each open a batch and the crew gets two pushes. A partial
--    index over the open rows is what was actually meant.
-- ---------------------------------------------------------------------------
delete from notification_batches a
 using notification_batches b
 where a.flushed_at is null and b.flushed_at is null
   and a.round_id = b.round_id and a.kind = b.kind and a.ctid > b.ctid;

create unique index if not exists notification_batches_one_open_idx
  on notification_batches (round_id, kind) where flushed_at is null;

-- ---------------------------------------------------------------------------
-- 1. Schedule the dispatcher.
--
--    pg_cron cannot call an edge function directly, so it goes through pg_net,
--    which means something has to authenticate the call. Deliberately NOT the
--    service role key: that key is total database compromise, and putting it in
--    a cron job to unlock one function is the widest possible grant for the
--    narrowest need. A dedicated shared secret instead — if it leaks, the worst
--    anyone can do is make the outbox drain early.
--
--    Neither the secret nor the URL belongs in this repo, so both are read from
--    Vault at call time. Set them once per environment (see docs/RUNBOOK.md):
--
--      select vault.create_secret('<random>', 'push_dispatch_secret');
--      select vault.create_secret('https://<ref>.supabase.co/functions/v1',
--                                 'functions_base_url');
--
--    Until both exist the function is a no-op that says so in the log, so this
--    migration applies cleanly to a fresh database and to the PGlite harness.
-- ---------------------------------------------------------------------------
do $$
begin
  execute 'create extension if not exists pg_net with schema extensions';
exception when others then
  raise notice 'pg_net unavailable in this environment: %', sqlerrm;
end $$;

create or replace function public.dispatch_push() returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_secret text;
  v_url    text;
begin
  if to_regclass('vault.decrypted_secrets') is null then
    raise notice 'vault absent; push dispatch not scheduled';
    return;
  end if;

  execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'push_dispatch_secret'$q$
     into v_secret;
  execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'functions_base_url'$q$
     into v_url;

  if v_secret is null or v_url is null then
    raise notice 'push_dispatch_secret or functions_base_url not in vault; skipping';
    return;
  end if;

  perform net.http_post(
    url     := rtrim(v_url, '/') || '/push-dispatch',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-halve-cron', v_secret),
    body    := '{}'::jsonb,
    timeout_milliseconds := 20000);
end $$;

-- Reads a secret out of Vault. Absolutely not client-callable.
revoke all on function public.dispatch_push() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    -- Every minute. The queue is usually empty and an empty drain is one cheap
    -- query; a notification that arrives 14 minutes late is not a notification.
    perform cron.unschedule('halve-push-dispatch')
      where exists (select 1 from cron.job where jobname = 'halve-push-dispatch');
    perform cron.schedule('halve-push-dispatch', '* * * * *',
                          $cron$select public.dispatch_push()$cron$);
  else
    raise notice 'cron schema absent; push dispatch must be scheduled manually';
  end if;
end $$;
