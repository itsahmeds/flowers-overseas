/**
 * `risk.monitor`'s card-testing detector (spec 021 §5.2 "Card-testing detector", §13 Q5, AC-6;
 * TASK-493). Every minute it reads spec 013's attempt counts for the last
 * `CARD_TESTING_WINDOW_MINUTES` through `attemptStats(since, until)` (declined and succeeded
 * attempts, no identifiers). At `CARD_TESTING_MIN_DECLINES` declines or more **and** declines at
 * least half of all attempts it raises `risk.card_testing_suspected` once per window and, in
 * `live` only, writes a `risk_pause` of `CARD_TESTING_PAUSE_MINUTES` (`cause = 'card_testing'`)
 * unless one is active. In `test` it alerts only. Nine declines, or 10 out of 25, do nothing.
 *
 * The deadline defaults and the due-soon alerts join this job with the gate (TASK-494,
 * `runReviewDeadlines` below). Logs carry counts only.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { logger } from "@/lib/logger";
import type { AlertRaiser } from "@/modules/orders";
import {
  CARD_TESTING_DECLINE_SHARE,
  CARD_TESTING_MIN_DECLINES,
  CARD_TESTING_PAUSE_MINUTES,
  CARD_TESTING_WINDOW_MINUTES,
  REVIEW_DUE_SOON_MS,
} from "@/config/risk";

import { type RiskDeps, resolveRiskDeps } from "./context.ts";
import { activePause } from "./prepay.ts";
import {
  applyDeadlineDefault,
  applyPostRoutingDefault,
  type DeadlineDefaultDeps,
} from "./reviews.ts";

/** Declined and succeeded payment attempts in a window (spec 013's `attemptStats`). */
export interface AttemptStats {
  readonly declined: number;
  readonly succeeded: number;
}

/** Whether `stats` look like card testing (the file header). Pure. */
export function cardTestingSuspected(stats: AttemptStats): boolean {
  const attempts = stats.declined + stats.succeeded;
  return (
    stats.declined >= CARD_TESTING_MIN_DECLINES &&
    stats.declined * CARD_TESTING_DECLINE_SHARE.denominator >=
      attempts * CARD_TESTING_DECLINE_SHARE.numerator
  );
}

export interface CardTestingDeps extends RiskDeps {
  /** `live` writes the pause; `test` alerts only. */
  readonly mode: "test" | "live";
  readonly attemptStats: (since: Date, until: Date) => Promise<AttemptStats>;
  readonly alert: AlertRaiser;
}

export interface CardTestingOutcome {
  readonly suspected: boolean;
  readonly alerted: boolean;
  readonly paused: boolean;
}

const WINDOW_MS = CARD_TESTING_WINDOW_MINUTES * 60_000;

/** One run of the detector (the file header). */
export async function detectCardTesting(
  deps: CardTestingDeps,
): Promise<CardTestingOutcome> {
  const d = resolveRiskDeps(deps);
  const now = d.now();
  const stats = await deps.attemptStats(
    new Date(now.getTime() - WINDOW_MS),
    now,
  );
  if (!cardTestingSuspected(stats)) {
    return { suspected: false, alerted: false, paused: false };
  }
  const { alreadyPaused, paused } = await d.transaction(async (executor) => {
    const active = await activePause(executor, now);
    if (active || deps.mode !== "live")
      return { alreadyPaused: active, paused: false };
    const ends = new Date(now.getTime() + CARD_TESTING_PAUSE_MINUTES * 60_000);
    await executor.execute(sql`
      INSERT INTO risk_pause (cause, starts_at, ends_at, created_at)
      VALUES ('card_testing', ${now.toISOString()}::timestamptz,
              ${ends.toISOString()}::timestamptz, ${now.toISOString()}::timestamptz)`);
    return { alreadyPaused: false, paused: true };
  });
  // One alert per window: in `live` a burst the pause already answers raises nothing new; in
  // `test` the alert log's own deduplication keeps one open alert (spec 025 §5.4).
  const alerted = !alreadyPaused;
  if (alerted) {
    deps.alert("risk.card_testing_suspected", {
      count: stats.declined,
      window_minutes: CARD_TESTING_WINDOW_MINUTES,
      mode: deps.mode,
    });
  }
  logger.info(
    {
      job: "risk.monitor",
      mode: deps.mode,
      count: stats.declined,
      window_minutes: CARD_TESTING_WINDOW_MINUTES,
      outcome: paused ? "paused" : alerted ? "alerted" : "already_paused",
    },
    "risk.card_testing",
  );
  return { suspected: true, alerted, paused };
}

export interface ReviewDeadlineDeps extends RiskDeps, DeadlineDefaultDeps {
  /** Spec 013's `submitRefund`, after a post-routing default's transaction commits (TASK-495). */
  readonly submitRefund?: (refundId: string) => Promise<void>;
}

export interface ReviewDeadlineCounts {
  readonly dueSoon: number;
  readonly decided: number;
}

const ReviewIdRow = z.object({ id: z.uuid(), order_id: z.uuid() });
const DueReviewRow = ReviewIdRow.extend({
  kind: z.enum(["pre_routing", "post_routing"]),
});

/**
 * `risk.monitor`'s deadline half (spec 021 §5.2 "Deadline default", §11; AC-18; TASK-494): every
 * open `pre_routing` review whose deadline has passed gets the default (and every open
 * `post_routing` one with a deadline its full refund, AC-26, TASK-495, submitted after commit), each in its own
 * transaction (`applyDeadlineDefault` locks and re-reads, so a re-run or a concurrent admin
 * decision finds it decided); every open review within `REVIEW_DUE_SOON_MS` of its deadline
 * raises `risk.review_due_soon` once (`due_soon_alerted_at`). Idempotent.
 */
export async function runReviewDeadlines(
  deps: ReviewDeadlineDeps,
): Promise<ReviewDeadlineCounts> {
  const d = resolveRiskDeps(deps);
  const now = d.now();
  const at = now.toISOString();
  const soon = new Date(now.getTime() + REVIEW_DUE_SOON_MS).toISOString();
  const dueSoon = await d.transaction(async (executor) =>
    (
      await executor.execute(sql`
        UPDATE risk_review SET due_soon_alerted_at = ${at}::timestamptz
        WHERE status = 'open' AND due_soon_alerted_at IS NULL
          AND deadline_at IS NOT NULL
          AND deadline_at <= ${soon}::timestamptz AND deadline_at > ${at}::timestamptz
        RETURNING id, order_id`)
    ).map((row) => ReviewIdRow.parse(row)),
  );
  for (const review of dueSoon) {
    deps.alert("risk.review_due_soon", {
      order_id: review.order_id,
      review_id: review.id,
    });
  }
  const due = await d.transaction(async (executor) =>
    (
      await executor.execute(sql`
        SELECT id, order_id, kind FROM risk_review
        WHERE status = 'open' AND deadline_at <= ${at}::timestamptz
        ORDER BY deadline_at, id`)
    ).map((row) => DueReviewRow.parse(row)),
  );
  let decided = 0;
  for (const review of due) {
    if (review.kind === "post_routing") {
      const result = await d.transaction((executor) =>
        applyPostRoutingDefault(executor, review.id, now, deps),
      );
      if (result.refundId !== undefined) {
        decided += 1;
        await deps.submitRefund?.(result.refundId);
      }
      continue;
    }
    const outcome = await d.transaction((executor) =>
      applyDeadlineDefault(executor, review.id, now, deps),
    );
    if (outcome === "auto_released" || outcome === "auto_cancelled") {
      decided += 1;
    }
  }
  if (dueSoon.length > 0 || decided > 0) {
    logger.info(
      { job: "risk.monitor", count: decided, outcome: "deadlines" },
      "risk.deadlines",
    );
  }
  return { dueSoon: dueSoon.length, decided };
}
