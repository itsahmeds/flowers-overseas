import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { isPublished } from "@/config/site-links";
import {
  CountryCategoryPage,
  CountryOccasionPage,
  ListingBreadcrumb,
  type ListingView,
  type LocalePathResolution,
  type ProductView,
  listingAlternatePaths,
  listingView,
  localeGrandchildParams,
  localeProductParams,
  productView,
  resolveLocalePath,
  writeProductExistenceSummary,
} from "@/modules/catalog";
import { DeliveryFacts } from "@/modules/geo";
import { alternatesFor } from "@/modules/i18n";
import {
  canonicalFor,
  deploymentDescriptor,
  pageMetadata,
} from "@/modules/seo";
// Imported directly, not through the `ui` barrel: `ProductPage` mounts the printed-card preview,
// Caveat's one importer, so the barrel must not reach it (`tests/unit/fonts.test.ts`).
import { ProductPage } from "@/modules/ui/product/ProductPage";

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
 */
export const revalidate = 3600;
export const dynamicParams = true;

/** The build's date, as the first day of the date window (spec 007 AC-22's rule). */
function windowStart(): string {
  return new Date().toISOString().slice(0, 10);
}

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

/** The two listing resolutions of this depth. */
type ListingMatch = Exclude<Depth4Match, { kind: "product" }>;

/** The product resolution of this depth. */
type ProductMatch = Extract<Depth4Match, { kind: "product" }>;

function depth4(match: LocalePathResolution): Depth4Match | undefined {
  return match.kind === "countryCategory" ||
    match.kind === "countryOccasion" ||
    match.kind === "product"
    ? match
    : undefined;
}

/** The entity slug **as the URL spells it** — the one field the two branches name differently. */
function entitySlugOf(match: ListingMatch): string {
  return match.kind === "countryCategory"
    ? match.categorySlug
    : match.occasionSlug;
}

/**
 * The one view model, asked for once per render and once per head (spec 008 §5.2's single-source
 * rule). `listingView()` answering `undefined` after the resolver said the page exists can only
 * mean the data moved under a prebuilt page, and the honest answer to that is the 404 the next
 * build would give anyway.
 */
async function viewFor(
  match: ListingMatch,
  options: Parameters<typeof listingView>[1],
): Promise<ListingView> {
  const view = await listingView(
    {
      locale: match.locale,
      pageType: match.kind,
      country: match.countrySlug,
      entity: entitySlugOf(match),
    },
    options,
  );
  if (view === undefined) notFound();
  return view;
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
    const country = label(view.country.nameKey);
    // The description is the shop's reviewed demo sentence: it is true of every product page in
    // Phase 0, and a PDP writes no new `<head>` copy of its own while every one is `noindex`.
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
      description: shop("root.demoNotice", { country }),
      directive: view.indexability.directive,
      canonical: canonicalFor(match.locale, view.path, {
        baseUrl: deployment.siteUrl,
      }),
    });
  }

  const view = await viewFor(match, { from: windowStart(), deployment });

  // `countries.ts` holds the country's name as a **dotted message key**, and next-intl types
  // `t()` against the catalogue's literal key union: a key read from a registry is not a literal,
  // so the cast is made here with the reason written down (the `modules/*/ui/labels.ts`
  // precedent). `pnpm i18n:check` proves the key exists. The entity's name needs no cast — it is
  // the founder's authored copy, carried on the view model.
  const t = await getTranslations({ locale: match.locale });
  const country = (t as unknown as (key: string) => string)(
    view.country?.nameKey ?? "",
  );
  const entity = view.entity?.name ?? "";
  const shop = await getTranslations({
    locale: match.locale,
    namespace: "shop",
  });

  const cluster = deployment.siteUrl.startsWith("https:")
    ? alternatesFor(
        {
          pathByLocale: await listingAlternatePaths({
            pageType: match.kind,
            locale: match.locale,
            countryIso: match.iso2,
            ...(view.entity === undefined
              ? {}
              : { entityKey: view.entity.key }),
          }),
        },
        { baseUrl: deployment.siteUrl },
      ).find((page) => page.url.endsWith(view.path))?.alternates
    : undefined;

  const copy =
    match.kind === "countryCategory"
      ? {
          title: shop("category.seoTitle", { country, entity }),
          description: shop("category.seoDescription", { country, entity }),
        }
      : {
          title: shop("occasion.seoTitle", { occasion: entity, country }),
          description: shop("occasion.seoDescription", {
            occasion: entity,
            country,
          }),
        };

  return pageMetadata({
    ...copy,
    directive: view.directive,
    canonical: canonicalFor(match.locale, view.path, {
      baseUrl: deployment.siteUrl,
    }),
    ...(cluster === undefined ? {} : { alternates: cluster }),
  });
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
    return (
      <ProductPage
        breadcrumb={<ListingBreadcrumb crumbs={product.breadcrumb} />}
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
    );
  }

  const view = await viewFor(match, {
    from: windowStart(),
    productLinks: isPublished("product"),
  });
  setRequestLocale(match.locale);

  return match.kind === "countryCategory" ? (
    <CountryCategoryPage view={view} />
  ) : (
    <CountryOccasionPage view={view} />
  );
}
