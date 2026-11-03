/**
 * Every country card carries its equivalents line (spec 004 §14 A-founder-2026-10-24a item 7,
 * which reverses A-founder-2026-10-19b clause 2; spec 008 AC-6 as amended; spec 004 AC-105, T-111's
 * card half; TASK-389).
 *
 * `listingView()` over the committed catalogue, the clock injected **inside** the committed
 * snapshot's 48-hour window: every country-scoped card's one price is "from" the smallest size,
 * charged in the locale's display currency (EUR on `/en` and `/de`, GBP on `/en-gb`, złoty on
 * `/pl`), and its `equivalents` are the other three of {GBP, EUR, USD, PLN} in item 7's order at
 * the snapshot's date. Once the charging rate is stale the price falls back to złoty with
 * `fxReasonKey`, and the line is hidden (item 7 (d)). A destination-less hub carries no money at
 * all (T-07).
 */
import { describe, expect, it } from "vitest";

import { listingView } from "../../src/modules/catalog/index.ts";

const FRESH = new Date("2026-09-09T12:00:00Z");
const STALE = new Date("2026-09-11T00:00:01Z");

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

describe("country-scoped cards carry one price and its equivalents (item 7)", () => {
  it.each([
    ["en", "EUR", ["GBP", "USD", "PLN"]],
    ["en-gb", "GBP", ["EUR", "USD", "PLN"]],
    ["de", "EUR", ["GBP", "USD", "PLN"]],
    ["pl", "PLN", ["GBP", "EUR", "USD"]],
  ] as const)(
    "%s at a fresh rate: every card is charged in %s with the line %j",
    async (locale, charged, order) => {
      const view = await shopRoot(locale, FRESH);
      expect(view.items.length).toBeGreaterThan(0);
      for (const card of view.items) {
        expect(card.price.currency).toBe(charged);
        expect(Number.isInteger(card.price.amountMinor)).toBe(true);
        expect(card.price.amountMinor).toBeGreaterThan(0);
        expect(card.equivalents?.asOf).toBe("2026-09-08");
        expect(card.equivalents?.amounts.map((a) => a.currency)).toEqual(order);
        for (const amount of card.equivalents?.amounts ?? []) {
          expect(Number.isInteger(amount.amountMinor)).toBe(true);
        }
      }
    },
  );

  it.each(["en", "en-gb"] as const)(
    "%s at a stale charging rate: the złoty fallback carries no line",
    async (locale) => {
      const view = await shopRoot(locale, STALE);
      expect(view.items.length).toBeGreaterThan(0);
      for (const card of view.items) {
        expect(card.price.currency).toBe("PLN");
        expect(card.equivalents).toBeNull();
      }
    },
  );
});

describe("hubs keep spec 008 T-07: no money at all", () => {
  it("a destination-less category hub's cards carry neither a price nor a line", async () => {
    const view = await listingView(
      { locale: "en", pageType: "categoryHub", entity: "roses" },
      { from: "2026-09-09", now: FRESH },
    );
    expect(view).toBeDefined();
    expect(view?.items).toEqual([]);
    expect(view?.hubItems.length).toBeGreaterThan(0);
    for (const card of view?.hubItems ?? []) {
      expect(card).not.toHaveProperty("price");
      expect(card).not.toHaveProperty("priceLabelKey");
      expect(card).not.toHaveProperty("equivalents");
    }
  });
});
