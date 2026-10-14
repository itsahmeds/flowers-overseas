import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { isPublished } from "@/config/site-links";
import {
  CountryCategoryPage,
  CountryOccasionPage,
  type ListingRequest,
  type ListingView,
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
 * The country category's and the country occasion's head and body, **once**, for the two route
 * files that render them (spec 008 §14 **A15 (a)**, AC-10, AC-15, AC-16, AC-29; TASK-146,
 * TASK-187), exactly as `./country-shop-root.tsx` is for the shop root:
 *
 * ```
 * /{locale}/{country}/{shopCategory}/{category}           [segment]/[child]/[grandchild]/page.tsx           prebuilt (ISR)
 * /{locale}/{country}/{occasions}/{occasion}?page=2       %5Fquery/[segment]/[child]/[grandchild]/page.tsx  per request
 * ```
 *
 * The prebuilt depth-4 route reads no query string, so the router's `dynamicParams = false` gate
 * holds there (spec 008 §14 A13). `next.config.ts` rewrites a request carrying a listing key to
 * the depth-4 parameter route (`src/lib/listing-rewrites.ts`), the one file at that depth that
 * reads it. Both call this module with a `ListingRequest` (the prebuilt route with
 * `listingRequest()` of nothing, the parameter route with the request's own), so the view
 * function, the head and the body are one code path, and only the query differs.
 * `tests/unit/listing-params.test.ts` reads the three files as source and pins that wiring.
 */

/** The resolver's answers for the two listing types of depth 4. */
export type CountryListingMatch = Extract<
  LocalePathResolution,
  { kind: "countryCategory" | "countryOccasion" }
>;

/** The build's (or the request's) date, as the first day of the date windows (spec 007 AC-22). */
function windowStart(): string {
  return new Date().toISOString().slice(0, 10);
}

/** The entity slug **as the URL spells it**: the one field the two kinds name differently. */
function entitySlugOf(match: CountryListingMatch): string {
  return match.kind === "countryCategory"
    ? match.categorySlug
    : match.occasionSlug;
}

/**
 * `?page=1` → the listing's bare URL, permanently (spec 008 AC-10; A13's 308). The target is the
 * view model's own `path`, so the redirect cannot disagree with the canonical or the pager.
 */
function redirectToBare(request: ListingRequest, path: string): void {
  if (request.redirectToBare) permanentRedirect(path);
}

/** A page past the last, or data that moved under a prebuilt page: the honest answer is a 404. */
function found(view: ListingView | undefined): ListingView {
  if (view === undefined) notFound();
  return view;
}

export async function countryListingMetadata(
  match: CountryListingMatch,
  request: ListingRequest,
): Promise<Metadata> {
  const deployment = deploymentDescriptor(process.env);
  const view = found(
    await listingView(
      {
        locale: match.locale,
        pageType: match.kind,
        country: match.countrySlug,
        entity: entitySlugOf(match),
      },
      {
        from: windowStart(),
        deployment,
        page: request.page,
        sort: request.sort,
        parameterised: request.parameterised,
      },
    ),
  );
  redirectToBare(request, view.path);

  // `countries.ts` holds the country's name as a **dotted message key**, and next-intl types
  // `t()` against the catalogue's literal key union: a key read from a registry is not a literal,
  // so the cast is made here with the reason written down (the `modules/*/ui/labels.ts`
  // precedent). `pnpm i18n:check` proves the key exists.
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
    // `· Page N` from page 2 upward (AC-10, AC-29). Page 1 is the bare title.
    title:
      request.titlePage === undefined
        ? copy.title
        : shop("pagination.titleSuffix", {
            title: copy.title,
            page: request.titlePage,
          }),
    description: copy.description,
    // `listingView()`'s own verdict: a sort or facet term makes it `noindex,follow` (AC-15), and
    // no robots literal is written outside `modules/seo` (AC-14).
    directive: view.directive,
    // Parameter-free except an honoured `?page=N ≥ 2`, which is self-canonical (AC-16).
    canonical: canonicalFor(match.locale, view.path, {
      baseUrl: deployment.siteUrl,
      ...(request.canonicalPage === undefined
        ? {}
        : { page: request.canonicalPage }),
    }),
    ...(cluster === undefined ? {} : { alternates: cluster }),
  });
}

export async function CountryListing({
  match,
  request,
}: {
  match: CountryListingMatch;
  request: ListingRequest;
}) {
  const view = found(
    await listingView(
      {
        locale: match.locale,
        pageType: match.kind,
        country: match.countrySlug,
        entity: entitySlugOf(match),
      },
      {
        from: windowStart(),
        page: request.page,
        sort: request.sort,
        parameterised: request.parameterised,
        // Spec 009 publishes the `product` link id, so each card becomes a link (AC-20).
        productLinks: isPublished("product"),
      },
    ),
  );
  redirectToBare(request, view.path);
  setRequestLocale(match.locale);
  const alternates = (
    <LanguageAlternates
      paths={await listingAlternatePaths({
        pageType: match.kind,
        locale: match.locale,
        countryIso: match.iso2,
        ...(view.entity === undefined ? {} : { entityKey: view.entity.key }),
      })}
    />
  );
  return match.kind === "countryCategory" ? (
    <>
      <CountryCategoryPage view={view} />
      {alternates}
    </>
  ) : (
    <>
      <CountryOccasionPage view={view} />
      {alternates}
    </>
  );
}
