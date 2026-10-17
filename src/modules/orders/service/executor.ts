/**
 * The one seam between the order engine and Postgres (spec 010 §2 "Placing the order", §14 A1.2;
 * TASK-202).
 *
 * The engine never opens a client of its own and never runs on an autocommit connection: every
 * statement goes through an `OrderExecutor` bound to **one open transaction**, because the
 * settings the `0008` triggers read (`app.allow_status_write`, `app.transition_event`) are
 * transaction-local and would vanish between autocommitted statements (A1.2).
 *
 * Two ways in:
 *
 *  - `{ db }` — the Drizzle handle `withDbContext` / `withSystemContext` hand a caller
 *    (`src/lib/db.ts`). The checkout's placement and spec 011's florist commands open their
 *    transaction and pass it, so the order, its events and the draft commit together.
 *  - `{ executor }` — the raw seam, for the statement-recording and failure-injecting executors
 *    of `tests/unit/order-engine.test.ts` and `tests/integration/order-engine.test.ts` (T-22's
 *    "a failure injected after the event insert", T-41's statement record).
 *
 * With neither, the engine opens a `system` transaction of its own (`withSystemContext`), so a
 * call is never outside a transaction.
 */
import { sql, type SQL } from "drizzle-orm";

import type { DbTransaction } from "@/lib/db";

/** A row as Postgres returns it, before the engine's zod parse. */
export type RawRow = Readonly<Record<string, unknown>>;

/** Runs one statement inside the caller's open transaction. */
export interface OrderExecutor {
  execute(query: SQL): Promise<readonly RawRow[]>;
}

/**
 * Where the engine runs: the caller's transaction (`db`), or a raw executor (tests). `executor`
 * wins when both are given; with neither, a `system` transaction is opened.
 */
export interface EngineConnection {
  readonly db?: DbTransaction;
  readonly executor?: OrderExecutor;
}

/** Wraps a Drizzle transaction handle. */
export function drizzleExecutor(db: DbTransaction): OrderExecutor {
  return {
    async execute(query: SQL): Promise<readonly RawRow[]> {
      const rows: unknown = await db.execute(query);
      return rows as readonly RawRow[];
    },
  };
}

/**
 * Runs `fn` with the executor the caller supplied, or inside a fresh `system` transaction when
 * it supplied none. `job` names the transaction's actor label (`system:{job}`, `plan/11` §1).
 */
export async function withExecutor<T>(
  connection: EngineConnection | undefined,
  job: string,
  fn: (executor: OrderExecutor) => Promise<T>,
): Promise<T> {
  if (connection?.executor !== undefined) return fn(connection.executor);
  if (connection?.db !== undefined) return fn(drizzleExecutor(connection.db));
  const { withSystemContext } = await import("@/lib/db");
  return withSystemContext(job, (db) => fn(drizzleExecutor(db)));
}

/** `ARRAY[$1, $2, …]::text[]`, because Drizzle expands a bare array parameter into a list. */
export function textArray(values: readonly string[]): SQL {
  if (values.length === 0) return sql`ARRAY[]::text[]`;
  return sql`ARRAY[${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )}]::text[]`;
}

/** A JSON value as a `jsonb` parameter. */
export function jsonb(value: unknown): SQL {
  return sql`${JSON.stringify(value)}::jsonb`;
}
