/**
 * The product rewrite: every product page address is answered by its own route file, so no other
 * page type loads the product page's island (spec 009 §14 A-founder-2026-10-18a, AC-37; spec 004
 * §14 A-founder-2026-10-18a clause 4; TASK-228).
 *
 * ## Why a rewrite
 *
 * The product page (`/{locale}/{country}/{product}/{slug}`) shares its URL depth with the country
 * category and the country occasion, and Next allows one route file per depth (spec 008 §14 A5).
 * Turbopack puts every client module a route file reaches into that route's entry script set, so
 * while one file served all three, `/en/poland/flowers/roses` fetched the product island's chunk
 * (`CardMessageField`, the size-follow and the printed-card counter) on a page that mounts none of
 * it. A server component's dynamic import does not split a client module out (Next's lazy-loading
 * guide), and a client-side `next/dynamic` loader would be a dynamic import and a second island,
 * both of which spec 009 AC-14 forbids. So the product page gets its own file:
 * `src/app/[locale]/-product/[segment]/[child]/[grandchild]/page.tsx`, reached by a
 * `beforeFiles` rewrite that runs after `src/proxy.ts` and before the filesystem routes. No URL
 * changes (`plan/02` §4): the browser's address, the canonical, the hreflang set and every link stay
 * the bare product URL, and nothing redirects.
 *
 * ## What the sources match
 *
 * One source per locale in the registry, naming that locale's own `product` segment as the third
 * segment, the country and the slug as the two wildcards. A country category or occasion cannot
 * match, because its third segment is the locale's `shopCategory` or `occasions` segment (pinned
 * distinct by `tests/unit/product-rewrites.test.ts`). It holds no catalogue data, so it is not a
 * second copy of the existence set: an unknown country or slug is rewritten, and the product route
 * answers it 404 through the `[locale]` layout's `dynamicParams = false` and `resolveLocalePath()`,
 * exactly as before. The locale and the segment are captured, not written (`/break 143` hole 1):
 * Next matches sources case-insensitively, so the destination carries the visitor's own spelling
 * and the exact-match router 404s an uppercase address as it did.
 *
 * Every locale is listed, not only the ones products are built in: a rewrite to a route that has
 * no page for that locale is the same 404 the shared route gave it.
 */
import { LOCALES } from "../config/locales.ts";

import { type HeaderRule, NOINDEX_HEADER_NAME } from "./robots-headers.ts";

/**
 * The product route's first segment, `src/app/[locale]/-product`. Every slug matches
 * `^[a-z0-9]+(?:-[a-z0-9]+)*$` (`src/config/catalogue/schemas.ts`), so none begins with a hyphen
 * and this segment can never shadow a real page. Not `_product`: a `%5F` folder builds, but Next
 * 16.3.8 prerendered none of its `generateStaticParams` pages (only the fallback shell), which the
 * PDP's ISR prebuild (spec 009 §14 A6) cannot lose.
 */
export const PRODUCT_ROUTE_SEGMENT = "-product";

/** One `beforeFiles` rewrite with no condition: every request at the address, any query. */
export interface ProductRewriteRule {
  source: string;
  destination: string;
}

/** A literal for a path-to-regexp parameter group. */
function literal(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/** Fresh objects on every call, matching `listingRewriteRules()`. */
export function productRewriteRules(): ProductRewriteRule[] {
  return LOCALES.map((locale) => ({
    source: `/:locale(${literal(locale.code)})/:country/:product(${literal(
      locale.pathSegments.product,
    )})/:slug`,
    destination: `/:locale/${PRODUCT_ROUTE_SEGMENT}/:country/:product/:slug`,
  }));
}

/**
 * The internal path a product address is served from, or `null` when the address is not a product
 * page's shape. The same match the rules make (exact here, which is the case every link uses), for
 * tooling that reads the build output by path: `scripts/client-js-budget.ts` finds the prerendered
 * document of `/en/poland/product/amber-hour` at `en/-product/poland/product/amber-hour.html`.
 */
export function productRoutePathFor(url: string): string | null {
  const parts = url.replace(/\/+$/u, "").split("/").filter(Boolean);
  if (parts.length !== 4) return null;
  const [code, country, segment, slug] = parts;
  const locale = LOCALES.find((entry) => entry.code === code);
  if (
    locale === undefined ||
    segment !== locale.pathSegments.product ||
    country === undefined ||
    slug === undefined
  ) {
    return null;
  }
  return `/${code}/${PRODUCT_ROUTE_SEGMENT}/${country}/${segment}/${slug}`;
}

/**
 * The robots header on a **direct** request to the product route (`/en/-product/poland/product/…`).
 * Nobody links there, but a request typed at it would render the product page with a 200 under a
 * second address. Header sources match the address the visitor asked for, before rewrites, so a
 * request rewritten here from the real product address never matches this rule. The same value
 * as the parameter route's (`PARAMETER_ROUTE_ROBOTS`), for the same reason.
 */
export const PRODUCT_ROUTE_ROBOTS = "noindex, nofollow";

/** Next's header-source syntax for every path under the product route, in any locale. */
export const PRODUCT_ROUTE_HEADER_SOURCE = `/:locale/${PRODUCT_ROUTE_SEGMENT}/:path*`;

/** Fresh objects on every call. */
export function productRouteHeaderRules(): HeaderRule[] {
  return [
    {
      source: PRODUCT_ROUTE_HEADER_SOURCE,
      headers: [{ key: NOINDEX_HEADER_NAME, value: PRODUCT_ROUTE_ROBOTS }],
    },
  ];
}
