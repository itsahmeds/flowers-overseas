/**
 * `productView()` is the **only** input to the page, the JSON-LD builders and the sitemap row
 * (spec 009 §5.2, **T-32**; covers AC-18/AC-19's single-source clause; TASK-125).
 *
 * Two halves, and both can fail:
 *
 *  1. **A fake provider moves every consumer together.** The price provider is swapped for one
 *     that charges 100 zł more for Amber Hour's 18 stems in Poland. Every value a consumer reads —
 *     the summary total and the tier row the page prints, and the `Offer.price` spec 005's
 *     `offerProjection()` derives from the view's own projection for the JSON-LD (TASK-130) — moves
 *     by exactly that amount, and nothing else moves. A consumer holding its own copy of the price
 *     would stay at 229 zł and fail here.
 *  2. **No second derivation exists in `src/`.** The derivations only `productView()` may make —
 *     the date surcharges, the delivery grid, the PDP's indexability verdict, the totals table and
 *     the tier ladder — are called from `catalog/product.ts` and from their own definitions, and
 *     from nowhere else. The PDP route (TASK-127), the schema builder (TASK-130) and the products
 *     sitemap (TASK-131) are not written yet; the day one of them computes a chip, a grid or a
 *     verdict of its own instead of reading the view, this goes red and names the file.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

/** Added to one retail row by the fake provider; 0 is the committed dataset. */
let bumpMinor = 0;

vi.mock("../../src/modules/catalog/providers.ts", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/modules/catalog/providers.ts")
  >("../../src/modules/catalog/providers.ts");
  return {
    ...actual,
    catalogProviders: () => {
      const real = actual.catalogProviders();
      return {
        ...real,
        price: {
          ...real.price,
          countryPrices: async () =>
            (await real.price.countryPrices()).map((row) =>
              row.sku === "FO-BQ-001" &&
              row.countryIso2 === "PL" &&
              row.tierKey === "stems_18" &&
              row.surchargeKind === null &&
              row.activeTo === null
                ? { ...row, retailMinor: row.retailMinor + bumpMinor }
                : row,
            ),
        },
      };
    },
  };
});

const { productView } = await import("../../src/modules/catalog/product.ts");
const { offerProjection } =
  await import("../../src/modules/catalog/pricing/project.ts");

afterEach(() => {
  bumpMinor = 0;
});

const NOW = new Date("2026-09-09T07:00:00Z");

/** What each consumer reads from the view — and only from the view. */
async function consumers() {
  const view = await productView(
    { locale: "pl", countryIso: "PL", sku: "FO-BQ-001" },
    { parameterised: false, now: NOW },
  );
  if (view === undefined) throw new Error("no view");
  return {
    pageSummary: view.price.displayPrice.amountMinor,
    pageTierRow: view.tiers.find((tier) => tier.tierKey === "stems_18")?.price
      .amountMinor,
    pageOtherTier: view.tiers.find((tier) => tier.tierKey === "stems_12")?.price
      .amountMinor,
    jsonLdOfferPrice: offerProjection(view.price)?.price,
    sitemapRow: {
      loc: view.path,
      indexable: view.indexability.indexable,
    },
  };
}

describe("a fake provider moves every consumer together (T-32)", () => {
  it("reads the committed price through every consumer", async () => {
    await expect(consumers()).resolves.toEqual({
      pageSummary: 22_900,
      pageTierRow: 22_900,
      pageOtherTier: 19_900,
      jsonLdOfferPrice: "229.00",
      sitemapRow: { loc: "/pl/polska/produkt/amber-hour", indexable: false },
    });
  });

  it("moves the page's summary, its tier row and the Offer by exactly the provider's change", async () => {
    bumpMinor = 10_000;
    await expect(consumers()).resolves.toEqual({
      pageSummary: 32_900,
      pageTierRow: 32_900,
      // The other tiers are other rows: a consumer that moved them would be computing, not reading.
      pageOtherTier: 19_900,
      jsonLdOfferPrice: "329.00",
      sitemapRow: { loc: "/pl/polska/produkt/amber-hour", indexable: false },
    });
  });
});

/* -------------------------------------------------------------------------- */
/* No second derivation (the structural half).                                */
/* -------------------------------------------------------------------------- */

const repoRoot = new URL("../../", import.meta.url).pathname;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(?:ts|tsx)$/.test(name)) out.push(path);
  }
  return out;
}

/** Code with comments removed: prose may name a function, only code may call it. */
function codeOf(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/** Files under `src/` that **call** `name(…)` — a definition (`function name(`) is not a call. */
function callersOf(name: string, files: readonly string[]): string[] {
  const call = new RegExp(`(?<![\\w.$])${name}\\s*\\(`, "g");
  const definition = new RegExp(`function\\s+${name}\\s*\\(`, "g");
  return files
    .filter((file) => {
      const code = codeOf(file);
      const calls = code.match(call)?.length ?? 0;
      const definitions = code.match(definition)?.length ?? 0;
      return calls > definitions;
    })
    .map((file) => relative(repoRoot, file))
    .sort();
}

/**
 * The derivations `productView()` owns, and the only files allowed to call each. The definitions'
 * own files appear where the function calls itself or a sibling does (none today).
 */
const OWNED: Readonly<Record<string, readonly string[]>> = {
  dateSurcharges: ["src/modules/catalog/product.ts"],
  deliveryWindow: ["src/modules/catalog/product.ts"],
  productPageIndexability: ["src/modules/catalog/product.ts"],
  productDescriptor: ["src/modules/catalog/product.ts"],
  dateTotals: [],
  tierOptions: [],
};

describe("no file in `src/` derives what the view already carries (T-32)", () => {
  const files = sourceFiles(join(repoRoot, "src"));

  it("walks the real tree (a scan over nothing proves nothing)", () => {
    expect(files).toContain(join(repoRoot, "src/modules/catalog/product.ts"));
    expect(files.length).toBeGreaterThan(200);
  });

  it("finds a call it is looking for — the scanner bites", () => {
    // `priceProjection(` has callers outside the PDP (listings), so it is the positive control.
    expect(callersOf("priceProjection", files)).toContain(
      "src/modules/catalog/listing.ts",
    );
    expect(callersOf("priceProjection", files)).toContain(
      "src/modules/catalog/product.ts",
    );
  });

  for (const [name, allowed] of Object.entries(OWNED)) {
    it(`\`${name}(\` is called from ${allowed.length === 0 ? "no file but its definition" : allowed.join(", ")}`, () => {
      expect(callersOf(name, files)).toEqual([...allowed]);
    });
  }
});
