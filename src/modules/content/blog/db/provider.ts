/**
 * `dbBlogProvider` (spec 044 §5.2; TASK-321): the published posts, read in the public context.
 *
 * Runs in `withDbContext({ role: 'public' })`, so at run time it reads as `app_web` and during
 * `next build` as `app_build` (`src/lib/db.ts`), and in both cases row-level security returns
 * only published posts, their published revisions, their tags, and their authors' `id` and
 * `display_name` through `blog_author_public` (migration `0024`, AC-2). It never reads a draft,
 * a user id or an agreement date: the database would not give them to it.
 *
 * This directory is the one place in `src/modules/content` that reads the database
 * (`pnpm check:no-db`'s allowed path, spec 044 §5.2).
 */
import { randomUUID } from "node:crypto";

import { sql, type SQL } from "drizzle-orm";

import {
  type BlogPostRecord,
  type BlogProvider,
  recordsBlogProvider,
} from "../provider.ts";

/** What the reads run their statements through (default: the public database context). */
export type BlogReader = <T>(
  fn: (db: { execute(query: SQL): Promise<unknown> }) => Promise<T>,
) => Promise<T>;

async function defaultReader(): Promise<BlogReader> {
  const { withDbContext } = await import("@/lib/db");
  return (fn) =>
    withDbContext({ role: "public", requestId: randomUUID() }, (db) => fn(db));
}

const ISO = `'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`;

/** The published posts of every locale, newest first. */
export const PUBLISHED_POSTS_QUERY = sql`
  SELECT p.id AS post_id, r.id AS revision_id, p.locale_code, p.slug,
         r.title, r.excerpt, r.seo_title, r.seo_description, r.body_md,
         r.cover_media_id, r.cover_alt, p.author_id, a.display_name AS author_name,
         coalesce((SELECT array_agg(c.iso2 ORDER BY pc.sort)
                     FROM public.blog_post_country pc
                     JOIN public.country c ON c.id = pc.country_id
                    WHERE pc.post_id = p.id), '{}') AS countries,
         coalesce((SELECT array_agg(o.key ORDER BY o.key)
                     FROM public.blog_post_occasion po
                     JOIN public.occasion o ON o.id = po.occasion_id
                    WHERE po.post_id = p.id), '{}') AS occasions,
         to_char(p.first_published_at AT TIME ZONE 'UTC', ${sql.raw(ISO)}) AS first_published_at,
         to_char(coalesce(r.published_at, p.first_published_at) AT TIME ZONE 'UTC', ${sql.raw(ISO)}) AS revision_published_at
    FROM public.blog_post p
    JOIN public.blog_post_revision r ON r.id = p.published_revision_id AND r.post_id = p.id
    JOIN public.blog_author_public a ON a.id = p.author_id
   WHERE p.status = 'published' AND p.first_published_at IS NOT NULL
   ORDER BY p.first_published_at DESC, p.id`;

interface Row {
  post_id: string;
  revision_id: string;
  locale_code: string;
  slug: string;
  title: string;
  excerpt: string;
  seo_title: string;
  seo_description: string;
  body_md: string;
  cover_media_id: string | null;
  cover_alt: string | null;
  author_id: string;
  author_name: string;
  countries: string[];
  occasions: string[];
  first_published_at: string;
  revision_published_at: string;
}

/** The published records, as the public role sees them. */
export async function readPublishedPosts(
  reader?: BlogReader,
): Promise<readonly BlogPostRecord[]> {
  const run = reader ?? (await defaultReader());
  const rows = await run(async (db) =>
    Array.from((await db.execute(PUBLISHED_POSTS_QUERY)) as Iterable<Row>),
  );
  return rows.map((row) => ({
    postId: row.post_id,
    revisionId: row.revision_id,
    locale: row.locale_code,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    bodyMd: row.body_md,
    coverMediaId: row.cover_media_id,
    coverAlt: row.cover_alt,
    authorId: row.author_id,
    authorName: row.author_name,
    countries: row.countries,
    occasions: row.occasions,
    firstPublishedAt: row.first_published_at,
    revisionPublishedAt: row.revision_published_at,
  }));
}

/** The database `BlogProvider`: each query reads the published set once and answers from it. */
export function dbBlogProvider(reader?: BlogReader): BlogProvider {
  const provider = async (): Promise<BlogProvider> =>
    recordsBlogProvider(await readPublishedPosts(reader));
  return {
    blogPostView: async (locale, slug) =>
      (await provider()).blogPostView(locale, slug),
    blogIndexView: async (locale) => (await provider()).blogIndexView(locale),
    blogPostExists: async (locale, slug) =>
      (await provider()).blogPostExists(locale, slug),
    blogIndexExists: async (locale) =>
      (await provider()).blogIndexExists(locale),
    blogStaticParams: async () => (await provider()).blogStaticParams(),
    editorialSitemapEntries: async (locale) =>
      (await provider()).editorialSitemapEntries(locale),
    postPath: async (postId, locale) =>
      (await provider()).postPath(postId, locale),
  };
}
