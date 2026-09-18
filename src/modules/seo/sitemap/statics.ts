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
 * So the registry below is the auditable list, with one line per page type and the condition each
 * satisfies. TASK-096 adds `localeHome` to it in the same commit that wires the home's metadata
 * to the engine, and nothing else here changes.
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
 * The page types `static.xml` announces today, as data a test can read (see the header for why
 * `localeHome` is not one of them yet).
 */
export const STATIC_SITEMAP_PAGE_TYPES = [
  "destinationsHub",
] as const satisfies readonly SeoPageType[];

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

/** Every standing URL this locale announces. Empty outside an indexing environment. */
export function staticSitemapEntries(
  locale: string,
  deployment: DeploymentDescriptor,
): readonly SitemapEntry[] {
  const hub = hubEntry(locale, deployment);
  return hub === undefined ? [] : [hub];
}
