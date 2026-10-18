import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { isPublished } from "@/config/site-links";
import {
  ListingBreadcrumb,
  type LocalePathResolution,
  type ProductView,
  listingRequest,
  localeGrandchildParams,
  localeProductParams,
  productAlternatePaths,
  productJsonLd,
  productView,
  resolveLocalePath,
  writeProductExistenceSummary,
} from "@/modules/catalog";
import { DeliveryFacts } from "@/modules/geo";
import { LanguageAlternates } from "@/modules/i18n";
import {
  type BreadcrumbLabel,
  JsonLd,
  canonicalFor,
  deploymentDescriptor,
  pageMetadata,
  schemaOptions,
} from "@/modules/seo";
// Imported directly, not through the `ui` barrel: `ProductPage` mounts the printed-card preview,
// Caveat's one importer, so the barrel must not reach it (`tests/unit/fonts.test.ts`).
import { ProductPage } from "@/modules/ui/product/ProductPage";

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
 * **The existence summaries** (AC-3). The listings' table is written once per build by the depth-3
 * file's `generateStaticParams`, where `/review 76` ruling 4 put it; counting the same set twice
 * would print two tables into one CI step summary. The **product** table (spec 009 AC-3, §11) is
 * written here, by the `generateStaticParams` that emits the prebuilt product params it counts,
 * behind the same once-per-process guard (`/review 96`'s carry-forward to TASK-127); its
 * "Prebuilt" column equals its "PDPs" column since A6.
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
 * **The product page is the third page type here** (spec 009 §2, §5.4; TASK-127):
 *
 * ```
 * /{locale}/{countrySlug}/{product}/{productSlug}        spec 009's product detail page
 * ```
 *
 * **Its params are its existence set** (spec 009 §14 **A6**, AC-3; TASK-127 E-1): every product
 * page per (locale, published destination), 2 352 in production's four locales. The
 * `[locale]` layout exports `dynamicParams = false` (spec 003's locale gate) and Next computes a
 * route's `dynamicParams` as `every` segment's, so a URL this build did not emit is a router 404
 * whatever this file says — rendered as the x-default `not-found.tsx` document with its `lang`,
 * which is why the gate stays where spec 003 put it. A top-24 prebuild under that gate left 420
 * of 588 product pages per locale answering 404. `dynamicParams = true` below is therefore
 * **inert** while the layout's is `false`; it is kept so that, if the gate ever moves (spec 003
 * §14 A3's Cache Components tripwire), the route already resolves on demand through
 * `productPageExists()` rather than silently refusing.
 *
 * The product branch mounts one module page component, `ProductPage`, over one `productView()`;
 * the two blocks that page cannot import — spec 008's breadcrumb and spec 007's delivery facts —
 * are mounted here over the same view and handed in as slots (the import direction is in
 * `ProductPage`'s header). It renders the bare URL: `?tier=` / `?date=` and their form are
 * TASK-128's, so this branch reads no search parameter and stays ISR.
 *
 * **Its JSON-LD** (spec 009 AC-18; TASK-130) is `productJsonLd()` over the same view: the
 * `BreadcrumbList` of `product.breadcrumb`, and a `Product` + `Offer` only behind the gate, which
 * is shut on every Phase 0 PDP. The listing branches' JSON-LD is still TASK-115's.
 */
export const revalidate = 3600;
export const dynamicParams = true;

/**
 * Next calls `generateStaticParams` more than once per build (the collection pass and the render
 * pass), and the counts describe the build rather than the call: one process, one table.
 */
let productSummaryWritten = false;

export async function generateStaticParams(): Promise<
  { locale: string; segment: string; child: string; grandchild: string }[]
> {
  const params = [
    ...(await localeGrandchildParams()),
    ...(await localeProductParams()),
  ];
  // The product counts of the set just emitted, where CI reads them (spec 009 AC-3).
  if (!productSummaryWritten) {
    productSummaryWritten = true;
    await writeProductExistenceSummary();
  }
  return params;
}

interface GrandchildParams {
  params: Promise<{
    locale: string;
    segment: string;
    child: string;
    grandchild: string;
  }>;
}

/** The three resolutions this depth serves; everything else the resolver returns is a 404 here. */
type Depth4Match = Extract<
  LocalePathResolution,
  { kind: "countryCategory" | "countryOccasion" | "product" }
>;

/** The product resolution of this depth. */
type ProductMatch = Extract<Depth4Match, { kind: "product" }>;

function depth4(match: LocalePathResolution): Depth4Match | undefined {
  return match.kind === "countryCategory" ||
    match.kind === "countryOccasion" ||
    match.kind === "product"
    ? match
    : undefined;
}

/**
 * The product page's one view model (spec 009 §5.2, T-32). `undefined` after the resolver said
 * the page exists can only mean the data moved under the page, and the honest answer is the 404
 * the existence rule now gives. The bare URL: `parameterised` is `false` because this branch reads
 * no search parameter (TASK-128 owns `?tier=` / `?date=`).
 */
async function productViewFor(
  match: ProductMatch,
  deployment?: Parameters<typeof productView>[1]["deployment"],
): Promise<ProductView> {
  const view = await productView(
    { locale: match.locale, countryIso: match.iso2, sku: match.sku },
    {
      parameterised: false,
      productLinks: isPublished("product"),
      ...(deployment === undefined ? {} : { deployment }),
    },
  );
  if (view === undefined) notFound();
  return view;
}

export async function generateMetadata({
  params,
}: GrandchildParams): Promise<Metadata> {
  const { locale, segment, child, grandchild } = await params;
  const match = depth4(
    await resolveLocalePath(locale, [segment, child, grandchild]),
  );
  if (match === undefined) notFound();

  const deployment = deploymentDescriptor(process.env);

  if (match.kind === "product") {
    const view = await productViewFor(match, deployment);
    const t = await getTranslations({ locale: match.locale });
    const label = t as unknown as (
      key: string,
      values?: Record<string, string>,
    ) => string;
    // The description is the shop's demo sentence (N1, spec 004 §14 A23 clause 12): it is true of
    // every product page in Phase 0, and a PDP writes no new `<head>` copy of its own while every
    // one is `noindex`.
    const shop = await getTranslations({
      locale: match.locale,
      namespace: "shop",
    });
    return pageMetadata({
      title:
        view.h1.formKey === undefined
          ? view.h1.name
          : label(view.h1.key, {
              name: view.h1.name,
              descriptor: label(view.h1.formKey, {
                flower: label(view.h1.flowerKey),
              }),
            }),
      description: shop("root.demoNotice"),
      directive: view.indexability.directive,
      canonical: canonicalFor(match.locale, view.path, {
        baseUrl: deployment.siteUrl,
      }),
    });
  }

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

  if (match.kind === "product") {
    const product = await productViewFor(match);
    setRequestLocale(match.locale);
    const options = schemaOptions(deploymentDescriptor(process.env).siteUrl);
    // The translator `ListingBreadcrumb` reads, so the JSON-LD label and the visible label are one
    // message with one value (the `[child]` route's `registryLabels()` cast, for its reason).
    const t = await getTranslations({ locale: match.locale });
    const label = t as unknown as BreadcrumbLabel;
    // The popup's options go to this product in each locale that has it (TASK-197, owed from
    // the TASK-179 review); nothing here touches the head.
    const productAlternates = (
      <LanguageAlternates
        paths={await productAlternatePaths({
          sku: match.sku,
          countryIso: match.iso2,
        })}
      />
    );
    return (
      <>
        <ProductPage
          breadcrumb={
            // The product page keeps its trail on the phone and shows no back link (spec 004
            // §14 A24 clause 4 (e)); `ProductPage` displays it below the buy section there.
            <ListingBreadcrumb crumbs={product.breadcrumb} phone="trail" />
          }
          facts={
            <DeliveryFacts
              facts={product.facts}
              locale={product.locale}
              nameKey={product.country.nameKey}
              prices="omit"
            />
          }
          view={product}
        />
        {productAlternates}
        {/* `BreadcrumbList` from the trail above, and the gated `Product` + `Offer` (spec 009
            AC-18; TASK-130): one `productView()` in, so the markup cannot disagree with the page. */}
        <JsonLd
          nodes={
            options === undefined ? [] : productJsonLd(product, label, options)
          }
        />
      </>
    );
  }

  return <CountryListing match={match} request={listingRequest()} />;
}
