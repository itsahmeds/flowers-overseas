/**
 * Spec 020a T-21 (AC-20, the schema half) and the shared input of §5.2 (TASK-357, TASK-359).
 *
 * The seven refund reasons are written out here from §5.2, not read from the module, so a reason
 * added to or dropped from `adminRefundReasons` turns a case red.
 */
import { describe, expect, it } from "vitest";

import {
  AdminCancelSchema,
  AdminOrderActionBaseSchema,
  AdminRefundSchema,
  AdminRerouteSchema,
  AdminResendSchema,
  adminRefundReasons,
} from "../../src/modules/admin/order-actions/schemas.ts";

const ORDER = "8a4f7c0e-3b1d-4f6a-9c2e-1d5b7a9e3f10";
const ACTION = "2c9e5a71-6d4b-4e8f-a1c3-7b2d9f0e4a56";
const OTHER_ID = "5e1b3d7f-9a2c-4b6e-8d0f-3c5a7e9b1d24";
const BASE = { orderId: ORDER, actionId: ACTION, expectedSeq: 4 };

/** Spec 020a §5.2, `AdminRefundReasonSchema`: exactly these seven. */
const REFUND_REASONS = [
  "addon_missing",
  "late_delivery",
  "substitution_complaint",
  "quality",
  "goodwill",
  "duplicate",
  "other",
];
const SYSTEM_REASONS = [
  "buyer_cancel",
  "no_partner",
  "authorisation_lapsing",
  "redelivery_failed",
];

describe("T-21 refund reasons (spec 020a AC-20)", () => {
  it("offers exactly the seven reasons", () => {
    expect([...adminRefundReasons].sort()).toEqual([...REFUND_REASONS].sort());
  });

  it.each(REFUND_REASONS)("accepts %s (with a note)", (reason) => {
    for (const kind of ["full", "partial"] as const) {
      const input = {
        ...BASE,
        kind,
        reason,
        note: "ok",
        ...(kind === "partial" ? { amountText: "12,50" } : {}),
      };
      expect(AdminRefundSchema.safeParse(input).success).toBe(true);
    }
  });

  it.each(SYSTEM_REASONS)("refuses the system reason %s", (reason) => {
    expect(
      AdminRefundSchema.safeParse({ ...BASE, kind: "full", reason, note: "x" })
        .success,
    ).toBe(false);
  });

  it("refuses other without a note, and with a blank note", () => {
    expect(
      AdminRefundSchema.safeParse({ ...BASE, kind: "full", reason: "other" })
        .success,
    ).toBe(false);
    expect(
      AdminRefundSchema.safeParse({
        ...BASE,
        kind: "partial",
        amountText: "5",
        reason: "other",
        note: "   ",
      }).success,
    ).toBe(false);
    expect(
      AdminRefundSchema.safeParse({ ...BASE, kind: "full", reason: "quality" })
        .success,
    ).toBe(true);
  });

  it("refuses a note over 280 characters and an amount text over 16", () => {
    expect(
      AdminRefundSchema.safeParse({
        ...BASE,
        kind: "full",
        reason: "goodwill",
        note: "a".repeat(281),
      }).success,
    ).toBe(false);
    expect(
      AdminRefundSchema.safeParse({
        ...BASE,
        kind: "full",
        reason: "goodwill",
        note: "a".repeat(280),
      }).success,
    ).toBe(true);
    expect(
      AdminRefundSchema.safeParse({
        ...BASE,
        kind: "partial",
        reason: "goodwill",
        amountText: "1".repeat(17),
      }).success,
    ).toBe(false);
  });

  it("has no amount on a full refund and needs one on a partial", () => {
    expect(
      AdminRefundSchema.safeParse({
        ...BASE,
        kind: "full",
        reason: "goodwill",
        amountText: "5",
      }).success,
    ).toBe(false);
    expect(
      AdminRefundSchema.safeParse({
        ...BASE,
        kind: "partial",
        reason: "goodwill",
      }).success,
    ).toBe(false);
  });
});

describe("cancel input (spec 020a §2.3, §5.2)", () => {
  it.each(["buyer_cancel", "no_partner"])(
    "accepts %s without a note",
    (reason) => {
      expect(AdminCancelSchema.safeParse({ ...BASE, reason }).success).toBe(
        true,
      );
    },
  );

  it("needs a note for other, and refuses refund reasons and an amount", () => {
    expect(
      AdminCancelSchema.safeParse({ ...BASE, reason: "other" }).success,
    ).toBe(false);
    expect(
      AdminCancelSchema.safeParse({ ...BASE, reason: "other", note: "phoned" })
        .success,
    ).toBe(true);
    expect(
      AdminCancelSchema.safeParse({ ...BASE, reason: "quality" }).success,
    ).toBe(false);
    expect(
      AdminCancelSchema.safeParse({
        ...BASE,
        reason: "buyer_cancel",
        amountText: "5",
      }).success,
    ).toBe(false);
  });
});

describe("the shared base (spec 020a §5.2)", () => {
  it("accepts the three fields and nothing else", () => {
    expect(AdminOrderActionBaseSchema.safeParse(BASE).success).toBe(true);
    expect(
      AdminOrderActionBaseSchema.safeParse({ ...BASE, extra: 1 }).success,
    ).toBe(false);
  });

  it.each([
    ["a non-uuid order", { ...BASE, orderId: "123" }],
    ["a non-uuid action", { ...BASE, actionId: "abc" }],
    ["a zero expectedSeq", { ...BASE, expectedSeq: 0 }],
    ["a fractional expectedSeq", { ...BASE, expectedSeq: 1.5 }],
    ["a string expectedSeq", { ...BASE, expectedSeq: "4" }],
  ])("refuses %s", (_label, input) => {
    expect(AdminOrderActionBaseSchema.safeParse(input).success).toBe(false);
  });

  it("extends to reroute and resend with their one id", () => {
    expect(
      AdminRerouteSchema.safeParse({ ...BASE, partnerId: OTHER_ID }).success,
    ).toBe(true);
    expect(AdminRerouteSchema.safeParse(BASE).success).toBe(false);
    expect(
      AdminResendSchema.safeParse({ ...BASE, deliveryId: OTHER_ID }).success,
    ).toBe(true);
    expect(
      AdminResendSchema.safeParse({ ...BASE, deliveryId: "x" }).success,
    ).toBe(false);
  });
});
