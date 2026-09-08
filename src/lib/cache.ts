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
