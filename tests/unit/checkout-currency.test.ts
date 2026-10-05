/**
 * The checkout's one currency and the add-on projection behind it (spec 010 AC-18 / T-18, §5.2's
 * amendment to spec 005; spec 005 AC-18's signature gate extended; TASK-200).
 *
 *  - The checkout's currency is the product page's for the locale (`en-gb` → GBP, `pl` → PLN,
 *    `en`/`de` → EUR for a Polish destination) and the destination's own (PLN) for every locale
 *    when the rate is stale (spec 005 §14 A3); every add-on is projected into the same currency,
 *    so the lines of one checkout are alike.
 *  - `addonPriceProjection()` is the bouquet's FX rule applied to an add-on: the same snapshot,
 *    buffer and rounding (the amount equals spec 005's own `convertForDisplay()` on the add-on's
 *    destination price), integer minor units, the add-on's own VAT rate, zero stays zero.
 *  - No approximate-equivalents line belongs to the checkout: nothing in the module reaches for
 *    `priceEquivalents()` or its label key.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { FX_SNAPSHOT_AS_OF } from "../../src/config/catalogue/fx.data.ts";
import { ADDON_COUNTRY_PRICES } from "../../src/config/catalogue/prices.data.ts";
import {
  type AddonPriceProjection,
  addonPriceProjection,
  priceProjection,
  tierPrices,
} from "../../src/modules/catalog/index.ts";
import { convertForDisplay } from "../../src/modules/catalog/pricing/fx.ts";
import { checkoutCurrency } from "../../src/modules/checkout/index.ts";
import type { LocaleCode } from "../../src/config/locales.ts";

import { typeSurfaceOf } from "./support/type-surface.ts";

const repoRoot = resolve(import.meta.dirname, "../..");

/** Inside the committed snapshot's window, and well past it (the project test's two clocks). */
const FRESH = new Date(`${FX_SNAPSHOT_AS_OF}T10:00:00Z`);
const STALE = new Date("2026-10-01T10:00:00Z");

/** What the product page displays for a Polish destination, per launch locale (spec 005 §7). */
const PDP_CURRENCY: Readonly<Record<string, string>> = {
  en: "EUR",
  "en-gb": "GBP",
  de: "EUR",
  pl: "PLN",
};
const LOCALES: readonly LocaleCode[] = ["en", "en-gb", "de", "pl"];

const PRODUCT = "FO-BQ-001";
const PL_ADDONS = ADDON_COUNTRY_PRICES.filter(
  (row) => row.countryIso2 === "PL" && row.activeTo === null,
);

async function bouquet(locale: LocaleCode, now: Date) {
  const [tier] = await tierPrices({ productId: PRODUCT, countryIso: "PL" });
  if (tier === undefined) throw new Error("no tier");
  return priceProjection(locale, {
    productId: PRODUCT,
    tierKey: tier.tierKey,
    countryIso: "PL",
    now,
  });
}

async function addons(
  locale: LocaleCode,
  now: Date,
): Promise<AddonPriceProjection[]> {
  return Promise.all(
    PL_ADDONS.map((row) =>
      addonPriceProjection(row.addonKey, "PL", locale, { now }),
    ),
  );
}

describe("the checkout's currency is the product page's (AC-18, T-18)", () => {
  it("prices six add-ons for Poland, so the matrix is not empty", () => {
    expect(PL_ADDONS).toHaveLength(6);
  });

  it.each(LOCALES)(
    "%s: the bouquet, every add-on and the checkout share the PDP's currency",
    async (locale) => {
      const page = await bouquet(locale, FRESH);
      const lines = await addons(locale, FRESH);
      expect(page.displayPrice.currency).toBe(PDP_CURRENCY[locale]);
      for (const line of lines) {
        expect(line.displayPrice.currency, line.addonKey).toBe(
          PDP_CURRENCY[locale],
        );
      }
      expect(checkoutCurrency(page, lines)).toBe(PDP_CURRENCY[locale]);
    },
  );

  it.each(LOCALES)(
    "%s with a stale rate: everything falls back to the destination's PLN",
    async (locale) => {
      const page = await bouquet(locale, STALE);
      const lines = await addons(locale, STALE);
      expect(page.displayPrice.currency).toBe("PLN");
      for (const line of lines) {
        expect(line.displayPrice.currency, line.addonKey).toBe("PLN");
        expect(line.displayPrice.amountMinor).toBe(
          line.destinationCurrencyPrice.amountMinor,
        );
        expect(line.ratePpm).toBeUndefined();
        if (locale !== "pl") {
          expect(line.fxReasonKey).toBe("catalog.availability.fxUnavailable");
        }
      }
      expect(checkoutCurrency(page, lines)).toBe("PLN");
    },
  );

  it("refuses a set of lines in two currencies rather than adding unlike amounts", async () => {
    const page = await bouquet("en-gb", FRESH);
    const plnLine = await addonPriceProjection("vase", "PL", "pl", {
      now: FRESH,
    });
    expect(() => checkoutCurrency(page, [plnLine])).toThrow(/AC-18/u);
  });

  it("puts no approximate-equivalents line anywhere in the checkout module", () => {
    const dir = join(repoRoot, "src/modules/checkout");
    const files = readdirSync(dir).filter((file) => /\.tsx?$/u.test(file));
    expect(files.length).toBeGreaterThanOrEqual(6);
    for (const file of files) {
      const text = readFileSync(join(dir, file), "utf8");
      expect(text, file).not.toMatch(
        /priceEquivalents|EQUIVALENT_CURRENCIES|catalog\.price\.equivalents/u,
      );
    }
  });
});

describe("addonPriceProjection() applies the bouquet's FX rule to an add-on (spec 005 amendment)", () => {
  it("is native for the destination's own locale, at the add-on's own VAT rate", async () => {
    const chocolates = await addonPriceProjection("chocolates", "PL", "pl", {
      now: FRESH,
    });
    expect(chocolates).toMatchObject({
      addonKey: "chocolates",
      displayPrice: { amountMinor: 2500, currency: "PLN" },
      destinationCurrencyPrice: { amountMinor: 2500, currency: "PLN" },
      vatRateBp: 2300,
      vatLabelKey: "catalog.price.inclusive",
      deliveryIncluded: true,
      destinationCountry: "PL",
      displayLocale: "pl",
    });
    expect(chocolates.fxAsOf).toBeUndefined();
    const page = await bouquet("pl", FRESH);
    expect(page.vatRateBp).not.toBe(chocolates.vatRateBp);
  });

  it.each(["en", "en-gb", "de"] as const)(
    "%s: converted with the same snapshot, buffer and rounding as spec 005's convertForDisplay",
    async (locale) => {
      const page = await bouquet(locale, FRESH);
      for (const row of PL_ADDONS) {
        const line = await addonPriceProjection(row.addonKey, "PL", locale, {
          now: FRESH,
        });
        const expected = await convertForDisplay(
          { amountMinor: row.retailMinor, currency: "PLN" } as Parameters<
            typeof convertForDisplay
          >[0],
          PDP_CURRENCY[locale] as "EUR" | "GBP",
          FRESH,
        );
        if (expected.status !== "converted") throw new Error("not converted");
        expect(line.displayPrice, row.addonKey).toEqual(expected.price);
        expect(Number.isInteger(line.displayPrice.amountMinor)).toBe(true);
        expect(line.ratePpm).toBe(page.ratePpm);
        expect(line.fxAsOf).toBe(page.fxAsOf);
      }
    },
  );

  it("pins one converted literal: a Polish vase (35.00 zł) for en-gb at the snapshot rate", async () => {
    const vase = await addonPriceProjection("vase", "PL", "en-gb", {
      now: FRESH,
    });
    // 3 500 gr × the PLN→GBP snapshot rate (≈ 0.202) = £7.08; × 1.025 buffer = £7.26; up to the
    // GBP `x90` ending = £7.90 (`/review 201` nit a: a literal, not convertForDisplay as its own oracle).
    expect(vase.displayPrice).toEqual({ amountMinor: 790, currency: "GBP" });
  });

  it("keeps the free card at zero through the rounding", async () => {
    const card = await addonPriceProjection("card", "PL", "en-gb", {
      now: FRESH,
    });
    expect(card.displayPrice).toEqual({ amountMinor: 0, currency: "GBP" });
  });

  it("throws for a country that is not a destination, or an unknown add-on", async () => {
    await expect(
      addonPriceProjection("vase", "GB" as "PL", "en-gb", { now: FRESH }),
    ).rejects.toThrow();
    await expect(
      addonPriceProjection("cake", "PL", "pl", { now: FRESH }),
    ).rejects.toThrow();
  });

  it("is on the catalogue barrel's type surface that spec 005 AC-18 scans, with destination parameters only", () => {
    const surface = typeSurfaceOf("src/modules/catalog/index.ts");
    expect(surface.exports).toContain("addonPriceProjection");
    for (const name of ["addonKey", "countryIso", "locale"]) {
      expect([...surface.names], name).toContain(name);
    }
    expect(
      [...surface.names].filter((name) =>
        /buyer(Country|Location)?|ipAddress|geo|visitor/iu.test(name),
      ),
    ).toEqual([]);
  });
});
