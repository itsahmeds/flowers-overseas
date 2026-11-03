/**
 * Spec 030a's payout calendar (§5.2 `weeklyPeriod`, `localDateIn`; T-08 and T-14's unit half;
 * AC-8, AC-14; TASK-364): the ISO week of a calendar day, and the florist's local date read
 * through the zone, across the night the clocks go back in Warsaw and across a year end.
 *
 * Mutations (self-review, PR): `localDateIn` with a fixed `+02:00` offset reads 2026-10-26T00:30
 * CET (23:30Z) as the 26th and 23:30 CET on the 25th as the 26th, and the DST cases go red;
 * `weeklyPeriod` with a Sunday-first week moves 2026-10-25 into the next week and goes red.
 */
import { describe, expect, it } from "vitest";

import {
  addDays,
  isoWeekday,
  localDateIn,
  weeklyPeriod,
} from "../../src/modules/partners/payouts/dates";

const WARSAW = "Europe/Warsaw";

describe("weeklyPeriod (T-08)", () => {
  it("2026-10-21 (a Wednesday) is the week of 19 to 25 October", () => {
    expect(weeklyPeriod("2026-10-21")).toEqual({
      start: "2026-10-19",
      end: "2026-10-25",
    });
  });

  it.each([
    ["2026-10-19", "2026-10-19", "2026-10-25"], // Monday: its own week
    ["2026-10-25", "2026-10-19", "2026-10-25"], // Sunday: the end of its week, not the next
    ["2026-10-26", "2026-10-26", "2026-11-01"], // the Monday after the clocks went back
    ["2026-12-31", "2026-12-28", "2027-01-03"], // a week across the year end
    ["2027-01-01", "2026-12-28", "2027-01-03"],
    ["2028-02-29", "2028-02-28", "2028-03-05"], // a leap day
  ])("%s is in the week %s to %s", (date, start, end) => {
    expect(weeklyPeriod(date)).toEqual({ start, end });
  });

  it("numbers the ISO weekdays Monday 1 to Sunday 7 and steps the calendar exactly", () => {
    expect(isoWeekday("2026-10-25")).toBe(7);
    expect(isoWeekday("2026-10-26")).toBe(1);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-10-25", 7)).toBe("2026-11-01");
    expect(() => addDays("2026-02-30", 1)).toThrow(RangeError);
  });
});

describe("localDateIn (T-14, the DST night of 25 October 2026)", () => {
  it.each([
    // 23:30 CET on Sunday the 25th (the clocks went back at 03:00 CEST): still the 25th.
    ["2026-10-25T22:30:00Z", "2026-10-25"],
    // 00:30 CET on Monday the 26th.
    ["2026-10-25T23:30:00Z", "2026-10-26"],
    // 23:59:59 CEST on Saturday the 24th, and midnight after it.
    ["2026-10-24T21:59:59Z", "2026-10-24"],
    ["2026-10-24T22:00:00Z", "2026-10-25"],
    // The year end in Warsaw (CET, UTC+1).
    ["2026-12-31T22:59:59Z", "2026-12-31"],
    ["2026-12-31T23:00:00Z", "2027-01-01"],
  ])("%s is %s in Warsaw", (instant, date) => {
    expect(localDateIn(new Date(instant), WARSAW)).toBe(date);
  });

  it("does not depend on the process zone: the same instant in another zone is its own date", () => {
    expect(
      localDateIn(new Date("2026-10-25T23:30:00Z"), "America/New_York"),
    ).toBe("2026-10-25");
    expect(localDateIn(new Date("2026-10-25T23:30:00Z"), "UTC")).toBe(
      "2026-10-25",
    );
  });
});
