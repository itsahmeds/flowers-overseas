/**
 * Spec 020a AC-3 (T-04, the render half; TASK-361): for every one of the 26 statuses in `live`,
 * one `demo` and one `test` order, and an `ops` viewer, the Actions card renders exactly the
 * controls spec 020a §5.2's availability table allows and, for every other control, one "Not
 * available" line with its reason. The expected set is transcribed below from §5.2's table and
 * the artboards' reason lines (`admin-order-actions-*`, "The action panel, by status group"),
 * never read from `ORDER_ACTION_AVAILABILITY`.
 *
 * Refund controls the table allows render as "Not available" with the provider line until the
 * refund dialog lands (TASK-361's escalation: the card provider's production wiring, spec 013
 * TASK-259 and TASK-256); the fixture says so per row.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { AdminOrderDetail } from "@/modules/orders";

import {
  OrderActionsPanel,
  type OrderActionsData,
} from "../../src/app/admin/(signed-in)/orders/[id]/actions-panel.tsx";

const ORDER_ID = "0b7e1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d";

function data(
  status: string,
  over: Partial<OrderActionsData> = {},
  mode: "live" | "test" | "demo" = "live",
): OrderActionsData {
  return {
    order: {
      orderId: ORDER_ID,
      reference: "FO-8RTW-2KQM",
      mode,
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
      events: [],
      assignments: [],
      payments: [],
    } as unknown as AdminOrderDetail,
    roles: ["admin"],
    viewerZone: "Europe/London",
    capturedMinor: 5_800n,
    remainingMinor: 5_800n,
    refundInFlight: false,
    cancelRefundMinor: null,
    candidates: [],
    grace: null,
    outcome: null,
    ...over,
  };
}

/** What the card offers: its buttons, then each "Not available" line as `Label · reason`. */
function controls(d: OrderActionsData): {
  buttons: string[];
  unavailable: string[];
} {
  const element = OrderActionsPanel({ data: d });
  const html = element === null ? "" : renderToStaticMarkup(element);
  const buttons = [
    ...html.matchAll(/id="order-action-(reroute|cancel)"/gu),
  ].map((match) => match[1] ?? "");
  const unavailable = [
    ...html.matchAll(/<li><b class="text-ink">([^<]+)<\/b> · ([^<]+)<\/li>/gu),
  ].map((match) => `${match[1] ?? ""} · ${match[2] ?? ""}`);
  return { buttons, unavailable };
}

const REROUTE = "Reroute · Only when no florist has taken the order.";
const CANCEL_ENDED = "Cancel the order · The order has ended.";
const CANCEL_MADE =
  "Cancel the order · The bouquet is being made or delivered. Refund instead.";
const FULL_PROVIDER =
  "Refund in full · Refunds from this page start once the card provider is connected.";
const PART_PROVIDER =
  "Refund in part · Refunds from this page start once the card provider is connected.";
const CANCEL_INSTEAD = [
  "Refund in full · Cancel instead: a cancel refunds in full.",
  "Refund in part · Cancel instead: a cancel refunds in full.",
];
const finished = (reason: string) => [
  REROUTE,
  CANCEL_ENDED,
  `Refund in full · ${reason}`,
  `Refund in part · ${reason}`,
];

/** Spec 020a §5.2, transcribed: [status, buttons, "Not available" lines] for a live order. */
type Row = readonly [string, readonly string[], readonly string[]];
const TABLE: readonly Row[] = [
  [
    "placed",
    [],
    [
      REROUTE,
      "Cancel the order · Only once the payment is secured.",
      "Refund in full · Only once the payment is secured.",
      "Refund in part · Only once the payment is secured.",
    ],
  ],
  ...(["payment_failed", "abandoned"] as const).map(
    (status) =>
      [
        status,
        [],
        [
          REROUTE,
          CANCEL_ENDED,
          FULL_PROVIDER,
          "Refund in part · Only a full refund, reason Other, for a payment taken on an abandoned order.",
        ],
      ] satisfies Row,
  ),
  ...(["authorised", "paid_unrouted", "routed", "manual_reroute"] as const).map(
    (status) =>
      [status, ["cancel"], [REROUTE, ...CANCEL_INSTEAD]] satisfies Row,
  ),
  ["no_partner_available", ["reroute", "cancel"], CANCEL_INSTEAD],
  ["accepted", ["cancel"], [REROUTE, ...CANCEL_INSTEAD]],
  ["paid", ["cancel"], [REROUTE, FULL_PROVIDER, PART_PROVIDER]],
  ...(
    [
      "in_production",
      "awaiting_buyer",
      "out_for_delivery",
      "delivery_failed",
      "redelivery_scheduled",
      "delivered",
      "photo_uploaded",
      "disputed",
      "resolved",
    ] as const
  ).map(
    (status) =>
      [
        status,
        [],
        [REROUTE, CANCEL_MADE, FULL_PROVIDER, PART_PROVIDER],
      ] satisfies Row,
  ),
  ...(["cancelled", "cancelled_refunded"] as const).map(
    (status) =>
      [
        status,
        [],
        [
          REROUTE,
          CANCEL_ENDED,
          "Retry in full · Refunds from this page start once the card provider is connected.",
          "Refund in part · A cancelled order is retried in full only.",
        ],
      ] satisfies Row,
  ),
  ["refunded_full", [], finished("Refunded in full already.")],
  ["closed", [], finished("The order is closed.")],
  ...(["chargeback_open", "chargeback_won", "chargeback_lost"] as const).map(
    (status) =>
      [
        status,
        [],
        finished("A chargeback decides the money now."),
      ] satisfies Row,
  ),
];

describe("the Actions card's control set (spec 020a AC-3)", () => {
  it("covers all 26 statuses", () => {
    expect(new Set(TABLE.map(([status]) => status)).size).toBe(26);
  });

  for (const [status, buttons, unavailable] of TABLE) {
    it(`live ${status}: exactly ${buttons.join(" and ") || "no button"}, every other control with its reason`, () => {
      expect(controls(data(status))).toEqual({
        buttons: [...buttons],
        unavailable: [...unavailable],
      });
    });
  }

  it("a demo order shows no control and no list, only its sentence", () => {
    for (const status of ["no_partner_available", "paid", "cancelled"]) {
      const element = OrderActionsPanel({ data: data(status, {}, "demo") });
      const html = element === null ? "" : renderToStaticMarkup(element);
      expect(html).toContain("Demo order: no actions");
      expect(controls(data(status, {}, "demo"))).toEqual({
        buttons: [],
        unavailable: [],
      });
    }
  });

  it("a test order shows every control the table allows, as live", () => {
    expect(controls(data("no_partner_available", {}, "test"))).toEqual({
      buttons: ["reroute", "cancel"],
      unavailable: CANCEL_INSTEAD,
    });
    expect(controls(data("paid", {}, "test"))).toEqual({
      buttons: ["cancel"],
      unavailable: [REROUTE, FULL_PROVIDER, PART_PROVIDER],
    });
  });

  it("ops: reroute stays, money controls say they need the admin role", () => {
    expect(controls(data("paid", { roles: ["ops"] }))).toEqual({
      buttons: [],
      unavailable: [
        REROUTE,
        "Cancel the order · Needs the admin role.",
        "Refund in full · Needs the admin role.",
        "Refund in part · Needs the admin role.",
      ],
    });
    expect(
      controls(data("no_partner_available", { roles: ["finance"] })),
    ).toEqual({
      buttons: [],
      unavailable: [
        "Reroute · Needs the admin or ops role.",
        "Cancel the order · Needs the admin role.",
        ...CANCEL_INSTEAD,
      ],
    });
  });

  it("the money conditions: nothing left, too little for a part, a refund in flight, no capture", () => {
    expect(
      controls(data("in_production", { remainingMinor: 0n })).unavailable,
    ).toEqual([
      REROUTE,
      CANCEL_MADE,
      "Refund in full · Nothing is left to refund.",
      "Refund in part · Too little is left for a part refund. Refund in full instead.",
    ]);
    expect(
      controls(data("in_production", { remainingMinor: 1n })).unavailable,
    ).toEqual([
      REROUTE,
      CANCEL_MADE,
      FULL_PROVIDER,
      "Refund in part · Too little is left for a part refund. Refund in full instead.",
    ]);
    expect(
      controls(data("cancelled", { refundInFlight: true })).unavailable[2],
    ).toBe("Retry in full · A refund is on its way. Wait until it settles.");
    expect(
      controls(data("abandoned", { capturedMinor: 0n, remainingMinor: 0n }))
        .unavailable[2],
    ).toBe(
      "Refund in full · No payment was taken, so there is nothing to refund.",
    );
  });
});
