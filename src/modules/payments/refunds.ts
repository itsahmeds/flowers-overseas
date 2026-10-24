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
 *     not duplicated; an order with nothing left to refund gets nothing. `0026`'s
 *     `refund_order_ceiling` is the database's second line for the per-order ceiling.
 *  2. `submitRefund`: the provider call, keyed by the refund row's id, so a retry (the outbox's,
 *     or `payments.sweep` (d)'s) is the same refund at the provider.
 *  3. `settleRefund`: one money fact, one event. Under the payment and refund row locks, only if
 *     the row is not yet `succeeded`: `succeeded`, `succeeded_at`, the payment's
 *     `amount_refunded_minor`, and on a `cancelled` or `cancelled_refunded` order row 32
 *     (`order.refunded_full`, status unchanged) by `system:payments`.
 *
 * TASK-261 adds the rest of §5.2 "Refunds" on the same three steps (AC-28 to AC-30):
 *
 *  - `refund({ orderId, amount, reason, actor })`: the general request, with its typed refusals
 *    (no provider call and no row on any of them), under the same `payment` then order locks.
 *    There is no destination parameter: a refund goes back to the original method only (§8).
 *  - `settleRefund` writes row 30 (`order.refunded_partial`) in set F while the order's own
 *    succeeded refunds stay below its `buyer_total_minor`, row 31 (`order.refunded_full`) when
 *    they reach it, row 32 on the cancelled states; anywhere else it keeps the money fact on the
 *    row, writes no order event and raises `payment.refund_state_mismatch`.
 *  - `applyProviderRefund`: the webhook settlement (`refund.*`, `charge.refunded`), which works
 *    from the refund as the provider holds it now, so any order of arrival converges.
 *  - `succeededRefunds(orderId)`: spec 018's one source of "Refunded {amount} on {date}".
 *
 * Logs and alerts carry ids, amounts and codes only.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { isCurrencyCode, type CurrencyCode } from "@/config/currencies";
import { captureAlert } from "@/lib/sentry";
import { logger } from "@/lib/logger";
import type { Money } from "@/modules/i18n";
import {
  ActorSchema,
  actorClass,
  appendEvent,
  transition,
  withExecutor,
  type AlertRaiser,
  type EngineConnection,
  type OrderExecutor,
} from "@/modules/orders";

import { RefundReasonSchema, type RefundReason } from "./events.ts";
import { PAYMENTS_ACTOR, type PaymentTransaction } from "./context.ts";
import {
  isProviderFailure,
  type PaymentProvider,
  type ProviderRefund,
} from "./provider.ts";
import { IN_CANCELLED, IN_CLOSED_UNPAID, IN_SET_F } from "./states.ts";

/** The refund statuses that count against a ceiling (spec 013 §5.2 "Refunds"). */
export const REFUND_COUNTED_STATUSES = [
  "requested",
  "pending",
  "succeeded",
] as const;

const CANCELLED_STATES = IN_CANCELLED;
const CLOSED_UNPAID = IN_CLOSED_UNPAID;

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
  const payload = {
    mode: order.mode,
    refund_id: refund.id,
    amount_minor: refund.amount_minor,
    currency_code: refund.currency_code,
    reason: refund.reason,
  };
  if (CANCELLED_STATES.has(order.status)) {
    // Row 32: status unchanged.
    await transition(
      refund.order_id,
      "order.refunded_full",
      PAYMENTS_ACTOR,
      payload,
      { executor },
    );
  } else if (IN_SET_F.has(order.status)) {
    // Rows 30 and 31 are decided by the named order's own succeeded refunds against its own
    // total, never by the purchase's payment (spec 013 §14 A-founder-2026-10-22 item 6).
    const [settled] = await executor.execute(sql`
      SELECT coalesce(sum(amount_minor), 0) AS total FROM refund
      WHERE order_id = ${refund.order_id} AND status = 'succeeded'`);
    const full = sumOf(settled) >= order.buyer_total_minor;
    await transition(
      refund.order_id,
      full ? "order.refunded_full" : "order.refunded_partial",
      PAYMENTS_ACTOR,
      payload,
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

// ---------------------------------------------------------------------------------------------
// refund (spec 013 §5.2 "Refunds"; AC-28, AC-29; TASK-261)
// ---------------------------------------------------------------------------------------------

/**
 * What `refund` is asked for. No destination field exists: a refund goes back to the original
 * method only (§8, `plan/07` §9).
 */
export interface RefundInput {
  readonly orderId: string;
  readonly amount: Money;
  readonly reason: RefundReason;
  /** Whoever asks (`admin:{userId}`, `system:payments`, …): `requested_by` and the event's actor. */
  readonly actor: string;
}

/** Why `refund` wrote nothing. Every refusal makes no provider call and writes no row. */
export type RefundRefusal =
  /** The amount is not a positive safe integer of minor units. */
  | "REFUND_AMOUNT_INVALID"
  /** The amount's currency is not the payment's. */
  | "CURRENCY_MISMATCH"
  /** The named order's refunds would pass its own `buyer_total_minor`. */
  | "REFUND_EXCEEDS_ORDER"
  /** The purchase's refunds would pass what its payment captured. */
  | "REFUND_EXCEEDS_CAPTURED"
  /** On a cancelled or closed-unpaid order, only the order's remaining balance may be refunded. */
  | "REFUND_AMOUNT_NOT_BALANCE"
  /** No captured payment, or the order's state allows no refund (`closed` included). */
  | "NOT_REFUNDABLE";

export type RefundResult =
  | {
      readonly kind: "requested";
      readonly refundId: string;
      readonly submitted: SubmitOutcome;
    }
  | {
      readonly kind: "refused";
      readonly code: RefundRefusal;
      readonly status?: string;
    };

/** Positive safe-integer minor units, or `null` (`REFUND_AMOUNT_INVALID`). */
function refundMinor(units: unknown): number | null {
  if (typeof units === "bigint") {
    return units > 0n && units <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(units)
      : null;
  }
  return typeof units === "number" && Number.isSafeInteger(units) && units > 0
    ? units
    : null;
}

/** The anomaly refund's actors (§5.2 "Refunds": `system:payments` or an admin). */
function anomalyActor(actor: string): boolean {
  if (actor === PAYMENTS_ACTOR) return true;
  const parsed = ActorSchema.safeParse(actor);
  return parsed.success && actorClass(parsed.data) === "admin";
}

type RequestDecision =
  | { readonly kind: "requested"; readonly refundId: string }
  | {
      readonly kind: "refused";
      readonly code: RefundRefusal;
      readonly status?: string;
    };

/**
 * Refunds `amount` of the order `orderId` to the original method (spec 013 §5.2 "Refunds",
 * §14 A-founder-2026-10-22 item 6). Under the purchase's `payment` row lock, then the order's:
 *
 *  - the amount is a positive integer in the payment's currency;
 *  - the order is in set F (rows 30, 31), or `cancelled` / `cancelled_refunded` (row 32), or, for
 *    the reconcile anomaly, `abandoned` / `payment_failed` with actor `system:payments` or an
 *    admin and reason `other`; in the last two the amount must be the order's remaining balance;
 *  - the order's `requested`, `pending` and `succeeded` refunds plus `amount` stay within its
 *    `buyer_total_minor` (`REFUND_EXCEEDS_ORDER`), and the purchase's within what was captured
 *    (`REFUND_EXCEEDS_CAPTURED`). The lock serialises two concurrent refunds on one purchase, so
 *    of two that fit alone but not together exactly one is written; `0028`'s
 *    `refund_order_ceiling` trigger is the database's second line.
 *
 * Then it inserts the `requested` row and appends `order.refund_requested` with the requester as
 * actor, commits, and sends it (`submitRefund`, keyed by the row's id).
 */
export async function refund(
  input: RefundInput,
  deps: RefundDeps,
): Promise<RefundResult> {
  const orderId = z.uuid().parse(input.orderId);
  const reason = RefundReasonSchema.parse(input.reason);
  const actor = ActorSchema.parse(input.actor);
  const amountMinor = refundMinor(input.amount.amountMinor);
  if (amountMinor === null) {
    return { kind: "refused", code: "REFUND_AMOUNT_INVALID" };
  }
  const currency: string = input.amount.currency;
  const d = resolve(deps);

  const requested = await d.transaction(
    async (executor): Promise<RequestDecision> => {
      const [paymentRaw] = await executor.execute(sql`
        SELECT p.id, p.purchase_id, p.status, p.currency_code, p.amount_captured_minor
        FROM payment p JOIN "order" o ON o.purchase_id = p.purchase_id
        WHERE o.id = ${orderId} AND p.status = 'captured'
        FOR UPDATE OF p`);
      const [orderRaw] = await executor.execute(sql`
        SELECT status, mode, buyer_total_minor, buyer_currency_code
        FROM "order" WHERE id = ${orderId} FOR UPDATE`);
      if (orderRaw === undefined) {
        return { kind: "refused", code: "NOT_REFUNDABLE" };
      }
      const order = OrderRow.parse(orderRaw);
      if (paymentRaw === undefined) {
        return {
          kind: "refused",
          code: "NOT_REFUNDABLE",
          status: order.status,
        };
      }
      const payment = PaymentRow.parse(paymentRaw);
      if (currency !== payment.currency_code) {
        return { kind: "refused", code: "CURRENCY_MISMATCH" };
      }

      let balanceOnly: boolean;
      if (IN_SET_F.has(order.status)) {
        balanceOnly = false;
      } else if (CANCELLED_STATES.has(order.status)) {
        balanceOnly = true;
      } else if (
        CLOSED_UNPAID.has(order.status) &&
        reason === "other" &&
        anomalyActor(actor)
      ) {
        balanceOnly = true;
      } else {
        return {
          kind: "refused",
          code: "NOT_REFUNDABLE",
          status: order.status,
        };
      }

      const [orderAsked] = await executor.execute(sql`
        SELECT coalesce(sum(amount_minor), 0) AS total FROM refund
        WHERE order_id = ${orderId} AND status IN ${counted}`);
      const remaining = order.buyer_total_minor - sumOf(orderAsked);
      if (balanceOnly && amountMinor !== remaining) {
        return { kind: "refused", code: "REFUND_AMOUNT_NOT_BALANCE" };
      }
      if (amountMinor > remaining) {
        return { kind: "refused", code: "REFUND_EXCEEDS_ORDER" };
      }
      const [paymentAsked] = await executor.execute(sql`
        SELECT coalesce(sum(amount_minor), 0) AS total FROM refund
        WHERE payment_id = ${payment.id} AND status IN ${counted}`);
      if (amountMinor > payment.amount_captured_minor - sumOf(paymentAsked)) {
        return { kind: "refused", code: "REFUND_EXCEEDS_CAPTURED" };
      }

      const [inserted] = await executor.execute(sql`
        INSERT INTO refund (payment_id, order_id, purchase_id, amount_minor, currency_code, reason,
                            status, requested_by)
        VALUES (${payment.id}, ${orderId}, ${payment.purchase_id}, ${amountMinor},
                ${payment.currency_code}, ${reason}, 'requested', ${actor})
        RETURNING id`);
      const refundId = z.uuid().parse(inserted?.["id"]);
      await appendEvent(
        orderId,
        "order.refund_requested",
        actor,
        {
          mode: order.mode,
          refund_id: refundId,
          amount_minor: amountMinor,
          currency_code: payment.currency_code,
          reason,
        },
        { executor },
      );
      return { kind: "requested", refundId };
    },
  );

  if (requested.kind === "refused") {
    logger.info(
      { order_id: orderId, outcome: requested.code },
      "payments.refund_refused",
    );
    return requested;
  }
  const submitted = await submitRefund(requested.refundId, deps);
  logger.info(
    {
      order_id: orderId,
      refund_id: requested.refundId,
      submitted: submitted.kind,
    },
    "payments.refund_requested",
  );
  return { ...requested, submitted };
}

// ---------------------------------------------------------------------------------------------
// Webhook settlement (`refund.*`, `charge.refunded`; AC-24, AC-29)
// ---------------------------------------------------------------------------------------------

export type ProviderRefundApplied =
  /** The refund row moved (a reference, `pending`, `succeeded` with its event, or `failed`). */
  | "changed"
  /** The row already says what the provider says: a stale or repeated notification. */
  | "unchanged"
  /** No refund row of ours matches the provider's refund. */
  | "unknown";

/**
 * Brings our refund row to the provider's refund as it is now, in the caller's transaction (the
 * webhook run's). Matched by `provider_ref`, or, when the create response was lost, by the
 * `refund_id` the refund carries in its metadata. A success settles through `settleRefund`
 * (one money fact, one event), so `refund.updated` and `charge.refunded` for one refund write one
 * event whichever comes first.
 */
export async function applyProviderRefund(
  executor: OrderExecutor,
  remote: ProviderRefund,
  now: Date,
  alert: AlertRaiser,
): Promise<ProviderRefundApplied> {
  const [byRef] = await executor.execute(sql`
    SELECT id FROM refund WHERE provider_ref = ${remote.ref}`);
  let id: string | undefined =
    byRef === undefined ? undefined : z.uuid().parse(byRef["id"]);
  const ours = z.uuid().safeParse(remote.refundId);
  if (id === undefined && ours.success) {
    const [byId] = await executor.execute(sql`
      SELECT id FROM refund WHERE id = ${ours.data} AND provider_ref IS NULL`);
    id = byId === undefined ? undefined : z.uuid().parse(byId["id"]);
  }
  if (id === undefined) return "unknown";
  const row = await lockRefund(executor, id);
  if (row === null) return "unknown";

  let changed = false;
  if (row.provider_ref === null || row.status === "requested") {
    if (row.status === "requested") {
      await executor.execute(sql`
        UPDATE refund SET provider_ref = ${remote.ref}, status = 'pending' WHERE id = ${id}`);
      changed = true;
    } else if (row.provider_ref === null) {
      await executor.execute(sql`
        UPDATE refund SET provider_ref = ${remote.ref} WHERE id = ${id}`);
      changed = true;
    }
  }

  if (remote.status === "succeeded") {
    if (await settleRefund(executor, id, now, alert)) changed = true;
  } else if (remote.status === "failed" || remote.status === "canceled") {
    if (row.status === "requested" || row.status === "pending") {
      await markFailed(
        executor,
        row,
        remote.failureCode ?? remote.status,
        remote.ref,
        alert,
      );
      changed = true;
    } else if (row.status === "succeeded") {
      // The money came back to us after it had reached the buyer: the money fact and its event
      // stand, and the founder looks at it.
      alert("payment.refund_failed", {
        order_id: row.order_id,
        refund_id: row.id,
        code: remote.failureCode ?? remote.status,
      });
    }
  }
  return changed ? "changed" : "unchanged";
}

// ---------------------------------------------------------------------------------------------
// succeededRefunds (AC-30)
// ---------------------------------------------------------------------------------------------

export interface SucceededRefund {
  readonly amount: Money;
  readonly succeededAt: Date;
}

const SucceededRow = z.object({
  amount_minor: Minor,
  currency_code: z.string().transform((value, ctx): CurrencyCode => {
    if (isCurrencyCode(value)) return value;
    ctx.addIssue({ code: "custom", message: "not a currency of ours" });
    return z.NEVER;
  }),
  succeeded_at: z.union([z.date(), z.string()]).transform((v) => new Date(v)),
});

/**
 * The order's succeeded refunds, oldest first: the one source of spec 018's "Refunded {amount}
 * on {date}" (advisor F4). `requested`, `pending` and `failed` rows are never returned, and the
 * date is the row's `succeeded_at`, never an event's `occurred_at`.
 */
export async function succeededRefunds(
  orderId: string,
  options: EngineConnection = {},
): Promise<SucceededRefund[]> {
  const id = z.uuid().parse(orderId);
  const rows = await withExecutor(options, "payments.refunds", (executor) =>
    executor.execute(sql`
      SELECT amount_minor, currency_code, succeeded_at FROM refund
      WHERE order_id = ${id} AND status = 'succeeded'
      ORDER BY succeeded_at, id`),
  );
  return rows.map((raw) => {
    const row = SucceededRow.parse(raw);
    return {
      amount: {
        amountMinor: row.amount_minor,
        currency: row.currency_code,
      },
      succeededAt: row.succeeded_at,
    };
  });
}
