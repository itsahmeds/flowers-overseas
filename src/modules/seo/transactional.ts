/**
 * The head and headers of a **transactional page**: the basket, `/{locale}/basket` (spec 010 §14
 * A-founder-2026-10-22 item 12, AC-72; TASK-349), and the checkout and its confirmation,
 * `/{locale}/checkout` and `/{locale}/checkout/done` (spec 010 §6, AC-30; TASK-204).
 *
 * A transactional page is never indexable and passes no signal, whatever the environment:
 * `noindex, nofollow` in the robots meta **and** the `X-Robots-Tag` header, no canonical, no
 * hreflang alternate, no JSON-LD, never a sitemap entry (its page type is `"never"` in
 * `PAGE_TYPE_POLICY`, which no data flip lifts), and a `Disallow` line in `robots.txt`
 * (`DISALLOWED_PATHS`). It is rendered per request with `no-store`, because it reads the
 * visitor's basket. The basket's header rule lives in `src/lib/transactional-headers.ts`, the
 * checkout's here (`checkoutHeaderRules()`); `next.config.ts` mounts both after the
 * environment-wide `noindex` rule, so their value wins.
 *
 * `nofollow` is the one directive outside `RobotsDirective`'s pair: an indexable page type never
 * carries it, so it is a constant of this file rather than an answer of the rule engine.
 *
 * Type-only imports on purpose: `next.config.ts` imports this file.
 */
import type { Metadata } from "next";

import type { SeoPageType } from "./indexability.ts";

/** The robots meta of a transactional page, as Next prints it. */
export const TRANSACTIONAL_ROBOTS = "noindex,nofollow" as const;

/** The `X-Robots-Tag` value of a transactional page. */
export const TRANSACTIONAL_ROBOTS_HEADER = "noindex, nofollow" as const;

/** Next's `metadata.robots` object form of the same directive (the checkout's pages use it). */
export const TRANSACTIONAL_ROBOTS_META = {
  index: false,
  follow: false,
} as const;

/** The page types this file speaks for: each is `"never"` in `PAGE_TYPE_POLICY`. */
export const TRANSACTIONAL_PAGE_TYPES = [
  "basket",
  "checkout",
  "checkoutDone",
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

export interface TransactionalHeaderRule {
  readonly source: string;
  readonly headers: { key: string; value: string }[];
}

/**
 * `X-Robots-Tag: noindex, nofollow` and `Cache-Control: no-store` on every checkout address under
 * every locale prefix. Mounted after the environment-wide `noindex` rule so its value wins.
 */
export function checkoutHeaderRules(): TransactionalHeaderRule[] {
  const headers = [
    { key: "X-Robots-Tag", value: TRANSACTIONAL_ROBOTS_HEADER },
    { key: "Cache-Control", value: "no-store" },
  ];
  return [
    { source: "/:locale/checkout", headers },
    { source: "/:locale/checkout/:path*", headers },
  ];
}
