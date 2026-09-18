/**
 * `GET /sitemaps/{locale}/{index|static|corridors}.xml` — the locale index and its children
 * (spec 007 §2 "Sitemaps", §5.2, §5.4, AC-13, AC-14; `plan/02` §10; TASK-094).
 *
 * One route file for both levels, because they answer the same question about the same two
 * segments and Next allows one dynamic slug name per depth (the constraint spec 007 §14 A8
 * records for the page routes).
 *
 * **Everything unknown is a 404, and nothing is a redirect** (ADR-0006, spec 007 §14 A6's
 * shapes): the params are parsed by `SitemapParamsSchema` before any registry is consulted, so an
 * upper-case locale, a traversal attempt and a `products.xml` that no spec has shipped are
 * refused identically. A child that exists but has no URLs is also a 404 — an empty sitemap is
 * not a document we publish, which is the same rule that keeps it out of the index.
 *
 * `force-dynamic` and the explicit `Cache-Control` are the index route's, for the same reason
 * (the environment decides what is announced, and the image is promoted between environments).
 */
import {
  SITEMAP_CACHE_CONTROL,
  SITEMAP_CONTENT_TYPE,
  SitemapParamsSchema,
  deploymentDescriptor,
  sitemapDocumentFor,
  sitemapNameOf,
} from "@/modules/seo";

export const dynamic = "force-dynamic";

const NOT_FOUND = 404;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string; child: string }> },
): Promise<Response> {
  const parsed = SitemapParamsSchema.safeParse(await params);
  if (!parsed.success) return new Response(null, { status: NOT_FOUND });

  const document = sitemapDocumentFor(
    parsed.data.locale,
    sitemapNameOf(parsed.data.child),
    deploymentDescriptor(process.env),
  );
  if (document === undefined) return new Response(null, { status: NOT_FOUND });

  return new Response(document, {
    headers: {
      "content-type": SITEMAP_CONTENT_TYPE,
      "cache-control": SITEMAP_CACHE_CONTROL,
    },
  });
}
