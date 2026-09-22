/**
 * **The delivery calendar** — spec 009 AC-5, AC-6, AC-7 (unit half) and AC-11 (unit half);
 * T-05, T-06, T-07, T-11; TASK-123.
 *
 * This is the suite that decides whether we may make a delivery promise, so it is written against
 * the one failure mode a date suite is prone to: passing with its subject removed. Three rules
 * were applied to every assertion below.
 *
 *  1. **Nothing is compared to itself.** Every expected date, wall clock and reason comes from
 *     `tests/fixtures/delivery.ts`, which is hand-tabled from the EU DST rule and a paper
 *     calendar; no expectation is produced by `zonedClock`, `cutoffAt` or `deliveryGrid`.
 *  2. **"Identical under three zones" is never the whole assertion.** A calendar that returned
 *     `[]` everywhere would be perfectly zone-independent. So each zone-independence case pairs
 *     the cross-zone comparison with an equality against the tabled grid, and a **control**
 *     asserts that the process zone really changed — that `new Date(instant).getDate()` differs
 *     between the three — so the harness is proven to bite before it is trusted.
 *  3. **Each rule is mutated and watched go red.** The `mutations` describe block shifts the
 *     cutoff by an hour, moves a holiday by a day, renames the zone and drops a weekday, and
 *     asserts the answer *changes*. Those cases are the standing proof that the assertions above
 *     are load-bearing rather than decorative; they fail if the calendar ever stops reading one
 *     of its four inputs.
 *
 * **The registry path, end to end (TASK-124).** TASK-123 shipped this suite when no country in
 * `src/config/countries.ts` carried an `operations` block, so the registry wiring could only be
 * asserted in `unavailable`. TASK-124 authored Poland's block (spec 009 §13 Q3) and its 2026–2027
 * holidays, and the "`pickerState()`" and "holiday provider" blocks below now assert the three
 * states through the **real** registry and the **real** holiday rows: Poland `preview` with every
 * date closed, the six others `unavailable` with no dates, and Poland `live` under a fixture
 * partner with the committed All Saints and Independence Day closing their dates. The arithmetic
 * is still exercised through `deliveryGrid`/`isOpenOn`/`nextOpenDate`, which take `operations`
 * and `state` as parameters.
 *
 * **Every fixture table a loop declares cases from is pinned by length** (`/review 97` via
 * TASK-124): an emptied `DST_READINGS` or `DST_WINDOWS` used to leave the suite green, because a
 * `for … of` over an empty array declares no case at all.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  SeedCountryHolidayRegistrySchema,
  SeedCountryHolidaySchema,
} from "../../seed/schema/holidays.ts";
import { COUNTRIES, type CountryIso2 } from "../../src/config/countries.ts";
import {
  type CalendarContext,
  cutoffAt,
  DELIVERY_WINDOW_MAX_DAYS,
  deliveryCalendar,
  deliveryGrid,
  type DeliveryGridInput,
  type DeliveryPlanInput,
  isOpenOn,
  nextOpenDate,
  pickerState,
  pickerStateFrom,
  reasonFor,
} from "../../src/modules/geo/delivery/calendar.ts";
import {
  closedHolidaysBetween,
  committedHolidayProvider,
  type HolidayProvider,
  withHolidayProvider,
} from "../../src/modules/geo/delivery/holidays.ts";
import {
  COUNTRY_HOLIDAY_ROW_COLUMNS,
  toCountryHolidayRow,
} from "../../src/modules/geo/delivery/projections.ts";
import {
  DeliveryDateSchema,
  DeliveryWindowSchema,
} from "../../src/modules/geo/delivery/schemas.ts";
import {
  type CountryHoliday,
  type DeliveryDate,
  type DeliveryWindow,
  deliveryReasonKeys,
  NOT_ORDERABLE_REASON,
  PICKER_NOTICE_KEYS,
  type PickerState,
  pickerStates,
} from "../../src/modules/geo/delivery/types.ts";
import {
  addDays,
  isoWeekday,
  minuteOfDay,
  parseIsoDate,
  zonedDate,
  zonedMinuteOfDay,
} from "../../src/modules/geo/delivery/zone.ts";
import {
  committedOccasionCalendar,
  type OccasionCalendarRow,
  upcomingOccasions,
} from "../../src/modules/geo/index.ts";
import {
  withActivePartnersProvider,
  staticNoPartnersProvider,
} from "../../src/modules/geo/partners.ts";
import {
  DST_READINGS,
  DST_WINDOWS,
  LONDON_OPERATIONS,
  MIDNIGHT_CUTOFF_OPERATIONS,
  PROCESS_ZONES,
  REFERENCE_COUNTRY,
  REFERENCE_GRID,
  REFERENCE_HOLIDAYS,
  REFERENCE_INSTANT,
  REFERENCE_OCCASION,
  SUNDAY_ALWAYS_OPERATIONS,
  SUNDAY_PEAK_OPERATIONS,
  WARSAW_OPERATIONS,
  WEEKDAY_HOLIDAY_GRID,
  WEEKDAY_HOLIDAY_INSTANT,
  WEEKDAY_HOLIDAYS,
  WEEKDAYS_ONLY_OPERATIONS,
} from "../fixtures/delivery.ts";

/* -------------------------------------------------------------------------- */
/* Harness.                                                                   */
/* -------------------------------------------------------------------------- */

type ProcessZone = (typeof PROCESS_ZONES)[number];

/** Put back a `process.env.TZ` value exactly as it was found — including "was never set". */
function restoreProcessZone(previous: string | undefined): void {
  if (previous === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = previous;
  }
}

/**
 * Run `body` with the **process** zone set to `timeZone`, then restore it.
 *
 * Node re-reads `process.env.TZ` on every `Date` call, so this really does move the machine's
 * clock under the subject — which is what AC-5 asks for and what a `vi.stubEnv` of a cached value
 * would not give. `body` must be synchronous; `withProcessTimeZoneAsync` is its twin for a body
 * that awaits.
 */
function withProcessTimeZone<T>(timeZone: string, body: () => T): T {
  const previous = process.env.TZ;
  process.env.TZ = timeZone;
  try {
    return body();
  } finally {
    restoreProcessZone(previous);
  }
}

/**
 * The async twin: the zone is held across the body's awaits and restored in `finally`. Safe
 * because Vitest runs one file's cases one after another; nothing else in this worker reads the
 * process zone while the body is suspended.
 */
async function withProcessTimeZoneAsync<T>(
  timeZone: string,
  body: () => Promise<T>,
): Promise<T> {
  const previous = process.env.TZ;
  process.env.TZ = timeZone;
  try {
    return await body();
  } finally {
    restoreProcessZone(previous);
  }
}

/**
 * What the process's own clock reads at `REFERENCE_INSTANT` — the naive `Date` getters, which are
 * exactly the reads the calendar must never make. It tells the three zones apart from each other
 * and from any other host zone (Karachi reads `2026-10-25 5`), so it is how the harness proves
 * which zone it is really in rather than which one it set.
 */
function processClockProbe(): string {
  const at = new Date(REFERENCE_INSTANT);
  return `${String(at.getFullYear())}-${String(at.getMonth() + 1)}-${String(at.getDate())} ${String(at.getHours())}`;
}

/** The probe each of AC-5's three zones must read. Hand-worked: 00:30 UTC on 25 October 2026. */
const PROBE_BY_ZONE: Readonly<Record<ProcessZone, string>> = {
  UTC: "2026-10-25 0",
  "America/New_York": "2026-10-24 20",
  "Pacific/Auckland": "2026-10-25 13",
};

/** Fail unless the process is really in `zone`: the variable is set *and* the clock follows it. */
function assertProcessZone(zone: ProcessZone): void {
  expect(process.env.TZ, "process.env.TZ at the start of the case").toBe(zone);
  expect(processClockProbe(), `the process clock under TZ=${zone}`).toBe(
    PROBE_BY_ZONE[zone],
  );
}

/**
 * The zone this file was launched in, captured when it is collected. Every case outside an
 * `underEachProcessZone` block must start in it, and the root `beforeEach` below fails the first
 * case that does not — which is how a harness that `delete`s the variable instead of restoring it
 * (`/review 97` round 1) is caught: the case after the leak goes red, whatever the host.
 */
const LAUNCH_TZ = process.env.TZ;
const LAUNCH_PROBE = processClockProbe();

beforeEach(() => {
  expect(process.env.TZ, "the launch zone, restored by the previous case").toBe(
    LAUNCH_TZ,
  );
  expect(processClockProbe(), "the launch clock").toBe(LAUNCH_PROBE);
});

/**
 * Declare `body`'s cases once per AC-5 zone, **really run in that zone**: each case starts with the
 * process moved to it, proves the move with `assertProcessZone`, and ends with the zone it found
 * put back. Whatever `TZ` the suite is launched with — or none, on a machine in Karachi — every
 * case below runs under `UTC`, `America/New_York` and `Pacific/Auckland`, so a calendar that read
 * the host's day goes red on every machine, not only on the one whose zone happens to expose it.
 *
 * `body` runs at collection time, in the launch zone, so it may only *declare*: anything read from
 * a clock belongs inside an `it`.
 */
function underEachProcessZone(title: string, body: () => void): void {
  for (const zone of PROCESS_ZONES) {
    describe(`${title} [TZ=${zone}]`, () => {
      let previous: string | undefined;
      beforeEach(() => {
        previous = process.env.TZ;
        process.env.TZ = zone;
        assertProcessZone(zone);
      });
      afterEach(() => {
        restoreProcessZone(previous);
      });
      body();
    });
  }
}

/** Locale-independent ordering, the one the calendar sorts occasion keys by. */
function byCodePoint(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** A holiday provider over fixture rows. The seam TASK-124 replaces with Poland's real ones. */
function fixtureHolidays(
  rows: readonly CountryHoliday[] = REFERENCE_HOLIDAYS,
): HolidayProvider {
  return { holidays: (iso2) => rows.filter((row) => row.iso2 === iso2) };
}

/** No holidays anywhere: the default for cases whose subject is the weekly rules or the zone. */
const NO_HOLIDAYS: HolidayProvider = { holidays: () => [] };

/** No occasions anywhere: the default for cases whose subject is not the marker. */
const NO_OCCASIONS: readonly OccasionCalendarRow[] = [];

const REFERENCE_ISO = REFERENCE_COUNTRY as CountryIso2;

/** The reference grid input, with every seam pinned so the case has one variable. */
function referenceInput(
  state: Exclude<PickerState, "unavailable">,
  overrides: Partial<DeliveryGridInput> = {},
): DeliveryGridInput {
  return {
    countryIso: REFERENCE_ISO,
    operations: WARSAW_OPERATIONS,
    state,
    at: new Date(REFERENCE_INSTANT),
    days: REFERENCE_GRID.length,
    holidayProvider: NO_HOLIDAYS,
    occasionCalendar: committedOccasionCalendar,
    ...overrides,
  };
}

/**
 * The window `REFERENCE_GRID` describes, built from the fixture table rather than from the
 * subject: `live` opens the days the table leaves unexplained, `preview` closes every day and
 * gives the ones the destination's own calendar has no quarrel with §13 Q6's single sentence.
 */
function expectedReferenceWindow(
  state: Exclude<PickerState, "unavailable">,
  reasons: Readonly<Record<string, string>> = {},
): DeliveryWindow {
  const dates: DeliveryDate[] = REFERENCE_GRID.map((day) => {
    const calendarReason = reasons[day.date] ?? day.reason;
    const reasonKey =
      calendarReason ?? (state === "live" ? undefined : NOT_ORDERABLE_REASON);
    return {
      date: day.date,
      selectable: reasonKey === undefined,
      ...(reasonKey === undefined
        ? {}
        : { reasonKey: reasonKey as DeliveryDate["reasonKey"] }),
      occasionKeys:
        day.date === REFERENCE_OCCASION.date
          ? [REFERENCE_OCCASION.occasionKey]
          : [],
    };
  });
  return {
    state,
    timeZone: WARSAW_OPERATIONS.ianaZone,
    cutoffLocal: WARSAW_OPERATIONS.sameDayCutoffLocal,
    dates,
    noticeKey: PICKER_NOTICE_KEYS[state],
  };
}

/* -------------------------------------------------------------------------- */
/* The harness itself, before it is trusted.                                  */
/* -------------------------------------------------------------------------- */

describe("the control: the process zone really moves under the subject", () => {
  /**
   * If this ever stops holding, every AC-5 case below becomes vacuous — three identical runs of
   * the same machine. It is asserted first, and separately, for that reason.
   */
  it("`new Date(instant)` reads a different day and hour in each of AC-5's three zones", () => {
    const naive = PROCESS_ZONES.map((zone) =>
      withProcessTimeZone(zone, processClockProbe),
    );
    expect(naive).toEqual(["2026-10-25 0", "2026-10-24 20", "2026-10-25 13"]);
    expect(naive).toEqual(PROCESS_ZONES.map((zone) => PROBE_BY_ZONE[zone]));
    expect(new Set(naive).size).toBe(PROCESS_ZONES.length);
  });

  it("restores the process zone it found, sync and async, set or unset", async () => {
    const before = process.env.TZ;
    withProcessTimeZone("Pacific/Auckland", () => undefined);
    expect(process.env.TZ).toBe(before);
    await withProcessTimeZoneAsync("Pacific/Auckland", async () => {
      await Promise.resolve();
      expect(processClockProbe()).toBe(PROBE_BY_ZONE["Pacific/Auckland"]);
    });
    expect(process.env.TZ).toBe(before);
    expect(processClockProbe()).toBe(LAUNCH_PROBE);
    // "Was never set" is a value too: it must come back unset, not as the string "undefined".
    try {
      delete process.env.TZ;
      withProcessTimeZone("UTC", () => undefined);
      expect(Object.hasOwn(process.env, "TZ")).toBe(false);
      await withProcessTimeZoneAsync("UTC", () => Promise.resolve());
      expect(Object.hasOwn(process.env, "TZ")).toBe(false);
    } finally {
      restoreProcessZone(before);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* The primitives.                                                            */
/* -------------------------------------------------------------------------- */

describe("calendar arithmetic reads no clock of its own (AC-5)", () => {
  it("`addDays` steps the calendar, not a duration, across a DST Sunday and a leap day", () => {
    // 86 400 000 ms across 2026-03-29 in Warsaw is 23 h of wall clock, not 24.
    expect(addDays("2026-03-28", 1)).toBe("2026-03-29");
    expect(addDays("2026-03-29", 1)).toBe("2026-03-30");
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("`isoWeekday` is Monday = 1 … Sunday = 7 and matches the tabled calendar", () => {
    expect(isoWeekday("2026-10-25")).toBe(7);
    expect(isoWeekday("2026-10-26")).toBe(1);
    expect(isoWeekday("2026-10-31")).toBe(6);
    expect(isoWeekday("2026-11-01")).toBe(7);
    for (const day of REFERENCE_GRID) {
      const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      expect(names[isoWeekday(day.date) - 1]).toBe(day.weekday);
    }
  });

  it("`parseIsoDate` refuses a shape that is not a day and a day that does not exist", () => {
    expect(() => parseIsoDate("2026-02-30")).toThrow(
      /does not exist|Gregorian/u,
    );
    expect(() => parseIsoDate("2026-13-01")).toThrow();
    expect(() => parseIsoDate("26-01-01")).toThrow(/YYYY-MM-DD/u);
    expect(() => parseIsoDate("2026-1-1")).toThrow(/YYYY-MM-DD/u);
    expect(parseIsoDate("2028-02-29")).toEqual({
      year: 2028,
      month: 2,
      day: 29,
    });
  });

  it("`minuteOfDay` refuses anything but an `HH:mm` wall clock", () => {
    expect(minuteOfDay("14:00")).toBe(840);
    expect(minuteOfDay("00:00")).toBe(0);
    expect(minuteOfDay("23:59")).toBe(1439);
    expect(() => minuteOfDay("24:00")).toThrow(/HH:mm/u);
    expect(() => minuteOfDay("2pm")).toThrow(/HH:mm/u);
  });

  it("the three process zones do not reach the primitives", () => {
    for (const zone of PROCESS_ZONES) {
      withProcessTimeZone(zone, () => {
        expect(addDays("2026-10-25", 1)).toBe("2026-10-26");
        expect(isoWeekday("2026-11-01")).toBe(7);
        expect(zonedDate(new Date(REFERENCE_INSTANT), "Europe/Warsaw")).toBe(
          "2026-10-25",
        );
        expect(
          zonedMinuteOfDay(new Date(REFERENCE_INSTANT), "Europe/Warsaw"),
        ).toBe(2 * 60 + 30);
      });
    }
  });
});

/* -------------------------------------------------------------------------- */
/* AC-5 / T-05 — the destination's zone, whatever the server's.               */
/* -------------------------------------------------------------------------- */

describe("AC-5 / T-05: every answer is computed in the destination's zone", () => {
  it("the reference grid equals the hand-tabled fortnight, and is byte-identical in all three process zones", () => {
    const expected = expectedReferenceWindow("live");
    const grids = PROCESS_ZONES.map((zone) =>
      withProcessTimeZone(zone, () => deliveryGrid(referenceInput("live"))),
    );
    for (const [index, grid] of grids.entries()) {
      // Equality against the *fixture*, not against grids[0]: a calendar that returned an empty
      // grid under every zone would satisfy cross-zone identity and nothing else.
      expect(grid, `process zone ${PROCESS_ZONES[index] ?? "?"}`).toEqual(
        expected,
      );
    }
    expect(new Set(grids.map((grid) => JSON.stringify(grid))).size).toBe(1);
  });

  it("the `preview` grid is the same calendar with every date closed, in all three process zones", () => {
    const expected = expectedReferenceWindow("preview");
    for (const zone of PROCESS_ZONES) {
      const grid = withProcessTimeZone(zone, () =>
        deliveryGrid(referenceInput("preview")),
      );
      expect(grid, `process zone ${zone}`).toEqual(expected);
      expect(grid.dates.some((date) => date.selectable)).toBe(false);
      // Surcharges, holiday reasons and occasion markers survive: they are facts about the
      // destination's calendar rather than promises about us (§2's states table).
      expect(
        grid.dates.find((date) => date.date === REFERENCE_OCCASION.date)
          ?.occasionKeys,
      ).toEqual([REFERENCE_OCCASION.occasionKey]);
    }
  });

  it("`cutoffAt` reads the destination's wall clock, not the server's", () => {
    const readings = PROCESS_ZONES.map((zone) =>
      withProcessTimeZone(zone, () =>
        cutoffAt(WARSAW_OPERATIONS, new Date(REFERENCE_INSTANT)),
      ),
    );
    for (const reading of readings) {
      expect(reading).toEqual({
        localTime: "14:00",
        timeZone: "Europe/Warsaw",
        localDate: "2026-10-25",
        localMinuteOfDay: 150,
        sameDayOpen: true,
        earliestDate: "2026-10-25",
      });
    }
  });

  it("`nextOpenDate` gives the same day in all three process zones and the day the calendar says", () => {
    const plan: DeliveryPlanInput = {
      countryIso: REFERENCE_ISO,
      operations: WARSAW_OPERATIONS,
      state: "live",
      at: new Date(REFERENCE_INSTANT),
      holidayProvider: NO_HOLIDAYS,
    };
    for (const zone of PROCESS_ZONES) {
      // 25 October 2026 is a Sunday and `sundayDelivery` is `none`, so the first open day is the
      // Monday — and it is the Monday whichever side of the date line the server is on.
      expect(
        withProcessTimeZone(zone, () => nextOpenDate(plan, "2026-10-25")),
        `process zone ${zone}`,
      ).toBe("2026-10-26");
    }
  });

  it("an instant that is a different calendar day either side of the date line still starts the grid on the destination's day", () => {
    // 23:00 on Sunday 1 November in Warsaw; 11:00 on Monday 2 November in Auckland.
    const at = new Date("2026-11-01T22:00:00Z");
    for (const zone of PROCESS_ZONES) {
      const grid = withProcessTimeZone(zone, () =>
        deliveryGrid(
          referenceInput("live", {
            at,
            days: 3,
            occasionCalendar: NO_OCCASIONS,
          }),
        ),
      );
      expect(
        grid.dates.map((date) => date.date),
        `process zone ${zone}`,
      ).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
      // 23:00 is past the 14:00 cutoff, so the Sunday it is *in* the destination is closed for
      // both of its reasons and the Monday is the first open day.
      expect(grid.dates[0]?.selectable).toBe(false);
      expect(grid.dates[1]?.selectable).toBe(true);
    }
  });

  it("`deliveryWindow` and `deliveryCalendar` answer identically in all three process zones", async () => {
    const { deliveryWindow } =
      await import("../../src/modules/geo/delivery/calendar.ts");
    for (const country of COUNTRIES) {
      const windows = PROCESS_ZONES.map((zone) =>
        withProcessTimeZone(zone, () =>
          JSON.stringify(
            deliveryWindow({
              countryIso: country.iso2,
              from: new Date(REFERENCE_INSTANT),
            }),
          ),
        ),
      );
      expect(new Set(windows).size, country.iso2).toBe(1);
    }
    const calendar = deliveryCalendar({
      now: () => new Date(REFERENCE_INSTANT),
    });
    for (const zone of PROCESS_ZONES) {
      // Restored in `finally` to the zone it found — never `delete`d, which put every case after
      // this one into the host's zone (`/review 97` round 1).
      await withProcessTimeZoneAsync(zone, async () => {
        expect(processClockProbe()).toBe(PROBE_BY_ZONE[zone]);
        await expect(
          calendar.nextAvailableDate({
            countryIso: REFERENCE_ISO,
            from: "2026-10-25",
          }),
        ).resolves.toBeNull();
      });
    }
  });
});

/* -------------------------------------------------------------------------- */
/* AC-6 / T-06 — the four transition Sundays.                                 */
/* -------------------------------------------------------------------------- */

describe("AC-6 / T-06: the DST fixture tables are pinned by length", () => {
  // `for … of DST_READINGS` / `DST_WINDOWS` below declare one case per row, so an emptied table
  // used to leave the suite green with nothing asserted (`/review 97` via TASK-124). These two
  // counts are the only thing that makes the loops' absence a failure.
  it("`DST_READINGS` has 30 rows: the 00:30, 02:30 (and repeated-hour) and 14:00 readings of the four transition Sundays, Warsaw and London", () => {
    expect(DST_READINGS).toHaveLength(30);
  });

  it("`DST_WINDOWS` has 8 rows: four transition Sundays × Warsaw and London", () => {
    expect(DST_WINDOWS).toHaveLength(8);
  });
});

underEachProcessZone(
  "AC-6 / T-06: DST across the 2026–2027 transition Sundays",
  () => {
    for (const reading of DST_READINGS) {
      it(`${reading.label}`, () => {
        const operations =
          reading.timeZone === "Europe/Warsaw"
            ? WARSAW_OPERATIONS
            : LONDON_OPERATIONS;
        const at = new Date(reading.instant);

        // The offset the fixture tables is the offset the reader must be using: this is what
        // "not an hour-shifted one" means, stated as a number rather than as a hope.
        const utcMinuteOfDay =
          at.getUTCHours() * 60 + at.getUTCMinutes() + reading.offsetHours * 60;
        const expectedMinuteOfDay = ((utcMinuteOfDay % 1440) + 1440) % 1440;
        expect(expectedMinuteOfDay).toBe(
          reading.localHour * 60 + reading.localMinute,
        );

        const result = cutoffAt(operations, at);
        expect(result.localDate).toBe(reading.localDate);
        expect(result.localMinuteOfDay).toBe(
          reading.localHour * 60 + reading.localMinute,
        );
        // The authored wall-clock cutoff is carried through unshifted: it is a string a human wrote,
        // not a value derived from an instant.
        expect(result.localTime).toBe("14:00");
        expect(result.timeZone).toBe(reading.timeZone);
        expect(result.sameDayOpen).toBe(result.localMinuteOfDay < 840);
        expect(result.earliestDate).toBe(
          result.sameDayOpen
            ? reading.localDate
            : addDays(reading.localDate, 1),
        );
      });
    }

    it("the two 02:30s of each autumn Sunday are the same wall clock and the same delivery day", () => {
      const pairs = [
        ["2026-10-25T00:30:00Z", "2026-10-25T01:30:00Z", WARSAW_OPERATIONS],
        ["2027-10-31T00:30:00Z", "2027-10-31T01:30:00Z", WARSAW_OPERATIONS],
        ["2026-10-25T00:30:00Z", "2026-10-25T01:30:00Z", LONDON_OPERATIONS],
        ["2027-10-31T00:30:00Z", "2027-10-31T01:30:00Z", LONDON_OPERATIONS],
      ] as const;
      for (const [first, second, operations] of pairs) {
        const a = cutoffAt(operations, new Date(first));
        const b = cutoffAt(operations, new Date(second));
        expect(a.localMinuteOfDay).toBe(b.localMinuteOfDay);
        expect(a.localDate).toBe(b.localDate);
        expect(a.earliestDate).toBe(b.earliestDate);
      }
    });

    it("exactly at the authored cutoff the day has gone: 14:00 is not 'by 14:00'", () => {
      const justBefore = cutoffAt(
        WARSAW_OPERATIONS,
        new Date("2026-10-25T12:59:00Z"),
      );
      const exactly = cutoffAt(
        WARSAW_OPERATIONS,
        new Date("2026-10-25T13:00:00Z"),
      );
      expect(justBefore.localMinuteOfDay).toBe(839);
      expect(justBefore.sameDayOpen).toBe(true);
      expect(justBefore.earliestDate).toBe("2026-10-25");
      expect(exactly.localMinuteOfDay).toBe(840);
      expect(exactly.sameDayOpen).toBe(false);
      expect(exactly.earliestDate).toBe("2026-10-26");
    });

    for (const window of DST_WINDOWS) {
      it(`${window.label}: every day once, none skipped, none duplicated`, () => {
        const operations =
          window.timeZone === "Europe/Warsaw"
            ? WARSAW_OPERATIONS
            : LONDON_OPERATIONS;
        // The enclosing block runs this case under each of AC-5's three process zones.
        const grid = deliveryGrid({
          countryIso: REFERENCE_ISO,
          operations,
          state: "live",
          at: new Date(window.startInstant),
          days: window.days.length,
          holidayProvider: NO_HOLIDAYS,
          occasionCalendar: NO_OCCASIONS,
        });
        const dates = grid.dates.map((date) => date.date);
        expect(dates, window.label).toEqual(window.days);
        expect(new Set(dates).size).toBe(window.days.length);
        expect([...dates].sort(byCodePoint)).toEqual(dates);
        // The transition Sunday is in the grid exactly once — the day a duration-stepped grid
        // either skips or repeats.
        expect(dates.filter((date) => date === window.transition)).toHaveLength(
          1,
        );
      });
    }
  },
);

/* -------------------------------------------------------------------------- */
/* AC-7 / T-07 — exactly one reason.                                          */
/* -------------------------------------------------------------------------- */

/** A context built by hand, so `reasonFor` can be asked about a single rule in isolation. */
function contextOf(
  overrides: Partial<CalendarContext> & { readonly at: string },
): CalendarContext {
  const operations = overrides.operations ?? WARSAW_OPERATIONS;
  return {
    operations,
    reading: cutoffAt(operations, new Date(overrides.at)),
    closedHolidays: overrides.closedHolidays ?? new Set<string>(),
    peakDates: overrides.peakDates ?? new Set<string>(),
  };
}

underEachProcessZone(
  "AC-7 / T-07: a closed date carries exactly one enumerated reason",
  () => {
    // Each `context` is a thunk: `contextOf` reads a clock through `cutoffAt`, and a context built
    // while the file is collected would be built in the launch zone rather than the case's.
    const cases = [
      {
        why: "a day that has already gone in the destination",
        context: () => contextOf({ at: "2026-10-26T08:00:00Z" }),
        date: "2026-10-24",
        reason: "delivery.reason.beforeEarliest",
      },
      {
        why: "today, after today's cutoff",
        context: () => contextOf({ at: "2026-10-26T13:00:00Z" }),
        date: "2026-10-26",
        reason: "delivery.reason.pastCutoff",
      },
      {
        why: "a public holiday in the destination",
        context: () =>
          contextOf({
            at: "2026-10-26T08:00:00Z",
            closedHolidays: new Set(["2026-10-28"]),
          }),
        date: "2026-10-28",
        reason: "delivery.reason.publicHoliday",
      },
      {
        why: "a Sunday where `sundayDelivery` is `none`",
        context: () => contextOf({ at: "2026-10-26T08:00:00Z" }),
        date: "2026-11-01",
        reason: "delivery.reason.sundayClosed",
      },
      {
        why: "a weekday the destination does not deliver on",
        context: () =>
          contextOf({
            at: "2026-10-26T08:00:00Z",
            operations: { ...WARSAW_OPERATIONS, deliveryDays: [1, 2, 3, 4, 5] },
          }),
        date: "2026-10-31",
        reason: "delivery.reason.notDeliveryDay",
      },
      {
        why: "a public holiday on a Saturday the destination does not deliver on",
        context: () =>
          contextOf({
            at: "2026-10-26T08:00:00Z",
            operations: WEEKDAYS_ONLY_OPERATIONS,
            closedHolidays: new Set(["2026-10-31"]),
          }),
        date: "2026-10-31",
        reason: "delivery.reason.publicHoliday",
      },
      {
        why: "an ordinary delivery weekday inside the window",
        context: () => contextOf({ at: "2026-10-26T08:00:00Z" }),
        date: "2026-10-28",
        reason: undefined,
      },
    ] as const;

    for (const testCase of cases) {
      it(`${testCase.why} → ${testCase.reason ?? "selectable"}`, () => {
        expect(reasonFor(testCase.context(), testCase.date)).toBe(
          testCase.reason,
        );
      });
    }

    it("every one of AC-7's five enumerated reasons is reachable, and no sixth is", () => {
      const reached = new Set<string>(
        cases
          .map((testCase) => reasonFor(testCase.context(), testCase.date))
          .filter((reason) => reason !== undefined),
      );
      expect([...reached].sort(byCodePoint)).toEqual(
        [...deliveryReasonKeys]
          .filter((key) => key !== NOT_ORDERABLE_REASON)
          .sort(byCodePoint),
      );
    });

    it("precedence: a Sunday that is also a public holiday says `publicHoliday`, once", () => {
      const context = contextOf({
        at: "2026-10-26T08:00:00Z",
        closedHolidays: new Set(["2026-11-01"]),
      });
      expect(isoWeekday("2026-11-01")).toBe(7);
      expect(reasonFor(context, "2026-11-01")).toBe(
        "delivery.reason.publicHoliday",
      );
    });

    it("precedence: a past Sunday says `beforeEarliest`, not `sundayClosed`", () => {
      const context = contextOf({ at: "2026-10-28T08:00:00Z" });
      expect(reasonFor(context, "2026-10-25")).toBe(
        "delivery.reason.beforeEarliest",
      );
    });

    it("precedence: today past its cutoff says `pastCutoff` even when it is also a holiday", () => {
      const context = contextOf({
        at: "2026-10-28T13:00:00Z",
        closedHolidays: new Set(["2026-10-28"]),
      });
      expect(reasonFor(context, "2026-10-28")).toBe(
        "delivery.reason.pastCutoff",
      );
    });

    it("precedence: a public holiday outranks the weekly rules — on a closed weekday it says `publicHoliday`, once", () => {
      // `REFERENCE_HOLIDAYS`' only closing row is a Sunday, so it pins "holiday above Sunday" and
      // nothing else. Here, Monday–Friday with Poland's Christmas rows: the 26th is a holiday on a
      // Saturday the destination does not deliver on, the 25th and the 1st are holidays on days it
      // does, and 2 January is the same Saturday with no holiday. Each date carries one key, and it
      // is the tabled one.
      const grid = deliveryGrid({
        countryIso: REFERENCE_ISO,
        operations: WEEKDAYS_ONLY_OPERATIONS,
        state: "live",
        at: new Date(WEEKDAY_HOLIDAY_INSTANT),
        days: WEEKDAY_HOLIDAY_GRID.length,
        holidayProvider: fixtureHolidays(WEEKDAY_HOLIDAYS),
        occasionCalendar: NO_OCCASIONS,
      });
      const expected: DeliveryDate[] = WEEKDAY_HOLIDAY_GRID.map((day) => ({
        date: day.date,
        selectable: day.reason === null,
        ...(day.reason === null
          ? {}
          : { reasonKey: day.reason as DeliveryDate["reasonKey"] }),
        occasionKeys: [],
      }));
      expect(grid.dates).toStrictEqual(expected);
      // Said once more as the two days the rule is about, so a failure names them.
      const reasonOf = (date: string) =>
        grid.dates.find((day) => day.date === date)?.reasonKey;
      expect(isoWeekday("2026-12-26")).toBe(6);
      expect(reasonOf("2026-12-26")).toBe("delivery.reason.publicHoliday");
      expect(isoWeekday("2027-01-02")).toBe(6);
      expect(reasonOf("2027-01-02")).toBe("delivery.reason.notDeliveryDay");
      expect(
        SeedCountryHolidayRegistrySchema.safeParse([...WEEKDAY_HOLIDAYS])
          .success,
      ).toBe(true);

      // The promise path agrees: Christmas week reopens on the Monday after.
      const plan: DeliveryPlanInput = {
        countryIso: REFERENCE_ISO,
        operations: WEEKDAYS_ONLY_OPERATIONS,
        state: "live",
        at: new Date(WEEKDAY_HOLIDAY_INSTANT),
        holidayProvider: fixtureHolidays(WEEKDAY_HOLIDAYS),
      };
      expect(isOpenOn(plan, "2026-12-26")).toBe(false);
      expect(nextOpenDate(plan, "2026-12-24")).toBe("2026-12-28");
    });

    it("across a sweep of grids, `reasonKey` is present exactly when `selectable` is false", () => {
      const seen = new Set<string>();
      let closed = 0;
      for (const operations of [
        WARSAW_OPERATIONS,
        LONDON_OPERATIONS,
        SUNDAY_ALWAYS_OPERATIONS,
        SUNDAY_PEAK_OPERATIONS,
        MIDNIGHT_CUTOFF_OPERATIONS,
        // Monday–Friday, so `notDeliveryDay` is reachable: without it the sweep would report four
        // of the five reasons and the enumeration's last branch would go unexercised here.
        WEEKDAYS_ONLY_OPERATIONS,
      ]) {
        for (let day = 0; day < 40; day += 1) {
          for (const state of ["preview", "live"] as const) {
            const at = new Date(
              Date.parse("2026-10-20T11:00:00Z") + day * 86_400_000,
            );
            const grid = deliveryGrid({
              countryIso: REFERENCE_ISO,
              operations,
              state,
              at,
              days: DELIVERY_WINDOW_MAX_DAYS,
              holidayProvider: fixtureHolidays(),
              occasionCalendar: committedOccasionCalendar,
            });
            expect(DeliveryWindowSchema.safeParse(grid).success).toBe(true);
            for (const date of grid.dates) {
              expect(Object.hasOwn(date, "reasonKey")).toBe(!date.selectable);
              if (date.reasonKey !== undefined) {
                closed += 1;
                seen.add(date.reasonKey);
                expect(deliveryReasonKeys).toContain(date.reasonKey);
              }
            }
          }
        }
      }
      expect(closed).toBeGreaterThan(100);
      // `beforeEarliest` cannot occur in a grid — a grid begins at today in the destination — so
      // the four the sweep can reach are asserted here and the fifth in the case table above.
      expect([...seen].sort(byCodePoint)).toEqual(
        [
          NOT_ORDERABLE_REASON,
          "delivery.reason.notDeliveryDay",
          "delivery.reason.pastCutoff",
          "delivery.reason.publicHoliday",
          "delivery.reason.sundayClosed",
        ].sort(byCodePoint),
      );
    });

    it("`notOrderable` is the preview state's own sentence and appears nowhere else", () => {
      const preview = deliveryGrid(referenceInput("preview"));
      const live = deliveryGrid(referenceInput("live"));
      expect(
        preview.dates.filter((date) => date.reasonKey === NOT_ORDERABLE_REASON),
      ).toHaveLength(
        REFERENCE_GRID.filter((day) => day.reason === null).length,
      );
      expect(
        live.dates.some((date) => date.reasonKey === NOT_ORDERABLE_REASON),
      ).toBe(false);
    });

    it("the three `sundayDelivery` rules are the only thing that opens a Sunday", () => {
      const base = {
        countryIso: REFERENCE_ISO,
        state: "live" as const,
        at: new Date("2026-10-26T08:00:00Z"),
        days: 7,
        holidayProvider: NO_HOLIDAYS,
        occasionCalendar: NO_OCCASIONS,
      };
      const sunday = "2026-11-01";
      const dayOf = (grid: DeliveryWindow) =>
        grid.dates.find((date) => date.date === sunday);

      expect(
        dayOf(deliveryGrid({ ...base, operations: WARSAW_OPERATIONS }))
          ?.reasonKey,
      ).toBe("delivery.reason.sundayClosed");
      expect(
        dayOf(deliveryGrid({ ...base, operations: SUNDAY_ALWAYS_OPERATIONS }))
          ?.selectable,
      ).toBe(true);
      expect(
        dayOf(deliveryGrid({ ...base, operations: SUNDAY_PEAK_OPERATIONS }))
          ?.reasonKey,
      ).toBe("delivery.reason.sundayClosed");
      expect(
        dayOf(
          deliveryGrid({
            ...base,
            operations: SUNDAY_PEAK_OPERATIONS,
            peakDates: [sunday],
          }),
        )?.selectable,
      ).toBe(true);
    });

    it("a Sunday that `deliveryDays` omits stays closed even under `sundayDelivery: always`", () => {
      // `always` answers "is Sunday deliverable at all"; `deliveryDays` is still the weekly rule,
      // so an inconsistent block closes the day rather than opening it.
      const grid = deliveryGrid({
        countryIso: REFERENCE_ISO,
        operations: {
          ...SUNDAY_ALWAYS_OPERATIONS,
          deliveryDays: [1, 2, 3, 4, 5, 6],
        },
        state: "live",
        at: new Date("2026-10-26T08:00:00Z"),
        days: 7,
        holidayProvider: NO_HOLIDAYS,
        occasionCalendar: NO_OCCASIONS,
      });
      expect(
        grid.dates.find((date) => date.date === "2026-11-01")?.reasonKey,
      ).toBe("delivery.reason.notDeliveryDay");
    });
  },
);

underEachProcessZone(
  "AC-7: `DeliveryDateSchema` refuses a state without its explanation",
  () => {
    const valid = {
      date: "2026-10-26",
      selectable: true,
      occasionKeys: [],
    };

    it("accepts a selectable date with no reason", () => {
      expect(DeliveryDateSchema.safeParse(valid).success).toBe(true);
    });

    it("rejects `selectable: false` with no `reasonKey`", () => {
      const result = DeliveryDateSchema.safeParse({
        ...valid,
        selectable: false,
      });
      expect(result.success).toBe(false);
      expect(JSON.stringify(result.error?.issues)).toMatch(/reasonKey/u);
    });

    it("rejects a selectable date that carries a reason — two ways to say 'open' is one too many", () => {
      expect(
        DeliveryDateSchema.safeParse({
          ...valid,
          reasonKey: "delivery.reason.sundayClosed",
        }).success,
      ).toBe(false);
    });

    it("rejects a day that does not exist, and accepts the leap day that does", () => {
      for (const date of [
        "2026-02-30",
        "2027-02-29",
        "2026-04-31",
        "2026-13-01",
      ]) {
        expect(
          DeliveryDateSchema.safeParse({ ...valid, date }).success,
          date,
        ).toBe(false);
      }
      expect(
        DeliveryDateSchema.safeParse({ ...valid, date: "2028-02-29" }).success,
      ).toBe(true);
    });

    it("rejects a reason outside the enumeration", () => {
      expect(
        DeliveryDateSchema.safeParse({
          ...valid,
          selectable: false,
          reasonKey: "delivery.reason.florist_is_tired",
        }).success,
      ).toBe(false);
    });

    it("has no field in which a second reason could be carried", () => {
      expect(
        DeliveryDateSchema.safeParse({
          ...valid,
          selectable: false,
          reasonKey: "delivery.reason.sundayClosed",
          reasonKeys: ["delivery.reason.publicHoliday"],
        }).success,
      ).toBe(false);
    });
  },
);

underEachProcessZone(
  "AC-8's shape half: `DeliveryWindowSchema` refuses a dishonest picker",
  () => {
    const live = expectedReferenceWindow("live");

    it("accepts the windows the calendar builds", () => {
      for (const state of ["preview", "live"] as const) {
        expect(
          DeliveryWindowSchema.safeParse(deliveryGrid(referenceInput(state)))
            .success,
        ).toBe(true);
      }
    });

    it("refuses an `unavailable` window that lists a date, or names a cutoff", () => {
      expect(
        DeliveryWindowSchema.safeParse({ ...live, state: "unavailable" })
          .success,
      ).toBe(false);
      expect(
        DeliveryWindowSchema.safeParse({
          state: "unavailable",
          timeZone: "Europe/Warsaw",
          cutoffLocal: "14:00",
          dates: [],
          noticeKey: PICKER_NOTICE_KEYS.unavailable,
        }).success,
      ).toBe(false);
      expect(
        DeliveryWindowSchema.safeParse({
          state: "unavailable",
          dates: [],
          noticeKey: PICKER_NOTICE_KEYS.unavailable,
        }).success,
      ).toBe(true);
    });

    it("refuses a cutoff with no zone and a zone with no cutoff", () => {
      const without = (field: "cutoffLocal" | "timeZone") => {
        const copy: Record<string, unknown> = { ...live };
        delete copy[field];
        return copy;
      };
      expect(
        DeliveryWindowSchema.safeParse(without("cutoffLocal")).success,
      ).toBe(false);
      expect(DeliveryWindowSchema.safeParse(without("timeZone")).success).toBe(
        false,
      );
    });

    it("refuses a selectable date in a `preview` window", () => {
      const preview = expectedReferenceWindow("preview");
      const dates = preview.dates.map((date, index) =>
        index === 1
          ? { date: date.date, selectable: true, occasionKeys: [] }
          : date,
      );
      expect(
        DeliveryWindowSchema.safeParse({ ...preview, dates }).success,
      ).toBe(false);
    });

    it("refuses `notOrderable` outside `preview`", () => {
      const dates = live.dates.map((date, index) =>
        index === 1
          ? {
              date: date.date,
              selectable: false,
              reasonKey: NOT_ORDERABLE_REASON,
              occasionKeys: [],
            }
          : date,
      );
      expect(DeliveryWindowSchema.safeParse({ ...live, dates }).success).toBe(
        false,
      );
    });
  },
);

/* -------------------------------------------------------------------------- */
/* AC-11 / T-11 — occasion marks.                                             */
/* -------------------------------------------------------------------------- */

underEachProcessZone(
  "AC-11 / T-11: an occasion is marked, never invented",
  () => {
    it("the grid's marks equal `upcomingOccasions` for that destination and window", () => {
      for (const instant of [
        REFERENCE_INSTANT,
        "2026-03-26T08:00:00Z",
        "2027-03-25T08:00:00Z",
        "2026-05-20T08:00:00Z",
        "2026-12-18T08:00:00Z",
      ]) {
        const grid = deliveryGrid(
          referenceInput("live", { at: new Date(instant), days: 14 }),
        );
        const first = grid.dates[0]?.date ?? "";
        const last = grid.dates.at(-1)?.date ?? "";
        const expected = new Map<string, string[]>();
        for (const occasion of upcomingOccasions(
          REFERENCE_COUNTRY,
          first,
          2,
          committedOccasionCalendar,
        )) {
          if (occasion.date > last) continue;
          expected.set(occasion.date, [
            ...(expected.get(occasion.date) ?? []),
            occasion.occasionKey,
          ]);
        }
        for (const date of grid.dates) {
          expect([...date.occasionKeys], `${instant} → ${date.date}`).toEqual(
            (expected.get(date.date) ?? []).sort(byCodePoint),
          );
        }
        // Not a vacuous pass: the reference windows really do contain an occasion.
        expect([...expected.keys()].length).toBeGreaterThan(0);
      }
    });

    it("the tabled occasion is on the tabled day and on no other", () => {
      const grid = deliveryGrid(referenceInput("live"));
      // "The tabled day" is a day of the tabled grid: a window started on the server's day would
      // still contain 1 November, so the window itself is pinned before the mark is read.
      expect(grid.dates.map((date) => date.date)).toEqual(
        REFERENCE_GRID.map((day) => day.date),
      );
      const marked = grid.dates.filter((date) => date.occasionKeys.length > 0);
      expect(marked.map((date) => date.date)).toEqual([
        REFERENCE_OCCASION.date,
      ]);
      expect(marked[0]?.occasionKeys).toEqual([REFERENCE_OCCASION.occasionKey]);
    });

    it("a `rule_type: none` occasion marks nothing, in any window of a whole year", () => {
      // Scoped to the destination on purpose: `grandparents_day` is `none` in one country and
      // `fixed` in Poland, so a set built across all seven would have failed this grid for a row
      // that is perfectly datable here. "Undatable" is a property of a (country, occasion) pair.
      const noneRows = committedOccasionCalendar.filter(
        (row) =>
          row.rule.kind === "none" && row.countryIso2 === REFERENCE_COUNTRY,
      );
      // The seam is real data: PL's `name_day` is `none` **and observed** (`plan/13` B15).
      expect(noneRows.some((row) => row.observed)).toBe(true);
      const undatable = new Set(noneRows.map((row) => row.occasionKey));

      const onlyNone: readonly OccasionCalendarRow[] = noneRows;
      for (let fortnight = 0; fortnight < 26; fortnight += 1) {
        const at = new Date(
          Date.parse("2026-01-05T09:00:00Z") + fortnight * 14 * 86_400_000,
        );
        const withEverything = deliveryGrid(
          referenceInput("live", { at, days: 14 }),
        );
        for (const date of withEverything.dates) {
          for (const key of date.occasionKeys) {
            expect(undatable.has(key), `${date.date} marked \`${key}\``).toBe(
              false,
            );
          }
        }
        const onlyUndatable = deliveryGrid(
          referenceInput("live", { at, days: 14, occasionCalendar: onlyNone }),
        );
        expect(
          onlyUndatable.dates.flatMap((date) => [...date.occasionKeys]),
        ).toEqual([]);
      }
    });

    it("an unobserved occasion marks nothing even where its rule has a date", () => {
      const rows: readonly OccasionCalendarRow[] = [
        {
          occasionKey: "reference_unobserved",
          countryIso2: REFERENCE_COUNTRY,
          ruleType: "fixed",
          rule: { kind: "fixed", month: 11, day: 1 },
          observed: false,
          indexableOverride: null,
          promoStartOffsetDays: 0,
        },
        {
          occasionKey: "reference_observed",
          countryIso2: REFERENCE_COUNTRY,
          ruleType: "fixed",
          rule: { kind: "fixed", month: 11, day: 1 },
          observed: true,
          indexableOverride: null,
          promoStartOffsetDays: 0,
        },
      ];
      const grid = deliveryGrid(
        referenceInput("live", { occasionCalendar: rows }),
      );
      expect(
        grid.dates.find((date) => date.date === "2026-11-01")?.occasionKeys,
      ).toEqual(["reference_observed"]);
    });

    it("another destination's occasion never reaches this destination's grid", () => {
      const rows: readonly OccasionCalendarRow[] = [
        {
          occasionKey: "someone_elses_day",
          countryIso2: "IT",
          ruleType: "fixed",
          rule: { kind: "fixed", month: 11, day: 1 },
          observed: true,
          indexableOverride: null,
          promoStartOffsetDays: 0,
        },
      ];
      const grid = deliveryGrid(
        referenceInput("live", { occasionCalendar: rows }),
      );
      expect(grid.dates.flatMap((date) => [...date.occasionKeys])).toEqual([]);
    });

    it("two occasions on one day are both marked, in a stable order", () => {
      const rows: readonly OccasionCalendarRow[] = [
        "zulu_day",
        "alpha_day",
      ].map((occasionKey) => ({
        occasionKey,
        countryIso2: REFERENCE_COUNTRY,
        ruleType: "fixed",
        rule: { kind: "fixed", month: 11, day: 1 },
        observed: true,
        indexableOverride: null,
        promoStartOffsetDays: 0,
      }));
      const grid = deliveryGrid(
        referenceInput("live", { occasionCalendar: rows }),
      );
      expect(
        grid.dates.find((date) => date.date === "2026-11-01")?.occasionKeys,
      ).toEqual(["alpha_day", "zulu_day"]);
    });

    it("the order is code-point order, not the host locale's collation", () => {
      // ICU's collation puts `_` before digits and letters; code-point order puts `2` (0x32) before
      // `_` (0x5F). Only a locale-independent sort gives `name2, name_day, nameday` on every host.
      const rows: readonly OccasionCalendarRow[] = [
        "nameday",
        "name_day",
        "name2",
      ].map((occasionKey) => ({
        occasionKey,
        countryIso2: REFERENCE_COUNTRY,
        ruleType: "fixed",
        rule: { kind: "fixed", month: 11, day: 1 },
        observed: true,
        indexableOverride: null,
        promoStartOffsetDays: 0,
      }));
      const grid = deliveryGrid(
        referenceInput("live", { occasionCalendar: rows }),
      );
      expect(
        grid.dates.find((date) => date.date === "2026-11-01")?.occasionKeys,
      ).toEqual(["name2", "name_day", "nameday"]);
    });

    it("every mark is a key, and the calendar module writes no date literal", () => {
      const grid = deliveryGrid(referenceInput("live"));
      for (const date of grid.dates) {
        for (const key of date.occasionKeys) {
          expect(key).toMatch(/^[a-z][a-z0-9_]*$/u);
        }
      }
      const moduleDir = resolve(__dirname, "../../src/modules/geo/delivery");
      // A `YYYY-MM-DD` or a spelled month-and-day in **code**; the prose in these files names 29
      // March and 26 October on purpose, so comments are stripped before the grep.
      const DATE_LITERAL =
        /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\b/u;
      for (const file of readdirSync(moduleDir)) {
        const source = readFileSync(join(moduleDir, file), "utf8")
          .replace(/\/\*[\s\S]*?\*\//gu, "")
          .replace(/\/\/.*$/gmu, "");
        expect(
          DATE_LITERAL.test(source),
          `${file} carries a date literal`,
        ).toBe(false);
      }
    });
  },
);

/* -------------------------------------------------------------------------- */
/* `pickerState`, and the registry wiring it gates.                           */
/* -------------------------------------------------------------------------- */

underEachProcessZone(
  "`pickerState()` is the single place the three states are decided",
  () => {
    const table = [
      {
        operationsComplete: false,
        activePartners: false,
        state: "unavailable",
      },
      { operationsComplete: false, activePartners: true, state: "unavailable" },
      { operationsComplete: true, activePartners: false, state: "preview" },
      { operationsComplete: true, activePartners: true, state: "live" },
    ] as const;

    for (const row of table) {
      it(`operations ${String(row.operationsComplete)} × partners ${String(row.activePartners)} → ${row.state}`, () => {
        expect(pickerStateFrom(row)).toBe(row.state);
      });
    }

    it("names exactly the three states of §2's table, and one notice key each", () => {
      expect([...pickerStates]).toEqual(["unavailable", "preview", "live"]);
      expect(Object.keys(PICKER_NOTICE_KEYS).sort(byCodePoint)).toEqual(
        [...pickerStates].sort(byCodePoint),
      );
      expect(new Set(Object.values(PICKER_NOTICE_KEYS)).size).toBe(3);
    });

    it("Phase 0: Poland is `preview`, the six others `unavailable`, and a partner lifts Poland alone", async () => {
      const states = (): Record<string, PickerState> =>
        Object.fromEntries(
          COUNTRIES.map((country) => [country.iso2, pickerState(country.iso2)]),
        );
      // Poland has §13 Q3's block and no florist; nobody else has a block.
      expect(states()).toEqual({
        PL: "preview",
        DE: "unavailable",
        FR: "unavailable",
        ES: "unavailable",
        IT: "unavailable",
        RO: "unavailable",
        NL: "unavailable",
      });
      await withActivePartnersProvider(
        { hasActivePartners: () => true },
        () => {
          // No `operations` block, so no cutoff anybody agreed to: a partner cannot conjure one.
          // Poland's authored block plus a partner is the one `live` picker.
          expect(states()).toEqual({
            PL: "live",
            DE: "unavailable",
            FR: "unavailable",
            ES: "unavailable",
            IT: "unavailable",
            RO: "unavailable",
            NL: "unavailable",
          });
        },
      );
      // The provider is back where it was.
      expect(staticNoPartnersProvider.hasActivePartners("PL")).toBe(false);
      expect(pickerState("PL")).toBe("preview");
    });

    it("an `unavailable` window has no dates, no zone and no cutoff", async () => {
      const { deliveryWindow } =
        await import("../../src/modules/geo/delivery/calendar.ts");
      const withoutOperations = COUNTRIES.filter(
        (country) => country.operations === undefined,
      );
      // Pinned, so an emptied registry cannot make this loop declare nothing.
      expect(withoutOperations.map((country) => country.iso2)).toEqual([
        "DE",
        "FR",
        "ES",
        "IT",
        "RO",
        "NL",
      ]);
      for (const country of withoutOperations) {
        const window = deliveryWindow({
          countryIso: country.iso2,
          from: new Date(REFERENCE_INSTANT),
        });
        expect(window.state).toBe("unavailable");
        expect(window.dates).toEqual([]);
        expect(window.timeZone).toBeUndefined();
        expect(window.cutoffLocal).toBeUndefined();
        expect(window.noticeKey).toBe(PICKER_NOTICE_KEYS.unavailable);
        expect(DeliveryWindowSchema.safeParse(window).success).toBe(true);
      }
    });

    it("Poland's registry window is `preview`: the whole calendar, the committed holidays, nothing selectable", async () => {
      const { deliveryWindow } =
        await import("../../src/modules/geo/delivery/calendar.ts");
      const window = deliveryWindow({
        countryIso: "PL",
        from: new Date(REFERENCE_INSTANT),
        days: DELIVERY_WINDOW_MAX_DAYS,
        occasionCalendar: NO_OCCASIONS,
      });
      expect(DeliveryWindowSchema.safeParse(window).success).toBe(true);
      expect(window.state).toBe("preview");
      expect(window.noticeKey).toBe(PICKER_NOTICE_KEYS.preview);
      // §13 Q3's authored values, read from the registry rather than from a fixture.
      expect(window.timeZone).toBe("Europe/Warsaw");
      expect(window.cutoffLocal).toBe("14:00");
      expect(window.dates).toHaveLength(DELIVERY_WINDOW_MAX_DAYS);
      expect(window.dates.filter((date) => date.selectable)).toEqual([]);
      const reasons = Object.fromEntries(
        window.dates.map((date) => [date.date, date.reasonKey]),
      );
      // 25 Oct 2026 is a Sunday; 1 Nov is All Saints on a Sunday; 11 Nov (Independence Day) is a
      // Wednesday the weekly rules would open — so only the committed holiday row closes it.
      expect(reasons["2026-10-25"]).toBe("delivery.reason.sundayClosed");
      expect(reasons["2026-10-26"]).toBe(NOT_ORDERABLE_REASON);
      expect(reasons["2026-11-01"]).toBe("delivery.reason.publicHoliday");
      expect(reasons["2026-11-10"]).toBe(NOT_ORDERABLE_REASON);
      expect(reasons["2026-11-11"]).toBe("delivery.reason.publicHoliday");
      expect(
        window.dates
          .filter((date) => date.reasonKey === "delivery.reason.publicHoliday")
          .map((date) => date.date),
      ).toEqual(["2026-11-01", "2026-11-11"]);
    });

    it("the same route under a fixture partner is `live`: real selectable dates, the holidays still closed", async () => {
      const { deliveryWindow } =
        await import("../../src/modules/geo/delivery/calendar.ts");
      await withActivePartnersProvider(
        { hasActivePartners: (iso2) => iso2 === "PL" },
        async () => {
          const window = deliveryWindow({
            countryIso: "PL",
            from: new Date(REFERENCE_INSTANT),
            days: DELIVERY_WINDOW_MAX_DAYS,
            occasionCalendar: NO_OCCASIONS,
          });
          expect(DeliveryWindowSchema.safeParse(window).success).toBe(true);
          expect(window.state).toBe("live");
          expect(window.noticeKey).toBe(PICKER_NOTICE_KEYS.live);
          const open = window.dates
            .filter((date) => date.selectable)
            .map((date) => date.date);
          // Mon–Sat, minus the Wednesday that is Independence Day; Sundays closed.
          expect(open).toEqual([
            "2026-10-26",
            "2026-10-27",
            "2026-10-28",
            "2026-10-29",
            "2026-10-30",
            "2026-10-31",
            "2026-11-02",
            "2026-11-03",
            "2026-11-04",
            "2026-11-05",
            "2026-11-06",
            "2026-11-07",
            "2026-11-09",
            "2026-11-10",
            "2026-11-12",
            "2026-11-13",
            "2026-11-14",
          ]);
          const calendar = deliveryCalendar({
            now: () => new Date(REFERENCE_INSTANT),
          });
          await expect(
            calendar.nextAvailableDate({
              countryIso: "PL",
              from: "2026-10-25",
            }),
          ).resolves.toBe("2026-10-26");
          await expect(
            calendar.isDateAvailable({ countryIso: "PL", date: "2026-11-11" }),
          ).resolves.toBe(false);
          await expect(
            calendar.nextAvailableDate({
              countryIso: "PL",
              from: "2026-11-11",
            }),
          ).resolves.toBe("2026-11-12");
          await expect(
            calendar.cutoffFor({ countryIso: "PL", date: "2026-10-26" }),
          ).resolves.toEqual({ localTime: "14:00", timeZone: "Europe/Warsaw" });
        },
      );
    });

    it("a grid longer than the priced table is refused", () => {
      expect(() =>
        deliveryGrid(
          referenceInput("live", { days: DELIVERY_WINDOW_MAX_DAYS + 1 }),
        ),
      ).toThrow(/1…21 days/u);
      expect(() => deliveryGrid(referenceInput("live", { days: 0 }))).toThrow();
      expect(() =>
        deliveryGrid(referenceInput("live", { days: 1.5 })),
      ).toThrow();
    });
  },
);

underEachProcessZone(
  "spec 005's `CutoffEvaluator`, implemented and gated",
  () => {
    const calendar = deliveryCalendar({
      now: () => new Date(REFERENCE_INSTANT),
      holidayProvider: NO_HOLIDAYS,
    });

    it("has the three methods spec 005 declared, each async", () => {
      expect(typeof calendar.nextAvailableDate).toBe("function");
      expect(typeof calendar.isDateAvailable).toBe("function");
      expect(typeof calendar.cutoffFor).toBe("function");
    });

    it("promises nothing while no destination is `live`", async () => {
      for (const country of COUNTRIES) {
        await expect(
          calendar.isDateAvailable({
            countryIso: country.iso2,
            date: "2026-10-26",
          }),
        ).resolves.toBe(false);
        await expect(
          calendar.cutoffFor({ countryIso: country.iso2, date: "2026-10-26" }),
        ).resolves.toBeNull();
        await expect(
          calendar.nextAvailableDate({
            countryIso: country.iso2,
            from: "2026-10-25",
          }),
        ).resolves.toBeNull();
      }
    });

    it("does not so much as read the holiday rows for a destination that is not live", async () => {
      let reads = 0;
      const counting = deliveryCalendar({
        now: () => new Date(REFERENCE_INSTANT),
        holidayProvider: {
          holidays: () => {
            reads += 1;
            return [];
          },
        },
      });
      await counting.isDateAvailable({
        countryIso: REFERENCE_ISO,
        date: "2026-10-26",
      });
      expect(reads).toBe(0);
    });

    it("the pure core answers a `live` plan from the destination's calendar", () => {
      const plan: DeliveryPlanInput = {
        countryIso: REFERENCE_ISO,
        operations: WARSAW_OPERATIONS,
        state: "live",
        at: new Date(REFERENCE_INSTANT),
        holidayProvider: fixtureHolidays(),
      };
      expect(isOpenOn(plan, "2026-10-26")).toBe(true);
      expect(isOpenOn(plan, "2026-10-25")).toBe(false); // Sunday
      expect(isOpenOn(plan, "2026-11-01")).toBe(false); // Sunday and a closing holiday
      expect(isOpenOn(plan, "2026-10-30")).toBe(true); // an observance, `closed: false`
      expect(isOpenOn(plan, "2026-10-24")).toBe(false); // already gone
      expect(nextOpenDate(plan, "2026-10-25")).toBe("2026-10-26");
      expect(nextOpenDate(plan, "2026-11-01")).toBe("2026-11-02");
      // A `from` in the past means "the soonest from now on", not "scan the past".
      expect(nextOpenDate(plan, "2020-01-01")).toBe("2026-10-26");
    });

    it("the same plan in `preview` promises nothing at all", () => {
      const plan: DeliveryPlanInput = {
        countryIso: REFERENCE_ISO,
        operations: WARSAW_OPERATIONS,
        state: "preview",
        at: new Date(REFERENCE_INSTANT),
        holidayProvider: NO_HOLIDAYS,
      };
      expect(isOpenOn(plan, "2026-10-26")).toBe(false);
      expect(nextOpenDate(plan, "2026-10-26")).toBeNull();
    });

    it("`nextAvailableDate` gives up honestly when the destination never opens", () => {
      const plan: DeliveryPlanInput = {
        countryIso: REFERENCE_ISO,
        operations: { ...WARSAW_OPERATIONS, deliveryDays: [7] },
        state: "live",
        at: new Date(REFERENCE_INSTANT),
        holidayProvider: NO_HOLIDAYS,
      };
      // Sunday is the only delivery day and `sundayDelivery` is `none`: no day can ever open.
      expect(nextOpenDate(plan, "2026-10-26")).toBeNull();
    });
  },
);

/* -------------------------------------------------------------------------- */
/* The holiday seam.                                                          */
/* -------------------------------------------------------------------------- */

underEachProcessZone("the holiday provider and its committed file", () => {
  it("`seed/data/holidays.json` parses, and carries Poland's 2026–2027 holidays and nobody else's", () => {
    const file = JSON.parse(
      readFileSync(resolve(__dirname, "../../seed/data/holidays.json"), "utf8"),
    ) as { rows: unknown };
    expect(SeedCountryHolidayRegistrySchema.safeParse(file.rows).success).toBe(
      true,
    );
    // Poland is the only destination with an `operations` block (spec 009 §13 Q3), so it is the
    // only one with a window for a holiday to fall in.
    for (const country of COUNTRIES) {
      if (country.iso2 === "PL") continue;
      expect(
        committedHolidayProvider.holidays(country.iso2),
        country.iso2,
      ).toEqual([]);
    }
    // The fourteen statutory days of each year, pinned by date so a moved row is a red case.
    // Easter 5 Apr 2026 / 28 Mar 2027: Easter Monday +1, Pentecost +49, Corpus Christi +60.
    const byYear = (year: string): string[] =>
      committedHolidayProvider
        .holidays("PL")
        .filter((holiday) => holiday.date.startsWith(year))
        .map(
          (holiday) =>
            `${holiday.date} ${holiday.nameKey.split(".").at(-1) ?? ""}`,
        )
        .sort(byCodePoint);
    expect(byYear("2026")).toEqual([
      "2026-01-01 newYear",
      "2026-01-06 epiphany",
      "2026-04-05 easterSunday",
      "2026-04-06 easterMonday",
      "2026-05-01 labourDay",
      "2026-05-03 constitutionDay",
      "2026-05-24 pentecost",
      "2026-06-04 corpusChristi",
      "2026-08-15 assumption",
      "2026-11-01 allSaints",
      "2026-11-11 independenceDay",
      "2026-12-24 christmasEve",
      "2026-12-25 christmasDay",
      "2026-12-26 secondDayOfChristmas",
    ]);
    expect(byYear("2027")).toEqual([
      "2027-01-01 newYear",
      "2027-01-06 epiphany",
      "2027-03-28 easterSunday",
      "2027-03-29 easterMonday",
      "2027-05-01 labourDay",
      "2027-05-03 constitutionDay",
      "2027-05-16 pentecost",
      "2027-05-27 corpusChristi",
      "2027-08-15 assumption",
      "2027-11-01 allSaints",
      "2027-11-11 independenceDay",
      "2027-12-24 christmasEve",
      "2027-12-25 christmasDay",
      "2027-12-26 secondDayOfChristmas",
    ]);
    expect(committedHolidayProvider.holidays("PL")).toHaveLength(28);
    // Every one of them shuts the florists: none is an observance that still delivers.
    expect(
      committedHolidayProvider
        .holidays("PL")
        .every((holiday) => holiday.closed),
    ).toBe(true);
  });

  it("a nameKey that names another country is a parse error", () => {
    expect(
      SeedCountryHolidaySchema.safeParse({
        iso2: "RO",
        date: "2026-11-01",
        nameKey: "delivery.holiday.pl.allSaints",
        closed: true,
      }).success,
    ).toBe(false);
  });

  it("a nameKey that is a sentence rather than a key is a parse error", () => {
    expect(
      SeedCountryHolidaySchema.safeParse({
        iso2: "PL",
        date: "2026-11-01",
        nameKey: "All Saints' Day",
        closed: true,
      }).success,
    ).toBe(false);
  });

  it("a day that does not exist is a parse error", () => {
    expect(
      SeedCountryHolidaySchema.safeParse({
        iso2: "PL",
        date: "2026-02-30",
        nameKey: "delivery.holiday.pl.nonsense",
        closed: true,
      }).success,
    ).toBe(false);
  });

  it("two rows for one country-day are a parse error — one closed date, one reason", () => {
    expect(
      SeedCountryHolidayRegistrySchema.safeParse([
        REFERENCE_HOLIDAYS[0],
        { ...REFERENCE_HOLIDAYS[0], nameKey: "delivery.holiday.pl.other" },
      ]).success,
    ).toBe(false);
    expect(
      SeedCountryHolidayRegistrySchema.safeParse([...REFERENCE_HOLIDAYS])
        .success,
    ).toBe(true);
  });

  it("`closedHolidaysBetween` returns closing rows inside the window and nothing else", () => {
    const provider = fixtureHolidays();
    const found = closedHolidaysBetween(
      "PL",
      "2026-10-25",
      "2026-11-07",
      provider,
    );
    expect([...found.keys()]).toEqual(["2026-11-01"]);
    // `closed: false` is an observance the florist works through, not a closure.
    expect(found.has("2026-10-30")).toBe(false);
    // Inclusive at both ends; another country's rows are not this country's.
    expect([
      ...closedHolidaysBetween(
        "PL",
        "2026-11-01",
        "2026-11-01",
        provider,
      ).keys(),
    ]).toEqual(["2026-11-01"]);
    expect(
      closedHolidaysBetween("PL", "2026-11-02", "2026-11-07", provider).size,
    ).toBe(0);
    expect(
      closedHolidaysBetween("RO", "2026-01-01", "2027-01-01", provider).size,
    ).toBe(0);
  });

  it("`withHolidayProvider` swaps the active provider and puts it back", async () => {
    // The committed rows close All Saints (1 Nov) and Independence Day (11 Nov) in this window.
    const window = ["2026-10-25", "2026-11-14"] as const;
    expect([...closedHolidaysBetween("PL", ...window).keys()]).toEqual([
      "2026-11-01",
      "2026-11-11",
    ]);
    await withHolidayProvider(NO_HOLIDAYS, () => {
      expect(closedHolidaysBetween("PL", ...window).size).toBe(0);
    });
    await withHolidayProvider(fixtureHolidays(), () => {
      expect([...closedHolidaysBetween("PL", ...window).keys()]).toEqual([
        "2026-11-01",
      ]);
    });
    expect([...closedHolidaysBetween("PL", ...window).keys()]).toEqual([
      "2026-11-01",
      "2026-11-11",
    ]);
  });

  it("`toCountryHolidayRow` is pinned to spec 002's column list", () => {
    const row = toCountryHolidayRow(REFERENCE_HOLIDAYS[0]);
    expect(Object.keys(row)).toEqual([...COUNTRY_HOLIDAY_ROW_COLUMNS]);
    expect(row).toEqual({
      iso2: "PL",
      date: "2026-11-01",
      name: "delivery.holiday.pl.allSaints",
      closed: true,
    });
  });
});

/* -------------------------------------------------------------------------- */
/* The mutations: the standing proof that the assertions above bite.          */
/* -------------------------------------------------------------------------- */

underEachProcessZone(
  "mutations: each of the calendar's four inputs changes the answer",
  () => {
    it("shifting the authored cutoff by an hour moves the earliest deliverable date", () => {
      // 13:30 in Warsaw. With a 14:00 cutoff same-day is still open; with 13:00 it has gone.
      const at = new Date("2026-10-26T12:30:00Z");
      expect(cutoffAt(WARSAW_OPERATIONS, at).earliestDate).toBe("2026-10-26");
      expect(
        cutoffAt({ ...WARSAW_OPERATIONS, sameDayCutoffLocal: "13:00" }, at)
          .earliestDate,
      ).toBe("2026-10-27");
    });

    it("moving a holiday by one day moves the closed date by one day", () => {
      const base = {
        countryIso: REFERENCE_ISO,
        operations: WARSAW_OPERATIONS,
        state: "live" as const,
        at: new Date("2026-10-26T08:00:00Z"),
        days: 7,
        occasionCalendar: NO_OCCASIONS,
      };
      const closedOn = (date: string) =>
        deliveryGrid({
          ...base,
          holidayProvider: fixtureHolidays([
            {
              iso2: "PL",
              date,
              nameKey: "delivery.holiday.pl.movable",
              closed: true,
            },
          ]),
        })
          .dates.filter(
            (day) => day.reasonKey === "delivery.reason.publicHoliday",
          )
          .map((day) => day.date);
      expect(closedOn("2026-10-28")).toEqual(["2026-10-28"]);
      expect(closedOn("2026-10-29")).toEqual(["2026-10-29"]);
    });

    it("naming a different zone changes the day the grid starts on", () => {
      const at = new Date("2026-11-01T22:00:00Z");
      const startsOn = (ianaZone: string) =>
        deliveryGrid({
          countryIso: REFERENCE_ISO,
          operations: { ...WARSAW_OPERATIONS, ianaZone },
          state: "live",
          at,
          days: 3,
          holidayProvider: NO_HOLIDAYS,
          occasionCalendar: NO_OCCASIONS,
        }).dates[0]?.date;
      expect(startsOn("Europe/Warsaw")).toBe("2026-11-01");
      expect(startsOn("Pacific/Auckland")).toBe("2026-11-02");
      expect(startsOn("America/New_York")).toBe("2026-11-01");
    });

    it("dropping a weekday from `deliveryDays` closes exactly that weekday", () => {
      const base = {
        countryIso: REFERENCE_ISO,
        state: "live" as const,
        at: new Date("2026-10-26T08:00:00Z"),
        days: 7,
        holidayProvider: NO_HOLIDAYS,
        occasionCalendar: NO_OCCASIONS,
      };
      const open = (deliveryDays: readonly number[]) =>
        deliveryGrid({
          ...base,
          operations: { ...WARSAW_OPERATIONS, deliveryDays: [...deliveryDays] },
        })
          .dates.filter((day) => day.selectable)
          .map((day) => day.date);
      expect(open([1, 2, 3, 4, 5, 6])).toEqual([
        "2026-10-26",
        "2026-10-27",
        "2026-10-28",
        "2026-10-29",
        "2026-10-30",
        "2026-10-31",
      ]);
      expect(open([1, 2, 4, 5, 6])).toEqual([
        "2026-10-26",
        "2026-10-27",
        "2026-10-29",
        "2026-10-30",
        "2026-10-31",
      ]);
    });

    it("removing the occasion rows removes the marks, and only the marks", () => {
      const marked = deliveryGrid(referenceInput("live"));
      const unmarked = deliveryGrid(
        referenceInput("live", { occasionCalendar: NO_OCCASIONS }),
      );
      expect(marked.dates.flatMap((date) => [...date.occasionKeys])).toEqual([
        REFERENCE_OCCASION.occasionKey,
      ]);
      expect(unmarked.dates.flatMap((date) => [...date.occasionKeys])).toEqual(
        [],
      );
      expect(unmarked.dates.map((date) => date.selectable)).toEqual(
        marked.dates.map((date) => date.selectable),
      );
    });

    it("changing the state changes every verdict and nothing else about the calendar", () => {
      const live = deliveryGrid(referenceInput("live"));
      const preview = deliveryGrid(referenceInput("preview"));
      expect(preview.dates.map((date) => date.date)).toEqual(
        live.dates.map((date) => date.date),
      );
      expect(preview.dates.map((date) => date.occasionKeys)).toEqual(
        live.dates.map((date) => date.occasionKeys),
      );
      expect(
        live.dates.filter((date) => date.selectable).length,
      ).toBeGreaterThan(0);
      expect(preview.dates.filter((date) => date.selectable)).toHaveLength(0);
    });
  },
);
