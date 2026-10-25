/**
 * The search engine on the committed static catalogue (spec 045 AC-6, AC-7, AC-8, AC-9, AC-11;
 * T-06 to T-09, T-11; TASK-401).
 *
 * Every list is asserted as the **exact ordered SKU array** the engine returns over every page,
 * never as a set of reachable values; where an AC names a set ("exactly the products whose flower
 * types include roses"), the array is also checked against that set computed from the catalogue,
 * so the literal cannot drift from what it claims to be. Tiers are read through the pure
 * `matchDocuments` over the same index, so a tier claim and a list claim cannot disagree.
 *
 * The destination is the registry's, named here as test data; nothing under `src/` names it.
 */
import { beforeAll, describe, expect, it } from "vitest";

import type { LocaleCode } from "../../src/config/locales.ts";
import { listProducts, listingView } from "../../src/modules/catalog/index.ts";
import {
  type MemoryEngine,
  type SearchIndex,
  type SearchSource,
  buildIndex,
  catalogSearchSource,
  matchDocuments,
  memoryEngine,
  parseQuery,
  rankSearchResults,
} from "../../src/modules/search/index.ts";

const DESTINATION = "PL";

let engine: MemoryEngine;
let index: SearchIndex;

beforeAll(async () => {
  engine = memoryEngine({ source: catalogSearchSource });
  index = await buildIndex(catalogSearchSource());
}, 60_000);

/** Every result SKU, in order, across every page. */
async function skus(
  locale: LocaleCode,
  query: string,
  to: string | undefined = DESTINATION.toLowerCase(),
  using: MemoryEngine = engine,
): Promise<string[]> {
  const all: string[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const { view } = await using.search({
      locale,
      query,
      ...(to === undefined ? {} : { to }),
      page,
    });
    if (view.state !== "results") break;
    all.push(...view.cards.map((card) => card.productId));
    if (page >= view.pageCount) break;
  }
  return all;
}

/** `sku:tier` for every match, in rank order, through the pure functions. */
function tiers(locale: LocaleCode, query: string): string[] {
  const shop = index.locales.get(locale)?.shops.get(DESTINATION);
  if (shop === undefined) throw new Error("no shop");
  const parsed = parseQuery(query, locale, []);
  return rankSearchResults(
    matchDocuments(shop, parsed.tokens).map((match) => ({
      ...match,
      marginBand: match.document.marginBand,
      saleable: match.document.saleable,
      hasPhoto: match.document.hasPhoto,
      curationIndex: match.document.curationIndex,
    })),
  ).map((match) => `${match.sku}:${String(match.tier)}`);
}

async function withFlower(flower: string): Promise<string[]> {
  return (await listProducts({ countryIso: DESTINATION }))
    .filter((product) =>
      (product.flowerTypes as readonly string[]).includes(flower),
    )
    .map((product) => product.sku)
    .sort();
}

const ROSES_PL = [
  "FO-BQ-001",
  "FO-GS-001",
  "FO-BQ-003",
  "FO-GS-002",
  "FO-FN-009",
  "FO-AR-002",
  "FO-BQ-005",
  "FO-BQ-004",
  "FO-GS-006",
  "FO-BQ-007",
  "FO-BQ-006",
  "FO-BQ-002",
  "FO-AR-012",
  "FO-FN-004",
  "FO-BQ-008",
];

const ROSES_EN = [
  "FO-BQ-007",
  "FO-BQ-008",
  "FO-BQ-001",
  "FO-GS-001",
  "FO-BQ-003",
  "FO-GS-002",
  "FO-FN-009",
  "FO-AR-002",
  "FO-BQ-005",
  "FO-BQ-004",
  "FO-GS-006",
  "FO-BQ-006",
  "FO-BQ-002",
  "FO-AR-012",
  "FO-FN-004",
  "FO-BQ-029",
  "FO-BQ-025",
  "FO-BQ-028",
];

const TULIPS_PL = [
  "FO-BQ-013",
  "FO-BQ-011",
  "FO-BQ-009",
  "FO-GS-005",
  "FO-BQ-012",
  "FO-AR-005",
  "FO-BQ-010",
  "FO-BQ-014",
];

const SUNFLOWERS = ["FO-BQ-023", "FO-GS-007", "FO-BQ-024", "FO-BQ-025"];

describe("AC-6 (T-06): normalisation makes accents, case and spacing irrelevant", () => {
  it.each(["roza", "róża", "róże", "ROZE", " roze "])(
    "/pl/szukaj %j returns the roses products in §2.5's order",
    async (query) => {
      expect(await skus("pl", query)).toEqual(ROSES_PL);
    },
  );

  it("that list is exactly the products whose flower types include roses", async () => {
    expect([...ROSES_PL].sort()).toEqual(await withFlower("roses"));
  });

  it.each(["krakow", "Kraków"])(
    "/en/search %j returns FO-BQ-009 Kraków Spring first",
    async (query) => {
      expect(await skus("en", query)).toEqual(["FO-BQ-009", "FO-GS-005"]);
    },
  );

  it.each(["Rosen", "rosen", "Rose"])(
    "/de/suche %j returns the same SKU set as `roses` on /en/search",
    async (query) => {
      expect(await skus("en", "roses")).toEqual(ROSES_EN);
      expect([...(await skus("de", query))].sort()).toEqual(
        [...ROSES_EN].sort(),
      );
    },
  );

  it("`Strauß` and `Strauss` both find a product whose German name contains `Strauß`", async () => {
    const renamed = (): SearchSource => {
      const source = catalogSearchSource();
      return {
        ...source,
        products: async (locale, iso2) =>
          (await source.products(locale, iso2)).map((product) =>
            locale === "de" && product.sku === "FO-BQ-001"
              ? { ...product, name: "Bernstein-Strauß" }
              : product,
          ),
      };
    };
    const fixture = memoryEngine({ source: renamed });
    expect(await skus("de", "Strauß", "pl", fixture)).toEqual(["FO-BQ-001"]);
    expect(await skus("de", "Strauss", "pl", fixture)).toEqual(["FO-BQ-001"]);
    expect(await skus("de", "STRAUSS", "pl", fixture)).toEqual(["FO-BQ-001"]);
  });
});

describe("AC-7 (T-07): stems and the last token's prefix", () => {
  it("`rose` and `roses` return the same list on /en/search", async () => {
    expect(await skus("en", "rose")).toEqual(ROSES_EN);
    expect(await skus("en", "roses")).toEqual(ROSES_EN);
  });

  it.each(["tulipany", "tulipanów", "tulipan"])(
    "/pl/szukaj %j returns exactly the tulip products",
    async (query) => {
      expect(await skus("pl", query)).toEqual(TULIPS_PL);
    },
  );

  it("the tulip list is exactly the products whose flower types include tulips", async () => {
    expect([...TULIPS_PL].sort()).toEqual(await withFlower("tulips"));
  });

  it("`sunfl` (the last token, as a prefix) returns exactly the sunflower products", async () => {
    expect(await skus("en", "sunfl")).toEqual(SUNFLOWERS);
    expect([...SUNFLOWERS].sort()).toEqual(await withFlower("sunflowers"));
  });

  it("`su` (2 letters) prefix-matches nothing: no product carries the token `su`", async () => {
    expect(await skus("en", "su")).toEqual([]);
    const { view } = await engine.search({
      locale: "en",
      query: "su",
      to: "pl",
    });
    expect(view.state).toBe("noResults");
  });
});

describe("AC-7: the prefix is the last token's alone", () => {
  it("`yellow sunfl` finds the yellow sunflower products; `sunfl yellow` finds nothing", async () => {
    expect(await skus("en", "yellow sunfl")).toEqual([
      "FO-BQ-023",
      "FO-GS-007",
      "FO-BQ-024",
    ]);
    expect(await skus("en", "sunfl yellow")).toEqual([]);
  });
});

describe("AC-8 (T-08): typo tolerance and its tier", () => {
  it("`sunflwers` returns the sunflower products, every one at tier 2", async () => {
    expect(await skus("en", "sunflwers")).toEqual(SUNFLOWERS);
    expect(tiers("en", "sunflwers")).toEqual(
      SUNFLOWERS.map((sku) => `${sku}:2`),
    );
  });

  it("`orchds` returns the orchid products, every one at tier 2", async () => {
    expect(tiers("en", "orchds")).toEqual([
      "FO-PT-002:2",
      "FO-PT-001:2",
      "FO-PT-003:2",
    ]);
    expect(["FO-PT-001", "FO-PT-002", "FO-PT-003"]).toEqual(
      await withFlower("orchids"),
    );
  });

  it("`tulpis` (one transposition) returns the tulip products at tier 2", async () => {
    expect(tiers("en", "tulpis")).toEqual([
      ...TULIPS_PL.map((sku) => `${sku}:2`),
      // Its description names tulips; it is not a tulip bouquet, and it is a tier-2 result too.
      "FO-BQ-037:2",
    ]);
  });

  it("`tolaps` (distance 2 on a 6-letter word) returns no tulip product", async () => {
    expect(await skus("en", "tolaps")).toEqual([]);
  });

  it("`rse` (3 letters) returns no fuzzy match", async () => {
    expect(await skus("en", "rse")).toEqual([]);
  });

  it("a query whose results mix tiers sorts every tier-2 result after every tier-4 one", () => {
    expect(tiers("en", "róże")).toEqual([
      ...ROSES_PL.map((sku) => `${sku}:4`),
      "FO-BQ-029:2",
      "FO-BQ-025:2",
      "FO-BQ-028:2",
    ]);
  });
});

describe("AC-9 (T-09): facets, the alt field and the SKU", () => {
  it("`red roses` returns the red rose products first, at tier 4, then the rest", async () => {
    expect(tiers("en", "red roses")).toEqual([
      "FO-BQ-002:4",
      "FO-AR-002:4",
      "FO-BQ-006:4",
      "FO-BQ-003:3",
    ]);
    const red = (await listProducts({ countryIso: DESTINATION }))
      .filter(
        (product) =>
          product.flowerTypes.includes("roses") &&
          product.colours.includes("red"),
      )
      .map((product) => product.sku)
      .sort();
    expect(red).toEqual(["FO-AR-002", "FO-BQ-002", "FO-BQ-006"]);
  });

  it("`róże` on /en/search finds the roses products through the alt field, at tier 4", () => {
    expect(
      tiers("en", "róże")
        .filter((entry) => entry.endsWith(":4"))
        .map((entry) => entry.slice(0, -2)),
    ).toEqual(ROSES_PL);
  });

  it("`FO-BQ-001` returns exactly FO-BQ-001, at tier 5", async () => {
    expect(await skus("en", "FO-BQ-001")).toEqual(["FO-BQ-001"]);
    expect(tiers("en", "FO-BQ-001")).toEqual(["FO-BQ-001:5"]);
  });
});

describe("AC-11 (T-11): a country in the words is the destination", () => {
  it("`flowers to poland` with no `to` searches `flowers` in Poland, shop root first in Pages", async () => {
    const named = await engine.search({
      locale: "en",
      query: "flowers to poland",
    });
    expect(named.view.destination).toBe(DESTINATION);
    expect(named.view.pages[0]).toEqual({
      kind: "shop",
      href: "/en/poland/flowers",
    });
    expect(await skus("en", "flowers to poland", undefined)).toEqual(
      await skus("en", "flowers", "pl"),
    );
    expect((await skus("en", "flowers", "pl")).length).toBe(named.view.count);
  });

  it("`polska` on /pl/szukaj shows Poland's shop root in Pages and Poland's selection", async () => {
    const { view } = await engine.search({ locale: "pl", query: "polska" });
    expect(view.state).toBe("empty");
    expect(view.destination).toBe(DESTINATION);
    expect(view.pages).toEqual([{ kind: "shop", href: "/pl/polska/kwiaty" }]);
    const listing = await listingView({
      locale: "pl",
      pageType: "countryShopRoot",
      country: "polska",
    });
    expect(view.selection.map((card) => card.productId)).toEqual(
      listing?.items.map((card) => card.productId),
    );
    expect(view.selection).toHaveLength(12);
  });

  it("the words beat `to`: `poland` with `to=de` searches Poland", async () => {
    const { view } = await engine.search({
      locale: "en",
      query: "poland",
      to: "de",
    });
    expect(view.destination).toBe(DESTINATION);
    expect(view.pages).toEqual([{ kind: "shop", href: "/en/poland/flowers" }]);
  });

  it("with no country in the words and no `to`, there is no destination", async () => {
    const { view } = await engine.search({ locale: "en", query: "roses" });
    expect(view.destination).toBeNull();
    expect(view.state).toBe("noDestination");
    expect(view.cards).toEqual([]);
  });

  it("an unknown `to` is no destination either", async () => {
    const { view } = await engine.search({
      locale: "en",
      query: "roses",
      to: "zz",
    });
    expect(view.destination).toBeNull();
    expect(view.state).toBe("noDestination");
  });
});

describe("the engine's other states (§2.7)", () => {
  it("a blank query is the empty state with the destination's selection", async () => {
    const { view } = await engine.search({
      locale: "en",
      query: "   ",
      to: "pl",
    });
    expect(view.state).toBe("empty");
    expect(view.selection).toHaveLength(12);
  });

  it("one letter is too short", async () => {
    const { view } = await engine.search({
      locale: "en",
      query: "r",
      to: "pl",
    });
    expect(view.state).toBe("tooShort");
    expect(view.cards).toEqual([]);
  });

  it("a page beyond the last is out of range", async () => {
    const { view } = await engine.search({
      locale: "en",
      query: "roses",
      to: "pl",
      page: 3,
    });
    expect(view.state).toBe("outOfRange");
    expect(view.pageCount).toBe(2);
    expect(view.cards).toEqual([]);
  });

  it("refuses a page above 10 and a locale that is not a launch locale", async () => {
    await expect(
      engine.search({ locale: "en", query: "roses", to: "pl", page: 11 }),
    ).rejects.toThrow();
    await expect(
      engine.search({ locale: "fr", query: "roses", to: "pl" }),
    ).rejects.toThrow();
  });

  it("truncates the query at 80 code points and never echoes control characters", async () => {
    const long = `${"róża ".repeat(30)}`;
    const { view } = await engine.search({
      locale: "pl",
      query: long,
      to: "pl",
    });
    expect([...view.query].length).toBeLessThanOrEqual(80);
    const { view: control } = await engine.search({
      locale: "en",
      query: "roses\u0000\u001b",
      to: "pl",
    });
    expect(control.query).toBe("roses");
  });

  it("the view carries no band, margin, payout or tier (§2.5 'Never shown')", async () => {
    const { view } = await engine.search({
      locale: "en",
      query: "roses",
      to: "pl",
    });
    const json = JSON.stringify(view);
    expect(json).not.toMatch(/margin|band|payout|florist|tier/iu);
  });
});
