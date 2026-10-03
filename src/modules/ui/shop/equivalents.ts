/**
 * The approximate-equivalents line's message values (spec 004 §14 A21 clause 6 (b); TASK-178).
 *
 * `catalog`'s `priceEquivalents()` decides *whether* there is a line and computes its amounts;
 * this turns them into the two values the `catalog.price.equivalents` message interpolates —
 * "about {amounts} at the rate of {date}" — and nothing else:
 *
 *  - every amount through `formatMoney` (the only money renderer), joined by `formatList` (the
 *    `format.ts` list formatter) as a disjunction, because the line offers alternatives — "about
 *    £47.32, 238.58 PLN or $64.92" — never a sum;
 *  - the rate's `as_of` through `formatDate`'s `dayMonth` style in UTC, because an `as_of` is a
 *    calendar day, not an instant, and UTC midnight is that day everywhere `formatDate` is asked.
 *
 * Shared by the product card (TASK-178) and the product page (TASK-179), so the line reads the
 * same wherever a destination-specific price carries it. Pure: no clock, no `Intl` of its own.
 */
import type { LocaleCode } from "@/config/locales";
import { formatDate, formatList, formatMoney } from "@/modules/i18n";

import type { PriceEquivalentsView } from "./viewModel.ts";

/** The two interpolated values of `catalog.price.equivalents`. */
export type EquivalentsMessageValues = {
  readonly amounts: string;
  readonly date: string;
};

export function equivalentsMessageValues(
  equivalents: PriceEquivalentsView,
  locale: LocaleCode,
): EquivalentsMessageValues {
  return {
    amounts: formatList(
      equivalents.amounts.map((amount) => formatMoney(amount, locale)),
      locale,
      "disjunction",
    ),
    date: formatDate(
      new Date(`${equivalents.asOf}T00:00:00Z`),
      locale,
      "dayMonth",
      "UTC",
    ),
  };
}
