/**
 * One currency per basket, and no input but the selection (spec 010 §14 A-founder-2026-10-22
 * D5, D6; AC-56's pricing half, AC-76's source scan; T-56, T-76; TASK-348).
 *
 * A line is priced **in the basket's currency** by spec 005's provider, which decides currency
 * from the locale and nothing else: the request's locale when it shows that currency, else a
 * locale whose default it is. A line the provider cannot price in it (a stale rate, where only the
 * destination's own currency is shown) is refused. And no file of the checkout reads a request
 * header that could make an amount depend on who is asking.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { FX_SNAPSHOT_AS_OF } from "../../src/config/catalogue/fx.data.ts";
import { listProducts, listTiers, priceProjection } from "@/modules/catalog";
import {
  BasketCurrencyUnavailable,
  deriveLineQuote,
  deriveQuote,
  pricingLocalesFor,
} from "@/modules/checkout";

const T0 = new Date(`${FX_SNAPSHOT_AS_OF}T09:00:00.000Z`);
const STALE = new Date(T0.getTime() + 10 * 24 * 3_600_000);

const [product] = await listProducts({ countryIso: "PL" });
if (product === undefined) throw new Error("the dataset prices nothing for PL");
const [tier] = await listTiers(product.sku);
if (tier === undefined) throw new Error(`${product.sku} has no tier`);

const selection = {
  countryIso: "PL" as const,
  sku: product.sku,
  tierKey: tier.tierKey,
  deliveryDate: null,
  addonKeys: [] as string[],
};

describe("pricingLocalesFor: the request's locale first, then the currency's own", () => {
  it("names each locale once, never a pseudo-locale", () => {
    expect(pricingLocalesFor("PLN", "en-gb")).toEqual(["en-gb", "pl"]);
    expect(pricingLocalesFor("GBP", "pl")).toEqual(["pl", "en-gb"]);
    expect(pricingLocalesFor("PLN", "pl")).toEqual(["pl"]);
    for (const code of pricingLocalesFor("EUR", "pl")) {
      expect(code).not.toMatch(/-X[AB]$/u);
    }
  });
});

describe("deriveLineQuote prices a line in the basket's currency (D6, T-56)", () => {
  it("a `pl` request into a GBP basket: the GBP amount the `en-gb` product page shows", async () => {
    const signed = await deriveLineQuote(selection, "GBP", "pl", T0);
    const enGb = await priceProjection("en-gb", {
      productId: product.sku,
      tierKey: tier.tierKey,
      countryIso: "PL",
      now: T0,
    });
    expect(signed.currency).toBe("GBP");
    expect(signed.totalMinor).toBe(enGb.displayPrice.amountMinor);
    const plPage = await deriveQuote({ locale: "pl", ...selection }, T0);
    expect(plPage.currency).toBe("PLN");
    expect(plPage.totalMinor).not.toBe(signed.totalMinor);
  });

  it("refuses a GBP line when the GBP rate is stale, and still prices a PLN one natively", async () => {
    await expect(
      deriveLineQuote(selection, "GBP", "en-gb", STALE),
    ).rejects.toBeInstanceOf(BasketCurrencyUnavailable);
    const native = await deriveLineQuote(selection, "PLN", "en-gb", STALE);
    expect(native.currency).toBe("PLN");
    expect(native.ratePpm).toBeNull();
  });

  it("is the same integer through every request locale (AC-76: the locale never changes the basket's amount)", async () => {
    const amounts = new Set<number>();
    for (const locale of ["pl", "en-gb", "en", "de"] as const) {
      amounts.add(
        (await deriveLineQuote(selection, "PLN", locale, T0)).totalMinor,
      );
    }
    expect(amounts.size).toBe(1);
  });
});

describe("no request header that could vary an amount is read (AC-76, T-76 source scan)", () => {
  const ROOTS = ["src/modules/checkout", "src/app/api/checkout"];
  const FORBIDDEN =
    /cf-ipcountry|x-vercel-ip-country|accept-language|x-forwarded-for|cf-connecting-ip|x-real-ip|\.geo\b|\.ip\b/iu;

  function files(dir: string): string[] {
    return readdirSync(resolve(process.cwd(), dir), {
      withFileTypes: true,
    }).flatMap((entry) =>
      entry.isDirectory()
        ? files(join(dir, entry.name))
        : /\.(ts|tsx)$/u.test(entry.name)
          ? [join(dir, entry.name)]
          : [],
    );
  }

  it("finds no such read under the checkout module and its route", () => {
    const scanned = ROOTS.flatMap(files);
    expect(scanned.length).toBeGreaterThan(5);
    const offenders = scanned.filter((file) =>
      readFileSync(resolve(process.cwd(), file), "utf8")
        .split("\n")
        .filter((line) => !/^\s*(\*|\/\/|\/\*)/u.test(line))
        .some((line) => FORBIDDEN.test(line)),
    );
    expect(offenders).toEqual([]);
  });
});
