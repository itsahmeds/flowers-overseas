import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  type LocalePathResolution,
  listingRequest,
  localeGrandchildParams,
  resolveLocalePath,
} from "@/modules/catalog";

import {
  CountryListing,
  countryListingMetadata,
} from "../../../country-listing";

/**
 * `/{locale}/{segment}/{child}/{grandchild}` — **one route file for one URL depth** (spec 008 §14
 * **A5**, applied one level down; TASK-110, TASK-111).
 *
 * Two page types share this depth and therefore this file:
 *
 * ```
 * /{locale}/{countrySlug}/{shopCategory}/{categorySlug}  spec 008's country category (TASK-110)
 * /{locale}/{countrySlug}/{occasions}/{occasionSlug}     spec 008's country occasion (TASK-111)
 * ```
 *
 * §5.2 draws them as two files; they cannot be two, for the reason §14 A5 records one depth up —
 * Next.js allows exactly one dynamic slug **name** per (depth, position) across `app/`, route
 * groups included, so `[country]/[shopCategory]/[category]` beside
 * `[country]/[occasions]/[occasion]` throws in `getSortedRoutes`, and either beside the shared
 * `[locale]/[segment]/[child]` throws at depth 2. A5's "depth-4 routes stay as §5.2 draws them"
 * is therefore read the only way it can be: **one file per depth, all the way down**, dispatching
 * through the same single resolver.
 *
 * `app/` stays thin: this file resolves one path, mounts one module page component and decides
 * nothing. `resolveLocalePath()` reads the existence set that already exists (`listingExists()`)
 * rather than inventing a second, which is what keeps the router, the sitemap builders, the link
 * renderers and the e2e crawl in agreement about the same URL (spec 008 AC-3).
 *
 * **Existence is the resolver's** (AC-1, **AC-5**). `generateStaticParams` emits exactly the
 * depth-4 listing existence set, and every other slug, every below-floor category, every occasion
 * not observed in that destination, every other locale's segment, every casing variant and every
 * unknown locale is a hard **404** — refused by the router, because the `[locale]` layout's
 * `dynamicParams = false` binds this whole subtree, and by `resolveLocalePath()` behind it — never
 * a redirect, a soft-404 or an empty grid. A **trailing slash** is the one shape that is not a 404:
 * `trailingSlash: false` answers it with a permanent redirect to the bare URL (§14 **A7**).
 * Nothing in this file names a country, a category, an occasion or a floor, which is why lifting
 * a category over `PRODUCT_COUNT_FLOOR` adds its URL with `git diff --stat src/app` empty.
 *
 * **The existence summary** (AC-3). The listings' table is written once per build by the depth-3
 * file's `generateStaticParams`, where `/review 76` ruling 4 put it; counting the same set twice
 * would print two tables into one CI step summary.
 *
 * **Rendering: ISR, `revalidate` 3600 s** with §5.4's tags, through `src/lib/cache.ts` as the only
 * invalidation seam. Nothing here reads a cookie or a request header, so no response carries a
 * `Vary` and every body is byte-identical for every visitor (AC-22).
 *
 * **Parameters** (spec 008 §14 A13, A15 (a); TASK-146, TASK-187). This file reads no query
 * string, so the route stays prebuilt and the router's `dynamicParams = false` gate holds. A country
 * category or country occasion request that carries a listing key (`?page=`, `?sort=`, a facet) is
 * rewritten by `next.config.ts` to the depth-4 parameter route
 * (`src/app/[locale]/%5Fquery/[segment]/[child]/[grandchild]/page.tsx`), and both files render the
 * two listing types through `../../../country-listing.tsx` with a `ListingRequest`, this one with
 * `listingRequest()` of nothing (the bare URL), so the two cannot drift.
 *
 * **Head.** The robots directive is `listingView()`'s own verdict, from `pageIndexability()`
 * through `listingIndexability()`: the page and its head cannot disagree about whether it is
 * indexable, and no robots literal is written here (AC-14). The canonical is `canonicalFor()`'s,
 * emitted unchanged on a `noindex` page, and the hreflang cluster is one `alternatesFor()` call
 * over the locales that genuinely have this page — a locale with no authored category or occasion
 * slug has no page and therefore no alternate (AC-16, §13 Q10). JSON-LD is TASK-115's; the slot
 * is here and empty.
 *
 * **The product page is not served here** (spec 009 §14 A-founder-2026-10-18a, AC-37; TASK-228).
 * Its address, `/{locale}/{countrySlug}/{product}/{productSlug}`, has the same depth, but
 * `next.config.ts` rewrites it to its own route file,
 * `src/app/[locale]/%5Fproduct/[segment]/[child]/[grandchild]/page.tsx`
 * (`src/lib/product-rewrites.ts`). Turbopack puts every client module a route file reaches into
 * that route's script set, so while this file mounted `ProductPage` the country category and
 * occasion fetched the product island's chunk. This file must never import `ProductPage` or
 * anything under `src/modules/ui/product/` again (`tests/unit/product-rewrites.test.ts`).
 */
export const revalidate = 3600;
// Inert under the `[locale]` layout's `dynamicParams = false` (spec 003's locale gate), which binds
// this subtree; unchanged when the product page moved out.
export const dynamicParams = true;

export async function generateStaticParams(): Promise<
  { locale: string; segment: string; child: string; grandchild: string }[]
> {
  return [...(await localeGrandchildParams())];
}

interface GrandchildParams {
  params: Promise<{
    locale: string;
    segment: string;
    child: string;
    grandchild: string;
  }>;
}

/**
 * The two resolutions this file serves; everything else the resolver returns is a 404 here. A
 * product address never reaches this file (`next.config.ts` rewrites it to the product route), and
 * if one did it would be a 404 rather than a product page that loads the island here again.
 */
type Depth4Match = Extract<
  LocalePathResolution,
  { kind: "countryCategory" | "countryOccasion" }
>;

function depth4(match: LocalePathResolution): Depth4Match | undefined {
  return match.kind === "countryCategory" || match.kind === "countryOccasion"
    ? match
    : undefined;
}

export async function generateMetadata({
  params,
}: GrandchildParams): Promise<Metadata> {
  const { locale, segment, child, grandchild } = await params;
  const match = depth4(
    await resolveLocalePath(locale, [segment, child, grandchild]),
  );
  if (match === undefined) notFound();

  return countryListingMetadata(match, listingRequest());
}

export default async function LocaleGrandchildRoute({
  params,
}: GrandchildParams) {
  const { locale, segment, child, grandchild } = await params;
  const match = depth4(
    await resolveLocalePath(locale, [segment, child, grandchild]),
  );
  if (match === undefined) notFound();

  return <CountryListing match={match} request={listingRequest()} />;
}
