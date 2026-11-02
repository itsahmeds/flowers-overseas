/**
 * An order's refund state, read in the caller's transaction (spec 020a §2.4, §5.2 "Availability",
 * AC-17, AC-21, AC-23; TASK-359).
 *
 * "Remaining" is spec 020a's, per order (spec 010's basket, TASK-350: a refund names its order
 * and never exceeds that order's own total): the order's `buyer_total_minor` when its purchase
 * has a captured payment, minus the order's refunds that are `requested`, `pending` or
 * `succeeded`. A `failed` or `cancelled` refund gives its amount back.
 *
 * `orderRefunds` is the refunds list of the order detail (AC-23): every refund row of the order,
 * oldest first, with its status, amount and currency, reason code, who asked (the requesting
 * admin's display name, or the system), when it succeeded, and the remaining balance. The page
 * (TASK-361) formats the amount with `formatMoney` and the reason through its admin label; this
 * module returns codes and integers only. No buyer or recipient field is read.
 *
 * Reads only: no `INSERT`, `UPDATE` or `DELETE` here (AC-8).
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import type { AdminContextInput } from "@/lib/db";
import type { OrderExecutor } from "@/modules/orders";

import { type RefundBalanceRow, remainingRefundable } from "./money.ts";
import {
  adminOrderActionTransaction,
  type OrderActionTransaction,
} from "./run.ts";

const Minor = z
  .union([z.string().regex(/^-?\d+$/), z.bigint(), z.number().int()])
  .transform((value) => BigInt(value));

/** `refund.status` (spec 013 §5.1). */
export const refundStatuses = [
  "requested",
  "pending",
  "succeeded",
  "failed",
  "cancelled",
] as const;
export type RefundStatus = (typeof refundStatuses)[number];

const RefundListRow = z.object({
  id: z.uuid(),
  status: z.enum(refundStatuses),
  amount_minor: Minor,
  currency_code: z.string().regex(/^[A-Z]{3}$/),
  reason: z.string().min(1),
  requested_by: z.string().min(1),
  requester_name: z.string().nullable(),
  created_at: z.date(),
  succeeded_at: z.date().nullable(),
});

export interface RefundState {
  /** The order's total when its purchase has a captured payment, else zero. */
  readonly capturedMinor: bigint;
  readonly remainingMinor: bigint;
  /** Some refund of the order is `requested` or `pending`. */
  readonly refundInFlight: boolean;
}

export interface RefundListEntry {
  readonly id: string;
  readonly status: RefundStatus;
  readonly amountMinor: bigint;
  readonly currencyCode: string;
  /** Spec 013's reason code; the page shows its admin label. */
  readonly reason: string;
  /** Who asked: an admin by display name, or the system (`system:payments`, the cancel handler). */
  readonly requestedBy:
    | { readonly kind: "admin"; readonly displayName: string | null }
    | { readonly kind: "system" };
  readonly requestedAt: Date;
  readonly succeededAt: Date | null;
}

export interface OrderRefunds extends RefundState {
  readonly currencyCode: string;
  readonly refunds: readonly RefundListEntry[];
}

function stateOf(
  capturedMinor: bigint,
  rows: readonly RefundBalanceRow[],
): RefundState {
  return {
    capturedMinor,
    remainingMinor: remainingRefundable(capturedMinor, rows),
    refundInFlight: rows.some(
      (row) => row.status === "requested" || row.status === "pending",
    ),
  };
}

async function capturedFor(
  executor: OrderExecutor,
  order: {
    readonly purchaseId: string | null;
    readonly buyerTotalMinor: bigint;
  },
): Promise<bigint> {
  if (order.purchaseId === null) return 0n;
  const [captured] = await executor.execute(sql`
    SELECT 1 AS captured FROM payment
    WHERE purchase_id = ${order.purchaseId} AND status = 'captured'
    LIMIT 1`);
  return captured === undefined ? 0n : order.buyerTotalMinor;
}

/** The order's refund state, in the caller's transaction (under its lock, for an action). */
export async function readRefundState(
  executor: OrderExecutor,
  order: {
    readonly id: string;
    readonly purchaseId: string | null;
    readonly buyerTotalMinor: bigint;
  },
): Promise<RefundState> {
  const capturedMinor = await capturedFor(executor, order);
  const rows = await executor.execute(sql`
    SELECT status, amount_minor FROM refund WHERE order_id = ${order.id}`);
  return stateOf(
    capturedMinor,
    rows.map((row) => ({
      status: z.enum(refundStatuses).parse(row["status"]),
      amountMinor: Minor.parse(row["amount_minor"]),
    })),
  );
}

const OrderHead = z.object({
  purchase_id: z.uuid().nullable(),
  buyer_total_minor: Minor,
  buyer_currency_code: z.string().regex(/^[A-Z]{3}$/),
});

/** The audit action of the list's read (no trigger records a read). */
export const ORDER_REFUNDS_READ_ACTION = "order.refunds.read";

export interface OrderRefundsDeps {
  readonly transaction?: OrderActionTransaction;
}

/**
 * The refunds list and the remaining balance of one order (AC-23), or `null` when no such order
 * exists. Runs in an admin-context read transaction as `viewer`.
 */
export async function orderRefunds(
  orderId: string,
  viewer: { readonly userId: string; readonly requestId?: string },
  deps: OrderRefundsDeps = {},
): Promise<OrderRefunds | null> {
  const id = z.uuid().parse(orderId);
  const transaction = deps.transaction ?? adminOrderActionTransaction;
  const context: AdminContextInput = {
    userId: viewer.userId,
    action: ORDER_REFUNDS_READ_ACTION,
    ...(viewer.requestId === undefined ? {} : { requestId: viewer.requestId }),
  };
  return transaction(context, async (executor) => {
    const [headRaw] = await executor.execute(sql`
      SELECT purchase_id, buyer_total_minor, buyer_currency_code FROM "order" WHERE id = ${id}`);
    if (headRaw === undefined) return null;
    const head = OrderHead.parse(headRaw);
    const capturedMinor = await capturedFor(executor, {
      purchaseId: head.purchase_id,
      buyerTotalMinor: head.buyer_total_minor,
    });
    const rows = (
      await executor.execute(sql`
        SELECT r.id, r.status, r.amount_minor, r.currency_code, r.reason, r.requested_by,
               ap.display_name AS requester_name, r.created_at, r.succeeded_at
        FROM refund r
        LEFT JOIN admin_profile ap ON r.requested_by = 'admin:' || ap.user_id::text
        WHERE r.order_id = ${id}
        ORDER BY r.created_at, r.id`)
    ).map((raw) => RefundListRow.parse(raw));
    const refunds = rows.map((row): RefundListEntry => ({
      id: row.id,
      status: row.status,
      amountMinor: row.amount_minor,
      currencyCode: row.currency_code,
      reason: row.reason,
      requestedBy: row.requested_by.startsWith("admin:")
        ? { kind: "admin", displayName: row.requester_name }
        : { kind: "system" },
      requestedAt: row.created_at,
      succeededAt: row.succeeded_at,
    }));
    return {
      currencyCode: head.buyer_currency_code,
      refunds,
      ...stateOf(
        capturedMinor,
        refunds.map((row) => ({
          status: row.status,
          amountMinor: row.amountMinor,
        })),
      ),
    };
  });
}
