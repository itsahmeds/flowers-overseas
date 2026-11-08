/**
 * `risk.monitor`'s card-testing detector (spec 021 §5.2 "Card-testing detector", §13 Q5, AC-6;
 * TASK-493). Every minute it reads spec 013's attempt counts for the last
 * `CARD_TESTING_WINDOW_MINUTES` through `attemptStats(since, until)` (declined and succeeded
 * attempts, no identifiers). At `CARD_TESTING_MIN_DECLINES` declines or more **and** declines at
 * least half of all attempts it raises `risk.card_testing_suspected` once per window and, in
 * `live` only, writes a `risk_pause` of `CARD_TESTING_PAUSE_MINUTES` (`cause = 'card_testing'`)
 * unless one is active. In `test` it alerts only. Nine declines, or 10 out of 25, do nothing.
 *
 * The deadline defaults, the due-soon alerts and the site velocity alert join this job with the
 * gate (TASK-494). Logs carry counts only.
 */
import { sql } from "drizzle-orm";

import { logger } from "@/lib/logger";
import type { AlertRaiser } from "@/modules/orders";
import {
  CARD_TESTING_DECLINE_SHARE,
  CARD_TESTING_MIN_DECLINES,
  CARD_TESTING_PAUSE_MINUTES,
  CARD_TESTING_WINDOW_MINUTES,
} from "@/config/risk";

import { type RiskDeps, resolveRiskDeps } from "./context.ts";
import { activePause } from "./prepay.ts";

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
