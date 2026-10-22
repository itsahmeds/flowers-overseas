/**
 * `dbPriceProvider`: `country_price` and `addon_country_price` read from Postgres behind the
 * unchanged `PriceProvider` (spec 005 §2, §5.2 `db/`, §5.4, AC-27, AC-28; TASK-070).
 *
 * A provider resolves nothing (`../providers.ts`): each read hands over the **whole** history,
 * active and superseded rows and the dated surcharge rows, exactly as the static provider does, and
 * `pricing/*` picks the one active row, adds the date's surcharges and splits the VAT. That is what
 * keeps the static and the database price of a product one integer: the arithmetic is shared, and
 * only the source differs.
 *
 * Each read is **one** statement over its table, joined to the natural keys the dataset uses (SKU,
 * ISO 3166 code, add-on key), and kept in the request's read scope (`./read.ts`), so a page that
 * prices every tier of every card on it issues one `country_price` query (AC-28).
 *
 * Money arrives as `bigint` minor units beside its currency (spec 002 AC-5) and leaves as the
 * integer `MinorUnitsSchema` carries; a value a number cannot hold exactly throws (`safeInteger`).
 * Every row is parsed under the dataset's own strict schema, so a `retail_minor` of 0 on a
 * `country_price` row, a negative add-on price, a VAT rate outside 0–10 000 bp or a reversed date
 * range is refused here even if a database check were ever dropped.
 */
import { asc, eq } from "drizzle-orm";

import {
  AddonCountryPriceDataSchema,
  CountryPriceDataSchema,
} from "@/config/catalogue/schemas";
import type { DbTransaction } from "@/lib/db";

import {
  addon,
  addonCountryPrice,
  countryPrice,
  product,
} from "../../../../db/schema/catalog";
import { country } from "../../../../db/schema/geo";
import type {
  AddonCountryPriceRecord,
  CountryPriceRecord,
  PriceProvider,
} from "../providers";

import { type CatalogDbOptions, safeInteger, scopedRead } from "./read";

/** Every `country_price` row, active and superseded, with its SKU and destination ISO code. */
async function countryPriceRows(
  db: DbTransaction,
): Promise<readonly CountryPriceRecord[]> {
  const rows = await db
    .select({
      sku: product.sku,
      countryIso2: country.iso2,
      tierKey: countryPrice.tierKey,
      retailMinor: countryPrice.retailMinor,
      currency: countryPrice.currencyCode,
      vatRateBp: countryPrice.vatRateBp,
      surchargeKind: countryPrice.surchargeKind,
      activeFrom: countryPrice.activeFrom,
      activeTo: countryPrice.activeTo,
    })
    .from(countryPrice)
    .innerJoin(product, eq(product.id, countryPrice.productId))
    .innerJoin(country, eq(country.id, countryPrice.countryId))
    .orderBy(
      asc(product.sku),
      asc(country.iso2),
      asc(countryPrice.tierKey),
      asc(countryPrice.surchargeKind),
      asc(countryPrice.activeFrom),
    );

  return rows.map((row) =>
    CountryPriceDataSchema.parse({
      ...row,
      retailMinor: safeInteger(row.retailMinor, "country_price.retail_minor"),
    }),
  );
}

/** Every `addon_country_price` row, with its add-on key and destination ISO code. */
async function addonCountryPriceRows(
  db: DbTransaction,
): Promise<readonly AddonCountryPriceRecord[]> {
  const rows = await db
    .select({
      addonKey: addon.key,
      countryIso2: country.iso2,
      retailMinor: addonCountryPrice.retailMinor,
      currency: addonCountryPrice.currencyCode,
      vatRateBp: addonCountryPrice.vatRateBp,
      activeFrom: addonCountryPrice.activeFrom,
      activeTo: addonCountryPrice.activeTo,
    })
    .from(addonCountryPrice)
    .innerJoin(addon, eq(addon.id, addonCountryPrice.addonId))
    .innerJoin(country, eq(country.id, addonCountryPrice.countryId))
    .orderBy(
      asc(addon.key),
      asc(country.iso2),
      asc(addonCountryPrice.activeFrom),
    );

  return rows.map((row) =>
    AddonCountryPriceDataSchema.parse({
      ...row,
      retailMinor: safeInteger(
        row.retailMinor,
        "addon_country_price.retail_minor",
      ),
    }),
  );
}

/** The provider over `options` (the public context and the request's read scope in production). */
export function createDbPriceProvider(
  options: CatalogDbOptions,
): PriceProvider {
  return {
    countryPrices: () =>
      scopedRead(options, "price.countryPrices", countryPriceRows),
    addonCountryPrices: () =>
      scopedRead(options, "price.addonCountryPrices", addonCountryPriceRows),
  };
}
