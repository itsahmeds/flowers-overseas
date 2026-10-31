/**
 * T-04 and T-35 — the offer window and the grace end, in the destination's zone (spec 016 §5.2
 * `offerWindow`, `graceEnd`, `expectedFirstOfferAt`; AC-4, AC-35; TASK-327), and spec 009's
 * `instantAt`, the wall-clock-to-instant helper both stand on.
 *
 * Every expectation is an absolute UTC instant worked out by hand from the zone's offset on that
 * day (Warsaw CEST +2 / CET +1, London BST +1 / GMT 0), so a rule computed by adding hours, or in
 * the process zone, lands an hour off on the DST nights of 25 October 2026 and 28 March 2027.
 * The two destinations are fixtures with the same 14:00 cutoff: countries are data.
 */
import { describe, expect, it } from "vitest";

import { instantAt } from "@/modules/geo";
import {
  expectedFirstOfferAt,
  graceEnd,
  offerWindow,
  type OfferWindow,
  routingDeadline,
  type RoutingDestination,
} from "@/modules/orders/routing";

const WARSAW: RoutingDestination = {
  ianaZone: "Europe/Warsaw",
  sameDayCutoffLocal: "14:00",
};
const LONDON: RoutingDestination = {
  ianaZone: "Europe/London",
  sameDayCutoffLocal: "14:00",
};

const at = (iso: string): Date => new Date(iso);

function offer(window: OfferWindow): {
  offerAt: string;
  slaEndsAt: string;
  deferred: boolean;
} {
  if (window.kind !== "offer") {
    throw new Error(`expected an offer, got ${window.kind}`);
  }
  return {
    offerAt: window.offerAt.toISOString(),
    slaEndsAt: window.slaEndsAt.toISOString(),
    deferred: window.deferred,
  };
}

describe("instantAt (spec 009 zone helpers)", () => {
  it.each([
    [
      "an ordinary summer day",
      "2026-10-16",
      10 * 60,
      "Europe/Warsaw",
      "2026-10-16T08:00:00.000Z",
    ],
    [
      "an ordinary winter day",
      "2026-11-16",
      10 * 60,
      "Europe/Warsaw",
      "2026-11-16T09:00:00.000Z",
    ],
    [
      "07:30 on the fall-back Sunday",
      "2026-10-25",
      7 * 60 + 30,
      "Europe/Warsaw",
      "2026-10-25T06:30:00.000Z",
    ],
    [
      "07:30 on the spring-forward Sunday",
      "2027-03-28",
      7 * 60 + 30,
      "Europe/Warsaw",
      "2027-03-28T05:30:00.000Z",
    ],
    [
      "the repeated 02:30 takes the standard-time one",
      "2026-10-25",
      2 * 60 + 30,
      "Europe/Warsaw",
      "2026-10-25T01:30:00.000Z",
    ],
    [
      "the missing 02:30 is pushed forward by the gap",
      "2027-03-28",
      2 * 60 + 30,
      "Europe/Warsaw",
      "2027-03-28T01:30:00.000Z",
    ],
    [
      "London's missing 01:30",
      "2027-03-28",
      60 + 30,
      "Europe/London",
      "2027-03-28T01:30:00.000Z",
    ],
    [
      "a minute past midnight rolls onto the next day",
      "2026-10-16",
      24 * 60 + 60,
      "Europe/Warsaw",
      "2026-10-16T23:00:00.000Z",
    ],
  ])("%s", (_name, date, minute, zone, expected) => {
    expect(instantAt(date, minute, zone).toISOString()).toBe(expected);
  });

  it("refuses a negative or fractional minute", () => {
    expect(() => instantAt("2026-10-16", -1, "Europe/Warsaw")).toThrow(
      RangeError,
    );
    expect(() => instantAt("2026-10-16", 1.5, "Europe/Warsaw")).toThrow(
      RangeError,
    );
  });
});

describe("routingDeadline", () => {
  it("is the delivery date's cutoff plus 2 hours, local, on both sides of a DST change", () => {
    expect(routingDeadline("2026-10-16", WARSAW).toISOString()).toBe(
      "2026-10-16T14:00:00.000Z",
    );
    expect(routingDeadline("2026-10-26", WARSAW).toISOString()).toBe(
      "2026-10-26T15:00:00.000Z",
    );
    expect(routingDeadline("2027-03-28", LONDON).toISOString()).toBe(
      "2027-03-28T15:00:00.000Z",
    );
  });
});

describe("offerWindow (T-04, AC-4)", () => {
  // Warsaw on Friday 16 October 2026 is CEST, UTC+2.
  it.each([
    // [name, now, delivery date, offerAt, slaEndsAt, deferred]
    [
      "same-day order secured at 06:00: night rule wins, 07:30 / 08:00",
      "2026-10-16T04:00:00Z",
      "2026-10-16",
      "2026-10-16T05:30:00.000Z",
      "2026-10-16T06:00:00.000Z",
      true,
    ],
    [
      "06:00 for a later day: 07:30 / 09:00",
      "2026-10-16T04:00:00Z",
      "2026-10-17",
      "2026-10-16T05:30:00.000Z",
      "2026-10-16T07:00:00.000Z",
      true,
    ],
    [
      "07:29:59 is still night",
      "2026-10-16T05:29:59Z",
      "2026-10-17",
      "2026-10-16T05:30:00.000Z",
      "2026-10-16T07:00:00.000Z",
      true,
    ],
    [
      "07:30:00 is offered at once, SLA 09:00",
      "2026-10-16T05:30:00Z",
      "2026-10-17",
      "2026-10-16T05:30:00.000Z",
      "2026-10-16T07:00:00.000Z",
      false,
    ],
    [
      "07:30:01 is offered at once, SLA 09:00",
      "2026-10-16T05:30:01Z",
      "2026-10-17",
      "2026-10-16T05:30:01.000Z",
      "2026-10-16T07:00:00.000Z",
      false,
    ],
    [
      "07:59:59 same-day: SLA 08:00",
      "2026-10-16T05:59:59Z",
      "2026-10-16",
      "2026-10-16T05:59:59.000Z",
      "2026-10-16T06:00:00.000Z",
      false,
    ],
    [
      "08:00:00 same-day: 30 minutes",
      "2026-10-16T06:00:00Z",
      "2026-10-16",
      "2026-10-16T06:00:00.000Z",
      "2026-10-16T06:30:00.000Z",
      false,
    ],
    [
      "08:00:01 same-day: 30 minutes",
      "2026-10-16T06:00:01Z",
      "2026-10-16",
      "2026-10-16T06:00:01.000Z",
      "2026-10-16T06:30:01.000Z",
      false,
    ],
    [
      "10:00 same-day: 30 minutes",
      "2026-10-16T08:00:00Z",
      "2026-10-16",
      "2026-10-16T08:00:00.000Z",
      "2026-10-16T08:30:00.000Z",
      false,
    ],
    [
      "10:00 for tomorrow: 60 minutes",
      "2026-10-16T08:00:00Z",
      "2026-10-17",
      "2026-10-16T08:00:00.000Z",
      "2026-10-16T09:00:00.000Z",
      false,
    ],
    [
      "19:59:59 for tomorrow: 60 minutes",
      "2026-10-16T17:59:59Z",
      "2026-10-17",
      "2026-10-16T17:59:59.000Z",
      "2026-10-16T18:59:59.000Z",
      false,
    ],
    [
      "20:00:00 for tomorrow: offered 07:30 on its own day, so same-day, 08:00",
      "2026-10-16T18:00:00Z",
      "2026-10-17",
      "2026-10-17T05:30:00.000Z",
      "2026-10-17T06:00:00.000Z",
      true,
    ],
    [
      "20:00:01 for the day after: 07:30 / 09:00",
      "2026-10-16T18:00:01Z",
      "2026-10-18",
      "2026-10-17T05:30:00.000Z",
      "2026-10-17T07:00:00.000Z",
      true,
    ],
    [
      "15:45 same-day: the SLA stops at the 16:00 deadline",
      "2026-10-16T13:45:00Z",
      "2026-10-16",
      "2026-10-16T13:45:00.000Z",
      "2026-10-16T14:00:00.000Z",
      false,
    ],
    [
      "15:59:59 same-day: one second to the deadline",
      "2026-10-16T13:59:59Z",
      "2026-10-16",
      "2026-10-16T13:59:59.000Z",
      "2026-10-16T14:00:00.000Z",
      false,
    ],
  ])("Warsaw: %s", (_name, now, date, offerAt, slaEndsAt, deferred) => {
    expect(offer(offerWindow(at(now), date, WARSAW))).toEqual({
      offerAt,
      slaEndsAt,
      deferred,
    });
  });

  it.each([
    // 25 Oct 2026: CEST until 01:00Z, then CET (UTC+1). London: BST until 01:00Z, then GMT.
    [
      "Warsaw, 23:00 CEST on 24 Oct for 26 Oct: 07:30 CET",
      WARSAW,
      "2026-10-24T21:00:00Z",
      "2026-10-26",
      "2026-10-25T06:30:00.000Z",
      "2026-10-25T08:00:00.000Z",
    ],
    [
      "Warsaw, the first 02:30 (CEST) on 25 Oct",
      WARSAW,
      "2026-10-25T00:30:00Z",
      "2026-10-26",
      "2026-10-25T06:30:00.000Z",
      "2026-10-25T08:00:00.000Z",
    ],
    [
      "Warsaw, the second 02:30 (CET) on 25 Oct",
      WARSAW,
      "2026-10-25T01:30:00Z",
      "2026-10-26",
      "2026-10-25T06:30:00.000Z",
      "2026-10-25T08:00:00.000Z",
    ],
    [
      "London, 22:00 BST on 24 Oct for 26 Oct: 07:30 GMT",
      LONDON,
      "2026-10-24T21:00:00Z",
      "2026-10-26",
      "2026-10-25T07:30:00.000Z",
      "2026-10-25T09:00:00.000Z",
    ],
    [
      "London, 01:30 (GMT, the second) on 25 Oct, due that day",
      LONDON,
      "2026-10-25T01:30:00Z",
      "2026-10-25",
      "2026-10-25T07:30:00.000Z",
      "2026-10-25T08:00:00.000Z",
    ],
    // 28 Mar 2027: CET until 01:00Z, then CEST. London: GMT until 01:00Z, then BST.
    [
      "Warsaw, 22:00 CET on 27 Mar, due 28 Mar: 07:30 / 08:00 CEST",
      WARSAW,
      "2027-03-27T21:00:00Z",
      "2027-03-28",
      "2027-03-28T05:30:00.000Z",
      "2027-03-28T06:00:00.000Z",
    ],
    [
      "Warsaw, 03:30 CEST on 28 Mar for 29 Mar",
      WARSAW,
      "2027-03-28T01:30:00Z",
      "2027-03-29",
      "2027-03-28T05:30:00.000Z",
      "2027-03-28T07:00:00.000Z",
    ],
    [
      "London, 00:30 GMT on 28 Mar for 29 Mar: 07:30 / 09:00 BST",
      LONDON,
      "2027-03-28T00:30:00Z",
      "2027-03-29",
      "2027-03-28T06:30:00.000Z",
      "2027-03-28T08:00:00.000Z",
    ],
    [
      "London, 21:00 GMT on 27 Mar, due 28 Mar",
      LONDON,
      "2027-03-27T21:00:00Z",
      "2027-03-28",
      "2027-03-28T06:30:00.000Z",
      "2027-03-28T07:00:00.000Z",
    ],
  ])("DST night: %s", (_name, destination, now, date, offerAt, slaEndsAt) => {
    expect(offer(offerWindow(at(now), date, destination))).toEqual({
      offerAt,
      slaEndsAt,
      deferred: true,
    });
  });

  it("never returns an SLA end after the routing deadline", () => {
    const instants: Date[] = [];
    for (let minute = 0; minute < 24 * 60; minute += 7) {
      instants.push(new Date(Date.UTC(2026, 9, 24, 22, minute)));
      instants.push(new Date(Date.UTC(2027, 2, 27, 22, minute)));
    }
    let offers = 0;
    for (const now of instants) {
      for (const destination of [WARSAW, LONDON]) {
        for (const date of [
          "2026-10-25",
          "2026-10-26",
          "2027-03-28",
          "2027-03-29",
        ]) {
          const window = offerWindow(now, date, destination);
          const deadline = routingDeadline(date, destination).getTime();
          if (window.kind === "offer") {
            offers += 1;
            expect(window.slaEndsAt.getTime()).toBeLessThanOrEqual(deadline);
            expect(window.slaEndsAt.getTime()).toBeGreaterThan(
              window.offerAt.getTime(),
            );
            expect(window.offerAt.getTime()).toBeGreaterThanOrEqual(
              now.getTime(),
            );
          } else {
            expect(window.deadline.getTime()).toBe(deadline);
          }
        }
      }
    }
    expect(offers).toBeGreaterThan(100);
  });

  it("has no window at or after the deadline, nor for a night that ends past it", () => {
    expect(
      offerWindow(at("2026-10-16T14:00:00Z"), "2026-10-16", WARSAW),
    ).toEqual({
      kind: "deadline_passed",
      deadline: at("2026-10-16T14:00:00Z"),
    });
    expect(
      offerWindow(at("2026-10-16T19:00:00Z"), "2026-10-16", WARSAW).kind,
    ).toBe("deadline_passed");
  });
});

describe("expectedFirstOfferAt", () => {
  it("is the night-deferred offer time, not the payment time", () => {
    expect(
      expectedFirstOfferAt({
        securedAt: at("2026-10-16T19:00:00Z"),
        deliveryDate: "2026-10-18",
        destination: WARSAW,
      }).toISOString(),
    ).toBe("2026-10-17T05:30:00.000Z");
  });

  it("is the payment time in daytime, and for an order already past its deadline", () => {
    expect(
      expectedFirstOfferAt({
        securedAt: at("2026-10-16T08:00:00Z"),
        deliveryDate: "2026-10-17",
        destination: WARSAW,
      }).toISOString(),
    ).toBe("2026-10-16T08:00:00.000Z");
    expect(
      expectedFirstOfferAt({
        securedAt: at("2026-10-16T19:00:00Z"),
        deliveryDate: "2026-10-16",
        destination: WARSAW,
      }).toISOString(),
    ).toBe("2026-10-16T19:00:00.000Z");
  });
});

describe("graceEnd (T-35, AC-35)", () => {
  it.each([
    // [name, destination, exhaustedAt, delivery date, expected]
    [
      "due today at 13:00 CEST: plus 2 hours",
      WARSAW,
      "2026-10-16T11:00:00Z",
      "2026-10-16",
      "2026-10-16T13:00:00.000Z",
    ],
    [
      "due today at 14:00 CEST: plus 2 hours, exactly the deadline",
      WARSAW,
      "2026-10-16T12:00:00Z",
      "2026-10-16",
      "2026-10-16T14:00:00.000Z",
    ],
    [
      "due today at 15:00 CEST: 2 hours would pass the deadline, so the deadline",
      WARSAW,
      "2026-10-16T13:00:00Z",
      "2026-10-16",
      "2026-10-16T14:00:00.000Z",
    ],
    [
      "not due today, 21:00: 10:00 the next morning",
      WARSAW,
      "2026-10-16T19:00:00Z",
      "2026-10-17",
      "2026-10-17T08:00:00.000Z",
    ],
    [
      "not due today, 06:00: 10:00 the same morning",
      WARSAW,
      "2026-10-16T04:00:00Z",
      "2026-10-17",
      "2026-10-16T08:00:00.000Z",
    ],
    [
      "not due today, 08:00:00: exactly 2 hours, 10:00 the same morning",
      WARSAW,
      "2026-10-16T06:00:00Z",
      "2026-10-17",
      "2026-10-16T08:00:00.000Z",
    ],
    [
      "not due today, 08:00:01: 10:00 the next morning",
      WARSAW,
      "2026-10-16T06:00:01Z",
      "2026-10-17",
      "2026-10-17T08:00:00.000Z",
    ],
    // DST nights: 10:00 the next morning is in the other offset.
    [
      "Warsaw 21:00 CEST on 24 Oct 2026: 10:00 CET",
      WARSAW,
      "2026-10-24T19:00:00Z",
      "2026-10-26",
      "2026-10-25T09:00:00.000Z",
    ],
    [
      "Warsaw 21:00 CET on 27 Mar 2027: 10:00 CEST",
      WARSAW,
      "2027-03-27T20:00:00Z",
      "2027-03-29",
      "2027-03-28T08:00:00.000Z",
    ],
    [
      "London 21:00 BST on 24 Oct 2026: 10:00 GMT",
      LONDON,
      "2026-10-24T20:00:00Z",
      "2026-10-26",
      "2026-10-25T10:00:00.000Z",
    ],
    [
      "London 21:00 GMT on 27 Mar 2027: 10:00 BST",
      LONDON,
      "2027-03-27T21:00:00Z",
      "2027-03-29",
      "2027-03-28T09:00:00.000Z",
    ],
    [
      "Warsaw, due today at the first 02:30 of 25 Oct: 2 real hours, 03:30 CET",
      WARSAW,
      "2026-10-25T00:30:00Z",
      "2026-10-25",
      "2026-10-25T02:30:00.000Z",
    ],
    [
      "London, due today at 00:30 GMT on 28 Mar 2027: 2 real hours, 03:30 BST",
      LONDON,
      "2027-03-28T00:30:00Z",
      "2027-03-28",
      "2027-03-28T02:30:00.000Z",
    ],
    [
      "not due today, but the deadline (tomorrow 16:00) comes first",
      { ianaZone: "Europe/Warsaw", sameDayCutoffLocal: "07:00" },
      "2026-10-16T19:00:00Z",
      "2026-10-17",
      "2026-10-17T07:00:00.000Z",
    ],
  ])("%s", (_name, destination, exhaustedAt, date, expected) => {
    expect(graceEnd(at(exhaustedAt), date, destination).toISOString()).toBe(
      expected,
    );
  });

  it("is never after the routing deadline, and never before exhaustion unless the deadline is", () => {
    for (let minute = 0; minute < 48 * 60; minute += 11) {
      const exhaustedAt = new Date(Date.UTC(2027, 2, 27, 0, minute));
      for (const destination of [WARSAW, LONDON]) {
        for (const date of ["2027-03-27", "2027-03-28", "2027-03-29"]) {
          const end = graceEnd(exhaustedAt, date, destination).getTime();
          const deadline = routingDeadline(date, destination).getTime();
          expect(end).toBeLessThanOrEqual(deadline);
          if (deadline >= exhaustedAt.getTime()) {
            expect(end).toBeGreaterThanOrEqual(exhaustedAt.getTime());
          }
        }
      }
    }
  });
});
