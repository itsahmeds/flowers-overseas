/**
 * The committed FX snapshot: one dated set of ECB euro reference rates (spec 005 §2 "FX and
 * rounding", §5.1, §13 Q2, AC-6; `plan/06` §2.2; TASK-062).
 *
 * Phase 0 has no database and no scheduled job, so the rates are **committed data** rather than a
 * fetch: every demo price is reproducible from the repository, every test is deterministic, and
 * nothing on a page depends on a network call. TASK-071's `fx.refresh` writes real `fx_rate` rows
 * from the same source on the same shape (daily 06:00 CET, `plan/01` §8) and this file stops being
 * read; `toFxRateRow()` already projects onto spec 002 §5.1's `fx_rate(base_code, quote_code,
 * rate_ppm, as_of, source)`, so the switch changes no consumer.
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
 *  - **Staleness fails closed, and 48 hours is the bound.** Past `MAX_FX_AGE_HOURS` the caller
 *    stops converting and shows the destination country's own currency instead of a guessed
 *    number (spec 005 §13 Q2, AC-15). The ECB publishes on working days only, so a
 *    Monday-morning rate is Friday's — which is what the buffer is for, and why the bound is two
 *    days rather than one. `fxSnapshotAgeHours()` / `isFxSnapshotStale()` below are the
 *    predicate over *this* snapshot; `fxRateFor()`'s fail-closed path is TASK-066's.
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
 * How old the newest rate may be before conversion stops entirely: 48 hours (spec 005 §13 Q2).
 * Past it, `fxRateFor()` returns `null`, the projection falls back to the destination currency and
 * the page states the currency it is quoting in — a stale rate never becomes a displayed price
 * (AC-15).
 */
export const MAX_FX_AGE_HOURS = 48;

/**
 * The committed euro reference rates, one row per quote currency of `src/config/currencies.ts`.
 *
 * All ten configured currencies are covered even though spec 005 §13 Q11 offers only EUR, GBP and
 * PLN as *display* currencies in Phase 0: the seven others are configured-but-flagged-off, and a
 * rate row is what turns one on together with its `currency.{code}` flag rather than a code
 * change (spec 005 §12 "Feature flags").
 */
const fxRates = [
  { quote: "GBP", ratePpm: 846_500 },
  { quote: "PLN", ratePpm: 4_268_000 },
  { quote: "RON", ratePpm: 5_085_000 },
  { quote: "CZK", ratePpm: 24_375_000 },
  { quote: "HUF", ratePpm: 393_200_000 },
  { quote: "SEK", ratePpm: 11_072_000 },
  { quote: "NOK", ratePpm: 11_625_000 },
  { quote: "DKK", ratePpm: 7_459_500 },
  { quote: "CHF", ratePpm: 938_500 },
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

/**
 * The age of the committed snapshot in whole hours at `now`, from the start of its `as_of` day
 * (the ECB publishes once, at 16:00 CET; taking the start of the day is the conservative reading
 * and can only make a rate look older than it is).
 */
export function fxSnapshotAgeHours(now: Date): number {
  const asOf = Date.parse(`${FX_SNAPSHOT_AS_OF}T00:00:00Z`);
  return Math.floor((now.getTime() - asOf) / 3_600_000);
}

/**
 * Is the committed snapshot older than `MAX_FX_AGE_HOURS` at `now`?
 *
 * `pnpm catalogue:check` **reports** this rather than failing on it: a committed snapshot ages by
 * the day, so a hard failure would turn every branch red two days after this one merged, for a
 * fact about the calendar rather than about the tree. What must not happen is a stale rate
 * reaching a buyer, and that is enforced where the conversion happens (`fxRateFor()` returns
 * `null` — AC-15), not in a gate.
 */
export function isFxSnapshotStale(now: Date): boolean {
  return fxSnapshotAgeHours(now) > MAX_FX_AGE_HOURS;
}

/** The committed rate for one quote currency against the euro, or `undefined`. */
export function fxSnapshotRate(quote: string): FxRateData | undefined {
  return FX_SNAPSHOT.find((rate) => rate.quote === quote);
}
