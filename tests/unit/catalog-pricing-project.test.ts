/**
 * Projections and the price identity (spec 005 §5.2 `pricing/project.ts`, §6, §7, AC-9, AC-10,
 * AC-11, T-07, T-08, T-09; TASK-067).
 *
 * Four claims are proven here, in the order they depend on each other:
 *
 *  1. **The display currency comes from the locale, never from the cookie** (AC-9, T-07). Asserted
 *     twice over: the same (product, country, locale) yields a **byte-identical** projection with
 *     every plausible `fo_currency` value planted in the environment, and a source scan of the
 *     module's exported signatures shows that none of them takes a currency except `priceTable()`,
 *     which enumerates them all instead of choosing one. The first would pass by accident today
 *     (nothing reads a cookie yet); the second is what stops it being added tomorrow.
 *  2. **Displayed, resolved and published are one number** (AC-10, AC-11). Over the fixture matrix
 *     of 5 tiers × 3 destinations × 3 locales, the destination-currency amount is exactly
 *     `resolvePrice()`'s, and `offerProjection().price` is exactly the digits
 *     `formatMoney(displayPrice, locale)` prints. The *quoted* amount of AC-10's triple is
 *     `quote()`'s, which is TASK-068's, and this file deliberately does not stub one.
 *  3. **The offer is the manual-action guard** (AC-11): one offer per PDP, zero for a `demo`
 *     destination, `priceCurrency` the locale default, `shippingRate` zero, return policy
 *     `MerchantReturnNotPermitted`.
 *  4. **A stale rate produces no converted amount** (§13 Q2, AC-15's projection half): past the
 *     48-hour bound the projection falls back to the destination currency, carries
 *     `catalog.availability.fxUnavailable` and stamps no rate at all.
 *
 * The clock is injected everywhere, because the committed ECB snapshot ages: a test that
 * depended on today's date would start failing on a Monday morning for a reason that is not a
 * defect (`pricing/fx.ts`, spec 005 §13 Q2).
 */
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { FX_SNAPSHOT_AS_OF } from "../../src/config/catalogue/fx.data.ts";
import type { CountryIso2 } from "../../src/config/countries.ts";
import { countryConfig } from "../../src/config/countries.ts";
import { currencyConfig } from "../../src/config/currencies.ts";
import type { LocaleCode } from "../../src/config/locales.ts";
import { localeConfig } from "../../src/config/locales.ts";
import { rateValidUntil } from "../../src/modules/catalog/pricing/fx.ts";
import {
  fromPriceProjection,
  offerProjection,
  priceProjection,
  priceTable,
} from "../../src/modules/catalog/pricing/project.ts";
import {
  fromPrice,
  resolvePrice,
} from "../../src/modules/catalog/pricing/resolve.ts";
import {
  MAX_PRICE_TABLE_BYTES,
  MAX_PRICE_TABLE_CURRENCIES,
  serialisedByteLength,
} from "../../src/modules/catalog/schemas.ts";
import { PHASE_0_DISPLAY_CURRENCIES } from "../../src/modules/catalog/static/index.ts";
import { formatMoney } from "../../src/modules/i18n/format.ts";

/** A day inside the committed snapshot's 48-hour window: every conversion is available. */
const FRESH = new Date(`${FX_SNAPSHOT_AS_OF}T10:00:00Z`);
/**
 * The last calendar day the committed snapshot is usable — `as_of + 1` (`rateValidUntil()`,
 * spec 005 §6, §14 A3). A converted offer's `priceValidUntil` is this rather than the price row's
 * open-ended `null` (TASK-068).
 */
const FX_RATE_VALID_UNTIL = rateValidUntil(FX_SNAPSHOT_AS_OF);

/** Well past `MAX_FX_AGE_HOURS`: no rate is usable and the projection must fail closed. */
const STALE = new Date("2026-10-01T10:00:00Z");

/** The live destination (ADR-0002's first corridor) and two `demo` ones. */
const DESTINATIONS = [
  "PL",
  "DE",
  "RO",
] as const satisfies readonly CountryIso2[];

/** The three launch locales whose defaults are the three Phase 0 display currencies. */
const LOCALES = ["en", "en-gb", "pl"] as const satisfies readonly LocaleCode[];

/**
 * AC-10's "5 tiers": every tier *shape* the dataset has (`plan/10` §2.2) — the three steps of a
 * stem-count ladder, one S/M/L arrangement step and the single tier of a plant — rather than five
 * steps of one product, which would exercise one code path five times.
 */
const TIERS = [
  { productId: "FO-BQ-001", tierKey: "stems_12" },
  { productId: "FO-BQ-001", tierKey: "stems_18" },
  { productId: "FO-BQ-001", tierKey: "stems_24" },
  { productId: "FO-AR-001", tierKey: "size_m" },
  { productId: "FO-PT-001", tierKey: "single" },
] as const;

/** The digits of a rendered price, with the symbol, the spaces and the separators removed. */
function digitsOf(rendered: string): string {
  return rendered.replace(/\D/gu, "");
}

/* -------------------------------------------------------------------------- */
/* AC-9 / T-07: the locale decides the currency, and the cookie never does.   */
/* -------------------------------------------------------------------------- */

const COOKIE_ENV_KEYS = [
  "fo_currency",
  "FO_CURRENCY",
  "NEXT_PUBLIC_FO_CURRENCY",
] as const;

afterEach(() => {
  for (const key of COOKIE_ENV_KEYS) delete process.env[key];
});

describe("the display currency is the locale's default (AC-9, T-07)", () => {
  it("projects each locale's `currencyDefault`, and only that", async () => {
    for (const locale of LOCALES) {
      const projection = await priceProjection(locale, {
        ...TIERS[0],
        countryIso: "PL",
        now: FRESH,
      });
      expect(projection.displayPrice.currency).toBe(
        localeConfig(locale).currencyDefault,
      );
      expect(projection.displayLocale).toBe(locale);
      // The destination's own currency travels with it, so 010 can say what the florist is paid
      // in without a second read (spec 005 §8).
      expect(projection.destinationCurrencyPrice.currency).toBe("PLN");
    }
  });

  it("is byte-identical whatever `fo_currency` is present in the environment", async () => {
    const of = async (): Promise<string> =>
      JSON.stringify(
        await priceProjection("en-gb", {
          ...TIERS[0],
          countryIso: "PL",
          now: FRESH,
        }),
      );

    const baseline = await of();
    for (const value of ["PLN", "EUR", "USD", "", "not-a-currency"]) {
      for (const key of COOKIE_ENV_KEYS) process.env[key] = value;
      expect(await of()).toBe(baseline);
    }
  });

  it("exports no function that takes a display currency except `priceTable`", () => {
    const source = readFileSync(
      resolvePath(
        import.meta.dirname,
        "../../src/modules/catalog/pricing/project.ts",
      ),
      "utf8",
    );

    // Every exported function's name and its parameter list, up to the body brace.
    const signatures = [
      ...source.matchAll(/export (?:async )?function (\w+)\(([\s\S]*?)\): /gu),
    ].map(([, name, params]) => ({ name: name ?? "", params: params ?? "" }));
    expect(signatures.map((signature) => signature.name).sort()).toEqual([
      "fromPriceProjection",
      "offerProjection",
      "priceProjection",
      "priceTable",
    ]);

    for (const { name, params } of signatures) {
      expect(
        /currency/iu.test(params),
        `${name} must not accept a display-currency override (AC-9)`,
      ).toBe(false);
    }

    // Nor may the module reach for one itself: no cookie, no header, no environment.
    const readsAmbient =
      /\bcookies\s*\(|document\.cookie|\bheaders\s*\(|process\.env/u.test(
        source,
      );
    expect(readsAmbient).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* AC-10 / AC-11: resolved, displayed and published are one number.           */
/* -------------------------------------------------------------------------- */

describe("the price identity across the fixture matrix (AC-10, AC-11, T-08)", () => {
  it("projects the resolved amount and publishes the displayed one", async () => {
    let cases = 0;
    let offers = 0;

    for (const tier of TIERS) {
      for (const countryIso of DESTINATIONS) {
        const resolved = await resolvePrice({ ...tier, countryIso });
        for (const locale of LOCALES) {
          cases += 1;
          const projection = await priceProjection(locale, {
            ...tier,
            countryIso,
            now: FRESH,
          });

          // The destination half of AC-10: the projection changes the presentation, never the
          // price. Same integer, same currency, same VAT split, same version.
          expect(projection.destinationCurrencyPrice).toEqual({
            amountMinor: resolved.amountMinor,
            currency: resolved.currency,
          });
          expect(projection.vatRateBp).toBe(resolved.vatRateBp);
          expect(projection.priceVersion).toBe(resolved.priceVersion);
          expect(projection.deliveryIncluded).toBe(true);
          expect(projection.vatLabelKey).toBe("catalog.price.inclusive");

          const offer = offerProjection(projection);
          if (countryConfig(countryIso).status !== "live") {
            // AC-11: a `demo` destination publishes no offer at all (ADR-0007).
            expect(offer).toBeNull();
            continue;
          }
          offers += 1;
          if (offer === null)
            throw new Error("a live destination has an offer");

          // AC-11's identity: the offer's price is the digits the page prints, at the
          // currency's exponent, with a dot separator.
          expect(digitsOf(offer.price)).toBe(
            digitsOf(formatMoney(projection.displayPrice, locale)),
          );
          expect(offer.price).not.toContain(",");
          const { minorUnitExponent } = currencyConfig(
            projection.displayPrice.currency,
          );
          expect(offer.price.split(".")[1]?.length ?? 0).toBe(
            minorUnitExponent,
          );
          expect(offer.priceCurrency).toBe(
            localeConfig(locale).currencyDefault,
          );
          expect(offer.eligibleRegion).toBe(countryIso);
          // §14 A3 (TASK-068): the offer's validity is the **earlier** of the price row's
          // `active_to` and the FX snapshot's own last usable day where a conversion is
          // involved — a converted price stops being the price when its rate does.
          expect(offer.priceValidUntil).toBe(
            projection.ratePpm === undefined
              ? resolved.activeTo
              : FX_RATE_VALID_UNTIL,
          );
          expect(offer.priceVersion).toBe(resolved.priceVersion);
        }
      }
    }

    expect(cases).toBe(TIERS.length * DESTINATIONS.length * LOCALES.length);
    expect(offers).toBe(TIERS.length * LOCALES.length);
  });

  it("puts delivery in the price and refuses returns on a perishable (AC-11)", async () => {
    const offer = offerProjection(
      await priceProjection("en", {
        ...TIERS[0],
        countryIso: "PL",
        now: FRESH,
      }),
    );
    if (offer === null) throw new Error("PL is the live destination");

    expect(offer.shippingRate).toEqual({ amountMinor: 0, currency: "EUR" });
    expect(offer.hasMerchantReturnPolicy).toBe(
      "https://schema.org/MerchantReturnNotPermitted",
    );
    expect(offer.availability).toBe("https://schema.org/InStock");
    expect(offer.availabilityKey).toBe("catalog.availability.inStock");
  });

  it("moves the schema value and the visible key together when out of stock", async () => {
    const offer = offerProjection(
      await priceProjection("en", {
        ...TIERS[0],
        countryIso: "PL",
        now: FRESH,
      }),
      { inStock: false },
    );
    if (offer === null) throw new Error("PL is the live destination");

    expect(offer.availability).toBe("https://schema.org/OutOfStock");
    expect(offer.availabilityKey).toBe("catalog.availability.outOfStock");
  });

  it("projects a from-price the same way, and never as an offer (§6, §13 Q10)", async () => {
    const cheapest = await fromPrice({
      productId: "FO-BQ-001",
      countryIso: "PL",
    });
    const projection = await fromPriceProjection("pl", {
      productId: "FO-BQ-001",
      countryIso: "PL",
      now: FRESH,
    });

    expect(projection.destinationCurrencyPrice.amountMinor).toBe(
      cheapest.amountMinor,
    );
    // A from-price is the price of the cheapest *purchasable* tier, so it is projected exactly
    // like any other price; what makes it not an `Offer` is that spec 008 renders it as text.
    expect(projection.displayPrice.currency).toBe("PLN");
  });
});

/* -------------------------------------------------------------------------- */
/* The FX fallback: a stale rate produces no converted amount (AC-15).        */
/* -------------------------------------------------------------------------- */

describe("the projection fails closed on a stale rate (§13 Q2)", () => {
  it("falls back to the destination currency with a reason key and no rate", async () => {
    const projection = await priceProjection("en-gb", {
      ...TIERS[0],
      countryIso: "PL",
      now: STALE,
    });

    expect(projection.displayPrice).toEqual(
      projection.destinationCurrencyPrice,
    );
    expect(projection.displayPrice.currency).toBe("PLN");
    expect(projection.fxReasonKey).toBe("catalog.availability.fxUnavailable");
    expect(projection.fxAsOf).toBeUndefined();
    expect(projection.ratePpm).toBeUndefined();
  });

  it("the fallback offer carries the destination currency and the same figure (§14 A3)", async () => {
    // `/review 52`'s carry-forward: AC-11's literal wording says `Offer.priceCurrency` is the
    // locale's default, and §13 Q2 says a rate older than 48 h fails closed to the destination
    // currency. §14 A3 settles which wins — the **price identity** does: the offer states the
    // figure the page prints, in the currency the page prints it in.
    const projection = await priceProjection("en-gb", {
      ...TIERS[0],
      countryIso: "PL",
      now: STALE,
    });
    const offer = offerProjection(projection);
    if (offer === null) throw new Error("a live destination has an offer");

    expect(projection.displayPrice.currency).toBe("PLN");
    expect(offer.priceCurrency).toBe("PLN");
    expect(offer.priceCurrency).not.toBe(localeConfig("en-gb").currencyDefault);
    expect(digitsOf(offer.price)).toBe(
      digitsOf(formatMoney(projection.displayPrice, "en-gb")),
    );
    expect(offer.shippingRate.currency).toBe("PLN");
    // Nothing was converted, so no FX validity bounds the offer: the row's own `active_to` does.
    expect(offer.priceValidUntil).toBe(projection.priceValidUntil);
  });

  it("stamps the rate and its date whenever it does convert", async () => {
    const projection = await priceProjection("en-gb", {
      ...TIERS[0],
      countryIso: "PL",
      now: FRESH,
    });

    expect(projection.displayPrice.currency).toBe("GBP");
    expect(projection.fxAsOf).toBe(FX_SNAPSHOT_AS_OF);
    expect(projection.ratePpm).toBeGreaterThan(0);
    expect(projection.fxReasonKey).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* `priceTable`: the one place currencies are enumerated (AC-9's exception).   */
/* -------------------------------------------------------------------------- */

describe("the embedded price table (spec 005 §5.2, §6)", () => {
  it("carries the destination currency plus every enabled display currency", async () => {
    const tables = await priceTable({
      productId: "FO-BQ-001",
      countryIso: "PL",
      now: FRESH,
    });

    expect(tables).toHaveLength(3);
    for (const table of tables) {
      const currencies = Object.keys(table.entries);
      expect(currencies).toEqual(
        expect.arrayContaining([...PHASE_0_DISPLAY_CURRENCIES, "PLN"]),
      );
      // §13 Q11: a currency we cannot charge is not displayed, so it is not in the table.
      expect(currencies).not.toContain("CZK");
      expect(currencies.length).toBeLessThanOrEqual(MAX_PRICE_TABLE_CURRENCIES);
      expect(serialisedByteLength(table)).toBeLessThanOrEqual(
        MAX_PRICE_TABLE_BYTES,
      );
      expect(table.fxAsOf).toBe(FX_SNAPSHOT_AS_OF);
    }
  });

  it("agrees with the projection for the locale that displays each currency", async () => {
    const [table] = await priceTable({
      productId: "FO-BQ-001",
      countryIso: "PL",
      now: FRESH,
    });
    if (table === undefined) throw new Error("the ladder has a first tier");

    for (const locale of LOCALES) {
      const projection = await priceProjection(locale, {
        productId: "FO-BQ-001",
        tierKey: table.tierKey,
        countryIso: "PL",
        now: FRESH,
      });
      expect(table.entries[projection.displayPrice.currency]).toBe(
        projection.displayPrice.amountMinor,
      );
    }
  });

  it("omits a currency it cannot convert rather than showing a stale amount", async () => {
    const tables = await priceTable({
      productId: "FO-BQ-001",
      countryIso: "PL",
      now: STALE,
    });

    for (const table of tables) {
      expect(Object.keys(table.entries)).toEqual(["PLN"]);
      expect(table.fxAsOf).toBeNull();
    }
  });
});
