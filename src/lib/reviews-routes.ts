/**
 * Where a reviews-page address is answered (spec 022a §5.4, §6; AC-24; TASK-373), as
 * `./search-routes.ts` and `./product-rewrites.ts` do for theirs: `beforeFiles` rewrites from the
 * localised address (`/en/reviews`, `/de/bewertungen`, `/pl/opinie`) to three internal routes, so
 * the bare page reads no query string and stays prebuilt.
 *
 *  1. `?page=1` → `/{locale}/_query/-reviews/first`, a 301 to the bare URL (a page cannot 301).
 *  2. `?page=` or `?stars=` → `/{locale}/_query/-reviews`, rendered per request.
 *  3. everything else → `/{locale}/-reviews`, ISR.
 *
 * Next stops at the first rewrite whose destination resolves, so the order is the rule. The
 * internal paths answer `noindex` when requested directly (`reviewsHeaderRules()`).
 */
import { LOCALES } from "../config/locales.ts";

import { PARAMETER_ROUTE_SEGMENT } from "./listing-rewrites.ts";
import { type HeaderRule, NOINDEX_HEADER_NAME } from "./robots-headers.ts";

/** The bare page's internal segment. */
export const REVIEWS_ROUTE_SEGMENT = "-reviews";

/** The query keys that make a reviews address a parameter request. */
export const REVIEWS_QUERY_KEYS = ["page", "stars"] as const;

export interface ReviewsRewriteRule {
  source: string;
  destination: string;
  has?: { type: "query"; key: string; value?: string }[];
}

function literal(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function reviewsSources(): string[] {
  return LOCALES.map(
    (locale) =>
      `/:locale(${literal(locale.code)})/:reviews(${literal(locale.pathSegments.reviews)})`,
  );
}

/** Fresh objects on every call, in the order Next must try them. */
export function reviewsRewriteRules(): ReviewsRewriteRule[] {
  const sources = reviewsSources();
  return [
    ...sources.map((source) => ({
      source,
      destination: `/:locale/${PARAMETER_ROUTE_SEGMENT}/${REVIEWS_ROUTE_SEGMENT}/first`,
      has: [{ type: "query" as const, key: "page", value: "1" }],
    })),
    ...sources.flatMap((source) =>
      REVIEWS_QUERY_KEYS.map((key) => ({
        source,
        destination: `/:locale/${PARAMETER_ROUTE_SEGMENT}/${REVIEWS_ROUTE_SEGMENT}`,
        has: [{ type: "query" as const, key }],
      })),
    ),
    ...sources.map((source) => ({
      source,
      destination: `/:locale/${REVIEWS_ROUTE_SEGMENT}`,
    })),
  ];
}

/** The internal addresses, requested directly, say `noindex` (the product route's rule). */
export function reviewsHeaderRules(): HeaderRule[] {
  const headers = [{ key: NOINDEX_HEADER_NAME, value: "noindex, nofollow" }];
  return [
    { source: `/:locale/${REVIEWS_ROUTE_SEGMENT}`, headers },
    {
      source: `/:locale/${PARAMETER_ROUTE_SEGMENT}/${REVIEWS_ROUTE_SEGMENT}/:path*`,
      headers,
    },
  ];
}
