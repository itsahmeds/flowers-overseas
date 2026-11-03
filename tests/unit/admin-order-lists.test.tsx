/**
 * Spec 020a's lists on the order page, rendered on the server (AC-23 render, AC-24 HTML half;
 * TASK-361): the emails list shows template, who it went to, status and time, "Resend" exactly on
 * the rows the resend table allows and the reason on every other, and no `@` anywhere in its HTML;
 * the refunds list is newest first with the balance; the action history names who, what, when,
 * reason and amount. The data halves are `tests/integration/admin-order-resend.test.ts` (T-25 to
 * T-27) and `admin-order-refunds.test.ts` (T-24).
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ActionHistoryEntry, OrderRefunds } from "@/modules/admin";
import type { OrderEmail } from "@/modules/admin/order-actions/resend";

import {
  EmailsSection,
  HistorySection,
  RefundsBlock,
} from "../../src/app/admin/(signed-in)/orders/[id]/order-lists.tsx";

const ORDER_ID = "0b7e1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d";
const ZONE = "Europe/Tallinn";
const at = (iso: string) => new Date(iso);

function email(id: string, over: Partial<OrderEmail>): OrderEmail {
  return {
    deliveryId: id,
    templateKey: "order-received",
    code: "B1",
    audience: "buyer",
    partnerName: null,
    status: "delivered",
    held: false,
    createdAt: at("2026-10-07T17:59:00Z"),
    statusAt: at("2026-10-07T17:59:00Z"),
    resendOf: null,
    resend: { allowed: true },
    ...over,
  };
}

const B1 = "11111111-1111-4111-8111-111111111111";
const V1 = "22222222-2222-4222-8222-222222222222";
const B1_RESENT = "33333333-3333-4333-8333-333333333333";
const V2 = "44444444-4444-4444-8444-444444444444";
const A1 = "55555555-5555-4555-8555-555555555555";
const B6 = "66666666-6666-4666-8666-666666666666";

const EMAILS: readonly OrderEmail[] = [
  email(B1, {}),
  email(V1, {
    templateKey: "offer",
    code: "V1",
    audience: "florist",
    partnerName: "Kwiaty Mokotów",
    resend: { allowed: false, cause: "answered" },
  }),
  email(V2, {
    templateKey: "offer-reminder",
    code: "V2",
    audience: "florist",
    partnerName: "Kwiaciarnia Bielany",
    status: "sent",
    resend: { allowed: false, cause: "reminder" },
  }),
  email(A1, {
    templateKey: "alert-no-partner",
    code: "A1",
    audience: "ops",
    resend: { allowed: false, cause: "own_alert" },
  }),
  email(B6, {
    templateKey: "refund",
    code: "B6",
    resend: { allowed: false, cause: "rate_limited" },
  }),
  email(B1_RESENT, {
    status: "queued",
    held: true,
    resendOf: B1,
    resend: { allowed: false, cause: "held" },
  }),
];

function emails(outcome: { result: string; ref: string | null } | null = null) {
  return renderToStaticMarkup(
    EmailsSection({
      emails: EMAILS,
      orderId: ORDER_ID,
      seq: 16,
      zone: ZONE,
      outcome,
    }),
  );
}

describe("the emails list (spec 020a AC-24)", () => {
  it("offers Resend exactly on the rows the table allows, with the reason on every other", () => {
    const html = emails();
    const forms = [
      ...html.matchAll(/name="deliveryId" value="([0-9a-f-]+)"/gu),
    ];
    expect(forms.map((m) => m[1])).toEqual([B1]);
    expect(html).toContain('name="expectedSeq" value="16"');
    expect(html).toContain('aria-label="Resend Order received to Buyer"');
    for (const line of [
      "Answered: not resent.",
      "Reminders are not resent.",
      "Your own alerts are not resent.",
      "Resent 3 times in 24 hours.",
      "Held: email sending is off.",
    ]) {
      expect(html).toContain(line);
    }
  });

  it("names template, code, who and status, a resent row as such; never an address", () => {
    const html = emails();
    expect(html).toContain("B1 order-received");
    expect(html).toContain("Kwiaty Mokotów");
    expect(html).toContain("Founder");
    expect(html).toContain("Order received, resent");
    expect(html).toContain(">Held<");
    expect(html).toContain("No email address is shown.");
    expect(html).not.toContain("@");
  });

  it("says which email was resent, or why not", () => {
    expect(emails({ result: "done", ref: B1_RESENT })).toContain(
      "Resent: Order received, to Buyer.",
    );
    expect(emails({ result: "RESEND_RATE_LIMITED", ref: null })).toContain(
      "Already resent 3 times in 24 hours. Nothing was sent.",
    );
    expect(emails({ result: "RESEND_NOT_ALLOWED", ref: null })).toContain(
      "This email cannot be resent now. Nothing was sent.",
    );
  });

  it("an order with no email says so", () => {
    const html = renderToStaticMarkup(
      EmailsSection({
        emails: [],
        orderId: ORDER_ID,
        seq: 1,
        zone: ZONE,
        outcome: null,
      }),
    );
    expect(html).toContain("No emails yet.");
  });
});

describe("the refunds list and balance (spec 020a AC-23)", () => {
  const refunds: OrderRefunds = {
    currencyCode: "EUR",
    capturedMinor: 5_800n,
    remainingMinor: 1_490n,
    refundInFlight: true,
    refunds: [
      {
        id: "a",
        status: "failed",
        amountMinor: 1_350n,
        currencyCode: "EUR",
        reason: "substitution_complaint",
        requestedBy: { kind: "admin", displayName: "Ahmad Hameed" },
        requestedAt: at("2026-10-08T07:02:00Z"),
        succeededAt: null,
      },
      {
        id: "b",
        status: "succeeded",
        amountMinor: 1_300n,
        currencyCode: "EUR",
        reason: "addon_missing",
        requestedBy: { kind: "admin", displayName: "Ahmad Hameed" },
        requestedAt: at("2026-10-08T07:14:00Z"),
        succeededAt: at("2026-10-08T07:14:09Z"),
      },
      {
        id: "c",
        status: "pending",
        amountMinor: 1_160n,
        currencyCode: "EUR",
        reason: "late_delivery",
        requestedBy: { kind: "system" },
        requestedAt: at("2026-10-08T08:01:00Z"),
        succeededAt: null,
      },
    ],
  } as OrderRefunds;

  it("lists every refund newest first with status, amount, reason, who and when, then the balance", () => {
    const html = renderToStaticMarkup(RefundsBlock({ refunds, zone: ZONE }));
    const order = [
      "Late delivery",
      "Add-on missing",
      "Substitution complaint",
    ].map((label) => html.indexOf(label));
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
    expect(html).toContain("11.60");
    expect(html).toContain("Automatic");
    expect(html).toContain("Waiting for the card provider");
    expect(html).toContain("Not refunded. Nothing left the account.");
    expect(html).toContain("8 Oct, 10:14");
    // Charged 58.00, on its way 58.00 - 14.90 = 43.10, left 14.90 (AC-23's balance).
    expect(html).toMatch(
      /Charged.*58\.00.*Refunded or on its way.*43\.10.*Left to refund.*14\.90/su,
    );
  });

  it("before any refund: one line and the balance", () => {
    const html = renderToStaticMarkup(
      RefundsBlock({
        refunds: {
          ...refunds,
          refunds: [],
          remainingMinor: 5_800n,
          refundInFlight: false,
        },
        zone: ZONE,
      }),
    );
    expect(html).toContain("No refunds.");
    expect(html).toMatch(/Left to refund.*58\.00/su);
  });
});

describe("the action history", () => {
  const history: readonly ActionHistoryEntry[] = [
    {
      id: "h1",
      kind: "reroute",
      actor: { userId: "u", displayName: "Ahmad Hameed" },
      at: at("2026-10-08T06:41:00Z"),
      reason: null,
      amount: null,
      partner: { partnerId: "p", displayName: "Kwiaty Mokotów" },
      resent: null,
    },
    {
      id: "h2",
      kind: "refund_partial",
      actor: { userId: "u", displayName: "Ahmad Hameed" },
      at: at("2026-10-08T07:14:00Z"),
      reason: "addon_missing",
      amount: { amountMinor: 1_300n, currencyCode: "EUR" },
      partner: null,
      resent: null,
    },
    {
      id: "h3",
      kind: "resend",
      actor: { userId: "u", displayName: null },
      at: at("2026-10-08T07:30:00Z"),
      reason: null,
      amount: null,
      partner: null,
      resent: {
        deliveryId: B1_RESENT,
        templateKey: "order-received",
        audience: "buyer",
      },
    },
  ];

  it("names who, what, when, reason and amount, in order", () => {
    const html = renderToStaticMarkup(HistorySection({ history, zone: ZONE }));
    expect(html).toContain("Reroute · Kwiaty Mokotów");
    expect(html).toContain("Refund in part");
    expect(html).toContain("Add-on missing");
    expect(html).toContain("13.00");
    expect(html).toContain("Resend · Order received, Buyer");
    expect(html).toContain("An admin");
    expect(html.indexOf("Kwiaty Mokotów")).toBeLessThan(
      html.indexOf("Add-on missing"),
    );
  });

  it("empty: one line", () => {
    expect(
      renderToStaticMarkup(HistorySection({ history: [], zone: ZONE })),
    ).toContain("No actions on this order yet.");
  });
});
