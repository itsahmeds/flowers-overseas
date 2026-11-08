/**
 * `ALERT_REGISTRY`: the one closed list of every alert the application raises (spec 025 §5.2
 * "The registry", §13 Q4; AC-1; TASK-488).
 *
 * Each name has its severity, scope (an order or a component), how it resolves, its act-by rule,
 * its runbook path with an anchor, and its title key in the admin catalogue. It absorbs spec 013's
 * names, spec 016's three, spec 002's and 005's signals and §5.2's new names, plus the alerts later
 * specs added at the point of failure before this registry existed (invoices, payouts, the close
 * sweep, the buyer sign-in cap, slow search), each with the severity recorded in the brief.
 *
 * `component` on an order-scoped name is the fallback subject when a caller has no order id (a
 * payment alert raised before its order is known): the row then names the component and keeps the
 * payment id in its context, because `ops_alert` holds exactly one of the two (§5.1).
 *
 * Pure data and zod; no database, no env, no copy.
 */
import { z } from "zod";

import {
  type alertComponents,
  alertSeverities,
} from "../../../db/schema/alerts.ts";

export type Severity = (typeof alertSeverities)[number];
export type AlertComponent = (typeof alertComponents)[number];
export const SeveritySchema = z.enum(alertSeverities);

/** How an alert resolves (§5.5 "Resolve"). */
export type ResolveMode = "auto_monitor" | "auto_order_state" | "manual";

/** The act-by rule, read by the monitors that set `act_by` (§5.2 "Act by"). */
export type ActByRule =
  | "none"
  | "routing_deadline"
  | "grace_end"
  | "dispute_evidence_due"
  | "dispatch_local_18"
  | "delivery_day_end"
  | "fx_stale_instant";

export interface AlertDefinition {
  /** One level, or a level per component where §5.2 gives two (`webhook.dead`). */
  readonly severity:
    Severity | Readonly<Partial<Record<AlertComponent, Severity>>>;
  readonly scope: "order" | "component";
  /** The component of a component alert, or an order alert's fallback subject. */
  readonly component: AlertComponent;
  readonly resolve: ResolveMode;
  readonly actBy: ActByRule;
  /** `docs/runbooks/<file>.md#<anchor>`. */
  readonly runbook: string;
  /** Email only, never push (`alerts.channel_failed` for push, §5.5 "Channel failure"). */
  readonly emailOnly?: boolean;
}

const RUNBOOK_PATTERN = /^docs\/runbooks\/[a-z0-9-]+\.md#[a-z0-9-]+$/u;

export const AlertDefinitionSchema = z
  .object({
    severity: z.union([SeveritySchema, z.record(z.string(), SeveritySchema)]),
    scope: z.enum(["order", "component"]),
    component: z.string().min(1),
    resolve: z.enum(["auto_monitor", "auto_order_state", "manual"]),
    actBy: z.string().min(1),
    runbook: z.string().regex(RUNBOOK_PATTERN),
    emailOnly: z.boolean().optional(),
  })
  .strict();

const rb = (file: string, anchor: string): string =>
  `docs/runbooks/${file}.md#${anchor}`;

const payment = (
  severity: Severity,
  name: string,
  actBy: ActByRule = "none",
): AlertDefinition => ({
  severity,
  scope: "order",
  component: "stripe",
  resolve: "manual",
  actBy,
  runbook: rb("payments", name),
});

/** The registry (§5.2's table, severities as written; §13 Q4 approved on the default). */
export const ALERT_REGISTRY = {
  // Spec 013.
  "webhook.dead": {
    severity: { stripe: "P1", mollie: "P1", resend: "P2" },
    scope: "component",
    component: "stripe",
    resolve: "manual",
    actBy: "none",
    runbook: rb("payment-webhook-down", "webhook-dead"),
  },
  "webhook.error_rate": {
    severity: "P1",
    scope: "component",
    component: "stripe",
    resolve: "auto_monitor",
    actBy: "none",
    runbook: rb("payment-webhook-down", "webhook-error-rate"),
  },
  "webhook.silent_24h": {
    severity: "P1",
    scope: "component",
    component: "stripe",
    resolve: "auto_monitor",
    actBy: "none",
    runbook: rb("payment-webhook-down", "webhook-silent-24h"),
  },
  "outbox.dead": {
    severity: "P1",
    scope: "order",
    component: "worker",
    resolve: "manual",
    actBy: "routing_deadline",
    runbook: rb("payments", "outbox-dead"),
  },
  "payment.amount_mismatch": payment("P1", "payment-amount-mismatch"),
  "payment.paid_not_routed": {
    severity: "P1",
    scope: "order",
    component: "stripe",
    resolve: "auto_order_state",
    actBy: "routing_deadline",
    runbook: rb("routing-exhausted", "payment-paid-not-routed"),
  },
  "payment.refund_failed": payment("P2", "payment-refund-failed"),
  "payment.dispute_opened": payment(
    "P2",
    "payment-dispute-opened",
    "dispute_evidence_due",
  ),
  "payment.unexpected_hold": payment("P2", "payment-unexpected-hold"),
  "payment.unexpected_cancel": payment("P2", "payment-unexpected-cancel"),
  "payment.captured_after_close": payment("P2", "payment-captured-after-close"),
  "payment.dispute_outside_machine": payment(
    "P2",
    "payment-dispute-outside-machine",
  ),
  "payment.refund_state_mismatch": payment(
    "P3",
    "payment-refund-state-mismatch",
  ),
  // Spec 013 §5.2 (refunds): a refund asked for more than was captured. Money, same day: P2.
  "payment.refund_exceeds_captured": payment(
    "P2",
    "payment-refund-exceeds-captured",
  ),
  // Spec 016.
  "routing.no_partner": {
    severity: "P1",
    scope: "order",
    component: "worker",
    resolve: "auto_order_state",
    actBy: "grace_end",
    runbook: rb("routing-exhausted", "routing-no-partner"),
  },
  "routing.sla_overdue": {
    severity: "P1",
    scope: "order",
    component: "queue",
    resolve: "auto_order_state",
    actBy: "routing_deadline",
    runbook: rb("jobs-stuck", "routing-sla-overdue"),
  },
  "notifications.florist_bounce": {
    severity: "P2",
    scope: "component",
    component: "resend",
    resolve: "manual",
    actBy: "none",
    runbook: rb("email-deliverability", "notifications-florist-bounce"),
  },
  // Spec 025's order-risk monitors.
  "order.not_accepted": {
    severity: "P2",
    scope: "order",
    component: "worker",
    resolve: "auto_order_state",
    actBy: "routing_deadline",
    runbook: rb("order-not-accepted", "order-not-accepted"),
  },
  "order.dispatch_at_risk": {
    severity: "P2",
    scope: "order",
    component: "worker",
    resolve: "auto_order_state",
    actBy: "dispatch_local_18",
    runbook: rb("delivery-at-risk", "order-dispatch-at-risk"),
  },
  "order.not_delivered": {
    severity: "P1",
    scope: "order",
    component: "worker",
    resolve: "auto_order_state",
    actBy: "delivery_day_end",
    runbook: rb("delivery-at-risk", "order-not-delivered"),
  },
  "order.photo_missing": {
    severity: "P3",
    scope: "order",
    component: "worker",
    resolve: "auto_order_state",
    actBy: "none",
    runbook: rb("delivery-at-risk", "order-photo-missing"),
  },
  // Spec 025's component monitors.
  "jobs.backlog": {
    severity: "P1",
    scope: "component",
    component: "queue",
    resolve: "auto_monitor",
    actBy: "none",
    runbook: rb("jobs-stuck", "jobs-backlog"),
  },
  "jobs.failed_spike": {
    severity: "P2",
    scope: "component",
    component: "queue",
    resolve: "auto_monitor",
    actBy: "none",
    runbook: rb("jobs-stuck", "jobs-failed-spike"),
  },
  "site.down": {
    severity: "P1",
    scope: "component",
    component: "site",
    resolve: "auto_monitor",
    actBy: "none",
    runbook: rb("site-down", "site-down"),
  },
  "site.page_failing": {
    severity: "P2",
    scope: "component",
    component: "site",
    resolve: "auto_monitor",
    actBy: "none",
    runbook: rb("site-down", "site-page-failing"),
  },
  "fx.stale": {
    severity: "P2",
    scope: "component",
    component: "fx",
    resolve: "auto_monitor",
    actBy: "none",
    runbook: rb("fx-stale", "fx-stale"),
  },
  "fx.aging": {
    severity: "P3",
    scope: "component",
    component: "fx",
    resolve: "auto_monitor",
    actBy: "fx_stale_instant",
    runbook: rb("fx-stale", "fx-aging"),
  },
  "email.bounce_rate": {
    severity: "P2",
    scope: "component",
    component: "email",
    resolve: "auto_monitor",
    actBy: "none",
    runbook: rb("email-deliverability", "email-bounce-rate"),
  },
  "email.complaint": {
    severity: "P3",
    scope: "component",
    component: "email",
    resolve: "manual",
    actBy: "none",
    runbook: rb("email-deliverability", "email-complaint"),
  },
  // Spec 002's probes.
  "db.usage_high": {
    severity: "P3",
    scope: "component",
    component: "neon",
    resolve: "auto_monitor",
    actBy: "none",
    runbook: rb("database-limits", "db-usage-high"),
  },
  "db.backup_failed": {
    severity: "P2",
    scope: "component",
    component: "backup",
    resolve: "auto_monitor",
    actBy: "none",
    runbook: rb("database-limits", "db-backup-failed"),
  },
  // The alert path watching itself.
  "alerts.channel_failed": {
    severity: "P1",
    scope: "component",
    component: "push",
    resolve: "auto_monitor",
    actBy: "none",
    runbook: rb("alerts-setup", "alerts-channel-failed"),
  },
  "alerts.test": {
    severity: "P1",
    scope: "component",
    component: "alerts",
    resolve: "manual",
    actBy: "none",
    runbook: rb("alerts-setup", "alerts-test"),
  },
  // Raised at the point of failure by specs written after 013 and 016 (severities in the brief).
  // Spec 023 §11 (TASK-491): the GA4 Measurement Protocol path. Neither touches money or an
  // order's progress; both point at a defect to fix (an upstream money mismatch, a body schema).
  "analytics.value_mismatch": {
    severity: "P2",
    scope: "order",
    component: "worker",
    resolve: "manual",
    actBy: "none",
    runbook: rb("analytics-consent", "analytics-value-mismatch"),
  },
  "analytics.rejected": {
    severity: "P3",
    scope: "order",
    component: "worker",
    resolve: "manual",
    actBy: "none",
    runbook: rb("analytics-consent", "analytics-rejected"),
  },
  "invoice.refused": {
    severity: "P2",
    scope: "order",
    component: "worker",
    resolve: "manual",
    actBy: "none",
    runbook: rb("invoices", "invoice-refused"),
  },
  "invoice.nbp_failed": {
    severity: "P2",
    scope: "component",
    component: "fx",
    resolve: "manual",
    actBy: "none",
    runbook: rb("invoices", "invoice-nbp-failed"),
  },
  "invoice.render_overdue": {
    severity: "P3",
    scope: "component",
    component: "queue",
    resolve: "manual",
    actBy: "none",
    runbook: rb("invoices", "invoice-render-overdue"),
  },
  "invoice.render_dead": {
    severity: "P2",
    scope: "component",
    component: "queue",
    resolve: "manual",
    actBy: "none",
    runbook: rb("invoices", "invoice-render-dead"),
  },
  "payouts.line_missing": {
    severity: "P2",
    scope: "order",
    component: "worker",
    resolve: "manual",
    actBy: "none",
    runbook: rb("payouts", "payouts-line-missing"),
  },
  "orders.close_backlog": {
    severity: "P3",
    scope: "component",
    component: "queue",
    resolve: "manual",
    actBy: "none",
    runbook: rb("jobs-stuck", "orders-close-backlog"),
  },
  "auth.buyer.link_cap": {
    severity: "P2",
    scope: "component",
    component: "email",
    resolve: "manual",
    actBy: "none",
    runbook: rb("email-deliverability", "auth-buyer-link-cap"),
  },
  "search.slow": {
    severity: "P3",
    scope: "component",
    component: "site",
    resolve: "manual",
    actBy: "none",
    runbook: rb("site-down", "search-slow"),
  },
} as const satisfies Record<string, AlertDefinition>;

export type AlertName = keyof typeof ALERT_REGISTRY;

export const ALERT_NAMES = Object.keys(ALERT_REGISTRY) as AlertName[];

export function isAlertName(value: string): value is AlertName {
  return Object.hasOwn(ALERT_REGISTRY, value);
}

export const AlertNameSchema = z.string().refine(isAlertName, {
  message: "not a registered alert name",
});

/** The registry entry of `name`, typed as the wide definition. */
export function alertDefinition(name: AlertName): AlertDefinition {
  return ALERT_REGISTRY[name];
}

/** The title key of `name` in the admin catalogue: `admin.alerts.name.<name>`. */
export function alertTitleKey(name: AlertName): string {
  return `admin.alerts.name.${name}`;
}

/** The severity `name` starts at for `component` (`webhook.dead` differs by provider). */
export function baseSeverity(
  name: AlertName,
  component: AlertComponent | undefined,
): Severity {
  const severity = alertDefinition(name).severity;
  if (typeof severity === "string") return severity;
  const own = component === undefined ? undefined : severity[component];
  if (own !== undefined) return own;
  // The highest level the map names: an unknown provider is treated as the worst case.
  const levels = Object.values(severity);
  return levels.includes("P1") ? "P1" : levels.includes("P2") ? "P2" : "P3";
}

const ORDER: Readonly<Record<Severity, number>> = { P1: 1, P2: 2, P3: 3 };

/** True when `a` is more severe than `b`. */
export function moreSevere(a: Severity, b: Severity): boolean {
  return ORDER[a] < ORDER[b];
}

/** One level up (P3 to P2, P2 to P1); P1 stays. */
export function raiseOneLevel(severity: Severity): Severity {
  return severity === "P3" ? "P2" : "P1";
}
