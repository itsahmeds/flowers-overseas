/**
 * `productionStartAt` (spec 013 §5.2 "Production start on the delivery morning"; spec 002 §14
 * A10.1; AC-44 / T-44, unit half; TASK-258).
 *
 * 06:00 on the delivery date, on the destination's own wall clock, from
 * `PRODUCTION_START_LOCAL_TIME`. Each expected value is written as the UTC instant, so a fixed
 * offset (the classic DST bug) gives a different answer on both transition Sundays.
 */
import { describe, expect, it } from "vitest";

import { PRODUCTION_START_LOCAL_TIME } from "@/config/orders";
import { productionStartAt } from "@/modules/payments/production";

describe("productionStartAt (AC-44, T-44)", () => {
  it("reads its time from PRODUCTION_START_LOCAL_TIME, which is 06:00", () => {
    expect(PRODUCTION_START_LOCAL_TIME).toBe("06:00");
  });

  it.each([
    // Europe/Warsaw: CET (+1) in winter, CEST (+2) in summer.
    ["Europe/Warsaw", "2027-02-14", "2027-02-14T05:00:00.000Z"],
    ["Europe/Warsaw", "2026-07-01", "2026-07-01T04:00:00.000Z"],
    ["Europe/Warsaw", "2026-10-24", "2026-10-24T04:00:00.000Z"],
    // 25 Oct 2026: the clocks go back at 03:00; 06:00 that morning is CET.
    ["Europe/Warsaw", "2026-10-25", "2026-10-25T05:00:00.000Z"],
    ["Europe/Warsaw", "2026-10-26", "2026-10-26T05:00:00.000Z"],
    // 28 Mar 2027: the clocks go forward at 02:00; 06:00 that morning is CEST.
    ["Europe/Warsaw", "2027-03-28", "2027-03-28T04:00:00.000Z"],
    ["Europe/Warsaw", "2027-03-27", "2027-03-27T05:00:00.000Z"],
    // Europe/London: GMT (0) in winter, BST (+1) in summer.
    ["Europe/London", "2027-02-14", "2027-02-14T06:00:00.000Z"],
    ["Europe/London", "2026-07-01", "2026-07-01T05:00:00.000Z"],
    ["Europe/London", "2026-10-25", "2026-10-25T06:00:00.000Z"],
    ["Europe/London", "2027-03-28", "2027-03-28T05:00:00.000Z"],
  ])("%s on %s → %s (06:00 local)", (zone, deliveryDate, expected) => {
    expect(productionStartAt({ deliveryDate, zone }).toISOString()).toBe(
      expected,
    );
  });

  it("follows the constant: 07:00 would be an hour later", () => {
    expect(
      productionStartAt(
        { deliveryDate: "2027-02-14", zone: "Europe/Warsaw" },
        "07:00",
      ).toISOString(),
    ).toBe("2027-02-14T06:00:00.000Z");
  });

  it("refuses a local time that does not exist that day, and malformed input", () => {
    expect(() =>
      productionStartAt(
        { deliveryDate: "2027-03-28", zone: "Europe/Warsaw" },
        "02:30",
      ),
    ).toThrow(RangeError);
    expect(() =>
      productionStartAt({ deliveryDate: "14/02/2027", zone: "Europe/Warsaw" }),
    ).toThrow(RangeError);
    expect(() =>
      productionStartAt(
        { deliveryDate: "2027-02-14", zone: "Europe/Warsaw" },
        "6:00",
      ),
    ).toThrow(RangeError);
  });
});
