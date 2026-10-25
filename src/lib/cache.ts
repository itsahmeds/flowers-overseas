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
import { revalidatePath } from "next/cache";

import {
  COUNTRY_CODES,
  type CountryIso2,
  isCountryIso2,
} from "@/config/countries";
import {
  CacheEntitySchema,
  cacheTagsFor,
  listProductPages,
  listingPages,
} from "@/modules/catalog";
import {
  type PickerState,
  hubView,
  listCorridorPages,
  pickerState,
} from "@/modules/geo";
import { localePath, routableLocaleCodes } from "@/modules/i18n";
import { absoluteUrl, deploymentDescriptor } from "@/modules/seo";

import {
  createCloudflareCacheAdapter,
  misconfiguredCloudflareCache,
  parseCloudflarePurgeConfig,
} from "./cache-cloudflare.ts";
import { type Logger, logger as processLogger } from "./logger.ts";
import { productRoutePathFor } from "./product-rewrites.ts";
import { captureWarning } from "./sentry.ts";

/** What an edge purge says about itself. It never rejects; `ok: false` is a purge that did not land. */
export interface CachePurgeResult {
  readonly ok: boolean;
}

export interface CacheAdapter {
  /** Invalidate every cache entry carrying any of `tags`. Resolves when the purge is accepted. */
  invalidate(tags: string[]): Promise<CachePurgeResult>;
}

/**
 * Accept and discard: the adapter wherever there is no CDN to purge. The parameter is omitted
 * rather than named-and-ignored (fewer parameters stay assignable in TypeScript), so no
 * `eslint-disable` is needed for the unused binding.
 */
export const noopCache: CacheAdapter = {
  invalidate(): Promise<CachePurgeResult> {
    return Promise.resolve({ ok: true });
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

/** `catalog:{iso2}`, spelled by spec 005's `cacheTagsFor()`, its only builder. */
function catalogTag(iso2: CountryIso2): string {
  const [tag] = cacheTagsFor(
    CacheEntitySchema.parse({ kind: "catalog", countryIso: iso2 }),
  );
  if (tag === undefined) throw new Error(`no catalogue tag for ${iso2}`);
  return tag;
}

/**
 * Every catalogue document with the tags it declares (spec 008 §5.4, spec 009 §5.4, §14 A10;
 * spec 012 §2.4; TASK-220, TASK-128): every country shop listing (the shop root, the country
 * categories and occasions) with `catalog:{iso2}` and `catalog:{iso2}:{locale}`, and every product
 * page with `productCachePolicy()`'s tags for its destination's picker state, read from the
 * catalogue's own existence sets, `listingPages()` and `listProductPages()`, which
 * `generateStaticParams`, the sitemaps and the crawl read too. Listings first, then products, each
 * in registry order.
 *
 * Asynchronous because the catalogue reads its dataset through a provider; only a tag no
 * home, hub or corridor document carries pays for it (`pathsForTag()`).
 */
async function catalogueDocuments(): Promise<TaggedDocument[]> {
  // A destination-less hub carries no destination's tag (`listingPages()` lists it beside them).
  const listings = (await listingPages()).flatMap((page) => {
    const iso2 = page.countryIso;
    if (iso2 === undefined) return [];
    return [
      {
        path: page.path,
        tags: [catalogTag(iso2), localeCatalogCacheTag(iso2, page.locale)],
      },
    ];
  });
  const states = new Map<CountryIso2, PickerState>();
  const products = (await listProductPages()).flatMap((page) => {
    const iso2 = page.countryIso;
    if (!isCountryIso2(iso2)) return [];
    const state = states.get(iso2) ?? pickerState(iso2);
    states.set(iso2, state);
    return [
      {
        path: page.path,
        tags: productCachePolicy({
          state,
          countryIso: iso2,
          locale: page.locale,
          sku: page.sku,
        }).tags,
      },
    ];
  });
  return [...listings, ...products];
}

/**
 * The site-relative paths of every document carrying `tag`, de-duplicated, in registry order.
 * The origin half of `invalidate()` revalidates exactly these; `urlsForTag()` is the same set made
 * absolute for the edge. The home, hub and corridor documents are asked first; a tag none of them
 * carries is looked up on the catalogue's documents (`catalog:{iso2}`, `catalog:{iso2}:{locale}`,
 * `product:{sku}`, `cutoff:{iso2}`).
 */
export async function pathsForTag(tag: string): Promise<string[]> {
  if (UNRESOLVED_TAGS.includes(tag)) return [];
  const carrying = (documents: readonly TaggedDocument[]): string[] => [
    ...new Set(
      documents
        .filter((document) => document.tags.includes(tag))
        .map((document) => document.path),
    ),
  ];
  const site = carrying(taggedDocuments());
  if (site.length > 0 || !isCatalogueTag(tag)) return site;
  return carrying(await catalogueDocuments());
}

/**
 * Whether `tag` is one the catalogue's documents can carry, decided by the builders themselves
 * rather than by spelling a prefix: a destination's `catalog:{iso2}`, its `catalog:{iso2}:{…}` and
 * its `cutoff:{iso2}`, or a `product:{sku}` that `cacheTagsFor()` rebuilds from its own suffix.
 * Cheap, so a corridor, hub or home tag that no document carries never enumerates the catalogue.
 */
function isCatalogueTag(tag: string): boolean {
  for (const code of COUNTRY_CODES) {
    if (!isCountryIso2(code)) continue;
    const catalog = catalogTag(code);
    if (
      tag === catalog ||
      tag.startsWith(`${catalog}:`) ||
      tag === cutoffCacheTag(code)
    ) {
      return true;
    }
  }
  const sku = tag.slice(tag.indexOf(":") + 1);
  const entity = CacheEntitySchema.safeParse({
    kind: "product",
    productId: sku,
  });
  return entity.success && cacheTagsFor(entity.data).includes(tag);
}

/**
 * The absolute URLs of every document carrying `tag`, de-duplicated, in registry order (spec 040
 * §5.4: "a pure `urlsForTag(tag)` built from the same registries the pages are generated from").
 * Computed, never fetched. A tag no document carries resolves to `[]`, which the adapter reports
 * by name; tags are compared exactly as the builders spell them. `catalog:{iso2}` is learned here
 * (spec 012 §2.4, TASK-220), which is why this answers a promise; the product page's tags,
 * `product:{sku}`, `catalog:{iso2}:{locale}` and `cutoff:{iso2}`, with spec 009 §14 A10
 * (TASK-128).
 */
export async function urlsForTag(
  tag: string,
  { baseUrl }: { readonly baseUrl: string },
): Promise<string[]> {
  const urls = new Set<string>();
  for (const path of await pathsForTag(tag)) {
    urls.add(absoluteUrl(path, { baseUrl }));
  }
  return [...urls];
}

/**
 * An in-process listener told about every `invalidate()` call, with its tags, after the edge purge
 * (spec 045 §5.2 "`src/lib/cache.ts`", §5.4; TASK-401). Site search's in-process index registers
 * one so a `catalog:*`, `product:*` or `country:*` change marks it stale, and the next search
 * rebuilds it: a price change reaches search when it reaches the listings.
 */
export type InvalidateListener = (tags: readonly string[]) => void;

const invalidateListeners = new Set<InvalidateListener>();

/**
 * Register `listener` for every later `invalidate()` call in this process; the return value
 * removes it. A listener that throws is skipped, never fatal: the change that called
 * `invalidate()` is already saved, and a listener cannot turn its purge into a failure.
 */
export function onInvalidate(listener: InvalidateListener): () => void {
  invalidateListeners.add(listener);
  return () => {
    invalidateListeners.delete(listener);
  };
}

function notifyInvalidateListeners(tags: readonly string[]): void {
  for (const listener of invalidateListeners) {
    try {
      listener(tags);
    } catch {
      // Deliberately silent: see `onInvalidate()`. The listener owns its own logging.
    }
  }
}

/** The Sentry signal of a toggle whose change is saved but not yet visible (spec 012 §11). */
export const CACHE_INVALIDATE_FAILED_SIGNAL = "cache.invalidate.failed";

/** How each half of one `invalidate()` call went. */
export interface InvalidationOutcome {
  readonly origin: "ok" | "failed";
  readonly edge: "ok" | "failed";
  /** Public documents revalidated at the origin (product pages also by their internal route). */
  readonly urlCount: number;
}

/** What `invalidate()` calls; tests replace each. */
export interface InvalidateDeps {
  /** Marks one path stale on this (single-replica) origin. Default: Next's `revalidatePath`. */
  readonly revalidate: (path: string) => void;
  /** The edge purge. Default: `cache`, chosen by the environment. */
  readonly edge: CacheAdapter;
  readonly log: Logger;
  /** Reports a failure. Default: `captureWarning` (Sentry; a no-op without a DSN). */
  readonly report: (signal: string, fields: Record<string, unknown>) => void;
}

function defaultInvalidateDeps(): InvalidateDeps {
  return {
    revalidate: (path) => {
      revalidatePath(path);
    },
    edge: cache,
    log: processLogger,
    report: captureWarning,
  };
}

/**
 * **The one function application code calls to make a change visible** (spec 012 §5.4
 * "Invalidation", §11; spec 040 §5.4): the Railway origin first — one `revalidatePath` per
 * document carrying any of `tags`, which is enough on a single replica (spec 040), and a product
 * page also by the internal route its address is rewritten to (`productRoutePathFor()`), which is
 * the entry Next caches — then the Cloudflare edge, by URL, through `cache`.
 *
 * It never rejects: the change that asked for it is already saved. One log line per call,
 * `cache.invalidate` with the tag names, the URL count and both outcomes, never a URL; when either
 * half failed that line is a `warn` and Sentry gets the same tags (§11: "the change is saved but
 * not yet visible").
 */
export async function invalidate(
  tags: readonly string[],
  overrides: Partial<InvalidateDeps> = {},
): Promise<InvalidationOutcome> {
  const deps = { ...defaultInvalidateDeps(), ...overrides };
  const names = [...new Set(tags)];

  let origin: InvalidationOutcome["origin"] = "ok";
  const documents = new Set<string>();
  try {
    for (const tag of names) {
      for (const path of await pathsForTag(tag)) documents.add(path);
    }
  } catch {
    origin = "failed";
  }
  for (const path of documents) {
    for (const entry of [path, productRoutePathFor(path)]) {
      if (entry === null) continue;
      try {
        deps.revalidate(entry);
      } catch {
        origin = "failed";
      }
    }
  }

  let edge: InvalidationOutcome["edge"];
  try {
    edge = (await deps.edge.invalidate(names)).ok ? "ok" : "failed";
  } catch {
    edge = "failed";
  }
  // After the edge purge, in-process listeners (spec 045 §5.2): site search's index.
  notifyInvalidateListeners(names);

  const fields = {
    event: "cache.invalidate",
    tags: names,
    url_count: documents.size,
    origin,
    edge,
  };
  if (origin === "failed" || edge === "failed") {
    deps.log.warn(fields, "cache invalidation failed; the change is saved");
    deps.report(CACHE_INVALIDATE_FAILED_SIGNAL, {
      tags: names,
      origin,
      edge,
    });
  } else {
    deps.log.info(fields, "cache invalidated");
  }
  return { origin, edge, urlCount: documents.size };
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

/**
 * `catalog:{iso2}:{locale}`: one destination's catalogue pages in one locale, the listings (spec
 * 008 §5.4) and the product pages (spec 009 §5.4). Built on `cacheTagsFor()`'s spelling of
 * `catalog:{iso2}`, so the two cannot drift.
 */
export function localeCatalogCacheTag(
  iso2: CountryIso2,
  locale: string,
): string {
  return `${catalogTag(iso2)}:${locale}`;
}

/**
 * `cutoff:{iso2}`: a **live** destination's product pages (spec 009 §2 "No relative day labels",
 * §5.4). A later scheduled job purges it at the destination's midnight and at its cutoff minute,
 * so a cached page never offers a date that has closed; that job, and the route's own 300 s, are
 * the task that takes the first country live (A10).
 */
export function cutoffCacheTag(iso2: CountryIso2): string {
  return `cutoff:${iso2}`;
}

/** The product page's ISR window while nothing can be bought (`plan/01` §3: "product 1 h"). */
export const PRODUCT_REVALIDATE_SECONDS = 3600;

/** The window of a **live** product page (spec 009 §5.4): its dates and cutoff move by the hour. */
export const LIVE_PRODUCT_REVALIDATE_SECONDS = 300;

/** One product page's caching: its ISR window and the tags its document declares. */
export interface ProductCachePolicy {
  readonly revalidate: number;
  readonly tags: readonly string[];
}

/**
 * **The product page's cache policy, a pure function of its picker state** (spec 009 §5.4, AC-24,
 * §14 A10 "Cache policy per picker state"; memo E-2; TASK-128).
 *
 *  - `unavailable` and `preview`: `revalidate` 3600 and §5.4's tags, `product:{sku}`,
 *    `catalog:{iso2}`, `catalog:{iso2}:{locale}` and `sitemap`;
 *  - `live`: `revalidate` 300 and the same tags plus `cutoff:{iso2}`.
 *
 * AC-24's "(300 when live)" is this policy's output. The product route itself exports the
 * literal 3600, which is this policy's answer for every Phase 0 destination (no country is live),
 * and Phase 0 attaches no tag to a cache entry (`corridorCacheTags()` says why); `urlsForTag()`
 * reads these tags, so a purge reaches the pages that declare them.
 */
export function productCachePolicy(page: {
  readonly state: PickerState;
  readonly countryIso: CountryIso2;
  readonly locale: string;
  readonly sku: string;
}): ProductCachePolicy {
  const tags = [
    ...cacheTagsFor(
      CacheEntitySchema.parse({ kind: "product", productId: page.sku }),
    ),
    catalogTag(page.countryIso),
    localeCatalogCacheTag(page.countryIso, page.locale),
    SITEMAP_CACHE_TAG,
  ];
  return page.state === "live"
    ? {
        revalidate: LIVE_PRODUCT_REVALIDATE_SECONDS,
        tags: [...tags, cutoffCacheTag(page.countryIso)],
      }
    : { revalidate: PRODUCT_REVALIDATE_SECONDS, tags };
}
