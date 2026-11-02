/**
 * Spec 020a §5.2 "Availability" as data (AC-3's data half, AC-14, AC-15, AC-21's control half;
 * TASK-357). The panel render over all 26 statuses (T-04) is TASK-361's; this file pins the table
 * the panel and the server actions both read.
 *
 * `TABLE` is transcribed from spec 020a §5.2 by hand, one status per line, **not** derived from
 * `ORDER_ACTION_AVAILABILITY`: a cell changed in the module turns exactly the cases of that status
 * red (mutation: add `paid` to the reroute row, case red).
 */
import { describe, expect, it } from "vitest";

import {
  availableActions,
  ORDER_ACTION_AVAILABILITY,
  orderActionStatuses,
  type OrderActionStatus,
  type OrderActionSubject,
} from "../../src/modules/admin/order-actions/availability.ts";

type Full = "no" | "chosen" | "anomaly" | "cancelled_retry";
type Row = readonly [
  reroute: boolean,
  cancel: readonly string[],
  full: Full,
  partial: boolean,
];

const E = ["buyer_cancel", "no_partner", "other"];
const NO: Row = [false, [], "no", false];
const F: Row = [false, [], "chosen", true];

/** Spec 020a §5.2, the availability table, by hand. */
const TABLE: Record<string, Row> = {
  placed: NO,
  payment_failed: [false, [], "anomaly", false],
  abandoned: [false, [], "anomaly", false],
  authorised: [false, E, "no", false],
  paid_unrouted: [false, E, "no", false],
  routed: [false, E, "no", false],
  manual_reroute: [false, E, "no", false],
  no_partner_available: [true, E, "no", false],
  accepted: [false, ["buyer_cancel"], "no", false],
  paid: [false, ["buyer_cancel"], "chosen", true],
  in_production: F,
  awaiting_buyer: F,
  out_for_delivery: F,
  delivery_failed: F,
  redelivery_scheduled: F,
  delivered: F,
  photo_uploaded: F,
  disputed: F,
  resolved: F,
  cancelled: [false, [], "cancelled_retry", false],
  cancelled_refunded: [false, [], "cancelled_retry", false],
  refunded_full: NO,
  closed: NO,
  chargeback_open: NO,
  chargeback_won: NO,
  chargeback_lost: NO,
};

const ADMIN = { roles: ["admin"] };
const OPS = { roles: ["ops"] };
const FINANCE = { roles: ["finance"] };

function subject(
  status: OrderActionStatus,
  overrides: Partial<OrderActionSubject> = {},
): OrderActionSubject {
  return {
    status,
    mode: "live",
    capturedMinor: 5800n,
    remainingMinor: 5800n,
    refundInFlight: false,
    ...overrides,
  };
}

describe("ORDER_ACTION_AVAILABILITY (spec 020a §5.2)", () => {
  it("has one row for each of A6.4's 26 statuses, and the fixture has the same 26", () => {
    expect(orderActionStatuses).toHaveLength(26);
    expect(Object.keys(ORDER_ACTION_AVAILABILITY).sort()).toEqual(
      [...orderActionStatuses].sort(),
    );
    expect(Object.keys(TABLE).sort()).toEqual([...orderActionStatuses].sort());
  });

  it.each(Object.entries(TABLE))(
    "%s: the admin sees exactly the table's controls",
    (status, [reroute, cancel, full, partial]) => {
      const actions = availableActions(
        subject(status as OrderActionStatus),
        ADMIN,
      );
      expect(actions.reroute.available).toBe(reroute);
      expect(actions.cancel.available ? actions.cancel.reasons : []).toEqual(
        cancel,
      );
      const fullSource = actions.refundFull.available
        ? actions.refundFull.reasonSource
        : "no";
      expect(fullSource).toBe(
        {
          no: "no",
          chosen: "chosen",
          anomaly: "other",
          cancelled_retry: "cancellation",
        }[full],
      );
      expect(actions.refundPartial.available).toBe(partial);
      // A control the table forbids says so as its cause.
      for (const control of [
        actions.reroute,
        actions.cancel,
        actions.refundFull,
        actions.refundPartial,
      ]) {
        if (!control.available) expect(control.cause).toBe("status");
      }
    },
  );
});

describe("availableActions: mode, permission and money (spec 020a §5.2)", () => {
  it("shows a demo order no control, each with the demo cause", () => {
    const actions = availableActions(
      subject("no_partner_available", { mode: "demo" }),
      ADMIN,
    );
    for (const control of Object.values(actions)) {
      expect(control).toEqual({ available: false, cause: "demo" });
    }
  });

  it("shows a test order what the table allows", () => {
    expect(
      availableActions(subject("no_partner_available", { mode: "test" }), ADMIN)
        .reroute.available,
    ).toBe(true);
  });

  it("lets ops reroute but not cancel or refund (AC-1, §13 Q2)", () => {
    const npa = availableActions(subject("no_partner_available"), OPS);
    expect(npa.reroute.available).toBe(true);
    expect(npa.cancel).toEqual({ available: false, cause: "permission" });
    const paid = availableActions(subject("paid"), OPS);
    expect(paid.refundFull).toEqual({ available: false, cause: "permission" });
    expect(paid.refundPartial).toEqual({
      available: false,
      cause: "permission",
    });
  });

  it("gives finance no action", () => {
    const actions = availableActions(subject("no_partner_available"), FINANCE);
    expect(actions.reroute).toEqual({ available: false, cause: "permission" });
    expect(actions.cancel).toEqual({ available: false, cause: "permission" });
  });

  it("offers no refund with nothing remaining, and no partial below 2 minor units", () => {
    const none = availableActions(
      subject("delivered", { remainingMinor: 0n }),
      ADMIN,
    );
    expect(none.refundFull).toEqual({
      available: false,
      cause: "nothing_remaining",
    });
    expect(none.refundPartial).toEqual({
      available: false,
      cause: "remaining_below_two",
    });
    const one = availableActions(
      subject("delivered", { remainingMinor: 1n }),
      ADMIN,
    );
    expect(one.refundFull.available).toBe(true);
    expect(one.refundPartial).toEqual({
      available: false,
      cause: "remaining_below_two",
    });
    const two = availableActions(
      subject("delivered", { remainingMinor: 2n }),
      ADMIN,
    );
    expect(two.refundPartial.available).toBe(true);
  });

  it("offers the anomaly refund only with a captured payment (AC-21)", () => {
    const uncaptured = availableActions(
      subject("abandoned", { capturedMinor: 0n, remainingMinor: 0n }),
      ADMIN,
    );
    expect(uncaptured.refundFull).toEqual({
      available: false,
      cause: "no_capture",
    });
    const captured = availableActions(subject("abandoned"), ADMIN);
    expect(captured.refundFull).toEqual({
      available: true,
      reasonSource: "other",
    });
    expect(captured.refundPartial).toEqual({
      available: false,
      cause: "status",
    });
  });

  it("waits to retry a cancelled order's refund while one is requested or pending (AC-17)", () => {
    expect(
      availableActions(subject("cancelled", { refundInFlight: true }), ADMIN)
        .refundFull,
    ).toEqual({ available: false, cause: "refund_in_flight" });
    expect(availableActions(subject("cancelled"), ADMIN).refundFull).toEqual({
      available: true,
      reasonSource: "cancellation",
    });
    // In set F an in-flight refund does not hide "Refund in full": the remainder already
    // excludes it.
    expect(
      availableActions(subject("delivered", { refundInFlight: true }), ADMIN)
        .refundFull.available,
    ).toBe(true);
  });
});
