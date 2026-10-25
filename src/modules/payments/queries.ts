/**
 * The payment read helpers, keyed by purchase (spec 013 §14 A-founder-2026-10-22 item 2; spec 010
 * §14 A-founder-2026-10-22 item 13 (b) and §13 Q19; TASK-350).
 *
 * A payment belongs to the **purchase** (`payment.purchase_id`, `0026_payment_purchase`): a
 * payment for three orders has no single order, and `payment.order_id` no longer exists. Every
 * reader that goes from an order to its payment does so through `paymentForOrder` here, which
 * joins on `"order".purchase_id`; spec 018's invoice issuing (TASK-341, "an invoice only when
 * `payment.captured_at` is set") and spec 020a's refunds (TASK-359) read it.
 *
 * Which payment: a purchase has at most one **live** payment (status other than `cancelled` or
 * `failed`, the partial unique index `payment_one_live_per_purchase_idx`). That one is returned;
 * when there is none, the most recent ended one, so an admin reader still sees a cancelled or
 * failed attempt; `null` when the purchase has never had a payment.
 *
 * Read only: no function here takes an amount (AC-9), and none writes. Each runs in the caller's
 * transaction (`{ db }` or `{ executor }`), or in a `system` transaction of its own. Money comes
 * back as integer minor units beside its ISO currency, never a float.
 */
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";

import {
  withExecutor,
  type EngineConnection,
  type OrderExecutor,
} from "@/modules/orders";

/** `bigint` columns arrive as strings; a value outside the safe-integer range is refused. */
const Minor = z.union([z.number(), z.string()]).transform((value, ctx) => {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(number)) {
    ctx.addIssue({ code: "custom", message: "not a safe integer" });
    return z.NEVER;
  }
  return number;
});

const IsoDateTime = z.iso.datetime();

/** `payment.status` (spec 002 §14 A7.3). */
export const PAYMENT_RECORD_STATUSES = [
  "pending",
  "requires_action",
  "processing",
  "authorised",
  "captured",
  "failed",
  "cancelled",
] as const;

/** What a reader gets: no card data beyond brand and last four, no provider payload. */
export const PaymentRecordSchema = z
  .object({
    paymentId: z.uuid(),
    purchaseId: z.uuid(),
    provider: z.enum(["stripe", "mollie"]),
    providerRef: z.string().min(1).nullable(),
    status: z.enum(PAYMENT_RECORD_STATUSES),
    livemode: z.boolean(),
    amountMinor: z.number().int().positive(),
    amountCapturedMinor: z.number().int().nonnegative(),
    amountRefundedMinor: z.number().int().nonnegative(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    capturedAt: IsoDateTime.nullable(),
    attempts: z.number().int().nonnegative(),
  })
  .strict();

export type PaymentRecord = z.infer<typeof PaymentRecordSchema>;

const PaymentRow = z.object({
  id: z.uuid(),
  purchase_id: z.uuid(),
  provider: z.enum(["stripe", "mollie"]),
  provider_ref: z.string().nullable(),
  status: z.enum(PAYMENT_RECORD_STATUSES),
  livemode: z.boolean(),
  amount_minor: Minor,
  amount_captured_minor: Minor,
  amount_refunded_minor: Minor,
  currency_code: z.string(),
  captured_at: IsoDateTime.nullable(),
  attempts: Minor,
});

/** `captured_at` as ISO 8601 UTC, independent of the session's time zone. */
const COLUMNS = sql`p.id, p.purchase_id, p.provider, p.provider_ref, p.status, p.livemode,
  p.amount_minor, p.amount_captured_minor, p.amount_refunded_minor, p.currency_code,
  to_char(p.captured_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS captured_at,
  p.attempts`;

/** The live payment first, then the newest; ties broken by id so the answer is stable. */
const PREFERENCE = sql`(p.status NOT IN ('cancelled', 'failed')) DESC, p.created_at DESC, p.id`;

function toRecord(raw: unknown): PaymentRecord {
  const row = PaymentRow.parse(raw);
  return PaymentRecordSchema.parse({
    paymentId: row.id,
    purchaseId: row.purchase_id,
    provider: row.provider,
    providerRef: row.provider_ref,
    status: row.status,
    livemode: row.livemode,
    amountMinor: row.amount_minor,
    amountCapturedMinor: row.amount_captured_minor,
    amountRefundedMinor: row.amount_refunded_minor,
    currency: row.currency_code,
    capturedAt: row.captured_at,
    attempts: row.attempts,
  });
}

async function first(
  executor: OrderExecutor,
  query: SQL,
): Promise<PaymentRecord | null> {
  const [row] = await executor.execute(query);
  return row === undefined ? null : toRecord(row);
}

/** The purchase's payment (see the file header for which one), or `null`. */
export async function paymentForPurchase(
  purchaseId: string,
  connection?: EngineConnection,
): Promise<PaymentRecord | null> {
  const id = z.uuid().parse(purchaseId);
  return withExecutor(connection, "payments.read", (executor) =>
    first(
      executor,
      sql`
        SELECT ${COLUMNS} FROM payment p
        WHERE p.purchase_id = ${id}
        ORDER BY ${PREFERENCE} LIMIT 1`,
    ),
  );
}

/**
 * The payment of the purchase this order was bought in, or `null`. Every order of one purchase
 * answers with the same payment.
 */
export async function paymentForOrder(
  orderId: string,
  connection?: EngineConnection,
): Promise<PaymentRecord | null> {
  const id = z.uuid().parse(orderId);
  return withExecutor(connection, "payments.read", (executor) =>
    first(
      executor,
      sql`
        SELECT ${COLUMNS} FROM "order" o
        JOIN payment p ON p.purchase_id = o.purchase_id
        WHERE o.id = ${id}
        ORDER BY ${PREFERENCE} LIMIT 1`,
    ),
  );
}
