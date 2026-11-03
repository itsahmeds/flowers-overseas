/**
 * An order's action history (spec 020a §5.2 "Where things live", §5.3 "Action history"; TASK-357).
 *
 * `orderActionHistory(orderId, viewer)` lists every `admin_order_action` row of one order, oldest
 * first: who (the acting admin's id and display name), what (the kind, with the florist offered for
 * a reroute and the template and audience resent for a resend), when, the reason code and the
 * amount with its currency. The page (TASK-361) labels the kind, reason and template through its
 * admin keys and formats the amount with `formatMoney`; this module returns codes, ids and
 * integers only.
 *
 * Order: `created_at` (the action's transaction time), then the row's id, so two rows with one
 * timestamp come back in one fixed order on every read.
 *
 * Never read: the admin's note (it lives in `audit_log.reason` only, §8), and any buyer,
 * recipient or address field; the resent delivery is named by template and audience, never by
 * `recipient_ref`. Reads only: no `INSERT`, `UPDATE` or `DELETE` here (AC-8).
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import type { AdminContextInput } from "@/lib/db";

import {
  adminOrderActionTransaction,
  type OrderActionTransaction,
} from "./run.ts";
import { type AdminOrderActionKind, adminOrderActionKinds } from "./schemas.ts";

const Minor = z
  .union([z.string().regex(/^\d+$/), z.bigint(), z.number().int()])
  .transform((value) => BigInt(value));

const HistoryRow = z
  .object({
    id: z.uuid(),
    kind: z.enum(adminOrderActionKinds),
    actor_user_id: z.uuid(),
    actor_name: z.string().nullable(),
    reason: z.string().min(1).nullable(),
    amount_minor: Minor.nullable(),
    currency_code: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
    partner_id: z.uuid().nullable(),
    partner_name: z.string().nullable(),
    notification_delivery_id: z.uuid().nullable(),
    template_key: z.string().nullable(),
    audience: z.string().nullable(),
    created_at: z.date(),
  })
  // The foreign keys hold these: a resend's delivery row exists and is readable by staff.
  .refine(
    (row) =>
      row.notification_delivery_id === null ||
      (row.template_key !== null && row.audience !== null),
    "a resend names a delivery row",
  );

export interface ActionHistoryEntry {
  /** The action's id (the form's `actionId`). */
  readonly id: string;
  readonly kind: AdminOrderActionKind;
  /** Who: the acting admin, by display name when the profile has one. */
  readonly actor: {
    readonly userId: string;
    readonly displayName: string | null;
  };
  /** When the action took effect. */
  readonly at: Date;
  /** Spec 013's reason code (cancel and refunds); `null` for a reroute or a resend. */
  readonly reason: string | null;
  /** The refunded amount (refunds only). */
  readonly amount: {
    readonly amountMinor: bigint;
    readonly currencyCode: string;
  } | null;
  /** The florist offered the order (reroute only), by the name admin's florists list shows. */
  readonly partner: {
    readonly partnerId: string;
    readonly displayName: string;
  } | null;
  /** The delivery that was resent (resend only): its template and audience, never an address. */
  readonly resent: {
    readonly deliveryId: string;
    readonly templateKey: string;
    readonly audience: string;
  } | null;
}

/** The audit action of the history's read (no trigger records a read). */
export const ORDER_ACTION_HISTORY_READ_ACTION = "order.action_history.read";

export interface OrderActionHistoryDeps {
  readonly transaction?: OrderActionTransaction;
}

/**
 * The action history of one order, oldest first, or `null` when no such order exists. Runs in an
 * admin-context read transaction as `viewer`.
 */
export async function orderActionHistory(
  orderId: string,
  viewer: { readonly userId: string; readonly requestId?: string },
  deps: OrderActionHistoryDeps = {},
): Promise<readonly ActionHistoryEntry[] | null> {
  const id = z.uuid().parse(orderId);
  const transaction = deps.transaction ?? adminOrderActionTransaction;
  const context: AdminContextInput = {
    userId: viewer.userId,
    action: ORDER_ACTION_HISTORY_READ_ACTION,
    ...(viewer.requestId === undefined ? {} : { requestId: viewer.requestId }),
  };
  return transaction(context, async (executor) => {
    const [order] = await executor.execute(sql`
      SELECT 1 AS found FROM "order" WHERE id = ${id}`);
    if (order === undefined) return null;
    const rows = (
      await executor.execute(sql`
        SELECT a.id, a.kind, a.actor_user_id, ap.display_name AS actor_name, a.reason,
               a.amount_minor, a.currency_code, a.partner_id, fp.legal_name AS partner_name,
               a.notification_delivery_id, nd.template_key, nd.audience, a.created_at
        FROM admin_order_action a
        LEFT JOIN admin_profile ap ON ap.user_id = a.actor_user_id
        LEFT JOIN fulfillment_partner fp ON fp.id = a.partner_id
        LEFT JOIN notification_delivery nd ON nd.id = a.notification_delivery_id
        WHERE a.order_id = ${id}
        ORDER BY a.created_at, a.id`)
    ).map((raw) => HistoryRow.parse(raw));
    return rows.map((row): ActionHistoryEntry => ({
      id: row.id,
      kind: row.kind,
      actor: { userId: row.actor_user_id, displayName: row.actor_name },
      at: row.created_at,
      reason: row.reason,
      amount:
        row.amount_minor === null || row.currency_code === null
          ? null
          : {
              amountMinor: row.amount_minor,
              currencyCode: row.currency_code,
            },
      partner:
        row.partner_id === null
          ? null
          : {
              partnerId: row.partner_id,
              displayName: row.partner_name ?? row.partner_id,
            },
      resent:
        row.notification_delivery_id === null ||
        row.template_key === null ||
        row.audience === null
          ? null
          : {
              deliveryId: row.notification_delivery_id,
              templateKey: row.template_key,
              audience: row.audience,
            },
    }));
  });
}
