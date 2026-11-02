/**
 * `adminRefund` and `adminCancel` (spec 013 §5.2 "Refunds", "Cancellation"; TASK-261): the two
 * admin server actions over `refund` and `cancelOrder`, with no page (spec 020 draws it).
 *
 * Each one: the permission first (`orders.refund` / `orders.cancel`, role `admin`; a missing
 * session is 401 and a missing permission 403 before anything is read), then the input parsed
 * with zod at the boundary, then the service with actor `admin:{userId}`. Spec 020's generic
 * transition panel cannot offer rows 30 to 32 (`system` only), so an admin refund always goes
 * through `refund`, which writes the requester on the `refund` row (`requested_by`) and as the
 * actor of `order.refund_requested`.
 *
 * Spec 020a §12 request 1 (TASK-357) moves both inside `runOrderAction`, which adds the
 * `admin_order_action` row and its `audit_log` row in the action's transaction; until then the
 * actor on the refund row and the order event is the record (carry-forward in
 * `docs/tasks/TASK-357.md`).
 *
 * The guard is loaded lazily, so a process that loads `payments` for its jobs never loads the
 * admin surface.
 */
import { z } from "zod";

import { isCurrencyCode } from "@/config/currencies";
import { logger } from "@/lib/logger";
import type { AdminSession } from "@/lib/auth/admin";
import type { EngineConnection } from "@/modules/orders";

import { cancelOrder, type CancelOrderResult } from "./cancel.ts";
import { RefundReasonSchema } from "./events.ts";
import { refund, type RefundDeps, type RefundResult } from "./refunds.ts";

/** What `adminRefund` accepts. Integer minor units only: no float, no text amount. */
export const AdminRefundInputSchema = z
  .object({
    orderId: z.uuid(),
    amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    currency: z.string().refine(isCurrencyCode),
    reason: RefundReasonSchema,
  })
  .strict();

/** What `adminCancel` accepts: the reason is chosen from the refund reasons (§5.2). */
export const AdminCancelInputSchema = z
  .object({ orderId: z.uuid(), reason: RefundReasonSchema })
  .strict();

type Permission = "orders.refund" | "orders.cancel";

export interface AdminActionDeps {
  /** Defaults to spec 012's `requirePermission`; tests pass their own. */
  readonly guard?: (permission: Permission) => Promise<AdminSession>;
  /** `adminCancel`'s connection; defaults to a fresh `system` transaction. */
  readonly connection?: EngineConnection;
}

export type AdminActionInvalid = { readonly kind: "invalid" };

async function guarded(
  permission: Permission,
  deps: AdminActionDeps,
): Promise<AdminSession> {
  if (deps.guard !== undefined) return deps.guard(permission);
  const { requirePermission } = await import("@/modules/admin");
  return requirePermission(permission);
}

/** Refunds part or all of one order, as an admin (§5.2 "Refunds"). */
export async function adminRefund(
  input: unknown,
  deps: AdminActionDeps & RefundDeps,
): Promise<RefundResult | AdminActionInvalid> {
  const session = await guarded("orders.refund", deps);
  const parsed = AdminRefundInputSchema.safeParse(input);
  if (!parsed.success || !isCurrencyCode(parsed.data.currency)) {
    return { kind: "invalid" };
  }
  const result = await refund(
    {
      orderId: parsed.data.orderId,
      amount: {
        amountMinor: parsed.data.amountMinor,
        currency: parsed.data.currency,
      },
      reason: parsed.data.reason,
      actor: `admin:${session.userId}`,
    },
    deps,
  );
  logger.info(
    {
      order_id: parsed.data.orderId,
      admin_user_id: session.userId,
      outcome: result.kind === "refused" ? result.code : result.kind,
    },
    "payments.admin_refund",
  );
  return result;
}

/** Cancels one order before production, as an admin (§5.2 "Cancellation"). */
export async function adminCancel(
  input: unknown,
  deps: AdminActionDeps = {},
): Promise<CancelOrderResult | AdminActionInvalid> {
  const session = await guarded("orders.cancel", deps);
  const parsed = AdminCancelInputSchema.safeParse(input);
  if (!parsed.success) return { kind: "invalid" };
  const result = await cancelOrder(
    parsed.data.orderId,
    `admin:${session.userId}`,
    parsed.data.reason,
    deps.connection ?? {},
  );
  logger.info(
    {
      order_id: parsed.data.orderId,
      admin_user_id: session.userId,
      outcome: result.kind === "refused" ? result.code : result.kind,
    },
    "payments.admin_cancel",
  );
  return result;
}
