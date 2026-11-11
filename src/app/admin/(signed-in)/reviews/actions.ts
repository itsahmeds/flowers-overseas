/**
 * @purpose /admin/reviews actions: publish, publish without text, remove, reply (022a AC-16, AC-17, AC-30)
 * @spec 022a
 *
 * Thin (`plan/01` §5): `requirePermission('reviews.moderate')` is the first statement (a forged
 * post without it answers 403 and writes nothing), then `ModerationAction` from the posted fields
 * (a reason outside the closed list, a removal without its note, a removal reason on "publish
 * without text": refused, nothing written), then `moderateReview` on an admin-context transaction
 * whose audit action is `reviews.<action>`, so spec 012's trigger records it. After the commit:
 * `invalidate()` with the review's three tags, and the florist's rating refresh. The redirect names
 * the outcome as a code; the URL carries the review's uuid only.
 */
"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { invalidate } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { adminRequestId, requirePermission } from "@/modules/admin";
import { withExecutor } from "@/modules/orders";
import {
  moderateReview,
  ModerationActionSchema,
  reviewTags,
} from "@/modules/reviews";

async function enqueueRatingRefresh(partnerId: string): Promise<void> {
  try {
    const { enqueue, ensureQueue, withBoss } = await import("@/jobs/runtime");
    await withBoss(async (boss) => {
      await ensureQueue(boss, "partners.rating_refresh");
      await enqueue(
        boss,
        "partners.rating_refresh",
        { partnerId },
        { requestId: "system:review.moderated", singletonKey: partnerId },
      );
    });
  } catch (error) {
    logger.warn(
      {
        partner_id: partnerId,
        error_class: error instanceof Error ? error.name : "Error",
      },
      "partner.rating_enqueue_failed",
    );
  }
}

export async function moderateReviewAction(formData: FormData): Promise<void> {
  const session = await requirePermission("reviews.moderate");
  const id = z.uuid().safeParse(formData.get("reviewId"));
  if (!id.success) redirect("/admin/reviews");
  const fields = Object.fromEntries(
    [...formData.entries()].filter(
      ([key, value]) =>
        ["action", "reason", "note", "text"].includes(key) &&
        typeof value === "string" &&
        value !== "",
    ),
  );
  const parsed = ModerationActionSchema.safeParse(fields);
  if (!parsed.success) redirect(`/admin/reviews/${id.data}?result=refused`);
  const action = parsed.data;
  const { withAdminContext } = await import("@/lib/db");
  const outcome = await withAdminContext(
    {
      action: `reviews.${action.action}`,
      userId: session.userId,
      requestId: await adminRequestId(),
    },
    (db) =>
      withExecutor({ db }, "reviews.moderate", (executor) =>
        moderateReview(executor, id.data, action, session.userId, new Date()),
      ),
  );
  if (outcome.kind === "not_found") {
    redirect(`/admin/reviews/${id.data}?result=not_found`);
  }
  logger.info(
    {
      review_id: id.data,
      action: action.action,
      reason: "reason" in action ? action.reason : null,
    },
    "review.moderated",
  );
  await invalidate(reviewTags(outcome.scope));
  if (outcome.scope.partnerId !== null) {
    await enqueueRatingRefresh(outcome.scope.partnerId);
  }
  redirect(`/admin/reviews/${id.data}?result=done`);
}
