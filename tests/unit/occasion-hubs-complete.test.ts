/**
 * Every live occasion hub is complete (spec 008 §14 A-founder-2026-10-21c items 1 to 3, **AC-70**,
 * **AC-71**, **AC-72**, **AC-73**; T-70, T-71, the unit half of T-72 and T-73; TASK-316).
 *
 * Founder, 2026-10-21: "grandparents day and some other days as well are incomplete." Six hubs
 * rendered a heading over an empty grid and nine more a thin one. The fix is data (Appendix A's
 * 74 tags on 46 existing products), and these tests are what keeps it fixed:
 *
 *  - **The floor (AC-70).** The hub set is read from `listingPages()`, the existence function
 *    `generateStaticParams` emits, never from a list typed here, so a hub that starts to exist
 *    later is held to `PRODUCT_COUNT_FLOOR` with no edit. The set is also asserted to contain
 *    `fathers_day` and `grandparents_day`, so an emptied set cannot pass. `sant_jordi`, `muguet`
 *    and `all_saints` sit at exactly six: this test is their only guard.
 *  - **The tags (AC-71).** Appendix A is a committed fixture (`tests/fixtures/catalog/
 *    occasion-hub-tags.json`, transcribed from the amendment) and each of its fifteen hubs is the
 *    *exact* set of products carrying the key, in the authored data and in the projection. A
 *    funeral piece carries only `sympathy` and `all_saints`, and no product is newly tagged unless
 *    its primary photograph is `approved`.
 *  - **The page (AC-72) and the country pages (AC-73).** `listingView()` gives each Appendix hub
 *    at least six cards in all four locales; the country occasion pages are exactly the observed
 *    pairs at or above the floor, each with the hub's product count. One tag fewer on `sant_jordi`
 *    in Spain (a mocked count, the shape `catalog-listing.test.ts` uses) removes that page.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { PRODUCTS } from "../../src/config/catalogue/products.data.ts";
import { committedOccasionCalendar } from "../../src/modules/geo/index.ts";

/** Per-(occasion, destination) count overrides; an absent key reads the real dataset. */
const countOverrides = new Map<string, number>();

vi.mock("../../src/modules/catalog/read.ts", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/modules/catalog/read.ts")>();
  return {
    ...actual,
    countProductsFor: async (occasionKey: string, iso2: string) =>
      countOverrides.get(`${occasionKey}:${iso2}`) ??
      (await actual.countProductsFor(occasionKey, iso2 as never)),
  };
});

const { PRODUCT_COUNT_FLOOR, listingPages, listingView, publishedCountries } =
  await import("../../src/modules/catalog/listing.ts");
const { countProductsFor } = await import("../../src/modules/catalog/read.ts");

afterEach(() => {
  countOverrides.clear();
});

const repoRoot = resolve(__dirname, "../..");

/** The four launch locales AC-70 names. */
const LOCALES = ["en", "en-gb", "de", "pl"] as const;

/** A fixed window start, so the views do not depend on the day the suite runs. */
const FROM = "2026-10-21";

interface AppendixEntry {
  readonly sku: string;
  /** Appendix A's `*`: a tag the product already had before the amendment. */
  readonly existing: boolean;
}

const APPENDIX = (
  JSON.parse(
    readFileSync(
      join(repoRoot, "tests/fixtures/catalog/occasion-hub-tags.json"),
      "utf8",
    ),
  ) as {
    hubs: Record<string, { count: number; skus: readonly AppendixEntry[] }>;
  }
).hubs;

interface ProjectedProduct {
  readonly sku: string;
  readonly productType: string;
  readonly occasions: readonly string[];
  readonly status: string;
}

const PROJECTED = (
  JSON.parse(
    readFileSync(join(repoRoot, "seed/data/products.json"), "utf8"),
  ) as { rows: readonly ProjectedProduct[] }
).rows;

interface MediaRow {
  readonly productSku?: string;
  readonly isPrimary?: boolean;
  readonly reviewState: string;
}

const MEDIA = (
  JSON.parse(readFileSync(join(repoRoot, "seed/data/media.json"), "utf8")) as {
    rows: readonly MediaRow[];
  }
).rows;

/** The active products of the authored data carrying an occasion key, as AC-70 counts them. */
function activeCarrying(key: string): readonly string[] {
  return PRODUCTS.filter(
    (product) =>
      product.status === "active" &&
      (product.occasions as readonly string[]).includes(key),
  ).map((product) => product.sku);
}

describe("AC-70: every emitted occasion hub holds at least PRODUCT_COUNT_FLOOR products (T-70)", () => {
  it("reads the floor as the one constant, six", () => {
    expect(PRODUCT_COUNT_FLOOR).toBe(6);
  });

  it.each(LOCALES)(
    "%s: every occasion hub the existence set emits clears the floor",
    async (locale) => {
      const hubs = (await listingPages(locale)).filter(
        (page) => page.pageType === "occasionHub",
      );
      const keys = hubs.map((page) => page.entityKey ?? "");
      // An emptied or thinned set cannot pass: the two hubs the founder named must be in it.
      expect(keys).toContain("fathers_day");
      expect(keys).toContain("grandparents_day");
      for (const key of keys) {
        expect(
          activeCarrying(key).length,
          `${locale} ${key}: active products carrying the key`,
        ).toBeGreaterThanOrEqual(PRODUCT_COUNT_FLOOR);
      }
    },
  );
});

describe("AC-71: Appendix A's tags are the data (T-71)", () => {
  it("is the amendment's list: fifteen hubs, 74 new tags on 46 products", () => {
    const hubs = Object.entries(APPENDIX);
    expect(hubs).toHaveLength(15);
    const added = hubs.flatMap(([key, hub]) =>
      hub.skus
        .filter((entry) => !entry.existing)
        .map((entry) => `${key}:${entry.sku}`),
    );
    expect(added).toHaveLength(74);
    expect(new Set(added.map((tag) => tag.split(":")[1]))).toHaveProperty(
      "size",
      46,
    );
    for (const [key, hub] of hubs) {
      expect(hub.skus, key).toHaveLength(hub.count);
    }
  });

  it.each(Object.entries(APPENDIX))(
    "%s is exactly the Appendix A set, in the authored data and in the projection",
    (key, hub) => {
      const expected = hub.skus.map((entry) => entry.sku).sort();
      expect([...activeCarrying(key)].sort(), "products.data.ts").toEqual(
        expected,
      );
      expect(
        PROJECTED.filter(
          (row) => row.status === "active" && row.occasions.includes(key),
        )
          .map((row) => row.sku)
          .sort(),
        "seed/data/products.json",
      ).toEqual(expected);
    },
  );

  it("gives a funeral piece only `sympathy` and `all_saints`, in the data and in Appendix A", () => {
    const funeral = PRODUCTS.filter(
      (product) => product.productType === "funeral",
    );
    expect(funeral).toHaveLength(10);
    for (const product of funeral) {
      for (const key of product.occasions) {
        expect(["sympathy", "all_saints"], `${product.sku} ${key}`).toContain(
          key,
        );
      }
    }
    const funeralSkus = new Set(funeral.map((product) => product.sku));
    for (const [key, hub] of Object.entries(APPENDIX)) {
      for (const entry of hub.skus) {
        if (funeralSkus.has(entry.sku)) {
          expect(["sympathy", "all_saints"], `${key} ${entry.sku}`).toContain(
            key,
          );
        }
      }
    }
  });

  it("tags no product anew unless its primary photograph is approved", () => {
    const primary = new Map<string, string[]>();
    for (const row of MEDIA) {
      if (row.isPrimary !== true || row.productSku === undefined) continue;
      primary.set(row.productSku, [
        ...(primary.get(row.productSku) ?? []),
        row.reviewState,
      ]);
    }
    for (const [key, hub] of Object.entries(APPENDIX)) {
      const existing = new Set(
        hub.skus.filter((entry) => entry.existing).map((entry) => entry.sku),
      );
      // Read off the data, not the fixture, so a tag added beside the Appendix is judged too.
      for (const sku of activeCarrying(key)) {
        if (existing.has(sku)) continue;
        expect(primary.get(sku), `${key} ${sku}`).toEqual(["approved"]);
      }
    }
    // The two products the amendment names as excluded, and why.
    expect(primary.get("FO-PT-004")).toEqual(["rejected"]);
    expect(primary.get("FO-PT-006")).toEqual(["rejected"]);
  });
});

describe("AC-72: each Appendix A hub renders at least six cards (T-72, unit half)", () => {
  it.each(LOCALES)(
    "%s: listingView() gives every Appendix hub six or more hubItems",
    async (locale) => {
      const hubs = new Map(
        (await listingPages(locale))
          .filter((page) => page.pageType === "occasionHub")
          .map((page) => [page.entityKey ?? "", page.slug ?? ""]),
      );
      for (const key of Object.keys(APPENDIX)) {
        const slug = hubs.get(key);
        expect(slug, `${locale} ${key} hub exists`).toBeDefined();
        const view = await listingView(
          { locale, pageType: "occasionHub", entity: slug },
          { from: FROM },
        );
        expect(
          view?.hubItems.length ?? 0,
          `${locale} ${key}`,
        ).toBeGreaterThanOrEqual(PRODUCT_COUNT_FLOOR);
        expect(view?.resultCount, `${locale} ${key}`).toBe(
          APPENDIX[key]?.count,
        );
      }
    },
  );
});

describe("AC-73: the country occasion pages follow the hubs (T-73, unit half)", () => {
  /** Does the committed calendar mark this pair observed? */
  const observed = (key: string, iso2: string): boolean =>
    committedOccasionCalendar.some(
      (row) =>
        row.occasionKey === key && row.countryIso2 === iso2 && row.observed,
    );

  it("exists for exactly the observed pairs at or above the floor, with the hub's product count", async () => {
    const pages = await listingPages("en");
    const country = new Map(
      pages
        .filter((page) => page.pageType === "countryOccasion")
        .map((page) => [
          `${page.entityKey ?? ""}:${page.countryIso ?? ""}`,
          page,
        ]),
    );
    const hubs = new Map(
      pages
        .filter((page) => page.pageType === "occasionHub")
        .map((page) => [page.entityKey ?? "", page]),
    );
    let checked = 0;
    for (const key of Object.keys(APPENDIX)) {
      const hub = await listingView(
        { locale: "en", pageType: "occasionHub", entity: hubs.get(key)?.slug },
        { from: FROM },
      );
      for (const iso2 of publishedCountries()) {
        const expected =
          observed(key, iso2) &&
          (await countProductsFor(key, iso2)) >= PRODUCT_COUNT_FLOOR;
        const page = country.get(`${key}:${iso2}`);
        expect(page !== undefined, `${key} in ${iso2}`).toBe(expected);
        if (page === undefined) continue;
        checked += 1;
        const view = await listingView(
          {
            locale: "en",
            pageType: "countryOccasion",
            country: page.countrySlug,
            entity: page.slug,
          },
          { from: FROM },
        );
        expect(view?.resultCount, page.path).toBe(hub?.resultCount);
      }
    }
    // 52 of the 59 country occasion pages are Appendix A occasions (Mother's Day is the rest).
    expect(checked).toBe(52);
  });

  it("drops a pair one product below the floor: Sant Jordi in Spain at five", async () => {
    const before = (await listingPages("en")).map((page) => page.path);
    expect(before).toContain("/en/spain/occasions/sant-jordi");
    countOverrides.set("sant_jordi:ES", PRODUCT_COUNT_FLOOR - 1);
    const after = (await listingPages("en")).map((page) => page.path);
    expect(after).not.toContain("/en/spain/occasions/sant-jordi");
    // Only that page: every other URL of the set is untouched.
    expect(before.filter((path) => !after.includes(path))).toEqual([
      "/en/spain/occasions/sant-jordi",
    ]);
  });
});
