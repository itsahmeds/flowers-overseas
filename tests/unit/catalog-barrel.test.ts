/**
 * The `catalog` module's public surface and its three structural guarantees (spec 005 AC-1, AC-2,
 * AC-3, T-01; TASK-060), in the shape `tests/unit/i18n-barrel.test.ts` and
 * `tests/unit/ui-barrel.test.ts` established.
 *
 * Four things are pinned, and each of them is a claim spec 005 makes about the *whole* module
 * rather than about one function:
 *
 *  1. **Registration** (AC-1): the module is in the `MODULES` manifest `pnpm check-layout` and the
 *     boundary lint read, and `docs/architecture.md` §3 repeats the barrel's owning-spec comment
 *     (that half lives in `tests/unit/architecture-doc.test.ts`).
 *  2. **No provider, no dataset path, no database symbol reachable from the barrel** (AC-2), so
 *     the static → Postgres swap of TASK-070 cannot leak into a caller. Asserted three ways: the
 *     runtime export list, the barrel's transitive import graph, and the source scan
 *     `pnpm check:no-db` runs.
 *  3. **Zero client JavaScript** (AC-3): no file in the module carries `"use client"`, and no
 *     client entry point in the repository can reach the module. That is a claim about a graph,
 *     which is why it is a walker here and not a browser assertion — the same technique
 *     `tests/unit/i18n-hints-zod-free.test.ts` uses, for the same reason.
 *  4. **The money schemas refuse the prices spec 005 forbids**: `deliveryIncluded: false` and
 *     `netAmountMinor + vatAmountMinor !== amountMinor` are parse errors, so a price without VAT
 *     or without delivery cannot be constructed (`plan/07` §4).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { COUNTRIES } from "../../src/config/countries.ts";
import { MODULES } from "../../scripts/check-layout.ts";
import { findDatabaseImports } from "../../scripts/check-no-db-imports.ts";
import * as catalog from "../../src/modules/catalog/index.ts";
import {
  catalogProviders,
  type CatalogProviders,
} from "../../src/modules/catalog/providers.ts";

const repoRoot = resolve(__dirname, "../..");
const moduleDir = "src/modules/catalog";

/* -------------------------------------------------------------------------- */
/* A small import-graph walker, shared by the AC-2 and AC-3 assertions.        */
/* -------------------------------------------------------------------------- */

const SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["']([^"']+)["']|\brequire\s*\(\s*["']([^"']+)["']\s*\)/g;

const EXTENSIONS = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"] as const;

function sourceOf(file: string): string {
  return readFileSync(resolve(repoRoot, file), "utf8");
}

/** Every module specifier of a file, comments stripped so a documented name is not an import. */
function specifiersOf(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  const found: string[] = [];
  for (const match of code.matchAll(SPECIFIER)) {
    const specifier = match[1] ?? match[2];
    if (specifier !== undefined) found.push(specifier);
  }
  return found;
}

/** Resolve a relative or `@/`-aliased specifier to a repository-relative file, or `null`. */
function resolveLocal(fromFile: string, specifier: string): string | null {
  const base = specifier.startsWith("@/")
    ? resolve(repoRoot, "src", specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(repoRoot, dirname(fromFile), specifier)
      : null;
  if (base === null) return null;
  for (const extension of EXTENSIONS) {
    const candidate = `${base}${extension}`;
    if (statSync(candidate, { throwIfNoEntry: false })?.isFile() === true) {
      return relative(repoRoot, candidate);
    }
  }
  throw new Error(`unresolvable import ${specifier} in ${fromFile}`);
}

interface Reached {
  readonly files: readonly string[];
  /** `package -> the import chain that reaches it`, entry point first. */
  readonly packages: ReadonlyMap<string, readonly string[]>;
}

function reachableFrom(entry: string): Reached {
  const files: string[] = [];
  const packages = new Map<string, string[]>();
  const walk = (file: string, chain: readonly string[]): void => {
    if (files.includes(file)) return;
    files.push(file);
    for (const specifier of specifiersOf(sourceOf(file))) {
      const local = resolveLocal(file, specifier);
      if (local === null) {
        if (!packages.has(specifier)) packages.set(specifier, [...chain, file]);
        continue;
      }
      if (local.endsWith(".json")) continue;
      walk(local, [...chain, file]);
    }
  };
  walk(entry, []);
  return { files, packages };
}

const SOURCE_EXTENSIONS = [".ts", ".tsx"] as const;

function walkDir(dir: string): string[] {
  const found: string[] = [];
  if (
    statSync(resolve(repoRoot, dir), {
      throwIfNoEntry: false,
    })?.isDirectory() !== true
  ) {
    return found;
  }
  for (const entry of readdirSync(resolve(repoRoot, dir), {
    withFileTypes: true,
  })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...walkDir(path));
      continue;
    }
    if (SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) {
      found.push(path);
    }
  }
  return found;
}

const moduleFiles = walkDir(moduleDir);

/* -------------------------------------------------------------------------- */

describe("src/modules/catalog barrel (AC-1)", () => {
  it("is registered in the module manifest, so the boundary lint covers it", () => {
    expect(MODULES).toContain("catalog");
  });

  it("carries the owning-spec comment docs/architecture.md §3 repeats", () => {
    expect(sourceOf(`${moduleDir}/index.ts`)).toContain("Owned by: spec 005.");
  });

  it("exports exactly the documented surface", () => {
    expect(Object.keys(catalog).sort()).toEqual(
      [
        // money schemas
        "BasisPointsSchema",
        "IsoDateSchema",
        "MessageKeySchema",
        "MinorUnitsSchema",
        "PricePointSchema",
        "SurchargeSchema",
        // the surcharge-kind value set (the types themselves are erased)
        "surchargeKinds",
        // the read API's boundary schemas (TASK-063)
        "FacetSelectionSchema",
        "ListProductsQuerySchema",
        // the tier and add-on read API (TASK-064)
        "AddonSchema",
        "FORBIDDEN_ADDON_FIELDS",
        "ProductTierSchema",
        "defaultTier",
        "listAddons",
        "listTiers",
        // the pricing core (TASK-065): whole prices, dated surcharges, integer money, VAT
        "FromPriceQuerySchema",
        "GrossAtRateSchema",
        "IntegerMoneySchema",
        "ResolvePriceQuerySchema",
        "SurchargeDateRangeSchema",
        "TierPricesQuerySchema",
        "VatLineSchema",
        "VatSplitSchema",
        "addMoney",
        "assertSameCurrency",
        "dateSurcharges",
        "fromPrice",
        "netFromGross",
        "resolvePrice",
        "sumMoney",
        "tierPrices",
        "vatBreakdown",
        // the taxonomy read API (TASK-063)
        "countProductsFor",
        "countProductsIn",
        "getCategory",
        "getOccasion",
        "getProduct",
        "hasIndexableProducts",
        "isAuthoredFacetPath",
        "listProducts",
        "resolveFacets",
        "topProductsForPrebuild",
      ].sort(),
    );
  });

  it("has the module's Phase 0 files and no `db/` implementation yet", () => {
    expect(moduleFiles.sort()).toEqual([
      `${moduleDir}/flags.ts`,
      `${moduleDir}/index.ts`,
      `${moduleDir}/pricing/money.ts`,
      `${moduleDir}/pricing/resolve.ts`,
      `${moduleDir}/pricing/vat.ts`,
      `${moduleDir}/providers.ts`,
      `${moduleDir}/read.ts`,
      `${moduleDir}/schemas.ts`,
      `${moduleDir}/static/index.ts`,
      `${moduleDir}/types.ts`,
    ]);
  });
});

describe("the barrel exposes no provider, dataset or database symbol (AC-2, T-01)", () => {
  const exported = Object.keys(catalog);

  it("exports no provider object and no composition root", () => {
    for (const banned of [
      "staticCatalogueProvider",
      "staticPriceProvider",
      "staticFxRateProvider",
      "dbCatalogueProvider",
      "dbPriceProvider",
      "dbFxRateProvider",
      "catalogProviders",
      "CatalogueDatasetPendingError",
      // The flag seam is internal too (spec 005 §12): callers ask for the add-ons they may
      // offer, never for the state of a flag, so spec 002's `feature_flag` table can take the
      // authority over with no caller change (TASK-064).
      "staticFlagProvider",
      "isFlagEnabled",
      "PHASE_0_FLAGS",
      // `divideMinorHalfUp()` is the pricing core's internal integer division (TASK-065): a
      // caller needs whole prices and VAT splits, never a division primitive, and exporting one
      // would invite money arithmetic outside `pricing/*`.
      "divideMinorHalfUp",
    ]) {
      expect(exported, banned).not.toContain(banned);
    }
  });

  it("exports only schemas, value sets and read functions — never data, never a connection", () => {
    for (const [name, value] of Object.entries(catalog)) {
      const kind =
        typeof value === "object" && value !== null && "safeParse" in value
          ? "schema"
          : Array.isArray(value)
            ? "value-set"
            : typeof value;
      expect(kind, name).toMatch(/^(?:schema|value-set|function)$/);
    }
  });

  /**
   * The read API's exports are functions over a provider, so the shape AC-2 forbids — an exported
   * *object* holding the dataset or a data source — is what is checked here: no export answers a
   * provider method, and no export is the dataset itself.
   */
  it("exports no object that is a provider or the dataset", () => {
    for (const [name, value] of Object.entries(catalog)) {
      if (typeof value !== "object" || value === null) continue;
      for (const method of [
        "products",
        "tiers",
        "categories",
        "occasions",
        "addons",
        "countryPrices",
        "addonCountryPrices",
        "fxRates",
        "flags",
      ]) {
        expect(Object.keys(value), `${name}.${method}`).not.toContain(method);
      }
      expect(Array.isArray(value) && value.length > 20, name).toBe(false);
    }
  });

  /**
   * Until TASK-063 the barrel exported schemas only, so its import graph reached neither the
   * providers nor the dataset. A read function has to read something, so from TASK-063 the graph
   * necessarily reaches the composition root — and AC-2's claim is about the **export list**
   * ("the barrel exports no provider object, no dataset path and no database symbol"), which the
   * two tests above pin. What stays a graph invariant is narrower and still meaningful: the
   * authored `*.data.ts` files are reachable **only** through `static/index.ts`, so nothing but
   * the static provider can read the dataset directly and TASK-070's swap has one file to replace.
   */
  it("reads the authored dataset only through the static provider", () => {
    const reached = reachableFrom(`${moduleDir}/index.ts`);

    expect(reached.files).toContain(`${moduleDir}/providers.ts`);
    for (const file of reached.files) {
      for (const specifier of specifiersOf(sourceOf(file))) {
        if (!specifier.includes("config/catalogue")) continue;
        // The taxonomy (`schemas.ts`) is not the dataset: it is the closed facet value sets and
        // the record types, which the read API and the providers are typed against.
        if (specifier.endsWith("config/catalogue/schemas")) continue;
        expect(
          file,
          `${file} imports the dataset directly (${specifier})`,
        ).toBe(`${moduleDir}/static/index.ts`);
      }
    }
  });

  it("imports no database client, ORM or driver anywhere in the module", () => {
    expect(findDatabaseImports(repoRoot, [moduleDir])).toEqual([]);
  });

  it("reads no `DATABASE_URL` and names no database package in any module file", () => {
    for (const file of moduleFiles) {
      const source = sourceOf(file);
      expect(source, file).not.toContain("DATABASE_URL");
      for (const specifier of specifiersOf(source)) {
        expect(specifier, file).not.toMatch(
          /^(?:drizzle|pg|postgres|@neondatabase)(?:$|[-/.])/,
        );
        expect(specifier, file).not.toMatch(/lib\/db(?:$|[/.])/);
      }
    }
  });
});

describe("the module ships zero client JavaScript (AC-3, T-01)", () => {
  it('carries no `"use client"` directive in any file', () => {
    for (const file of moduleFiles) {
      expect(sourceOf(file), file).not.toMatch(/^\s*["']use client["']/m);
    }
  });

  /**
   * The inverse direction, which is the one that actually costs bytes: a client component that
   * imports the module would pull it — and zod — into a browser chunk. Every `"use client"` file
   * in `src/` plus `src/app/global-error.tsx` (attached by Next to every document) is an entry
   * point, and none of them may reach the module. The budget has 1 434 B of headroom, so AC-3's
   * measurement is ±0 B rather than "small".
   */
  it("is not reachable from any client entry point in the repository", () => {
    const clientEntryPoints = [
      ...walkDir("src").filter((file) =>
        /^\s*["']use client["']/m.test(sourceOf(file)),
      ),
      "src/app/global-error.tsx",
    ];
    expect(clientEntryPoints.length).toBeGreaterThan(0);

    for (const entry of clientEntryPoints) {
      const reached = reachableFrom(entry);
      const leak = reached.files.find((file) =>
        file.startsWith(`${moduleDir}/`),
      );

      expect(leak === undefined ? null : `${entry} -> … -> ${leak}`).toBeNull();
    }
  });

  it("has a walker that would see a leak, so a green result means something", () => {
    // The guard on the guard: the barrel does reach `@/modules/i18n`, two hops from the schemas.
    const reached = reachableFrom(`${moduleDir}/index.ts`);

    expect(reached.files).toContain("src/modules/i18n/index.ts");
    expect([...reached.packages.keys()]).toContain("zod");
  });
});

describe("the provider seam and its Phase 0 stubs", () => {
  const providers: CatalogProviders = catalogProviders();

  it("composes the four static providers", () => {
    expect(Object.keys(providers).sort()).toEqual([
      "catalogue",
      "flags",
      "fx",
      "price",
    ]);
  });

  it("returns the same shape on every call, so nothing caches a connection", () => {
    expect(Object.keys(catalogProviders())).toEqual(Object.keys(providers));
  });

  /**
   * TASK-061 authored the catalogue half of the dataset and TASK-062 the price half, so all eight
   * provider reads now resolve. The counts are `plan/10` §2.1's and §2.3's and are asserted in
   * full by `tests/unit/catalogue-dataset.test.ts` and `tests/unit/catalogue-prices.test.ts`;
   * here they are the seam's own check that a provider hands over the authored rows and nothing
   * else.
   */
  const authored: readonly [
    string,
    () => Promise<readonly unknown[]>,
    number,
  ][] = [
    ["catalogue.products", () => providers.catalogue.products(), 84],
    ["catalogue.tiers", () => providers.catalogue.tiers(), 236],
    ["catalogue.categories", () => providers.catalogue.categories(), 23],
    ["catalogue.occasions", () => providers.catalogue.occasions(), 32],
    ["catalogue.addons", () => providers.catalogue.addons(), 6],
    // 1 652 retail rows (236 tiers x 7 destinations) + 1 764 dated surcharge rows
    // (84 products x 7 destinations x {sunday, 2 peak days}) — TASK-062.
    ["price.countryPrices", () => providers.price.countryPrices(), 3416],
    [
      "price.addonCountryPrices",
      () => providers.price.addonCountryPrices(),
      42,
    ],
    // One committed euro-base ECB snapshot, one row per configured quote currency.
    ["fx.fxRates", () => providers.fx.fxRates(), 9],
    // One `addon.wine.{country}` row per configured country, every one off (TASK-064).
    ["flags.flags", () => providers.flags.flags(), COUNTRIES.length],
  ];

  for (const [member, call, count] of authored) {
    it(`hands over the authored dataset: ${member}()`, async () => {
      await expect(call()).resolves.toHaveLength(count);
    });
  }

  it("hands over the price history, not only the active rows (plan/07 §2.1)", async () => {
    // A provider is a data source: the superseded rows are what makes the Omnibus Art. 6a
    // 30-day-lowest figure derivable, so filtering for `activeTo === null` here would remove the
    // only reason the history is stored. The dated peak-day rows are that history's first case.
    const rows = await providers.price.countryPrices();

    expect(rows.some((row) => row.activeTo !== null)).toBe(true);
    expect(rows.some((row) => row.surchargeKind === "peak_day")).toBe(true);
  });
});

describe("PricePointSchema refuses a price without VAT or delivery", () => {
  const surcharge = {
    kind: "sunday",
    amountMinor: 400,
    currency: "PLN",
    appliesFrom: "2026-10-04",
    appliesTo: "2026-10-04",
    labelKey: "catalog.surcharge.sunday",
  } as const;

  const point = {
    amountMinor: 16_092,
    currency: "PLN",
    vatRateBp: 800,
    vatAmountMinor: 1192,
    netAmountMinor: 14_900,
    deliveryIncluded: true,
    surcharges: [surcharge],
    activeFrom: "2026-09-01",
    activeTo: null,
    priceVersion: "cp_0001",
  } as const;

  it("accepts an all-in gross price whose parts add up", () => {
    expect(catalog.PricePointSchema.parse(point)).toMatchObject({
      amountMinor: 16_092,
      deliveryIncluded: true,
    });
  });

  it("rejects `deliveryIncluded: false`", () => {
    expect(
      catalog.PricePointSchema.safeParse({ ...point, deliveryIncluded: false })
        .success,
    ).toBe(false);
  });

  it("rejects a missing `deliveryIncluded`", () => {
    const withoutDelivery: Record<string, unknown> = { ...point };
    delete withoutDelivery.deliveryIncluded;

    expect(catalog.PricePointSchema.safeParse(withoutDelivery).success).toBe(
      false,
    );
  });

  it("rejects net + VAT ≠ gross, by a single minor unit", () => {
    const result = catalog.PricePointSchema.safeParse({
      ...point,
      vatAmountMinor: 1191,
    });

    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("amountMinor");
  });

  it("rejects a float amount, a negative amount and an unknown currency", () => {
    for (const invalid of [
      { ...point, amountMinor: 160.92 },
      { ...point, netAmountMinor: -14_900 },
      { ...point, currency: "XXX" },
      { ...point, vatRateBp: 10_001 },
      { ...point, activeFrom: "01/09/2026" },
      { ...point, priceVersion: "" },
      { ...point, extra: true },
    ]) {
      expect(
        catalog.PricePointSchema.safeParse(invalid).success,
        JSON.stringify(invalid).slice(0, 60),
      ).toBe(false);
    }
  });

  it("keeps the surcharge a dated row with a message key, not a multiplier", () => {
    expect(catalog.SurchargeSchema.parse(surcharge)).toEqual(surcharge);
    expect([...catalog.surchargeKinds]).toEqual(["sunday", "peak_day"]);
    for (const invalid of [
      { ...surcharge, kind: "percentage" },
      { ...surcharge, amountMinor: 4.5 },
      { ...surcharge, labelKey: "" },
      { ...surcharge, rate: 0.1 },
    ]) {
      expect(
        catalog.SurchargeSchema.safeParse(invalid).success,
        JSON.stringify(invalid).slice(0, 60),
      ).toBe(false);
    }
  });

  it("takes its currency set from src/config/currencies.ts, not a second copy", () => {
    // A currency the registry does not configure is a parse error, which is the property that
    // makes "one money type" true rather than aspirational.
    expect(
      catalog.PricePointSchema.safeParse({ ...point, currency: "PLN" }).success,
    ).toBe(true);
    expect(
      catalog.PricePointSchema.safeParse({ ...point, currency: "USD" }).success,
    ).toBe(false);
  });
});
