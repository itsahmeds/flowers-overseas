/**
 * One `audit_log` row per payouts admin command (spec 030a §11 "Audit"; TASK-365). The `payout`
 * tables are not under `0016`'s `audit_row_change()`, so each command records itself here, in its
 * own transaction: the actor, the action, the entity, the before/after facts (ids, kinds, amounts,
 * notes the founder wrote) and, for a waiver, the reason in `audit_log.reason`.
 */
import { sql } from "drizzle-orm";

import type { OrderExecutor } from "@/modules/orders";

import type { PayoutActor } from "./accrual";

export interface PayoutAuditEntry {
  readonly action: string;
  readonly entityTable: "payout" | "payout_line" | "payout_adjustment";
  readonly entityId: string;
  readonly before?: Readonly<Record<string, unknown>>;
  readonly after?: Readonly<Record<string, unknown>>;
  readonly reason?: string;
}

export async function writePayoutAudit(
  executor: OrderExecutor,
  actor: PayoutActor,
  entry: PayoutAuditEntry,
): Promise<void> {
  const before =
    entry.before === undefined ? null : JSON.stringify(entry.before);
  const after = entry.after === undefined ? null : JSON.stringify(entry.after);
  await executor.execute(sql`
    INSERT INTO audit_log (actor_user_id, actor_label, action, entity_table, entity_id,
                           before, after, reason, request_id, channel)
    VALUES (${actor.userId}::uuid, ${`admin:${actor.userId}`}, ${entry.action},
            ${entry.entityTable}, ${entry.entityId},
            (${before}::text)::jsonb, (${after}::text)::jsonb, ${entry.reason ?? null},
            ${actor.requestId}, 'admin')`);
}
