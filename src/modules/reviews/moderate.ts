/**
 * Moderation, the exit metric, the overdue alert and the erasure (spec 022a §2 "Moderation",
 * §5.2 "Commands", §8, §11; AC-16 to AC-18, AC-20, AC-29, AC-30; TASK-372).
 *
 *  - `moderateReview(executor, reviewId, action, adminId, now)`: one of four actions, each a
 *    closed shape (`ModerationActionSchema`). **Publish**; **publish without text** (reason
 *    `personal_data`, `abuse` or `illegal`; the stars stay public and counted); **remove** (reason
 *    `not_genuine`, `duplicate` or `test_order`, with a note); **reply**. No reason concerns the
 *    rating or the tone. Rating and text are never written here (the database refuses it anyway,
 *    `review_content_immutable`). Spec 012's trigger audits every write.
 *  - `reviewTags(review)`: the three cache tags a write invalidates (AC-30).
 *  - `exitMetric(executor)`: the Phase 1 exit reading, every first-party rating not removed.
 *  - `redactForCustomer(executor, customerId, now)`: spec 018's erasure: text and display name to
 *    null, `redacted_at` set, the rating kept as an anonymous verified rating (AC-29).
 *  - `overduePendingReviews(executor, now)`: reviews pending more than 72 hours (AC-20).
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import {
  REVIEW_PENDING_ALERT_HOURS,
  REVIEW_TEXT_MAX_CHARACTERS,
} from "@/config/reviews";
import type { OrderExecutor } from "@/modules/orders";

/** Withholding reasons: the text is hidden, the stars stay public and counted. */
export const WITHHOLD_REASONS = ["personal_data", "abuse", "illegal"] as const;
/** Removal reasons: the review is not genuine, and appears nowhere public. */
export const REMOVE_REASONS = [
  "not_genuine",
  "duplicate",
  "test_order",
] as const;
export const MODERATION_REASONS = [
  ...WITHHOLD_REASONS,
  ...REMOVE_REASONS,
] as const;
export type ModerationReason = (typeof MODERATION_REASONS)[number];

export const MODERATION_ACTIONS = [
  "publish",
  "publish_without_text",
  "remove",
  "reply",
] as const;

/** `ModerationAction` (§5.2): a discriminated union, each branch strict. */
export const ModerationActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("publish") }).strict(),
  z
    .object({
      action: z.literal("publish_without_text"),
      reason: z.enum(WITHHOLD_REASONS),
    })
    .strict(),
  z
    .object({
      action: z.literal("remove"),
      reason: z.enum(REMOVE_REASONS),
      note: z.string().trim().min(1).max(REVIEW_TEXT_MAX_CHARACTERS),
    })
    .strict(),
  z
    .object({
      action: z.literal("reply"),
      text: z.string().trim().min(1).max(REVIEW_TEXT_MAX_CHARACTERS),
    })
    .strict(),
]);
export type ModerationAction = z.infer<typeof ModerationActionSchema>;

/** The facts a write needs to invalidate and to refresh a florist's rating. */
export interface ReviewScope {
  readonly reviewId: string;
  readonly productId: string | null;
  readonly countryIso2: string | null;
  readonly partnerId: string | null;
}

/** The three tags of one review (AC-30): the page, its product's and its country's blocks. */
export function reviewTags(scope: ReviewScope): string[] {
  return [
    "reviews",
    ...(scope.productId === null ? [] : [`reviews:product:${scope.productId}`]),
    ...(scope.countryIso2 === null
      ? []
      : [`reviews:country:${scope.countryIso2}`]),
  ];
}

const ScopeRow = z.object({
  id: z.uuid(),
  product_id: z.uuid().nullable(),
  iso2: z.string().nullable(),
  partner_id: z.uuid().nullable(),
});

function scopeOf(row: unknown): ReviewScope {
  const parsed = ScopeRow.parse(row);
  return {
    reviewId: parsed.id,
    productId: parsed.product_id,
    countryIso2: parsed.iso2,
    partnerId: parsed.partner_id,
  };
}

export type ModerateOutcome =
  | { readonly kind: "done"; readonly scope: ReviewScope }
  | { readonly kind: "not_found" };

/** One moderation action on one review, in the caller's (admin-context) transaction. */
export async function moderateReview(
  executor: OrderExecutor,
  reviewId: string,
  input: ModerationAction,
  adminId: string,
  now: Date,
): Promise<ModerateOutcome> {
  const action = ModerationActionSchema.parse(input);
  const at = now.toISOString();
  const set = (() => {
    switch (action.action) {
      case "publish":
        return sql`moderation_status = 'published',
          published_at = coalesce(published_at, ${at}::timestamptz),
          text_visible = true, moderation_reason = NULL, moderation_note = NULL`;
      case "publish_without_text":
        return sql`moderation_status = 'published',
          published_at = coalesce(published_at, ${at}::timestamptz),
          text_visible = false, moderation_reason = ${action.reason}, moderation_note = NULL`;
      case "remove":
        return sql`moderation_status = 'hidden', text_visible = true,
          moderation_reason = ${action.reason}, moderation_note = ${action.note}`;
      case "reply":
        return sql`response_text = ${action.text}, response_at = ${at}::timestamptz`;
    }
  })();
  const moderated =
    action.action === "reply"
      ? sql``
      : sql`, moderated_by = ${adminId}, moderated_at = ${at}::timestamptz`;
  const [row] = await executor.execute(sql`
    WITH updated AS (
      UPDATE review SET ${set} ${moderated}
      WHERE id = ${reviewId} AND source = 'internal'
      RETURNING id, product_id, destination_country_id, partner_id
    )
    SELECT u.id, u.product_id, c.iso2, u.partner_id
    FROM updated u LEFT JOIN country c ON c.id = u.destination_country_id`);
  if (row === undefined) return { kind: "not_found" };
  return { kind: "done", scope: scopeOf(row) };
}

const MetricRow = z.object({
  average: z.coerce.number().nullable(),
  count: z.coerce.number().int().nonnegative(),
});

/**
 * The Phase 1 exit reading (§2, AC-16): the mean of every first-party rating that is not removed
 * (pending, published and withheld alike), to two decimals, and their count. Null with none.
 */
export async function exitMetric(
  executor: OrderExecutor,
): Promise<{ readonly average: number | null; readonly count: number }> {
  const [row] = await executor.execute(sql`
    SELECT round(avg(rating)::numeric, 2) AS average, count(*) AS count
    FROM review WHERE source = 'internal' AND moderation_status <> 'hidden'`);
  return MetricRow.parse(row);
}

export const QUEUE_STATUSES = [
  "pending",
  "published",
  "withheld",
  "removed",
  "all",
] as const;
export type QueueStatus = (typeof QUEUE_STATUSES)[number];

export const QueueFilterSchema = z
  .object({
    status: z.enum(QUEUE_STATUSES).catch("pending"),
    rating: z.coerce.number().int().min(1).max(5).optional().catch(undefined),
    country: z
      .string()
      .regex(/^[A-Z]{2}$/u)
      .optional()
      .catch(undefined),
  })
  .strip();
export type QueueFilter = z.infer<typeof QueueFilterSchema>;

const QueueRow = z.object({
  id: z.uuid(),
  order_id: z.uuid().nullable(),
  rating: z.coerce.number().int(),
  has_text: z.boolean(),
  named: z.boolean(),
  iso2: z.string().nullable(),
  moderation_status: z.enum(["pending", "published", "hidden"]),
  text_visible: z.boolean(),
  created_at: z.coerce.date(),
});
export type QueueItem = z.infer<typeof QueueRow>;

function statusClause(status: QueueStatus) {
  switch (status) {
    case "pending":
      return sql`r.moderation_status = 'pending'`;
    case "published":
      return sql`r.moderation_status = 'published' AND r.text_visible`;
    case "withheld":
      return sql`r.moderation_status = 'published' AND NOT r.text_visible`;
    case "removed":
      return sql`r.moderation_status = 'hidden'`;
    case "all":
      return sql`true`;
  }
}

/** The queue: oldest first (AC-16), first-party only, no text and no name read. */
export async function reviewQueue(
  executor: OrderExecutor,
  filter: QueueFilter,
  limit = 100,
): Promise<QueueItem[]> {
  const rows = await executor.execute(sql`
    SELECT r.id, r.order_id, r.rating, (r.text IS NOT NULL) AS has_text,
           (r.display_name IS NOT NULL) AS named, c.iso2, r.moderation_status,
           r.text_visible, r.created_at
    FROM review r LEFT JOIN country c ON c.id = r.destination_country_id
    WHERE r.source = 'internal' AND ${statusClause(filter.status)}
      ${filter.rating === undefined ? sql`` : sql`AND r.rating = ${filter.rating}`}
      ${filter.country === undefined ? sql`` : sql`AND c.iso2 = ${filter.country}`}
    ORDER BY r.created_at, r.id
    LIMIT ${limit}`);
  return rows.map((row) => QueueRow.parse(row));
}

/** How many reviews each tab holds. */
export async function queueCounts(
  executor: OrderExecutor,
): Promise<Readonly<Record<QueueStatus, number>>> {
  const [row] = await executor.execute(sql`
    SELECT count(*) FILTER (WHERE moderation_status = 'pending') AS pending,
           count(*) FILTER (WHERE moderation_status = 'published' AND text_visible) AS published,
           count(*) FILTER (WHERE moderation_status = 'published' AND NOT text_visible) AS withheld,
           count(*) FILTER (WHERE moderation_status = 'hidden') AS removed,
           count(*) AS "all"
    FROM review WHERE source = 'internal'`);
  const n = z.coerce.number().int().nonnegative();
  return z
    .object({
      pending: n,
      published: n,
      withheld: n,
      removed: n,
      all: n,
    })
    .parse(row);
}

const DetailRow = z.object({
  id: z.uuid(),
  order_id: z.uuid().nullable(),
  rating: z.coerce.number().int(),
  text: z.string().nullable(),
  display_name: z.string().nullable(),
  locale_code: z.string().nullable(),
  moderation_status: z.enum(["pending", "published", "hidden"]),
  text_visible: z.boolean(),
  moderation_reason: z.enum(MODERATION_REASONS).nullable(),
  moderation_note: z.string().nullable(),
  moderated_at: z.coerce.date().nullable(),
  moderated_by_email: z.string().nullable(),
  published_at: z.coerce.date().nullable(),
  response_text: z.string().nullable(),
  response_at: z.coerce.date().nullable(),
  delivered_on: z.coerce.date().nullable(),
  redacted_at: z.coerce.date().nullable(),
  created_at: z.coerce.date(),
  iso2: z.string().nullable(),
  product_sku: z.string().nullable(),
  partner_code: z.string().nullable(),
});
export type ReviewDetail = z.infer<typeof DetailRow>;

/** One review for the admin detail page (the buyer's words exactly as sent). */
export async function reviewDetail(
  executor: OrderExecutor,
  reviewId: string,
): Promise<ReviewDetail | null> {
  const [row] = await executor.execute(sql`
    SELECT r.id, r.order_id, r.rating, r.text, r.display_name, r.locale_code,
           r.moderation_status, r.text_visible, r.moderation_reason, r.moderation_note,
           r.moderated_at, u.email AS moderated_by_email, r.published_at, r.response_text,
           r.response_at, r.delivered_on, r.redacted_at, r.created_at, c.iso2,
           p.sku AS product_sku, fp.code AS partner_code
    FROM review r
    LEFT JOIN country c ON c.id = r.destination_country_id
    LEFT JOIN product p ON p.id = r.product_id
    LEFT JOIN fulfillment_partner fp ON fp.id = r.partner_id
    LEFT JOIN users u ON u.id = r.moderated_by
    WHERE r.id = ${reviewId} AND r.source = 'internal'`);
  return row === undefined ? null : DetailRow.parse(row);
}

/**
 * `reviews.redactForCustomer(customerId)` (spec 018's erasure; AC-29): every review of the
 * customer's orders loses its text and display name and gains `redacted_at`; the rating stays.
 * Returns the scope of each review touched, for `invalidate()` and the rating refresh.
 */
export async function redactForCustomer(
  executor: OrderExecutor,
  customerId: string,
  now: Date,
): Promise<ReviewScope[]> {
  const rows = await executor.execute(sql`
    WITH updated AS (
      UPDATE review r SET text = NULL, display_name = NULL,
             redacted_at = ${now.toISOString()}::timestamptz
      FROM "order" o
      WHERE o.id = r.order_id AND o.customer_id = ${customerId} AND r.redacted_at IS NULL
      RETURNING r.id, r.product_id, r.destination_country_id, r.partner_id
    )
    SELECT u.id, u.product_id, c.iso2, u.partner_id
    FROM updated u LEFT JOIN country c ON c.id = u.destination_country_id`);
  return rows.map(scopeOf);
}

/** Reviews pending longer than 72 hours at `now` (AC-20), oldest first. Ids only. */
export async function overduePendingReviews(
  executor: OrderExecutor,
  now: Date,
): Promise<string[]> {
  const rows = await executor.execute(sql`
    SELECT id FROM review
    WHERE source = 'internal' AND moderation_status = 'pending'
      AND created_at + make_interval(hours => ${REVIEW_PENDING_ALERT_HOURS}) < ${now.toISOString()}::timestamptz
    ORDER BY created_at, id`);
  return rows.map((row) => z.object({ id: z.uuid() }).parse(row).id);
}
