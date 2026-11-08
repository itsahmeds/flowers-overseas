/**
 * Spec 047's admin half, pure parts (§10 T-02 form half, T-03 matrix half, T-05 status half,
 * T-06; AC-2, AC-3, AC-5, AC-6; TASK-446).
 *
 *  - AC-3: `discounts.read` is admin and finance, `discounts.write` admin only; ops and content
 *    see no Discounts entry; every exported action calls `requirePermission` first;
 *  - AC-5: the computed status of six codes (scheduled, active, ended, used up, disabled);
 *  - AC-6: `costPreviewRow`'s exact integers for the artboard's three bouquets, a warning row at
 *    exactly zero margin and none one minor unit above;
 *  - AC-2 (form half): the form's text becomes the schema's input and each refusal lands on its
 *    own form field; percents shift to basis points; Europe/London dates become UTC instants on
 *    both sides of a clock change.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  adminNavFor,
  bpToPercentText,
  can,
  computedDiscountStatus,
  discountInputFromForm,
  percentTextToBp,
} from "../../src/modules/admin/index.ts";
import {
  costPreviewRow,
  DiscountCodeInputSchema,
} from "../../src/modules/discounts/index.ts";
import {
  instantToWallClock,
  wallClockToInstant,
} from "../../src/modules/i18n/index.ts";

describe("permissions (AC-3)", () => {
  it("reads for admin and finance, writes for admin only", () => {
    expect(can(["admin"], "discounts.read")).toBe(true);
    expect(can(["admin"], "discounts.write")).toBe(true);
    expect(can(["finance"], "discounts.read")).toBe(true);
    expect(can(["finance"], "discounts.write")).toBe(false);
    for (const role of ["ops", "content"]) {
      expect(can([role], "discounts.read")).toBe(false);
      expect(can([role], "discounts.write")).toBe(false);
      expect(adminNavFor([role]).some((item) => item.key === "discounts")).toBe(
        false,
      );
    }
    expect(
      adminNavFor(["finance"]).some((item) => item.key === "discounts"),
    ).toBe(true);
  });

  it("guards every action first", () => {
    const source = readFileSync(
      resolve(
        import.meta.dirname,
        "../../src/app/admin/(signed-in)/discounts/actions.ts",
      ),
      "utf8",
    );
    const bodies = [
      ...source.matchAll(
        /export async function (\w+)\([^)]*\)[^{]*\{\s*([^\n]+)/gu,
      ),
    ];
    expect(bodies.map((m) => m[1]).sort()).toEqual([
      "createDiscountCodeAction",
      "disableDiscountCodeAction",
      "enableDiscountCodeAction",
      "previewDiscountCostAction",
      "updateDiscountCodeAction",
    ]);
    for (const [, name, first] of bodies) {
      if (
        name === "disableDiscountCodeAction" ||
        name === "enableDiscountCodeAction"
      ) {
        expect(first).toMatch(/await setStatus\(/u);
      } else {
        expect(first, name).toMatch(
          /await requirePermission\("discounts\.(read|write)"\)/u,
        );
      }
    }
    expect(source).toMatch(
      /async function setStatus[^{]*\{\s*const session = await requirePermission\("discounts\.write"\)/u,
    );
    expect(source).toMatch(
      /previewDiscountCostAction[\s\S]*?requirePermission\("discounts\.read"\)/u,
    );
  });
});

describe("computed status (AC-5)", () => {
  const now = new Date("2026-11-08T12:00:00Z");
  const base = {
    status: "active" as const,
    startsAt: new Date("2026-11-01T00:00:00Z"),
    endsAt: new Date("2026-11-30T23:59:00Z") as Date | null,
    maxRedemptions: 200 as number | null,
  };
  it.each([
    ["active", base, 37],
    ["active", { ...base, endsAt: null, maxRedemptions: null }, 9],
    [
      "scheduled",
      { ...base, startsAt: new Date("2026-12-01T00:00:00Z"), endsAt: null },
      0,
    ],
    ["used_up", { ...base, maxRedemptions: 120 }, 120],
    ["ended", { ...base, endsAt: new Date("2026-11-08T12:00:00Z") }, 54],
    ["disabled", { ...base, status: "disabled" as const }, 0],
  ])("%s", (expected, code, uses) => {
    expect(computedDiscountStatus(code, uses, now)).toBe(expected);
  });
});

describe("costPreviewRow (AC-6)", () => {
  const percent10 = {
    kind: "percent" as const,
    percentBp: 1000,
    currencies: [],
  };
  const row = (priceMinor: number, payout: number | null) =>
    costPreviewRow({
      priceMinor,
      currency: "PLN",
      vatRateBp: 800,
      highestPayoutMinor: payout,
      payoutCurrency: payout === null ? null : "PLN",
      terms: percent10,
    });

  it("gives the artboard's exact integers", () => {
    expect(row(22900, 14900)).toEqual({
      priceMinor: 22900,
      discountMinor: 2290,
      vatMinor: 1527,
      highestPayoutMinor: 14900,
      marginMinor: 4183,
      belowCost: false,
    });
    expect(row(30900, 20900)).toMatchObject({
      discountMinor: 3090,
      vatMinor: 2060,
      marginMinor: 4850,
    });
    expect(row(16900, 14900)).toMatchObject({
      discountMinor: 1690,
      vatMinor: 1127,
      marginMinor: -817,
      belowCost: true,
    });
  });

  it("warns at exactly zero margin, not one unit above, and never without a payout", () => {
    // paid 15 210, VAT 1 127, net 14 083: a payout of 14 083 leaves exactly zero.
    expect(row(16900, 14083)).toMatchObject({
      marginMinor: 0,
      belowCost: true,
    });
    expect(row(16900, 14082)).toMatchObject({
      marginMinor: 1,
      belowCost: false,
    });
    expect(row(16900, null)).toMatchObject({
      marginMinor: null,
      belowCost: false,
    });
  });

  it("takes a fixed amount in the price's currency", () => {
    const fixed = costPreviewRow({
      priceMinor: 16900,
      currency: "PLN",
      vatRateBp: 800,
      highestPayoutMinor: 14900,
      payoutCurrency: "EUR",
      terms: {
        kind: "fixed",
        percentBp: null,
        currencies: [{ currency: "PLN", amountOffMinor: 2500 }],
      },
    });
    expect(fixed).toMatchObject({
      discountMinor: 2500,
      marginMinor: null,
      belowCost: false,
    });
  });
});

describe("the form (AC-2, form half)", () => {
  const CURRENCIES = ["GBP", "EUR", "PLN"] as const;
  const base = {
    code: "polonia-10",
    campaignLabel: "Polish Saturday school, Ealing",
    kind: "percent",
    percent: "10",
    startsAt: "2026-11-01T00:00",
    endsAt: "2026-11-30T23:59",
    zone: "Europe/London",
    maxRedemptions: "200",
    maxPerEmail: "1",
    countryIds: [],
    productIds: [],
  };
  const errors = (fields: Record<string, string | string[]>) => {
    const { input, currencies } = discountInputFromForm(fields, CURRENCIES);
    const parsed = DiscountCodeInputSchema.safeParse(input);
    if (parsed.success) return {};
    return Object.fromEntries(
      parsed.error.issues.map((issue) => {
        const path = issue.path.join(".");
        const m = /^currencies\.(\d+)\.(\w+)$/u.exec(path);
        const field =
          m === null
            ? path === "percentBp"
              ? "percent"
              : path
            : `${m[2] === "minOrderMinor" ? "min" : "amount"}_${currencies[Number(m[1])] ?? ""}`;
        return [field, issue.message];
      }),
    );
  };

  it("parses a valid code into minor units, basis points and UTC", () => {
    const { input } = discountInputFromForm(
      {
        ...base,
        kind: "fixed",
        percent: "",
        amount_GBP: "5",
        min_GBP: "20.00",
        amount_EUR: "6.50",
        min_EUR: "15",
      },
      CURRENCIES,
    );
    expect(input).toMatchObject({
      currencies: [
        { currency: "GBP", amountOffMinor: 500, minOrderMinor: 2000 },
        { currency: "EUR", amountOffMinor: 650, minOrderMinor: 1500 },
      ],
      startsAt: "2026-11-01T00:00:00.000Z",
      endsAt: "2026-11-30T23:59:00.000Z",
      maxRedemptions: 200,
      maxPerEmail: 1,
    });
    expect(
      errors({
        ...base,
        kind: "fixed",
        percent: "",
        amount_GBP: "5",
        min_GBP: "20.00",
      }),
    ).toEqual({});
  });

  it.each([
    [{ percent: "60" }, "percent", "percentRange"],
    [{ percent: "0.5" }, "percent", "percentRange"],
    [{ percent: "ten" }, "percent", "percentRange"],
    [{ kind: "fixed", percent: "" }, "currencies", "fixedNeedsAmount"],
    [
      { kind: "fixed", percent: "", amount_GBP: "11", min_GBP: "20" },
      "amount_GBP",
      "amountAboveCeiling",
    ],
    [
      { kind: "fixed", percent: "", amount_GBP: "5.001", min_GBP: "20" },
      "amount_GBP",
      "minorUnits",
    ],
    [{ endsAt: "2026-10-01T00:00" }, "endsAt", "endsBeforeStart"],
    [{ code: "ABC" }, "code", "codeShape"],
    [{ startsAt: "1 Nov" }, "startsAt", "instant"],
    [{ maxRedemptions: "0" }, "maxRedemptions", "capPositive"],
  ])("shows %j on %s as %s", (patch, field, error) => {
    expect(errors({ ...base, ...patch })[field]).toBe(error);
  });

  it("shifts percents by digits", () => {
    expect(percentTextToBp("10")).toBe(1000);
    expect(percentTextToBp("12.5")).toBe(1250);
    expect(percentTextToBp("12,25 %")).toBe(1225);
    expect(percentTextToBp("1.234")).toBe(-1);
    expect(bpToPercentText(1000)).toBe("10");
    expect(bpToPercentText(1250)).toBe("12.5");
    expect(bpToPercentText(100)).toBe("1");
  });

  it("reads Europe/London wall-clock time on both sides of the clock change", () => {
    expect(
      wallClockToInstant("2026-07-01T09:00", "Europe/London")?.toISOString(),
    ).toBe("2026-07-01T08:00:00.000Z");
    expect(
      wallClockToInstant("2026-12-01T09:00", "Europe/London")?.toISOString(),
    ).toBe("2026-12-01T09:00:00.000Z");
    // 25 October 2026, 01:30 happens twice: the first (BST) is taken.
    expect(
      wallClockToInstant("2026-10-25T01:30", "Europe/London")?.toISOString(),
    ).toBe("2026-10-25T00:30:00.000Z");
    // 29 March 2026, 01:30 does not happen: it moves forward by the gap.
    expect(
      wallClockToInstant("2026-03-29T01:30", "Europe/London")?.toISOString(),
    ).toBe("2026-03-29T01:30:00.000Z");
    expect(
      wallClockToInstant("2026-11-01T00:00", "Europe/Warsaw")?.toISOString(),
    ).toBe("2026-10-31T23:00:00.000Z");
    expect(wallClockToInstant("nope", "Europe/London")).toBeNull();
    expect(
      instantToWallClock(new Date("2026-07-01T08:00:00Z"), "Europe/London"),
    ).toBe("2026-07-01T09:00");
  });
});
