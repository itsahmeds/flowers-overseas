/**
 * The calendar of spec 030a's payouts (§5.2 "Pure functions": `weeklyPeriod`, `localDateIn`;
 * §2.4; AC-8, AC-14, AC-15; TASK-364). Pure, synchronous and integer-only.
 *
 *  - `localDateIn(instant, zone)` is the calendar day in the florist's country zone, read through
 *    the i18n module's one zone door (`zonedClock`, spec 009). No hour is added or subtracted, so
 *    the night the clocks go back (25 October 2026 in Warsaw) is the zone database's job.
 *  - `weeklyPeriod(date)` is the ISO week (Monday to Sunday) holding a calendar day.
 *  - `addDays(date, n)` steps the calendar through `Date.UTC`, which is exact across a month, a
 *    year end or a leap day because it adds to the day field; there is no duration and no zone in
 *    it. The process zone is never read (no `getDate`, `getDay` or `getHours`).
 *
 * Every date is a `YYYY-MM-DD` string, which sorts chronologically, so "before" is a string
 * comparison.
 */
import { zonedClock } from "@/modules/i18n";

/** `YYYY-MM-DD`. */
export type PayoutDate = string;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

function dateOf(year: number, month: number, day: number): PayoutDate {
  const utc = new Date(Date.UTC(year, month - 1, day));
  return `${pad(utc.getUTCFullYear(), 4)}-${pad(utc.getUTCMonth() + 1)}-${pad(utc.getUTCDate())}`;
}

function partsOf(date: PayoutDate): [number, number, number] {
  const match = ISO_DATE.exec(date);
  const [year, month, day] = [match?.[1], match?.[2], match?.[3]].map(Number);
  if (
    match === null ||
    year === undefined ||
    month === undefined ||
    day === undefined ||
    dateOf(year, month, day) !== date
  ) {
    throw new RangeError(`\`${date}\` is not a YYYY-MM-DD calendar date`);
  }
  return [year, month, day];
}

/** The calendar day in `timeZone` at `instant` (spec 030a §5.2 `localDateIn`). */
export function localDateIn(instant: Date, timeZone: string): PayoutDate {
  const clock = zonedClock(instant, timeZone);
  return dateOf(clock.year, clock.month, clock.day);
}

/** The calendar day `offset` days after `date`. */
export function addDays(date: PayoutDate, offset: number): PayoutDate {
  const [year, month, day] = partsOf(date);
  return dateOf(year, month, day + offset);
}

/** ISO weekday: Monday 1 … Sunday 7. Reads the UTC weekday of a UTC midnight only. */
export function isoWeekday(date: PayoutDate): number {
  const [year, month, day] = partsOf(date);
  const sundayFirst = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return sundayFirst === 0 ? 7 : sundayFirst;
}

/** The ISO week (Monday to Sunday) holding `date` (spec 030a §5.2 `weeklyPeriod`). */
export function weeklyPeriod(date: PayoutDate): {
  readonly start: PayoutDate;
  readonly end: PayoutDate;
} {
  const weekday = isoWeekday(date);
  return { start: addDays(date, 1 - weekday), end: addDays(date, 7 - weekday) };
}
