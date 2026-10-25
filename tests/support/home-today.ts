/**
 * The v3 home's two oracles with today's data (spec 004 AC-92, AC-95: "with today's data"), for
 * the browser suite, which cannot import the catalogue (it reaches `next/font` through the UI
 * module). `tests/unit/catalog-home.test.ts` pins both lists to `coreRange()` and
 * `shopCountries()` for `en` and `en-gb`, so a data edit turns that unit case red and points here.
 */

/** `coreRange("en")`, in rank order. */
export const CORE_RANGE_TODAY = [
  "FO-BQ-034",
  "FO-BQ-031",
  "FO-BQ-003",
  "FO-BQ-026",
  "FO-BQ-023",
  "FO-BQ-002",
  "FO-BQ-001",
  "FO-BQ-015",
  "FO-PT-001",
  "FO-FN-002",
] as const;

/** `shopCountries("en")`: `sortWeight`, then the locale's collation. */
export const SHOP_COUNTRIES_TODAY = [
  "FR",
  "DE",
  "IT",
  "NL",
  "PL",
  "RO",
  "ES",
] as const;
