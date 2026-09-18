/**
 * `GET /sitemap.xml` — the sitemap index (spec 007 §2 "Sitemaps", §5.2, §5.4, AC-13, AC-14;
 * `plan/02` §10; TASK-094).
 *
 * Thin like every other route (`plan/01` §5): read the deployment, hand it to `modules/seo`,
 * print the bytes. Which locales are announced, which children they have and which URLs those
 * carry are `pageIndexability()`'s answers, so this file cannot announce a URL whose document
 * says `noindex`.
 *
 * **`sitemap.xml` as a route segment, not Next's `app/sitemap.ts` metadata convention.** The
 * convention emits a flat `<urlset>` and has no way to express a sitemap index, a per-locale
 * child or an `xhtml:link` set, which are three of AC-13's four clauses — so the file is a route
 * handler, exactly as spec 007 §5.2 lists it.
 *
 * **`force-dynamic` with an explicit `Cache-Control`.** The document is a pure function of the
 * repository *and the deployment*: the same image is promoted from staging to production
 * (ADR-0018, spec 040), and the environment is what decides whether anything is announced at all.
 * Prerendering this at build time would freeze the build's environment into the artefact and
 * announce the wrong thing — or nothing — on the host that matters. Nothing here reads a cookie
 * or a request header, so the response still carries no `Vary` and is byte-identical for every
 * visitor (§5.4); the hour of shared caching is the `Cache-Control` header, and the `sitemap`
 * tag in `src/lib/cache.ts` is what `plan/01` §8's hourly job purges.
 */
import {
  SITEMAP_CACHE_CONTROL,
  SITEMAP_CONTENT_TYPE,
  deploymentDescriptor,
  sitemapIndexDocument,
} from "@/modules/seo";

export const dynamic = "force-dynamic";

export function GET(): Response {
  return new Response(sitemapIndexDocument(deploymentDescriptor(process.env)), {
    headers: {
      "content-type": SITEMAP_CONTENT_TYPE,
      "cache-control": SITEMAP_CACHE_CONTROL,
    },
  });
}
