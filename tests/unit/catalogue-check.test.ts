/**
 * T-03 (spec 005 AC-5), TASK-062: `pnpm catalogue:check` exits non-zero, naming the offender, for
 * **every** failure mode, and exits 0 on the committed tree.
 *
 * The fixture per mode is a one-field mutation of the check's *input* rather than a broken copy of
 * the dataset on disk. Two reasons, both deliberate:
 *
 *  - the dataset's own zod schemas already refuse most of these faults at module load (a stronger
 *    guarantee than a CLI, and the reason they are there), so a fixture file carrying two default
 *    tiers could not be imported at all;
 *  - a second copy of 84 products, 236 tiers and 3 416 price rows would drift from the first, and
 *    the check's job is to catch drift.
 *
 * The clean-tree case runs the real CLI in a child process, so the exit code, the coverage table
 * and the step summary are asserted as a *command* and not only as a function.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  CHECK_MODES,
  type CatalogueCheckInput,
  type CheckMode,
  SPEC_002_ROW_COLUMNS,
  catalogueCheckInput,
  checkCatalogue,
  coverageTable,
  flattenMessages,
  formatProblems,
} from "../../scripts/catalogue-check.ts";

const repoRoot = resolve(__dirname, "../..");
const clean = catalogueCheckInput();

/** Problems of one mode, for a one-field mutation of the clean input. */
function problemsFor(
  overrides: Partial<CatalogueCheckInput>,
  mode: CheckMode,
): readonly string[] {
  return checkCatalogue({ ...clean, ...overrides })
    .filter((problem) => problem.mode === mode)
    .map((problem) => `${problem.subject} ${problem.reason}`);
}

describe("the committed tree is clean (AC-5)", () => {
  it("finds no problem at all", () => {
    const problems = checkCatalogue(clean);

    expect(formatProblems(problems)).toBe("");
    expect(problems).toEqual([]);
  });

  it("prints a coverage row per destination and the FX snapshot line (§11)", () => {
    const table = coverageTable(clean, new Date("2026-09-09T12:00:00Z"));

    for (const iso2 of clean.destinationIso2) {
      expect(table).toContain(`| ${iso2} | `);
    }
    expect(table).toContain("| PL | live | PLN |");
    expect(table).toContain("FX snapshot: 2026-09-08");
    expect(table).not.toContain("**stale**");
  });

  it("marks the FX snapshot stale in the summary once it is past 48 h", () => {
    const table = coverageTable(clean, new Date("2026-09-30T12:00:00Z"));

    expect(table).toContain("**stale**");
  });
});

describe("every failure mode has a fixture (AC-5 / T-03)", () => {
  it("no-tier: a SKU with no `product_tier` row", () => {
    const orphan = clean.products[0]?.sku ?? "";
    const problems = problemsFor(
      { tiers: clean.tiers.filter((tier) => tier.sku !== orphan) },
      "no-tier",
    );

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(orphan);
  });

  it("default-tier: zero and two default tiers for one product", () => {
    const sku = clean.tiers[0]?.sku ?? "";
    const none = problemsFor(
      {
        tiers: clean.tiers.map((tier) =>
          tier.sku === sku ? { ...tier, isDefault: false } : tier,
        ),
      },
      "default-tier",
    );
    const two = problemsFor(
      {
        tiers: clean.tiers.map((tier) =>
          tier.sku === sku ? { ...tier, isDefault: true } : tier,
        ),
      },
      "default-tier",
    );

    expect(none).toHaveLength(1);
    expect(none[0]).toContain("has 0 default tiers");
    expect(two).toHaveLength(1);
    expect(two[0]).toContain("has 3 default tiers");
  });

  it("missing-price: a SKU with no active price in a destination", () => {
    const dropped = clean.countryPrices.filter(
      (row) =>
        !(
          row.sku === "FO-BQ-001" &&
          row.countryIso2 === "PL" &&
          row.surchargeKind === null
        ),
    );
    const problems = problemsFor({ countryPrices: dropped }, "missing-price");

    expect(problems).toHaveLength(3);
    expect(problems[0]).toContain("FO-BQ-001");
    expect(problems[0]).toContain("PL");
  });

  it("missing-price: a superseded row is not an active one", () => {
    const superseded = clean.countryPrices.map((row) =>
      row.sku === "FO-BQ-001" &&
      row.countryIso2 === "PL" &&
      row.surchargeKind === null
        ? { ...row, activeTo: "2026-12-31" }
        : row,
    );

    expect(
      problemsFor({ countryPrices: superseded }, "missing-price"),
    ).toHaveLength(3);
  });

  it("ambiguous-price: two open-ended rows for one (product, country, tier, surcharge)", () => {
    const duplicate = clean.countryPrices[0];
    expect(duplicate).toBeDefined();
    if (duplicate === undefined) return;
    const problems = problemsFor(
      { countryPrices: [...clean.countryPrices, duplicate] },
      "ambiguous-price",
    );

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("has 2 open-ended rows");
    expect(problems[0]).toContain(duplicate.sku);
  });

  it("band: a smallest-tier price outside its plan/10 §2.3 band", () => {
    const problems = problemsFor(
      {
        countryPrices: clean.countryPrices.map((row) =>
          row.sku === "FO-BQ-001" &&
          row.countryIso2 === "PL" &&
          row.tierKey === "stems_12"
            ? { ...row, retailMinor: 9900 }
            : row,
        ),
      },
      "band",
    );

    expect(problems.length).toBeGreaterThanOrEqual(1);
    expect(problems[0]).toContain("outside the plan/10 §2.3");
    expect(problems.join("\n")).toContain("FO-BQ-001");
  });

  it("band: a tier priced at or below the tier below it", () => {
    const problems = problemsFor(
      {
        countryPrices: clean.countryPrices.map((row) =>
          row.sku === "FO-BQ-001" &&
          row.countryIso2 === "PL" &&
          row.tierKey === "stems_18"
            ? { ...row, retailMinor: 14_900 }
            : row,
        ),
      },
      "band",
    );

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("not above tier 0");
  });

  it("rounding-ending: an amount off the currency's psychological ending", () => {
    const problems = problemsFor(
      {
        countryPrices: clean.countryPrices.map((row) =>
          row.sku === "FO-BQ-001" &&
          row.countryIso2 === "PL" &&
          row.tierKey === "stems_12"
            ? { ...row, retailMinor: 14_990 }
            : row,
        ),
      },
      "rounding-ending",
    );

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("`x9` ending");
  });

  it("float-money: a non-integer amount, and an unconfigured currency", () => {
    const float = problemsFor(
      {
        countryPrices: clean.countryPrices.map((row, index) =>
          index === 0 ? { ...row, retailMinor: 149.9 } : row,
        ),
      },
      "float-money",
    );
    const addonFloat = problemsFor(
      {
        addonCountryPrices: clean.addonCountryPrices.map((row, index) =>
          index === 0 ? { ...row, retailMinor: 25.5 } : row,
        ),
      },
      "float-money",
    );
    // The cast is deliberate: an unconfigured currency code is a type error in the dataset, and
    // the check exists for the day the rows come from a database (TASK-070) where they are not.
    const unknownCurrency = problemsFor(
      {
        countryPrices: clean.countryPrices.map((row, index) =>
          index === 0
            ? { ...row, currency: "XXX" as unknown as typeof row.currency }
            : row,
        ),
      },
      "float-money",
    );

    expect(float).toHaveLength(1);
    expect(float[0]).toContain("integer minor units");
    expect(addonFloat).toHaveLength(1);
    expect(unknownCurrency).toHaveLength(1);
    expect(unknownCurrency[0]).toContain("XXX");
  });

  it("facet: an unknown facet value on a product", () => {
    const problems = problemsFor(
      {
        // Cast for the same reason as the unconfigured currency above: the facet enums are
        // closed in the dataset, and this mode is the guard for a row that did not come from it.
        products: clean.products.map((product, index) =>
          index === 0
            ? {
                ...product,
                colours: ["turquoise"] as unknown as typeof product.colours,
              }
            : product,
        ),
      },
      "facet",
    );

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("turquoise");
    expect(problems[0]).toContain("plan/10 §1.1");
  });

  it("label-key: a `labelKey` missing from messages/en.json", () => {
    const withoutTierLabel = new Set(
      [...clean.messageKeys].filter((key) => key !== "catalog.tier.stems"),
    );
    const problems = problemsFor(
      { messageKeys: withoutTierLabel },
      "label-key",
    );

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("catalog.tier.stems");
    expect(problems[0]).toContain("messages/en.json does not have");
  });

  it("label-key: a key spec 003's message alphabet cannot spell", () => {
    const problems = problemsFor(
      {
        tiers: clean.tiers.map((tier, index) =>
          index === 0
            ? { ...tier, labelKey: "catalog.facet.occasion.17Mai" }
            : tier,
        ),
      },
      "label-key",
    );

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("cannot spell");
  });

  it("addon-price: an add-on unpriced in a destination, and priced twice", () => {
    const missing = problemsFor(
      {
        addonCountryPrices: clean.addonCountryPrices.filter(
          (row) => !(row.addonKey === "wine" && row.countryIso2 === "PL"),
        ),
      },
      "addon-price",
    );
    const first = clean.addonCountryPrices[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    const twice = problemsFor(
      { addonCountryPrices: [...clean.addonCountryPrices, first] },
      "addon-price",
    );

    expect(missing).toHaveLength(1);
    expect(missing[0]).toContain("wine PL");
    expect(missing[0]).toContain("has 0 active");
    expect(twice).toHaveLength(1);
    expect(twice[0]).toContain("has 2 active");
  });

  it("fx-snapshot: a cross rate, a float rate, a mixed date and a missing currency", () => {
    const first = clean.fxRates[0];
    expect(first).toBeDefined();
    if (first === undefined) return;

    expect(
      problemsFor(
        {
          fxRates: clean.fxRates.map((rate, index) =>
            index === 0 ? { ...rate, base: "PLN" } : rate,
          ),
        },
        "fx-snapshot",
      )[0],
    ).toContain("not a euro-base row");
    expect(
      problemsFor(
        {
          fxRates: clean.fxRates.map((rate, index) =>
            index === 0 ? { ...rate, ratePpm: 846_500.25 } : rate,
          ),
        },
        "fx-snapshot",
      )[0],
    ).toContain("parts-per-million integer");
    expect(
      problemsFor(
        {
          fxRates: clean.fxRates.map((rate, index) =>
            index === 0 ? { ...rate, asOf: "2026-09-07" } : rate,
          ),
        },
        "fx-snapshot",
      )[0],
    ).toContain("one snapshot is one publication");
    expect(
      problemsFor(
        { fxRates: clean.fxRates.filter((rate) => rate.quote !== "PLN") },
        "fx-snapshot",
      )[0],
    ).toContain("destination currency (PL)");
  });

  it("projection-columns: a column set that disagrees with spec 002 §5.1", () => {
    const renamed = problemsFor(
      {
        projectionColumns: {
          ...clean.projectionColumns,
          country_price: [
            "product_id",
            "country_id",
            "tier_key",
            "price_minor",
          ],
        },
      },
      "projection-columns",
    );
    const extraTable = problemsFor(
      {
        projectionColumns: {
          ...clean.projectionColumns,
          product_media: ["product_id", "media_asset_id"],
        },
      },
      "projection-columns",
    );
    const wrongIndex = problemsFor(
      {
        projectionIndexColumns: {
          ...clean.projectionIndexColumns,
          country_price: ["product_id", "country_id"],
        },
      },
      "projection-columns",
    );

    expect(renamed).toHaveLength(1);
    expect(renamed[0]).toContain("spec 002 §5.1 says");
    expect(extraTable).toHaveLength(1);
    expect(extraTable[0]).toContain("SPEC_002_ROW_COLUMNS");
    expect(wrongIndex).toHaveLength(1);
    expect(wrongIndex[0]).toContain("unique index");
  });

  it("destination-drift: a destination with no pricing, and pricing for a non-destination", () => {
    const unpriced = problemsFor(
      { destinationIso2: [...clean.destinationIso2, "GB"] },
      "destination-drift",
    );
    const orphanPricing = problemsFor(
      {
        destinationIso2: clean.destinationIso2.filter((iso2) => iso2 !== "NL"),
      },
      "destination-drift",
    );

    expect(unpriced).toHaveLength(1);
    expect(unpriced[0]).toContain("GB");
    expect(orphanPricing.some((problem) => problem.startsWith("NL"))).toBe(
      true,
    );
  });

  it("covers every declared mode, so no mode is unreachable", () => {
    // The guard on the guard: a mode that no fixture above can trigger would be a check that is
    // declared and not running. Each mode is asserted by the test named after it.
    const asserted: readonly CheckMode[] = [
      "no-tier",
      "default-tier",
      "missing-price",
      "ambiguous-price",
      "band",
      "rounding-ending",
      "float-money",
      "facet",
      "label-key",
      "addon-price",
      "fx-snapshot",
      "projection-columns",
      "destination-drift",
    ];

    expect([...CHECK_MODES].sort()).toEqual([...asserted].sort());
  });
});

describe("the transcription and the flattener", () => {
  it("transcribes every table `projections.ts` projects, and no more", () => {
    expect(Object.keys(SPEC_002_ROW_COLUMNS).sort()).toEqual(
      Object.keys(clean.projectionColumns).sort(),
    );
  });

  it("flattens a message tree into the dotted keys next-intl addresses", () => {
    const keys = flattenMessages({
      catalog: { tier: { stems: "{count} stems", size: { s: "Small" } } },
    });

    expect([...keys].sort()).toEqual([
      "catalog.tier.size.s",
      "catalog.tier.stems",
    ]);
  });
});

describe("the CLI", () => {
  const summaryDir = mkdtempSync(join(tmpdir(), "catalogue-check-"));
  const summaryPath = join(summaryDir, "summary.md");

  afterAll(() => {
    rmSync(summaryDir, { recursive: true, force: true });
  });

  it("exits 0 on the committed tree and appends the table to the step summary", () => {
    const output = execFileSync(
      process.execPath,
      ["scripts/catalogue-check.ts", "--summary"],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: { ...process.env, GITHUB_STEP_SUMMARY: summaryPath },
      },
    );

    expect(output).toContain("clean");
    expect(output).toContain("| PL |");
    const summary = readFileSync(summaryPath, "utf8");
    expect(summary).toContain("`catalogue:check` — clean");
    expect(summary).toContain("| destination | status | currency |");
  });
});
