/**
 * `runOrderAction` (spec 020a §5.2 "`runOrderAction`, in order", AC-4, AC-5, AC-6; TASK-357's
 * action core, built in TASK-359 by the orchestrator's ruling of 2026-11-02).
 *
 * The one wrapper every admin order action runs through, after its server action has called
 * `requirePermission` as its first statement and parsed its input:
 *
 *  1. one admin-context transaction (`withAdminContext`) with the audit action
 *     `order.action.{kind}` and the admin's note as `app.audit_reason`, so spec 012's trigger
 *     writes the `audit_log` row of the `admin_order_action` insert in this same transaction;
 *  2. the purchase's `payment` rows, then the order row, locked `FOR UPDATE` (the lock order of
 *     every money write on a purchase, spec 013 §5.2), so two actions on one order run one after
 *     the other;
 *  3. an `actionId` already recorded returns its stored outcome with `replayed: true` and does
 *     nothing else: a concurrent duplicate waits on the lock and then finds the row;
 *  4. a `demo` order is `DEMO_ORDER`; an order whose highest `order_event.seq` is not
 *     `expectedSeq` (it moved since the page rendered) is `ORDER_CHANGED`;
 *  5. the effect runs on this transaction's executor; a refusal rolls the whole transaction
 *     back, so a refused action leaves no action row and no audit row;
 *  6. the `admin_order_action` row is inserted with the effect's `result_ref`, stamped with the
 *     clock **after** the lock (`clock_timestamp()`, not the transaction's start), so two actions
 *     on one order list in the order they took the lock, and the resend rate limit counts by it
 *     (TASK-360: two resends share one `expectedSeq`, so both may wait on one lock);
 *  7. after the commit, and only then, the effect's `afterCommit` runs (a refund's provider call,
 *     keyed by the refund row's id; a crash before it is recovered by `payments.sweep` (d)).
 *
 * This module never writes an order, an event, a refund or a payment itself (AC-8): the effect
 * reaches them only through the commands of specs 013 and 016.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import type { AdminContextInput } from "@/lib/db";
import { logger } from "@/lib/logger";
import { type OrderExecutor, withExecutor } from "@/modules/orders";

import { isOrderActionStatus, type OrderActionStatus } from "./availability.ts";
import type {
  AdminOrderActionBase,
  AdminOrderActionCode,
  AdminOrderActionHint,
  AdminOrderActionKind,
  AdminOrderActionResult,
} from "./schemas.ts";

/** Opens the action's admin-context transaction and hands `fn` its executor. */
export type OrderActionTransaction = <T>(
  context: AdminContextInput,
  fn: (executor: OrderExecutor) => Promise<T>,
) => Promise<T>;

/** The production transaction: `withAdminContext`, its Drizzle handle wrapped for the engine. */
export const adminOrderActionTransaction: OrderActionTransaction = async (
  context,
  fn,
) => {
  const { withAdminContext } = await import("@/lib/db");
  return withAdminContext(context, (db) =>
    withExecutor({ db }, "admin.order_action", fn),
  );
};

/** The audit action of an order action (`audit_log.action`, AC-6). */
export function orderActionAuditAction(kind: AdminOrderActionKind): string {
  return `order.action.${kind}`;
}

/** The order as the effect sees it, read under the lock. */
export interface LockedOrder {
  readonly id: string;
  readonly status: OrderActionStatus;
  readonly mode: "live" | "test" | "demo";
  readonly purchaseId: string | null;
  readonly buyerTotalMinor: bigint;
  readonly currencyCode: string;
  /** The order's highest `order_event.seq`. */
  readonly seq: number;
}

/** What the effect records on the `admin_order_action` row (ids, a reason code, money). */
export interface ActionRecord {
  readonly reason?: string;
  readonly amountMinor?: bigint;
  readonly currencyCode?: string;
  readonly partnerId?: string;
  readonly notificationDeliveryId?: string;
}

export type EffectOutcome =
  | {
      readonly ok: true;
      readonly resultRef: string;
      readonly record: ActionRecord;
      /** Runs after the commit (a refund's provider call). Its failure never undoes the action. */
      readonly afterCommit?: () => Promise<unknown>;
    }
  | {
      readonly ok: false;
      readonly code: AdminOrderActionCode;
      readonly hint?: AdminOrderActionHint;
    };

export interface EffectContext {
  readonly executor: OrderExecutor;
  readonly order: LockedOrder;
  /** `admin:{userId}`, the actor of every event the effect causes. */
  readonly actor: string;
}

export interface RunOrderActionRequest {
  readonly kind: AdminOrderActionKind;
  readonly input: AdminOrderActionBase;
  readonly userId: string;
  readonly requestId?: string;
  /** The admin's internal note: `audit_log.reason` only, never a log line. */
  readonly note?: string;
}

export interface RunOrderActionDeps {
  readonly transaction?: OrderActionTransaction;
}

export type RunOrderActionResult = AdminOrderActionResult;

/** Carries a refusal out of the transaction, so the transaction rolls back. */
class Refusal extends Error {
  readonly code: AdminOrderActionCode;
  readonly hint: AdminOrderActionHint | undefined;
  constructor(code: AdminOrderActionCode, hint?: AdminOrderActionHint) {
    super(code);
    this.code = code;
    this.hint = hint;
  }
}

const Minor = z
  .union([z.string().regex(/^-?\d+$/), z.bigint(), z.number().int()])
  .transform((value) => BigInt(value));

const OrderRow = z.object({
  id: z.uuid(),
  status: z.string().refine(isOrderActionStatus),
  mode: z.enum(["live", "test", "demo"]),
  purchase_id: z.uuid().nullable(),
  buyer_total_minor: Minor,
  buyer_currency_code: z.string().regex(/^[A-Z]{3}$/),
});

const SeqRow = z.object({ seq: z.number().int().nonnegative() });

const StoredAction = z.object({
  order_id: z.uuid(),
  kind: z.string(),
  result_ref: z.string().min(1),
});

const STORED_KINDS: readonly string[] = [
  "reroute",
  "cancel",
  "refund_full",
  "refund_partial",
  "resend",
];

function isKind(kind: string): kind is AdminOrderActionKind {
  return STORED_KINDS.includes(kind);
}

async function lockOrder(
  executor: OrderExecutor,
  orderId: string,
): Promise<LockedOrder | null> {
  // Money lock order first: the purchase's payments, then the order (spec 013 §5.2).
  await executor.execute(sql`
    SELECT p.id FROM payment p
    WHERE p.purchase_id = (SELECT o.purchase_id FROM "order" o WHERE o.id = ${orderId})
    ORDER BY p.id
    FOR UPDATE OF p`);
  const [raw] = await executor.execute(sql`
    SELECT id, status, mode, purchase_id, buyer_total_minor, buyer_currency_code
    FROM "order" WHERE id = ${orderId}
    FOR UPDATE`);
  if (raw === undefined) return null;
  const row = OrderRow.parse(raw);
  const [seqRaw] = await executor.execute(sql`
    SELECT coalesce(max(seq), 0)::int AS seq FROM order_event WHERE order_id = ${orderId}`);
  return {
    id: row.id,
    status: row.status as OrderActionStatus,
    mode: row.mode,
    purchaseId: row.purchase_id,
    buyerTotalMinor: row.buyer_total_minor,
    currencyCode: row.buyer_currency_code,
    seq: SeqRow.parse(seqRaw).seq,
  };
}

type Committed =
  | {
      readonly kind: "replayed";
      readonly stored: AdminOrderActionKind;
      readonly resultRef: string;
    }
  | {
      readonly kind: "done";
      readonly resultRef: string;
      readonly afterCommit?: () => Promise<unknown>;
    };

export async function runOrderAction(
  request: RunOrderActionRequest,
  effect: (context: EffectContext) => Promise<EffectOutcome>,
  deps: RunOrderActionDeps = {},
): Promise<RunOrderActionResult> {
  const transaction = deps.transaction ?? adminOrderActionTransaction;
  const { kind, input, userId } = request;
  const actor = `admin:${userId}`;
  const context: AdminContextInput = {
    userId,
    action: orderActionAuditAction(kind),
    ...(request.requestId === undefined
      ? {}
      : { requestId: request.requestId }),
    ...(request.note === undefined ? {} : { reason: request.note }),
  };

  let committed: Committed;
  try {
    committed = await transaction(
      context,
      async (executor): Promise<Committed> => {
        const order = await lockOrder(executor, input.orderId);
        if (order === null) throw new Refusal("INPUT_INVALID");

        const [storedRaw] = await executor.execute(sql`
        SELECT order_id, kind, result_ref FROM admin_order_action WHERE id = ${input.actionId}`);
        if (storedRaw !== undefined) {
          const stored = StoredAction.parse(storedRaw);
          // An action id names one action on one order; reused on another order it is forged.
          if (stored.order_id !== order.id || !isKind(stored.kind)) {
            throw new Refusal("INPUT_INVALID");
          }
          return {
            kind: "replayed",
            stored: stored.kind,
            resultRef: stored.result_ref,
          };
        }

        if (order.mode === "demo") throw new Refusal("DEMO_ORDER");
        if (order.seq !== input.expectedSeq) throw new Refusal("ORDER_CHANGED");

        const outcome = await effect({ executor, order, actor });
        if (!outcome.ok) throw new Refusal(outcome.code, outcome.hint);

        const record = outcome.record;
        const inserted = await executor.execute(sql`
        INSERT INTO admin_order_action (id, order_id, kind, actor_user_id, reason, amount_minor,
                                        currency_code, partner_id, notification_delivery_id,
                                        result_ref, created_at)
        VALUES (${input.actionId}, ${order.id}, ${kind}, ${userId}, ${record.reason ?? null},
                ${record.amountMinor === undefined ? null : record.amountMinor.toString()}::bigint,
                ${record.currencyCode ?? null}, ${record.partnerId ?? null}::uuid,
                ${record.notificationDeliveryId ?? null}::uuid, ${outcome.resultRef},
                clock_timestamp())
        ON CONFLICT (id) DO NOTHING
        RETURNING id`);
        // Only an action id reused on another order, racing, can conflict here: undo the effect.
        if (inserted.length !== 1) throw new Refusal("INPUT_INVALID");
        return {
          kind: "done",
          resultRef: outcome.resultRef,
          ...(outcome.afterCommit === undefined
            ? {}
            : { afterCommit: outcome.afterCommit }),
        };
      },
    );
  } catch (error) {
    if (error instanceof Refusal) {
      logger.info(
        {
          order_id: input.orderId,
          action_id: input.actionId,
          kind,
          outcome: error.code,
        },
        "admin.order_action_refused",
      );
      return error.hint === undefined
        ? { ok: false, code: error.code }
        : { ok: false, code: error.code, hint: error.hint };
    }
    throw error;
  }

  if (committed.kind === "replayed") {
    logger.info(
      {
        order_id: input.orderId,
        action_id: input.actionId,
        kind,
        outcome: "replayed",
      },
      "admin.order_action",
    );
    return {
      ok: true,
      kind: committed.stored,
      resultRef: committed.resultRef,
      replayed: true,
    };
  }
  logger.info(
    {
      order_id: input.orderId,
      action_id: input.actionId,
      kind,
      outcome: "done",
    },
    "admin.order_action",
  );
  if (committed.afterCommit !== undefined) await committed.afterCommit();
  return { ok: true, kind, resultRef: committed.resultRef, replayed: false };
}
