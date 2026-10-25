/**
 * `/sitemaps/{locale}/categories.xml`: the category hubs, the country shop roots and the
 * indexable country categories (spec 008 §6 "Sitemap membership", **AC-19**; `plan/02` §10;
 * TASK-116).
 *
 * The page-type list is this child's whole definition; membership, `<lastmod>` and the
 * `xhtml:link` set are `listingSitemapEntries()`'s, shared with `occasions.xml`, and the caps, the
 * cache header and the 404 shapes are the sitemap tree's (spec 007's contract, inherited).
 */
import type { DeploymentDescriptor } from "../environment.ts";

import {
  type ListingSitemapPageType,
  listingSitemapEntries,
} from "./listings.ts";
import type { SitemapEntry } from "./xml.ts";

/** The page types `categories.xml` announces (spec 008 §6); rows come in `listingPages()` order. */
export const CATEGORY_SITEMAP_PAGE_TYPES = [
  "categoryHub",
  "countryShopRoot",
  "countryCategory",
] as const satisfies readonly ListingSitemapPageType[];

/** Every `categories.xml` row of this locale. Empty in Phase 0 on every reachable deployment. */
export function categorySitemapEntries(
  locale: string,
  deployment: DeploymentDescriptor,
): Promise<readonly SitemapEntry[]> {
  return listingSitemapEntries(locale, deployment, CATEGORY_SITEMAP_PAGE_TYPES);
}
