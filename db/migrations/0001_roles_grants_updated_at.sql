-- 0001_roles_grants_updated_at — the two database roles, their grants, and the shared
-- `set_updated_at()` trigger function (spec 002 §2 "RLS and roles", §5.1 "Migrations and
-- rollback", §13 Q4; TASK-014).
--
-- Three things and nothing else:
--
--   1. `app_owner` — owns every object the later migrations create. Used only by the migration
--      runner over `DATABASE_URL_UNPOOLED` (§13 Q6). No LOGIN of its own: the runner connects as
--      the provider's role and `SET LOCAL ROLE app_owner` (see `db/migrations/README.md`), so no
--      password is ever written into a migration file or an env key.
--   2. `app_web` — the runtime role. `NOSUPERUSER`, `NOBYPASSRLS`, `NOCREATEDB`, `NOCREATEROLE`
--      and no DDL: DML only, granted through `ALTER DEFAULT PRIVILEGES` so every table a later
--      migration creates is reachable by the application and by nothing else. RLS therefore
--      applies to the application by construction rather than by policy discipline (§2).
--      `src/lib/db.ts` enters this role for the duration of each request transaction.
--   3. `set_updated_at()` — the one trigger function every table with an `updated_at` column
--      attaches (§5.1). It assigns unconditionally, because AC-10 requires an `UPDATE` that
--      changes no other column to still advance `updated_at`: sitemap `<lastmod>` reads these
--      columns and must not go stale.
--
-- The role attributes are spelled out rather than left to the provider's defaults so that
-- `pg_roles` is an assertable fact (AC-18) on any Postgres, and so that the dump-and-restore
-- promise of ADR-0015 restores the same posture. No extension is created here or anywhere
-- (AC-7): `gen_random_uuid()` is core from PG13.
--
-- Rollback: `0001_roles_grants_updated_at.down.sql`.

-- Roles are cluster-wide, not database-scoped, so creation is guarded: a second database in the
-- same cluster (a Neon branch restored from a dump, the CI scratch database) must not fail here.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    CREATE ROLE app_owner
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_web') THEN
    CREATE ROLE app_web
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
END
$$;

-- No idempotent `ALTER ROLE … NOBYPASSRLS` re-assertion follows, deliberately: Postgres requires
-- *superuser* to name the `SUPERUSER`, `REPLICATION` or `BYPASSRLS` attributes in `ALTER ROLE`
-- even when setting them off, and the managed role this migration runs as is `CREATEROLE`, not
-- superuser (the same will be true of any managed provider). The attributes are therefore set
-- once, at creation, and *asserted* rather than re-applied: AC-18 reads them back out of
-- `pg_roles`. A role created by hand with the wrong attributes is a finding for that assertion,
-- not something a migration can quietly paper over.

-- The connecting role (the provider's own login role) must be a member of both, so that
-- `SET LOCAL ROLE app_owner` in a migration and `SET LOCAL ROLE app_web` in a request transaction
-- both succeed. PG16's automatic grant to the creator carries `ADMIN` but neither `INHERIT` nor
-- `SET`, which is exactly the two options `ALTER DEFAULT PRIVILEGES` and `SET ROLE` need, so the
-- grant is made explicitly — and only when the privileges are not already inherited, because
-- re-granting `WITH ADMIN OPTION` to one's own grantor is an error. When a dedicated `app_web` login role is
-- provisioned later, these grants become redundant and no application code changes.
DO $$
BEGIN
  IF NOT pg_has_role(CURRENT_USER, 'app_owner', 'USAGE') THEN
    EXECUTE 'GRANT app_owner TO ' || quote_ident(CURRENT_USER)
         || ' WITH INHERIT TRUE, SET TRUE';
  END IF;

  IF NOT pg_has_role(CURRENT_USER, 'app_web', 'USAGE') THEN
    EXECUTE 'GRANT app_web TO ' || quote_ident(CURRENT_USER)
         || ' WITH INHERIT TRUE, SET TRUE';
  END IF;

  IF NOT pg_has_role('app_owner', 'app_web', 'MEMBER') THEN
    EXECUTE 'GRANT app_web TO app_owner';
  END IF;
END
$$;

-- Schema access. `app_owner` needs `CREATE` because every later migration creates its objects as
-- that role; `app_web` gets `USAGE` only — it may see the schema and never add to it. (The
-- `REVOKE CREATE ON SCHEMA public FROM PUBLIC` half of the least-privilege story belongs with the
-- RLS migration, spec 002 AC-18 / TASK-023, which owns that assertion end to end.)
GRANT USAGE, CREATE ON SCHEMA public TO app_owner;
GRANT USAGE ON SCHEMA public TO app_web;

-- Everything below is done *as* `app_owner`, which is both how the function ends up owned by it
-- and how `ALTER DEFAULT PRIVILEGES FOR ROLE app_owner` is permitted: Postgres requires the
-- calling role to hold the target role's privileges, and a managed provider grants the connecting
-- role membership without inheritance. `SET LOCAL`, so the role dies with this transaction — it
-- is also the preamble every later migration opens with (`db/migrations/README.md`).
SET LOCAL ROLE app_owner;

-- DML only, and only on what `app_owner` creates from here on. No `GRANT ALL`, no DDL, no
-- `TRUNCATE`: a runtime role that can truncate a table is a runtime role that can lose an order.
ALTER DEFAULT PRIVILEGES FOR ROLE app_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_web;
ALTER DEFAULT PRIVILEGES FOR ROLE app_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_web;
ALTER DEFAULT PRIVILEGES FOR ROLE app_owner IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO app_web;

-- The shared `updated_at` trigger function (§5.1, AC-10). `SECURITY INVOKER` (the default) is
-- deliberate: the trigger must not widen what the calling role may do. Created as `app_owner`,
-- so it is owned by `app_owner` without a second statement.
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger
  LANGUAGE plpgsql
AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.set_updated_at() IS
  'Spec 002 §5.1: advances updated_at on every UPDATE, unconditionally, so sitemap <lastmod> cannot go stale (AC-10).';

REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO app_web;

RESET ROLE;
