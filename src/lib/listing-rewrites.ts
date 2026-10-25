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
 * The same shape as `listing-cache-headers.ts`, from the same registry: one source per locale the
 * shop root is prebuilt in (launch locales, plus pseudo-locales where routed), naming that locale's
 * own `shopCategory` segment, the country slug as the one wildcard.
 * It cannot match the corridor (`/en/send-flowers-to/poland`) or a hub (`/en/flowers/roses`), so
 * those page types never leave their prebuilt route.
 *
 * **Depth 4** (spec 008 §14 A15 (a); TASK-146, TASK-187): two more sources per (locale, key), the
 * country category `/:locale/:country/:shop({shopCategory})/:entity` and the country occasion
 * `/:locale/:country/:occ({occasions})/:entity`, both to `/:locale/_query/:country/:seg/:entity`
 * (`src/app/[locale]/%5Fquery/[segment]/[child]/[grandchild]/page.tsx`). A product URL
 * (`/{country}/{product}/{slug}`) matches neither, because its third segment is the locale's
 * `product` segment: spec 009's `?tier=`/`?date=` stay TASK-128's.
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
import { LOCALES } from "../config/locales";
import { QUERY_KEY, QUERY_KEYS } from "../config/url-keys.ts";

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

/**
 * The query keys that send a listing request to the parameter route. Not `to`: it is the country
 * chooser's form field (TASK-385), read only on a chooser address, so on a listing it is a stray
 * key like any other and the static listing serves.
 */
export const LISTING_REWRITE_KEYS: readonly string[] = [
  ...QUERY_KEYS.filter((key) => key !== QUERY_KEY.to),
  ...Object.values(FACET_PARAMETERS),
];

/**
 * The locales the country shop root is prebuilt in, and so the locales whose parameters must be
 * honoured (`/break 143` hole 2): the launch locales **plus the pseudo-locales wherever the
 * deployment routes them** — `listingLocales()`'s filter (`src/modules/catalog/listing.ts`) over
 * the same registry, which already holds `en-XA`/`ar-XB` exactly when `ENABLE_PSEUDO_LOCALES` is
 * on (CI and previews; the production env schema refuses the flag). Read from `LOCALES` here
 * because `next.config.ts` cannot import a module; `tests/unit/listing-rewrites.test.ts` ties the
 * two lists together.
 */
export const LISTING_REWRITE_LOCALES: readonly string[] = LOCALES.filter(
  (locale) => locale.isLaunch || locale.isPseudo,
).map((locale) => locale.code);

/** A literal for a path-to-regexp parameter group (`en-gb`, `ar-XB`, `flowers` need none today). */
function literal(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/**
 * Fresh objects on every call, matching `listingCacheHeaderRules()`.
 *
 * **The locale and the shop segment are captured, not written** (`/break 143` hole 1). Next
 * matches custom-route sources case-insensitively (`sensitive: false` unless
 * `caseSensitiveRoutes`), so a literal `/en/:country/flowers` also matched `/EN/poland/FLOWERS`
 * and rewrote it to the lowercase destination, where it rendered page 2 of a page whose bare
 * address is a 404 (spec 008 AC-1, spec 003 AC-8). As named groups — `/:locale(en)/:country/
 * :shop(flowers)` — the match is the same, but the destination carries the visitor's own spelling,
 * and the parameter route's `resolveLocalePath()` (exact registry lookup, exact segment compare)
 * answers it 404 exactly as the router answers the bare uppercase address.
 */
export function listingRewriteRules(): RewriteRule[] {
  return LOCALES.filter((locale) =>
    LISTING_REWRITE_LOCALES.includes(locale.code),
  ).flatMap((locale): RewriteRule[] => {
    const code = literal(locale.code);
    const shopCategory = literal(locale.pathSegments.shopCategory);
    const occasions = literal(locale.pathSegments.occasions);
    const shapes: readonly { source: string; destination: string }[] = [
      {
        source: `/:locale(${code})/:country/:shop(${shopCategory})`,
        destination: `/:locale/${PARAMETER_ROUTE_SEGMENT}/:country/:shop`,
      },
      {
        source: `/:locale(${code})/:country/:shop(${shopCategory})/:entity`,
        destination: `/:locale/${PARAMETER_ROUTE_SEGMENT}/:country/:shop/:entity`,
      },
      {
        source: `/:locale(${code})/:country/:occ(${occasions})/:entity`,
        destination: `/:locale/${PARAMETER_ROUTE_SEGMENT}/:country/:occ/:entity`,
      },
    ];
    return shapes.flatMap((shape) =>
      LISTING_REWRITE_KEYS.map((key): RewriteRule => ({
        ...shape,
        has: [{ type: "query", key }],
      })),
    );
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

/**
 * The robots header on a **parameterised hub** address (spec 008 §14 A13 "The rule binds every
 * route file", AC-15; TASK-146, widened per TASK-114 E-7).
 *
 * The two destination-less hubs (`/{locale}/{shopCategory}/{category}`,
 * `/{locale}/{occasions}/{occasion}`) honour no parameter: `listingView()` forces the default order
 * on a listing with no country, no hub renders a toolbar or a pager, and the depth-3 route that
 * serves them is prebuilt and reads no query string (TASK-170). So a hub address with a listing key
 * is served the bare prebuilt document, whose canonical is already the bare URL, but whose meta
 * robots is the bare page's own verdict: after the indexing flip (TASK-096), `index,follow` on
 * `/en/flowers/roses?colour=red`, AC-15's canonical half without its `noindex` half (E-7's recorded
 * residual).
 *
 * The bare document cannot know it was asked with a parameter, and a rewrite to a per-request
 * route would take the hubs' prerendered documents out of the build for a parameter they cannot
 * use (E-7, point 3). A header can know: `next.config`'s `headers()` match the address the visitor
 * asked for, with the same `has: query` condition the rewrites use, so exactly the parameterised
 * hub addresses carry `X-Robots-Tag: noindex, follow`, and a crawler takes the stricter of the
 * header and the meta. The value is not the environment rule's bare `noindex` and not the
 * parameter route's `noindex, nofollow`, so the three are told apart on a served response outside
 * production too. Mounted after `noindexHeaderRules()`, so on these addresses this value is served.
 */
export const PARAMETERISED_HUB_ROBOTS = "noindex, follow";

/** Fresh objects on every call, matching `listingRewriteRules()`. */
export function parameterisedHubHeaderRules(): (HeaderRule & {
  has: [{ type: "query"; key: string }];
})[] {
  return LOCALES.filter((locale) =>
    LISTING_REWRITE_LOCALES.includes(locale.code),
  ).flatMap((locale) => {
    const code = literal(locale.code);
    return [
      `/:locale(${code})/:hub(${literal(locale.pathSegments.shopCategory)})/:entity`,
      `/:locale(${code})/:hub(${literal(locale.pathSegments.occasions)})/:entity`,
    ].flatMap((source) =>
      LISTING_REWRITE_KEYS.map((key) => ({
        source,
        has: [{ type: "query" as const, key }] as [
          { type: "query"; key: string },
        ],
        headers: [
          { key: NOINDEX_HEADER_NAME, value: PARAMETERISED_HUB_ROBOTS },
        ],
      })),
    );
  });
}
