/**
 * The v2 listing pages in all four locales (spec 004 §14 A21 clauses 1 and 6; spec 008 AC-6 as
 * amended, AC-7; TASK-178).
 *
 * What a browser can see that the unit suite cannot: the served page, in each locale, has one
 * `<h1>` in the v2 intro, one priced grid, and the **stale** state of the equivalents line: no card
 * carries one, and a converted page says once which currency it is quoting (A21 clause 6 (d)).
 *
 * Why the stale state, asserted outright: every served build reads the committed snapshot
 * (`src/config/catalogue/fx.data.ts`, `as_of` 2026-09-08), which is past `MAX_FX_AGE_HOURS` for
 * any clock CI runs on. The precondition below says so, so that the day a build serves a current
 * snapshot (spec 005 §14 A7, TASK-180/181) this file fails on that fact and gets its fresh-state
 * half, rather than passing on either state. The fresh state — exactly one line per priced card,
 * no fallback — is asserted page by page over a fixed clock in
 * `tests/unit/catalog-listing-pages-equivalents.test.tsx`. Neither state ever puts the line into
 * JSON-LD.
 */
import { expect, test } from "@playwright/test";

import { isFxSnapshotStale } from "../../src/config/catalogue/fx.data.ts";

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
  test(`${locale}: the shop root renders the v2 intro and, at the stale snapshot, no equivalents line`, async ({
    page,
  }) => {
    expect(
      isFxSnapshotStale(new Date()),
      "the served snapshot is current: add the fresh-state assertions (one line per priced card, no fallback)",
    ).toBe(true);
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
    // No line anywhere; a converted page says once which currency it is quoting, and a native
    // page (`/pl`) converted nothing, so it has no fallback to announce.
    await expect(page.locator("[data-fo-price-equivalents]")).toHaveCount(0);
    await expect(page.locator("main [data-fo-fx-fallback]")).toHaveCount(
      native ? 0 : 1,
    );

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
