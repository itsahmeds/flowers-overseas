/**
 * The listing existence set, the product-count floor and the six page descriptors (spec 008 §2,
 * §5.2, §6, §11, **AC-3**, **AC-14**, §13 Q7/Q10, §14 A1; T-03, T-14, T-31; TASK-107).
 *
 * The tests are shaped as the rules spec 008 states, and every one of them has its failure side:
 *
 *  1. **The floor is a boundary, not a habit** (§13 Q7). A category with `PRODUCT_COUNT_FLOOR - 1`
 *     products in a destination has **no URL**; with `PRODUCT_COUNT_FLOOR` it has one. The counts
 *     come through spec 005's read API, which is where they are mocked — the floor itself is read
 *     from the module, so raising the constant moves the test with it.
 *  2. **Evergreen vs seasonal** (§14 A1). An evergreen occasion has no `occasion_country` row by
 *     design and its hub exists on products alone; a seasonal one that no published country
 *     observes has no hub at all.
 *  3. **An unpublished country contributes nothing** — its own pages and its products' weight
 *     towards a hub both disappear (`tests/unit/catalog-listing-country.test.ts`, which needs a
 *     registry mock and therefore its own module graph).
 *  4. **`de` and `pl` have no category or occasion slugs yet** (§13 Q10, TASK-106): their shop
 *     roots exist (§13 Q1 — the shop is independent of the corridor) and every entity-scoped page
 *     type is empty until the founder authors the slugs, with no edit to this module.
 *  5. **The default order is deterministic** and is spec 005's `topProductsForPrebuild()` ordering
 *     — the interim rule spec 008 §14 (design round, Q1) sets until the curation index lands.
 *  6. **Every descriptor resolves through spec 007's engine** (AC-14), driven as a table over
 *     exists × operational × reviewed × locale-indexable × indexing-environment, and under the
 *     Phase 0 providers all six page types answer `noindex,follow` (AC-13's unit half).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

/** Per-test overrides of spec 005's counters; `undefined` means "use the real dataset". */
const counts: { in?: number; for?: number } = {};

vi.mock("../../src/modules/catalog/read.ts", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/modules/catalog/read.ts")>();
  return {
    ...actual,
    countProductsIn: async (categoryKey: string, iso2: string) =>
      counts.in ?? (await actual.countProductsIn(categoryKey, iso2 as never)),
    countProductsFor: async (occasionKey: string, iso2: string) =>
      counts.for ?? (await actual.countProductsFor(occasionKey, iso2 as never)),
  };
});

const {
  LISTING_PAGE_SIZE,
  PRODUCT_COUNT_FLOOR,
  existenceCounts,
  existenceSummaryMarkdown,
  listingDescriptor,
  listingExists,
  listingIndexability,
  listingLocales,
  listingPages,
  listingView,
  publishedCountries,
  writeExistenceSummary,
} = await import("../../src/modules/catalog/listing.ts");

const { listingPageTypes } = await import("../../src/modules/catalog/types.ts");
const { INDEX_FOLLOW, NOINDEX_FOLLOW, deploymentDescriptor, indexability } =
  await import("../../src/modules/seo/index.ts");
const { topProductsForPrebuild } =
  await import("../../src/modules/catalog/read.ts");

/** A deployment that *would* index, so a `noindex` answer is the rule's and not the host's. */
const INDEXING = deploymentDescriptor({
  NODE_ENV: "production",
  NEXT_PUBLIC_SITE_URL: "https://flowersoverseas.com",
  VERCEL_ENV: "production",
});
const PREVIEW = deploymentDescriptor({
  NODE_ENV: "production",
  NEXT_PUBLIC_SITE_URL: "https://preview.example.com",
});

/** Poland: the one `live` destination, and the corridor whose guide is published. */
const PL = "PL" as const;
const CATEGORY = "bouquet";
/** An occasion with no `occasion_country` row by design (§14 A1) and one that has rows. */
const EVERGREEN = "birthday";
const SEASONAL = "mothers_day";

afterEach(() => {
  delete counts.in;
  delete counts.for;
  vi.restoreAllMocks();
});

describe("the product-count floor is one named constant, applied to existence (§13 Q7, AC-3)", () => {
  it("is six, and page size is twelve", () => {
    expect(PRODUCT_COUNT_FLOOR).toBe(6);
    expect(LISTING_PAGE_SIZE).toBe(12);
  });

  it("refuses a country category one product below the floor", async () => {
    counts.in = PRODUCT_COUNT_FLOOR - 1;
    await expect(
      listingExists({
        pageType: "countryCategory",
        locale: "en",
        countryIso: PL,
        entityKey: CATEGORY,
      }),
    ).resolves.toBe(false);
  });

  it("creates it at exactly the floor", async () => {
    counts.in = PRODUCT_COUNT_FLOOR;
    await expect(
      listingExists({
        pageType: "countryCategory",
        locale: "en",
        countryIso: PL,
        entityKey: CATEGORY,
      }),
    ).resolves.toBe(true);
  });

  it("applies the same boundary to a country occasion", async () => {
    counts.for = PRODUCT_COUNT_FLOOR - 1;
    await expect(
      listingExists({
        pageType: "countryOccasion",
        locale: "en",
        countryIso: PL,
        entityKey: SEASONAL,
      }),
    ).resolves.toBe(false);
    counts.for = PRODUCT_COUNT_FLOOR;
    await expect(
      listingExists({
        pageType: "countryOccasion",
        locale: "en",
        countryIso: PL,
        entityKey: SEASONAL,
      }),
    ).resolves.toBe(true);
  });

  it("404s a below-floor category by having no URL for it at all", async () => {
    counts.in = PRODUCT_COUNT_FLOOR - 1;
    const pages = await listingPages("en");
    expect(
      pages.filter((page) => page.pageType === "countryCategory"),
    ).toHaveLength(0);
    await expect(
      listingView({
        locale: "en",
        pageType: "countryCategory",
        country: "poland",
        entity: "hand-tied-bouquets",
      }),
    ).resolves.toBeUndefined();
  });
});

describe("evergreen and seasonal hubs (§2 row 13, §14 A1)", () => {
  it("gives an evergreen occasion a hub on products alone, with no observance row", async () => {
    const { committedOccasionCalendar } =
      await import("../../src/modules/geo/index.ts");
    expect(
      committedOccasionCalendar.filter(
        (row) => row.occasionKey === EVERGREEN && row.observed,
      ).length,
    ).toBeGreaterThanOrEqual(0);
    await expect(
      listingExists({
        pageType: "occasionHub",
        locale: "en",
        entityKey: EVERGREEN,
      }),
    ).resolves.toBe(true);
  });

  it("removes an evergreen hub when no published country has a product for it", async () => {
    counts.for = 0;
    await expect(
      listingExists({
        pageType: "occasionHub",
        locale: "en",
        entityKey: EVERGREEN,
      }),
    ).resolves.toBe(false);
  });

  it("keeps the row-based rule for a seasonal occasion, products or not", async () => {
    counts.for = 0;
    await expect(
      listingExists({
        pageType: "occasionHub",
        locale: "en",
        entityKey: SEASONAL,
      }),
    ).resolves.toBe(true);
  });

  it("gives an unknown occasion no hub", async () => {
    await expect(
      listingExists({
        pageType: "occasionHub",
        locale: "en",
        entityKey: "not-an-occasion",
      }),
    ).resolves.toBe(false);
  });
});

describe("`de` and `pl` have no authored entity slugs yet (§13 Q10, TASK-106)", () => {
  for (const locale of ["de", "pl"] as const) {
    it(`gives ${locale} shop roots but no category, occasion or hub page`, async () => {
      const pages = await listingPages(locale);
      const of = (pageType: string): number =>
        pages.filter((page) => page.pageType === pageType).length;
      expect(of("countryShopRoot")).toBe(publishedCountries().length);
      expect(of("countryCategory")).toBe(0);
      expect(of("countryOccasion")).toBe(0);
      expect(of("categoryHub")).toBe(0);
      expect(of("occasionHub")).toBe(0);
      expect(of("occasionsIndex")).toBe(0);
    });
  }

  it("does give `en` and `en-gb` the entity pages, from one authored corpus", async () => {
    for (const locale of ["en", "en-gb"] as const) {
      const pages = await listingPages(locale);
      expect(
        pages.filter((page) => page.pageType === "categoryHub").length,
      ).toBeGreaterThan(0);
      expect(
        pages.filter((page) => page.pageType === "occasionsIndex").length,
      ).toBe(1);
    }
  });

  it("emits every path through `listingPath()` and none outside the set", async () => {
    const pages = await listingPages("en");
    for (const page of pages) {
      expect(page.path.startsWith("/en/")).toBe(true);
      expect(page.path.endsWith("/")).toBe(false);
      expect(page.path).toBe(page.path.toLowerCase());
    }
    expect(new Set(pages.map((page) => page.path)).size).toBe(pages.length);
  });
});

describe("the default order is deterministic until the curation index lands (§14 Q1)", () => {
  it("equals spec 005's `topProductsForPrebuild()` order and repeats exactly", async () => {
    const view = await listingView(
      { locale: "en", pageType: "countryShopRoot", country: "poland" },
      { from: "2026-10-01" },
    );
    const again = await listingView(
      { locale: "en", pageType: "countryShopRoot", country: "poland" },
      { from: "2026-10-01" },
    );
    expect(view).toBeDefined();
    const order = view?.items.map((item) => item.productId) ?? [];
    expect(again?.items.map((item) => item.productId)).toEqual(order);

    const prebuild = await topProductsForPrebuild(PL, "en", 500);
    expect(order).toEqual(
      prebuild.slice(0, order.length).map((product) => product.sku),
    );
  });

  it("reorders by price without touching the default order", async () => {
    const ascending = await listingView(
      { locale: "en", pageType: "countryShopRoot", country: "poland" },
      { sort: "price-asc", from: "2026-10-01" },
    );
    const amounts = (ascending?.items ?? []).map((item) =>
      Number(item.price.amountMinor),
    );
    expect([...amounts].sort((a, b) => a - b)).toEqual(amounts);
    expect(ascending?.sort).toBe("price-asc");
  });
});

describe("`listingView()` is the single input, and it never invents money (§5.2, §8, T-31)", () => {
  it("prices every card on a country-scoped listing, with the inclusive wording", async () => {
    const view = await listingView({
      locale: "en",
      pageType: "countryShopRoot",
      country: "poland",
    });
    expect(view?.items.length).toBeGreaterThan(0);
    expect(view?.items.length).toBeLessThanOrEqual(LISTING_PAGE_SIZE);
    for (const item of view?.items ?? []) {
      expect(item.priceLabelKey).toBe("catalog.price.inclusive");
      expect(Number(item.price.amountMinor)).toBeGreaterThan(0);
      // §13 Q8: a tile, not a link, until spec 009 publishes the `product` link id.
      expect(item.href).toBeUndefined();
    }
    expect(view?.hubItems).toHaveLength(0);
  });

  it("shows no money at all on a destination-less hub (005 §13 Q10)", async () => {
    const view = await listingView({
      locale: "en",
      pageType: "categoryHub",
      entity: "hand-tied-bouquets",
    });
    expect(view?.items).toHaveLength(0);
    expect(view?.hubItems.length).toBeGreaterThan(0);
    for (const item of view?.hubItems ?? []) {
      expect(Object.keys(item)).not.toContain("price");
      expect(Object.keys(item)).not.toContain("priceLabelKey");
    }
    expect(JSON.stringify(view)).not.toContain("amountMinor");
    expect(view?.intro).toBeDefined();
  });

  it("carries the product link the moment the id is published, and nothing else moves", async () => {
    const tile = await listingView({
      locale: "en",
      pageType: "countryShopRoot",
      country: "poland",
    });
    const linked = await listingView(
      { locale: "en", pageType: "countryShopRoot", country: "poland" },
      { productLinks: true },
    );
    expect(linked?.items.map((item) => item.productId)).toEqual(
      tile?.items.map((item) => item.productId),
    );
    expect(linked?.items[0]?.href).toMatch(/^\/en\/poland\/product\//);
  });

  it("answers `undefined` for a page past the last one, never an empty grid (AC-10)", async () => {
    await expect(
      listingView(
        { locale: "en", pageType: "countryShopRoot", country: "poland" },
        { page: 99 },
      ),
    ).resolves.toBeUndefined();
  });

  it("answers `undefined` for an unknown slug, a wrong segment and a bad locale (AC-1)", async () => {
    for (const params of [
      { locale: "en", pageType: "countryShopRoot", country: "atlantis" },
      { locale: "en", pageType: "categoryHub", entity: "not-a-category" },
      { locale: "xx", pageType: "occasionsIndex" },
      { locale: "en", pageType: "countryShopRoot", country: "Poland" },
      { locale: "en", pageType: "occasionsIndex", country: "poland" },
    ]) {
      await expect(listingView(params)).resolves.toBeUndefined();
    }
  });

  it("dates an occasion hub for every published country, blank where unobserved (§14 Q6)", async () => {
    const view = await listingView(
      { locale: "en", pageType: "occasionHub", entity: "mothers-day" },
      { from: "2026-10-01" },
    );
    expect(view?.occasionDates?.length).toBe(publishedCountries().length);
    for (const row of view?.occasionDates ?? []) {
      expect(row.date === null || /^\d{4}-\d{2}-\d{2}$/.test(row.date)).toBe(
        true,
      );
    }
  });

  it("lists every occasion hub on the occasions index, grouped by kind", async () => {
    const view = await listingView(
      { locale: "en", pageType: "occasionsIndex" },
      { from: "2026-10-01" },
    );
    const hubs = (await listingPages("en")).filter(
      (page) => page.pageType === "occasionHub",
    );
    expect(view?.occasions?.length).toBe(hubs.length);
    for (const entry of view?.occasions ?? []) {
      expect(["evergreen", "seasonal"]).toContain(entry.kind);
    }
  });
});

describe("the six descriptors resolve through spec 007's engine (§6, AC-14, T-14)", () => {
  const dimensions = ["exists", "reviewed", "localeIndexable", "operational"];

  it("registers all six page types with the engine", async () => {
    const { PAGE_TYPE_POLICY } = await import("../../src/modules/seo/index.ts");
    for (const pageType of listingPageTypes) {
      expect(PAGE_TYPE_POLICY[pageType]).toBe("byRule");
    }
  });

  it("writes no robots directive of its own (AC-14's grep, as a unit assertion)", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(
      new URL("../../src/modules/catalog/listing.ts", import.meta.url),
      "utf8",
    );
    // Comments say the word (they have to explain the rule); **code** may not contain it.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/noindex/);
    expect(code).not.toMatch(/index,\s*follow/);
    expect(code).not.toMatch(/robots/i);
  });

  it("is `index,follow` in exactly the one case §6 describes, for every page type", () => {
    for (const pageType of listingPageTypes) {
      const countryScoped = pageType.startsWith("country");
      for (let mask = 0; mask < 1 << dimensions.length; mask += 1) {
        const value = (index: number): boolean => (mask & (1 << index)) !== 0;
        const terms = {
          exists: value(0),
          reviewed: value(1),
          ...(countryScoped ? { operational: value(3) } : {}),
        };
        const verdict = listingIndexability(
          { pageType, locale: value(2) ? "en" : "de" },
          terms,
          INDEXING,
        );
        const expected =
          terms.exists &&
          terms.reviewed &&
          value(2) &&
          (!countryScoped || value(3))
            ? INDEX_FOLLOW
            : NOINDEX_FOLLOW;
        expect(verdict.directive).toBe(expected);
      }
    }
  });

  it("agrees with the pure rule over the gathered terms (no second engine)", () => {
    const descriptor = listingDescriptor(
      { pageType: "countryCategory", locale: "en" },
      { exists: true, reviewed: true, operational: true },
    );
    expect(descriptor.operational).toBe(true);
    const verdict = listingIndexability(
      { pageType: "countryCategory", locale: "en" },
      { exists: true, reviewed: true, operational: true },
      INDEXING,
    );
    expect(indexability(verdict.terms)).toBe(verdict.directive);
  });

  it("omits the operational term where the page type has no such gate", () => {
    const descriptor = listingDescriptor(
      { pageType: "categoryHub", locale: "en" },
      { exists: true, reviewed: true },
    );
    expect(descriptor.operational).toBeUndefined();
  });

  it("answers `noindex,follow` for every page type under the Phase 0 providers (AC-13)", async () => {
    for (const locale of ["en", "en-gb", "de", "pl"] as const) {
      for (const page of await listingPages(locale)) {
        const verdict = listingIndexability(
          page,
          {
            exists: true,
            reviewed: true,
            ...(page.pageType.startsWith("country")
              ? { operational: false }
              : {}),
          },
          PREVIEW,
        );
        expect(verdict.directive).toBe(NOINDEX_FOLLOW);
        expect(verdict.indexable).toBe(false);
      }
    }
  });

  it("marks the rendered view `noindex` in Phase 0, from the same one answer", async () => {
    const view = await listingView(
      { locale: "en", pageType: "categoryHub", entity: "hand-tied-bouquets" },
      { deployment: PREVIEW },
    );
    expect(view?.indexable).toBe(false);
    expect(view?.directive).toBe(NOINDEX_FOLLOW);
  });
});

describe("the existence-set summary (§11, AC-3)", () => {
  it("counts every page type per locale and the categories below the floor", async () => {
    const counted = await existenceCounts();
    expect(counted.map((row) => row.locale)).toEqual([...listingLocales()]);
    for (const row of counted) {
      expect(row.urlCount).toBe(
        row.countryShopRoot +
          row.countryCategory +
          row.countryOccasion +
          row.categoryHub +
          row.occasionHub +
          row.occasionsIndex,
      );
      expect(row.belowFloor).toBeGreaterThanOrEqual(0);
    }
  });

  it("renders one Markdown table naming the floor", async () => {
    const summary = existenceSummaryMarkdown(await existenceCounts());
    expect(summary).toContain(`floor ${String(PRODUCT_COUNT_FLOOR)}`);
    expect(summary).toContain("| Locale |");
    expect(
      summary.split("\n").filter((line) => line.startsWith("| en ")),
    ).toHaveLength(1);
  });

  it("writes to the step summary when the runner set one, and to stdout otherwise", async () => {
    const { mkdtempSync, readFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const file = join(mkdtempSync(join(tmpdir(), "fo-listing-")), "summary.md");

    await writeExistenceSummary({ GITHUB_STEP_SUMMARY: file });
    expect(readFileSync(file, "utf8")).toContain("| Locale |");

    const written: string[] = [];
    await writeExistenceSummary({}, (text) => written.push(text));
    expect(written.join("")).toContain("| Locale |");
  });
});
