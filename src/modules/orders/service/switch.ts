/**
 * The status-write switch, on for one statement and always off again (spec 010 §14 A1.2, A1.3;
 * AC-41, AC-42; TASK-202).
 *
 * `withSwitch` sets `app.allow_status_write = 'on'` (and, for a transition, `app.transition_event`)
 * with `set_config(…, true)`, runs the one guarded statement, then resets both to `''`, also when
 * the statement throws. Without the `finally`, a JavaScript error between the switch and the reset,
 * caught by a caller that keeps using its transaction, would leave the switch on and let a raw
 * `UPDATE "order" SET status` or `INSERT INTO "order"` through later in that transaction (the
 * breaker's observation on PR 243). A database error aborts the transaction, so the reset there
 * fails too; the original error is the one rethrown.
 *
 * `place` passes no event: an insert needs the switch only (A1.3), so `app.transition_event` is
 * neither set nor touched on that path.
 */
import { sql } from "drizzle-orm";

import type { OrderExecutor } from "./executor";

export async function withSwitch<T>(
  executor: OrderExecutor,
  statement: () => Promise<T>,
  event?: string,
): Promise<T> {
  await executor.execute(
    sql`SELECT set_config('app.allow_status_write', 'on', true)`,
  );
  let result: T;
  try {
    if (event !== undefined) {
      await executor.execute(
        sql`SELECT set_config('app.transition_event', ${event}, true)`,
      );
    }
    result = await statement();
  } catch (error) {
    try {
      await reset(executor, event !== undefined);
    } catch {
      // The transaction is aborted; the statement's own error is the one that matters.
    }
    throw error;
  }
  await reset(executor, event !== undefined);
  return result;
}

async function reset(
  executor: OrderExecutor,
  withEvent: boolean,
): Promise<void> {
  await executor.execute(
    sql`SELECT set_config('app.allow_status_write', '', true)`,
  );
  if (withEvent) {
    await executor.execute(
      sql`SELECT set_config('app.transition_event', '', true)`,
    );
  }
}
