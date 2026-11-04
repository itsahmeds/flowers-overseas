/**
 * The search results page's address and its headers (spec 045 §2.2, §5.2, §5.4, §6, AC-3;
 * TASK-402).
 *
 * **Why a rewrite.** `/{locale}/{searchSegment}` (`/en/search`, `/de/suche`, `/pl/szukaj`) has the
 * shape of a depth-2 page, and the depth-2 route (`src/app/[locale]/[segment]/page.tsx`) is
 * prebuilt with `dynamicParams = false` and never reads the query string (TASK-170's rule). The
 * results page is rendered on every request and reads `q`, `to`, `date` and `page`, so a
 * `beforeFiles` rewrite hands exactly the search address to its own route file,
 * `src/app/[locale]/-search/page.tsx`, the way `-product` and `-choose` have theirs. The browser's
 * address never changes and nothing redirects. One source per locale, the locale and the segment
 * captured as named groups so a mis-cased address (`/EN/SEARCH`) reaches the route as typed and
 * answers 404 there, as `listing-rewrites.ts` explains.
 *
 * **Headers** (§5.4): `X-Robots-Tag: noindex, follow`, `Cache-Control: private, no-store` and
 * `Referrer-Policy: strict-origin` on the search address and on a direct request to the internal
 * route. Mounted **after** the security rules in `next.config.ts`: the last rule to set a key
 * wins, and the site-wide referrer policy and the environment's `noindex` must lose here. No
 * `Vary` (nothing is cached) and no `Set-Cookie`.
 *
 * Holds no catalogue data and reads no header, so `next.config.ts` can import it.
 */
import { LOCALES } from "../config/locales.ts";

import { type HeaderRule, NOINDEX_HEADER_NAME } from "./robots-headers.ts";

/** The results page's internal first segment (`src/app/[locale]/-search`). */
export const SEARCH_ROUTE_SEGMENT = "-search";

/** `noindex, follow` (§6): a crawler that arrives from an outside link still reaches the products. */
export const SEARCH_ROBOTS = "noindex, follow";
/** Never stored by a shared or a browser cache (§2.8: the query can hold personal data). */
export const SEARCH_CACHE_CONTROL = "private, no-store";
/** A click from a result to a product page carries no query (§2.8). */
export const SEARCH_REFERRER_POLICY = "strict-origin";

/** A literal for a path-to-regexp parameter group. */
function literal(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/** One rewrite, in the shape `next.config`'s `rewrites()` takes. */
export interface SearchRewriteRule {
  readonly source: string;
  readonly destination: string;
}

/** Every locale's search address, as a path-to-regexp source. */
function searchSources(): string[] {
  return LOCALES.map(
    (locale) =>
      `/:locale(${literal(locale.code)})/:search(${literal(locale.pathSegments.search)})`,
  );
}

/** `/{locale}/{searchSegment}` to the internal route, the query kept. Fresh objects per call. */
export function searchRewriteRules(): SearchRewriteRule[] {
  return searchSources().map((source) => ({
    source,
    destination: `/:locale/${SEARCH_ROUTE_SEGMENT}`,
  }));
}

/** The three headers on every search address and on the internal route. */
export function searchHeaderRules(): HeaderRule[] {
  const headers = [
    { key: NOINDEX_HEADER_NAME, value: SEARCH_ROBOTS },
    { key: "Cache-Control", value: SEARCH_CACHE_CONTROL },
    { key: "Referrer-Policy", value: SEARCH_REFERRER_POLICY },
  ];
  return [
    ...searchSources().map((source) => ({ source, headers })),
    { source: `/:locale/${SEARCH_ROUTE_SEGMENT}`, headers },
  ];
}
