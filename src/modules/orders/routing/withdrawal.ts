/**
 * Withdrawal: an order leaves fulfilment before delivery, so its florist is told to stop (spec
 * 016 §5.2 "The `routing` outbox handler" → "Withdrawal"; spec 002 §14 A10 rows 39 and 40,
 * A10.3; AC-15; TASK-330).
 *
 * For `order.cancelled`, `order.refunded_full`, `order.chargeback_opened` and
 * `order.cancelled_refunded`, **when the event's `from_status` is before delivery** (anything but
 * `delivered`, `photo_uploaded`, `closed`, `disputed`, `resolved`), in the outbox delivery's
 * transaction:
 *
 *  - the order's open or accepted assignment that is not yet withdrawn gets `withdrawn_at` and the
 *    event's `withdrawn_reason`. Its pending `assignment.remind`, `assignment.timeout` and the
 *    order's `assignment.photo_remind` then find it withdrawn (or the order no longer `routed` /
 *    `delivered`) and write nothing. V4 to its florist is the event's own `notifications` row
 *    (`notificationsFor`, TASK-331), which reads the assignment this step stopped;
 *  - **only for `order.cancelled` from `accepted` or `paid`** (the buyer cancelled after a florist
 *    accepted, rows 39 and 40): one `payout_adjustment` (`withdrawn_by_buyer_after_acceptance`,
 *    `open`, the accepted assignment and its florist) with `ON CONFLICT (assignment_id) DO
 *    NOTHING`, so the row handled twice leaves one. No amount: the florist agreement decides it
 *    and the payouts spec settles the row (A10.3).
 *
 * From `delivered` or later nothing is withdrawn and no row is written. Idempotent: a second run
 * finds the assignment withdrawn and the adjustment present. Ids only; nothing personal.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import type { OutboxDeliveryEvent } from "../outbox/dispatcher";
import type { OrderEventType } from "../service/events";
import type { OrderExecutor } from "../service/executor";

/** States from which a withdrawal event withdraws nothing: the flowers were delivered (§5.2). */
export const NOT_WITHDRAWN_FROM: ReadonlySet<string> = new Set([
  "delivered",
  "photo_uploaded",
  "closed",
  "disputed",
  "resolved",
]);

/** Each withdrawal event and the `withdrawn_reason` it writes (spec 016 §5.1's CHECK list). */
export const WITHDRAWN_REASON = {
  "order.cancelled": "order_cancelled",
  "order.refunded_full": "refunded_full",
  "order.chargeback_opened": "chargeback_open",
  "order.cancelled_refunded": "cancelled_refunded",
} as const satisfies Partial<Record<OrderEventType, string>>;

export type WithdrawalEvent = keyof typeof WITHDRAWN_REASON;

/** Rows 39 and 40: a buyer cancel after acceptance, the one case that owes the florist a record. */
const AFTER_ACCEPTANCE: ReadonlySet<string> = new Set(["accepted", "paid"]);

/** The one kind `payout_adjustment` takes (spec 002 §14 A10.3). */
export const WITHDRAWN_AFTER_ACCEPTANCE = "withdrawn_by_buyer_after_acceptance";

export function isWithdrawalEvent(type: string): type is WithdrawalEvent {
  return Object.hasOwn(WITHDRAWN_REASON, type);
}

const WithdrawnRow = z.object({ id: z.uuid() });
const AcceptedRow = z.object({ id: z.uuid(), partner_id: z.uuid() });

export interface WithdrawalOutcome {
  /** Assignments this run withdrew (0 on a repeat, or with none open or accepted). */
  readonly withdrawn: number;
  /** Whether a `payout_adjustment` row was inserted by this run. */
  readonly adjustment: boolean;
}

/** The withdrawal step (§5.2) for one delivered event. */
export async function withdrawOnStop(
  event: Pick<OutboxDeliveryEvent, "type" | "orderId" | "fromStatus">,
  executor: OrderExecutor,
): Promise<WithdrawalOutcome> {
  const none = { withdrawn: 0, adjustment: false } as const;
  if (!isWithdrawalEvent(event.type)) return none;
  if (event.fromStatus === null || NOT_WITHDRAWN_FROM.has(event.fromStatus)) {
    return none;
  }
  const reason = WITHDRAWN_REASON[event.type];
  const withdrawn = (
    await executor.execute(sql`
      UPDATE order_assignment
      SET withdrawn_at = now(), withdrawn_reason = ${reason}
      WHERE order_id = ${event.orderId}
        AND withdrawn_at IS NULL
        AND (response IS NULL OR response = 'accept')
      RETURNING id`)
  ).map((row) => WithdrawnRow.parse(row));

  let adjustment = false;
  if (
    event.type === "order.cancelled" &&
    AFTER_ACCEPTANCE.has(event.fromStatus)
  ) {
    // The accepted assignment this cancel stopped (withdrawn now, or by a first run of this row).
    const [accepted] = await executor.execute(sql`
      SELECT id, partner_id FROM order_assignment
      WHERE order_id = ${event.orderId} AND response = 'accept'
        AND withdrawn_reason = ${reason}
      ORDER BY attempt DESC LIMIT 1`);
    if (accepted !== undefined) {
      const row = AcceptedRow.parse(accepted);
      const inserted = await executor.execute(sql`
        INSERT INTO payout_adjustment (order_id, partner_id, assignment_id, kind, status)
        VALUES (${event.orderId}, ${row.partner_id}, ${row.id},
                ${WITHDRAWN_AFTER_ACCEPTANCE}, 'open')
        ON CONFLICT (assignment_id) DO NOTHING
        RETURNING id`);
      adjustment = inserted.length === 1;
    }
  }
  return { withdrawn: withdrawn.length, adjustment };
}
