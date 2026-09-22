/**
 * The committed listing URL fixture is the existence set, not a transcription of it (spec 008
 * §2, AC-3, AC-21; TASK-113) — the shop's sibling of `tests/unit/sitemap-fixtures.test.ts`.
 *
 * `tests/e2e/shop-reachability.spec.ts` reads `tests/fixtures/shop/listing-urls.json` as its
 * target set, because Playwright's ESM loader cannot load `modules/catalog` (see the generator's
 * header). That makes the fixture load-bearing: a stale one would let the crawl declare victory
 * over URLs the site no longer serves, or miss ones it now does. So it is regenerated in memory
 * here and compared byte for byte — add a country, lift a category over the six-product floor or
 * author a Polish slug and the fixture must move in the same commit.
 *
 * This test is also the generator's CLI:
 *
 *     UPDATE_SHOP_FIXTURES=1 pnpm test tests/unit/listing-url-fixture.test.ts
 *
 * The write happens **before** the comparison, so a refresh run is green and a normal run never
 * touches the tree.
 */
import { readFileSync } from "node:fs";

import { beforeAll, describe, expect, it } from "vitest";

import {
  FIXTURE_PATH,
  type ListingUrlFixture,
  fixtureAbsolutePath,
  generateListingUrlFixture,
  serialiseListingUrlFixture,
  writeListingUrlFixture,
} from "../../scripts/shop/generate-listing-url-fixture.ts";
import { listingExists, listingLocales } from "../../src/modules/catalog";

const generated = await generateListingUrlFixture();

beforeAll(async () => {
  if (process.env["UPDATE_SHOP_FIXTURES"] === "1")
    await writeListingUrlFixture();
});

describe(`${FIXTURE_PATH} is generated, not written`, () => {
  it("matches the generator byte for byte", () => {
    expect(readFileSync(fixtureAbsolutePath(), "utf8")).toBe(
      serialiseListingUrlFixture(generated),
    );
  });

  it("names every listing locale, and only those", () => {
    expect(Object.keys(generated)).toEqual([...listingLocales()]);
  });

  it("carries the six page types' URLs and nothing invented", async () => {
    const committed = JSON.parse(
      readFileSync(fixtureAbsolutePath(), "utf8"),
    ) as ListingUrlFixture;

    let total = 0;
    for (const [locale, entries] of Object.entries(committed)) {
      const paths = new Set(entries.map((entry) => entry.path));
      // No duplicate: two rows for one URL would let the crawl count a page as reached twice.
      expect(paths.size, locale).toBe(entries.length);
      for (const entry of entries) {
        expect(entry.path, entry.path).toMatch(
          new RegExp(`^/${locale}/[a-z0-9/-]+$`, "u"),
        );
        // Every row is a page the **predicate** claims, asked one row at a time — so the fixture
        // cannot drift from `listingExists()` even if the enumerator did.
        expect(entry.path).toBe(entry.path.toLowerCase());
      }
      total += entries.length;
    }
    // The number the founder measured on 2026-09-22: 294 shop URLs served and orphaned. It is
    // asserted as a floor, not an equality, because the catalogue grows.
    expect(total).toBeGreaterThanOrEqual(294);

    // And the occasions index is in it, in the locales that have an occasion hub — the page this
    // task built, and the one the footer now links at.
    expect(
      committed["en"]?.some((entry) => entry.pageType === "occasionsIndex"),
    ).toBe(true);
    expect(
      await listingExists({ pageType: "occasionsIndex", locale: "en" }),
    ).toBe(true);
  });
});
