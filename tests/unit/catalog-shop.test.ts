/**
 * The shop set, the core range and the one country order (spec 004 §14 A-founder-2026-10-24a
 * items 1 and 13, **AC-72**, T-78; TASK-381).
 *
 * Three fixtures, as T-78 names them: **today's data** (the committed registries: no country
 * open, the demo shop roots stand in), **the open fixture** (one country open) and **the two-open
 * fixture** (two open; one non-core product sold in only one of them; one core product that lost
 * its last florist in one of them). The fixtures are `ShopData` values handed to the functions,
 * so no module is mocked and the committed path is the same code with the committed inputs.
 *
 * T-78's three red runs, each a mutation of `src/modules/catalog/shop.ts` recorded in the PR's
 * self-review: a demo mapping counted once a country is live; `coreRange` ignoring one country's
 * coverage; the core list derived from mappings instead of read from `coreRank`.
 */
import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { CORE_RANGE_SIZE, PICKER_CHIPS } from "../../src/config/commerce.ts";
import { COUNTRIES } from "../../src/config/countries.ts";
import { PRODUCTS as products } from "../../src/config/catalogue/products.data.ts";
import {
  type ShopData,
  coreRange,
  isCore,
  isCoreRangeSize,
  orderCountries,
  orderedCountryCodes,
  publishedCountries,
  shopCountries,
  shopSet,
} from "../../src/modules/catalog";
import { committedShopData } from "../../src/modules/catalog/shop.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** The founder's list, rank 1 first (Q-24a, "core ok", 2026-10-24; TASK-382). */
const CORE_LIST = [
  "FO-BQ-034",
  "FO-BQ-031",
  "FO-BQ-003",
  "FO-BQ-026",
  "FO-BQ-023",
  "FO-BQ-002",
  "FO-BQ-001",
  "FO-BQ-015",
  "FO-PT-001",
  "FO-FN-002",
] as const;

/** Today's shop set in `en`: every published destination with a shop root, by name. */
const TODAY_EN = ["FR", "DE", "IT", "NL", "PL", "RO", "ES"];

describe("the seed: coreRank on the founder's ten, sortWeight on every country", () => {
  it("ranks exactly the ten core SKUs, 1 to 10, in the founder's order", () => {
    const ranked = products
      .filter((product) => product.coreRank != null)
      .sort((left, right) => (left.coreRank ?? 0) - (right.coreRank ?? 0))
      .map((product) => [product.sku, product.coreRank]);
    expect(ranked).toEqual(CORE_LIST.map((sku, index) => [sku, index + 1]));
    expect(isCoreRangeSize(ranked.length)).toBe(true);
  });

  it("gives every registry country a weight, and every weight is 0 today", () => {
    expect(COUNTRIES.map((country) => country.sortWeight)).toEqual(
      COUNTRIES.map(() => 0),
    );
  });

  it("CORE_RANGE_SIZE is 8 to 12 and isCoreRangeSize is its one comparison", () => {
    expect(CORE_RANGE_SIZE).toEqual({ min: 8, max: 12 });
    expect([7, 8, 12, 13].map(isCoreRangeSize)).toEqual([
      false,
      true,
      true,
      false,
    ]);
    expect(PICKER_CHIPS).toBe(6);
  });
});

describe("the one country order: sortWeight, then the name in the locale's collation (item 13)", () => {
  it("orders today's published destinations alphabetically in en, de and pl, not Poland first", () => {
    expect(publishedCountries("en")).toEqual(TODAY_EN);
    expect(publishedCountries("de")).toEqual([
      "DE",
      "FR",
      "IT",
      "NL",
      "PL",
      "RO",
      "ES",
    ]);
    // Polish collation: Francja, Hiszpania, Holandia, Niemcy, Polska, Rumunia, Włochy.
    expect(publishedCountries("pl")).toEqual([
      "FR",
      "ES",
      "NL",
      "DE",
      "PL",
      "RO",
      "IT",
    ]);
  });

  it("puts a lower sortWeight first, whatever its name", () => {
    const rows = COUNTRIES.map((country) =>
      country.iso2 === "RO" ? { ...country, sortWeight: -1 } : country,
    );
    expect(orderCountries(rows, "en").map((row) => row.iso2)).toEqual([
      "RO",
      ...TODAY_EN.filter((iso2) => iso2 !== "RO"),
    ]);
  });

  it("does not depend on the registry file's order", () => {
    const reversed = [...COUNTRIES].reverse();
    expect(orderCountries(reversed, "en").map((row) => row.iso2)).toEqual(
      TODAY_EN,
    );
    expect(orderedCountryCodes("en")).toEqual(TODAY_EN);
  });

  it("breaks a tie of weight and name by the ISO code, the same on every run", () => {
    const twins = [
      { iso2: "ZZ", sortWeight: 0, nameKey: "x" },
      { iso2: "AA", sortWeight: 0, nameKey: "x" },
    ];
    expect(
      orderCountries(twins, "en", () => "Same").map((row) => row.iso2),
    ).toEqual(["AA", "ZZ"]);
  });
});

/** A fixture over the committed data with the open set, coverage and products replaced. */
function fixture(overrides: Partial<ShopData>): ShopData {
  return { ...committedShopData, ...overrides };
}

const OPEN_ONE = "DE";
const OPEN_TWO = ["DE", "FR"] as const;
/** The core product that lost its last florist in one open country (rank 3). */
const LOST = "FO-BQ-003";
/** The non-core product sold in one open country only: a local special. */
const SPECIAL = "FO-BQ-004";

/** Two-open: every product saleable in both open countries, except the two above. */
const twoOpen = fixture({
  orderingOpen: (iso2) => (OPEN_TWO as readonly string[]).includes(iso2),
  // Every demo mapping still says "priced there": a demo mapping must not count once live.
  demoSaleable: () => Promise.resolve(true),
  liveSaleable: (sku, iso2) =>
    Promise.resolve(
      !(sku === LOST && iso2 === "FR") && !(sku === SPECIAL && iso2 === "FR"),
    ),
});

describe("AC-72: shopCountries()", () => {
  it("today's data: the demo shop countries stand in, in the one order", async () => {
    expect(await shopCountries("en")).toEqual(TODAY_EN);
    expect((await shopSet("en")).mode).toBe("demo");
  });

  it("the open fixture: the one open country", async () => {
    const open = fixture({ orderingOpen: (iso2) => iso2 === OPEN_ONE });
    expect(await shopCountries("en", open)).toEqual([OPEN_ONE]);
    expect((await shopSet("en", open)).mode).toBe("open");
  });

  it("the two-open fixture: both, in the one order", async () => {
    expect(await shopCountries("en", twoOpen)).toEqual(["FR", "DE"]);
  });

  it("an open country with no shop root in the locale is not in the set", async () => {
    const noRoot = fixture({
      orderingOpen: (iso2) => iso2 === OPEN_ONE,
      shopRootExists: () => Promise.resolve(false),
    });
    expect(await shopCountries("en", noRoot)).toEqual([]);
  });

  it("a fixture registry with a new country lists it with no file under src/ changed", async () => {
    const added = fixture({
      countries: () => [
        ...COUNTRIES,
        { iso2: "SE", sortWeight: 0, nameKey: "destinations.se.name" },
      ],
      shopRootExists: () => Promise.resolve(true),
      countryName: (country) =>
        ({
          FR: "France",
          DE: "Germany",
          IT: "Italy",
          NL: "Netherlands",
          PL: "Poland",
          RO: "Romania",
          ES: "Spain",
          SE: "Sweden",
        })[country.iso2] ?? country.iso2,
    });
    expect(await shopCountries("en", added)).toEqual([
      "FR",
      "DE",
      "IT",
      "NL",
      "PL",
      "RO",
      "ES",
      "SE",
    ]);
  });
});

describe("AC-72: coreRange()", () => {
  it("today's data: the curated list in rank order", async () => {
    expect((await coreRange("en")).map((entry) => entry.sku)).toEqual([
      ...CORE_LIST,
    ]);
    expect((await coreRange("en")).map((entry) => entry.coreRank)).toEqual(
      CORE_LIST.map((_, index) => index + 1),
    );
  });

  it("the two-open fixture: the list minus exactly the product that lost its florist", async () => {
    expect((await coreRange("en", twoOpen)).map((entry) => entry.sku)).toEqual(
      CORE_LIST.filter((sku) => sku !== LOST),
    );
  });

  it("the open fixture: a core product unsaleable in the one open country is hidden", async () => {
    const open = fixture({
      orderingOpen: (iso2) => iso2 === OPEN_ONE,
      demoSaleable: () => Promise.resolve(true),
      liveSaleable: (sku) => Promise.resolve(sku !== "FO-BQ-034"),
    });
    expect((await coreRange("en", open)).map((entry) => entry.sku)).toEqual(
      CORE_LIST.filter((sku) => sku !== "FO-BQ-034"),
    );
  });

  it("today's data: a demo mapping counts, and a missing one hides the product from every country-less page", async () => {
    const gap = fixture({
      demoSaleable: (sku, iso2) =>
        Promise.resolve(!(sku === "FO-PT-001" && iso2 === "RO")),
    });
    expect((await coreRange("en", gap)).map((entry) => entry.sku)).toEqual(
      CORE_LIST.filter((sku) => sku !== "FO-PT-001"),
    );
  });

  it("never holds a non-core product, even one saleable everywhere", async () => {
    // Every product saleable in every shop country: the range is still exactly the ranked ten,
    // in rank order (not SKU order), so it is read from `coreRank`, not from the mappings.
    const everywhere = fixture({
      demoSaleable: () => Promise.resolve(true),
    });
    const range = (await coreRange("en", everywhere)).map((entry) => entry.sku);
    expect(range).toEqual([...CORE_LIST]);
    expect(range).not.toContain(SPECIAL);
    for (const entry of await coreRange("en", twoOpen)) {
      expect(await isCore(entry.sku)).toBe(true);
    }
  });

  it("a retired core product leaves the range", async () => {
    const retired = fixture({
      products: async () =>
        (await committedShopData.products()).map((product) =>
          product.sku === "FO-BQ-031"
            ? { ...product, status: "retired" }
            : product,
        ),
    });
    expect((await coreRange("en", retired)).map((entry) => entry.sku)).toEqual(
      CORE_LIST.filter((sku) => sku !== "FO-BQ-031"),
    );
  });

  it("no shop country at all: nothing is shown before a choice that cannot be made", async () => {
    const none = fixture({ shopRootExists: () => Promise.resolve(false) });
    expect(await coreRange("en", none)).toEqual([]);
  });
});

describe("isCore()", () => {
  it("is true for the ten and false for every other product", async () => {
    for (const product of products) {
      expect(await isCore(product.sku), product.sku).toBe(
        (CORE_LIST as readonly string[]).includes(product.sku),
      );
    }
    expect(await isCore("FO-XX-999")).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* AC-72's source scan: no header, cookie or IP read by the functions or anything they call   */
/* in the catalogue.                                                                           */
/* -------------------------------------------------------------------------- */

const ENTRY_FILES = [
  "src/modules/catalog/shop.ts",
  "src/modules/catalog/country-order.ts",
  "src/modules/catalog/chooser.ts",
];

/** Request-bound reads: a header, a cookie, an IP, a geolocation. */
const FORBIDDEN: readonly [string, RegExp][] = [
  ["next/headers", /from\s+["']next\/headers["']/u],
  ["headers()", /\bheaders\(\)/u],
  ["cookies()", /\bcookies\(\)/u],
  ["cf-ipcountry", /cf-ipcountry/iu],
  ["x-forwarded-for", /x-forwarded-for/iu],
  ["accept-language", /accept-language/iu],
  ["user-agent", /user-agent/iu],
  ["geolocation", /navigator\.geolocation/u],
  ["request.ip", /\breq(?:uest)?\.ip\b/u],
];

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/^\s*\/\/.*$/gmu, "");
}

/**
 * The files these functions can reach inside the catalogue and the config: relative imports and
 * `@/config/*`, transitively. Other modules' barrels are their own boundary (geo, i18n, seo, ui)
 * and are not entered; the functions call none of their request-bound code.
 */
function reachable(): string[] {
  const seen = new Set<string>();
  const queue = [...ENTRY_FILES];
  while (queue.length > 0) {
    const file = queue.shift() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(join(repoRoot, file), "utf8");
    for (const match of source.matchAll(/from\s+["']([^"']+)["']/gu)) {
      const spec = match[1] ?? "";
      let target: string | undefined;
      if (spec.startsWith(".")) {
        target = relative(
          repoRoot,
          resolve(join(repoRoot, dirname(file)), spec),
        );
      } else if (spec.startsWith("@/config/")) {
        target = join("src/config", spec.slice("@/config/".length));
      }
      if (target === undefined) continue;
      for (const candidate of [
        target,
        `${target}.ts`,
        `${target}.tsx`,
        join(target, "index.ts"),
      ]) {
        try {
          readFileSync(join(repoRoot, candidate));
          if (/\.tsx?$/u.test(candidate)) queue.push(candidate);
          break;
        } catch {
          continue;
        }
      }
    }
  }
  return [...seen].sort();
}

describe("AC-72: neither function, nor anything it calls, reads a header, cookie or IP", () => {
  const files = reachable();

  it("walks the catalogue files the three entry files reach", () => {
    expect(files).toEqual(expect.arrayContaining(ENTRY_FILES));
    expect(files).toContain("src/modules/catalog/listing.ts");
    expect(files).toContain("src/modules/catalog/availability.ts");
    expect(files).toContain("src/config/countries.ts");
  });

  it.each(files)("%s", (file) => {
    const source = withoutComments(readFileSync(join(repoRoot, file), "utf8"));
    const hits = FORBIDDEN.filter(([, pattern]) => pattern.test(source)).map(
      ([name]) => name,
    );
    expect(hits).toEqual([]);
  });
});
