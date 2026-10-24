/**
 * No card prints the approximate equivalents yet (spec 004 §14 A-founder-2026-10-19b clause 2; spec
 * 008 AC-6 as amended, T-06 amended and A21's amended test bullet; TASK-285).
 *
 * Spec 004 §14 A-founder-2026-10-24a item 7 reverses clause 2: every card with a price regains
 * the line, and TASK-381 gives the country card's view model a nullable `equivalents` field for it.
 * Until TASK-389 fills and renders it, the field is `null` on every card (no line), which is what
 * this file now pins: `listingView()` over the committed catalogue, with the clock injected
 * **inside** the committed snapshot's window, the one state in which a card used to carry the
 * other three currencies: every country-scoped card's `equivalents` is `null` in each of the four
 * locales, at a fresh rate or a stale one, and every card's one price is the charged amount in the locale's
 * display currency (EUR on `/en` and `/de`, GBP on `/en-gb`, złoty on `/pl`; złoty everywhere once
 * the rate is stale). A destination-less hub carries no money at all (T-07).
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

describe("country-scoped cards carry one price and no equivalents (clause 2)", () => {
  it.each([
    ["en", FRESH, "EUR"],
    ["en-gb", FRESH, "GBP"],
    ["de", FRESH, "EUR"],
    ["pl", FRESH, "PLN"],
    ["en", STALE, "PLN"],
    ["en-gb", STALE, "PLN"],
  ] as const)(
    "%s at %s: every card is charged in %s and its equivalents field is null",
    async (locale, now, charged) => {
      const view = await shopRoot(locale, now);
      expect(view.items.length).toBeGreaterThan(0);
      for (const card of view.items) {
        expect(card.price.currency).toBe(charged);
        expect(Number.isInteger(card.price.amountMinor)).toBe(true);
        expect(card.price.amountMinor).toBeGreaterThan(0);
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
