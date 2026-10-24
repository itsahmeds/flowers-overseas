/**
 * Suggested partial refund amounts (spec 020a §5.2 "Suggested partial amounts", §13 Q3, AC-22;
 * `plan/06` §2.2; TASK-359).
 *
 * Prefill only: choosing a suggestion fills the amount field and the reason, and never submits.
 * Our prices include delivery, so there is no delivery-fee line to read (§13 Q3's answer):
 *  - `addon_missing`: one suggestion per add-on line, `qty × unit_retail_minor`;
 *  - `substitution_complaint`: 30 % of the product lines' total;
 *  - `late_delivery`: 20 % of the order total.
 * Percentages are integer arithmetic on minor units, rounded half to even. A suggestion that a
 * partial refund could not take (zero, or at or above the remaining balance) is not offered.
 */
import type { AdminRefundReason } from "./schemas.ts";

/** Whole percentages, §13 Q3's approved defaults. */
export const SUGGESTED_REFUND_PERCENT = Object.freeze({
  substitution_complaint: 30n,
  late_delivery: 20n,
} as const);

export interface SuggestionLine {
  readonly id: string;
  readonly kind: string;
  readonly qty: number;
  readonly unitRetailMinor: bigint;
}

export interface SuggestionOrder {
  readonly lines: readonly SuggestionLine[];
  /** `"order".buyer_total_minor`: what the buyer was charged for this order. */
  readonly buyerTotalMinor: bigint;
  /** `remainingRefundable(...)` for this order. */
  readonly remainingMinor: bigint;
}

export interface SuggestedRefund {
  readonly reason: Extract<
    AdminRefundReason,
    "addon_missing" | "substitution_complaint" | "late_delivery"
  >;
  readonly amountMinor: bigint;
  /** The add-on line a `addon_missing` suggestion is for; absent for the percentage ones. */
  readonly lineId?: string;
}

/** `valueMinor × percent / 100`, rounded half to even, in integers only. */
export function percentHalfEven(valueMinor: bigint, percent: bigint): bigint {
  const scaled = valueMinor * percent;
  const quotient = scaled / 100n;
  const twiceRemainder = (scaled % 100n) * 2n;
  if (twiceRemainder > 100n) return quotient + 1n;
  if (twiceRemainder === 100n && quotient % 2n !== 0n) return quotient + 1n;
  return quotient;
}

function lineTotalMinor(line: SuggestionLine): bigint {
  return BigInt(line.qty) * line.unitRetailMinor;
}

export function suggestedRefunds(
  order: SuggestionOrder,
): readonly SuggestedRefund[] {
  const addonSuggestions: SuggestedRefund[] = order.lines
    .filter((line) => line.kind === "addon")
    .map((line) => ({
      reason: "addon_missing",
      amountMinor: lineTotalMinor(line),
      lineId: line.id,
    }));
  const productLinesMinor = order.lines
    .filter((line) => line.kind === "product")
    .reduce((sum, line) => sum + lineTotalMinor(line), 0n);
  const all: readonly SuggestedRefund[] = [
    ...addonSuggestions,
    {
      reason: "substitution_complaint",
      amountMinor: percentHalfEven(
        productLinesMinor,
        SUGGESTED_REFUND_PERCENT.substitution_complaint,
      ),
    },
    {
      reason: "late_delivery",
      amountMinor: percentHalfEven(
        order.buyerTotalMinor,
        SUGGESTED_REFUND_PERCENT.late_delivery,
      ),
    },
  ];
  return all.filter(
    (suggestion) =>
      suggestion.amountMinor >= 1n &&
      suggestion.amountMinor < order.remainingMinor,
  );
}
