/**
 * Approximate equivalents under a charged price (spec 004 §14 A21 clause 6; spec 008 AC-6
 * amended; spec 009 AC-21 amended; TASK-178).
 *
 * The one prominent price is the charged price — VAT and delivery included, equal to the quote
 * and to schema `price` — and nothing here touches it. Under it, in smaller text, a page may show
 * what that same amount is in the *other* currencies of {EUR, GBP, PLN, USD}: up to three, never
 * the charged one, labelled as approximate and with the date of the rate. This file computes the
 * amounts; the component formats them through `formatMoney` and the `format.ts` list formatter
 * and prints them with the `catalog.price.equivalents` message key.
 *
 * The rules, each from clause 6, each structural here:
 *
 *  - **(b) Same snapshot as the charged price.** A converted charged price carries its `fxAsOf`;
 *    every equivalent is converted at a rate with exactly that `as_of`, or the whole line is
 *    withheld. A native charged price (the charged currency is the catalogue currency — `/pl` to
 *    Poland, PLN) took no rate, so the equivalents use the latest snapshot available to the same
 *    render (the same `now`), and every leg must share that snapshot's `as_of`.
 *  - **(b) Mid rate.** `fxRateFor()` is the rate seam (it derives inverses and euro crosses, and
 *    it fails closed past `MAX_FX_AGE_HOURS`); the conversion here applies **no `FX_BUFFER_BP`**
 *    and **no psychological rounding**, because the line describes what the buyer pays, not what
 *    we would charge in that currency. The amount is rounded to the nearest minor unit (half up).
 *  - **(d) Stale fails closed.** `fxRateFor()` returning `null` for any leg, or a charged price
 *    that is the stale-FX destination-currency fallback (`fxReasonKey`), yields `null`: no line at
 *    all, never a partial or stale one.
 *  - **(b) Never in structured data.** The result is a display value only. `offerProjection()`,
 *    `priceTable()` and the from-price never read it; spec 007's builders never receive it.
 *
 * Pure in the sense AC-12 means: no clock (the instant is injected), no float, no `/` — the one
 * division is `divideMinorHalfUp()`'s `BigInt` one in `money.ts`.
 */
import { type CurrencyCode, currencyConfig } from "@/config/currencies";

import { IntegerMoneySchema } from "../schemas";
import type { IntegerMoney, IsoDate, PriceProjection } from "../types";

import { fxRateFor } from "./fx";
import { divideMinorHalfUp } from "./money";

/**
 * The equivalents set, in display order (A21 clause 6 (b)). USD is **equivalent-only**: it has a
 * `currencies.ts` row and an ECB rate so it can be converted *to*, but its `currency.USD` flag is
 * off, so it is never charged, never prominent and never in `priceTable()`.
 */
export const EQUIVALENT_CURRENCIES = [
  "EUR",
  "GBP",
  "PLN",
  "USD",
] as const satisfies readonly CurrencyCode[];

/** The message key the equivalents line is printed with: `{amounts}` and `{date}`. */
export const EQUIVALENTS_LABEL_KEY = "catalog.price.equivalents" as const;

/** The equivalents of one charged price: the snapshot date and one amount per other currency. */
export interface PriceEquivalents {
  /** The `as_of` of the rate every amount was converted at, named in the label. */
  readonly asOf: IsoDate;
  /** In `EQUIVALENT_CURRENCIES` order, the charged currency left out. One to three entries. */
  readonly amounts: readonly IntegerMoney[];
}

/** The fields of a projection the equivalents depend on, and no others. */
export type ChargedPrice = Pick<
  PriceProjection,
  "displayPrice" | "destinationCurrencyPrice" | "fxAsOf" | "fxReasonKey"
>;

/** Parts per million: the unit every rate is stated in (spec 002 §5.1 `fx_rate.rate_ppm`). */
const PPM_SCALE = 1_000_000;

/** Powers of ten for the exponent shift between two currencies (`minorUnitExponent` is 0–3). */
const POWERS_OF_TEN = [1, 10, 100, 1000] as const;

function powerOfTen(exponent: number): number {
  const power = POWERS_OF_TEN[exponent];
  if (power === undefined) {
    throw new Error(`no minor-unit exponent ${String(exponent)} is configured`);
  }
  return power;
}

/**
 * `amount` in `to` at a mid rate stated in ppm, rounded half up to `to`'s minor unit.
 *
 * Exported for the test that pins the arithmetic; nothing else should call it, because a rate
 * that did not come from `fxRateFor()` has no staleness check behind it.
 */
export function convertAtMidRate(
  amount: IntegerMoney,
  to: CurrencyCode,
  ratePpm: number,
): IntegerMoney {
  const parsed = IntegerMoneySchema.parse(amount);
  const fromExponent = currencyConfig(parsed.currency).minorUnitExponent;
  const toExponent = currencyConfig(to).minorUnitExponent;
  const up = powerOfTen(Math.max(0, toExponent - fromExponent));
  const down = powerOfTen(Math.max(0, fromExponent - toExponent));
  return IntegerMoneySchema.parse({
    amountMinor: divideMinorHalfUp(
      parsed.amountMinor * ratePpm * up,
      PPM_SCALE * down,
    ),
    currency: to,
  });
}

function isEquivalentCurrency(
  code: CurrencyCode,
): code is (typeof EQUIVALENT_CURRENCIES)[number] {
  return (EQUIVALENT_CURRENCIES as readonly CurrencyCode[]).includes(code);
}

/**
 * The approximate equivalents of a charged price, or `null` when none may be shown.
 *
 * `null` covers every case clause 6 (d) hides the line in: the charged price is the stale-FX
 * fallback; a leg has no usable rate; a leg's rate is from another snapshot than the charged
 * price's (or, for a native price, than the other legs'). It also covers a charged currency
 * outside the set, which Phase 0 cannot produce and which would otherwise yield four amounts.
 */
export async function priceEquivalents(
  charged: ChargedPrice,
  now: Date,
): Promise<PriceEquivalents | null> {
  if (charged.fxReasonKey !== undefined) return null;
  const price = IntegerMoneySchema.parse(charged.displayPrice);
  if (!isEquivalentCurrency(price.currency)) return null;

  const native =
    price.currency === charged.destinationCurrencyPrice.currency &&
    charged.fxAsOf === undefined;
  if (!native && charged.fxAsOf === undefined) return null;

  const amounts: IntegerMoney[] = [];
  let asOf: IsoDate | undefined = native ? undefined : charged.fxAsOf;
  for (const target of EQUIVALENT_CURRENCIES) {
    if (target === price.currency) continue;
    const rate = await fxRateFor(price.currency, target, now);
    if (rate === null) return null;
    asOf ??= rate.asOf;
    if (rate.asOf !== asOf) return null;
    amounts.push(convertAtMidRate(price, target, rate.ratePpm));
  }
  if (asOf === undefined || amounts.length === 0) return null;
  return { asOf, amounts };
}
