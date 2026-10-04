/**
 * The committed FX snapshot: one dated set of ECB euro reference rates (spec 005 §2 "FX and
 * rounding", §5.1, §13 Q2, AC-6; `plan/06` §2.2; TASK-062).
 *
 * Phase 0 has no database, so a deployment's rates are the ECB daily file **fetched once at build**
 * (spec 005 §14 A7 Corrected 2; `scripts/fx-snapshot.ts`, `src/modules/catalog/static/fx-bundle.ts`), and the rows below are the
 * **fallback** the build serves whole whenever that fetch fails. Either way nothing on a page
 * depends on a network call, and every test reads these rows, so every test is deterministic.
 * TASK-071's `fx.refresh` writes real `fx_rate` rows from the same source on the same shape and
 * deletes the build-time fetch (A7 Corrected 6); `toFxRateRow()` already projects onto spec 002
 * §5.1's `fx_rate(base_code, quote_code, rate_ppm, as_of, source)`, so the switch changes no
 * consumer.
 *
 * **Every committed row is the ECB's published rate for `FX_SNAPSHOT_AS_OF`** (A7 Corrected 1,
 * AC-29): the rows were read from `tests/fixtures/fx/ecb-eurofxref-2026-09-08.xml` (the 2026-09-08
 * `Cube` copied verbatim from the ECB's `eurofxref-hist-90d.xml`) and are pinned to it row by row
 * in `tests/unit/catalogue-fx.test.ts`. A row that matches no captured ECB file cannot be
 * committed: the hand-typed rows this replaced were about 1.2% off the ECB for PLN.
 *
 * Three properties are the reason the shape looks like this:
 *
 *  - **`ratePpm` is a parts-per-million integer.** No float touches a rate, and therefore no float
 *    touches the price it converts (`fo/no-float-money`, `plan/12` §2, spec 005 AC-12). A rate of
 *    4.2680 PLN per EUR is `4_268_000`.
 *  - **The 2.5% buffer is applied at conversion time and is not stored.** `FX_BUFFER_BP` is named
 *    config here and the arithmetic
 *    `amountMinor × ratePpm × (10 000 + FX_BUFFER_BP) / (1 000 000 × 10 000)` lives in
 *    `pricing/fx.ts` (TASK-066). Storing a buffered rate would make the snapshot disagree with
 *    the ECB and would hide, from the one place that must see it, how much of an intraday move
 *    the buffer is absorbing (`plan/06` §2.2).
 *  - **Staleness fails closed, and two working days is the bound.** A rate dated D is stale at
 *    every instant after 00:00Z on the second Monday-to-Friday day after D (spec 005 §14 A7
 *    Corrected 5, AC-35; `MAX_FX_AGE_HOURS` = 48 stays the bound, with Saturday and Sunday not
 *    counted). Past it the caller stops converting and shows the destination country's own
 *    currency instead of a guessed number (§13 Q2, AC-15). The ECB publishes on working days
 *    only, so a Monday-morning rate is Friday's — which is what the buffer is for. **This file is
 *    the rule's one home** (`fxRateStaleAfter()` below): `pricing/fx.ts`'s `isRateStale()` and
 *    `rateValidUntil()` read it through `static/`, and `isFxSnapshotStale()` is the same rule over
 *    *this* snapshot, so the report and the gate cannot disagree.
 *
 * Only the euro-base rows are committed, which is what the ECB publishes. A cross rate
 * (PLN→GBP for the London buyer of a Warsaw bouquet, ADR-0002's first corridor) is derived from
 * two euro rates by `pricing/fx.ts`, never authored: two authored crosses could disagree with
 * each other and with the published pair, and there would be no way to tell which was wrong.
 */
import { type FxRateData, FxRateDataSchema } from "./schemas.ts";

/**
 * The snapshot's date, and the `as_of` of every row in it — the last ECB publication before this
 * dataset was authored (Tuesday 8 September 2026; 2026-09-09 is the authoring day itself).
 */
export const FX_SNAPSHOT_AS_OF = "2026-09-08";

/** `fx_rate.source`: which publication the rate came from, on every row. */
export const FX_SOURCE = "ecb-reference";

/** The base currency of every committed row: the ECB publishes euro reference rates. */
export const FX_BASE_CURRENCY = "EUR";

/**
 * The FX buffer, in basis points: 2.5% (`plan/06` §2.2, `plan/13` B7's default, spec 005 §13 Q2).
 *
 * It exists to absorb the intraday and weekend movement between the rate a cached page converted
 * at and the rate the payment settles at. It is **applied at conversion time and never stored**,
 * and `pricing/round.ts` rounds *upward* onto the currency's psychological ending so rounding
 * cannot erode it (spec 005 §2 "FX and rounding"). `pricing/fx.ts` (TASK-066) re-exports this
 * constant rather than restating it.
 */
export const FX_BUFFER_BP = 250;

/**
 * How old the newest rate may be before conversion stops entirely: 48 hours (spec 005 §13 Q2),
 * counted on Monday-to-Friday days only since spec 005 §14 A7 Corrected 5 — that is, two working
 * days, the count `fxRateStaleAfter()` walks. Past it, `fxRateFor()` returns `null`, the projection
 * falls back to the destination currency and the page states the currency it is quoting in — a
 * stale rate never becomes a displayed price (AC-15).
 */
export const MAX_FX_AGE_HOURS = 48;

/**
 * The committed euro reference rates, one row per quote currency of `src/config/currencies.ts`.
 *
 * All configured currencies are covered (spec 002's ten plus the equivalent-only USD of spec 004
 * §14 A21 clause 6) even though spec 005 §13 Q11 offers only EUR, GBP and PLN as *display*
 * currencies in Phase 0: the others are configured-but-flagged-off, and a
 * rate row is what turns one on together with its `currency.{code}` flag rather than a code
 * change (spec 005 §12 "Feature flags").
 */
const fxRates = [
  // The ECB euro reference rates for 2026-09-08, read from
  // `tests/fixtures/fx/ecb-eurofxref-2026-09-08.xml` and pinned to it (AC-29, T-28).
  { quote: "GBP", ratePpm: 857_400 },
  { quote: "PLN", ratePpm: 4_317_800 },
  { quote: "RON", ratePpm: 5_250_000 },
  { quote: "CZK", ratePpm: 24_186_000 },
  { quote: "HUF", ratePpm: 363_950_000 },
  { quote: "SEK", ratePpm: 11_152_000 },
  { quote: "NOK", ratePpm: 10_745_000 },
  { quote: "DKK", ratePpm: 7_474_800 },
  { quote: "CHF", ratePpm: 942_500 },
  // USD is equivalent-only (spec 004 §14 A21 clause 6 (b); TASK-178).
  { quote: "USD", ratePpm: 1_161_400 },
] as const;

/** Parsed at module load: a malformed rate throws on first import, never at request time. */
export const FX_SNAPSHOT: readonly FxRateData[] = fxRates.map((rate) =>
  FxRateDataSchema.parse({
    base: FX_BASE_CURRENCY,
    quote: rate.quote,
    ratePpm: rate.ratePpm,
    asOf: FX_SNAPSHOT_AS_OF,
    source: FX_SOURCE,
  }),
);

/* -------------------------------------------------------------------------- */
/* Rate age: the one home of spec 005 §14 A7 Corrected 5 (AC-35).             */
/* -------------------------------------------------------------------------- */

/** Milliseconds in a day and in an hour: the two steps the age rule walks in. */
const MS_PER_DAY = 86_400_000;
const MS_PER_HOUR = 3_600_000;

/** `MAX_FX_AGE_HOURS` as the count of Monday-to-Friday days the rule walks: 48 h is two days. */
const MAX_FX_AGE_WEEKDAYS = MAX_FX_AGE_HOURS / 24;

/**
 * Day 0 of the epoch, 1970-01-01, was a Thursday: the offset that turns a whole-day count since the
 * epoch into a `0 = Sunday … 6 = Saturday` weekday, with no `Date` object and therefore no clock
 * (this directory reads none, `tests/unit/catalogue-dataset.test.ts`).
 */
const EPOCH_WEEKDAY = 4;
const DAYS_PER_WEEK = 7;
const SUNDAY = 0;
const SATURDAY = 6;

function isWeekday(dayStart: number): boolean {
  const weekday =
    (Math.floor(dayStart / MS_PER_DAY) + EPOCH_WEEKDAY) % DAYS_PER_WEEK;
  return weekday !== SUNDAY && weekday !== SATURDAY;
}

/** The start of `asOf`'s day in UTC, or a throw: an `as_of` is a calendar day, never a timestamp. */
function publicationDayStart(asOf: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(asOf);
  const [year, month, day] = (match?.slice(1) ?? []).map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw notACalendarDay(asOf);
  }
  const start = Date.UTC(year, month - 1, day);
  const daysInMonth =
    (Date.UTC(year, month, 1) - Date.UTC(year, month - 1, 1)) / MS_PER_DAY;
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth) {
    throw notACalendarDay(asOf);
  }
  return start;
}

function notACalendarDay(asOf: string): Error {
  return new Error(
    `\`${asOf}\` is not a calendar day: an \`fx_rate.as_of\` is a \`YYYY-MM-DD\` date, never a timestamp (spec 002 §5.1)`,
  );
}

/**
 * The instant after which a rate dated `asOf` is stale (spec 005 §14 A7 Corrected 5, AC-35): 00:00Z
 * on the **second Monday-to-Friday day after** `asOf`. Mon → Wed, Tue → Thu, Wed → Fri, Thu → Mon,
 * Fri → Tue, Sat → Tue, Sun → Tue.
 *
 * This is the date rule itself, not "48 hours of weekday time": the two agree for a weekday `asOf`
 * and differ for a weekend one (a Saturday rate would otherwise last until Wednesday), and the spec
 * says the date rule governs. Weekday TARGET holidays (Good Friday, Easter Monday, 1 May, 25–26 Dec,
 * 1 Jan) **count**: a weekday with no publication is a missed publication and fails closed
 * visibly; not counting them would need a holiday calendar and a founder decision.
 *
 * Exactly at this instant the rate is still usable — "stale" is strictly *after* it — which keeps
 * the original strict "older than 48 h" comparison of §13 Q2. Returned in epoch milliseconds so
 * the comparison stays an exact integer one. `pricing/fx.ts`'s `rateValidUntil()` is the calendar
 * day before this instant; it formats that day there, because this directory holds no `Date`.
 */
export function fxRateStaleAfter(asOf: string): number {
  let dayStart = publicationDayStart(asOf);
  let weekdays = 0;
  while (weekdays < MAX_FX_AGE_WEEKDAYS) {
    dayStart += MS_PER_DAY;
    if (isWeekday(dayStart)) weekdays += 1;
  }
  return dayStart;
}

/** Is a rate dated `asOf` stale at `now`? Strictly after `fxRateStaleAfter(asOf)` (AC-35). */
export function isFxRateStaleAt(asOf: string, now: Date): boolean {
  return now.getTime() > fxRateStaleAfter(asOf);
}

/**
 * The age of the committed snapshot at `now` in whole **Monday-to-Friday** hours, from the start
 * of its `as_of` day in UTC (the ECB publishes once, at about 16:00 CET; taking the start of the
 * day is the conservative reading). Saturday and Sunday add nothing, as in the rule above
 * (A7 Corrected 5). This is the number `pnpm catalogue:check` prints; whether the snapshot is
 * stale is `isFxSnapshotStale()`'s verdict, which is the date rule and governs where the two
 * readings could differ (a weekend-dated rate).
 */
export function fxSnapshotAgeHours(now: Date): number {
  const end = now.getTime();
  let ageMs = 0;
  for (
    let dayStart = publicationDayStart(FX_SNAPSHOT_AS_OF);
    dayStart < end;
    dayStart += MS_PER_DAY
  ) {
    if (isWeekday(dayStart))
      ageMs += Math.min(end, dayStart + MS_PER_DAY) - dayStart;
  }
  return Math.floor(ageMs / MS_PER_HOUR);
}

/**
 * Is the committed snapshot stale at `now`? The same rule as every rate (`isFxRateStaleAt`), over
 * this snapshot's `as_of` (AC-35: "`fx.data.ts`'s reporting predicate gives the same verdict at
 * every instant").
 *
 * `pnpm catalogue:check` **reports** this rather than failing on it: a committed snapshot ages by
 * the day, so a hard failure would turn every branch red two days after this one merged, for a
 * fact about the calendar rather than about the tree. What must not happen is a stale rate
 * reaching a buyer, and that is enforced where the conversion happens (`fxRateFor()` returns
 * `null` — AC-15), not in a gate.
 */
export function isFxSnapshotStale(now: Date): boolean {
  return isFxRateStaleAt(FX_SNAPSHOT_AS_OF, now);
}

/** The committed rate for one quote currency against the euro, or `undefined`. */
export function fxSnapshotRate(quote: string): FxRateData | undefined {
  return FX_SNAPSHOT.find((rate) => rate.quote === quote);
}
