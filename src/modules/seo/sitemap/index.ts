/**
 * The sitemap tree: `/sitemap.xml` → `/sitemaps/{locale}/index.xml` → `static.xml` +
 * `corridors.xml` (spec 007 §2 "Sitemaps", §5.2, §5.4, AC-13, AC-14; `plan/02` §10; TASK-094).
 *
 * Three levels, one rule at each, and no level knows how the level below decides membership:
 *
 *  1. **`/sitemap.xml`** lists one child index per locale that has at least one URL. A locale
 *     with nothing to announce is absent, not empty — the same reason `plan/02` §10 keeps the
 *     unshipped children out of the index: an empty document costs a crawl budget fetch and says
 *     nothing. On every deployment before the §12 indexing flip that is *every* locale, so the
 *     index is a valid, empty `<sitemapindex>` rather than a 404: the file is announced in
 *     `robots.txt` and must parse.
 *  2. **`/sitemaps/{locale}/index.xml`** lists the children of that locale that have URLs.
 *  3. **the children** are `statics.ts` and `corridors.ts`. Spec 008's `categories.xml` /
 *     `occasions.xml` (TASK-116) and spec 009's `products.xml` (TASK-131) add themselves to
 *     `SITEMAP_CHILDREN` with their own builder and inherit everything else — caps, `<lastmod>`,
 *     the `xhtml:link` set, the cache header and the 404 shapes.
 *
 * ## What a request may ask for
 *
 * `SitemapParamsSchema` and the child registry are the route boundary (`plan/12` §2, spec 007 §5.2's
 * "route params are parsed, not trusted"): an unknown locale, an unknown child name and a child
 * with no URLs all produce **`undefined` → 404**, never a redirect (ADR-0006) and never a
 * lowercase-fixing rewrite. A child that exists but is empty is a 404 for the same reason it is
 * absent from the index: it is not a document we publish.
 *
 * ## Why the deployment is a parameter
 *
 * `pageIndexability()` needs it, and passing it from the route keeps this module pure and
 * synchronous — the property spec 007 §5.2 pins so `generateMetadata`, the sitemap builder and
 * the e2e crawl cannot get different answers for the same URL.
 */
import { z } from "zod";

import { routableLocaleCodes } from "../../i18n/index.ts";
import { absoluteUrl } from "../canonical.ts";
import type { DeploymentDescriptor } from "../environment.ts";
import { SITEMAP_PATH } from "../robots.ts";

import { corridorSitemapEntries } from "./corridors.ts";
import { staticSitemapEntries } from "./statics.ts";
import {
  type SitemapEntry,
  type SitemapIndexEntry,
  sitemapIndexXml,
  urlSetXml,
} from "./xml.ts";

/**
 * The `/sitemaps/[locale]/[child]` params as a request may present them (spec 007 §5.2 "route
 * params are parsed, not trusted"; `plan/12` §2).
 *
 * The shapes are deliberately narrow — a locale code and a lowercase `*.xml` file name — so a
 * traversal attempt, an upper-case variant or a query-shaped segment is refused before any
 * registry is consulted. A refusal is a **404**: there is no redirect to a corrected form
 * (ADR-0006), and `/sitemaps/EN/corridors.xml` is not a URL we publish.
 */
export const SitemapParamsSchema = z.object({
  locale: z.string().regex(/^[a-z]{2}(?:-[a-z]{2})?$/u),
  child: z.string().regex(/^[a-z][a-z-]*\.xml$/u),
});

export type SitemapParams = z.infer<typeof SitemapParamsSchema>;

/** The document name a `*.xml` segment asks for: `corridors.xml` -> `corridors`. */
export function sitemapNameOf(child: string): string {
  return child.replace(/\.xml$/u, "");
}

/** The index `robots.txt` names. One constant, so the two files cannot disagree. */
export const SITEMAP_INDEX_PATH = SITEMAP_PATH;

/** The children that exist today, in the order the locale index lists them. */
export const SITEMAP_CHILDREN = ["static", "corridors"] as const;

export type SitemapChild = (typeof SITEMAP_CHILDREN)[number];

/** The locale index's own file name — a child slot that is not a `<urlset>`. */
export const SITEMAP_LOCALE_INDEX = "index";

/** `/sitemaps/{locale}/index.xml`. */
export function localeSitemapIndexPath(locale: string): string {
  return `/sitemaps/${locale}/${SITEMAP_LOCALE_INDEX}.xml`;
}

/** `/sitemaps/{locale}/{child}.xml`. */
export function sitemapChildPath(locale: string, child: string): string {
  return `/sitemaps/${locale}/${child}.xml`;
}

/** Is this one of the children we serve? The route boundary's answer for `[child]`. */
export function isSitemapChild(value: string): value is SitemapChild {
  return (SITEMAP_CHILDREN as readonly string[]).includes(value);
}

/** The URLs of one child, or `[]` when the locale or the child has nothing to announce. */
export function sitemapChildEntries(
  locale: string,
  child: string,
  deployment: DeploymentDescriptor,
): readonly SitemapEntry[] {
  if (!isSitemapChild(child)) return [];
  return child === "static"
    ? staticSitemapEntries(locale, deployment)
    : corridorSitemapEntries(locale, deployment);
}

/** Every URL a locale announces, across its children. */
function localeEntries(
  locale: string,
  deployment: DeploymentDescriptor,
): readonly SitemapEntry[] {
  return SITEMAP_CHILDREN.flatMap((child) =>
    sitemapChildEntries(locale, child, deployment),
  );
}

/** The newest `<lastmod>` among entries, or `undefined` when there are none. */
function newestLastmod(entries: readonly SitemapEntry[]): string | undefined {
  return entries
    .map((entry) => entry.lastmod)
    .sort()
    .at(-1);
}

/** The locales the index announces: those with at least one URL, in registry order. */
export function sitemapLocales(
  deployment: DeploymentDescriptor,
): readonly string[] {
  return routableLocaleCodes().filter(
    (locale) => localeEntries(locale, deployment).length > 0,
  );
}

/** The `<sitemap>` rows of `/sitemap.xml`: one child index per announced locale. */
export function sitemapIndexEntries(
  deployment: DeploymentDescriptor,
): readonly SitemapIndexEntry[] {
  return sitemapLocales(deployment).map((locale) => {
    const lastmod = newestLastmod(localeEntries(locale, deployment));
    return {
      loc: absoluteUrl(localeSitemapIndexPath(locale), {
        baseUrl: deployment.siteUrl,
      }),
      ...(lastmod === undefined ? {} : { lastmod }),
    };
  });
}

/** The child URLs a locale index lists — only the children that have URLs. */
export function localeSitemapChildren(
  locale: string,
  deployment: DeploymentDescriptor,
): readonly string[] {
  return SITEMAP_CHILDREN.filter(
    (child) => sitemapChildEntries(locale, child, deployment).length > 0,
  ).map((child) =>
    absoluteUrl(sitemapChildPath(locale, child), {
      baseUrl: deployment.siteUrl,
    }),
  );
}

/** `/sitemap.xml`, always served: an empty index is an honest announcement, not a 404. */
export function sitemapIndexDocument(deployment: DeploymentDescriptor): string {
  return sitemapIndexXml(sitemapIndexEntries(deployment));
}

/** `/sitemaps/{locale}/index.xml`, or `undefined` when the locale announces nothing → 404. */
export function localeSitemapDocument(
  locale: string,
  deployment: DeploymentDescriptor,
): string | undefined {
  const children = SITEMAP_CHILDREN.map((child) => ({
    child,
    entries: sitemapChildEntries(locale, child, deployment),
  })).filter(({ entries }) => entries.length > 0);
  if (children.length === 0) return undefined;

  return sitemapIndexXml(
    children.map(({ child, entries }) => {
      const lastmod = newestLastmod(entries);
      return {
        loc: absoluteUrl(sitemapChildPath(locale, child), {
          baseUrl: deployment.siteUrl,
        }),
        ...(lastmod === undefined ? {} : { lastmod }),
      };
    }),
  );
}

/** `/sitemaps/{locale}/{child}.xml`, or `undefined` for an unknown or empty child → 404. */
export function sitemapChildDocument(
  locale: string,
  child: string,
  deployment: DeploymentDescriptor,
): string | undefined {
  const entries = sitemapChildEntries(locale, child, deployment);
  if (entries.length === 0) return undefined;
  return urlSetXml(entries, `${locale}/${child}`);
}

/**
 * The document for any `/sitemaps/{locale}/{name}.xml` request — the locale index or one child.
 * `undefined` is the route's 404, which is every shape a crawler could invent.
 */
export function sitemapDocumentFor(
  locale: string,
  name: string,
  deployment: DeploymentDescriptor,
): string | undefined {
  return name === SITEMAP_LOCALE_INDEX
    ? localeSitemapDocument(locale, deployment)
    : sitemapChildDocument(locale, name, deployment);
}
