/**
 * `attemptStats(since, until)` (spec 021 §5.2 "Card-testing detector", §12 requirement (f) on
 * spec 013; AC-6; TASK-493): declined and succeeded payment attempts in a window, site-wide, with
 * no identifier. A decline is one `order.payment_attempt_failed` per (payment, attempt), however
 * many orders the purchase holds; a success is one payment captured in the window. `livemode`
 * keeps `live` and `test` money apart.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { withExecutor } from "@/modules/orders";

import type { PaymentTransaction } from "./context.ts";

export interface AttemptStatsResult {
  readonly declined: number;
  readonly succeeded: number;
}

const Row = z.object({
  declined: z.number().int().nonnegative(),
  succeeded: z.number().int().nonnegative(),
});

/** The counts for `(since, until]` (the file header). */
export async function attemptStats(
  since: Date,
  until: Date,
  options: {
    readonly livemode: boolean;
    readonly transaction?: PaymentTransaction;
  },
): Promise<AttemptStatsResult> {
  const run: PaymentTransaction =
    options.transaction ??
    ((fn) => withExecutor(undefined, "payments.attempt_stats", fn));
  const from = since.toISOString();
  const to = until.toISOString();
  const [row] = await run((executor) =>
    executor.execute(sql`
      SELECT
        (SELECT count(DISTINCT (e.payload ->> 'payment_id', e.payload ->> 'attempt'))::int
           FROM order_event e
           JOIN payment p ON p.id::text = e.payload ->> 'payment_id'
          WHERE e.type = 'order.payment_attempt_failed'
            AND p.livemode = ${options.livemode}
            AND e.occurred_at > ${from}::timestamptz
            AND e.occurred_at <= ${to}::timestamptz) AS declined,
        (SELECT count(*)::int FROM payment p
          WHERE p.livemode = ${options.livemode}
            AND p.captured_at > ${from}::timestamptz
            AND p.captured_at <= ${to}::timestamptz) AS succeeded`),
  );
  return Row.parse(row);
}
