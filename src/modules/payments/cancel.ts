/**
 * Cancellation (spec 013 §5.2 "Cancellation"; spec 002 §14 A10.2; AC-15, AC-45; TASK-258).
 *
 * `cancelOrder(orderId, actor, reason)` is the **only** way any actor cancels an order before
 * production; nobody writes `order.cancelled` through `transition` directly. It applies
 * `order.cancelled` through spec 010's engine (ADR-0009):
 *
 *  - from A6's set E (row 13) for `buyer`, `admin` and `system`, with any reason;
 *  - from `accepted` and `paid` (rows 39 and 40, set P, the buyer's free-cancellation window
 *    until the delivery morning) for `buyer` and `admin` with reason `buyer_cancel` only: any
 *    other reason there is `CANCEL_REASON_NOT_ALLOWED`, and `system` is the engine's
 *    `ORDER_ACTOR_NOT_ALLOWED` (no system process cancels an accepted order);
 *  - from `in_production` or later, the engine's `ORDER_TRANSITION_ILLEGAL`; nothing is written
 *    and no provider is called.
 *
 * The status check and the write happen under the order's row lock, so a concurrent
 * `payments.production_start` tick and a cancel cannot both apply (AC-45). The refund is not
 * made here: `order.cancelled` routes to the `payments` outbox target, whose handler
 * (`paymentsOutboxHandler`) refunds the cancelled order's remaining balance only (`refunds.ts`).
 *
 * Optional `executor`: spec 020a's admin action writes its action row, its audit row and the
 * status in one transaction (spec 020a §12 request 1).
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { logger } from "@/lib/logger";
import {
  ActorSchema,
  actorClass,
  isOrderEngineError,
  transition,
  withExecutor,
  type EngineConnection,
  type OrderErrorCode,
  registerOutboxHandler,
  type OutboxHandler,
} from "@/modules/orders";

import "./events";
import { deliverAcceptance } from "./acceptance.ts";
import { stripeProviderFromEnv } from "./provider-env.ts";
import { RefundReasonSchema, type RefundReason } from "./events.ts";
import { refundCancelledOrder, type RefundDeps } from "./refunds.ts";

/** The two states rows 39 and 40 cancel from (set P minus set E). */
const AFTER_ACCEPTANCE: ReadonlySet<string> = new Set(["accepted", "paid"]);

/**
 * The classes rows 39 and 40 allow, whose reason is checked there. Every other class is the
 * engine's `ORDER_ACTOR_NOT_ALLOWED`, whatever the reason (AC-15).
 */
const REASON_CHECKED: ReadonlySet<string> = new Set(["buyer", "admin"]);

/** The one reason a cancel from `accepted` or `paid` may carry (spec 002 §14 A10.2). */
const BUYER_CANCEL: RefundReason = "buyer_cancel";

export type CancelOrderRefusal =
  | "CANCEL_REASON_NOT_ALLOWED"
  | Extract<
      OrderErrorCode,
      | "ORDER_NOT_FOUND"
      | "ORDER_TRANSITION_ILLEGAL"
      | "ORDER_ACTOR_NOT_ALLOWED"
      | "ORDER_ACTOR_INVALID"
    >;

export type CancelOrderResult =
  | {
      readonly kind: "cancelled";
      readonly eventId: string;
      readonly seq: number;
      readonly fromStatus: string;
    }
  | { readonly kind: "refused"; readonly code: CancelOrderRefusal };

const ENGINE_REFUSALS = [
  "ORDER_NOT_FOUND",
  "ORDER_TRANSITION_ILLEGAL",
  "ORDER_ACTOR_NOT_ALLOWED",
  "ORDER_ACTOR_INVALID",
] as const;

const OrderRow = z.object({
  status: z.string().min(1),
  mode: z.enum(["demo", "test", "live"]),
});

/** Cancels one order (§5.2 "Cancellation"). Writes nothing on any refusal. */
export async function cancelOrder(
  orderId: string,
  actor: string,
  reason: RefundReason,
  options: EngineConnection = {},
): Promise<CancelOrderResult> {
  const id = z.uuid().parse(orderId);
  const why = RefundReasonSchema.parse(reason);
  return withExecutor(options, "payments.cancel", async (executor) => {
    const [row] = await executor.execute(sql`
      SELECT status, mode FROM "order" WHERE id = ${id} FOR UPDATE`);
    if (row === undefined) return { kind: "refused", code: "ORDER_NOT_FOUND" };
    const order = OrderRow.parse(row);
    const parsedActor = ActorSchema.safeParse(actor);
    if (
      AFTER_ACCEPTANCE.has(order.status) &&
      parsedActor.success &&
      REASON_CHECKED.has(actorClass(parsedActor.data)) &&
      why !== BUYER_CANCEL
    ) {
      return { kind: "refused", code: "CANCEL_REASON_NOT_ALLOWED" };
    }
    try {
      const written = await transition(
        id,
        "order.cancelled",
        actor,
        { mode: order.mode, reason: why },
        { executor },
      );
      logger.info(
        { order_id: id, from_status: written.fromStatus, reason: why },
        "payments.cancelled",
      );
      return {
        kind: "cancelled",
        eventId: written.eventId,
        seq: written.seq,
        fromStatus: written.fromStatus,
      };
    } catch (error) {
      for (const code of ENGINE_REFUSALS) {
        if (isOrderEngineError(error, code)) return { kind: "refused", code };
      }
      throw error;
    }
  });
}

/** The provider, or how to build it at the first refund (the worker reads the env then). */
export type ProviderSource =
  RefundDeps["provider"] | (() => RefundDeps["provider"]);

export interface PaymentsOutboxDeps extends Omit<RefundDeps, "provider"> {
  readonly provider: ProviderSource;
}

/**
 * The `payments` outbox target's handler (spec 013 §5.2 "Outbox routes"):
 *
 *  - `assignment.accepted`: the acceptance delivery (`./acceptance.ts`, TASK-259), in the
 *    delivery's own transaction: row 14 and, past the production-start instant, row 16; nothing
 *    for an order no longer `accepted`; `PAYMENT_NOT_CAPTURED` (retried, then `dead`) when the
 *    payment is not captured. No provider call, so the provider is never built for it.
 *  - `order.cancelled` and `order.cancelled_refunded`: refund the cancelled order's remaining
 *    balance. The refund runs in its own transactions (`refunds.ts`), never the delivery's, so a
 *    delivery that rolls back after the provider answered resumes the same refund row and the
 *    same idempotency key.
 *
 * Registered with `registerOutboxHandler('payments', …)` by `registerPaymentsOutbox`.
 */
export function paymentsOutboxHandler(deps: PaymentsOutboxDeps): OutboxHandler {
  const now = deps.now ?? (() => new Date());
  return async (event, context) => {
    if (event.type === "assignment.accepted") {
      await deliverAcceptance(event, context.executor, now());
      return;
    }
    if (
      event.type === "order.cancelled" ||
      event.type === "order.cancelled_refunded"
    ) {
      const provider =
        typeof deps.provider === "function" ? deps.provider() : deps.provider;
      await refundCancelledOrder(event.orderId, { ...deps, provider });
      return;
    }
    throw new Error(
      `PAYMENTS_NOT_CONFIGURED: no payments branch for ${event.type} yet`,
    );
  };
}

/**
 * Registers the `payments` target's handler once per process (the worker's job table): the
 * provider is built from the environment at the first refund, so a process without Stripe keys
 * still delivers acceptances, and a cancel delivery there throws and is retried.
 */
export function registerPaymentsOutbox(
  deps: PaymentsOutboxDeps = { provider: () => stripeProviderFromEnv() },
): void {
  registerOutboxHandler("payments", paymentsOutboxHandler(deps));
}
