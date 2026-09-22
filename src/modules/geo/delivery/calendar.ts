/**
 * **The delivery calendar** — which dates a buyer may pick, and why every other one is closed
 * (spec 009 §2 "The date picker and the cutoff/holiday engine", §5.2, AC-5, AC-6, AC-7, AC-11;
 * `plan/03` §9/§10; TASK-123).
 *
 * This is spec 005's declared `CutoffEvaluator`, implemented for real, plus the grid the product
 * page renders. Spec 005's `availability.ts` says of itself: "there is no date arithmetic, no
 * holiday evaluation, no time-zone conversion and no occasion-date rule in this file, because
 * `plan/03` §9/§10 and spec 005 §3 put every one of them in spec 009". All four are here, and
 * nowhere else in the repository.
 *
 * Four data inputs and nothing else (§2): the destination's `operations` block, its public
 * holidays, the occasion rules of `modules/geo/occasions`, and — later, without a call-site
 * change — `CapacityProvider` and partner blackout dates. No buyer country, no IP, no header, no
 * locale reaches this file (EU 2018/302, ADR-0006), and no wall clock but the destination's.
 *
 * The five properties a reviewer should check, each of them a defect this file exists to
 * prevent:
 *
 *  1. **Every answer is computed in the destination's IANA zone** (AC-5). The only clock read is
 *     `zone.ts`'s, the only zone is `operations.ianaZone`, and the grid is stepped with calendar
 *     arithmetic rather than with durations — so the same instant produces the same grid under
 *     `TZ=UTC`, `TZ=America/New_York` and `TZ=Pacific/Auckland`, the last of which is across the
 *     date line from Europe and would break any implementation that read the process zone.
 *  2. **The cutoff is a wall-clock comparison** (AC-6). "Has 14:00 in Warsaw passed?" is asked of
 *     the wall clock in Warsaw, so on the two DST Sundays of each year the answer is the authored
 *     14:00 and not 13:00 or 15:00, and 00:30 on the spring Sunday is still the same calendar day.
 *  3. **Exactly one reason per closed date** (AC-7). `reasonFor()` returns the first entry of
 *     `deliveryReasonKeys` that applies; that array *is* the precedence and is documented where
 *     it is declared. Two reasons for one date would mean the model is wrong, not that the date
 *     is doubly unavailable.
 *  4. **No partner, no selectable date** (AC-8). `pickerState()` is the single gate, and both the
 *     grid and every `CutoffEvaluator` answer pass through it: `isDateAvailable` is `false` and
 *     `nextAvailableDate` is `null` for every destination that is not `live`, whatever its
 *     calendar says. There is no argument, no flag and no fixture inside `src/` that opens a date
 *     without an active partner.
 *  5. **An occasion is marked, never invented** (AC-11). Markers come from `upcomingOccasions`,
 *     which evaluates authored rules; a `rule_type: none` row has no date and therefore marks
 *     nothing, and no date literal appears in this file.
 *
 * Money is **injected, not fetched**: spec 005's `dateSurcharges()` is async and reads the
 * catalogue providers, and this module is pure and synchronous so that a page, a build step and a
 * test all get the same grid with no I/O. TASK-125's `productView()` composes the two — it holds
 * the prices already.
 */
import {
  type CountryIso2,
  type CountryOperations,
  countryConfig,
} from "../../../config/countries.ts";

import type { CutoffEvaluator } from "../../catalog/index.ts";
import type { Money } from "../../i18n/index.ts";
import {
  type IsoDate,
  type OccasionCalendarRow,
  committedOccasionCalendar,
  upcomingOccasions,
} from "../occasions/index.ts";
import {
  type HolidayProvider,
  closedHolidaysBetween,
  getHolidayProvider,
} from "./holidays.ts";
import {
  type DeliveryDate,
  type DeliveryReasonKey,
  type DeliveryWindow,
  NOT_ORDERABLE_REASON,
  PICKER_NOTICE_KEYS,
  type PickerState,
} from "./types.ts";
import { NEXT_AVAILABLE_HORIZON_DAYS, pickerState } from "./state.ts";
import {
  addDays,
  assertDayCount,
  isoWeekday,
  minuteOfDay,
  parseIsoDate,
  zonedDate,
  zonedMinuteOfDay,
} from "./zone.ts";

/** ISO-8601 Sunday. `operations.deliveryDays` and `isoWeekday()` both use this numbering. */
const SUNDAY = 7;

/** The grid the PDP renders by default: "every date for the next two weeks" (spec 009 §2). */
export const DELIVERY_WINDOW_DAYS = 14;

/**
 * The longest grid this module will build. Spec 009 §5.2 caps the embedded totals table the
 * island reads at "≤ 5 tiers × ≤ 21 dates", and a grid longer than the table it is priced against
 * would be a chip with no total behind it.
 */
export const DELIVERY_WINDOW_MAX_DAYS = 21;

/**
 * How far `nextAvailableDate` looks, and the window `pnpm seed:check` requires holiday rows for.
 * Declared in `./state.ts` (so plain `node` can read it) and re-exported here unchanged.
 */
export { NEXT_AVAILABLE_HORIZON_DAYS };

/* -------------------------------------------------------------------------- */
/* The state gate.                                                            */
/* -------------------------------------------------------------------------- */

/**
 * `pickerState()` and the pure rule under it live in `./state.ts` since TASK-124, which re-sourced
 * spec 004 §14 A19's chrome predicate (`deliveryDatesOpen()` in `src/config/countries.ts`) onto
 * them: the registry and `pnpm seed:check` are loaded by plain `node`, and this file is not
 * (`zone.ts` reaches the `i18n` barrel). Re-exported here unchanged, so no import site moved.
 */
export {
  type PickerStateTerms,
  pickerState,
  pickerStateFrom,
} from "./state.ts";

/* -------------------------------------------------------------------------- */
/* The cutoff.                                                                */
/* -------------------------------------------------------------------------- */

/** Where the destination's clock stands against its own cutoff at one instant. */
export interface CutoffReading {
  /** The authored wall-clock cutoff, `HH:mm`, unshifted by DST (AC-6). */
  readonly localTime: string;
  /** The IANA zone it is stated in; carried with it always (`plan/03` §10). */
  readonly timeZone: string;
  /** The calendar day it is in the destination right now. */
  readonly localDate: IsoDate;
  /** Minutes since local midnight, floored to the minute. */
  readonly localMinuteOfDay: number;
  /** Is same-day delivery still on the table — i.e. is the clock strictly before the cutoff? */
  readonly sameDayOpen: boolean;
  /** The first day that could be delivered at all: today while `sameDayOpen`, else tomorrow. */
  readonly earliestDate: IsoDate;
}

/**
 * Read the destination's clock against its cutoff — **the** DST-sensitive calculation, and the
 * one AC-6 pins at 00:30, 02:30 and 14:00 local on each transition Sunday.
 *
 * Wall clock is compared to wall clock. The alternative, turning "14:00 Europe/Warsaw" into a UTC
 * instant and comparing instants, needs an offset chosen for a particular day and is wrong by an
 * hour on the two Sundays a year the offset changes — which is the same hour in which a florist
 * decides whether today's orders still go out.
 *
 * The comparison is strict (`<`): at exactly 14:00 the cutoff has passed. A buyer who reads
 * "Order by 14:00" and submits at 14:00:00 has not ordered *by* 14:00, and the safe direction for
 * a promise we have to keep is the later date.
 */
export function cutoffAt(
  operations: CountryOperations,
  at: Date,
): CutoffReading {
  const cutoffMinute = minuteOfDay(operations.sameDayCutoffLocal);
  const localDate = zonedDate(at, operations.ianaZone);
  const localMinuteOfDay = zonedMinuteOfDay(at, operations.ianaZone);
  const sameDayOpen = localMinuteOfDay < cutoffMinute;
  return {
    localTime: operations.sameDayCutoffLocal,
    timeZone: operations.ianaZone,
    localDate,
    localMinuteOfDay,
    sameDayOpen,
    earliestDate: sameDayOpen ? localDate : addDays(localDate, 1),
  };
}

/* -------------------------------------------------------------------------- */
/* The per-date verdict.                                                      */
/* -------------------------------------------------------------------------- */

/** Everything a single date's verdict is computed from. Pure data; no clock, no provider. */
export interface CalendarContext {
  readonly operations: CountryOperations;
  readonly reading: CutoffReading;
  /** Dates the destination is shut, from the holiday provider. */
  readonly closedHolidays: ReadonlySet<IsoDate>;
  /**
   * Dates that count as "peak" for `sundayDelivery: "peak"`. The seam to spec 005's `peak_day`
   * surcharge windows; empty unless a caller supplies them, and an empty set makes `"peak"`
   * behave exactly like `"none"` — the safe direction, because the alternative is offering a
   * Sunday nobody has agreed to work.
   */
  readonly peakDates: ReadonlySet<IsoDate>;
}

/**
 * Is a Sunday deliverable at all in this destination?
 *
 * `sundayDelivery` is spec 002 §5.1's three-valued column, kept verbatim by spec 007's
 * `CountryOperationsSchema`: `none` never, `always` whenever Sunday is a delivery weekday, and
 * `peak` only on a peak date. §13 Q3's authored Poland is "no Sunday delivery", i.e. `none`.
 */
function sundayDeliverable(context: CalendarContext, date: IsoDate): boolean {
  const rule = context.operations.sundayDelivery;
  if (rule === "none") return false;
  if (rule === "always") return true;
  if (rule === "peak") return context.peakDates.has(date);
  // Unreachable while `sundayDelivery` is spec 002 §5.1's three-valued CHECK; the assignment is
  // what makes a fourth value a compile error here rather than a silently open Sunday.
  const unhandled: never = rule;
  throw new Error(
    `unknown \`sundayDelivery\` rule \`${String(unhandled)}\`: a Sunday is never opened by default`,
  );
}

/**
 * The reason this date cannot be chosen, or `undefined` when it can.
 *
 * The order of the tests is `deliveryReasonKeys`' order and the array is where it is documented;
 * returning the first that applies is what makes "exactly one reason" true of a date on which
 * several rules hold at once (a past Sunday, a holiday that is also a Sunday, a non-delivery
 * weekday after the cutoff).
 */
export function reasonFor(
  context: CalendarContext,
  date: IsoDate,
): DeliveryReasonKey | undefined {
  parseIsoDate(date);
  if (date < context.reading.localDate) return "delivery.reason.beforeEarliest";
  if (date < context.reading.earliestDate) return "delivery.reason.pastCutoff";
  if (context.closedHolidays.has(date)) return "delivery.reason.publicHoliday";
  const weekday = isoWeekday(date);
  if (weekday === SUNDAY && !sundayDeliverable(context, date)) {
    return "delivery.reason.sundayClosed";
  }
  if (!context.operations.deliveryDays.includes(weekday)) {
    return "delivery.reason.notDeliveryDay";
  }
  return undefined;
}

/* -------------------------------------------------------------------------- */
/* The pure core: a grid, an open/closed verdict and a search, over one        */
/* destination's authored operational data.                                   */
/* -------------------------------------------------------------------------- */

/**
 * The operational facts one answer is computed from.
 *
 * `operations` and `state` are **parameters rather than registry reads**, and that is what makes
 * the arithmetic testable independently of any country's data: TASK-124 authored Poland's block,
 * TASK-123 shipped the machinery, and the fixture seam between them is exactly here. The wrappers
 * below (`deliveryWindow`, `deliveryCalendar`) are the only callers inside `src/` that decide
 * what `state` is, and they read it from `pickerState()`; nothing in this file is exported from
 * `src/modules/geo/index.ts` except through them, so a page cannot fabricate a cutoff.
 */
export interface DeliveryPlanInput {
  /** The destination. The only geography this module reads (ADR-0006). */
  readonly countryIso: CountryIso2;
  /** The destination's authored block. A missing one is `unavailable` and never reaches here. */
  readonly operations: CountryOperations;
  /** `preview` or `live`; `unavailable` has no calendar and throws (§2's states table). */
  readonly state: Exclude<PickerState, "unavailable">;
  /**
   * **The instant the page is rendered**, not a calendar date: which day it is where the flowers
   * are going is this module's answer to give, and a caller that passed a date would already have
   * had to read a clock in some zone — in practice the server's, which is the bug (AC-5).
   */
  readonly at: Date;
  /** Peak dates for `sundayDelivery: "peak"`. See `CalendarContext.peakDates`. */
  readonly peakDates?: readonly IsoDate[];
  /** The holiday rows to read; the committed provider unless a test or spec 002 supplies one. */
  readonly holidayProvider?: HolidayProvider;
}

/** Build the per-date context for a closed, inclusive range. One holiday read per call. */
function contextFor(
  input: DeliveryPlanInput,
  first: IsoDate,
  last: IsoDate,
): CalendarContext {
  return {
    operations: input.operations,
    reading: cutoffAt(input.operations, input.at),
    closedHolidays: new Set(
      closedHolidaysBetween(
        input.countryIso,
        first,
        last,
        input.holidayProvider ?? getHolidayProvider(),
      ).keys(),
    ),
    peakDates: new Set(input.peakDates ?? []),
  };
}

/** What the grid needs on top of a plan: its length, its money and its occasion rows. */
export interface DeliveryGridInput extends DeliveryPlanInput {
  /** How many days the grid spans, starting at today in the destination. */
  readonly days?: number;
  /** Spec 005's `dateSurcharges()` amounts, by date. Injected; see the file header. */
  readonly surcharges?: Readonly<Record<IsoDate, Money>>;
  /** The occasion rows to read; the committed calendar unless a test supplies another. */
  readonly occasionCalendar?: readonly OccasionCalendarRow[];
}

/**
 * **The ordered grid**, computed in the destination's zone (spec 009 §2, AC-5, AC-6, AC-7,
 * AC-11).
 *
 * `preview` returns the full computed calendar with every date closed, because surcharges,
 * holidays and occasion markers are facts about the *destination's* calendar rather than promises
 * about us; `live` returns the same grid with the calendar's own verdicts. Pure and synchronous:
 * same inputs, same grid, no I/O and no clock of its own.
 */
export function deliveryGrid(input: DeliveryGridInput): DeliveryWindow {
  const days = assertDayCount(
    input.days ?? DELIVERY_WINDOW_DAYS,
    DELIVERY_WINDOW_MAX_DAYS,
  );
  const reading = cutoffAt(input.operations, input.at);
  const first = reading.localDate;
  const last = addDays(first, days - 1);
  const context = contextFor(input, first, last);
  const occasionsByDate = occasionKeysByDate(
    input.countryIso,
    first,
    last,
    input.occasionCalendar ?? committedOccasionCalendar,
  );
  const surcharges = input.surcharges ?? {};

  const dates: DeliveryDate[] = [];
  for (let offset = 0; offset < days; offset += 1) {
    const date = addDays(first, offset);
    const calendarReason = reasonFor(context, date);
    // `preview` closes everything: the grid is a demonstration of how dates will work, and §13
    // Q6's one sentence covers the days the destination's own calendar has no quarrel with.
    const reasonKey =
      calendarReason ??
      (input.state === "live" ? undefined : NOT_ORDERABLE_REASON);
    const surcharge = surcharges[date];
    dates.push({
      date,
      selectable: reasonKey === undefined,
      ...(reasonKey === undefined ? {} : { reasonKey }),
      ...(surcharge === undefined ? {} : { surcharge }),
      occasionKeys: occasionsByDate.get(date) ?? [],
    });
  }

  return {
    state: input.state,
    timeZone: input.operations.ianaZone,
    cutoffLocal: input.operations.sameDayCutoffLocal,
    dates,
    noticeKey: PICKER_NOTICE_KEYS[input.state],
  };
}

/**
 * Can this exact calendar day be delivered? The pure half of `CutoffEvaluator.isDateAvailable`.
 *
 * `live` only: a `preview` destination has a calendar and no florist, so "can you deliver on
 * Thursday" is answered `false` however open its calendar looks (AC-8). The grid is where a
 * preview country's calendar is *shown*, labelled as a demonstration; this is where a **promise**
 * is made.
 */
export function isOpenOn(input: DeliveryPlanInput, date: IsoDate): boolean {
  if (input.state !== "live") return false;
  return reasonFor(contextFor(input, date, date), date) === undefined;
}

/**
 * The first deliverable day on or after `from`. The pure half of
 * `CutoffEvaluator.nextAvailableDate`; `null` when the horizon holds none.
 *
 * A caller asking about a day that has already gone means "the soonest from now on", so the scan
 * starts at the later of `from` and the earliest possible date: scanning from a past `from` would
 * spend the horizon on days that can never open.
 */
export function nextOpenDate(
  input: DeliveryPlanInput,
  from: IsoDate,
): IsoDate | null {
  if (input.state !== "live") return null;
  const reading = cutoffAt(input.operations, input.at);
  let date = from < reading.earliestDate ? reading.earliestDate : from;
  for (let step = 0; step < NEXT_AVAILABLE_HORIZON_DAYS; step += 1) {
    if (isOpenOn(input, date)) return date;
    date = addDays(date, 1);
  }
  return null;
}

/**
 * Occasion keys per date inside `[first, last]`, from `upcomingOccasions` and from nothing else
 * (AC-11).
 *
 * A `rule_type: none` row — a Polish name day, `plan/13` B15 — has no date, so `occasionDate()`
 * returns `null` and it appears in no list here: an occasion the evaluator cannot date marks
 * nothing rather than marking today. Keys are sorted by code point so two renders of the same
 * day cannot differ, on any host.
 */
function occasionKeysByDate(
  countryIso: CountryIso2,
  first: IsoDate,
  last: IsoDate,
  calendar: readonly OccasionCalendarRow[],
): ReadonlyMap<IsoDate, readonly string[]> {
  // `upcomingOccasions` windows in whole months from `first`; two months covers every grid this
  // module will build (`DELIVERY_WINDOW_MAX_DAYS` is 21) and the result is filtered to the grid.
  const found = new Map<IsoDate, string[]>();
  for (const occasion of upcomingOccasions(countryIso, first, 2, calendar)) {
    if (occasion.date > last) continue;
    const keys = found.get(occasion.date) ?? [];
    keys.push(occasion.occasionKey);
    found.set(occasion.date, keys);
  }
  // Code-point order, not `localeCompare`: the host's locale must not reorder a grid (the same
  // rule as the process zone — nothing here reads the machine it runs on).
  for (const keys of found.values()) {
    keys.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }
  return found;
}

/* -------------------------------------------------------------------------- */
/* The registry wrappers: the only callers that decide a state.               */
/* -------------------------------------------------------------------------- */

/** What `deliveryWindow()` is asked. Everything optional is a seam with an honest default. */
export interface DeliveryWindowInput {
  readonly countryIso: CountryIso2;
  /** The instant the page is rendered. See `DeliveryPlanInput.at`. */
  readonly from: Date;
  readonly days?: number;
  readonly surcharges?: Readonly<Record<IsoDate, Money>>;
  readonly peakDates?: readonly IsoDate[];
  readonly holidayProvider?: HolidayProvider;
  readonly occasionCalendar?: readonly OccasionCalendarRow[];
}

/**
 * **The grid the product page renders** — `pickerState()`, the destination's authored block, and
 * `deliveryGrid()` (spec 009 §2, AC-8).
 *
 * `unavailable` returns no dates at all: not an empty grid drawn with closed chips, no dates. A
 * country with no agreed cutoff has no calendar to show, no cutoff to name and one honest
 * sentence to render, and `DeliveryWindowSchema` refuses a window that says otherwise. Going from
 * there to `preview` is authoring an `operations` block, and from `preview` to `live` is signing
 * a florist: a data flip in both cases, never a template edit.
 */
export function deliveryWindow(input: DeliveryWindowInput): DeliveryWindow {
  const state = pickerState(input.countryIso);
  const operations = countryConfig(input.countryIso).operations;
  if (state === "unavailable" || operations === undefined) {
    return {
      state: "unavailable",
      dates: [],
      noticeKey: PICKER_NOTICE_KEYS.unavailable,
    };
  }
  return deliveryGrid({
    countryIso: input.countryIso,
    operations,
    state,
    at: input.from,
    ...(input.days === undefined ? {} : { days: input.days }),
    ...(input.surcharges === undefined ? {} : { surcharges: input.surcharges }),
    ...(input.peakDates === undefined ? {} : { peakDates: input.peakDates }),
    ...(input.holidayProvider === undefined
      ? {}
      : { holidayProvider: input.holidayProvider }),
    ...(input.occasionCalendar === undefined
      ? {}
      : { occasionCalendar: input.occasionCalendar }),
  });
}

/* -------------------------------------------------------------------------- */
/* Spec 005's `CutoffEvaluator`, implemented.                                 */
/* -------------------------------------------------------------------------- */

/** What the evaluator reads besides the registry. Every field is a seam with an honest default. */
export interface DeliveryCalendarOptions {
  /** The clock. Injected so a test pins an instant instead of waiting for one. */
  readonly now?: () => Date;
  readonly peakDates?: readonly IsoDate[];
  readonly holidayProvider?: HolidayProvider;
}

/**
 * **Spec 005's `CutoffEvaluator`, implemented** (`nextAvailableDate`, `isDateAvailable`,
 * `cutoffFor`).
 *
 * The signature is spec 005's unchanged — every method `async`, taking the destination — so the
 * consumers written against the seam (`availability()`, spec 010's checkout) need no edit, and a
 * database-backed evaluator can replace this one without a call-site change.
 *
 * **Every answer is gated on `pickerState(countryIso) === "live"`** (AC-8). A `preview` country
 * has a calendar and no partner; asking this object "can you deliver on Thursday" must therefore
 * be answered `false`, not "the calendar says yes". The grid is where a preview country's
 * calendar is shown, labelled as a demonstration; this object is where a *promise* is made.
 */
export function deliveryCalendar(
  options: DeliveryCalendarOptions = {},
): CutoffEvaluator {
  const now = options.now ?? (() => new Date());

  /** The plan for one destination at one instant, or `undefined` when no promise may be made. */
  const planFor = (
    countryIso: CountryIso2,
    at: Date,
  ): DeliveryPlanInput | undefined => {
    const state = pickerState(countryIso);
    const operations = countryConfig(countryIso).operations;
    if (state !== "live" || operations === undefined) return undefined;
    return {
      countryIso,
      operations,
      state,
      at,
      ...(options.peakDates === undefined
        ? {}
        : { peakDates: options.peakDates }),
      ...(options.holidayProvider === undefined
        ? {}
        : { holidayProvider: options.holidayProvider }),
    };
  };

  return {
    isDateAvailable: ({ countryIso, date }) => {
      const plan = planFor(countryIso, now());
      return Promise.resolve(plan !== undefined && isOpenOn(plan, date));
    },

    cutoffFor: ({ countryIso, date }) => {
      const plan = planFor(countryIso, now());
      if (plan === undefined || !isOpenOn(plan, date)) {
        return Promise.resolve(null);
      }
      return Promise.resolve({
        localTime: plan.operations.sameDayCutoffLocal,
        timeZone: plan.operations.ianaZone,
      });
    },

    nextAvailableDate: ({ countryIso, from }) => {
      const plan = planFor(countryIso, now());
      return Promise.resolve(
        plan === undefined ? null : nextOpenDate(plan, from),
      );
    },
  };
}
