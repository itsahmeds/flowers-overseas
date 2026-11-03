/**
 * `buyerRefundLines(orderId)` (spec 018 §5.2; AC-10; TASK-339): the order's succeeded refunds,
 * oldest first, as buyer lines, read from spec 013's `succeededRefunds`, their one source: never
 * a `requested`, `pending`, `failed` or `cancelled` row, and dated by `refund.succeeded_at`, never
 * an event's time, so a refund that settled after the order left the set where it writes an order
 * event (spec 013 AC-29) still has its line.
 *
 * Deliberately **not** in the `orders` barrel: it imports the `payments` module, and the barrel is
 * imported by pages that must not carry payments' checkout copy (`src/modules/i18n/review-scope.ts`).
 * Its callers import this file directly: the tracking routes under `(track)`, which hand it to
 * `getTrackingView` as its `refundLines` source, and spec 016's buyer emails (TASK-333) from the
 * job worker.
 */
import { succeededRefunds } from "@/modules/payments";

import { type BuyerRefundLine, toBuyerRefundLines } from "./refund-lines";
import type { EngineConnection } from "./service/executor";

export async function buyerRefundLines(
  orderId: string,
  options: EngineConnection = {},
): Promise<BuyerRefundLine[]> {
  return toBuyerRefundLines(await succeededRefunds(orderId, options));
}
