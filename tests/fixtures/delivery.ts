/**
 * The delivery-calendar corpus (spec 009 AC-5, AC-6, AC-7, AC-11; T-05, T-06, T-07, T-11;
 * TASK-123).
 *
 * Every value here is **hand-tabled from the rule, not read back from the subject**, which is the
 * property that makes `tests/unit/geo-delivery.test.ts` fail when the calendar is wrong rather
 * than when it changes:
 *
 *  - the wall-clock rows come from the EU's own DST rule — the last Sunday of March and of
 *    October, switching at **01:00 UTC** — applied to `Europe/Warsaw` (UTC+1 / UTC+2) and
 *    `Europe/London` (UTC+0 / UTC+1). They were transcribed from that rule and then checked once
 *    against ICU with `Intl.DateTimeFormat(…, { timeZoneName: "short" })`, a different code path
 *    from the one under test, to catch a transcription slip. Nothing here was produced by
 *    `zonedClock`, `cutoffAt` or `deliveryGrid`;
 *  - the expected grid is written out day by day with its weekday beside it, so a reader can
 *    check it against a paper calendar and a reviewer can see the Sunday;
 *  - the `operations` blocks are **fixtures, not data**. TASK-123 shipped the machinery and proved
 *    it against these shapes; TASK-124 authored Poland's real block in `src/config/countries.ts`
 *    (spec 009 §13 Q3) and its real holidays in `seed/data/holidays.json`, and the registry path
 *    over those is asserted in `tests/unit/geo-delivery.test.ts`. The fixtures stay, because the
 *    arithmetic must not depend on what one country happens to have authored.
 *
 * `plan/13` D6's rule applies to all of it: a date we have not checked is not a fixture.
 */
import type { CountryOperations } from "../../src/config/countries.ts";

/* -------------------------------------------------------------------------- */
/* Operational fixtures.                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The shape spec 009 §13 Q3 describes for Poland — `Europe/Warsaw`, a 14:00 cutoff, Monday to
 * Saturday, no Sunday delivery. **A fixture, deliberately**, equal to what TASK-124 authored into
 * `src/config/countries.ts`: a test that needs the shape must not depend on the registry keeping
 * it, and `tests/unit/countries-config.test.ts` pins the registry's own copy.
 */
export const WARSAW_OPERATIONS: CountryOperations = {
  ianaZone: "Europe/Warsaw",
  sameDayCutoffLocal: "14:00",
  deliveryDays: [1, 2, 3, 4, 5, 6],
  sundayDelivery: "none",
};

/**
 * The same shape in `Europe/London`. AC-6 names London beside Warsaw because the two change
 * their clocks at the same instant from **different** offsets (+0/+1 against +1/+2), so an
 * implementation that had quietly hard-coded "Europe is UTC+1" would pass one and fail the other.
 *
 * The destination carried with it in the tests is `NL`, because `CountryIso2` is the closed set of
 * `src/config/countries.ts` and the United Kingdom is a buyer market rather than a destination
 * (`plan/02`). The country code only selects holiday and occasion rows; the subject of these
 * cases is the **zone**, and the suites that use this block pass an empty holiday provider and an
 * empty occasion calendar so no Dutch data reaches a London-zone assertion.
 */
export const LONDON_OPERATIONS: CountryOperations = {
  ianaZone: "Europe/London",
  sameDayCutoffLocal: "14:00",
  deliveryDays: [1, 2, 3, 4, 5, 6],
  sundayDelivery: "none",
};

/** Sunday delivery every week — the `always` branch of spec 002 §5.1's three-valued column. */
export const SUNDAY_ALWAYS_OPERATIONS: CountryOperations = {
  ...WARSAW_OPERATIONS,
  deliveryDays: [1, 2, 3, 4, 5, 6, 7],
  sundayDelivery: "always",
};

/** Sunday delivery on peak dates only — the `peak` branch, which needs a peak-date set to open. */
export const SUNDAY_PEAK_OPERATIONS: CountryOperations = {
  ...SUNDAY_ALWAYS_OPERATIONS,
  sundayDelivery: "peak",
};

/** Monday to Friday: the block that makes `notDeliveryDay` reachable, as Saturday closes. */
export const WEEKDAYS_ONLY_OPERATIONS: CountryOperations = {
  ...WARSAW_OPERATIONS,
  deliveryDays: [1, 2, 3, 4, 5],
};

/** Midnight cutoff: same-day delivery is never open, so "earliest" is always tomorrow. */
export const MIDNIGHT_CUTOFF_OPERATIONS: CountryOperations = {
  ...WARSAW_OPERATIONS,
  sameDayCutoffLocal: "00:00",
};

/* -------------------------------------------------------------------------- */
/* AC-5: the three process zones.                                             */
/* -------------------------------------------------------------------------- */

/**
 * The zones AC-5 names. `Pacific/Auckland` is the one that matters: it is across the date line
 * from every destination we serve and up to 12 hours ahead, so for a third of every UTC day a
 * calendar that read the process zone would start its grid on the wrong day — and during the
 * southern summer it is 12 hours ahead while Warsaw is 1, which is the largest gap the set offers.
 */
export const PROCESS_ZONES = [
  "UTC",
  "America/New_York",
  "Pacific/Auckland",
] as const;

/* -------------------------------------------------------------------------- */
/* AC-6: the wall clock across the four transition Sundays.                   */
/* -------------------------------------------------------------------------- */

/** One instant, and the wall clock a correct reader returns for it in one zone. */
export interface ZoneReadingFixture {
  /** Why this row exists, in the words a failure should print. */
  readonly label: string;
  /** The instant, as an unambiguous UTC timestamp — never a local string. */
  readonly instant: string;
  readonly timeZone: string;
  /** The calendar day in `timeZone`, `YYYY-MM-DD`. */
  readonly localDate: string;
  /** 0–23 on the wall clock in `timeZone`. */
  readonly localHour: number;
  readonly localMinute: number;
  /** The offset from UTC in hours at that instant — the fact a naive implementation freezes. */
  readonly offsetHours: number;
}

/**
 * The four transition Sundays of 2026–2027 that AC-6 names, for both zones.
 *
 * Read the `offsetHours` column down each spring pair: it changes **inside the day**, which is the
 * whole point. The two `02:30` rows of each autumn Sunday are the same wall clock at two
 * different instants an hour apart — the repeated hour — and a correct reader returns 02:30 for
 * both and the same calendar day for both. On each spring Sunday the hour a naive `+1` would
 * print (02:30 in Warsaw, 01:30 in London) **does not exist**, and the row that would have been
 * it reads an hour later.
 */
export const DST_READINGS: readonly ZoneReadingFixture[] = [
  // — Warsaw, spring forward 2026-03-29: 02:00 CET → 03:00 CEST at 01:00 UTC.
  {
    label: "Warsaw, 00:30 on the spring Sunday, still CET",
    instant: "2026-03-28T23:30:00Z",
    timeZone: "Europe/Warsaw",
    localDate: "2026-03-29",
    localHour: 0,
    localMinute: 30,
    offsetHours: 1,
  },
  {
    label: "Warsaw, the last half-hour before the clocks go forward",
    instant: "2026-03-29T00:30:00Z",
    timeZone: "Europe/Warsaw",
    localDate: "2026-03-29",
    localHour: 1,
    localMinute: 30,
    offsetHours: 1,
  },
  {
    label:
      "Warsaw, the instant a frozen +1 would call 02:30 — 02:30 does not exist that day",
    instant: "2026-03-29T01:30:00Z",
    timeZone: "Europe/Warsaw",
    localDate: "2026-03-29",
    localHour: 3,
    localMinute: 30,
    offsetHours: 2,
  },
  {
    label: "Warsaw, exactly the authored 14:00 cutoff on the spring Sunday",
    instant: "2026-03-29T12:00:00Z",
    timeZone: "Europe/Warsaw",
    localDate: "2026-03-29",
    localHour: 14,
    localMinute: 0,
    offsetHours: 2,
  },
  // — Warsaw, fall back 2026-10-25: 03:00 CEST → 02:00 CET at 01:00 UTC.
  {
    label: "Warsaw, 00:30 on the autumn Sunday, still CEST",
    instant: "2026-10-24T22:30:00Z",
    timeZone: "Europe/Warsaw",
    localDate: "2026-10-25",
    localHour: 0,
    localMinute: 30,
    offsetHours: 2,
  },
  {
    label: "Warsaw, 02:30 the first time (CEST)",
    instant: "2026-10-25T00:30:00Z",
    timeZone: "Europe/Warsaw",
    localDate: "2026-10-25",
    localHour: 2,
    localMinute: 30,
    offsetHours: 2,
  },
  {
    label: "Warsaw, 02:30 the second time (CET) — the repeated hour",
    instant: "2026-10-25T01:30:00Z",
    timeZone: "Europe/Warsaw",
    localDate: "2026-10-25",
    localHour: 2,
    localMinute: 30,
    offsetHours: 1,
  },
  {
    label: "Warsaw, exactly the authored 14:00 cutoff on the autumn Sunday",
    instant: "2026-10-25T13:00:00Z",
    timeZone: "Europe/Warsaw",
    localDate: "2026-10-25",
    localHour: 14,
    localMinute: 0,
    offsetHours: 1,
  },
  // — Warsaw, spring forward 2027-03-28.
  {
    label: "Warsaw 2027, 00:30 on the spring Sunday",
    instant: "2027-03-27T23:30:00Z",
    timeZone: "Europe/Warsaw",
    localDate: "2027-03-28",
    localHour: 0,
    localMinute: 30,
    offsetHours: 1,
  },
  {
    label: "Warsaw 2027, the instant a frozen +1 would call 02:30",
    instant: "2027-03-28T01:30:00Z",
    timeZone: "Europe/Warsaw",
    localDate: "2027-03-28",
    localHour: 3,
    localMinute: 30,
    offsetHours: 2,
  },
  {
    label:
      "Warsaw 2027, exactly the authored 14:00 cutoff on the spring Sunday",
    instant: "2027-03-28T12:00:00Z",
    timeZone: "Europe/Warsaw",
    localDate: "2027-03-28",
    localHour: 14,
    localMinute: 0,
    offsetHours: 2,
  },
  // — Warsaw, fall back 2027-10-31.
  {
    label: "Warsaw 2027, 00:30 on the autumn Sunday",
    instant: "2027-10-30T22:30:00Z",
    timeZone: "Europe/Warsaw",
    localDate: "2027-10-31",
    localHour: 0,
    localMinute: 30,
    offsetHours: 2,
  },
  {
    label: "Warsaw 2027, 02:30 the first time (CEST)",
    instant: "2027-10-31T00:30:00Z",
    timeZone: "Europe/Warsaw",
    localDate: "2027-10-31",
    localHour: 2,
    localMinute: 30,
    offsetHours: 2,
  },
  {
    label: "Warsaw 2027, 02:30 the second time (CET)",
    instant: "2027-10-31T01:30:00Z",
    timeZone: "Europe/Warsaw",
    localDate: "2027-10-31",
    localHour: 2,
    localMinute: 30,
    offsetHours: 1,
  },
  {
    label:
      "Warsaw 2027, exactly the authored 14:00 cutoff on the autumn Sunday",
    instant: "2027-10-31T13:00:00Z",
    timeZone: "Europe/Warsaw",
    localDate: "2027-10-31",
    localHour: 14,
    localMinute: 0,
    offsetHours: 1,
  },
  // — London, spring forward 2026-03-29: 01:00 GMT → 02:00 BST at 01:00 UTC.
  {
    label: "London, 00:30 on the spring Sunday, still GMT",
    instant: "2026-03-29T00:30:00Z",
    timeZone: "Europe/London",
    localDate: "2026-03-29",
    localHour: 0,
    localMinute: 30,
    offsetHours: 0,
  },
  {
    label:
      "London, 02:30 on the spring Sunday — a frozen +0 would call it 01:30, which is the hour that vanished",
    instant: "2026-03-29T01:30:00Z",
    timeZone: "Europe/London",
    localDate: "2026-03-29",
    localHour: 2,
    localMinute: 30,
    offsetHours: 1,
  },
  {
    label: "London, exactly the authored 14:00 cutoff on the spring Sunday",
    instant: "2026-03-29T13:00:00Z",
    timeZone: "Europe/London",
    localDate: "2026-03-29",
    localHour: 14,
    localMinute: 0,
    offsetHours: 1,
  },
  // — London, fall back 2026-10-25: 02:00 BST → 01:00 GMT at 01:00 UTC.
  {
    label: "London, 00:30 on the autumn Sunday, still BST",
    instant: "2026-10-24T23:30:00Z",
    timeZone: "Europe/London",
    localDate: "2026-10-25",
    localHour: 0,
    localMinute: 30,
    offsetHours: 1,
  },
  {
    label: "London, 01:30 the first time (BST)",
    instant: "2026-10-25T00:30:00Z",
    timeZone: "Europe/London",
    localDate: "2026-10-25",
    localHour: 1,
    localMinute: 30,
    offsetHours: 1,
  },
  {
    label: "London, 01:30 the second time (GMT) — the repeated hour",
    instant: "2026-10-25T01:30:00Z",
    timeZone: "Europe/London",
    localDate: "2026-10-25",
    localHour: 1,
    localMinute: 30,
    offsetHours: 0,
  },
  {
    label: "London, 02:30 on the autumn Sunday, after the change",
    instant: "2026-10-25T02:30:00Z",
    timeZone: "Europe/London",
    localDate: "2026-10-25",
    localHour: 2,
    localMinute: 30,
    offsetHours: 0,
  },
  {
    label: "London, exactly the authored 14:00 cutoff on the autumn Sunday",
    instant: "2026-10-25T14:00:00Z",
    timeZone: "Europe/London",
    localDate: "2026-10-25",
    localHour: 14,
    localMinute: 0,
    offsetHours: 0,
  },
  // — London, spring forward 2027-03-28.
  {
    label: "London 2027, 00:30 on the spring Sunday",
    instant: "2027-03-28T00:30:00Z",
    timeZone: "Europe/London",
    localDate: "2027-03-28",
    localHour: 0,
    localMinute: 30,
    offsetHours: 0,
  },
  {
    label: "London 2027, 02:30 on the spring Sunday",
    instant: "2027-03-28T01:30:00Z",
    timeZone: "Europe/London",
    localDate: "2027-03-28",
    localHour: 2,
    localMinute: 30,
    offsetHours: 1,
  },
  {
    label:
      "London 2027, exactly the authored 14:00 cutoff on the spring Sunday",
    instant: "2027-03-28T13:00:00Z",
    timeZone: "Europe/London",
    localDate: "2027-03-28",
    localHour: 14,
    localMinute: 0,
    offsetHours: 1,
  },
  // — London, fall back 2027-10-31.
  {
    label: "London 2027, 00:30 on the autumn Sunday",
    instant: "2027-10-30T23:30:00Z",
    timeZone: "Europe/London",
    localDate: "2027-10-31",
    localHour: 0,
    localMinute: 30,
    offsetHours: 1,
  },
  {
    label: "London 2027, 01:30 the first time (BST)",
    instant: "2027-10-31T00:30:00Z",
    timeZone: "Europe/London",
    localDate: "2027-10-31",
    localHour: 1,
    localMinute: 30,
    offsetHours: 1,
  },
  {
    label: "London 2027, 01:30 the second time (GMT)",
    instant: "2027-10-31T01:30:00Z",
    timeZone: "Europe/London",
    localDate: "2027-10-31",
    localHour: 1,
    localMinute: 30,
    offsetHours: 0,
  },
  {
    label:
      "London 2027, exactly the authored 14:00 cutoff on the autumn Sunday",
    instant: "2027-10-31T14:00:00Z",
    timeZone: "Europe/London",
    localDate: "2027-10-31",
    localHour: 14,
    localMinute: 0,
    offsetHours: 0,
  },
];

/** One transition Sunday, with the fortnight a grid spanning it must contain. */
export interface DstWindowFixture {
  readonly label: string;
  readonly timeZone: string;
  /** The Sunday the clocks change, `YYYY-MM-DD`. */
  readonly transition: string;
  /** An instant safely inside the grid's **first** day, before that day's 14:00 cutoff. */
  readonly startInstant: string;
  /** The 14 calendar days the grid must contain, in order, written out by hand. */
  readonly days: readonly string[];
}

/**
 * A fortnight around each transition Sunday, starting three days before it so the change falls
 * inside the grid rather than on its edge.
 *
 * The `days` arrays are written out rather than generated: a generator in the fixture would share
 * whatever off-by-one the subject has, and "no day skipped or duplicated" is precisely what
 * AC-6 asks us to prove. Each list is 14 consecutive calendar days, checked against a calendar.
 */
export const DST_WINDOWS: readonly DstWindowFixture[] = [
  {
    label: "Warsaw across 29 March 2026 (spring forward)",
    timeZone: "Europe/Warsaw",
    transition: "2026-03-29",
    // 2026-03-26 09:00 CET.
    startInstant: "2026-03-26T08:00:00Z",
    days: [
      "2026-03-26", // Thu
      "2026-03-27", // Fri
      "2026-03-28", // Sat
      "2026-03-29", // Sun — clocks forward
      "2026-03-30", // Mon
      "2026-03-31", // Tue
      "2026-04-01", // Wed
      "2026-04-02", // Thu
      "2026-04-03", // Fri
      "2026-04-04", // Sat
      "2026-04-05", // Sun
      "2026-04-06", // Mon
      "2026-04-07", // Tue
      "2026-04-08", // Wed
    ],
  },
  {
    label: "Warsaw across 25 October 2026 (fall back)",
    timeZone: "Europe/Warsaw",
    transition: "2026-10-25",
    // 2026-10-22 09:00 CEST.
    startInstant: "2026-10-22T07:00:00Z",
    days: [
      "2026-10-22", // Thu
      "2026-10-23", // Fri
      "2026-10-24", // Sat
      "2026-10-25", // Sun — clocks back
      "2026-10-26", // Mon
      "2026-10-27", // Tue
      "2026-10-28", // Wed
      "2026-10-29", // Thu
      "2026-10-30", // Fri
      "2026-10-31", // Sat
      "2026-11-01", // Sun
      "2026-11-02", // Mon
      "2026-11-03", // Tue
      "2026-11-04", // Wed
    ],
  },
  {
    label: "Warsaw across 28 March 2027 (spring forward)",
    timeZone: "Europe/Warsaw",
    transition: "2027-03-28",
    // 2027-03-25 09:00 CET.
    startInstant: "2027-03-25T08:00:00Z",
    days: [
      "2027-03-25", // Thu
      "2027-03-26", // Fri
      "2027-03-27", // Sat
      "2027-03-28", // Sun — clocks forward
      "2027-03-29", // Mon
      "2027-03-30", // Tue
      "2027-03-31", // Wed
      "2027-04-01", // Thu
      "2027-04-02", // Fri
      "2027-04-03", // Sat
      "2027-04-04", // Sun
      "2027-04-05", // Mon
      "2027-04-06", // Tue
      "2027-04-07", // Wed
    ],
  },
  {
    label: "Warsaw across 31 October 2027 (fall back)",
    timeZone: "Europe/Warsaw",
    transition: "2027-10-31",
    // 2027-10-28 09:00 CEST.
    startInstant: "2027-10-28T07:00:00Z",
    days: [
      "2027-10-28", // Thu
      "2027-10-29", // Fri
      "2027-10-30", // Sat
      "2027-10-31", // Sun — clocks back
      "2027-11-01", // Mon
      "2027-11-02", // Tue
      "2027-11-03", // Wed
      "2027-11-04", // Thu
      "2027-11-05", // Fri
      "2027-11-06", // Sat
      "2027-11-07", // Sun
      "2027-11-08", // Mon
      "2027-11-09", // Tue
      "2027-11-10", // Wed
    ],
  },
  {
    label: "London across 29 March 2026 (spring forward)",
    timeZone: "Europe/London",
    transition: "2026-03-29",
    // 2026-03-26 09:00 GMT.
    startInstant: "2026-03-26T09:00:00Z",
    days: [
      "2026-03-26",
      "2026-03-27",
      "2026-03-28",
      "2026-03-29",
      "2026-03-30",
      "2026-03-31",
      "2026-04-01",
      "2026-04-02",
      "2026-04-03",
      "2026-04-04",
      "2026-04-05",
      "2026-04-06",
      "2026-04-07",
      "2026-04-08",
    ],
  },
  {
    label: "London across 25 October 2026 (fall back)",
    timeZone: "Europe/London",
    transition: "2026-10-25",
    // 2026-10-22 09:00 BST.
    startInstant: "2026-10-22T08:00:00Z",
    days: [
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
    ],
  },
  {
    label: "London across 28 March 2027 (spring forward)",
    timeZone: "Europe/London",
    transition: "2027-03-28",
    // 2027-03-25 09:00 GMT.
    startInstant: "2027-03-25T09:00:00Z",
    days: [
      "2027-03-25",
      "2027-03-26",
      "2027-03-27",
      "2027-03-28",
      "2027-03-29",
      "2027-03-30",
      "2027-03-31",
      "2027-04-01",
      "2027-04-02",
      "2027-04-03",
      "2027-04-04",
      "2027-04-05",
      "2027-04-06",
      "2027-04-07",
    ],
  },
  {
    label: "London across 31 October 2027 (fall back)",
    timeZone: "Europe/London",
    transition: "2027-10-31",
    // 2027-10-28 09:00 BST.
    startInstant: "2027-10-28T08:00:00Z",
    days: [
      "2027-10-28",
      "2027-10-29",
      "2027-10-30",
      "2027-10-31",
      "2027-11-01",
      "2027-11-02",
      "2027-11-03",
      "2027-11-04",
      "2027-11-05",
      "2027-11-06",
      "2027-11-07",
      "2027-11-08",
      "2027-11-09",
      "2027-11-10",
    ],
  },
];

/* -------------------------------------------------------------------------- */
/* AC-7: the grid, day by day, with its reason beside each closed day.        */
/* -------------------------------------------------------------------------- */

/** One expected day of the reference grid. `reason` is `null` where the day is deliverable. */
export interface ExpectedDay {
  readonly date: string;
  /** The weekday a human reads off a calendar, so a reviewer can check the Sunday. */
  readonly weekday: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
  /** The one reason this day is closed on the destination's calendar, or `null`. */
  readonly reason: string | null;
}

/**
 * The instant the reference grid is built at: **02:30 CEST on Sunday 25 October 2026 in Warsaw**,
 * i.e. the first of the two 02:30s of the autumn transition. It is deliberately a moment the
 * process zones disagree about — 00:30 UTC, 20:30 on Saturday in New York, 13:30 on Sunday in
 * Auckland — so a grid built from the server's own day starts on the wrong date in two of the
 * three.
 */
export const REFERENCE_INSTANT = "2026-10-25T00:30:00Z";

/** The destination the reference grid is built for, and the one its occasion rows belong to. */
export const REFERENCE_COUNTRY = "PL";

/**
 * The fortnight from `REFERENCE_INSTANT` in `WARSAW_OPERATIONS`, hand-tabled.
 *
 * 25 October is a Sunday and `sundayDelivery` is `none`, so the grid opens closed; 1 November is
 * the next Sunday. Every other day is a delivery weekday, and the clock is before the 14:00
 * cutoff, so same-day is still open and no day in the window is past a cutoff.
 */
export const REFERENCE_GRID: readonly ExpectedDay[] = [
  {
    date: "2026-10-25",
    weekday: "Sun",
    reason: "delivery.reason.sundayClosed",
  },
  { date: "2026-10-26", weekday: "Mon", reason: null },
  { date: "2026-10-27", weekday: "Tue", reason: null },
  { date: "2026-10-28", weekday: "Wed", reason: null },
  { date: "2026-10-29", weekday: "Thu", reason: null },
  { date: "2026-10-30", weekday: "Fri", reason: null },
  { date: "2026-10-31", weekday: "Sat", reason: null },
  {
    date: "2026-11-01",
    weekday: "Sun",
    reason: "delivery.reason.sundayClosed",
  },
  { date: "2026-11-02", weekday: "Mon", reason: null },
  { date: "2026-11-03", weekday: "Tue", reason: null },
  { date: "2026-11-04", weekday: "Wed", reason: null },
  { date: "2026-11-05", weekday: "Thu", reason: null },
  { date: "2026-11-06", weekday: "Fri", reason: null },
  { date: "2026-11-07", weekday: "Sat", reason: null },
];

/**
 * All Saints' Day in Poland, 1 November 2026 — a **real** row of
 * `seed/data/occasion-country.json` (`all_saints`, `fixed`, observed in PL), which is why the
 * occasion assertions of T-11 read the committed calendar rather than a fixture and still know
 * what to expect. It falls on the Sunday of the reference grid.
 */
export const REFERENCE_OCCASION = {
  date: "2026-11-01",
  occasionKey: "all_saints",
} as const;

/**
 * A holiday row for that same Sunday, used to prove AC-7's precedence: a day that is both a
 * closed Sunday and a public holiday reports **`publicHoliday`** and only that, because the
 * holiday is the specific fact about the day and the Sunday rule is a standing fact the delivery
 * facts state once.
 *
 * It is a fixture rather than a seed row, so the precedence cases do not move when the seed does;
 * Poland's real rows (TASK-124) are asserted against `seed/data/holidays.json` itself.
 */
export const REFERENCE_HOLIDAYS = [
  {
    iso2: "PL",
    date: "2026-11-01",
    nameKey: "delivery.holiday.pl.allSaints",
    closed: true,
  },
  {
    // Observed and still delivering: the calendar must read the flag, not the row's existence.
    iso2: "PL",
    date: "2026-10-30",
    nameKey: "delivery.holiday.pl.openObservance",
    closed: false,
  },
] as const;

/* -------------------------------------------------------------------------- */
/* AC-7 precedence: a holiday outranks the weekly rules, not only Sunday's.   */
/* -------------------------------------------------------------------------- */

/**
 * Poland's Christmas and New Year closures, 2026–2027, as fixture rows: Wigilia (a statutory day
 * off from 2025), Christmas Day, the Second Day of Christmas and New Year's Day. Checked against
 * a paper calendar: 24 December 2026 is a Thursday, 25th a Friday, **26th a Saturday**, and
 * 1 January 2027 a Friday.
 *
 * They exist for one rule `types.ts` documents and `REFERENCE_HOLIDAYS` could not test: **a public
 * holiday outranks the weekly rules.** `REFERENCE_HOLIDAYS`' only closing row falls on a Sunday,
 * so it pins "holiday above `sundayClosed`" and nothing else — the inversion "a closed weekday
 * outranks the holiday" left every case green (`/review 97` round 1). Under
 * `WEEKDAYS_ONLY_OPERATIONS` the 26th is a holiday **on a weekday the destination does not
 * deliver on**, which is the day that inversion changes; the 25th and the 1st are holidays on
 * weekdays it does deliver on, for contrast; and 2 January is the same Saturday with no holiday,
 * so `notDeliveryDay` is shown to be what a holiday-free Saturday still says.
 */
export const WEEKDAY_HOLIDAYS = [
  {
    iso2: "PL",
    date: "2026-12-24",
    nameKey: "delivery.holiday.pl.christmasEve",
    closed: true,
  },
  {
    iso2: "PL",
    date: "2026-12-25",
    nameKey: "delivery.holiday.pl.christmasDay",
    closed: true,
  },
  {
    iso2: "PL",
    date: "2026-12-26",
    nameKey: "delivery.holiday.pl.secondDayOfChristmas",
    closed: true,
  },
  {
    iso2: "PL",
    date: "2027-01-01",
    nameKey: "delivery.holiday.pl.newYearsDay",
    closed: true,
  },
] as const;

/** 09:00 CET on Monday 21 December 2026 in Warsaw: before the cutoff, so no day is past it. */
export const WEEKDAY_HOLIDAY_INSTANT = "2026-12-21T08:00:00Z";

/**
 * The fortnight from `WEEKDAY_HOLIDAY_INSTANT` under `WEEKDAYS_ONLY_OPERATIONS` (Monday–Friday,
 * no Sunday) with `WEEKDAY_HOLIDAYS`, hand-tabled — each closed day with the **one** reason it
 * carries.
 */
export const WEEKDAY_HOLIDAY_GRID: readonly ExpectedDay[] = [
  { date: "2026-12-21", weekday: "Mon", reason: null },
  { date: "2026-12-22", weekday: "Tue", reason: null },
  { date: "2026-12-23", weekday: "Wed", reason: null },
  {
    date: "2026-12-24",
    weekday: "Thu",
    reason: "delivery.reason.publicHoliday",
  },
  {
    date: "2026-12-25",
    weekday: "Fri",
    reason: "delivery.reason.publicHoliday",
  },
  {
    // The case: a holiday on a closed weekday says `publicHoliday`, not `notDeliveryDay`.
    date: "2026-12-26",
    weekday: "Sat",
    reason: "delivery.reason.publicHoliday",
  },
  {
    date: "2026-12-27",
    weekday: "Sun",
    reason: "delivery.reason.sundayClosed",
  },
  { date: "2026-12-28", weekday: "Mon", reason: null },
  { date: "2026-12-29", weekday: "Tue", reason: null },
  { date: "2026-12-30", weekday: "Wed", reason: null },
  { date: "2026-12-31", weekday: "Thu", reason: null },
  {
    date: "2027-01-01",
    weekday: "Fri",
    reason: "delivery.reason.publicHoliday",
  },
  {
    // The contrast: the same weekday with no holiday on it.
    date: "2027-01-02",
    weekday: "Sat",
    reason: "delivery.reason.notDeliveryDay",
  },
  {
    date: "2027-01-03",
    weekday: "Sun",
    reason: "delivery.reason.sundayClosed",
  },
];
