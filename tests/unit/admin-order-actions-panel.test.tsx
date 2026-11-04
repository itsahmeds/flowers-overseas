/**
 * Spec 020a's Actions card for reroute and cancel, rendered on the server (spec 020a §2.2, §2.3,
 * §5.3; AC-9, AC-12, AC-14, AC-15 (the rendered halves of T-10, T-13, T-15, T-16); TASK-358).
 *
 * The panel is rendered with `renderToStaticMarkup` from fixture data: the dialogs' content is in
 * the HTML (a closed native `<dialog>` still carries it), so each assertion reads what the admin
 * would see once the dialog opens. The DB halves of the same ACs are
 * `tests/integration/admin-order-reroute-cancel.test.ts`.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { AdminOrderDetail } from "@/modules/orders";
import type { RerouteCandidate } from "@/modules/orders/routing/jobs";

import {
  OrderActionsPanel,
  type OrderActionsData,
} from "../../src/app/admin/(signed-in)/orders/[id]/actions-panel.tsx";

const ORDER_ID = "0b7e1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d";

function order(
  status: string,
  over: Partial<AdminOrderDetail> = {},
): AdminOrderDetail {
  return {
    orderId: ORDER_ID,
    reference: "FO-8RTW-2KQM",
    mode: "live",
    status,
    buyerStatus: "confirmed",
    placedAt: "2026-11-04T19:58:00.000Z",
    deliveryDate: "2026-11-05",
    deliveryWindow: null,
    destination: { iso2: "PL", name: "Poland", timeZone: "Europe/Warsaw" },
    cityName: "Warszawa",
    totalMinor: 5_800,
    currency: "EUR",
    vatBreakdown: [],
    lines: [],
    recipient: null,
    events: [
      {
        seq: 1,
        type: "order.placed",
        fromStatus: null,
        toStatus: null,
        actor: "system:checkout",
        occurredAt: "2026-11-04T19:58:00.000Z",
        payload: {},
      },
      {
        seq: 7,
        type: "order.no_partner_available",
        fromStatus: "routed",
        toStatus: "no_partner_available",
        actor: "system:order.route",
        occurredAt: "2026-11-04T20:00:00.000Z",
        payload: {},
      },
    ],
    assignments: [],
    payments: [],
    ...over,
  } as AdminOrderDetail;
}

const CANDIDATES: readonly RerouteCandidate[] = [
  {
    partnerId: "11111111-1111-4111-8111-111111111111",
    displayName: "Pracownia Wola",
    city: "Warszawa",
    rankPosition: 1,
    payoutMinor: 12_900,
    payoutCurrency: "PLN",
    previously: "declined",
  },
  {
    partnerId: "22222222-2222-4222-8222-222222222222",
    displayName: "Kwiaciarnia Bielany",
    city: "Warszawa",
    rankPosition: 2,
    payoutMinor: 12_500,
    payoutCurrency: "PLN",
    previously: "timed_out",
  },
  {
    partnerId: "33333333-3333-4333-8333-333333333333",
    displayName: "Kwiaty Mokotów",
    city: "Warszawa",
    rankPosition: 3,
    payoutMinor: 13_500,
    payoutCurrency: "PLN",
    previously: null,
  },
];

function data(
  status: string,
  over: Partial<OrderActionsData> = {},
): OrderActionsData {
  return {
    order: order(status),
    roles: ["admin"],
    viewerZone: "Europe/London",
    capturedMinor: 5_800n,
    remainingMinor: 5_800n,
    refundInFlight: false,
    cancelRefundMinor: null,
    failedAutomatic: null,
    requestedRefundMinor: null,
    // The refund dialogs are `admin-order-refund-dialog.test.tsx`'s; off here, so the cancel
    // form's reason radios are the only ones in the HTML.
    refundReady: false,
    candidates: CANDIDATES,
    grace: {
      // graceEnd of an order exhausted at 21:00 Warsaw for the next day (spec 016).
      graceEnd: new Date("2026-11-05T09:00:00.000Z"),
      destinationZone: "Europe/Warsaw",
    },
    outcome: null,
    ...over,
  };
}

function render(d: OrderActionsData): string {
  const element = OrderActionsPanel({ data: d });
  return element === null ? "" : renderToStaticMarkup(element);
}

/** The values of the cancel form's reason radios, in order. */
function reasons(html: string): string[] {
  return [
    ...html.matchAll(/name="reason"(?: checked="")? value="([a-z_]+)"/gu),
  ].map((match) => match[1] ?? "");
}

describe("the reroute dialog (spec 020a AC-9, AC-12)", () => {
  it("lists the candidates in rank order with name, town, payout and the earlier answer, one offer form each", () => {
    const html = render(data("no_partner_available"));
    const at = (text: string) => html.indexOf(text);
    expect(at("Pracownia Wola")).toBeGreaterThan(-1);
    expect(at("Pracownia Wola")).toBeLessThan(at("Kwiaciarnia Bielany"));
    expect(at("Kwiaciarnia Bielany")).toBeLessThan(at("Kwiaty Mokotów"));
    expect(html).toContain("declined earlier");
    expect(html).toContain("did not answer earlier");
    expect(html).toContain("129.00");
    expect(html.match(/name="partnerId"/gu)).toHaveLength(3);
    expect(html).toContain('value="11111111-1111-4111-8111-111111111111"');
    expect(html).toContain('name="expectedSeq" value="7"');
    expect(html).toContain('aria-label="Offer this order to Pracownia Wola"');
  });

  it("shows the grace end in the viewer's zone and the destination's, each named (T-13's render)", () => {
    const html = render(data("no_partner_available"));
    expect(html).toContain(
      "Cancelled automatically at 09:00 (London) unless rerouted",
    );
    expect(html).toContain(
      "10:00 in Warsaw (Europe/Warsaw), the delivery’s own time",
    );
  });

  it("says so, with the florists link, when nobody is eligible", () => {
    const html = render(data("no_partner_available", { candidates: [] }));
    expect(html).toContain("No florist is eligible");
    expect(html).not.toContain('name="partnerId"');
  });

  it("is absent outside no_partner_available, and for a role without orders.reroute", () => {
    for (const status of ["paid_unrouted", "routed", "accepted", "paid"]) {
      expect(render(data(status))).not.toContain("Reroute FO-8RTW-2KQM");
    }
    const finance = render(
      data("no_partner_available", { roles: ["finance"] }),
    );
    expect(finance).not.toContain('name="partnerId"');
    // TASK-361: the reason line of the "Not available" list.
    expect(finance).toContain("Reroute</b> · Needs the admin or ops role.");
    // ops may reroute (§13 Q2) but not cancel, and is told why.
    const ops = render(data("no_partner_available", { roles: ["ops"] }));
    expect(ops).toContain('name="partnerId"');
    expect(reasons(ops)).toEqual([]);
    expect(ops).toContain("Cancel the order</b> · Needs the admin role.");
  });

  it("re-opens with the refusal after PARTNER_NOT_ELIGIBLE", () => {
    const html = render(
      data("no_partner_available", {
        outcome: { action: "reroute", result: "PARTNER_NOT_ELIGIBLE" },
      }),
    );
    expect(html).toContain(
      "That florist can no longer take this order. Nothing was sent.",
    );
  });
});

describe("the cancel dialog (spec 020a AC-13 to AC-15)", () => {
  it("offers the three reasons from each state of E, with no amount field", () => {
    for (const status of [
      "authorised",
      "paid_unrouted",
      "routed",
      "manual_reroute",
      "no_partner_available",
    ]) {
      const html = render(data(status));
      expect(reasons(html), status).toEqual([
        "buyer_cancel",
        "no_partner",
        "other",
      ]);
      expect(html).not.toMatch(/name="amount/u);
      expect(html).toContain(
        "The buyer is refunded €58.00 in full, to the card or wallet they paid with.",
      );
    }
  });

  it("offers exactly buyer_cancel from accepted and paid, with the florist told to stop and the payout adjustment", () => {
    for (const status of ["accepted", "paid"]) {
      const html = render(
        data(status, {
          order: order(status, {
            assignments: [
              {
                assignmentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
                partnerId: "33333333-3333-4333-8333-333333333333",
                partnerCode: "pl-waw-mokotow",
                attempt: 1,
                offeredAt: "2026-11-04T20:05:00.000Z",
                answerBy: "2026-11-04T21:05:00.000Z",
                respondedAt: "2026-11-04T20:09:00.000Z",
                response: "accept",
                reason: null,
              },
            ],
          }),
        }),
      );
      expect(reasons(html), status).toEqual(["buyer_cancel"]);
      expect(html).toContain("pl-waw-mokotow is told to stop");
      expect(html).toContain(
        "A payout adjustment is recorded for pl-waw-mokotow.",
      );
      expect(html).toContain(
        "You cancelled this order. We have refunded €58.00.",
      );
    }
  });

  it("renders no cancel control on in_production and every later state", () => {
    for (const status of [
      "in_production",
      "awaiting_buyer",
      "out_for_delivery",
      "delivered",
      "photo_uploaded",
      "cancelled",
      "refunded_full",
      "closed",
    ]) {
      const html = render(data(status));
      expect(reasons(html), status).toEqual([]);
      expect(html, status).not.toContain("Cancel FO-8RTW-2KQM?");
    }
  });

  it("re-opens with the being-made message after ORDER_TRANSITION_ILLEGAL, and shows the done line", () => {
    expect(
      render(
        data("paid_unrouted", {
          outcome: { action: "cancel", result: "ORDER_TRANSITION_ILLEGAL" },
        }),
      ),
    ).toContain("so it can no longer be cancelled. Nothing was done.");
    const done = render(
      data("cancelled", {
        remainingMinor: 0n,
        cancelRefundMinor: 5_800n,
        outcome: { action: "cancel", result: "done" },
      }),
    );
    expect(done).toContain(
      "Order cancelled. A refund of €58.00 is on its way.",
    );
  });

  it("renders no control on a demo order, only its sentence", () => {
    const html = render(
      data("no_partner_available", {
        order: order("no_partner_available", { mode: "demo" }),
      }),
    );
    expect(html).toContain("Demo order: no actions");
    expect(html).not.toContain("<form");
  });
});
