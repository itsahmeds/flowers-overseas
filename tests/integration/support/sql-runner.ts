/**
 * A transaction handle the order engine and the customer writers accept, over a postgres.js
 * transaction (TASK-202).
 *
 * The engine takes anything with `execute(query: SQL)` (`SqlRunner`). Drizzle's own driver cannot
 * wrap a postgres.js *transaction* (`drizzle(tx)` reads `tx.options.parsers`, which a transaction
 * object does not have), so the suites render the statement with Drizzle's Postgres dialect and
 * run it with `tx.unsafe(text, params)` — the same call Drizzle's postgres-js session makes.
 */
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

import type { OrderExecutor } from "@/modules/orders";

import type { Tx } from "./scratch-db.ts";

const dialect = new PgDialect();

/** The rendered text of a statement (for recording and failure injection). */
export function sqlText(query: SQL): string {
  return dialect.sqlToQuery(query).sql;
}

export function runnerOf(tx: Tx): OrderExecutor {
  return {
    async execute(query: SQL) {
      const { sql, params } = dialect.sqlToQuery(query);
      const rows: unknown = await tx.unsafe(sql, params as never[]);
      return rows as readonly Record<string, unknown>[];
    },
  };
}
