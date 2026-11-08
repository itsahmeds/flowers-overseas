/**
 * The discount control's refusal messages (spec 047 §7; AC-10; TASK-447): each reason's full key and its arguments, formatted in the page's locale. Pure, so the unit suite
 * reads it without a request; the page calls `t(key, values)` with what it returns.
 */
import { DISCOUNT_DEFAULT_TIME_ZONE } from "@/config/discounts";
import type { LocaleCode } from "@/config/locales";
import {
  MoneySchema,
  formatCurrencyName,
  formatDate,
  formatMoney,
} from "@/modules/i18n";

/** A refusal as the control names it (spec 047 §5.2 reasons, with what each message needs). */
export interface DiscountRefusalArgs {
  readonly reason:
    | "unknown"
    | "not_started"
    | "ended"
    | "wrong_destination"
    | "wrong_product"
    | "wrong_currency"
    | "below_minimum"
    | "used_up"
    | "already_used_by_you"
    | "locked";
  readonly startsAt?: string | undefined;
  readonly countryIso?: string | undefined;
  readonly currency?: string | undefined;
  readonly minimumMinor?: number | undefined;
  readonly minutes?: number | undefined;
}

/** Each refusal reason's full message key (§7). */
export const DISCOUNT_REFUSAL_KEYS: Readonly<
  Record<DiscountRefusalArgs["reason"], string>
> = {
  unknown: "checkout.discount.error.unknown",
  not_started: "checkout.discount.error.notStarted",
  ended: "checkout.discount.error.ended",
  wrong_destination: "checkout.discount.error.wrongDestination",
  wrong_product: "checkout.discount.error.wrongProduct",
  wrong_currency: "checkout.discount.error.wrongCurrency",
  below_minimum: "checkout.discount.error.belowMinimum",
  used_up: "checkout.discount.error.usedUp",
  already_used_by_you: "checkout.discount.error.alreadyUsed",
  locked: "checkout.discount.error.locked",
};

/**
 * A refusal's message key and its arguments, each formatted in the page's locale (§7): `{date}`
 * through `formatDate` with weekday and month in the zone codes are entered in, `{country}` by the
 * caller's localised name, `{currency}` through `Intl.DisplayNames`, `{amount}` through
 * `formatMoney` from integer minor units, `{minutes}` as a number for the plural. An unknown and a
 * disabled code are both `unknown`, so their messages are the same bytes (AC-10).
 */
export function discountRefusalMessage(
  refusal: DiscountRefusalArgs,
  locale: LocaleCode,
  countryName: (iso: string) => string,
): { readonly key: string; readonly values: Record<string, string | number> } {
  const key = DISCOUNT_REFUSAL_KEYS[refusal.reason];
  switch (refusal.reason) {
    case "not_started":
      return {
        key,
        values: {
          date:
            refusal.startsAt === undefined
              ? ""
              : formatDate(
                  new Date(refusal.startsAt),
                  locale,
                  "weekdayDayMonth",
                  DISCOUNT_DEFAULT_TIME_ZONE,
                ),
        },
      };
    case "wrong_destination":
      return {
        key,
        values: {
          country:
            refusal.countryIso === undefined
              ? ""
              : countryName(refusal.countryIso),
        },
      };
    case "wrong_currency":
      return {
        key,
        values: {
          currency:
            refusal.currency === undefined
              ? ""
              : formatCurrencyName(refusal.currency, locale),
        },
      };
    case "below_minimum":
      return {
        key,
        values: {
          amount:
            refusal.currency === undefined || refusal.minimumMinor === undefined
              ? ""
              : formatMoney(
                  MoneySchema.parse({
                    amountMinor: refusal.minimumMinor,
                    currency: refusal.currency,
                  }),
                  locale,
                ),
        },
      };
    case "locked":
      return { key, values: { minutes: refusal.minutes ?? 0 } };
    default:
      return { key, values: {} };
  }
}
