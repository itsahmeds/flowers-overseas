/**
 * Cache tags for catalogue and price mutations (spec 005 §5.2 `cache.ts`, §5.4, AC-25;
 * `plan/01` §3; TASK-069).
 *
 * `plan/01` §3 reserves three tag names on the ISR entries this catalogue feeds — `catalog:{country}`
 * on category and collection pages, `product:{id}` on product pages, and `country:{iso}` for the
 * status flip that takes a destination live — and calls the `invalidate(tags[])` seam in
 * `src/lib/cache.ts` "the single most important portability seam". A tag is therefore a name two
 * unrelated pieces of code must spell identically: the page that attaches it and the admin action
 * or job that purges it. **`cacheTagsFor()` is the only place either spelling is produced**
 * (AC-25), so a typo is a failing unit test rather than a page that never refreshes.
 *
 * Three deliberate properties:
 *
 *  - **It maps a mutation to the tags that mutation invalidates, not an entity to its own name.**
 *    Taking Poland live changes every category page for Poland as well as the country page, and a
 *    price edit on one product changes that product's page *and* the country's category pages
 *    that print a "from" figure. Returning one tag per call and leaving the union to the caller
 *    is how a purge comes to miss a surface; the mutation → tag map in
 *    `docs/runbooks/pricing.md` is this function, written out, and specs 007/008/012 inherit it
 *    rather than guessing (AC-25).
 *  - **Spec 005 calls `invalidate()` nowhere.** This module produces names; the first callers are
 *    spec 012's admin price edit and TASK-071's `fx.refresh`, each of which purges the tags this
 *    function returns. Nothing here reaches the cache adapter, which is why the module stays
 *    free of any hosting concern (ADR-0012's Vercel/Cloudflare swap).
 *  - **The inputs are parsed.** A destination is a code from `src/config/countries.ts` and a
 *    product id is a `sku` from the dataset's own schema, so `catalog:undefined` and
 *    `product:[object Object]` — both of which purge nothing and fail silently — cannot be built.
 */
import { z } from "zod";

import type { CountryIso2 } from "@/config/countries";

import { DestinationIsoSchema, ProductSkuSchema } from "./schemas";

/**
 * The three tag prefixes of `plan/01` §3, as the single source of their spelling.
 *
 * `home:{locale}` is the fourth reserved name and stays in `src/lib/cache.ts` beside the seam
 * (spec 003, TASK-034): it is not a catalogue entity, and this module has no business minting it.
 */
export const CATALOG_CACHE_TAG_PREFIXES = {
  /** Category, collection and corridor pages scoped to one destination. */
  catalog: "catalog",
  /** One product's pages, in every locale. */
  product: "product",
  /** A destination's own page and its status (`live` / `demo` / `disabled`). */
  country: "country",
} as const;

/**
 * What changed. One variant per mutation the catalogue can undergo, named after the mutation
 * rather than after the row, because that is how a runbook reader thinks about it.
 */
export const CacheEntitySchema = z.discriminatedUnion("kind", [
  /** A product's own data changed: name, facets, status, media, translation. */
  z.strictObject({ kind: z.literal("product"), productId: ProductSkuSchema }),
  /**
   * A price row for one product in one destination was superseded (spec 012's admin edit).
   * Both the product's pages and that destination's category pages carry the number.
   */
  z.strictObject({
    kind: z.literal("price"),
    productId: ProductSkuSchema,
    countryIso: DestinationIsoSchema,
  }),
  /**
   * Everything priced in one destination moved at once: an FX refresh, a VAT-rate change, a
   * surcharge row added for a peak day (TASK-071's `fx.refresh` purges exactly this).
   */
  z.strictObject({
    kind: z.literal("catalog"),
    countryIso: DestinationIsoSchema,
  }),
  /** A destination's `status` flipped — the go-live that `plan/01` §3 names explicitly. */
  z.strictObject({
    kind: z.literal("country"),
    countryIso: DestinationIsoSchema,
  }),
]);

export type CacheEntity = z.infer<typeof CacheEntitySchema>;

/** `catalog:{iso}` — every destination-scoped listing page. */
function catalogTag(countryIso: CountryIso2): string {
  return `${CATALOG_CACHE_TAG_PREFIXES.catalog}:${countryIso}`;
}

/** `product:{id}` — one product's pages, in every locale. */
function productTag(productId: string): string {
  return `${CATALOG_CACHE_TAG_PREFIXES.product}:${productId}`;
}

/** `country:{iso}` — the destination page and anything keyed on its status. */
function countryTag(countryIso: CountryIso2): string {
  return `${CATALOG_CACHE_TAG_PREFIXES.country}:${countryIso}`;
}

/**
 * The cache tags one mutation invalidates (`plan/01` §3, AC-25).
 *
 * Deduplicated and sorted, so a caller can compare two purges and a test can compare a list:
 * the order a purge is issued in has no meaning, and an unstable order would make the runbook's
 * map unreadable.
 */
export function cacheTagsFor(entity: CacheEntity): readonly string[] {
  const parsed = CacheEntitySchema.parse(entity);

  const tags = ((): readonly string[] => {
    switch (parsed.kind) {
      case "product":
        return [productTag(parsed.productId)];
      case "price":
        return [productTag(parsed.productId), catalogTag(parsed.countryIso)];
      case "catalog":
        return [catalogTag(parsed.countryIso)];
      case "country":
        // A go-live changes the destination's own page *and* every listing scoped to it
        // (`plan/01` §3: "Flipping to `live` triggers `invalidate(['country:PL'])` and sitemap
        // regeneration" — the country tag is the one that spec names, and the catalogue tag is
        // what keeps the category pages from serving yesterday's "not available" state).
        return [catalogTag(parsed.countryIso), countryTag(parsed.countryIso)];
    }
  })();

  return [...new Set(tags)].sort();
}
