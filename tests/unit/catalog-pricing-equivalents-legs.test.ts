/**
 * One leg out, the whole line out (spec 004 §14 A21 clause 6 (d); TASK-178, `/break` round 1
 * hole 1 on PR 169).
 *
 * `tests/unit/catalog-pricing-equivalents.test.ts` runs against the committed snapshot, where
 * every leg is published on one date and every leg goes stale at the same instant, so a helper that
 * *skipped* a missing leg and printed the others would pass it. Clause 6 (d) hides the line, not
 * the leg: approximate amounts from a partly current snapshot are not shown at all. These cases
 * replace the rate rows (the provider seam, as `tests/unit/catalog-pricing-fx.test.ts` does) so
 * that exactly one leg is stale or absent while the other two are current, for each leg in turn,
 * and expect no line.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FX_SNAPSHOT } from "../../src/config/catalogue/fx.data.ts";
import type { FxRateData } from "../../src/config/catalogue/schemas.ts";
import { toMinor } from "../../src/modules/catalog/pricing/money.ts";

/** The rate rows the module reads, swapped per case. */
let rateRows: readonly FxRateData[] = FX_SNAPSHOT;

vi.mock("../../src/modules/catalog/providers.ts", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/modules/catalog/providers.ts")
  >("../../src/modules/catalog/providers.ts");
  return {
    ...actual,
    catalogProviders: () => ({
      ...actual.catalogProviders(),
      fx: { fxRates: () => Promise.resolve(rateRows) },
    }),
  };
});

const { priceEquivalents } =
  await import("../../src/modules/catalog/pricing/equivalents.ts");

/** The committed snapshot's publication date, and a clock inside its 48-hour window. */
const CURRENT = "2026-09-08";
const FRESH = new Date("2026-09-09T12:00:00Z");
/** A publication date well past the age bound at `FRESH`. */
const OLD = "2026-08-31";

/** Every published leg the EUR-charged line needs (EUR → GBP, PLN, USD), all current. */
function currentRows(): FxRateData[] {
  return FX_SNAPSHOT.filter(
    (row) =>
      row.base === "EUR" &&
      (row.quote === "GBP" || row.quote === "PLN" || row.quote === "USD"),
  ).map((row) => ({ ...row, asOf: CURRENT }));
}

/** €45.90 converted from Poland's 199 zł at the current snapshot. */
const CHARGED = {
  displayPrice: { amountMinor: toMinor(4590), currency: "EUR" as const },
  destinationCurrencyPrice: {
    amountMinor: toMinor(19_900),
    currency: "PLN" as const,
  },
  fxAsOf: CURRENT,
};

beforeEach(() => {
  rateRows = currentRows();
});

describe("priceEquivalents — exactly one leg unusable (A21 clause 6 (d))", () => {
  it("prints the full line when every leg is current (the control)", async () => {
    expect(rateRows).toHaveLength(3);
    const result = await priceEquivalents(CHARGED, FRESH);
    expect(result?.amounts.map((amount) => amount.currency)).toEqual([
      "GBP",
      "PLN",
      "USD",
    ]);
  });

  for (const leg of ["GBP", "PLN", "USD"] as const) {
    it(`hides the whole line when only the EUR → ${leg} rate is stale`, async () => {
      rateRows = currentRows().map((row) =>
        row.quote === leg ? { ...row, asOf: OLD } : row,
      );
      expect(rateRows.filter((row) => row.asOf === CURRENT)).toHaveLength(2);
      expect(await priceEquivalents(CHARGED, FRESH)).toBeNull();
    });

    it(`hides the whole line when the EUR → ${leg} rate is missing`, async () => {
      rateRows = currentRows().filter((row) => row.quote !== leg);
      expect(rateRows).toHaveLength(2);
      expect(await priceEquivalents(CHARGED, FRESH)).toBeNull();
    });
  }
});
