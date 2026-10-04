/**
 * The v2 listing pages in all four locales (spec 004 §14 A21 clauses 1 and 6; spec 008 AC-6 as
 * amended, AC-7; TASK-178).
 *
 * What a browser can see that the unit suite cannot: the served page, in each locale, has one
 * `<h1>` in the v2 intro, one priced grid, and the equivalents line in whichever FX state the
 * served build is in (A21 clause 6 (b)–(d)).
 *
 * Which state, read from the server rather than assumed: since spec 005 §14 A7 (TASK-180/181) a
 * build serves the ECB file it fetched or the committed snapshot, and `/api/health` reports which
 * (`fxAsOf`). The test asks it, applies the same weekday age rule the pages apply
 * (`isFxRateStaleAt`, AC-35), and asserts that state's half:
 *
 *  - **stale** (CI's test builds, which keep the committed 2026-09-08 snapshot): no card carries a
 *    line, and a converted page says once which currency it is quoting;
 *  - **fresh** (a build that fetched the day's rate): exactly one line per priced card, and no
 *    fallback sentence.
 *
 * Both halves are also asserted page by page over a fixed clock in
 * `tests/unit/catalog-listing-pages-equivalents.test.tsx`. Neither state ever puts the line into
 * JSON-LD.
 */
import { expect, test } from "@playwright/test";

import { isFxRateStaleAt } from "../../src/config/catalogue/fx.data.ts";

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
  test(`${locale}: the shop root renders the v2 intro and the equivalents line of the served FX state`, async ({
    page,
    request,
  }) => {
    const health = await request.get("/api/health");
    expect(health.status()).toBe(200);
    const { fxAsOf } = (await health.json()) as { fxAsOf: string };
    const stale = isFxRateStaleAt(fxAsOf, new Date());
    const response = await page.goto(url);
    expect(response?.status()).toBe(200);

    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("main [data-fo-listing-intro] h1")).toHaveCount(
      1,
    );
    await expect(page.locator("main [data-fo-listing-note]")).toHaveCount(1);
    await expect(page.locator('main [role="note"][aria-label]')).toHaveCount(1);
    await expect(page.locator("main [data-fo-listing-interlude]")).toHaveCount(
      1,
    );

    const cards = await page
      .locator("[data-fo-product-card-money='priced']")
      .count();
    expect(cards).toBeGreaterThan(0);
    if (stale) {
      // No line anywhere; a converted page says once which currency it is quoting, and a native
      // page (`/pl`) converted nothing, so it has no fallback to announce.
      await expect(page.locator("[data-fo-price-equivalents]")).toHaveCount(0);
      await expect(page.locator("main [data-fo-fx-fallback]")).toHaveCount(
        native ? 0 : 1,
      );
    } else {
      // One line under every priced card, and nothing to fall back from.
      await expect(page.locator("[data-fo-price-equivalents]")).toHaveCount(
        cards,
      );
      await expect(page.locator("main [data-fo-fx-fallback]")).toHaveCount(0);
    }

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
