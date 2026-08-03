-- Setting the cron secret is a two-sided operation — the function holds one
-- copy, the database the other — and the two must be byte-identical or every
-- dispatch 401s silently, once a minute, with the outbox quietly filling.
--
-- Vault's own API makes that easy to get wrong: create_secret fails on a name
-- that already exists, and update_secret needs an id nobody has to hand. So the
-- natural second attempt at setup errors on the SQL side while having already
-- succeeded on the function side, leaving exactly the mismatch that is hardest
-- to notice. This makes the operation idempotent, which is what it always
-- should have been.

do $$
begin
  if to_regnamespace('vault') is null then
    raise notice 'vault absent; skipping set_push_dispatch_secret helper';
    return;
  end if;

  execute $fn$
    create or replace function public.set_push_dispatch_secret(p_secret text)
    returns text language plpgsql security definer set search_path = public, vault as $body$
    declare v_id uuid;
    begin
      select id into v_id from vault.secrets where name = 'push_dispatch_secret';
      if v_id is null then
        perform vault.create_secret(p_secret, 'push_dispatch_secret',
                                    'Shared secret pg_cron presents to push-dispatch');
        return 'created';
      end if;
      perform vault.update_secret(v_id, p_secret);
      return 'updated';
    end $body$;
  $fn$;

  -- Writes a secret. Reachable from the SQL editor and nowhere else.
  execute 'revoke all on function public.set_push_dispatch_secret(text) from public, anon, authenticated';
end $$;
