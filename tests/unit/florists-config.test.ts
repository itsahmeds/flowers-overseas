/**
 * Spec 011 AC-4 / T-04 (TASK-210): the landing's payout example and `src/config/florists.ts`.
 *
 *  - The buyer's amount equals `formatMoney` of the catalogue's **active** retail row for the
 *    configured (product, `PL`, tier), read here straight from the price rows, in each locale.
 *  - Changing that dataset row changes the rendered string, with no edit to the config.
 *  - The config's parse fails for a payout at or above the retail amount, a float, a zero, a
 *    negative and a currency mismatch.
 *
 * And the file's other contracts: the partner statuses mirror the database enum, the example's
 * recipient is the shared Polish sample, and production signs nobody in during Phase 0.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { partnerStatuses } from "../../db/schema/partners.ts";
import { CHECKOUT_SAMPLES } from "../../src/config/checkout-samples.ts";
import {
  FLORISTS,
  FLORIST_BASE_PATH,
  FloristsConfigSchema,
  PARTNER_STATUSES,
  floristsConfigSchemaFor,
  signInPolicy,
} from "../../src/config/florists.ts";
import { staticPriceProvider } from "../../src/modules/catalog/static/index.ts";
import { formatMoney } from "../../src/modules/i18n/index.ts";
import { payoutExampleView } from "../../src/modules/partners/index.ts";

const LOCALES = ["en", "en-gb", "de", "pl"] as const;
const { productId, tier, countryIso2 } = FLORISTS.payoutExample;

/** The one active retail row of the configured example, from the dataset itself. */
async function activeRow() {
  const rows = await staticPriceProvider.countryPrices();
  const matches = rows.filter(
    (row) =>
      row.sku === productId &&
      row.tierKey === tier &&
      row.countryIso2 === countryIso2 &&
      row.surchargeKind === null &&
      row.activeTo === null,
  );
  expect(matches).toHaveLength(1);
  const row = matches[0];
  if (row === undefined) throw new Error("no active row");
  return row;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AC-4: the buyer's amount is resolved, never copied", () => {
  it.each(LOCALES)(
    "equals formatMoney of the active retail row in %s",
    async (locale) => {
      const row = await activeRow();
      const view = await payoutExampleView(locale);
      expect(view.retail).toEqual({
        amountMinor: row.retailMinor,
        currency: row.currency,
      });
      expect(view.retailLabel).toBe(
        formatMoney(
          { amountMinor: row.retailMinor, currency: row.currency },
          locale,
        ),
      );
      expect(view.payoutLabel).toBe(
        formatMoney({ amountMinor: 14_900, currency: "PLN" }, locale),
      );
    },
  );

  it("changes when the dataset row changes, with no edit to florists.ts", async () => {
    const row = await activeRow();
    const before = await payoutExampleView("en");
    const rows = await staticPriceProvider.countryPrices();
    vi.spyOn(staticPriceProvider, "countryPrices").mockResolvedValue(
      rows.map((candidate) =>
        candidate === row
          ? { ...candidate, retailMinor: row.retailMinor + 1000 }
          : candidate,
      ),
    );
    const after = await payoutExampleView("en");
    expect(after.retail.amountMinor).toBe(row.retailMinor + 1000);
    expect(after.retailLabel).not.toBe(before.retailLabel);
    expect(after.retailLabel).toBe(
      formatMoney(
        { amountMinor: row.retailMinor + 1000, currency: row.currency },
        "en",
      ),
    );
    // The payout is the authored figure, untouched by the price.
    expect(after.payoutLabel).toBe(before.payoutLabel);
  });

  it("refuses to render when the dataset row falls to the payout", async () => {
    const row = await activeRow();
    const rows = await staticPriceProvider.countryPrices();
    vi.spyOn(staticPriceProvider, "countryPrices").mockResolvedValue(
      rows.map((candidate) =>
        candidate === row
          ? { ...candidate, retailMinor: FLORISTS.payoutExample.payoutMinor }
          : candidate,
      ),
    );
    await expect(payoutExampleView("en")).rejects.toThrow(/below the retail/u);
  });
});

describe("AC-4: the config's parse", () => {
  const retail = { amountMinor: 22_900, currency: "PLN" };
  const withPayout = (payout: Partial<typeof FLORISTS.payoutExample>) => ({
    ...FLORISTS,
    payoutExample: { ...FLORISTS.payoutExample, ...payout },
  });

  it("accepts the committed config against a retail above the payout", () => {
    expect(floristsConfigSchemaFor(retail).safeParse(FLORISTS).success).toBe(
      true,
    );
  });

  it.each([
    ["equal to the retail amount", { payoutMinor: 22_900 }, "payoutMinor"],
    ["above the retail amount", { payoutMinor: 22_901 }, "payoutMinor"],
    ["a float", { payoutMinor: 149.5 }, "payoutMinor"],
    ["zero", { payoutMinor: 0 }, "payoutMinor"],
    ["negative", { payoutMinor: -100 }, "payoutMinor"],
    ["in another currency", { currency: "EUR" }, "currency"],
  ] as const)("fails for a payout %s", (_what, payout, field) => {
    const result = floristsConfigSchemaFor(retail).safeParse(
      withPayout(payout),
    );
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toContain(
      `payoutExample.${field}`,
    );
  });

  it("passes one minor unit below the retail amount", () => {
    expect(
      floristsConfigSchemaFor(retail).safeParse(
        withPayout({ payoutMinor: 22_899 }),
      ).success,
    ).toBe(true);
  });

  it("is strict: an unknown key fails", () => {
    expect(
      FloristsConfigSchema.safeParse({ ...FLORISTS, vatLine: true }).success,
    ).toBe(false);
  });
});

describe("florists.ts's other contracts", () => {
  it("mirrors fulfillment_partner.status exactly", () => {
    expect([...PARTNER_STATUSES]).toEqual([...partnerStatuses]);
  });

  it("ships the form off and mounts the inbox at /demo/vendor-inbox (§12)", () => {
    expect(FLORISTS.applicationForm).toBe("off");
    expect(FLORIST_BASE_PATH).toBe("/demo/vendor-inbox");
  });

  it("signs nobody in on production in Phase 0, demo members elsewhere (§13 Q4)", () => {
    expect(signInPolicy("production")).toEqual([]);
    for (const environment of [
      "development",
      "test",
      "preview",
      "staging",
    ] as const) {
      expect(signInPolicy(environment)).toEqual(["demo"]);
    }
  });

  it("restates the shared Polish sample recipient exactly", () => {
    const sample = CHECKOUT_SAMPLES.PL.recipient.fields;
    expect(FLORISTS.example.recipient).toEqual({
      fullName: sample.fullName,
      street: sample.street,
      postcode: sample.postcode,
      city: sample.city,
      phone: sample.phone,
    });
  });
});
