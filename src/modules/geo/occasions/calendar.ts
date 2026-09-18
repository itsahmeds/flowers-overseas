/**
 * The per-destination occasion calendar: the committed `occasion_country` rows plus the two
 * date-ordered reads the corridor page and spec 009 need (spec 007 §2 "Occasion dates", §5,
 * AC-21, AC-22; TASK-089).
 *
 * Three properties, each of them the reason a later task does not have to re-derive this:
 *
 *  - **The rows are a build-time JSON import, exactly as `src/modules/ui/media/manifest.ts` reads
 *    the media manifest.** Rendering a corridor calendar costs zero queries and zero fetches
 *    (spec 007 §2 "Rendering", ADR-0015's compute-hour constraint), and `pnpm check:no-db` covers
 *    this directory. There is no zod at read time for the same reason as the media manifest: the
 *    file is validated against spec 006's `SeedOccasionCountryRegistrySchema` in
 *    `tests/unit/geo-occasions.test.ts`, where the assertion is free, and by `pnpm seed:check`.
 *  - **Everything is pure and synchronous**, so `generateStaticParams`, the rendered calendar and
 *    spec 009's date picker cannot disagree about when Muttertag is.
 *  - **An undated occasion is never invented.** A row whose rule is `none` (PL `name_day` —
 *    `plan/13` B15; RO `easter` until spec 009 AC-12 dated it) and a row the destination does not
 *    observe are both absent from every list here; spec 007 §2 renders the observed-but-undated
 *    ones in the "also observed here" line, which is `observedUndatedOccasions()` below, never
 *    with a guessed date.
 */
import type { OccasionRule } from "../../../../seed/schema/catalogue.ts";

import occasionCountryFile from "../../../../seed/data/occasion-country.json" with { type: "json" };

import {
  type IsoDate,
  type OccasionRuleKind,
  occasionDate,
} from "./evaluate.ts";

/**
 * One `occasion_country` row as a reader needs it (spec 002 §5.1, spec 006's
 * `SeedOccasionCountrySchema`). The typed build-time import of `manifest.ts`: TypeScript widens
 * every JSON discriminant to `string`, and re-narrowing here is what keeps a runtime parse — and
 * zod — out of the render path.
 */
export interface OccasionCalendarRow {
  /** `occasion.key` in spec 005's taxonomy, e.g. `mothers_day`. */
  readonly occasionKey: string;
  /** ISO 3166-1 alpha-2 of the **destination**, e.g. `PL`. */
  readonly countryIso2: string;
  readonly ruleType: OccasionRuleKind;
  readonly rule: OccasionRule;
  /** Does the destination keep the occasion at all? `false` → it has no page and no date. */
  readonly observed: boolean;
  readonly indexableOverride: boolean | null;
  /** Days before the date that the campaign window opens (`seed/data/occasion-country.json`). */
  readonly promoStartOffsetDays: number;
}

/** The committed calendar, as spec 006 authored it. 126 rows: 18 occasions × 7 destinations. */
export const committedOccasionCalendar =
  occasionCountryFile.rows as unknown as readonly OccasionCalendarRow[];

/** One dated occurrence of an occasion in one destination. Date-ordered lists are made of these. */
export interface DatedOccasion {
  readonly occasionKey: string;
  readonly countryIso2: string;
  /** The calendar date in the destination, `YYYY-MM-DD`. */
  readonly date: IsoDate;
  readonly promoStartOffsetDays: number;
  readonly indexableOverride: boolean | null;
}

/** Years the window `[from, endExclusive)` can touch, so every rule is evaluated for each of them. */
function yearsSpanned(from: IsoDate, endExclusive: IsoDate): readonly number[] {
  const first = Number(from.slice(0, 4));
  const last = Number(endExclusive.slice(0, 4));
  const years: number[] = [];
  for (let year = first; year <= last; year += 1) years.push(year);
  return years;
}

/** `from` shifted by whole months, keeping the day of month — the exclusive end of the window. */
function addMonths(from: IsoDate, months: number): IsoDate {
  const year = Number(from.slice(0, 4));
  const month = Number(from.slice(5, 7));
  const day = Number(from.slice(8, 10));
  return new Date(Date.UTC(year, month - 1 + months, day))
    .toISOString()
    .slice(0, 10);
}

/**
 * Every dated occasion of one destination in `[from, endExclusive)`, in date order.
 *
 * ISO `YYYY-MM-DD` strings sort chronologically as strings, so the window test and the ordering
 * are plain string comparisons — no `Date`, no zone, no off-by-one at a DST boundary. Ties (two
 * occasions on the same day) are broken by occasion key so the order is total and a snapshot or a
 * rendered list cannot flap.
 */
function datedOccasionsInWindow(
  countryIso2: string,
  from: IsoDate,
  endExclusive: IsoDate,
  calendar: readonly OccasionCalendarRow[],
): readonly DatedOccasion[] {
  const years = yearsSpanned(from, endExclusive);
  const found: DatedOccasion[] = [];
  for (const row of calendar) {
    if (row.countryIso2 !== countryIso2 || !row.observed) continue;
    for (const year of years) {
      const date = occasionDate(row.rule, year);
      if (date === null || date < from || date >= endExclusive) continue;
      found.push({
        occasionKey: row.occasionKey,
        countryIso2: row.countryIso2,
        date,
        promoStartOffsetDays: row.promoStartOffsetDays,
        indexableOverride: row.indexableOverride,
      });
    }
  }
  return found.sort((a, b) =>
    a.date === b.date
      ? a.occasionKey.localeCompare(b.occasionKey, "en")
      : a.date.localeCompare(b.date),
  );
}

/** The horizon `nextOccasions` searches, in months. Five years — the range of the fixture table. */
export const NEXT_OCCASIONS_HORIZON_MONTHS = 60;

/**
 * **The corridor calendar API** (spec 007 AC-22, consumed by TASK-091): the dated occasions of
 * one destination in the next `months` months, in date order.
 *
 * The window is **inclusive of `from` and exclusive of `from + months`**, so an occasion that
 * falls on the day the page is built is listed and the same occasion one year later is not, and
 * consecutive windows neither drop nor duplicate a day. It wraps the year end without help: every
 * year the window touches is evaluated.
 *
 * A destination with no rows — or none in the window — yields an empty array, which spec 007 §5
 * renders as **no calendar block at all** rather than an empty one.
 *
 * @param countryIso2 the destination, ISO 3166-1 alpha-2.
 * @param from the first day of the window, `YYYY-MM-DD` (the caller's clock, never read here).
 * @param months window length in whole months; 12 for the corridor page.
 * @param calendar the rows to read; the committed set unless a test or a later provider supplies
 *   another, which is the seam spec 002/012 replace without a call-site change.
 */
export function upcomingOccasions(
  countryIso2: string,
  from: IsoDate,
  months = 12,
  calendar: readonly OccasionCalendarRow[] = committedOccasionCalendar,
): readonly DatedOccasion[] {
  return datedOccasionsInWindow(
    countryIso2,
    from,
    addMonths(from, months),
    calendar,
  );
}

/**
 * The count-windowed read spec 007 §2 names: the next `n` dated occasions of a destination on or
 * after `from`, in date order. Searches `NEXT_OCCASIONS_HORIZON_MONTHS`, so a destination with
 * fewer than `n` dated occasions in five years returns fewer rather than looping forever.
 */
export function nextOccasions(
  countryIso2: string,
  from: IsoDate,
  n: number,
  calendar: readonly OccasionCalendarRow[] = committedOccasionCalendar,
): readonly DatedOccasion[] {
  return upcomingOccasions(
    countryIso2,
    from,
    NEXT_OCCASIONS_HORIZON_MONTHS,
    calendar,
  ).slice(0, n);
}

/**
 * The occasions a destination observes but cannot date — spec 007 §2's "also observed here" line.
 * PL `name_day` alone today (`plan/13` B15): the RO `easter` row left this list the day spec 009
 * added the Orthodox-Easter rule type (TASK-122), with no change here, which is what the seam
 * was for.
 */
export function observedUndatedOccasions(
  countryIso2: string,
  calendar: readonly OccasionCalendarRow[] = committedOccasionCalendar,
): readonly string[] {
  return calendar
    .filter(
      (row) =>
        row.countryIso2 === countryIso2 &&
        row.observed &&
        row.rule.kind === "none",
    )
    .map((row) => row.occasionKey)
    .sort((a, b) => a.localeCompare(b, "en"));
}
