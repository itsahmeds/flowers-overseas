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
import type { LocaleCode } from "../../src/config/locales.ts";
import {
  type ListingIdentity,
  listingExists,
  listingLocales,
} from "../../src/modules/catalog";
import { resolveLocalePath } from "../../src/modules/catalog/routes.ts";
import { resolveSlug } from "../../src/modules/catalog/slugs.ts";

/**
 * One committed row as the identity `listingExists()` is asked about, recovered from the **URL**
 * through the router (`resolveLocalePath()`) and the slug index (`resolveSlug()`) rather than
 * from the generator, so the row is checked by a path that does not share the enumerator's code.
 * `undefined` when the router does not serve the path as the row's page type.
 */
async function identityOf(
  locale: string,
  pageType: string,
  path: string,
): Promise<ListingIdentity | undefined> {
  const segments = path.split("/").slice(2);
  const page = await resolveLocalePath(locale, segments);
  if (page.kind !== pageType) return undefined;
  switch (page.kind) {
    case "countryShopRoot":
      return {
        pageType: page.kind,
        locale: page.locale,
        countryIso: page.iso2,
      };
    case "countryCategory": {
      const entityKey = resolveSlug(page.locale, "category", page.categorySlug);
      return entityKey === undefined
        ? undefined
        : {
            pageType: page.kind,
            locale: page.locale,
            countryIso: page.iso2,
            entityKey,
          };
    }
    case "countryOccasion":
      return {
        pageType: page.kind,
        locale: page.locale,
        countryIso: page.iso2,
        entityKey: page.occasionKey,
      };
    case "categoryHub":
    case "occasionHub": {
      const kind = page.kind === "categoryHub" ? "category" : "occasion";
      const entityKey = resolveSlug(page.locale, kind, page.slug);
      return entityKey === undefined
        ? undefined
        : { pageType: page.kind, locale: page.locale, entityKey };
    }
    case "occasionsIndex":
      return { pageType: page.kind, locale: page.locale };
    default:
      return undefined;
  }
}

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
        expect(entry.path).toBe(entry.path.toLowerCase());
        // Every row is a page the **predicate** claims, asked one row at a time — so the fixture
        // cannot drift from `listingExists()` even if the enumerator did (`/review 98` round 1,
        // required change 7: this comment used to sit over the lowercase check alone). The row's
        // identity comes from the router, so the router, the row's page type and the predicate
        // all have to agree.
        const identity = await identityOf(
          locale as LocaleCode,
          entry.pageType,
          entry.path,
        );
        expect(
          identity,
          `${entry.pageType} ${entry.path} routes`,
        ).toBeDefined();
        expect(
          identity === undefined ? false : await listingExists(identity),
          `${entry.pageType} ${entry.path} exists`,
        ).toBe(true);
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
