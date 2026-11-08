/**
 * `costPreviewRow`: one row of the admin cost preview (spec 047 §2 "Codes, made in admin"; AC-6;
 * TASK-446).
 *
 * For one bouquet in one destination, at its default size and in the destination's currency: the
 * price, the discount at that price (`discountAmount`), the VAT on what the buyer then pays
 * (spec 005's `netFromGross`, the same arithmetic as the order's `vat_breakdown`), our worst-case
 * florist pay (spec 012b's highest mapped payout), and the margin after discount: the paid amount
 * net of VAT minus that pay. A row is below cost when the margin is at or below zero; the founder
 * can still save (§13 Q6: a warning, never a block).
 *
 * Pure and integer only. A payout in another currency than the price has no rate here, so its
 * margin is null rather than a converted guess.
 */
import { netFromGross } from "@/modules/catalog";

import { type AppliedCodeTerms, discountAmount } from "./allocate";

export interface CostPreviewInput {
  readonly priceMinor: number;
  readonly currency: string;
  readonly vatRateBp: number;
  /** The highest mapped florist pay for the bouquet's default size, or null when unmapped. */
  readonly highestPayoutMinor: number | null;
  readonly payoutCurrency: string | null;
  readonly terms: AppliedCodeTerms;
}

export interface CostPreviewRow {
  readonly priceMinor: number;
  readonly discountMinor: number;
  readonly vatMinor: number;
  readonly highestPayoutMinor: number | null;
  readonly marginMinor: number | null;
  readonly belowCost: boolean;
}

/** The preview figures of one bouquet in one destination. */
export function costPreviewRow(input: CostPreviewInput): CostPreviewRow {
  const discount = discountAmount(input.terms, {
    amountMinor: input.priceMinor,
    currency: input.currency,
  });
  const paidMinor = input.priceMinor - discount.amountMinor;
  const { vatMinor } = netFromGross(paidMinor, input.vatRateBp);
  const comparable =
    input.highestPayoutMinor !== null &&
    input.payoutCurrency === input.currency;
  const marginMinor = comparable
    ? paidMinor - vatMinor - (input.highestPayoutMinor ?? 0)
    : null;
  return {
    priceMinor: input.priceMinor,
    discountMinor: discount.amountMinor,
    vatMinor,
    highestPayoutMinor: input.highestPayoutMinor,
    marginMinor,
    belowCost: marginMinor !== null && marginMinor <= 0,
  };
}
