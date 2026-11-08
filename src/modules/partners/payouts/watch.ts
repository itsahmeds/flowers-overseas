/**
 * The missing-line watch (spec 030a §5.2 `payouts.watch`, "Founder emails" F3, §11; AC-11;
 * TASK-364): the `payouts.watch` job, hourly beside `payouts.close`.
 *
 * A `live` order whose `order.photo_uploaded` event is older than `missingLineAlertMinutes` and
 * that still has no `order` payout line is told to the founder once: F3 (`payout-line-missing`)
 * through spec 016's pipeline, keyed `job:payouts.watch:{orderId}` in `notification_delivery`,
 * and Sentry `alert=payouts.line_missing` with the order id. The key is the "once": an order
 * whose F3 row exists is not selected again, and the alert is raised only after the row is
 * written, so a run held by `notifications.email` off raises nothing and the next run tries
 * again. Each order is its own transaction, so one failing send does not stop the others.
 *
 * The age is a duration (minutes since an instant), not a calendar date, so no zone is read.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { PAYOUTS_CONFIG } from "@/config/payouts";
import { raiseLegacyAlert } from "@/modules/ops";
import { logger as defaultLogger, type Logger } from "@/lib/logger";
import { type OrderExecutor, withExecutor } from "@/modules/orders";

/** The alert of a live order with a photo and no payout line (§11). */
export const LINE_MISSING_ALERT = "payouts.line_missing" as const;

/** How many orders one run looks at; the rest wait an hour. */
export const WATCH_BATCH = 100;

export type LineMissingSender = (
  executor: OrderExecutor,
  input: {
    readonly job: "payouts.watch";
    readonly jobId: string;
    readonly orderId: string;
  },
) => Promise<unknown>;

export type WatchTransaction = <T>(
  fn: (executor: OrderExecutor) => Promise<T>,
) => Promise<T>;

export interface WatchDeps {
  readonly now?: () => Date;
  readonly transaction?: WatchTransaction;
  readonly send?: LineMissingSender;
  readonly alert?: (
    alert: string,
    fields: Readonly<Record<string, unknown>> & { readonly order_id?: string },
  ) => void;
  readonly log?: Logger;
  readonly minutes?: number;
}

const defaultSend: LineMissingSender = async (executor, input) => {
  const { sendJobNotifications } = await import("@/modules/notifications");
  return sendJobNotifications(executor, input);
};

const OrderIdRow = z.object({ id: z.uuid() });

/** spec 030a §5.2 `payouts.watch`. Returns how many orders were told this run. */
export async function watchMissingLines(
  deps: WatchDeps = {},
): Promise<{ readonly alerted: number; readonly held: number }> {
  const now = (deps.now ?? (() => new Date()))();
  const minutes = z
    .number()
    .int()
    .positive()
    .parse(deps.minutes ?? PAYOUTS_CONFIG.missingLineAlertMinutes);
  const transaction: WatchTransaction =
    deps.transaction ?? ((fn) => withExecutor(undefined, "payouts.watch", fn));
  const send = deps.send ?? defaultSend;
  const alert = deps.alert ?? raiseLegacyAlert;
  const log = deps.log ?? defaultLogger;

  const due = await transaction(async (executor) =>
    executor.execute(sql`
      SELECT o.id FROM "order" o
      WHERE o.mode = 'live'
        AND EXISTS (
          SELECT 1 FROM order_event e
          WHERE e.order_id = o.id AND e.type = 'order.photo_uploaded'
            AND e.occurred_at <= ${now.toISOString()}::timestamptz
                                 - make_interval(mins => ${minutes}))
        AND NOT EXISTS (
          SELECT 1 FROM payout_line l WHERE l.order_id = o.id AND l.kind = 'order')
        AND NOT EXISTS (
          SELECT 1 FROM notification_delivery d
          WHERE d.source_key = 'job:payouts.watch:' || o.id::text
            AND d.template_key = 'payout-line-missing')
      ORDER BY o.id
      LIMIT ${WATCH_BATCH}`),
  );
  let alerted = 0;
  let held = 0;
  for (const row of due) {
    const { id: orderId } = OrderIdRow.parse(row);
    try {
      await transaction((executor) =>
        send(executor, { job: "payouts.watch", jobId: orderId, orderId }),
      );
    } catch (error) {
      held += 1;
      log.warn(
        {
          order_id: orderId,
          error_class: error instanceof Error ? error.name : "Error",
        },
        "payouts.line_missing_not_sent",
      );
      continue;
    }
    alert(LINE_MISSING_ALERT, { order_id: orderId });
    log.warn({ order_id: orderId }, LINE_MISSING_ALERT);
    alerted += 1;
  }
  return { alerted, held };
}
