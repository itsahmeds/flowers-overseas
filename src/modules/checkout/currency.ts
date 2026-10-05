/**
 * The checkout's one currency (spec 010 §2 "Money", AC-18; spec 005 §7, §14 A3; TASK-200).
 *
 * A checkout is in exactly one currency, and it is **the currency the product page displayed**
 * for the locale: the locale's default when a usable rate exists, the destination's own currency
 * when the rate is too old (spec 005 §14 A3). It is never chosen here and never by the buyer:
 * there is no currency switch in Phase 0 and no form field that names one (`schemas.ts`). It is
 * read off the same `priceProjection()` the product page rendered, and every add-on line must be
 * in it too, which `addonPriceProjection()` guarantees by applying the bouquet's FX rule; this
 * function refuses a set of lines that is not, rather than adding unlike amounts.
 *
 * No approximate-equivalents line belongs to the checkout (spec 004 §14 A21 clause 6(c) lists
 * where one appears, and checkout is not among them): nothing in `src/modules/checkout` imports
 * `priceEquivalents()`, which `tests/unit/checkout-currency.test.ts` asserts.
 */
import type { CurrencyCode } from "@/config/currencies";
import type { AddonPriceProjection, PriceProjection } from "@/modules/catalog";

/**
 * The checkout's currency: the bouquet projection's display currency, after checking that every
 * add-on projection is in it.
 *
 * @throws when an add-on is in another currency: one total is charged, so its lines are alike.
 */
export function checkoutCurrency(
  bouquet: PriceProjection,
  addons: readonly AddonPriceProjection[] = [],
): CurrencyCode {
  const currency = bouquet.displayPrice.currency;
  for (const addon of addons) {
    if (addon.displayPrice.currency !== currency) {
      throw new Error(
        `the add-on \`${addon.addonKey}\` is in ${addon.displayPrice.currency} beside a bouquet in ${currency}; a checkout has one currency (spec 010 AC-18)`,
      );
    }
  }
  return currency;
}
