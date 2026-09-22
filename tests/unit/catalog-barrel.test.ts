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
import { CURRENCIES } from "../../src/config/currencies.ts";
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
        // projections and the price identity (TASK-067): one view model, one offer, one table
        "FromPriceProjectionQuerySchema",
        "OfferProjectionSchema",
        "PriceProjectionQuerySchema",
        "PriceProjectionSchema",
        "PriceTableQuerySchema",
        "PriceTableSchema",
        "currencyFlagKey",
        "fromPriceProjection",
        "offerProjection",
        "priceProjection",
        "priceTable",
        // availability, indexability, the Omnibus figure and signed quotes (TASK-068)
        "AvailabilityQuerySchema",
        "AvailabilitySchema",
        "QuoteLineSchema",
        "QuoteSchema",
        "TierKeySchema",
        "availability",
        "isProductIndexable",
        "lowestPriceInLast30Days",
        "quote",
        "verifyQuote",
        // cache tags (TASK-069): the one builder of `plan/01` §3's names
        "CacheEntitySchema",
        "cacheTagsFor",
        // slugs and the listing boundary (TASK-105, spec 008 §5.1 amendment 1 / §5.2, AC-4):
        // schemas, three value sets and the three pure functions of the slug map. No slug *data*
        // and no locale→slug record is exported — the map is read through `slugFor` / `resolveSlug`
        // / `hasSlug` only, so an unauthored `de`/`pl` category cannot be papered over by a caller
        // reaching into the table (spec 008 §13 Q10).
        "CatalogueSlugSchema",
        "EntityKeySchema",
        "ListingPageTypeSchema",
        "ListingParamsSchema",
        "ListingSearchParamsSchema",
        "ListingSortSchema",
        "SlugKindSchema",
        "hasSlug",
        "listingPageTypes",
        "listingSorts",
        "resolveSlug",
        "slugFor",
        "slugKinds",
        // the listing view model, the existence set and the six page descriptors (TASK-107, spec
        // 008 §2 / §5.2 / §6 / §11, AC-3, AC-14). Schemas, functions and nothing else: the
        // product-count floor and the page size stay internal, because a caller that could read
        // the floor would be one line from applying it instead of asking `listingExists()`.
        "HubCardViewSchema",
        "ListingCrumbSchema",
        "ListingHeadingSchema",
        "ListingIdentitySchema",
        "ListingLinksSchema",
        "ListingOccasionDateSchema",
        "ListingOccasionEntrySchema",
        "ListingViewSchema",
        "categoryTileView",
        "existenceCounts",
        "existenceSummaryMarkdown",
        "hubCardView",
        "isPublishedCountry",
        "listingDescriptor",
        "listingExists",
        "listingIndexability",
        "listingLocales",
        "listingPages",
        "listingView",
        "productCardView",
        "publishedCountries",
        "writeExistenceSummary",
        // the listing parameter policy (TASK-114, spec 008 AC-9/AC-10/AC-15): one pure function,
        // so no route can decide for itself what `?page=` or `?sort=` means.
        "listingRequest",
        // the shared per-depth route resolver and the country shop root's page component
        // (TASK-109, spec 008 §14 A5 / spec 007 §14 A8). Two React components appear here for the
        // `CorridorPage` reason: a page component belongs to the module that owns its view model,
        // so `app/` holds one resolve and one mount. They are Server Components — no file in this
        // module carries `"use client"` — so the barrel still adds zero client bytes (AC-3).
        "CountryCategoryPage",
        "CountryShopRootPage",
        "ListingBreadcrumb",
        // the two destination-less hubs' page components (TASK-112), for the same reason.
        "CategoryHubPage",
        "OccasionHubPage",
        "listingAlternatePaths",
        "localeChildParams",
        "localeGrandchildParams",
        "localeSegmentParams",
        "resolveLocalePath",
        // the country occasion's page component (TASK-111): the same rule one level down, and the
        // third React component the module owns. Its URLs share `localeGrandchildParams()` with
        // the country category, because they share the route file.
        "CountryOccasionPage",
        // spec 009's product page: its existence set, its prebuild list and the two schemas its
        // route parses (TASK-121). `productPageExists()` is the single existence answer, on the
        // same footing as `listingExists()`; `PRODUCT_PREBUILD_COUNT` stays internal for
        // `PRODUCT_COUNT_FLOOR`'s reason.
        "ProductPageIdentitySchema",
        "ProductParamsSchema",
        "listProductPages",
        "localeProductParams",
        "productExistenceCounts",
        "productExistenceSummaryMarkdown",
        "productPageExists",
        "productPrebuildPages",
        "writeProductExistenceSummary",
        // the corridor's shop entry (TASK-113): the one function that composes "may the site
        // link into the shop" with "does this destination have a shop root in this locale", so
        // `src/modules/geo` never reads the catalogue (spec 008 AC-20).
        "corridorShopEntry",
        // the occasions index's page component (TASK-113): the page that puts every occasion hub
        // two clicks from any document, which is how AC-21's depth bound closes for the hubs.
        "OccasionsIndexPage",
        // and its href, for the colophon (TASK-113): published **and** existing in this locale,
        // answered once so the footer never has to ask the catalogue itself.
        "occasionsIndexHref",
      ].sort(),
    );
  });

  it("has the module's Phase 0 files and no `db/` implementation yet", () => {
    expect(moduleFiles.sort()).toEqual([
      `${moduleDir}/availability.ts`,
      `${moduleDir}/cache.ts`,
      `${moduleDir}/copy.ts`,
      `${moduleDir}/flags.ts`,
      `${moduleDir}/index.ts`,
      `${moduleDir}/listing.ts`,
      `${moduleDir}/observability.ts`,
      `${moduleDir}/params.ts`,
      `${moduleDir}/pricing/fx.ts`,
      `${moduleDir}/pricing/history.ts`,
      `${moduleDir}/pricing/money.ts`,
      `${moduleDir}/pricing/project.ts`,
      `${moduleDir}/pricing/quote.ts`,
      `${moduleDir}/pricing/resolve.ts`,
      `${moduleDir}/pricing/round.ts`,
      `${moduleDir}/pricing/vat.ts`,
      `${moduleDir}/product.ts`,
      `${moduleDir}/providers.ts`,
      `${moduleDir}/read.ts`,
      `${moduleDir}/routes.ts`,
      `${moduleDir}/schemas.ts`,
      `${moduleDir}/shop-entry.ts`,
      `${moduleDir}/slugs.ts`,
      `${moduleDir}/static/index.ts`,
      `${moduleDir}/types.ts`,
      `${moduleDir}/ui/CategoryHubPage.tsx`,
      `${moduleDir}/ui/CountryCategoryPage.tsx`,
      `${moduleDir}/ui/CountryOccasionPage.tsx`,
      `${moduleDir}/ui/CountryShopRootPage.tsx`,
      `${moduleDir}/ui/ListingBreadcrumb.tsx`,
      `${moduleDir}/ui/OccasionHubPage.tsx`,
      `${moduleDir}/ui/OccasionsIndexPage.tsx`,
      `${moduleDir}/ui/labels.ts`,
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
      // `divideMinorHalfUp()` and `divideMinorCeil()` are the pricing core's internal integer
      // divisions (TASK-065, TASK-066): a caller needs whole prices and VAT splits, never a
      // division primitive, and exporting one would invite money arithmetic outside `pricing/*`.
      "divideMinorHalfUp",
      "divideMinorCeil",
      // The FX seam is internal too (TASK-066). Spec 005 §5.2's caller surface is whole prices
      // and projections: a barrel-exported converter would let a caller produce a converted
      // amount with no rate and no `fxAsOf` stamped on it (§5.4), or round a price a second time
      // outside the one place that decides the display currency. TASK-067's `priceProjection()`
      // is the exported way a converted price is obtained.
      "convert",
      "convertForDisplay",
      "fxRateFor",
      "isRateStale",
      "roundToStyle",
      "roundMinorToStyle",
      "latticeFor",
      "FX_BUFFER_BP",
      "MAX_FX_AGE_HOURS",
      "FX_UNAVAILABLE_REASON_KEY",
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
    // Scoped to **this module's** files, which is what the invariant says: TASK-070 replaces one
    // file *here*. From TASK-107 the graph also reaches `modules/geo` (spec 008 §2 needs 007's
    // occasion calendar), and `geo/corridor.ts` reads `occasions.data.ts` for its own reasons
    // (spec 007, TASK-089/091) — a fact about that module, not a second reader of the catalogue
    // inside this one.
    for (const file of reached.files.filter((path) =>
      path.startsWith(`${moduleDir}/`),
    )) {
      for (const specifier of specifiersOf(sourceOf(file))) {
        if (!specifier.includes("config/catalogue")) continue;
        // The invariant is about the **authored dataset** — the `*.data.ts` files — and nothing
        // else under `config/catalogue/`: `schemas.ts` is the closed facet value sets and record
        // types the read API and the providers are typed against, and `projections.ts` is the
        // pure row projections `seed/schema/` shares with them. Matched on the specifier with its
        // extension stripped, because a file reached through `seed/` spells it with one
        // (TASK-107: `modules/geo` → `seed/schema/catalogue.ts` → `config/catalogue/*.ts`).
        if (!/config\/catalogue\/[^/]+\.data(?:\.ts)?$/.test(specifier))
          continue;
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
    // 1 652 retail rows (236 tiers x 7 destinations) + 1 680 dated surcharge rows: 84 products x
    // 2 peak days x 7 destinations, plus one open-ended Sunday row per product for the **six**
    // destinations that price a Sunday at all. PL, the one `live` destination, has no agreed
    // `country.sunday_delivery`, so it carries none (spec 004 §14 A19; TASK-120) — TASK-062.
    ["price.countryPrices", () => providers.price.countryPrices(), 3332],
    [
      "price.addonCountryPrices",
      () => providers.price.addonCountryPrices(),
      42,
    ],
    // One committed euro-base ECB snapshot, one row per configured quote currency.
    ["fx.fxRates", () => providers.fx.fxRates(), 9],
    // One `addon.wine.{country}` row per configured country, every one off (TASK-064), plus one
    // `currency.{code}` row per configured currency — EUR, GBP and PLN on (TASK-067, §13 Q11).
    [
      "flags.flags",
      () => providers.flags.flags(),
      COUNTRIES.length + CURRENCIES.length,
    ],
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
