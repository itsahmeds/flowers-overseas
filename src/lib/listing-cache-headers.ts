/**
 * The shared-cache header on listing responses (spec 008 §5.4, §13 **Q2** as the founder resolved
 * it, AC-22; ADR-0018; TASK-114).
 *
 * > the listing routes are **rendered on the server per request and cached at the edge by full
 * > URL** — `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400` — with every
 * > data read wrapped in the same tag-keyed cache, so the per-request work is a projection over
 * > already-cached data. (§5.4)
 *
 * ## Why a header rule and not a route export
 *
 * A listing renders `?page=N` and `?sort=…`, so it reads `searchParams`, so Next renders it per
 * request; and a per-request render in Next 16 answers with `Cache-Control: private, no-cache,
 * no-store, max-age=0, must-revalidate` whatever `export const revalidate` says (measured on
 * 16.3.4). A Server Component cannot set a response header, `src/proxy.ts` is closed to routing
 * (spec 001 §11), and this is exactly the case `next.config`'s `headers()` exists for — the same
 * argument `src/lib/csp.ts` and `src/lib/media-headers.ts` already make: a config header applies
 * to **cached** responses too, and can be asserted from a unit test with no server running.
 *
 * Under ADR-0018 (one Railway replica behind Cloudflare) this is the whole caching story for the
 * page type: Cloudflare holds the rendered HTML by full URL for an hour and serves it stale for a
 * day while the origin re-renders, and the invalidation path is unchanged — `revalidateTag` plus
 * the URL purge that `src/lib/cache.ts` already owns (§5.4's "the only invalidation seam").
 *
 * ## What the sources match, and what they must not
 *
 * One rule per launch locale, naming that locale's **own** `shopCategory` segment
 * (`flowers` / `blumen` / `kwiaty`, from `src/config/locales.ts` — never a literal), with the
 * country slug as the one wildcard:
 *
 * ```
 * /en/:country/flowers      /de/:country/blumen      …
 * ```
 *
 * That shape is the country shop root and nothing else. It cannot match the corridor page
 * (`/en/send-flowers-to/poland` — third segment is a country slug), the category hub
 * (`/en/flowers/roses` — the segment is second, not third), the occasion hub
 * (`/en/occasions/mothers-day`), the destinations hub, the locale home or any static page, so no
 * prerendered ISR response has its own `Cache-Control` replaced. The two hubs stopped being
 * hypothetical in the 2026-09-22 rebase — TASK-112 landed them as branches of the same depth-3
 * route file, prerendered, reading no `searchParams` — so their exclusion is now load-bearing
 * rather than theoretical, and asserted as such. The
 * depth-4 country category and country occasion URLs are **not** here, and the reason changed
 * under this branch rather than going away: TASK-110/111 landed those routes
 * (`[locale]/[segment]/[child]/[grandchild]/page.tsx`) while this task was in review, but they
 * read no `searchParams`, so they are **prerendered ISR** with a `Cache-Control` of their own.
 * Giving them this rule would replace a working ISR header, which is the one thing the paragraph
 * above exists to prevent. The handoff therefore moves rather than closes: whichever task makes
 * a depth-4 listing honour `?page=`/`?sort=` makes it dynamic, and *that* task adds its depth
 * here. `tests/unit/listing-cache-headers.test.ts` asserts both depth-4 shapes stay unmatched.
 *
 * A listing URL that 404s *inside* this shape (`/en/atlantis/flowers`) does get the header, and
 * that is correct rather than tolerated: the existence set is fixed at build time
 * (`generateStaticParams` + `dynamicParams = false`), so the 404 is as stable as the 200 beside
 * it and holding it for an hour saves an origin render per crawl of a dead URL.
 */
import { launchLocales, localeConfig } from "../config/locales";

import type { HeaderRule } from "./robots-headers.ts";

/** §5.4's header, verbatim. One string, so the e2e and the unit test assert the same bytes. */
export const LISTING_CACHE_CONTROL =
  "public, s-maxage=3600, stale-while-revalidate=86400";

/**
 * The listing path shapes, in Next's header-source syntax, derived from the locale registry so a
 * new launch locale brings its own segment with it and no segment is ever written twice.
 */
export const LISTING_CACHE_PATHS: readonly string[] = launchLocales.map(
  (locale) =>
    `/${locale}/:country/${localeConfig(locale).pathSegments.shopCategory}`,
);

/** Fresh objects on every call, matching `noindexHeaderRules()` and `mediaCacheHeaderRules()`. */
export function listingCacheHeaderRules(): HeaderRule[] {
  return LISTING_CACHE_PATHS.map((source) => ({
    source,
    headers: [{ key: "Cache-Control", value: LISTING_CACHE_CONTROL }],
  }));
}
