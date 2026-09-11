/**
 * AC-26 / T-24: the records spec 005 leaves behind, and the corpus it leaves for later specs.
 *
 * Documentation is usually asserted by a reviewer reading it once. These five records are not
 * that kind: each is a place a later spec **looks things up** rather than a place a reader is
 * informed, so a missing one is a spec 007/008/012 author guessing.
 *
 *  - `docs/runbooks/pricing.md` — how a price is set, superseded and read, what stale FX does,
 *    where the 30-day-lowest figure comes from, the mutation → cache-tag map 007/008/012 inherit
 *    and the checklist for changing a band; listed in the runbook index (`docs.test.ts` fails a
 *    runbook that is not, so both halves are covered).
 *  - `docs/architecture.md` §2 — `src/config/catalogue/` is where the dataset lives.
 *  - `README.md` — what `pnpm catalogue:check` checks, for whoever runs it after a price edit.
 *  - `content/i18n/glossary.en.md` — the product/tier-name row, which is a **translation
 *    instruction** (never translate a product name; a tier has no name at all).
 *  - `tests/fixtures/index.ts` — the catalogue corpus is reachable from the shared barrel.
 *
 * The corpus assertions below are the other half of the same claim: a fixture nobody checks
 * against the code is a second source of truth. `priceBands` is compared with the authored
 * dataset and `mixedVatBaskets` with `vatBreakdown()`, so the numbers in the file are the
 * numbers the module produces — while staying **hand-computed** in the file's own header, which
 * is what makes a wrong one legible.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { priceBandFor } from "../../src/config/catalogue/prices.data.ts";
import type { CurrencyCode } from "../../src/config/currencies.ts";
import type { PriceBandKey } from "../../src/config/catalogue/schemas.ts";
import { vatBreakdown } from "../../src/modules/catalog/pricing/vat.ts";
import { mixedVatBaskets, priceBands } from "../fixtures/index.ts";

const repoRoot = resolve(__dirname, "../..");
const read = (path: string): string =>
  readFileSync(resolve(repoRoot, path), "utf8");

describe("the pricing runbook (AC-26, T-24)", () => {
  const runbook = read("docs/runbooks/pricing.md");

  it("carries every section the task names", () => {
    for (const heading of [
      "## 1. How a price is set",
      "## 2. How a price is superseded",
      "## 3. How to read a `PricePoint`",
      "## 4. What happens when FX is stale",
      "## 5. How the 30-day-lowest figure is produced",
      "## 6. Mutation → cache tag map",
      "## 7. Checklist for changing a band",
    ]) {
      expect(runbook, heading).toContain(heading);
    }
  });

  it("states the rules a wrong price would break, not only the steps", () => {
    // Each of these is a rule a reader could otherwise reasonably get wrong.
    expect(runbook).toContain("never updated in place");
    expect(runbook).toContain("Art. 6a");
    expect(runbook).toContain("MAX_FX_AGE_HOURS");
    expect(runbook).toContain("pnpm catalogue:check");
  });

  it("carries the dated item `/review 47` asked for: next year's peak rows", () => {
    expect(runbook).toContain("## 8. Dated items");
    expect(runbook).toContain("PEAK_DAYS");
    expect(runbook).toContain("2027/28 peak-day rows");
  });

  it("is in the runbook index with a one-line 'when to use it'", () => {
    const index = read("docs/runbooks/README.md");

    expect(index).toContain("[pricing](pricing.md)");
    expect(index).toMatch(/\[pricing\]\(pricing\.md\) \| \S/u);
  });
});

describe("the architecture, README and glossary records (AC-26, T-24)", () => {
  it("names `src/config/catalogue/` in `docs/architecture.md` §2", () => {
    expect(read("docs/architecture.md")).toContain("src/config/catalogue/");
  });

  it("documents `pnpm catalogue:check` in the README's scripts table", () => {
    const readme = read("README.md");

    expect(readme).toContain("`pnpm catalogue:check`");
    // The row says what it checks, so a founder knows what a failure means.
    expect(readme).toContain("plan/10");
    expect(readme).toContain("surcharge");
  });

  it("fills the glossary's product/tier-name row with an instruction, not a description", () => {
    const glossary = read("content/i18n/glossary.en.md");
    const row =
      glossary
        .split("\n")
        .find((line) => line.startsWith("| Product and tier names")) ?? "";

    expect(row).not.toMatch(/\|\s*—?\s*\|\s*$/u);
    expect(row).toContain("Never translate one");
    expect(row).toContain("Tier names do not exist");
    expect(row).toContain("src/config/catalogue/products.data.ts");
  });
});

describe("the shared catalogue corpus (AC-26, T-24)", () => {
  it("is exported from the fixtures barrel, not only from `catalogue.ts`", () => {
    expect(priceBands.length).toBeGreaterThan(0);
    expect(mixedVatBaskets.length).toBeGreaterThan(0);
    expect(read("tests/fixtures/index.ts")).toContain('from "./catalogue.ts"');
  });

  it("states every priced destination's bands in its own currency and minor units", () => {
    const countries = new Set(priceBands.map((band) => band.country));
    expect(countries.size).toBeGreaterThanOrEqual(7);

    for (const band of priceBands) {
      expect(Number.isInteger(band.fromMinor), band.band).toBe(true);
      expect(Number.isInteger(band.toMinor), band.band).toBe(true);
      expect(band.toMinor).toBeGreaterThan(band.fromMinor);
    }
  });

  it("agrees with the authored dataset on every non-funeral band", () => {
    for (const band of priceBands) {
      if (band.band === "funeral") continue;
      const authored = priceBandFor(band.country, band.band as PriceBandKey);

      expect(
        [authored.fromMinor, authored.toMinor],
        `${band.country} ${band.band}`,
      ).toEqual([band.fromMinor, band.toMinor]);
    }
  });

  it("bounds the four funeral sub-bands by the funeral row it states", () => {
    for (const band of priceBands.filter((one) => one.band === "funeral")) {
      const first = priceBandFor(band.country, "funeral_essential");
      const last = priceBandFor(band.country, "funeral_luxury");

      expect(first.fromMinor, band.country).toBe(band.fromMinor);
      expect(last.toMinor, band.country).toBe(band.toMinor);
    }
  });

  it("is the split `vatBreakdown()` actually produces for the mixed basket (AC-13)", () => {
    for (const basket of mixedVatBaskets) {
      const produced = vatBreakdown(
        basket.lines.map((line) => ({
          grossMinor: line.grossMinor,
          rateBp: line.rateBp,
          currency: basket.currency as CurrencyCode,
        })),
      );

      expect(produced, basket.label).toEqual(
        basket.splits.map((split) => ({
          rateBp: split.rateBp,
          grossMinor: split.grossMinor,
          netMinor: split.netMinor,
          vatMinor: split.vatMinor,
        })),
      );
    }
  });

  it("keeps the basket's own totals exact: net + VAT = gross, per rate and overall", () => {
    for (const basket of mixedVatBaskets) {
      const gross = basket.lines.reduce(
        (sum, line) => sum + line.grossMinor,
        0,
      );
      const net = basket.splits.reduce((sum, split) => sum + split.netMinor, 0);
      const vat = basket.splits.reduce((sum, split) => sum + split.vatMinor, 0);

      expect(gross, basket.label).toBe(basket.totalGrossMinor);
      expect(net).toBe(basket.totalNetMinor);
      expect(vat).toBe(basket.totalVatMinor);
      expect(net + vat).toBe(gross);
      // More than one rate, or it is not the fixture AC-13 needs.
      expect(new Set(basket.lines.map((line) => line.rateBp)).size).toBe(2);
    }
  });
});
