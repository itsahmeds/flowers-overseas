"use server";
/**
 * The review form's two server actions (spec 022a §2 "The review form", §5.2; AC-13 to AC-15;
 * TASK-371). Thin glue: parse with `ReviewSubmission`, run the command in one `system`
 * transaction, redirect. A refused submission redirects back with an error code (and, for a text
 * too long, its grapheme count): never the text, the token's owner or a name in a URL or a log.
 */
import { redirect } from "next/navigation";

import { logger } from "@/lib/logger";
import { routableLocale } from "@/modules/i18n";
import { withExecutor } from "@/modules/orders";
import {
  graphemeCount,
  optOutOfReviewInvites,
  ReviewSubmissionSchema,
  submitReview,
} from "@/modules/reviews";

import { STOPPED, THANKS } from "./review-routes";

async function enqueueRatingRefresh(partnerId: string): Promise<void> {
  try {
    const { enqueue, ensureQueue, withBoss } = await import("@/jobs/runtime");
    await withBoss(async (boss) => {
      await ensureQueue(boss, "partners.rating_refresh");
      await enqueue(
        boss,
        "partners.rating_refresh",
        { partnerId },
        { requestId: "system:review.submitted", singletonKey: partnerId },
      );
    });
  } catch (error) {
    // The nightly run writes the rating anyway; a lost enqueue only delays it.
    logger.warn(
      {
        partner_id: partnerId,
        error_class: error instanceof Error ? error.name : "Error",
      },
      "partner.rating_enqueue_failed",
    );
  }
}

export async function submitReviewAction(
  locale: string,
  token: string,
  form: FormData,
): Promise<void> {
  const routable = routableLocale(locale);
  if (routable === undefined) return;
  const base = `/${routable.code}/review`;
  const text = form.get("text");
  const parsed = ReviewSubmissionSchema.safeParse({
    rating: form.get("rating") ?? undefined,
    text: typeof text === "string" ? text : undefined,
    showFirstName: form.get("showFirstName") === "on",
  });
  if (!parsed.success) {
    const fields = new Set(parsed.error.issues.map((issue) => issue.path[0]));
    const params = new URLSearchParams({
      error: fields.has("rating") ? "rating" : "long",
    });
    const rating = Number.parseInt(String(form.get("rating") ?? ""), 10);
    if (!fields.has("rating") && rating >= 1 && rating <= 5) {
      // The chosen star comes back preselected: a digit, never the text.
      params.set("r", String(rating));
    }
    if (fields.has("text")) {
      params.set(
        "count",
        String(typeof text === "string" ? graphemeCount(text.trim()) : 0),
      );
    }
    redirect(`${base}/${token}?${params.toString()}`);
  }
  const outcome = await withExecutor(undefined, "review.submit", (executor) =>
    submitReview(executor, token, parsed.data, new Date()),
  );
  if (outcome.kind === "thanks") {
    logger.info(
      { review_id: outcome.reviewId, rating: parsed.data.rating },
      "review.submitted",
    );
    if (outcome.partnerId !== null)
      await enqueueRatingRefresh(outcome.partnerId);
    redirect(`${base}/${THANKS}`);
  }
  // Used or gone: the same GET shows the matching page, and nothing was written.
  redirect(`${base}/${token}`);
}

export async function optOutAction(
  locale: string,
  token: string,
): Promise<void> {
  const routable = routableLocale(locale);
  if (routable === undefined) return;
  await withExecutor(undefined, "review.opt_out", (executor) =>
    optOutOfReviewInvites(executor, token, new Date()),
  );
  logger.info({ outcome: "done" }, "review.opted_out");
  redirect(`/${routable.code}/review/${STOPPED}/stop`);
}
