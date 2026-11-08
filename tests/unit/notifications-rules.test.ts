/**
 * Spec 016 T-18 and the unit halves of T-14, T-36 and T-39 (AC-18, AC-14, AC-36, AC-39;
 * TASK-331): `notificationsFor` over every (event, from status, mode) of the order machine
 * (`tests/fixtures/order-machine.ts`, all 80 rows), every status-preserving event and the three
 * jobs, against the §5.2 table **spelled out here**, not derived from the rules under test.
 *
 * Also: the `notifications` outbox routes name exactly the events and modes that have a row, with
 * the buyer audience only on a `live` event that has a buyer row (spec 010 AC-24's filter keeps
 * the rest off people).
 */
import { describe, expect, it } from "vitest";

import {
  NOTIFICATION_RULES,
  notificationsFor,
  type NotificationTrigger,
} from "@/modules/notifications";
import {
  notificationOutboxTargets,
  ORDER_EVENT_TYPES,
  ORDER_MODES,
  outboxTargets,
  type OrderEventType,
} from "@/modules/orders";

import {
  STATES,
  STATUS_PRESERVING_EVENTS,
  TRANSITIONS,
} from "../fixtures/order-machine.ts";

const AFTER_DELIVERY = new Set([
  "delivered",
  "photo_uploaded",
  "closed",
  "disputed",
  "resolved",
]);

const BUYER_TEMPLATES = new Set([
  "order-received",
  "being-made",
  "out-for-delivery",
  "delivered-photo",
  "cancelled",
  "refund",
  "credit-note",
]);

/** Founder rows that fire for a `live` order only (spec 030a: a test order gets no payout). */
const LIVE_ONLY_OPS = new Set([
  "payout-prepaid-ready",
  "payouts-ready",
  "payout-line-missing",
  // spec 030b C1 and C2 (TASK-442): the contract review emails.
  "contract-review-due",
  "contract-review-passed",
]);

/** The §5.2 table for a `live` order, by hand: template keys, sorted. */
function expectedLive(trigger: string, from: string | null): string[] {
  const stop = (f: string | null) =>
    f !== null && !AFTER_DELIVERY.has(f)
      ? ["offer-withdrawn", "whatsapp-copy"]
      : [];
  const rows: string[] = (() => {
    switch (trigger) {
      case "order.captured":
        if (from === "placed") return ["order-received"];
        if (from === "accepted") return ["order-confirmed"];
        return [];
      case "order.in_production":
        return ["being-made"];
      case "order.out_for_delivery":
        return ["out-for-delivery"];
      case "order.photo_uploaded":
        return ["delivered-photo"];
      case "order.cancelled":
        return ["cancelled", ...stop(from)];
      case "order.refunded_partial":
        return ["refund"];
      case "order.refunded_full":
        return [...(from === "cancelled" ? [] : ["refund"]), ...stop(from)];
      case "order.chargeback_opened":
      case "order.cancelled_refunded":
        return stop(from);
      case "assignment.offered":
        return ["offer", "whatsapp-copy"];
      case "assignment.timed_out":
        return ["offer-withdrawn", "whatsapp-copy"];
      case "order.no_partner_available":
        return ["alert-no-partner"];
      case "assignment.remind":
        return ["offer-reminder"];
      case "assignment.photo_remind":
        return ["photo-reminder"];
      case "invoice.email":
        return ["credit-note"];
      // spec 030a F1 (TASK-363): live only, to the founder.
      case "payouts.prepaid_ready":
        return ["payout-prepaid-ready"];
      // spec 030a F2 and F3 (TASK-364): live only, to the founder.
      case "payouts.close":
        return ["payouts-ready"];
      case "payouts.watch":
        return ["payout-line-missing"];
      default:
        return [];
    }
  })();
  return rows.sort();
}

function expected(
  trigger: string,
  from: string | null,
  mode: string,
): string[] {
  if (mode === "demo") return [];
  const live = expectedLive(trigger, from);
  return mode === "live"
    ? live
    : live.filter(
        (template) =>
          !BUYER_TEMPLATES.has(template) && !LIVE_ONLY_OPS.has(template),
      );
}

const templates = (
  trigger: NotificationTrigger,
  from: string | null,
  mode: (typeof ORDER_MODES)[number],
) =>
  notificationsFor(trigger, from, mode)
    .map((rule) => rule.template)
    .sort();

/** Every (trigger, from) the machine can produce, the jobs, and a few the table must ignore. */
const CASES: readonly (readonly [NotificationTrigger, string | null])[] = [
  ...TRANSITIONS.map((row) => [row.event as OrderEventType, row.from] as const),
  ...STATUS_PRESERVING_EVENTS.flatMap((event) =>
    STATES.map((state) => [event as OrderEventType, state.key] as const),
  ),
  ["assignment.remind", "routed"],
  ["assignment.photo_remind", "delivered"],
  ["invoice.email", null],
  ["payouts.prepaid_ready", null],
  ["payouts.close", null],
  ["payouts.watch", null],
  ["order.placed", null],
];

describe("notificationsFor (T-18, AC-18)", () => {
  it("returns exactly the §5.2 rows for every (trigger, from, mode) of the machine", () => {
    expect(TRANSITIONS.length).toBe(80);
    for (const [trigger, from] of CASES) {
      for (const mode of ORDER_MODES) {
        expect(
          templates(trigger, from, mode),
          `${trigger} ${String(from)} ${mode}`,
        ).toEqual(expected(trigger, from, mode));
      }
    }
  });

  it("selects B1 from placed and V3 from accepted, nothing else, for order.captured; nothing for order.authorised", () => {
    expect(templates("order.captured", "placed", "live")).toEqual([
      "order-received",
    ]);
    expect(templates("order.captured", "accepted", "live")).toEqual([
      "order-confirmed",
    ]);
    expect(templates("order.captured", "accepted", "test")).toEqual([
      "order-confirmed",
    ]);
    expect(templates("order.captured", "placed", "test")).toEqual([]);
    for (const mode of ORDER_MODES) {
      expect(templates("order.authorised", "placed", mode)).toEqual([]);
    }
  });

  it("gives each row its audience: buyer for B, florist for V and FS, ops for A1, W and F1 to F3; F1 to F3 and FS live only", () => {
    for (const rule of NOTIFICATION_RULES) {
      const expectedAudience = rule.code.startsWith("B")
        ? "buyer"
        : rule.code.startsWith("V") || rule.code === "FS"
          ? "florist"
          : "ops";
      expect(rule.audience, rule.code).toBe(expectedAudience);
      expect(rule.modes, rule.code).toEqual(
        expectedAudience === "buyer" ||
          LIVE_ONLY_OPS.has(rule.template) ||
          rule.code === "FS"
          ? ["live"]
          : ["test", "live"],
      );
    }
    // Spec 030a §5.2 (TASK-365): the payout statement, about one payout, to the florist.
    expect(
      notificationsFor("payouts.statement_email", null, "live").map(
        (rule) => [rule.code, rule.template, rule.audience] as const,
      ),
    ).toEqual([["FS", "florist-payout-statement", "florist"]]);
    expect(notificationsFor("payouts.statement_email", null, "test")).toEqual(
      [],
    );
    // Spec 030b §14.5 (TASK-442): the two contract review emails, to the founder, about no order.
    expect(
      notificationsFor("partners.contract_reminders", null, "live").map(
        (rule) => [rule.code, rule.template, rule.audience] as const,
      ),
    ).toEqual([
      ["C1", "contract-review-due", "ops"],
      ["C2", "contract-review-passed", "ops"],
    ]);
    expect(NOTIFICATION_RULES.some((rule) => rule.code === "B7")).toBe(false);
  });
});

describe("B2 on the delivery morning only (T-14 unit half, AC-14)", () => {
  it("sends B2 on order.in_production and never on order.captured from accepted", () => {
    expect(templates("order.in_production", "paid", "live")).toEqual([
      "being-made",
    ]);
    expect(templates("order.in_production", "accepted", "live")).toEqual([
      "being-made",
    ]);
    for (const mode of ORDER_MODES) {
      expect(
        notificationsFor("order.captured", "accepted", mode).filter(
          (rule) => rule.audience === "buyer",
        ),
      ).toEqual([]);
    }
  });
});

describe("no buyer row for routing (T-39 unit half, AC-39)", () => {
  const ROUTING: readonly (readonly [OrderEventType, string | null])[] = [
    ["order.routed", "paid_unrouted"],
    ["order.routed", "manual_reroute"],
    ["assignment.offered", "routed"],
    ["assignment.accepted", "routed"],
    ["assignment.declined", "routed"],
    ["assignment.timed_out", "routed"],
    ["order.no_partner_available", "routed"],
    ["order.no_partner_available", "paid_unrouted"],
    ["order.manual_reroute", "no_partner_available"],
    ["order.captured", "accepted"],
  ];

  it("returns no buyer row for any routing event, in any mode", () => {
    for (const [event, from] of ROUTING) {
      for (const mode of ORDER_MODES) {
        expect(
          notificationsFor(event, from, mode).filter(
            (rule) => rule.audience === "buyer",
          ),
          `${event} ${String(from)} ${mode}`,
        ).toEqual([]);
      }
    }
  });
});

describe("the W rule (T-36 unit half, AC-36)", () => {
  it("puts a W row on V1 and on every V4 trigger, and on nothing else", () => {
    const withW = new Set<string>();
    for (const rule of NOTIFICATION_RULES) {
      if (rule.template === "whatsapp-copy") {
        withW.add(`${rule.trigger}`);
        expect(rule.whatsappCopyOf).toBeDefined();
      } else {
        expect(rule.whatsappCopyOf, rule.code).toBeUndefined();
      }
    }
    const v4Triggers = NOTIFICATION_RULES.filter(
      (rule) => rule.template === "offer-withdrawn",
    ).map((rule) => rule.trigger);
    expect([...withW].sort()).toEqual(
      ["assignment.offered", ...v4Triggers].sort(),
    );
    for (const mode of ["test", "live"] as const) {
      expect(templates("assignment.remind", "routed", mode)).toEqual([
        "offer-reminder",
      ]);
      expect(templates("assignment.photo_remind", "delivered", mode)).toEqual([
        "photo-reminder",
      ]);
    }
    const offered = notificationsFor("assignment.offered", "routed", "live");
    expect(
      offered.find((rule) => rule.template === "whatsapp-copy")?.whatsappCopyOf,
    ).toBe("offer");
    const stopped = notificationsFor("assignment.timed_out", "routed", "live");
    expect(
      stopped.find((rule) => rule.template === "whatsapp-copy")?.whatsappCopyOf,
    ).toBe("offer-withdrawn");
  });
});

describe("the notifications outbox routes match the table", () => {
  const froms = (event: OrderEventType): (string | null)[] => {
    const transitions = TRANSITIONS.filter((row) => row.event === event).map(
      (row) => row.from,
    );
    return transitions.length > 0
      ? transitions
      : STATES.map((state) => state.key);
  };

  it("routes an event in a mode exactly when some from-status has a row, buyer audience only for a live buyer row", () => {
    for (const event of ORDER_EVENT_TYPES) {
      for (const mode of ORDER_MODES) {
        const rows = froms(event).flatMap((from) =>
          notificationsFor(event, from, mode),
        );
        const targets = notificationOutboxTargets(event, mode);
        expect(targets.length > 0, `${event} ${mode}`).toBe(rows.length > 0);
        if (targets.length === 0) continue;
        expect(targets.map((target) => target.name)).toEqual(["notifications"]);
        expect(targets[0]?.audience, `${event} ${mode}`).toBe(
          rows.some((rule) => rule.audience === "buyer") ? "buyer" : "partner",
        );
        expect(
          outboxTargets(event, mode).filter(
            (target) => target.name === "notifications",
          ),
          `${event} ${mode}`,
        ).toEqual(targets);
      }
    }
  });
});
