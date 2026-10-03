/**
 * The v2 listing pages in all four locales (spec 004 §14 A21 clauses 1 and 6; spec 008 AC-6 as
 * amended, AC-7; TASK-178).
 *
 * What a browser can see that the unit suite cannot: the served page, in each locale, has one
 * `<h1>` in the v2 intro, one priced grid, and an equivalents line that is **all or nothing** —
 * either every card carries one (a current FX snapshot) and the stale-rate sentence is absent, or
 * no card carries one and the page says which currency it is quoting (A21 clause 6 (d)). The test
 * does not hard-code which of the two it expects, because the committed snapshot ages with the
 * calendar and a refresh must not turn it red. Neither state ever puts the line into JSON-LD.
 */
import { expect, test } from "@playwright/test";

/** `native`: the charged currency is the catalogue's (PLN to Poland), so no fallback exists. */
const SHOP_ROOTS = [
  ["en", "/en/poland/flowers", false],
  ["en-gb", "/en-gb/poland/flowers", false],
  ["de", "/de/polen/blumen", false],
  ["pl", "/pl/polska/kwiaty", true],
] as const;

const HUBS = [
  "/en/send-flowers-to",
  "/en/occasions",
  "/en/flowers/roses",
] as const;

for (const [locale, url, native] of SHOP_ROOTS) {
  test(`${locale}: the shop root renders the v2 intro and an all-or-nothing equivalents line`, async ({
    page,
  }) => {
    const response = await page.goto(url);
    expect(response?.status()).toBe(200);

    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("main [data-fo-listing-intro] h1")).toHaveCount(
      1,
    );
    await expect(page.locator("main [data-fo-listing-note]")).toHaveCount(1);

    const cards = await page
      .locator("[data-fo-product-card-money='priced']")
      .count();
    expect(cards).toBeGreaterThan(0);
    const lines = await page.locator("[data-fo-price-equivalents]").count();
    const fallback = await page.locator("main [data-fo-fx-fallback]").count();
    // Fresh rate: a line on every card and no fallback sentence. Stale rate: no line anywhere,
    // and a converted page says once which currency it is quoting (A21 clause 6 (d)); a native
    // page (`/pl`) converted nothing, so it has no fallback to announce.
    expect([0, cards]).toContain(lines);
    expect(fallback).toBe(lines === 0 && !native ? 1 : 0);

    // JSON-LD never carries the line, whichever state the page is in.
    const ld = await page
      .locator('script[type="application/ld+json"]')
      .allTextContents();
    for (const block of ld) {
      expect(block).not.toMatch(/at the rate of|zum Kurs vom|po kursie z/u);
    }
  });
}

for (const url of HUBS) {
  test(`${url}: a destination-less page shows no equivalents line and no price (spec 008 AC-7)`, async ({
    page,
  }) => {
    const response = await page.goto(url);
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("[data-fo-price-equivalents]")).toHaveCount(0);
    await expect(
      page.locator("[data-fo-product-card-money='priced']"),
    ).toHaveCount(0);
  });
}
