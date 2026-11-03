/**
 * Spec 030a T-01, unit half (AC-1; TASK-363): `PayoutTermsEditSchema` through `parsePayoutTerms`.
 * Each refusal names its field and carries no typed value; the bounds are the migration's checks.
 * Spec mutation: widen the limit to 0..100 and the 51 case goes red.
 */
import { describe, expect, it } from "vitest";

import { parsePayoutTerms } from "../../src/modules/partners/payouts/terms";

const VALID = {
  cadence: "weekly",
  prepaidOrderLimit: "5",
  wiseRecipientId: "12345678",
} as const;

describe("parsePayoutTerms (spec 030a AC-1)", () => {
  it.each([
    [{ cadence: "monthly" }, { cadence: "cadence" }],
    [{ cadence: "" }, { cadence: "cadence" }],
    [{ prepaidOrderLimit: "51" }, { prepaidOrderLimit: "prepaidLimit" }],
    [{ prepaidOrderLimit: "-1" }, { prepaidOrderLimit: "prepaidLimit" }],
    [{ prepaidOrderLimit: "2.5" }, { prepaidOrderLimit: "prepaidLimit" }],
    [{ prepaidOrderLimit: 2.5 }, { prepaidOrderLimit: "prepaidLimit" }],
    [{ prepaidOrderLimit: -1 }, { prepaidOrderLimit: "prepaidLimit" }],
    [{ prepaidOrderLimit: "" }, { prepaidOrderLimit: "prepaidLimit" }],
    [{ wiseRecipientId: "12a" }, { wiseRecipientId: "wiseRecipient" }],
    [{ wiseRecipientId: "1".repeat(21) }, { wiseRecipientId: "wiseRecipient" }],
    [
      { wiseRecipientId: "PL61109010140000071219812874" },
      { wiseRecipientId: "wiseRecipient" },
    ],
  ])("refuses %j with its field code", (patch, errors) => {
    expect(parsePayoutTerms({ ...VALID, ...patch })).toEqual({
      ok: false,
      errors,
    });
  });

  it("accepts the bounds 0 and 50, 1 and 20 digits, and both cadences", () => {
    expect(
      parsePayoutTerms({
        cadence: " per_order ",
        prepaidOrderLimit: "0",
        wiseRecipientId: "7",
      }),
    ).toEqual({
      ok: true,
      value: {
        cadence: "per_order",
        prepaidOrderLimit: 0,
        wiseRecipientId: "7",
      },
    });
    expect(
      parsePayoutTerms({
        ...VALID,
        prepaidOrderLimit: 50,
        wiseRecipientId: "9".repeat(20),
      }),
    ).toEqual({
      ok: true,
      value: {
        cadence: "weekly",
        prepaidOrderLimit: 50,
        wiseRecipientId: "9".repeat(20),
      },
    });
  });

  it("a blank or absent recipient id clears it; other fields are dropped", () => {
    expect(
      parsePayoutTerms({
        cadence: "weekly",
        prepaidOrderLimit: "5",
        iban: "x",
      }),
    ).toEqual({
      ok: true,
      value: { cadence: "weekly", prepaidOrderLimit: 5, wiseRecipientId: null },
    });
    expect(parsePayoutTerms({ ...VALID, wiseRecipientId: "  " })).toEqual({
      ok: true,
      value: { cadence: "weekly", prepaidOrderLimit: 5, wiseRecipientId: null },
    });
  });

  it("refuses every bad field at once, with no typed value in the result", () => {
    const result = parsePayoutTerms({
      cadence: "monthly",
      prepaidOrderLimit: "99",
      wiseRecipientId: "secret-iban",
    });
    expect(result).toEqual({
      ok: false,
      errors: {
        cadence: "cadence",
        prepaidOrderLimit: "prepaidLimit",
        wiseRecipientId: "wiseRecipient",
      },
    });
    expect(JSON.stringify(result)).not.toMatch(/monthly|99|secret/u);
  });

  it("refuses an empty input on the cadence", () => {
    expect(parsePayoutTerms(undefined)).toMatchObject({ ok: false });
  });
});
