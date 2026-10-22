/**
 * T-37 (spec 005 §14 A-founder-2026-10-14c and A-founder-2026-10-15a, AC-36; spec 006 §14
 * A-founder-2026-10-14c; TASK-240): every offered stem count is odd and never 13, in every country.
 *
 * Four things are pinned here, each against one value rather than a set of reachable ones:
 *
 *  1. **The dataset and its seed projection** (`tiers.data.ts`, `seed/data/product-tiers.json`):
 *     no even count, no 13, `tierKey` is `stems_{stems}`, one default per stem product at its
 *     middle position, and each product's counts are exactly point 3's mapping of its pinned base
 *     (FO-BQ-004 at 5 / 7 / 9, A-founder-2026-10-15a point 4).
 *  2. **Prices by position** against the pinned base (`tests/fixtures/catalog/tier-price-base.json`,
 *     dumped from main before the remap and never regenerated): every (SKU, destination, position)
 *     cell equals the base, in the authored rows and in the seed price files, except the six PL
 *     cells of A-founder-2026-10-15a point 5, which are T-38's and are left out here.
 *  3. **`catalogue:check`** names the SKU and the tier and fails on a 12-stem tier, a 13-stem tier
 *     and a key that disagrees with its count.
 *  4. **`seed:check`** does the same over `product-tiers.json`, and its exit code is 1.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import {
  type CatalogueCheckInput,
  type Problem,
  catalogueCheckInput,
  checkCatalogue,
} from "../../scripts/catalogue-check.ts";
import {
  type SeedTree,
  checkSeedDataset,
  readSeedTree,
  seedCheckExitCode,
} from "../../seed/check.ts";
import { DESTINATION_PRICING } from "../../src/config/catalogue/prices.data.ts";
import { COUNTRY_PRICES } from "../../src/config/catalogue/prices.data.ts";
import { PRODUCTS } from "../../src/config/catalogue/products.data.ts";
import type { ProductTierRecord } from "../../src/config/catalogue/schemas.ts";
import {
  PRODUCT_TIER_GROUPS,
  PRODUCT_TIERS,
} from "../../src/config/catalogue/tiers.data.ts";

const repoRoot = resolve(__dirname, "../..");
/** `readSeedTree()` re-projects the dataset; see `tests/unit/seed-check.test.ts`'s header. */
const TREE_TIMEOUT = 30_000;

/* -------------------------------------------------------------------------- */
/* The pinned base and the amendment's tables, transcribed.                   */
/* -------------------------------------------------------------------------- */

const BaseSchema = z.object({
  pinnedAt: z.string(),
  products: z.record(
    z.string(),
    z.object({
      tierKeys: z.array(z.string()),
      stems: z.array(z.number().int().nullable()),
      defaultSort: z.number().int(),
      retailMinor: z.record(z.string(), z.array(z.number().int())),
    }),
  ),
});

const BASE = BaseSchema.parse(
  JSON.parse(
    readFileSync(
      resolve(repoRoot, "tests/fixtures/catalog/tier-price-base.json"),
      "utf8",
    ),
  ),
);

/** Spec 005 §14 A-founder-2026-10-14c point 3, transcribed: today's counts → the odd ones. */
const MAPPING: ReadonlyMap<string, readonly number[]> = new Map([
  ["12,18,24", [11, 15, 21]],
  ["10,15,21", [11, 15, 21]],
  ["5,8,12", [5, 9, 15]],
  ["5,9,13", [5, 9, 15]],
  ["15,25,35", [15, 25, 35]],
  ["9,15,21", [9, 15, 21]],
  ["3,5,7", [3, 5, 7]],
]);

/** A-founder-2026-10-15a point 4: the one SKU that leaves point 3's table. */
const FO_BQ_004_STEMS = [5, 7, 9];

/** A-founder-2026-10-15a point 5: the six cells that move are T-38's, not this file's. */
const T38_CELLS = new Set(
  ["FO-BQ-001", "FO-BQ-003", "FO-BQ-007"].flatMap((sku) => [
    `${sku}|PL|1`,
    `${sku}|PL|2`,
  ]),
);

function expectedStems(sku: string): readonly (number | null)[] {
  const base = BASE.products[sku];
  if (base === undefined) throw new Error(`no base for ${sku}`);
  if (base.stems.every((stems) => stems === null)) return base.stems;
  if (sku === "FO-BQ-004") return FO_BQ_004_STEMS;
  const mapped = MAPPING.get(base.stems.join(","));
  if (mapped === undefined) {
    throw new Error(`${sku}: base ${base.stems.join("/")} is not in point 3`);
  }
  return mapped;
}

/** The faults AC-36 names, over one product's tier list. */
function stemFaults(
  groups: readonly {
    readonly sku: string;
    readonly tiers: readonly {
      readonly tierKey: string;
      readonly stems: number | null;
      readonly sort: number;
      readonly isDefault: boolean;
    }[];
  }[],
): readonly string[] {
  const faults: string[] = [];
  for (const group of groups) {
    const stemTiers = group.tiers.filter((tier) => tier.stems !== null);
    if (stemTiers.length === 0) continue;
    for (const tier of stemTiers) {
      const stems = tier.stems ?? 0;
      if (stems % 2 === 0) faults.push(`${group.sku} ${tier.tierKey} even`);
      if (stems === 13) faults.push(`${group.sku} ${tier.tierKey} thirteen`);
      if (tier.tierKey !== `stems_${String(stems)}`) {
        faults.push(`${group.sku} ${tier.tierKey} key`);
      }
    }
    const defaults = stemTiers.filter((tier) => tier.isDefault);
    const middle = Math.floor((stemTiers.length - 1) / 2);
    if (defaults.length !== 1 || defaults[0]?.sort !== middle) {
      faults.push(`${group.sku} default not the one middle tier`);
    }
  }
  return faults;
}

/* -------------------------------------------------------------------------- */
/* 1. The dataset and its seed projection.                                    */
/* -------------------------------------------------------------------------- */

const SeedTiersSchema = z.object({
  rows: z.array(
    z.object({
      sku: z.string(),
      tiers: z.array(
        z.object({
          tierKey: z.string(),
          labelKey: z.string(),
          stems: z.number().int().nullable(),
          sort: z.number().int(),
          isDefault: z.boolean(),
        }),
      ),
    }),
  ),
});

const seedTiers = SeedTiersSchema.parse(
  JSON.parse(
    readFileSync(resolve(repoRoot, "seed/data/product-tiers.json"), "utf8"),
  ),
).rows;

describe("AC-36: the dataset offers odd counts only, never 13, keyed by count", () => {
  it("has no even count, no 13, no mismatched key and one middle default in tiers.data.ts", () => {
    expect(stemFaults(PRODUCT_TIER_GROUPS)).toEqual([]);
  });

  it("has the same in the seed projection seed/data/product-tiers.json", () => {
    expect(stemFaults(seedTiers)).toEqual([]);
  });

  it("projects the dataset into the seed file unchanged (spec 006 A-founder-2026-10-14c)", () => {
    expect(seedTiers).toEqual(
      PRODUCT_TIER_GROUPS.map((group) => ({
        sku: group.sku,
        tiers: group.tiers.map((tier) => ({ ...tier })),
      })),
    );
  });

  it("gives every product exactly point 3's counts for its base, and FO-BQ-004 5 / 7 / 9", () => {
    expect(Object.keys(BASE.products).sort()).toEqual(
      PRODUCT_TIER_GROUPS.map((group) => group.sku).sort(),
    );
    for (const group of PRODUCT_TIER_GROUPS) {
      expect(
        group.tiers.map((tier) => tier.stems),
        group.sku,
      ).toEqual(expectedStems(group.sku));
      const base = BASE.products[group.sku];
      expect(
        group.tiers.findIndex((tier) => tier.isDefault),
        group.sku,
      ).toBe(base?.defaultSort);
    }
  });

  it("keys FO-BQ-004 stems_5 / stems_7 / stems_9 with stems_7 preselected (A-founder-2026-10-15a point 4)", () => {
    const group = PRODUCT_TIER_GROUPS.find((g) => g.sku === "FO-BQ-004");
    expect(group?.tiers.map((tier) => tier.tierKey)).toEqual([
      "stems_5",
      "stems_7",
      "stems_9",
    ]);
    expect(group?.tiers.find((tier) => tier.isDefault)?.tierKey).toBe(
      "stems_7",
    );
    expect(PRODUCTS.find((p) => p.sku === "FO-BQ-004")?.stemCount).toBe(7);
  });

  it("leaves tiers without a stem count exactly as they were (point 1)", () => {
    for (const group of PRODUCT_TIER_GROUPS) {
      const base = BASE.products[group.sku];
      if (base === undefined || base.stems.some((stems) => stems !== null)) {
        continue;
      }
      expect(
        group.tiers.map((tier) => tier.tierKey),
        group.sku,
      ).toEqual(base.tierKeys);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 2. Prices by position against the pinned base.                             */
/* -------------------------------------------------------------------------- */

interface PriceRow {
  readonly sku: string;
  readonly countryIso2: string;
  readonly tierKey: string | null;
  readonly retailMinor: number;
  readonly surchargeKind: string | null;
}

/** Every (SKU, destination, position) whose amount differs from the base, outside T-38's six. */
function positionDiff(rows: readonly PriceRow[]): readonly string[] {
  const sortOf = new Map(
    PRODUCT_TIERS.map((tier) => [`${tier.sku}|${tier.tierKey}`, tier.sort]),
  );
  const seen = new Set<string>();
  const diff: string[] = [];
  for (const row of rows) {
    if (row.surchargeKind !== null || row.tierKey === null) continue;
    const sort = sortOf.get(`${row.sku}|${row.tierKey}`);
    const cell = `${row.sku}|${row.countryIso2}|${String(sort)}`;
    seen.add(cell);
    if (T38_CELLS.has(cell)) continue;
    const base = BASE.products[row.sku]?.retailMinor[row.countryIso2];
    const was = sort === undefined ? undefined : base?.[sort];
    if (was !== row.retailMinor) {
      diff.push(`${cell} ${String(was)} -> ${String(row.retailMinor)}`);
    }
  }
  for (const [sku, base] of Object.entries(BASE.products)) {
    for (const [iso2, amounts] of Object.entries(base.retailMinor)) {
      amounts.forEach((_, sort) => {
        const cell = `${sku}|${iso2}|${String(sort)}`;
        if (!seen.has(cell)) diff.push(`${cell} missing`);
      });
    }
  }
  return diff;
}

describe("AC-36: every tier price equals the pinned base, position by position", () => {
  it("pins the base to the 84 products in all seven destinations", () => {
    expect(BASE.pinnedAt).toBe("501c12f8");
    expect(Object.keys(BASE.products)).toHaveLength(84);
    expect(
      Object.keys(BASE.products["FO-BQ-001"]?.retailMinor ?? {}).sort(),
    ).toEqual(DESTINATION_PRICING.map((d) => d.countryIso2).sort());
  });

  it("moves no amount in prices.data.ts's expanded rows", () => {
    expect(positionDiff(COUNTRY_PRICES)).toEqual([]);
  });

  it("moves no amount in the seed price files", () => {
    const rows = DESTINATION_PRICING.flatMap(
      (destination) =>
        z
          .object({
            rows: z.array(
              z.object({
                sku: z.string(),
                countryIso2: z.string(),
                tierKey: z.string().nullable(),
                retailMinor: z.number().int(),
                surchargeKind: z.string().nullable(),
              }),
            ),
          })
          .parse(
            JSON.parse(
              readFileSync(
                resolve(
                  repoRoot,
                  `seed/data/prices/${destination.countryIso2}.json`,
                ),
                "utf8",
              ),
            ),
          ).rows,
    );
    expect(positionDiff(rows)).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* 3 and 4. The gates refuse each fault, naming the SKU and the tier.         */
/* -------------------------------------------------------------------------- */

const SKU = "FO-BQ-001";

/** One fixture per fault: the first tier of FO-BQ-001 rewritten. */
const FAULTS = [
  {
    name: "a 12-stem tier",
    tier: { tierKey: "stems_12", stems: 12 },
    reason: "offers 12 stems, an even count",
  },
  {
    name: "a 13-stem tier",
    tier: { tierKey: "stems_13", stems: 13 },
    reason: "offers 13 stems: no tier offers thirteen",
  },
  {
    name: "a key that does not match its count",
    tier: { tierKey: "stems_11", stems: 9 },
    reason: "carries 9 stems under the key `stems_11`",
  },
] as const;

function withFirstTier(
  tiers: readonly ProductTierRecord[],
  patch: { readonly tierKey: string; readonly stems: number },
): ProductTierRecord[] {
  return tiers.map((tier) =>
    tier.sku === SKU && tier.sort === 0 ? { ...tier, ...patch } : tier,
  );
}

describe("AC-36: catalogue:check refuses each fault, naming the SKU and the tier", () => {
  const clean = catalogueCheckInput();
  const stemProblems = (input: CatalogueCheckInput): readonly Problem[] =>
    checkCatalogue(input).filter((problem) => problem.mode === "stem-tier");

  it("is clean on the committed tree", () => {
    expect(stemProblems(clean)).toEqual([]);
  });

  it.each(FAULTS)("fails on $name", ({ tier, reason }) => {
    const problems = stemProblems({
      ...clean,
      tiers: withFirstTier(clean.tiers, tier),
    });

    expect(
      problems.map((problem) => `${problem.subject}: ${problem.reason}`),
    ).toHaveLength(1);
    expect(problems[0]?.subject).toBe(`${SKU} ${tier.tierKey}`);
    expect(problems[0]?.reason.startsWith(reason)).toBe(true);
    expect(problems[0]?.file).toBe("src/config/catalogue/tiers.data.ts");
  });

  it("fails on a default that is not the middle tier", () => {
    const problems = stemProblems({
      ...clean,
      tiers: clean.tiers.map((tier) =>
        tier.sku === SKU ? { ...tier, isDefault: tier.sort === 2 } : tier,
      ),
    });

    expect(problems.map((problem) => problem.subject)).toEqual([
      `${SKU} stems_21`,
    ]);
  });
});

describe("AC-36: seed:check refuses each fault in product-tiers.json", () => {
  let tree: SeedTree;

  beforeAll(async () => {
    tree = await readSeedTree(
      repoRoot,
      new Map(),
      new Date("2026-09-23T10:00:00Z"),
    );
  }, TREE_TIMEOUT);

  function withSeedTier(patch: {
    readonly tierKey: string;
    readonly stems: number;
  }): SeedTree {
    const file = structuredClone(tree.raw.get("product-tiers.json")) as {
      rows: { sku: string; tiers: { sort: number }[] }[];
    };
    file.rows = file.rows.map((row) =>
      row.sku === SKU
        ? {
            ...row,
            tiers: row.tiers.map((t) =>
              t.sort === 0 ? { ...t, ...patch } : t,
            ),
          }
        : row,
    );
    return {
      ...tree,
      raw: new Map([...tree.raw, ["product-tiers.json", file]]),
    };
  }

  it(
    "is clean on the committed tree",
    () => {
      expect(
        checkSeedDataset(tree).filter((p) => p.rule === "stem-tier"),
      ).toEqual([]);
    },
    TREE_TIMEOUT,
  );

  it.each(FAULTS)(
    "fails on $name with exit code 1",
    ({ tier, reason }) => {
      const problems = checkSeedDataset(withSeedTier(tier));
      const stem = problems.filter((problem) => problem.rule === "stem-tier");

      expect(stem).toHaveLength(1);
      expect(stem[0]?.key).toBe(`${SKU} ${tier.tierKey}`);
      expect(stem[0]?.message.startsWith(reason)).toBe(true);
      expect(stem[0]?.message).toContain("seed/data/product-tiers.json");
      expect(seedCheckExitCode(problems)).toBe(1);
    },
    TREE_TIMEOUT,
  );
});
