/**
 * The database seam (spec 002 §2 "Provisioning, connection, configuration", §5.2, §5.4, AC-3;
 * §13 Q4 and Q6; TASK-014).
 *
 * One pool, one transaction per unit of work, and **no exported client**: the only way to reach
 * Postgres from application code is one of the three context helpers below, each of which opens a
 * transaction and issues the four `SET LOCAL app.*` statements the RLS policies of spec 002 §2
 * read through `current_setting('app.…', true)` before any query runs. A module that could get a
 * raw client could run a query with no tenant context, and every partner-isolation policy would
 * then be advisory. That is why AC-3 is a statement about this module's *exports*.
 *
 * Roles (§13 Q4), stated precisely because the difference matters. Each transaction **enters**
 * `app_web` — `NOSUPERUSER`, no `BYPASSRLS`, DML only, created by migration `0001` — with `SET
 * LOCAL ROLE`, so inside the transaction `current_user = app_web` and `rolbypassrls` is false and
 * `CREATE` on `public` is denied. The `session_user` is still the provider's managed login, whose
 * `rolbypassrls` is **true**, and a `RESET ROLE` or `SET ROLE` in the same transaction restores
 * it. The isolation therefore holds by **role discipline**, not by construction: no code path may
 * issue `RESET ROLE` / `SET ROLE` (asserted statically in `tests/unit/db.test.ts`), and this
 * module is the only one that holds a client. RLS is a control rather than defence in depth only
 * once `DATABASE_URL` connects as a dedicated `app_web` **login** role with `rolbypassrls = false`;
 * until then TASK-023's AC-18 must assert on the role the connection string *connects as*, not
 * only on `app_web`.
 *
 * Administrator access is the session variable `app.role = 'admin'` and **not** a second
 * connection string: there is no service-role key to leak (ADR-0015 removed the one we had).
 *
 * Connection (§13 Q6). Web requests use the pooled `DATABASE_URL` (PgBouncer transaction mode,
 * which is safe precisely because every statement here is `SET LOCAL` inside an explicit
 * transaction). Migrations, `db:check`, pg-boss and the backup workflow use
 * `DATABASE_URL_UNPOOLED` and never this module.
 *
 * Logging (§8). One line per transaction with `request_id`, `app.role` and duration. No query
 * text, no parameter, no row: `CLAUDE.md`'s "no PII in logs" is kept by never having the
 * material in the first place.
 *
 * **The build reads through its own login** (spec 012b §2.0 item 2, §5.2 "`src/lib/db.ts`", AC-4;
 * TASK-292). While `next build` prerenders (`NEXT_PHASE` is Next's `phase-production-build`), the
 * pool connects with `DATABASE_BUILD_URL`, a login of the read-only `app_build` role (migration
 * `0018`), and every transaction enters `app_build` instead of `app_web`. There is **no
 * fallback**: with the key absent or malformed the first query throws naming it, and with the
 * database unreachable it fails, so the build fails and Railway keeps serving the previous
 * deployment. A build never reads `DATABASE_URL`, and no other code path reads
 * `DATABASE_BUILD_URL` (`tests/unit/db.test.ts` scans for it).
 *
 * The driver and `@/lib/env` are reached through dynamic `import()` so that this module can be
 * imported — and its contract asserted — without a database, a connection string or Next's
 * `server-only` boundary (T-05).
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { z } from "zod";

import { logger } from "./logger";

/** The five values `app.role` may take (spec 002 §2 "RLS and roles"). */
export const APP_ROLES = [
  "public",
  "customer",
  "partner",
  "admin",
  "system",
] as const;

/** The runtime database role every context enters (migration `0001`). */
export const RUNTIME_ROLE = "app_web";

/** The role a context enters while `next build` runs (migration `0018`, spec 012b AC-4). */
export const BUILD_ROLE = "app_build";

/** Next's `PHASE_PRODUCTION_BUILD` (`next/constants`), the value of `NEXT_PHASE` during a build. */
export const BUILD_PHASE = "phase-production-build";

/** The one key the build's connection string is read from. */
export const BUILD_DATABASE_URL_KEY = "DATABASE_BUILD_URL";

/** True while `next build` runs: the build-phase client applies (spec 012b §5.2). */
function isBuildPhase(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return environment["NEXT_PHASE"] === BUILD_PHASE;
}

const buildDatabaseUrlSchema = z
  .string()
  .regex(/^postgres(?:ql)?:\/\/[^\s]+$/u);

/**
 * The build's connection string, or a throw that names the key and never echoes a value (spec 001
 * AC-10). No fallback to `DATABASE_URL`: a build that read the runtime database as `app_web`, or
 * read nothing and prerendered from files, is the "shown ≠ charged" failure §2.0 item 2 forbids.
 */
function buildDatabaseUrl(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const parsed = buildDatabaseUrlSchema.safeParse(
    environment[BUILD_DATABASE_URL_KEY],
  );
  if (!parsed.success) {
    throw new Error(
      `${BUILD_DATABASE_URL_KEY} is missing or is not a postgres:// connection string: next build reads the database only through the app_build login, with no fallback (spec 012b AC-4)`,
    );
  }
  return parsed.data;
}

/**
 * The per-request context, validated at the boundary like every other input (`CLAUDE.md`: "Zod at
 * every boundary"). `requestId` is the `x-request-id` correlation id of spec 001 §5.2.
 */
export const dbContextSchema = z.object({
  role: z.enum(APP_ROLES),
  userId: z.uuid().optional(),
  partnerIds: z.array(z.uuid()).default([]),
  // A UUID v4 in a request, `system:{job}` for a job: letters, digits and `.:_-`, so
  // nothing a caller supplies can end a SQL literal or reach a log line as free text.
  requestId: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9.:_-]+$/),
});

export type DbContextInput = z.input<typeof dbContextSchema>;
export type DbContext = z.output<typeof dbContextSchema>;

/** What a caller receives: a Drizzle instance bound to the open transaction, never the pool. */
export type DbTransaction = ReturnType<typeof drizzle>;

/** The identity an admin or a job carries into the session, when it has one. */
export interface DbActor {
  readonly userId?: string;
  readonly requestId?: string;
}

/**
 * The audit action an admin transaction carries (spec 012 §2.3, §5.2; TASK-218): lowercase and
 * dotted, at least two segments (`partner.status.active`, `order.viewed`), the shape
 * `audit_log_action_check` (`0009`) accepts. The database's `audit_row_change()` writes it on every
 * audit row and raises `AUDIT_ACTION_MISSING` on an admin-context write without one.
 */
export const AuditActionSchema = z
  .string()
  .max(100)
  .regex(
    /^[a-z][a-z_]*(\.[a-z_]+)+$/,
    "an audit action is lowercase and dotted, e.g. users.grant",
  );
export type AuditAction = z.infer<typeof AuditActionSchema>;

/**
 * What `withAdminContext` takes: the actor, the required `action` and an optional `reason` (the
 * text a person typed for a high-risk change; stored in `audit_log.reason`, never logged).
 */
export const adminContextSchema = z
  .object({
    userId: z.uuid().optional(),
    requestId: dbContextSchema.shape.requestId.optional(),
    action: AuditActionSchema,
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();
export type AdminContextInput = z.input<typeof adminContextSchema>;

/**
 * The minimal shape this module needs from `postgres`: a transaction opener whose handle can run
 * a statement and be handed to Drizzle. Declared structurally so the unit test can pass a fake
 * and so no driver type leaks into the public surface.
 */
interface SqlTransaction {
  unsafe(query: string, parameters?: readonly unknown[]): Promise<unknown>;
  savepoint<T>(fn: (tx: SqlTransaction) => Promise<T>): Promise<T>;
}

interface SqlClient {
  begin<T>(fn: (tx: SqlTransaction) => Promise<T>): Promise<T>;
  /** The pool's parser and serializer maps, which every transaction of the pool shares. */
  options: {
    parsers: Record<string, unknown>;
    serializers: Record<string, unknown>;
  };
}

/**
 * A Drizzle instance bound to an open postgres.js transaction.
 *
 * `drizzle(tx)` throws on a real database: Drizzle's postgres-js driver reads
 * `client.options.parsers`, and a transaction handle (unlike the pool) has no `options` and no
 * `begin`. The transaction runs on the pool's connection and parses with the pool's maps, so the
 * pool's `options` are lent to the handle (Drizzle installs its pass-through date parsers on that
 * shared object, which is what it does for the pool itself), and `begin` is a savepoint, so a
 * `db.transaction(...)` inside the callback nests instead of opening a second connection. The
 * transaction-local session context is untouched: it is already set, by `tx.unsafe`, before this
 * runs.
 */
function bindToTransaction(sql: SqlClient, tx: SqlTransaction): DbTransaction {
  const handle = Object.assign(tx, {
    options: sql.options,
    begin: <T>(fn: (inner: SqlTransaction) => Promise<T>) => tx.savepoint(fn),
  });
  return drizzle(handle as never);
}

/**
 * A single-quoted SQL literal. Every value reaching it has already been parsed by
 * `dbContextSchema` (an enum, UUIDs, and a `[A-Za-z0-9.:_-]` request id), so this is defence in
 * depth rather than the only guard: `SET LOCAL` takes no bind parameters, and a module that
 * interpolates into SQL without a documented escape is a module nobody can review.
 */
function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/**
 * The preamble, in the order AC-3 names: `app.role`, `app.user_id`, `app.partner_ids`,
 * `app.request_id`, then the role switch. `SET LOCAL`, so every setting dies with the
 * transaction and a pooled connection cannot carry one request's identity into the next.
 *
 * `app.partner_ids` is the comma-separated form spec 002 §2 specifies; an empty string is the
 * "no partner" case and matches nothing.
 */
function preamble(context: DbContext): string[] {
  return [
    `SET LOCAL app.role = ${quoteLiteral(context.role)}`,
    `SET LOCAL app.user_id = ${quoteLiteral(context.userId ?? "")}`,
    `SET LOCAL app.partner_ids = ${quoteLiteral(context.partnerIds.join(","))}`,
    `SET LOCAL app.request_id = ${quoteLiteral(context.requestId)}`,
    `SET LOCAL ROLE ${isBuildPhase() ? BUILD_ROLE : RUNTIME_ROLE}`,
  ];
}

let client: Promise<SqlClient> | undefined;

/** The one pool, created on first use so that importing this module connects to nothing. */
async function getClient(): Promise<SqlClient> {
  client ??= (async (): Promise<SqlClient> => {
    if (isBuildPhase()) {
      // The build's own login, read before the driver loads: a missing key fails here.
      const url = buildDatabaseUrl();
      const { default: postgres } = await import("postgres");
      return postgres(url, {
        // Next prerenders in several workers, each with its own pool: two connections each.
        max: 2,
        prepare: false,
        onnotice: () => undefined,
      }) as unknown as SqlClient;
    }
    const [{ env }, { default: postgres }] = await Promise.all([
      import("./env"),
      import("postgres"),
    ]);
    return postgres(env.DATABASE_URL, {
      // One statement per `SET LOCAL` and short transactions: the pool is small on purpose
      // (spec 002 §5.4 — Neon Free caps compute hours, and a cached page performs no query).
      max: 10,
      // PgBouncer transaction mode cannot keep prepared statements across a transaction.
      prepare: false,
      onnotice: () => undefined,
    }) as unknown as SqlClient;
  })();
  return client;
}

/**
 * Runs `fn` inside one transaction with the session context of `input` established first.
 *
 * ```ts
 * const rows = await withDbContext(
 *   { role: "partner", partnerIds: [partnerId], requestId },
 *   async (db) => db.select().from(order),
 * );
 * ```
 */
export async function withDbContext<T>(
  input: DbContextInput,
  fn: (db: DbTransaction) => Promise<T>,
): Promise<T> {
  return runInContext(dbContextSchema.parse(input), [], fn);
}

/** A statement of the preamble, with its bind parameters when it takes any. */
type Statement = readonly [query: string, parameters?: readonly unknown[]];

/**
 * The two database guards of spec 012 §2.3 (`0016`). Either one raised means a bug or a bypass
 * attempt, so it is an `error` log line and a Sentry event (§11), never a silent failure.
 */
const GUARD_SIGNALS = [
  "AUDIT_ACTION_MISSING",
  "STATUS_FLIP_OUTSIDE_ADMIN",
] as const;

/**
 * The guard `error` raised, if it is one of the two; read from the message prefix only, of the
 * error or of any error in its `cause` chain (Drizzle wraps the driver's error in its own).
 */
function guardSignalOf(
  error: unknown,
): (typeof GUARD_SIGNALS)[number] | undefined {
  for (
    let current: unknown = error, depth = 0;
    current instanceof Error && depth < 5;
    current = current.cause, depth += 1
  ) {
    const message = current.message;
    const signal = GUARD_SIGNALS.find((name) => message.startsWith(`${name}:`));
    if (signal !== undefined) return signal;
  }
  return undefined;
}

async function reportGuard(
  signal: (typeof GUARD_SIGNALS)[number],
  context: DbContext,
): Promise<void> {
  const fields = { request_id: context.requestId, role: context.role, signal };
  logger.error(fields, "db.guard");
  try {
    const { captureGuardError } = await import("./sentry");
    captureGuardError(signal, fields);
  } catch {
    // Reporting must never mask the database error the caller is about to receive.
  }
}

async function runInContext<T>(
  context: DbContext,
  extra: readonly Statement[],
  fn: (db: DbTransaction) => Promise<T>,
): Promise<T> {
  const sql = await getClient();
  const startedAt = Date.now();
  try {
    return await sql.begin(async (tx) => {
      const statements = preamble(context);
      // The audit settings go after the identity and before the role switch.
      const roleSwitch = statements.pop();
      for (const statement of statements) await tx.unsafe(statement);
      for (const [query, parameters] of extra) {
        await (parameters === undefined
          ? tx.unsafe(query)
          : tx.unsafe(query, parameters));
      }
      if (roleSwitch !== undefined) await tx.unsafe(roleSwitch);
      return fn(bindToTransaction(sql, tx));
    });
  } catch (error) {
    const signal = guardSignalOf(error);
    if (signal !== undefined) await reportGuard(signal, context);
    throw error;
  } finally {
    logger.info(
      {
        request_id: context.requestId,
        role: context.role,
        duration_ms: Date.now() - startedAt,
      },
      "db.transaction",
    );
  }
}

/**
 * Administrator access: the session variable, never a second connection string (§13 Q4).
 *
 * `action` is required (spec 012 §2.3, §5.2; TASK-218): it is issued as `SET LOCAL
 * app.audit_action`, and the optional `reason` as `app.audit_reason` (through `set_config` with a
 * bind parameter, because it is text a person typed). The database's audit trigger writes both on
 * every audit row of the transaction. A read passes an action too (`users.list`), which no
 * trigger records. The actor is optional because a scheduled admin task has no signed-in user;
 * when there is one, its id and request id travel with the transaction so the audit log can name
 * it.
 *
 * ```ts
 * await withAdminContext(
 *   { userId, requestId, action: "partner.status.active" },
 *   (db) => db.update(fulfillmentPartner).set({ status: "active" }).where(…),
 * );
 * ```
 */
export async function withAdminContext<T>(
  input: AdminContextInput,
  fn: (db: DbTransaction) => Promise<T>,
): Promise<T> {
  const admin = adminContextSchema.parse(input);
  const context = dbContextSchema.parse({
    role: "admin",
    ...(admin.userId === undefined ? {} : { userId: admin.userId }),
    partnerIds: [],
    requestId: admin.requestId ?? crypto.randomUUID(),
  });
  return runInContext(
    context,
    [
      [`SET LOCAL app.audit_action = ${quoteLiteral(admin.action)}`],
      ["SELECT set_config('app.audit_reason', $1, true)", [admin.reason ?? ""]],
    ],
    fn,
  );
}

/**
 * The context a background job runs in. `job` is the pg-boss queue name and becomes the actor
 * label `system:{job}` of `plan/11` §1, so an order event written by a job says which one.
 */
export async function withSystemContext<T>(
  job: string,
  fn: (db: DbTransaction) => Promise<T>,
): Promise<T> {
  const name = z
    .string()
    .min(1)
    .regex(/^[a-z][a-z0-9._-]*$/, "a job name is lowercase, dotted, no spaces")
    .parse(job);
  return withDbContext(
    { role: "system", partnerIds: [], requestId: `system:${name}` },
    fn,
  );
}
