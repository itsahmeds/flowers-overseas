/**
 * `/sitemaps/{locale}/editorial.xml` (spec 044 §2.8, §6 "Sitemaps", AC-10; `plan/02` §10;
 * TASK-322): the blog index and every indexable post of the locale.
 *
 * Membership is `blogPageVerdict()`'s, the same call the page's `<head>` makes, so nothing
 * `noindex` can appear; the alternates are the same `alternatesFor()` cluster the head prints;
 * `<lastmod>` is the day the served revision was published (the index: the newest of its posts),
 * never "now". The pages arrive as data from the blog (the route reads them), so this module
 * keeps reading no blog source of its own.
 */
import { absoluteUrl } from "../canonical.ts";
import type { DeploymentDescriptor } from "../environment.ts";
import { blogAlternates, blogPageVerdict } from "../blog-head.ts";

import type { SitemapEntry } from "./xml.ts";

/** One blog URL that exists now, as the blog hands it in. */
export interface EditorialSitemapPage {
  readonly pageType: "blogIndex" | "blogPost";
  readonly path: string;
  /** ISO 8601 instant: when the served revision was published (the index: the newest). */
  readonly lastmod: string;
  readonly reviewed: boolean;
  readonly pathByLocale: Readonly<Record<string, string>>;
}

/** The UTC day of an instant, the `<lastmod>` the sitemap schema takes. */
function lastmodDay(instant: string): string {
  return new Date(instant).toISOString().slice(0, 10);
}

export function editorialSitemapEntries(
  locale: string,
  pages: readonly EditorialSitemapPage[],
  deployment: DeploymentDescriptor,
): readonly SitemapEntry[] {
  const baseUrl = deployment.siteUrl;
  const entries: SitemapEntry[] = [];
  for (const page of pages) {
    if (!blogPageVerdict({ ...page, locale }, deployment).indexable) continue;
    entries.push({
      loc: absoluteUrl(page.path, { baseUrl }),
      lastmod: lastmodDay(page.lastmod),
      alternates: (
        blogAlternates(page.path, page.pathByLocale, deployment) ?? []
      ).map((alternate) => ({ ...alternate })),
    });
  }
  return entries;
}
