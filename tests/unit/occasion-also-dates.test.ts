/**
 * Poland's second Grandparents' Day date (spec 008 §14 A-founder-2026-10-21c item 4, **AC-74**,
 * **AC-75**; T-74, T-75; TASK-317).
 *
 * Dzień Babci is 21 January and Dzień Dziadka 22 January: one occasion over two days. The `fixed`
 * rule gained an optional `also`; `occasionDate()` is unchanged and returns the primary alone, and
 * the new `occasionDates()` returns the primary then each `also` day **in the same year**. The
 * breaker's first mutations are each a case below:
 *
 *  - `also` ignored: `occasionDates(rule, 2027)` is two dates, not one;
 *  - `occasionDate` made to return the last date: it is still `2027-01-21`, and the 126-row golden
 *    table of every primary date 2026 to 2030 (taken before the change) still holds;
 *  - the second date taken in the wrong year: from `2027-01-22` the next occurrence is
 *    `2028-01-21` and `2028-01-22`, never `2027-01-22`;
 *  - the occasion listed twice in a date-ordered list: `upcomingOccasions("PL", "2027-01-01")`
 *    holds one `grandparents_day`, dated `2027-01-21`.
 *
 * The expected dates are typed here from the calendar, not computed by the module under test.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  OccasionRuleSchema,
  type OccasionRule,
} from "../../seed/schema/catalogue.ts";
import {
  committedOccasionCalendar,
  nextOccasions,
  nextOccurrenceDates,
  occasionDate,
  occasionDates,
  upcomingOccasions,
} from "../../src/modules/geo/index.ts";

const repoRoot = resolve(__dirname, "../..");

/** The committed row's rule, so every case reads the data as it ships. */
function ruleOf(occasionKey: string, iso2: string): OccasionRule {
  const row = committedOccasionCalendar.find(
    (candidate) =>
      candidate.occasionKey === occasionKey && candidate.countryIso2 === iso2,
  );
  if (row === undefined) throw new Error(`no ${occasionKey}/${iso2} row`);
  return row.rule;
}

const PL_GRANDPARENTS = ruleOf("grandparents_day", "PL");

const GOLDEN = (
  JSON.parse(
    readFileSync(
      join(repoRoot, "tests/fixtures/seed/occasion-dates-golden.json"),
      "utf8",
    ),
  ) as {
    rows: readonly {
      occasionKey: string;
      countryIso2: string;
      dates: Readonly<Record<string, string | null>>;
    }[];
  }
).rows;

const YEARS = [2026, 2027, 2028, 2029, 2030] as const;

describe("AC-74: the evaluator (T-74)", () => {
  it("commits PL grandparents_day as fixed 21 January with 22 January as its also date", () => {
    expect(PL_GRANDPARENTS).toEqual({
      kind: "fixed",
      month: 1,
      day: 21,
      also: [{ month: 1, day: 22 }],
    });
  });

  it("gives both days for 2027 and 2028, primary first", () => {
    expect(occasionDates(PL_GRANDPARENTS, 2027)).toEqual([
      "2027-01-21",
      "2027-01-22",
    ]);
    expect(occasionDates(PL_GRANDPARENTS, 2028)).toEqual([
      "2028-01-21",
      "2028-01-22",
    ]);
  });

  it("keeps occasionDate the primary alone", () => {
    expect(occasionDate(PL_GRANDPARENTS, 2027)).toBe("2027-01-21");
    expect(occasionDate(PL_GRANDPARENTS, 2028)).toBe("2028-01-21");
  });

  it("takes the next occurrence by its primary, and its other day in the primary's year", () => {
    expect(nextOccurrenceDates("grandparents_day", "PL", "2027-01-21")).toEqual(
      ["2027-01-21", "2027-01-22"],
    );
    // The primary's 2027 date has passed, so the occurrence is 2028's: both days of it, never
    // 2027-01-22 beside 2028-01-21.
    expect(nextOccurrenceDates("grandparents_day", "PL", "2027-01-22")).toEqual(
      ["2028-01-21", "2028-01-22"],
    );
    expect(nextOccurrenceDates("grandparents_day", "PL", "2026-10-21")).toEqual(
      ["2027-01-21", "2027-01-22"],
    );
    // One day where the rule has no `also`; none where the destination keeps no such day.
    expect(nextOccurrenceDates("grandparents_day", "ES", "2026-10-21")).toEqual(
      ["2027-07-26"],
    );
    expect(nextOccurrenceDates("grandparents_day", "DE", "2026-10-21")).toEqual(
      [],
    );
    expect(nextOccurrenceDates("name_day", "PL", "2026-10-21")).toEqual([]);
  });

  it("lists the occasion once, by its primary, in every date-ordered list", () => {
    const upcoming = upcomingOccasions("PL", "2027-01-01", 12).filter(
      (occasion) => occasion.occasionKey === "grandparents_day",
    );
    expect(upcoming.map((occasion) => occasion.date)).toEqual(["2027-01-21"]);
    // The five-year horizon of `nextOccasions` too: one entry per year, never a 22 January.
    const next = nextOccasions("PL", "2027-01-01", 200).filter(
      (occasion) => occasion.occasionKey === "grandparents_day",
    );
    expect(next.map((occasion) => occasion.date)).toEqual([
      "2027-01-21",
      "2028-01-21",
      "2029-01-21",
      "2030-01-21",
      "2031-01-21",
    ]);
  });

  it("returns the one date occasionDate returns for a rule with no also, and nothing for a null primary", () => {
    const spain = ruleOf("grandparents_day", "ES");
    expect(occasionDates(spain, 2027)).toEqual(["2027-07-26"]);
    expect(occasionDates(ruleOf("mothers_day", "DE"), 2027)).toEqual([
      "2027-05-09",
    ]);
    expect(occasionDates(ruleOf("name_day", "PL"), 2027)).toEqual([]);
    expect(occasionDates({ kind: "none" }, 2027)).toEqual([]);
    // A primary that does not exist that year carries no `also` day with it.
    expect(
      occasionDates(
        { kind: "fixed", month: 2, day: 29, also: [{ month: 3, day: 1 }] },
        2027,
      ),
    ).toEqual([]);
    expect(
      occasionDates(
        { kind: "fixed", month: 2, day: 28, also: [{ month: 2, day: 29 }] },
        2027,
      ),
    ).toEqual(["2027-02-28"]);
    expect(
      occasionDates(
        { kind: "fixed", month: 2, day: 28, also: [{ month: 2, day: 29 }] },
        2028,
      ),
    ).toEqual(["2028-02-28", "2028-02-29"]);
  });

  it("moves no primary date: all 126 rows, 2026 to 2030, as before the change", () => {
    expect(GOLDEN).toHaveLength(126);
    expect(committedOccasionCalendar).toHaveLength(126);
    for (const golden of GOLDEN) {
      const rule = ruleOf(golden.occasionKey, golden.countryIso2);
      for (const year of YEARS) {
        const label = `${golden.occasionKey}/${golden.countryIso2} ${String(year)}`;
        const before = golden.dates[String(year)] ?? null;
        expect(occasionDate(rule, year), label).toBe(before);
        // `occasionDates` starts with that date, and only PL grandparents_day has a second.
        const all = occasionDates(rule, year);
        expect(all[0] ?? null, label).toBe(before);
        const second =
          golden.occasionKey === "grandparents_day" &&
          golden.countryIso2 === "PL"
            ? [`${String(year)}-01-22`]
            : [];
        expect(all.slice(1), label).toEqual(second);
      }
    }
  });
});

describe("AC-75: the schema (T-75)", () => {
  /** The issue messages of one parse, or `[]` when it is accepted. */
  const issues = (value: unknown): readonly string[] => {
    const result = OccasionRuleSchema.safeParse(value);
    return result.success ? [] : result.error.issues.map((i) => i.message);
  };

  it.each([
    [
      "one also date",
      { kind: "fixed", month: 1, day: 21, also: [{ month: 1, day: 22 }] },
    ],
    [
      "two also dates",
      {
        kind: "fixed",
        month: 1,
        day: 21,
        also: [
          { month: 1, day: 22 },
          { month: 1, day: 23 },
        ],
      },
    ],
    [
      "29 February, a real day in a leap year",
      { kind: "fixed", month: 2, day: 28, also: [{ month: 2, day: 29 }] },
    ],
    ["no also at all", { kind: "fixed", month: 7, day: 26 }],
  ])("accepts %s", (_label, value) => {
    expect(issues(value)).toEqual([]);
  });

  it.each([
    [
      "also on nth_weekday",
      {
        kind: "nth_weekday",
        month: 5,
        weekday: 7,
        n: 2,
        also: [{ month: 5, day: 11 }],
      },
      'Unrecognized key: "also"',
    ],
    [
      "also on last_weekday",
      {
        kind: "last_weekday",
        month: 5,
        weekday: 7,
        also: [{ month: 5, day: 30 }],
      },
      'Unrecognized key: "also"',
    ],
    [
      "also on easter_offset",
      { kind: "easter_offset", days: 0, also: [{ month: 4, day: 6 }] },
      'Unrecognized key: "also"',
    ],
    [
      "three also dates",
      {
        kind: "fixed",
        month: 1,
        day: 21,
        also: [
          { month: 1, day: 22 },
          { month: 1, day: 23 },
          { month: 1, day: 24 },
        ],
      },
      "a `fixed` rule's `also` holds at most 2 dates",
    ],
    [
      "an empty also",
      { kind: "fixed", month: 1, day: 21, also: [] },
      "a `fixed` rule's `also` holds at least one date when present",
    ],
    [
      "an also date equal to the primary",
      { kind: "fixed", month: 1, day: 21, also: [{ month: 1, day: 21 }] },
      "`also` 1/21 repeats the primary date",
    ],
    [
      "an also date equal to another",
      {
        kind: "fixed",
        month: 1,
        day: 21,
        also: [
          { month: 1, day: 22 },
          { month: 1, day: 22 },
        ],
      },
      "`also` 1/22 repeats another `also` date",
    ],
    [
      "30 February",
      { kind: "fixed", month: 1, day: 21, also: [{ month: 2, day: 30 }] },
      "`also` 2/30 is not a real calendar day",
    ],
    [
      "31 April",
      { kind: "fixed", month: 1, day: 21, also: [{ month: 4, day: 31 }] },
      "`also` 4/31 is not a real calendar day",
    ],
  ])("rejects %s with a named issue", (_label, value, message) => {
    expect(issues(value)).toEqual([message]);
  });
});
