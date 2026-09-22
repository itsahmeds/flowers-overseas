/**
 * `seed/data/holidays.json` — the destinations' public holidays, and the shape that makes a
 * wrong one a parse error (spec 009 §5.1's second amendment request, §5.2 `CountryHolidaySchema`;
 * spec 002 §5.1's `country_holiday`; TASK-123).
 *
 * This is the Phase 0 stand-in for `country_holiday`, and it is the input on which the delivery
 * calendar refuses a date. Four properties, each of them the reason a later task does not have to
 * re-derive this:
 *
 *  - **A holiday is authored per year, never derived.** There is no `MM-DD` recurrence and no
 *    "the usual date" rule in this file. Most European public holidays move (Corpus Christi and
 *    Whit Monday hang off Easter; a substitute day appears when a fixed holiday falls on a
 *    weekend), and a calendar that guessed one would close a florist who is open or, far worse,
 *    open one who is closed. `plan/13` D6's rule applies unchanged: *a date we have not checked
 *    is not a fixture*. The occasion evaluator (`src/modules/geo/occasions`) computes dates from
 *    rules because an occasion is a marketing marker; a holiday is an operational fact.
 *  - **The name is a message key, not a string.** `CLAUDE.md` forbids a literal user-facing
 *    string, and "Constitution Day" has to render in four locales beside the date that is closed.
 *    The key is pinned to the row's own country by the refinement below, so a row copied from
 *    Poland to Romania fails the parse rather than printing a Polish holiday on a Romanian
 *    calendar — the trick `src/config/countries.ts` uses for `nameKey`.
 *  - **`closed` is spec 002 §5.1's column, kept.** Every row the seed carries today is a day the
 *    destination's florists do not deliver, which is spec 009 §2's "public holiday in the
 *    destination" reason; `closed: false` is the shape for the holiday a country observes and
 *    still delivers on, and the calendar reads the flag rather than assuming it.
 *  - **`source` is the file header's, not the row's.** `seedHeaderShape()` carries
 *    `source: "seed"` for the whole file (spec 006 §2.2), which is what makes the importer
 *    non-destructive against `source = 'real'` rows; repeating it per row would be a second place
 *    it could disagree with itself.
 *
 * Nothing here computes a date and nothing reads a database (`pnpm check:no-db`). TASK-123
 * shipped the shape; TASK-124 authored the rows — Poland's 2026–2027 holidays, landed together
 * with Poland's `operations` block, because a holiday list for a country with no cutoff answers a
 * question nobody asked.
 */
import { z } from "zod";

/** ISO-3166-1 alpha-2, uppercase — spec 002 §5.1's `country.iso2`. */
const Iso2Schema = z
  .string()
  .regex(
    /^[A-Z]{2}$/,
    "must be a two-letter uppercase ISO-3166-1 alpha-2 code",
  );

/**
 * A calendar day, `YYYY-MM-DD`, that really exists. The shape test alone would accept 2026-02-30;
 * the round-trip through `Date.UTC` is what makes the parse refuse it. No zone is involved: a
 * public holiday is a calendar day in the destination, not an instant.
 */
export const HolidayDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be a `YYYY-MM-DD` calendar date")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    if (year === undefined || month === undefined || day === undefined) {
      return false;
    }
    const utc = new Date(Date.UTC(year, month - 1, day));
    return utc.toISOString().slice(0, 10) === value;
  }, "must be a date that exists in the Gregorian calendar");

/**
 * The `delivery.holiday.{iso2}.{name}` message key family. The country segment is lowercase
 * because message keys are, and the refinement below pins it to the row's `iso2`.
 */
export const HolidayNameKeySchema = z
  .string()
  .regex(
    /^delivery\.holiday\.[a-z]{2}\.[a-zA-Z0-9]+$/,
    "must be a dotted `delivery.holiday.{iso2}.{name}` message key",
  );

/** One row of `seed/data/holidays.json` — spec 002 §5.1's `country_holiday`, by natural key. */
export const SeedCountryHolidaySchema = z
  .object({
    /** The **destination**, ISO 3166-1 alpha-2. */
    iso2: Iso2Schema,
    /** The calendar day in that destination, `YYYY-MM-DD`. */
    date: HolidayDateSchema,
    /** `delivery.holiday.{iso2}.{name}` — the words the closed date renders. */
    nameKey: HolidayNameKeySchema,
    /** Do the destination's florists stop for it? `false` = observed, still delivering. */
    closed: z.boolean(),
  })
  .strict()
  .superRefine((row, ctx) => {
    const expected = `delivery.holiday.${row.iso2.toLowerCase()}.`;
    if (!row.nameKey.startsWith(expected)) {
      ctx.addIssue({
        code: "custom",
        path: ["nameKey"],
        message: `\`${row.nameKey}\` is not a \`${row.iso2}\` holiday key: a nameKey names its own country, so a row copied between destinations fails here rather than on a calendar`,
      });
    }
  });

export type SeedCountryHoliday = z.infer<typeof SeedCountryHolidaySchema>;

/**
 * The whole `rows` array. `(iso2, date)` is unique — spec 002 §5.1's `UNIQUE (country_id, date)`
 * — because two rows for one day would be two reasons for one closed date, and spec 009 AC-7
 * allows exactly one.
 *
 * **Empty is legal** here, because the schema cannot see which destinations render a calendar.
 * The gate that a *published* country with a rendered window carries rows for every year of its
 * 366-day horizon is `pnpm seed:check`'s `calendar/holiday-coverage` rule (spec 009 AC-2,
 * TASK-124) — a cross-file rule over this file, `src/config/countries.ts` and today's date, which
 * is not something a file schema can see.
 */
export const SeedCountryHolidayRegistrySchema = z
  .array(SeedCountryHolidaySchema)
  .superRefine((rows, ctx) => {
    const seen = new Map<string, number>();
    rows.forEach((row, index) => {
      const key = `${row.iso2}/${row.date}`;
      const first = seen.get(key);
      if (first !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: [index, "date"],
          message: `\`${key}\` is already row ${String(first)}: spec 002 §5.1 allows one holiday row per country per day, and two would be two reasons for one closed date (spec 009 AC-7)`,
        });
      }
      seen.set(key, index);
    });
  });
