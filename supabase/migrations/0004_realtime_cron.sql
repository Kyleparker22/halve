-- Halve — Supabase platform wiring: Realtime publication and pg_cron schedule.
-- Guarded so the migration set also runs on a bare Postgres (the PGlite test
-- harness in supabase/tests runs the same files, in the same order).

-- Live scoring and chat subscribe per-round / per-channel, never to the whole table.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table scores';
    execute 'alter publication supabase_realtime add table messages';
    execute 'alter publication supabase_realtime add table round_players';
    execute 'alter publication supabase_realtime add table game_results';
  else
    raise notice 'supabase_realtime publication not present; skipping';
  end if;
exception when duplicate_object then
  raise notice 'tables already in supabase_realtime publication';
end $$;

-- Realtime needs the full row to compute changes for UPDATE payloads.
alter table scores replica identity full;

do $$
begin
  execute 'create extension if not exists pg_cron';
exception when others then
  raise notice 'pg_cron unavailable in this environment: %', sqlerrm;
end $$;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule('halve-round-reminders', '*/15 * * * *',
                          $cron$select public.queue_round_reminders()$cron$);
  else
    raise notice 'cron schema absent; round reminders must be scheduled manually';
  end if;
end $$;
