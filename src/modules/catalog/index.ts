/** Public barrel for `catalog` (products, categories, occasions, pricing, translations). Owned by: spec 005. */

/**
 * The only import path into the catalogue and pricing module (spec 005 §2, §5.2; TASK-060).
 *
 * Pricing lives **inside** this module as `pricing/*`, because `plan/01` §5 assigns "products,
 * categories, occasions, **pricing**, translations" to one module: there is no `pricing` module
 * and no new module boundary. The directory is `catalog` (US spelling — `plan/01` §5,
 * `docs/architecture.md` §3, the `MODULES` manifest of `scripts/check-layout.ts` and spec 001
 * AC-9's lint fixtures all use it); British spelling stays in prose and in the *dataset* path
 * `src/config/catalogue/`, which is config and not a module (spec 005 §5.2's ruling).
 *
 * What this barrel exports today is the money vocabulary plus the **taxonomy read API**
 * (TASK-063): `getProduct`, `listProducts`, `getCategory`, `getOccasion`, `resolveFacets`,
 * `isAuthoredFacetPath`, `countProductsIn`, `countProductsFor`, `hasIndexableProducts` and
 * `topProductsForPrebuild`.
 *
 * TASK-064 adds the **tier and add-on read API**: `listTiers`, `defaultTier` and `listAddons`,
 * with `Tier`, `Addon`, `ProductTierSchema` and `AddonSchema`. The rest of spec 005 §5.2's
 * surface — `resolvePrice`, `priceProjection`, `priceTable`, `fromPrice`, `availability`,
 * `isProductIndexable`, `quote`, `cacheTagsFor` — arrives with the tasks that own each,
 * TASK-065 … TASK-069.
 *
 * What TASK-064 deliberately does **not** export: `isFlagEnabled`. The flag seam of spec 005 §12
 * is internal (`./flags`, `./static`), because callers ask this module for the add-ons they may
 * offer and never for the state of a flag — which is what lets spec 002's `feature_flag` table
 * take the authority over with no caller change.
 *
 * What may never be exported from here, and is asserted by `tests/unit/catalog-barrel.test.ts`
 * (AC-2):
 *
 *  - **a provider.** `CatalogueProvider` / `PriceProvider` / `FxRateProvider` / `FlagProvider`
 *    and the composition root are internal (`./providers`, `./static`, later `./db`): callers ask the module for a
 *    price, never for a data source, so swapping the static seam for Postgres (TASK-070) touches
 *    no file outside this directory. From TASK-063 the barrel's *import graph* necessarily reaches
 *    the composition root — a read function has to read something — so what the test pins is the
 *    **export list** AC-2 actually names (no provider object, no dataset array, no database
 *    symbol) plus the rule that only `./static/index.ts` may import a `*.data.ts` file.
 *  - **a dataset path.** `src/config/catalogue/*.data.ts` is read by the static provider only.
 *  - **a database symbol.** No `drizzle`, `postgres`, `pg` or `@/lib/db` import exists anywhere in
 *    the module, and `pnpm check:no-db` covers `src/modules/catalog/**` (and `src/config/**`,
 *    which contains the dataset directory).
 *
 * There is also **no client JavaScript** here: no file in the module carries `"use client"` and no
 * client component may import it, so this module adds zero bytes to any client chunk (AC-3 —
 * spec 004 §14 A1's 131 072 B Brotli budget has 1 434 B of headroom).
 */

// Money types and their schemas (AC-8). `Money` itself and `formatMoney` stay spec 003's: this
// module reuses `MoneySchema` from `@/modules/i18n` and defines no second money type and no
// second formatter.
export type { IsoDate, PricePoint, Surcharge, SurchargeKind } from "./types";
export { surchargeKinds } from "./types";
export {
  BasisPointsSchema,
  IsoDateSchema,
  MessageKeySchema,
  MinorUnitsSchema,
  PricePointSchema,
  SurchargeSchema,
} from "./schemas";

// The taxonomy read API (spec 005 §2 "Taxonomy", §5.4, §6; TASK-063). Counts, never verdicts:
// the six-product threshold of `plan/02` §6 is spec 008's loader's and appears nowhere here.
export type {
  Category,
  FacetResolution,
  FacetSelection,
  Occasion,
  Product,
  ProductIndexability,
} from "./types";
export { FacetSelectionSchema, ListProductsQuerySchema } from "./schemas";
export {
  countProductsFor,
  countProductsIn,
  getCategory,
  getOccasion,
  getProduct,
  hasIndexableProducts,
  isAuthoredFacetPath,
  listProducts,
  resolveFacets,
  topProductsForPrebuild,
} from "./read";

// The tier and add-on read API (spec 005 §2 "Tiers and add-ons", §12, AC-19; TASK-064). `Addon`
// has no `defaultSelected`/`preselected` field and `AddonSchema` is `.strict()`, so a pre-ticked
// extra is unrepresentable rather than forbidden by review (CRD Art. 22, `plan/07` §2.1); every
// add-on carries its **own** `vatRateBp` for the destination (PL chocolates 2 300 vs flowers 800).
export type { Addon, Tier } from "./types";
export {
  AddonSchema,
  FORBIDDEN_ADDON_FIELDS,
  ProductTierSchema,
} from "./schemas";
export { defaultTier, listAddons, listTiers } from "./read";
