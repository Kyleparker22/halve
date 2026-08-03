# Runbook

Operational setup that cannot live in the repo, because it involves secrets.
Everything here is per-environment and only needs doing once.

## Push notifications

The chain is: an event writes a row to `notification_queue` → pg_cron calls
`public.dispatch_push()` every minute → pg_net POSTs the `push-dispatch` edge
function → the function drains the outbox to Expo Push → Expo to APNs.

Two secrets connect the middle of that chain, and they must be the same value:
one the database sends, one the function checks.

Deliberately **not** the service role key. A leaked service key is total
database compromise; a leaked cron secret lets someone drain the outbox a few
seconds early. The function only needs the second privilege.

### 1. Generate the secret and set both sides

Run this in your own terminal. Nothing prints the secret to a log, and it is
never written to a file in the repo.

```bash
SECRET=$(openssl rand -hex 32) && supabase secrets set PUSH_DISPATCH_SECRET="$SECRET" >/dev/null && echo "select set_push_dispatch_secret('$SECRET');"
```

That sets the function side and prints one SQL statement.

Running it twice is safe and is in fact the fix for a mismatch: each run
generates a fresh value and sets both sides to it. What is *not* safe is
running it twice and only pasting the SQL once — the function would then hold a
newer secret than the database, and every dispatch would 401 silently, once a
minute, forever.

### 2. Paste that statement into the SQL editor

Dashboard → SQL Editor. Run the printed line, then this one, which tells the
database where the functions live:

```sql
select vault.create_secret(
  'https://<project-ref>.supabase.co/functions/v1', 'functions_base_url');
```

Confirm both landed — a failed statement aborts the whole batch in the SQL
editor, so a duplicate-key error on one line silently discards the other:

```sql
select name, created_at, updated_at from vault.secrets;
```

### 3. Kick the scheduler

`dispatch_push()` reads Vault on every call, so it starts working on the next
cron tick with no redeploy. Confirm:

```sql
select jobname, schedule, active from cron.job;
select status_code, content from net._http_response order by created desc limit 5;
```

`halve-push-dispatch` should be listed and active, and the most recent response
should be a 200 with a JSON body like `{"sent":0,"pruned":0}`.

### Rotating the secret

Repeat step 1, then `select vault.update_secret(id, '<new>')` for the
`push_dispatch_secret` row. Order does not matter much — the worst case is a
minute of 401s, and the outbox is not drained until it succeeds, so nothing is
lost.

### What to check when a notification does not arrive

In order, because each step rules out everything below it:

1. `select * from notification_queue order by created_at desc limit 20;`
   Nothing there means the event never fired — a trigger problem, not push.
2. `sent_at` still null with `attempts` climbing means the dispatcher is running
   but Expo is rejecting. `select content from net._http_response` for the body.
3. `sent_at` set but no notification on the phone means Expo accepted it and
   APNs dropped it. Usually a device with no `devices` row (permission never
   granted) or a token from a different build.
4. `select * from devices where profile_id = '...'` — no row means the app never
   registered. Simulators never register; `registerDevice` returns early on
   anything that is not a physical device.

## Before a public App Store listing

Two pages must be live and reachable. The app links to them from Profile, and
Apple checks the privacy policy URL during review — an app with accounts and
account deletion will be rejected without one.

- `https://halve.golf/privacy`
- `https://halve.golf/terms`

Neither is drafted. They are not boilerplate for this app: it handles money
positions between named people, stores receipt photos, and processes contact
data if friend discovery ships. Get them written by someone qualified, along
with the social-wagering question in the risk register.

TestFlight does not require either — this blocks public listing only.

## Course data

`GOLFCOURSE_API_KEY` is server-side only and set with `supabase secrets set`.
It must never appear in `apps/mobile/.env` or in EAS environment variables —
both of those ship inside the `.ipa` and are readable by anyone who downloads
the app.
