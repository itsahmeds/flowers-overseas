/**
 * T-04 (spec 006 AC-4, and AC-3's byte-determinism sibling; TASK-072): the committed dataset is
 * complete, parses, and **is** a fresh projection of `src/config/catalogue/`.
 *
 * The determinism assertion is the mechanism ADR-0017 asks for: `seed/data/`'s catalogue files are
 * generated projections of the single authored source, so this test re-projects them in memory and
 * compares the bytes. A hand edit to `seed/data/products.json` fails here; an edit to
 * `src/config/catalogue/products.data.ts` without running `pnpm seed:project` fails here; and
 * because the generator formats with the repository's own Prettier configuration, the same bytes
 * also satisfy `pnpm format:check`.
 *
 * Everything asserted about *content* is a count, a split or a referential fact `plan/10` §2.1
 * fixes. The word counts, price bands, slug folding and PII scan of spec 006 §2.3 are
 * `pnpm seed:check`'s (TASK-075) and are not duplicated here.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { projectSeedDataset, staleProjections } from "../../seed/project.ts";
import { SEED_DATA_DIR, SEED_DATA_FILES } from "../../seed/schema/files.ts";
import { seedProductTierRecords } from "../../seed/schema/catalogue.ts";
import { COUNTRY_CODES } from "../../src/config/countries.ts";
import { SEEDED_PRODUCT_COUNTS } from "../../src/config/catalogue/products.data.ts";
import {
  occasionKeys,
  seasonalOccasions,
} from "../../src/config/catalogue/schemas.ts";

const repoRoot = resolve(__dirname, "../..");

function read(path: string): string {
  return readFileSync(join(repoRoot, SEED_DATA_DIR, path), "utf8");
}

/** Every dataset file, parsed through the schema `SEED_DATA_FILES` assigns it. */
const parsed = new Map<string, Record<string, unknown>>(
  SEED_DATA_FILES.map((file) => [
    file.path,
    file.schema.parse(JSON.parse(read(file.path))) as Record<string, unknown>,
  ]),
);

function rows<T>(path: string): T[] {
  return (parsed.get(path)?.rows ?? []) as T[];
}

describe("spec 006 §2.2: every dataset file parses and carries its header", () => {
  it("parses each committed file under its own schema", () => {
    // `parsed` above throws on a malformed file; this asserts the set is the one the map declares
    // rather than a subset that happened to exist.
    expect([...parsed.keys()]).toEqual(SEED_DATA_FILES.map((f) => f.path));
  });

  it("records the entity and the expected origin in every header", () => {
    for (const file of SEED_DATA_FILES) {
      const header = parsed.get(file.path);
      expect(header?.entity, file.path).toBe(file.entity);
      expect(header?.origin, file.path).toBe(file.origin);
    }
  });

  it("keeps every authored file outside the catalogue entities ADR-0017 owns", () => {
    const authored = SEED_DATA_FILES.filter(
      (file) => file.origin === "authored",
    ).map((file) => file.path);
    // The calendar (spec 006 owns no catalogue rows), the imagery manifest (TASK-077) and the
    // variant manifest `pnpm media:variants` writes (TASK-078): none is a projection of
    // `src/config/catalogue/`, which is what ADR-0017 forbids duplicating.
    expect(authored).toEqual([
      "occasion-country.json",
      "media.json",
      "media-variants.json",
    ]);
  });
});

describe("ADR-0017: the projected files are a fresh projection, byte-for-byte", () => {
  it("matches a re-projection of src/config/catalogue/ exactly", async () => {
    for (const file of await projectSeedDataset(repoRoot)) {
      expect(
        readFileSync(join(repoRoot, file.path), "utf8"),
        `${file.path} is stale: run \`pnpm seed:project\``,
      ).toBe(file.contents);
    }
  });

  it("reports nothing stale, which is what `pnpm seed:project --check` exits 0 on", async () => {
    expect(await staleProjections(repoRoot)).toEqual([]);
  });

  it("names the authored module in every projected header, so a reader knows what to edit", () => {
    for (const file of SEED_DATA_FILES) {
      const projectedFrom = parsed.get(file.path)?.projectedFrom;
      if (file.origin === "projected") {
        expect(projectedFrom, file.path).toMatch(/^src\/config\/catalogue\//);
      } else {
        expect(projectedFrom, file.path).toBeUndefined();
      }
    }
  });
});

describe("spec 006 AC-4: counts, split and taxonomy resolution (T-04)", () => {
  interface ProductRowShape {
    sku: string;
    productType: string;
    primaryFlower: string;
    flowerTypes: string[];
    colourPrimary: string;
    colours: string[];
    style: string;
    priceTier: string;
    occasions: string[];
    substitutionClass: string;
  }

  const products = rows<ProductRowShape>("products.json");
  const taxonomy = parsed.get("taxonomy.json") as {
    facets: Record<string, string[]>;
    substitutionClasses: string[];
  };

  it("holds exactly 84 products in plan/10 §2.1's 40/14/8/10/12 split", () => {
    expect(products).toHaveLength(84);
    const byType = new Map<string, number>();
    for (const product of products) {
      byType.set(
        product.productType,
        (byType.get(product.productType) ?? 0) + 1,
      );
    }
    expect(Object.fromEntries([...byType].sort())).toEqual(
      Object.fromEntries(Object.entries(SEEDED_PRODUCT_COUNTS).sort()),
    );
    expect(
      Object.values(SEEDED_PRODUCT_COUNTS).reduce((sum, n) => sum + n, 0),
    ).toBe(84);
  });

  it("holds 23 categories as 5 product-type roots + 10 occasions + 8 flower hubs", () => {
    const categories = rows<{ key: string; kind: string }>("categories.json");
    expect(categories).toHaveLength(23);
    const byKind = new Map<string, number>();
    for (const category of categories) {
      byKind.set(category.kind, (byKind.get(category.kind) ?? 0) + 1);
    }
    expect(Object.fromEntries([...byKind].sort())).toEqual({
      flowerType: 8,
      occasion: 10,
      productType: 5,
    });
  });

  it("holds the whole occasion facet and the six add-ons of plan/10 §2.1", () => {
    const occasions = rows<{ key: string }>("occasions.json");
    expect(occasions.map((occasion) => occasion.key).sort()).toEqual(
      [...occasionKeys].sort(),
    );
    const addons = rows<{ key: string }>("addons.json");
    expect(addons.map((addon) => addon.key)).toEqual([
      "chocolates",
      "vase",
      "balloon",
      "plush",
      "wine",
      "card",
    ]);
  });

  it("gives every product a tier group, and every group one default tier", () => {
    const groups = rows<{ sku: string; tiers: { isDefault: boolean }[] }>(
      "product-tiers.json",
    );
    expect(groups.map((group) => group.sku).sort()).toEqual(
      products.map((product) => product.sku).sort(),
    );
    for (const group of groups) {
      expect(
        group.tiers.filter((tier) => tier.isDefault),
        group.sku,
      ).toHaveLength(1);
    }
    // The flattening the importer consumes covers every tier of every group.
    expect(seedProductTierRecords(groups as never)).toHaveLength(
      groups.reduce((sum, group) => sum + group.tiers.length, 0),
    );
  });

  it("resolves every product facet value in taxonomy.json", () => {
    for (const product of products) {
      expect(taxonomy.facets.productType, product.sku).toContain(
        product.productType,
      );
      expect(taxonomy.facets.style, product.sku).toContain(product.style);
      expect(taxonomy.facets.priceTier, product.sku).toContain(
        product.priceTier,
      );
      expect(taxonomy.substitutionClasses, product.sku).toContain(
        product.substitutionClass,
      );
      for (const flower of product.flowerTypes) {
        expect(taxonomy.facets.flowerType, product.sku).toContain(flower);
      }
      for (const colour of product.colours) {
        expect(taxonomy.facets.colour, product.sku).toContain(colour);
      }
      for (const occasion of product.occasions) {
        expect(taxonomy.facets.occasion, product.sku).toContain(occasion);
      }
    }
  });

  it("carries no copy, no price and no imagery: those are TASK-073/074/077's", () => {
    const raw = read("products.json");
    for (const forbidden of [
      "descriptionMd",
      "retailMinor",
      "seoTitle",
      "assetId",
    ]) {
      expect(raw, forbidden).not.toContain(forbidden);
    }
  });
});

describe("occasion-country.json: the per-destination calendar (plan/03 §9, plan/13 D6)", () => {
  interface CalendarRow {
    occasionKey: string;
    countryIso2: string;
    ruleType: string;
    rule: Record<string, unknown>;
    observed: boolean;
    indexableOverride: boolean | null;
    promoStartOffsetDays: number;
  }

  const calendar = rows<CalendarRow>("occasion-country.json");

  it("covers every (destination, seasonal occasion) pair exactly once", () => {
    expect(calendar).toHaveLength(
      COUNTRY_CODES.length * seasonalOccasions.length,
    );
    const keys = new Set(
      calendar.map((row) => `${row.occasionKey}/${row.countryIso2}`),
    );
    expect(keys.size).toBe(calendar.length);
    for (const iso2 of COUNTRY_CODES) {
      for (const occasion of seasonalOccasions) {
        expect(keys, `${occasion}/${iso2}`).toContain(`${occasion}/${iso2}`);
      }
    }
  });

  it("names the destinations of src/config/countries.ts and no others", () => {
    expect([...new Set(calendar.map((row) => row.countryIso2))].sort()).toEqual(
      [...COUNTRY_CODES].sort(),
    );
  });

  it("carries no row for an evergreen occasion (there is no per-country date to hold)", () => {
    const evergreen = occasionKeys.filter(
      (key) => !(seasonalOccasions as readonly string[]).includes(key),
    );
    for (const key of evergreen) {
      expect(
        calendar.some((row) => row.occasionKey === key),
        key,
      ).toBe(false);
    }
  });

  /**
   * `plan/09` line 3 and `plan/03` §9's fixture dates, pinned **as rules**. The evaluator
   * `occasionDate(rule, year)` is spec 009's (`plan/03` §9) and writing one here would be a second
   * implementation, so what this test can honestly assert is the transcription: Valentine's is a
   * fixed 14 February, Women's Day a fixed 8 March, DE Muttertag the second Sunday in May, PL
   * Dzień Matki a fixed 26 May, and UK Mothering Sunday the fourth Sunday of Lent — the last of
   * which has no row because the UK is a buyer market with no destination row yet
   * (`src/config/countries.ts`), and is recorded in the file's notes instead.
   */
  it("transcribes plan/09 line 3's reference rules", () => {
    const rule = (occasion: string, iso2: string): unknown =>
      calendar.find(
        (row) => row.occasionKey === occasion && row.countryIso2 === iso2,
      )?.rule;
    expect(rule("valentines", "PL")).toEqual({
      kind: "fixed",
      month: 2,
      day: 14,
    });
    expect(rule("womens_day", "PL")).toEqual({
      kind: "fixed",
      month: 3,
      day: 8,
    });
    expect(rule("mothers_day", "DE")).toEqual({
      kind: "nth_weekday",
      month: 5,
      weekday: 7,
      n: 2,
    });
    expect(rule("mothers_day", "PL")).toEqual({
      kind: "fixed",
      month: 5,
      day: 26,
    });
  });

  it("keeps an unobserved occasion date-free and every override deliberate", () => {
    for (const row of calendar) {
      const key = `${row.occasionKey}/${row.countryIso2}`;
      expect(row.rule.kind, key).toBe(row.ruleType);
      if (!row.observed) {
        expect(row.ruleType, key).toBe("none");
        expect(row.promoStartOffsetDays, key).toBe(0);
      }
      // No manual indexability override is authored: indexability is derived from the data
      // (ADR-0007), and an override in the seed would be a code-shaped decision in a data file.
      expect(row.indexableOverride, key).toBeNull();
    }
  });

  it("carries plan/13 D6's verification note in the file itself", () => {
    const notes = (parsed.get("occasion-country.json")?.notes ??
      []) as string[];
    expect(notes.join(" ")).toContain("D6");
    expect(notes.join(" ")).toMatch(/verif/i);
  });
});
