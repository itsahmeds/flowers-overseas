/**
 * @purpose Reads what the order page's Actions card and lists need (020a AC-9, AC-12, AC-23, AC-24)
 * @spec 020a
 *
 * Thin: the refund state through `orderRefunds` (captured, remaining, in flight, and the automatic
 * refund a cancel caused), and, only for a `test` or `live` order at `no_partner_available` that
 * the viewer may reroute, spec 016's `rerouteCandidates` and `noPartnerGrace`. The last
 * submission's outcome is the page's query string, parsed with `ActionOutcomeSchema` there.
 * TASK-361 adds the emails list (`orderEmails`, spec 020a TASK-360) and the action history
 * (`orderActionHistory`), and keeps the whole refunds list for the Payments section; then the
 * refund dialogs' inputs: whether the card provider is connected (payments' `adminRefundDeps`),
 * the failed automatic refund a cancelled order may retry, and the amount of the refund a
 * submission just requested (its row named by `?ref=`).
 */
import { z } from "zod";

import { adminRefundDeps } from "@/modules/payments";

import type { AdminSession } from "@/lib/auth/admin";
import {
  type ActionHistoryEntry,
  can,
  orderActionHistory,
  type OrderRefunds,
  orderRefunds,
} from "@/modules/admin";
import {
  type OrderEmail,
  orderEmails,
} from "@/modules/admin/order-actions/resend";
import type { AdminOrderDetail } from "@/modules/orders";
import {
  noPartnerGrace,
  rerouteCandidates,
} from "@/modules/orders/routing/jobs";

import type { OrderActionsData } from "./actions-panel";

/** `?action=…&result=…` after a submission: the action and a code, nothing else. */
export const ActionOutcomeSchema = z.object({
  action: z.enum([
    "reroute",
    "cancel",
    "resend",
    "refund_full",
    "refund_partial",
  ]),
  result: z.string().regex(/^(?:done|[A-Z_]{3,40})$/u),
  /** A resend's new delivery row, or a refund's new refund row. */
  ref: z.uuid().optional(),
});
export type ActionOutcome = z.infer<typeof ActionOutcomeSchema>;

/** The page's lists: refunds with the balance, emails, and the action history. */
export interface OrderListsData {
  readonly refunds: OrderRefunds | null;
  readonly emails: readonly OrderEmail[];
  readonly history: readonly ActionHistoryEntry[];
}

export async function readOrderLists(
  order: AdminOrderDetail,
  session: AdminSession,
  viewer: { readonly userId: string; readonly requestId: string },
): Promise<OrderListsData> {
  const [refunds, emails, history] = await Promise.all([
    order.mode === "demo" ? null : orderRefunds(order.orderId, viewer),
    orderEmails(order.orderId, { ...viewer, roles: session.roles }),
    orderActionHistory(order.orderId, viewer),
  ]);
  return { refunds, emails: emails ?? [], history: history ?? [] };
}

export async function readOrderActionsData(
  order: AdminOrderDetail,
  session: AdminSession,
  outcome: ActionOutcome | null,
  /** The refund state `readOrderLists` read, so the page reads it once. */
  refunds: OrderRefunds | null,
  /** Whether the card provider has keys; tests pass their own. */
  refundReady: () => boolean = () => adminRefundDeps() !== null,
): Promise<OrderActionsData> {
  const reroutable =
    order.mode !== "demo" &&
    order.status === "no_partner_available" &&
    can(session.roles, "orders.reroute");
  const [candidates, grace] = reroutable
    ? await Promise.all([
        rerouteCandidates(order.orderId),
        noPartnerGrace(order.orderId),
      ])
    : [[], null];
  const automatic = refunds?.refunds
    .filter((refund) => refund.requestedBy.kind === "system")
    .at(-1);
  const cancelled =
    order.status === "cancelled" || order.status === "cancelled_refunded";
  const requested =
    outcome?.result === "done" && outcome.ref !== undefined
      ? refunds?.refunds.find((refund) => refund.id === outcome.ref)
      : undefined;
  return {
    order,
    roles: session.roles,
    viewerZone: session.timeZone,
    capturedMinor: refunds?.capturedMinor ?? 0n,
    remainingMinor: refunds?.remainingMinor ?? 0n,
    refundInFlight: refunds?.refundInFlight ?? false,
    cancelRefundMinor: automatic?.amountMinor ?? null,
    failedAutomatic:
      cancelled && automatic?.status === "failed"
        ? { amountMinor: automatic.amountMinor, reason: automatic.reason }
        : null,
    requestedRefundMinor: requested?.amountMinor ?? null,
    refundReady: order.mode !== "demo" && refundReady(),
    candidates,
    grace,
    outcome,
  };
}
