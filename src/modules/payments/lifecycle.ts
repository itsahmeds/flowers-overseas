/**
 * The payment lifecycle, payment half (spec 013 §5.2 "How a paid order flows", "Reconcile",
 * "Routing hand-off", "Jobs" (b) to (d); §14 A-founder-2026-10-22 items 3 to 5; AC-11, AC-12,
 * AC-14 integration half, AC-17, AC-18, AC-49; TASK-257).
 *
 * **One payment per purchase** (spec 010 §13 Q19). A purchase is one checkout of one to five
 * orders; one intent is created for `purchase.total_minor`, and until it is paid the purchase's
 * orders move together:
 *
 *  - `startPayment(purchaseId)` inserts the `pending` payment row (with `purchase_id`) **before**
 *    the provider call and commits it, then creates one intent with idempotency key
 *    `pi:create:{paymentId}`. A second call for the same purchase returns the same intent.
 *  - `reconcile(paymentId, intent)` is the one place a provider state becomes an order
 *    transition. It works from the **retrieved** intent, never an event body. Under the `payment`
 *    row lock, then the orders' locks by id ascending (the lock order every money write on a
 *    purchase takes), it compares the intent with `purchase.total_minor` and its currency, then
 *    applies §5.2's reconcile table to **every order of the purchase in one transaction**, each
 *    event through spec 010's `transition` / `appendEvent` (ADR-0009), actor `system:payments`.
 *    Row 2 writes one outbox row per order, so the `routing` hand-off is one delivery per order.
 *  - `syncFromProvider(purchaseId)` retrieves the intent and reconciles: the return route's call.
 *  - `sweepPayments()` (`payments.sweep`): (b) a purchase still `placed` two hours after it was
 *    created is reconciled first, then closed at the provider, and only once the provider
 *    confirms the cancel are its orders closed (row 4, or row 3 after a failed attempt), in one
 *    transaction; (c) a `pending` payment that never reached the provider is set `failed`; (d) a
 *    `requested` refund five minutes old is sent again with its own key (`refunds.ts`); there
 *    is no hold branch (the founder's ruling of 2026-10-14, §14; AC-18).
 *
 * Charge at once: no intent asks for a hold, so row 1 (`authorised`) and row 15 are never written
 * here, and `provider.capture` is called only by the `requires_capture` recovery (AC-14). No
 * exported function takes an amount (AC-9): every amount is read from the purchase.
 *
 * Expected outcomes are typed results; a throw is a bug (or spec 010's engine error, unchanged).
 * Logs and alerts carry ids and codes only, never a person's data.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { isCurrencyCode } from "@/config/currencies";
import {
  PENDING_PAYMENT_TIMEOUT_MINUTES,
  REQUESTED_REFUND_RETRY_MINUTES,
  UNPAID_PURCHASE_TIMEOUT_MINUTES,
} from "@/config/payments";
import { captureAlert } from "@/lib/sentry";
import { logger } from "@/lib/logger";
import {
  appendEvent,
  orderReference,
  transition,
  withExecutor,
  type AlertRaiser,
  type OrderExecutor,
} from "@/modules/orders";

import { PAYMENTS_ACTOR, type PaymentTransaction } from "./context.ts";
import "./events";
import { paymentMethodTypesFor, type MethodSources } from "./methods.ts";
import {
  isProviderFailure,
  minorUnitsForProvider,
  type PaymentProvider,
  type ProviderIntent,
  type ProviderMethodType,
} from "./provider.ts";
import { staleRequestedRefunds, submitRefund } from "./refunds.ts";

export { PAYMENTS_ACTOR, type PaymentTransaction } from "./context.ts";
/** The sweep's actor (§5.2 "Jobs"). */
export const SWEEP_ACTOR = "system:payments.sweep";

/** What the lifecycle needs from outside: the provider, a transaction, a clock, an alert. */
export interface LifecycleDeps {
  readonly provider: PaymentProvider;
  /** Defaults to a fresh `system` transaction (`withSystemContext('payments', …)`). */
  readonly transaction?: PaymentTransaction;
  readonly now?: () => Date;
  readonly alert?: AlertRaiser;
  /**
   * The `payments.method.{id}` flags that are on, and optionally the method registry (tests).
   * Defaults to no flag: with no method on, `startPayment` answers `payments_unavailable` and
   * creates nothing (fail closed until the method flags are seeded and flipped in admin).
   */
  readonly methodSources?: () => Promise<MethodSources>;
}

const systemTransaction: PaymentTransaction = (fn) =>
  withExecutor(undefined, "payments", fn);

interface Resolved {
  readonly provider: PaymentProvider;
  readonly transaction: PaymentTransaction;
  readonly now: () => Date;
  readonly alert: AlertRaiser;
  readonly methodSources: () => Promise<MethodSources>;
}

function resolve(deps: LifecycleDeps): Resolved {
  return {
    provider: deps.provider,
    transaction: deps.transaction ?? systemTransaction,
    now: deps.now ?? (() => new Date()),
    alert: deps.alert ?? captureAlert,
    methodSources:
      deps.methodSources ??
      (() => Promise.resolve({ enabledFlags: new Set<string>() })),
  };
}

// ---------------------------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------------------------

const Minor = z.union([z.number(), z.string()]).transform((value, ctx) => {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(number)) {
    ctx.addIssue({ code: "custom", message: "not a safe integer" });
    return z.NEVER;
  }
  return number;
});

const PurchaseRow = z.object({
  id: z.uuid(),
  mode: z.enum(["demo", "test", "live"]),
  buyer_currency_code: z.string().regex(/^[A-Z]{3}$/),
  total_minor: Minor,
  customer_id: z.uuid().nullable(),
});
type Purchase = z.infer<typeof PurchaseRow>;

const OrderRow = z.object({
  id: z.uuid(),
  status: z.string().min(1),
  buyer_total_minor: Minor,
  destination_iso2: z.string().regex(/^[A-Z]{2}$/),
  buyer_country: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .nullable(),
});
type Order = z.infer<typeof OrderRow>;

const PaymentRow = z.object({
  id: z.uuid(),
  purchase_id: z.uuid(),
  status: z.string().min(1),
  provider_ref: z.string().nullable(),
  amount_minor: Minor,
  currency_code: z.string(),
  attempts: Minor,
  last_decline_ref: z.string().nullable(),
});
type Payment = z.infer<typeof PaymentRow>;

/** The statuses a payment row is "live" in (the partial unique index of `0026`). */
const ENDED_PAYMENT = ["cancelled", "failed"] as const;

/** Orders still waiting for their money (A6 row 2's `from`). */
const PLACED = "placed";
/** The two closed-unpaid states (rows 3 and 4): a capture after them is an anomaly. */
const CLOSED_UNPAID: ReadonlySet<string> = new Set([
  "abandoned",
  "payment_failed",
]);

async function lockPurchase(
  executor: OrderExecutor,
  purchaseId: string,
): Promise<Purchase | null> {
  const [row] = await executor.execute(sql`
    SELECT id, mode, buyer_currency_code, total_minor, customer_id
    FROM purchase WHERE id = ${purchaseId} FOR UPDATE`);
  return row === undefined ? null : PurchaseRow.parse(row);
}

async function readPurchase(
  executor: OrderExecutor,
  purchaseId: string,
): Promise<Purchase | null> {
  const [row] = await executor.execute(sql`
    SELECT id, mode, buyer_currency_code, total_minor, customer_id
    FROM purchase WHERE id = ${purchaseId}`);
  return row === undefined ? null : PurchaseRow.parse(row);
}

/**
 * The purchase's orders, locked by id ascending (the lock order of every money write on a
 * purchase), returned in basket order: the checkout line's position, then id. Only the buyer's
 * declared country is read from the snapshot, never the rest of it.
 */
async function lockOrders(
  executor: OrderExecutor,
  purchaseId: string,
): Promise<Order[]> {
  await executor.execute(sql`
    SELECT o.id FROM "order" o WHERE o.purchase_id = ${purchaseId}
    ORDER BY o.id FOR UPDATE OF o`);
  const rows = await executor.execute(sql`
    SELECT o.id, o.status, o.buyer_total_minor, c.iso2 AS destination_iso2,
           o.buyer_snapshot ->> 'countryIso2' AS buyer_country
    FROM "order" o
    JOIN country c ON c.id = o.destination_country_id
    LEFT JOIN checkout_draft_line l ON l.order_id = o.id
    WHERE o.purchase_id = ${purchaseId}
    ORDER BY l.position NULLS LAST, o.id`);
  return rows.map((row) => OrderRow.parse(row));
}

const PAYMENT_COLUMNS = sql`id, purchase_id, status, provider_ref, amount_minor, currency_code,
  attempts, last_decline_ref`;

async function lockPayment(
  executor: OrderExecutor,
  paymentId: string,
): Promise<Payment | null> {
  const [row] = await executor.execute(sql`
    SELECT ${PAYMENT_COLUMNS} FROM payment WHERE id = ${paymentId} FOR UPDATE`);
  return row === undefined ? null : PaymentRow.parse(row);
}

/** The purchase's live payment, or `null`. */
async function livePayment(
  executor: OrderExecutor,
  purchaseId: string,
  lock: boolean,
): Promise<Payment | null> {
  const [row] = await executor.execute(sql`
    SELECT ${PAYMENT_COLUMNS} FROM payment
    WHERE purchase_id = ${purchaseId}
      AND status NOT IN (${ENDED_PAYMENT[0]}, ${ENDED_PAYMENT[1]})
    ${lock ? sql`FOR UPDATE` : sql``}`);
  return row === undefined ? null : PaymentRow.parse(row);
}

/** The value `payment.provider` holds: the fake stands in for Stripe in tests. */
function providerColumn(provider: PaymentProvider): "stripe" | "mollie" {
  return provider.name === "mollie" ? "mollie" : "stripe";
}

function minorOf(intent: ProviderIntent): number {
  return minorUnitsForProvider(intent.amount.amountMinor);
}

// ---------------------------------------------------------------------------------------------
// startPayment
// ---------------------------------------------------------------------------------------------

export type StartPaymentResult =
  | {
      readonly kind: "started";
      readonly paymentId: string;
      readonly intentRef: string;
      /** For the Payment Element only: never logged, never stored. */
      readonly clientSecret: string;
    }
  | { readonly kind: "payments_unavailable" }
  | {
      readonly kind: "not_payable";
      readonly reason: "no_purchase" | "demo" | "not_placed" | "paid_or_closed";
    };

interface Prepared {
  readonly paymentId: string;
  readonly providerRef: string | null;
  readonly purchase: Purchase;
  readonly orders: readonly Order[];
  readonly methodTypes: readonly [ProviderMethodType, ...ProviderMethodType[]];
  readonly isFirstOrder: boolean;
}

/** Whether the customer has paid for anything before (a non-personal fact for Radar). */
async function isFirstOrder(
  executor: OrderExecutor,
  purchase: Purchase,
): Promise<boolean> {
  if (purchase.customer_id === null) return true;
  const [row] = await executor.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM payment p JOIN purchase u ON u.id = p.purchase_id
      WHERE u.customer_id = ${purchase.customer_id} AND u.id <> ${purchase.id}
        AND p.status = 'captured'
    ) AS paid_before`);
  return row?.["paid_before"] !== true;
}

/**
 * Starts (or resumes) the one payment of a placed purchase: the `pending` row is committed
 * before the provider is called, and the intent is created from the purchase with key
 * `pi:create:{paymentId}`. Returns the intent's client secret for the Payment Element.
 */
export async function startPayment(
  purchaseId: string,
  deps: LifecycleDeps,
): Promise<StartPaymentResult> {
  const id = z.uuid().parse(purchaseId);
  const d = resolve(deps);
  const sources = await d.methodSources();

  const prepared = await d.transaction(
    async (
      executor,
    ): Promise<Prepared | Exclude<StartPaymentResult, { kind: "started" }>> => {
      const purchase = await lockPurchase(executor, id);
      if (purchase === null)
        return { kind: "not_payable", reason: "no_purchase" };
      if (purchase.mode === "demo")
        return { kind: "not_payable", reason: "demo" };
      const orders = await lockOrders(executor, id);
      if (orders.length === 0 || orders.some((o) => o.status !== PLACED)) {
        return { kind: "not_payable", reason: "not_placed" };
      }
      const buyerCountry = orders[0]?.buyer_country ?? null;
      if (buyerCountry === null) return { kind: "payments_unavailable" };
      const types = paymentMethodTypesFor(
        {
          buyerCountryDeclared: buyerCountry,
          currency: purchase.buyer_currency_code,
        },
        sources,
      ).providerTypes;
      const [first, ...rest] = types;
      if (first === undefined) return { kind: "payments_unavailable" };
      const existing = await livePayment(executor, id, true);
      if (existing?.status === "captured") {
        return { kind: "not_payable", reason: "paid_or_closed" };
      }
      let paymentId = existing?.id;
      if (paymentId === undefined) {
        const [row] = await executor.execute(sql`
          INSERT INTO payment (purchase_id, provider, status, amount_minor, currency_code,
                               livemode)
          VALUES (${id}, ${providerColumn(d.provider)}, 'pending', ${purchase.total_minor},
                  ${purchase.buyer_currency_code}, ${purchase.mode === "live"})
          RETURNING id`);
        paymentId = z.uuid().parse(row?.["id"]);
      }
      return {
        paymentId,
        providerRef: existing?.provider_ref ?? null,
        purchase,
        orders,
        methodTypes: [first, ...rest],
        isFirstOrder: await isFirstOrder(executor, purchase),
      };
    },
  );
  if (!("paymentId" in prepared)) return prepared;

  const { purchase, orders, paymentId } = prepared;
  const currency = purchase.buyer_currency_code;
  if (!isCurrencyCode(currency)) return { kind: "payments_unavailable" };
  const destinations = [...new Set(orders.map((o) => o.destination_iso2))];
  const [firstDestination, ...otherDestinations] = destinations;
  if (firstDestination === undefined) return { kind: "payments_unavailable" };
  const intent = await d.provider.createIntent({
    amount: {
      amountMinor: purchase.total_minor,
      currency,
    },
    captureMethod: "automatic",
    methodTypes: prepared.methodTypes,
    metadata: {
      purchaseId: purchase.id,
      paymentId,
      orderCount: orders.length,
      destinationCountries: [firstDestination, ...otherDestinations],
      buyerCountryDeclared: orders[0]?.buyer_country ?? "",
      isFirstOrder: prepared.isFirstOrder,
      orderMode: purchase.mode === "live" ? "live" : "test",
    },
    description: orders.map((o) => orderReference(o.id)).join(", "),
    idempotencyKey: `pi:create:${paymentId}`,
  });
  if (isProviderFailure(intent)) {
    logger.warn(
      {
        purchase_id: purchase.id,
        payment_id: paymentId,
        failure: intent.failure,
      },
      "payments.start_unavailable",
    );
    return { kind: "payments_unavailable" };
  }
  if (prepared.providerRef === null) {
    await d.transaction(async (executor) => {
      await executor.execute(sql`
        UPDATE payment SET provider_ref = ${intent.ref}
        WHERE id = ${paymentId} AND provider_ref IS NULL`);
    });
  }
  logger.info(
    {
      purchase_id: purchase.id,
      payment_id: paymentId,
      order_count: orders.length,
    },
    "payments.started",
  );
  return {
    kind: "started",
    paymentId,
    intentRef: intent.ref,
    clientSecret: intent.clientSecret,
  };
}

// ---------------------------------------------------------------------------------------------
// reconcile
// ---------------------------------------------------------------------------------------------

export type ReconcileOutcome =
  | "captured"
  | "attempt_failed"
  | "captured_after_close"
  | "amount_mismatch"
  | "unexpected_cancel"
  | "waiting"
  | "unchanged"
  | "stale"
  | "no_payment";

export interface ReconcileResult {
  readonly outcome: ReconcileOutcome;
  readonly paymentId: string | null;
  readonly purchaseId: string | null;
}

/** What the transaction decided, and what must happen at the provider after it commits. */
interface Decision {
  readonly result: ReconcileResult;
  readonly after?: "cancel_intent";
  /** `captured_after_close`: the refunds to send once the transaction has committed. */
  readonly refundIds?: readonly string[];
}

/** An intent state the order has not passed: decide nothing, wait. */
const WAITING: ReadonlySet<string> = new Set([
  "processing",
  "requires_action",
  "requires_confirmation",
]);

function payloadOf(mode: string, fields: Record<string, unknown>): object {
  return { mode, ...fields };
}

/**
 * Writes row 2 on every order of the purchase, in the caller's transaction, after setting the
 * payment `captured` with `captured_at` = the injected clock.
 */
async function captureAll(
  executor: OrderExecutor,
  payment: Payment,
  purchase: Purchase,
  orders: readonly Order[],
  intent: ProviderIntent,
  now: Date,
): Promise<void> {
  await setCaptured(executor, payment, intent, now);
  for (const order of orders) {
    await transition(
      order.id,
      "order.captured",
      PAYMENTS_ACTOR,
      payloadOf(purchase.mode, { payment_id: payment.id, provider_call: true }),
      { executor },
    );
  }
}

async function setCaptured(
  executor: OrderExecutor,
  payment: Payment,
  intent: ProviderIntent,
  now: Date,
): Promise<void> {
  await executor.execute(sql`
    UPDATE payment
    SET status = 'captured', capture_method = 'automatic',
        amount_captured_minor = amount_minor, captured_at = ${now.toISOString()}::timestamptz,
        provider_ref = coalesce(provider_ref, ${intent.ref}),
        method = coalesce(method, ${intent.methodType ?? "card"}),
        card_brand = coalesce(card_brand, ${intent.cardBrand ?? null}),
        card_last4 = coalesce(card_last4, ${intent.cardLast4 ?? null})
    WHERE id = ${payment.id}`);
}

/**
 * Applies §5.2's reconcile table for `intent` to the payment `paymentId` and every order of its
 * purchase. Works from the retrieved intent only. Idempotent: a state the orders have passed
 * writes nothing.
 */
export async function reconcile(
  paymentId: string,
  intent: ProviderIntent,
  deps: LifecycleDeps,
): Promise<ReconcileResult> {
  const id = z.uuid().parse(paymentId);
  const d = resolve(deps);

  // `requires_capture` is not expected at launch (no intent asks for a hold): capture at once,
  // raise the alert, then reconcile the intent the capture returned (row 2, never row 1).
  if (intent.status === "requires_capture") {
    const captured = await d.provider.capture(intent.ref, `capture:${id}`);
    d.alert("payment.unexpected_hold", { payment_id: id });
    if (isProviderFailure(captured)) {
      logger.warn(
        { payment_id: id, failure: captured.failure },
        "payments.capture_failed_retry",
      );
      return { outcome: "waiting", paymentId: id, purchaseId: null };
    }
    return reconcile(id, captured, deps);
  }

  const decision = await d.transaction(async (executor): Promise<Decision> => {
    const payment = await lockPayment(executor, id);
    if (payment === null) {
      return {
        result: { outcome: "no_payment", paymentId: id, purchaseId: null },
      };
    }
    const purchase = await readPurchase(executor, payment.purchase_id);
    const orders = await lockOrders(executor, payment.purchase_id);
    const base = { paymentId: id, purchaseId: payment.purchase_id };
    if (purchase === null || orders.length === 0) {
      return { result: { outcome: "stale", ...base } };
    }
    const statuses = new Set(orders.map((o) => o.status));
    const allPlaced = statuses.size === 1 && statuses.has(PLACED);
    const allClosedUnpaid = [...statuses].every((s) => CLOSED_UNPAID.has(s));

    if (intent.status === "canceled") {
      if ((ENDED_PAYMENT as readonly string[]).includes(payment.status)) {
        return { result: { outcome: "unchanged", ...base } };
      }
      d.alert("payment.unexpected_cancel", {
        payment_id: id,
        purchase_id: payment.purchase_id,
      });
      return { result: { outcome: "unexpected_cancel", ...base } };
    }

    if (WAITING.has(intent.status)) {
      return { result: { outcome: allPlaced ? "waiting" : "stale", ...base } };
    }

    // Price charged = price shown: the intent must be for the purchase's total, in its currency.
    if (
      minorOf(intent) !== purchase.total_minor ||
      intent.amount.currency !== purchase.buyer_currency_code
    ) {
      if (payment.status === "captured" || !allPlaced) {
        return { result: { outcome: "stale", ...base } };
      }
      await executor.execute(sql`
        UPDATE payment SET status = 'failed', failed_at = ${d.now().toISOString()}::timestamptz
        WHERE id = ${id}`);
      d.alert("payment.amount_mismatch", {
        payment_id: id,
        purchase_id: payment.purchase_id,
      });
      return {
        result: { outcome: "amount_mismatch", ...base },
        after: "cancel_intent",
      };
    }

    if (intent.status === "succeeded") {
      if (allPlaced) {
        await captureAll(executor, payment, purchase, orders, intent, d.now());
        return { result: { outcome: "captured", ...base } };
      }
      if (allClosedUnpaid && payment.status !== "captured") {
        await setCaptured(executor, payment, intent, d.now());
        const refundIds: string[] = [];
        for (const order of orders) {
          const [row] = await executor.execute(sql`
            INSERT INTO refund (payment_id, order_id, purchase_id, amount_minor, currency_code,
                                reason, status, requested_by)
            VALUES (${id}, ${order.id}, ${payment.purchase_id}, ${order.buyer_total_minor},
                    ${purchase.buyer_currency_code}, 'other', 'requested', ${PAYMENTS_ACTOR})
            RETURNING id`);
          const refundId = z.uuid().parse(row?.["id"]);
          refundIds.push(refundId);
          await appendEvent(
            order.id,
            "order.refund_requested",
            PAYMENTS_ACTOR,
            payloadOf(purchase.mode, {
              refund_id: refundId,
              amount_minor: order.buyer_total_minor,
              currency_code: purchase.buyer_currency_code,
              reason: "other",
            }),
            { executor },
          );
        }
        d.alert("payment.captured_after_close", {
          payment_id: id,
          purchase_id: payment.purchase_id,
        });
        return {
          result: { outcome: "captured_after_close", ...base },
          refundIds,
        };
      }
      return { result: { outcome: "stale", ...base } };
    }

    // `requires_payment_method`: a decline, counted once per decline reference.
    if (intent.status === "requires_payment_method") {
      const decline = intent.lastDecline;
      if (
        !allPlaced ||
        decline === undefined ||
        decline.ref === payment.last_decline_ref
      ) {
        return {
          result: { outcome: allPlaced ? "unchanged" : "stale", ...base },
        };
      }
      const attempt = payment.attempts + 1;
      await executor.execute(sql`
        UPDATE payment SET attempts = ${attempt}, last_decline_code = ${decline.code},
                           last_decline_ref = ${decline.ref}
        WHERE id = ${id}`);
      const declineCode = /^[a-z][a-z0-9_]{0,63}$/.test(decline.code)
        ? decline.code
        : null;
      for (const order of orders) {
        await appendEvent(
          order.id,
          "order.payment_attempt_failed",
          PAYMENTS_ACTOR,
          payloadOf(purchase.mode, {
            payment_id: id,
            attempt,
            decline_code: declineCode,
          }),
          { executor },
        );
      }
      return { result: { outcome: "attempt_failed", ...base } };
    }
    return { result: { outcome: "unchanged", ...base } };
  });

  // Refunded at once (§5.2 reconcile table): each row is committed before its provider call,
  // keyed by its own id; one the provider does not answer is retried by the sweep's (d).
  for (const refundId of decision.refundIds ?? []) {
    await submitRefund(refundId, deps);
  }
  if (decision.after === "cancel_intent") {
    const cancelled = await d.provider.cancel(intent.ref, `void:${id}`);
    if (isProviderFailure(cancelled)) {
      logger.warn(
        { payment_id: id, failure: cancelled.failure },
        "payments.cancel_failed",
      );
    }
  }
  logger.info(
    {
      payment_id: id,
      purchase_id: decision.result.purchaseId,
      outcome: decision.result.outcome,
      intent_status: intent.status,
    },
    "payments.reconcile",
  );
  return decision.result;
}

/**
 * Retrieves the purchase's intent and reconciles it (the return route's call, and the sweep's
 * first step). A purchase with no payment at the provider yet answers `no_payment`.
 */
export async function syncFromProvider(
  purchaseId: string,
  deps: LifecycleDeps,
): Promise<ReconcileResult> {
  const id = z.uuid().parse(purchaseId);
  const d = resolve(deps);
  const payment = await d.transaction((executor) =>
    livePayment(executor, id, false),
  );
  if (payment === null) {
    return { outcome: "no_payment", paymentId: null, purchaseId: id };
  }
  if (payment.provider_ref === null) {
    return { outcome: "no_payment", paymentId: payment.id, purchaseId: id };
  }
  const intent = await d.provider.retrieveIntent(payment.provider_ref);
  if (isProviderFailure(intent)) {
    logger.warn(
      { purchase_id: id, failure: intent.failure },
      "payments.sync_unavailable",
    );
    return { outcome: "waiting", paymentId: payment.id, purchaseId: id };
  }
  return reconcile(payment.id, intent, deps);
}

// ---------------------------------------------------------------------------------------------
// The sweep (payments.sweep)
// ---------------------------------------------------------------------------------------------

export interface SweepCounts {
  /** Purchases closed (rows 3 or 4 on every order). */
  readonly closed: number;
  /** Purchases the provider reported paid while sweeping (row 2 on every order). */
  readonly paid: number;
  /** Purchases left `placed` (money may be moving, or the provider refused the cancel). */
  readonly kept: number;
  /** `pending` payments that never reached the provider, set `failed`. */
  readonly failedPending: number;
  /** `requested` refunds sent to the provider again with their own key ((d), TASK-258). */
  readonly refundsRetried: number;
}

/** Closes every order of the purchase (row 3 after a failed attempt, else row 4) in one go. */
async function closeUnpaid(
  executor: OrderExecutor,
  purchaseId: string,
  payment: Payment | null,
  now: Date,
): Promise<boolean> {
  const purchase = await readPurchase(executor, purchaseId);
  const orders = await lockOrders(executor, purchaseId);
  if (purchase === null || orders.some((o) => o.status !== PLACED))
    return false;
  if (payment !== null) {
    // `cancelled` needs the method that was tried (A7's `payment_method_required_check`); an
    // intent nobody ever paid with has none, so its row ends `failed` instead. Either way the
    // row is no longer live, and reconcile reads a later `canceled` as our own.
    await executor.execute(sql`
      UPDATE payment
      SET status = CASE WHEN method IS NULL THEN 'failed' ELSE 'cancelled' END,
          failed_at = CASE WHEN method IS NULL THEN ${now.toISOString()}::timestamptz
                      ELSE failed_at END
      WHERE id = ${payment.id} AND status NOT IN ('cancelled', 'failed', 'captured')`);
  }
  const failed = payment !== null && payment.attempts > 0;
  for (const order of orders) {
    await transition(
      order.id,
      failed ? "order.payment_failed" : "order.abandoned",
      SWEEP_ACTOR,
      failed
        ? payloadOf(purchase.mode, {
            payment_id: payment.id,
            attempts: payment.attempts,
          })
        : payloadOf(purchase.mode, { payment_id: payment?.id ?? null }),
      { executor },
    );
  }
  logger.info(
    {
      purchase_id: purchaseId,
      at: now.toISOString(),
      outcome: failed ? "payment_failed" : "abandoned",
    },
    "payments.sweep_closed",
  );
  return true;
}

/**
 * One run of `payments.sweep`: (b) unpaid purchases past the timeout, (c) `pending` payments that
 * never reached the provider. No branch captures, cancels a paid order or refunds a lapse (AC-18).
 */
export async function sweepPayments(deps: LifecycleDeps): Promise<SweepCounts> {
  const d = resolve(deps);
  const now = d.now();
  let closed = 0;
  let paid = 0;
  let kept = 0;

  // (c) first, so a purchase whose payment never reached the provider has no live payment left.
  const pendingCutoff = new Date(
    now.getTime() - PENDING_PAYMENT_TIMEOUT_MINUTES * 60_000,
  );
  const failedPending = await d.transaction(async (executor) => {
    const rows = await executor.execute(sql`
      UPDATE payment SET status = 'failed', failed_at = ${now.toISOString()}::timestamptz
      WHERE status = 'pending' AND provider_ref IS NULL
        AND created_at <= ${pendingCutoff.toISOString()}::timestamptz
      RETURNING id`);
    return rows.length;
  });

  // (b) purchases every order of which is still `placed` past the timeout, test and live only.
  const cutoff = new Date(
    now.getTime() - UNPAID_PURCHASE_TIMEOUT_MINUTES * 60_000,
  );
  const due = await d.transaction(async (executor) => {
    const rows = await executor.execute(sql`
      SELECT u.id FROM purchase u
      WHERE u.mode IN ('test', 'live')
        AND u.created_at <= ${cutoff.toISOString()}::timestamptz
        AND EXISTS (SELECT 1 FROM "order" o WHERE o.purchase_id = u.id)
        AND NOT EXISTS (
          SELECT 1 FROM "order" o WHERE o.purchase_id = u.id AND o.status <> 'placed')
      ORDER BY u.created_at, u.id`);
    return rows.map((row) => z.uuid().parse(row["id"]));
  });

  for (const purchaseId of due) {
    const synced = await syncFromProvider(purchaseId, deps);
    if (synced.outcome === "captured") {
      paid += 1;
      continue;
    }
    const payment = await d.transaction((executor) =>
      livePayment(executor, purchaseId, false),
    );
    if (payment === null || payment.provider_ref === null) {
      // Nothing at the provider: close at once (row 4).
      const done = await d.transaction((executor) =>
        closeUnpaid(executor, purchaseId, null, now),
      );
      if (done) closed += 1;
      else kept += 1;
      continue;
    }
    const intent = await d.provider.retrieveIntent(payment.provider_ref);
    if (
      isProviderFailure(intent) ||
      intent.status === "processing" ||
      intent.status === "succeeded"
    ) {
      kept += 1;
      continue;
    }
    // Cancel at the provider first; close only once it confirms.
    const cancelled =
      intent.status === "canceled"
        ? intent
        : await d.provider.cancel(payment.provider_ref, `void:${payment.id}`);
    if (isProviderFailure(cancelled) || cancelled.status !== "canceled") {
      kept += 1;
      continue;
    }
    const done = await d.transaction(async (executor) => {
      const locked = await lockPayment(executor, payment.id);
      return closeUnpaid(executor, purchaseId, locked, now);
    });
    if (done) closed += 1;
    else kept += 1;
  }

  // (d) a `requested` refund older than five minutes never got its answer: the same key again.
  const refundCutoff = new Date(
    now.getTime() - REQUESTED_REFUND_RETRY_MINUTES * 60_000,
  );
  const stale = await d.transaction((executor) =>
    staleRequestedRefunds(executor, refundCutoff),
  );
  let refundsRetried = 0;
  for (const refundId of stale) {
    await submitRefund(refundId, deps);
    refundsRetried += 1;
  }

  logger.info(
    {
      closed,
      paid,
      kept,
      failed_pending: failedPending,
      refunds_retried: refundsRetried,
    },
    "payments.sweep",
  );
  return { closed, paid, kept, failedPending, refundsRetried };
}
