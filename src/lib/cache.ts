/**
 * Cache-invalidation seam (spec 001 §5.4, TASK-006; spec 040 §5.4, §5.7, AC-22, TASK-102).
 *
 * plan/01 §3 keeps ISR revalidation behind one interface so the hosting-specific implementation
 * can be swapped without touching callers: `invalidate(tags[])` is the one function application
 * code calls. On Railway behind Cloudflare (ADR-0018) that is `cloudflareCacheAdapter`
 * (`src/lib/cache-cloudflare.ts`), which turns each tag into the URLs carrying it and purges
 * them by URL; everywhere the two Cloudflare keys are absent — a laptop, CI, the cold Vercel
 * fallback — it is the no-op. `cache` below makes that choice once, at start-up, from the
 * environment; no caller ever sees which.
 *
 * This file also owns the **tag vocabulary** (the builders at the bottom) and the tag → URL map
 * (`urlsForTag()`), in one place for one reason: the page that is cached, the code that purges
 * it and the resolver that turns the tag into URLs must not be able to spell a tag differently.
 */
import { hubView, listCorridorPages } from "@/modules/geo";
import { localePath, routableLocaleCodes } from "@/modules/i18n";
import { absoluteUrl, deploymentDescriptor } from "@/modules/seo";

import {
  createCloudflareCacheAdapter,
  misconfiguredCloudflareCache,
  parseCloudflarePurgeConfig,
} from "./cache-cloudflare.ts";
import type { Logger } from "./logger.ts";

export interface CacheAdapter {
  /** Invalidate every cache entry carrying any of `tags`. Resolves when the purge is accepted. */
  invalidate(tags: string[]): Promise<void>;
}

/**
 * Accept and discard: the adapter wherever there is no CDN to purge. The parameter is omitted
 * rather than named-and-ignored (fewer parameters stay assignable in TypeScript), so no
 * `eslint-disable` is needed for the unused binding.
 */
export const noopCache: CacheAdapter = {
  invalidate(): Promise<void> {
    return Promise.resolve();
  },
};

type EnvSource = Readonly<Record<string, string | undefined>>;

/**
 * The adapter for an environment (spec 040 §5.4, §12 "Feature flags": absent means off).
 *
 * Both `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ZONE_ID` present and well-formed ⇒ the Cloudflare
 * purge adapter, resolving tags against this deployment's own origin (`NEXT_PUBLIC_SITE_URL`,
 * the host Cloudflare caches under). Either one absent or blank ⇒ `noopCache`. Present but
 * malformed ⇒ an adapter that purges nothing and names the key at `warn`.
 */
export function selectCacheAdapter(
  source: EnvSource,
  log?: Logger,
): CacheAdapter {
  const config = parseCloudflarePurgeConfig(source);
  if (config.kind === "absent") return noopCache;
  if (config.kind === "invalid") {
    return misconfiguredCloudflareCache(config.keys, log);
  }
  const baseUrl = deploymentDescriptor(source).siteUrl;
  return createCloudflareCacheAdapter({
    token: config.token,
    zoneId: config.zoneId,
    resolve: (tag) => urlsForTag(tag, { baseUrl }),
    ...(log === undefined ? {} : { logger: log }),
  });
}

/** The adapter application code imports. Chosen by the environment, never by a caller. */
export const cache: CacheAdapter = selectCacheAdapter(process.env);

/** One cacheable document and the tags its route declares. */
interface TaggedDocument {
  readonly path: string;
  readonly tags: readonly string[];
}

/**
 * Every document that carries a tag, with the tags it carries — built from the registries and
 * URL builders the pages and the sitemaps are generated from, never listed by hand:
 *
 *  - the locale home, one per routable locale (the `[locale]` layout's `generateStaticParams`),
 *    `localePath(locale, "home")`, tagged `homeCacheTag(locale)`;
 *  - the all-destinations hub, one per routable locale, at `hubView(locale).path` — the path the
 *    static sitemap announces — tagged `hubCacheTags(locale)`;
 *  - every corridor page `listCorridorPages()` says exists, at
 *    `localePath(locale, "destinations", slug)` — the corridor sitemap's own builder — tagged
 *    `corridorCacheTags(iso2, locale)`.
 *
 * A superset of what the sitemaps list, on purpose: the sitemap lists only what is indexable
 * here, while Cloudflare caches every document it serves, `noindex` or not.
 */
function taggedDocuments(): TaggedDocument[] {
  const documents: TaggedDocument[] = [];
  for (const locale of routableLocaleCodes()) {
    documents.push({
      path: localePath(locale, "home"),
      tags: [homeCacheTag(locale)],
    });
    documents.push({ path: hubView(locale).path, tags: hubCacheTags(locale) });
  }
  for (const page of listCorridorPages()) {
    documents.push({
      path: localePath(page.locale, "destinations", page.slug),
      tags: corridorCacheTags(page.iso2, page.locale),
    });
  }
  return documents;
}

/** The tag every sitemap-bearing response shares (`plan/01` §8's hourly job; TASK-094). */
export const SITEMAP_CACHE_TAG = "sitemap";

/**
 * Tags `urlsForTag()` deliberately leaves unresolved. `sitemap` is carried by the corridor pages
 * and the hubs (their builders above), by spec 008's listing pages and — per the sitemap routes —
 * by the sitemap documents themselves, and no spec says which of those a `sitemap` purge means.
 * TASK-102's brief records the question; until it is answered the tag resolves to nothing and
 * the adapter names it in its log line (`unresolved_tags`), rather than guessing a URL set.
 */
const UNRESOLVED_TAGS: readonly string[] = [SITEMAP_CACHE_TAG];

/**
 * The absolute URLs of every document carrying `tag`, de-duplicated, in registry order (spec 040
 * §5.4: "a pure `urlsForTag(tag)` built from the same registries the pages are generated from").
 * Purely computed, never fetched. A tag no document carries resolves to `[]`, which the adapter
 * reports by name; tags are compared exactly as the builders below spell them.
 */
export function urlsForTag(
  tag: string,
  { baseUrl }: { readonly baseUrl: string },
): string[] {
  if (UNRESOLVED_TAGS.includes(tag)) return [];
  const urls = new Set<string>();
  for (const document of taggedDocuments()) {
    if (document.tags.includes(tag)) {
      urls.add(absoluteUrl(document.path, { baseUrl }));
    }
  }
  return [...urls];
}

/**
 * Cache tag for a locale home page (`plan/01` §3's reserved `home:{locale}` tag, spec 003 §5.4,
 * TASK-034).
 *
 * Tag *names* live next to the invalidation seam rather than in the page, so the page that is
 * cached and the code that purges it cannot spell the tag differently. `src/app/[locale]/page.tsx`
 * documents why Phase 0 attaches no tag to the cache entry yet (Next 16 needs `cacheComponents`
 * for `cacheTag()`, which the first data-fetching spec owns) and revalidates on time instead.
 */
export function homeCacheTag(locale: string): string {
  return `home:${locale}`;
}

/**
 * Cache tags for one corridor page (spec 007 §5.4: `corridor:{iso2}`, `corridor:{iso2}:{locale}`
 * and `sitemap`; TASK-091).
 *
 * The tag names live here, beside the invalidation seam, for `homeCacheTag()`'s reason: the page
 * that is cached and the code that purges it must not be able to spell the tag differently. The
 * first real callers are spec 012's admin (a content or status edit purges `corridor:{iso2}`) and
 * the hourly sitemap job of `plan/01` §8 (`sitemap`), and both inherit this list rather than
 * guessing it.
 *
 * Phase 0 attaches no tag to a cache entry: Next 16 only does that through `use cache` /
 * `cacheTag()`, which needs `cacheComponents` — a repo-wide rendering change that belongs to the
 * spec shipping the first real data fetch, exactly as `src/app/[locale]/page.tsx` records. The
 * corridor route revalidates on time (3 600 s, spec 007 §14 A8) and declares its tags here, so the switch is a
 * one-line change at the call site rather than an archaeology exercise.
 */
export function corridorCacheTags(
  iso2: string,
  locale: string,
): readonly string[] {
  return [`corridor:${iso2}`, `corridor:${iso2}:${locale}`, SITEMAP_CACHE_TAG];
}

/**
 * Cache tags for one locale's all-destinations hub (spec 007 §5.4, which gives the hub the
 * corridor page's caching; TASK-092).
 *
 * `hub:{locale}` rather than a corridor tag: the hub is one document per locale and what changes
 * it is *any* destination's publication state, so spec 012's admin purges `corridor:{iso2}` for
 * the country and `hub:{locale}` for the pages that list it, and the hourly sitemap job purges
 * `sitemap`. Phase 0 attaches no tag to a cache entry — see `corridorCacheTags()` for why — and
 * the route revalidates on time instead.
 */
export function hubCacheTags(locale: string): readonly string[] {
  return [`hub:${locale}`, SITEMAP_CACHE_TAG];
}
