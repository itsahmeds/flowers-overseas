/**
 * The rows of spec 008's two listing sitemap children, `categories.xml` and `occasions.xml`
 * (spec 008 §6 "Sitemap membership", §5.2, **AC-19**, T-19; `plan/02` §10; TASK-116), built the
 * way `corridors.ts` builds spec 007's: the page's own existence answer, the page's own verdict,
 * the page's own hreflang cluster, and a `<lastmod>` from dated data only.
 *
 * ## Membership: the existence set, then the page's own verdict
 *
 * A listing URL is a row **iff**
 *
 *  1. `listingPages()` lists it: the existence set `generateStaticParams` emits with
 *     `dynamicParams = false`, so a row can never name a URL that 404s; and
 *  2. `listingPageIndexability()` says `indexable` for it: the **same function** `listingView()`
 *     calls to put the robots directive in the page's `<head>`.
 *
 * There is no third rule. The robots meta and the sitemap membership are one answer (spec 008
 * §6, spec 007 AC-14), which is what makes "no `noindex` URL appears in either" structural. In
 * Phase 0 that answer is `noindex` on every deployment a reviewer can reach (the indexing
 * environment is false off the canonical production host) and, even there, on every
 * country-scoped page (no destination is operational), so both children are empty and absent
 * from the locale index (AC-19's last clause), with no code path saying so.
 *
 * ## The alternates are the page's own
 *
 * `alternatesFor({ pathByLocale: listingAlternatePaths(identity) })` is the call every listing
 * route makes for its `<head>` cluster, so a row's `xhtml:link` set and the document's cluster are
 * one function's output (spec 008 AC-16, `plan/02` §8 "never a second generator"). A locale with
 * no authored slug has no page and therefore no alternate.
 *
 * ## Why the catalogue is imported lazily
 *
 * `modules/catalog` imports this module's barrel (`listing.ts` asks `pageIndexability()`), so a
 * static import from here would close a cycle through two barrels whose top-level code reads each
 * other's constants. The builders are `async` anyway (spec 005's read API is), so the barrel is
 * loaded on first use with `import()`: no evaluation-order hazard, same public barrel, nothing
 * reached past `index.ts` (`plan/01` §5).
 */
import { alternatesFor, catalogueUpdatedAt } from "../../i18n/index.ts";
import { absoluteUrl } from "../canonical.ts";
import type { DeploymentDescriptor } from "../environment.ts";

import { type SitemapEntry, lastmodOf } from "./xml.ts";

/** The six listing page types, as spec 008 names them (`ListingPageType` in `modules/catalog`). */
export type ListingSitemapPageType =
  | "countryShopRoot"
  | "countryCategory"
  | "countryOccasion"
  | "categoryHub"
  | "occasionHub"
  | "occasionsIndex";

/**
 * Every row one listing child announces in this locale, in `listingPages()` order (destinations
 * in the one country order, then the hubs, then the occasions index), restricted to `pageTypes`.
 * Empty for a locale with no listing pages, and on every deployment where no page is indexable.
 */
export async function listingSitemapEntries(
  locale: string,
  deployment: DeploymentDescriptor,
  pageTypes: readonly ListingSitemapPageType[],
): Promise<readonly SitemapEntry[]> {
  const catalog = await import("../../catalog/index.ts");
  // An unknown or unrouted locale has no listing URL and no URL builder: "nothing to announce",
  // which the route turns into a 404 (spec 007 §14 A6's shapes), never a thrown request.
  const code = catalog
    .listingLocales()
    .find((candidate) => candidate === locale);
  if (code === undefined) return [];

  const baseUrl = deployment.siteUrl;
  const catalogue = catalogueUpdatedAt(code);
  const entries: SitemapEntry[] = [];

  for (const page of await catalog.listingPages(code)) {
    if (!pageTypes.includes(page.pageType)) continue;
    const identity = {
      pageType: page.pageType,
      locale: page.locale,
      ...(page.countryIso === undefined ? {} : { countryIso: page.countryIso }),
      ...(page.entityKey === undefined ? {} : { entityKey: page.entityKey }),
    };
    const verdict = catalog.listingPageIndexability(identity, deployment);
    if (!verdict.indexable) continue;

    const loc = absoluteUrl(page.path, { baseUrl });
    const cluster =
      alternatesFor(
        { pathByLocale: await catalog.listingAlternatePaths(identity) },
        { baseUrl },
      ).find((candidate) => candidate.url === loc)?.alternates ?? [];
    const dated = await catalog.listingDatedSources(identity);

    entries.push({
      loc,
      lastmod: lastmodOf({
        content: dated.content,
        // The country registry carries no date in Phase 0 (see `lastmodOf()`'s header).
        registry: undefined,
        catalogue,
        prices: dated.prices,
      }),
      alternates: cluster.map((alternate) => ({ ...alternate })),
    });
  }

  return entries;
}
