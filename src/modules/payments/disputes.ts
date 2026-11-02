/**
 * Bank disputes (spec 013 §5.2 "Disputes", §14 A-founder-2026-10-22 item 7; spec 002 §14 A6.3
 * D3, A9.7; AC-24 dispute sequence, AC-31; TASK-261).
 *
 * A dispute is on the purchase's one charge. `applyProviderDispute` brings our `payment_dispute`
 * row to the dispute as the provider holds it now, in the caller's transaction, under the
 * `payment` row lock (the lock order of every money write on a purchase), then each order's:
 *
 *  - **opened** (the row is new): one `payment_dispute` row and `payment.dispute_opened`; then, for
 *    every order of the purchase in set C (16 states, A9.7), row 34 `order.chargeback_opened`
 *    (fulfilment and routing stop, D3); each order outside C keeps its status and raises one
 *    `payment.dispute_outside_machine`;
 *  - **decided** (`won` or `lost`, from `open`): row 35 or 36 for every order in
 *    `chargeback_open`; every other order keeps its status and raises the same alert;
 *  - **closed without a decision** (an inquiry Stripe closes, `closed`): the row only; any order
 *    left in `chargeback_open` raises the alert, because no row of the machine leaves it for this
 *    case (escalated in `docs/tasks/TASK-261.md`).
 *
 * Because it works from the provider's current state, `charge.dispute.closed` delivered before
 * `charge.dispute.created` opens and decides at once, and the late `created` changes nothing.
 * Payloads, logs and alerts carry ids, amounts, currencies and codes only.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { logger } from "@/lib/logger";
import {
  transition,
  type AlertRaiser,
  type OrderExecutor,
} from "@/modules/orders";

import { PAYMENTS_ACTOR } from "./context.ts";
import { minorUnitsForProvider, type ProviderDispute } from "./provider.ts";
import { CHARGEBACK_OPEN, IN_SET_C } from "./states.ts";

export type DisputeApplied = "changed" | "unchanged" | "unknown";

const PaymentRow = z.object({ id: z.uuid(), purchase_id: z.uuid() });

const DisputeRow = z.object({
  id: z.uuid(),
  status: z.enum(["open", "won", "lost", "closed"]),
  evidence_due_by: z
    .union([z.date(), z.string()])
    .nullable()
    .transform((value) => (value === null ? null : new Date(value).getTime())),
});

const OrderRow = z.object({
  id: z.uuid(),
  status: z.string().min(1),
  mode: z.enum(["demo", "test", "live"]),
});

interface Scope {
  readonly executor: OrderExecutor;
  readonly paymentId: string;
  readonly purchaseId: string;
  readonly disputeId: string;
  readonly alert: AlertRaiser;
}

/** The purchase's orders, locked in a fixed order so two runs never deadlock. */
async function lockedOrders(scope: Scope) {
  const rows = await scope.executor.execute(sql`
    SELECT id, status, mode FROM "order" WHERE purchase_id = ${scope.purchaseId}
    ORDER BY created_at, id FOR UPDATE`);
  return rows.map((row) => OrderRow.parse(row));
}

function outsideMachine(scope: Scope, orderId: string): void {
  scope.alert("payment.dispute_outside_machine", {
    order_id: orderId,
    purchase_id: scope.purchaseId,
    payment_id: scope.paymentId,
    dispute_id: scope.disputeId,
  });
}

async function openOnOrders(
  scope: Scope,
  remote: ProviderDispute,
): Promise<void> {
  for (const order of await lockedOrders(scope)) {
    if (!IN_SET_C.has(order.status)) {
      outsideMachine(scope, order.id);
      continue;
    }
    await transition(
      order.id,
      "order.chargeback_opened",
      PAYMENTS_ACTOR,
      {
        mode: order.mode,
        dispute_id: scope.disputeId,
        amount_minor: minorUnitsForProvider(remote.amount.amountMinor),
        currency_code: remote.amount.currency,
      },
      { executor: scope.executor },
    );
  }
}

async function decideOnOrders(
  scope: Scope,
  outcome: ProviderDispute["status"],
): Promise<void> {
  for (const order of await lockedOrders(scope)) {
    if (outcome === "closed") {
      // No row leaves `chargeback_open` for an inquiry closed without a decision.
      if (order.status === CHARGEBACK_OPEN) outsideMachine(scope, order.id);
      continue;
    }
    if (order.status !== CHARGEBACK_OPEN) {
      outsideMachine(scope, order.id);
      continue;
    }
    await transition(
      order.id,
      outcome === "won" ? "order.chargeback_won" : "order.chargeback_lost",
      PAYMENTS_ACTOR,
      { mode: order.mode, dispute_id: scope.disputeId },
      { executor: scope.executor },
    );
  }
}

const isDecided = (status: ProviderDispute["status"]): boolean =>
  status !== "open";

/**
 * Applies the provider's dispute to our rows (above). `unknown` when no payment of ours is the
 * dispute's intent; `unchanged` when our row already says what the provider says.
 */
export async function applyProviderDispute(
  executor: OrderExecutor,
  remote: ProviderDispute,
  now: Date,
  alert: AlertRaiser,
): Promise<DisputeApplied> {
  const [paymentRaw] = await executor.execute(sql`
    SELECT id, purchase_id FROM payment WHERE provider_ref = ${remote.intentRef}
    FOR UPDATE`);
  if (paymentRaw === undefined) return "unknown";
  const payment = PaymentRow.parse(paymentRaw);
  const due = remote.evidenceDueBy?.toISOString() ?? null;
  const closedAt = isDecided(remote.status) ? now.toISOString() : null;

  const [existingRaw] = await executor.execute(sql`
    SELECT id, status, evidence_due_by FROM payment_dispute
    WHERE provider_ref = ${remote.ref} FOR UPDATE`);

  if (existingRaw === undefined) {
    const [inserted] = await executor.execute(sql`
      INSERT INTO payment_dispute (payment_id, currency_code, provider_ref, amount_minor, reason,
                                   status, evidence_due_by, opened_at, closed_at)
      VALUES (${payment.id}, ${remote.amount.currency}, ${remote.ref},
              ${minorUnitsForProvider(remote.amount.amountMinor)}, ${remote.reason}, ${remote.status},
              ${due}::timestamptz, ${remote.openedAt.toISOString()}::timestamptz,
              ${closedAt}::timestamptz)
      RETURNING id`);
    const scope: Scope = {
      executor,
      paymentId: payment.id,
      purchaseId: payment.purchase_id,
      disputeId: z.uuid().parse(inserted?.["id"]),
      alert,
    };
    alert("payment.dispute_opened", {
      payment_id: payment.id,
      purchase_id: payment.purchase_id,
      dispute_id: scope.disputeId,
    });
    await openOnOrders(scope, remote);
    if (isDecided(remote.status)) await decideOnOrders(scope, remote.status);
    logger.info(
      { dispute_id: scope.disputeId, status: remote.status, outcome: "opened" },
      "payments.dispute",
    );
    return "changed";
  }

  const existing = DisputeRow.parse(existingRaw);
  const scope: Scope = {
    executor,
    paymentId: payment.id,
    purchaseId: payment.purchase_id,
    disputeId: existing.id,
    alert,
  };
  const decidedNow = existing.status === "open" && isDecided(remote.status);
  const dueChanged =
    existing.evidence_due_by !== (remote.evidenceDueBy?.getTime() ?? null);
  if (!decidedNow && !dueChanged) return "unchanged";

  if (decidedNow) {
    await executor.execute(sql`
      UPDATE payment_dispute
      SET status = ${remote.status}, closed_at = ${closedAt}::timestamptz,
          evidence_due_by = ${due}::timestamptz
      WHERE id = ${existing.id}`);
    await decideOnOrders(scope, remote.status);
  } else {
    await executor.execute(sql`
      UPDATE payment_dispute SET evidence_due_by = ${due}::timestamptz
      WHERE id = ${existing.id}`);
  }
  logger.info(
    {
      dispute_id: existing.id,
      status: remote.status,
      outcome: decidedNow ? "decided" : "updated",
    },
    "payments.dispute",
  );
  return "changed";
}
