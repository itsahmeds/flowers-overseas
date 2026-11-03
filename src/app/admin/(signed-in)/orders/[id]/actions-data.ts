/**
 * @purpose Reads what the order page's Actions card needs (020a AC-9, AC-12)
 * @spec 020a
 *
 * Thin: the refund state through `orderRefunds` (captured, remaining, in flight, and the automatic
 * refund a cancel caused), and, only for a `test` or `live` order at `no_partner_available` that
 * the viewer may reroute, spec 016's `rerouteCandidates` and `noPartnerGrace`. The last
 * submission's outcome is the page's query string, parsed with `ActionOutcomeSchema` there.
 */
import { z } from "zod";

import type { AdminSession } from "@/lib/auth/admin";
import { can, orderRefunds } from "@/modules/admin";
import type { AdminOrderDetail } from "@/modules/orders";
import {
  noPartnerGrace,
  rerouteCandidates,
} from "@/modules/orders/routing/jobs";

import type { OrderActionsData } from "./actions-panel";

/** `?action=…&result=…` after a submission: the action and a code, nothing else. */
export const ActionOutcomeSchema = z.object({
  action: z.enum(["reroute", "cancel"]),
  result: z.string().regex(/^(?:done|[A-Z_]{3,40})$/u),
});
export type ActionOutcome = z.infer<typeof ActionOutcomeSchema>;

export async function readOrderActionsData(
  order: AdminOrderDetail,
  session: AdminSession,
  viewer: { readonly userId: string; readonly requestId: string },
  outcome: ActionOutcome | null,
): Promise<OrderActionsData> {
  const refunds =
    order.mode === "demo" ? null : await orderRefunds(order.orderId, viewer);
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
  return {
    order,
    roles: session.roles,
    viewerZone: session.timeZone,
    capturedMinor: refunds?.capturedMinor ?? 0n,
    remainingMinor: refunds?.remainingMinor ?? 0n,
    refundInFlight: refunds?.refundInFlight ?? false,
    cancelRefundMinor: automatic?.amountMinor ?? null,
    candidates,
    grace,
    outcome,
  };
}
