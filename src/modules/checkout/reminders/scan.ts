/**
 * The scan and the automatic pause (spec 034 §5.2 "Jobs"; AC-2, AC-5, AC-25, AC-28; TASK-450).
 *
 * `scanAbandonedBaskets` runs every 10 minutes: with the flag off or either env key missing it
 * logs `basket_reminder.scan_refused {reason}` and stops (one Sentry event for missing env).
 * Otherwise it selects the drafts `isAbandoned` holds for and that have no reminder yet, inserts one
 * `scheduled` row each (`ON CONFLICT DO NOTHING`, so a second run inserts nothing and a draft never
 * gets a second reminder, AC-5) and enqueues `basket-reminders.send` keyed by the reminder. Then it
 * runs `autoPauseCheck`.
 *
 * `autoPauseCheck` turns the flag off, never on, when over the last 7 days at least 50 reminders
 * were sent and complaints exceed 0.3 % or bounces 4 % (AC-25).
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import {
  ABANDON_AFTER_MS,
  AUTO_PAUSE,
  BASKET_REMINDER_MAX,
  SEND_LATEST_MS,
} from "@/config/basket-reminders";
import { basketReminderEnv } from "@/lib/env.basket-reminders";
import type { EnvSource } from "@/lib/env.schema";
import type { Logger } from "@/lib/logger";
import type { OrderExecutor } from "@/modules/orders";

import { isAbandoned } from "./eligibility";
import type { ReminderFlagReader } from "./offer";

export interface ScanDeps {
  readonly executor: OrderExecutor;
  readonly readFlag: ReminderFlagReader;
  readonly env: EnvSource;
  readonly enqueueSend: (reminderId: string) => Promise<void>;
  readonly log: Logger;
  /** Sentry: one event for a refusal on missing env (AC-28). */
  readonly captureMessage: (
    message: string,
    tags: Record<string, string>,
  ) => void;
  /** Turns the flag off with the auto-pause actor (spec 012's flag service). */
  readonly pauseFlag: () => Promise<void>;
  readonly raiseAlert: (tags: Record<string, string>) => void;
}

export type ScanResult =
  | { readonly refused: "flag_off" | "env" }
  | { readonly scheduled: number; readonly paused: boolean };

const CandidateRow = z.object({
  id: z.uuid(),
  locale_code: z.string(),
  purchase_id: z.uuid().nullable(),
  buyer_saved: z.boolean(),
  email: z.string().nullable(),
  consent_at: z.coerce.date().nullable(),
  last_activity_at: z.coerce.date(),
  line_count: z.coerce.number().int(),
});

export async function scanAbandonedBaskets(
  now: Date,
  deps: ScanDeps,
): Promise<ScanResult> {
  const started = Date.now();
  let flag = false;
  try {
    flag = await deps.readFlag();
  } catch {
    flag = false;
  }
  if (!flag) {
    deps.log.info({ reason: "flag_off" }, "basket_reminder.scan_refused");
    return { refused: "flag_off" };
  }
  if (!basketReminderEnv(deps.env).configured) {
    deps.log.warn({ reason: "env" }, "basket_reminder.scan_refused");
    deps.captureMessage("basket_reminder.scan_refused", { reason: "env" });
    return { refused: "env" };
  }
  const earliest = new Date(now.getTime() - SEND_LATEST_MS).toISOString();
  const latest = new Date(now.getTime() - ABANDON_AFTER_MS).toISOString();
  const rows = await deps.executor.execute(sql`
    SELECT d.id, d.locale_code, d.purchase_id, d.buyer_saved, d.buyer ->> 'email' AS email,
           d.reminder_consent_at AS consent_at, d.last_activity_at,
           (SELECT count(*) FROM checkout_draft_line l WHERE l.draft_id = d.id) AS line_count
      FROM checkout_draft d
     WHERE d.mode = 'live' AND d.purchase_id IS NULL AND d.reminder_consent_at IS NOT NULL
       AND d.last_activity_at BETWEEN ${earliest}::timestamptz AND ${latest}::timestamptz
       AND NOT EXISTS (SELECT 1 FROM basket_reminder r
                        WHERE r.draft_id = d.id AND r.sequence <= ${BASKET_REMINDER_MAX})`);
  let scheduled = 0;
  for (const raw of rows) {
    const row = CandidateRow.parse(raw);
    const eligible = isAbandoned(
      {
        mode: "live",
        purchaseId: row.purchase_id,
        lineCount: row.line_count,
        buyerSaved: row.buyer_saved,
        email: row.email,
        reminderConsentAt: row.consent_at,
        lastActivityAt: row.last_activity_at,
      },
      now,
    );
    if (!eligible) continue;
    const inserted = await deps.executor.execute(sql`
      INSERT INTO basket_reminder (draft_id, sequence, locale_code, status, scheduled_for)
      VALUES (${row.id}, 1, ${row.locale_code}, 'scheduled', ${now.toISOString()}::timestamptz)
      ON CONFLICT (draft_id, sequence) DO NOTHING
      RETURNING id`);
    const id = z.object({ id: z.uuid() }).safeParse(inserted[0]);
    if (!id.success) continue;
    scheduled += 1;
    deps.log.info(
      { reminder_id: id.data.id, draft_id: row.id },
      "basket_reminder.scheduled",
    );
    await deps.enqueueSend(id.data.id);
  }
  const paused = await autoPauseCheck(now, deps);
  deps.log.info(
    { scheduled, duration_ms: Date.now() - started },
    "basket_reminder.scan",
  );
  return { scheduled, paused };
}

const RatesRow = z.object({
  sent: z.coerce.number().int(),
  complained: z.coerce.number().int(),
  bounced: z.coerce.number().int(),
});

/** The pause decision alone (pure), so the thresholds are tested without a database (AC-25). */
export function shouldAutoPause(counts: z.infer<typeof RatesRow>): boolean {
  if (counts.sent < AUTO_PAUSE.minSends) return false;
  return (
    counts.complained / counts.sent > AUTO_PAUSE.complaintRate ||
    counts.bounced / counts.sent > AUTO_PAUSE.bounceRate
  );
}

/** Turns the flag off when the trailing window crosses a threshold; never turns it on (AC-25). */
export async function autoPauseCheck(
  now: Date,
  deps: Pick<ScanDeps, "executor" | "log" | "pauseFlag" | "raiseAlert">,
): Promise<boolean> {
  const since = new Date(
    now.getTime() - AUTO_PAUSE.windowDays * 86_400_000,
  ).toISOString();
  const [raw] = await deps.executor.execute(sql`
    SELECT count(*) AS sent,
           count(*) FILTER (WHERE delivery_status = 'complained') AS complained,
           count(*) FILTER (WHERE delivery_status = 'bounced') AS bounced
      FROM basket_reminder r
     WHERE r.status = 'sent' AND r.sent_at >= ${since}::timestamptz`);
  const counts = RatesRow.parse(raw ?? { sent: 0, complained: 0, bounced: 0 });
  if (!shouldAutoPause(counts)) return false;
  await deps.pauseFlag();
  deps.log.warn({ reason: "auto_pause" }, "basket_reminder.paused");
  deps.raiseAlert({ alert: "basket_reminders.paused" });
  return true;
}
