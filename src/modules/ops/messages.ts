/**
 * What a push and an alert email say (spec 025 §5.5 "Message content"; AC-11; TASK-488).
 *
 * Built from the alert row alone, pure: the registry title (an admin catalogue key, handed in as
 * `t`, because only admin code reads that catalogue), the severity, the order reference or the
 * component, the act-by time in the founder's zone (and the destination's for an order alert) and
 * the occurrence count. The push URL is `{base}/admin/alerts/{alertId}`: an alert UUID, never an
 * order id, a reference or personal data. The email adds the context keys (closed set, no
 * personal data by construction) and the runbook and admin links. Nothing here reads an order
 * snapshot, so no buyer or recipient name, email, phone, address or card message can appear.
 */
import {
  EMERGENCY_EXPIRE_SECONDS,
  EMERGENCY_RETRY_SECONDS,
  PUSHOVER_LIMITS,
} from "@/config/alerts";
import { formatDate, formatNumber } from "@/modules/i18n";

import type { PushMessage } from "./pushover.ts";
import {
  type AlertName,
  type Severity,
  alertDefinition,
  alertTitleKey,
} from "./registry.ts";
import type { AlertContext } from "./schemas.ts";

/** The admin catalogue's translator, handed in by the worker. */
export type OpsTranslate = (
  key: string,
  values?: Readonly<Record<string, string>>,
) => string;

/** The facts a message is built from: the alert row and its order's reference and zone. */
export interface AlertFacts {
  readonly id: string;
  readonly name: AlertName;
  readonly severity: Severity;
  readonly mode: "test" | "live" | null;
  readonly component: string | null;
  /** The order reference (`FO-` and two groups of four) for an order alert, else null. */
  readonly reference: string | null;
  /** The destination's IANA zone for an order alert, when known. */
  readonly destinationZone: string | null;
  readonly actBy: Date | null;
  readonly occurrences: number;
  readonly context: AlertContext;
}

export interface MessageOptions {
  readonly t: OpsTranslate;
  /** The site origin (`NEXT_PUBLIC_SITE_URL`), no trailing slash. */
  readonly baseUrl: string;
  /** The founder's zone (`ops_alert_setting.time_zone`). */
  readonly founderZone: string;
  /** Where runbook paths are read (the repository's `blob/main`). */
  readonly runbookBaseUrl: string;
  /**
   * The alert log's paths (admin owns every admin path, spec 012 AC-6): the list, and one alert
   * by its UUID. Handed in by the worker from `src/modules/admin/alerts.ts`.
   */
  readonly alertPath: (alertId?: string) => string;
}

const ADMIN_LOCALE = "en" as const;

function cityOf(zone: string): string {
  return (zone.split("/").at(-1) ?? zone).replaceAll("_", " ");
}

/** `5 Nov, 10:00 Karachi` in `zone`. */
function timeIn(at: Date, zone: string): string {
  return `${formatDate(at, ADMIN_LOCALE, "dayMonthTime", zone)} ${cityOf(zone)}`;
}

/** The alert page: `{base}` plus the admin path of one alert (`/admin/alerts/{uuid}`). */
export function alertUrl(options: MessageOptions, alertId?: string): string {
  return `${options.baseUrl.replace(/\/+$/u, "")}${options.alertPath(alertId)}`;
}

/** `[TEST] [P1] Title`. */
export function alertTitle(facts: AlertFacts, t: OpsTranslate): string {
  const test = facts.mode === "test" ? "[TEST] " : "";
  return `${test}[${facts.severity}] ${t(alertTitleKey(facts.name))}`.slice(
    0,
    PUSHOVER_LIMITS.titleMax,
  );
}

/** The subject line: the order reference or the component's name. */
function subjectOf(facts: AlertFacts, t: OpsTranslate): string {
  if (facts.reference !== null) return facts.reference;
  return t(`admin.alerts.component.${facts.component ?? "alerts"}`);
}

function actByLine(facts: AlertFacts, options: MessageOptions): string | null {
  if (facts.actBy === null) return null;
  const founder = timeIn(facts.actBy, options.founderZone);
  if (
    facts.destinationZone === null ||
    facts.destinationZone === options.founderZone
  ) {
    return options.t("admin.alerts.message.actBy", { time: founder });
  }
  return options.t("admin.alerts.message.actByTwoZones", {
    time: founder,
    local: timeIn(facts.actBy, facts.destinationZone),
  });
}

/** The push body's lines: subject, act-by, occurrences (§5.5). */
function bodyLines(facts: AlertFacts, options: MessageOptions): string[] {
  const lines = [subjectOf(facts, options.t)];
  const actBy = actByLine(facts, options);
  if (actBy !== null) lines.push(actBy);
  if (facts.occurrences > 1) {
    lines.push(
      options.t("admin.alerts.message.occurrences", {
        count: formatNumber(facts.occurrences, ADMIN_LOCALE),
      }),
    );
  }
  return lines;
}

/** One alert push at `priority` (2 adds the emergency retry, expiry and the alert-id tag). */
export function buildPushMessage(
  facts: AlertFacts,
  priority: -1 | 1 | 2,
  options: MessageOptions,
  recipient: "primary" | "backup" = "primary",
): PushMessage {
  const title =
    priority === -1
      ? options.t("admin.alerts.message.resolved", {
          title: alertTitle(facts, options.t),
        })
      : alertTitle(facts, options.t);
  return {
    title: title.slice(0, PUSHOVER_LIMITS.titleMax),
    message: bodyLines(facts, options)
      .join("\n")
      .slice(0, PUSHOVER_LIMITS.messageMax),
    url: alertUrl(options, facts.id),
    priority,
    ...(priority === 2
      ? {
          retry: EMERGENCY_RETRY_SECONDS,
          expire: EMERGENCY_EXPIRE_SECONDS,
          tags: facts.id,
        }
      : {}),
    recipient,
  };
}

/** A grouped push (held digest at quiet end, or the storm notice): a count and the alert log. */
export function buildGroupPush(
  kind: "held_digest" | "storm",
  count: number,
  anyP1: boolean,
  options: MessageOptions,
): PushMessage {
  const priority = anyP1 ? 2 : 1;
  return {
    title: options.t(
      `admin.alerts.message.${kind === "storm" ? "stormTitle" : "heldTitle"}`,
      {
        count: formatNumber(count, ADMIN_LOCALE),
      },
    ),
    message: options.t("admin.alerts.message.openLog"),
    url: alertUrl(options),
    priority,
    ...(priority === 2
      ? { retry: EMERGENCY_RETRY_SECONDS, expire: EMERGENCY_EXPIRE_SECONDS }
      : {}),
    recipient: "primary",
  };
}

export interface AlertEmail {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** The context as `key: value` lines, in key order (closed keys, so nothing personal). */
function contextLines(context: AlertContext): string[] {
  return Object.entries(context)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b, "en"))
    .map(([key, value]) => `${key}: ${String(value)}`);
}

/** One alert email (raise, bump, escalation, channel failure). */
export function buildAlertEmail(
  facts: AlertFacts,
  kind: "raise" | "bump" | "escalation" | "test",
  options: MessageOptions,
): AlertEmail {
  const title = alertTitle(facts, options.t);
  const lead =
    kind === "escalation"
      ? options.t("admin.alerts.email.escalationLead")
      : kind === "bump"
        ? options.t("admin.alerts.email.bumpLead")
        : options.t("admin.alerts.email.lead");
  const runbook = `${options.runbookBaseUrl.replace(/\/+$/u, "")}/${alertDefinition(facts.name).runbook}`;
  const admin = alertUrl(options, facts.id);
  const lines = [
    lead,
    "",
    ...bodyLines(facts, options),
    ...contextLines(facts.context),
    "",
    options.t("admin.alerts.email.runbook", { url: runbook }),
    options.t("admin.alerts.email.admin", { url: admin }),
    "",
    options.t("admin.alerts.email.footer"),
  ];
  const html = [
    `<h1>${escapeHtml(title)}</h1>`,
    `<p>${escapeHtml(lead)}</p>`,
    `<ul>${[...bodyLines(facts, options), ...contextLines(facts.context)]
      .map((line) => `<li>${escapeHtml(line)}</li>`)
      .join("")}</ul>`,
    `<p><a href="${escapeHtml(runbook)}">${escapeHtml(options.t("admin.alerts.email.runbookLink"))}</a></p>`,
    `<p><a href="${escapeHtml(admin)}">${escapeHtml(options.t("admin.alerts.email.adminLink"))}</a></p>`,
    `<p>${escapeHtml(options.t("admin.alerts.email.footer"))}</p>`,
  ].join("\n");
  const reference = facts.reference === null ? "" : ` (${facts.reference})`;
  return {
    subject: `${title}${reference}`.slice(0, 200),
    text: lines.join("\n"),
    html,
  };
}

/** The storm email: N more alerts held, open the alert log. */
export function buildStormEmail(options: MessageOptions): AlertEmail {
  const subject = options.t("admin.alerts.email.stormSubject");
  const body = options.t("admin.alerts.message.openLog");
  const url = alertUrl(options);
  return {
    subject,
    text: `${body}\n${url}\n\n${options.t("admin.alerts.email.footer")}`,
    html: `<p>${escapeHtml(body)}</p><p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p><p>${escapeHtml(options.t("admin.alerts.email.footer"))}</p>`,
  };
}
