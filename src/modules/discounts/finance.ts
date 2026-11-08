/**
 * The founder's read models of codes: `codeStats`, `codeStatsMany` and `discountFinanceRows`
 * (spec 047 §2 "Analytics, and what the founder sees", §5.2 "Read models"; TASK-445).
 *
 *  - `codeStats(codeId)`: live uses (counted purchases, `lockAndCount`'s rule without the lock)
 *    and the discount given per currency, the sum of `order_discount.amount_minor` over live
 *    orders whose own status still counts. The admin list (TASK-446) reads `codeStatsMany`.
 *  - `discountFinanceRows(filter)`: what spec 030b's finance view renders, one row per discounted
 *    order: price before discount, discount, amount charged and VAT in the order currency, and the
 *    same in the base currency through the order's FX snapshot, with florist pay and the margin
 *    after discount. Florist pay is `order_line.partner_payout_minor` once fixed at acceptance,
 *    else null ("not yet assigned"): no estimate is invented. A payout in a third currency (neither
 *    the order's nor the base) has no snapshot rate here, so it is null too. Processor fees are
 *    spec 030b's to add.
 *
 * Read only, in the caller's transaction (an admin context with `discounts.read`). No code string
 * and no email key leaves this file.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { type Money, toBaseMinor } from "./allocate";
import { type DiscountConnection, rowsOf } from "./db";
import { countUses, NON_COUNTING_STATUSES } from "./redeem";
import {
  DISCOUNT_MODES,
  type DiscountFinanceFilter,
  DiscountFinanceFilterSchema,
  type DiscountFinanceRow,
  DiscountFinanceRowSchema,
} from "./schemas";

/** One code's live uses and the discount it has given, per currency. */
export interface CodeStats {
  readonly liveUses: number;
  readonly discountByCurrency: readonly Money[];
}

function nonCountingList() {
  return sql.join(
    NON_COUNTING_STATUSES.map((status) => sql`${status}`),
    sql`, `,
  );
}

const SumRowSchema = z.object({
  discount_code_id: z.string(),
  currency_code: z.string(),
  amount_minor: z.coerce.number().int().nonnegative(),
});

/** `codeStats` for several codes at once, keyed by code id (every id present). */
export async function codeStatsMany(
  codeIds: readonly string[],
  connection: DiscountConnection,
): Promise<ReadonlyMap<string, CodeStats>> {
  const out = new Map<string, CodeStats>();
  if (codeIds.length === 0) return out;
  const ids = sql.join(
    codeIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  const sums = (
    await rowsOf(
      connection,
      sql`SELECT od.discount_code_id, od.currency_code, sum(od.amount_minor) AS amount_minor
            FROM public.order_discount od
            JOIN public."order" o ON o.id = od.order_id
           WHERE od.discount_code_id IN (${ids}) AND od.mode = 'live'
             AND o.status NOT IN (${nonCountingList()})
           GROUP BY od.discount_code_id, od.currency_code
           ORDER BY od.currency_code`,
    )
  ).map((row) => SumRowSchema.parse(row));
  for (const id of codeIds) {
    const uses = await countUses(id, "live", null, connection);
    out.set(id, {
      liveUses: uses.uses,
      discountByCurrency: sums
        .filter((row) => row.discount_code_id === id)
        .map((row) => ({
          amountMinor: row.amount_minor,
          currency: row.currency_code,
        })),
    });
  }
  return out;
}

/** One code's live uses and discount given per currency. */
export async function codeStats(
  codeId: string,
  connection: DiscountConnection,
): Promise<CodeStats> {
  const stats = (await codeStatsMany([codeId], connection)).get(codeId);
  return stats ?? { liveUses: 0, discountByCurrency: [] };
}

const FinanceSqlRowSchema = z.object({
  order_id: z.string(),
  reference: z.string(),
  placed_at: z.coerce.date(),
  mode: z.enum(DISCOUNT_MODES),
  discount_code_id: z.string(),
  campaign_label: z.string(),
  currency_code: z.string(),
  buyer_total_minor: z.coerce.number().int(),
  amount_minor: z.coerce.number().int(),
  vat_breakdown: z.array(
    z.object({ vatMinor: z.coerce.number().int() }).loose(),
  ),
  base_currency_code: z.string(),
  base_total_minor: z.coerce.number().int(),
  base_amount_minor: z.coerce.number().int(),
  fx_rate_ppm: z.coerce.number().int().nullable(),
  payout_minor: z.coerce.number().int().nullable(),
  payout_currency_code: z.string().nullable(),
  payout_currencies: z.coerce.number().int(),
});

/** Florist pay in the base currency, or null when unassigned or not convertible here. */
function payoutInBase(row: z.infer<typeof FinanceSqlRowSchema>): number | null {
  if (row.payout_minor === null || row.payout_currency_code === null)
    return null;
  if (row.payout_currencies !== 1) return null;
  if (row.payout_currency_code === row.base_currency_code)
    return row.payout_minor;
  if (row.payout_currency_code === row.currency_code) {
    return toBaseMinor(
      row.payout_minor,
      row.currency_code === row.base_currency_code ? null : row.fx_rate_ppm,
    );
  }
  return null;
}

/** Spec 030b's per-order discount rows, oldest first. */
export async function discountFinanceRows(
  filter: DiscountFinanceFilter,
  connection: DiscountConnection,
): Promise<DiscountFinanceRow[]> {
  const f = DiscountFinanceFilterSchema.parse(filter);
  const rows = await rowsOf(
    connection,
    sql`SELECT o.id AS order_id, public.order_reference(o.id) AS reference,
               o.created_at AS placed_at, od.mode, od.discount_code_id, c.campaign_label,
               od.currency_code, o.buyer_total_minor, od.amount_minor, o.vat_breakdown,
               o.base_currency_code, o.base_total_minor, od.base_amount_minor, o.fx_rate_ppm,
               pay.payout_minor, pay.payout_currency_code, pay.payout_currencies
          FROM public.order_discount od
          JOIN public."order" o ON o.id = od.order_id
          JOIN public.discount_code c ON c.id = od.discount_code_id
          JOIN public.country k ON k.id = o.destination_country_id
          CROSS JOIN LATERAL (
            SELECT sum(l.partner_payout_minor * l.qty) AS payout_minor,
                   min(l.payout_currency_code) AS payout_currency_code,
                   count(DISTINCT l.payout_currency_code) AS payout_currencies
              FROM public.order_line l
             WHERE l.order_id = o.id AND l.partner_payout_minor IS NOT NULL
          ) pay
         WHERE o.created_at >= ${f.from.toISOString()}::timestamptz
           AND o.created_at < ${f.to.toISOString()}::timestamptz
           AND (${f.codeId ?? null}::uuid IS NULL OR od.discount_code_id = ${f.codeId ?? null}::uuid)
           AND (${f.countryIso ?? null}::text IS NULL OR k.iso2 = ${f.countryIso ?? null}::text)
           AND (${f.mode ?? null}::text IS NULL OR od.mode = ${f.mode ?? null}::text)
         ORDER BY o.created_at, o.id`,
  );
  return rows.map((raw) => {
    const row = FinanceSqlRowSchema.parse(raw);
    const vatMinor = row.vat_breakdown.reduce(
      (sum, split) => sum + split.vatMinor,
      0,
    );
    const sameCurrency = row.currency_code === row.base_currency_code;
    const vatBase = toBaseMinor(
      vatMinor,
      sameCurrency ? null : row.fx_rate_ppm,
    );
    const payout = payoutInBase(row);
    return DiscountFinanceRowSchema.parse({
      orderId: row.order_id,
      reference: row.reference,
      placedAt: row.placed_at,
      mode: row.mode,
      codeId: row.discount_code_id,
      campaignLabel: row.campaign_label,
      currency: row.currency_code,
      grossBeforeMinor: row.buyer_total_minor + row.amount_minor,
      discountMinor: row.amount_minor,
      chargedMinor: row.buyer_total_minor,
      vatMinor,
      payoutMinorInBase: payout,
      baseCurrency: row.base_currency_code,
      grossBeforeBaseMinor: row.base_total_minor + row.base_amount_minor,
      discountBaseMinor: row.base_amount_minor,
      chargedBaseMinor: row.base_total_minor,
      marginAfterBaseMinor:
        payout === null ? null : row.base_total_minor - vatBase - payout,
    });
  });
}
