/**
 * The search engine on the committed static catalogue (spec 045 AC-6, AC-7, AC-8, AC-9, AC-11;
 * T-06 to T-09, T-11; TASK-401, restated by TASK-426 per §14 A-orchestrator-2026-10-25b).
 *
 * AC-6 to AC-8 are **ranking properties** that hold whatever the `de` and `pl` copy says, so a
 * faithful translation never turns them red: the spellings of one word are compared with each
 * other as exact ordered arrays (one value, never a set of reachable ones), and each list's lead
 * is checked against the **entity set** the test computes from the catalogue (`listProducts`
 * flower types), never a literal SKU list. Tiers are read through the pure `matchDocuments` over
 * the same index, and every list the engine returns is first asserted equal to that ranking, so a
 * tier claim and a list claim cannot disagree.
 *
 * The destination is the registry's, named here as test data; nothing under `src/` names it.
 */
import { beforeAll, describe, expect, it } from "vitest";

import de from "../../messages/de.json";
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

interface Ranked {
  readonly sku: string;
  readonly tier: number;
}

/** Every match in rank order with its tier, through the pure functions. */
function ranked(
  locale: LocaleCode,
  query: string,
  over: SearchIndex = index,
): Ranked[] {
  const shop = over.locales.get(locale)?.shops.get(DESTINATION);
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
  ).map((match) => ({ sku: match.sku, tier: match.tier }));
}

/** `sku:tier` for every match, in rank order. */
function tiers(locale: LocaleCode, query: string): string[] {
  return ranked(locale, query).map(
    (match) => `${match.sku}:${String(match.tier)}`,
  );
}

/**
 * The engine's list for `query`, asserted equal to the pure ranking first (so the tiers read below
 * are the tiers of exactly this list), with each result's tier.
 */
async function results(
  locale: LocaleCode,
  query: string,
  using: MemoryEngine = engine,
  over: SearchIndex = index,
): Promise<Ranked[]> {
  const list = ranked(locale, query, over);
  expect(await skus(locale, query, DESTINATION.toLowerCase(), using)).toEqual(
    list.map((match) => match.sku),
  );
  return list;
}

/** A flower's entity set: the destination's listed products whose flower types include it. */
async function withFlower(flower: string): Promise<string[]> {
  return (await listProducts({ countryIso: DESTINATION }))
    .filter((product) =>
      (product.flowerTypes as readonly string[]).includes(flower),
    )
    .map((product) => product.sku)
    .sort();
}

/**
 * §9's lead: the first results are exactly `entity`, each at `tier`. The SKUs are compared as one
 * sorted array (§2.5's order inside the set is AC-16's), the tiers as one array.
 */
function expectLeads(
  list: readonly Ranked[],
  entity: readonly string[],
  tier: number,
): void {
  expect(entity.length).toBeGreaterThan(0);
  const lead = list.slice(0, entity.length);
  expect(lead.map((match) => match.sku).sort()).toEqual([...entity].sort());
  expect(lead.map((match) => match.tier)).toEqual(entity.map(() => tier));
}

/** The tiers along a list, which must never rise. */
function expectTierNeverRises(list: readonly Ranked[]): void {
  const along = list.map((match) => match.tier);
  expect(along).toEqual([...along].sort((a, b) => b - a));
}

/** The spellings of one word return one and the same ordered list; that list is returned. */
async function sameList(
  locale: LocaleCode,
  spellings: readonly string[],
  using: MemoryEngine = engine,
  over: SearchIndex = index,
): Promise<Ranked[]> {
  const [first, ...rest] = spellings;
  if (first === undefined) throw new Error("no spelling");
  const list = await results(locale, first, using, over);
  for (const spelling of rest) {
    expect(await results(locale, spelling, using, over)).toEqual(list);
  }
  return list;
}

/** A source over the committed catalogue with one change to the products it hands over. */
function editedSource(
  edit: (
    product: Awaited<ReturnType<SearchSource["products"]>>[number],
    locale: LocaleCode,
  ) => Awaited<ReturnType<SearchSource["products"]>>[number],
): () => SearchSource {
  return () => {
    const source = catalogSearchSource();
    return {
      ...source,
      products: async (locale, iso2) =>
        (await source.products(locale, iso2)).map((product) =>
          edit(product, locale),
        ),
    };
  };
}

describe("AC-6 (T-06): accents, case and spacing do not change the list", () => {
  it("/pl/szukaj `roza`, `róża`, `róże`, `ROZE` and ` roze ` return one list, led by the roses at tier 4", async () => {
    const list = await sameList("pl", [
      "roza",
      "róża",
      "róże",
      "ROZE",
      " roze ",
    ]);
    expectLeads(list, await withFlower("roses"), 4);
  });

  it("/de/suche `Rosen`, `rosen` and `Rose` return one list, led by the roses at tier 4, the set `roses` leads with on /en/search", async () => {
    const roses = await withFlower("roses");
    expectLeads(await results("en", "roses"), roses, 4);
    expectLeads(await sameList("de", ["Rosen", "rosen", "Rose"]), roses, 4);
  });

  it("/en/search `krakow` and `Kraków` return one list, FO-BQ-009 Kraków Spring first", async () => {
    const list = await sameList("en", ["krakow", "Kraków"]);
    expect(list[0]?.sku).toBe("FO-BQ-009");
  });

  describe("a German name with `ß`", () => {
    // `Maßliebchen` (an old German name for the daisy); `Strauß` (bouquet) is in most German
    // descriptions, so it could not single out one product.
    const WORD = "Maßliebchen";
    const SPELLINGS = [WORD, "Massliebchen", "MASSLIEBCHEN"];
    const RENAMED = "FO-BQ-001";
    const renamed = editedSource((product, locale) =>
      locale === "de" && product.sku === RENAMED
        ? { ...product, name: `${WORD}-Strauß` }
        : product,
    );

    it("the word is in no document of Poland's unmodified `de` index", async () => {
      const shop = index.locales.get("de")?.shops.get(DESTINATION);
      const [token] = parseQuery(WORD, "de", []).tokens;
      expect(token).toBe("massliebchen");
      expect(shop?.vocabulary.has(token ?? "")).toBe(false);
      for (const spelling of SPELLINGS) {
        expect(await skus("de", spelling)).toEqual([]);
      }
    });

    it("spelt with `ß`, with `ss` and in upper case it returns one list: the renamed product alone", async () => {
      const fixture = memoryEngine({ source: renamed });
      const fixtureIndex = await buildIndex(renamed());
      const list = await sameList("de", SPELLINGS, fixture, fixtureIndex);
      expect(list.map((match) => match.sku)).toEqual([RENAMED]);
    });
  });
});

describe("AC-7 (T-07): stems and the last token's prefix", () => {
  it("/en/search `rose` and `roses` return one list, led by the roses at tier 4", async () => {
    expectLeads(
      await sameList("en", ["rose", "roses"]),
      await withFlower("roses"),
      4,
    );
  });

  it("/pl/szukaj `tulipany`, `tulipanów` and `tulipan` return one list, led by the tulips at tier 4", async () => {
    const list = await sameList("pl", ["tulipany", "tulipanów", "tulipan"]);
    const tulips = await withFlower("tulips");
    expectLeads(list, tulips, 4);
    // What may follow is a product whose description alone names tulips, at tier 3.
    expect(
      list.slice(tulips.length).filter((match) => match.tier !== 3),
    ).toEqual([]);
  });

  it("`sunfl` (the last token, as a prefix) leads with the sunflowers at tier 4", async () => {
    expectLeads(
      await results("en", "sunfl"),
      await withFlower("sunflowers"),
      4,
    );
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
  it("`yellow sunfl` leads with the yellow sunflowers at tier 4; `sunfl yellow` finds nothing", async () => {
    const yellowSunflowers = (await listProducts({ countryIso: DESTINATION }))
      .filter(
        (product) =>
          (product.flowerTypes as readonly string[]).includes("sunflowers") &&
          (product.colours as readonly string[]).includes("yellow"),
      )
      .map((product) => product.sku);
    expectLeads(await results("en", "yellow sunfl"), yellowSunflowers, 4);
    expect(await skus("en", "sunfl yellow")).toEqual([]);
  });
});

/**
 * A source in which the `de` label of the colour `pink` is `Rosa` (one letter from `rose` and
 * `roza`), and one listed product without roses has the word `różne` (various; one letter from
 * the stem of `róża`) in its `pl` description: the words a faithful translation brings.
 */
const PINK_DE = de.catalog.facet.colour.pink;
let pink: ReadonlySet<string>;
let variousSku: string;

function rosaSource(): SearchSource {
  return editedSource((product, locale) => {
    let edited = product;
    if (pink.has(product.sku)) {
      edited =
        locale === "de"
          ? {
              ...edited,
              facetLabels: [
                ...edited.facetLabels.filter((label) => label !== PINK_DE),
                "Rosa",
              ],
            }
          : {
              ...edited,
              altLabels: [
                ...edited.altLabels.filter(
                  (label) => !(label.locale === "de" && label.text === PINK_DE),
                ),
                { locale: "de", text: "Rosa" },
              ],
            };
    }
    if (locale === "pl" && product.sku === variousSku) {
      edited = {
        ...edited,
        description: `${edited.description} Kwiaty różne.`,
      };
    }
    return edited;
  })();
}

describe("AC-8 (T-08): typo tolerance only for a word that matches nothing firmly", () => {
  it.each([
    ["sunflwers", "sunflowers"],
    ["orchds", "orchids"],
    ["tulpis", "tulips"],
  ])(
    "`%s` matches no word firmly: every result is at tier 2, led by the %s",
    async (query, flower) => {
      const list = await results("en", query);
      expect(list.map((match) => match.tier)).toEqual(list.map(() => 2));
      expectLeads(list, await withFlower(flower), 2);
    },
  );

  it("`tolaps` (distance 2 on a 6-letter word) returns no tulip product", async () => {
    const tulips = new Set(await withFlower("tulips"));
    expect(
      (await skus("en", "tolaps")).filter((sku) => tulips.has(sku)),
    ).toEqual([]);
  });

  it("`rse` (3 letters) returns no fuzzy match", async () => {
    expect(await skus("en", "rse")).toEqual([]);
  });

  const FIRM: readonly (readonly [LocaleCode, string])[] = [
    ["en", "rose"],
    ["en", "roses"],
    ["de", "Rose"],
    ["pl", "róża"],
  ];

  it.each(FIRM)(
    "on the committed catalogue, %s %j returns no result at tier 2",
    async (locale, query) => {
      expect(
        (await results(locale, query)).filter((match) => match.tier === 2),
      ).toEqual([]);
    },
  );

  describe("on a source where `de` pink is `Rosa` and a product has `różne` in Polish", () => {
    let fixture: MemoryEngine;
    let fixtureIndex: SearchIndex;

    beforeAll(async () => {
      const listed = await listProducts({ countryIso: DESTINATION });
      pink = new Set(
        listed
          .filter((product) =>
            (product.colours as readonly string[]).includes("pink"),
          )
          .map((product) => product.sku),
      );
      const various = listed.find(
        (product) =>
          !(product.flowerTypes as readonly string[]).includes("roses") &&
          !pink.has(product.sku),
      );
      if (various === undefined) throw new Error("no product without roses");
      variousSku = various.sku;
      fixture = memoryEngine({ source: rosaSource });
      fixtureIndex = await buildIndex(rosaSource());
    }, 60_000);

    it("the fixture carries the words: `Rosa` finds the pink products, `różne` the edited one", async () => {
      const roses = new Set(await withFlower("roses"));
      expect([...pink].filter((sku) => !roses.has(sku)).length).toBeGreaterThan(
        0,
      );
      expectLeads(
        await results("de", "Rosa", fixture, fixtureIndex),
        [...pink],
        4,
      );
      expect(
        (await results("pl", "różne", fixture, fixtureIndex)).map(
          (match) => match.sku,
        ),
      ).toEqual([variousSku]);
    });

    it.each(FIRM)(
      "%s %j returns no result at tier 2",
      async (locale, query) => {
        expect(
          (await results(locale, query, fixture, fixtureIndex)).filter(
            (match) => match.tier === 2,
          ),
        ).toEqual([]);
      },
    );
  });

  it("along the list of every AC-6 to AC-9 query, the tier never rises", async () => {
    const queries: readonly (readonly [LocaleCode, string])[] = [
      ["pl", "roza"],
      ["pl", "róża"],
      ["pl", "róże"],
      ["pl", "ROZE"],
      ["pl", " roze "],
      ["de", "Rosen"],
      ["de", "rosen"],
      ["de", "Rose"],
      ["en", "roses"],
      ["en", "krakow"],
      ["en", "Kraków"],
      ["en", "rose"],
      ["pl", "tulipany"],
      ["pl", "tulipanów"],
      ["pl", "tulipan"],
      ["en", "sunfl"],
      ["en", "su"],
      ["en", "yellow sunfl"],
      ["en", "sunflwers"],
      ["en", "orchds"],
      ["en", "tulpis"],
      ["en", "tolaps"],
      ["en", "rse"],
      ["en", "red roses"],
      ["en", "róże"],
      ["en", "FO-BQ-001"],
    ];
    for (const [locale, query] of queries) {
      expectTierNeverRises(await results(locale, query));
    }
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

  it("`róże` on /en/search finds the roses products through the alt field, at tier 4", async () => {
    expectLeads(ranked("en", "róże"), await withFlower("roses"), 4);
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
