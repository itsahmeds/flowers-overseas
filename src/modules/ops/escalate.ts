/**
 * `alerts.escalate`, every minute (spec 025 §5.5 "Escalation", "Quiet hours"; AC-8, AC-13 to
 * AC-15, AC-28; TASK-489).
 *
 * One run does, in order:
 *  1. **receipts**: for each P1 emergency push with a receipt and no acknowledgement, at most every
 *     2 minutes, Pushover's receipt endpoint; an acknowledged receipt acknowledges the alert as
 *     `pushover` (no public callback endpoint exists, so there is nothing new to authenticate);
 *  2. **escalation**: a P1 still `open` 15 minutes after its first page gets one escalation email,
 *     and one emergency push to `PUSHOVER_BACKUP_USER_KEY` when that is set;
 *  3. **expiry**: a P1 still `open` 60 minutes after its last page gets one new emergency push,
 *     at most 3 pages per alert in 24 hours (`pages_24h`), after which email only;
 *  4. **bump**: an order alert still open at `act_by` minus 60 minutes rises one level and is
 *     dispatched once as `bump`, under the quiet-hours rule at its new level;
 *  5. **reminder**: a P2 open and unacknowledged for 4 hours, outside quiet hours, gets one push;
 *  6. **held digest**: outside quiet hours, alerts held overnight and still open get **one** grouped
 *     push (priority 2 if any is P1), recorded against each; resolved ones get nothing;
 *  7. **safety net**: an open alert with no notification two minutes after it was raised (its
 *     enqueue failed) is dispatched now;
 *  8. **daily summary**: from 08:00 in the configured zone, `alerts.daily_summary` for today's date
 *     is enqueued (keyed by the date) until it has been sent.
 *
 * `acknowledged` alerts are never selected by 2, 3 or 5: after an acknowledgement nothing more is
 * sent (AC-14).
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import {
  BUMP_BEFORE_ACT_BY_MINUTES,
  DAILY_SUMMARY_HOUR,
  ESCALATE_AFTER_MINUTES,
  EMERGENCY_EXPIRE_SECONDS,
  MAX_PAGES_PER_DAY,
  PUSH_PRIORITY,
  RECEIPT_POLL_MINUTES,
  REMINDER_AFTER_MINUTES,
} from "@/config/alerts";
import { zonedClock } from "@/modules/i18n";

import { acknowledgeAlert } from "./actions.ts";
import { iso, type OpsExecutor } from "./context.ts";
import {
  type DispatchDeps,
  type ResolvedDispatch,
  dispatchAlert,
  factsOf,
  loadAlert,
  messageOptions,
  pushAllowed,
  recordNotification,
  resolveDispatchDeps,
  sendWithRetry,
  settingOf,
} from "./dispatch.ts";
import { opsLog } from "./log.ts";
import {
  buildAlertEmail,
  buildGroupPush,
  buildPushMessage,
} from "./messages.ts";
import { inQuietHours, localDate } from "./quiet-hours.ts";
import { DEFAULT_ALERT_SETTING, type AlertSetting } from "./schemas.ts";

export interface EscalateDeps extends DispatchDeps {
  /** Enqueues `alerts.daily_summary` for `date` (keyed by it). */
  readonly enqueueSummary?: (date: string) => Promise<void>;
}

export interface EscalateCounts {
  readonly receiptsAcknowledged: number;
  readonly escalated: number;
  readonly repaged: number;
  readonly bumped: number;
  readonly reminded: number;
  readonly digested: number;
  readonly redispatched: number;
  readonly summaryEnqueued: boolean;
}

const MINUTE = 60_000;

async function loadSetting(
  executor: OpsExecutor,
): Promise<AlertSetting & { summarySentFor: string | null }> {
  const [row] = await executor.execute(sql`
    SELECT to_char(quiet_start, 'HH24:MI') AS quiet_start, to_char(quiet_end, 'HH24:MI') AS quiet_end,
           time_zone, summary_sent_for::text AS summary_sent_for
      FROM ops_alert_setting WHERE id = 1`);
  if (row === undefined)
    return { ...DEFAULT_ALERT_SETTING, summarySentFor: null };
  return {
    ...settingOf({
      quiet_start:
        typeof row["quiet_start"] === "string" ? row["quiet_start"] : null,
      quiet_end: typeof row["quiet_end"] === "string" ? row["quiet_end"] : null,
      time_zone: typeof row["time_zone"] === "string" ? row["time_zone"] : null,
    }),
    summarySentFor:
      typeof row["summary_sent_for"] === "string"
        ? row["summary_sent_for"]
        : null,
  };
}

const Ids = z.array(z.object({ id: z.uuid() }));

/** 1. Receipts. */
async function pollReceipts(d: ResolvedDispatch, now: Date): Promise<number> {
  if (d.push === null) return 0;
  const due = iso(new Date(now.getTime() - RECEIPT_POLL_MINUTES * MINUTE));
  const rows = await d.transaction((executor) =>
    executor.execute(sql`
      SELECT n.id, n.alert_id, n.provider_ref
        FROM ops_alert_notification n JOIN ops_alert a ON a.id = n.alert_id
       WHERE a.environment = ${d.environment} AND a.status = 'open'
         AND n.channel = 'push' AND n.status = 'sent' AND n.priority = 2
         AND n.provider_ref IS NOT NULL AND n.receipt_acknowledged_at IS NULL
         AND (n.receipt_checked_at IS NULL OR n.receipt_checked_at <= ${due}::timestamptz)
         AND n.created_at > ${iso(new Date(now.getTime() - EMERGENCY_EXPIRE_SECONDS * 1000 - 10 * MINUTE))}::timestamptz
       ORDER BY n.created_at LIMIT 50`),
  );
  let acknowledged = 0;
  for (const row of rows) {
    const id = z.uuid().parse(row["id"]);
    const alertId = z.uuid().parse(row["alert_id"]);
    const status = await d.push.receipt(String(row["provider_ref"]));
    const ackAt = status.ok ? status.acknowledgedAt : null;
    await d.transaction((executor) =>
      executor.execute(sql`
        UPDATE ops_alert_notification
           SET receipt_checked_at = ${iso(now)}::timestamptz,
               receipt_acknowledged_at = ${ackAt === null ? null : iso(ackAt)}::timestamptz
         WHERE id = ${id}`),
    );
    if (ackAt !== null) {
      const changed = await acknowledgeAlert(alertId, "pushover", {
        transaction: d.transaction,
        now: d.now,
        log: d.log,
        environment: d.environment,
      });
      if (changed) acknowledged += 1;
    }
  }
  return acknowledged;
}

/** 2. The 15-minute escalation email and backup page. */
async function escalate(d: ResolvedDispatch, now: Date): Promise<number> {
  const before = iso(new Date(now.getTime() - ESCALATE_AFTER_MINUTES * MINUTE));
  const rows = Ids.parse(
    await d.transaction((executor) =>
      executor.execute(sql`
        SELECT a.id FROM ops_alert a
         WHERE a.environment = ${d.environment} AND a.status = 'open' AND a.severity = 'P1'
           AND EXISTS (SELECT 1 FROM ops_alert_notification n
                        WHERE n.alert_id = a.id AND n.channel = 'push' AND n.status = 'sent'
                          AND n.priority = 2 AND n.recipient = 'primary'
                          AND n.created_at <= ${before}::timestamptz)
           AND NOT EXISTS (SELECT 1 FROM ops_alert_notification e
                            WHERE e.alert_id = a.id AND e.kind = 'escalation' AND e.channel = 'email'
                              AND e.created_at > coalesce(
                                (SELECT max(r.resolved_at) FROM ops_alert r WHERE r.id = a.id), '-infinity'))
         LIMIT 20`),
    ),
  );
  let count = 0;
  for (const { id } of rows) {
    const row = await d.transaction((executor) => loadAlert(executor, id));
    if (row === null) continue;
    const setting = settingOf(row);
    const options = messageOptions(d, setting);
    const facts = factsOf(row, d);
    let to: string | null = null;
    try {
      to = d.opsEmail();
    } catch {
      opsLog(d.log).error(
        {
          alert_id: id,
          channel: "email",
          outcome: "not_configured",
          missing: ["OPS_ALERT_EMAIL"],
        },
        "alerts.email_not_configured",
      );
    }
    let status: "sent" | "failed" | "skipped" = "skipped";
    let ref: string | null = null;
    if (to !== null) {
      try {
        const sent = await d.mailer.send({
          tag: "ops_alert",
          to,
          ...buildAlertEmail(facts, "escalation", options),
          idempotencyKey: `ops_alert:${id}:escalation:${String(row.reopen_count)}`,
        });
        status = "sent";
        ref = sent.providerRef.slice(0, 200);
      } catch {
        status = "failed";
      }
    }
    await d.transaction((executor) =>
      recordNotification(
        executor,
        {
          alertId: id,
          channel: "email",
          kind: "escalation",
          recipient: "email",
          status,
          providerRef: ref,
          ...(status === "skipped"
            ? { skipReason: "not_configured" as const }
            : {}),
          ...(status === "failed" ? { errorClass: "MailerError" } : {}),
        },
        now,
      ),
    );
    if (
      d.push !== null &&
      (await d.transaction((executor) => pushAllowed(executor, d.environment)))
    ) {
      const backup = await sendWithRetry(
        d.push,
        buildPushMessage(facts, 2, options, "backup"),
        d,
        { alertId: id, kind: "escalation" },
      );
      if (backup.ok) {
        await d.transaction((executor) =>
          recordNotification(
            executor,
            {
              alertId: id,
              channel: "push",
              kind: "escalation",
              priority: 2,
              recipient: "backup",
              status: "sent",
              providerRef: backup.ref,
            },
            now,
          ),
        );
      }
    }
    opsLog(d.log).info(
      { alert_id: id, kind: "escalation", outcome: status },
      "alerts.escalated",
    );
    count += 1;
  }
  return count;
}

/** 3. A new emergency page at expiry, within the 24-hour cap. */
async function repage(d: ResolvedDispatch, now: Date): Promise<number> {
  if (d.push === null) return 0;
  if (
    !(await d.transaction((executor) => pushAllowed(executor, d.environment)))
  )
    return 0;
  const expired = iso(
    new Date(now.getTime() - EMERGENCY_EXPIRE_SECONDS * 1000),
  );
  const dayAgo = iso(new Date(now.getTime() - 24 * 60 * MINUTE));
  const rows = Ids.parse(
    await d.transaction((executor) =>
      executor.execute(sql`
        SELECT a.id FROM ops_alert a
         WHERE a.environment = ${d.environment} AND a.status = 'open' AND a.severity = 'P1'
           AND a.last_page_at IS NOT NULL AND a.last_page_at <= ${expired}::timestamptz
           AND (a.last_page_at <= ${dayAgo}::timestamptz OR a.pages_24h < ${MAX_PAGES_PER_DAY})
         LIMIT 20`),
    ),
  );
  let count = 0;
  for (const { id } of rows) {
    const row = await d.transaction((executor) => loadAlert(executor, id));
    if (row === null) continue;
    const options = messageOptions(d, settingOf(row));
    const result = await sendWithRetry(
      d.push,
      buildPushMessage(factsOf(row, d), 2, options),
      d,
      {
        alertId: id,
        kind: "escalation",
      },
    );
    await d.transaction(async (executor) => {
      await recordNotification(
        executor,
        {
          alertId: id,
          channel: "push",
          kind: "escalation",
          priority: 2,
          recipient: "primary",
          status: result.ok ? "sent" : "failed",
          providerRef: result.ok ? result.ref : null,
          errorClass: result.ok ? null : result.errorClass,
        },
        now,
      );
      if (result.ok) {
        await executor.execute(sql`
          UPDATE ops_alert
             SET pages_24h = CASE WHEN last_page_at <= ${dayAgo}::timestamptz THEN 1 ELSE pages_24h + 1 END,
                 last_page_at = ${iso(now)}::timestamptz
           WHERE id = ${id}`);
      }
    });
    if (result.ok) count += 1;
  }
  return count;
}

/** 4. Bump at `act_by` minus 60 minutes, once per level. */
async function bump(
  d: ResolvedDispatch,
  deps: DispatchDeps,
  now: Date,
): Promise<number> {
  const horizon = iso(
    new Date(now.getTime() + BUMP_BEFORE_ACT_BY_MINUTES * MINUTE),
  );
  const rows = Ids.parse(
    await d.transaction((executor) =>
      executor.execute(sql`
        UPDATE ops_alert a
           SET severity = CASE a.severity WHEN 'P3' THEN 'P2' ELSE 'P1' END
         WHERE a.environment = ${d.environment} AND a.status <> 'resolved'
           AND a.order_id IS NOT NULL AND a.act_by IS NOT NULL AND a.severity <> 'P1'
           AND a.act_by <= ${horizon}::timestamptz
           AND NOT EXISTS (SELECT 1 FROM ops_alert_notification n
                            WHERE n.alert_id = a.id AND n.kind = 'bump')
           AND NOT (a.mode = 'test' AND a.severity = 'P2')
        RETURNING a.id`),
    ),
  );
  for (const { id } of rows) {
    await dispatchAlert({ alertId: id, kind: "bump" }, deps);
  }
  return rows.length;
}

/** 5. One reminder push for a P2 open and unacknowledged for 4 hours, outside quiet hours. */
async function remind(
  d: ResolvedDispatch,
  setting: AlertSetting,
  now: Date,
): Promise<number> {
  if (d.push === null || inQuietHours(setting, now)) return 0;
  if (
    !(await d.transaction((executor) => pushAllowed(executor, d.environment)))
  )
    return 0;
  const before = iso(new Date(now.getTime() - REMINDER_AFTER_MINUTES * MINUTE));
  const rows = Ids.parse(
    await d.transaction((executor) =>
      executor.execute(sql`
        SELECT a.id FROM ops_alert a
         WHERE a.environment = ${d.environment} AND a.status = 'open' AND a.severity = 'P2'
           AND a.first_seen_at <= ${before}::timestamptz
           AND NOT EXISTS (SELECT 1 FROM ops_alert_notification n
                            WHERE n.alert_id = a.id AND n.kind = 'reminder')
         LIMIT 20`),
    ),
  );
  let count = 0;
  for (const { id } of rows) {
    const row = await d.transaction((executor) => loadAlert(executor, id));
    if (row === null) continue;
    const result = await sendWithRetry(
      d.push,
      buildPushMessage(
        factsOf(row, d),
        PUSH_PRIORITY.P2,
        messageOptions(d, settingOf(row)),
      ),
      d,
      { alertId: id, kind: "reminder" },
    );
    await d.transaction((executor) =>
      recordNotification(
        executor,
        {
          alertId: id,
          channel: "push",
          kind: "reminder",
          priority: PUSH_PRIORITY.P2,
          recipient: "primary",
          status: result.ok ? "sent" : "failed",
          providerRef: result.ok ? result.ref : null,
          errorClass: result.ok ? null : result.errorClass,
        },
        now,
      ),
    );
    if (result.ok) count += 1;
  }
  return count;
}

/** 6. One grouped push for alerts held overnight and still open (AC-8). */
async function digest(
  d: ResolvedDispatch,
  setting: AlertSetting,
  now: Date,
): Promise<number> {
  if (d.push === null || inQuietHours(setting, now)) return 0;
  const rows = await d.transaction((executor) =>
    executor.execute(sql`
      SELECT a.id, a.severity FROM ops_alert a
       WHERE a.environment = ${d.environment} AND a.status <> 'resolved'
         AND EXISTS (SELECT 1 FROM ops_alert_notification h
                      WHERE h.alert_id = a.id AND h.channel = 'push' AND h.status = 'held'
                        AND h.skip_reason = 'quiet_hours'
                        AND NOT EXISTS (SELECT 1 FROM ops_alert_notification s
                                         WHERE s.alert_id = a.id AND s.channel = 'push'
                                           AND s.status = 'sent' AND s.created_at >= h.created_at))`),
  );
  if (rows.length === 0) return 0;
  const anyP1 = rows.some((row) => row["severity"] === "P1");
  const options = messageOptions(d, setting);
  const result = await sendWithRetry(
    d.push,
    buildGroupPush("held_digest", rows.length, anyP1, options),
    d,
    { alertId: String(rows[0]?.["id"] ?? ""), kind: "held_digest" },
  );
  if (!result.ok) return 0;
  await d.transaction(async (executor) => {
    for (const row of rows) {
      await recordNotification(
        executor,
        {
          alertId: z.uuid().parse(row["id"]),
          channel: "push",
          kind: "held_digest",
          priority: anyP1 ? 2 : 1,
          recipient: "primary",
          status: "sent",
          providerRef: result.ref,
        },
        now,
      );
    }
  });
  opsLog(d.log).info(
    { kind: "held_digest", count: rows.length, outcome: "sent" },
    "alerts.digest",
  );
  return rows.length;
}

/** 7. Alerts whose dispatch enqueue failed. */
async function redispatch(
  d: ResolvedDispatch,
  deps: DispatchDeps,
  now: Date,
): Promise<number> {
  const before = iso(new Date(now.getTime() - 2 * MINUTE));
  const rows = Ids.parse(
    await d.transaction((executor) =>
      executor.execute(sql`
        SELECT a.id FROM ops_alert a
         WHERE a.environment = ${d.environment} AND a.status = 'open'
           AND a.last_seen_at <= ${before}::timestamptz
           AND a.first_seen_at > ${iso(new Date(now.getTime() - 24 * 60 * MINUTE))}::timestamptz
           AND NOT EXISTS (SELECT 1 FROM ops_alert_notification n WHERE n.alert_id = a.id)
         LIMIT 20`),
    ),
  );
  for (const { id } of rows)
    await dispatchAlert({ alertId: id, kind: "raise" }, deps);
  return rows.length;
}

/** One `alerts.escalate` run. */
export async function runEscalation(
  deps: EscalateDeps,
): Promise<EscalateCounts> {
  const d = resolveDispatchDeps(deps, "alerts.escalate");
  const now = d.now();
  const setting = await d.transaction(loadSetting);
  const receiptsAcknowledged = await pollReceipts(d, now);
  const escalated = await escalate(d, now);
  const repaged = await repage(d, now);
  const bumped = await bump(d, deps, now);
  const reminded = await remind(d, setting, now);
  const digested = await digest(d, setting, now);
  const redispatched = await redispatch(d, deps, now);
  let summaryEnqueued = false;
  const today = localDate(now, setting.timeZone);
  if (
    deps.enqueueSummary !== undefined &&
    zonedClock(now, setting.timeZone).hour >= DAILY_SUMMARY_HOUR &&
    setting.summarySentFor !== today
  ) {
    await deps.enqueueSummary(today);
    summaryEnqueued = true;
  }
  return {
    receiptsAcknowledged,
    escalated,
    repaged,
    bumped,
    reminded,
    digested,
    redispatched,
    summaryEnqueued,
  };
}
