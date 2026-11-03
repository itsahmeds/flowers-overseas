/**
 * The buyer's refund lines (spec 018 §5.2 "`buyerRefundLines`", §7 `tracking.refundLine`; A6.4,
 * advisor F4; AC-10, AC-42; TASK-339).
 *
 * `buyerRefundLines(orderId)` is one "Refunded {amount} on {date}" item per **succeeded** refund
 * of the order, oldest first, read from spec 013's `succeededRefunds` (TASK-261), its one source:
 * `requested`, `pending`, `failed` and `cancelled` rows never appear, and the date is the row's
 * `refund.succeeded_at`, never an event's time. A refund that settles after the order left the
 * set where it writes an order event (spec 013 AC-29) still shows its line, because nothing here
 * reads an event.
 *
 * `refundLineValues(line, locale, timeZone)` is the one formatter of a line's two values, shared
 * by the tracking page and spec 016's buyer emails (TASK-333): the amount in the refund's own
 * currency through `formatMoney`, the date in the destination's zone through `formatDate`. The
 * words around them are each surface's catalogue.
 *
 * Nothing here logs an amount, an order id or a date.
 */
import { z } from "zod";

import { type CurrencyCode, isCurrencyCode } from "@/config/currencies";
import type { LocaleCode } from "@/config/locales";
import { formatDate, formatMoney } from "@/modules/i18n";
import { succeededRefunds } from "@/modules/payments";

import type { EngineConnection } from "./service/executor";

/** One of our currency codes (`src/config/currencies.ts`). */
export const CurrencyCodeSchema = z
  .string()
  .refine((code): code is CurrencyCode => isCurrencyCode(code), {
    message: "not a currency of ours",
  });

/** One succeeded refund as the buyer sees it (spec 018 §5.2). */
export const BuyerRefundLineSchema = z
  .object({
    amountMinor: z.number().int().positive(),
    currencyCode: CurrencyCodeSchema,
    succeededAt: z.date(),
  })
  .strict();
export type BuyerRefundLine = z.infer<typeof BuyerRefundLineSchema>;

/** The order's succeeded refunds, oldest first, as buyer lines. */
export async function buyerRefundLines(
  orderId: string,
  options: EngineConnection = {},
): Promise<BuyerRefundLine[]> {
  const refunds = await succeededRefunds(z.uuid().parse(orderId), options);
  return refunds.map((refund) =>
    BuyerRefundLineSchema.parse({
      amountMinor: refund.amount.amountMinor,
      currencyCode: refund.amount.currency,
      succeededAt: refund.succeededAt,
    }),
  );
}

/** The `{amount}` and `{date}` of "Refunded {amount} on {date}", in `locale` and `timeZone`. */
export function refundLineValues(
  line: Pick<BuyerRefundLine, "amountMinor" | "currencyCode" | "succeededAt">,
  locale: LocaleCode,
  timeZone: string,
): { readonly amount: string; readonly date: string } {
  return {
    amount: formatMoney(
      { amountMinor: line.amountMinor, currency: line.currencyCode },
      locale,
    ),
    date: formatDate(line.succeededAt, locale, "dayMonth", timeZone),
  };
}
