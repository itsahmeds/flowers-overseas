/**
 * Money in the checkout: the draft's quote, its verification, the price-changed notice and the
 * totals every step shows (spec 010 §2 "Money: price shown = price charged", §5.2 `pricing.ts`,
 * §8 "Price display", AC-6, AC-11, AC-17; TASK-203).
 *
 * **One source of amounts.** Every amount comes from spec 005's price provider through the same
 * projections the product page renders: `priceProjection()` for the bouquet (the delivery date's
 * surcharge inside it) and `addonPriceProjection()` for each add-on, in the locale's currency by
 * the bouquet's FX rule. They are signed together into one spec 005 `quote()`, and every step
 * reads its lines and total from that quote. Nothing here reads `country_price`, converts a
 * currency or rounds a price.
 *
 * **Add-on lines in a spec 005 quote.** A quote line is (product, tier, amount). An add-on rides
 * the bouquet's product with the tier key `addon:{key}` (`ADDON_TIER_PREFIX`), so the signed
 * payload covers every amount the buyer is charged. Spec 005's `verifyQuote()` re-resolves a
 * line's price version and knows only bouquet versions, so it answers `expired` for any quote with
 * an add-on line; `verifyDraftQuote()` therefore re-derives on every `expired` and keeps the
 * stored quote unchanged while it is inside its 30 minutes and every re-derived line amount is
 * identical. The observable rule is spec 010's: inside 30 minutes the price holds unless it moved;
 * after 30 minutes it is reissued, silently when the total is the same.
 *
 * **The notice.** `confirmed` on the draft is the last total the buyer saw and accepted. While it
 * differs from the quote's total, `priceChange()` names both amounts, the action sends the buyer
 * to step 1, and placement (TASK-205) is blocked. A change the buyer makes (tier, add-on, date)
 * moves `confirmed` with it: the new total is on the next render, and the buyer chose it.
 */
import type { CountryIso2 } from "@/config/countries";
import type { LocaleCode } from "@/config/locales";
import {
  type IntegerMoney,
  IntegerMoneySchema,
  type PriceProjection,
  type Quote,
  type QuoteLineInput,
  type VatSplit,
  addonPriceProjection,
  priceProjection,
  quote,
  vatBreakdown,
  verifyQuote,
} from "@/modules/catalog";

import type { Draft } from "./draft";

/** The tier key an add-on line carries inside the quote (`addon:chocolates`). */
export const ADDON_TIER_PREFIX = "addon:";

/** What a quote is derived from: the draft's selection, in the request's locale. */
export interface QuoteSelection {
  readonly locale: LocaleCode;
  readonly countryIso: CountryIso2;
  readonly sku: string;
  readonly tierKey: string;
  readonly deliveryDate: string | null;
  readonly addonKeys: readonly string[];
}

/** One line of the order summary, every amount from the quote. */
export type DraftLine =
  | {
      readonly kind: "product";
      readonly sku: string;
      readonly tierKey: string;
      readonly amount: IntegerMoney;
      readonly vatRateBp: number;
    }
  | {
      readonly kind: "addon";
      readonly addonKey: string;
      readonly amount: IntegerMoney;
      readonly vatRateBp: number;
    };

/** The order summary of every step (§2, §5.3): lines, the all-in total, VAT by rate. */
export interface DraftTotals {
  readonly lines: readonly DraftLine[];
  readonly total: IntegerMoney;
  readonly vat: readonly VatSplit[];
}

interface Derived {
  readonly quote: Quote;
  /** The bouquet's VAT rate, and each add-on's, keyed by add-on. */
  readonly productVatRateBp: number;
  readonly addonVatRateBp: ReadonlyMap<string, number>;
}

/**
 * An add-on's projection in the shape `quote()` signs: the bouquet's projection with the add-on's
 * amount, VAT rate and price version. `quote()` reads the display price, the FX provenance, the
 * destination and the price version, and refuses a line in another currency or at another rate.
 */
function addonQuotable(
  bouquet: PriceProjection,
  addon: Awaited<ReturnType<typeof addonPriceProjection>>,
): PriceProjection {
  return {
    ...bouquet,
    displayPrice: addon.displayPrice,
    destinationCurrencyPrice: addon.destinationCurrencyPrice,
    vatRateBp: addon.vatRateBp,
    vatRateText: addon.vatRateText,
    surcharges: [],
    fxAsOf: addon.fxAsOf,
    ratePpm: addon.ratePpm,
    fxReasonKey: addon.fxReasonKey,
    priceVersion: addon.priceVersion,
    priceValidUntil: addon.priceValidUntil,
  };
}

/** Projects every line of `selection` at `now` and signs them. Throws when a price is missing. */
async function derive(selection: QuoteSelection, now: Date): Promise<Derived> {
  const bouquet = await priceProjection(selection.locale, {
    productId: selection.sku,
    tierKey: selection.tierKey,
    countryIso: selection.countryIso,
    ...(selection.deliveryDate === null
      ? {}
      : { deliveryDate: selection.deliveryDate }),
    now,
  });
  const lines: QuoteLineInput[] = [
    {
      productId: selection.sku,
      tierKey: selection.tierKey,
      projection: bouquet,
    },
  ];
  const addonVatRateBp = new Map<string, number>();
  for (const addonKey of selection.addonKeys) {
    const addon = await addonPriceProjection(
      addonKey,
      selection.countryIso,
      selection.locale,
      { now },
    );
    addonVatRateBp.set(addonKey, addon.vatRateBp);
    // A free add-on (`card`, priced 0) adds nothing to the total and a signed line must be
    // positive (spec 005 `QuoteLineSchema`): it is a line of the summary, not of the quote.
    if (addon.displayPrice.amountMinor === 0) continue;
    lines.push({
      productId: selection.sku,
      tierKey: `${ADDON_TIER_PREFIX}${addonKey}`,
      projection: addonQuotable(bouquet, addon),
    });
  }
  return {
    quote: quote(lines, now),
    productVatRateBp: bouquet.vatRateBp,
    addonVatRateBp,
  };
}

/** Signs the selection's current price (the start route; a buyer's change of tier, date or add-on). */
export async function deriveQuote(
  selection: QuoteSelection,
  now: Date,
): Promise<Quote> {
  return (await derive(selection, now)).quote;
}

/** Same currency, same lines, same amounts, in the same order. */
function sameAmounts(left: Quote, right: Quote): boolean {
  return (
    left.currency === right.currency &&
    left.totalMinor === right.totalMinor &&
    left.lines.length === right.lines.length &&
    left.lines.every((line, index) => {
      const other = right.lines[index];
      return (
        other !== undefined &&
        other.productId === line.productId &&
        other.tierKey === line.tierKey &&
        other.amountMinor === line.amountMinor
      );
    })
  );
}

/**
 * What became of the draft's quote (AC-17):
 *
 *  - `ok` — still the price; `quote` is the stored one, unchanged;
 *  - `reissued` — it expired and the re-derived price is the same: `quote` is a fresh signature
 *    of it, stored with no notice;
 *  - `changed` — it expired and the price moved: `quote` is the new price, the notice opens;
 *  - `tampered` — the stored quote does not verify (an edited row, a rotated secret): it is
 *    discarded, `quote` is the fresh price and the draft restarts at step 1.
 */
export type QuoteCheck =
  | { readonly verdict: "ok"; readonly quote: Quote }
  | { readonly verdict: "reissued"; readonly quote: Quote }
  | { readonly verdict: "changed"; readonly quote: Quote }
  | { readonly verdict: "tampered"; readonly quote: Quote };

/** The draft's selection, priced in `locale` (the request's: the buyer may switch language). */
export function selectionOf(draft: Draft, locale: LocaleCode): QuoteSelection {
  return {
    locale,
    countryIso: draft.countryIso,
    sku: draft.sku,
    tierKey: draft.tierKey,
    deliveryDate: draft.deliveryDate,
    addonKeys: draft.addonKeys,
  };
}

/**
 * Verifies the draft's quote at `now` and re-derives where spec 005 says to (AC-17). A stored
 * quote that is absent or does not parse is `tampered`. The selection is the draft's own, so a
 * quote cannot verify against a selection it was not signed for: a re-derived line for another
 * tier or add-on set is a different amount list and so never `ok`.
 */
export async function verifyDraftQuote(
  draft: Draft,
  now: Date,
): Promise<QuoteCheck> {
  const stored = draft.quote;
  const fresh = (): Promise<Quote> =>
    deriveQuote(selectionOf(draft, draft.locale), now);
  if (stored === null) return { verdict: "tampered", quote: await fresh() };
  const verdict = await verifyQuote(stored, now);
  if (verdict === "tampered") {
    return { verdict: "tampered", quote: await fresh() };
  }
  if (verdict === "ok") return { verdict: "ok", quote: stored };
  const current = await fresh();
  if (!sameAmounts(stored, current)) {
    return { verdict: "changed", quote: current };
  }
  return now.getTime() < Date.parse(stored.expiresAt)
    ? { verdict: "ok", quote: stored }
    : { verdict: "reissued", quote: current };
}

/** An amount as the notice names it: integer minor units and an ISO currency. */
export interface NoticeAmount {
  readonly amountMinor: number;
  readonly currency: IntegerMoney["currency"];
}

/** The price-changed notice's two amounts, or `null` when the buyer has seen the current total. */
export function priceChange(draft: {
  readonly quote: {
    readonly totalMinor: number;
    readonly currency: IntegerMoney["currency"];
  } | null;
  readonly confirmed: NoticeAmount | null;
}): { readonly previous: NoticeAmount; readonly current: NoticeAmount } | null {
  if (draft.quote === null || draft.confirmed === null) return null;
  const current: NoticeAmount = {
    amountMinor: draft.quote.totalMinor,
    currency: draft.quote.currency,
  };
  return current.amountMinor === draft.confirmed.amountMinor &&
    current.currency === draft.confirmed.currency
    ? null
    : { previous: draft.confirmed, current };
}

/**
 * The summary every step renders (§2, §5.3): the quote's lines and total, and the VAT split by
 * rate (`vatBreakdown`). The VAT rates are read from the same projections; the amounts are the
 * quote's and only the quote's. `null` when the draft has no quote.
 */
export async function draftTotals(
  draft: Draft,
  now: Date,
): Promise<DraftTotals | null> {
  const signed = draft.quote;
  if (signed === null) return null;
  const rates = await derive(selectionOf(draft, draft.locale), now);
  const amountOf = (tierKey: string): IntegerMoney | null => {
    const line = signed.lines.find(
      (candidate) =>
        candidate.productId === draft.sku && candidate.tierKey === tierKey,
    );
    return line === undefined
      ? null
      : { amountMinor: line.amountMinor, currency: signed.currency };
  };
  const product = amountOf(draft.tierKey);
  if (product === null) return null;
  const lines: DraftLine[] = [
    {
      kind: "product",
      sku: draft.sku,
      tierKey: draft.tierKey,
      amount: product,
      vatRateBp: rates.productVatRateBp,
    },
  ];
  for (const addonKey of draft.addonKeys) {
    lines.push({
      kind: "addon",
      addonKey,
      amount:
        amountOf(`${ADDON_TIER_PREFIX}${addonKey}`) ??
        IntegerMoneySchema.parse({ amountMinor: 0, currency: signed.currency }),
      vatRateBp: rates.addonVatRateBp.get(addonKey) ?? 0,
    });
  }
  return {
    lines,
    total: { amountMinor: signed.totalMinor, currency: signed.currency },
    vat: vatBreakdown(
      lines.map((line) => ({
        rateBp: line.vatRateBp,
        grossMinor: line.amount.amountMinor,
        currency: line.amount.currency,
      })),
    ),
  };
}
