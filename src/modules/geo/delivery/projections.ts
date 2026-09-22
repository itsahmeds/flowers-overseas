/**
 * The projection of a seed holiday row onto spec 002 §5.1's `country_holiday` columns (spec 009
 * §5.1's contract table, "a `toCountryHolidayRow()` projection pinned by a column-list test, in
 * spec 006's `to*Row()` style"; TASK-123).
 *
 * The drift this prevents is the one spec 006 named: `seed/data/holidays.json` is Phase 0's
 * holiday table and spec 002's `country_holiday` is Phase 1's, and without a projection pinned by
 * a test the two grow apart until the importer silently drops a column. `COUNTRY_HOLIDAY_ROW_COLUMNS`
 * and `toCountryHolidayRow()` change together or the test fails — the discipline
 * `COUNTRY_ROW_COLUMNS` / `toCountryRow()` already keep for `country`.
 *
 * Two differences from the table are deliberate and recorded here rather than discovered later:
 *
 *  - **`name` carries the message key.** Spec 002 §5.1's column is `name`; `CLAUDE.md` forbids a
 *    literal user-facing string, and "Constitution Day" has to render in four locales beside the
 *    date it closes. So the seed authors `nameKey` and the projection puts the key in `name`,
 *    exactly as `src/config/countries.ts` puts `destinations.pl.name` in the country registry
 *    rather than "Poland". Spec 002's importer resolves it; a holiday *translation* table, if one
 *    is ever wanted, is that spec's to add.
 *  - **The key is `iso2`, not `country_id`.** Every seed projection in the repository is keyed by
 *    the natural key the importer upserts on (`toCountryRow`, `toOccasionCountryRow`), because a
 *    surrogate id does not exist until the row is inserted.
 */
import type { CountryHoliday } from "./types.ts";

/** `country_holiday`'s columns, in spec 002 §5.1's order. Pinned by the unit suite. */
export const COUNTRY_HOLIDAY_ROW_COLUMNS = [
  "iso2",
  "date",
  "name",
  "closed",
] as const;

/** `country_holiday`'s natural key — spec 002 §5.1's `UNIQUE (country_id, date)`. */
export const COUNTRY_HOLIDAY_NATURAL_KEY_COLUMNS = ["iso2", "date"] as const;

export interface CountryHolidayRow {
  iso2: string;
  date: string;
  /** The `delivery.holiday.{iso2}.{name}` message key — see the header. */
  name: string;
  closed: boolean;
}

/** Project one authored holiday onto its `country_holiday` row. */
export function toCountryHolidayRow(
  holiday: CountryHoliday,
): CountryHolidayRow {
  return {
    iso2: holiday.iso2,
    date: holiday.date,
    name: holiday.nameKey,
    closed: holiday.closed,
  };
}
