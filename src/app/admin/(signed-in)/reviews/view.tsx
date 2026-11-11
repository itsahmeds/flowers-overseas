/**
 * The shared pieces of `/admin/reviews` and `/admin/reviews/[id]` (spec 022a §5.3; artboard
 * `admin-reviews-*`; TASK-372): the admin-context reader, the time and status words.
 */
import { adminT } from "@/modules/admin";
import { formatDate, formatNumber } from "@/modules/i18n";
import { withExecutor, type OrderExecutor } from "@/modules/orders";
import type {
  ModerationReason,
  QueueItem,
  ReviewDetail,
} from "@/modules/reviews";

/** A read in an admin-context transaction (no audit action: it writes nothing). */
export async function adminRead<T>(
  userId: string,
  requestId: string,
  fn: (executor: OrderExecutor) => Promise<T>,
): Promise<T> {
  const { withAdminContext } = await import("@/lib/db");
  return withAdminContext({ action: "reviews.read", userId, requestId }, (db) =>
    withExecutor({ db }, "reviews.read", fn),
  );
}

export const at = (date: Date, zone: string): string =>
  formatDate(date, "en", "dayMonthTime", zone);

/** The metric to two decimals (admin is English, `Intl`). */
export const average = (value: number): string =>
  formatNumber(value, "en", { fractionDigits: 2 });

export const reasonLabel = (reason: ModerationReason): string =>
  adminT(`admin.reviews.reason.${reason}`);

/** The status line of one review. */
export function statusLabel(
  review: Pick<
    ReviewDetail,
    "moderation_status" | "text_visible" | "moderation_reason"
  >,
): string {
  if (review.moderation_status === "pending") {
    return adminT("admin.reviews.status.pending");
  }
  if (review.moderation_status === "hidden") {
    return adminT("admin.reviews.status.removed", {
      reason:
        review.moderation_reason === null
          ? ""
          : reasonLabel(review.moderation_reason),
    });
  }
  if (!review.text_visible && review.moderation_reason !== null) {
    return adminT("admin.reviews.status.withheld", {
      reason: reasonLabel(review.moderation_reason),
    });
  }
  return adminT("admin.reviews.status.published");
}

/** Whole hours a review has waited. */
export const waitedHours = (
  item: Pick<QueueItem, "created_at">,
  now: Date,
): number =>
  Math.max(
    0,
    Math.floor((now.getTime() - item.created_at.getTime()) / 3_600_000),
  );
