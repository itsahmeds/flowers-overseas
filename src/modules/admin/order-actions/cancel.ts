/**
 * Cancel an order from the admin order page (spec 020a §2.3, §5.2 "Cancel", AC-13 to AC-15;
 * TASK-358, with request 1 of §12 on spec 013's `adminCancel`).
 *
 * `adminOrderCancel(input)` is the server action's body: `requirePermission('orders.cancel')` is
 * its first statement, then the input is parsed with `AdminCancelSchema` (`other` needs a note),
 * then the action runs through `runOrderAction` (lock, replay, `expectedSeq`, the
 * `admin_order_action` row and its audit row in the cancel's transaction). Under the lock:
 *
 *  - the availability table decides first: a status with no cancel control (set F after `paid`,
 *    the cancelled and finished states, `placed`, the payment failures) is
 *    `ORDER_TRANSITION_ILLEGAL`, so a forged cancel on `in_production` writes nothing and calls no
 *    provider (AC-15);
 *  - from `accepted` and `paid` only `buyer_cancel` is offered, and a forged other reason is
 *    `CANCEL_REASON_NOT_ALLOWED` (AC-14), the same rule spec 013's `cancelOrder` enforces itself;
 *  - then spec 013's `cancelOrder(orderId, admin:{userId}, reason)` on this transaction's handle.
 *    Its `order.cancelled` event reaches the `payments` target (the full refund of the remaining
 *    balance), the `routing` target (the florist told to stop, and one `payout_adjustment` from
 *    `accepted` or `paid`) and the `notifications` target (B5). None of that is written here.
 *
 * `result_ref` is the `order.cancelled` event id; the action row's `reason` is the cancel reason.
 * The note is `audit_log.reason` only.
 *
 * Not re-exported from `./index.ts`, for the reason `./refund.ts` gives: it imports the payments
 * barrel, whose checkout copy `pnpm i18n:check`'s scope rule would count on every admin page.
 */
import type { AdminSession } from "@/lib/auth/admin";
import { type CancelOrderRefusal, cancelOrder } from "@/modules/payments";

import type { AdminPermission } from "../permissions.ts";
import { availableActions, type UnavailableCause } from "./availability.ts";
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

/** Spec 013's refusals in spec 020a's codes. An actor refusal cannot happen for `admin:`. */
const REFUSAL_CODE: Readonly<
  Partial<Record<CancelOrderRefusal, AdminOrderActionCode>>
> = Object.freeze({
  CANCEL_REASON_NOT_ALLOWED: "CANCEL_REASON_NOT_ALLOWED",
  ORDER_TRANSITION_ILLEGAL: "ORDER_TRANSITION_ILLEGAL",
  ORDER_NOT_FOUND: "INPUT_INVALID",
});

/** Why the cancel control is absent, as the code a forged submission gets. */
function unavailableCode(cause: UnavailableCause): AdminOrderActionCode {
  if (cause === "permission") return "FORBIDDEN";
  if (cause === "demo") return "DEMO_ORDER";
  return "ORDER_TRANSITION_ILLEGAL";
}

function cancelEffect(
  input: AdminCancelInput,
  session: AdminSession,
): (context: EffectContext) => Promise<EffectOutcome> {
  return async ({ executor, order, actor }) => {
    const control = availableActions(
      {
        status: order.status,
        mode: order.mode,
        // The money facts only decide the refund controls; a cancel never reads them.
        capturedMinor: 0n,
        remainingMinor: 0n,
        refundInFlight: false,
      },
      { roles: session.roles },
    ).cancel;
    if (!control.available) {
      return { ok: false, code: unavailableCode(control.cause) };
    }
    if (!control.reasons.includes(input.reason)) {
      return { ok: false, code: "CANCEL_REASON_NOT_ALLOWED" };
    }
    const result = await cancelOrder(order.id, actor, input.reason, {
      executor,
    });
    if (result.kind === "refused") {
      const code = REFUSAL_CODE[result.code];
      if (code === undefined) {
        throw new Error(`ADMIN_CANCEL_UNEXPECTED_REFUSAL: ${result.code}`);
      }
      return { ok: false, code };
    }
    return {
      ok: true,
      resultRef: result.eventId,
      record: { reason: input.reason },
    };
  };
}

/**
 * Cancels one order before production, as the signed-in admin (spec 020a §2.3). Returns spec
 * 020a's result: `ok` with the `order.cancelled` event id as `resultRef`, or a refusal code.
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
    cancelEffect(data, session),
    deps,
  );
}

async function defaultGuard(
  permission: AdminPermission,
): Promise<AdminSession> {
  const { requirePermission } = await import("../guard.ts");
  return requirePermission(permission);
}
