/**
 * The public reads (spec 022a §5.2 "Commands", §2 "Display", §6; AC-18 summary half, AC-25 data
 * half, AC-29; TASK-372): `reviewSummary(scope)` and `listPublicReviews(scope, page)`, reading the
 * `public_review` view only, never `review`. A withheld review is in both with its stars and a
 * null text; a removed one is in neither (the view holds published reviews only). Newest first,
 * never by rating (§8 "No suppression").
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import type { OrderExecutor } from "@/modules/orders";

/** 20 per page (§2 "Reviews page"). */
export const REVIEWS_PAGE_SIZE = 20;

/** What a read covers: every review, a product's, or the orders to one country. */
export type ReviewScopeFilter =
  | "all"
  | { readonly productId: string }
  | { readonly countryIso2: string };

function where(scope: ReviewScopeFilter, stars?: number) {
  const star = stars === undefined ? sql`` : sql`AND v.rating = ${stars}`;
  if (scope === "all") return sql`WHERE true ${star}`;
  if ("productId" in scope) return sql`WHERE v.product_id = ${scope.productId} ${star}`;
  return sql`WHERE c.iso2 = ${scope.countryIso2} ${star}`;
}

export interface ReviewSummary {
  /** The mean of the published ratings, or null with none. */
  readonly average: number | null;
  readonly count: number;
  /** Published reviews with visible text (the reviews page's index threshold reads it). */
  readonly withText: number;
  /** Counts per star, 5 to 1, summing to `count`. */
  readonly distribution: Readonly<Record<1 | 2 | 3 | 4 | 5, number>>;
  readonly newestPublishedAt: Date | null;
}

const n = z.coerce.number().int().nonnegative();
const SummaryRow = z.object({
  average: z.coerce.number().nullable(),
  count: n,
  with_text: n,
  s1: n,
  s2: n,
  s3: n,
  s4: n,
  s5: n,
  newest: z.coerce.date().nullable(),
});

export async function reviewSummary(
  executor: OrderExecutor,
  scope: ReviewScopeFilter,
): Promise<ReviewSummary> {
  const [row] = await executor.execute(sql`
    SELECT avg(v.rating)::float8 AS average, count(*) AS count,
           count(*) FILTER (WHERE v.text IS NOT NULL) AS with_text,
           count(*) FILTER (WHERE v.rating = 1) AS s1, count(*) FILTER (WHERE v.rating = 2) AS s2,
           count(*) FILTER (WHERE v.rating = 3) AS s3, count(*) FILTER (WHERE v.rating = 4) AS s4,
           count(*) FILTER (WHERE v.rating = 5) AS s5, max(v.published_at) AS newest
    FROM public_review v LEFT JOIN country c ON c.id = v.destination_country_id
    ${where(scope)}`);
  const parsed = SummaryRow.parse(row);
  return {
    average: parsed.count === 0 ? null : parsed.average,
    count: parsed.count,
    withText: parsed.with_text,
    distribution: {
      1: parsed.s1,
      2: parsed.s2,
      3: parsed.s3,
      4: parsed.s4,
      5: parsed.s5,
    },
    newestPublishedAt: parsed.newest,
  };
}

const CardRow = z.object({
  id: z.uuid(),
  rating: z.coerce.number().int().min(1).max(5),
  text: z.string().nullable(),
  display_name: z.string().nullable(),
  locale_code: z.string().nullable(),
  published_at: z.coerce.date(),
  delivered_month: z.coerce.date().nullable(),
  iso2: z.string().nullable(),
  response_text: z.string().nullable(),
  response_at: z.coerce.date().nullable(),
});
export type PublicReview = z.infer<typeof CardRow>;

/** One page of published reviews, newest first. `stars` filters to one rating (`?stars=n`). */
export async function listPublicReviews(
  executor: OrderExecutor,
  scope: ReviewScopeFilter,
  page: number,
  options: { readonly stars?: number; readonly pageSize?: number } = {},
): Promise<PublicReview[]> {
  const size = options.pageSize ?? REVIEWS_PAGE_SIZE;
  const offset = Math.max(0, page - 1) * size;
  const rows = await executor.execute(sql`
    SELECT v.id, v.rating, v.text, v.display_name, v.locale_code, v.published_at,
           v.delivered_month, c.iso2, v.response_text, v.response_at
    FROM public_review v LEFT JOIN country c ON c.id = v.destination_country_id
    ${where(scope, options.stars)}
    ORDER BY v.published_at DESC, v.id
    LIMIT ${size} OFFSET ${offset}`);
  return rows.map((row) => CardRow.parse(row));
}
