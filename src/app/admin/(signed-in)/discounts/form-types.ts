/**
 * @purpose The discount form island's prop and state shapes, client-safe (no import)
 * @spec 047
 *
 * Types only, so the `"use client"` form (`discount-form.tsx`) imports nothing that reaches the
 * database: every value crosses as a string already formatted on the server, and every word
 * arrives in `DiscountFormCopy` from the admin catalogue.
 */

/** The form's initial text values. */
export interface DiscountFormValues {
  readonly code: string;
  readonly campaignLabel: string;
  readonly kind: "percent" | "fixed";
  readonly percent: string;
  /** Per currency: the amount off and the minimum order as typed text ("5.00"). */
  readonly amounts: Readonly<
    Record<string, { readonly amount: string; readonly min: string }>
  >;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly zone: string;
  readonly maxRedemptions: string;
  readonly maxPerEmail: string;
  readonly countryIds: readonly string[];
  readonly productIds: readonly string[];
  readonly note: string;
}

/** One preview row, every figure formatted. */
export interface DiscountPreviewRowView {
  readonly key: string;
  readonly product: string;
  readonly destination: string;
  readonly vatRate: string;
  readonly price: string;
  readonly discount: string;
  readonly vat: string;
  readonly payout: string;
  readonly margin: string;
  readonly belowCost: boolean;
}

/** The cost preview as the island renders it. */
export interface DiscountPreviewView {
  readonly rows: readonly DiscountPreviewRowView[];
  readonly belowTitle: string | null;
  readonly belowItems: readonly string[];
  readonly claimItems: readonly string[];
  readonly truncated: string | null;
}

/** What a save returns to the island when it does not redirect. */
export interface DiscountFormState {
  readonly result: "invalid" | "not_found" | null;
  /** Field name to its message. */
  readonly errors: Readonly<Record<string, string>>;
}

/** Every word of the form, from `admin.discounts.*`. */
export interface DiscountFormCopy {
  readonly section: string;
  readonly code: string;
  readonly generate: string;
  readonly codeHint: string;
  readonly campaign: string;
  readonly campaignHint: string;
  readonly offer: string;
  readonly kindPercent: string;
  readonly kindFixed: string;
  readonly percent: string;
  readonly percentHint: string;
  readonly perCurrency: string;
  readonly currency: string;
  readonly amountOff: string;
  readonly minOrder: string;
  /** Per currency: the accessible names of its two inputs. */
  readonly amountLabels: Readonly<
    Record<string, { readonly amount: string; readonly min: string }>
  >;
  readonly fixedOnly: string;
  readonly starts: string;
  readonly startsHint: string;
  readonly ends: string;
  readonly optional: string;
  readonly zone: string;
  readonly maxRedemptions: string;
  readonly maxRedemptionsHint: string;
  readonly maxPerEmail: string;
  readonly maxPerEmailHint: string;
  readonly destinations: string;
  readonly destinationsHint: string;
  readonly allDestinations: string;
  readonly bouquets: string;
  readonly bouquetsHint: string;
  readonly allBouquets: string;
  /** "{count} chosen", with `#` where the count goes. */
  readonly chosen: string;
  readonly note: string;
  readonly submit: string;
  readonly cancel: string;
  readonly invalid: string;
  readonly notFound: string;
  readonly frozen: string | null;
  readonly previewTitle: string;
  readonly previewLead: string;
  readonly previewUpdating: string;
  readonly previewEmpty: string;
  readonly claimTitle: string;
  readonly columns: {
    readonly bouquet: string;
    readonly destination: string;
    readonly price: string;
    readonly discount: string;
    readonly vat: string;
    readonly payout: string;
    readonly margin: string;
  };
}

/** A choice of the destination and bouquet lists. */
export interface DiscountChoice {
  readonly value: string;
  readonly label: string;
}
