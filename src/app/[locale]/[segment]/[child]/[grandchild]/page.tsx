import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import {
  CountryCategoryPage,
  CountryOccasionPage,
  type ListingView,
  type LocalePathResolution,
  listingAlternatePaths,
  listingView,
  localeGrandchildParams,
  resolveLocalePath,
} from "@/modules/catalog";
import { alternatesFor } from "@/modules/i18n";
import {
  canonicalFor,
  deploymentDescriptor,
  pageMetadata,
} from "@/modules/seo";

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
 * **Existence is structural** (AC-1, **AC-5**). `generateStaticParams` emits exactly the depth-4
 * existence set and `dynamicParams = false` makes every other slug, every below-floor category,
 * every occasion not observed in that destination, every other locale's segment, every casing
 * variant and every unknown locale a hard **404 answered by the router** — never a redirect, a
 * soft-404 or an empty grid. A **trailing slash** is the one shape that is not a 404:
 * `trailingSlash: false` answers it with a permanent redirect to the bare URL (§14 **A7**).
 * Nothing in this file names a country, a category, an occasion or a floor, which is why lifting
 * a category over `PRODUCT_COUNT_FLOOR` adds its URL with `git diff --stat src/app` empty.
 *
 * **The existence summary** (AC-3) is written once per build by the depth-3 file's
 * `generateStaticParams`, where `/review 76` ruling 4 put it; counting the same set twice would
 * print two tables into one CI step summary.
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
 */
export const revalidate = 3600;
export const dynamicParams = false;

/** The build's date, as the first day of the date window (spec 007 AC-22's rule). */
function windowStart(): string {
  return new Date().toISOString().slice(0, 10);
}

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

/** The two resolutions this depth serves; everything else the resolver returns is a 404 here. */
type Depth4Match = Extract<
  LocalePathResolution,
  { kind: "countryCategory" | "countryOccasion" }
>;

function depth4(match: LocalePathResolution): Depth4Match | undefined {
  return match.kind === "countryCategory" || match.kind === "countryOccasion"
    ? match
    : undefined;
}

/** The entity slug **as the URL spells it** — the one field the two branches name differently. */
function entitySlugOf(match: Depth4Match): string {
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
  match: Depth4Match,
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

export async function generateMetadata({
  params,
}: GrandchildParams): Promise<Metadata> {
  const { locale, segment, child, grandchild } = await params;
  const match = depth4(
    await resolveLocalePath(locale, [segment, child, grandchild]),
  );
  if (match === undefined) notFound();

  const deployment = deploymentDescriptor(process.env);
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

  const view = await viewFor(match, { from: windowStart() });
  setRequestLocale(match.locale);

  return match.kind === "countryCategory" ? (
    <CountryCategoryPage view={view} />
  ) : (
    <CountryOccasionPage view={view} />
  );
}
