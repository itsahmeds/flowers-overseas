/**
 * `raiseAlert`, the one entry point, and the calls that close an alert (spec 025 §5.2, §5.4,
 * §5.5 "Resolve"; AC-1 to AC-4, AC-9, AC-14, AC-16, AC-38; TASK-488).
 *
 * `raiseAlert(name, input)`:
 *  1. validates the name against `ALERT_REGISTRY` and the input with `AlertInputSchema` (a context
 *     key outside the closed set is refused): invalid, it writes nothing; it throws when `strict`
 *     (tests), else logs `alerts.invalid` and still sends the Sentry event (AC-3);
 *  2. sends the Sentry event (`captureAlert`, the stack context stays where it was);
 *  3. in one `system` transaction, reopens a row of the same fingerprint resolved within 30
 *     minutes, else upserts the one open row (`INSERT ... ON CONFLICT` on the partial unique index,
 *     so two concurrent raises leave one row with `occurrences = 2`, AC-2). A test-mode order caps
 *     the severity at P2 (AC-9). A database failure logs `alerts.record_failed` and returns; the
 *     Sentry event has already gone (AC-4);
 *  4. enqueues `alerts.dispatch`: `raise` for a new or reopened row, `bump` when a repeat raised
 *     the severity, nothing for a plain repeat (one push and one email per problem).
 *
 * `alertRaiser`: the synchronous `(name, fields, options?) => void` shape every caller of
 * `captureAlert` used, so each call site moves by changing one import. It maps `order_id` to the
 * order subject, a component-like `provider` to the component, and keeps only the fields that are
 * closed-set context keys with a valid value (the rest still reach Sentry's `extra`, as before).
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { CLEAR_RUNS_TO_RESOLVE, REOPEN_WITHIN_MINUTES } from "@/config/alerts";

import {
  type OpsDeps,
  type ResolvedDeps,
  iso,
  resolveDeps,
} from "./context.ts";
import { type AlertSubject, fingerprintOf } from "./fingerprint.ts";
import { opsLog } from "./log.ts";
import {
  type AlertComponent,
  type AlertName,
  type Severity,
  alertDefinition,
  baseSeverity,
  isAlertName,
} from "./registry.ts";
import {
  ALERT_CONTEXT_KEYS,
  type AlertContext,
  AlertContextSchema,
  type AlertInput,
  AlertInputSchema,
} from "./schemas.ts";

export type RaiseOutcome =
  "inserted" | "deduplicated" | "reopened" | "invalid" | "record_failed";

export interface RaiseResult {
  readonly outcome: RaiseOutcome;
  readonly alertId: string | null;
  readonly severity: Severity | null;
  readonly fingerprint: string | null;
  /** The dispatch asked for, if any. */
  readonly dispatched: "raise" | "bump" | null;
}

/** Thrown in strict mode for an invalid raise (AC-3). Names the paths, never a value. */
export class AlertInputError extends Error {
  constructor(detail: string) {
    super(`invalid alert: ${detail}`);
    this.name = "AlertInputError";
  }
}

const RaisedRow = z.object({
  id: z.uuid(),
  severity: z.enum(["P1", "P2", "P3"]),
  inserted: z.boolean(),
  prior_severity: z.enum(["P1", "P2", "P3"]).nullable(),
});

/** The subject of a raise: the order where the registry scopes it so, else the component. */
function subjectOf(
  name: AlertName,
  input: z.output<typeof AlertInputSchema>,
): AlertSubject {
  const definition = alertDefinition(name);
  if (definition.scope === "order" && input.orderId !== undefined) {
    return { orderId: input.orderId };
  }
  const component = input.component ?? definition.component;
  return input.subKey === undefined
    ? { component }
    : { component, subKey: input.subKey };
}

function invalid(
  name: string,
  detail: string,
  input: unknown,
  d: ResolvedDeps,
): RaiseResult {
  if (d.strict) throw new AlertInputError(detail);
  const orderId =
    typeof input === "object" &&
    input !== null &&
    "orderId" in input &&
    typeof input.orderId === "string" &&
    z.uuid().safeParse(input.orderId).success
      ? input.orderId
      : undefined;
  const alert = isAlertName(name) ? name : "alerts.invalid";
  d.sentry(alert, orderId === undefined ? {} : { order_id: orderId });
  opsLog(d.log).error(
    {
      alert,
      outcome: "invalid",
      ...(orderId === undefined ? {} : { order_id: orderId }),
    },
    "alerts.invalid",
  );
  return {
    outcome: "invalid",
    alertId: null,
    severity: null,
    fingerprint: null,
    dispatched: null,
  };
}

/** Raise `name` (§5.2). Never throws outside strict mode. */
export async function raiseAlert(
  name: AlertName,
  rawInput: AlertInput = {},
  deps: OpsDeps = {},
): Promise<RaiseResult> {
  const d = resolveDeps(deps, "alerts.raise");
  const log = opsLog(d.log);
  if (!isAlertName(name)) {
    return invalid(String(name), "name not in ALERT_REGISTRY", rawInput, d);
  }
  const parsed = AlertInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const paths = parsed.error.issues
      .map(
        (issue) =>
          `${issue.path.map(String).join(".") || "(root)"}:${issue.code}`,
      )
      .join(", ");
    return invalid(name, paths, rawInput, d);
  }
  const input = parsed.data;
  const subject = subjectOf(name, input);
  const fingerprint = fingerprintOf(name, subject);
  const orderId = "orderId" in subject ? subject.orderId : null;
  const component: AlertComponent | null =
    "component" in subject ? subject.component : null;

  d.sentry(
    name,
    {
      ...(orderId === null ? {} : { order_id: orderId }),
      ...(component === null ? {} : { component }),
      ...input.context,
    },
    { fingerprint: [fingerprint] },
  );

  const now = d.now();
  const requested =
    input.severity ??
    baseSeverity(name, component ?? alertDefinition(name).component);
  let row: z.infer<typeof RaisedRow>;
  let reopened = false;
  try {
    const result = await d.transaction(async (executor) => {
      let mode: "test" | "live" | null = input.mode ?? null;
      if (orderId !== null && mode === null) {
        const [order] = await executor.execute(
          sql`SELECT mode FROM "order" WHERE id = ${orderId}`,
        );
        mode = order?.["mode"] === "live" ? "live" : "test";
      }
      // AC-9: a test-mode order never wakes the founder.
      const severity: Severity =
        mode === "test" && requested === "P1" ? "P2" : requested;
      const context = JSON.stringify(input.context ?? {});
      const actBy = input.actBy === undefined ? null : iso(input.actBy);
      const reopenAfter = iso(
        new Date(now.getTime() - REOPEN_WITHIN_MINUTES * 60_000),
      );

      const [again] = await executor.execute(sql`
        UPDATE ops_alert a
           SET status = 'open', resolved_at = NULL, resolved_by = NULL, resolution = NULL,
               acknowledged_at = NULL, acknowledged_by = NULL, clear_runs = 0,
               reopen_count = a.reopen_count + 1, occurrences = a.occurrences + 1,
               last_seen_at = ${iso(now)}::timestamptz,
               severity = LEAST(a.severity, ${severity}),
               act_by = COALESCE(${actBy}::timestamptz, a.act_by),
               context = a.context || (${context}::text)::jsonb
         WHERE a.id = (
                 SELECT r.id FROM ops_alert r
                  WHERE r.environment = ${d.environment} AND r.fingerprint = ${fingerprint}
                    AND r.status = 'resolved' AND r.resolved_at > ${reopenAfter}::timestamptz
                  ORDER BY r.resolved_at DESC LIMIT 1)
           AND NOT EXISTS (
                 SELECT 1 FROM ops_alert o
                  WHERE o.environment = ${d.environment} AND o.fingerprint = ${fingerprint}
                    AND o.status <> 'resolved')
        RETURNING a.id, a.severity, false AS inserted, NULL::text AS prior_severity`);
      if (again !== undefined)
        return { row: RaisedRow.parse(again), reopened: true };

      const [upserted] = await executor.execute(sql`
        WITH prior AS (
          SELECT severity FROM ops_alert
           WHERE environment = ${d.environment} AND fingerprint = ${fingerprint}
             AND status <> 'resolved')
        INSERT INTO ops_alert (environment, name, severity, initial_severity, fingerprint,
                               order_id, component, mode, act_by, context,
                               first_seen_at, last_seen_at)
        VALUES (${d.environment}, ${name}, ${severity}, ${severity}, ${fingerprint},
                ${orderId}, ${component}, ${mode}, ${actBy}::timestamptz,
                (${context}::text)::jsonb, ${iso(now)}::timestamptz, ${iso(now)}::timestamptz)
        ON CONFLICT (environment, fingerprint) WHERE status <> 'resolved' DO UPDATE
           SET occurrences = ops_alert.occurrences + 1,
               last_seen_at = EXCLUDED.last_seen_at,
               clear_runs = 0,
               severity = LEAST(ops_alert.severity, EXCLUDED.severity),
               act_by = COALESCE(EXCLUDED.act_by, ops_alert.act_by),
               context = ops_alert.context || EXCLUDED.context
        RETURNING id, severity, (xmax = 0) AS inserted,
                  (SELECT severity FROM prior) AS prior_severity`);
      return { row: RaisedRow.parse(upserted), reopened: false };
    });
    row = result.row;
    reopened = result.reopened;
  } catch {
    log.error(
      {
        alert: name,
        fingerprint,
        outcome: "record_failed",
        ...(orderId === null ? {} : { order_id: orderId }),
        ...(component === null ? {} : { component }),
      },
      "alerts.record_failed",
    );
    return {
      outcome: "record_failed",
      alertId: null,
      severity: null,
      fingerprint,
      dispatched: null,
    };
  }

  const outcome: RaiseOutcome = reopened
    ? "reopened"
    : row.inserted
      ? "inserted"
      : "deduplicated";
  const dispatched: "raise" | "bump" | null =
    outcome !== "deduplicated"
      ? "raise"
      : row.prior_severity !== null && row.severity < row.prior_severity
        ? "bump"
        : null;
  log.info(
    {
      alert: name,
      alert_id: row.id,
      severity: row.severity,
      fingerprint,
      outcome,
      ...(orderId === null ? {} : { order_id: orderId }),
      ...(component === null ? {} : { component }),
    },
    "alerts.raised",
  );
  if (dispatched !== null) {
    try {
      await d.enqueue({ alertId: row.id, kind: dispatched });
    } catch {
      log.error(
        {
          alert: name,
          alert_id: row.id,
          kind: dispatched,
          outcome: "enqueue_failed",
        },
        "alerts.enqueue_failed",
      );
    }
  }
  return {
    outcome,
    alertId: row.id,
    severity: row.severity,
    fingerprint,
    dispatched,
  };
}

/** The legacy shape every `captureAlert` call site used (spec 013 §11's `AlertRaiser`). */
export type LegacyAlertRaiser = (
  alert: string,
  fields?: Readonly<Record<string, unknown>> & { readonly order_id?: string },
  options?: { readonly fingerprint?: readonly string[] },
) => void;

const COMPONENT_PROVIDERS = new Set(["stripe", "mollie", "resend"]);

/** The closed-set context keys of `fields` whose values pass their own schema. */
export function contextFrom(
  fields: Readonly<Record<string, unknown>>,
): AlertContext {
  const picked: Record<string, unknown> = {};
  const shape = AlertContextSchema.shape;
  for (const key of ALERT_CONTEXT_KEYS) {
    if (!(key in fields)) continue;
    const value = shape[key].safeParse(fields[key]);
    if (value.success && value.data !== undefined) picked[key] = value.data;
  }
  return picked as AlertContext;
}

/** The input a legacy call's fields map to. */
export function inputFromFields(
  name: AlertName,
  fields: Readonly<Record<string, unknown>>,
): AlertInput {
  const orderId =
    typeof fields["order_id"] === "string" &&
    z.uuid().safeParse(fields["order_id"]).success
      ? fields["order_id"]
      : undefined;
  const provider = fields["provider"];
  const component =
    typeof provider === "string" && COMPONENT_PROVIDERS.has(provider)
      ? (provider as AlertComponent)
      : undefined;
  const partner =
    name === "notifications.florist_bounce" &&
    typeof fields["partner_id"] === "string"
      ? fields["partner_id"]
      : undefined;
  return {
    ...(orderId === undefined ? {} : { orderId }),
    ...(component === undefined ? {} : { component }),
    ...(partner === undefined ? {} : { subKey: partner }),
    context: contextFrom(fields),
  };
}

/**
 * The synchronous raiser for the call sites that used `captureAlert`: fire and forget. The
 * promise never rejects outside strict mode; in strict mode a rejection is logged, not thrown,
 * because the caller's own work must not fail for an alert.
 */
export function alertRaiser(deps: OpsDeps = {}): LegacyAlertRaiser {
  return (alert, fields = {}) => {
    if (!isAlertName(alert)) {
      void raiseAlert(alert as AlertName, {}, { ...deps, strict: false });
      return;
    }
    void raiseAlert(alert, inputFromFields(alert, fields), deps).catch(() => {
      opsLog(resolveDeps(deps, "alerts.raise").log).error(
        { alert, outcome: "invalid" },
        "alerts.invalid",
      );
    });
  };
}

/** The process's default raiser, for `deps.alert ?? raiseLegacyAlert`. */
export const raiseLegacyAlert: LegacyAlertRaiser = (alert, fields, options) => {
  alertRaiser()(alert, fields, options);
};

export interface ClearResult {
  readonly resolved: boolean;
  readonly alertId: string | null;
}

/**
 * The condition behind `name` for `subject` is clear this run (§5.5 "Resolve"). A monitor alert
 * resolves on the second consecutive clear run (`immediate: false`); an order alert resolves at
 * once when its order left the at-risk set (`immediate: true`). A resolve enqueues one `resolve`
 * dispatch (the priority -1 push, outside quiet hours only).
 */
export async function clearCondition(
  name: AlertName,
  subject: AlertSubject,
  options: { readonly immediate?: boolean } = {},
  deps: OpsDeps = {},
): Promise<ClearResult> {
  const d = resolveDeps(deps, "alerts.monitor");
  const fingerprint = fingerprintOf(name, subject);
  const needed = options.immediate === true ? 1 : CLEAR_RUNS_TO_RESOLVE;
  const now = iso(d.now());
  const [row] = await d.transaction((executor) =>
    executor.execute(sql`
      UPDATE ops_alert
         SET clear_runs = clear_runs + 1,
             status = CASE WHEN clear_runs + 1 >= ${needed} THEN 'resolved' ELSE status END,
             resolved_at = CASE WHEN clear_runs + 1 >= ${needed} THEN ${now}::timestamptz END,
             resolved_by = CASE WHEN clear_runs + 1 >= ${needed} THEN 'system:alerts.monitor' END,
             resolution = CASE WHEN clear_runs + 1 >= ${needed} THEN 'condition_cleared' END
       WHERE environment = ${d.environment} AND fingerprint = ${fingerprint}
         AND status <> 'resolved'
      RETURNING id, status`),
  );
  if (row === undefined) return { resolved: false, alertId: null };
  const id = z.uuid().parse(row["id"]);
  const resolved = row["status"] === "resolved";
  if (resolved) {
    opsLog(d.log).info(
      { alert: name, alert_id: id, fingerprint, outcome: "resolved" },
      "alerts.resolved",
    );
    try {
      await d.enqueue({ alertId: id, kind: "resolve" });
    } catch {
      opsLog(d.log).error(
        {
          alert: name,
          alert_id: id,
          kind: "resolve",
          outcome: "enqueue_failed",
        },
        "alerts.enqueue_failed",
      );
    }
  }
  return { resolved, alertId: id };
}
