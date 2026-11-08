/**
 * Acknowledge and resolve (spec 025 §5.2, §5.5 "Escalation"; AC-14, AC-16; TASK-488, TASK-489).
 *
 * `acknowledgeAlert(id, actor)`: an open alert becomes `acknowledged` with its actor (an admin
 * label, or `pushover` when the receipt said so). An admin acknowledgement also asks Pushover to
 * cancel the emergency retries tagged with the alert id. After either, `alerts.escalate` sends no
 * escalation or reminder for it (it selects `open` alerts only).
 *
 * `resolveAlert(id, actor, resolution)`: by hand, from admin, with a closed-set resolution.
 *
 * The admin server actions (TASK-490) call these after `requirePermission` and inside
 * `withAdminContext`, which writes the `audit_log` row; here, only the alert row changes.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { type OpsDeps, iso, resolveDeps } from "./context.ts";
import { opsLog } from "./log.ts";
import type { PushChannel } from "./pushover.ts";
import { AlertActorSchema, ResolveAlertSchema } from "./schemas.ts";

export interface AckDeps extends OpsDeps {
  /** The push channel to cancel retries on; null when not configured. */
  readonly push?: PushChannel | null;
}

export async function acknowledgeAlert(
  alertId: string,
  actor: string,
  deps: AckDeps = {},
): Promise<boolean> {
  const id = z.uuid().parse(alertId);
  const by = AlertActorSchema.parse(actor);
  const d = resolveDeps(deps, "alerts.acknowledge");
  const now = iso(d.now());
  const rows = await d.transaction((executor) =>
    executor.execute(sql`
      UPDATE ops_alert
         SET status = 'acknowledged', acknowledged_at = ${now}::timestamptz,
             acknowledged_by = ${by}
       WHERE id = ${id} AND status = 'open'
      RETURNING id`),
  );
  const changed = rows.length > 0;
  if (
    changed &&
    by !== "pushover" &&
    deps.push !== undefined &&
    deps.push !== null
  ) {
    const cancelled = await deps.push.cancelByTag(id);
    opsLog(d.log).info(
      {
        alert_id: id,
        channel: "push",
        outcome: cancelled ? "cancelled" : "cancel_failed",
      },
      "alerts.cancel",
    );
  }
  if (changed) {
    opsLog(d.log).info(
      { alert_id: id, outcome: "acknowledged" },
      "alerts.acknowledged",
    );
  }
  return changed;
}

export async function resolveAlert(
  input: z.input<typeof ResolveAlertSchema>,
  actor: string,
  deps: OpsDeps = {},
): Promise<boolean> {
  const { alertId, resolution } = ResolveAlertSchema.parse(input);
  const by = AlertActorSchema.parse(actor);
  const d = resolveDeps(deps, "alerts.resolve");
  const now = iso(d.now());
  const rows = await d.transaction((executor) =>
    executor.execute(sql`
      UPDATE ops_alert
         SET status = 'resolved', resolved_at = ${now}::timestamptz, resolved_by = ${by},
             resolution = ${resolution}
       WHERE id = ${alertId} AND status <> 'resolved'
      RETURNING id`),
  );
  if (rows.length > 0) {
    opsLog(d.log).info(
      { alert_id: alertId, outcome: "resolved" },
      "alerts.resolved",
    );
  }
  return rows.length > 0;
}
