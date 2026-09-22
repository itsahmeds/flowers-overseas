/**
 * Calendar arithmetic in the **destination's** zone (spec 009 §2 "The date picker and the
 * cutoff/holiday engine", AC-5, AC-6; `plan/03` §10; TASK-123).
 *
 * Every function here is pure, synchronous and integer-only, and together they are the whole
 * answer to "which day is it where the flowers are going, and has the florist's cutoff passed".
 * Three rules shape them, and each one is a defect this module exists to make impossible:
 *
 *  1. **The server's own zone is never read.** `new Date()` is an instant and carries no zone;
 *    `Date#getDate`, `#getDay`, `#getHours` and `#toISOString`-minus-time all read the *process*
 *    zone, so none of them appears below. The only zone that exists in this file is the IANA zone
 *    the caller passes, and it is a required parameter everywhere — which is what makes AC-5's
 *    "identical under `TZ=UTC`, `TZ=America/New_York` and `TZ=Pacific/Auckland`" a property of
 *    the code rather than of the test machine.
 *  2. **A day is never a number of milliseconds.** `addDays` steps the calendar through
 *    `Date.UTC(y, m - 1, d + n)`, which is exact whatever happens to the wall clock in between;
 *    adding 86 400 000 ms to a zoned instant is the classic way a grid skips 29 March or renders
 *    26 October twice (AC-6). Every date here is a `YYYY-MM-DD` string, and ISO strings sort
 *    chronologically, so ordering and window tests are string comparisons with no zone in them.
 *  3. **Wall clock is compared to wall clock, never to an instant.** "Has 14:00 in Warsaw passed?"
 *    is answered by reading the wall clock in Warsaw and comparing minutes-since-midnight to the
 *    authored cutoff. Converting "14:00 Europe/Warsaw" into a UTC instant first would bake a DST
 *    offset into a value that outlives the DST change, and on the two transition Sundays it is
 *    wrong by an hour — or, at 00:30, by a whole day (spec 005 `DeliveryCutoff`'s note).
 *
 * The one thing this file cannot compute is the zone offset itself: that lives in ICU's zone
 * database, and `fo/no-adhoc-intl` puts the single door to ICU in `src/modules/i18n/format.ts`.
 * `zonedClock()` is that door — it reads a wall clock and returns integers, and every decision
 * made from them is made here.
 */
import { type ZonedClock, zonedClock } from "../../i18n/index.ts";
import type { IsoDate } from "../occasions/index.ts";

/** `HH:mm` — the shape `CountryOperations.sameDayCutoffLocal` is authored and validated in. */
const LOCAL_TIME_PATTERN = /^(?<hour>[01]\d|2[0-3]):(?<minute>[0-5]\d)$/u;

/** `YYYY-MM-DD`. Shape only; `parseIsoDate` is what proves the day exists. */
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;

/** A calendar day as three integers, with no zone and no instant attached. */
export interface CalendarDay {
  readonly year: number;
  /** 1–12. */
  readonly month: number;
  /** 1–31. */
  readonly day: number;
}

/** Split a `YYYY-MM-DD` day, throwing on a shape or a calendar that does not exist. */
export function parseIsoDate(date: IsoDate): CalendarDay {
  const match = ISO_DATE_PATTERN.exec(date);
  if (match === null) {
    throw new RangeError(
      `\`${date}\` is not a \`YYYY-MM-DD\` calendar date (spec 009 §5.2)`,
    );
  }
  const [year, month, day] = [match[1], match[2], match[3]].map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new RangeError(`\`${date}\` is not a \`YYYY-MM-DD\` calendar date`);
  }
  // 2026-02-30 has the right shape and no existence; `Date.UTC` rolls it into March, so the
  // round trip is what refuses it. `Date.UTC` is used as fixed-offset arithmetic here, never as a
  // zone: every value in and out is a calendar day.
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.toISOString().slice(0, 10) !== date) {
    throw new RangeError(
      `\`${date}\` is not a day that exists in the Gregorian calendar`,
    );
  }
  return { year, month, day };
}

/** Three integers as a `YYYY-MM-DD` day. Normalises, so `day = 0` is the month before. */
export function isoDateOf(parts: CalendarDay): IsoDate {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
    .toISOString()
    .slice(0, 10);
}

/**
 * The calendar day `offset` days after `date` — the only way this module moves through a grid.
 *
 * Exact across a DST transition and across a month, year or leap-day boundary, because it adds to
 * the *day* field and lets `Date.UTC` normalise; there is no duration and no zone in it, which is
 * the whole of AC-6's "each calendar day exactly once, no day skipped or duplicated".
 */
export function addDays(date: IsoDate, offset: number): IsoDate {
  const parts = parseIsoDate(date);
  return isoDateOf({ ...parts, day: parts.day + offset });
}

/**
 * ISO-8601 weekday of a calendar day: Monday = 1 … Sunday = 7, the numbering
 * `CountryOperations.deliveryDays` is authored in and the one Postgres and `Intl` agree on.
 *
 * `getUTCDay` reads the UTC weekday of a UTC midnight, so the process zone cannot reach it.
 */
export function isoWeekday(date: IsoDate): number {
  const parts = parseIsoDate(date);
  const sundayFirst = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day),
  ).getUTCDay();
  return sundayFirst === 0 ? 7 : sundayFirst;
}

/** Minutes since local midnight for an authored `HH:mm`. `"14:00"` → 840. */
export function minuteOfDay(localTime: string): number {
  const match = LOCAL_TIME_PATTERN.exec(localTime);
  const hour = Number(match?.groups?.hour);
  const minute = Number(match?.groups?.minute);
  if (match === null || Number.isNaN(hour) || Number.isNaN(minute)) {
    throw new RangeError(
      `\`${localTime}\` is not an \`HH:mm\` wall-clock time (spec 007's \`CountryOperations\`)`,
    );
  }
  return hour * 60 + minute;
}

/** The wall clock in `timeZone` at `instant`, as integers. The single read of ICU's zone data. */
export function clockIn(instant: Date, timeZone: string): ZonedClock {
  return zonedClock(instant, timeZone);
}

/**
 * **Which calendar day is it in `timeZone` right now?** — the first question every answer in this
 * module hangs off, and the one a server that read its own zone would get wrong for a third of
 * the day in Warsaw and for half of it in Auckland.
 */
export function zonedDate(instant: Date, timeZone: string): IsoDate {
  const clock = clockIn(instant, timeZone);
  return isoDateOf(clock);
}

/**
 * Minutes since midnight on the wall clock in `timeZone` at `instant`.
 *
 * Seconds are floored away deliberately: the cutoff is authored to the minute, and a comparison
 * that counted seconds would make "14:00:30" a different answer from "14:00" on a page whose
 * whole point is that the buyer can read the rule off the screen.
 */
export function zonedMinuteOfDay(instant: Date, timeZone: string): number {
  const clock = clockIn(instant, timeZone);
  return clock.hour * 60 + clock.minute;
}

/** Guard for a window length, so a caller cannot ask for a grid of 10 000 days. */
export function assertDayCount(days: number, max: number): number {
  if (!Number.isInteger(days) || days < 1 || days > max) {
    throw new RangeError(
      `a delivery window is 1…${String(max)} days, received ${String(days)}`,
    );
  }
  return days;
}
