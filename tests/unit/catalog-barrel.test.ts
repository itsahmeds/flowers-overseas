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

import { MODULES } from "../../scripts/check-layout.ts";
import { findDatabaseImports } from "../../scripts/check-no-db-imports.ts";
import * as catalog from "../../src/modules/catalog/index.ts";
import {
  catalogProviders,
  type CatalogProviders,
} from "../../src/modules/catalog/providers.ts";
import { CatalogueDatasetPendingError } from "../../src/modules/catalog/static/index.ts";

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
      ].sort(),
    );
  });

  it("has the module's Phase 0 files and no `db/` implementation yet", () => {
    expect(moduleFiles.sort()).toEqual([
      `${moduleDir}/index.ts`,
      `${moduleDir}/providers.ts`,
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
    ]) {
      expect(exported, banned).not.toContain(banned);
    }
  });

  it("exports only schemas and value sets — nothing holding data or a connection", () => {
    for (const [name, value] of Object.entries(catalog)) {
      const kind =
        typeof value === "object" && value !== null && "safeParse" in value
          ? "schema"
          : Array.isArray(value)
            ? "value-set"
            : typeof value;
      expect(kind, name).toMatch(/^(?:schema|value-set)$/);
    }
  });

  it("reaches no provider, no static implementation and no dataset path from the barrel", () => {
    const reached = reachableFrom(`${moduleDir}/index.ts`);

    for (const forbidden of [
      `${moduleDir}/providers.ts`,
      `${moduleDir}/static/index.ts`,
    ]) {
      expect(reached.files, forbidden).not.toContain(forbidden);
    }
    // Prose may name the dataset path (the barrel's own comment does); an *import* may not.
    for (const file of reached.files) {
      for (const specifier of specifiersOf(sourceOf(file))) {
        expect(specifier, file).not.toContain("config/catalogue");
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

  it("composes the three static providers", () => {
    expect(Object.keys(providers).sort()).toEqual(["catalogue", "fx", "price"]);
  });

  it("returns the same shape on every call, so nothing caches a connection", () => {
    expect(Object.keys(catalogProviders())).toEqual(Object.keys(providers));
  });

  const members: readonly [string, () => Promise<unknown>][] = [
    ["catalogue.products", () => providers.catalogue.products()],
    ["catalogue.tiers", () => providers.catalogue.tiers()],
    ["catalogue.categories", () => providers.catalogue.categories()],
    ["catalogue.occasions", () => providers.catalogue.occasions()],
    ["catalogue.addons", () => providers.catalogue.addons()],
    ["price.countryPrices", () => providers.price.countryPrices()],
    ["price.addonCountryPrices", () => providers.price.addonCountryPrices()],
    ["fx.fxRates", () => providers.fx.fxRates()],
  ];

  for (const [member, call] of members) {
    it(`fails loudly rather than reading an empty dataset: ${member}()`, async () => {
      await expect(call()).rejects.toBeInstanceOf(CatalogueDatasetPendingError);
      await expect(call()).rejects.toThrow(/TASK-06[12]/);
    });
  }
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
