import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import {
  CorridorPage,
  corridorAlternatePaths,
  corridorIso2ForSlug,
  corridorView,
  listCorridorPages,
} from "@/modules/geo";
import { alternatesFor, localePath, routableLocale } from "@/modules/i18n";
import {
  canonicalFor,
  deploymentDescriptor,
  pageIndexability,
  pageMetadata,
} from "@/modules/seo";

/**
 * `/{locale}/{destinations}/{country}` — the corridor page (spec 007 §2, §5.2, §5.4, AC-5, AC-6,
 * AC-8, AC-22, AC-23, AC-24; TASK-091).
 *
 * The route is thin on purpose: it resolves two segments, asks `src/modules/geo` for the view
 * model and mounts one Server Component. Every decision that could be got wrong — whether the
 * page exists, which state it is in, which blocks render, whether a related destination is a link
 * — is made inside the module, which is what makes spec 007 AC-7's "a new country is data" proof
 * a change under `src/config/` and `content/` with **no change under `src/app/`**.
 *
 * **Existence is structural.** `generateStaticParams()` returns exactly the (locale, country)
 * pairs that satisfy `plan/02` §5.1 — `status === 'live' || guidePublished`, **and** an authored
 * content file for that locale — and `dynamicParams = false` makes every other slug, every other
 * `destinations` segment (another locale's), every casing variant and every unknown locale a hard
 * **404 answered by the router**, not by a runtime branch in this file (AC-5, AC-6). The
 * `notFound()` calls below are the dev server's second line, where params are not pre-resolved;
 * neither is a redirect, and neither rewrites a URL into its lowercase form (ADR-0006).
 *
 * **Rendering: ISR, `revalidate` 86 400 s, tags `corridor:{iso2}`, `corridor:{iso2}:{locale}` and
 * `sitemap`** (§5.4). The tag names come from `src/lib/cache.ts`, so the page and whatever purges
 * it cannot spell them differently; Next 16 attaches a tag to a cache entry only through
 * `use cache`/`cacheTag()` (which needs `cacheComponents`, a repo-wide rendering change owned by
 * the first spec with a real data fetch), so Phase 0 revalidates on time and the tag list lives
 * in `corridorCacheTags()` beside the invalidation seam, where spec 012's admin and the hourly
 * sitemap job inherit it — the same honest wiring the locale home documents. Nothing here reads a cookie or a request
 * header, so the response carries no `Vary` and is byte-identical for every visitor (AC-23).
 *
 * **Head.** Title and description are the guide's authored `seoTitle`/`seoDescription`; the
 * robots directive is `pageIndexability()`'s and nothing else's (the page never computes
 * indexability itself — `/review 65`'s carry-forward); the canonical is `canonicalFor()`'s,
 * emitted **unchanged on a `noindex` page** (AC-10, which narrows spec 004 AC-16's ownership
 * clause); and the hreflang cluster is `alternatesFor()`'s single call over the locales that
 * genuinely have this page, so a locale with no authored guide contributes no alternate (AC-11).
 * JSON-LD — `BreadcrumbList` and `FAQPage`, from this same view model — is **TASK-093's**; the
 * slot is here and empty.
 *
 * **No client island, and nothing to hydrate** (AC-24): the FAQ is text, the calendar is a table,
 * the breadcrumb is a list, and the facts block is a description list.
 */
export const revalidate = 86400;
export const dynamicParams = false;

/** The build's date, as the first day of the twelve-month calendar window (AC-22). */
function calendarWindowStart(): string {
  return new Date().toISOString().slice(0, 10);
}

export function generateStaticParams(): {
  locale: string;
  destinations: string;
  country: string;
}[] {
  return listCorridorPages().map((page) => ({
    locale: page.locale,
    // The localised segment of this locale, from `locales.data.ts` through the one URL builder:
    // `/en/send-flowers-to/...`, `/de/blumen-verschicken/...`, `/pl/wyslij-kwiaty/...`.
    destinations: localePath(page.locale, "destinations").split("/")[2] ?? "",
    country: page.slug,
  }));
}

interface CorridorParams {
  params: Promise<{ locale: string; destinations: string; country: string }>;
}

/** The view model for a request's params, or `undefined` when the URL names no existing page. */
function resolve(params: {
  locale: string;
  destinations: string;
  country: string;
}) {
  const locale = routableLocale(params.locale);
  if (locale === undefined) return undefined;
  // The `destinations` segment must be **this** locale's own: `/pl/send-flowers-to/polska` is a
  // different URL for the same page, and `plan/02` §4 allows exactly one form per (locale, page).
  if (
    localePath(locale.code, "destinations") !==
    `/${locale.code}/${params.destinations}`
  ) {
    return undefined;
  }
  const iso2 = corridorIso2ForSlug(locale.code, params.country);
  if (iso2 === undefined) return undefined;
  const view = corridorView(iso2, locale.code, { from: calendarWindowStart() });
  return view === undefined ? undefined : { locale: locale.code, view };
}

export async function generateMetadata({
  params,
}: CorridorParams): Promise<Metadata> {
  const resolved = resolve(await params);
  if (resolved === undefined) notFound();
  const { locale, view } = resolved;

  const deployment = deploymentDescriptor(process.env);
  const verdict = pageIndexability(
    {
      pageType: "corridor",
      locale,
      exists: true,
      reviewed: view.reviewed,
    },
    deployment,
  );

  // One `alternatesFor()` call, over the per-locale **paths** this destination actually has: the
  // slug is per-locale data (`polen`, `polska`), so a page target with one segment list would
  // claim `/de/blumen-verschicken/poland`. A locale with no authored guide contributes nothing,
  // which is why the `de` and `pl` clusters are empty today (§6, §13 Q1), and a cluster that
  // cannot be described honestly is `[]` rather than a half set.
  // `alternatesFor()` refuses a non-`https` origin, because a relative or `http` alternate is
  // silently ignored by Google and a half-announced cluster is worse than none (spec 003 §6). A
  // development or test deployment therefore emits **no** hreflang rather than an invalid one —
  // it is not an indexing environment either, so there is nothing to announce there. Every
  // deployment that could be crawled has an `https` site URL, which is where AC-11 is observed.
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
    canonical: canonicalFor(locale, view.path, { baseUrl: deployment.siteUrl }),
    ...(cluster === undefined ? {} : { alternates: cluster }),
  });
}

export default async function CorridorCountryPage({ params }: CorridorParams) {
  const resolved = resolve(await params);
  if (resolved === undefined) notFound();
  setRequestLocale(resolved.locale);

  return <CorridorPage view={resolved.view} />;
}
