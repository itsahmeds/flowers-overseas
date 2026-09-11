/**
 * The taxonomy read API (spec 005 §2 "Taxonomy", §5.4, §6; the read-API half of T-04 and the
 * facet/indexable cases feeding T-19; TASK-063).
 *
 * Six claims are pinned here, and each one is a rule from a plan section rather than a preference:
 *
 *  1. **The counters are counts, never verdicts.** `countProductsIn` / `countProductsFor` are
 *     `plan/02` §6's six-product rule *as a function*, and the threshold itself is spec 008's
 *     (spec 005 §2): the `orchids` hub has three products and the `17_mai` occasion has none, and
 *     this module reports 3 and 0 rather than "not indexable".
 *  2. **Facets can never be indexable.** `resolveFacets()` returns the literal `false` for every
 *     input and `isAuthoredFacetPath()` returns `false` for every path in Phase 0, so no colour or
 *     price facet URL can become indexable by accident (`plan/02` §7).
 *  3. **A facet selection is canonical and order-independent**, so two orderings of the same
 *     filter are the same value and the same cache key.
 *  4. **Nothing is indexable yet, for a stated reason.** `hasIndexableProducts()` is `false`
 *     everywhere because the dataset ships no description and no reviewed translation
 *     (spec 005 §2 "Deliberately absent", §6, AC-6) — the term record says which term fails, so
 *     the answer is legible and flips as data when spec 006's copy lands.
 *  5. **The prebuild ordering is deterministic** and carries no relevance model (spec 005 §3, §8):
 *     the same call returns the same SKUs in the same order, on any machine, in any process.
 *  6. **No geography but the destination.** Every signature takes a destination ISO or nothing;
 *     AC-18's whole-module gate is TASK-069's, and this file pins the read API's half of it.
 */
import { describe, expect, it } from "vitest";

import { CATEGORIES } from "../../src/config/catalogue/categories.data.ts";
import { OCCASIONS } from "../../src/config/catalogue/occasions.data.ts";
import { PRODUCTS } from "../../src/config/catalogue/products.data.ts";
import { facetNames } from "../../src/config/catalogue/schemas.ts";
import { COUNTRIES } from "../../src/config/countries.ts";
import { collator } from "../../src/modules/i18n/collate.ts";
import {
  countProductsFor,
  countProductsIn,
  getCategory,
  getOccasion,
  getProduct,
  hasIndexableProducts,
  isAuthoredFacetPath,
  listProducts,
  productIndexability,
  resolveFacets,
  topProductsForPrebuild,
} from "../../src/modules/catalog/read.ts";

const LIVE = "PL" as const;
const DEMO = "DE" as const;

/* -------------------------------------------------------------------------- */
/* Entities.                                                                  */
/* -------------------------------------------------------------------------- */

describe("getProduct (spec 005 §5.2)", () => {
  it("returns the authored product as a view model, keyed on its SKU", async () => {
    await expect(getProduct("FO-BQ-001")).resolves.toEqual({
      sku: "FO-BQ-001",
      name: "Amber Hour",
      slug: "amber-hour",
      productType: "bouquet",
      primaryFlower: "roses",
      flowerTypes: ["roses", "mixed"],
      colourPrimary: "orange",
      colours: ["orange"],
      style: "classic",
      priceTier: "classic",
      occasions: ["birthday", "thank_you", "just_because"],
      substitutionClass: "main_flower",
      vaseIncluded: false,
      stemCount: 18,
      freshnessDays: 7,
      allergenNote: false,
      partnerOnly: false,
      status: "active",
    });
  });

  it("carries no price, no description and no imagery (spec 005 §3, EU 2018/302)", async () => {
    const product = await getProduct("FO-BQ-001");

    for (const forbidden of [
      "price",
      "amountMinor",
      "currency",
      "description",
      "media",
      "image",
    ]) {
      expect(Object.keys(product ?? {}), forbidden).not.toContain(forbidden);
    }
  });

  it("returns null for a well-formed SKU that is not in the catalogue", async () => {
    await expect(getProduct("FO-BQ-999")).resolves.toBeNull();
  });

  it("rejects a malformed SKU at the boundary rather than searching for it", async () => {
    await expect(getProduct("amber-hour")).rejects.toThrow();
  });
});

describe("getCategory and getOccasion (spec 005 §2)", () => {
  it("returns a category with its facet kind and its label key, never a label", async () => {
    await expect(getCategory("roses")).resolves.toEqual({
      key: "roses",
      kind: "flowerType",
      labelKey: "catalog.facet.flowerType.roses",
      sort: expect.any(Number) as number,
    });
  });

  it("returns an occasion with its `plan/10` §1.1 kind", async () => {
    await expect(getOccasion("valentines")).resolves.toMatchObject({
      key: "valentines",
      kind: "seasonal",
      labelKey: "catalog.facet.occasion.valentines",
    });
    await expect(getOccasion("birthday")).resolves.toMatchObject({
      kind: "evergreen",
    });
  });

  it("returns null for an unknown key, so a route can 404 rather than throw", async () => {
    await expect(getCategory("tulipsx")).resolves.toBeNull();
    await expect(getOccasion("not-an-occasion")).resolves.toBeNull();
  });

  it("hands over every authored category and occasion exactly once", async () => {
    for (const category of CATEGORIES) {
      await expect(getCategory(category.key)).resolves.toMatchObject({
        key: category.key,
      });
    }
    for (const occasion of OCCASIONS) {
      await expect(getOccasion(occasion.key)).resolves.toMatchObject({
        key: occasion.key,
      });
    }
  });
});

/* -------------------------------------------------------------------------- */
/* listProducts.                                                              */
/* -------------------------------------------------------------------------- */

describe("listProducts (spec 005 §3, §8: deterministic, no relevance model)", () => {
  it("lists the 84 active products in ascending SKU order by default", async () => {
    const products = await listProducts();

    expect(products).toHaveLength(84);
    expect(products.map((product) => product.sku)).toEqual(
      [...products.map((product) => product.sku)].sort(),
    );
  });

  it("returns the same order on every call, with no locale and no ranking input", async () => {
    const first = await listProducts();
    const second = await listProducts();

    expect(second.map((product) => product.sku)).toEqual(
      first.map((product) => product.sku),
    );
  });

  it("filters within a facet as OR and across facets as AND", async () => {
    const red = await listProducts({ facets: { colour: ["red"] } });
    const redOrWhite = await listProducts({
      facets: { colour: ["red", "white"] },
    });
    const redRoses = await listProducts({
      facets: { colour: ["red"], flowerType: ["roses"] },
    });

    expect(red.length).toBeGreaterThan(0);
    expect(redOrWhite.length).toBeGreaterThan(red.length);
    expect(redRoses.length).toBeLessThanOrEqual(red.length);
    for (const product of redRoses) {
      expect(product.colours).toContain("red");
      expect(product.flowerTypes).toContain("roses");
    }
  });

  it("matches a facet on every value a product carries, not only the primary", async () => {
    const mixed = await listProducts({ facets: { flowerType: ["mixed"] } });

    expect(mixed.length).toBeGreaterThan(
      PRODUCTS.filter((product) => product.primaryFlower === "mixed").length,
    );
  });

  it("keeps only products with an active retail price for the destination", async () => {
    const inPoland = await listProducts({ countryIso: LIVE });

    expect(inPoland).toHaveLength(84);
  });

  it("pages deterministically with `limit` and `offset`", async () => {
    const all = await listProducts();
    const page = await listProducts({ limit: 6, offset: 12 });

    expect(page.map((product) => product.sku)).toEqual(
      all.slice(12, 18).map((product) => product.sku),
    );
  });

  it("rejects a misspelt filter, an unknown facet value and a non-canonical selection", async () => {
    await expect(
      listProducts({ colours: ["red"] } as unknown as { limit?: number }),
    ).rejects.toThrow();
    await expect(
      listProducts({ facets: { colour: ["scarlet"] } }),
    ).rejects.toThrow();
    await expect(
      listProducts({ facets: { colour: ["white", "red"] } }),
    ).rejects.toThrow();
    await expect(listProducts({ facets: { colour: [] } })).rejects.toThrow();
    await expect(listProducts({ limit: 0 })).rejects.toThrow();
    await expect(
      listProducts({ countryIso: "US" as unknown as typeof LIVE }),
    ).rejects.toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/* Counters — the six-product rule as a function, never as a judgement.       */
/* -------------------------------------------------------------------------- */

describe("countProductsIn / countProductsFor (plan/02 §6; spec 005 §2)", () => {
  it("counts the five product-type categories against plan/10 §2.1's split", async () => {
    const expected = {
      bouquet: 40,
      arrangement: 14,
      plant: 8,
      funeral: 10,
      gift_set: 12,
    } as const;

    for (const [key, count] of Object.entries(expected)) {
      await expect(countProductsIn(key, LIVE)).resolves.toBe(count);
    }
  });

  it("counts a flower-type hub on facet membership", async () => {
    await expect(countProductsIn("roses", LIVE)).resolves.toBe(15);
    await expect(countProductsIn("tulips", LIVE)).resolves.toBe(8);
  });

  it("counts an occasion category and the same occasion identically", async () => {
    await expect(countProductsIn("birthday", LIVE)).resolves.toBe(27);
    await expect(countProductsFor("birthday", LIVE)).resolves.toBe(27);
  });

  it("reports a count below six rather than a verdict — the threshold is spec 008's", async () => {
    // `plan/02` §6 makes ≥6 products the condition for an indexable category page and
    // `plan/02` §7 makes a failing page a 404 rather than a `noindex`. Both decisions are the
    // page loader's; 005 supplies the number, and these two are the numbers that prove it.
    await expect(countProductsIn("orchids", LIVE)).resolves.toBe(3);
    await expect(countProductsFor("17_mai", LIVE)).resolves.toBe(0);
  });

  it("counts per destination, and the destination is the only geography it takes", async () => {
    for (const country of COUNTRIES) {
      await expect(countProductsIn("bouquet", country.iso2)).resolves.toBe(40);
    }
  });

  it("throws on a key that is not an authored category or occasion", async () => {
    await expect(countProductsIn("red-roses", LIVE)).rejects.toThrow();
    await expect(countProductsFor("bouquet", LIVE)).rejects.toThrow();
  });

  it("rejects an unconfigured destination", async () => {
    await expect(
      countProductsIn("bouquet", "US" as unknown as typeof LIVE),
    ).rejects.toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/* Facets — parsed, canonical, order-independent, never indexable.            */
/* -------------------------------------------------------------------------- */

describe("resolveFacets (plan/02 §7; spec 005 §2, §6)", () => {
  it("parses the facet parameters of plan/02 §7 into a canonical selection", () => {
    const resolved = resolveFacets({ colour: "red", "flower-type": "roses" });

    expect(resolved.facets).toEqual({ colour: ["red"], flowerType: ["roses"] });
    expect(resolved.canonicalQuery).toBe("flower-type=roses&colour=red");
    expect(resolved.ignored).toEqual([]);
  });

  it("is `indexable: false` for every input, including no input at all", () => {
    for (const input of [
      {},
      { colour: "red" },
      { colour: ["red", "white"], style: "modern" },
      { q: "roses" },
    ]) {
      expect(resolveFacets(input).indexable).toBe(false);
    }
  });

  it("is order-independent: two orderings of one filter are the same value", () => {
    const a = resolveFacets(
      new URLSearchParams("colour=white&colour=red&flower-type=tulips"),
    );
    const b = resolveFacets(
      new URLSearchParams("flower-type=tulips&colour=red&colour=white"),
    );

    expect(a).toEqual(b);
    expect(a.canonicalQuery).toBe(b.canonicalQuery);
  });

  it("canonicalises values into taxonomy order and drops duplicates", () => {
    const resolved = resolveFacets({ colour: ["white", "red", "red"] });

    expect(resolved.facets.colour).toEqual(["red", "white"]);
    expect(resolved.canonicalQuery).toBe("colour=red,white");
  });

  it("accepts both repeated parameters and comma lists for one facet", () => {
    expect(resolveFacets({ colour: "red,white" }).facets).toEqual(
      resolveFacets({ colour: ["red", "white"] }).facets,
    );
  });

  it("accepts a URLSearchParams and an awaited Next.js searchParams object alike", () => {
    expect(resolveFacets(new URLSearchParams("style=modern")).facets).toEqual(
      resolveFacets({ style: "modern", missing: undefined }).facets,
    );
  });

  it("reports what it dropped instead of widening the filter", () => {
    const resolved = resolveFacets({
      colour: "red,scarlet",
      q: "roses",
      page: "2",
      sort: "price",
    });

    expect(resolved.facets).toEqual({ colour: ["red"] });
    expect(resolved.ignored).toEqual(["colour=scarlet", "page", "q", "sort"]);
  });

  it("omits a facet that selects nothing rather than carrying an empty list", () => {
    expect(resolveFacets({ colour: "", style: [] }).facets).toEqual({});
    expect(resolveFacets({ colour: "scarlet" }).facets).toEqual({});
  });

  it("accepts every facet of plan/10 §1.1 under its kebab-case parameter name", () => {
    const resolved = resolveFacets({
      "product-type": "bouquet",
      occasion: "birthday",
      "flower-type": "roses",
      colour: "red",
      "price-tier": "classic",
      style: "classic",
    });

    expect(Object.keys(resolved.facets).sort()).toEqual([...facetNames].sort());
  });

  it("produces a selection listProducts accepts without a second parse", async () => {
    const resolved = resolveFacets({ colour: ["white", "red"] });

    await expect(
      listProducts({ facets: resolved.facets }),
    ).resolves.not.toHaveLength(0);
  });
});

describe("isAuthoredFacetPath (plan/02 §7; spec 005 §6)", () => {
  it("is false for every path in Phase 0, including the one plan/02 §7 names", () => {
    for (const path of [
      "/en-gb/poland/flowers/red-roses",
      "/pl/polska/kwiaty/czerwone-roze",
      "/en/poland/flowers/roses",
      "/en",
      "/",
      "",
      "not a path",
    ]) {
      expect(isAuthoredFacetPath(path), path).toBe(false);
    }
  });

  it("rejects a non-string rather than coercing it", () => {
    expect(() => isAuthoredFacetPath(42 as unknown as string)).toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/* Indexability.                                                              */
/* -------------------------------------------------------------------------- */

describe("hasIndexableProducts (spec 005 §6; plan/02 §10)", () => {
  it("is false for every (destination, locale) in Phase 0: the copy does not exist yet", async () => {
    for (const country of COUNTRIES) {
      for (const locale of ["en", "en-gb", "de", "pl"] as const) {
        await expect(
          hasIndexableProducts(country.iso2, locale),
          `${country.iso2}/${locale}`,
        ).resolves.toBe(false);
      }
    }
  });

  it("names the failing term, so the answer is legible and flips as data", async () => {
    const terms = await productIndexability("FO-BQ-001", "en", LIVE);

    expect(terms).toEqual({
      countryLive: true,
      productActive: true,
      activePrice: true,
      descriptionPresent: false,
      translationReviewed: false,
      localeIndexable: true,
      indexable: false,
    });
  });

  it("fails the country term for a demo destination — a data flip, not a code branch", async () => {
    await expect(
      productIndexability("FO-BQ-001", "en", DEMO),
    ).resolves.toMatchObject({
      countryLive: false,
      activePrice: true,
      indexable: false,
    });
  });

  it("fails the locale term for a locale spec 003's review gate holds back", async () => {
    await expect(
      productIndexability("FO-BQ-001", "de", LIVE),
    ).resolves.toMatchObject({ localeIndexable: false, indexable: false });
    await expect(
      productIndexability("FO-BQ-001", "en-gb", LIVE),
    ).resolves.toMatchObject({ localeIndexable: true });
  });

  it("throws for a SKU that does not exist, rather than reporting it non-indexable", async () => {
    await expect(
      productIndexability("FO-BQ-999", "en", LIVE),
    ).rejects.toThrow();
  });

  it("rejects an unconfigured locale and an unconfigured destination", async () => {
    await expect(
      hasIndexableProducts(LIVE, "fr" as unknown as "en"),
    ).rejects.toThrow();
    await expect(
      hasIndexableProducts("US" as unknown as typeof LIVE, "en"),
    ).rejects.toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/* Prebuild ordering.                                                         */
/* -------------------------------------------------------------------------- */

describe("topProductsForPrebuild (plan/01 §3; spec 005 §5.4)", () => {
  it("returns n products, deterministically, for the same arguments", async () => {
    const first = await topProductsForPrebuild(LIVE, "en", 50);
    const second = await topProductsForPrebuild(LIVE, "en", 50);

    expect(first).toHaveLength(50);
    expect(second.map((product) => product.sku)).toEqual(
      first.map((product) => product.sku),
    );
  });

  it("orders by the locale's collation of the product name, then by SKU", async () => {
    const products = await topProductsForPrebuild(LIVE, "en", 84);
    const names = products.map((product) => product.name);

    // Asserted against spec 003's collator — the module's own, and the only place in the
    // repository allowed to construct an `Intl.Collator` (`fo/no-adhoc-intl`) — so this pins the
    // contract ("the locale's collation") rather than restating the implementation.
    const compare = collator("en").compare;
    for (const [index, name] of names.entries()) {
      if (index === 0) continue;
      expect(compare(names[index - 1] ?? "", name), name).toBeLessThanOrEqual(
        0,
      );
    }
  });

  it("carries no relevance model: the order is a collation, not a popularity signal", async () => {
    // `plan/01` §3 asks for "the top 50 products per live locale" as a *prebuild* list, and
    // spec 005 §3 forbids a relevance model here (search and ranking are spec 008's). No order
    // exists in Phase 0, so there is no popularity to read; the honest deterministic answer is
    // the locale's own collation, and this test is the record that the omission is intentional.
    const pl = await topProductsForPrebuild(LIVE, "pl", 84);
    const en = await topProductsForPrebuild(LIVE, "en", 84);

    expect(new Set(pl.map((product) => product.sku))).toEqual(
      new Set(en.map((product) => product.sku)),
    );
  });

  it("returns everything available when n exceeds the catalogue", async () => {
    await expect(topProductsForPrebuild(LIVE, "en", 500)).resolves.toHaveLength(
      84,
    );
  });

  it("prebuilds a demo destination too — the page exists, it is merely noindex", async () => {
    await expect(topProductsForPrebuild(DEMO, "en", 10)).resolves.toHaveLength(
      10,
    );
  });

  it("rejects a non-positive n, an unconfigured destination and an unconfigured locale", async () => {
    await expect(topProductsForPrebuild(LIVE, "en", 0)).rejects.toThrow();
    await expect(topProductsForPrebuild(LIVE, "en", 1.5)).rejects.toThrow();
    await expect(
      topProductsForPrebuild("US" as unknown as typeof LIVE, "en", 10),
    ).rejects.toThrow();
    await expect(
      topProductsForPrebuild(LIVE, "fr" as unknown as "en", 10),
    ).rejects.toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/* The geography gate, read-API half (AC-18 in full is TASK-069's).           */
/* -------------------------------------------------------------------------- */

describe("no read function knows where the buyer is (EU 2018/302, ADR-0006)", () => {
  it("names no buyer, IP, geo or visitor parameter anywhere in read.ts", async () => {
    const source = await import("node:fs").then(({ readFileSync }) =>
      readFileSync("src/modules/catalog/read.ts", "utf8"),
    );
    const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

    expect(code).not.toMatch(/buyer|ipAddress|\bgeo\b|visitor|headers\(/i);
  });
});
