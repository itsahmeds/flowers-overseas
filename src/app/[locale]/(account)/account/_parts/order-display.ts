/**
 * What the account's list and detail share (spec 018 §5.3; `account-orders-*` "Build"; TASK-344):
 * the headline key of a buyer step (the tracking page's own words), the status chip's wash (the
 * word carries the meaning, never the colour alone), and the formatted money and dates.
 */
import type { CurrencyCode } from "@/config/currencies";
import type { LocaleCode } from "@/config/locales";
import { formatDate, formatMoney } from "@/modules/i18n";
import type { BuyerStep } from "@/modules/orders";

/** The `tracking` catalogue key of each buyer step (as `TrackingPageView`'s `STEP_KEY`). */
export const HEADLINE_KEY = {
  placed: "headline.placed",
  confirmed: "headline.confirmed",
  being_made: "headline.beingMade",
  on_its_way: "headline.onItsWay",
  delivered: "headline.delivered",
  closed: "headline.closed",
  cancelled: "headline.cancelled",
} as const satisfies Readonly<Record<BuyerStep, `headline.${string}`>>;

/** Cornflower wash while open, leaf wash when delivered, paper when closed or cancelled. */
export function chipClass(step: BuyerStep): string {
  const wash =
    step === "delivered"
      ? "bg-leaf-wash"
      : step === "closed" || step === "cancelled"
        ? "bg-paper-3"
        : "bg-sage-wash";
  return `${wash} text-ink inline-flex min-h-[28px] items-center rounded-full px-[12px] text-sm font-bold`;
}

/** The order's own amount in its own currency (C.16: nothing summed or recomputed). */
export function money(
  amount: { readonly amountMinor: number; readonly currencyCode: CurrencyCode },
  locale: LocaleCode,
): string {
  return formatMoney(
    { amountMinor: amount.amountMinor, currency: amount.currencyCode },
    locale,
  );
}

/** A `YYYY-MM-DD` delivery date, read the same day everywhere. */
export function deliveryDay(isoDate: string, locale: LocaleCode): string {
  return formatDate(
    new Date(`${isoDate}T12:00:00Z`),
    locale,
    "weekdayDayMonth",
    "UTC",
  );
}

/** The refund chip of the tracking boards (`.s18-refund`). */
export const REFUND_CHIP = [
  "bg-leaf-wash text-ink inline-flex min-h-[28px] items-center gap-[8px] rounded-full px-[12px] text-sm font-bold tabular-nums",
  "before:bg-stem before:h-[8px] before:w-[8px] before:flex-none before:rounded-full before:content-['']",
].join(" ");
