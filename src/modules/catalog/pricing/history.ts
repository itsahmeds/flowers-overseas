/**
 * Price history: the Omnibus Art. 6a figure (spec 005 §2 "Pricing", §5.2 `pricing/history.ts`,
 * §8, AC-14; TASK-068).
 *
 * Directive (EU) 2019/2161 Art. 6a requires that any announcement of a price reduction states the
 * **lowest price applied during the 30 days before the reduction** (`plan/07` §2.1; the UK's
 * CPUT/DMCC position is the same in substance). This file computes that number and nothing else,
 * and three properties are the reason it exists before any "was/now" UI does:
 *
 *  1. **History is superseded rows, never an audit log.** A price is corrected by closing a
 *     `country_price` row (`active_to`) and inserting a new one, which spec 002 §5.1's partial
 *     unique index makes the only representable way to change a price. So the 30-day minimum is a
 *     read over rows we already keep, and no separate history table, trigger or event exists to
 *     drift from the prices actually charged.
 *  2. **No "was/now" UI ships in Phase 0, and none may be added without this number** (spec 005
 *     §3). Publishing a struck-through price without the Art. 6a figure is the exact infringement
 *     the article names, so the lawful figure lands first and the UI that needs it lands later
 *     (specs 008/009), with this function as its only source.
 *  3. **The clock is injected.** `asOf` is a parameter, there is no `Date.now()` in this file, and
 *     the window is computed from that instant — so "what was the lowest price on 14 February"
 *     is answerable, and every test is deterministic (`plan/12` §2).
 *
 * The window is **[asOf − 30 days, asOf]**, inclusive of its first day: a row that was active on
 * that first day counts, and one whose whole active span ended before it does not (AC-14, T-12).
 * Comparison is on `YYYY-MM-DD` strings, which sort chronologically, so no time zone enters a
 * legal window that is stated in calendar days.
 */
import type { CountryIso2 } from "@/config/countries";

import { catalogProviders, type CountryPriceRecord } from "../providers";
import {
  DestinationIsoSchema,
  IsoDateSchema,
  ProductSkuSchema,
  TierKeySchema,
} from "../schemas";
import type { IntegerMoney, IsoDate } from "../types";

/**
 * The length of the Art. 6a window in days (`plan/07` §2.1).
 *
 * Thirty, and named, because two other numbers in this codebase are also thirty (the quote TTL in
 * minutes, the prebuild page count) and none of them may be changed by editing another.
 */
export const OMNIBUS_WINDOW_DAYS = 30;

/**
 * The first day of the window: `asOf` minus 30 days, as a calendar day.
 *
 * `Date.UTC` on the parsed parts, with no zone and no wall-clock time in it — the same
 * convention `pricing/resolve.ts` uses to ask which weekday a day is. This is arithmetic on a
 * legal window, not the delivery calendar spec 005 §3 assigns to spec 009: no cut-off, no
 * holiday, no occasion rule and no IANA zone appears here or may.
 */
function windowStart(asOf: IsoDate): IsoDate {
  const [year, month, day] = IsoDateSchema.parse(asOf).split("-").map(Number);
  const stepped = new Date(
    Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) - OMNIBUS_WINDOW_DAYS),
  );
  return stepped.toISOString().slice(0, 10);
}

/**
 * Was this row the price at any point inside `[from, to]`?
 *
 * A row is in force over `[activeFrom, activeTo)` — the half-open interval spec 002 §5.1's
 * `CHECK (active_to > active_from)` describes and the dataset authors, with `active_to` the
 * **exclusive** end (`pricing/resolve.ts` reads surcharge windows the same way). So a row
 * overlaps the window when it started on or before the window's last day and was still in force
 * on the window's first day. `activeTo === null` is the current row, in force with no end.
 *
 * The window's first day is **inclusive**: a row that was the price only on that day counts
 * (`activeTo === from + 1 day` > `from`), and a row superseded *on* that day — its last day of
 * force being the day before, the window's "day 31" — does not. That is the reading Art. 6a's
 * "during the 30 days" requires, and the boundary T-12 pins from both sides.
 */
function activeInWindow(
  row: CountryPriceRecord,
  from: IsoDate,
  to: IsoDate,
): boolean {
  if (row.activeFrom > to) return false;
  return row.activeTo === null || row.activeTo > from;
}

/**
 * The lowest price this (product, tier, destination) was offered at in the 30 days up to `asOf`
 * (spec 005 §2, AC-14).
 *
 * It is the minimum over **every** row in force at any point in the window, the current one
 * included — so when no cheaper row exists the answer is today's price, which is the honest
 * figure to state beside an unreduced price and the reason a caller never has to special-case
 * "no history".
 *
 * In the destination country's own currency, because that is the currency the price was applied
 * in: converting the historical figure to a display currency at *today's* rate would state that a
 * price was once available at an amount nobody could have paid. Spec 008/009 project it exactly
 * as they project a `PricePoint`, with the same rate stamped on the same page.
 *
 * Throws when the (product, tier, destination) has no rows in the window at all: an Art. 6a
 * figure with nothing behind it is not a smaller number, it is a data error (the same rule
 * `resolvePrice()` follows).
 */
export async function lowestPriceInLast30Days(
  productId: string,
  tierKey: string,
  countryIso: CountryIso2,
  asOf: IsoDate,
): Promise<IntegerMoney> {
  const sku = ProductSkuSchema.parse(productId);
  const tier = TierKeySchema.parse(tierKey);
  const destination = DestinationIsoSchema.parse(countryIso);
  const to = IsoDateSchema.parse(asOf);
  const from = windowStart(to);

  const rows = (await catalogProviders().price.countryPrices()).filter(
    (row) =>
      row.sku === sku &&
      row.countryIso2 === destination &&
      row.tierKey === tier &&
      // A surcharge is not the price of the product: Art. 6a compares the product's own price,
      // and a Sunday supplement in the minimum would state a figure nobody was ever charged for
      // the bouquet alone (spec 005 §13 Q7).
      row.surchargeKind === null &&
      activeInWindow(row, from, to),
  );

  const lowest = rows.reduce<CountryPriceRecord | undefined>(
    (best, row) =>
      best === undefined || row.retailMinor < best.retailMinor ? row : best,
    undefined,
  );
  if (lowest === undefined) {
    throw new Error(
      `no \`country_price\` row for \`${sku}\` tier \`${tier}\` in \`${destination}\` was in force between ${from} and ${to}: the Omnibus Art. 6a figure has no rows behind it, which is a data error rather than a lower price (spec 005 §2, plan/07 §2.1)`,
    );
  }
  return { amountMinor: lowest.retailMinor, currency: lowest.currency };
}
