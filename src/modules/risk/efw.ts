/**
 * Early fraud warnings after the money is taken (spec 021 §5.2 "After routing: early fraud
 * warnings", §13 Q1; AC-26; TASK-495). Spec 013's `webhook.process` retrieves a
 * `radar.early_fraud_warning.created`, maps its charge to the purchase and hands each order here,
 * on its own transaction. By the order's status when it is processed:
 *
 * | Order status | What happens |
 * |---|---|
 * | `placed`, `authorised` | nothing yet: the gate reads `efwReceived` from the provider (D2) |
 * | `paid_unrouted`, `routed`, `no_partner_available`, `manual_reroute` | `cancelOrder(…, 'system:risk', 'fraud_confirmed')`, the email and card hashes on the blocklist (`source = 'efw'`), an open review `auto_cancelled`, `risk.auto_cancelled` |
 * | `accepted` | throws `ORDER_IN_HANDOVER`: the inbox row fails and is retried until row 14 makes the order `paid` |
 * | `paid` | an open `post_routing` review, `recommendation = 'refund'`, `deadline_at = productionStartAt − 60 min` (`decide_now` under 30 minutes: the full refund at once, `auto_refunded`) |
 * | `in_production` or later | an open `post_routing` review with no deadline; `risk.efw_after_routing` |
 * | `chargeback_open`, cancelled, refunded or unpaid-closed | nothing; logged |
 *
 * A second delivery of the same warning (or a second warning on the same charge) changes nothing:
 * a cancelled order is past every acting state, and an order with a `post_routing` review gets no
 * second one. Status changes only through spec 013's `cancelOrder` and refund path (ADR-0009);
 * this module never calls `transition` (AC-23). Logs carry ids and codes only (§11).
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { logger } from "@/lib/logger";
import type { AlertRaiser, OrderExecutor } from "@/modules/orders";
import { RISK_RULES_VERSION } from "@/config/risk";

import { addToBlocklist, orderHashes } from "./blocklist.ts";
import { RISK_ACTOR, type RiskDeps, resolveRiskDeps } from "./context.ts";
import { postRoutingDeadline } from "./deadline.ts";
import {
  applyPostRoutingDefault,
  closeReview,
  type RiskCancel,
  type RiskRefund,
} from "./reviews.ts";

/** `EarlyFraudWarningV1` (§5.2): the warning's own fields, none of them personal. */
export const EarlyFraudWarningV1 = z
  .object({
    id: z.string().min(1).max(255),
    charge: z.string().min(1).max(255),
    fraud_type: z.string().regex(/^[a-z_]{1,64}$/u),
    actionable: z.boolean(),
    livemode: z.boolean(),
    created: z.number().int().nonnegative(),
  })
  .strict();
export type EarlyFraudWarning = z.infer<typeof EarlyFraudWarningV1>;

const EarlyFraudWarningInput = z
  .object({ orderId: z.uuid(), warning: EarlyFraudWarningV1 })
  .strict();

/** Thrown for an `accepted` order: the inbox row is retried until the order is `paid`. */
export class OrderInHandover extends Error {
  readonly code = "ORDER_IN_HANDOVER";

  constructor() {
    super("ORDER_IN_HANDOVER");
    this.name = "ORDER_IN_HANDOVER";
  }
}

/** Not yet paid: the gate sees the warning through `riskFactsFor` (D2). */
export const EFW_DEFER_STATES: ReadonlySet<string> = new Set([
  "placed",
  "authorised",
]);
/** Paid and not yet accepted by a florist (`paid_unrouted` and set E): cancel and refund. */
export const EFW_CANCEL_STATES: ReadonlySet<string> = new Set([
  "paid_unrouted",
  "routed",
  "no_partner_available",
  "manual_reroute",
]);
/** The bouquet is being made or delivered: a review with no deadline and no default. */
export const EFW_AFTER_PRODUCTION_STATES: ReadonlySet<string> = new Set([
  "in_production",
  "awaiting_buyer",
  "out_for_delivery",
  "delivery_failed",
  "redelivery_scheduled",
  "delivered",
  "photo_uploaded",
  "disputed",
  "resolved",
  "closed",
]);

export type EfwOutcome =
  | "deferred"
  | "cancelled"
  | "review_opened"
  | "refunded"
  | "already_reviewed"
  | "nothing";

export interface EfwResult {
  readonly outcome: EfwOutcome;
  /** A refund row to submit after commit (`decide_now` on a `paid` order). */
  readonly refundId?: string;
}

/** What the job layer hands the handler (this module never imports payments). */
export interface EfwDeps extends RiskDeps {
  readonly cancelOrder: RiskCancel;
  readonly refundBalance: RiskRefund;
  /** Spec 013's `productionStartAt` for the order's delivery date and destination zone. */
  readonly productionStartAt: (timing: {
    readonly deliveryDate: string;
    readonly zone: string;
  }) => Date;
  readonly alert: AlertRaiser;
}

const OrderRow = z.object({
  status: z.string().min(1),
  mode: z.enum(["demo", "test", "live"]),
  delivery_date: z.string(),
  zone: z.string().min(1),
});

const LatestAssessment = z.object({
  score: z.number().int(),
  signals: z.array(z.object({ id: z.string(), points: z.number().int() })),
  liability_shift: z.boolean().nullable(),
  radar_risk_level: z.string().nullable(),
  radar_risk_score: z.number().int().nullable(),
  radar_outcome: z.string().nullable(),
});

/** Records the post-routing assessment (D2 added) and opens its review. Returns the review id. */
async function openPostRoutingReview(
  executor: OrderExecutor,
  orderId: string,
  mode: "test" | "live",
  deadlineAt: Date | null,
  now: Date,
): Promise<string> {
  const [raw] = await executor.execute(sql`
    SELECT score::int AS score, signals, liability_shift, radar_risk_level,
           radar_risk_score::int AS radar_risk_score, radar_outcome
    FROM risk_assessment WHERE order_id = ${orderId} AND stage = 'routing'
    ORDER BY created_at DESC, id DESC LIMIT 1`);
  const prior = raw === undefined ? null : LatestAssessment.parse(raw);
  const signals = [
    ...(prior?.signals.filter((signal) => signal.id !== "D2") ?? []),
    { id: "D2", points: 0 },
  ];
  const [assessment] = await executor.execute(sql`
    INSERT INTO risk_assessment (order_id, stage, mode, rules_version, score, decision, enforced,
                                 signals, liability_shift, radar_risk_level, radar_risk_score,
                                 radar_outcome, created_at)
    VALUES (${orderId}, 'post_routing', ${mode}, ${RISK_RULES_VERSION}, ${prior?.score ?? 0},
            'hold', true, (${JSON.stringify(signals)}::text)::jsonb,
            ${prior?.liability_shift ?? null}, ${prior?.radar_risk_level ?? null},
            ${prior?.radar_risk_score ?? null}, ${prior?.radar_outcome ?? null},
            ${now.toISOString()}::timestamptz)
    RETURNING id`);
  const [review] = await executor.execute(sql`
    INSERT INTO risk_review (order_id, assessment_id, kind, status, recommendation, deadline_at,
                             created_at)
    VALUES (${orderId}, ${z.uuid().parse(assessment?.["id"])}, 'post_routing', 'open', 'refund',
            ${deadlineAt?.toISOString() ?? null}::timestamptz, ${now.toISOString()}::timestamptz)
    RETURNING id`);
  return z.uuid().parse(review?.["id"]);
}

/**
 * `handleEarlyFraudWarning(EarlyFraudWarningV1)` for one order of the warned charge (the file
 * header), on the caller's transaction (the webhook run's).
 */
export async function handleEarlyFraudWarning(
  input: unknown,
  executor: OrderExecutor,
  deps: EfwDeps,
): Promise<EfwResult> {
  const { orderId } = EarlyFraudWarningInput.parse(input);
  const now = resolveRiskDeps(deps).now();
  const [raw] = await executor.execute(sql`
    SELECT o.status, o.mode, o.delivery_date::text AS delivery_date,
           coalesce(ci.iana_zone, c.iana_zone) AS zone
    FROM "order" o
    JOIN country c ON c.id = o.destination_country_id
    LEFT JOIN city ci ON ci.id = o.destination_city_id
    WHERE o.id = ${orderId}
    FOR UPDATE OF o`);
  if (raw === undefined) return done(orderId, "nothing", "order_not_found");
  const order = OrderRow.parse(raw);
  if (order.mode === "demo") return done(orderId, "nothing", "demo");
  const mode = order.mode;

  if (EFW_DEFER_STATES.has(order.status)) {
    return done(orderId, "deferred", order.status);
  }
  if (order.status === "accepted") throw new OrderInHandover();

  if (EFW_CANCEL_STATES.has(order.status)) {
    const cancelled = await deps.cancelOrder(
      orderId,
      RISK_ACTOR,
      "fraud_confirmed",
      { executor },
    );
    if (cancelled.kind !== "cancelled") {
      return done(orderId, "nothing", cancelled.code);
    }
    await addToBlocklist(
      executor,
      await orderHashes(executor, orderId),
      "efw",
      now,
    );
    const open = await executor.execute(sql`
      SELECT id FROM risk_review WHERE order_id = ${orderId} AND status = 'open'`);
    for (const row of open) {
      await closeReview(
        executor,
        z.uuid().parse(row["id"]),
        "auto_cancelled",
        RISK_ACTOR,
        "efw",
        now,
      );
    }
    deps.alert("risk.auto_cancelled", { order_id: orderId, reason: "D2" });
    return done(orderId, "cancelled", "fraud_confirmed");
  }

  const paid = order.status === "paid";
  if (!paid && !EFW_AFTER_PRODUCTION_STATES.has(order.status)) {
    return done(orderId, "nothing", order.status);
  }
  const [existing] = await executor.execute(sql`
    SELECT id FROM risk_review WHERE order_id = ${orderId} AND kind = 'post_routing' LIMIT 1`);
  if (existing !== undefined) {
    return done(orderId, "already_reviewed", order.status);
  }
  if (!paid) {
    const reviewId = await openPostRoutingReview(
      executor,
      orderId,
      mode,
      null,
      now,
    );
    deps.alert("risk.efw_after_routing", {
      order_id: orderId,
      review_id: reviewId,
    });
    return done(orderId, "review_opened", order.status);
  }

  const deadline = postRoutingDeadline(
    deps.productionStartAt({
      deliveryDate: order.delivery_date,
      zone: order.zone,
    }),
    now,
  );
  const reviewId = await openPostRoutingReview(
    executor,
    orderId,
    mode,
    deadline === "decide_now" ? now : deadline,
    now,
  );
  deps.alert("risk.review_opened", {
    order_id: orderId,
    review_id: reviewId,
    outcome: deadline === "decide_now" ? "decide_now" : "open",
  });
  if (deadline !== "decide_now") {
    return done(orderId, "review_opened", order.status);
  }
  const applied = await applyPostRoutingDefault(executor, reviewId, now, {
    cancelOrder: deps.cancelOrder,
    refundBalance: deps.refundBalance,
    alert: deps.alert,
  });
  return applied.refundId === undefined
    ? done(orderId, "nothing", applied.outcome)
    : {
        ...done(orderId, "refunded", applied.outcome),
        refundId: applied.refundId,
      };
}

function done(orderId: string, outcome: EfwOutcome, reason: string): EfwResult {
  logger.info({ order_id: orderId, outcome, reason }, "risk.efw");
  return { outcome };
}
