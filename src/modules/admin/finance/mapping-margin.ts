/**
 * `mappingMarginRow` (spec 030b §14.4; AC-25, AC-45, AC-46; TASK-443): the figures of **one**
 * florist mapping against one open retail price, extracted so the florist's Products and prices
 * tab, the product editor's Made by tab and the Supply matrix share one computation.
 *
 * It is spec 012b's `marginView` (TASK-298) with this mapping as the only payout, so gross, VAT,
 * net, the converted payout, margin and payout share are exactly the margin view's for the same
 * inputs; nothing here re-derives money. Integers only: amounts in minor units beside an ISO
 * currency, the share in basis points, rates in parts per million.
 */
import { type CurrencyCode, isCurrencyCode } from "@/config/currencies";
import {
  type DatedRates,
  marginView,
  PAYOUT_SHARE_WARN_BP,
} from "@/modules/catalog";

/** A mapping's own price: what the florist charges us, in their payout currency. */
export interface MappingPrice {
  readonly partnerCode: string;
  readonly payoutMinor: number;
  readonly currency: string;
}

/** The open `country_price` row of (product, size, country): VAT and delivery included. */
export interface OpenRetailPrice {
  readonly grossMinor: number;
  readonly currency: string;
  readonly vatRateBp: number;
}

/** The rate a payout in another currency was converted at, through EUR (ECB, dated). */
export interface MappingRate {
  readonly from: CurrencyCode;
  readonly to: CurrencyCode;
  readonly asOf: string;
  /** `1 EUR = fromPpm / 1 000 000 from` and `toPpm / 1 000 000 to`. */
  readonly fromPpm: number;
  readonly toPpm: number;
}

export interface MappingMarginFigures {
  readonly currency: CurrencyCode;
  readonly grossMinor: number;
  readonly vatMinor: number;
  readonly netMinor: number;
  /** The florist's price in the retail currency; `null` when no rate converts it. */
  readonly payoutMinor: number | null;
  readonly marginMinor: number | null;
  readonly payoutShareBp: number | null;
  /** Set when the payout was converted. */
  readonly rate: MappingRate | null;
  /** Share strictly above spec 012b's warning constant (`PAYOUT_SHARE_WARN_BP`, read). */
  readonly shareHigh: boolean;
}

function ppmOf(rates: DatedRates, currency: CurrencyCode): number | undefined {
  return currency === rates.base ? 1_000_000 : rates.ratePpm[currency];
}

/** One mapping against one open price; `null` when either currency is not configured. */
export function mappingMarginRow(
  mapping: MappingPrice,
  price: OpenRetailPrice,
  rates: DatedRates,
): MappingMarginFigures | null {
  if (!isCurrencyCode(mapping.currency) || !isCurrencyCode(price.currency)) {
    return null;
  }
  const view = marginView({
    grossMinor: price.grossMinor,
    currency: price.currency,
    vatRateBp: price.vatRateBp,
    payouts: [
      {
        partnerCode: mapping.partnerCode,
        amountMinor: mapping.payoutMinor,
        currency: mapping.currency,
      },
    ],
    rates,
  });
  const fromPpm = ppmOf(rates, mapping.currency);
  const toPpm = ppmOf(rates, price.currency);
  const rate =
    view.convertedAsOf === null || fromPpm === undefined || toPpm === undefined
      ? null
      : {
          from: mapping.currency,
          to: price.currency,
          asOf: view.convertedAsOf,
          fromPpm,
          toPpm,
        };
  return {
    currency: price.currency,
    grossMinor: view.grossMinor,
    vatMinor: view.vatMinor,
    netMinor: view.netMinor,
    payoutMinor: view.highestPayoutMinor,
    marginMinor: view.marginMinor,
    payoutShareBp: view.payoutShareBp,
    rate,
    shareHigh:
      view.payoutShareBp !== null && view.payoutShareBp > PAYOUT_SHARE_WARN_BP,
  };
}
