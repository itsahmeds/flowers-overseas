/**
 * T-06 (spec 006 AC-6; TASK-074): the per-destination price files, and one fixture per failure
 * shape the acceptance criterion names.
 *
 * Two halves, and the split is the point.
 *
 * **The committed files.** `seed/data/prices/{ISO2}.json` and `addon-prices/{ISO2}.json` are
 * projections of spec 005's `prices.data.ts` (ADR-0017), so what this half asserts is that they
 * *are* that projection — byte-for-byte, row-for-row — plus the invariants a per-country **file**
 * can carry that the authored module cannot: one destination per file, one currency per file, and
 * exactly one open-ended row per (product, tier, surcharge), which is the file-level mirror of
 * spec 002 §5.1's partial unique index and the reason the Omnibus Art. 6a 30-day-lowest figure is
 * derivable at all (`plan/07` §2.1). No band, no tier step and no psychological ending is
 * transcribed here: those are properties of the authored ladder, `pnpm catalogue:check` gates them
 * over the same rows (TASK-062), and a second copy of `plan/10` §2.3 in the seed layer is exactly
 * the drift ADR-0017 exists to prevent.
 *
 * **The five AC-6 fixtures.** `tests/fixtures/seed/_cases/prices/bad-*.json` are each a copy of
 * one real (product, destination) block — `FO-BQ-001` in PL: three tier rows, the open-ended
 * Sunday row and the two closed peak-day windows — with **exactly one** deliberate fault. Each is
 * proved to fail here, either at the file schema (a float amount, a second open-ended row) or
 * through the rule surface that already exists over these rows (`checkCatalogue`'s `band`,
 * `rounding-ending` and `missing-price` modes), with the SKU named in the message. `pnpm seed:check`
 * wires the same fixtures into the CI gate in TASK-075; shipping them with the dataset is what
 * makes that task a wiring job rather than a second authoring job.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { projectSeedDataset, staleProjections } from "../../seed/project.ts";
import {
  AddonPricesFileSchema,
  PricesFileSchema,
  SEED_DATA_DIR,
  SEED_PRICE_DATA_FILES,
  seedAddonPriceFilePath,
  seedPriceFilePath,
} from "../../seed/schema/files.ts";
import {
  catalogueCheckInput,
  checkCatalogue,
  formatProblems,
} from "../../scripts/catalogue-check.ts";
import { ADDONS } from "../../src/config/catalogue/addons.data.ts";
import {
  ADDON_COUNTRY_PRICES,
  COUNTRY_PRICES,
  PEAK_DAYS,
  PRICED_DESTINATIONS,
  PRICE_ACTIVE_FROM,
  destinationPricingFor,
} from "../../src/config/catalogue/prices.data.ts";
import { PRODUCTS } from "../../src/config/catalogue/products.data.ts";
import type { CountryPriceData } from "../../src/config/catalogue/schemas.ts";
import { PRODUCT_TIERS } from "../../src/config/catalogue/tiers.data.ts";

const repoRoot = resolve(__dirname, "../..");
const FIXTURES = "tests/fixtures/seed/_cases/prices";

interface PriceFile {
  readonly countryIso2: string;
  readonly rows: readonly CountryPriceData[];
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(join(repoRoot, path), "utf8"));
}

function priceFile(iso2: string): PriceFile {
  return PricesFileSchema.parse(
    readJson(join(SEED_DATA_DIR, seedPriceFilePath(iso2))),
  ) as PriceFile;
}

function addonPriceFile(iso2: string): {
  readonly countryIso2: string;
  readonly rows: readonly {
    readonly addonKey: string;
    readonly retailMinor: number;
    readonly currency: string;
    readonly vatRateBp: number;
    readonly activeFrom: string;
    readonly activeTo: string | null;
  }[];
} {
  return AddonPricesFileSchema.parse(
    readJson(join(SEED_DATA_DIR, seedAddonPriceFilePath(iso2))),
  ) as never;
}

/** One fixture, as raw JSON: a float amount cannot be read back through the schema. */
function fixture(name: string): {
  readonly countryIso2: string;
  readonly rows: readonly CountryPriceData[];
} {
  return readJson(join(FIXTURES, name)) as never;
}

/**
 * `checkCatalogue` over the committed dataset with one (product, destination) block **replaced**
 * by a fixture's rows. Replacing rather than appending is what keeps a fixture's single fault the
 * single problem reported: an appended row would also be a second open-ended row for its key, and
 * the test would pass for the wrong reason.
 */
function problemsWithFixture(name: string): {
  readonly modes: readonly string[];
  readonly report: string;
} {
  const file = fixture(name);
  const sku = file.rows[0]?.sku ?? "";
  const countryPrices = [
    ...COUNTRY_PRICES.filter(
      (row) => !(row.sku === sku && row.countryIso2 === file.countryIso2),
    ),
    ...file.rows,
  ];
  const problems = checkCatalogue(catalogueCheckInput({ countryPrices }));
  return {
    modes: problems.map((problem) => problem.mode),
    report: formatProblems(problems),
  };
}

describe("spec 006 §2.2: one price file per priced destination (TASK-074)", () => {
  it("ships a prices/ and an addon-prices/ file for every priced destination and no other", () => {
    expect(SEED_PRICE_DATA_FILES.map((file) => file.path)).toEqual([
      ...PRICED_DESTINATIONS.map(seedPriceFilePath),
      ...PRICED_DESTINATIONS.map(seedAddonPriceFilePath),
    ]);
    // `plan/10` §2.1 counts eight seeded countries; seven are destinations. The UK is the first
    // *buyer* market (ADR-0002) and not a place we deliver to, so a `prices/GB.json` would price
    // nothing — the reading spec 005's `prices.data.ts` settled ("the seven are the authority").
    expect(PRICED_DESTINATIONS).toHaveLength(7);
    expect(PRICED_DESTINATIONS).not.toContain("GB");
  });

  it("parses every committed price file under its own file schema", () => {
    for (const iso2 of PRICED_DESTINATIONS) {
      expect(priceFile(iso2).countryIso2, iso2).toBe(iso2);
      expect(addonPriceFile(iso2).countryIso2, iso2).toBe(iso2);
    }
  });

  it("is a fresh projection of src/config/catalogue/prices.data.ts, byte-for-byte (ADR-0017)", async () => {
    const projected = new Map(
      (await projectSeedDataset(repoRoot)).map((file) => [
        file.path,
        file.contents,
      ]),
    );
    for (const file of SEED_PRICE_DATA_FILES) {
      const path = join(SEED_DATA_DIR, file.path);
      expect(projected.has(path), path).toBe(true);
      expect(
        readFileSync(join(repoRoot, path), "utf8"),
        `${path} is stale: run \`pnpm seed:project\``,
      ).toBe(projected.get(path));
    }
    expect(await staleProjections(repoRoot)).toEqual([]);
  });

  it("carries the authored rows of its destination, in authored order", () => {
    for (const iso2 of PRICED_DESTINATIONS) {
      expect(priceFile(iso2).rows, iso2).toEqual(
        COUNTRY_PRICES.filter((row) => row.countryIso2 === iso2),
      );
      expect(addonPriceFile(iso2).rows, iso2).toEqual(
        ADDON_COUNTRY_PRICES.filter((row) => row.countryIso2 === iso2),
      );
    }
  });
});

describe("spec 006 AC-6: every row is money the way plan/07 §4 requires", () => {
  it("prices every tier of every product, plus one Sunday and two peak-day rows", () => {
    const retailRows = PRODUCT_TIERS.length;
    const surchargeRows = PRODUCTS.length * (1 + PEAK_DAYS.length);
    for (const iso2 of PRICED_DESTINATIONS) {
      const { rows } = priceFile(iso2);
      const of = (kind: string | null): number =>
        rows.filter((row) => row.surchargeKind === kind).length;
      expect(of(null), iso2).toBe(retailRows);
      expect(of("sunday"), iso2).toBe(PRODUCTS.length);
      expect(of("peak_day"), iso2).toBe(PRODUCTS.length * PEAK_DAYS.length);
      expect(rows, iso2).toHaveLength(retailRows + surchargeRows);
      expect(addonPriceFile(iso2).rows, iso2).toHaveLength(ADDONS.length);
    }
  });

  it("uses integer minor units in the destination's own currency on every row", () => {
    for (const iso2 of PRICED_DESTINATIONS) {
      const { currency } = destinationPricingFor(iso2);
      for (const row of priceFile(iso2).rows) {
        const at = `${iso2}/${row.sku}/${row.tierKey ?? row.surchargeKind ?? "-"}`;
        expect(Number.isInteger(row.retailMinor), at).toBe(true);
        expect(row.retailMinor, at).toBeGreaterThan(0);
        expect(row.currency, at).toBe(currency);
        expect(Number.isInteger(row.vatRateBp), at).toBe(true);
      }
      for (const row of addonPriceFile(iso2).rows) {
        const at = `${iso2}/${row.addonKey}`;
        expect(Number.isInteger(row.retailMinor), at).toBe(true);
        expect(row.retailMinor, at).toBeGreaterThanOrEqual(0);
        expect(row.currency, at).toBe(currency);
      }
    }
  });

  /**
   * The Omnibus mechanism, asserted as a file property: history is superseded rows, so exactly one
   * row per (product, tier, surcharge) may be open-ended and the peak-day rows must be closed
   * windows — an open-ended peak-day row would surcharge every date, not the named one.
   */
  it("keeps exactly one open-ended row per (product, tier, surcharge)", () => {
    for (const iso2 of PRICED_DESTINATIONS) {
      const openEnded = new Map<string, number>();
      for (const row of priceFile(iso2).rows) {
        if (row.activeTo !== null) continue;
        const key = `${row.sku}/${row.tierKey ?? "-"}/${row.surchargeKind ?? "retail"}`;
        openEnded.set(key, (openEnded.get(key) ?? 0) + 1);
      }
      for (const [key, count] of openEnded) {
        expect(count, `${iso2}/${key}`).toBe(1);
      }
      // One retail row per tier + one Sunday row per product, and nothing else, is open-ended.
      expect(openEnded.size, iso2).toBe(PRODUCT_TIERS.length + PRODUCTS.length);
      for (const row of priceFile(iso2).rows) {
        if (row.surchargeKind !== "peak_day") continue;
        expect(row.activeTo, `${iso2}/${row.sku}`).not.toBeNull();
        expect(
          PEAK_DAYS.some((day) => day.date === row.activeFrom),
          `${iso2}/${row.sku}/${row.activeFrom}`,
        ).toBe(true);
      }
      for (const row of addonPriceFile(iso2).rows) {
        expect(row.activeTo, `${iso2}/${row.addonKey}`).toBeNull();
        expect(row.activeFrom, `${iso2}/${row.addonKey}`).toBe(
          PRICE_ACTIVE_FROM,
        );
      }
    }
  });

  it("references only products, tiers and add-ons the dataset authors (rule 3)", () => {
    const skus = new Set(PRODUCTS.map((product) => product.sku));
    const tierKeys = new Set(
      PRODUCT_TIERS.map((tier) => `${tier.sku}/${tier.tierKey}`),
    );
    const addonKeys = new Set(ADDONS.map((addon) => addon.key));
    for (const iso2 of PRICED_DESTINATIONS) {
      for (const row of priceFile(iso2).rows) {
        expect(skus, `${iso2}/${row.sku}`).toContain(row.sku);
        if (row.tierKey === null) continue;
        expect(tierKeys, `${iso2}/${row.sku}`).toContain(
          `${row.sku}/${row.tierKey}`,
        );
      }
      for (const row of addonPriceFile(iso2).rows) {
        expect(addonKeys, `${iso2}/${row.addonKey}`).toContain(row.addonKey);
      }
    }
  });

  /**
   * `plan/07` §4: no fake urgency, no strike-through, no badge. The dataset has no column for any
   * of them, so the guard is a grep over the committed bytes — the cheapest way to notice a field
   * somebody adds later without a spec 002 column to project it into.
   */
  it("carries no scarcity, badge, strike-through or discount field", () => {
    for (const file of SEED_PRICE_DATA_FILES) {
      const raw = readFileSync(
        join(repoRoot, SEED_DATA_DIR, file.path),
        "utf8",
      );
      for (const forbidden of [
        "compareAt",
        "wasMinor",
        "listMinor",
        "strike",
        "badge",
        "discount",
        "scarcity",
        "stock",
        "urgen",
        "netMinor",
        "deliveryMinor",
      ]) {
        expect(raw, `${file.path}/${forbidden}`).not.toContain(forbidden);
      }
    }
  });
});

describe("spec 006 AC-6: one fixture per failure shape (T-06)", () => {
  /**
   * The control. `good-pl-block.json` is the same block with no fault, and it must produce **no**
   * problem — otherwise a `bad-*` fixture could be "caught" by something the block itself carries
   * and the five assertions below would pass for the wrong reason.
   */
  it("finds nothing wrong with the good control block", () => {
    expect(
      PricesFileSchema.safeParse(fixture("good-pl-block.json")).success,
    ).toBe(true);
    expect(problemsWithFixture("good-pl-block.json").report).toBe("");
  });

  it("keeps every fixture a copy of one real (product, destination) block", () => {
    for (const name of [
      "good-pl-block.json",
      "bad-out-of-band.json",
      "bad-float-amount.json",
      "bad-wrong-ending.json",
      "bad-second-open-ended.json",
      "bad-unknown-tier.json",
    ]) {
      const file = fixture(name);
      expect(file.countryIso2, name).toBe("PL");
      for (const row of file.rows) {
        expect(row.sku, name).toBe("FO-BQ-001");
        expect(row.countryIso2, name).toBe("PL");
      }
    }
  });

  it("rejects a float amount at the file schema, naming the field", () => {
    const parsed = PricesFileSchema.safeParse(fixture("bad-float-amount.json"));
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toContain("retailMinor");
    // And the rule surface names the SKU and the reason, which is what AC-6 asks a message for.
    const { modes, report } = problemsWithFixture("bad-float-amount.json");
    expect(modes).toContain("float-money");
    expect(report).toContain("FO-BQ-001");
    expect(report).toContain("integer minor units");
  });

  it("rejects a second open-ended row at the file schema, naming the SKU and the index", () => {
    const parsed = PricesFileSchema.safeParse(
      fixture("bad-second-open-ended.json"),
    );
    expect(parsed.success).toBe(false);
    const issues = JSON.stringify(parsed.error?.issues);
    expect(issues).toContain("FO-BQ-001");
    expect(issues).toContain("second open-ended row");
    expect(issues).toContain("Omnibus");
    const { modes, report } = problemsWithFixture("bad-second-open-ended.json");
    expect(modes).toContain("ambiguous-price");
    expect(report).toContain("FO-BQ-001");
  });

  /**
   * The band, the ending and the tier resolution are cross-file rules — they need the authored
   * band table, the currency configuration and the tier registry — so the fixture parses and the
   * rule that catches it is the one that already reads all three. `pnpm seed:check` reports the
   * same three over the files in TASK-075; the fault, and the message naming it, exist now.
   */
  it("catches an out-of-band amount with the band and the SKU in the message", () => {
    expect(
      PricesFileSchema.safeParse(fixture("bad-out-of-band.json")).success,
    ).toBe(true);
    const { modes, report } = problemsWithFixture("bad-out-of-band.json");
    expect(modes).toContain("band");
    expect(report).toContain("FO-BQ-001");
    expect(report).toContain("outside the plan/10 §2.3");
  });

  it("catches a wrong psychological ending with the currency's style in the message", () => {
    expect(
      PricesFileSchema.safeParse(fixture("bad-wrong-ending.json")).success,
    ).toBe(true);
    const { modes, report } = problemsWithFixture("bad-wrong-ending.json");
    expect(modes).toContain("rounding-ending");
    expect(report).toContain("FO-BQ-001");
    expect(report).toContain("PLN");
  });

  it("catches an unknown tier as the tier it leaves unpriced", () => {
    const file = fixture("bad-unknown-tier.json");
    const tierKeys = new Set(
      PRODUCT_TIERS.filter((tier) => tier.sku === "FO-BQ-001").map(
        (tier) => tier.tierKey,
      ),
    );
    expect(
      file.rows.some(
        (row) => row.tierKey !== null && !tierKeys.has(row.tierKey),
      ),
    ).toBe(true);
    const { modes, report } = problemsWithFixture("bad-unknown-tier.json");
    expect(modes).toContain("missing-price");
    expect(report).toContain("FO-BQ-001 stems_24 PL");
  });

  it("finds nothing wrong with the committed dataset", () => {
    expect(formatProblems(checkCatalogue(catalogueCheckInput()))).toBe("");
  });
});
