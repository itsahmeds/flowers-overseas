/**
 * `dbFxRateProvider`: `fx_rate` rows read from Postgres behind the unchanged `FxRateProvider`
 * (spec 005 §2 "FX and rounding", §5.2 `db/`, AC-27; TASK-070).
 *
 * Every row, every `as_of`: choosing the newest rate and failing **closed** once it is stale is
 * `pricing/fx.ts`'s (AC-15, AC-35), never a provider's, so an empty or stale table converts
 * nothing and every page quotes in the destination's own currency. That is also why this provider
 * is safe to select before `fx.refresh` (TASK-071) has written a row, and why it should not be:
 * until then the table is empty and no display currency converts (spec 005 §14 A7 "Exit").
 *
 * `rate_ppm` is a `bigint` of parts per million (spec 002 §7) and leaves as the integer
 * `FxRateDataSchema` carries; the row is parsed under that strict schema, so a zero or negative
 * rate, or a rate from a currency to itself, is refused here.
 */
import { asc } from "drizzle-orm";

import { FxRateDataSchema } from "@/config/catalogue/schemas";
import type { DbTransaction } from "@/lib/db";

import { fxRate } from "../../../../db/schema/geo";
import type { FxRateProvider, FxRateRecord } from "../providers";

import { type CatalogDbOptions, safeInteger, scopedRead } from "./read";

/** Every `fx_rate` row, by base, quote and date. */
async function fxRateRows(db: DbTransaction): Promise<readonly FxRateRecord[]> {
  const rows = await db
    .select({
      base: fxRate.baseCode,
      quote: fxRate.quoteCode,
      ratePpm: fxRate.ratePpm,
      asOf: fxRate.asOf,
      source: fxRate.source,
    })
    .from(fxRate)
    .orderBy(asc(fxRate.baseCode), asc(fxRate.quoteCode), asc(fxRate.asOf));

  return rows.map((row) =>
    FxRateDataSchema.parse({
      ...row,
      ratePpm: safeInteger(row.ratePpm, "fx_rate.rate_ppm"),
    }),
  );
}

/** The provider over `options` (the public context and the request's read scope in production). */
export function createDbFxRateProvider(
  options: CatalogDbOptions,
): FxRateProvider {
  return {
    fxRates: () => scopedRead(options, "fx.fxRates", fxRateRows),
  };
}
