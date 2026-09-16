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
 * The minimal shape this module needs from `postgres`: a transaction opener whose handle can run
 * a statement and be handed to Drizzle. Declared structurally so the unit test can pass a fake
 * and so no driver type leaks into the public surface.
 */
interface SqlTransaction {
  unsafe(query: string): Promise<unknown>;
  options: {
    parsers: Record<string, unknown>;
    serializers: Record<string, unknown>;
  };
}

interface SqlClient {
  begin<T>(fn: (tx: SqlTransaction) => Promise<T>): Promise<T>;
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
    `SET LOCAL ROLE ${RUNTIME_ROLE}`,
  ];
}

let client: Promise<SqlClient> | undefined;

/** The one pool, created on first use so that importing this module connects to nothing. */
async function getClient(): Promise<SqlClient> {
  client ??= (async (): Promise<SqlClient> => {
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
  const context = dbContextSchema.parse(input);
  const sql = await getClient();
  const startedAt = Date.now();
  try {
    return await sql.begin(async (tx) => {
      for (const statement of preamble(context)) {
        await tx.unsafe(statement);
      }
      return fn(drizzle(tx as never));
    });
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
 * Administrator access: the session variable, never a second connection string (§13 Q4). The
 * actor is optional because a scheduled admin task has no signed-in user; when there is one, its
 * id and request id travel with the transaction so the audit log can name it.
 */
export async function withAdminContext<T>(
  fn: (db: DbTransaction) => Promise<T>,
): Promise<T>;
export async function withAdminContext<T>(
  actor: DbActor,
  fn: (db: DbTransaction) => Promise<T>,
): Promise<T>;
export async function withAdminContext<T>(
  actorOrFn: DbActor | ((db: DbTransaction) => Promise<T>),
  maybeFn?: (db: DbTransaction) => Promise<T>,
): Promise<T> {
  const actor = typeof actorOrFn === "function" ? {} : actorOrFn;
  const fn = typeof actorOrFn === "function" ? actorOrFn : maybeFn;
  if (fn === undefined)
    throw new TypeError("withAdminContext requires a callback");
  return withDbContext(
    {
      role: "admin",
      ...(actor.userId === undefined ? {} : { userId: actor.userId }),
      partnerIds: [],
      requestId: actor.requestId ?? crypto.randomUUID(),
    },
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
