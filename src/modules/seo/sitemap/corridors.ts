/**
 * `/sitemaps/{locale}/corridors.xml` — the corridor rows (spec 007 §2 "Sitemaps", §5.2, AC-13,
 * AC-14; `plan/02` §10; TASK-094).
 *
 * ## Membership: two questions, neither of them asked here
 *
 * A corridor URL is listed **iff** `listCorridorPages()` says it exists (`plan/02` §5.1's
 * existence rule: `status === 'live' || guidePublished` **and** an authored content file for that
 * locale and state) **and** `pageIndexability()` returns `indexable` for the *same descriptor the
 * route's `generateMetadata` builds*. There is no third rule and no `inSitemap` flag: spec 007 §6
 * and §14 A7 make the verdict `{ indexable, directive, terms }`, and a sitemap that re-derived a
 * directive from the terms is exactly the disagreement `plan/02` §10's "nothing `noindex` ever
 * appears in a sitemap" forbids (the carry-forward from `/review 74`).
 *
 * The consequence worth stating: **on every deployment a reviewer can reach today this builder
 * returns nothing**, because `isIndexingEnvironment()` is false off the canonical production host
 * and that is one of the engine's terms. The sitemap opens at the same moment the pages do
 * (TASK-096's §12 flip), by configuration, with no edit here.
 *
 * AC-7's sitemap half is proven by the same construction: flipping a fixture country's
 * `guidePublished` moves `listCorridorPages()`, so the row appears and disappears with the data
 * and no template or route changes.
 *
 * ## The alternates are the page's own
 *
 * `alternatesFor()` is called here with the **same target** the corridor route passes —
 * `{ pathByLocale: corridorAlternatePaths(iso2) }` — so the `xhtml:link` set of a row and the
 * `<head>` cluster of the document it points at are one function's output, not two (AC-11,
 * `plan/02` §8 "never a second generator"). A locale with no authored guide contributes no path,
 * so it contributes no alternate.
 */
import {
  corridorAlternatePaths,
  corridorContentView,
  listCorridorPages,
} from "../../geo/index.ts";
import {
  alternatesFor,
  catalogueUpdatedAt,
  localePath,
} from "../../i18n/index.ts";
import { absoluteUrl } from "../canonical.ts";
import type { DeploymentDescriptor } from "../environment.ts";
import { pageIndexability } from "../indexability.ts";

import { type SitemapEntry, lastmodOf } from "./xml.ts";

/**
 * Every corridor URL this locale announces, in `listCorridorPages()` order (registry order:
 * Poland first, then the six guide destinations).
 */
export function corridorSitemapEntries(
  locale: string,
  deployment: DeploymentDescriptor,
): readonly SitemapEntry[] {
  const baseUrl = deployment.siteUrl;
  const entries: SitemapEntry[] = [];
  const catalogue = catalogueUpdatedAt(locale);

  for (const page of listCorridorPages()) {
    if (page.locale !== locale) continue;
    // A pseudo-locale prefix renders the x-default's content and has no content record of its
    // own under its own code; it is never indexable either, so it never reaches the check below.
    const content = corridorContentView(page.iso2, page.locale, page.state);
    if (content === undefined) continue;

    const verdict = pageIndexability(
      {
        pageType: "corridor",
        locale,
        // The page is in `listCorridorPages()`: the existence rule already answered yes, and
        // this is the term the route passes for the same reason.
        exists: true,
        reviewed: content.reviewed,
      },
      deployment,
    );
    if (!verdict.indexable) continue;

    const path = localePath(locale, "destinations", page.slug);
    const loc = absoluteUrl(path, { baseUrl });
    const cluster =
      alternatesFor(
        { pathByLocale: corridorAlternatePaths(page.iso2) },
        { baseUrl },
      ).find((candidate) => candidate.url === loc)?.alternates ?? [];

    entries.push({
      loc,
      lastmod: lastmodOf({
        content: content.updatedAt,
        // The country registry entry carries no date in Phase 0 — see `lastmodOf()`'s header.
        registry: undefined,
        catalogue,
      }),
      alternates: cluster.map((alternate) => ({ ...alternate })),
    });
  }

  return entries;
}
