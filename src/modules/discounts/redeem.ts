/**
 * `loadCode` and `lockAndCount` (spec 047 §5.2 "Counting uses", §14 A-orchestrator-2026-10-25
 * item 2; AC-15, AC-16; TASK-445).
 *
 * **A use is a purchase.** `lockAndCount` takes the code row `FOR UPDATE`, so concurrent placements
 * of the same code queue on it until the first commits, then counts distinct purchases of the same
 * mode that hold an `order_discount` row for the code and at least one order whose status is not
 * `abandoned`, `payment_failed`, `cancelled` or `cancelled_refunded` (spec 002 §14 A6's names), in
 * total and for this email key. No counter column is kept, so nothing needs releasing: an order
 * that is never paid, or is cancelled before preparation, stops counting by its status alone; a
 * refund of a delivered order does not change its status, so it still counts. `demo` and `test`
 * orders never count against `live` caps.
 *
 * Both run in the caller's transaction; `lockAndCount`'s lock lasts until that transaction ends.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { type DiscountConnection, rowsOf } from "./db";
import type {
  DiscountCounts,
  EvaluableCode,
  EvaluableCurrency,
} from "./evaluate";
import { normaliseCode } from "./normalise";
import {
  DISCOUNT_KINDS,
  DISCOUNT_STORED_STATUSES,
  type DiscountMode,
} from "./schemas";

/** The order statuses that free a use (spec 047 §5.2; spec 002 §14 A6). */
export const NON_COUNTING_STATUSES = [
  "abandoned",
  "payment_failed",
  "cancelled",
  "cancelled_refunded",
] as const;

const CodeRowSchema = z.object({
  id: z.string(),
  code_normalised: z.string(),
  kind: z.enum(DISCOUNT_KINDS),
  percent_bp: z.coerce.number().int().nullable(),
  starts_at: z.coerce.date(),
  ends_at: z.coerce.date().nullable(),
  max_redemptions: z.coerce.number().int().nullable(),
  max_per_email: z.coerce.number().int().nullable(),
  status: z.enum(DISCOUNT_STORED_STATUSES),
  campaign_label: z.string(),
});

const CurrencyRowSchema = z.object({
  currency_code: z.string(),
  amount_off_minor: z.coerce.number().int().nullable(),
  min_order_minor: z.coerce.number().int(),
});

/** A code with its scope, as `evaluateCode` takes it, plus its internal label for logs. */
export interface LoadedCode {
  readonly code: EvaluableCode;
  readonly campaignLabel: string;
  readonly currencies: readonly EvaluableCurrency[];
  readonly countryIds: readonly string[];
  readonly productIds: readonly string[];
}

/** One code and its scope rows, by id or by normalised text; null when there is none. */
export async function loadCode(
  key: { readonly id: string } | { readonly codeNormalised: string },
  connection: DiscountConnection,
): Promise<LoadedCode | null> {
  const where =
    "id" in key
      ? sql`id = ${key.id}::uuid`
      : sql`code_normalised = ${key.codeNormalised}`;
  const rows = await rowsOf(
    connection,
    sql`SELECT id, code_normalised, kind, percent_bp, starts_at, ends_at, max_redemptions,
               max_per_email, status, campaign_label
          FROM public.discount_code WHERE ${where}`,
  );
  if (rows[0] === undefined) return null;
  const row = CodeRowSchema.parse(rows[0]);
  const currencies = (
    await rowsOf(
      connection,
      sql`SELECT currency_code, amount_off_minor, min_order_minor
            FROM public.discount_code_currency WHERE discount_code_id = ${row.id}::uuid
           ORDER BY currency_code`,
    )
  ).map((entry) => CurrencyRowSchema.parse(entry));
  const countries = await rowsOf(
    connection,
    sql`SELECT country_id FROM public.discount_code_country
         WHERE discount_code_id = ${row.id}::uuid ORDER BY country_id`,
  );
  const products = await rowsOf(
    connection,
    sql`SELECT product_id FROM public.discount_code_product
         WHERE discount_code_id = ${row.id}::uuid ORDER BY product_id`,
  );
  return {
    code: {
      id: row.id,
      codeNormalised: row.code_normalised,
      kind: row.kind,
      percentBp: row.percent_bp,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      maxRedemptions: row.max_redemptions,
      maxPerEmail: row.max_per_email,
      status: row.status,
    },
    campaignLabel: row.campaign_label,
    currencies: currencies.map((entry) => ({
      currency: entry.currency_code,
      amountOffMinor: entry.amount_off_minor,
      minOrderMinor: entry.min_order_minor,
    })),
    countryIds: countries.map((entry) => String(entry["country_id"])),
    productIds: products.map((entry) => String(entry["product_id"])),
  };
}

/**
 * What a typed value names: normalises first, and a value that cannot be a code (a dotted capital
 * I, an emoji, too short) returns null **without a query** (AC-11), as `unknown`.
 */
export async function lookupTypedCode(
  raw: string,
  connection: DiscountConnection,
): Promise<LoadedCode | null> {
  const codeNormalised = normaliseCode(raw);
  if (codeNormalised === null) return null;
  return loadCode({ codeNormalised }, connection);
}

const CountsRowSchema = z.object({
  total: z.coerce.number().int().nonnegative(),
  for_email: z.coerce.number().int().nonnegative(),
});

/** The SQL list of the statuses that free a use. */
function nonCountingList() {
  return sql.join(
    NON_COUNTING_STATUSES.map((status) => sql`${status}`),
    sql`, `,
  );
}

/**
 * Counted purchases of the code in `mode`, without a lock: the advisory count step 4 shows, and
 * the admin list's uses. The binding count is `lockAndCount`.
 */
export async function countUses(
  codeId: string,
  mode: DiscountMode,
  emailKeySha256: string | null,
  connection: DiscountConnection,
): Promise<DiscountCounts> {
  const rows = await rowsOf(
    connection,
    sql`SELECT count(*) AS total, count(*) FILTER (WHERE p.mine) AS for_email
          FROM (
            SELECT o.purchase_id,
                   bool_or(od.email_key_sha256 = ${emailKeySha256 ?? ""}) AS mine
              FROM public.order_discount od
              JOIN public."order" o ON o.id = od.order_id
             WHERE od.discount_code_id = ${codeId}::uuid AND od.mode = ${mode}
             GROUP BY o.purchase_id
          ) p
         WHERE EXISTS (
           SELECT 1 FROM public."order" x
            WHERE x.purchase_id = p.purchase_id AND x.status NOT IN (${nonCountingList()})
         )`,
  );
  const row = CountsRowSchema.parse(rows[0] ?? { total: 0, for_email: 0 });
  return {
    uses: row.total,
    usesForEmail: emailKeySha256 === null ? 0 : row.for_email,
  };
}

/**
 * Locks the code row for the rest of the caller's transaction and counts its uses. Null when the
 * code no longer exists.
 */
export async function lockAndCount(
  codeId: string,
  mode: DiscountMode,
  emailKeySha256: string | null,
  connection: DiscountConnection,
): Promise<DiscountCounts | null> {
  const locked = await rowsOf(
    connection,
    sql`SELECT id FROM public.discount_code WHERE id = ${codeId}::uuid FOR UPDATE`,
  );
  if (locked.length === 0) return null;
  return countUses(codeId, mode, emailKeySha256, connection);
}
