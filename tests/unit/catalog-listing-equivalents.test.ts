/**
 * The equivalents line on real listing data (spec 004 §14 A21 clause 6 (b)–(d); spec 008 T-06's
 * equivalents case and T-07's no-money case on hubs; TASK-178).
 *
 * `listingView()` over the committed catalogue, with the clock injected: at a fresh instant every
 * country-scoped card carries the other three currencies of {EUR, GBP, PLN, USD}, each equal to
 * the mid-rate conversion of **that card's** charged amount at the charged price's own snapshot;
 * past the 48-hour bound no card carries any; a destination-less hub carries no money at all.
 */
import { describe, expect, it } from "vitest";

import { listingView } from "../../src/modules/catalog/index.ts";
import { fxRateFor } from "../../src/modules/catalog/pricing/fx.ts";
import { toMinor } from "../../src/modules/catalog/pricing/money.ts";
import { convertAtMidRate } from "../../src/modules/catalog/pricing/equivalents.ts";
import type { CurrencyCode } from "../../src/config/currencies.ts";

const FRESH = new Date("2026-09-09T12:00:00Z");
const STALE = new Date("2026-09-11T00:00:01Z");
const SET: readonly CurrencyCode[] = ["EUR", "GBP", "PLN", "USD"];

async function shopRoot(locale: "en" | "en-gb" | "de" | "pl", now: Date) {
  const country = {
    en: "poland",
    "en-gb": "poland",
    de: "polen",
    pl: "polska",
  }[locale];
  const view = await listingView(
    { locale, pageType: "countryShopRoot", country },
    { from: "2026-09-09", now },
  );
  expect(view, `${locale} shop root`).toBeDefined();
  return view!;
}

describe("country-scoped cards carry the equivalents at a fresh rate (A21 clause 6 (b), (c))", () => {
  it.each([
    ["en", "EUR"],
    ["en-gb", "GBP"],
    ["de", "EUR"],
    ["pl", "PLN"],
  ] as const)(
    "%s: every card lists the three non-charged currencies, at the mid rate",
    async (locale, charged) => {
      const view = await shopRoot(locale, FRESH);
      expect(view.items.length).toBeGreaterThan(0);
      for (const card of view.items) {
        expect(card.price.currency).toBe(charged);
        expect(card.equivalents?.asOf).toBe("2026-09-08");
        const amounts = card.equivalents?.amounts ?? [];
        expect(amounts.map((amount) => amount.currency)).toEqual(
          SET.filter((code) => code !== charged),
        );
        for (const amount of amounts) {
          const rate = await fxRateFor(charged, amount.currency, FRESH);
          expect(rate?.asOf).toBe("2026-09-08");
          expect(amount).toEqual(
            convertAtMidRate(
              {
                amountMinor: toMinor(Number(card.price.amountMinor)),
                currency: charged,
              },
              amount.currency,
              rate!.ratePpm,
            ),
          );
        }
      }
    },
  );

  it("converts the charged amount, not the destination's: the /en PLN equivalent is not the authored złoty price", async () => {
    // €-charged cards over Poland were converted *from* PLN with the 2.5% buffer and rounded up
    // onto `.90`; converting back at the mid rate must therefore land above the authored PLN
    // amount, never on it. Equal amounts would mean the line restated the catalogue price.
    const en = await shopRoot("en", FRESH);
    const pl = await shopRoot("pl", FRESH);
    const authored = new Map(
      pl.items.map((card) => [card.productId, Number(card.price.amountMinor)]),
    );
    for (const card of en.items) {
      const plnEquivalent = card.equivalents?.amounts.find(
        (amount) => amount.currency === "PLN",
      );
      const native = authored.get(card.productId);
      if (native === undefined) continue;
      expect(Number(plnEquivalent?.amountMinor)).toBeGreaterThan(native);
    }
  });
});

describe("stale rates hide the line (A21 clause 6 (d))", () => {
  it.each(["en", "en-gb", "de", "pl"] as const)(
    "%s: no card carries an equivalents line past the age bound",
    async (locale) => {
      const view = await shopRoot(locale, STALE);
      expect(view.items.length).toBeGreaterThan(0);
      for (const card of view.items) {
        expect(card.equivalents).toBeUndefined();
      }
    },
  );
});

describe("hubs keep spec 008 T-07: no money, so no equivalents (A21 clause 6 (c))", () => {
  it("a destination-less category hub's cards carry neither a price nor a line", async () => {
    const view = await listingView(
      { locale: "en", pageType: "categoryHub", entity: "roses" },
      { from: "2026-09-09", now: FRESH },
    );
    expect(view).toBeDefined();
    expect(view?.items).toEqual([]);
    for (const card of view?.hubItems ?? []) {
      expect(card).not.toHaveProperty("price");
      expect(card).not.toHaveProperty("equivalents");
    }
  });
});
