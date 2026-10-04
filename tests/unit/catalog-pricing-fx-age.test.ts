/**
 * Rate age counts Monday-to-Friday only (spec 005 §14 A7 Corrected 5, AC-35, AC-15; T-35;
 * TASK-180).
 *
 * The rule, in its one binding form: a rate dated D is stale at every instant **after 00:00Z on
 * the second Monday-to-Friday day after D**, and exactly at that instant it is still usable.
 * `rateValidUntil(D)` is the calendar day before that instant. Weekday TARGET holidays count.
 *
 * Every expectation below is a literal instant read off a calendar, not a value computed by the
 * code under test, so the table fails when the rule changes. Two named regressions are pinned
 * (T-35): going back to calendar-hours ageing turns the Friday-at-Sunday row red, and counting
 * 48 weekday *hours* instead of the date rule turns the Saturday row red.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  FX_SNAPSHOT_AS_OF,
  fxRateStaleAfter,
  isFxRateStaleAt,
  isFxSnapshotStale,
} from "../../src/config/catalogue/fx.data.ts";
import {
  isRateStale,
  rateValidUntil,
} from "../../src/modules/catalog/pricing/fx.ts";

const at = (iso: string): Date => new Date(iso);
const oneMsAfter = (iso: string): Date => new Date(Date.parse(iso) + 1);

/**
 * One row per publication weekday, in the week of Monday 2026-10-05: the date, its stale
 * instant, and its last whole usable day.
 */
const WEEKDAY_ROWS = [
  {
    day: "Mon",
    asOf: "2026-10-05",
    staleAt: "2026-10-07T00:00:00Z",
    validUntil: "2026-10-06",
  },
  {
    day: "Tue",
    asOf: "2026-10-06",
    staleAt: "2026-10-08T00:00:00Z",
    validUntil: "2026-10-07",
  },
  {
    day: "Wed",
    asOf: "2026-10-07",
    staleAt: "2026-10-09T00:00:00Z",
    validUntil: "2026-10-08",
  },
  {
    day: "Thu",
    asOf: "2026-10-08",
    staleAt: "2026-10-12T00:00:00Z",
    validUntil: "2026-10-11",
  },
  {
    day: "Fri",
    asOf: "2026-10-09",
    staleAt: "2026-10-13T00:00:00Z",
    validUntil: "2026-10-12",
  },
] as const;

/** The gate (`pricing/fx.ts`) and the dataset's predicate must agree at every instant (AC-35). */
function bothVerdicts(asOf: string, now: Date): readonly [boolean, boolean] {
  return [isRateStale(asOf, now), isFxRateStaleAt(asOf, now)];
}

describe("a weekday rate: fresh exactly at its stale instant, stale 1 ms after (AC-35, T-35)", () => {
  it.each(WEEKDAY_ROWS)("$day $asOf → stale after $staleAt", (row) => {
    expect(bothVerdicts(row.asOf, at(row.staleAt))).toEqual([false, false]);
    expect(bothVerdicts(row.asOf, oneMsAfter(row.staleAt))).toEqual([
      true,
      true,
    ]);
    expect(fxRateStaleAfter(row.asOf)).toBe(Date.parse(row.staleAt));
  });

  it.each(WEEKDAY_ROWS)(
    "rateValidUntil($asOf) is $validUntil, the calendar day before",
    (row) => {
      expect(rateValidUntil(row.asOf)).toBe(row.validUntil);
    },
  );
});

describe("the weekend adds no age (Q-A7.2)", () => {
  const FRIDAY = "2026-10-09";

  it("holds Friday's rate through Saturday, Sunday and Monday", () => {
    expect(isRateStale(FRIDAY, at("2026-10-10T00:00:00Z"))).toBe(false);
    // Calendar-hours ageing (48 h from Fri 00:00Z) calls this stale: the first regression row.
    expect(isRateStale(FRIDAY, at("2026-10-11T23:59:59.999Z"))).toBe(false);
    expect(isRateStale(FRIDAY, at("2026-10-12T23:59:59.999Z"))).toBe(false);
    expect(isRateStale(FRIDAY, oneMsAfter("2026-10-13T00:00:00Z"))).toBe(true);
  });

  it.each([
    { day: "Sat", asOf: "2026-10-10" },
    { day: "Sun", asOf: "2026-10-11" },
  ])("dates a $day rate stale after Tuesday 00:00Z, not Wednesday", (row) => {
    // 48 weekday *hours* from a weekend date run to Wednesday 00:00Z: the second regression row.
    expect(bothVerdicts(row.asOf, at("2026-10-13T00:00:00Z"))).toEqual([
      false,
      false,
    ]);
    expect(bothVerdicts(row.asOf, oneMsAfter("2026-10-13T00:00:00Z"))).toEqual([
      true,
      true,
    ]);
    expect(rateValidUntil(row.asOf)).toBe("2026-10-12");
  });
});

describe("weekday TARGET holidays count as days", () => {
  it("does not let Good Friday 2027 delay Thursday's rate", () => {
    // Easter 2027 is 28 March, so Good Friday is 2027-03-26. Thursday 2027-03-25's rate is stale
    // after Monday 2027-03-29 00:00Z, exactly as any Thursday's, and not after Tuesday.
    expect(isRateStale("2027-03-25", at("2027-03-29T00:00:00Z"))).toBe(false);
    expect(isRateStale("2027-03-25", oneMsAfter("2027-03-29T00:00:00Z"))).toBe(
      true,
    );
  });
});

describe("real month-end and leap days are accepted (/break 177 hole 5)", () => {
  it.each([
    // Wednesday 30 Sep 2026 → Friday 2 Oct.
    ["2026-09-30", "2026-10-02T00:00:00Z", "2026-10-01"],
    // Thursday 31 Dec 2026 → Monday 4 Jan 2027: 1 Jan (a Friday, a TARGET holiday) counts.
    ["2026-12-31", "2027-01-04T00:00:00Z", "2027-01-03"],
    // Tuesday 29 Feb 2028, a leap day → Thursday 2 Mar.
    ["2028-02-29", "2028-03-02T00:00:00Z", "2028-03-01"],
    // Saturday 31 Oct 2026 → Tuesday 3 Nov.
    ["2026-10-31", "2026-11-03T00:00:00Z", "2026-11-02"],
  ])("%s is stale after %s", (asOf, staleAt, validUntil) => {
    expect(fxRateStaleAfter(asOf)).toBe(Date.parse(staleAt));
    expect(isRateStale(asOf, at(staleAt))).toBe(false);
    expect(isRateStale(asOf, oneMsAfter(staleAt))).toBe(true);
    expect(rateValidUntil(asOf)).toBe(validUntil);
  });

  it("refuses 29 February of a year that is not a leap year, and day 31 of a 30-day month", () => {
    for (const bad of [
      "2027-02-29",
      "2026-09-31",
      "2026-00-10",
      "2026-01-00",
    ]) {
      expect(() => fxRateStaleAfter(bad), bad).toThrow(/not a calendar day/u);
    }
  });
});

describe("the report over the committed snapshot gives the gate's verdict", () => {
  it("agrees with `isRateStale` around the committed snapshot's stale instant", () => {
    // 2026-09-08 is a Tuesday: stale after Thursday 2026-09-10 00:00Z.
    for (const now of [
      at("2026-09-09T12:00:00Z"),
      at("2026-09-10T00:00:00Z"),
      oneMsAfter("2026-09-10T00:00:00Z"),
      at("2026-09-12T12:00:00Z"),
    ]) {
      expect(isFxSnapshotStale(now), now.toISOString()).toBe(
        isRateStale(FX_SNAPSHOT_AS_OF, now),
      );
    }
    expect(isFxSnapshotStale(at("2026-09-10T00:00:00Z"))).toBe(false);
    expect(isFxSnapshotStale(oneMsAfter("2026-09-10T00:00:00Z"))).toBe(true);
  });

  it("refuses an `as_of` that is not a calendar day", () => {
    for (const bad of ["08-09-2026", "2026-02-30", "2026-13-01", "2026-9-8"]) {
      expect(() => isRateStale(bad, at("2026-09-09T00:00:00Z")), bad).toThrow(
        /not a calendar day/u,
      );
    }
  });
});

describe("no other file restates the rule (AC-35)", () => {
  it("leaves `pricing/fx.ts` delegating, with no hour or weekday arithmetic of its own", () => {
    const source = readFileSync(
      "src/modules/catalog/pricing/fx.ts",
      "utf8",
    ).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gmu, "");
    expect(source).toContain("return isFxRateStaleAt(asOf, now);");
    expect(source).not.toMatch(/MAX_FX_AGE_HOURS\s*\*/u);
    expect(source).not.toMatch(/getUTCDay|3_600_000/u);
  });
});
