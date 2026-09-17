import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { DestinationsHubPage, hubView } from "@/modules/geo";
import {
  alternatesFor,
  localePath,
  routableLocale,
  routableLocaleCodes,
} from "@/modules/i18n";
import {
  canonicalFor,
  deploymentDescriptor,
  pageIndexability,
  pageMetadata,
} from "@/modules/seo";

/**
 * `/{locale}/{destinations}` — the all-destinations hub (spec 007 §2 "Existence, URLs and
 * routing", §5.3, §5.4, §6, AC-7, AC-17, AC-20, AC-23, AC-24; `plan/05` #3; TASK-092).
 *
 * The parent of every corridor page, and the reason crawl depth from any locale home to any
 * destination is two (`plan/02` §11). It is the one page in the site that lists a destination we
 * have no page for — as text with its state line, never as a link.
 *
 * The route is thin for the corridor route's reason: it resolves one segment, asks
 * `src/modules/geo` for the view model and mounts one Server Component. Which destinations are
 * links, which regions render at all and whether the page is in its empty state are `hubView()`'s
 * answers, so flipping a country's `guidePublished` changes the page with **no edit under
 * `src/app/`** — spec 007 AC-7's "a new country is data" proof.
 *
 * **Existence.** The hub exists in every routable locale, including `/de` and `/pl` where no
 * destination has a page yet: the URL is in the locale's own footer and breadcrumb, so a 404 there
 * would be a broken site rather than an honest one (the artboards' "Empty states" block).
 * `generateStaticParams` emits exactly those locales and `dynamicParams = false`, so another
 * locale's `destinations` segment, an uppercase variant and an unknown locale are hard 404s
 * answered by the router. A **trailing slash** is Next's own permanent redirect to the bare URL
 * (§14 A6), not a 404.
 *
 * **Rendering: ISR, `revalidate` 86 400 s** (§5.4), with the hub's cache tags declared in
 * `src/lib/cache.ts` beside the invalidation seam — the corridor route's wiring, and for the same
 * reason: Next 16 attaches a tag to a cache entry only through `use cache`/`cacheTag()`, which
 * needs `cacheComponents`, so Phase 0 revalidates on time and the tag list lives where spec 012's
 * admin and the hourly sitemap job will inherit it. Nothing here reads a cookie or a request
 * header, so the response carries no `Vary` and is byte-identical for every visitor (AC-23).
 *
 * **Head.** Title and description are the hub's own reviewed catalogue copy; the robots directive
 * is `pageIndexability()`'s, with `reviewed` carrying §6's rule — *the hub is indexable when at
 * least one corridor in that locale is*, which is what stops a hub with nothing to link to from
 * being indexed. The canonical is emitted unchanged on a `noindex` page (AC-10), and the hreflang
 * cluster is one `alternatesFor()` call over the **page type**: the hub exists in every locale, so
 * the cluster is the set of *indexable* locales that `alternatesFor()` already filters to — `de`
 * and `pl` are unreviewed catalogues and contribute nothing, exactly as they do on the home.
 *
 * **JSON-LD** — `BreadcrumbList` from this same view model — is **TASK-093's**; the slot is here
 * and empty. No client island, nothing to hydrate (AC-24).
 */
export const revalidate = 86400;
export const dynamicParams = false;

export function generateStaticParams(): {
  locale: string;
  destinations: string;
}[] {
  return routableLocaleCodes().map((locale) => ({
    locale,
    // The localised segment of this locale, from `locales.data.ts` through the one URL builder:
    // `/en/send-flowers-to`, `/de/blumen-verschicken`, `/pl/wyslij-kwiaty`.
    destinations: localePath(locale, "destinations").split("/")[2] ?? "",
  }));
}

interface HubParams {
  params: Promise<{ locale: string; destinations: string }>;
}

/** The locale a request's params name, or `undefined` when the URL names no existing page. */
function resolve(params: { locale: string; destinations: string }) {
  const locale = routableLocale(params.locale);
  if (locale === undefined) return undefined;
  // The `destinations` segment must be **this** locale's own: `/pl/send-flowers-to` is a second
  // URL for one page, and `plan/02` §4 allows exactly one form per (locale, page).
  if (
    localePath(locale.code, "destinations") !==
    `/${locale.code}/${params.destinations}`
  ) {
    return undefined;
  }
  return locale.code;
}

export async function generateMetadata({
  params,
}: HubParams): Promise<Metadata> {
  const locale = resolve(await params);
  if (locale === undefined) notFound();

  const t = await getTranslations({ locale, namespace: "destinationsHub" });
  const view = hubView(locale);
  const deployment = deploymentDescriptor(process.env);
  const verdict = pageIndexability(
    {
      pageType: "destinationsHub",
      locale,
      exists: true,
      // §6: "The hub is indexable when at least one corridor in that locale is."
      reviewed: view.anyReviewed,
    },
    deployment,
  );

  // `alternatesFor()` refuses a non-`https` origin: a development deployment emits **no** hreflang
  // rather than an invalid one, and it is not an indexing environment either (the corridor route
  // documents the rule in full).
  const cluster = deployment.siteUrl.startsWith("https:")
    ? alternatesFor(
        { pageType: "destinations" },
        { baseUrl: deployment.siteUrl },
      ).find((page) => page.url.endsWith(view.path))?.alternates
    : undefined;

  return pageMetadata({
    title: t("seoTitle"),
    description: t("seoDescription"),
    directive: verdict.directive,
    canonical: canonicalFor(locale, view.path, { baseUrl: deployment.siteUrl }),
    ...(cluster === undefined ? {} : { alternates: cluster }),
  });
}

export default async function DestinationsHubRoute({ params }: HubParams) {
  const locale = resolve(await params);
  if (locale === undefined) notFound();
  setRequestLocale(locale);

  return <DestinationsHubPage locale={locale} />;
}
