/**
 * The acceptance handler (spec 013 §5.2 "Production start on acceptance (the `payments` target
 * and 011's seam)"; §14 A-founder-2026-10-14b; AC-13; TASK-259).
 *
 * Spec 011's `respondToOffer` writes `assignment.accepted` (row 7); for `test` and `live` the
 * outbox routes it to `payments`. Two halves:
 *
 *  - `paymentAcceptedOrderEffect`, the accept half of spec 011's `AcceptedOrderEffect` for `test`
 *    and `live` orders (`acceptedOrderEffectFor` picks it; `demoOrderEffect` keeps `demo` orders
 *    only). Its `afterAccept` writes nothing: it only asks the dispatcher to run that order's
 *    pending deliveries now (`outbox.dispatch` with the order id). The outbox row stays the
 *    guarantee, so a nudge that fails is logged and the accept still commits; the minute tick
 *    delivers the row.
 *  - `deliverAcceptance`, the `payments` delivery of `assignment.accepted`, in the delivery's own
 *    transaction. Under the order's row lock: an order no longer `accepted` (the buyer cancelled
 *    it in between, row 39; or a redelivery after it ran) writes nothing and the delivery is
 *    `sent`. Otherwise the payment must be `captured` (row 2 took the money at placement), else
 *    `PAYMENT_NOT_CAPTURED` is thrown, nothing is written and the dispatcher retries until
 *    `dead`. Then row 14 (`order.captured` → `paid`, `provider_call: false`) by
 *    `system:payments`, and, only when the production-start instant has already passed, row 16
 *    (`order.in_production`) in the same transaction by the same actor. **No provider call**:
 *    nothing is held, so nothing is captured here, and `captured_at` stays as row 2 set it.
 *
 * Logs carry ids only.
 */
import { z } from "zod";

import { logger } from "@/lib/logger";
import {
  transition,
  type OrderExecutor,
  type OrderMode,
  type OutboxDeliveryEvent,
} from "@/modules/orders";

import "./events";
import { PAYMENTS_ACTOR } from "./context.ts";
import { productionStartAt, readProductionTiming } from "./production.ts";
import { paymentForOrder } from "./queries.ts";

/** Thrown by the delivery when the order's payment is not `captured` (spec 013 §5.2). */
export class PaymentNotCaptured extends Error {
  readonly code = "PAYMENT_NOT_CAPTURED";

  constructor() {
    super("PAYMENT_NOT_CAPTURED: the order's payment is not captured");
    this.name = "PaymentNotCaptured";
  }
}

export type AcceptanceOutcome =
  | { readonly kind: "captured"; readonly productionStarted: boolean }
  | { readonly kind: "skipped"; readonly status: string };

/**
 * The `payments` delivery of one `assignment.accepted` event, in the delivery's transaction.
 * `now` is the clock the production-start instant is read against.
 */
export async function deliverAcceptance(
  event: Pick<OutboxDeliveryEvent, "orderId">,
  executor: OrderExecutor,
  now: Date,
): Promise<AcceptanceOutcome> {
  const timing = await readProductionTiming(executor, event.orderId, "wait");
  if (timing === null) {
    throw new Error("ORDER_NOT_FOUND: the accepted order does not exist");
  }
  if (timing.status !== "accepted" || timing.mode === "demo") {
    logger.info(
      { order_id: event.orderId, status: timing.status },
      "payments.acceptance_skipped",
    );
    return { kind: "skipped", status: timing.status };
  }
  const payment = await paymentForOrder(event.orderId, { executor });
  if (payment?.status !== "captured") throw new PaymentNotCaptured();

  await transition(
    event.orderId,
    "order.captured",
    PAYMENTS_ACTOR,
    {
      mode: timing.mode,
      payment_id: payment.paymentId,
      provider_call: false,
    },
    { executor },
  );
  const due =
    productionStartAt({
      deliveryDate: timing.delivery_date,
      zone: timing.zone,
    }).getTime() <= now.getTime();
  if (due) {
    await transition(
      event.orderId,
      "order.in_production",
      PAYMENTS_ACTOR,
      { mode: timing.mode },
      { executor },
    );
  }
  logger.info(
    { order_id: event.orderId, production_started: due },
    "payments.acceptance_captured",
  );
  return { kind: "captured", productionStarted: due };
}

// ---------------------------------------------------------------------------------------------
// The accept half of spec 011's seam
// ---------------------------------------------------------------------------------------------

/** What spec 011's seam passes (its `EffectContext`, structurally). */
export interface AcceptContext {
  readonly orderId: string;
  readonly mode: OrderMode;
  readonly executor?: OrderExecutor;
}

/** The accept half of spec 011's `AcceptedOrderEffect`. */
export interface PaymentAcceptEffect {
  afterAccept(context: AcceptContext): Promise<void>;
}

/** Asks the dispatcher to run one order's pending deliveries now. */
export type OutboxNudge = (orderId: string) => Promise<void>;

/** The correlation id of the nudge (`plan/11` §1's `system:{job}`). */
const NUDGE_REQUEST_ID = "system:payments";

/** The production nudge: one `outbox.dispatch` for the order, over `DATABASE_URL_UNPOOLED`. */
export const pgBossOutboxNudge: OutboxNudge = async (orderId) => {
  const id = z.uuid().parse(orderId);
  const { enqueue, ensureQueue, withBoss } = await import("@/jobs/runtime");
  await withBoss(async (boss) => {
    await ensureQueue(boss, "outbox.dispatch");
    await enqueue(
      boss,
      "outbox.dispatch",
      { orderId: id },
      { requestId: NUDGE_REQUEST_ID },
    );
  });
};

/** `paymentAcceptedOrderEffect` over `nudge` (pg-boss by default). */
export function createPaymentAcceptedOrderEffect(
  nudge: OutboxNudge = pgBossOutboxNudge,
): PaymentAcceptEffect {
  return {
    async afterAccept(context) {
      if (context.mode === "demo") return;
      try {
        await nudge(context.orderId);
      } catch (error) {
        // The outbox row is the guarantee: the minute tick delivers it.
        logger.warn(
          {
            order_id: context.orderId,
            error: error instanceof Error ? error.name : "unknown_error",
          },
          "payments.acceptance_nudge_failed",
        );
      }
    },
  };
}

export const paymentAcceptedOrderEffect: PaymentAcceptEffect =
  createPaymentAcceptedOrderEffect();
