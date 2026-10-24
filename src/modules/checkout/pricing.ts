/**
 * Money in the checkout: each line's quote, its verification, the price-changed notice and the
 * totals every step shows (spec 010 §2 "Money: price shown = price charged", §5.2 `pricing.ts`,
 * §8 "Price display", AC-6, AC-11, AC-17; §14 A-founder-2026-10-22 D5, D6, AC-56, AC-61, AC-76;
 * TASK-203, TASK-348).
 *
 * **One source of amounts.** Every amount comes from spec 005's price provider through the same
 * projections the product page renders: `priceProjection()` for the bouquet (the delivery date's
 * surcharge inside it) and `addonPriceProjection()` for each add-on, by the bouquet's FX rule.
 * They are signed together into one spec 005 `quote()` **per line** (two destinations have two FX
 * rates, and a quote has one), and every step reads a line's amounts from its quote. Nothing here
 * reads `country_price`, converts a currency or rounds a price.
 *
 * **One currency per basket (D6).** The basket's currency is the one its first line was priced
 * in. Every line is priced in it: the provider decides currency by locale and by nothing else
 * (spec 005 §7), so a line is projected through the request's locale when that locale shows the
 * basket's currency, else through a locale whose default currency it is. A line the provider
 * cannot price in it (stale FX, where only the destination's own currency is shown, spec 005 §14
 * A3) is refused (`BasketCurrencyUnavailable`); the basket never holds two currencies, and
 * changing the UI language never changes its currency. The buyer's residence, `Accept-Language`
 * and IP are never inputs (AC-76): only the locale code and the basket's currency are.
 *
 * **Add-on lines in a spec 005 quote.** A quote line is (product, tier, amount). An add-on rides
 * the bouquet's product with the tier key `addon:{key}` (`ADDON_TIER_PREFIX`), so the signed
 * payload covers every amount the buyer is charged. Spec 005's `verifyQuote()` re-resolves a
 * line's price version and knows only bouquet versions, so it answers `expired` for any quote with
 * an add-on line; `verifyLineQuote()` therefore re-derives on every check, refuses a quote whose
 * lines are not exactly the line's selection (`changed`), and keeps the stored quote unchanged
 * while it is inside its 30 minutes and every re-derived amount is identical.
 *
 * **The notice.** `lastSeen` on a line is the amount the buyer last saw for it (the product page's
 * figure when the line was added, in whatever currency that page showed). While it differs from
 * the line's quote, `linePriceChange()` names both, and placement (TASK-205) is blocked until the
 * buyer confirms (`confirmPrice`). A change the buyer makes (tier, add-on, date) moves `lastSeen`
 * with it, unless a notice is already open on that line.
 */
import type { CountryIso2 } from "@/config/countries";
import type { CurrencyCode } from "@/config/currencies";
import { LOCALES, type LocaleCode } from "@/config/locales";
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

import type { BasketLine } from "./draft";

/** The tier key an add-on line carries inside the quote (`addon:chocolates`). */
export const ADDON_TIER_PREFIX = "addon:";

/** What a line's quote is derived from: its selection, through one locale. */
export interface QuoteSelection {
  readonly locale: LocaleCode;
  readonly countryIso: CountryIso2;
  readonly sku: string;
  readonly tierKey: string;
  readonly deliveryDate: string | null;
  readonly addonKeys: readonly string[];
}

/** One line of a delivery's summary, every amount from its quote. */
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

/** One delivery's summary (§2, §5.3): its lines, its all-in total, VAT by rate. */
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
  /** The line's add-ons whose current price is 0 (`card`): summary lines, never signed lines. */
  readonly freeAddons: ReadonlySet<string>;
}

/**
 * The provider cannot price this line in the basket's currency (D6, AC-56): the start route
 * refuses the add with the `other_currency` notice; a line already in the basket is marked
 * unavailable.
 */
export class BasketCurrencyUnavailable extends Error {
  readonly currency: CurrencyCode;
  constructor(currency: CurrencyCode) {
    super(`this line cannot be priced in the basket's currency ${currency}`);
    this.name = "BasketCurrencyUnavailable";
    this.currency = currency;
  }
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
  const freeAddons = new Set<string>();
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
    if (addon.displayPrice.amountMinor === 0) {
      freeAddons.add(addonKey);
      continue;
    }
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
    freeAddons,
  };
}

/** Signs the selection's current price through its own locale (the basket's first line). */
export async function deriveQuote(
  selection: QuoteSelection,
  now: Date,
): Promise<Quote> {
  return (await derive(selection, now)).quote;
}

/**
 * The locales a line may be projected through to land in `currency`: the preferred one (the
 * request's) first, then every locale whose default currency it is, each once. The provider
 * decides the currency from the locale and nothing else (spec 005 §7).
 */
export function pricingLocalesFor(
  currency: CurrencyCode,
  preferred: LocaleCode,
): readonly LocaleCode[] {
  const out: LocaleCode[] = [preferred];
  for (const locale of LOCALES) {
    if (locale.isPseudo || locale.currencyDefault !== currency) continue;
    const code = locale.code as LocaleCode;
    if (!out.includes(code)) out.push(code);
  }
  return out;
}

/** A line's selection without the locale, which `pricingLocalesFor` decides. */
export type LineSelection = Omit<QuoteSelection, "locale">;

async function deriveInCurrency(
  selection: LineSelection,
  currency: CurrencyCode,
  preferred: LocaleCode,
  now: Date,
): Promise<Derived> {
  for (const locale of pricingLocalesFor(currency, preferred)) {
    const derived = await derive({ ...selection, locale }, now);
    if (derived.quote.currency === currency) return derived;
  }
  throw new BasketCurrencyUnavailable(currency);
}

/**
 * Signs a line's current price **in the basket's currency** (D6). Throws
 * `BasketCurrencyUnavailable` when no locale's projection lands in it, and the provider's own
 * error when the line has no price at all.
 */
export async function deriveLineQuote(
  selection: LineSelection,
  currency: CurrencyCode,
  preferred: LocaleCode,
  now: Date,
): Promise<Quote> {
  return (await deriveInCurrency(selection, currency, preferred, now)).quote;
}

/** The line's selection. */
export function selectionOf(line: BasketLine): LineSelection {
  return {
    countryIso: line.countryIso,
    sku: line.sku,
    tierKey: line.tierKey,
    deliveryDate: line.deliveryDate,
    addonKeys: line.addonKeys,
  };
}

/** The same priced lines (product and size, then each paid add-on), in the same order. */
function sameLines(left: Quote, right: Quote): boolean {
  return (
    left.lines.length === right.lines.length &&
    left.lines.every((line, index) => {
      const other = right.lines[index];
      return (
        other !== undefined &&
        other.productId === line.productId &&
        other.tierKey === line.tierKey
      );
    })
  );
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
 * What became of a line's quote (AC-17, per line):
 *
 *  - `ok`: still the price; `quote` is the stored one, unchanged;
 *  - `reissued`: it expired and the re-derived price is the same: `quote` is a fresh signature
 *    of it, stored with no notice;
 *  - `changed`: the price moved: `quote` is the new price, the notice opens;
 *  - `tampered`: the stored quote does not verify (an edited row, a rotated secret) or is in
 *    another currency than the basket's: it is discarded, `quote` is the fresh price and the line
 *    restarts at step 1.
 */
export type QuoteCheck =
  | { readonly verdict: "ok"; readonly quote: Quote }
  | { readonly verdict: "reissued"; readonly quote: Quote }
  | { readonly verdict: "changed"; readonly quote: Quote }
  | { readonly verdict: "tampered"; readonly quote: Quote };

/**
 * Verifies a line's quote at `now` and re-derives where spec 005 says to (AC-17), in the basket's
 * currency. A stored quote that is absent or does not parse is `tampered`. The selection is the
 * line's own, so a quote cannot verify against a selection it was not signed for: a re-derived
 * line for another tier or add-on set is a different amount list and so never `ok`.
 */
export async function verifyLineQuote(
  line: BasketLine,
  currency: CurrencyCode,
  preferred: LocaleCode,
  now: Date,
): Promise<QuoteCheck> {
  const stored = line.quote;
  const fresh = (): Promise<Quote> =>
    deriveLineQuote(selectionOf(line), currency, preferred, now);
  if (stored === null || stored.currency !== currency) {
    return { verdict: "tampered", quote: await fresh() };
  }
  const verdict = await verifyQuote(stored, now);
  if (verdict === "tampered") {
    return { verdict: "tampered", quote: await fresh() };
  }
  const current = await fresh();
  // The quote must price exactly the line's selection: the product and size, then each paid
  // add-on, nothing else (`/review 275` change 1, `/break 275` hole 1).
  if (!sameLines(stored, current)) {
    return { verdict: "changed", quote: current };
  }
  if (verdict === "ok") return { verdict: "ok", quote: stored };
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

/** A price-changed notice: what the buyer last saw, and what is charged now. */
export interface PriceNotice {
  readonly previous: NoticeAmount;
  readonly current: NoticeAmount;
}

/**
 * One line's price-changed notice (AC-6, AC-61): the amount the buyer last saw for it beside the
 * quote's, in their own currencies, or `null` when the buyer has seen the current amount.
 */
export function linePriceChange(line: {
  readonly quote: {
    readonly totalMinor: number;
    readonly currency: IntegerMoney["currency"];
  } | null;
  readonly lastSeen: NoticeAmount | null;
}): PriceNotice | null {
  if (line.quote === null || line.lastSeen === null) return null;
  const current: NoticeAmount = {
    amountMinor: line.quote.totalMinor,
    currency: line.quote.currency,
  };
  return current.amountMinor === line.lastSeen.amountMinor &&
    current.currency === line.lastSeen.currency
    ? null
    : { previous: line.lastSeen, current };
}

/**
 * A delivery's summary (§2, §5.3): the line's quote lines and total, and the VAT split by rate
 * (`vatBreakdown`). The VAT rates are read from the same projections; the amounts are the quote's
 * and only the quote's. `null` when the line has no quote or the quote is not its selection's.
 */
export async function lineTotals(
  line: BasketLine,
  preferred: LocaleCode,
  now: Date,
): Promise<DraftTotals | null> {
  const signed = line.quote;
  if (signed === null) return null;
  let rates: Derived;
  try {
    rates = await deriveInCurrency(
      selectionOf(line),
      signed.currency,
      preferred,
      now,
    );
  } catch {
    return null;
  }
  const amountOf = (tierKey: string): IntegerMoney | null => {
    const found = signed.lines.find(
      (candidate) =>
        candidate.productId === line.sku && candidate.tierKey === tierKey,
    );
    return found === undefined
      ? null
      : { amountMinor: found.amountMinor, currency: signed.currency };
  };
  const product = amountOf(line.tierKey);
  if (product === null) return null;
  const lines: DraftLine[] = [
    {
      kind: "product",
      sku: line.sku,
      tierKey: line.tierKey,
      amount: product,
      vatRateBp: rates.productVatRateBp,
    },
  ];
  for (const addonKey of line.addonKeys) {
    const signedLine = amountOf(`${ADDON_TIER_PREFIX}${addonKey}`);
    // Only a free add-on (`card`) is a summary line without a signed line. A paid add-on the
    // quote does not price means the quote is not this selection's: no totals at all.
    if (signedLine === null && !rates.freeAddons.has(addonKey)) return null;
    const vatRateBp = rates.addonVatRateBp.get(addonKey);
    if (vatRateBp === undefined) return null;
    lines.push({
      kind: "addon",
      addonKey,
      amount:
        signedLine ??
        IntegerMoneySchema.parse({ amountMinor: 0, currency: signed.currency }),
      vatRateBp,
    });
  }
  const signedCount = lines.filter(
    (entry) => entry.amount.amountMinor > 0,
  ).length;
  if (signedCount !== signed.lines.length) return null;
  return {
    lines,
    total: { amountMinor: signed.totalMinor, currency: signed.currency },
    vat: vatBreakdown(
      lines.map((entry) => ({
        rateBp: entry.vatRateBp,
        grossMinor: entry.amount.amountMinor,
        currency: entry.amount.currency,
      })),
    ),
  };
}
