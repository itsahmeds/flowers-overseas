/**
 * `alerts.daily_summary` (spec 025 §5.2, §11 "Metrics in the summary", §13 Q9; AC-28; TASK-489).
 *
 * One email per local date at 08:00 in the configured zone, sent every day including a day with
 * no alert (a missing email is how a dead email path is noticed). It lists the open alerts (name,
 * severity, reference or component, age), the alerts raised and resolved in 24 hours by severity,
 * the orders due today and tomorrow with how many carry an open order alert, the monitor's last
 * run, whether push is configured (missing keys by name), the last push sent, Pushover's messages
 * remaining when known, Neon usage, `fxAsOf`, the last backup verified, the last test alert
 * acknowledged, and the alerts capped at 3 pages. Built from ids, counts, references and instants
 * only, so the PII scan over it finds nothing.
 *
 * `ops_alert_setting.summary_sent_for` records the date sent: a second run for the same date sends
 * nothing. After sending, `ALERT_SUMMARY_HEARTBEAT_URL` is pinged when set.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { MAX_PAGES_PER_DAY } from "@/config/alerts";
import { alertSummaryHeartbeatUrl } from "@/lib/env.alerts";
import {
  formatDate,
  formatNumber,
  formatPercentFromBasisPoints,
} from "@/modules/i18n";

import { iso } from "./context.ts";
import {
  type DispatchDeps,
  type ResolvedDispatch,
  resolveDispatchDeps,
  settingOf,
} from "./dispatch.ts";
import {
  heartbeat,
  lastMonitorCompletion,
  type QueueReader,
} from "./heartbeat.ts";
import { opsLog } from "./log.ts";
import { isAlertName, alertTitleKey } from "./registry.ts";

export interface SummaryDeps extends DispatchDeps {
  readonly queue?: QueueReader;
  /** `/api/health`'s `fxAsOf` (the catalogue's current snapshot), handed in by the worker. */
  readonly fxAsOf?: () => string | null;
  readonly summaryHeartbeatUrl?: string | undefined;
  readonly fetch?: typeof fetch;
}

export interface SummaryResult {
  readonly sent: boolean;
  readonly reason?: "already_sent" | "not_configured" | "failed";
  readonly text?: string;
}

const LOCALE = "en" as const;

const OpenRow = z.object({
  id: z.uuid(),
  name: z.string(),
  severity: z.enum(["P1", "P2", "P3"]),
  order_id: z.uuid().nullable(),
  component: z.string().nullable(),
  first_seen_at: z.coerce.date(),
  pages_24h: z.number().int(),
});

function age(from: Date, now: Date, t: ResolvedDispatch["t"]): string {
  const minutes = Math.max(
    0,
    Math.round((now.getTime() - from.getTime()) / 60_000),
  );
  if (minutes < 60) {
    return t("admin.alerts.summary.ageMinutes", {
      count: formatNumber(minutes, LOCALE),
    });
  }
  const hours = Math.round(minutes / 60);
  if (hours < 48) {
    return t("admin.alerts.summary.ageHours", {
      count: formatNumber(hours, LOCALE),
    });
  }
  return t("admin.alerts.summary.ageDays", {
    count: formatNumber(Math.round(hours / 24), LOCALE),
  });
}

function when(at: Date | null, zone: string, d: ResolvedDispatch): string {
  return at === null
    ? d.t("admin.alerts.summary.never")
    : formatDate(at, LOCALE, "dayMonthTime", zone);
}

const dateOrNull = z.coerce.date().nullable();

/** One summary for local `date`. */
export async function runDailySummary(
  date: string,
  deps: SummaryDeps,
): Promise<SummaryResult> {
  const d = resolveDispatchDeps(deps, "alerts.daily_summary");
  const log = opsLog(d.log);
  const now = d.now();
  const facts = await d.transaction(async (executor) => {
    const [setting] = await executor.execute(sql`
      SELECT to_char(quiet_start, 'HH24:MI') AS quiet_start, to_char(quiet_end, 'HH24:MI') AS quiet_end,
             time_zone, summary_sent_for::text AS summary_sent_for
        FROM ops_alert_setting WHERE id = 1`);
    const open = await executor.execute(sql`
      SELECT id, name, severity, order_id, component, first_seen_at, pages_24h FROM ops_alert
       WHERE environment = ${d.environment} AND status <> 'resolved'
       ORDER BY severity, first_seen_at`);
    const since = iso(new Date(now.getTime() - 24 * 3_600_000));
    const counts = await executor.execute(sql`
      SELECT severity,
             count(*) FILTER (WHERE first_seen_at > ${since}::timestamptz)::int AS raised,
             count(*) FILTER (WHERE resolved_at > ${since}::timestamptz)::int AS resolved
        FROM ops_alert WHERE environment = ${d.environment} GROUP BY severity`);
    const [orders] = await executor.execute(sql`
      SELECT count(*) FILTER (WHERE o.delivery_date = ${date}::date)::int AS today,
             count(*) FILTER (WHERE o.delivery_date = ${date}::date + 1)::int AS tomorrow,
             count(*) FILTER (WHERE o.delivery_date = ${date}::date AND EXISTS (
               SELECT 1 FROM ops_alert a WHERE a.order_id = o.id AND a.status <> 'resolved'))::int AS today_at_risk,
             count(*) FILTER (WHERE o.delivery_date = ${date}::date + 1 AND EXISTS (
               SELECT 1 FROM ops_alert a WHERE a.order_id = o.id AND a.status <> 'resolved'))::int AS tomorrow_at_risk
        FROM "order" o
       WHERE o.mode IN ('test', 'live') AND o.delivery_date IN (${date}::date, ${date}::date + 1)
         AND o.status NOT IN ('placed', 'payment_failed', 'abandoned', 'cancelled', 'cancelled_refunded')`);
    const [last] = await executor.execute(sql`
      SELECT (SELECT max(n.created_at) FROM ops_alert_notification n JOIN ops_alert a ON a.id = n.alert_id
               WHERE a.environment = ${d.environment} AND n.channel = 'push' AND n.status = 'sent') AS last_push,
             (SELECT max(acknowledged_at) FROM ops_alert
               WHERE environment = ${d.environment} AND name = 'alerts.test') AS last_test,
             (SELECT round(100.0 * compute_seconds_used / greatest(compute_seconds_cap, 1), 1)
                FROM db_usage_sample ORDER BY captured_at DESC LIMIT 1) AS neon_percent`);
    return { setting, open, counts, orders, last };
  });

  const setting = settingOf({
    quiet_start:
      typeof facts.setting?.["quiet_start"] === "string"
        ? facts.setting["quiet_start"]
        : null,
    quiet_end:
      typeof facts.setting?.["quiet_end"] === "string"
        ? facts.setting["quiet_end"]
        : null,
    time_zone:
      typeof facts.setting?.["time_zone"] === "string"
        ? facts.setting["time_zone"]
        : null,
  });
  if (facts.setting?.["summary_sent_for"] === date) {
    return { sent: false, reason: "already_sent" };
  }
  const zone = setting.timeZone;
  const t = d.t;
  const open = facts.open.map((row) => OpenRow.parse(row));
  const bySeverity = (column: "raised" | "resolved") => {
    const value = (severity: string) =>
      String(
        Number(
          facts.counts.find((row) => row["severity"] === severity)?.[column] ??
            0,
        ),
      );
    return { p1: value("P1"), p2: value("P2"), p3: value("P3") };
  };
  const monitorAt =
    deps.queue === undefined ? null : await lastMonitorCompletion(deps.queue);
  const fxAsOf = deps.fxAsOf?.() ?? null;
  const neon = facts.last?.["neon_percent"];
  const lines: string[] = [];
  lines.push(t("admin.alerts.summary.open"));
  if (open.length === 0) lines.push(t("admin.alerts.summary.allClear"));
  for (const row of open) {
    lines.push(
      t("admin.alerts.summary.openLine", {
        severity: row.severity,
        title: isAlertName(row.name) ? t(alertTitleKey(row.name)) : row.name,
        subject:
          row.order_id !== null
            ? d.reference(row.order_id)
            : t(`admin.alerts.component.${row.component ?? "alerts"}`),
        age: age(row.first_seen_at, now, t),
      }),
    );
  }
  lines.push("", t("admin.alerts.summary.last24h"));
  lines.push(t("admin.alerts.summary.raised", bySeverity("raised")));
  lines.push(t("admin.alerts.summary.resolvedCount", bySeverity("resolved")));
  lines.push(
    t("admin.alerts.summary.orders", {
      today: String(Number(facts.orders?.["today"] ?? 0)),
      todayAtRisk: String(Number(facts.orders?.["today_at_risk"] ?? 0)),
      tomorrow: String(Number(facts.orders?.["tomorrow"] ?? 0)),
      tomorrowAtRisk: String(Number(facts.orders?.["tomorrow_at_risk"] ?? 0)),
    }),
  );
  const capped = open.filter(
    (row) => row.pages_24h >= MAX_PAGES_PER_DAY,
  ).length;
  if (capped > 0) {
    lines.push(
      t("admin.alerts.summary.pagesCapped", { count: String(capped) }),
    );
  }
  lines.push("");
  lines.push(
    t("admin.alerts.summary.monitorRun", { time: when(monitorAt, zone, d) }),
  );
  lines.push(
    d.push === null
      ? t("admin.alerts.summary.pushMissing", {
          keys: d.pushMissing.join(", "),
        })
      : t("admin.alerts.summary.pushConfigured"),
  );
  lines.push(
    t("admin.alerts.summary.lastPush", {
      time: when(dateOrNull.parse(facts.last?.["last_push"] ?? null), zone, d),
    }),
  );
  lines.push(
    t("admin.alerts.summary.pushRemaining", {
      count: t("admin.alerts.summary.unknown"),
    }),
  );
  lines.push(
    t("admin.alerts.summary.neon", {
      percent:
        neon === null || neon === undefined
          ? t("admin.alerts.summary.unknown")
          : formatPercentFromBasisPoints(
              Math.round(Number(neon) * 100),
              LOCALE,
            ),
    }),
  );
  lines.push(
    t("admin.alerts.summary.fx", {
      date: fxAsOf ?? t("admin.alerts.summary.unknown"),
    }),
  );
  lines.push(
    t("admin.alerts.summary.backup", {
      time: t("admin.alerts.summary.unknown"),
    }),
  );
  lines.push(
    t("admin.alerts.summary.test", {
      time: when(dateOrNull.parse(facts.last?.["last_test"] ?? null), zone, d),
    }),
  );
  lines.push("", t("admin.alerts.email.footer"));
  const text = lines.join("\n");
  const html = lines
    .map((line) =>
      line === ""
        ? ""
        : `<p>${line.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</p>`,
    )
    .join("\n");

  let to: string;
  try {
    to = d.opsEmail();
  } catch {
    log.error(
      {
        job: "alerts.daily_summary",
        outcome: "not_configured",
        missing: ["OPS_ALERT_EMAIL"],
      },
      "alerts.email_not_configured",
    );
    return { sent: false, reason: "not_configured", text };
  }
  try {
    await d.mailer.send({
      tag: "ops_daily_summary",
      to,
      subject: t("admin.alerts.summary.subject", { date }),
      text,
      html,
      idempotencyKey: `ops_daily_summary:${d.environment}:${date}`,
    });
  } catch {
    log.error(
      { job: "alerts.daily_summary", outcome: "failed" },
      "alerts.summary_failed",
    );
    return { sent: false, reason: "failed", text };
  }
  await d.transaction((executor) =>
    executor.execute(
      sql`UPDATE ops_alert_setting SET summary_sent_for = ${date}::date WHERE id = 1`,
    ),
  );
  log.info(
    { job: "alerts.daily_summary", outcome: "sent" },
    "alerts.summary_sent",
  );
  const url =
    "summaryHeartbeatUrl" in deps
      ? deps.summaryHeartbeatUrl
      : alertSummaryHeartbeatUrl(process.env);
  if (url !== undefined) await heartbeat(url, deps.fetch);
  return { sent: true, text };
}
