/**
 * The landing's payout example (spec 011 §2 "The payout example", §8 "Price display", AC-4;
 * TASK-210).
 *
 * Two lines: what the buyer pays and what the florist receives. The buyer's amount is **resolved**
 * through the catalogue's public price API for the configured (product, `PL`, tier) and never
 * copied, so a price change in the dataset changes the page with no edit to
 * `src/config/florists.ts`; it is a consumer price, VAT and delivery included, the price a buyer
 * is charged for that bouquet. The florist's amount is the authored integer of §13 Q7. Both print
 * through `formatMoney`. No VAT line, no fee line and no "what we keep" line (§2).
 *
 * The configuration is parsed against the resolved price (`floristsConfigSchemaFor`): a payout that
 * is not a positive integer below the buyer's price, or in another currency, throws, and the page
 * fails to build rather than print a payout above the price.
 */
import {
  FLORISTS,
  type MinorMoney,
  floristsConfigSchemaFor,
} from "@/config/florists";
import { resolvePrice } from "@/modules/catalog";
import { MoneySchema, formatMoney } from "@/modules/i18n";

import { localeCode } from "../ui/inbox/format.ts";

export interface PayoutExampleView {
  readonly retail: MinorMoney;
  readonly payout: MinorMoney;
  /** `formatMoney(retail, locale)`: "PLN 229.00" in `en`, "229,00 zł" in `pl`. */
  readonly retailLabel: string;
  readonly payoutLabel: string;
}

/** The catalogue's price API, the one seam a test replaces. */
export type RetailResolver = (query: {
  readonly productId: string;
  readonly tierKey: string;
  readonly countryIso: "PL";
}) => Promise<MinorMoney>;

const catalogueRetail: RetailResolver = async (query) => {
  const price = await resolvePrice(query);
  return { amountMinor: price.amountMinor, currency: price.currency };
};

export async function payoutExampleView(
  locale: string,
  resolveRetail: RetailResolver = catalogueRetail,
): Promise<PayoutExampleView> {
  const example = FLORISTS.payoutExample;
  const retail = await resolveRetail({
    productId: example.productId,
    tierKey: example.tier,
    countryIso: example.countryIso2,
  });
  const config = floristsConfigSchemaFor(retail).parse(FLORISTS);
  const payout = {
    amountMinor: config.payoutExample.payoutMinor,
    currency: config.payoutExample.currency,
  };
  return {
    retail,
    payout,
    retailLabel: formatMoney(MoneySchema.parse(retail), localeCode(locale)),
    payoutLabel: formatMoney(MoneySchema.parse(payout), localeCode(locale)),
  };
}
