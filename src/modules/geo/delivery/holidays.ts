/**
 * The public-holiday seam (spec 009 §2 "the destination's public holidays", §5.1, §5.2, AC-7;
 * spec 002 §5.1's `country_holiday`; TASK-123).
 *
 * The shape is the one `partners.ts` and `content/provider.ts` already use, for the same reasons,
 * and three properties make it safe to build a delivery grid on:
 *
 *  - **The rows are a build-time JSON import**, exactly as `occasions/calendar.ts` reads the
 *    occasion calendar and `ui/media/manifest.ts` reads the media manifest. Rendering a picker
 *    costs zero queries and zero fetches (ADR-0015's compute-hour constraint), and
 *    `pnpm check:no-db` covers this directory. There is no zod at read time for the same reason:
 *    the file is validated against `SeedCountryHolidayRegistrySchema` by `pnpm seed:check` and by
 *    `tests/unit/geo-delivery.test.ts`, where the assertion is free.
 *  - **Everything is pure and synchronous**, so `generateStaticParams`, the rendered grid and a
 *    later sitemap builder cannot disagree about whether 3 May is closed in Poland.
 *  - **The provider object is not exported from `src/modules/geo/index.ts`.** A caller able to
 *    name `committedHolidayProvider` could swap it at runtime, and what it decides is whether we
 *    promise a delivery on a day every florist in the country is shut. `withHolidayProvider()` is
 *    module-internal and exists so a fixture calendar can be tested without committing a country's
 *    data; spec 002's `country_holiday` read replaces the body of `getHolidayProvider()` and
 *    nothing else ("country go-live is a data flip, never a code change").
 *
 * **This task ships the seam; the rows are TASK-124's.** `seed/data/holidays.json` is committed
 * empty, which is the honest Phase 0 value: no destination has an `operations` block, so no
 * destination renders a window for a holiday to fall inside.
 */
import holidaysFile from "../../../../seed/data/holidays.json" with { type: "json" };

import type { IsoDate } from "../occasions/index.ts";

import type { CountryHoliday } from "./types.ts";

/** A source of truth for "is the destination shut that day?". */
export interface HolidayProvider {
  /** Every authored holiday of one destination, ISO 3166-1 alpha-2. Order is not significant. */
  holidays(iso2: string): readonly CountryHoliday[];
}

/**
 * The committed rows, as the seed authored them. TypeScript widens every JSON field to its base
 * type, and re-narrowing here is what keeps a runtime parse — and zod — out of the render path
 * (`occasions/calendar.ts`'s rule, applied again).
 */
export const committedHolidays =
  holidaysFile.rows as unknown as readonly CountryHoliday[];

/** Phase 0: the committed dataset, and nothing else. */
export const committedHolidayProvider: HolidayProvider = {
  holidays: (iso2) =>
    committedHolidays.filter((holiday) => holiday.iso2 === iso2),
};

let active: HolidayProvider = committedHolidayProvider;

/** The composition root. The only function outside this file that names a provider. */
export function getHolidayProvider(): HolidayProvider {
  return active;
}

/**
 * Run `body` with `provider` in place of the active one, then restore. Module-internal (see the
 * header): imported by `src/modules/geo/**` and by the calendar's own tests only.
 */
export async function withHolidayProvider<T>(
  provider: HolidayProvider,
  body: () => T | Promise<T>,
): Promise<T> {
  const previous = active;
  active = provider;
  try {
    return await body();
  } finally {
    active = previous;
  }
}

/**
 * The **closing** holidays of one destination inside `[from, toInclusive]`, keyed by date.
 *
 * `closed: false` rows are dropped here rather than at the call site: spec 002 §5.1 carries the
 * flag so that a holiday a country observes and still delivers on can be recorded, and a calendar
 * that treated every row as a closure would refuse a day the florist is open. The window is
 * inclusive at both ends because it is the rendered grid, not a half-open range, and ISO dates
 * compare as strings.
 */
export function closedHolidaysBetween(
  iso2: string,
  from: IsoDate,
  toInclusive: IsoDate,
  provider: HolidayProvider = getHolidayProvider(),
): ReadonlyMap<IsoDate, CountryHoliday> {
  const found = new Map<IsoDate, CountryHoliday>();
  for (const holiday of provider.holidays(iso2)) {
    if (!holiday.closed) continue;
    if (holiday.date < from || holiday.date > toInclusive) continue;
    found.set(holiday.date, holiday);
  }
  return found;
}
