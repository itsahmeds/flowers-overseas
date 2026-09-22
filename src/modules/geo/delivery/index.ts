/**
 * `src/modules/geo/delivery` — the delivery calendar: which dates a buyer may pick, in the
 * destination's own zone, and why every other one is closed (spec 009 §2, §5.2, AC-5, AC-6,
 * AC-7, AC-8, AC-11; `plan/03` §9/§10; TASK-123).
 *
 * Re-exported from `src/modules/geo/index.ts`, which is what a page imports. Two files are
 * deliberately **not** here:
 *
 *  - `./schemas.ts` — the zod boundary. The calendar is pure arithmetic over build-time JSON
 *    imports, and pulling a parser through the module barrel would put zod into the render path
 *    of every page that shows a date (the bytes spec 004 spent TASK-046 removing). A caller with
 *    untrusted rows — spec 002's importer, spec 012's admin, a route parsing `?date=` — imports
 *    it by path and parses once.
 *  - `deliveryGrid`, `isOpenOn` and `nextOpenDate` — the pure core, which takes `operations` and
 *    a `state` as parameters. `deliveryWindow` and `deliveryCalendar` are the only callers inside
 *    `src/` that decide what the state is, and they read it from `pickerState()`; exporting the
 *    core here would let a page hand the calendar a cutoff nobody authored. Its own tests import
 *    `./calendar.ts` by path, which is how the arithmetic is exercised against fixture blocks
 *    independent of the one country (Poland, TASK-124) that has a real one.
 *  - `./holidays.ts`'s provider object and injection hook. A caller able to name them could
 *    decide at runtime whether we promise delivery on a day every florist in the country is shut
 *    (the rule `partners.ts` and `content/provider.ts` already keep). The `HolidayProvider`
 *    *interface* is exported, because spec 002's implementation has to satisfy it.
 */
export {
  DELIVERY_WINDOW_DAYS,
  DELIVERY_WINDOW_MAX_DAYS,
  NEXT_AVAILABLE_HORIZON_DAYS,
  type CalendarContext,
  type CutoffReading,
  type DeliveryCalendarOptions,
  type DeliveryWindowInput,
  type DeliveryPlanInput,
  type PickerStateTerms,
  cutoffAt,
  deliveryCalendar,
  deliveryWindow,
  pickerState,
  pickerStateFrom,
  reasonFor,
} from "./calendar.ts";
export {
  CALENDAR_REASON_KEYS,
  NOT_ORDERABLE_REASON,
  PICKER_NOTICE_KEYS,
  type CountryHoliday,
  type DeliveryDate,
  type DeliveryReasonKey,
  type DeliveryWindow,
  type PickerState,
  deliveryReasonKeys,
  pickerStates,
} from "./types.ts";
export {
  COUNTRY_HOLIDAY_NATURAL_KEY_COLUMNS,
  COUNTRY_HOLIDAY_ROW_COLUMNS,
  type CountryHolidayRow,
  toCountryHolidayRow,
} from "./projections.ts";
export type { HolidayProvider } from "./holidays.ts";
