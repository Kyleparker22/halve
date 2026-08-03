-- Receipt photos for trip expenses.
--
-- trip_expenses.receipt_url has existed since 0001 and nothing could ever fill
-- it, because there was no bucket to put a photo in. M6 asks for receipts, and
-- on a real trip they are what stops the "I definitely paid for that dinner"
-- argument a week later.
--
-- Private bucket, not public. A receipt shows a card's last four, a restaurant,
-- a date and a time — that is a movement log for a real person, and a public
-- bucket makes every one of them world-readable to anyone who guesses a URL.
-- The app reads them through signed URLs instead.
--
-- Guarded: the storage schema only exists on the Supabase platform, and these
-- same migrations run against bare Postgres in the PGlite harness.

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema absent; skipping receipts bucket';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('receipts', 'receipts', false, 10485760,
          array['image/jpeg', 'image/png', 'image/heic', 'image/webp'])
  on conflict (id) do nothing;

  /**
   * Objects are keyed `<trip_id>/<filename>`, so the first path segment decides
   * who may touch them. is_trip_member already encodes "are you on this trip",
   * including members who joined by link and are not in the owning crew — they
   * paid for things too.
   */
  execute $pol$
    create policy "trip members read receipts" on storage.objects for select
      to authenticated
      using (
        bucket_id = 'receipts'
        and public.is_trip_member(((storage.foldername(name))[1])::uuid)
      )
  $pol$;

  execute $pol$
    create policy "trip members upload receipts" on storage.objects for insert
      to authenticated
      with check (
        bucket_id = 'receipts'
        and public.is_trip_member(((storage.foldername(name))[1])::uuid)
      )
  $pol$;

  -- Deliberately no update or delete policy. A receipt is evidence attached to
  -- money that has already been split; replacing one quietly changes what the
  -- crew agreed to. Corrections are a new expense, same as the ledger rule.
exception
  when duplicate_object then
    raise notice 'receipt storage policies already exist';
  when others then
    raise notice 'could not configure receipts bucket: %', sqlerrm;
end $$;
