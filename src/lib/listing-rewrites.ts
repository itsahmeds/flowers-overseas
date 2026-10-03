/**
 * The listing rewrite: a request that carries a parameter the country shop root honours is
 * answered by the internal parameter route, and every other request by the prebuilt page (spec
 * 003 AC-8, spec 008 §5.4, §13 Q2; TASK-170, after the advisor memo
 * `docs/advice/2026-10-03-route-rendering-404-and-pdp-form.md`, option (a)).
 *
 * ## Why a rewrite
 *
 * A route file that awaits `searchParams` is rendered per request, and Next writes no
 * `dynamicRoutes` entry for a per-request route, so the router stops enforcing
 * `dynamicParams = false` there. The depth-3 route read the query for the shop root's `?page=` and
 * `?sort=` (TASK-114), and so every unknown depth-3 path reached the page, called `notFound()` at
 * request time and got Next's error shell — a 404 with no `lang` (TASK-170 E-1). The rule since:
 * **route files never read the query string**; a request that carries a parameter the site
 * honours is handed to one internal route that does.
 *
 * A `beforeFiles` rewrite with a `has: query` condition does exactly that, before the filesystem
 * routes are matched and after `src/proxy.ts` has run (the proxy logs and tags the original path
 * either way). The browser's address does not change, nothing redirects, and the query string
 * reaches the parameter route intact. It is keyed on **parameter names** only — it holds no
 * catalogue data, so it is not the proxy rewrite spec 008 §14 A5 rejected (a second copy of the
 * existence set): an unknown country with a known parameter (`/en/atlantis/flowers?page=2`) is
 * rewritten, resolved by `resolveLocalePath()` in the parameter route and answered 404 there.
 *
 * ## What the sources match
 *
 * The same shape as `listing-cache-headers.ts`, from the same registry: one source per launch
 * locale naming that locale's own `shopCategory` segment, the country slug as the one wildcard.
 * It cannot match the corridor (`/en/send-flowers-to/poland`), a hub (`/en/flowers/roses`) or a
 * depth-4 URL, so those page types never leave their prebuilt route.
 *
 * ## Which parameters
 *
 * `QUERY_KEYS` (`page`, `sort` — the keys the listing honours) and every facet's parameter name
 * (`FACET_PARAMETERS`, spec 008 §13 Q6): a facet is not honoured in Phase 0, but it is what makes
 * a URL `noindex,follow` (AC-15), and only the per-request render can compute that term. A
 * campaign or click-id parameter (`utm_source`, `gclid`) is in neither list, so it gets the
 * prebuilt document, whose canonical is the bare URL — spec 007 §14 A5's canonical stripping.
 * One rule per (locale, key), because a `has` key is matched literally.
 */
import { FACET_PARAMETERS } from "../config/catalogue/schemas.ts";
import { launchLocales, localeConfig } from "../config/locales";
import { QUERY_KEYS } from "../config/url-keys.ts";

import { type HeaderRule, NOINDEX_HEADER_NAME } from "./robots-headers.ts";

/** One `beforeFiles` rewrite, in the shape `next.config`'s `rewrites()` takes. */
export interface RewriteRule {
  source: string;
  destination: string;
  has: [{ type: "query"; key: string }];
}

/**
 * The internal parameter route's first segment. The folder is `src/app/[locale]/%5Fquery`, which
 * Next serves as `_query`: no slug can begin with an underscore, so the segment can never shadow a
 * real page at any depth.
 */
export const PARAMETER_ROUTE_SEGMENT = "_query";

/** The query keys that send a listing request to the parameter route. */
export const LISTING_REWRITE_KEYS: readonly string[] = [
  ...QUERY_KEYS,
  ...Object.values(FACET_PARAMETERS),
];

/** Fresh objects on every call, matching `listingCacheHeaderRules()`. */
export function listingRewriteRules(): RewriteRule[] {
  return launchLocales.flatMap((locale): RewriteRule[] => {
    const shopCategory = localeConfig(locale).pathSegments.shopCategory;
    return LISTING_REWRITE_KEYS.map((key) => ({
      source: `/${locale}/:country/${shopCategory}`,
      destination: `/${locale}/${PARAMETER_ROUTE_SEGMENT}/:country/${shopCategory}`,
      has: [{ type: "query", key }],
    }));
  });
}

/**
 * The robots header on a **direct** request to the parameter route (`/review 143`, TASK-170).
 *
 * Nobody links to `/{locale}/_query/…`, but a request typed straight at it with a listing key
 * (`/en/_query/poland/flowers?page=2`) renders the listing with a 200 — and after the indexing
 * flip that page's own meta would say `index,follow`. This header keeps it out of every index in
 * every environment.
 *
 * Header sources are matched against the address the visitor asked for, **before** rewrites, so
 * a request rewritten here from `/en/poland/flowers?page=2` never matches this rule: only a
 * direct hit does. The value is `noindex, nofollow` rather than the environment rule's bare
 * `noindex` so the two are distinguishable outside production, where every response already
 * carries `X-Robots-Tag: noindex` (`noindexHeaderRules()`). Mounted after that rule, so on a
 * direct hit this value is the one served. `nofollow` costs nothing: no page links here, and every
 * link on the page is reachable from the real address. `tests/e2e/listing-params.spec.ts` proves
 * both halves on a served response.
 */
export const PARAMETER_ROUTE_ROBOTS = "noindex, nofollow";

/** Next's header-source syntax for every path under the parameter route, in any locale. */
export const PARAMETER_ROUTE_HEADER_SOURCE = `/:locale/${PARAMETER_ROUTE_SEGMENT}/:path*`;

/** Fresh objects on every call, matching `listingCacheHeaderRules()`. */
export function parameterRouteHeaderRules(): HeaderRule[] {
  return [
    {
      source: PARAMETER_ROUTE_HEADER_SOURCE,
      headers: [{ key: NOINDEX_HEADER_NAME, value: PARAMETER_ROUTE_ROBOTS }],
    },
  ];
}
