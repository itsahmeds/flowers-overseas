/**
 * The start route's date refusal (TASK-504; spec 010 §2 "The date", D8, §8
 * `checkout.date_refused {reason_key}`). The product page is cached, so a stale page can still
 * post a day that has passed, a closed Sunday or a holiday; `dateRefusalReason` is what the start
 * route asks before it stores a posted date. Poland: Warsaw zone, 14:00 same-day cutoff, Monday
 * to Saturday, no Sunday delivery, 11 November (Independence Day) closed.
 */
import { describe, expect, it } from "vitest";

import { dateRefusalReason } from "../../src/modules/checkout/dates.ts";

/** Sunday 8 November 2026, 10:00 in Warsaw (UTC+1). */
const SUNDAY_MORNING = new Date("2026-11-08T09:00:00Z");

describe("dateRefusalReason (TASK-504)", () => {
  it("refuses a day that has already passed: it is outside the calendar", () => {
    expect(dateRefusalReason("PL", "2026-11-06", SUNDAY_MORNING)).toBe(
      "outside_window",
    );
    expect(dateRefusalReason("PL", "2026-11-07", SUNDAY_MORNING)).toBe(
      "outside_window",
    );
  });

  it("refuses a Sunday in a country with no Sunday delivery, with the calendar's reason", () => {
    const today = dateRefusalReason("PL", "2026-11-08", SUNDAY_MORNING);
    const next = dateRefusalReason("PL", "2026-11-15", SUNDAY_MORNING);
    expect(today).toMatch(/^delivery\.reason\./u);
    expect(next).toMatch(/^delivery\.reason\./u);
  });

  it("refuses a public holiday", () => {
    expect(dateRefusalReason("PL", "2026-11-11", SUNDAY_MORNING)).toMatch(
      /^delivery\.reason\./u,
    );
  });

  it("accepts an ordinary delivery day", () => {
    expect(dateRefusalReason("PL", "2026-11-10", SUNDAY_MORNING)).toBeNull();
    expect(dateRefusalReason("PL", "2026-11-12", SUNDAY_MORNING)).toBeNull();
  });

  it("refuses today once the same-day cutoff has passed, and accepts it before", () => {
    const mondayBefore = new Date("2026-11-09T12:59:00Z");
    const mondayAfter = new Date("2026-11-09T13:00:00Z");
    expect(dateRefusalReason("PL", "2026-11-09", mondayBefore)).toBeNull();
    expect(dateRefusalReason("PL", "2026-11-09", mondayAfter)).toMatch(
      /^delivery\.reason\./u,
    );
  });

  it("refuses a date far beyond the calendar's horizon", () => {
    expect(dateRefusalReason("PL", "2031-01-06", SUNDAY_MORNING)).toBe(
      "outside_window",
    );
  });
});
