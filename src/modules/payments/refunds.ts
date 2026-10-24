/**
 * The refund on cancellation (spec 013 §5.2 "Cancellation", "Refunds"; §14 A-founder-2026-10-22
 * item 6; AC-15, AC-51's refund half; TASK-258), and the seam TASK-261's general `refund` service
 * builds on.
 *
 * Money was taken at placement (the founder's ruling, §14), so every cancellation of a paid order
 * is a full refund **of that order**: its `buyer_total_minor` minus its own `requested`, `pending`
 * and `succeeded` refunds, against the purchase's one shared payment, to the original method (no
 * destination parameter exists anywhere), with the cancellation's reason. The purchase's other
 * orders get nothing.
 *
 * Three steps, each its own transaction, so a crash between them resumes and never pays twice:
 *
 *  1. `refundCancelledOrder`: under the `payment` row lock, then the order's (the lock order of
 *     every money write on a purchase), insert one `requested` refund row and append
 *     `order.refund_requested`. A row already `requested` or `pending` for the order is resumed,
 *     not duplicated; an order with nothing left to refund gets nothing. `0028`'s
 *     `refund_order_ceiling` is the database's second line for the per-order ceiling.
 *  2. `submitRefund`: the provider call, keyed by the refund row's id, so a retry (the outbox's,
 *     or `payments.sweep` (d)'s) is the same refund at the provider.
 *  3. `settleRefund`: one money fact, one event. Under the payment and refund row locks, only if
 *     the row is not yet `succeeded`: `succeeded`, `succeeded_at`, the payment's
 *     `amount_refunded_minor`, and on a `cancelled` or `cancelled_refunded` order row 32
 *     (`order.refunded_full`, status unchanged) by `system:payments`.
 *
 * TASK-261 owns the rest of §5.2 "Refunds": `refund({ orderId, amount, reason, actor })` with its
 * typed refusals, rows 30 and 31 in set F, the webhook settlement, `succeededRefunds`,
 * `adminRefund`. Until then a settlement on an order outside the cancelled states writes no event
 * and raises `payment.refund_state_mismatch`.
 *
 * Logs and alerts carry ids, amounts and codes only.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { isCurrencyCode } from "@/config/currencies";
import { captureAlert } from "@/lib/sentry";
import { logger } from "@/lib/logger";
import {
  appendEvent,
  transition,
  withExecutor,
  type AlertRaiser,
  type OrderExecutor,
} from "@/modules/orders";

import { RefundReasonSchema, type RefundReason } from "./events.ts";
import { PAYMENTS_ACTOR, type PaymentTransaction } from "./context.ts";
import { isProviderFailure, type PaymentProvider } from "./provider.ts";

/** The refund statuses that count against a ceiling (spec 013 §5.2 "Refunds"). */
export const REFUND_COUNTED_STATUSES = [
  "requested",
  "pending",
  "succeeded",
] as const;

/** The two states row 32 (`order.refunded_full`, a self-loop) starts from. */
const CANCELLED_STATES: ReadonlySet<string> = new Set([
  "cancelled",
  "cancelled_refunded",
]);

/** The closed-unpaid states of the reconcile anomaly: a refund there writes no order event. */
const CLOSED_UNPAID: ReadonlySet<string> = new Set([
  "abandoned",
  "payment_failed",
]);

export interface RefundDeps {
  readonly provider: PaymentProvider;
  /** Defaults to a fresh `system` transaction (`withSystemContext('payments', …)`). */
  readonly transaction?: PaymentTransaction;
  readonly now?: () => Date;
  readonly alert?: AlertRaiser;
}

interface Resolved {
  readonly provider: PaymentProvider;
  readonly transaction: PaymentTransaction;
  readonly now: () => Date;
  readonly alert: AlertRaiser;
}

const systemTransaction: PaymentTransaction = (fn) =>
  withExecutor(undefined, "payments", fn);

function resolve(deps: RefundDeps): Resolved {
  return {
    provider: deps.provider,
    transaction: deps.transaction ?? systemTransaction,
    now: deps.now ?? (() => new Date()),
    alert: deps.alert ?? captureAlert,
  };
}

const Minor = z.union([z.number(), z.string()]).transform((value, ctx) => {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(number)) {
    ctx.addIssue({ code: "custom", message: "not a safe integer" });
    return z.NEVER;
  }
  return number;
});

const PaymentRow = z.object({
  id: z.uuid(),
  purchase_id: z.uuid(),
  status: z.string().min(1),
  currency_code: z.string().regex(/^[A-Z]{3}$/),
  amount_captured_minor: Minor,
});

const OrderRow = z.object({
  status: z.string().min(1),
  mode: z.enum(["demo", "test", "live"]),
  buyer_total_minor: Minor,
  buyer_currency_code: z.string().regex(/^[A-Z]{3}$/),
});

const RefundRow = z.object({
  id: z.uuid(),
  payment_id: z.uuid(),
  order_id: z.uuid(),
  status: z.string().min(1),
  amount_minor: Minor,
  currency_code: z.string().regex(/^[A-Z]{3}$/),
  reason: RefundReasonSchema,
  provider_ref: z.string().nullable(),
});
type Refund = z.infer<typeof RefundRow>;

const REFUND_COLUMNS = sql`id, payment_id, order_id, status, amount_minor, currency_code, reason,
  provider_ref`;

const counted = sql`(${REFUND_COUNTED_STATUSES[0]}, ${REFUND_COUNTED_STATUSES[1]}, ${REFUND_COUNTED_STATUSES[2]})`;

function sumOf(row: Readonly<Record<string, unknown>> | undefined): number {
  return Minor.parse(row?.["total"] ?? 0);
}

/** The reason the order was cancelled with (its latest cancel event), else `other`. */
async function cancelReason(
  executor: OrderExecutor,
  orderId: string,
): Promise<RefundReason> {
  const [row] = await executor.execute(sql`
    SELECT payload ->> 'reason' AS reason FROM order_event
    WHERE order_id = ${orderId}
      AND type IN ('order.cancelled', 'order.cancelled_refunded')
    ORDER BY seq DESC LIMIT 1`);
  const parsed = RefundReasonSchema.safeParse(row?.["reason"]);
  return parsed.success ? parsed.data : "other";
}

// ---------------------------------------------------------------------------------------------
// 1. Request
// ---------------------------------------------------------------------------------------------

export type CancelRefundOutcome =
  /** A refund row is (now, or already) on its way; `submitted` says how the provider answered. */
  | {
      readonly kind: "requested" | "resumed";
      readonly refundId: string;
      readonly submitted: SubmitOutcome;
    }
  /** The order's own refunds already cover its total. */
  | { readonly kind: "nothing_to_refund" }
  /** No captured payment: nothing was taken, so nothing is returned. */
  | { readonly kind: "not_captured" }
  /** The order is not `cancelled` or `cancelled_refunded`. */
  | { readonly kind: "not_refundable"; readonly status: string }
  /** The shared payment has less headroom than the order's balance (an alert, never a write). */
  | { readonly kind: "exceeds_captured" };

type Requested =
  | { readonly kind: "requested" | "resumed"; readonly refundId: string }
  | Exclude<CancelRefundOutcome, { kind: "requested" | "resumed" }>;

/**
 * The cancel handler's refund: the remaining balance of the cancelled order `orderId`, once.
 * Called by the `payments` outbox delivery of `order.cancelled` / `order.cancelled_refunded`;
 * idempotent, so a redelivery resumes the same refund row.
 */
export async function refundCancelledOrder(
  orderId: string,
  deps: RefundDeps,
): Promise<CancelRefundOutcome> {
  const id = z.uuid().parse(orderId);
  const d = resolve(deps);

  const requested = await d.transaction(
    async (executor): Promise<Requested> => {
      const [paymentRaw] = await executor.execute(sql`
      SELECT p.id, p.purchase_id, p.status, p.currency_code, p.amount_captured_minor
      FROM payment p JOIN "order" o ON o.purchase_id = p.purchase_id
      WHERE o.id = ${id} AND p.status = 'captured'
      FOR UPDATE OF p`);
      if (paymentRaw === undefined) {
        const [held] = await executor.execute(sql`
        SELECT p.id FROM payment p JOIN "order" o ON o.purchase_id = p.purchase_id
        WHERE o.id = ${id} AND p.status = 'authorised'`);
        if (held !== undefined) {
          // Launch never creates a hold (§14). The hold is the purchase's, shared with its other
          // orders, so nothing is voided here: the alert brings the founder to it.
          d.alert("payment.unexpected_hold", {
            order_id: id,
            payment_id: held["id"],
          });
        }
        return { kind: "not_captured" };
      }
      const payment = PaymentRow.parse(paymentRaw);
      const [orderRaw] = await executor.execute(sql`
      SELECT status, mode, buyer_total_minor, buyer_currency_code
      FROM "order" WHERE id = ${id} FOR UPDATE`);
      const order = OrderRow.parse(orderRaw);
      if (!CANCELLED_STATES.has(order.status)) {
        return { kind: "not_refundable", status: order.status };
      }

      const [open] = await executor.execute(sql`
      SELECT id FROM refund
      WHERE order_id = ${id} AND status IN ('requested', 'pending')
      ORDER BY created_at, id LIMIT 1`);
      if (open !== undefined) {
        return { kind: "resumed", refundId: z.uuid().parse(open["id"]) };
      }

      const [orderAsked] = await executor.execute(sql`
      SELECT coalesce(sum(amount_minor), 0) AS total FROM refund
      WHERE order_id = ${id} AND status IN ${counted}`);
      const remaining = order.buyer_total_minor - sumOf(orderAsked);
      if (remaining <= 0) return { kind: "nothing_to_refund" };

      const [paymentAsked] = await executor.execute(sql`
      SELECT coalesce(sum(amount_minor), 0) AS total FROM refund
      WHERE payment_id = ${payment.id} AND status IN ${counted}`);
      const headroom = payment.amount_captured_minor - sumOf(paymentAsked);
      if (
        headroom < remaining ||
        order.buyer_currency_code !== payment.currency_code
      ) {
        d.alert("payment.refund_exceeds_captured", {
          order_id: id,
          payment_id: payment.id,
        });
        return { kind: "exceeds_captured" };
      }

      const reason = await cancelReason(executor, id);
      const [inserted] = await executor.execute(sql`
      INSERT INTO refund (payment_id, order_id, purchase_id, amount_minor, currency_code, reason,
                          status, requested_by)
      VALUES (${payment.id}, ${id}, ${payment.purchase_id}, ${remaining},
              ${payment.currency_code}, ${reason}, 'requested', ${PAYMENTS_ACTOR})
      RETURNING id`);
      const refundId = z.uuid().parse(inserted?.["id"]);
      await appendEvent(
        id,
        "order.refund_requested",
        PAYMENTS_ACTOR,
        {
          mode: order.mode,
          refund_id: refundId,
          amount_minor: remaining,
          currency_code: payment.currency_code,
          reason,
        },
        { executor },
      );
      return { kind: "requested", refundId };
    },
  );

  if (!("refundId" in requested)) {
    logger.info(
      { order_id: id, outcome: requested.kind },
      "payments.cancel_refund",
    );
    return requested;
  }
  const submitted = await submitRefund(requested.refundId, deps);
  logger.info(
    {
      order_id: id,
      refund_id: requested.refundId,
      outcome: requested.kind,
      submitted: submitted.kind,
    },
    "payments.cancel_refund",
  );
  return { ...requested, submitted };
}

// ---------------------------------------------------------------------------------------------
// 2. Submit
// ---------------------------------------------------------------------------------------------

export type SubmitOutcome =
  /** The provider confirmed it; the money fact and its event are written. */
  | { readonly kind: "succeeded" }
  /** The provider accepted it; its webhook settles it (TASK-260/261). */
  | { readonly kind: "pending" }
  /** The provider could not be reached: the row stays `requested` for `payments.sweep` (d). */
  | { readonly kind: "retry" }
  /** The provider refused it: the row is `failed` and `payment.refund_failed` raised. */
  | { readonly kind: "failed" }
  /** The row was no longer `requested` (another run got there first). */
  | { readonly kind: "unchanged"; readonly status: string };

async function lockRefund(
  executor: OrderExecutor,
  refundId: string,
): Promise<Refund | null> {
  // The payment row first, then the refund: the lock order of every money write on a purchase.
  await executor.execute(sql`
    SELECT 1 FROM payment WHERE id = (SELECT payment_id FROM refund WHERE id = ${refundId})
    FOR UPDATE`);
  const [row] = await executor.execute(sql`
    SELECT ${REFUND_COLUMNS} FROM refund WHERE id = ${refundId} FOR UPDATE`);
  return row === undefined ? null : RefundRow.parse(row);
}

async function markFailed(
  executor: OrderExecutor,
  refund: Refund,
  code: string,
  providerRef: string | null,
  alert: AlertRaiser,
): Promise<void> {
  await executor.execute(sql`
    UPDATE refund SET status = 'failed', failure_code = ${code},
                      provider_ref = coalesce(provider_ref, ${providerRef})
    WHERE id = ${refund.id}`);
  alert("payment.refund_failed", {
    order_id: refund.order_id,
    refund_id: refund.id,
    code,
  });
}

/**
 * Sends one `requested` refund to the provider, with its own id as the idempotency key, and
 * records what the provider answered. Safe to call again: the key makes it the same refund.
 */
export async function submitRefund(
  refundId: string,
  deps: RefundDeps,
): Promise<SubmitOutcome> {
  const id = z.uuid().parse(refundId);
  const d = resolve(deps);
  const [row] = await d.transaction((executor) =>
    executor.execute(sql`
      SELECT r.id, r.payment_id, r.order_id, r.status, r.amount_minor, r.currency_code, r.reason,
             r.provider_ref, p.provider_ref AS intent_ref
      FROM refund r JOIN payment p ON p.id = r.payment_id WHERE r.id = ${id}`),
  );
  if (row === undefined) return { kind: "unchanged", status: "missing" };
  const refund = RefundRow.parse(row);
  const intentRef = z.string().nullable().parse(row["intent_ref"]);
  if (refund.status !== "requested") {
    return { kind: "unchanged", status: refund.status };
  }
  if (intentRef === null || !isCurrencyCode(refund.currency_code)) {
    // A captured payment always has its intent; reaching here is a bug, kept visible.
    d.alert("payment.refund_failed", {
      order_id: refund.order_id,
      refund_id: id,
      code: "no_intent",
    });
    return { kind: "retry" };
  }

  const answer = await d.provider.refund(
    intentRef,
    { amountMinor: refund.amount_minor, currency: refund.currency_code },
    id,
    { orderId: refund.order_id, refundId: id, reason: refund.reason },
  );
  if (isProviderFailure(answer) && answer.failure === "unavailable") {
    logger.warn({ refund_id: id }, "payments.refund_retry");
    return { kind: "retry" };
  }

  return d.transaction(async (executor): Promise<SubmitOutcome> => {
    const locked = await lockRefund(executor, id);
    if (locked === null) return { kind: "unchanged", status: "missing" };
    if (isProviderFailure(answer)) {
      if (locked.status !== "requested") {
        return { kind: "unchanged", status: locked.status };
      }
      await markFailed(
        executor,
        locked,
        answer.code ?? answer.failure,
        null,
        d.alert,
      );
      return { kind: "failed" };
    }
    if (answer.status === "failed" || answer.status === "canceled") {
      if (locked.status === "succeeded" || locked.status === "failed") {
        return { kind: "unchanged", status: locked.status };
      }
      await markFailed(
        executor,
        locked,
        answer.failureCode ?? answer.status,
        answer.ref,
        d.alert,
      );
      return { kind: "failed" };
    }
    if (locked.status === "requested") {
      await executor.execute(sql`
        UPDATE refund SET status = 'pending', provider_ref = ${answer.ref}
        WHERE id = ${id}`);
    }
    if (answer.status === "succeeded") {
      await settleRefund(executor, id, d.now(), d.alert);
      return { kind: "succeeded" };
    }
    return { kind: "pending" };
  });
}

// ---------------------------------------------------------------------------------------------
// 3. Settle
// ---------------------------------------------------------------------------------------------

/**
 * One money fact, one event (spec 013 §5.2 "Refunds"), in the caller's transaction: only if the
 * refund is not yet `succeeded`, it becomes `succeeded`, the payment's `amount_refunded_minor`
 * grows by it, and a `cancelled` / `cancelled_refunded` order gets row 32 by `system:payments`.
 * Returns whether it wrote anything.
 */
export async function settleRefund(
  executor: OrderExecutor,
  refundId: string,
  now: Date,
  alert: AlertRaiser,
): Promise<boolean> {
  const refund = await lockRefund(executor, refundId);
  if (refund === null || refund.status === "succeeded") return false;
  if (refund.status === "failed" || refund.status === "cancelled") {
    return false;
  }
  await executor.execute(sql`
    UPDATE refund SET status = 'succeeded', succeeded_at = ${now.toISOString()}::timestamptz
    WHERE id = ${refund.id}`);
  await executor.execute(sql`
    UPDATE payment SET amount_refunded_minor = amount_refunded_minor + ${refund.amount_minor}
    WHERE id = ${refund.payment_id}`);
  const [orderRaw] = await executor.execute(sql`
    SELECT status, mode, buyer_total_minor, buyer_currency_code
    FROM "order" WHERE id = ${refund.order_id} FOR UPDATE`);
  const order = OrderRow.parse(orderRaw);
  if (CANCELLED_STATES.has(order.status)) {
    await transition(
      refund.order_id,
      "order.refunded_full",
      PAYMENTS_ACTOR,
      {
        mode: order.mode,
        refund_id: refund.id,
        amount_minor: refund.amount_minor,
        currency_code: refund.currency_code,
        reason: refund.reason,
      },
      { executor },
    );
  } else if (!CLOSED_UNPAID.has(order.status)) {
    alert("payment.refund_state_mismatch", {
      order_id: refund.order_id,
      refund_id: refund.id,
    });
  }
  return true;
}

// ---------------------------------------------------------------------------------------------
// payments.sweep (d)
// ---------------------------------------------------------------------------------------------

/** `requested` refunds created at or before `cutoff`, oldest first (`payments.sweep` (d)). */
export async function staleRequestedRefunds(
  executor: OrderExecutor,
  cutoff: Date,
): Promise<string[]> {
  const rows = await executor.execute(sql`
    SELECT id FROM refund
    WHERE status = 'requested' AND created_at <= ${cutoff.toISOString()}::timestamptz
    ORDER BY created_at, id`);
  return rows.map((row) => z.uuid().parse(row["id"]));
}
