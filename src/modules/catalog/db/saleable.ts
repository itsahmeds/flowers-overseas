/**
 * `dbSaleabilityProvider`: what a real florist can make and deliver, read from the `saleable_offer`
 * view (spec 012b §2.5 "A bouquet is saleable only if a real florist can make it", advisor F3,
 * §5.2 `isSaleable`, AC-39; migration `0044_catalogue_cms`; TASK-294).
 *
 * The view lists ids only and runs with its owner's rights, so the public roles (`app_web` in the
 * public context, `app_build` during a build) read it without reading any partner table. One read
 * per request, through the request's scope like every other provider read here, joined to the SKU
 * and the ISO code the module speaks.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import type { DbTransaction } from "@/lib/db";

import type { SaleabilityProvider, SaleableOfferRecord } from "../providers";

import { type CatalogDbOptions, scopedRead } from "./read";

/** The one query: every offered (SKU, tier, destination). */
export const SALEABLE_OFFER_QUERY = sql`
  SELECT p.sku, s.tier_key, c.iso2
  FROM public.saleable_offer s
  JOIN public.product p ON p.id = s.product_id
  JOIN public.country c ON c.id = s.country_id
  ORDER BY p.sku, s.tier_key, c.iso2`;

/** One row of the query, validated at the boundary. */
export const SaleableOfferRowSchema = z
  .object({
    sku: z.string().min(1),
    tier_key: z.string().min(1).nullable(),
    iso2: z.string().regex(/^[A-Z]{2}$/u),
  })
  .strict();

async function saleableOfferRows(
  db: DbTransaction,
): Promise<readonly SaleableOfferRecord[]> {
  const rows = await db.execute(SALEABLE_OFFER_QUERY);
  return [...rows].map((row) => {
    const parsed = SaleableOfferRowSchema.parse(row);
    return {
      sku: parsed.sku,
      tierKey: parsed.tier_key,
      countryIso2: parsed.iso2,
    };
  });
}

/** The provider over one set of options (a test passes its own runner and scope). */
export function createDbSaleabilityProvider(
  options: CatalogDbOptions,
): SaleabilityProvider {
  return {
    saleableOffers: () =>
      scopedRead(options, "saleable_offer", saleableOfferRows),
  };
}
