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
 * What this barrel exports today is the money vocabulary and nothing else: the read API
 * (`getProduct`, `listProducts`, `resolvePrice`, `priceProjection`, `priceTable`, `fromPrice`,
 * `availability`, `quote`, `cacheTagsFor` — spec 005 §5.2) arrives with the tasks that own each,
 * TASK-061 … TASK-069.
 *
 * What may never be exported from here, and is asserted by `tests/unit/catalog-barrel.test.ts`
 * (AC-2):
 *
 *  - **a provider.** `CatalogueProvider` / `PriceProvider` / `FxRateProvider` and the composition
 *    root are internal (`./providers`, `./static`, later `./db`): callers ask the module for a
 *    price, never for a data source, so swapping the static seam for Postgres (TASK-070) touches
 *    no file outside this directory.
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
