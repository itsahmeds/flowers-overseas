/**
 * Refund in full and refund in part, from the admin order page (spec 020a §2.4, §5.2 "Money
 * input", "Refund", AC-17 to AC-21; TASK-359).
 *
 * `adminOrderRefund(input)` is the server action's body: `requirePermission('orders.refund')` is
 * its first statement, then the input is parsed with `AdminRefundSchema`, then the action runs
 * through `runOrderAction` (lock, replay, `expectedSeq`, the `admin_order_action` row and its
 * audit row). The effect decides the amount **on the server**, under the lock:
 *
 *  - `full`: exactly the remaining balance (the order's total, captured, minus its `requested`,
 *    `pending` and `succeeded` refunds). The reason is the admin's in set F; on a `cancelled` or
 *    `cancelled_refunded` order whose automatic refund failed, the cancellation's own reason; on
 *    an `abandoned` or `payment_failed` order with a captured payment (spec 013's reconcile
 *    anomaly), `other`. In the last two the server fixes the reason and ignores the field.
 *  - `partial`: `parseMinorUnits(amountText, order currency)` on digit strings, then at least one
 *    minor unit and strictly below the remaining balance; exactly the balance is refused with the
 *    "use Refund in full" hint, above it with `REFUND_EXCEEDS_CAPTURED`. No provider call either way.
 *
 * Then spec 013's `requestRefund` writes the `requested` row and `order.refund_requested` in this
 * transaction, with every one of its invariants unchanged (the payment's currency, a positive
 * integer, the order's and the purchase's ceilings, the original method only); after the commit
 * `submitRefund` calls the provider, keyed by the refund row's id.
 *
 * The refund row, its events and the provider call are spec 013's; nothing here writes them.
 *
 * Not re-exported from `./index.ts`: this file imports the payments barrel (the Stripe adapter
 * and its `payments.error.*` checkout copy), and the admin barrel that re-exports `./index.ts` is
 * imported by every admin page, so `pnpm i18n:check`'s scope rule would count that copy on them.
 * The server action that calls it imports this file by path (TASK-361).
 */
import { sql } from "drizzle-orm";

import { isCurrencyCode } from "@/config/currencies";
import type { AdminSession } from "@/lib/auth/admin";
import type { OrderExecutor } from "@/modules/orders";
import {
  type RefundDeps,
  type RefundReason,
  RefundReasonSchema,
  type RefundRefusal,
  requestRefund,
  submitRefund,
} from "@/modules/payments";

import type { AdminPermission } from "../permissions.ts";
import { availableActions, type UnavailableCause } from "./availability.ts";
import { parseMinorUnits } from "./money.ts";
import { readRefundState } from "./refund-state.ts";
import {
  type EffectContext,
  type EffectOutcome,
  type RunOrderActionDeps,
  runOrderAction,
} from "./run.ts";
import {
  type AdminOrderActionCode,
  type AdminOrderActionResult,
  type AdminRefundInput,
  AdminRefundSchema,
} from "./schemas.ts";

export interface AdminOrderRefundDeps extends RunOrderActionDeps {
  /** Spec 012's `requirePermission`; tests pass their own. */
  readonly guard?: (permission: AdminPermission) => Promise<AdminSession>;
  /** The provider and transaction `submitRefund` uses after the commit. */
  readonly refund: RefundDeps;
  readonly requestId?: string;
}

/** Spec 013's refusals in spec 020a's codes (§5.2 "Result"). */
const REFUSAL_CODE: Readonly<Record<RefundRefusal, AdminOrderActionCode>> =
  Object.freeze({
    REFUND_AMOUNT_INVALID: "AMOUNT_INVALID",
    CURRENCY_MISMATCH: "CURRENCY_MISMATCH",
    REFUND_EXCEEDS_ORDER: "REFUND_EXCEEDS_CAPTURED",
    REFUND_EXCEEDS_CAPTURED: "REFUND_EXCEEDS_CAPTURED",
    REFUND_AMOUNT_NOT_BALANCE: "NOT_REFUNDABLE",
    NOT_REFUNDABLE: "NOT_REFUNDABLE",
  });

/** Why a refund control is absent, as the code a forged submission gets. */
function unavailableCode(cause: UnavailableCause): AdminOrderActionCode {
  if (cause === "permission") return "FORBIDDEN";
  if (cause === "demo") return "DEMO_ORDER";
  return "NOT_REFUNDABLE";
}

/** The reason of the order's latest cancellation event, else `other`. */
async function cancellationReason(
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

function refundEffect(
  input: AdminRefundInput,
  session: AdminSession,
  deps: AdminOrderRefundDeps,
): (context: EffectContext) => Promise<EffectOutcome> {
  return async ({ executor, order, actor }) => {
    if (!isCurrencyCode(order.currencyCode)) {
      return { ok: false, code: "CURRENCY_MISMATCH" };
    }
    const currency = order.currencyCode;
    const state = await readRefundState(executor, order);
    const available = availableActions(
      {
        status: order.status,
        mode: order.mode,
        capturedMinor: state.capturedMinor,
        remainingMinor: state.remainingMinor,
        refundInFlight: state.refundInFlight,
      },
      { roles: session.roles },
    );

    let amountMinor: bigint;
    let reason: RefundReason;
    if (input.kind === "full") {
      const control = available.refundFull;
      if (!control.available) {
        return { ok: false, code: unavailableCode(control.cause) };
      }
      amountMinor = state.remainingMinor;
      reason =
        control.reasonSource === "chosen"
          ? input.reason
          : control.reasonSource === "other"
            ? "other"
            : await cancellationReason(executor, order.id);
    } else {
      const control = available.refundPartial;
      if (!control.available) {
        return { ok: false, code: unavailableCode(control.cause) };
      }
      const parsed = parseMinorUnits(input.amountText, currency);
      if (!parsed.ok) return { ok: false, code: "AMOUNT_INVALID" };
      if (parsed.amountMinor === state.remainingMinor) {
        return {
          ok: false,
          code: "REFUND_EXCEEDS_CAPTURED",
          hint: "use_full_refund",
        };
      }
      if (parsed.amountMinor > state.remainingMinor) {
        return { ok: false, code: "REFUND_EXCEEDS_CAPTURED" };
      }
      amountMinor = parsed.amountMinor;
      reason = input.reason;
    }

    const requested = await requestRefund(
      {
        orderId: order.id,
        amount: { amountMinor, currency },
        reason,
        actor,
      },
      executor,
    );
    if (requested.kind === "refused") {
      return { ok: false, code: REFUSAL_CODE[requested.code] };
    }
    return {
      ok: true,
      resultRef: requested.refundId,
      record: { reason, amountMinor, currencyCode: currency },
      afterCommit: () => submitRefund(requested.refundId, deps.refund),
    };
  };
}

/**
 * Refunds one order in full or in part, as the signed-in admin (spec 020a §2.4). Returns spec
 * 020a's result: `ok` with the refund row's id as `resultRef`, or a refusal code.
 */
export async function adminOrderRefund(
  input: unknown,
  deps: AdminOrderRefundDeps,
): Promise<AdminOrderActionResult> {
  const session = await (deps.guard ?? defaultGuard)("orders.refund");
  const parsed = AdminRefundSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INPUT_INVALID" };
  const data = parsed.data;
  return runOrderAction(
    {
      kind: data.kind === "full" ? "refund_full" : "refund_partial",
      input: data,
      userId: session.userId,
      ...(deps.requestId === undefined ? {} : { requestId: deps.requestId }),
      ...(data.note === undefined ? {} : { note: data.note }),
    },
    refundEffect(data, session, deps),
    deps,
  );
}

async function defaultGuard(
  permission: AdminPermission,
): Promise<AdminSession> {
  const { requirePermission } = await import("../guard.ts");
  return requirePermission(permission);
}
