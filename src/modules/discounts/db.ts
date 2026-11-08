/**
 * The discounts module's one seam to Postgres (spec 047 §5.2; TASK-445).
 *
 * Every database function of this module runs inside a transaction its caller already holds: the
 * admin actions' `withAdminContext` (so spec 012's audit trigger records each write), or the
 * checkout's placing transaction (so `lockAndCount`'s row lock lasts until the order commits).
 * Nothing here opens a connection of its own.
 */
import type { SQL } from "drizzle-orm";

/** What this module needs of a Drizzle transaction handle (`DbTransaction` satisfies it). */
export interface DiscountDb {
  execute(query: SQL): PromiseLike<unknown>;
}

/** The caller's open transaction. */
export interface DiscountConnection {
  readonly db: DiscountDb;
}

/** Runs one statement and returns its rows, before the caller's zod parse. */
export async function rowsOf(
  connection: DiscountConnection,
  query: SQL,
): Promise<readonly Readonly<Record<string, unknown>>[]> {
  const rows: unknown = await connection.db.execute(query);
  return rows as readonly Readonly<Record<string, unknown>>[];
}
