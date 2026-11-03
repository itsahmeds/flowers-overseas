/**
 * Cancel from the admin order page (spec 020a §2.3, §5.2 "Cancel", AC-13 to AC-15; spec 013 §5.2
 * "Cancellation"; TASK-358).
 *
 * `adminOrderCancel(input, deps)` is the server action's body: `requirePermission('orders.cancel')`
 * is its first statement (admin only, §13 Q2), then the input is parsed with `AdminCancelSchema`
 * (`other` needs a note), then the action runs through `runOrderAction` (lock, replay,
 * `expectedSeq`, the `admin_order_action` row and its audit row, the note as `audit_log.reason`).
 *
 * The effect checks the availability table for the locked status: set E offers `buyer_cancel`,
 * `no_partner` and `other`; `accepted` and `paid` offer `buyer_cancel` only, and a forged other
 * reason there is `CANCEL_REASON_NOT_ALLOWED`; every other status has no cancel control, and a
 * forged cancel there is `ORDER_TRANSITION_ILLEGAL`. Then spec 013's `cancelOrder(orderId,
 * admin:{userId}, reason)` on the action's transaction writes `order.cancelled` through the
 * engine, with its own identical rules as the last word. Nothing here moves money: the `payments`
 * outbox target refunds the remaining balance in full, the `routing` target withdraws the
 * assignment (one `payout_adjustment` from `accepted` or `paid`), the `notifications` target
 * sends B5. There is no amount: a cancel always refunds in full.
 *
 * Not re-exported from `./index.ts`, for `./refund.ts`'s reason: this file imports the payments
 * barrel. The server action imports it by path.
 */
import type { AdminSession } from "@/lib/auth/admin";
import { cancelOrder, type CancelOrderRefusal } from "@/modules/payments";

import type { AdminPermission } from "../permissions.ts";
import { ORDER_ACTION_AVAILABILITY } from "./availability.ts";
import {
  type EffectContext,
  type EffectOutcome,
  type RunOrderActionDeps,
  runOrderAction,
} from "./run.ts";
import {
  type AdminCancelInput,
  AdminCancelSchema,
  type AdminOrderActionCode,
  type AdminOrderActionResult,
} from "./schemas.ts";

export interface AdminOrderCancelDeps extends RunOrderActionDeps {
  /** Spec 012's `requirePermission`; tests pass their own. */
  readonly guard?: (permission: AdminPermission) => Promise<AdminSession>;
  readonly requestId?: string;
}

/** `cancelOrder`'s refusals in spec 020a's codes (§5.2 "Result"). */
const REFUSAL_CODE: Readonly<Record<CancelOrderRefusal, AdminOrderActionCode>> =
  Object.freeze({
    CANCEL_REASON_NOT_ALLOWED: "CANCEL_REASON_NOT_ALLOWED",
    ORDER_TRANSITION_ILLEGAL: "ORDER_TRANSITION_ILLEGAL",
    ORDER_ACTOR_NOT_ALLOWED: "FORBIDDEN",
    ORDER_ACTOR_INVALID: "FORBIDDEN",
    ORDER_NOT_FOUND: "INPUT_INVALID",
  });

function cancelEffect(
  input: AdminCancelInput,
): (context: EffectContext) => Promise<EffectOutcome> {
  return async ({ executor, order, actor }) => {
    const reasons = ORDER_ACTION_AVAILABILITY[order.status].cancelReasons;
    if (reasons.length === 0) {
      return { ok: false, code: "ORDER_TRANSITION_ILLEGAL" };
    }
    if (!reasons.includes(input.reason)) {
      return { ok: false, code: "CANCEL_REASON_NOT_ALLOWED" };
    }
    const result = await cancelOrder(order.id, actor, input.reason, {
      executor,
    });
    if (result.kind === "refused") {
      return { ok: false, code: REFUSAL_CODE[result.code] };
    }
    return {
      ok: true,
      resultRef: result.eventId,
      record: { reason: input.reason },
    };
  };
}

/**
 * Cancels an order before production, as the signed-in admin (spec 020a §2.3). Returns `ok` with
 * the `order.cancelled` event id as `resultRef`, or a refusal code.
 */
export async function adminOrderCancel(
  input: unknown,
  deps: AdminOrderCancelDeps = {},
): Promise<AdminOrderActionResult> {
  const session = await (deps.guard ?? defaultGuard)("orders.cancel");
  const parsed = AdminCancelSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INPUT_INVALID" };
  const data = parsed.data;
  return runOrderAction(
    {
      kind: "cancel",
      input: data,
      userId: session.userId,
      ...(deps.requestId === undefined ? {} : { requestId: deps.requestId }),
      ...(data.note === undefined ? {} : { note: data.note }),
    },
    cancelEffect(data),
    deps,
  );
}

async function defaultGuard(
  permission: AdminPermission,
): Promise<AdminSession> {
  const { requirePermission } = await import("../guard.ts");
  return requirePermission(permission);
}
