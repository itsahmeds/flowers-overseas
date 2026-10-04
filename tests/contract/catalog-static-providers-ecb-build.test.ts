/**
 * The static providers' contract with the **build-fetched** FX snapshot bundled in (spec 005
 * §14 A7 Corrected 2 (iv), AC-27 under both sources; T-30; TASK-181).
 *
 * `catalog-static-providers.test.ts` runs the shared contract against the module as every test and
 * `next dev` load it: no `FX_BUILD_SNAPSHOT`, so the committed snapshot (`fxSource: committed`).
 * This file loads a **fresh module graph** with `FX_BUILD_SNAPSHOT` set to the snapshot the build
 * step produces from the captured ECB daily file — what `next.config.ts` inlines into a Railway
 * build — and runs the same contract, so `staticFxRateProvider` keeps its promise under both
 * sources: the same row count, the same schemas, deep-frozen rows, and `toFxRateRow()` unchanged.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { COUNTRIES } from "../../src/config/countries.ts";
import { CURRENCIES } from "../../src/config/currencies.ts";
import { parseEcbDaily } from "../../scripts/fx-snapshot.ts";

import {
  type CatalogProviderRowCounts,
  describeCatalogProviderContract,
} from "./support/catalog-provider-contract.ts";

const daily = parseEcbDaily(
  readFileSync(
    resolve(
      process.cwd(),
      "tests/fixtures/fx/ecb-eurofxref-daily-2026-10-02.xml",
    ),
    "utf8",
  ),
  "2026-10-04",
);
if (!daily.ok)
  throw new Error(`the captured daily file must parse: ${daily.reason}`);

vi.resetModules();
vi.stubEnv("FX_BUILD_SNAPSHOT", JSON.stringify(daily.snapshot));
const { catalogProviders } =
  await import("../../src/modules/catalog/providers.ts");
const { fxSnapshotStatus } =
  await import("../../src/modules/catalog/pricing/fx.ts");
vi.unstubAllEnvs();

const ROW_COUNTS: CatalogProviderRowCounts = {
  "catalogue.products": 84,
  "catalogue.tiers": 236,
  "catalogue.categories": 23,
  "catalogue.occasions": 32,
  "catalogue.addons": 6,
  "price.countryPrices": 3332,
  "price.addonCountryPrices": 42,
  // The same ten rows as the committed snapshot: the build serves every currency or none.
  "fx.fxRates": 10,
  "flags.flags": COUNTRIES.length + CURRENCIES.length,
};

describe("the bundled source in this module graph", () => {
  it("is the build's fetch, dated as the ECB file, at the ECB file's rates", async () => {
    expect(fxSnapshotStatus()).toEqual({
      fxAsOf: "2026-10-02",
      fxSource: "ecb-build",
    });
    const rows = await catalogProviders().fx.fxRates();
    expect(
      Object.fromEntries(rows.map((row) => [row.quote, row.ratePpm])),
    ).toEqual(daily.ok ? daily.snapshot.rates : {});
    expect(new Set(rows.map((row) => row.asOf))).toEqual(
      new Set(["2026-10-02"]),
    );
  });
});

describeCatalogProviderContract(
  "static (ecb-build)",
  () => catalogProviders(),
  ROW_COUNTS,
);
