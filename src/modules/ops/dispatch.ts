/**
 * `alerts.dispatch`: decide and send one alert's push and email (spec 025 §5.5; AC-5, AC-6, AC-8
 * to AC-12, AC-31; TASK-488).
 *
 * Per job `{ alertId, kind }`:
 *  - **email** (P1 and P2, `raise`, `bump` and `test`): sent at once at any hour (email is silent,
 *    never held), to `OPS_ALERT_EMAIL`. Unset in a deployed environment, it logs
 *    `alerts.email_not_configured` at error and records `skipped` (`not_configured`); it never
 *    throws. Past 20 emails in 15 minutes the rest are `held` (`storm`) and one storm email goes;
 *  - **push**: P3 never (`skipped`, `severity`); either Pushover key unset, `skipped`
 *    (`not_configured`, one `warn` per process); outside production with `alerts.push` off,
 *    `skipped` (`push_disabled`); inside quiet hours per `quietHoursDecision`, `held`
 *    (`quiet_hours`) for the morning digest; past 10 pushes in 15 minutes, `held` (`storm`) and
 *    one storm push. Otherwise a priority 2 (P1, or a P2 the override promotes) or 1 push. A P1
 *    page counts toward `pages_24h`;
 *  - **channel failure**: a Pushover 4xx is not retried; a 5xx or no answer is retried 3 times at
 *    least 5 s apart; either then records `failed` and raises `alerts.channel_failed` (component
 *    `push`), which goes **by email only**; `X-Limit-App-Remaining` at 0 raises it too. An email
 *    failure raises it with component `email`, **by push only**. Both failing: the log and Sentry;
 *  - **resolve**: one priority -1 push outside quiet hours only, and only for an alert that was
 *    pushed; no email;
 *  - `alerts.test` pages at priority 2 even inside quiet hours (AC-31).
 *
 * Idempotency: the job is keyed `alertId:kind`; a re-run after a crash may repeat a push (at least
 * once, by design: a page sent twice beats a page lost). The email carries a Resend idempotency
 * key per alert, kind and reopen count, so a re-run within 24 hours does not send it twice.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import {
  CHANNEL_RETRIES,
  CHANNEL_RETRY_DELAY_MS,
  PUSH_PRIORITY,
  REOPEN_PUSH_QUIET_MINUTES,
  RUNBOOK_BASE_URL,
  STORM_EMAIL_CAP,
  STORM_PUSH_CAP,
  STORM_WINDOW_MINUTES,
} from "@/config/alerts";
import { pushoverConfig } from "@/lib/env.alerts";
import { opsAlertEmail } from "@/lib/env.notifications";

import {
  type DispatchJob,
  type OpsDeps,
  type OpsExecutor,
  type ResolvedDeps,
  iso,
  resolveDeps,
} from "./context.ts";
import { opsLog } from "./log.ts";
import {
  type AlertEmail,
  type AlertFacts,
  type MessageOptions,
  type OpsTranslate,
  buildAlertEmail,
  buildGroupPush,
  buildPushMessage,
  buildStormEmail,
} from "./messages.ts";
import {
  type PushChannel,
  type PushMessage,
  type PushResult,
  pushoverChannel,
} from "./pushover.ts";
import {
  quietHoursDecision,
  pagePriority,
  inQuietHours,
} from "./quiet-hours.ts";
import { raiseAlert } from "./raise.ts";
import { type AlertName, alertDefinition, isAlertName } from "./registry.ts";
import {
  type AlertSetting,
  AlertContextSchema,
  DEFAULT_ALERT_SETTING,
} from "./schemas.ts";

/** The one mail-sending call the dispatcher needs (spec 012's `Mailer`). */
export interface AlertMailer {
  send(message: {
    tag: "ops_alert" | "ops_daily_summary";
    to: string;
    subject: string;
    text: string;
    html: string;
    idempotencyKey?: string;
  }): Promise<{ providerRef: string }>;
}

export interface DispatchDeps extends OpsDeps {
  /** The admin catalogue's translator (handed in by the worker). */
  readonly t: OpsTranslate;
  /** The push channel, or null when Pushover is not configured. Default: from env at call time. */
  readonly push?: PushChannel | null;
  /** The missing Pushover key names when `push` is null (AC-12: names only). */
  readonly pushMissing?: readonly string[];
  readonly mailer?: AlertMailer;
  /** `OPS_ALERT_EMAIL`; throws when unset in a deployed environment. */
  readonly opsEmail?: () => string;
  /** `FO-XXXX-XXXX` of an order (the orders module's rule, handed in by the worker). */
  readonly reference?: (orderId: string) => string;
  /** The site origin. Default: `NEXT_PUBLIC_SITE_URL` at call time. */
  readonly baseUrl?: () => string;
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface ResolvedDispatch extends ResolvedDeps {
  readonly t: OpsTranslate;
  readonly push: PushChannel | null;
  readonly pushMissing: readonly string[];
  readonly mailer: AlertMailer;
  readonly opsEmail: () => string;
  readonly reference: (orderId: string) => string;
  readonly baseUrl: () => string;
  readonly sleep: (ms: number) => Promise<void>;
}

/** One `warn` per process for an unconfigured push channel (§5.5). */
let warnedNotConfigured = false;

/** Resets the once-per-process warnings (tests). */
export function resetDispatchWarnings(): void {
  warnedNotConfigured = false;
}

export function resolveDispatchDeps(
  deps: DispatchDeps,
  job: string,
): ResolvedDispatch {
  const base = resolveDeps(deps, job);
  let push = deps.push;
  let missing = deps.pushMissing ?? [];
  if (push === undefined) {
    const config = pushoverConfig(process.env);
    push = config.configured
      ? pushoverChannel({
          appToken: config.appToken,
          userKey: config.userKey,
          backupUserKey: config.backupUserKey,
        })
      : null;
    missing = config.configured ? [] : config.missing;
  }
  return {
    ...base,
    t: deps.t,
    push,
    pushMissing: missing,
    mailer:
      deps.mailer ??
      ({
        async send(message) {
          const { getMailer } = await import("@/modules/notifications");
          return getMailer().send(message);
        },
      } satisfies AlertMailer),
    opsEmail: deps.opsEmail ?? (() => opsAlertEmail(process.env)),
    reference: deps.reference ?? ((orderId) => orderId.slice(0, 8)),
    baseUrl:
      deps.baseUrl ??
      (() => process.env["NEXT_PUBLIC_SITE_URL"] ?? "http://localhost:3000"),
    sleep:
      deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
  };
}

const AlertRow = z.object({
  id: z.uuid(),
  name: z.string(),
  severity: z.enum(["P1", "P2", "P3"]),
  status: z.enum(["open", "acknowledged", "resolved"]),
  order_id: z.uuid().nullable(),
  component: z.string().nullable(),
  mode: z.enum(["test", "live"]).nullable(),
  act_by: z.coerce.date().nullable(),
  occurrences: z.number().int(),
  reopen_count: z.number().int(),
  context: z.unknown(),
  pages_24h: z.number().int(),
  last_page_at: z.coerce.date().nullable(),
  destination_zone: z.string().nullable(),
  quiet_start: z.string().nullable(),
  quiet_end: z.string().nullable(),
  time_zone: z.string().nullable(),
  last_push_at: z.coerce.date().nullable(),
});
export type LoadedAlert = z.infer<typeof AlertRow>;

/** The alert, its order's destination zone, the setting and its last sent push. */
export async function loadAlert(
  executor: OpsExecutor,
  alertId: string,
): Promise<LoadedAlert | null> {
  const [row] = await executor.execute(sql`
    SELECT a.id, a.name, a.severity, a.status, a.order_id, a.component, a.mode, a.act_by,
           a.occurrences, a.reopen_count, a.context, a.pages_24h, a.last_page_at,
           coalesce(ci.iana_zone, c.iana_zone) AS destination_zone,
           to_char(s.quiet_start, 'HH24:MI') AS quiet_start,
           to_char(s.quiet_end, 'HH24:MI') AS quiet_end, s.time_zone,
           (SELECT max(n.created_at) FROM ops_alert_notification n
             WHERE n.alert_id = a.id AND n.channel = 'push' AND n.status = 'sent') AS last_push_at
      FROM ops_alert a
      LEFT JOIN "order" o ON o.id = a.order_id
      LEFT JOIN country c ON c.id = o.destination_country_id
      LEFT JOIN city ci ON ci.id = o.destination_city_id
      LEFT JOIN ops_alert_setting s ON s.id = 1
     WHERE a.id = ${alertId}`);
  return row === undefined ? null : AlertRow.parse(row);
}

export function settingOf(row: {
  readonly quiet_start: string | null;
  readonly quiet_end: string | null;
  readonly time_zone: string | null;
}): AlertSetting {
  return row.quiet_start === null ||
    row.quiet_end === null ||
    row.time_zone === null
    ? DEFAULT_ALERT_SETTING
    : {
        quietStart: row.quiet_start,
        quietEnd: row.quiet_end,
        timeZone: row.time_zone,
      };
}

export function factsOf(row: LoadedAlert, d: ResolvedDispatch): AlertFacts {
  const context = AlertContextSchema.safeParse(row.context);
  return {
    id: row.id,
    name: isAlertName(row.name) ? row.name : "alerts.test",
    severity: row.severity,
    mode: row.mode,
    component: row.component,
    reference: row.order_id === null ? null : d.reference(row.order_id),
    destinationZone: row.destination_zone,
    actBy: row.act_by,
    occurrences: row.occurrences,
    context: context.success ? context.data : {},
  };
}

export function messageOptions(
  d: ResolvedDispatch,
  setting: AlertSetting,
): MessageOptions {
  return {
    t: d.t,
    baseUrl: d.baseUrl(),
    founderZone: setting.timeZone,
    runbookBaseUrl: RUNBOOK_BASE_URL,
  };
}

export interface NotificationRecord {
  readonly alertId: string;
  readonly channel: "push" | "email";
  readonly kind:
    | "raise"
    | "reminder"
    | "escalation"
    | "bump"
    | "held_digest"
    | "resolve"
    | "test";
  readonly priority?: number | null;
  readonly recipient: "primary" | "backup" | "email";
  readonly status: "sent" | "failed" | "held" | "skipped";
  readonly skipReason?:
    "quiet_hours" | "storm" | "not_configured" | "push_disabled" | "severity";
  readonly providerRef?: string | null;
  readonly errorClass?: string | null;
}

export async function recordNotification(
  executor: OpsExecutor,
  record: NotificationRecord,
  now: Date,
): Promise<void> {
  await executor.execute(sql`
    INSERT INTO ops_alert_notification (alert_id, channel, kind, priority, recipient, status,
                                        skip_reason, provider_ref, error_class, created_at)
    VALUES (${record.alertId}, ${record.channel}, ${record.kind}, ${record.priority ?? null},
            ${record.recipient}, ${record.status}, ${record.skipReason ?? null},
            ${record.providerRef ?? null}, ${record.errorClass ?? null}, ${iso(now)}::timestamptz)`);
}

/** Sent notifications of `channel` in this environment's storm window. */
async function sentInWindow(
  executor: OpsExecutor,
  channel: "push" | "email",
  environment: string,
  now: Date,
): Promise<{ sent: number; stormHeld: number }> {
  const since = iso(new Date(now.getTime() - STORM_WINDOW_MINUTES * 60_000));
  const [row] = await executor.execute(sql`
    SELECT count(*) FILTER (WHERE n.status = 'sent')::int AS sent,
           count(*) FILTER (WHERE n.status = 'held' AND n.skip_reason = 'storm')::int AS storm_held
      FROM ops_alert_notification n JOIN ops_alert a ON a.id = n.alert_id
     WHERE n.channel = ${channel} AND a.environment = ${environment}
       AND n.created_at > ${since}::timestamptz`);
  return {
    sent: Number(row?.["sent"] ?? 0),
    stormHeld: Number(row?.["storm_held"] ?? 0),
  };
}

/**
 * Whether push may be sent here (§5.5 "Test-mode orders and staging"): the global `alerts.push`
 * row when one exists, else on in production and off everywhere else.
 */
export async function pushAllowed(
  executor: OpsExecutor,
  environment: string,
): Promise<boolean> {
  const [row] = await executor.execute(sql`
    SELECT (SELECT s.enabled FROM feature_flag_scope s
             WHERE s.flag_key = 'alerts.push' AND s.scope = 'global' AND s.scope_ref = '*')
           AS explicit`);
  const explicit = row?.["explicit"];
  return typeof explicit === "boolean"
    ? explicit
    : environment === "production";
}

/** One push with §5.5's retry rule: a 4xx once, a 5xx or no answer up to 3 more times. */
export async function sendWithRetry(
  push: PushChannel,
  message: PushMessage,
  d: Pick<ResolvedDispatch, "sleep" | "log">,
  context: { readonly alertId: string; readonly kind: string },
): Promise<PushResult> {
  let result = await push.send(message);
  let attempt = 1;
  while (!result.ok && result.retryable && attempt <= CHANNEL_RETRIES) {
    opsLog(d.log).warn(
      {
        alert_id: context.alertId,
        channel: "push",
        kind: context.kind,
        attempt,
        outcome: "retry",
        ...(result.httpStatus === undefined
          ? {}
          : { http_status: result.httpStatus }),
      },
      "alerts.push_retry",
    );
    await d.sleep(CHANNEL_RETRY_DELAY_MS);
    result = await push.send(message);
    attempt += 1;
  }
  return result;
}

export type DispatchOutcome =
  | { readonly kind: "missing" }
  | { readonly kind: "skipped"; readonly reason: "resolved" | "not_resolved" }
  | {
      readonly kind: "done";
      readonly push: NotificationRecord["status"] | "none";
      readonly email: NotificationRecord["status"] | "none";
    };

/** The channel the alert must not use (§5.5: each channel watches the other, no loop). */
function forbiddenChannel(
  name: string,
  component: string | null,
): "push" | "email" | null {
  if (name !== "alerts.channel_failed") return null;
  return component === "email" ? "email" : "push";
}

async function raiseChannelFailed(
  component: "push" | "email",
  failedAlert: string,
  d: ResolvedDispatch,
  httpStatus: number | undefined,
): Promise<void> {
  if (failedAlert === "alerts.channel_failed") {
    // Both channels are failing: the log and Sentry only (the heartbeat keeps running).
    d.sentry("alerts.channel_failed", { component, outcome: "both_failed" });
    opsLog(d.log).error(
      { component, outcome: "both_failed" },
      "alerts.channels_down",
    );
    return;
  }
  await raiseAlert(
    "alerts.channel_failed",
    {
      component,
      ...(httpStatus === undefined
        ? {}
        : { context: { http_status: httpStatus } }),
    },
    {
      transaction: d.transaction,
      now: d.now,
      environment: d.environment,
      log: d.log,
      sentry: d.sentry,
      enqueue: d.enqueue,
      strict: false,
    },
  );
}

/** Sends one email with the mailer's own retries (3 more tries 5 s apart), never throwing. */
async function sendEmail(
  email: AlertEmail,
  idempotencyKey: string,
  tag: "ops_alert" | "ops_daily_summary",
  d: ResolvedDispatch,
): Promise<
  | { readonly status: "sent"; readonly ref: string }
  | { readonly status: "skipped" }
  | { readonly status: "failed"; readonly errorClass: string }
> {
  let to: string;
  try {
    to = d.opsEmail();
  } catch {
    opsLog(d.log).error(
      {
        channel: "email",
        outcome: "not_configured",
        missing: ["OPS_ALERT_EMAIL"],
      },
      "alerts.email_not_configured",
    );
    return { status: "skipped" };
  }
  let lastError = "MailerError";
  for (let attempt = 0; attempt <= CHANNEL_RETRIES; attempt += 1) {
    if (attempt > 0) await d.sleep(CHANNEL_RETRY_DELAY_MS);
    try {
      const sent = await d.mailer.send({ tag, to, ...email, idempotencyKey });
      return { status: "sent", ref: sent.providerRef.slice(0, 200) };
    } catch (error) {
      lastError =
        error instanceof Error
          ? error.name.replace(/[^A-Za-z_]/gu, "") || "Error"
          : "Error";
    }
  }
  return { status: "failed", errorClass: lastError };
}

/** The email half of a raise, bump or test. */
async function emailHalf(
  row: LoadedAlert,
  facts: AlertFacts,
  kind: "raise" | "bump" | "test",
  d: ResolvedDispatch,
  options: MessageOptions,
): Promise<NotificationRecord["status"] | "none"> {
  if (row.severity === "P3") return "none";
  if (forbiddenChannel(row.name, row.component) === "email") return "none";
  const now = d.now();
  const window = await d.transaction((executor) =>
    sentInWindow(executor, "email", d.environment, now),
  );
  const record = (
    status: NotificationRecord["status"],
    extra: Partial<NotificationRecord> = {},
  ) =>
    d.transaction((executor) =>
      recordNotification(
        executor,
        {
          alertId: row.id,
          channel: "email",
          kind,
          recipient: "email",
          status,
          ...extra,
        },
        now,
      ),
    );
  if (window.sent >= STORM_EMAIL_CAP) {
    await record("held", { skipReason: "storm" });
    opsLog(d.log).warn(
      {
        alert_id: row.id,
        channel: "email",
        kind,
        outcome: "held",
        skip_reason: "storm",
      },
      "alerts.delivery",
    );
    if (window.stormHeld === 0) {
      const storm = await sendEmail(
        buildStormEmail(options),
        `ops_alert:storm:${row.id}`,
        "ops_alert",
        d,
      );
      if (storm.status === "sent") {
        await record("sent", { kind: "held_digest", providerRef: storm.ref });
      }
    }
    return "held";
  }
  const sent = await sendEmail(
    buildAlertEmail(facts, kind, options),
    `ops_alert:${row.id}:${kind}:${String(row.reopen_count)}:${row.severity}`,
    "ops_alert",
    d,
  );
  if (sent.status === "skipped") {
    await record("skipped", { skipReason: "not_configured" });
  } else if (sent.status === "failed") {
    await record("failed", { errorClass: sent.errorClass });
    await raiseChannelFailed("email", row.name, d, undefined);
  } else {
    await record("sent", { providerRef: sent.ref });
  }
  opsLog(d.log).info(
    {
      alert_id: row.id,
      alert: row.name,
      channel: "email",
      kind,
      outcome: sent.status,
    },
    "alerts.delivery",
  );
  return sent.status;
}

/** The push half of a raise, bump or test. */
async function pushHalf(
  row: LoadedAlert,
  facts: AlertFacts,
  kind: "raise" | "bump" | "test",
  d: ResolvedDispatch,
  options: MessageOptions,
  setting: AlertSetting,
): Promise<NotificationRecord["status"] | "none"> {
  if (forbiddenChannel(row.name, row.component) === "push") return "none";
  const now = d.now();
  const record = (
    status: NotificationRecord["status"],
    extra: Partial<NotificationRecord> = {},
  ) =>
    d.transaction((executor) =>
      recordNotification(
        executor,
        {
          alertId: row.id,
          channel: "push",
          kind,
          recipient: "primary",
          status,
          ...extra,
        },
        now,
      ),
    );
  const done = async (
    status: NotificationRecord["status"],
    extra: Partial<NotificationRecord> = {},
  ): Promise<NotificationRecord["status"]> => {
    await record(status, extra);
    opsLog(d.log).info(
      {
        alert_id: row.id,
        alert: row.name,
        channel: "push",
        kind,
        outcome: status,
        ...(extra.skipReason === undefined
          ? {}
          : { skip_reason: extra.skipReason }),
        ...(extra.priority === undefined || extra.priority === null
          ? {}
          : { priority: extra.priority }),
        ...(extra.providerRef === undefined || extra.providerRef === null
          ? {}
          : { provider_ref: extra.providerRef }),
      },
      "alerts.delivery",
    );
    return status;
  };

  if (row.severity === "P3") return done("skipped", { skipReason: "severity" });
  if (d.push === null) {
    if (!warnedNotConfigured) {
      warnedNotConfigured = true;
      opsLog(d.log).warn(
        {
          channel: "push",
          outcome: "not_configured",
          missing: [...d.pushMissing],
        },
        "alerts.push_not_configured",
      );
    }
    return done("skipped", { skipReason: "not_configured" });
  }
  if (
    !(await d.transaction((executor) => pushAllowed(executor, d.environment)))
  ) {
    return done("skipped", { skipReason: "push_disabled" });
  }
  // A reopened P2 or P3 does not push again until 4 hours after its last push (§5.5 "Reopen").
  if (
    kind === "raise" &&
    row.reopen_count > 0 &&
    row.severity !== "P1" &&
    row.last_push_at !== null &&
    now.getTime() - row.last_push_at.getTime() <
      REOPEN_PUSH_QUIET_MINUTES * 60_000
  ) {
    return "none";
  }
  const subject = {
    severity: row.severity,
    scope: alertDefinition(facts.name).scope,
    actBy: row.act_by,
  } as const;
  const isTest = row.name === "alerts.test";
  const priority = isTest ? 2 : pagePriority(subject, setting, now);
  if (priority === null) {
    return quietHoursDecision(subject, setting, now) === "hold"
      ? done("held", { skipReason: "quiet_hours" })
      : done("skipped", { skipReason: "severity" });
  }
  const window = await d.transaction((executor) =>
    sentInWindow(executor, "push", d.environment, now),
  );
  if (window.sent >= STORM_PUSH_CAP) {
    const status = await done("held", { skipReason: "storm" });
    if (window.stormHeld === 0) {
      const storm = await sendWithRetry(
        d.push,
        buildGroupPush("storm", 1, row.severity === "P1", options),
        d,
        { alertId: row.id, kind: "storm" },
      );
      if (storm.ok) {
        await record("sent", {
          kind: "held_digest",
          priority: row.severity === "P1" ? 2 : 1,
          providerRef: storm.ref,
        });
      }
    }
    return status;
  }
  const result = await sendWithRetry(
    d.push,
    buildPushMessage(facts, priority, options),
    d,
    { alertId: row.id, kind },
  );
  if (!result.ok) {
    const status = await done("failed", {
      priority,
      errorClass: result.errorClass,
    });
    await raiseChannelFailed("push", row.name, d, result.httpStatus);
    return status;
  }
  const status = await done("sent", { priority, providerRef: result.ref });
  if (priority === PUSH_PRIORITY.P1) {
    await d.transaction((executor) =>
      executor.execute(sql`
        UPDATE ops_alert
           SET pages_24h = CASE WHEN last_page_at IS NULL
                                  OR last_page_at <= ${iso(now)}::timestamptz - interval '24 hours'
                                THEN 1 ELSE pages_24h + 1 END,
               last_page_at = ${iso(now)}::timestamptz
         WHERE id = ${row.id}`),
    );
  }
  if (result.remaining === 0) {
    await raiseChannelFailed("push", row.name, d, undefined);
  }
  return status;
}

/** One `alerts.dispatch` job. */
export async function dispatchAlert(
  job: DispatchJob,
  deps: DispatchDeps,
): Promise<DispatchOutcome> {
  const d = resolveDispatchDeps(deps, "alerts.dispatch");
  const row = await d.transaction((executor) =>
    loadAlert(executor, job.alertId),
  );
  if (row === null) return { kind: "missing" };
  const setting = settingOf(row);
  const facts = factsOf(row, d);
  const options = messageOptions(d, setting);

  if (job.kind === "resolve") {
    if (row.status !== "resolved")
      return { kind: "skipped", reason: "not_resolved" };
    const now = d.now();
    if (
      row.last_push_at === null ||
      d.push === null ||
      inQuietHours(setting, now) ||
      !(await d.transaction((executor) => pushAllowed(executor, d.environment)))
    ) {
      return { kind: "done", push: "none", email: "none" };
    }
    const result = await sendWithRetry(
      d.push,
      buildPushMessage(facts, PUSH_PRIORITY.resolve, options),
      d,
      { alertId: row.id, kind: "resolve" },
    );
    await d.transaction((executor) =>
      recordNotification(
        executor,
        {
          alertId: row.id,
          channel: "push",
          kind: "resolve",
          priority: PUSH_PRIORITY.resolve,
          recipient: "primary",
          status: result.ok ? "sent" : "failed",
          providerRef: result.ok ? result.ref : null,
          errorClass: result.ok ? null : result.errorClass,
        },
        now,
      ),
    );
    return { kind: "done", push: result.ok ? "sent" : "failed", email: "none" };
  }

  if (row.status === "resolved") return { kind: "skipped", reason: "resolved" };
  const kind =
    row.name === "alerts.test"
      ? "test"
      : job.kind === "bump"
        ? "bump"
        : "raise";
  const email = await emailHalf(row, facts, kind, d, options);
  const push = await pushHalf(row, facts, kind, d, options, setting);
  return { kind: "done", push, email };
}

/** Whether `name` is the registry's (re-exported for the job entry). */
export function knownAlert(name: string): name is AlertName {
  return isAlertName(name);
}
