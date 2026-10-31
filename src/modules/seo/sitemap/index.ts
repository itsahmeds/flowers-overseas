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
 *  3. **the children** are `statics.ts`, `corridors.ts` and spec 008's `categories.ts` /
 *     `occasions.ts` (AC-19; TASK-116). Spec 009's `products.xml` (TASK-131) adds itself to
 *     `SITEMAP_CHILD_BUILDERS` with its own builder and inherits everything else: caps,
 *     `<lastmod>`, the `xhtml:link` set, the cache header and the 404 shapes.
 *
 * ## Why every function here is `async`
 *
 * The listing children read spec 005's catalogue API, which is `async` because TASK-070 swaps
 * its static provider for Postgres behind it. A locale index cannot know whether to list
 * `categories.xml` without asking, so the tree answers asynchronously from the root down; the
 * two spec 007 children stay synchronous builders and are awaited like the rest.
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

import { categorySitemapEntries } from "./categories.ts";
import { corridorSitemapEntries } from "./corridors.ts";
import { occasionSitemapEntries } from "./occasions.ts";
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

/** What one child contributes to a locale: its rows, or none. */
type SitemapChildBuilder = (
  locale: string,
  deployment: DeploymentDescriptor,
) => readonly SitemapEntry[] | Promise<readonly SitemapEntry[]>;

/**
 * The registry: one builder per child, in the order the locale index lists them. The extension
 * point a new child needs, and the only list `sitemapChildEntries()` reads.
 */
const SITEMAP_CHILD_BUILDERS = {
  static: staticSitemapEntries,
  corridors: corridorSitemapEntries,
  // Spec 008 §6, AC-19 (TASK-116): listed in the locale index only when non-empty, which in
  // Phase 0 is never on a deployment a reviewer can reach.
  categories: categorySitemapEntries,
  occasions: occasionSitemapEntries,
} as const satisfies Readonly<Record<string, SitemapChildBuilder>>;

export type SitemapChild = keyof typeof SITEMAP_CHILD_BUILDERS;

/** The children that exist today, in the order the locale index lists them. */
export const SITEMAP_CHILDREN = Object.keys(
  SITEMAP_CHILD_BUILDERS,
) as readonly SitemapChild[];

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
export async function sitemapChildEntries(
  locale: string,
  child: string,
  deployment: DeploymentDescriptor,
): Promise<readonly SitemapEntry[]> {
  if (!isSitemapChild(child)) return [];
  return SITEMAP_CHILD_BUILDERS[child](locale, deployment);
}

/** Every child of a locale with its rows, in registry order (empty children included). */
async function localeChildren(
  locale: string,
  deployment: DeploymentDescriptor,
): Promise<
  readonly { child: SitemapChild; entries: readonly SitemapEntry[] }[]
> {
  const children = [];
  for (const child of SITEMAP_CHILDREN) {
    children.push({
      child,
      entries: await sitemapChildEntries(locale, child, deployment),
    });
  }
  return children;
}

/** Every URL a locale announces, across its children. */
async function localeEntries(
  locale: string,
  deployment: DeploymentDescriptor,
): Promise<readonly SitemapEntry[]> {
  return (await localeChildren(locale, deployment)).flatMap(
    ({ entries }) => entries,
  );
}

/** The newest `<lastmod>` among entries, or `undefined` when there are none. */
function newestLastmod(entries: readonly SitemapEntry[]): string | undefined {
  return entries
    .map((entry) => entry.lastmod)
    .sort()
    .at(-1);
}

/** Every routable locale with its rows, in registry order (silent locales included). */
async function announcedLocales(
  deployment: DeploymentDescriptor,
): Promise<readonly { locale: string; entries: readonly SitemapEntry[] }[]> {
  const locales = [];
  for (const locale of routableLocaleCodes()) {
    const entries = await localeEntries(locale, deployment);
    if (entries.length > 0) locales.push({ locale, entries });
  }
  return locales;
}

/** The locales the index announces: those with at least one URL, in registry order. */
export async function sitemapLocales(
  deployment: DeploymentDescriptor,
): Promise<readonly string[]> {
  return (await announcedLocales(deployment)).map(({ locale }) => locale);
}

/** The `<sitemap>` rows of `/sitemap.xml`: one child index per announced locale. */
export async function sitemapIndexEntries(
  deployment: DeploymentDescriptor,
): Promise<readonly SitemapIndexEntry[]> {
  return (await announcedLocales(deployment)).map(({ locale, entries }) => {
    const lastmod = newestLastmod(entries);
    return {
      loc: absoluteUrl(localeSitemapIndexPath(locale), {
        baseUrl: deployment.siteUrl,
      }),
      ...(lastmod === undefined ? {} : { lastmod }),
    };
  });
}

/** The child URLs a locale index lists: only the children that have URLs. */
export async function localeSitemapChildren(
  locale: string,
  deployment: DeploymentDescriptor,
): Promise<readonly string[]> {
  return (await localeChildren(locale, deployment))
    .filter(({ entries }) => entries.length > 0)
    .map(({ child }) =>
      absoluteUrl(sitemapChildPath(locale, child), {
        baseUrl: deployment.siteUrl,
      }),
    );
}

/** `/sitemap.xml`, always served: an empty index is an honest announcement, not a 404. */
export async function sitemapIndexDocument(
  deployment: DeploymentDescriptor,
): Promise<string> {
  return sitemapIndexXml(await sitemapIndexEntries(deployment));
}

/** `/sitemaps/{locale}/index.xml`, or `undefined` when the locale announces nothing → 404. */
export async function localeSitemapDocument(
  locale: string,
  deployment: DeploymentDescriptor,
): Promise<string | undefined> {
  const children = (await localeChildren(locale, deployment)).filter(
    ({ entries }) => entries.length > 0,
  );
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
export async function sitemapChildDocument(
  locale: string,
  child: string,
  deployment: DeploymentDescriptor,
): Promise<string | undefined> {
  const entries = await sitemapChildEntries(locale, child, deployment);
  if (entries.length === 0) return undefined;
  return urlSetXml(entries, `${locale}/${child}`);
}

/**
 * The document for any `/sitemaps/{locale}/{name}.xml` request — the locale index or one child.
 * `undefined` is the route's 404, which is every shape a crawler could invent.
 */
export async function sitemapDocumentFor(
  locale: string,
  name: string,
  deployment: DeploymentDescriptor,
): Promise<string | undefined> {
  return name === SITEMAP_LOCALE_INDEX
    ? localeSitemapDocument(locale, deployment)
    : sitemapChildDocument(locale, name, deployment);
}
