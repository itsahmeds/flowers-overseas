/**
 * `/sitemaps/{locale}/occasions.xml`: the occasion hubs, the occasions index and the indexable
 * country occasions (spec 008 §6 "Sitemap membership", **AC-19**; `plan/02` §10; TASK-116).
 *
 * The page-type list is this child's whole definition; membership, `<lastmod>` and the
 * `xhtml:link` set are `listingSitemapEntries()`'s, shared with `categories.xml`, and the caps,
 * the cache header and the 404 shapes are the sitemap tree's (spec 007's contract, inherited).
 */
import type { DeploymentDescriptor } from "../environment.ts";

import {
  type ListingSitemapPageType,
  listingSitemapEntries,
} from "./listings.ts";
import type { SitemapEntry } from "./xml.ts";

/** The page types `occasions.xml` announces (spec 008 §6); rows come in `listingPages()` order. */
export const OCCASION_SITEMAP_PAGE_TYPES = [
  "occasionHub",
  "occasionsIndex",
  "countryOccasion",
] as const satisfies readonly ListingSitemapPageType[];

/** Every `occasions.xml` row of this locale. Empty in Phase 0 on every reachable deployment. */
export function occasionSitemapEntries(
  locale: string,
  deployment: DeploymentDescriptor,
): Promise<readonly SitemapEntry[]> {
  return listingSitemapEntries(locale, deployment, OCCASION_SITEMAP_PAGE_TYPES);
}
