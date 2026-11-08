/**
 * `recordOrderContext` (spec 023 §5.2 "Context capture at placement", AC-19; TASK-491): after the
 * placement commits, one `order_analytics` row per `test` or `live` order, with a fresh random
 * `ga_transaction_id` (never the order reference, never `order.id`).
 *
 * The insert selects the order and its mode, so a `demo` order writes no row by the query itself.
 * A failure is logged as `analytics.context_failed` (a warning, order id and error class only)
 * and **never** fails or delays the order beyond the one insert: the handler then skips the
 * purchase with `no_context`.
 */
import { sql } from "drizzle-orm";

import { logger as defaultLogger, type Logger } from "@/lib/logger";
import { type OrderExecutor, withExecutor } from "@/modules/orders";

import { type AnalyticsContext, AnalyticsContextSchema } from "./context";

export interface RecordOrderContextOptions {
  /** The caller's transaction; default a fresh `system` one. */
  readonly executor?: OrderExecutor;
  readonly log?: Logger;
  /** The transaction id generator (tests). */
  readonly randomId?: () => string;
}

async function insertRow(
  executor: OrderExecutor,
  orderId: string,
  context: AnalyticsContext,
  transactionId: string,
): Promise<void> {
  await executor.execute(sql`
    INSERT INTO order_analytics (
      order_id, analytics_consent, marketing_consent, consent_policy_version,
      ga_client_id, ga_session_id, ga_transaction_id)
    SELECT o.id, ${context.analyticsConsent}, ${context.marketingConsent},
           ${context.consentPolicyVersion}, ${context.gaClientId}, ${context.gaSessionId},
           ${transactionId}::uuid
    FROM "order" o
    WHERE o.id = ${orderId}::uuid AND o.mode IN ('test', 'live')
    ON CONFLICT (order_id) DO NOTHING`);
}

/** Writes one row per `test` or `live` order among `orderIds`. Never throws. */
export async function recordOrderContext(
  orderIds: readonly string[],
  context: AnalyticsContext,
  options: RecordOrderContextOptions = {},
): Promise<void> {
  const log = options.log ?? defaultLogger;
  const randomId = options.randomId ?? (() => crypto.randomUUID());
  const own = options.executor === undefined;
  for (const orderId of orderIds) {
    try {
      const parsed = AnalyticsContextSchema.parse(context);
      await withExecutor(
        own ? undefined : { executor: options.executor },
        "analytics.context",
        async (executor) => {
          // In the caller's transaction a failed insert must not poison what follows.
          if (!own) await executor.execute(sql`SAVEPOINT analytics_context`);
          try {
            await insertRow(executor, orderId, parsed, randomId());
          } catch (error) {
            if (!own) {
              await executor.execute(
                sql`ROLLBACK TO SAVEPOINT analytics_context`,
              );
            }
            throw error;
          }
          if (!own) {
            await executor.execute(sql`RELEASE SAVEPOINT analytics_context`);
          }
        },
      );
    } catch (error) {
      log.warn(
        {
          order_id: orderId,
          error_class: error instanceof Error ? error.name : "unknown",
        },
        "analytics.context_failed",
      );
    }
  }
}
