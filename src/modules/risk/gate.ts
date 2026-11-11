/**
 * The risk gate before routing (spec 021 §5.2 "The risk gate", "Acting on a decision"; AC-7,
 * AC-11, AC-15, AC-16; TASK-494). `riskGatedRouting(inner, deps)` wraps spec 016's `routing`
 * outbox handler, which does not change: the worker registers
 * `routing: riskGatedRouting(routingHandler)`.
 *
 * For `test` and `live` orders, on the delivery's own transaction:
 *
 *  - `order.captured` from `placed` to `paid_unrouted` (A6 row 2): `assess`, then act;
 *  - every other event, row 14's `order.captured` and `order.risk_released` included, goes to
 *    `inner` unchanged (spec 016 routes a released order exactly as row 2, `startRouting`);
 *  - a `demo` order is never assessed (it has no outbox row anyway).
 *
 * Acting, with `risk.gate` on: **pass** calls `inner` once; **hold** opens one `pre_routing`
 * review under the order's row lock, appends `order.risk_held` by `system:risk` and raises
 * `risk.review_opened` (a `decide_now` deadline applies the default at once); **cancel** calls
 * spec 013's `cancelOrder(orderId, 'system:risk', 'fraud_confirmed')`, puts the order's email and
 * card hashes on the blocklist for D2 (`source = 'efw'`; a D1 entry is left as it is) and raises
 * `risk.auto_cancelled`. With `risk.gate` off (shadow mode) the assessment is recorded with
 * `enforced = false` and the order goes to `inner` whatever the decision.
 *
 * A delivery that runs again for an order already assessed at this stage does not assess twice:
 * a recorded pass (or shadow) goes to `inner`, a hold or cancel does nothing more. This module
 * never calls `transition` and never writes `orders.status` (ADR-0009, AC-23).
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { logger } from "@/lib/logger";
import type {
  AlertRaiser,
  OrderExecutor,
  OutboxHandler,
  RoutingDestination,
} from "@/modules/orders";
import { appendEvent } from "@/modules/orders";
import { RISK_FLAGS } from "@/config/risk";

import { type Assessment, assess, type RiskFactsSource } from "./assess.ts";
import { RISK_ACTOR, type RiskDeps, resolveRiskDeps } from "./context.ts";
import { reviewDeadline } from "./deadline.ts";
import "./events.ts";
import { addToBlocklist } from "./blocklist.ts";
import { applyDeadlineDefault, type RiskCancel } from "./reviews.ts";

/** What the job layer hands the gate (this module never imports payments). */
export interface GateDeps extends RiskDeps {
  /** Spec 013's `riskFactsFor`, bound to the provider. */
  readonly riskFactsFor: RiskFactsSource;
  /** Spec 013's `cancelOrder`. */
  readonly cancelOrder: RiskCancel;
  readonly alert: AlertRaiser;
  readonly sleep?: (ms: number) => Promise<void>;
}

const DUE_SOON_MS = 60 * 60_000;

const HeldOrderRow = z.object({
  status: z.string(),
  delivery_date: z.string(),
  iana_zone: z.string().nullable(),
  same_day_cutoff_local: z.string().nullable(),
});

const PriorRow = z.object({
  id: z.uuid(),
  decision: z.enum(["pass", "hold", "cancel"]),
  enforced: z.boolean(),
});

/** The routing-stage assessment already recorded for `orderId`, if any. */
async function priorAssessment(
  executor: OrderExecutor,
  orderId: string,
): Promise<z.infer<typeof PriorRow> | null> {
  const [row] = await executor.execute(sql`
    SELECT id, decision, enforced FROM risk_assessment
    WHERE order_id = ${orderId} AND stage = 'routing'
    ORDER BY created_at DESC, id DESC LIMIT 1`);
  return row === undefined ? null : PriorRow.parse(row);
}

/** Opens the review and appends `order.risk_held` (§5.2 "hold"), under the order's lock. */
async function hold(
  executor: OrderExecutor,
  assessment: Assessment,
  deps: GateDeps,
  now: Date,
): Promise<void> {
  const [raw] = await executor.execute(sql`
    SELECT o.status, o.delivery_date::text AS delivery_date,
           coalesce(ci.iana_zone, c.iana_zone) AS iana_zone,
           to_char(c.same_day_cutoff_local, 'HH24:MI') AS same_day_cutoff_local
    FROM "order" o
    JOIN country c ON c.id = o.destination_country_id
    LEFT JOIN city ci ON ci.id = o.destination_city_id
    WHERE o.id = ${assessment.orderId}
    FOR UPDATE OF o`);
  const order = HeldOrderRow.parse(raw);
  if (order.status !== "paid_unrouted") return;
  const destination: RoutingDestination | null =
    order.iana_zone === null || order.same_day_cutoff_local === null
      ? null
      : ({
          ianaZone: order.iana_zone,
          sameDayCutoffLocal: order.same_day_cutoff_local,
        } as RoutingDestination);
  // A destination with no agreed operations has no routing deadline: the longest hold applies.
  const deadline =
    destination === null
      ? new Date(now.getTime() + 12 * 60 * 60_000)
      : reviewDeadline({ deliveryDate: order.delivery_date, destination }, now);
  const decideNow = deadline === "decide_now";
  const deadlineAt = decideNow ? now : deadline;
  const [review] = await executor.execute(sql`
    INSERT INTO risk_review (order_id, assessment_id, kind, status, recommendation, deadline_at,
                             created_at)
    VALUES (${assessment.orderId}, ${assessment.id}, 'pre_routing', 'open',
            ${assessment.high ? "cancel" : "approve"}, ${deadlineAt.toISOString()}::timestamptz,
            ${now.toISOString()}::timestamptz)
    RETURNING id`);
  const reviewId = z.uuid().parse(review?.["id"]);
  await appendEvent(
    assessment.orderId,
    "order.risk_held",
    RISK_ACTOR,
    {
      version: 1,
      mode: assessment.mode,
      review_id: reviewId,
      score: assessment.score,
      rules_version: assessment.rulesVersion,
    },
    { executor },
  );
  deps.alert("risk.review_opened", {
    order_id: assessment.orderId,
    review_id: reviewId,
    score: assessment.score,
    outcome:
      deadlineAt.getTime() - now.getTime() < DUE_SOON_MS
        ? "under_60_minutes"
        : "open",
  });
  logger.info(
    {
      order_id: assessment.orderId,
      review_id: reviewId,
      decision: "hold",
      score: assessment.score,
    },
    "risk.held",
  );
  if (decideNow) {
    await applyDeadlineDefault(executor, reviewId, now, deps);
  }
}

/** Cancels and refunds on a decisive signal (§5.2 "cancel"). */
async function decisiveCancel(
  executor: OrderExecutor,
  assessment: Assessment,
  deps: GateDeps,
  now: Date,
): Promise<void> {
  const result = await deps.cancelOrder(
    assessment.orderId,
    RISK_ACTOR,
    "fraud_confirmed",
    { executor },
  );
  if (result.kind !== "cancelled") {
    logger.warn(
      {
        order_id: assessment.orderId,
        decision: "cancel",
        reason: result.code,
      },
      "risk.cancel_refused",
    );
    return;
  }
  if (assessment.decisive === "D2") {
    await addToBlocklist(executor, assessment.hashes, "efw", now);
  }
  deps.alert("risk.auto_cancelled", {
    order_id: assessment.orderId,
    reason: assessment.decisive ?? "decisive",
  });
}

/** The gate for one row 2 delivery (the file header). Returns whether `inner` should run. */
async function gate(
  orderId: string,
  executor: OrderExecutor,
  deps: GateDeps,
): Promise<boolean> {
  const d = resolveRiskDeps(deps);
  const prior = await priorAssessment(executor, orderId);
  if (prior !== null) return !prior.enforced || prior.decision === "pass";
  const enforced = await d.flag(RISK_FLAGS.gate);
  const strict = await d.flag(RISK_FLAGS.strict);
  const now = d.now();
  const assessment = await assess(executor, orderId, {
    now,
    hashKey: d.hashKey(),
    strict,
    enforced,
    riskFactsFor: deps.riskFactsFor,
    ...(deps.sleep === undefined ? {} : { sleep: deps.sleep }),
  });
  if (assessment === null) return true;
  if (!enforced || assessment.decision === "pass") return true;
  if (assessment.decision === "hold") {
    await hold(executor, assessment, deps, now);
    return false;
  }
  await decisiveCancel(executor, assessment, deps, now);
  return false;
}

/** `routing: riskGatedRouting(routingHandler)` (the file header). */
export function riskGatedRouting(
  inner: OutboxHandler,
  deps: GateDeps,
): OutboxHandler {
  return async (event, context) => {
    const rowTwo =
      event.type === "order.captured" &&
      event.fromStatus === "placed" &&
      event.toStatus === "paid_unrouted";
    if (event.mode === "demo" || !rowTwo) {
      await inner(event, context);
      return;
    }
    if (await gate(event.orderId, context.executor, deps)) {
      await inner(event, context);
    }
  };
}
