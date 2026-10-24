/**
 * The blog's cache tags (spec 044 §5.4; TASK-322): every blog document carries `blog:{locale}`
 * (the post's content locale, `en` for both `/en` and `/en-gb`), a post also carries
 * `blog:post:{postId}`, and `editorial.xml` carries `sitemap`. The commands return exactly these
 * (TASK-321, AC-15); `src/lib/cache.ts` resolves them to paths through `./db/tags.ts`.
 */
import { z } from "zod";

const BLOG_POST_TAG =
  /^blog:post:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/u;
const BLOG_LOCALE_TAG = /^blog:([a-z]{2}(?:-[a-z]{2})?)$/u;

/** What one blog tag names. */
export type BlogTag =
  | { readonly kind: "post"; readonly postId: string }
  | { readonly kind: "locale"; readonly locale: string };

/** The tag's meaning, or `undefined` for a tag that is not the blog's. */
export function parseBlogTag(tag: string): BlogTag | undefined {
  const post = BLOG_POST_TAG.exec(tag);
  if (post?.[1] !== undefined) {
    return { kind: "post", postId: z.uuid().parse(post[1]) };
  }
  const locale = BLOG_LOCALE_TAG.exec(tag);
  if (locale?.[1] !== undefined) return { kind: "locale", locale: locale[1] };
  return undefined;
}

export function isBlogTag(tag: string): boolean {
  return parseBlogTag(tag) !== undefined;
}

/** `blog:post:{postId}`. */
export function blogPostTag(postId: string): string {
  return `blog:post:${postId}`;
}

/** `blog:{locale}`, by content locale. */
export function blogLocaleTag(locale: string): string {
  return `blog:${locale}`;
}
