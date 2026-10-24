/**
 * The basket, re-derived (spec 010 §14 A-founder-2026-10-22 D5, D6, D8, items 4 and 6; AC-59
 * server half, AC-60 server half, AC-61, AC-76; TASK-348).
 *
 * A line waits up to 30 days, so on every render and every action the server re-derives each
 * one, at `now`, and never trusts what it stored:
 *
 *  1. **the product** is still in the catalogue and `active`, and **its tier** is still offered;
 *  2. **the destination's mode** (`currentCheckoutMode()`) is still the basket's, and not `closed`;
 *  3. **the date** is still a selectable chip of the destination's checkout calendar
 *     (`lineDateStatus`), else it is `gone` with the next one for "Use {next}";
 *  4. **the price** is re-verified in the basket's currency (`verifyLineQuote`); a moved price
 *     opens the line's notice (old and new amounts) and blocks placement until `confirmPrice`.
 *
 * A line that fails 1 or 2, or that the provider can no longer price in the basket's currency, is
 * **unavailable**; a line whose date failed is **date-gone**. Both are kept, marked and
 * **excluded from the total** (D8: nothing is dropped silently), and the basket cannot reach step
 * 3 or be placed while one remains: the buyer removes it, or uses the next date.
 *
 * The total is the integer sum of the available lines' current quotes, in the basket's currency
 * (D5: no basket, delivery or service fee anywhere). Nothing here reads the buyer's residence,
 * `Accept-Language`, an IP or a geo header (AC-76): a line's amount depends on its selection, the
 * request's locale code and the basket's currency, and the currency is fixed by the first line.
 *
 * Read-only: `assessBasket` writes nothing. The actions (`steps.ts`) store what it found.
 */
import type { CurrencyCode } from "@/config/currencies";
import type { LocaleCode } from "@/config/locales";
import {
  type IntegerMoney,
  IntegerMoneySchema,
  getProduct,
  listTiers,
} from "@/modules/catalog";

import { type LineDateStatus, lineDateStatus } from "./dates";
import type { BasketLine, Draft } from "./draft";
import { type CheckoutFlagReader, currentCheckoutMode } from "./mode";
import {
  type NoticeAmount,
  type PriceNotice,
  type QuoteCheck,
  BasketCurrencyUnavailable,
  linePriceChange,
  verifyLineQuote,
} from "./pricing";

/** Why a line is unavailable. */
export const unavailableReasons = [
  "product",
  "tier",
  "closed",
  "mode",
  "currency",
  "unpriced",
] as const;
export type UnavailableReason = (typeof unavailableReasons)[number];

/** What a line is at `now`. */
export type LineAvailability =
  | { readonly status: "ok" }
  | { readonly status: "unavailable"; readonly reason: UnavailableReason }
  | { readonly status: "date_gone"; readonly next: string | null };

/** One line, re-derived. */
export interface AssessedLine {
  readonly line: BasketLine;
  readonly availability: LineAvailability;
  /** The line's quote check, when it could be priced; `null` when unavailable before pricing. */
  readonly check: QuoteCheck | null;
  /** The amount charged for it now, in the basket's currency; `null` when it cannot be priced. */
  readonly amount: IntegerMoney | null;
  /** Its price-changed notice, or `null`. */
  readonly notice: PriceNotice | null;
  readonly date: LineDateStatus;
}

/** The basket, re-derived. */
export interface BasketAssessment {
  readonly lines: readonly AssessedLine[];
  /** The integer sum of the available lines' amounts; `null` for a basket with no currency. */
  readonly total: IntegerMoney | null;
  /**
   * The basket-level notice: what the buyer last saw for the available lines, summed, beside the
   * total, when every last-seen amount is in the basket's currency; the per-line notices name
   * both amounts otherwise. `null` when no available line has a notice.
   */
  readonly notice: PriceNotice | null;
  /** True while any line has a notice open. */
  readonly priceChanged: boolean;
  /** True while any line is unavailable or date-gone. */
  readonly hasUnavailable: boolean;
  /** Every line's two screens saved, and the buyer saved: step 3 may render. */
  readonly complete: boolean;
  /** Step 3 is reachable: complete, and no line unavailable or date-gone. */
  readonly reviewReachable: boolean;
  /** Placement may proceed: reachable, and no price notice open. */
  readonly placeable: boolean;
}

export interface AssessOptions {
  readonly locale: LocaleCode;
  readonly now: Date;
  readonly flags?: CheckoutFlagReader;
}

/** True when the product is still offered in this tier. */
async function stillOffered(
  line: BasketLine,
): Promise<UnavailableReason | null> {
  const product = await getProduct(line.sku).catch(() => null);
  if (product?.status !== "active") return "product";
  const tiers = await listTiers(line.sku).catch(() => []);
  return tiers.some((tier) => tier.tierKey === line.tierKey) ? null : "tier";
}

/** One line at `now` (steps 1 to 4 of the file header). */
export async function assessLine(
  draft: Draft,
  line: BasketLine,
  options: AssessOptions,
): Promise<AssessedLine> {
  const date = lineDateStatus(line.countryIso, line.deliveryDate, options.now);
  const unavailable = (reason: UnavailableReason): AssessedLine => ({
    line,
    availability: { status: "unavailable", reason },
    check: null,
    amount: null,
    notice: null,
    date,
  });
  const offered = await stillOffered(line);
  if (offered !== null) return unavailable(offered);
  const mode = await currentCheckoutMode({
    countryIso: line.countryIso,
    locale: options.locale,
    ...(draft.buyer === null
      ? {}
      : { buyerCountry: draft.buyer.residenceCountry }),
    ...(options.flags === undefined ? {} : { flags: options.flags }),
  });
  if (mode === "closed") return unavailable("closed");
  if (mode !== draft.mode) return unavailable("mode");
  const currency = (draft.currency ??
    line.quote?.currency ??
    null) as CurrencyCode | null;
  if (currency === null) return unavailable("currency");
  let check: QuoteCheck;
  try {
    check = await verifyLineQuote(line, currency, options.locale, options.now);
  } catch (error) {
    return unavailable(
      error instanceof BasketCurrencyUnavailable ? "currency" : "unpriced",
    );
  }
  const amount = IntegerMoneySchema.parse({
    amountMinor: check.quote.totalMinor,
    currency: check.quote.currency,
  });
  const notice = linePriceChange({
    quote: check.quote,
    lastSeen: line.lastSeen,
  });
  return {
    line,
    availability:
      date.status === "gone"
        ? { status: "date_gone", next: date.next }
        : { status: "ok" },
    check,
    amount,
    notice,
    date,
  };
}

/** Sums amounts known to be in one currency. */
function sumIn(
  currency: IntegerMoney["currency"],
  amounts: readonly NoticeAmount[],
): IntegerMoney | null {
  let total = 0;
  for (const amount of amounts) {
    if (amount.currency !== currency) return null;
    total += amount.amountMinor;
  }
  if (!Number.isSafeInteger(total)) return null;
  return IntegerMoneySchema.parse({ amountMinor: total, currency });
}

/** Every line of `draft` at `now`, and what the basket may do (the file header). */
export async function assessBasket(
  draft: Draft,
  options: AssessOptions,
): Promise<BasketAssessment> {
  const lines: AssessedLine[] = [];
  for (const line of draft.lines) {
    lines.push(await assessLine(draft, line, options));
  }
  const available = lines.flatMap((entry) =>
    entry.availability.status === "ok" && entry.amount !== null
      ? [{ notice: entry.notice, amount: entry.amount }]
      : [],
  );
  const currency = draft.currency;
  const total =
    currency === null
      ? null
      : sumIn(
          currency,
          available.map((entry) => entry.amount),
        );
  const priceChanged = available.some((entry) => entry.notice !== null);
  const previous =
    currency === null || !priceChanged
      ? null
      : sumIn(
          currency,
          available.map((entry) => entry.notice?.previous ?? entry.amount),
        );
  const hasUnavailable = lines.some(
    (entry) => entry.availability.status !== "ok",
  );
  const complete =
    lines.length > 0 &&
    draft.buyerSaved &&
    lines.every((entry) => entry.line.stepsCompleted === 2);
  const reviewReachable = complete && !hasUnavailable && total !== null;
  return {
    lines,
    total,
    notice:
      previous === null || total === null ? null : { previous, current: total },
    priceChanged,
    hasUnavailable,
    complete,
    reviewReachable,
    placeable: reviewReachable && !priceChanged,
  };
}
