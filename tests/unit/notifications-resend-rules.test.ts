/**
 * Spec 020a §5.2's resend table, `resendDecision` (AC-24, AC-26; TASK-360).
 *
 * The table is transcribed here from the spec, never read from `RESEND_RULES`: each template row
 * with one fixture where its condition holds now (Resend) and one where it does not (the one cause
 * named), the four templates that are never resent, a buyer row of a `test` order, a demo order, a
 * row still `queued` (held while `notifications.email` is off), a florist recipient who left, and
 * the third and fourth resend in the window.
 */
import { describe, expect, it } from "vitest";

import {
  RESEND_LIMIT,
  RESEND_RULES,
  RESEND_WINDOW_HOURS,
  type ResendAssignmentFacts,
  type ResendFacts,
  resendDecision,
} from "@/modules/notifications";

const OPEN: ResendAssignmentFacts = {
  response: null,
  withdrawn: false,
  slaOpen: true,
  memberPresent: true,
};

/** A sent live row of `template`, on an order in production, nothing resent yet. */
function facts(template: string, over: Partial<ResendFacts> = {}): ResendFacts {
  const florist = ["offer", "order-confirmed", "offer-withdrawn"].includes(
    template,
  );
  return {
    template,
    audience: florist ? "florist" : "buyer",
    rowStatus: "delivered",
    mode: "live",
    emailEnabled: true,
    projection: "being_made",
    orderStatus: "in_production",
    contextKnown: true,
    assignment: florist ? OPEN : null,
    deliveryDatePassed: false,
    recentResends: 0,
    ...over,
  };
}

const YES = { allowed: true };
const no = (cause: string) => ({ allowed: false, cause });

/** Spec 020a §5.2 "Resend", one row per template: [template, holds, does not hold, its cause]. */
const TABLE: readonly (readonly [
  string,
  Partial<ResendFacts>,
  Partial<ResendFacts>,
  string,
])[] = [
  // B1: always, once sent.
  ["order-received", {}, { rowStatus: "queued" }, "queued"],
  // B2: the buyer projection is being_made.
  [
    "being-made",
    { projection: "being_made" },
    { projection: "on_its_way", orderStatus: "out_for_delivery" },
    "not_being_made",
  ],
  // B3: the projection is on_its_way.
  [
    "out-for-delivery",
    { projection: "on_its_way", orderStatus: "out_for_delivery" },
    { projection: "delivered", orderStatus: "delivered" },
    "not_on_its_way",
  ],
  // B4, B6, B8: always, once sent.
  ["delivered-photo", {}, { rowStatus: "queued" }, "queued"],
  ["refund", {}, { rowStatus: "queued" }, "queued"],
  ["credit-note", {}, { rowStatus: "queued" }, "queued"],
  // B5: the order is cancelled or cancelled_refunded.
  [
    "cancelled",
    { orderStatus: "cancelled_refunded", projection: "cancelled" },
    { orderStatus: "refunded_full", projection: "closed" },
    "not_cancelled",
  ],
  // V1: unanswered, not withdrawn, sla in the future.
  ["offer", {}, { assignment: { ...OPEN, response: "accept" } }, "answered"],
  // V3: accepted, not withdrawn, the order not yet delivered.
  [
    "order-confirmed",
    { assignment: { ...OPEN, response: "accept" } },
    {
      assignment: { ...OPEN, response: "accept" },
      projection: "delivered",
      orderStatus: "delivered",
    },
    "delivered",
  ],
  // V4: withdrawn or timed out, the delivery date not passed in the destination's zone.
  [
    "offer-withdrawn",
    { assignment: { ...OPEN, withdrawn: true } },
    { assignment: { ...OPEN, withdrawn: true }, deliveryDatePassed: true },
    "date_passed",
  ],
];

describe("spec 020a §5.2 resend table (AC-24)", () => {
  it("lists exactly the ten resendable templates of the table, with their code and audience", () => {
    expect(
      Object.entries(RESEND_RULES)
        .map(([key, rule]) => `${rule.code}:${key}:${rule.audience}`)
        .sort(),
    ).toEqual([
      "B1:order-received:buyer",
      "B2:being-made:buyer",
      "B3:out-for-delivery:buyer",
      "B4:delivered-photo:buyer",
      "B5:cancelled:buyer",
      "B6:refund:buyer",
      "B8:credit-note:buyer",
      "V1:offer:florist",
      "V3:order-confirmed:florist",
      "V4:offer-withdrawn:florist",
    ]);
    expect(RESEND_LIMIT).toBe(3);
    expect(RESEND_WINDOW_HOURS).toBe(24);
  });

  for (const [template, holds, fails, cause] of TABLE) {
    it(`${template}: Resend while its condition holds; "${cause}" when it does not`, () => {
      expect(resendDecision(facts(template, holds))).toEqual(YES);
      expect(resendDecision(facts(template, fails))).toEqual(no(cause));
    });
  }

  it("V1: timed out, withdrawn, or past its answer window is not resent", () => {
    expect(
      resendDecision(
        facts("offer", { assignment: { ...OPEN, response: "decline" } }),
      ),
    ).toEqual(no("answered"));
    expect(
      resendDecision(
        facts("offer", { assignment: { ...OPEN, response: "timeout" } }),
      ),
    ).toEqual(no("timed_out"));
    expect(
      resendDecision(
        facts("offer", { assignment: { ...OPEN, withdrawn: true } }),
      ),
    ).toEqual(no("withdrawn"));
    expect(
      resendDecision(
        facts("offer", { assignment: { ...OPEN, slaOpen: false } }),
      ),
    ).toEqual(no("timed_out"));
  });

  it("V3: not accepted, or withdrawn after acceptance, is not resent", () => {
    expect(resendDecision(facts("order-confirmed"))).toEqual(
      no("not_accepted"),
    );
    expect(
      resendDecision(
        facts("order-confirmed", {
          assignment: { ...OPEN, response: "accept", withdrawn: true },
        }),
      ),
    ).toEqual(no("withdrawn"));
  });

  it("V4: a timed-out offer counts as withdrawn; an open one does not", () => {
    expect(
      resendDecision(
        facts("offer-withdrawn", {
          assignment: { ...OPEN, response: "timeout" },
        }),
      ),
    ).toEqual(YES);
    expect(resendDecision(facts("offer-withdrawn"))).toEqual(
      no("not_withdrawn"),
    );
  });

  it("V2, V5, A1 and W are never resent, whatever holds", () => {
    expect(
      resendDecision(facts("offer-reminder", { audience: "florist" })),
    ).toEqual(no("reminder"));
    expect(
      resendDecision(facts("photo-reminder", { audience: "florist" })),
    ).toEqual(no("reminder"));
    expect(
      resendDecision(facts("alert-no-partner", { audience: "ops" })),
    ).toEqual(no("own_alert"));
    expect(resendDecision(facts("whatsapp-copy", { audience: "ops" }))).toEqual(
      no("own_alert"),
    );
  });
});

describe("modes, held rows, recipients and the rate limit (AC-26)", () => {
  it("a buyer row of a test order is never resent; a florist row of a test order is", () => {
    expect(resendDecision(facts("order-received", { mode: "test" }))).toEqual(
      no("test_order"),
    );
    expect(resendDecision(facts("offer", { mode: "test" }))).toEqual(YES);
  });

  it("a demo order offers nothing", () => {
    expect(resendDecision(facts("offer", { mode: "demo" }))).toEqual(
      no("demo"),
    );
  });

  it("a row still queued is held while notifications.email is off, queued otherwise", () => {
    expect(
      resendDecision(
        facts("refund", { rowStatus: "queued", emailEnabled: false }),
      ),
    ).toEqual(no("held"));
    expect(resendDecision(facts("refund", { rowStatus: "queued" }))).toEqual(
      no("queued"),
    );
  });

  it("a bounced, complained or failed row is resent (the address is read again at send time)", () => {
    for (const rowStatus of ["bounced", "complained", "failed", "sent"]) {
      expect(resendDecision(facts("order-received", { rowStatus }))).toEqual(
        YES,
      );
    }
  });

  it("a florist recipient who left the florist is not resent", () => {
    expect(
      resendDecision(
        facts("offer", { assignment: { ...OPEN, memberPresent: false } }),
      ),
    ).toEqual(no("recipient_gone"));
  });

  it("an unreadable original context is not resent", () => {
    expect(
      resendDecision(facts("order-received", { contextKnown: false })),
    ).toEqual(no("context_missing"));
  });

  it("two resends in the window leave a third; three refuse the fourth", () => {
    expect(
      resendDecision(facts("order-received", { recentResends: 2 })),
    ).toEqual(YES);
    expect(
      resendDecision(facts("order-received", { recentResends: 3 })),
    ).toEqual(no("rate_limited"));
  });
});
