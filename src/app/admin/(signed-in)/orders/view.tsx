/**
 * @purpose The order queue's shared view pieces: chips, money, dates
 * @spec 012
 *
 * Shared by `/admin/orders` and `/admin/orders/[id]` (TASK-222): the demo marker, read from
 * `order.mode` and never from `source` (spec 012 §2.6, AC-19); the status chip's tone; an order
 * amount through the one money formatter; a delivery date, which is already the destination's
 * calendar day and is printed as that day.
 */
import type { ReactElement } from "react";

import { adminT, type OrderStatusTone } from "@/modules/admin";
import { isCurrencyCode } from "@/config/currencies";
import { formatDate, formatMoney } from "@/modules/i18n";
import { AdminChip, type AdminChipTone } from "@/modules/ui/admin/AdminData";

/** The sheet's chip colour for each status tone. */
export const CHIP_TONE: Readonly<Record<OrderStatusTone, AdminChipTone>> = {
  moving: "sky",
  done: "ok",
  attention: "bad",
  ended: "plain",
};

/** The demo marker: exactly for `demo` and `test` orders; a live order carries none. */
export function ModeChip({
  mode,
}: {
  readonly mode: "demo" | "test" | "live";
}): ReactElement | null {
  if (mode === "live") return null;
  return (
    <AdminChip tone="demo">{adminT(`admin.orders.mode.${mode}`)}</AdminChip>
  );
}

/** Integer minor units in the order's currency, rendered by `formatMoney`. */
export function formatOrderMoney(
  amountMinor: number,
  currency: string,
): string {
  if (!isCurrencyCode(currency)) {
    throw new Error(
      `an order currency the application does not configure: ${currency}`,
    );
  }
  return formatMoney({ amountMinor, currency }, "en");
}

/**
 * A delivery date (`YYYY-MM-DD`, the destination's own calendar day) as "Thu 8 Oct". Noon UTC
 * of that day is the same day in every European zone, so the day printed is the day stored.
 */
export function deliveryDay(date: string): string {
  return formatDate(new Date(`${date}T12:00:00Z`), "en", "deliveryDate", "UTC");
}
