/**
 * A migrated scratch database per test file (spec 002 §10 T-01 … T-35; TASK-017 … TASK-023).
 *
 * Why scratch databases, and why only on a local server:
 *
 *  - Phase 0 has **one shared database** (spec 002 §13 Q5). A test that creates rows, drives
 *    triggers or rolls migrations back must never touch it, so the schema suites of spec 002's
 *    migrations `0004`–`0011` never run against a remote URL at all.
 *  - A server on `localhost` / `127.0.0.1` / `::1` is disposable by definition: CI's `postgres:16`
 *    service container (`test-integration`), or a developer's own. On one, each suite creates
 *    `fo_it_<label>_<random>`, applies **every** migration through the real runner
 *    (`node scripts/db-migrate.ts`, the same code path as `pnpm db:migrate`), runs against it and
 *    drops it with `WITH (FORCE)` afterwards. The suite therefore proves the migrations apply to an
 *    empty PG16 (AC-4) every time it runs, as a side effect of setting itself up.
 *  - When no local server answers — a clean clone, where `tests/integration/setup.ts` falls back
 *    to the `.env.example` placeholder — the suites **skip**, with the reason in their title.
 *
 * Concurrency. Vitest runs integration files in parallel workers, and two things are cluster-wide
 * rather than per database: the `app_owner` / `app_web` roles `0001` creates, and their
 * dependencies. Two advisory locks, both taken on the *base* database's connection:
 *
 *  - `MIGRATE_LOCK` (exclusive, held while a scratch database is created and migrated) — so two
 *    `0001`s never race on `CREATE ROLE`;
 *  - `ROLES_LOCK` (shared for the lifetime of a scratch database, exclusive for the round-trip
 *    suite) — so `db:rollback --to 0000`, which drops the roles, runs only when no other scratch
 *    database still owns objects through them (T-02).
 */
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { promisify } from "node:util";

import postgres from "postgres";

const run = promisify(execFile);

/** Advisory lock keys. Arbitrary but fixed; `hashtext` is not stable across major versions. */
export const MIGRATE_LOCK = 2_002_000_001;
export const ROLES_LOCK = 2_002_000_002;

export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;

/** The base URL of a disposable (local) server, or `undefined` with the reason it is not usable. */
export function localServerUrl(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): { url: string } | { reason: string } {
  const url =
    environment["DATABASE_URL_UNPOOLED"] ?? environment["DATABASE_URL"];
  if (url === undefined || url === "") return { reason: "no DATABASE_URL" };
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return { reason: "DATABASE_URL is not a URL" };
  }
  if (!["localhost", "127.0.0.1", "[::1]", "::1"].includes(host)) {
    return {
      reason:
        "DATABASE_URL is not a local, disposable server; the shared Phase 0 database is never used",
    };
  }
  return { url };
}

/** `url` with its database name replaced. */
export function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

/**
 * Resolves once, at collection time: the local server's URL when one answers `SELECT 1` within a
 * few seconds, otherwise the reason to skip. Top-level `await` in a suite uses it for
 * `describe.skipIf`.
 */
export async function probeLocalServer(): Promise<{
  url?: string;
  reason: string;
}> {
  const local = localServerUrl();
  if (!("url" in local)) return { reason: local.reason };
  const sql = postgres(local.url, {
    max: 1,
    connect_timeout: 3,
    onnotice: () => undefined,
  });
  try {
    await sql`SELECT 1`;
    return { url: local.url, reason: "" };
  } catch {
    return { reason: "no Postgres answers at the local DATABASE_URL" };
  } finally {
    await sql.end({ timeout: 1 });
  }
}

const REPO_ROOT = resolve(import.meta.dirname, "../../..");

/** Runs the real migration runner against `url`. `args` as for `pnpm db:migrate` / `db:rollback`. */
export async function runner(
  url: string,
  args: readonly string[] = [],
): Promise<string> {
  const { stdout } = await run(
    process.execPath,
    [resolve(REPO_ROOT, "scripts/db-migrate.ts"), ...args],
    {
      cwd: REPO_ROOT,
      env: { ...process.env, DATABASE_URL_UNPOOLED: url },
      timeout: 120_000,
    },
  );
  return stdout;
}

export interface ScratchDatabase {
  readonly name: string;
  readonly url: string;
  /** A pool on the scratch database, connected as the server's own (owner/superuser) role. */
  readonly sql: Sql;
  drop(): Promise<void>;
}

/**
 * Creates `fo_it_<label>_<random>` and applies every migration to it. The caller drops it in
 * `afterAll`. `migrate: false` leaves it empty (the round-trip suite migrates it itself).
 */
export async function scratchDatabase(
  baseUrl: string,
  label: string,
  options: { migrate?: boolean } = {},
): Promise<ScratchDatabase> {
  const name = `fo_it_${label}_${randomBytes(4).toString("hex")}`;
  const admin = postgres(baseUrl, { max: 1, onnotice: () => undefined });
  await admin`SELECT pg_advisory_lock_shared(${ROLES_LOCK})`;
  await admin`SELECT pg_advisory_lock(${MIGRATE_LOCK})`;
  const url = withDatabase(baseUrl, name);
  try {
    await admin.unsafe(`CREATE DATABASE "${name}"`);
    if (options.migrate !== false) await runner(url);
  } finally {
    await admin`SELECT pg_advisory_unlock(${MIGRATE_LOCK})`;
  }
  const sql = postgres(url, { max: 4, onnotice: () => undefined });
  return {
    name,
    url,
    sql,
    async drop() {
      await sql.end({ timeout: 5 });
      await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin`SELECT pg_advisory_unlock_shared(${ROLES_LOCK})`;
      await admin.end({ timeout: 5 });
    },
  };
}

/** Thrown to end a transaction that must leave nothing behind. */
class Rollback extends Error {}

/** Runs `fn` in a transaction that is always rolled back, and returns its result. */
export async function rolledBack<T>(
  sql: Sql,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  let result: T | undefined;
  let finished = false;
  try {
    await sql.begin(async (tx) => {
      result = await fn(tx);
      finished = true;
      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
  if (!finished) throw new Error("rolledBack: the callback did not finish");
  return result as T;
}

/** The parts of a Postgres error a test asserts on. */
export interface PgFailure {
  readonly code: string;
  readonly message: string;
  readonly constraint?: string;
  readonly table?: string;
}

/**
 * Runs `fn` inside a savepoint and returns the Postgres error it raised, or throws when it
 * succeeded. The savepoint keeps the surrounding transaction usable after the expected failure.
 */
export async function pgFailure(
  tx: Tx,
  fn: (sp: Tx) => Promise<unknown>,
): Promise<PgFailure> {
  try {
    await tx.savepoint(async (sp) => {
      await fn(sp);
    });
  } catch (error) {
    if (error instanceof postgres.PostgresError) {
      return {
        code: error.code,
        message: error.message,
        ...(error.constraint_name === undefined
          ? {}
          : { constraint: error.constraint_name }),
        ...(error.table_name === undefined ? {} : { table: error.table_name }),
      };
    }
    throw error;
  }
  throw new Error("expected the statement to fail, and it succeeded");
}

/**
 * Enters the runtime role with the session variables `withDbContext` sets (spec 002 §5.5,
 * `src/lib/db.ts`), inside `tx`. Transaction-local, exactly as in production.
 */
export async function asApp(
  tx: Tx,
  context: { role: string; userId?: string; partnerIds?: readonly string[] },
): Promise<void> {
  await tx`SELECT set_config('app.role', ${context.role}, true)`;
  await tx`SELECT set_config('app.user_id', ${context.userId ?? ""}, true)`;
  await tx`SELECT set_config('app.partner_ids', ${(context.partnerIds ?? []).join(",")}, true)`;
  await tx`SELECT set_config('app.request_id', 'integration-test', true)`;
  await tx.unsafe("SET LOCAL ROLE app_web");
}
