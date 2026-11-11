/**
 * Country go-live's rules (spec 012b §2.8, AC-25, AC-39 preflight half, §14
 * A-orchestrator-2026-10-20a; T-25 and T-41 rule halves; TASK-300).
 *
 * `src/modules/geo/go-live.ts` without a database: one reason per unmet condition (one fixture
 * each, the others all met), the status graph, the typed code, exactly the null fiscal inputs, and
 * the fiscal schema's refusals. The database half (the facts, the two commands, the audit row) is
 * `tests/integration/country-go-live.test.ts`.
 */
import { describe, expect, it } from "vitest";

import {
  isSanctionedDestination,
  SANCTIONED_DESTINATIONS,
} from "../../src/config/sanctions.ts";
import { COUNTRIES } from "../../src/config/countries.ts";
import { productCountFloor } from "../../src/modules/catalog/listing.ts";
import {
  CountryStatusFlipSchema,
  GoLiveFiscalFieldsSchema,
  type PreflightFacts,
  type PreflightReason,
  confirmsCode,
  evaluatePreflight,
  fiscalInputsFor,
  flipRefusal,
  preflightReasons,
} from "../../src/modules/geo/go-live.ts";

/** A country with every condition met. */
const READY: PreflightFacts = {
  iso2: "PL",
  operationsComplete: true,
  vatRateBp: 800,
  supplyModel: "principal",
  realFlorists: 1,
  saleableProducts: 6,
  productFloor: 6,
  corridorReviewed: true,
  sanctioned: false,
};

/** One fixture per condition: READY with exactly that condition broken. */
const ONE_UNMET: readonly [PreflightReason, Partial<PreflightFacts>][] = [
  ["operationsIncomplete", { operationsComplete: false }],
  ["vatRateMissing", { vatRateBp: null }],
  ["supplyModelMissing", { supplyModel: null }],
  ["noRealFlorist", { realFlorists: 0 }],
  ["tooFewSaleableProducts", { saleableProducts: 5 }],
  ["corridorNotReviewed", { corridorReviewed: false }],
  ["sanctioned", { sanctioned: true }],
];

describe("T-25: goLivePreflight's reasons", () => {
  it("a country with every condition met has no reason", () => {
    expect(evaluatePreflight(READY).reasons).toEqual([]);
  });

  it("names every condition of §2.8 once", () => {
    expect(ONE_UNMET.map(([reason]) => reason)).toEqual([...preflightReasons]);
  });

  it.each(ONE_UNMET)("%s: exactly that reason", (reason, broken) => {
    expect(evaluatePreflight({ ...READY, ...broken }).reasons).toEqual([
      reason,
    ]);
  });

  it("lists every unmet condition together, in the card's order", () => {
    expect(
      evaluatePreflight({
        ...READY,
        operationsComplete: false,
        supplyModel: null,
        realFlorists: 0,
        saleableProducts: 0,
        corridorReviewed: false,
      }).reasons,
    ).toEqual([
      "operationsIncomplete",
      "supplyModelMissing",
      "noRealFlorist",
      "tooFewSaleableProducts",
      "corridorNotReviewed",
    ]);
  });

  it("T-41: six saleable products meet the floor, five do not (the floor is spec 008's)", () => {
    expect(productCountFloor()).toBe(6);
    const floor = productCountFloor();
    expect(
      evaluatePreflight({
        ...READY,
        saleableProducts: floor,
        productFloor: floor,
      }).reasons,
    ).toEqual([]);
    expect(
      evaluatePreflight({
        ...READY,
        saleableProducts: floor - 1,
        productFloor: floor,
      }).reasons,
    ).toEqual(["tooFewSaleableProducts"]);
  });

  it('carries the counts the card prints ("4 of 6")', () => {
    const result = evaluatePreflight({ ...READY, saleableProducts: 4 });
    expect(result).toMatchObject({ saleableProducts: 4, productFloor: 6 });
  });
});

describe("the status graph (§2.8)", () => {
  it.each([
    ["demo", "live"],
    ["live", "demo"],
    ["demo", "disabled"],
    ["disabled", "demo"],
  ] as const)("%s → %s is allowed", (from, to) => {
    expect(flipRefusal(from, to)).toBeUndefined();
  });

  it("live → disabled is refused until the 410 page exists (§13 Q10)", () => {
    expect(flipRefusal("live", "disabled")).toBe("liveToDisabled");
  });

  it("disabled → live is refused: it goes through demo and the preflight", () => {
    expect(flipRefusal("disabled", "live")).toBe("disabledToLive");
  });

  it("a move to the same status is no move", () => {
    expect(flipRefusal("live", "live")).toBe("unchanged");
  });
});

describe("the typed code", () => {
  it("is the ISO code itself", () => {
    expect(confirmsCode("PL", "PL")).toBe(true);
    expect(confirmsCode("PL", " PL ")).toBe(true);
  });

  it.each([undefined, "", "P", "pl", "DE", "PL PL"])(
    "%j does not confirm PL",
    (typed) => {
      expect(confirmsCode("PL", typed)).toBe(false);
    },
  );

  it("the flip's schema refuses an unknown status and an extra field", () => {
    expect(
      CountryStatusFlipSchema.safeParse({
        iso2: "PL",
        from: "demo",
        to: "gone",
      }).success,
    ).toBe(false);
    expect(
      CountryStatusFlipSchema.safeParse({
        iso2: "PL",
        from: "demo",
        to: "live",
        confirmCode: "PL",
        force: true,
      }).success,
    ).toBe(false);
  });
});

describe("T-25: the go-live fiscal fields", () => {
  it("offers exactly the null fields, and none once both are set", () => {
    expect(fiscalInputsFor({ vatRateBp: null, supplyModel: null })).toEqual([
      "vatRateBp",
      "supplyModel",
    ]);
    expect(fiscalInputsFor({ vatRateBp: 800, supplyModel: null })).toEqual([
      "supplyModel",
    ]);
    expect(fiscalInputsFor({ vatRateBp: null, supplyModel: "agent" })).toEqual([
      "vatRateBp",
    ]);
    expect(fiscalInputsFor({ vatRateBp: 800, supplyModel: "agent" })).toEqual(
      [],
    );
  });

  const valid = { iso2: "PL", reason: "Accountant, email of 2026-11-10" };

  it("accepts each field alone and both, at the bounds", () => {
    for (const fields of [
      { vatRateBp: 0 },
      { vatRateBp: 10_000 },
      { supplyModel: "principal" },
      { supplyModel: "agent" },
      { vatRateBp: 800, supplyModel: "agent" },
    ]) {
      expect(
        GoLiveFiscalFieldsSchema.safeParse({ ...valid, ...fields }).success,
      ).toBe(true);
    }
  });

  it.each([
    ["vatRateBp -1", { vatRateBp: -1 }],
    ["vatRateBp 10001", { vatRateBp: 10_001 }],
    ["vatRateBp 8.5", { vatRateBp: 8.5 }],
    ["vatRateBp as text", { vatRateBp: "800" }],
    ["supplyModel seller", { supplyModel: "seller" }],
    ["neither field", {}],
    ["another operations field", { supplyModel: "agent", ianaZone: "UTC" }],
  ])("refuses %s", (_name, fields) => {
    expect(
      GoLiveFiscalFieldsSchema.safeParse({ ...valid, ...fields }).success,
    ).toBe(false);
  });

  it.each(["", "   "])("refuses the reason %j", (reason) => {
    expect(
      GoLiveFiscalFieldsSchema.safeParse({
        iso2: "PL",
        supplyModel: "agent",
        reason,
      }).success,
    ).toBe(false);
  });
});

describe("the sanctions list (plan/07 §9)", () => {
  it("is ISO codes, and names no destination we sell to", () => {
    for (const code of SANCTIONED_DESTINATIONS) {
      expect(code).toMatch(/^[A-Z]{2}$/u);
    }
    for (const country of COUNTRIES) {
      expect(isSanctionedDestination(country.iso2)).toBe(false);
    }
    expect(isSanctionedDestination("RU")).toBe(true);
  });
});
