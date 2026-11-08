/**
 * Spec 025 T-7 (AC-7; TASK-488): `quietHoursDecision` returns exactly §5.5's outcomes (a), (b),
 * (c) over a fixture table: a component P1 at 03:00, order P1s with `act_by` at quiet end + 61
 * and + 59 minutes, order P2s at + 59 and + 61, a P3, a window 22:00 to 06:00 at 23:30 and
 * 05:59, `Europe/Warsaw` on its DST change night (2026-10-25 01:30 and 02:30 local), and the
 * equal-minute boundaries of the window. `pagePriority` gives the override's priority 2.
 */
import { describe, expect, it } from "vitest";

import { QUIET_OVERRIDE_MINUTES } from "../../src/config/alerts.ts";
import {
  type AlertSetting,
  type QuietSubject,
  inQuietHours,
  pagePriority,
  quietEndAfter,
  quietHoursDecision,
} from "../../src/modules/ops/index.ts";

const KARACHI: AlertSetting = {
  quietStart: "23:00",
  quietEnd: "07:00",
  timeZone: "Asia/Karachi",
};
const WARSAW: AlertSetting = {
  quietStart: "22:00",
  quietEnd: "06:00",
  timeZone: "Europe/Warsaw",
};

/** Karachi is UTC+5 all year. */
const karachi = (local: string): Date => new Date(`${local}+05:00`);
const minutes = (n: number): number => n * 60_000;

/** 07:00 Karachi on 2026-11-09 is 02:00Z. */
const QUIET_END = karachi("2026-11-09T07:00:00");
const NIGHT = karachi("2026-11-09T03:00:00");

const component = (severity: QuietSubject["severity"]): QuietSubject => ({
  severity,
  scope: "component",
  actBy: null,
});
const order = (
  severity: QuietSubject["severity"],
  afterQuietEnd: number,
): QuietSubject => ({
  severity,
  scope: "order",
  actBy: new Date(QUIET_END.getTime() + minutes(afterQuietEnd)),
});

describe("T-7 (AC-7) · quietHoursDecision", () => {
  it.each([
    ["component P1 at 03:00 pages (a)", component("P1"), "page"],
    [
      "order P1, act_by quiet end + 61 min, is held (a)",
      order("P1", 61),
      "hold",
    ],
    ["order P1, act_by quiet end + 59 min, pages (a)", order("P1", 59), "page"],
    [
      "order P2, act_by quiet end + 59 min, pages as P1 (b)",
      order("P2", 59),
      "page",
    ],
    [
      "order P2, act_by quiet end + 61 min, is held (b)",
      order("P2", 61),
      "hold",
    ],
    ["component P2 is held (b)", component("P2"), "hold"],
    ["P3 never pushes (c)", component("P3"), "email_only"],
  ] as const)("%s", (_label, subject, expected) => {
    expect(quietHoursDecision(subject, KARACHI, NIGHT)).toBe(expected);
  });

  it("uses the 60-minute constant at its boundary: act_by exactly at quiet end + 60", () => {
    expect(QUIET_OVERRIDE_MINUTES).toBe(60);
    expect(quietHoursDecision(order("P1", 60), KARACHI, NIGHT)).toBe("page");
    expect(quietHoursDecision(order("P2", 60), KARACHI, NIGHT)).toBe("hold");
  });

  it("pages everything but P3 outside quiet hours", () => {
    const noon = karachi("2026-11-09T12:00:00");
    expect(quietHoursDecision(component("P2"), KARACHI, noon)).toBe("page");
    expect(quietHoursDecision(order("P1", 600), KARACHI, noon)).toBe("page");
    expect(quietHoursDecision(component("P3"), KARACHI, noon)).toBe(
      "email_only",
    );
  });

  it("gives the override priority 2 and a P2 by day priority 1", () => {
    expect(pagePriority(order("P2", 59), KARACHI, NIGHT)).toBe(2);
    expect(pagePriority(order("P2", 61), KARACHI, NIGHT)).toBeNull();
    expect(
      pagePriority(component("P2"), KARACHI, karachi("2026-11-09T12:00:00")),
    ).toBe(1);
    expect(pagePriority(component("P1"), KARACHI, NIGHT)).toBe(2);
  });

  it("includes the start minute and excludes the end minute", () => {
    expect(inQuietHours(KARACHI, karachi("2026-11-08T23:00:00"))).toBe(true);
    expect(inQuietHours(KARACHI, karachi("2026-11-08T22:59:00"))).toBe(false);
    expect(inQuietHours(KARACHI, karachi("2026-11-09T06:59:00"))).toBe(true);
    expect(inQuietHours(KARACHI, karachi("2026-11-09T07:00:00"))).toBe(false);
  });

  it("spans midnight: 22:00 to 06:00 is quiet at 23:30 and 05:59, not at 06:00", () => {
    // Warsaw is UTC+1 in November.
    expect(inQuietHours(WARSAW, new Date("2026-11-09T22:30:00Z"))).toBe(true);
    expect(inQuietHours(WARSAW, new Date("2026-11-10T04:59:00Z"))).toBe(true);
    expect(inQuietHours(WARSAW, new Date("2026-11-10T05:00:00Z"))).toBe(false);
  });

  it("reads Europe/Warsaw's DST change night in the zone: 01:30 and 02:30 local are both quiet, and quiet end is 06:00 CET", () => {
    // 2026-10-25: 03:00 CEST becomes 02:00 CET. 01:30 CEST = 23:30Z; 02:30 CET = 01:30Z.
    const early = new Date("2026-10-24T23:30:00Z");
    const late = new Date("2026-10-25T01:30:00Z");
    expect(inQuietHours(WARSAW, early)).toBe(true);
    expect(inQuietHours(WARSAW, late)).toBe(true);
    expect(quietEndAfter(WARSAW, early).toISOString()).toBe(
      "2026-10-25T05:00:00.000Z",
    );
    const warsawOrder: QuietSubject = {
      severity: "P2",
      scope: "order",
      actBy: new Date("2026-10-25T05:59:00Z"),
    };
    expect(quietHoursDecision(warsawOrder, WARSAW, late)).toBe("page");
    expect(
      quietHoursDecision(
        { ...warsawOrder, actBy: new Date("2026-10-25T06:01:00Z") },
        WARSAW,
        late,
      ),
    ).toBe("hold");
  });
});
