/**
 * Currency conversion (spec 005 §5.2 `pricing/fx.ts`, §2 "FX and rounding", §13 Q2, AC-12/AC-15;
 * TASK-066).
 *
 * A price is authored in the **destination** country's currency (`plan/10` §2.3, EU 2018/302 —
 * the destination is the only geography a price has). Showing it in the buyer's locale currency is
 * therefore a *presentation* step, and this file is the only place in the codebase that takes it.
 * Five properties are structural here rather than reviewed for:
 *
 *  1. **The arithmetic is exactly spec 005 §2's, in integers.**
 *     `amountMinor x ratePpm x (10 000 + FX_BUFFER_BP) / (1 000 000 x 10 000)` — the ECB rate in
 *     parts per million, the 2.5% buffer in basis points, one division, rounded **up**. There is
 *     no arithmetic operator on an amount anywhere in this file: the product and the division
 *     happen inside `divideMinorCeil()`'s `BigInt`, because the numerator leaves the
 *     safe-integer range for a large amount in a high-magnitude currency, and because "no `/`
 *     producing a non-integer, no `Math.round` on money, no `Number` division of an amount" is a
 *     property AC-12 has a source scan for (`tests/unit/catalog-pricing-fx.test.ts`).
 *  2. **Rounded up, then rounded up again.** The division rounds away from zero and
 *     `roundToStyle()` then lifts the amount onto the currency's psychological ending. Both
 *     directions are up, deliberately: rounding down could put the amount charged below the
 *     amount converted, and the buffer exists to absorb an intraday move (`plan/06` §2.2), not to
 *     be eroded by rounding.
 *  3. **It fails closed.** `fxRateFor()` returns `null` when the newest usable rate is past the
 *     age bound (two Monday-to-Friday days, spec 005 §14 A7 Corrected 5), and `convertForDisplay()` then returns the *unavailable* variant, which
 *     carries **no amount at all** — the caller shows the destination currency's own price and
 *     `catalog.availability.fxUnavailable` (AC-15). A stale rate never becomes a displayed price.
 *     The ECB publishes on working days only, so a Monday rate is Friday's; counting only
 *     Monday-to-Friday time is what makes that normal rather than a failure, and the buffer is
 *     what covers the movement (§13 Q2, A7 Corrected 5).
 *  4. **"Now" is injected, never read.** Every function takes the instant it is evaluated at
 *     (`asOf: Date`), so the module has no clock, a cached page's price cannot depend on when a
 *     test ran, and the fail-closed path is exercisable without waiting two days. There is no
 *     `Date.now()` in this file.
 *  5. **Rates come from the provider seam, never from the dataset.** `catalogProviders().fx`
 *     serves the committed ECB snapshot today and `fx_rate` rows from TASK-070/071 with no line
 *     here changing. Only euro-base rows are ever published, so an inverse (PLN->EUR) and a cross
 *     (PLN->GBP, the first corridor's own direction — ADR-0002) are **derived** here from one or
 *     two published rows; authoring a cross would let two stored rates disagree with each other
 *     and with the published pair, with no way to tell which was wrong.
 *
 * What is deliberately **not** here: any decision about *which* currency to display (that is the
 * locale's default, spec 005 §7 and TASK-067's `priceProjection`), any formatting (`formatMoney`
 * is the only formatter in the codebase), and any storage — a conversion is recomputed, and the
 * rate and its date travel with the projection so a repaint cannot invent a rate (§5.4).
 */
import type { CurrencyCode } from "@/config/currencies";

import { CATALOG_SIGNALS, catalogSignal } from "../observability";
import { catalogProviders, type FxRateRecord } from "../providers";
import { FxRateSchema, IntegerMoneySchema } from "../schemas";
import {
  FX_BUFFER_BP,
  MAX_FX_AGE_HOURS,
  bundledFxStatus,
  fxRateStaleAfter,
  isFxRateStaleAt,
} from "../static";
import type {
  DisplayConversion,
  FxRate,
  IntegerMoney,
  IsoDate,
} from "../types";

import { divideMinorCeil } from "./money";
import { roundToStyle } from "./round";

/**
 * The FX buffer in basis points (2.5%) and the maximum age of a usable rate (48 hours), as
 * spec 005 §5.2 names them on this file's surface.
 *
 * Both are **re-exported, never restated**: they are authored once in
 * `src/config/catalogue/fx.data.ts` beside the snapshot they qualify (TASK-062), and reach this
 * file through the same seam the rates do, because only `static/*` may read the authored dataset
 * (AC-2, `tests/unit/catalog-barrel.test.ts`). A second literal `250` in the codebase would be a
 * second FX policy.
 */
export { FX_BUFFER_BP, MAX_FX_AGE_HOURS };

/** Parts per million: the unit every `fx_rate.rate_ppm` is stated in (spec 002 §5.1). */
const PPM_SCALE = 1_000_000;

/** Basis points of the whole: 10 000 bp = 100 %, the unit the buffer is stated in. */
const BASIS_POINTS_SCALE = 10_000;

/** Milliseconds in a day: `rateValidUntil()` is the calendar day before the stale instant. */
const MS_PER_DAY = 86_400_000;

/**
 * The currency every published rate is quoted against: the ECB publishes euro reference rates, so
 * the euro is the pivot every cross is derived through (`plan/01` §8).
 */
const PIVOT_CURRENCY: CurrencyCode = "EUR";

/**
 * The message key a caller shows when conversion is unavailable (spec 005 §7, AC-15).
 *
 * A key, never a label: the wording ("we are quoting this price in Polish złoty") is
 * `messages/en.json`'s and the locale reviewers', and every `reasonKey` this module can return has
 * a string, so no state renders untranslated (§7, WCAG 3.1.1).
 */
export const FX_UNAVAILABLE_REASON_KEY = "catalog.availability.fxUnavailable";

/* -------------------------------------------------------------------------- */
/* Age: the fail-closed bound, measured against an injected instant.          */
/* -------------------------------------------------------------------------- */

/**
 * Is a rate published on `asOf` too old to convert with at `now`? (spec 005 §13 Q2, AC-15, AC-35)
 *
 * Stale at every instant **after 00:00Z on the second Monday-to-Friday day after `asOf`**
 * (§14 A7 Corrected 5): Mon → Wed, Tue → Thu, Wed → Fri, Thu → Mon, Fri → Tue, Sat/Sun → Tue.
 * Friday's rate therefore holds through the weekend, and a missed working-day publication still
 * fails closed. Exactly at that instant the rate is still usable. The rule has one home,
 * `fxRateStaleAfter()` in `src/config/catalogue/fx.data.ts`, read here through `static/` (only
 * `static/*` may read the dataset, AC-2), so `pnpm catalogue:check`'s report and this gate cannot
 * disagree. It throws on an `asOf` that is not a calendar day.
 */
export function isRateStale(asOf: IsoDate, now: Date): boolean {
  return isFxRateStaleAt(asOf, now);
}

/**
 * The last whole calendar day on which a rate published on `asOf` is usable: the day before its
 * stale instant (Mon → Tue, …, Thu → Sun, Fri → Mon; spec 005 §14 A7 Corrected 5, AC-35).
 *
 * Since §14 A7 Corrected 7 this is **not** a source of `Offer.priceValidUntil`: a converted offer
 * carries the price row's `active_to` or nothing, because a date one to four days ahead would sit
 * in the past in any copy Google holds longer than that (`pricing/project.ts`, T-36).
 */
export function rateValidUntil(asOf: IsoDate): IsoDate {
  return new Date(fxRateStaleAfter(asOf) - MS_PER_DAY)
    .toISOString()
    .slice(0, 10);
}

/**
 * Which FX snapshot this deployment serves (spec 005 §14 A7 Corrected 2 (vi), AC-33): `fxAsOf`
 * and `fxSource` (`ecb-build` when the build fetched the ECB daily file, `committed` when it fell
 * back). `/api/health` reports exactly these two, and the weekday rebuild job compares `fxAsOf`
 * with the ECB's latest date. Process-local: no provider read, no network call.
 */
export function fxSnapshotStatus(): {
  readonly fxAsOf: IsoDate;
  readonly fxSource: "ecb-build" | "committed";
} {
  return bundledFxStatus();
}

/* -------------------------------------------------------------------------- */
/* Rate selection: one published pair, an inverse, or a euro cross.           */
/* -------------------------------------------------------------------------- */

/** The newest published row for one ordered pair, or `undefined` — never a guess. */
function newestRow(
  rows: readonly FxRateRecord[],
  base: CurrencyCode,
  quote: CurrencyCode,
): FxRateRecord | undefined {
  return rows
    .filter((row) => row.base === base && row.quote === quote)
    .reduce<FxRateRecord | undefined>(
      (newest, row) =>
        newest === undefined || row.asOf > newest.asOf ? row : newest,
      undefined,
    );
}

/** The older of two publication dates: a derived rate is only as current as its stalest input. */
function olderOf(left: IsoDate, right: IsoDate): IsoDate {
  return left < right ? left : right;
}

/**
 * The rate for `base -> quote` at `asOf`, or `null` when we must stop converting.
 *
 * Three derivations, in order, and each is exact integer arithmetic:
 *
 *  1. the **published** pair, if it exists (`EUR -> PLN`);
 *  2. the **inverse** of the published opposite (`PLN -> EUR` from `EUR -> PLN`):
 *     `1 000 000 x 1 000 000 / ratePpm`;
 *  3. the **euro cross** (`PLN -> GBP` from `EUR -> GBP` and `EUR -> PLN`):
 *     `ratePpm(EUR->GBP) x 1 000 000 / ratePpm(EUR->PLN)`.
 *
 * Both derivations round the *rate* **up**, for the same reason the conversion does: a rate
 * rounded down is a converted amount below cost. The error it can introduce is one part per
 * million — six orders of magnitude inside the 250 bp buffer — and it is introduced in the safe
 * direction.
 *
 * `null` means "we cannot convert, do not guess", and it has two causes, both of which the caller
 * treats identically (AC-15): the newest usable rate is **older than `MAX_FX_AGE_HOURS`**, or
 * there is **no rate at all** for the pair. Asking for a currency's rate against itself is
 * neither: it is a caller defect and throws, because `null` would be read as "unavailable" and a
 * price is never unavailable in its own currency (`convertForDisplay()` handles that case before
 * it gets here).
 */
export async function fxRateFor(
  base: CurrencyCode,
  quote: CurrencyCode,
  asOf: Date,
): Promise<FxRate | null> {
  if (base === quote) {
    throw new Error(
      `fxRateFor(${base}, ${quote}) asks for a currency's rate against itself; a price in its own currency is not converted at all (spec 005 §2 "FX and rounding")`,
    );
  }
  const rows = await catalogProviders().fx.fxRates();

  const direct = newestRow(rows, base, quote);
  if (direct !== undefined) {
    return usableOrNull(
      {
        base,
        quote,
        ratePpm: direct.ratePpm,
        asOf: direct.asOf,
        source: direct.source,
      },
      asOf,
    );
  }

  const opposite = newestRow(rows, quote, base);
  if (opposite !== undefined) {
    return usableOrNull(
      {
        base,
        quote,
        ratePpm: divideMinorCeil([PPM_SCALE, PPM_SCALE], opposite.ratePpm),
        asOf: opposite.asOf,
        source: `${opposite.source}:inverse`,
      },
      asOf,
    );
  }

  const baseLeg = newestRow(rows, PIVOT_CURRENCY, base);
  const quoteLeg = newestRow(rows, PIVOT_CURRENCY, quote);
  if (baseLeg === undefined || quoteLeg === undefined) return null;
  return usableOrNull(
    {
      base,
      quote,
      ratePpm: divideMinorCeil([quoteLeg.ratePpm, PPM_SCALE], baseLeg.ratePpm),
      asOf: olderOf(baseLeg.asOf, quoteLeg.asOf),
      source: `${quoteLeg.source}:cross:${PIVOT_CURRENCY}`,
    },
    asOf,
  );
}

/**
 * A derived rate, parsed, and withheld entirely once it is past the age bound (AC-15).
 *
 * Withholding it is also the moment spec 005 §11's first business signal fires: past
 * `MAX_FX_AGE_HOURS` **every** non-native display currency has stopped converting, every page has
 * quietly fallen back to the destination's own currency, and nothing else in the system says so.
 * `warn` + Sentry, with the two fields that identify it and no others (§8).
 */
function usableOrNull(rate: FxRate, asOf: Date): FxRate | null {
  const parsed = FxRateSchema.parse(rate);
  if (!isRateStale(parsed.asOf, asOf)) return parsed;
  catalogSignal(CATALOG_SIGNALS.fxStale, {
    currency: parsed.quote,
    fx_as_of: parsed.asOf,
  });
  return null;
}

/* -------------------------------------------------------------------------- */
/* Conversion: pure, total and integer-only.                                  */
/* -------------------------------------------------------------------------- */

/**
 * `money` in `rate.quote`, buffered, **before** psychological rounding (spec 005 §2).
 *
 * Pure (no clock, no provider, no I/O) and total over the amounts: every integer amount has a
 * defined result, and the only inputs it refuses are the ones where no result *exists* — a rate
 * whose `base` is not the amount's currency, or whose `quote` is not the target. That mismatch is
 * a caller defect rather than a value: silently trusting it would produce an amount converted at
 * a rate belonging to another pair, which is the one FX bug that looks right on the page.
 *
 * The result of `convert()` is a **cost**, not yet a price: `convertForDisplay()` is what puts it
 * on the currency's ending, and nothing outside this file composes the two by hand.
 */
export function convert(
  money: IntegerMoney,
  toCurrency: CurrencyCode,
  rate: FxRate,
): IntegerMoney {
  const parsedMoney = IntegerMoneySchema.parse(money);
  const parsedRate = FxRateSchema.parse(rate);
  if (parsedRate.base !== parsedMoney.currency) {
    throw new Error(
      `cannot convert ${parsedMoney.currency} with a rate based on ${parsedRate.base} (spec 005 §5.2: \`convert\` is total over amounts, not over mismatched pairs)`,
    );
  }
  if (parsedRate.quote !== toCurrency) {
    throw new Error(
      `cannot convert to ${toCurrency} with a rate quoting ${parsedRate.quote} (spec 005 §5.2)`,
    );
  }
  return IntegerMoneySchema.parse({
    amountMinor: divideMinorCeil(
      [
        parsedMoney.amountMinor,
        parsedRate.ratePpm,
        BASIS_POINTS_SCALE + FX_BUFFER_BP,
      ],
      PPM_SCALE * BASIS_POINTS_SCALE,
    ),
    currency: toCurrency,
  });
}

/**
 * `money` as a display amount in `displayCurrency`: converted, buffered, rounded up onto the
 * currency's ending — or the fail-closed variant that carries no amount (spec 005 §2, AC-15).
 *
 * This is the whole FX seam TASK-067's `priceProjection()` consumes, and it is a **discriminated
 * union with three variants** rather than a nullable amount, because each of the three is a
 * different thing to render:
 *
 *  - `native` — the display currency *is* the destination currency, so there is no conversion,
 *    no rate and no second price row (spec 005 §7: the display currency is a presentation choice
 *    from the locale, never a second price);
 *  - `converted` — the amount, with the rate and its publication date, so the projection can
 *    stamp `fxAsOf`/`ratePpm` into the HTML and a repaint cannot invent a rate (§5.4);
 *  - `unavailable` — a `reasonKey` and **nothing else**. There is no amount field on this
 *    variant to leave stale, which is how AC-15's "no converted amount is produced anywhere in
 *    the output" becomes a property of the type rather than a review of the caller.
 */
export async function convertForDisplay(
  money: IntegerMoney,
  displayCurrency: CurrencyCode,
  asOf: Date,
): Promise<DisplayConversion> {
  const parsedMoney = IntegerMoneySchema.parse(money);
  if (parsedMoney.currency === displayCurrency) {
    return { status: "native", price: parsedMoney };
  }
  const rate = await fxRateFor(parsedMoney.currency, displayCurrency, asOf);
  if (rate === null) {
    return { status: "unavailable", reasonKey: FX_UNAVAILABLE_REASON_KEY };
  }
  return {
    status: "converted",
    price: roundToStyle(convert(parsedMoney, displayCurrency, rate)),
    rate,
  };
}
