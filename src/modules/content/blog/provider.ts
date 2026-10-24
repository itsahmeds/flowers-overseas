/**
 * The blog's read seam (spec 044 §5.2 `BlogProvider`; TASK-321): the database in production
 * (`dbBlogProvider`, `./db/provider.ts`) and fixtures in tests (`fixtureBlogProvider`).
 *
 * The provider answers the **database half** of existence (§2.5, spec 012b §2.3): a post exists
 * when it is `published` with a published revision. The manifest half ("and its URL is in the
 * build manifest") is spec 012b's `existsNow`, applied by the public pages (TASK-322) on top of
 * these answers. An `en` post is served at `/en` and `/en-gb` with the same text (§2.2), so a
 * route locale is mapped to the post's content locale here, once.
 */
import { localePath } from "@/modules/i18n";

/** The content locale a route locale serves (slice A: `en` and `en-gb` read `en` posts). */
export function blogContentLocale(locale: string): string | undefined {
  return locale === "en" || locale === "en-gb" ? "en" : undefined;
}

/** The route locales a content locale is served at (slice A: `en` at `en` and `en-gb`). */
export function blogRouteLocales(contentLocale: string): readonly string[] {
  return contentLocale === "en" ? ["en", "en-gb"] : [];
}

/** One published post as its public page reads it. */
export interface BlogPostRecord {
  readonly postId: string;
  readonly revisionId: string;
  /** The post's content locale (`en`). */
  readonly locale: string;
  readonly slug: string;
  readonly title: string;
  readonly excerpt: string;
  readonly seoTitle: string;
  readonly seoDescription: string;
  readonly bodyMd: string;
  readonly coverMediaId: string | null;
  readonly coverAlt: string | null;
  readonly authorId: string;
  /** The byline: the author's own display name. */
  readonly authorName: string;
  /** Destination country tags, first tag first. */
  readonly countries: readonly string[];
  readonly occasions: readonly string[];
  /** ISO 8601: the post's first publish. */
  readonly firstPublishedAt: string;
  /** ISO 8601: when the served revision was published (`dateModified`, `<lastmod>`). */
  readonly revisionPublishedAt: string;
  /**
   * §6's `reviewed` term: the served revision's stored hash (the one its approval was given for,
   * frozen with it) still equals the hash of what it would serve now. False after a reassignment
   * to another author until a new revision is approved and published (TASK-321's carry-forward).
   */
  readonly reviewed: boolean;
}

/** One row of a blog index: newest first. */
export interface BlogIndexEntry {
  readonly postId: string;
  readonly slug: string;
  readonly title: string;
  readonly excerpt: string;
  readonly coverMediaId: string | null;
  readonly coverAlt: string | null;
  readonly firstPublishedAt: string;
  readonly revisionPublishedAt: string;
  /** The record's `reviewed` term (§6). */
  readonly reviewed: boolean;
}

/** The index lists at most this many posts per locale (§2.7). */
export const BLOG_INDEX_MAX = 48;

/** Spec 044 §5.2's queries. Every locale argument is a route locale (`en`, `en-gb`, `de`, …). */
export interface BlogProvider {
  blogPostView(
    locale: string,
    slug: string,
  ): Promise<BlogPostRecord | undefined>;
  blogIndexView(locale: string): Promise<readonly BlogIndexEntry[]>;
  blogPostExists(locale: string, slug: string): Promise<boolean>;
  blogIndexExists(locale: string): Promise<boolean>;
  /** Every `(locale, slug)` a post page exists for, for `generateStaticParams`. */
  blogStaticParams(): Promise<
    readonly { readonly locale: string; readonly slug: string }[]
  >;
  /** The locale's posts with their `<lastmod>` (the published revision's publish time). */
  editorialSitemapEntries(
    locale: string,
  ): Promise<
    readonly { readonly slug: string; readonly lastModified: string }[]
  >;
  /** A post's path in a locale by id (`fo:post/<id>` references), or `null` while it does not exist. */
  postPath(postId: string, locale: string): Promise<string | null>;
}

/** A provider over the published records of each content locale; `records` are assumed published. */
export function recordsBlogProvider(
  records: readonly BlogPostRecord[],
): BlogProvider {
  const inLocale = (locale: string): readonly BlogPostRecord[] => {
    const content = blogContentLocale(locale);
    return content === undefined
      ? []
      : records
          .filter((record) => record.locale === content)
          .toSorted((a, b) =>
            b.firstPublishedAt.localeCompare(a.firstPublishedAt),
          );
  };
  const find = (locale: string, slug: string): BlogPostRecord | undefined =>
    inLocale(locale).find((record) => record.slug === slug);
  return {
    blogPostView: (locale, slug) => Promise.resolve(find(locale, slug)),
    blogIndexView: (locale) =>
      Promise.resolve(
        inLocale(locale)
          .slice(0, BLOG_INDEX_MAX)
          .map((record) => ({
            postId: record.postId,
            slug: record.slug,
            title: record.title,
            excerpt: record.excerpt,
            coverMediaId: record.coverMediaId,
            coverAlt: record.coverAlt,
            firstPublishedAt: record.firstPublishedAt,
            revisionPublishedAt: record.revisionPublishedAt,
            reviewed: record.reviewed,
          })),
      ),
    blogPostExists: (locale, slug) =>
      Promise.resolve(find(locale, slug) !== undefined),
    blogIndexExists: (locale) => Promise.resolve(inLocale(locale).length > 0),
    blogStaticParams: () =>
      Promise.resolve(
        records.flatMap((record) =>
          blogRouteLocales(record.locale).map((locale) => ({
            locale,
            slug: record.slug,
          })),
        ),
      ),
    editorialSitemapEntries: (locale) =>
      Promise.resolve(
        inLocale(locale).map((record) => ({
          slug: record.slug,
          lastModified: record.revisionPublishedAt,
        })),
      ),
    postPath: (postId, locale) => {
      const record = inLocale(locale).find((entry) => entry.postId === postId);
      return Promise.resolve(
        record === undefined ? null : localePath(locale, "blog", record.slug),
      );
    },
  };
}

/** The test provider (§5.2 `fixtureBlogProvider`): the given published records. */
export const fixtureBlogProvider = recordsBlogProvider;
