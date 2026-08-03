/**
 * Runs the real migration files, in order, against an in-process Postgres
 * (PGlite). This is what proves the acceptance criterion "the whole migration
 * executes in one pass with no reordering" without needing Docker.
 *
 * The only thing faked is the Supabase platform surface the migrations depend
 * on: the `auth` schema, `auth.uid()`, and the three Supabase roles. Everything
 * else — every table, trigger, policy and the seed — is the shipping SQL.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', 'migrations');
const seedPath = join(here, '..', 'seed.sql');

/** Supabase platform objects the migrations assume already exist. */
const SUPABASE_SHIM = `
create schema if not exists auth;

create table auth.users (
  instance_id uuid,
  id uuid primary key,
  aud text,
  role text,
  email text unique,
  encrypted_password text,
  email_confirmed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb
);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid;
$$;

do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
`;

/**
 * Grants Supabase applies to its roles. RLS, not grants, is the boundary — for
 * tables. For functions the grant *is* the boundary, because a security definer
 * function bypasses RLS by construction, so this has to be faithful.
 *
 * Supabase does it with default privileges, which apply to functions as they
 * are created. Granting execute on everything after the migrations instead
 * would silently undo any REVOKE a migration performs, and the test suite would
 * report a locked-down function as reachable — or worse, an unlocked one as
 * safe. So these run before the migrations, exactly as on the platform.
 */
const DEFAULT_PRIVILEGES = `
grant usage on schema public, auth to anon, authenticated, service_role;
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;
`;

const GRANTS = `
grant select, insert, update, delete on all tables in schema public
  to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;
`;

export type Db = PGlite;

export interface SetupOptions {
  /** Apply supabase/seed.sql after the migrations. Default true. */
  seed?: boolean;
}

export async function setupDatabase(options: SetupOptions = {}): Promise<Db> {
  const db = await PGlite.create();
  await db.exec(SUPABASE_SHIM);
  await db.exec(DEFAULT_PRIVILEGES);

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    try {
      await db.exec(sql);
    } catch (error) {
      throw new Error(`migration ${file} failed: ${(error as Error).message}`);
    }
  }

  await db.exec(GRANTS);

  if (options.seed !== false) {
    const sql = readFileSync(seedPath, 'utf8');
    try {
      await db.exec(sql);
    } catch (error) {
      throw new Error(`seed.sql failed: ${(error as Error).message}`);
    }
  }

  return db;
}

/** Run a callback as a signed-in user, with RLS enforced. */
export async function asUser<T>(db: Db, profileId: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`select set_config('request.jwt.claim.sub', '${profileId}', false);`);
  await db.exec(`set role authenticated;`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role;`);
    await db.exec(`select set_config('request.jwt.claim.sub', '', false);`);
  }
}

/** Rows visible to a given user for an arbitrary query. */
export async function queryAs<T = Record<string, unknown>>(
  db: Db,
  profileId: string,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return asUser(db, profileId, async () => {
    const result = await db.query<T>(sql, params);
    return result.rows;
  });
}

export const SEED = {
  kyle: 'a0000000-0000-4000-a000-000000000001',
  todd: 'a0000000-0000-4000-a000-000000000002',
  marcus: 'a0000000-0000-4000-a000-000000000003',
  dana: 'a0000000-0000-4000-a000-000000000004',
  ryan: 'a0000000-0000-4000-a000-000000000005',
  priya: 'a0000000-0000-4000-a000-000000000006',
  crewSaturday: 'd0000000-0000-4000-a000-000000000001',
  crewCollege: 'd0000000-0000-4000-a000-000000000002',
  completedRound: '10000000-0000-4000-a000-000000000001',
  openSeatRound: '10000000-0000-4000-a000-000000000002',
  kylePlayer: '20000000-0000-4000-a000-000000000001',
  toddPlayer: '20000000-0000-4000-a000-000000000002',
  nassau: '30000000-0000-4000-a000-000000000001',
  trip: '40000000-0000-4000-a000-000000000001',
  nassauLedgerEntry: '70000000-0000-4000-a000-000000000001',
  openLedgerEntry: '70000000-0000-4000-a000-000000000002',
} as const;
