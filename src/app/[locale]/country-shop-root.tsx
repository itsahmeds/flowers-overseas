import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { isPublished } from "@/config/site-links";

import {
  CountryShopRootPage,
  type ListingRequest,
  type LocalePathResolution,
  listingAlternatePaths,
  listingView,
} from "@/modules/catalog";
import { LanguageAlternates, alternatesFor } from "@/modules/i18n";
import {
  canonicalFor,
  deploymentDescriptor,
  pageMetadata,
} from "@/modules/seo";

/**
 * The country shop root's head and body, **once**, for the two route files that render it (spec
 * 008 §2, §5.4, AC-9/AC-10/AC-15/AC-16; TASK-114, split by TASK-170).
 *
 * ```
 * /{locale}/{country}/{shopCategory}            [segment]/[child]/page.tsx          prebuilt (ISR)
 * /{locale}/{country}/{shopCategory}?page=2     %5Fquery/[segment]/[child]/page.tsx per request
 * ```
 *
 * **Why two route files.** A route file that awaits `searchParams` is rendered per request
 * (`ƒ`), and a `ƒ` route gets no `dynamicRoutes` entry in the prerender manifest, so the router
 * stops enforcing `dynamicParams = false` on it: every unknown path at that depth reached the page,
 * its `notFound()` ran at request time, and Next answered with its error shell — 404 inside
 * `<html id="__next_error__">` with no `lang` (TASK-170 E-1, measured on Next 16.3.6). So the depth-3
 * route reads no query string and stays prebuilt, and a request that carries a parameter the
 * listing honours is rewritten by `next.config.ts` (`src/lib/listing-rewrites.ts`) to the internal
 * parameter route, which is the one file that reads it. The address in the browser does not
 * change, and nothing redirects.
 *
 * **Why one module.** Two files rendering one page type can drift. Both call this module with a
 * `ListingRequest` — the depth-3 route with `listingRequest()` of nothing (the bare URL), the
 * parameter route with `listingRequest()` of the request's own query — so the view function, the
 * head and the body are one code path, and only the query differs.
 * `tests/unit/listing-params.test.ts` reads both route files and this one as source and pins
 * that wiring.
 */

/** The resolver's answer for this page type: the only input the route files pass besides the query. */
export type CountryShopRootMatch = Extract<
  LocalePathResolution,
  { kind: "countryShopRoot" }
>;

/** The build's (or the request's) date, as the first day of the date windows (spec 007 AC-22). */
export function windowStart(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * `?page=1` → the listing's bare URL, permanently (spec 008 AC-10).
 *
 * The target is the **view model's** own `path`, which is why the caller resolves the view first:
 * §5.2 makes `listingView()` the only source of a listing's URL, so the redirect cannot disagree
 * with the canonical, the sitemap row or the pagination links.
 *
 * `permanentRedirect()` is Next's permanent redirect and emits **308**, not the 301 AC-10 names.
 * Spec 007 §14 **A6** already ruled that exact shape for the trailing slash — "Next's 308 today;
 * Cloudflare's 301 once spec 040 fronts the origin", with the e2e asserting `301|308` and the
 * `Location` — and this is the same platform limit: a page render cannot choose a status code,
 * and a `next.config` redirect cannot strip the parameter it matched (its destination query is
 * `{...requestQuery, ...destinationQuery}`, so a rule matching `?page=1` redirects to `?page=1`
 * forever — measured on Next 16.3.4). `src/proxy.ts`, the one place that could emit a 301, is
 * closed to redirects by spec 001 §11 and `fo/no-geo-redirect`.
 */
function redirectToBare(request: ListingRequest, path: string): void {
  if (request.redirectToBare) permanentRedirect(path);
}

export async function countryShopRootMetadata(
  match: CountryShopRootMatch,
  request: ListingRequest,
): Promise<Metadata> {
  const deployment = deploymentDescriptor(process.env);
  const view = await listingView(
    {
      locale: match.locale,
      pageType: "countryShopRoot",
      country: match.countrySlug,
    },
    {
      from: windowStart(),
      deployment,
      page: request.page,
      sort: request.sort,
      parameterised: request.parameterised,
    },
  );
  if (view === undefined) notFound();
  redirectToBare(request, view.path);
  // `countries.ts` holds the country's name as a **dotted message key**, and next-intl types
  // `t()` against the catalogue's literal key union: a key read from a registry is not a
  // literal, so the cast is made here with the reason written down (the
  // `modules/*/ui/labels.ts` precedent). `pnpm i18n:check` proves the key exists.
  const t = await getTranslations({ locale: match.locale });
  const country = (t as unknown as (key: string) => string)(
    view.country?.nameKey ?? "",
  );
  const shop = await getTranslations({
    locale: match.locale,
    namespace: "shop",
  });
  const cluster = deployment.siteUrl.startsWith("https:")
    ? alternatesFor(
        {
          pathByLocale: await listingAlternatePaths({
            pageType: "countryShopRoot",
            locale: match.locale,
            countryIso: match.iso2,
          }),
        },
        { baseUrl: deployment.siteUrl },
      ).find((page) => page.url.endsWith(view.path))?.alternates
    : undefined;

  const title = shop("root.seoTitle", { country });

  return pageMetadata({
    // `· Page N` from page 2 upward, in the locale's own words and numerals (AC-10). Page 1 is
    // the bare title, because page 1 is the bare URL.
    title:
      request.titlePage === undefined
        ? title
        : shop("pagination.titleSuffix", { title, page: request.titlePage }),
    description: shop("root.seoDescription", { country }),
    // `listingView()`'s own verdict, from `pageIndexability()` through
    // `listingIndexability()`: the page and its head cannot disagree about whether it is
    // indexable, and no robots literal is written outside `modules/seo` (spec 008 AC-14). The
    // `unparameterised` term this request carried is what makes a sorted or faceted URL
    // `noindex,follow` (AC-15).
    directive: view.directive,
    // Parameter-free, **except** an honoured `?page=N ≥ 2`, which is self-canonical (AC-16).
    // A sorted or faceted URL passes no page: it canonicals to the base, which is the URL that
    // should be indexed instead of it.
    canonical: canonicalFor(match.locale, view.path, {
      baseUrl: deployment.siteUrl,
      ...(request.canonicalPage === undefined
        ? {}
        : { page: request.canonicalPage }),
    }),
    ...(cluster === undefined ? {} : { alternates: cluster }),
  });
}

export async function CountryShopRoot({
  match,
  request,
}: {
  match: CountryShopRootMatch;
  request: ListingRequest;
}) {
  const view = await listingView(
    {
      locale: match.locale,
      pageType: "countryShopRoot",
      country: match.countrySlug,
    },
    {
      from: windowStart(),
      page: request.page,
      sort: request.sort,
      parameterised: request.parameterised,
      // Spec 009 publishes the `product` link id, so each card becomes a link (AC-20).
      productLinks: isPublished("product"),
    },
  );
  // A page past the last is `undefined` here and therefore a **404**, never an empty grid
  // (AC-10); `?page=1` is the bare URL's content at a duplicate URL, so it redirects.
  if (view === undefined) notFound();
  redirectToBare(request, view.path);
  setRequestLocale(match.locale);
  return (
    <>
      <CountryShopRootPage view={view} />
      <LanguageAlternates
        paths={await listingAlternatePaths({
          pageType: "countryShopRoot",
          locale: match.locale,
          countryIso: match.iso2,
        })}
      />
    </>
  );
}
