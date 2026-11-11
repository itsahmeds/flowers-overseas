/**
 * The price change: its schema and the confirmation's numbers (spec 012b §2.6, §5.2, AC-20;
 * TASK-298). Pure; the commands live in `prices.ts`.
 *
 * The amount typed is the all-in price for the destination, VAT and delivery included, so
 * `PriceChangeSchema` has no net-of-VAT key and no buyer-country key (`plan/07` §3, §4): the
 * country is the destination's, and nothing a buyer is or where they are can change a price.
 */
import { z } from "zod";

import { type CurrencyCode } from "@/config/currencies";
import { type LocaleCode, launchLocales } from "@/config/locales";
import { formatMoney } from "@/modules/i18n";

import { divideMinorHalfUp } from "../pricing/money";

const TIER_KEY = /^[a-z0-9_]{1,40}$/u;
const REASON = z.string().trim().min(3).max(500);

/** A change (or the first price) of one (product, country, size). Retail only, no surcharge. */
export const PriceChangeSchema = z
  .object({
    productId: z.uuid(),
    countryIso2: z.string().regex(/^[A-Z]{2}$/u),
    tierKey: z.string().regex(TIER_KEY),
    amountText: z.string().max(32),
    /** The soft-rule and margin override reason, stored on the audit row. */
    overrideReason: REASON.optional(),
  })
  .strict();
export type PriceChange = z.infer<typeof PriceChangeSchema>;

/** `replaceDraftPrice`: the same keys, for a product never made active. */
export const DraftPriceReplaceSchema = PriceChangeSchema;
export type DraftPriceReplace = PriceChange;

/** `removeFromCountry`: close every open price of the product in the country, no successor. */
export const ProductDelistSchema = z
  .object({
    productId: z.uuid(),
    countryIso2: z.string().regex(/^[A-Z]{2}$/u),
  })
  .strict();

/** Spec 012b §2.6: a change beyond this many basis points of the old price warns. */
export const PRICE_CHANGE_WARN_BP = 3_000;

export interface PricePreviewInput {
  readonly currency: CurrencyCode;
  readonly oldMinor: number | null;
  readonly newMinor: number;
  /** `lowestPriceInLast30Days` before the change, or null when there is no history. */
  readonly lowestMinor: number | null;
  readonly locales?: readonly LocaleCode[];
}

export interface PricePreview {
  readonly rows: readonly {
    readonly locale: LocaleCode;
    readonly old: string | null;
    readonly new: string;
  }[];
  /** The signed change over the old price, in basis points, half away from zero. */
  readonly changeBp: number | null;
  readonly warn: boolean;
  readonly lowest: string | null;
  /** The 30-day lowest after the change: the lower of the old lowest and the new price. */
  readonly lowestAfterMinor: number;
}

export function pricePreview(input: PricePreviewInput): PricePreview {
  const locales = input.locales ?? launchLocales;
  const money = (
    amountMinor: number,
  ): { amountMinor: number; currency: CurrencyCode } => ({
    amountMinor,
    currency: input.currency,
  });
  const changeBp =
    input.oldMinor === null || input.oldMinor <= 0
      ? null
      : divideMinorHalfUp(
          (input.newMinor - input.oldMinor) * 10_000,
          input.oldMinor,
        );
  const beyond =
    input.oldMinor !== null &&
    input.oldMinor > 0 &&
    Math.abs(input.newMinor - input.oldMinor) * 10_000 >
      PRICE_CHANGE_WARN_BP * input.oldMinor;
  return {
    rows: locales.map((locale) => ({
      locale,
      old:
        input.oldMinor === null
          ? null
          : formatMoney(money(input.oldMinor), locale),
      new: formatMoney(money(input.newMinor), locale),
    })),
    changeBp,
    warn: beyond,
    lowest:
      input.lowestMinor === null
        ? null
        : formatMoney(money(input.lowestMinor), "en"),
    lowestAfterMinor:
      input.lowestMinor === null
        ? input.newMinor
        : Math.min(input.lowestMinor, input.newMinor),
  };
}
