/**
 * What the public pages show of the reviews (spec 022a §2 "Display", §5.3, §5.4, §6; AC-23 to
 * AC-28; TASK-373): one read per scope and render, over `public_review` only (`./public.ts`).
 *
 *  - **Data, not flags, decide** (§12 "Display follows data"): the reviews page exists with at
 *    least one published review; a PDP or corridor block with at least `REVIEW_BLOCK_MINIMUM` of
 *    its scope; the review policy once `reviews.invite` is on or a review is published.
 *  - **Where there is no database there are no reviews.** A deployment reads the database only
 *    where the catalogue does (`cmsSourceFor()`: a staging or production deployment with the
 *    build login), so a laptop, CI's seed build and the clean-environment build render every page
 *    exactly as before: no page, no block, no link, no markup (AC-28).
 *  - One read per scope per render (React's `cache()`), so the head and the body of a page agree.
 */
import { randomUUID } from "node:crypto";

import { cache } from "react";

import { cmsSourceFor } from "@/config/countries";
import {
  REVIEW_BLOCK_MINIMUM,
  REVIEWS_PAGE_INDEX_MINIMUM,
} from "@/config/reviews";
import { buildDatabaseConfigured } from "@/lib/build-login";
import { type DbTransaction, withDbContext } from "@/lib/db";
import { appEnvironment } from "@/lib/env.schema";
import { isEnabled } from "@/lib/flags";
import type { OrderExecutor } from "@/modules/orders";

import { REVIEWS_INVITE_FLAG } from "./invite";
import {
  REVIEWS_PAGE_SIZE,
  type PublicReview,
  type ReviewScopeFilter,
  type ReviewSummary,
  listPublicReviews,
  reviewSummary,
} from "./public";

/** The summary of nothing: what every scope reads where there is no database. */
export const EMPTY_REVIEW_SUMMARY: ReviewSummary = {
  average: null,
  count: 0,
  withText: 0,
  distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  newestPublishedAt: null,
};

/** One page of a scope: its summary and the cards on the page. */
export interface ReviewDisplay {
  readonly summary: ReviewSummary;
  readonly reviews: readonly PublicReview[];
}

/** The star filter values (`?stars=n`). */
export const REVIEW_STARS = [5, 4, 3, 2, 1] as const;
export type ReviewStars = (typeof REVIEW_STARS)[number];

/** The cards a PDP or corridor block shows (§2). */
export const REVIEW_BLOCK_CARDS = 5;

/** The footer link ids `site-links.ts` gives the reviews page and the policy. */
export const REVIEWS_LINK_ID = "reviews";
export const REVIEW_POLICY_LINK_ID = "review-policy";

/** Whether this deployment reads reviews at all: where the catalogue reads the database. */
export function reviewsReadable(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return (
    cmsSourceFor(
      appEnvironment(environment),
      buildDatabaseConfigured(environment),
    ) === "database"
  );
}

/** The reads, behind one seam so the unit tests drive them without a database. */
export interface ReviewReader {
  summary(scope: ReviewScopeFilter): Promise<ReviewSummary>;
  list(
    scope: ReviewScopeFilter,
    page: number,
    options?: { readonly stars?: number; readonly pageSize?: number },
  ): Promise<readonly PublicReview[]>;
  inviteFlagOn(): Promise<boolean>;
}

function executorOf(db: DbTransaction): OrderExecutor {
  return {
    async execute(query) {
      const rows: unknown = await db.execute(query);
      return rows as Awaited<ReturnType<OrderExecutor["execute"]>>;
    },
  };
}

function publicRead<T>(fn: (executor: OrderExecutor) => Promise<T>): Promise<T> {
  return withDbContext({ role: "public", requestId: randomUUID() }, (db) =>
    fn(executorOf(db)),
  );
}

/** The production reader: the public context, or nothing where there is no database. */
export function databaseReviewReader(readable = reviewsReadable()): ReviewReader {
  if (!readable) {
    return {
      summary: () => Promise.resolve(EMPTY_REVIEW_SUMMARY),
      list: () => Promise.resolve([]),
      inviteFlagOn: () => Promise.resolve(false),
    };
  }
  return {
    summary: (scope) => publicRead((executor) => reviewSummary(executor, scope)),
    list: (scope, page, options) =>
      publicRead((executor) => listPublicReviews(executor, scope, page, options)),
    inviteFlagOn: () => isEnabled(REVIEWS_INVITE_FLAG),
  };
}

function scopeKey(scope: ReviewScopeFilter): string {
  if (scope === "all") return "all";
  if ("productId" in scope) return `product:${scope.productId}`;
  if ("productSku" in scope) return `sku:${scope.productSku}`;
  return `country:${scope.countryIso2}`;
}

function scopeOf(key: string): ReviewScopeFilter {
  const [kind, value = ""] = key.split(/:(.*)/su);
  if (kind === "product") return { productId: value };
  if (kind === "sku") return { productSku: value };
  if (kind === "country") return { countryIso2: value };
  return "all";
}

const cachedSummary = cache(
  (key: string): Promise<ReviewSummary> =>
    databaseReviewReader().summary(scopeOf(key)),
);
const cachedPage = cache(
  (key: string, page: number, stars: number, pageSize: number) =>
    databaseReviewReader().list(scopeOf(key), page, {
      ...(stars === 0 ? {} : { stars }),
      pageSize,
    }),
);
const cachedInviteFlag = cache(() => databaseReviewReader().inviteFlagOn());

/** The render's reader: one read per scope, shared by the head and the body. */
export const renderReviewReader: ReviewReader = {
  summary: (scope) => cachedSummary(scopeKey(scope)),
  list: (scope, page, options) =>
    cachedPage(
      scopeKey(scope),
      page,
      options?.stars ?? 0,
      options?.pageSize ?? REVIEWS_PAGE_SIZE,
    ),
  inviteFlagOn: () => cachedInviteFlag(),
};

/** The reviews page exists with at least one published review (AC-24). */
export async function reviewsPageExists(
  reader: ReviewReader = renderReviewReader,
): Promise<boolean> {
  return (await reader.summary("all")).count >= 1;
}

/** The policy exists once `reviews.invite` is on or a review is published (AC-23). */
export async function reviewPolicyLive(
  reader: ReviewReader = renderReviewReader,
): Promise<boolean> {
  if ((await reader.summary("all")).count >= 1) return true;
  return reader.inviteFlagOn();
}

/** The footer's review link ids whose page does not exist now (AC-23, AC-24). */
export async function missingReviewLinkIds(
  reader: ReviewReader = renderReviewReader,
): Promise<string[]> {
  const [page, policy] = await Promise.all([
    reviewsPageExists(reader),
    reviewPolicyLive(reader),
  ]);
  return [
    ...(page ? [] : [REVIEWS_LINK_ID]),
    ...(policy ? [] : [REVIEW_POLICY_LINK_ID]),
  ];
}

/**
 * The reviews page's own index term (§6, §13 Q5): at least `REVIEWS_PAGE_INDEX_MINIMUM`
 * published reviews with visible text. The engine (`pageIndexability()`) adds spec 041's other
 * terms: reviewed copy, an indexable locale, the indexing environment.
 */
export function reviewsPageMeetsIndexMinimum(summary: ReviewSummary): boolean {
  return summary.withText >= REVIEWS_PAGE_INDEX_MINIMUM;
}

/** `?page=` and `?stars=` as the page reads them; anything else is no page at all. */
export type ReviewsPageQuery =
  | {
      readonly kind: "page";
      readonly page: number;
      readonly stars: ReviewStars | undefined;
    }
  | { readonly kind: "firstPage"; readonly stars: ReviewStars | undefined }
  | { readonly kind: "notFound" };

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? undefined : value;
}

/**
 * `?page=1` is the bare URL (a 301, §6 "Canonical and pagination"); `?page=0`, `?page=02`,
 * `?page=x`, `?stars=6` and a repeated key are no page (404), so no second URL shows one set.
 */
export function reviewsPageQuery(
  query: Readonly<Record<string, string | string[] | undefined>>,
): ReviewsPageQuery {
  const rawPage = query["page"];
  const rawStars = query["stars"];
  const pageText = one(rawPage);
  const starsText = one(rawStars);
  if ((rawPage !== undefined && pageText === undefined) || (rawStars !== undefined && starsText === undefined)) {
    return { kind: "notFound" };
  }
  let stars: ReviewStars | undefined;
  if (starsText !== undefined) {
    if (!/^[1-5]$/u.test(starsText)) return { kind: "notFound" };
    stars = Number(starsText) as ReviewStars;
  }
  if (pageText === undefined) return { kind: "page", page: 1, stars };
  if (pageText === "1") return { kind: "firstPage", stars };
  if (!/^[1-9]\d{0,5}$/u.test(pageText)) return { kind: "notFound" };
  return { kind: "page", page: Number(pageText), stars };
}

/** One page of the reviews page, or `undefined` past the last page (a 404). */
export async function reviewsPageDisplay(
  page: number,
  stars: ReviewStars | undefined,
  reader: ReviewReader = renderReviewReader,
): Promise<(ReviewDisplay & { readonly pages: number; readonly listed: number }) | undefined> {
  const summary = await reader.summary("all");
  if (summary.count === 0) return undefined;
  const listed = stars === undefined ? summary.count : summary.distribution[stars];
  const pages = Math.max(1, Math.ceil(listed / REVIEWS_PAGE_SIZE));
  if (page > pages) return undefined;
  const reviews = await reader.list(
    "all",
    page,
    stars === undefined ? {} : { stars },
  );
  return { summary, reviews, pages, listed };
}

/** A PDP or corridor block: its summary and the five newest, or `undefined` under the minimum. */
export async function reviewBlockDisplay(
  scope: Exclude<ReviewScopeFilter, "all">,
  reader: ReviewReader = renderReviewReader,
): Promise<ReviewDisplay | undefined> {
  const summary = await reader.summary(scope);
  if (summary.count < REVIEW_BLOCK_MINIMUM) return undefined;
  const reviews = await reader.list(scope, 1, { pageSize: REVIEW_BLOCK_CARDS });
  return { summary, reviews };
}
