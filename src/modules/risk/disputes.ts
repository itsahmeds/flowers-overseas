/**
 * The `risk` outbox target (spec 021 §5.2 "Chargebacks", §13 Q1; AC-27; TASK-495):
 * `order.chargeback_opened` (A6 row 34) for a `test` or `live` order. The handler reads the
 * order's disputes through spec 013's `disputesFor(orderId)` (handed in; this module never imports
 * payments). When one has reason `fraudulent`, the order's email and card hashes go on
 * `risk_blocklist` with `source = 'dispute'` and any open review closes as `superseded`; a dispute
 * with any other reason (`product_not_received`, `general`) writes nothing. Radar's R5 already
 * blocks the card at Stripe; our list also covers the email and a future Mollie path.
 *
 * Idempotent: `addToBlocklist` upserts by `(kind, hash)` and a closed review stays closed, so a
 * redelivery writes nothing new. Never writes `orders.status` (AC-23). Logs: ids and counts.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { logger } from "@/lib/logger";
import type { OrderExecutor, OutboxHandler } from "@/modules/orders";

import { addToBlocklist, orderHashes } from "./blocklist.ts";
import { RISK_ACTOR, type RiskDeps, resolveRiskDeps } from "./context.ts";
import { closeReview } from "./reviews.ts";

/** One dispute as spec 013's `disputesFor` reports it (codes only). */
export interface RiskDispute {
  readonly reason: string;
  readonly status: string;
}

export interface RiskOutboxDeps extends RiskDeps {
  /** Spec 013's `disputesFor(orderId)`, on the delivery's transaction. */
  readonly disputesFor: (
    executor: OrderExecutor,
    orderId: string,
  ) => Promise<readonly RiskDispute[]>;
}

/** The dispute reason that blocklists (§5.2): the bank's "fraudulent" code. */
export const FRAUD_DISPUTE_REASON = "fraudulent";

/** Blocklists a fraud dispute's buyer and supersedes open reviews. Returns what it wrote. */
export async function blocklistFraudDispute(
  executor: OrderExecutor,
  orderId: string,
  deps: RiskOutboxDeps,
): Promise<{ readonly listed: number; readonly superseded: number }> {
  const disputes = await deps.disputesFor(executor, orderId);
  if (!disputes.some((dispute) => dispute.reason === FRAUD_DISPUTE_REASON)) {
    return { listed: 0, superseded: 0 };
  }
  const now = resolveRiskDeps(deps).now();
  const listed = await addToBlocklist(
    executor,
    await orderHashes(executor, orderId),
    "dispute",
    now,
  );
  const open = await executor.execute(sql`
    SELECT id FROM risk_review WHERE order_id = ${orderId} AND status = 'open'`);
  for (const row of open) {
    await closeReview(
      executor,
      z.uuid().parse(row["id"]),
      "superseded",
      RISK_ACTOR,
      "superseded",
      now,
    );
  }
  return { listed, superseded: open.length };
}

/** `risk: riskOutboxHandler(deps)` (the file header). */
export function riskOutboxHandler(deps: RiskOutboxDeps): OutboxHandler {
  return async (event, context) => {
    if (event.type !== "order.chargeback_opened" || event.mode === "demo") {
      return;
    }
    const written = await blocklistFraudDispute(
      context.executor,
      event.orderId,
      deps,
    );
    logger.info(
      {
        order_id: event.orderId,
        event_id: event.eventId,
        count: written.listed,
        outcome: written.listed > 0 ? "blocklisted" : "not_fraud",
      },
      "risk.dispute",
    );
  };
}
