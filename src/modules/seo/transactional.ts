/**
 * The head and headers of a **transactional page** (spec 010 §14 A-founder-2026-10-22 item 12,
 * AC-72; TASK-349): today the basket, `/{locale}/basket`.
 *
 * A transactional page is never indexable and passes no signal: `noindex, nofollow` in the robots
 * meta **and** the `X-Robots-Tag` header, no canonical, no hreflang alternate, no JSON-LD, never a
 * sitemap entry (its page type is `"never"` in `PAGE_TYPE_POLICY`, which no data flip lifts), and
 * `Disallow: /*\/basket` in `robots.txt` (`DISALLOWED_PATHS`). It is rendered per request with
 * `no-store`, because it reads the visitor's basket. The header lives in
 * `src/lib/transactional-headers.ts` so `next.config.ts` can set it on every response class.
 *
 * `nofollow` is the one directive outside `RobotsDirective`'s pair: an indexable page type never
 * carries it, so it is a constant of this file rather than an answer of the rule engine.
 */
import type { Metadata } from "next";

import type { SeoPageType } from "./indexability.ts";

/** The robots meta of a transactional page, as Next prints it. */
export const TRANSACTIONAL_ROBOTS = "noindex,nofollow" as const;

/** The `X-Robots-Tag` value of a transactional page. */
export const TRANSACTIONAL_ROBOTS_HEADER = "noindex, nofollow" as const;

/** The page types this file speaks for: each is `"never"` in `PAGE_TYPE_POLICY`. */
export const TRANSACTIONAL_PAGE_TYPES = [
  "basket",
] as const satisfies readonly SeoPageType[];

export type TransactionalPageType = (typeof TRANSACTIONAL_PAGE_TYPES)[number];

/**
 * The whole metadata of a transactional page: its title and the robots meta, and nothing else.
 * No `alternates` (so no canonical and no hreflang), no description, no Open Graph.
 */
export function transactionalMetadata(
  _pageType: TransactionalPageType,
  title: string,
): Metadata {
  return { title, robots: TRANSACTIONAL_ROBOTS };
}
