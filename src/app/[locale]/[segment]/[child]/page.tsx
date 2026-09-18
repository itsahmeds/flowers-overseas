import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import {
  CountryShopRootPage,
  listingAlternatePaths,
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
  canonicalFor,
  deploymentDescriptor,
  pageIndexability,
  pageMetadata,
} from "@/modules/seo";

/**
 * `/{locale}/{segment}/{child}` — **one route file for one URL depth** (spec 008 §14 **A5**, spec
 * 007 §14 **A8**; TASK-109).
 *
 * Two page types share this depth and therefore this file:
 *
 * ```
 * /{locale}/{destinations}/{countrySlug}   spec 007's corridor page   (TASK-091)
 * /{locale}/{countrySlug}/{shopCategory}   spec 008's country shop root
 * ```
 *
 * They cannot each own a route file: Next.js allows exactly one dynamic slug **name** per (depth,
 * position) across the whole `app/` tree, route groups included, and `getSortedRoutes` throws on
 * `[destinations]/[country]` beside `[country]/[shopCategory]` at build *and* at server start. A
 * catch-all does not rescue it — the router returns the **first** matching dynamic route, so with
 * `dynamicParams = false` the corridor route would answer 404 for every shop URL. TASK-112's
 * occasion hub and the category hub join this file with one more branch of the same resolver.
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
 * genuinely have this page. JSON-LD is TASK-093's and TASK-115's; the slot is here and empty.
 */
export const revalidate = 3600;
export const dynamicParams = false;

/** The build's date, as the first day of both twelve-month date windows (spec 007 AC-22). */
function windowStart(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function generateStaticParams(): Promise<
  { locale: string; segment: string; child: string }[]
> {
  const params = [...(await localeChildParams())];
  // The counts of the set just emitted, where CI reads them (AC-3).
  await writeExistenceSummary();
  return params;
}

interface ChildParams {
  params: Promise<{ locale: string; segment: string; child: string }>;
}

export async function generateMetadata({
  params,
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
    const view = await listingView(
      {
        locale: match.locale,
        pageType: "countryShopRoot",
        country: match.countrySlug,
      },
      { from: windowStart(), deployment },
    );
    if (view === undefined) notFound();
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

    return pageMetadata({
      title: shop("root.seoTitle", { country }),
      description: shop("root.seoDescription", { country }),
      // `listingView()`'s own verdict, from `pageIndexability()` through
      // `listingIndexability()`: the page and its head cannot disagree about whether it is
      // indexable, and no robots literal is written outside `modules/seo` (spec 008 AC-14).
      directive: view.directive,
      canonical: canonicalFor(match.locale, view.path, {
        baseUrl: deployment.siteUrl,
      }),
      ...(cluster === undefined ? {} : { alternates: cluster }),
    });
  }

  notFound();
}

export default async function LocaleChildRoute({ params }: ChildParams) {
  const { locale, segment, child } = await params;
  const match = await resolveLocalePath(locale, [segment, child]);

  if (match.kind === "corridor") {
    const view = corridorView(match.iso2, match.locale, {
      from: windowStart(),
    });
    if (view === undefined) notFound();
    setRequestLocale(match.locale);
    return <CorridorPage view={view} />;
  }

  if (match.kind === "countryShopRoot") {
    const view = await listingView(
      {
        locale: match.locale,
        pageType: "countryShopRoot",
        country: match.countrySlug,
      },
      { from: windowStart() },
    );
    if (view === undefined) notFound();
    setRequestLocale(match.locale);
    return <CountryShopRootPage view={view} />;
  }

  notFound();
}
