/**
 * The public blog's view models (spec 044 §2.7, §5.3, §6, AC-8 to AC-12, AC-22; TASK-322): what
 * the index and the post templates render, what their `<head>` and JSON-LD are built from, and what
 * the editorial sitemap announces. One function per page, so the visible text, the schema and the
 * sitemap cannot read two different answers.
 *
 *  - **Dates** are absolute, through `format.ts`'s `longDate` in the page's locale ("21 October
 *    2026"), and carry their ISO day for `<time datetime>` and `BlogPosting`. A post shows
 *    "Updated" only when the day its served revision was published differs from the day it was
 *    first published, so a same-day typo fix does not announce an update.
 *  - **Body.** `blogMarkdownBlocks()` turns the text into typed blocks (never HTML), and every
 *    reference is resolved in the page's locale through the site's own existence predicates: a
 *    target that does not exist now renders its anchor as text (§2.3, AC-7).
 *  - **The end-of-post link** (AC-22, advisor fix 5): the corridor guide of the first country tag
 *    (lowest `sort`), where that guide exists in this locale; absent otherwise.
 *  - **The not-open line** (AC-12): spec 041's `infoPages.status.notYetOpen`, while no
 *    destination takes a delivery date.
 *
 * Server-only: it reads the blog source and the site's link predicates. Imported by the route
 * files directly, not through the content barrel, because the link predicates read the catalogue
 * and the catalogue's resolver reads this module's barrel.
 */
import {
  anyDeliveryDatesOpen,
  countryConfig,
  isCountryIso2,
} from "@/config/countries";
import type { LocaleCode } from "@/config/locales";
import { corridorLinkHref } from "@/modules/geo";
import { formatDate, localePath } from "@/modules/i18n";

import type { InfoCrumbView as BreadcrumbCrumbView } from "../pages.ts";

import { siteBlogLinkTargets } from "./links.ts";
import {
  type BlogBlock,
  type BlogInline,
  type BlogLinkTargets,
  blogMarkdownBlocks,
} from "./markdown.ts";
import {
  type BlogIndexEntry,
  type BlogPostRecord,
  type BlogProvider,
  blogContentLocale,
  blogRouteLocales,
} from "./provider.ts";
import { blogIndexPath, blogPostPath, blogSource } from "./source.ts";

/** One absolute date: its ISO day for `datetime` and schema, its words for the page. */
export interface BlogDateView {
  /** `YYYY-MM-DD`, the UTC day (the `<time datetime>` value and the schema's date). */
  readonly iso: string;
  /** The page locale's long form, "21 October 2026". */
  readonly text: string;
}

/** One run of text inside a block, with every reference already resolved. */
export type BlogInlineView =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "strong"; readonly text: string }
  | { readonly kind: "em"; readonly text: string }
  | { readonly kind: "link"; readonly href: string; readonly text: string };

/** One body block, as the template renders it. */
export type BlogBlockView =
  | {
      readonly kind: "h2" | "h3" | "p";
      readonly inlines: readonly BlogInlineView[];
    }
  | {
      readonly kind: "ul" | "ol";
      readonly items: readonly (readonly BlogInlineView[])[];
    };

/** The post's cover, when its revision has one (TASK-324 renders it). */
export interface BlogCoverRef {
  readonly mediaId: string;
  readonly alt: string;
}

/** The end-of-post link to the first country tag's corridor guide (AC-22). */
export interface BlogNextCorridorView {
  readonly iso2: string;
  readonly href: string;
  /** `destinations.{iso2}.name`, the country registry's name key. */
  readonly countryNameKey: string;
}

export interface BlogPostPageView {
  readonly locale: string;
  readonly postId: string;
  readonly slug: string;
  /** `/{locale}/blog/{slug}`. */
  readonly path: string;
  readonly title: string;
  readonly excerpt: string;
  /** Head only (`<title>`, meta description, `og:*`); never rendered in the body. */
  readonly seoTitle: string;
  readonly seoDescription: string;
  /** The byline: the author's own display name. */
  readonly authorName: string;
  readonly published: BlogDateView;
  /** Present only when the served revision was published on a later day. */
  readonly updated: BlogDateView | undefined;
  /** `infoPages.status.notYetOpen` renders under the `<h1>` while true (AC-12). */
  readonly notYetOpen: boolean;
  readonly cover: BlogCoverRef | undefined;
  readonly blocks: readonly BlogBlockView[];
  readonly nextCorridor: BlogNextCorridorView | undefined;
  /** Home, blog, the post (the visible trail and `BreadcrumbList`). */
  readonly breadcrumb: readonly BreadcrumbCrumbView[];
  /** §6's `reviewed` term: the served revision's approval still covers what it serves. */
  readonly reviewed: boolean;
  /** The post in every locale it exists in now (hreflang, language links). */
  readonly alternatePaths: Readonly<Record<string, string>>;
}

export interface BlogIndexEntryView {
  readonly postId: string;
  readonly slug: string;
  readonly href: string;
  readonly title: string;
  readonly excerpt: string;
  readonly published: BlogDateView;
  readonly cover: BlogCoverRef | undefined;
}

export interface BlogIndexPageView {
  readonly locale: string;
  /** `/{locale}/blog`. */
  readonly path: string;
  readonly entries: readonly BlogIndexEntryView[];
  readonly breadcrumb: readonly BreadcrumbCrumbView[];
  readonly alternatePaths: Readonly<Record<string, string>>;
  /** §6: the index is reviewed when at least one listed post's approval still covers it. */
  readonly anyReviewed: boolean;
}

/** `YYYY-MM-DD` of an ISO instant, in UTC. */
function isoDay(instant: string): string {
  return new Date(instant).toISOString().slice(0, 10);
}

/** One date for the page: the UTC day, in the page locale's long form. */
export function blogDate(instant: string, locale: string): BlogDateView {
  const iso = isoDay(instant);
  return {
    iso,
    text: formatDate(
      new Date(`${iso}T12:00:00Z`),
      locale as LocaleCode,
      "longDate",
      "UTC",
    ),
  };
}

function coverOf(
  mediaId: string | null,
  alt: string | null,
): BlogCoverRef | undefined {
  return mediaId === null || alt === null ? undefined : { mediaId, alt };
}

async function inlineView(
  inline: BlogInline,
  locale: string,
  targets: BlogLinkTargets,
): Promise<BlogInlineView> {
  if (inline.kind !== "link") return inline;
  const href = await targets.pathOf(inline.ref, locale);
  // A reference whose target does not exist now renders its anchor as text (§2.3, AC-7).
  return href === null
    ? { kind: "text", text: inline.anchor }
    : { kind: "link", href, text: inline.anchor };
}

/** Adjacent text runs joined, so a vanished link reads as one sentence. */
function joined(inlines: readonly BlogInlineView[]): readonly BlogInlineView[] {
  const out: BlogInlineView[] = [];
  for (const inline of inlines) {
    const last = out.at(-1);
    if (inline.kind === "text" && last?.kind === "text") {
      out[out.length - 1] = { kind: "text", text: last.text + inline.text };
    } else {
      out.push(inline);
    }
  }
  return out;
}

async function inlinesView(
  inlines: readonly BlogInline[],
  locale: string,
  targets: BlogLinkTargets,
): Promise<readonly BlogInlineView[]> {
  const views: BlogInlineView[] = [];
  for (const inline of inlines) {
    views.push(await inlineView(inline, locale, targets));
  }
  return joined(views);
}

/** The body as typed blocks with every reference resolved in `locale`. */
export async function blogBodyView(
  blocks: readonly BlogBlock[],
  locale: string,
  targets: BlogLinkTargets,
): Promise<readonly BlogBlockView[]> {
  const views: BlogBlockView[] = [];
  for (const block of blocks) {
    if (block.kind === "ul" || block.kind === "ol") {
      const items: (readonly BlogInlineView[])[] = [];
      for (const item of block.items) {
        items.push(await inlinesView(item, locale, targets));
      }
      views.push({ kind: block.kind, items });
    } else {
      views.push({
        kind: block.kind,
        inlines: await inlinesView(block.inlines, locale, targets),
      });
    }
  }
  return views;
}

/**
 * The end-of-post link (AC-22): the first country tag's corridor guide in this locale, or
 * `undefined` when that guide does not exist here (then neither the link nor its text renders).
 */
export function nextCorridorFor(
  countries: readonly string[],
  locale: string,
  hrefOf: (iso2: string, locale: string) => string | undefined = (iso2, at) =>
    isCountryIso2(iso2) ? corridorLinkHref(iso2, at) : undefined,
): BlogNextCorridorView | undefined {
  const iso2 = countries[0];
  if (iso2 === undefined || !isCountryIso2(iso2)) return undefined;
  const href = hrefOf(iso2, locale);
  return href === undefined
    ? undefined
    : { iso2, href, countryNameKey: countryConfig(iso2).nameKey };
}

/** Home, blog (and the post, as text): the visible trail, which `BreadcrumbList` mirrors. */
function trail(
  locale: string,
  post?: { readonly title: string; readonly path: string },
): readonly BreadcrumbCrumbView[] {
  const home: BreadcrumbCrumbView = {
    labelKey: "common.homeLink",
    href: localePath(locale, "home"),
    current: false,
  };
  const index = blogIndexPath(locale);
  if (post === undefined) {
    return [home, { labelKey: "breadcrumb.blog", href: index, current: true }];
  }
  return [
    home,
    { labelKey: "breadcrumb.blog", href: index, current: false },
    {
      labelKey: "breadcrumb.entity",
      labelValue: post.title,
      href: post.path,
      current: true,
    },
  ];
}

/** Where `slug` exists now among `locales` (its hreflang cluster, §6). */
async function postPathsIn(
  source: BlogProvider,
  locales: readonly string[],
  slug: string,
): Promise<Readonly<Record<string, string>>> {
  const paths: Record<string, string> = {};
  for (const locale of locales) {
    if (await source.blogPostExists(locale, slug)) {
      paths[locale] = blogPostPath(locale, slug);
    }
  }
  return paths;
}

/** Where the index exists now among `locales`. */
async function indexPathsIn(
  source: BlogProvider,
  locales: readonly string[],
): Promise<Readonly<Record<string, string>>> {
  const paths: Record<string, string> = {};
  for (const locale of locales) {
    if (await source.blogIndexExists(locale)) {
      paths[locale] = blogIndexPath(locale);
    }
  }
  return paths;
}

/** What a post page reads besides the record; tests replace any of it. */
export interface BlogViewDeps {
  readonly source: BlogProvider;
  readonly targets: BlogLinkTargets;
  readonly datesOpen: boolean;
  readonly routeLocales: readonly string[];
  readonly corridorHref?: (iso2: string, locale: string) => string | undefined;
}

function defaultDeps(routeLocales: readonly string[]): BlogViewDeps {
  const source = blogSource();
  return {
    source,
    targets: siteBlogLinkTargets((postId, locale) =>
      source.postPath(postId, locale),
    ),
    datesOpen: anyDeliveryDatesOpen(),
    routeLocales,
  };
}

/** The post page from one published record (pure over `deps`). */
export async function postPageView(
  record: BlogPostRecord,
  locale: string,
  deps: BlogViewDeps,
): Promise<BlogPostPageView> {
  const published = blogDate(record.firstPublishedAt, locale);
  const modified = blogDate(record.revisionPublishedAt, locale);
  const path = blogPostPath(locale, record.slug);
  return {
    locale,
    postId: record.postId,
    slug: record.slug,
    path,
    title: record.title,
    excerpt: record.excerpt,
    seoTitle: record.seoTitle,
    seoDescription: record.seoDescription,
    authorName: record.authorName,
    published,
    updated: modified.iso === published.iso ? undefined : modified,
    notYetOpen: !deps.datesOpen,
    cover: coverOf(record.coverMediaId, record.coverAlt),
    blocks: await blogBodyView(
      blogMarkdownBlocks(record.bodyMd),
      locale,
      deps.targets,
    ),
    nextCorridor: nextCorridorFor(record.countries, locale, deps.corridorHref),
    breadcrumb: trail(locale, { title: record.title, path }),
    reviewed: record.reviewed,
    alternatePaths: await postPathsIn(
      deps.source,
      deps.routeLocales,
      record.slug,
    ),
  };
}

/** The post at `/{locale}/blog/{slug}`, or `undefined` where it does not exist now. */
export async function blogPostPageView(
  locale: string,
  slug: string,
  routeLocales: readonly string[],
  deps: BlogViewDeps = defaultDeps(routeLocales),
): Promise<BlogPostPageView | undefined> {
  const record = await deps.source.blogPostView(locale, slug);
  return record === undefined ? undefined : postPageView(record, locale, deps);
}

function entryView(entry: BlogIndexEntry, locale: string): BlogIndexEntryView {
  return {
    postId: entry.postId,
    slug: entry.slug,
    href: blogPostPath(locale, entry.slug),
    title: entry.title,
    excerpt: entry.excerpt,
    published: blogDate(entry.firstPublishedAt, locale),
    cover: coverOf(entry.coverMediaId, entry.coverAlt),
  };
}

/** The index at `/{locale}/blog`, or `undefined` where no post exists now (404). */
export async function blogIndexPageView(
  locale: string,
  routeLocales: readonly string[],
  source: BlogProvider = blogSource(),
): Promise<BlogIndexPageView | undefined> {
  const entries = await source.blogIndexView(locale);
  if (entries.length === 0) return undefined;
  return {
    locale,
    path: blogIndexPath(locale),
    entries: entries.map((entry) => entryView(entry, locale)),
    breadcrumb: trail(locale),
    alternatePaths: await indexPathsIn(source, routeLocales),
    anyReviewed: entries.some((entry) => entry.reviewed),
  };
}

/** One editorial URL with what its sitemap entry needs (§2.8, AC-10). */
export interface EditorialPageInput {
  readonly pageType: "blogIndex" | "blogPost";
  readonly path: string;
  /** ISO 8601 instant: the published revision's publish time (the index: the newest). */
  readonly lastmod: string;
  readonly reviewed: boolean;
  readonly pathByLocale: Readonly<Record<string, string>>;
}

/** Every blog URL of a route locale that exists now, for `editorial.xml` (AC-10). */
export async function editorialPages(
  locale: string,
  routeLocales: readonly string[],
  source: BlogProvider = blogSource(),
): Promise<readonly EditorialPageInput[]> {
  const content = blogContentLocale(locale);
  if (content === undefined) return [];
  const entries = await source.editorialSitemapEntries(locale);
  if (entries.length === 0) return [];
  const pages: EditorialPageInput[] = [];
  const records: BlogPostRecord[] = [];
  for (const entry of entries) {
    const record = await source.blogPostView(locale, entry.slug);
    if (record !== undefined) records.push(record);
  }
  const served = routeLocales.filter((code) =>
    blogRouteLocales(content).includes(code),
  );
  for (const record of records) {
    pages.push({
      pageType: "blogPost",
      path: blogPostPath(locale, record.slug),
      lastmod: record.revisionPublishedAt,
      reviewed: record.reviewed,
      pathByLocale: await postPathsIn(source, served, record.slug),
    });
  }
  const newest = records
    .map((record) => record.revisionPublishedAt)
    .sort()
    .at(-1);
  if (newest !== undefined) {
    pages.unshift({
      pageType: "blogIndex",
      path: blogIndexPath(locale),
      lastmod: newest,
      reviewed: records.some((record) => record.reviewed),
      pathByLocale: await indexPathsIn(source, served),
    });
  }
  return pages;
}

/** The editorial pages of every route locale, keyed by locale (the sitemap routes' input). */
export async function editorialSitemapSources(
  routeLocales: readonly string[],
  source: BlogProvider = blogSource(),
): Promise<Readonly<Record<string, readonly EditorialPageInput[]>>> {
  const byLocale: Record<string, readonly EditorialPageInput[]> = {};
  for (const locale of routeLocales) {
    const pages = await editorialPages(locale, routeLocales, source);
    if (pages.length > 0) byLocale[locale] = pages;
  }
  return byLocale;
}
