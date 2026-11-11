/**
 * `prePayCheck` (spec 021 §5.2 "Pay-step pre-check", AC-3, AC-5, AC-6 refusal half; TASK-493).
 * Spec 013's `confirm` calls it before `startPayment` creates any intent; on a refusal the pay
 * step calls spec 013's `endPaymentAttempts` (the payments module owns that close, so this module
 * never imports payments) and shows the verdict's message. In order:
 *
 *  1. an active `risk_pause` (`starts_at <= now < ends_at`) or the `risk.pay_pause` flag on →
 *     `paused` (the island shows `payments.error.unavailable`, which is then true);
 *  2. the buyer email's hash on `risk_blocklist` (kind `email`, not expired) → `blocked_email`,
 *     and `last_matched_at` is set (`payments.error.generic`);
 *  3. the buyer email's hash on `FAILED_ORDERS_THRESHOLD` or more other orders that ended
 *     `payment_failed` or `abandoned` within `FAILED_ORDERS_WINDOW_MS` → `failed_orders`
 *     (`payments.error.generic`).
 *
 * A payment is one per purchase (spec 010 §13 Q19), so the check reads the purchase: its orders
 * share one buyer email. Each order of a checked purchase gets its `risk_identity` email row, so
 * step 3 can count it later; nothing raw is stored. When `RISK_HASH_KEY` is not configured on a
 * deployed environment, steps 2 and 3 are skipped and logged (`risk.hash_key_missing`). A refusal
 * writes the one log line `risk.prepay_refused` with `order_id` and `reason` only.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { logger } from "@/lib/logger";
import type { OrderExecutor } from "@/modules/orders";
import {
  FAILED_ORDERS_THRESHOLD,
  FAILED_ORDERS_WINDOW_MS,
  IDENTITY_RETENTION_DAYS,
  RISK_FLAGS,
} from "@/config/risk";

import { type RiskDeps, resolveRiskDeps } from "./context.ts";
import { emailHash } from "./normalise.ts";

/** The verdict (`PrePayVerdictSchema`). */
export const PrePayVerdictSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true) }).strict(),
  z
    .object({
      ok: z.literal(false),
      reason: z.enum(["blocked_email", "failed_orders", "paused"]),
    })
    .strict(),
]);
export type PrePayVerdict = z.infer<typeof PrePayVerdictSchema>;
export type PrePayRefusal = Extract<PrePayVerdict, { ok: false }>["reason"];

const DAY_MS = 86_400_000;

const OrderRow = z.object({
  id: z.uuid(),
  email: z.string().nullable(),
});

function iso(date: Date): string {
  return date.toISOString();
}

/** Whether a payment pause is active at `now`. */
export async function activePause(
  executor: OrderExecutor,
  now: Date,
): Promise<boolean> {
  const [row] = await executor.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM risk_pause
      WHERE starts_at <= ${iso(now)}::timestamptz AND ends_at > ${iso(now)}::timestamptz
    ) AS paused`);
  return row?.["paused"] === true;
}

/** Writes the email identity row of each order (idempotent). */
async function recordEmailIdentity(
  executor: OrderExecutor,
  orderIds: readonly string[],
  hash: string,
  now: Date,
): Promise<void> {
  const expires = new Date(
    now.getTime() + IDENTITY_RETENTION_DAYS.email * DAY_MS,
  );
  for (const orderId of orderIds) {
    await executor.execute(sql`
      INSERT INTO risk_identity (order_id, kind, hash, created_at, expires_at)
      VALUES (${orderId}, 'email', ${hash}, ${iso(now)}::timestamptz,
              ${iso(expires)}::timestamptz)
      ON CONFLICT (order_id, kind, hash) DO NOTHING`);
  }
}

/** Sets `last_matched_at` and answers whether the email hash is on the live blocklist. */
async function blocklisted(
  executor: OrderExecutor,
  hash: string,
  now: Date,
): Promise<boolean> {
  const rows = await executor.execute(sql`
    UPDATE risk_blocklist SET last_matched_at = ${iso(now)}::timestamptz
    WHERE kind = 'email' AND hash = ${hash} AND expires_at > ${iso(now)}::timestamptz
    RETURNING kind`);
  return rows.length > 0;
}

/** Other orders with this email hash that ended unpaid inside the window. */
async function failedOrders(
  executor: OrderExecutor,
  hash: string,
  excludeOrderIds: readonly string[],
  now: Date,
): Promise<number> {
  const since = new Date(now.getTime() - FAILED_ORDERS_WINDOW_MS);
  const excluded =
    excludeOrderIds.length === 0
      ? sql`ARRAY[]::uuid[]`
      : sql`ARRAY[${sql.join(
          excludeOrderIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )}]::uuid[]`;
  const [row] = await executor.execute(sql`
    SELECT count(DISTINCT o.id)::int AS count
    FROM risk_identity i
    JOIN "order" o ON o.id = i.order_id
    WHERE i.kind = 'email' AND i.hash = ${hash}
      AND o.status IN ('payment_failed', 'abandoned')
      AND NOT (o.id = ANY(${excluded}))
      AND EXISTS (
        SELECT 1 FROM order_event e
        WHERE e.order_id = o.id AND e.to_status IN ('payment_failed', 'abandoned')
          AND e.occurred_at >= ${iso(since)}::timestamptz
          AND e.occurred_at <= ${iso(now)}::timestamptz)`);
  return z
    .number()
    .int()
    .parse(row?.["count"] ?? 0);
}

function refuse(orderId: string | null, reason: PrePayRefusal): PrePayVerdict {
  logger.info({ order_id: orderId, reason }, "risk.prepay_refused");
  return { ok: false, reason };
}

/** The pay-step pre-check for one purchase (the file header). */
export async function prePayCheck(
  purchaseId: string,
  deps: RiskDeps = {},
): Promise<PrePayVerdict> {
  const id = z.uuid().parse(purchaseId);
  const d = resolveRiskDeps(deps);
  const now = d.now();
  const pauseFlag = await d.flag(RISK_FLAGS.payPause);
  const key = d.hashKey();
  return d.transaction(async (executor) => {
    const orders = (
      await executor.execute(sql`
        SELECT o.id, o.buyer_snapshot ->> 'email' AS email
        FROM "order" o WHERE o.purchase_id = ${id} ORDER BY o.id`)
    ).map((row) => OrderRow.parse(row));
    const firstId = orders[0]?.id ?? null;
    if (pauseFlag || (await activePause(executor, now))) {
      return refuse(firstId, "paused");
    }
    const email = orders.find((order) => order.email !== null)?.email ?? null;
    if (email === null || orders.length === 0) return { ok: true };
    if (key === null) {
      logger.warn(
        { order_id: firstId, reason: "env" },
        "risk.hash_key_missing",
      );
      return { ok: true };
    }
    const hash = emailHash(email, key);
    if (hash === null) return { ok: true };
    const orderIds = orders.map((order) => order.id);
    await recordEmailIdentity(executor, orderIds, hash, now);
    if (await blocklisted(executor, hash, now)) {
      return refuse(firstId, "blocked_email");
    }
    if (
      (await failedOrders(executor, hash, orderIds, now)) >=
      FAILED_ORDERS_THRESHOLD
    ) {
      return refuse(firstId, "failed_orders");
    }
    return { ok: true };
  });
}
