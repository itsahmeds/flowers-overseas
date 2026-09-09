/**
 * T-04's price half (spec 005 AC-6) and the price side of AC-7, TASK-062.
 *
 * `src/config/catalogue/prices.data.ts` is the only place a Phase 0 amount is authored, so the
 * facts asserted here are the ones a wrong price would break first: the `plan/10` §2.3 bands
 * transcribed correctly, the psychological endings of spec 005 §13 Q1, every tier of every product
 * priced in every destination exactly once, the surcharges as **dated rows** rather than a
 * multiplier, add-ons carrying their own VAT rate, and the three projections' key sets pinned
 * against a transcribed copy of spec 002 §5.1 (`catalogue-projections.test.ts` pins all nine;
 * these three are the rows this task authors, projected from a *real* row rather than a stub).
 *
 * Nothing here computes a price: `resolvePrice`, `convert`, `roundToStyle` and `vatBreakdown` are
 * TASK-065…TASK-067's, and their tests are theirs.
 */
import { describe, expect, it } from "vitest";

import { COUNTRIES } from "../../src/config/countries.ts";
import { currencyConfig } from "../../src/config/currencies.ts";
import { ADDONS } from "../../src/config/catalogue/addons.data.ts";
import {
  ADDON_COUNTRY_PRICES,
  COUNTRY_PRICES,
  DESTINATION_PRICING,
  PEAK_DAYS,
  PRICED_DESTINATIONS,
  PRICE_ACTIVE_FROM,
  SURCHARGE_LABEL_KEYS,
  countryPricesFor,
  destinationPricingFor,
  priceBandFor,
} from "../../src/config/catalogue/prices.data.ts";
import { PRODUCTS } from "../../src/config/catalogue/products.data.ts";
import {
  ADDON_COUNTRY_PRICE_ROW_COLUMNS,
  COUNTRY_PRICE_ROW_COLUMNS,
  toAddonCountryPriceRow,
  toCountryPriceRow,
} from "../../src/config/catalogue/projections.ts";
import {
  AddonCountryPriceDataSchema,
  CountryPriceDataSchema,
  type PriceBandKey,
  endsInRoundingStyle,
  priceBandKeyFor,
  priceBandKeys,
} from "../../src/config/catalogue/schemas.ts";
import { PRODUCT_TIERS } from "../../src/config/catalogue/tiers.data.ts";

/** `plan/10` §2.3's own table, transcribed in major units: [floor, ceiling] per band per column. */
const PLAN_10_BANDS = {
  EUR_BASE: {
    essential: [35, 45],
    classic: [46, 60],
    premium: [61, 80],
    luxury: [81, 120],
    funeral: [60, 180],
  },
  DE: {
    essential: [39, 49],
    classic: [50, 65],
    premium: [66, 89],
    luxury: [90, 130],
  },
  PL: {
    essential: [149, 189],
    classic: [199, 259],
    premium: [269, 349],
    luxury: [359, 529],
    funeral: [259, 799],
  },
  RO: {
    essential: [175, 225],
    classic: [230, 300],
    premium: [305, 400],
    luxury: [405, 600],
    // `plan/10` §2.3 gives no RON funeral figure; the RON column's own ×5 factor against the EUR
    // base (175/35, 230/46, 305/61, 405/81) applied to 60–180 EUR is 300–900 lei.
    funeral: [300, 900],
  },
} as const;

/** Which `PLAN_10_BANDS` column a destination is priced from. */
const PLAN_10_COLUMN: Readonly<Record<string, keyof typeof PLAN_10_BANDS>> = {
  PL: "PL",
  DE: "DE",
  RO: "RO",
  FR: "EUR_BASE",
  ES: "EUR_BASE",
  IT: "EUR_BASE",
  NL: "EUR_BASE",
};

/**
 * The band `plan/10` §2.3 puts one product's price in, read off the transcription above rather
 * than off `prices.data.ts` — an independent predicate, so a band widened in the dataset to make
 * a ladder fit is a failing test and not a green one (spec 005 §14 A1).
 *
 * A funeral piece is bounded by the funeral row of the same column (the four authored sub-bands
 * live inside it); everything else by its `price_tier` row. `DE` and `RO` have no funeral column
 * of their own, so they take the EUR base row and the ×5 reading of it respectively.
 */
function plan10BandFor(
  product: { readonly productType: string; readonly priceTier: string },
  iso2: string,
): readonly [number, number] {
  const column = PLAN_10_COLUMN[iso2];
  if (column === undefined) throw new Error(`no plan/10 column for ${iso2}`);
  const table: Record<string, readonly number[]> = PLAN_10_BANDS[column];
  const row =
    product.productType === "funeral"
      ? (table.funeral ?? PLAN_10_BANDS.EUR_BASE.funeral)
      : table[product.priceTier];
  if (row === undefined) {
    throw new Error(`no plan/10 band for ${iso2} ${product.priceTier}`);
  }
  return [row[0] ?? 0, row[1] ?? 0];
}

const active = COUNTRY_PRICES.filter((row) => row.activeTo === null);
const retail = active.filter((row) => row.surchargeKind === null);

describe("the authored price dataset (AC-6 / T-04's price half)", () => {
  it("prices exactly the `live` and `demo` destinations of src/config/countries.ts", () => {
    const destinations = COUNTRIES.filter(
      (country) => country.status === "live" || country.status === "demo",
    ).map((country) => country.iso2);

    expect([...PRICED_DESTINATIONS]).toEqual(destinations);
    expect(DESTINATION_PRICING.map((one) => one.countryIso2)).toEqual(
      destinations,
    );
    // `plan/10` §2.1 lists eight seeded countries including the UK; spec 004's registry carries
    // seven destinations, because the UK is the first *buyer* market (ADR-0002) and not a place
    // we deliver to. A price row for a country that cannot be chosen would price nothing.
    expect(PRICED_DESTINATIONS).not.toContain("GB");
    expect(PRICED_DESTINATIONS).toHaveLength(7);
  });

  it("prices every tier of every product in every destination, exactly once and open-ended", () => {
    const seen = new Set(
      retail.map(
        (row) => `${row.sku}|${row.countryIso2}|${row.tierKey ?? "-"}`,
      ),
    );

    expect(retail).toHaveLength(
      PRODUCT_TIERS.length * PRICED_DESTINATIONS.length,
    );
    expect(seen.size).toBe(retail.length);
    for (const tier of PRODUCT_TIERS) {
      for (const iso2 of PRICED_DESTINATIONS) {
        expect(
          seen.has(`${tier.sku}|${iso2}|${tier.tierKey}`),
          `${tier.sku} ${tier.tierKey} ${iso2}`,
        ).toBe(true);
      }
    }
  });

  it("parses every row under CountryPriceDataSchema with an integer amount", () => {
    for (const row of COUNTRY_PRICES) {
      expect(CountryPriceDataSchema.parse(row)).toEqual(row);
      expect(Number.isInteger(row.retailMinor), row.sku).toBe(true);
      expect(row.retailMinor).toBeGreaterThan(0);
      expect(row.activeFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("keeps every retail amount on its currency's psychological ending (§13 Q1)", () => {
    for (const row of retail) {
      expect(
        endsInRoundingStyle(row.retailMinor, row.currency),
        `${row.sku} ${row.tierKey ?? "-"} ${row.countryIso2} ${String(row.retailMinor)} (${currencyConfig(row.currency).roundingStyle})`,
      ).toBe(true);
    }
    // The two endings that decide the whole dataset: PLN is whole złoty ending in nine, EUR is
    // `x.90`. If `src/config/currencies.ts` ever moves back, every PL row here fails.
    expect(endsInRoundingStyle(14_900, "PLN")).toBe(true);
    expect(endsInRoundingStyle(14_990, "PLN")).toBe(false);
    expect(endsInRoundingStyle(3590, "EUR")).toBe(true);
    expect(endsInRoundingStyle(3500, "EUR")).toBe(false);
    // HUF has no minor part, so its `x90` is a `990 Ft` ending (§13 Q1's carry-forward).
    expect(endsInRoundingStyle(990, "HUF")).toBe(true);
    expect(endsInRoundingStyle(999, "HUF")).toBe(false);
  });

  it("transcribes plan/10 §2.3's bands, including the funeral row's four sub-bands", () => {
    const major = (minor: number): number => minor / 100;
    const check = (
      iso2: string,
      bandKey: PriceBandKey,
      expected: readonly [number, number],
    ): void => {
      const band = priceBandFor(iso2, bandKey);
      expect(
        [major(band.fromMinor), major(band.toMinor)],
        `${iso2} ${bandKey}`,
      ).toEqual([expected[0], expected[1]]);
    };

    for (const iso2 of ["FR", "ES", "IT", "NL"]) {
      check(iso2, "essential", PLAN_10_BANDS.EUR_BASE.essential);
      check(iso2, "classic", PLAN_10_BANDS.EUR_BASE.classic);
      check(iso2, "premium", PLAN_10_BANDS.EUR_BASE.premium);
      check(iso2, "luxury", PLAN_10_BANDS.EUR_BASE.luxury);
    }
    check("DE", "essential", PLAN_10_BANDS.DE.essential);
    check("DE", "classic", PLAN_10_BANDS.DE.classic);
    check("DE", "premium", PLAN_10_BANDS.DE.premium);
    check("DE", "luxury", PLAN_10_BANDS.DE.luxury);
    check("PL", "essential", PLAN_10_BANDS.PL.essential);
    check("PL", "classic", PLAN_10_BANDS.PL.classic);
    check("PL", "premium", PLAN_10_BANDS.PL.premium);
    check("PL", "luxury", PLAN_10_BANDS.PL.luxury);
    check("RO", "essential", PLAN_10_BANDS.RO.essential);
    check("RO", "classic", PLAN_10_BANDS.RO.classic);
    check("RO", "premium", PLAN_10_BANDS.RO.premium);
    check("RO", "luxury", PLAN_10_BANDS.RO.luxury);

    // The funeral row is one band in `plan/10` §2.3 and four contiguous sub-bands here: no
    // sub-band may leave the row's own bounds, and together they must cover it without a gap.
    for (const [iso2, row] of [
      ["FR", PLAN_10_BANDS.EUR_BASE.funeral],
      ["DE", PLAN_10_BANDS.EUR_BASE.funeral],
      ["PL", PLAN_10_BANDS.PL.funeral],
      ["RO", PLAN_10_BANDS.RO.funeral],
    ] as const) {
      const subBands = priceBandKeys
        .filter((key) => key.startsWith("funeral_"))
        .map((key) => priceBandFor(iso2, key));
      expect(major(subBands[0]?.fromMinor ?? 0), iso2).toBe(row[0]);
      expect(major(subBands[3]?.toMinor ?? 0), iso2).toBe(row[1]);
      for (const [index, band] of subBands.entries()) {
        const previous = subBands[index - 1];
        if (previous !== undefined) {
          expect(
            band.fromMinor,
            `${iso2} sub-band ${String(index)}`,
          ).toBeGreaterThan(previous.toMinor);
        }
      }
    }
  });

  it("prices *every* tier inside its band, in every currency (spec 005 §14 A1)", () => {
    const bandKeyOf = new Map(
      PRODUCTS.map((product) => [product.sku, priceBandKeyFor(product)]),
    );

    const outside = retail.filter((row) => {
      const bandKey = bandKeyOf.get(row.sku);
      if (bandKey === undefined) return true;
      const band = priceBandFor(row.countryIso2, bandKey);
      return row.retailMinor < band.fromMinor || row.retailMinor > band.toMinor;
    });

    // The band is the founder's stated range and holds exactly; the "~+30% / +60%" steps are a
    // tilde and bend to fit it. Not one row of 1 652 may sit outside.
    expect(
      outside.map(
        (row) =>
          `${row.sku} ${row.tierKey ?? "-"} ${row.countryIso2} ${String(row.retailMinor)}`,
      ),
    ).toEqual([]);
  });

  it("keeps every retail row inside plan/10 §2.3's own printed band, transcribed here", () => {
    // Independent of `prices.data.ts`: the bounds come from `PLAN_10_BANDS` above, so widening a
    // band in the dataset to make a ladder fit fails here rather than passing there.
    const productBySku = new Map(
      PRODUCTS.map((product) => [product.sku, product]),
    );

    const outside = retail.filter((row) => {
      const product = productBySku.get(row.sku);
      if (product === undefined) return true;
      const [fromMajor, toMajor] = plan10BandFor(product, row.countryIso2);
      return (
        row.retailMinor < fromMajor * 100 || row.retailMinor > toMajor * 100
      );
    });

    expect(
      outside.map(
        (row) =>
          `${row.sku} ${row.tierKey ?? "-"} ${row.countryIso2} ${String(row.retailMinor)}`,
      ),
    ).toEqual([]);
    // The two ceilings the ruling names, spelled out: a funeral piece is never quoted above
    // 799 zł on the one `live` destination, nor above EUR 180 anywhere else.
    const funeralPl = retail.filter(
      (row) =>
        row.countryIso2 === "PL" &&
        productBySku.get(row.sku)?.productType === "funeral",
    );
    expect(funeralPl.length).toBeGreaterThan(0);
    expect(
      Math.max(...funeralPl.map((row) => row.retailMinor)),
    ).toBeLessThanOrEqual(79_900);
    const funeralEur = retail.filter(
      (row) =>
        row.currency === "EUR" &&
        productBySku.get(row.sku)?.productType === "funeral",
    );
    expect(
      Math.max(...funeralEur.map((row) => row.retailMinor)),
    ).toBeLessThanOrEqual(18_000);
  });

  it("steps each authored ladder upward inside its band, as near +30/+60 as it allows", () => {
    for (const iso2 of PRICED_DESTINATIONS) {
      for (const bandKey of priceBandKeys) {
        const band = priceBandFor(iso2, bandKey);
        const ladder = destinationPricingFor(iso2).ladders[bandKey];
        expect(ladder, `${iso2} ${bandKey}`).toBeDefined();
        if (ladder === undefined) continue;

        expect(ladder).toHaveLength(3);
        for (const [index, step] of ladder.entries()) {
          expect(
            step,
            `${iso2} ${bandKey} ${String(index)}`,
          ).toBeGreaterThanOrEqual(band.fromMinor);
          expect(
            step,
            `${iso2} ${bandKey} ${String(index)}`,
          ).toBeLessThanOrEqual(band.toMinor);
          expect(
            endsInRoundingStyle(step, destinationPricingFor(iso2).currency),
          ).toBe(true);
          const previous = ladder[index - 1];
          if (previous !== undefined) {
            expect(step, `${iso2} ${bandKey} ${String(index)}`).toBeGreaterThan(
              previous,
            );
          }
        }
        // The steps are a tilde: they never *exceed* +30% / +60% of the smallest, and they are
        // as close to it as a band this wide allows — the top step reaches the band's own
        // ceiling, so nothing was left on the table (spec 005 §14 A1).
        const [smallest, middle, largest] = ladder as [number, number, number];
        expect(middle / smallest, `${iso2} ${bandKey}`).toBeLessThanOrEqual(
          1.3,
        );
        expect(largest / smallest, `${iso2} ${bandKey}`).toBeLessThanOrEqual(
          1.6,
        );
        expect(band.toMinor - largest, `${iso2} ${bandKey}`).toBeLessThan(
          destinationPricingFor(iso2).currency === "PLN" ? 1000 : 100,
        );
        expect(smallest - band.fromMinor, `${iso2} ${bandKey}`).toBeLessThan(
          destinationPricingFor(iso2).currency === "PLN" ? 1000 : 100,
        );
      }
    }
  });

  it("steps every product's tiers upward with `sort` in every destination", () => {
    const sortOf = new Map(
      PRODUCT_TIERS.map((tier) => [`${tier.sku}|${tier.tierKey}`, tier.sort]),
    );

    for (const iso2 of PRICED_DESTINATIONS) {
      for (const product of PRODUCTS) {
        const ladder = retail
          .filter((row) => row.sku === product.sku && row.countryIso2 === iso2)
          .map((row) => ({
            sort: sortOf.get(`${row.sku}|${row.tierKey ?? "-"}`) ?? 0,
            minor: row.retailMinor,
          }))
          .sort((a, b) => a.sort - b.sort);
        for (const [index, step] of ladder.entries()) {
          const previous = ladder[index - 1];
          if (previous !== undefined) {
            expect(step.minor, `${product.sku} ${iso2}`).toBeGreaterThan(
              previous.minor,
            );
          }
        }
      }
    }
  });

  it("carries the destination's flower VAT rate on every retail row, PL 8% (plan/06 §4)", () => {
    for (const row of COUNTRY_PRICES) {
      const destination = destinationPricingFor(row.countryIso2);
      expect(row.vatRateBp, row.countryIso2).toBe(destination.flowersVatRateBp);
      expect(row.currency, row.countryIso2).toBe(destination.currency);
    }
    expect(destinationPricingFor("PL").flowersVatRateBp).toBe(800);
    expect(destinationPricingFor("PL").standardVatRateBp).toBe(2300);
  });
});

describe("surcharges are dated rows, never a multiplier (§13 Q7, AC-16's data half)", () => {
  const sunday = COUNTRY_PRICES.filter((row) => row.surchargeKind === "sunday");
  const peak = COUNTRY_PRICES.filter((row) => row.surchargeKind === "peak_day");

  it("has one open-ended Sunday row per (product, destination) at +EUR 4 equivalent", () => {
    expect(sunday).toHaveLength(PRODUCTS.length * PRICED_DESTINATIONS.length);
    for (const row of sunday) {
      expect(row.activeTo, `${row.sku} ${row.countryIso2}`).toBeNull();
      expect(row.tierKey).toBeNull();
      expect(row.retailMinor).toBe(
        destinationPricingFor(row.countryIso2).sundaySurchargeMinor,
      );
    }
    // `plan/10` §2.3's +EUR 4, per destination: the euro figure unchanged in the euro countries,
    // and that section's own EUR->currency parities elsewhere (balloon EUR 4 = 18 zl; the RON
    // column's x5 factor). `catalogue:check`'s `surcharge-amount` mode transcribes the same
    // table independently, so a wrong figure fails both a gate and a test.
    expect(
      PRICED_DESTINATIONS.map(
        (iso2) => destinationPricingFor(iso2).sundaySurchargeMinor,
      ),
    ).toEqual([1800, 400, 400, 400, 400, 2000, 400]);
    expect(destinationPricingFor("DE").sundaySurchargeMinor).toBe(400);
    expect(destinationPricingFor("PL").sundaySurchargeMinor).toBe(1800);
    expect(destinationPricingFor("RO").sundaySurchargeMinor).toBe(2000);
  });

  it("has one closed-window peak-day row per named day at +EUR 6 equivalent", () => {
    expect(peak).toHaveLength(
      PRODUCTS.length * PRICED_DESTINATIONS.length * PEAK_DAYS.length,
    );
    expect(PEAK_DAYS.map((day) => day.date)).toEqual([
      "2027-02-14",
      "2027-03-08",
    ]);
    for (const row of peak) {
      // A closed window is what keeps "exactly one open-ended row per key" true with two peak
      // days on the books, and what makes `dateSurcharges()` return it only for its own date.
      expect(row.activeTo, `${row.sku} ${row.countryIso2}`).not.toBeNull();
      expect(row.retailMinor).toBe(
        destinationPricingFor(row.countryIso2).peakDaySurchargeMinor,
      );
    }
    // `plan/10` §2.3's +EUR 6, per destination, on the same parities (chocolates EUR 6 = 25 zl).
    expect(
      PRICED_DESTINATIONS.map(
        (iso2) => destinationPricingFor(iso2).peakDaySurchargeMinor,
      ),
    ).toEqual([2500, 600, 600, 600, 600, 3000, 600]);
    expect(destinationPricingFor("DE").peakDaySurchargeMinor).toBe(600);
    expect(destinationPricingFor("PL").peakDaySurchargeMinor).toBe(2500);
    expect(destinationPricingFor("RO").peakDaySurchargeMinor).toBe(3000);
  });

  it("keeps the two peak windows closed, one delivery day each and non-overlapping", () => {
    // Two windows live on one delivery date would both apply, and a doubled surcharge is the
    // drip price `plan/07` §4 forbids; `catalogue:check`'s `ambiguous-price` mode gates it.
    expect(PEAK_DAYS.map((day) => [day.date, day.endsBefore])).toEqual([
      ["2027-02-14", "2027-02-15"],
      ["2027-03-08", "2027-03-09"],
    ]);
    for (const [index, day] of PEAK_DAYS.entries()) {
      const previous = PEAK_DAYS[index - 1];
      expect(day.date < day.endsBefore, day.occasionKey).toBe(true);
      if (previous !== undefined) {
        expect(day.date >= previous.endsBefore, day.occasionKey).toBe(true);
      }
    }
  });

  it("never has two open-ended rows for one (product, country, tier, surcharge)", () => {
    const counts = new Map<string, number>();
    for (const row of active) {
      const rowKey = `${row.sku}|${row.countryIso2}|${row.tierKey ?? "-"}|${row.surchargeKind ?? "-"}`;
      counts.set(rowKey, (counts.get(rowKey) ?? 0) + 1);
    }

    expect([...counts.values()].filter((count) => count > 1)).toEqual([]);
  });

  it("labels both kinds with a message key, never a label (spec 005 §7)", () => {
    expect(SURCHARGE_LABEL_KEYS).toEqual({
      sunday: "catalog.surcharge.sunday",
      peak_day: "catalog.surcharge.peakDay",
    });
  });
});

describe("add-on prices carry their own VAT rate (§13 Q3, spec 002 §14 A1 (a))", () => {
  it("prices all six add-ons in every destination, exactly once and actively", () => {
    expect(ADDON_COUNTRY_PRICES).toHaveLength(
      ADDONS.length * PRICED_DESTINATIONS.length,
    );
    for (const row of ADDON_COUNTRY_PRICES) {
      expect(AddonCountryPriceDataSchema.parse(row)).toEqual(row);
      expect(row.activeTo).toBeNull();
      expect(row.activeFrom).toBe(PRICE_ACTIVE_FROM);
      expect(Number.isInteger(row.retailMinor)).toBe(true);
    }
  });

  it("uses the standard rate, not the flower rate: PL chocolates 23% vs flowers 8%", () => {
    const chocolates = ADDON_COUNTRY_PRICES.find(
      (row) => row.addonKey === "chocolates" && row.countryIso2 === "PL",
    );

    expect(chocolates?.vatRateBp).toBe(2300);
    expect(destinationPricingFor("PL").flowersVatRateBp).toBe(800);
    for (const row of ADDON_COUNTRY_PRICES) {
      expect(row.vatRateBp, `${row.addonKey} ${row.countryIso2}`).toBe(
        destinationPricingFor(row.countryIso2).standardVatRateBp,
      );
    }
  });

  it("transcribes plan/10 §2.3's add-on row and keeps `card` a priced line at zero", () => {
    const priceOf = (addonKey: string, iso2: string): number | undefined =>
      ADDON_COUNTRY_PRICES.find(
        (row) => row.addonKey === addonKey && row.countryIso2 === iso2,
      )?.retailMinor;

    // EUR: chocolates 6 · vase 8 · balloon 4 · plush 9 · wine 14 · card 0
    expect(
      ["chocolates", "vase", "balloon", "plush", "wine", "card"].map((addon) =>
        priceOf(addon, "DE"),
      ),
    ).toEqual([600, 800, 400, 900, 1400, 0]);
    // PLN: 25 · 35 · 18 · 39 · 59 · 0
    expect(
      ["chocolates", "vase", "balloon", "plush", "wine", "card"].map((addon) =>
        priceOf(addon, "PL"),
      ),
    ).toEqual([2500, 3500, 1800, 3900, 5900, 0]);
  });
});

describe("the price projections onto spec 002 §5.1 (AC-7's price half)", () => {
  /** Transcribed from spec 002 §5.1 + §14 A1 (a), not imported from `projections.ts`. */
  const SPEC_002 = {
    country_price: [
      "product_id",
      "country_id",
      "tier_key",
      "retail_minor",
      "currency_code",
      "vat_rate_bp",
      "surcharge_kind",
      "active_from",
      "active_to",
      "source",
    ],
    addon_country_price: [
      "addon_id",
      "country_id",
      "retail_minor",
      "currency_code",
      "vat_rate_bp",
      "active_from",
      "active_to",
    ],
  } as const;

  it("projects a real `country_price` row with exactly §5.1's columns", () => {
    const row = COUNTRY_PRICES[0];
    expect(row).toBeDefined();
    if (row === undefined) return;
    const projected = toCountryPriceRow(row, {
      productId: "product-uuid",
      countryId: "country-uuid",
    });

    expect([...COUNTRY_PRICE_ROW_COLUMNS]).toEqual([...SPEC_002.country_price]);
    expect(Object.keys(projected)).toEqual([...SPEC_002.country_price]);
    expect(projected.retail_minor).toBe(row.retailMinor);
    expect(projected.source).toBe("seed");
  });

  it("projects a real `addon_country_price` row, `vat_rate_bp` included", () => {
    const row = ADDON_COUNTRY_PRICES[0];
    expect(row).toBeDefined();
    if (row === undefined) return;
    const projected = toAddonCountryPriceRow(row, {
      addonId: "addon-uuid",
      countryId: "country-uuid",
    });

    expect([...ADDON_COUNTRY_PRICE_ROW_COLUMNS]).toEqual([
      ...SPEC_002.addon_country_price,
    ]);
    expect(Object.keys(projected)).toEqual([...SPEC_002.addon_country_price]);
    expect(projected.vat_rate_bp).toBe(row.vatRateBp);
  });
});

describe("the dataset's own accessors", () => {
  it("returns one destination's rows and throws on a non-destination", () => {
    expect(countryPricesFor("PL").length).toBe(
      COUNTRY_PRICES.length / PRICED_DESTINATIONS.length,
    );
    expect(() => countryPricesFor("GB")).toThrow(/GB/);
    expect(() => destinationPricingFor("XX")).toThrow(/XX/);
    expect(() => priceBandFor("PL", "essential")).not.toThrow();
  });
});
