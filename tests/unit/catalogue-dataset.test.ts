/**
 * The authored catalogue dataset against `plan/10` (spec 005 AC-6's structural half, T-04;
 * TASK-061).
 *
 * `plan/10` §2.1 is a table in a plan document; this file is that table as assertions, which is
 * the only form in which "84 products in the 40/14/8/10/12 split with the six facets of §1.1"
 * survives an edit six months from now. The price half of AC-6 (bands per country, the eight
 * seeded countries) is TASK-062's, and `pnpm catalogue:check` (also TASK-062) re-asserts the
 * integrity rules from a CLI so a dataset that would produce an indexable page with no price
 * fails CI rather than reaching Googlebot.
 *
 * The three "deliberately absent" assertions matter as much as the counts: a description, a media
 * reference or a `de`/`pl` translation appearing here would mean copy has a second home outside
 * spec 006, which is the drift ADR-0017 exists to prevent.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ADDONS,
  addonFlagKey,
} from "../../src/config/catalogue/addons.data.ts";
import {
  CATEGORIES,
  categoriesOfKind,
} from "../../src/config/catalogue/categories.data.ts";
import {
  OCCASIONS,
  occasionsOfKind,
} from "../../src/config/catalogue/occasions.data.ts";
import {
  PRODUCTS,
  SEEDED_PRODUCT_COUNTS,
  productBySku,
} from "../../src/config/catalogue/products.data.ts";
import {
  colours,
  facetLabelKey,
  facetNames,
  facetValues,
  flowerTypes,
  messageKeyLeaf,
  occasionKeys,
  priceTiers,
  seededProductTypes,
  styles,
  substitutionClasses,
} from "../../src/config/catalogue/schemas.ts";
import {
  PRODUCT_TIERS,
  PRODUCT_TIER_GROUPS,
  defaultTierForSku,
  tiersForSku,
} from "../../src/config/catalogue/tiers.data.ts";

const repoRoot = resolve(__dirname, "../..");
const datasetDir = "src/config/catalogue";

const datasetFiles = readdirSync(resolve(repoRoot, datasetDir))
  .filter((name) => name.endsWith(".ts"))
  .map((name) => `${datasetDir}/${name}`);

function sourceOf(file: string): string {
  return readFileSync(resolve(repoRoot, file), "utf8");
}

describe("the 84-SKU skeleton of plan/10 §2.1 (AC-6)", () => {
  it("has 84 products", () => {
    expect(PRODUCTS).toHaveLength(84);
  });

  it("splits them 40 bouquets / 14 arrangements / 8 plants / 10 funeral / 12 gift sets", () => {
    for (const type of seededProductTypes) {
      expect(
        PRODUCTS.filter((product) => product.productType === type).length,
        type,
      ).toBe(SEEDED_PRODUCT_COUNTS[type]);
    }
    expect(
      Object.values(SEEDED_PRODUCT_COUNTS).reduce((sum, n) => sum + n, 0),
    ).toBe(84);
  });

  it("uses no Phase 4 product type (`hamper`, `voucher`)", () => {
    for (const product of PRODUCTS) {
      expect(["hamper", "voucher"], product.sku).not.toContain(
        product.productType,
      );
    }
  });

  it("keeps SKUs and `en` slugs unique, and the SKU prefix agreeing with the type", () => {
    expect(new Set(PRODUCTS.map((product) => product.sku)).size).toBe(84);
    expect(new Set(PRODUCTS.map((product) => product.slug)).size).toBe(84);
    const prefixes: Record<string, string> = {
      bouquet: "BQ",
      arrangement: "AR",
      plant: "PT",
      funeral: "FN",
      gift_set: "GS",
    };
    for (const product of PRODUCTS) {
      expect(product.sku, product.sku).toContain(
        `FO-${String(prefixes[product.productType])}-`,
      );
    }
  });

  it("gives every product an active status and no partner restriction in Phase 0", () => {
    for (const product of PRODUCTS) {
      expect(product.status, product.sku).toBe("active");
      expect(product.partnerOnly, product.sku).toBe(false);
    }
  });

  it("looks a product up by SKU and throws on an unknown one", () => {
    expect(productBySku("FO-BQ-001").name).toBe("Amber Hour");
    expect(() => productBySku("FO-BQ-999")).toThrow(/unknown product sku/);
  });
});

describe("the six facets of plan/10 §1.1, as keys and not labels (AC-6)", () => {
  it("carries all six facets on every product record", () => {
    for (const product of PRODUCTS) {
      expect(seededProductTypes, product.sku).toContain(product.productType);
      expect(flowerTypes, product.sku).toContain(product.primaryFlower);
      expect(colours, product.sku).toContain(product.colourPrimary);
      expect(styles, product.sku).toContain(product.style);
      expect(priceTiers, product.sku).toContain(product.priceTier);
      expect(product.occasions.length, product.sku).toBeGreaterThan(0);
      for (const occasion of product.occasions) {
        expect(occasionKeys, `${product.sku}/${occasion}`).toContain(occasion);
      }
    }
  });

  it("lists the primary value first in each multi-valued facet", () => {
    for (const product of PRODUCTS) {
      expect(product.flowerTypes[0], product.sku).toBe(product.primaryFlower);
      expect(product.colours[0], product.sku).toBe(product.colourPrimary);
    }
  });

  it("carries plan/10 §1.1's product attributes", () => {
    for (const product of PRODUCTS) {
      expect(substitutionClasses, product.sku).toContain(
        product.substitutionClass,
      );
      expect(typeof product.vaseIncluded, product.sku).toBe("boolean");
      expect(product.freshnessDays, product.sku).toBeGreaterThan(0);
      expect(typeof product.allergenNote, product.sku).toBe("boolean");
    }
  });

  it("marks the allergen note on the gift sets that contain food, and nowhere else", () => {
    const flagged = PRODUCTS.filter((product) => product.allergenNote);
    expect(flagged.length).toBeGreaterThan(0);
    for (const product of flagged) {
      expect(product.productType, product.sku).toBe("gift_set");
      expect(product.name, product.sku).toContain("Chocolates");
    }
  });

  it("resolves every facet value through a `catalog.facet.*` message key (spec 005 §7)", () => {
    for (const facet of facetNames) {
      for (const value of facetValues[facet]) {
        expect(facetLabelKey(facet, value)).toBe(
          `catalog.facet.${facet}.${messageKeyLeaf(value)}`,
        );
        expect(facetLabelKey(facet, value)).not.toContain("_");
      }
    }
    expect(messageKeyLeaf("new_baby")).toBe("newBaby");
    expect(messageKeyLeaf("roses")).toBe("roses");
    // A leading number moves to the end, because spec 003's message-key alphabet requires a
    // letter first in every segment: `catalog.facet.occasion.17Mai` is a key `messages/en.json`
    // cannot hold and no review record could describe (TASK-062 corrected it).
    expect(messageKeyLeaf("17_mai")).toBe("mai17");
    for (const facet of facetNames) {
      for (const value of facetValues[facet]) {
        for (const segment of facetLabelKey(facet, value).split(".")) {
          expect(segment, `${facet}.${value}`).toMatch(
            /^[A-Za-z][A-Za-z0-9]*$/,
          );
        }
      }
    }
  });

  it("uses every flower-type hub and every occasion category on a real product", () => {
    const usedFlowers = new Set(PRODUCTS.map((p) => p.primaryFlower));
    for (const category of categoriesOfKind("flowerType")) {
      expect(usedFlowers, category.key).toContain(category.key);
    }
    const usedOccasions = new Set(PRODUCTS.flatMap((p) => p.occasions));
    for (const category of categoriesOfKind("occasion")) {
      expect(usedOccasions, category.key).toContain(category.key);
    }
  });
});

describe("the tier structure of plan/10 §2.2 (AC-6, spec 005 §13 Q4/Q6)", () => {
  it("gives every product at least one tier and no tier an orphan product", () => {
    expect(PRODUCT_TIER_GROUPS).toHaveLength(84);
    const skus = new Set(PRODUCTS.map((product) => product.sku));
    for (const group of PRODUCT_TIER_GROUPS) {
      expect(skus, group.sku).toContain(group.sku);
      expect(group.tiers.length, group.sku).toBeGreaterThan(0);
    }
    for (const product of PRODUCTS) {
      expect(tiersForSku(product.sku).length, product.sku).toBeGreaterThan(0);
    }
  });

  it("uses stem counts for bouquets and gift sets, S/M/L for arrangements and funeral, single for plants", () => {
    const shape: Record<string, RegExp> = {
      bouquet: /^stems_\d+$/,
      gift_set: /^stems_\d+$/,
      arrangement: /^size_[sml]$/,
      funeral: /^size_[sml]$/,
      plant: /^single$/,
    };
    for (const product of PRODUCTS) {
      for (const tier of tiersForSku(product.sku)) {
        expect(tier.tierKey, `${product.sku}/${tier.tierKey}`).toMatch(
          shape[product.productType] as RegExp,
        );
      }
    }
  });

  it("gives three tiers to everything but a plant, which has one", () => {
    for (const product of PRODUCTS) {
      expect(tiersForSku(product.sku).length, product.sku).toBe(
        product.productType === "plant" ? 1 : 3,
      );
    }
    expect(PRODUCT_TIERS).toHaveLength(236);
  });

  it("preselects exactly one tier per product, and it is the middle one", () => {
    for (const product of PRODUCTS) {
      const tiers = tiersForSku(product.sku);
      const defaults = tiers.filter((tier) => tier.isDefault);
      expect(defaults.length, product.sku).toBe(1);
      const middle = Math.floor((tiers.length - 1) / 2);
      expect(tiers[middle]?.tierKey, product.sku).toBe(defaults[0]?.tierKey);
      expect(defaultTierForSku(product.sku).tierKey).toBe(defaults[0]?.tierKey);
    }
  });

  it("labels a tier with a message key and never with a name (spec 005 §13 Q4)", () => {
    for (const tier of PRODUCT_TIERS) {
      expect(tier.labelKey, tier.tierKey).toMatch(
        /^catalog\.tier\.(?:stems|single|size\.[sml])$/,
      );
    }
  });

  it("carries a stem count exactly where the tier is a stem tier", () => {
    for (const tier of PRODUCT_TIERS) {
      expect(tier.stems === null, tier.tierKey).toBe(
        !tier.tierKey.startsWith("stems_"),
      );
    }
  });

  it("steps stem counts upward, and matches plan/10 §2.2's two worked examples", () => {
    for (const group of PRODUCT_TIER_GROUPS) {
      const stems = group.tiers
        .map((tier) => tier.stems)
        .filter((value): value is number => value !== null);
      for (const [index, value] of stems.entries()) {
        if (index > 0) {
          expect(value, group.sku).toBeGreaterThan(stems[index - 1] as number);
        }
      }
    }
    // "12/18/24 roses; 15/25/35 tulips" (`plan/10` §2.2).
    expect(tiersForSku("FO-BQ-001").map((tier) => tier.stems)).toEqual([
      12, 18, 24,
    ]);
    expect(tiersForSku("FO-BQ-009").map((tier) => tier.stems)).toEqual([
      15, 25, 35,
    ]);
  });

  it("records the default tier's stem count on the product, or null where there is none", () => {
    for (const product of PRODUCTS) {
      expect(product.stemCount, product.sku).toBe(
        defaultTierForSku(product.sku).stems,
      );
    }
  });
});

describe("the 23 categories and the occasion facet (plan/10 §2.1, §1.1)", () => {
  it("has 23 categories: 5 product types, 10 occasion categories, 8 flower-type hubs", () => {
    expect(CATEGORIES).toHaveLength(23);
    expect(categoriesOfKind("productType")).toHaveLength(5);
    expect(categoriesOfKind("occasion")).toHaveLength(10);
    expect(categoriesOfKind("flowerType")).toHaveLength(8);
  });

  it("keys every category on a facet value and labels it with that facet's key", () => {
    for (const category of CATEGORIES) {
      expect(facetValues[category.kind], category.key).toContain(category.key);
      expect(category.labelKey, category.key).toBe(
        facetLabelKey(category.kind, category.key),
      );
    }
    expect(new Set(CATEGORIES.map((category) => category.key)).size).toBe(23);
  });

  it("authors no slug and no name, because category_translation is spec 006's (ADR-0017)", () => {
    for (const category of CATEGORIES) {
      expect(Object.keys(category).sort()).toEqual([
        "key",
        "kind",
        "labelKey",
        "sort",
      ]);
    }
  });

  it("has one occasion row per plan/10 §1.1 facet value, and no more", () => {
    expect(OCCASIONS).toHaveLength(occasionKeys.length);
    expect(OCCASIONS).toHaveLength(32);
    expect(OCCASIONS.map((occasion) => occasion.key)).toEqual([
      ...occasionKeys,
    ]);
    expect(occasionsOfKind("evergreen")).toHaveLength(14);
    expect(occasionsOfKind("seasonal")).toHaveLength(18);
  });

  it("authors no occasion date: the calendar is occasion_country's (spec 005 §3)", () => {
    for (const occasion of OCCASIONS) {
      expect(Object.keys(occasion).sort()).toEqual([
        "key",
        "kind",
        "labelKey",
        "sort",
      ]);
    }
  });
});

describe("the six add-ons of plan/10 §2.1 (AC-6, AC-19)", () => {
  it("has exactly the six seeded add-ons, in plan/10's order", () => {
    expect(ADDONS.map((addon) => addon.key)).toEqual([
      "chocolates",
      "vase",
      "balloon",
      "plush",
      "wine",
      "card",
    ]);
  });

  it("has no field that could pre-tick an extra (CRD Art. 22, AC-19)", () => {
    for (const addon of ADDONS) {
      for (const key of Object.keys(addon)) {
        expect(key, addon.key).not.toMatch(
          /default(?:Selected)?|preselect|checked/i,
        );
      }
    }
  });

  it("carries no price: an add-on is priced per destination country (spec 005 §13 Q3)", () => {
    for (const addon of ADDONS) {
      for (const key of Object.keys(addon)) {
        expect(key, addon.key).not.toMatch(/price|amount|minor|vat/i);
      }
    }
  });

  it("flags wine per country and nothing else (plan/10 §1.1 'disabled where unlicensed')", () => {
    expect(addonFlagKey("wine", "PL")).toBe("addon.wine.PL");
    for (const addon of ADDONS) {
      if (addon.key !== "wine") {
        expect(addonFlagKey(addon.key, "PL"), addon.key).toBeNull();
      }
    }
  });

  it("requires the allergen note on the food add-on only", () => {
    for (const addon of ADDONS) {
      expect(addon.allergenNoteRequired, addon.key).toBe(
        addon.key === "chocolates",
      );
    }
  });

  it("names every add-on through the message catalogue (spec 005 §7)", () => {
    for (const addon of ADDONS) {
      expect(addon.nameKey).toBe(`catalog.addon.${addon.key}.name`);
      expect(addon.descriptionKey).toBe(
        `catalog.addon.${addon.key}.description`,
      );
    }
  });
});

describe("what the dataset deliberately does not contain (AC-6)", () => {
  it("carries no description, SEO copy, imagery or review on any product", () => {
    for (const product of PRODUCTS) {
      for (const key of Object.keys(product)) {
        expect(key, `${product.sku}.${key}`).not.toMatch(
          /descri|seo|image|media|photo|asset|alt|review|rating/i,
        );
      }
    }
  });

  it("carries no `de` or `pl` translation and no locale field at all", () => {
    for (const product of PRODUCTS) {
      for (const key of Object.keys(product)) {
        expect(key, `${product.sku}.${key}`).not.toMatch(
          /locale|translation|_de$|_pl$/i,
        );
      }
    }
  });

  it("carries no money and no FX anywhere in the authored product data", () => {
    // Prices are per destination country and are authored by TASK-062 in `prices.data.ts`;
    // a product record that could hold an amount is how a buyer-keyed price becomes possible.
    for (const record of [...PRODUCTS, ...PRODUCT_TIERS, ...CATEGORIES]) {
      for (const key of Object.keys(record)) {
        // `priceTier` is the *band* facet of `plan/10` §1.1 (`essential` … `luxury`), a key
        // mapped to per-country amounts by TASK-062 — it is the one allowed near-miss.
        if (key === "priceTier") continue;
        expect(key, key).not.toMatch(
          /price|amount|minor|currency|rate|payout/i,
        );
      }
    }
  });

  it("carries no partner payout and no buyer dimension (spec 005 §3, AC-18)", () => {
    for (const record of [...PRODUCTS, ...PRODUCT_TIERS, ...ADDONS]) {
      for (const key of Object.keys(record)) {
        expect(key, key).not.toMatch(/buyer|ipAddress|geo|visitor|payout/i);
      }
    }
  });
});

describe("the dataset directory is server-only, database-free config (AC-2, AC-3)", () => {
  it("has exactly the nine files spec 005 §5.2 names for Phase 0", () => {
    expect(datasetFiles.sort()).toEqual([
      `${datasetDir}/addons.data.ts`,
      `${datasetDir}/categories.data.ts`,
      // The price half, TASK-062: the per-destination bands, ladders, VAT rates, surcharges and
      // add-on prices, and one dated ECB euro-reference snapshot.
      `${datasetDir}/fx.data.ts`,
      `${datasetDir}/occasions.data.ts`,
      `${datasetDir}/prices.data.ts`,
      `${datasetDir}/products.data.ts`,
      `${datasetDir}/projections.ts`,
      `${datasetDir}/schemas.ts`,
      `${datasetDir}/tiers.data.ts`,
    ]);
  });

  it('carries no `"use client"` and imports nothing beyond the schemas and zod', () => {
    for (const file of datasetFiles) {
      const source = sourceOf(file);
      expect(source, file).not.toMatch(/^\s*["']use client["']/m);
      const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      const imports = [...code.matchAll(/from\s+["']([^"']+)["']/g)].map(
        (match) => match[1],
      );
      for (const specifier of imports) {
        // `prices.data.ts` also reads its sibling dataset files and the destination registry:
        // its rows are one per (product, tier, destination), so the product, tier and add-on
        // sets and `src/config/countries.ts`'s `live`/`demo` list are its inputs — and reading
        // them is what makes "every destination is priced" a parse error rather than a comment
        // (TASK-062). Nothing outside `src/config/` is reachable from the dataset either way.
        expect(specifier, `${file} -> ${String(specifier)}`).toMatch(
          /^(?:zod|\.\/schemas\.ts|\.\.\/currencies\.ts|\.\.\/countries\.ts|\.\/(?:products|tiers|addons)\.data\.ts)$/,
        );
      }
    }
  });

  it("reads no `DATABASE_URL` and no clock, so a projection is reproducible", () => {
    for (const file of datasetFiles) {
      const code = sourceOf(file).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      expect(code, file).not.toContain("DATABASE_URL");
      expect(code, file).not.toContain("Date.now");
      expect(code, file).not.toContain("new Date");
      expect(code, file).not.toContain("Math.random");
    }
  });

  /**
   * The direction that actually costs bytes (AC-3): a Client Component that imported the dataset
   * would pull 84 products *and* zod into a browser chunk, and spec 004 §14 A1's Brotli budget
   * has 1 434 B of headroom on a locale document — so the measurement is ±0 B, not "small".
   * `tests/unit/catalog-barrel.test.ts` makes the same assertion for `src/modules/catalog`; this
   * is the dataset half, walked from every `"use client"` file in `src/` plus
   * `src/app/global-error.tsx`, whose chunk Next attaches to every document.
   */
  it("is not reachable from any client entry point in the repository", () => {
    const sourceFiles = (dir: string): string[] => {
      const found: string[] = [];
      for (const entry of readdirSync(resolve(repoRoot, dir), {
        withFileTypes: true,
      })) {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) found.push(...sourceFiles(path));
        else if (/\.tsx?$/.test(entry.name)) found.push(path);
      }
      return found;
    };

    const resolveLocal = (from: string, specifier: string): string | null => {
      const base = specifier.startsWith("@/")
        ? resolve(repoRoot, "src", specifier.slice(2))
        : specifier.startsWith(".")
          ? resolve(repoRoot, from, "..", specifier)
          : null;
      if (base === null) return null;
      for (const extension of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
        const candidate = `${base}${extension}`;
        if (statSync(candidate, { throwIfNoEntry: false })?.isFile() === true) {
          return relative(repoRoot, candidate);
        }
      }
      return null;
    };

    const reach = (entry: string): readonly string[] => {
      const seen: string[] = [];
      const walk = (file: string): void => {
        if (seen.includes(file)) return;
        seen.push(file);
        const code = sourceOf(file).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
        for (const match of code.matchAll(
          /(?:from|import\s*\()\s*["']([^"']+)["']/g,
        )) {
          const local = resolveLocal(file, match[1] ?? "");
          if (local !== null && !local.endsWith(".json")) walk(local);
        }
      };
      walk(entry);
      return seen;
    };

    const clientEntryPoints = [
      ...sourceFiles("src").filter((file) =>
        /^\s*["']use client["']/m.test(sourceOf(file)),
      ),
      "src/app/global-error.tsx",
    ];
    expect(clientEntryPoints.length).toBeGreaterThan(0);

    for (const entry of clientEntryPoints) {
      const leak = reach(entry).find((file) => file.startsWith(datasetDir));
      expect(leak === undefined ? null : `${entry} -> … -> ${leak}`).toBeNull();
    }

    // The guard on the guard: the walker does find the dataset from the static provider, so a
    // green result above means the graph was searched rather than the search having failed.
    expect(reach("src/modules/catalog/static/index.ts")).toContain(
      `${datasetDir}/products.data.ts`,
    );
  });
});
