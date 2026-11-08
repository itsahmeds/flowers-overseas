/**
 * `linePaidAmounts(orderId)` (spec 047 §2 "Refunds", §5.2 "Read models"; AC-20; TASK-445).
 *
 * Per line of an order: what the buyer actually paid for it, `unit_retail_minor * qty -
 * discount_minor`, in the order's currency, with the line's VAT rate. Spec 020's refund page
 * suggests a partial refund from it (a missing add-on is that add-on's paid amount, never its
 * list price) and spec 018's invoice prints it. An order with no code has every `discount_minor`
 * at 0, so its paid amounts are its prices.
 *
 * Read only, in the caller's transaction or a `system` one of its own. Nothing here reads a code.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { type EngineConnection, withExecutor } from "./service/executor";

/** One line's paid amount. */
export interface LinePaidAmount {
  readonly lineId: string;
  readonly kind: string;
  readonly paidMinor: number;
  readonly currency: string;
  readonly vatRateBp: number;
}

const RowSchema = z.object({
  id: z.string(),
  kind: z.string(),
  paid_minor: z.coerce.number().int().nonnegative(),
  currency_code: z.string(),
  vat_rate_bp: z.coerce.number().int(),
});

/** Every line of `orderId` (bouquet, add-ons, surcharge), with its paid amount. */
export async function linePaidAmounts(
  orderId: string,
  connection?: EngineConnection,
): Promise<LinePaidAmount[]> {
  return withExecutor(
    connection,
    "orders.line-paid-amounts",
    async (executor) => {
      const rows = await executor.execute(
        sql`SELECT id, kind, unit_retail_minor * qty - discount_minor AS paid_minor,
                 currency_code, vat_rate_bp
            FROM public.order_line WHERE order_id = ${orderId}::uuid
           ORDER BY created_at,
                    CASE kind WHEN 'product' THEN 0 WHEN 'addon' THEN 1 ELSE 2 END, id`,
      );
      return rows.map((raw) => {
        const row = RowSchema.parse(raw);
        return {
          lineId: row.id,
          kind: row.kind,
          paidMinor: row.paid_minor,
          currency: row.currency_code,
          vatRateBp: row.vat_rate_bp,
        };
      });
    },
  );
}
