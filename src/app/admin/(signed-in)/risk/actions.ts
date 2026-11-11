/**
 * @purpose /admin/risk decisions: approve, cancel and refund, cancel refund and block (021 AC-20 to AC-22, AC-24)
 * @spec 021
 *
 * Thin (`plan/01` §5): `requirePermission('risk.review')` is the first statement, then the posted
 * fields (unknown keys stripped), then `risk.blocklist` too for a block (a forged post without it
 * answers 403 and changes nothing), then spec 021's `decideReview` on an admin-context transaction
 * whose audit action is `risk.review.<decision>`, with spec 013's `cancelOrder` handed in, and for
 * a post-routing "Refund in full" its balance refund, sent after commit (TASK-495). The redirect
 * back names the outcome as a code; the URL carries the review's uuid only.
 */
"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { adminRequestId, requirePermission } from "@/modules/admin";
import {
  adminRefundDeps,
  cancelOrder,
  requestBalanceRefund,
  submitRefund,
} from "@/modules/payments";
import {
  REVIEW_DECISIONS,
  adminRiskTransaction,
  decideReview,
} from "@/modules/risk";

const FormSchema = z.object({
  reviewId: z.uuid(),
  decision: z.enum(REVIEW_DECISIONS),
  reason: z.string(),
  expectedStatus: z.string(),
});

export async function decideReviewAction(formData: FormData): Promise<void> {
  const session = await requirePermission("risk.review");
  const parsed = FormSchema.strip().safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/risk");
  const input = parsed.data;
  if (input.decision === "cancel_block") {
    await requirePermission("risk.blocklist");
  }
  const result = await decideReview(input, {
    actor: `admin:${session.userId}`,
    transaction: adminRiskTransaction({
      userId: session.userId,
      requestId: await adminRequestId(),
      action: `risk.review.${input.decision}`,
    }),
    cancelOrder: (orderId, actor, reason, options) =>
      cancelOrder(orderId, actor, reason, options),
    refundBalance: (orderId, actor, reason, executor) =>
      requestBalanceRefund(orderId, actor, reason, executor),
    submitRefund: async (refundId) => {
      const deps = adminRefundDeps();
      if (deps !== null) await submitRefund(refundId, deps);
    },
  });
  const code = result.kind === "refused" ? "refused" : result.kind;
  redirect(`/admin/risk/${input.reviewId}?result=${code}`);
}
