/**
 * Cache-invalidation seam (spec 001 §5.4, TASK-006).
 *
 * plan/01 §3 keeps ISR revalidation behind one interface so the hosting-specific implementation
 * (`revalidateTag` on Vercel, a purge call elsewhere — ADR-0012's fallback) can be swapped
 * without touching callers. Spec 001 has no ISR and no tags, so the only implementation is a
 * no-op; specs 007/008 ship the first tagged pages and the real adapter behind this same
 * interface.
 */

export interface CacheAdapter {
  /** Invalidate every cache entry carrying any of `tags`. Resolves when the purge is accepted. */
  invalidate(tags: string[]): Promise<void>;
}

/**
 * No ISR, no tags in spec 001: accepting and discarding is the correct behaviour. The parameter
 * is omitted rather than named-and-ignored (fewer parameters stay assignable in TypeScript), so
 * no `eslint-disable` is needed for the unused binding.
 */
export const noopCache: CacheAdapter = {
  invalidate(): Promise<void> {
    return Promise.resolve();
  },
};

/** The adapter application code imports. Repointed by spec 007/008, not by callers. */
export const cache: CacheAdapter = noopCache;

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
 * corridor route revalidates on time (86 400 s) and declares its tags here, so the switch is a
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

/** The tag every sitemap-bearing response shares (`plan/01` §8's hourly job; TASK-094). */
export const SITEMAP_CACHE_TAG = "sitemap";
