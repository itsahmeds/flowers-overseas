/**
 * T-22 (spec 007 AC-21) and the calendar half of AC-22 — `src/modules/geo/occasions`; TASK-089.
 *
 * The suite is table-driven over `tests/fixtures/occasions.ts`: 62 rules × 5 years = 310 dates,
 * every observed row of `seed/data/occasion-country.json` for the seven destinations plus the
 * three `plan/13` D6 reference rows that carry the rule types the seed has none of. The fixture
 * was computed by an independent implementation and is anchored on an **independently tabled**
 * Easter (`EASTER_SUNDAYS`), so no assertion here is `occasionDate` agreeing with itself.
 *
 * The threshold in `vitest.coverage.json` requires 100 % branches of this directory (`plan/12` §4,
 * AC-21), so the failure paths are tested as first-class cases, not as an afterthought: the year
 * guard, 29 February in a common year, a fifth weekday a month does not have, an unobserved row
 * that somehow carries a date, and the `plan/13` B15 seam's runtime throw.
 */
import { describe, expect, it } from "vitest";

import { SeedOccasionCountryRegistrySchema } from "../../seed/schema/catalogue.ts";
import {
  type IsoDate,
  MAX_YEAR,
  MIN_YEAR,
  NEXT_OCCASIONS_HORIZON_MONTHS,
  type OccasionCalendarRow,
  committedOccasionCalendar,
  easterSunday,
  nextOccasions,
  observedUndatedOccasions,
  occasionDate,
  upcomingOccasions,
} from "../../src/modules/geo/index.ts";
import {
  EASTER_SUNDAYS,
  OCCASION_FIXTURE_YEARS,
  type OccasionFixtureYear,
  occasionDates,
  occasionRuleFixtures,
} from "../fixtures/index.ts";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The destinations of `src/config/countries.ts`, as the seed rows key them. */
const DESTINATIONS = ["PL", "DE", "FR", "ES", "IT", "RO", "NL"] as const;

/** A rule the schema does not know, cast through `never` to reach the B15 seam at runtime. */
const UNKNOWN_RULE = { kind: "orthodox_easter_offset", days: 0 } as never;

describe("the committed calendar is the data the evaluator is fed (spec 006 → spec 007)", () => {
  it("parses under spec 006's registry schema, so the typed JSON import is honest", () => {
    expect(() =>
      SeedOccasionCountryRegistrySchema.parse(committedOccasionCalendar),
    ).not.toThrow();
  });

  it("covers the seven destinations", () => {
    expect(
      [
        ...new Set(committedOccasionCalendar.map((row) => row.countryIso2)),
      ].sort(),
    ).toEqual([...DESTINATIONS].sort());
  });

  it("has a fixture row for every observed seed row, and no orphan fixture row", () => {
    const key = (row: {
      countryIso2?: string;
      country?: string;
      occasionKey?: string;
      occasion?: string;
    }) =>
      `${row.countryIso2 ?? row.country ?? ""}/${row.occasionKey ?? row.occasion ?? ""}`;
    const seeded = committedOccasionCalendar
      .filter((row) => row.observed)
      .map(key)
      .sort();
    const fixtured = occasionRuleFixtures
      .filter((row) => row.inSeed)
      .map((row) => `${row.country}/${row.occasion}`)
      .sort();
    expect(fixtured).toEqual(seeded);
  });

  it("uses the fixture's rule verbatim, so the table cannot be tested against a different rule", () => {
    for (const fixture of occasionRuleFixtures.filter((row) => row.inSeed)) {
      const row = committedOccasionCalendar.find(
        (candidate) =>
          candidate.countryIso2 === fixture.country &&
          candidate.occasionKey === fixture.occasion,
      );
      expect(row?.rule, `${fixture.country}/${fixture.occasion}`).toEqual(
        fixture.rule,
      );
    }
  });
});

describe("easterSunday (the anchor of the movable feasts)", () => {
  it.each(OCCASION_FIXTURE_YEARS)(
    "matches the independently tabled Gregorian Easter for %i",
    (year) => {
      expect(easterSunday(year)).toBe(EASTER_SUNDAYS[year]);
    },
  );

  it("is a Sunday in every year of a long run, not only in the fixture years", () => {
    for (let year = 1900; year <= 2100; year += 1) {
      const date = easterSunday(year);
      expect(ISO_DATE.test(date), date).toBe(true);
      expect(new Date(`${date}T00:00:00.000Z`).getUTCDay(), date).toBe(0);
      // Easter is never before 22 March and never after 25 April.
      expect(date >= `${year}-03-22`, date).toBe(true);
      expect(date <= `${year}-04-25`, date).toBe(true);
    }
  });
});

describe("occasionDate over the 2026–2030 fixture (AC-21, T-22)", () => {
  for (const fixture of occasionRuleFixtures) {
    const cases = OCCASION_FIXTURE_YEARS.map(
      (year) => [year, fixture.dates[year]] as const,
    );
    it.each(cases)(
      `${fixture.country} ${fixture.label} (${fixture.rule.kind}) in %i is %s`,
      (year, expected) => {
        expect(occasionDate(fixture.rule, year)).toBe(expected);
      },
    );
  }

  it("covers all six plan/03 §9 rule types", () => {
    expect(
      [...new Set(occasionRuleFixtures.map((row) => row.rule.kind))].sort(),
    ).toEqual([
      "easter_offset",
      "fixed",
      "last_weekday",
      "lent_sunday",
      "none",
      "nth_weekday",
    ]);
  });

  it("dates the three reference rows plan/13 D6 names, with the 2027 Mothering Sunday corrected", () => {
    const of = (country: string) =>
      occasionRuleFixtures.find(
        (row) => row.country === country && row.occasion === "mothers_day",
      );
    // D6 and spec 007 AC-21 say 14 Mar 2027; Mothering Sunday is Easter − 21 = 7 Mar 2027.
    // See the header of `tests/fixtures/occasions.ts` and `docs/tasks/TASK-089.md` § Escalations.
    expect(of("GB")?.dates[2027]).toBe("2027-03-07");
    expect(occasionDate(of("GB")!.rule, 2027)).toBe("2027-03-07");
    expect(occasionDate(of("DE")!.rule, 2027)).toBe("2027-05-09");
    expect(occasionDate(of("NO")!.rule, 2027)).toBe("2027-02-14");
    expect(occasionDate(of("SE")!.rule, 2027)).toBe("2027-05-30");
    expect(occasionDate({ kind: "fixed", month: 5, day: 26 }, 2027)).toBe(
      "2027-05-26",
    );
  });

  it("gives a `none` rule no date in any year, for any row that carries it (AC-21)", () => {
    const undated = occasionRuleFixtures.filter(
      (row) => row.rule.kind === "none",
    );
    expect(undated.length).toBeGreaterThan(0);
    for (const row of undated) {
      for (const year of OCCASION_FIXTURE_YEARS) {
        expect(row.dates[year], `${row.country}/${row.occasion}`).toBeNull();
        expect(occasionDate(row.rule, year)).toBeNull();
      }
    }
    // The two observed-but-undated rows of plan/13 B15, named so a silent removal fails here.
    expect(
      undated
        .filter((row) => row.inSeed)
        .map((row) => `${row.country}/${row.occasion}`)
        .sort(),
    ).toEqual(["PL/name_day", "RO/easter"]);
  });

  it("returns ISO calendar-date strings, never a Date or a timestamp", () => {
    for (const row of occasionRuleFixtures) {
      for (const year of OCCASION_FIXTURE_YEARS) {
        const date: IsoDate | null = occasionDate(row.rule, year);
        if (date !== null) expect(ISO_DATE.test(date), date).toBe(true);
      }
    }
  });
});

describe("the rule types at their edges", () => {
  it("has no date for 29 February in a common year, and one in a leap year", () => {
    const leapDay = { kind: "fixed", month: 2, day: 29 } as const;
    expect(occasionDate(leapDay, 2027)).toBeNull();
    expect(occasionDate(leapDay, 2028)).toBe("2028-02-29");
  });

  it("has no date for an nth weekday the month does not have", () => {
    // May 2027 starts on a Saturday: Sundays are 2, 9, 16, 23, 30 — five of them.
    expect(
      occasionDate({ kind: "nth_weekday", month: 5, weekday: 7, n: 5 }, 2027),
    ).toBe("2027-05-30");
    // February 2027 starts on a Monday: Sundays are 7, 14, 21, 28 — there is no fifth.
    expect(
      occasionDate({ kind: "nth_weekday", month: 2, weekday: 7, n: 5 }, 2027),
    ).toBeNull();
    // The first occurrence when the month starts on that very weekday (offset 0).
    expect(
      occasionDate({ kind: "nth_weekday", month: 2, weekday: 1, n: 1 }, 2027),
    ).toBe("2027-02-01");
  });

  it("finds the last weekday of a month, including when the month ends on it", () => {
    // 31 May 2026 is a Sunday: the last Sunday is the last day (no step back).
    expect(
      occasionDate({ kind: "last_weekday", month: 5, weekday: 7 }, 2026),
    ).toBe("2026-05-31");
    // 31 May 2027 is a Monday: the last Sunday steps back six days.
    expect(
      occasionDate({ kind: "last_weekday", month: 5, weekday: 7 }, 2027),
    ).toBe("2027-05-30");
    // December, where "day 0 of the next month" crosses the year end.
    expect(
      occasionDate({ kind: "last_weekday", month: 12, weekday: 4 }, 2027),
    ).toBe("2027-12-30");
  });

  it("offsets Easter forwards and backwards", () => {
    expect(occasionDate({ kind: "easter_offset", days: 0 }, 2027)).toBe(
      EASTER_SUNDAYS[2027],
    );
    expect(occasionDate({ kind: "easter_offset", days: 39 }, 2027)).toBe(
      "2027-05-06",
    );
    expect(occasionDate({ kind: "easter_offset", days: -2 }, 2027)).toBe(
      "2027-03-26",
    );
  });

  it("counts the six Sundays of Lent back from Easter, Palm Sunday last", () => {
    const lent = (n: number) => occasionDate({ kind: "lent_sunday", n }, 2027);
    expect([1, 2, 3, 4, 5, 6].map((n) => lent(n))).toEqual([
      "2027-02-14",
      "2027-02-21",
      "2027-02-28",
      "2027-03-07",
      "2027-03-14",
      "2027-03-21",
    ]);
    // The sixth is Palm Sunday: Easter − 7.
    expect(lent(6)).toBe("2027-03-21");
  });
});

describe("the year guard and the plan/13 B15 seam", () => {
  it.each([
    ["not an integer", 2026.5],
    ["before the Gregorian reform", MIN_YEAR - 1],
    ["past the algorithm's range", MAX_YEAR + 1],
  ])("rejects a year that is %s", (_label, year) => {
    expect(() =>
      occasionDate({ kind: "fixed", month: 1, day: 1 }, year),
    ).toThrow(RangeError);
    expect(() => easterSunday(year)).toThrow(RangeError);
  });

  it("accepts the ends of the range", () => {
    expect(occasionDate({ kind: "fixed", month: 1, day: 1 }, MIN_YEAR)).toBe(
      `${MIN_YEAR}-01-01`,
    );
    expect(occasionDate({ kind: "fixed", month: 1, day: 1 }, MAX_YEAR)).toBe(
      `${MAX_YEAR}-01-01`,
    );
  });

  it("throws on a rule kind it has no branch for, rather than guessing a date", () => {
    expect(() => occasionDate(UNKNOWN_RULE, 2027)).toThrow(TypeError);
    expect(() => occasionDate(UNKNOWN_RULE, 2027)).toThrow(/plan\/13 B15/);
  });
});

describe("upcomingOccasions: the corridor calendar API (AC-22)", () => {
  it("lists the next 12 months for a destination in date order", () => {
    const rows = upcomingOccasions("PL", "2027-01-01");
    expect(rows.map((row) => row.date)).toEqual(
      [...rows.map((row) => row.date)].sort(),
    );
    expect(rows.map((row) => `${row.occasionKey} ${row.date}`)).toEqual([
      "new_year 2027-01-01",
      "grandparents_day 2027-01-21",
      "valentines 2027-02-14",
      "womens_day 2027-03-08",
      "easter 2027-03-28",
      "mothers_day 2027-05-26",
      "fathers_day 2027-06-23",
      "teachers_day 2027-10-14",
      "all_saints 2027-11-01",
      "christmas 2027-12-25",
    ]);
  });

  it("carries the campaign offset and the indexability override through unchanged", () => {
    const christmas = upcomingOccasions("PL", "2027-01-01").find(
      (row) => row.occasionKey === "christmas",
    );
    expect(christmas).toEqual({
      occasionKey: "christmas",
      countryIso2: "PL",
      date: "2027-12-25",
      promoStartOffsetDays: 21,
      indexableOverride: null,
    });
  });

  it("includes an occasion that falls on `from` and excludes the one on the window's end", () => {
    // New Year's Day is the first day of the window and the first day after it.
    const rows = upcomingOccasions("PL", "2027-01-01", 12);
    expect(rows.filter((row) => row.occasionKey === "new_year")).toHaveLength(
      1,
    );
    expect(rows[0]?.date).toBe("2027-01-01");
    expect(rows.some((row) => row.date === "2028-01-01")).toBe(false);
  });

  it("wraps the year end: a window opened in October reaches into the next year", () => {
    const rows = upcomingOccasions("PL", "2027-10-15", 6);
    expect(rows.map((row) => row.date)).toEqual([
      "2027-11-01",
      "2027-12-25",
      "2028-01-01",
      "2028-01-21",
      "2028-02-14",
      "2028-03-08",
    ]);
  });

  it("excludes a date before the window and a date on or after its end", () => {
    // Teachers' Day (14 Oct) is behind us; All Saints (1 Nov) is the window's last day.
    expect(
      upcomingOccasions("PL", "2027-10-15", 1).map((row) => row.date),
    ).toEqual(["2027-11-01"]);
    expect(
      upcomingOccasions("PL", "2027-11-01", 1).map((row) => row.date),
    ).toEqual(["2027-11-01"]);
  });

  it("returns an empty list for a country with no rows, so no calendar block is rendered", () => {
    expect(upcomingOccasions("GB", "2027-01-01")).toEqual([]);
    expect(upcomingOccasions("PL", "2027-07-01", 1)).toEqual([]);
  });

  it("never lists an undated occasion: PL name day and RO Easter are absent", () => {
    const pl = upcomingOccasions("PL", "2027-01-01");
    expect(pl.some((row) => row.occasionKey === "name_day")).toBe(false);
    const ro = upcomingOccasions("RO", "2027-01-01");
    expect(ro.some((row) => row.occasionKey === "easter")).toBe(false);
    expect(ro.map((row) => `${row.occasionKey} ${row.date}`)).toEqual([
      "new_year 2027-01-01",
      "valentines 2027-02-14",
      "womens_day 2027-03-08",
      "mothers_day 2027-05-02",
      "fathers_day 2027-05-09",
      "all_saints 2027-11-01",
      "christmas 2027-12-25",
    ]);
  });

  it("lists each of the seven destinations for a full year without a gap or a duplicate", () => {
    for (const country of DESTINATIONS) {
      const rows = upcomingOccasions(country, "2026-01-01");
      expect(rows.length, country).toBeGreaterThan(0);
      const keys = rows.map((row) => row.occasionKey);
      expect(new Set(keys).size, country).toBe(keys.length);
      for (const row of rows) expect(row.countryIso2, country).toBe(country);
    }
  });

  it("reads an injected calendar instead of the committed one (the provider seam)", () => {
    const rows: readonly OccasionCalendarRow[] = [
      {
        occasionKey: "muguet",
        countryIso2: "XX",
        ruleType: "fixed",
        rule: { kind: "fixed", month: 5, day: 1 },
        observed: true,
        indexableOverride: true,
        promoStartOffsetDays: 7,
      },
      {
        // An unobserved row that carries a date anyway: the seed schema forbids the shape, and
        // this function does not trust it to.
        occasionKey: "student",
        countryIso2: "XX",
        ruleType: "fixed",
        rule: { kind: "fixed", month: 5, day: 1 },
        observed: false,
        indexableOverride: null,
        promoStartOffsetDays: 0,
      },
      {
        // Same day as the first row: the tie-break is the occasion key, so the order is total.
        occasionKey: "easter",
        countryIso2: "XX",
        ruleType: "fixed",
        rule: { kind: "fixed", month: 5, day: 1 },
        observed: true,
        indexableOverride: null,
        promoStartOffsetDays: 14,
      },
    ];
    expect(
      upcomingOccasions("XX", "2027-01-01", 12, rows).map(
        (row) => row.occasionKey,
      ),
    ).toEqual(["easter", "muguet"]);
  });
});

describe("nextOccasions: the count-windowed read (spec 007 §2)", () => {
  it("returns the next n dated occasions in date order", () => {
    expect(nextOccasions("PL", "2027-06-01", 3).map((row) => row.date)).toEqual(
      ["2027-06-23", "2027-10-14", "2027-11-01"],
    );
  });

  it("returns fewer than n when the horizon holds fewer, and none for an unknown country", () => {
    expect(nextOccasions("GB", "2027-01-01", 5)).toEqual([]);
    const all = nextOccasions("NL", "2027-01-01", 10_000);
    expect(all.length).toBeLessThan(10_000);
    expect(all.length).toBeGreaterThan(0);
    expect(NEXT_OCCASIONS_HORIZON_MONTHS).toBe(60);
  });

  it("reads an injected calendar too", () => {
    expect(
      nextOccasions("XX", "2027-01-01", 1, [
        {
          occasionKey: "muguet",
          countryIso2: "XX",
          ruleType: "fixed",
          rule: { kind: "fixed", month: 5, day: 1 },
          observed: true,
          indexableOverride: null,
          promoStartOffsetDays: 7,
        },
      ]).map((row) => row.date),
    ).toEqual(["2027-05-01"]);
  });
});

describe("observedUndatedOccasions: the 'also observed here' line (spec 007 §2)", () => {
  it("names the observed rows that carry no computable date", () => {
    expect(observedUndatedOccasions("PL")).toEqual(["name_day"]);
    expect(observedUndatedOccasions("RO")).toEqual(["easter"]);
    expect(observedUndatedOccasions("DE")).toEqual([]);
    expect(observedUndatedOccasions("GB")).toEqual([]);
  });

  it("excludes an unobserved `none` row and sorts what is left", () => {
    expect(
      observedUndatedOccasions("XX", [
        {
          occasionKey: "name_day",
          countryIso2: "XX",
          ruleType: "none",
          rule: { kind: "none" },
          observed: true,
          indexableOverride: null,
          promoStartOffsetDays: 0,
        },
        {
          occasionKey: "easter",
          countryIso2: "XX",
          ruleType: "none",
          rule: { kind: "none" },
          observed: true,
          indexableOverride: null,
          promoStartOffsetDays: 0,
        },
        {
          occasionKey: "student",
          countryIso2: "XX",
          ruleType: "none",
          rule: { kind: "none" },
          observed: false,
          indexableOverride: null,
          promoStartOffsetDays: 0,
        },
        {
          occasionKey: "muguet",
          countryIso2: "XX",
          ruleType: "fixed",
          rule: { kind: "fixed", month: 5, day: 1 },
          observed: true,
          indexableOverride: null,
          promoStartOffsetDays: 7,
        },
      ]),
    ).toEqual(["easter", "name_day"]);
  });
});

describe("the shared fixture barrel (tests/fixtures/index.ts)", () => {
  it("exposes one flat row per dated occurrence, in the catalogue slug form", () => {
    const dated = occasionRuleFixtures.flatMap((row) =>
      OCCASION_FIXTURE_YEARS.filter((year) => row.dates[year] !== null),
    );
    expect(occasionDates).toHaveLength(dated.length);
    for (const row of occasionDates) {
      expect(row.occasion).not.toContain("_");
      expect(ISO_DATE.test(row.date), row.date).toBe(true);
      expect(row.country).toMatch(/^[A-Z]{2}$/);
    }
  });

  it("covers 62 rules across five years", () => {
    expect(occasionRuleFixtures).toHaveLength(62);
    expect(OCCASION_FIXTURE_YEARS).toHaveLength(5);
    const years: readonly OccasionFixtureYear[] = OCCASION_FIXTURE_YEARS;
    for (const row of occasionRuleFixtures) {
      expect(Object.keys(row.dates).map(Number).sort()).toEqual([...years]);
    }
  });
});
