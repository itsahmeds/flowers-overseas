/**
 * T-38, T-39 and T-40 (spec 005 §14 A-founder-2026-10-15a, AC-37, AC-38, AC-39; TASK-314): the
 * Polish market price for the three classic rose bouquets, as a per-SKU ladder override.
 *
 *  - **T-38 (AC-37).** The nine PL rows of FO-BQ-001/003/007 are 19 900 / 23 900 / 32 900 by key,
 *    the PL classic ladder is still 19 900 / 22 900 / 25 900, FO-BQ-004 is 5 / 7 / 9 at its
 *    position amounts everywhere, and the (SKU, destination, position) diff against the pinned
 *    base (`tests/fixtures/catalog/tier-price-base.json`, never regenerated) is exactly the six
 *    cells of point 5. Surcharge and add-on rows equal their own pin
 *    (`tests/fixtures/catalog/surcharge-addon-base.json`, dumped from main before this task).
 *  - **T-39 (AC-38).** The override set is exactly point 2's table; `catalogue:check` (which exits
 *    1 whenever `checkCatalogue()` returns a problem) refuses an override SKU above 32 900, another
 *    PL classic SKU above 25 900 and an override ladder that does not increase, each naming SKU,
 *    tier and destination; module load refuses an override key the SKU does not carry; the clean
 *    tree passes.
 *  - **T-40 (AC-39).** `docs/runbooks/pricing.md` records the change made in place.
 *
 * Every amount is typed out here, from the amendment's tables, rather than read from the dataset
 * under test: a test that read `ladderOverrides` to check `ladderOverrides` would agree with
 * anything.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  type CatalogueCheckInput,
  type Problem,
  catalogueCheckInput,
  checkCatalogue,
} from "../../scripts/catalogue-check.ts";
import {
  ADDON_COUNTRY_PRICES,
  COUNTRY_PRICES,
  DESTINATION_PRICING,
  expandRetailRows,
} from "../../src/config/catalogue/prices.data.ts";
import type { DestinationPricing } from "../../src/config/catalogue/schemas.ts";
import {
  PRODUCT_TIER_GROUPS,
  PRODUCT_TIERS,
} from "../../src/config/catalogue/tiers.data.ts";

const repoRoot = resolve(__dirname, "../..");

/* -------------------------------------------------------------------------- */
/* The amendment's tables, transcribed.                                       */
/* -------------------------------------------------------------------------- */

/** Point 2's table: SKU, destination and the three amounts by tier key, PLN minor units. */
const POINT_2 = [
  {
    countryIso2: "PL",
    sku: "FO-BQ-001",
    tiers: { stems_11: 19_900, stems_15: 23_900, stems_21: 32_900 },
  },
  {
    countryIso2: "PL",
    sku: "FO-BQ-003",
    tiers: { stems_11: 19_900, stems_15: 23_900, stems_21: 32_900 },
  },
  {
    countryIso2: "PL",
    sku: "FO-BQ-007",
    tiers: { stems_11: 19_900, stems_15: 23_900, stems_21: 32_900 },
  },
] as const;

/** Point 5: the only (SKU, destination, position) cells that differ from the pinned base. */
const POINT_5_CELLS = [
  "FO-BQ-001|PL|1 22900→23900",
  "FO-BQ-001|PL|2 25900→32900",
  "FO-BQ-003|PL|1 22900→23900",
  "FO-BQ-003|PL|2 25900→32900",
  "FO-BQ-007|PL|1 22900→23900",
  "FO-BQ-007|PL|2 25900→32900",
];

/* -------------------------------------------------------------------------- */
/* The pins.                                                                  */
/* -------------------------------------------------------------------------- */

const BASE = z
  .object({
    pinnedAt: z.string(),
    products: z.record(
      z.string(),
      z.object({
        tierKeys: z.array(z.string()),
        retailMinor: z.record(z.string(), z.array(z.number().int())),
      }),
    ),
  })
  .parse(
    JSON.parse(
      readFileSync(
        resolve(repoRoot, "tests/fixtures/catalog/tier-price-base.json"),
        "utf8",
      ),
    ),
  );

const SURCHARGE_ADDON_BASE = z
  .object({
    pinnedAt: z.string(),
    surcharges: z.array(z.string()),
    addons: z.array(z.string()),
  })
  .parse(
    JSON.parse(
      readFileSync(
        resolve(repoRoot, "tests/fixtures/catalog/surcharge-addon-base.json"),
        "utf8",
      ),
    ),
  );

const sortOf = new Map(
  PRODUCT_TIERS.map((tier) => [`${tier.sku}|${tier.tierKey}`, tier.sort]),
);

function retail(sku: string, iso2: string, tierKey: string): number {
  const row = COUNTRY_PRICES.find(
    (candidate) =>
      candidate.sku === sku &&
      candidate.countryIso2 === iso2 &&
      candidate.tierKey === tierKey &&
      candidate.surchargeKind === null &&
      candidate.activeTo === null,
  );
  if (row === undefined) throw new Error(`no row ${sku} ${tierKey} ${iso2}`);
  return row.retailMinor;
}

/** Every (SKU, destination, position) cell whose amount differs from the pinned base. */
function positionDiff(): string[] {
  const diff: string[] = [];
  for (const row of COUNTRY_PRICES) {
    if (row.surchargeKind !== null || row.activeTo !== null) continue;
    const sort = sortOf.get(`${row.sku}|${row.tierKey ?? "-"}`);
    if (sort === undefined)
      throw new Error(`no tier ${row.sku} ${row.tierKey ?? "-"}`);
    const base = BASE.products[row.sku]?.retailMinor[row.countryIso2]?.[sort];
    if (base !== row.retailMinor) {
      diff.push(
        `${row.sku}|${row.countryIso2}|${String(sort)} ${String(base)}→${String(row.retailMinor)}`,
      );
    }
  }
  return diff.sort();
}

/* -------------------------------------------------------------------------- */
/* T-38 (AC-37).                                                              */
/* -------------------------------------------------------------------------- */

describe("AC-37: the PL classic roses at the Polish market price, everything else by position", () => {
  it("prices FO-BQ-001, -003 and -007 in PL at 19 900 / 23 900 / 32 900 by tier key", () => {
    for (const sku of ["FO-BQ-001", "FO-BQ-003", "FO-BQ-007"]) {
      expect(retail(sku, "PL", "stems_11"), sku).toBe(19_900);
      expect(retail(sku, "PL", "stems_15"), sku).toBe(23_900);
      expect(retail(sku, "PL", "stems_21"), sku).toBe(32_900);
    }
  });

  it("preselects stems_15 on each of the three", () => {
    for (const sku of ["FO-BQ-001", "FO-BQ-003", "FO-BQ-007"]) {
      const defaults = PRODUCT_TIERS.filter(
        (tier) => tier.sku === sku && tier.isDefault,
      ).map((tier) => tier.tierKey);
      expect(defaults, sku).toEqual(["stems_15"]);
    }
  });

  it("keeps the PL classic ladder at 19 900 / 22 900 / 25 900", () => {
    const pl = DESTINATION_PRICING.find((d) => d.countryIso2 === "PL");
    expect(pl?.ladders.classic).toEqual([19_900, 22_900, 25_900]);
  });

  it("gives FO-BQ-004 exactly 5 / 7 / 9 stems, stems_7 preselected, at its position amounts in all seven destinations", () => {
    const group = PRODUCT_TIER_GROUPS.find((g) => g.sku === "FO-BQ-004");
    expect(group?.tiers.map((tier) => tier.stems)).toEqual([5, 7, 9]);
    expect(
      group?.tiers.filter((tier) => tier.isDefault).map((tier) => tier.stems),
    ).toEqual([7]);
    const base = BASE.products["FO-BQ-004"]?.retailMinor ?? {};
    expect(Object.keys(base).sort()).toEqual(
      DESTINATION_PRICING.map((d) => d.countryIso2).sort(),
    );
    for (const [iso2, amounts] of Object.entries(base)) {
      expect(
        ["stems_5", "stems_7", "stems_9"].map((key) =>
          retail("FO-BQ-004", iso2, key),
        ),
        iso2,
      ).toEqual(amounts);
    }
    expect(
      ["stems_5", "stems_7", "stems_9"].map((key) =>
        retail("FO-BQ-004", "PL", key),
      ),
    ).toEqual([14_900, 16_900, 18_900]);
  });

  it("differs from the pinned base in exactly the six cells of point 5", () => {
    expect(BASE.pinnedAt).toBe("501c12f8");
    expect(positionDiff()).toEqual(POINT_5_CELLS);
  });

  it("leaves every surcharge row and every add-on row as it was before this task", () => {
    expect(SURCHARGE_ADDON_BASE.pinnedAt).toBe("5adb1e0b");
    expect(
      COUNTRY_PRICES.filter((row) => row.surchargeKind !== null).map((row) =>
        [
          row.sku,
          row.countryIso2,
          row.surchargeKind,
          row.activeFrom,
          row.activeTo,
          row.retailMinor,
          row.currency,
          row.vatRateBp,
        ].join("|"),
      ),
    ).toEqual(SURCHARGE_ADDON_BASE.surcharges);
    expect(
      ADDON_COUNTRY_PRICES.map((row) =>
        [
          row.addonKey,
          row.countryIso2,
          row.retailMinor,
          row.currency,
          row.vatRateBp,
          row.activeFrom,
          row.activeTo,
        ].join("|"),
      ),
    ).toEqual(SURCHARGE_ADDON_BASE.addons);
  });

  it("carries the same six amounts into the seed projection seed/data/prices/PL.json", () => {
    const rows = z
      .object({
        rows: z.array(
          z.object({
            sku: z.string(),
            tierKey: z.string().nullable(),
            retailMinor: z.number().int(),
          }),
        ),
      })
      .parse(
        JSON.parse(
          readFileSync(resolve(repoRoot, "seed/data/prices/PL.json"), "utf8"),
        ),
      ).rows;
    for (const sku of ["FO-BQ-001", "FO-BQ-003", "FO-BQ-007"]) {
      expect(
        rows
          .filter((row) => row.sku === sku && row.tierKey !== null)
          .map((row) => [row.tierKey, row.retailMinor]),
        sku,
      ).toEqual([
        ["stems_11", 19_900],
        ["stems_15", 23_900],
        ["stems_21", 32_900],
      ]);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* T-39 (AC-38).                                                              */
/* -------------------------------------------------------------------------- */

const clean = catalogueCheckInput();

function problemsFor(overrides: Partial<CatalogueCheckInput>): Problem[] {
  return checkCatalogue({ ...clean, ...overrides });
}

function withRetail(
  patch: (
    sku: string,
    iso2: string,
    tierKey: string | null,
  ) => number | undefined,
): Partial<CatalogueCheckInput> {
  return {
    countryPrices: clean.countryPrices.map((row) => {
      if (row.surchargeKind !== null) return row;
      const amount = patch(row.sku, row.countryIso2, row.tierKey);
      return amount === undefined ? row : { ...row, retailMinor: amount };
    }),
  };
}

function withPlOverrides(
  edit: (
    overrides: DestinationPricing["ladderOverrides"],
  ) => DestinationPricing["ladderOverrides"],
): DestinationPricing[] {
  return DESTINATION_PRICING.map((destination) =>
    destination.countryIso2 === "PL"
      ? { ...destination, ladderOverrides: edit(destination.ladderOverrides) }
      : destination,
  );
}

describe("AC-38: the override set is exactly point 2's table", () => {
  it("has three SKUs, PL only, three tier keys each, at point 2's amounts", () => {
    const authored = DESTINATION_PRICING.flatMap((destination) =>
      destination.ladderOverrides.map((override) => ({
        countryIso2: destination.countryIso2,
        sku: override.sku,
        tiers: override.tiers,
      })),
    );
    expect(authored).toEqual(POINT_2);
  });

  it("gives each override the recorded band 19 900 to 32 900", () => {
    const pl = DESTINATION_PRICING.find((d) => d.countryIso2 === "PL");
    expect(pl?.ladderOverrides.map((o) => [o.sku, o.band])).toEqual(
      POINT_2.map((row) => [row.sku, { fromMinor: 19_900, toMinor: 32_900 }]),
    );
  });
});

describe("AC-38: catalogue:check's band mode, override SKUs to 19 900…32 900 and every other row to its band", () => {
  it("is clean on the committed tree (the CLI exits 0)", () => {
    expect(checkCatalogue(clean)).toEqual([]);
  });

  it("refuses an override SKU above 32 900, naming SKU, tier and destination", () => {
    const problems = problemsFor(
      withRetail((sku, iso2, tierKey) =>
        sku === "FO-BQ-001" && iso2 === "PL" && tierKey === "stems_21"
          ? 33_900
          : undefined,
      ),
    );
    expect(problems.map((p) => [p.mode, p.subject])).toEqual([
      ["band", "FO-BQ-001 stems_21 PL"],
    ]);
    expect(problems[0]?.reason).toContain("19900…32900");
  });

  it("refuses another PL classic SKU above 25 900 (FO-BQ-011 at 32 900), naming SKU, tier and destination", () => {
    const problems = problemsFor(
      withRetail((sku, iso2, tierKey) =>
        sku === "FO-BQ-011" && iso2 === "PL" && tierKey === "stems_35"
          ? 32_900
          : undefined,
      ),
    );
    expect(problems.map((p) => [p.mode, p.subject])).toEqual([
      ["band", "FO-BQ-011 stems_35 PL"],
    ]);
    expect(problems[0]?.reason).toContain("`classic` band 19900…25900");
  });

  it("refuses an override ladder that does not increase (23 900 / 19 900 / 32 900), naming SKU, tier and destination", () => {
    const ladder: Readonly<Record<string, number>> = {
      stems_11: 23_900,
      stems_15: 19_900,
      stems_21: 32_900,
    };
    const problems = problemsFor(
      withRetail((sku, iso2, tierKey) =>
        sku === "FO-BQ-001" && iso2 === "PL" && tierKey !== null
          ? ladder[tierKey]
          : undefined,
      ),
    );
    expect(problems.map((p) => [p.mode, p.subject])).toEqual([
      ["band", "FO-BQ-001 stems_15 PL"],
    ]);
    expect(problems[0]?.reason).toContain("not above tier 0");
  });

  it("refuses an override amount off the złoty ending, naming SKU, tier and destination", () => {
    const problems = problemsFor(
      withRetail((sku, iso2, tierKey) =>
        sku === "FO-BQ-003" && iso2 === "PL" && tierKey === "stems_15"
          ? 23_800
          : undefined,
      ),
    );
    expect(problems.map((p) => [p.mode, p.subject])).toEqual([
      ["rounding-ending", "FO-BQ-003 stems_15 PL"],
    ]);
  });

  it("refuses an override band wider than the recorded change", () => {
    const problems = problemsFor({
      destinations: withPlOverrides((overrides) =>
        overrides.map((o) =>
          o.sku === "FO-BQ-007"
            ? { ...o, band: { fromMinor: 19_900, toMinor: 33_900 } }
            : o,
        ),
      ),
    });
    expect(problems.map((p) => [p.mode, p.subject])).toEqual([
      ["band", "FO-BQ-007 PL"],
    ]);
    expect(problems[0]?.reason).toContain("records 199…329");
  });

  it("refuses an override with no recorded band change (FO-BQ-002 added)", () => {
    const problems = problemsFor({
      destinations: withPlOverrides((overrides) => [
        ...overrides,
        {
          sku: "FO-BQ-002",
          band: { fromMinor: 19_900, toMinor: 32_900 },
          tiers: { stems_11: 26_900, stems_15: 30_900, stems_21: 32_900 },
        },
      ]),
    });
    // Two refusals: the unrecorded override itself, and FO-BQ-002's real 349 zł top tier, which
    // the unrecorded band would now cap at 329 zł.
    expect(problems.map((p) => [p.mode, p.subject])).toEqual([
      ["band", "FO-BQ-002 stems_21 PL"],
      ["band", "FO-BQ-002 PL"],
    ]);
  });

  it("refuses a recorded band change whose override was dropped (FO-BQ-007 removed)", () => {
    const problems = problemsFor({
      destinations: withPlOverrides((overrides) =>
        overrides.filter((o) => o.sku !== "FO-BQ-007"),
      ),
    });
    // Two refusals: the recorded change with no override, and the 329 zł row, which without its
    // override is held to the classic band's 259 zł ceiling.
    expect(problems.map((p) => [p.mode, p.subject])).toEqual([
      ["band", "FO-BQ-007 stems_21 PL"],
      ["band", "FO-BQ-007 PL"],
    ]);
  });
});

describe("AC-38: module load refuses an override tier key the SKU does not carry", () => {
  it("names `stems_12` on an override keyed by a retired count", () => {
    const destinations = withPlOverrides((overrides) =>
      overrides.map((o) =>
        o.sku === "FO-BQ-001"
          ? {
              ...o,
              tiers: { stems_12: 19_900, stems_15: 23_900, stems_21: 32_900 },
            }
          : o,
      ),
    );
    expect(() => expandRetailRows(destinations, PRODUCT_TIER_GROUPS)).toThrow(
      "ladder override of `FO-BQ-001` prices the tier key `stems_12`, which `FO-BQ-001` does not carry",
    );
  });

  it("names the tier an override leaves unpriced, never falling back to the band ladder", () => {
    const destinations = withPlOverrides((overrides) =>
      overrides.map((o) =>
        o.sku === "FO-BQ-003"
          ? { ...o, tiers: { stems_11: 19_900, stems_15: 23_900 } }
          : o,
      ),
    );
    expect(() => expandRetailRows(destinations, PRODUCT_TIER_GROUPS)).toThrow(
      "ladder override of `FO-BQ-003` does not price its tier key `stems_21`",
    );
  });

  it("names an override SKU that has no tiers", () => {
    const destinations = withPlOverrides((overrides) => [
      ...overrides,
      {
        sku: "FO-BQ-999",
        band: { fromMinor: 19_900, toMinor: 32_900 },
        tiers: { stems_11: 19_900 },
      },
    ]);
    expect(() => expandRetailRows(destinations, PRODUCT_TIER_GROUPS)).toThrow(
      "`FO-BQ-999`, which has no tiers",
    );
  });

  it("expands the committed dataset to exactly COUNTRY_PRICES's retail rows", () => {
    expect(expandRetailRows(DESTINATION_PRICING, PRODUCT_TIER_GROUPS)).toEqual(
      COUNTRY_PRICES.filter((row) => row.surchargeKind === null),
    );
  });
});

/* -------------------------------------------------------------------------- */
/* T-40 (AC-39).                                                              */
/* -------------------------------------------------------------------------- */

describe("AC-39: docs/runbooks/pricing.md records the change made in place", () => {
  const runbook = readFileSync(
    resolve(repoRoot, "docs/runbooks/pricing.md"),
    "utf8",
  );
  const section = runbook.slice(
    runbook.indexOf("## 9. Changes made in place"),
    runbook.indexOf("## 10. Related"),
  );

  it("has the section, before Related", () => {
    expect(runbook.indexOf("## 9. Changes made in place")).toBeGreaterThan(-1);
    expect(runbook.indexOf("## 10. Related")).toBeGreaterThan(
      runbook.indexOf("## 9. Changes made in place"),
    );
  });

  it("has this amendment's entry with its merge date", () => {
    expect(section).toContain(
      "### 2026-10-24: odd stem counts and the Polish classic-rose prices (spec 005 §14 A-founder-2026-10-15a)",
    );
    expect(section).toContain("Merged 2026-10-24");
  });

  it("lists the six cells with old and new amounts", () => {
    for (const [sku, name] of [
      ["FO-BQ-001", "Amber Hour"],
      ["FO-BQ-003", "Baltic Dawn"],
      ["FO-BQ-007", "Rose Harbour"],
    ] as const) {
      expect(section).toContain(
        `| ${sku} ${name} | \`stems_15\` (was \`stems_18\`) | 22 900 | 23 900 |`,
      );
      expect(section).toContain(
        `| ${sku} ${name} | \`stems_21\` (was \`stems_24\`) | 25 900 | 32 900 |`,
      );
    }
  });

  it("records FO-BQ-004's count change", () => {
    expect(section).toContain(
      "FO-BQ-004 Quiet Blush changed its counts, not its prices: 12 / 18 / 24 stems became 5 / 7 / 9 stems",
    );
  });

  it("states point 9's no-reduction rule", () => {
    expect(section).toContain(
      "**No reduction may be announced** on FO-BQ-001, FO-BQ-003, FO-BQ-004 or FO-BQ-007 until 30 days\nafter this change reaches production **and** the history is held as superseded rows",
    );
  });
});
