/**
 * A Drizzle instance bound to a postgres.js **transaction**, for suites that drive application
 * code taking a `DbTransaction` (spec 012; TASK-217, TASK-219).
 *
 * Drizzle's postgres-js driver reads `client.options.parsers` and `.serializers` when it wraps a
 * client, and a postgres.js transaction object has no `options` (only the pool does), so
 * `drizzle(tx)` throws. The transaction runs on one of the pool's connections with the pool's
 * type options, so lending it the pool's `options` is exactly what the driver expects. The same
 * defect in `src/lib/db.ts` is escalated in `docs/tasks/TASK-202.md` and `docs/tasks/TASK-217.md`.
 */
import { drizzle } from "drizzle-orm/postgres-js";

import type { DbTransaction } from "../../../src/lib/db.ts";
import type { Sql, Tx } from "./scratch-db.ts";

export function drizzleOver(tx: Tx, pool: Sql): DbTransaction {
  return drizzle(Object.assign(tx, { options: pool.options }) as never);
}
