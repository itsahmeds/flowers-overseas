/**
 * `TrendingProvider` — the seam the "Most sent this week" row reads (spec 004 §13's 2026-09-08
 * resolution note, §5.1 "everything data-gated is config"; TASK-054).
 *
 * The shape is spec 003's locale registry, deliberately (`src/modules/i18n/registry.ts`): one
 * interface, one Phase 0 implementation, one accessor.
 *
 *  - `TrendingProvider` is what the row asks for its cards.
 *  - `staticTrendingProvider` answers from `src/config/trending.ts` — no database, no I/O, no
 *    async (`pnpm check:no-db`, spec 004 AC-2) — and its `basis()` is **`picks`**, because
 *    nothing has been ordered yet and a row that implied otherwise is exactly what `plan/09`
 *    Phase 0 AC 6 forbids.
 *  - `getTrendingProvider()` is the composition root: spec 008/016 replaces the provider *inside
 *    this module* with one backed by real orders in the last seven days, `basis()` starts
 *    answering `orders`, the honesty label stops rendering, and **no call site changes**.
 *
 * `withTrendingProvider()` is the injection hook the seam test uses and is deliberately **not**
 * exported from `../index.ts`, for the reason spec 003 records: a caller that could swap the
 * provider at runtime would turn the seam into global mutable configuration. The gallery reaches
 * the populated state through `TrendingRow`'s optional `provider` prop instead, which mutates
 * nothing inside a request — the precedent `MediaAsset`'s `manifest` prop set (spec 006 §5.3).
 */
import { productBySku } from "../../../config/catalogue/products.data.ts";
import { TRENDING_PICKS } from "../../../config/trending.ts";

/**
 * One card. A **name and an id, and nothing else**: spec 004 §3 ships nothing that knows what a
 * product is, so there is no price, no currency, no facet, no image reference and no href on this
 * type — and therefore no way for the row to grow one without a spec that owns it.
 */
export interface TrendingPick {
  readonly id: string;
  /** Content, not a message key: product names travel untranslated (spec 005 §7's glossary). */
  readonly name: string;
}

/**
 * Why the row is showing what it is showing. `picks` means "our florists' picks, and we say so";
 * `orders` means the ranking is real and the label is no longer true and must not render.
 */
export const TRENDING_BASES = ["picks", "orders"] as const;
export type TrendingBasis = (typeof TRENDING_BASES)[number];

export interface TrendingProvider {
  basis(): TrendingBasis;
  list(): readonly TrendingPick[];
}

/** The Phase 0 provider: five SKUs from `src/config/trending.ts`, named by the catalogue. */
export const staticTrendingProvider: TrendingProvider = (() => {
  const picks: readonly TrendingPick[] = TRENDING_PICKS.map((pick) => ({
    id: pick.id,
    name: productBySku(pick.sku).name,
  }));
  return {
    basis: () => "picks",
    list: () => picks,
  };
})();

let active: TrendingProvider = staticTrendingProvider;

/** The provider the row reads. Callers outside this module never see the object. */
export function getTrendingProvider(): TrendingProvider {
  return active;
}

/**
 * Run `body` with `provider` in place of the active one, then restore. Module-internal: imported
 * by `src/modules/ui/home/**` and by the seam test only (see the header).
 */
export async function withTrendingProvider<T>(
  provider: TrendingProvider,
  body: () => T | Promise<T>,
): Promise<T> {
  const previous = active;
  active = provider;
  try {
    return await body();
  } finally {
    active = previous;
  }
}

/** Build a provider from an arbitrary pick list — the shape the fake and spec 008 share. */
export function trendingProviderOf(
  picks: readonly TrendingPick[],
  basis: TrendingBasis = "picks",
): TrendingProvider {
  return {
    basis: () => basis,
    list: () => picks,
  };
}

/** The provider that answers with nothing: the row renders no section at all. */
export const emptyTrendingProvider: TrendingProvider = trendingProviderOf([]);
