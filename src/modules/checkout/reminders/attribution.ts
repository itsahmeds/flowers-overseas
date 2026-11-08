/**
 * Placement's two reminder steps (spec 034 §5.2 "Placement"; AC-22, AC-23; TASK-452), inside
 * `placeOrderAction`'s transaction after `placePurchase`. They read and write `basket_reminder`
 * only: never an order, a status, an event or the outbox (ADR-0009).
 *
 *  - `cancelPendingForDraft`: the draft's `scheduled` reminder ends `skipped 'purchased'`.
 *  - `attributeRecovery` (`live` only): the draft's own `sent` reminder, else the one that rebuilt
 *    it (`restored_from_reminder_id`), sent within the last 7 days (inclusive) and not yet
 *    attributed, records the purchase. A purchase is attributed to at most one reminder (`UNIQUE`).
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { ATTRIBUTION_WINDOW_MS } from "@/config/basket-reminders";
import { logger } from "@/lib/logger";
import type { OrderExecutor } from "@/modules/orders";

export async function cancelPendingForDraft(
  executor: OrderExecutor,
  draftId: string,
): Promise<number> {
  const rows = await executor.execute(sql`
    UPDATE basket_reminder SET status = 'skipped', skip_reason = 'purchased'
     WHERE draft_id = ${z.uuid().parse(draftId)} AND status = 'scheduled'
    RETURNING id`);
  return rows.length;
}

export async function attributeRecovery(
  executor: OrderExecutor,
  input: {
    readonly draftId: string;
    readonly purchaseId: string;
    readonly mode: "demo" | "test" | "live";
    readonly now: Date;
  },
): Promise<string | null> {
  if (input.mode !== "live") return null;
  const since = new Date(
    input.now.getTime() - ATTRIBUTION_WINDOW_MS,
  ).toISOString();
  const rows = await executor.execute(sql`
    WITH candidate AS (
      SELECT r.id FROM basket_reminder r
       WHERE r.status = 'sent' AND r.recovered_purchase_id IS NULL
         AND r.sent_at >= ${since}::timestamptz
         AND (r.draft_id = ${input.draftId}
              OR r.id = (SELECT d.restored_from_reminder_id FROM checkout_draft d
                          WHERE d.id = ${input.draftId}))
       ORDER BY (r.draft_id = ${input.draftId}) DESC, r.sent_at DESC
       LIMIT 1
       FOR UPDATE
    )
    UPDATE basket_reminder r
       SET recovered_purchase_id = ${input.purchaseId},
           recovered_at = ${input.now.toISOString()}::timestamptz
      FROM candidate
     WHERE r.id = candidate.id
       AND NOT EXISTS (SELECT 1 FROM basket_reminder x
                        WHERE x.recovered_purchase_id = ${input.purchaseId})
    RETURNING r.id`);
  const id = z.object({ id: z.uuid() }).safeParse(rows[0]);
  if (!id.success) return null;
  logger.info(
    { reminder_id: id.data.id, purchase_id: input.purchaseId },
    "basket_reminder.recovered",
  );
  return id.data.id;
}
