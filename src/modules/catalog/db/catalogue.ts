/**
 * `dbCatalogueProvider`: products and tiers read from Postgres behind the unchanged
 * `CatalogueProvider` (spec 005 §2 "The no-database seam", §5.2 `db/`, AC-27; spec 012b §2.2;
 * TASK-070).
 *
 * **What the database owns, and what stays in the repository.** Spec 012b §2.2 makes the database
 * the only runtime source of "products, tiers, facets" and keeps "add-on and category and occasion
 * definitions" in the repository. So `products()` and `tiers()` are one query each, and
 * `categories()`, `occasions()` and `addons()` answer from the repository's definitions exactly as
 * the static provider does: their tables carry the keys that rows reference and none of the
 * `sort`, label key, flag prefix or `partnerOnly` a definition is made of.
 *
 * A product row is rebuilt into the dataset's own record (`ProductDataSchema`, strict) from:
 * `product` (the primary flower and colour, and from `0020_product_facets` the others after them
 * and the allergen attribute), its `en` `product_translation` (name and slug, `CATALOGUE_LOCALE`),
 * and its `product_occasion` edges in their authored `sort`. One statement, with the occasion set
 * aggregated in a correlated subquery, so a read is one round trip whatever the catalogue's size.
 *
 * Every row is parsed under the dataset's schema at this boundary (`CLAUDE.md`: zod at every
 * boundary). A row that does not parse throws, and the whole read with it: a product without its
 * `en` name, or with a facet value outside the closed taxonomy, is a data error to fix, never a
 * product to show half-described.
 */
import { asc, and, eq, sql } from "drizzle-orm";

import type { DbTransaction } from "@/lib/db";
import {
  CATALOGUE_LOCALE,
  ProductDataSchema,
  ProductTierDataSchema,
  SkuSchema,
} from "@/config/catalogue/schemas";

import {
  product,
  productTier,
  productTranslation,
} from "../../../../db/schema/catalog";
import type {
  CatalogueProvider,
  ProductRecord,
  ProductTierRecord,
} from "../providers";
import { staticCatalogueProvider } from "../static";

import { type CatalogDbOptions, scopedRead } from "./read";

/** The product rows, in SKU order; `occasions` aggregated from the edge table by its `sort`. */
async function productRows(
  db: DbTransaction,
): Promise<readonly ProductRecord[]> {
  const rows = await db
    .select({
      sku: product.sku,
      name: productTranslation.name,
      slug: productTranslation.slug,
      productType: product.productType,
      primaryFlower: product.primaryFlower,
      otherFlowers: product.otherFlowers,
      colourPrimary: product.colourPrimary,
      otherColours: product.otherColours,
      style: product.style,
      priceTier: product.priceTier,
      occasions: sql<string[]>`coalesce((
        select array_agg(o.key order by po.sort, o.key)
        from public.product_occasion po
        join public.occasion o on o.id = po.occasion_id
        where po.product_id = ${product.id}
      ), '{}'::text[])`,
      substitutionClass: product.substitutionClass,
      vaseIncluded: product.vaseIncluded,
      stemCount: product.stemCount,
      freshnessDays: product.freshnessDays,
      allergenNote: product.allergenNote,
      partnerOnly: product.partnerOnly,
      status: product.status,
    })
    .from(product)
    .leftJoin(
      productTranslation,
      and(
        eq(productTranslation.productId, product.id),
        eq(productTranslation.localeCode, CATALOGUE_LOCALE),
      ),
    )
    .orderBy(asc(product.sku));

  return rows.map(({ otherFlowers, otherColours, ...row }) =>
    ProductDataSchema.parse({
      sku: row.sku,
      name: row.name,
      slug: row.slug,
      productType: row.productType,
      primaryFlower: row.primaryFlower,
      flowerTypes: [row.primaryFlower, ...otherFlowers],
      colourPrimary: row.colourPrimary,
      colours: [row.colourPrimary, ...otherColours],
      style: row.style,
      priceTier: row.priceTier,
      occasions: row.occasions,
      substitutionClass: row.substitutionClass,
      vaseIncluded: row.vaseIncluded,
      stemCount: row.stemCount,
      freshnessDays: row.freshnessDays,
      allergenNote: row.allergenNote,
      partnerOnly: row.partnerOnly,
      status: row.status,
    }),
  );
}

/** The tier rows, by SKU then authored `sort`. */
async function tierRows(
  db: DbTransaction,
): Promise<readonly ProductTierRecord[]> {
  const rows = await db
    .select({
      sku: product.sku,
      tierKey: productTier.tierKey,
      labelKey: productTier.labelKey,
      stems: productTier.stems,
      sort: productTier.sort,
      isDefault: productTier.isDefault,
    })
    .from(productTier)
    .innerJoin(product, eq(product.id, productTier.productId))
    .orderBy(asc(product.sku), asc(productTier.sort));

  return rows.map(({ sku, ...tier }) => ({
    sku: SkuSchema.parse(sku),
    ...ProductTierDataSchema.parse(tier),
  }));
}

/** The provider over `options` (the public context and the request's read scope in production). */
export function createDbCatalogueProvider(
  options: CatalogDbOptions,
): CatalogueProvider {
  return {
    products: () => scopedRead(options, "catalogue.products", productRows),
    tiers: () => scopedRead(options, "catalogue.tiers", tierRows),
    // Definitions stay in the repository (spec 012b §2.2): the same frozen rows the static
    // provider hands out, so the two providers cannot disagree about a hub, an occasion or an add-on.
    categories: () => staticCatalogueProvider.categories(),
    occasions: () => staticCatalogueProvider.occasions(),
    addons: () => staticCatalogueProvider.addons(),
  };
}
