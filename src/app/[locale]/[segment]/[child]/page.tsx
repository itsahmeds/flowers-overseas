import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import {
  CategoryHubPage,
  CountryShopRootPage,
  OccasionHubPage,
  type ListingRequest,
  listingAlternatePaths,
  listingRequest,
  listingView,
  localeChildParams,
  resolveLocalePath,
  writeExistenceSummary,
} from "@/modules/catalog";
import {
  CorridorPage,
  corridorAlternatePaths,
  corridorView,
} from "@/modules/geo";
import { alternatesFor } from "@/modules/i18n";
import {
  type BreadcrumbLabel,
  JsonLd,
  breadcrumbList,
  canonicalFor,
  deploymentDescriptor,
  faqPage,
  pageIndexability,
  pageMetadata,
  schemaOptions,
} from "@/modules/seo";

/**
 * `/{locale}/{segment}/{child}` — **one route file for one URL depth** (spec 008 §14 **A5**, spec
 * 007 §14 **A8**; TASK-109).
 *
 * Two page types share this depth and therefore this file:
 *
 * ```
 * /{locale}/{destinations}/{countrySlug}   spec 007's corridor page       (TASK-091)
 * /{locale}/{countrySlug}/{shopCategory}   spec 008's country shop root   (TASK-109)
 * /{locale}/{shopCategory}/{categorySlug}  spec 008's category hub        (TASK-112)
 * /{locale}/{occasions}/{occasionSlug}     spec 008's occasion hub        (TASK-112)
 * ```
 *
 * They cannot each own a route file: Next.js allows exactly one dynamic slug **name** per (depth,
 * position) across the whole `app/` tree, route groups included, and `getSortedRoutes` throws on
 * `[destinations]/[country]` beside `[country]/[shopCategory]` at build *and* at server start. A
 * catch-all does not rescue it — the router returns the **first** matching dynamic route, so with
 * `dynamicParams = false` the corridor route would answer 404 for every shop URL. The two hubs
 * joined this file the same way: one branch of the same resolver each, and no new route file.
 *
 * `app/` stays thin: this file resolves one path, mounts one module page component and decides
 * nothing. `resolveLocalePath()` is the single resolver, and it reads the existence sets that
 * already exist (`corridorPageExists()`, `listingExists()`) rather than inventing a third — which
 * is what keeps the router, the sitemap builders, the link renderers and the e2e crawl in
 * agreement about the same URL (spec 008 AC-3).
 *
 * **Existence is structural** (spec 008 AC-1, spec 007 AC-5). `generateStaticParams` emits the
 * union of both existence sets and `dynamicParams = false` makes every other slug, every other
 * locale's segment, every casing variant and every unknown locale a hard **404 answered by the
 * router** — not by a runtime branch here, and never a redirect, a soft-404 or an empty grid. A
 * **trailing slash** is the one shape that is not a 404: `trailingSlash: false` answers it with a
 * permanent redirect to the bare URL (spec 008 §14 **A7**, spec 007 §14 A6).
 *
 * **Rendering: ISR, `revalidate` 3600 s.** Spec 007 §14 A8 lowers the corridor's 86 400 to spec
 * 008 §5.4's 3 600 because a segment export cannot vary per param; the tags are unchanged and
 * stay in `src/lib/cache.ts` beside the invalidation seam. Nothing here reads a cookie or a
 * request header, so no response carries a `Vary` and every body is byte-identical for every
 * visitor (spec 007 AC-23, spec 008 AC-22).
 *
 * **The existence summary** (spec 008 AC-3, `/review 76` ruling 4): `writeExistenceSummary()` is
 * called from `generateStaticParams` — the function whose output the numbers describe — so the
 * per-locale counts printed to `$GITHUB_STEP_SUMMARY` are the counts of the URLs this build just
 * emitted, and not a second enumeration by a script.
 *
 * **Head.** The robots directive is `pageIndexability()`'s, through `listingView()`'s own verdict
 * for the shop root and `pageIndexability()` directly for the corridor; no robots literal is
 * written here (spec 008 AC-14). The canonical is `canonicalFor()`'s, emitted unchanged on a
 * `noindex` page, and the hreflang cluster is one `alternatesFor()` call over the locales that
 * genuinely have this page.
 *
 * **JSON-LD.** The corridor branch mounts `BreadcrumbList` + `FAQPage`, built by `src/modules/seo`
 * from **the same `corridorView` the page renders** — the trail is `view.breadcrumb`, the array
 * `CorridorBreadcrumb` renders, and the Q&A is `view.faq`, the array `CorridorFaq` renders, so
 * markup and visible text cannot diverge (spec 007 AC-15, TASK-093). A guide whose FAQ left the
 * 8–12 band emits no `FAQPage` at all rather than a partial one. The **shop-root branch emits
 * none**: its `BreadcrumbList` and `ItemList` are spec 008's and TASK-115's, and this file gains
 * one composition line there, not a second description of the page.
 *
 * **Query parameters, per branch** (spec 008 §2, §5.4, AC-9/AC-10/AC-15; TASK-114, merged with
 * TASK-112's hubs 2026-09-22). `searchParams` is awaited in the **country shop root branch
 * only**, and both renders hand that request's `parameterised` flag to `listingView()`. The
 * corridor and the two hub branches never reach the await, so they keep the prebuilt entry §5.4
 * requires of "the bare URL of every page type": §13 **Q2** bought dynamic rendering for the
 * routes that *honour* `?page=` and `?sort=`, and a destination-less hub honours neither — it
 * shows no money to sort by, so `listingView()` forces the default order on it (§2, §8), and it
 * renders no toolbar and no page nav. The consequence is recorded rather than hidden: after the
 * indexing flip a facet-shaped parameter on a hub URL is answered by the prebuilt document,
 * which is `index,follow` with a canonical to the bare URL — AC-15's canonical half without its
 * `noindex` half, at a page type that cannot compute the term without leaving the prerender
 * (`?sort=` is `robots.txt`-blocked, spec 007 §14 A5). Closing it is an edge rule (spec 040) or
 * the parameter-policy task TASK-114 **E-6** asks for, not a branch added here.
 * `tests/unit/listing-params.test.ts` pins both halves: each render's listing call must carry the
 * flag from its own parsed query, and its hub call must carry no `page`, no `sort` and no
 * `parameterised`.
 */
export const revalidate = 3600;
export const dynamicParams = false;

/** The build's date, as the first day of both twelve-month date windows (spec 007 AC-22). */
function windowStart(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Next calls `generateStaticParams` more than once per build (the collection pass and the render
 * pass), and the counts describe the build rather than the call: printing them twice would put two
 * identical tables in one CI step summary. One process, one table.
 */
let summaryWritten = false;

export async function generateStaticParams(): Promise<
  { locale: string; segment: string; child: string }[]
> {
  const params = [...(await localeChildParams())];
  // The counts of the set just emitted, where CI reads them (AC-3).
  if (!summaryWritten) {
    summaryWritten = true;
    await writeExistenceSummary();
  }
  return params;
}

interface ChildParams {
  params: Promise<{ locale: string; segment: string; child: string }>;
  /**
   * The listing query string (spec 008 §2 "Sort, filters, pagination", AC-9, AC-10, AC-15;
   * TASK-114). **Awaited in the listing branch only**, and that placement is load-bearing: an
   * awaited `searchParams` is what makes a Next render dynamic, and Next decides that *per
   * prerendered path* — so the corridor page, which never reaches the await, keeps the prebuilt
   * ISR entry spec 007 §5.4 requires (measured: the build prints `●` for the corridor paths and
   * `ƒ` for the route). The listing paths are the ones spec 008 §13 **Q2** ruled dynamic:
   * "server-rendered behind the Cloudflare edge cache (`s-maxage=3600,
   * stale-while-revalidate=86400`) with tag-keyed data caching beneath", which is also what the
   * artboard's "Caching" panel says, and the header is set for exactly those paths in
   * `next.config.ts` (`src/lib/listing-cache-headers.ts`).
   */
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * One request's query string, parsed once per render pass.
 *
 * `generateMetadata` and the page component are separate renders of the same request, so each
 * asks `listingRequest()` and each gets the same answer from the same pure function rather than
 * one of them deciding and handing the other a value it cannot check.
 */
async function listingQuery(
  searchParams: ChildParams["searchParams"],
): Promise<ListingRequest> {
  return listingRequest(await (searchParams ?? Promise.resolve({})));
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

export async function generateMetadata({
  params,
  searchParams,
}: ChildParams): Promise<Metadata> {
  const { locale, segment, child } = await params;
  const match = await resolveLocalePath(locale, [segment, child]);
  const deployment = deploymentDescriptor(process.env);

  if (match.kind === "corridor") {
    const view = corridorView(match.iso2, match.locale, {
      from: windowStart(),
    });
    if (view === undefined) notFound();
    const verdict = pageIndexability(
      {
        pageType: "corridor",
        locale: match.locale,
        exists: true,
        reviewed: view.reviewed,
      },
      deployment,
    );
    const cluster = deployment.siteUrl.startsWith("https:")
      ? alternatesFor(
          { pathByLocale: corridorAlternatePaths(view.iso2) },
          { baseUrl: deployment.siteUrl },
        ).find((page) => page.url.endsWith(view.path))?.alternates
      : undefined;
    return pageMetadata({
      title: view.seoTitle,
      description: view.seoDescription,
      directive: verdict.directive,
      canonical: canonicalFor(match.locale, view.path, {
        baseUrl: deployment.siteUrl,
      }),
      ...(cluster === undefined ? {} : { alternates: cluster }),
    });
  }

  if (match.kind === "countryShopRoot") {
    const request = await listingQuery(searchParams);
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

  if (match.kind === "categoryHub" || match.kind === "occasionHub") {
    const view = await listingView(
      {
        locale: match.locale,
        pageType: match.kind,
        entity: match.slug,
      },
      { from: windowStart(), deployment },
    );
    if (view === undefined) notFound();
    // The hub's `<title>` and description are the **authored** ones the founder wrote for this
    // category or occasion (spec 006's copy corpus), carried here on the one view model rather
    // than read from the copy files by this route (§5.2's single source). A template would give
    // twenty-three hubs twenty-three near-identical titles, which is §6's duplication risk in the
    // one place it is cheapest to avoid. The fallback is the page's own `h1` — never a literal.
    const hub = await getTranslations({
      locale: match.locale,
      namespace: match.kind === "categoryHub" ? "categoryHub" : "occasionHub",
    });
    const entity = view.entity?.name ?? "";
    const cluster = deployment.siteUrl.startsWith("https:")
      ? alternatesFor(
          {
            pathByLocale: await listingAlternatePaths({
              pageType: match.kind,
              locale: match.locale,
              ...(view.entity === undefined
                ? {}
                : { entityKey: view.entity.key }),
            }),
          },
          { baseUrl: deployment.siteUrl },
        ).find((page) => page.url.endsWith(view.path))?.alternates
      : undefined;

    return pageMetadata({
      title: view.entity?.seoTitle ?? hub("h1", { entity }),
      // The authored description, then the authored intro the page itself renders: both are
      // founder-written copy about this entity, and neither is a literal composed here.
      description:
        view.entity?.seoDescription ?? view.intro ?? hub("h1", { entity }),
      directive: view.directive,
      canonical: canonicalFor(match.locale, view.path, {
        baseUrl: deployment.siteUrl,
      }),
      ...(cluster === undefined ? {} : { alternates: cluster }),
    });
  }

  notFound();
}

/**
 * The one cast this route makes, for `src/modules/geo/ui/labels.ts`'s reason: a breadcrumb label is
 * **registry data** (`countries.ts`'s `nameKey`), and next-intl types `t()` against the literal key
 * union of the catalogue, which a dotted string held as data is not. Resolving it here — with the
 * same translator the components use — keeps the JSON-LD label and the visible label one message.
 *
 * Not exported, and deliberately placed *before* the page component rather than between the two
 * renders' bodies: `tests/unit/listing-params.test.ts` slices this file at its top-level
 * `export [default] async function` declarations and asserts each render's `parameterised`
 * pass-through alone, so a helper sitting here joins `generateMetadata`'s slice and carries no
 * `listingView(` call into it (TASK-093 + TASK-114, merged 2026-09-22).
 */
async function registryLabels(locale: string): Promise<BreadcrumbLabel> {
  const t = await getTranslations({ locale });
  return (key: string): string => (t as unknown as BreadcrumbLabel)(key);
}

export default async function LocaleChildRoute({
  params,
  searchParams,
}: ChildParams) {
  const { locale, segment, child } = await params;
  const match = await resolveLocalePath(locale, [segment, child]);

  if (match.kind === "corridor") {
    const view = corridorView(match.iso2, match.locale, {
      from: windowStart(),
    });
    if (view === undefined) notFound();
    setRequestLocale(match.locale);

    const options = schemaOptions(deploymentDescriptor(process.env).siteUrl);
    const label = await registryLabels(match.locale);

    return (
      <>
        <CorridorPage view={view} />
        <JsonLd
          nodes={
            options === undefined
              ? []
              : [
                  breadcrumbList(view.breadcrumb, label, options),
                  faqPage(view.faq),
                ]
          }
        />
      </>
    );
  }

  if (match.kind === "countryShopRoot") {
    const request = await listingQuery(searchParams);
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
      },
    );
    // A page past the last is `undefined` here and therefore a **404**, never an empty grid
    // (AC-10); `?page=1` is the bare URL's content at a duplicate URL, so it redirects.
    if (view === undefined) notFound();
    redirectToBare(request, view.path);
    setRequestLocale(match.locale);
    return <CountryShopRootPage view={view} />;
  }

  if (match.kind === "categoryHub" || match.kind === "occasionHub") {
    const view = await listingView(
      { locale: match.locale, pageType: match.kind, entity: match.slug },
      { from: windowStart() },
    );
    if (view === undefined) notFound();
    setRequestLocale(match.locale);
    return match.kind === "categoryHub" ? (
      <CategoryHubPage view={view} />
    ) : (
      <OccasionHubPage view={view} />
    );
  }

  notFound();
}
