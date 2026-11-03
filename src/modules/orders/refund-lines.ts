/**
 * The buyer's refund lines, their shape and their one formatter (spec 018 §5.2
 * "`buyerRefundLines`"; A6.4, advisor F4; AC-10, AC-42; TASK-339).
 *
 * A refund line is "Refunded {amount} on {date}": one per **succeeded** refund of the order,
 * oldest first, dated by the row's `refund.succeeded_at`, never an event's time. Its one source is
 * spec 013's `succeededRefunds` (TASK-261); `buyerRefundLines(orderId)`, which calls it, lives in
 * `./buyer-refund-lines.ts`, outside this module's barrel, because the barrel must not import the
 * `payments` module (pages that import `orders` would carry payments' checkout copy). What the
 * barrel carries is pure:
 *
 *  - `BuyerRefundLineSchema` and `toBuyerRefundLines(refunds)`, the mapping from spec 013's rows;
 *  - `RefundLinesSource`, the seam `getTrackingView` reads the lines through, so the caller hands
 *    in `buyerRefundLines` (the tracking routes) and the view never imports `payments`;
 *  - `refundLineValues(line, locale, timeZone)`, the one formatter of a line's two values, shared
 *    by the tracking page and spec 016's buyer emails (TASK-333): the amount in the refund's own
 *    currency through `formatMoney`, the date in the destination's zone through `formatDate`. The
 *    words around them are each surface's catalogue.
 *
 * Nothing here logs an amount, an order id or a date.
 */
import { z } from "zod";

import { type CurrencyCode, isCurrencyCode } from "@/config/currencies";
import type { LocaleCode } from "@/config/locales";
import { formatDate, formatMoney } from "@/modules/i18n";

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
    /** Integer minor units, as spec 013's `Money` carries them (a `bigint` past 2^53). */
    amountMinor: z.union([z.number().int().positive(), z.bigint().positive()]),
    currencyCode: CurrencyCodeSchema,
    succeededAt: z.date(),
  })
  .strict();
export type BuyerRefundLine = z.infer<typeof BuyerRefundLineSchema>;

/** A succeeded refund as spec 013's `succeededRefunds` returns it. */
export interface SucceededRefundRow {
  readonly amount: {
    readonly amountMinor: number | bigint;
    readonly currency: string;
  };
  readonly succeededAt: Date;
}

/** Where `getTrackingView` reads an order's refund lines: `buyerRefundLines` in production. */
export type RefundLinesSource = (
  orderId: string,
  options: EngineConnection,
) => Promise<BuyerRefundLine[]>;

/** Spec 013's succeeded refunds, in their order (oldest first), as buyer lines. */
export function toBuyerRefundLines(
  refunds: readonly SucceededRefundRow[],
): BuyerRefundLine[] {
  return refunds.map((refund) =>
    BuyerRefundLineSchema.parse({
      amountMinor: refund.amount.amountMinor,
      currencyCode: refund.amount.currency,
      succeededAt: refund.succeededAt,
    }),
  );
}

/** The `{amount}` and `{date}` of a refund line, in `locale` and `timeZone`. */
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
