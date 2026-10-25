/**
 * The catalogue reads site search composes its source from (spec 045 §5.2 "`SearchSource`",
 * "`src/modules/catalog`"; TASK-401).
 *
 * Three small public functions, so `src/modules/search/source.ts` reads the catalogue through this
 * module's barrel only (plan/01 §5) and never re-reads the dataset or the copy corpus itself:
 *
 *  - `entityCopy()` is what a locale says about a product, category or occasion: the name the page
 *    shows and the authored description, through the same inheritance the listing and product
 *    pages use (`copyRow()`), so a search document and the card it renders cannot disagree;
 *  - `hasCardPhoto()` is spec 043 §2 F's "approved primary photograph" test, the same lookup the
 *    card renders from (`photoFor()`), so search's photo step and the listing's photo-first order
 *    read one answer;
 *  - `rankBandsFor()` is the margin band per product for a destination (spec 045 §2.5): **0 for
 *    every product on the static catalogue**, because no real florist prices a real bouquet yet,
 *    which keeps every order equal to today's. The database read of `product_rank_signal`, which
 *    honours `ranking.margin_preference`, is TASK-405's, behind this signature.
 *
 * None of them takes a buyer, an IP or a geo parameter (spec 005 AC-18), and none returns money.
 * `pnpm check:no-db` covers this file.
 */
import type { CountryIso2 } from "@/config/countries";
import type { LocaleCode } from "@/config/locales";

import { copyRow } from "./copy";
import { photoFor } from "./listing";
import { listProducts } from "./read";
import type { SlugKind } from "./types";

/** A margin band (spec 045 §2.5): how many configured thresholds the margin share reaches. */
export type MarginBand = 0 | 1 | 2 | 3 | 4;

export interface EntityCopy {
  readonly name: string;
  readonly description: string;
}

/** What `locale` says about one product, category or occasion, or `undefined` when nothing. */
export function entityCopy(
  kind: SlugKind,
  key: string,
  locale: LocaleCode,
): EntityCopy | undefined {
  const row = copyRow(kind, key, locale);
  return row === undefined
    ? undefined
    : { name: row.name, description: row.descriptionMd };
}

/** True when the product's card renders an approved photograph in `locale` (spec 043 §2 F). */
export function hasCardPhoto(sku: string, locale: LocaleCode): boolean {
  return photoFor(sku, locale).photo.kind === "asset";
}

/**
 * The margin band of every product the destination's shop lists. Static catalogue: all 0 (§2.5
 * "Inert until real florists price real bouquets"); TASK-405 adds the database read.
 */
export async function rankBandsFor(
  iso2: CountryIso2,
): Promise<ReadonlyMap<string, MarginBand>> {
  const products = await listProducts({ countryIso: iso2 });
  return new Map(products.map((product) => [product.sku, 0 as MarginBand]));
}
