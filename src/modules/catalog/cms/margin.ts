/**
 * The margin view and the suggested price per (product, size, country) (spec 012b §2.6, AC-21;
 * TASK-298). Pure integer arithmetic, no database.
 *
 * Gross is the all-in price; VAT is split from it at the country's flower rate (`netFromGross`);
 * the payouts are the florists mapped to the size (active and onboarding), each converted into the
 * price's currency at the dated mid rate when its payout currency differs. Margin is net minus the
 * **highest** payout (the worst florist the order could go to); the payout share is that payout
 * over net, in basis points. A share above 65 % saves only with a reason; a net at or below the
 * highest payout is refused, because the order would lose money (§13 Q5).
 *
 * The suggested price is the highest payout divided by 0.60, plus VAT, rounded **up** to the
 * currency's ending (`plan/06` §2: payout 55 to 65 % of net).
 */
import { type CurrencyCode, currencyConfig } from "@/config/currencies";

import { divideMinorCeil, divideMinorHalfUp } from "../pricing/money";
import { roundMinorToStyle } from "../pricing/round";
import { netFromGross } from "../pricing/vat";

const BASIS_POINTS = 10_000;
/** `plan/06` §2: the payout share above which a price needs a reason. */
export const PAYOUT_SHARE_WARN_BP = 6_500;
/** The share the suggested price aims at: payout = 60 % of net. */
export const PAYOUT_SHARE_TARGET_BP = 6_000;

/**
 * One dated set of mid rates, each the number of `quote` units per one `base` unit in parts per
 * million (the `fx_rate` table's shape, base EUR). The base itself is implicit at 1 000 000.
 */
export interface DatedRates {
  readonly base: CurrencyCode;
  readonly asOf: string;
  readonly ratePpm: Readonly<Partial<Record<CurrencyCode, number>>>;
}

export interface Payout {
  readonly partnerCode: string;
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
}

const POWERS = [1, 10, 100, 1000] as const;

function rateOf(rates: DatedRates, currency: CurrencyCode): number | undefined {
  return currency === rates.base ? 1_000_000 : rates.ratePpm[currency];
}

/** `amountMinor` of `from` in `to`, at the dated mid rates through their base, half up. */
export function convertPayout(
  amountMinor: number,
  from: CurrencyCode,
  to: CurrencyCode,
  rates: DatedRates,
): number | undefined {
  if (from === to) return amountMinor;
  const fromRate = rateOf(rates, from);
  const toRate = rateOf(rates, to);
  if (fromRate === undefined || toRate === undefined) return undefined;
  const shift =
    currencyConfig(to).minorUnitExponent -
    currencyConfig(from).minorUnitExponent;
  const up = POWERS[Math.max(0, shift)] ?? 1;
  const down = POWERS[Math.max(0, -shift)] ?? 1;
  return divideMinorHalfUp(amountMinor * toRate * up, fromRate * down);
}

export interface MarginInput {
  readonly grossMinor: number;
  readonly currency: CurrencyCode;
  readonly vatRateBp: number;
  readonly payouts: readonly Payout[];
  readonly rates: DatedRates;
}

export interface MarginView {
  readonly grossMinor: number;
  readonly vatMinor: number;
  readonly netMinor: number;
  readonly currency: CurrencyCode;
  /** Payouts in the price's currency; `null` when no florist is mapped. */
  readonly lowestPayoutMinor: number | null;
  readonly highestPayoutMinor: number | null;
  readonly marginMinor: number | null;
  /** Highest payout over net, in basis points, half up. */
  readonly payoutShareBp: number | null;
  /** Whether any payout was converted, and with which day's rates. */
  readonly convertedAsOf: string | null;
  /** A payout whose currency has no rate on that day (the view cannot judge it). */
  readonly unconverted: readonly string[];
}

export function marginView(input: MarginInput): MarginView {
  const { netMinor, vatMinor } = netFromGross(
    input.grossMinor,
    input.vatRateBp,
  );
  const converted: number[] = [];
  const unconverted: string[] = [];
  let anyConverted = false;
  for (const payout of input.payouts) {
    const amount = convertPayout(
      payout.amountMinor,
      payout.currency,
      input.currency,
      input.rates,
    );
    if (amount === undefined) {
      unconverted.push(payout.partnerCode);
      continue;
    }
    if (payout.currency !== input.currency) anyConverted = true;
    converted.push(amount);
  }
  const lowest = converted.length === 0 ? null : Math.min(...converted);
  const highest = converted.length === 0 ? null : Math.max(...converted);
  return {
    grossMinor: input.grossMinor,
    vatMinor,
    netMinor,
    currency: input.currency,
    lowestPayoutMinor: lowest,
    highestPayoutMinor: highest,
    marginMinor: highest === null ? null : netMinor - highest,
    payoutShareBp:
      highest === null || netMinor <= 0
        ? null
        : divideMinorHalfUp(highest * BASIS_POINTS, netMinor),
    convertedAsOf: anyConverted ? input.rates.asOf : null,
    unconverted,
  };
}

/** The price whose payout share is 60 %, VAT added, rounded up to the currency's ending. */
export function suggestedPrice(
  highestPayoutMinor: number,
  currency: CurrencyCode,
  vatRateBp: number,
): number {
  const net = divideMinorCeil(
    [highestPayoutMinor, BASIS_POINTS],
    PAYOUT_SHARE_TARGET_BP,
  );
  const gross = divideMinorCeil([net, BASIS_POINTS + vatRateBp], BASIS_POINTS);
  const { minorUnitExponent, roundingStyle } = currencyConfig(currency);
  return roundMinorToStyle(gross, roundingStyle, minorUnitExponent);
}

/** What a price does to the margin rule: refuse, ask for a reason, or pass. */
export type MarginVerdict = "below_payout" | "share_high" | "ok";

export function marginVerdict(view: MarginView): MarginVerdict {
  if (view.highestPayoutMinor === null) return "ok";
  if (view.netMinor <= view.highestPayoutMinor) return "below_payout";
  if (
    view.payoutShareBp !== null &&
    view.payoutShareBp > PAYOUT_SHARE_WARN_BP
  ) {
    return "share_high";
  }
  return "ok";
}
