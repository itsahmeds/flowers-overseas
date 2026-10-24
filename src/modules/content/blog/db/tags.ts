/**
 * The paths a blog cache tag names (spec 044 §5.4, AC-15, AC-16; TASK-322), for
 * `src/lib/cache.ts`'s `pathsForTag()`: the origin revalidates them and the edge purges them.
 *
 * Read in the system context, **whatever the post's status**: an unpublish must purge the URL it
 * just took down, which the public role can no longer see. `blog:post:{id}` is the post's own
 * URLs in every route locale that serves its content locale (`/en/blog/{slug}`,
 * `/en-gb/blog/{slug}`); `blog:{locale}` is those locales' index and every post ever published
 * there (each blog document carries the tag, §5.4).
 */
import { sql, type SQL } from "drizzle-orm";

import { blogRouteLocales } from "../provider.ts";
import { blogIndexPath, blogPostPath } from "../source.ts";
import { parseBlogTag } from "../tags.ts";

/** What the read runs its statement through (default: the system context). */
export type BlogTagReader = (
  query: SQL,
) => Promise<readonly { locale_code: string; slug: string }[]>;

async function defaultReader(): Promise<BlogTagReader> {
  const { withSystemContext } = await import("@/lib/db");
  return (query) =>
    withSystemContext("cache.blog-tags", async (db) =>
      Array.from(
        (await db.execute(query)) as Iterable<{
          locale_code: string;
          slug: string;
        }>,
      ),
    );
}

export async function blogTagPaths(
  tag: string,
  reader?: BlogTagReader,
): Promise<readonly string[]> {
  const parsed = parseBlogTag(tag);
  if (parsed === undefined) return [];
  const read = reader ?? (await defaultReader());
  const posts =
    parsed.kind === "post"
      ? await read(
          sql`SELECT locale_code, slug FROM public.blog_post WHERE id = ${parsed.postId}::uuid`,
        )
      : await read(
          sql`SELECT locale_code, slug FROM public.blog_post
               WHERE locale_code = ${parsed.locale} AND first_published_at IS NOT NULL
               ORDER BY slug`,
        );
  const paths = new Set<string>();
  if (parsed.kind === "locale") {
    for (const locale of blogRouteLocales(parsed.locale)) {
      paths.add(blogIndexPath(locale));
    }
  }
  for (const post of posts) {
    for (const locale of blogRouteLocales(post.locale_code)) {
      paths.add(blogPostPath(locale, post.slug));
    }
  }
  return [...paths];
}
