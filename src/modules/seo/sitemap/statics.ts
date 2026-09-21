/**
 * `/sitemaps/{locale}/static.xml` — the locale's standing pages (spec 007 §2 "Sitemaps", §5.2,
 * AC-13, AC-14; `plan/02` §10; TASK-094).
 *
 * Spec 007 §5.2 names this child "home, hub". It ships with the **hub**, and the locale home
 * joins it at TASK-096 — not as a deferral of AC-13, but because AC-14 forbids the alternative:
 *
 *  - Membership is `pageIndexability()`'s verdict and nothing else (the `/review 74`
 *    carry-forward). The hub's route already composes its `<head>` through that verdict
 *    (`src/app/[locale]/(marketing)/[destinations]/page.tsx`), so what the sitemap announces and
 *    what the document says are one answer.
 *  - `/{locale}` does not. It still inherits spec 003's blanket `robots: noindex,nofollow` from
 *    `src/app/[locale]/layout.tsx`, which spec 007 §6 lifts **at the indexing flip** — TASK-096's
 *    row in `TASKS.md` says so in as many words ("`noindex` lifts on the qualifying set (reviewed
 *    corridors, hub, locale homes)"), and `tests/e2e/links.spec.ts` and
 *    `tests/e2e/locale-routing.spec.ts` pin the current directive. Listing the home here would
 *    announce a URL whose own document says `noindex` — precisely the disagreement AC-14 exists
 *    to make impossible — and lifting it from this task would edit another task's pages and
 *    tests.
 *
 * So the registry below is the auditable list: **one entry builder per page type**, and
 * `staticSitemapEntries()` is nothing but that registry applied. TASK-096 adds
 * `localeHome: localeHomeEntry` to it in the same commit that wires the home's metadata to the
 * engine, and the row appears — no other line in this file changes, and
 * `STATIC_SITEMAP_PAGE_TYPES` (derived from the registry's keys, never written twice) moves with
 * it, so the constant cannot drift from what the child actually announces. The correspondence is
 * pinned in `tests/unit/seo-sitemap.test.ts` ("the list is the child"), which is what makes this
 * a seam rather than a comment: a row that no page type in the list explains fails the suite, and
 * so does a page type in the list that produces no row.
 *
 * The alternates are the hub page's own: one `alternatesFor({ pageType: "destinations" })` call,
 * the same target the route passes, so the `xhtml:link` set and the `<head>` cluster are one
 * function's output (AC-11).
 */
import {
  corridorContentView,
  hubView,
  listCorridorPages,
} from "../../geo/index.ts";
import {
  alternatesFor,
  catalogueUpdatedAt,
  routableLocale,
} from "../../i18n/index.ts";
import { absoluteUrl } from "../canonical.ts";
import type { DeploymentDescriptor } from "../environment.ts";
import { type SeoPageType, pageIndexability } from "../indexability.ts";

import { type SitemapEntry, lastmodOf } from "./xml.ts";

/**
 * What a page type contributes to `static.xml`: at most one row, or nothing when the engine says
 * the page is not indexable in this locale and deployment.
 */
type StaticSitemapEntryBuilder = (
  locale: string,
  deployment: DeploymentDescriptor,
) => SitemapEntry | undefined;

/** The newest authored corridor date in this locale — the copy the hub itself prints. */
function newestCorridorContent(locale: string): string | undefined {
  let newest: string | undefined;
  for (const page of listCorridorPages()) {
    if (page.locale !== locale) continue;
    const content = corridorContentView(page.iso2, page.locale, page.state);
    if (content === undefined) continue;
    if (newest === undefined || content.updatedAt > newest) {
      newest = content.updatedAt;
    }
  }
  return newest;
}

/** The all-destinations hub row for this locale, or nothing when the engine says `noindex`. */
function hubEntry(
  locale: string,
  deployment: DeploymentDescriptor,
): SitemapEntry | undefined {
  // An unroutable locale has no hub and no URL builder: `localePath()` throws on one, and the
  // sitemap must answer "nothing to announce" rather than fail a request (the route turns an
  // empty child into a 404).
  if (routableLocale(locale) === undefined) return undefined;
  const baseUrl = deployment.siteUrl;
  const view = hubView(locale);
  const verdict = pageIndexability(
    {
      pageType: "destinationsHub",
      locale,
      // The hub exists in every routable locale (its route's `generateStaticParams`).
      exists: true,
      // §6: "the hub is indexable when at least one corridor in that locale is" — the term the
      // route passes, read from the same view model.
      reviewed: view.anyReviewed,
    },
    deployment,
  );
  if (!verdict.indexable) return undefined;

  const loc = absoluteUrl(view.path, { baseUrl });
  const cluster =
    alternatesFor({ pageType: "destinations" }, { baseUrl }).find(
      (candidate) => candidate.url === loc,
    )?.alternates ?? [];

  return {
    loc,
    lastmod: lastmodOf({
      content: newestCorridorContent(locale),
      registry: undefined,
      catalogue: catalogueUpdatedAt(locale),
    }),
    alternates: cluster.map((alternate) => ({ ...alternate })),
  };
}

/**
 * The registry: one builder per page type `static.xml` announces. This is the extension point —
 * the only edit a new standing page type needs here — and `staticSitemapEntries()` below reads
 * nothing else.
 */
const STATIC_SITEMAP_ENTRY_BUILDERS = {
  destinationsHub: hubEntry,
} as const satisfies Readonly<
  Partial<Record<SeoPageType, StaticSitemapEntryBuilder>>
>;

/** The page types `static.xml` announces today (see the header for why `localeHome` is not one). */
export type StaticSitemapPageType = keyof typeof STATIC_SITEMAP_ENTRY_BUILDERS;

/**
 * The same list as data, for a caller or a test that wants to read it. Derived from the registry
 * rather than written beside it, so the two cannot disagree.
 */
export const STATIC_SITEMAP_PAGE_TYPES = Object.keys(
  STATIC_SITEMAP_ENTRY_BUILDERS,
) as readonly StaticSitemapPageType[];

/** Every standing URL this locale announces. Empty outside an indexing environment. */
export function staticSitemapEntries(
  locale: string,
  deployment: DeploymentDescriptor,
): readonly SitemapEntry[] {
  const entries: SitemapEntry[] = [];
  for (const pageType of STATIC_SITEMAP_PAGE_TYPES) {
    const entry = STATIC_SITEMAP_ENTRY_BUILDERS[pageType](locale, deployment);
    if (entry !== undefined) entries.push(entry);
  }
  return entries;
}
