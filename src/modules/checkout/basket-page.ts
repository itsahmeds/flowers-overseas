/**
 * The basket page's view model (spec 010 §14 A-founder-2026-10-22 items 6 and 8, D5, D8; AC-57,
 * AC-59 and AC-60 render halves on the basket, AC-73, AC-76; TASK-349).
 *
 * `loadBasketPage()` is everything `/{locale}/basket` decides before it renders: which state
 * (empty, or lines), what each line shows, which lines are left out of the total, the one total,
 * the start route's notice, the price-changed notice, and where "Continue shopping" goes. The
 * page (`./ui/BasketView.tsx`) only resolves message keys and formats.
 *
 * - **Empty** (item 6): no cookie, a token with no row, an expired draft, a placed one, or a draft
 *   with no unplaced line. One state, one sentence and one link; the page does not say which.
 * - **Lines**: each line re-derived by `assessBasket()` at `now` (D8): `ok`, `unavailable` or
 *   `dateGone`. The total is the assessment's: the integer sum of the **available** lines'
 *   current amounts in the basket's currency, nothing added (D5). An unavailable line still shows
 *   the amount it was quoted at, greyed, and is not in the total; a date-gone line shows its
 *   re-priced amount and is not in the total either, until "Use {next}".
 * - **The notice** of the start route (`added`, `full`, `other_mode`, `other_currency`) is read
 *   from `checkout_draft.pending_notice` and cleared in the same request, without moving the
 *   basket's 30-day window (`clearPendingNotice`), so it shows once and never travels in a URL.
 *
 * Nothing here reads the buyer's residence, `Accept-Language`, an IP or a geo header (AC-76): the
 * page hands in the cookie's token, the URL's locale and the clock.
 */
import type { CountryIso2 } from "@/config/countries";
import type { LocaleCode } from "@/config/locales";
import {
  type IntegerMoney,
  type LineDisplay,
  IntegerMoneySchema,
  lineDisplay,
} from "@/modules/catalog";
import { checkoutDeliveryWindow } from "@/modules/geo";

import { type BasketAssessment, assessBasket } from "./basket";
import {
  type DraftConnection,
  type DraftMode,
  type PendingNotice,
  clearPendingNotice,
  loadDraft,
} from "./draft";
import type { CheckoutFlagReader } from "./mode";
import type { PriceNotice } from "./pricing";

/** Why a date has gone, as the calendar names it (`delivery.reason.*`), with its arguments. */
export interface GoneReason {
  readonly key: string;
  readonly params: Readonly<Record<string, string>>;
}

/** One line as the basket page draws it. */
export interface BasketPageLine {
  readonly position: number;
  readonly countryIso: CountryIso2;
  readonly state: "ok" | "unavailable" | "dateGone";
  readonly display: LineDisplay;
  /** The line's date, or `null` before its step 1 (a demo line: "date at checkout"). */
  readonly deliveryDate: string | null;
  /** The amount shown: the current one, or for an unavailable line the one it was quoted at. */
  readonly amount: IntegerMoney | null;
  /** For a date-gone line: the next date and why the old one went. */
  readonly gone: {
    readonly next: string | null;
    readonly reason: GoneReason;
  } | null;
}

export type BasketPage =
  | { readonly kind: "empty" }
  | {
      readonly kind: "lines";
      readonly mode: DraftMode;
      readonly lines: readonly BasketPageLine[];
      /** The integer sum of the available lines' amounts; `null` only for a pre-basket draft. */
      readonly total: IntegerMoney | null;
      /** The start route's notice, shown once. */
      readonly notice: PendingNotice | null;
      /** What the buyer saw against what the basket costs now, while a line's price moved. */
      readonly priceNotice: PriceNotice | null;
      /** How many lines are unavailable or date-gone. */
      readonly blocked: number;
      /** The destination "Continue shopping" goes back to: the last line's. */
      readonly continueCountry: CountryIso2;
    };

export interface LoadBasketPageInput {
  /** The `fo_checkout` cookie's value, or `null`. */
  readonly token: string | null;
  readonly locale: LocaleCode;
  readonly now: Date;
  readonly connection?: DraftConnection;
  readonly flags?: CheckoutFlagReader;
}

/**
 * Why `date` is not deliverable at `now` in `countryIso`: the calendar's own reason for that day
 * when it is still in the checkout window, otherwise "This date has passed".
 */
export function goneReason(
  countryIso: CountryIso2,
  date: string,
  now: Date,
): GoneReason {
  const window = checkoutDeliveryWindow({ countryIso, from: now });
  const chip = window.dates.find((candidate) => candidate.date === date);
  const key = chip?.reasonKey ?? "delivery.reason.beforeEarliest";
  return {
    key,
    params: {
      time: window.cutoffLocal ?? "",
      city:
        window.timeZone === undefined
          ? ""
          : (window.timeZone.split("/").at(-1) ?? "").replaceAll("_", " "),
    },
  };
}

function shownAmount(
  entry: BasketAssessment["lines"][number],
): IntegerMoney | null {
  if (entry.amount !== null) return entry.amount;
  const quote = entry.line.quote;
  return quote === null
    ? null
    : IntegerMoneySchema.parse({
        amountMinor: quote.totalMinor,
        currency: quote.currency,
      });
}

export async function loadBasketPage(
  input: LoadBasketPageInput,
): Promise<BasketPage> {
  const lookup = await loadDraft(input.token, input.now, input.connection);
  if (lookup.status !== "active") return { kind: "empty" };
  const { draft } = lookup;
  const last = draft.lines.at(-1);
  if (draft.purchaseId !== null || last === undefined) return { kind: "empty" };
  const assessment = await assessBasket(draft, {
    locale: input.locale,
    now: input.now,
    ...(input.flags === undefined ? {} : { flags: input.flags }),
  });
  if (draft.pendingNotice !== null) {
    await clearPendingNotice(draft.id, input.connection);
  }
  const lines = await Promise.all(
    assessment.lines.map(async (entry): Promise<BasketPageLine> => {
      const { line, availability } = entry;
      return {
        position: line.position,
        countryIso: line.countryIso,
        state:
          availability.status === "ok"
            ? "ok"
            : availability.status === "date_gone"
              ? "dateGone"
              : "unavailable",
        display: await lineDisplay({
          sku: line.sku,
          tierKey: line.tierKey,
          addonKeys: line.addonKeys,
          countryIso: line.countryIso,
          locale: input.locale,
        }),
        deliveryDate: line.deliveryDate,
        amount: shownAmount(entry),
        gone:
          availability.status === "date_gone" && line.deliveryDate !== null
            ? {
                next: availability.next,
                reason: goneReason(
                  line.countryIso,
                  line.deliveryDate,
                  input.now,
                ),
              }
            : null,
      };
    }),
  );
  return {
    kind: "lines",
    mode: draft.mode,
    lines,
    total: assessment.total,
    notice: draft.pendingNotice,
    priceNotice: assessment.notice,
    blocked: lines.filter((line) => line.state !== "ok").length,
    continueCountry: last.countryIso,
  };
}
