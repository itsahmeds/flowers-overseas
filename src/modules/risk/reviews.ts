/**
 * The review decisions (spec 021 §5.2 "Deadline default", "Review actions", §13 Q2; AC-18, AC-20,
 * AC-21, AC-24, AC-25; TASK-494).
 *
 * **Every decision locks the order row first, then the review row, and re-reads both.** A review
 * that is no longer `open` changes nothing and reports what happened; an order that has left the
 * review's allowed states (`paid_unrouted` for `pre_routing`; `accepted` or `paid` for
 * `post_routing`) marks the review `superseded` and nothing else happens. So an approve, the
 * deadline default, a buyer's cancel and a second admin cancel on one order resolve to exactly
 * one outcome (AC-25): the second to take the lock finds the first's result.
 *
 *  - **approve** (admin): `approved`; `order.risk_released` (`outcome: 'approved'`) by
 *    `admin:{id}`, whose `routing` route starts routing (spec 016's `startRouting`).
 *  - **cancel** (admin): spec 013's `cancelOrder(orderId, admin:{id}, 'risk_cancel')`, status
 *    `cancelled`; the `payments` target refunds the captured amount in full, with no provider
 *    fraud reason. **cancel_block** is the same with `fraud_confirmed` (Stripe `fraudulent`) and
 *    the order's email and card hashes on `risk_blocklist` (`source = 'admin'`).
 *  - **the deadline default** (`system:risk.deadline`): a payment with liability shift and a
 *    score under `HIGH_SCORE` is released (`auto_released`); anything else is cancelled with
 *    `risk_cancel` (`auto_cancelled`), never blocked. `risk.review_auto_decided` once.
 *
 * A post-routing review (opened by an early fraud warning, TASK-495) on a `paid` order reads
 * "Keep the order" (approve: `approved`, nothing else) and "Refund in full" (cancel: the order's
 * remaining captured balance through spec 013's refund path with `risk_cancel`, A6 row 31,
 * `cancelled`); its deadline default (`productionStartAt − 60 min`) refunds in full with
 * `fraud_confirmed` (`auto_refunded`). One on an order already being made has no close action:
 * the founder refunds from the order page (orchestrator ruling on the boards, PR 529).
 * Status changes only through spec 013's `cancelOrder` (ADR-0009); this module never calls
 * `transition` and never writes `orders.status` (AC-23).
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { logger } from "@/lib/logger";
import {
  type AlertRaiser,
  appendEvent,
  type OrderExecutor,
} from "@/modules/orders";
import { HIGH_SCORE } from "@/config/risk";

import { addToBlocklist, orderHashes } from "./blocklist.ts";
import type { RiskTransaction } from "./context.ts";
import "./events.ts";

/** The actor of the deadline default (§5.2). */
export const RISK_DEADLINE_ACTOR = "system:risk.deadline";

/** Spec 013's `cancelOrder`, as the risk module calls it (handed in; never imported). */
export type RiskCancel = (
  orderId: string,
  actor: string,
  reason: "risk_cancel" | "fraud_confirmed",
  options: { readonly executor: OrderExecutor },
) => Promise<
  | { readonly kind: "cancelled" }
  | { readonly kind: "refused"; readonly code: string }
>;

/**
 * Spec 013's `requestBalanceRefund` (handed in; never imported): the order's remaining captured
 * balance as one `requested` refund on the caller's transaction. The caller submits it after
 * commit (`submitRefund`); `payments.sweep` (d) recovers a crash in between.
 */
export type RiskRefund = (
  orderId: string,
  actor: string,
  reason: "risk_cancel" | "fraud_confirmed",
  executor: OrderExecutor,
) => Promise<
  | { readonly kind: "requested"; readonly refundId: string }
  | { readonly kind: "refused"; readonly code: string }
>;

/** The admin's three decisions (§5.2 "Review actions"). */
export const REVIEW_DECISIONS = ["approve", "cancel", "cancel_block"] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

/** The reasons an admin may give (`deadline_default` and `superseded` are the system's). */
export const ADMIN_DECISION_REASONS = [
  "looks_genuine",
  "buyer_contacted",
  "card_testing",
  "stolen_card_suspected",
  "blocklist_match",
  "efw",
  "other",
] as const;
export type AdminDecisionReason = (typeof ADMIN_DECISION_REASONS)[number];

/** The reason picklist per decision, as the boards draw it (orchestrator ruling, PR 529). */
export const REASONS_BY_DECISION: Readonly<
  Record<ReviewDecision, readonly AdminDecisionReason[]>
> = {
  approve: ["looks_genuine", "buyer_contacted", "other"],
  cancel: [
    "stolen_card_suspected",
    "card_testing",
    "blocklist_match",
    "efw",
    "buyer_contacted",
    "other",
  ],
  cancel_block: [
    "stolen_card_suspected",
    "card_testing",
    "blocklist_match",
    "efw",
    "buyer_contacted",
    "other",
  ],
};

/** `ReviewDecisionSchema` (§5.2): the posted decision. */
export const ReviewDecisionSchema = z
  .object({
    reviewId: z.uuid(),
    decision: z.enum(REVIEW_DECISIONS),
    reason: z.enum(ADMIN_DECISION_REASONS),
    expectedStatus: z.literal("open"),
  })
  .strict();
export type ReviewDecisionInput = z.infer<typeof ReviewDecisionSchema>;

export const REVIEW_STATUSES = [
  "open",
  "approved",
  "cancelled",
  "auto_released",
  "auto_cancelled",
  "auto_refunded",
  "superseded",
] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/** What a decision did (no personal data: ids and codes). */
export type ReviewDecisionResult =
  | {
      readonly kind: "approved" | "cancelled" | "cancelled_blocked";
      readonly orderId: string;
    }
  | {
      /** A post-routing "Refund in full": the refund row to submit after commit. */
      readonly kind: "refunded";
      readonly orderId: string;
      readonly refundId: string;
    }
  | {
      readonly kind: "already_decided";
      readonly orderId: string;
      readonly status: ReviewStatus;
      readonly decidedAt: Date | null;
    }
  | {
      readonly kind: "superseded";
      readonly orderId: string;
      readonly orderStatus: string;
    }
  | {
      readonly kind: "refused";
      readonly code:
        | "INPUT_INVALID"
        | "REVIEW_NOT_FOUND"
        | "REASON_NOT_ALLOWED"
        | "POST_ROUTING_NO_ACTION"
        | "CANCEL_REFUSED"
        | "REFUND_REFUSED";
    };

const ReviewRow = z.object({
  id: z.uuid(),
  order_id: z.uuid(),
  kind: z.enum(["pre_routing", "post_routing"]),
  status: z.enum(REVIEW_STATUSES),
  decided_at: z
    .union([z.date(), z.string()])
    .nullable()
    .transform((value) =>
      value === null ? null : value instanceof Date ? value : new Date(value),
    ),
  deadline_at: z
    .union([z.date(), z.string()])
    .nullable()
    .transform((value) =>
      value === null ? null : value instanceof Date ? value : new Date(value),
    ),
  score: z.number().int(),
  liability_shift: z.boolean().nullable(),
});
type LockedReview = z.infer<typeof ReviewRow>;

const OrderRow = z.object({
  status: z.string(),
  mode: z.enum(["demo", "test", "live"]),
});

/** The order states a review of `kind` may still act in. */
const ALLOWED_STATES: Readonly<
  Record<LockedReview["kind"], readonly string[]>
> = {
  pre_routing: ["paid_unrouted"],
  post_routing: ["accepted", "paid"],
};

/** Locks the review's order, then the review; re-reads both. `null` for an unknown review. */
async function lockReview(
  executor: OrderExecutor,
  reviewId: string,
): Promise<{
  readonly review: LockedReview;
  readonly order: z.infer<typeof OrderRow>;
} | null> {
  const [owner] = await executor.execute(sql`
    SELECT order_id FROM risk_review WHERE id = ${reviewId}`);
  if (owner === undefined) return null;
  const orderId = z.uuid().parse(owner["order_id"]);
  const [orderRow] = await executor.execute(sql`
    SELECT status, mode FROM "order" WHERE id = ${orderId} FOR UPDATE`);
  const [reviewRow] = await executor.execute(sql`
    SELECT r.id, r.order_id, r.kind, r.status, r.decided_at, r.deadline_at,
           a.score::int AS score, a.liability_shift
    FROM risk_review r JOIN risk_assessment a ON a.id = r.assessment_id
    WHERE r.id = ${reviewId}
    FOR UPDATE OF r`);
  if (orderRow === undefined || reviewRow === undefined) return null;
  return {
    review: ReviewRow.parse(reviewRow),
    order: OrderRow.parse(orderRow),
  };
}

/** Closes an open review (no-op when it is no longer open). */
export async function closeReview(
  executor: OrderExecutor,
  reviewId: string,
  status: Exclude<ReviewStatus, "open">,
  actor: string,
  reason: string,
  now: Date,
): Promise<void> {
  await executor.execute(sql`
    UPDATE risk_review
    SET status = ${status}, decided_at = ${now.toISOString()}::timestamptz,
        decided_by = ${actor}, decision_reason = ${reason}
    WHERE id = ${reviewId} AND status = 'open'`);
}

async function release(
  executor: OrderExecutor,
  review: LockedReview,
  mode: "test" | "live",
  actor: string,
  outcome: "approved" | "auto_released",
): Promise<void> {
  await appendEvent(
    review.order_id,
    "order.risk_released",
    actor,
    { version: 1, mode, review_id: review.id, outcome },
    { executor },
  );
}

export interface DeadlineDefaultDeps {
  readonly cancelOrder: RiskCancel;
  readonly alert: AlertRaiser;
  /** Spec 013's balance refund, for a post-routing deadline (TASK-495). */
  readonly refundBalance?: RiskRefund;
}

export type DeadlineOutcome =
  | "auto_released"
  | "auto_cancelled"
  | "auto_refunded"
  | "superseded"
  | "not_due"
  | "not_open";

/**
 * The deadline default for one `post_routing` review on a `paid` order (§5.2 "After routing",
 * AC-26; TASK-495): one full refund of the remaining captured balance with `fraud_confirmed`
 * (A6 row 31 → `refunded_full`), status `auto_refunded`. An order that has left `paid`, or a
 * refund the engine refuses, supersedes the review. Returns the refund row to submit after commit.
 */
export async function applyPostRoutingDefault(
  executor: OrderExecutor,
  reviewId: string,
  now: Date,
  deps: DeadlineDefaultDeps,
): Promise<{ readonly outcome: DeadlineOutcome; readonly refundId?: string }> {
  const locked = await lockReview(executor, reviewId);
  if (locked === null) return { outcome: "not_open" };
  const { review, order } = locked;
  if (review.status !== "open" || review.kind !== "post_routing") {
    return { outcome: "not_open" };
  }
  if (review.deadline_at === null || review.deadline_at > now) {
    return { outcome: "not_due" };
  }
  const refunded =
    order.status === "paid" &&
    order.mode !== "demo" &&
    deps.refundBalance !== undefined
      ? await deps.refundBalance(
          review.order_id,
          RISK_DEADLINE_ACTOR,
          "fraud_confirmed",
          executor,
        )
      : null;
  if (refunded === null || refunded.kind !== "requested") {
    await closeReview(
      executor,
      review.id,
      "superseded",
      RISK_DEADLINE_ACTOR,
      "superseded",
      now,
    );
    return { outcome: "superseded" };
  }
  await closeReview(
    executor,
    review.id,
    "auto_refunded",
    RISK_DEADLINE_ACTOR,
    "deadline_default",
    now,
  );
  deps.alert("risk.review_auto_decided", {
    order_id: review.order_id,
    review_id: review.id,
    outcome: "auto_refunded",
    score: review.score,
  });
  logger.info(
    {
      order_id: review.order_id,
      review_id: review.id,
      outcome: "auto_refunded",
    },
    "risk.review_auto_decided",
  );
  return { outcome: "auto_refunded", refundId: refunded.refundId };
}

/**
 * The deadline default for one `pre_routing` review (§5.2, §13 Q2), on the caller's transaction:
 * release with liability shift and a score under 70, else cancel and refund (no block).
 */
export async function applyDeadlineDefault(
  executor: OrderExecutor,
  reviewId: string,
  now: Date,
  deps: DeadlineDefaultDeps,
): Promise<DeadlineOutcome> {
  const locked = await lockReview(executor, reviewId);
  if (locked === null) return "not_open";
  const { review, order } = locked;
  if (review.status !== "open" || review.kind !== "pre_routing") {
    return "not_open";
  }
  if (review.deadline_at === null || review.deadline_at > now) return "not_due";
  if (
    !ALLOWED_STATES.pre_routing.includes(order.status) ||
    order.mode === "demo"
  ) {
    await closeReview(
      executor,
      review.id,
      "superseded",
      RISK_DEADLINE_ACTOR,
      "superseded",
      now,
    );
    return "superseded";
  }
  let outcome: DeadlineOutcome;
  if (review.liability_shift === true && review.score < HIGH_SCORE) {
    await closeReview(
      executor,
      review.id,
      "auto_released",
      RISK_DEADLINE_ACTOR,
      "deadline_default",
      now,
    );
    await release(
      executor,
      review,
      order.mode,
      RISK_DEADLINE_ACTOR,
      "auto_released",
    );
    outcome = "auto_released";
  } else {
    const result = await deps.cancelOrder(
      review.order_id,
      RISK_DEADLINE_ACTOR,
      "risk_cancel",
      { executor },
    );
    if (result.kind !== "cancelled") {
      await closeReview(
        executor,
        review.id,
        "superseded",
        RISK_DEADLINE_ACTOR,
        "superseded",
        now,
      );
      return "superseded";
    }
    await closeReview(
      executor,
      review.id,
      "auto_cancelled",
      RISK_DEADLINE_ACTOR,
      "deadline_default",
      now,
    );
    outcome = "auto_cancelled";
  }
  deps.alert("risk.review_auto_decided", {
    order_id: review.order_id,
    review_id: review.id,
    outcome,
    score: review.score,
  });
  logger.info(
    { order_id: review.order_id, review_id: review.id, outcome },
    "risk.review_auto_decided",
  );
  return outcome;
}

export interface DecideReviewDeps {
  /** `admin:{userId}`. */
  readonly actor: string;
  /** The admin-context transaction (`withAdminContext` with `risk.review.<decision>`). */
  readonly transaction: RiskTransaction;
  readonly cancelOrder: RiskCancel;
  /** Spec 013's balance refund, for a post-routing "Refund in full" (TASK-495). */
  readonly refundBalance?: RiskRefund;
  /** Spec 013's `submitRefund`, called after the decision has committed. */
  readonly submitRefund?: (refundId: string) => Promise<void>;
  readonly now?: () => Date;
}

/**
 * One admin decision on one review (the file header). The server action has already called
 * `requirePermission('risk.review')` (and `risk.blocklist` for `cancel_block`).
 */
export async function decideReview(
  input: unknown,
  deps: DecideReviewDeps,
): Promise<ReviewDecisionResult> {
  const parsed = ReviewDecisionSchema.safeParse(input);
  if (!parsed.success) return { kind: "refused", code: "INPUT_INVALID" };
  const { reviewId, decision, reason } = parsed.data;
  if (!REASONS_BY_DECISION[decision].includes(reason)) {
    return { kind: "refused", code: "REASON_NOT_ALLOWED" };
  }
  const now = (deps.now ?? (() => new Date()))();
  const result = await deps.transaction(
    async (executor): Promise<ReviewDecisionResult> => {
      const locked = await lockReview(executor, reviewId);
      if (locked === null) return { kind: "refused", code: "REVIEW_NOT_FOUND" };
      const { review, order } = locked;
      if (review.status !== "open") {
        return {
          kind: "already_decided",
          orderId: review.order_id,
          status: review.status,
          decidedAt: review.decided_at,
        };
      }
      if (
        !ALLOWED_STATES[review.kind].includes(order.status) ||
        order.mode === "demo"
      ) {
        await closeReview(
          executor,
          review.id,
          "superseded",
          deps.actor,
          "superseded",
          now,
        );
        return {
          kind: "superseded",
          orderId: review.order_id,
          orderStatus: order.status,
        };
      }
      if (review.kind === "post_routing") {
        if (decision === "approve") {
          await closeReview(
            executor,
            review.id,
            "approved",
            deps.actor,
            reason,
            now,
          );
          return { kind: "approved", orderId: review.order_id };
        }
        if (
          decision !== "cancel" ||
          order.status !== "paid" ||
          deps.refundBalance === undefined
        ) {
          return { kind: "refused", code: "POST_ROUTING_NO_ACTION" };
        }
        const refunded = await deps.refundBalance(
          review.order_id,
          deps.actor,
          "risk_cancel",
          executor,
        );
        if (refunded.kind !== "requested") {
          return { kind: "refused", code: "REFUND_REFUSED" };
        }
        await closeReview(
          executor,
          review.id,
          "cancelled",
          deps.actor,
          reason,
          now,
        );
        return {
          kind: "refunded",
          orderId: review.order_id,
          refundId: refunded.refundId,
        };
      }
      if (decision === "approve") {
        await closeReview(
          executor,
          review.id,
          "approved",
          deps.actor,
          reason,
          now,
        );
        await release(executor, review, order.mode, deps.actor, "approved");
        return { kind: "approved", orderId: review.order_id };
      }
      const cancelled = await deps.cancelOrder(
        review.order_id,
        deps.actor,
        decision === "cancel_block" ? "fraud_confirmed" : "risk_cancel",
        { executor },
      );
      if (cancelled.kind !== "cancelled") {
        return { kind: "refused", code: "CANCEL_REFUSED" };
      }
      await closeReview(
        executor,
        review.id,
        "cancelled",
        deps.actor,
        reason,
        now,
      );
      if (decision === "cancel_block") {
        await addToBlocklist(
          executor,
          await orderHashes(executor, review.order_id),
          "admin",
          now,
        );
        return { kind: "cancelled_blocked", orderId: review.order_id };
      }
      return { kind: "cancelled", orderId: review.order_id };
    },
  );
  if (result.kind === "refunded" && deps.submitRefund !== undefined) {
    await deps.submitRefund(result.refundId);
  }
  logger.info(
    {
      review_id: reviewId,
      ...("orderId" in result ? { order_id: result.orderId } : {}),
      decision,
      outcome: result.kind,
      reason: result.kind === "refused" ? result.code : reason,
    },
    "risk.review_decided",
  );
  return result;
}

/** Whether `orderId` has an open `pre_routing` review (spec 013's monitor reads the same rule). */
export async function openReviewFor(
  executor: OrderExecutor,
  orderId: string,
): Promise<boolean> {
  const [row] = await executor.execute(sql`
    SELECT EXISTS (SELECT 1 FROM risk_review
                   WHERE order_id = ${orderId} AND kind = 'pre_routing' AND status = 'open')
      AS open`);
  return row?.["open"] === true;
}

/** When the order's hold was last released (`order.risk_released`), or `null`. */
export async function releasedAt(
  executor: OrderExecutor,
  orderId: string,
): Promise<Date | null> {
  const [row] = await executor.execute(sql`
    SELECT max(occurred_at) AS at FROM order_event
    WHERE order_id = ${orderId} AND type = 'order.risk_released'`);
  const at = row?.["at"];
  return at === null || at === undefined
    ? null
    : new Date(String(at instanceof Date ? at.toISOString() : at));
}
