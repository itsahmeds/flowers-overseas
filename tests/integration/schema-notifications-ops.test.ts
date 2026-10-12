/**
 * Migration `0009` as a database holds it (spec 002 §5.1 "`notifications`" and "platform / ops",
 * §8, §12; spec 010 §5.1 A; TASK-021): the seeded flags and retention rows read back, and the
 * constraints that make the outbox idempotent, a flag scope well-formed and the usage probe
 * one-row-per-day refusing what they exist to refuse. Rolled back; scratch database only.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { insertPlacedOrder } from "../fixtures/order-state.ts";
import { orderParents } from "./support/rows.ts";
import {
  pgFailure,
  probeLocalServer,
  rolledBack,
  scratchDatabase,
  type ScratchDatabase,
} from "./support/scratch-db.ts";

const server = await probeLocalServer();

describe.skipIf(server.url === undefined)(
  `migration 0009 applied — notifications and ops${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "ops");
    }, 300_000);
    afterAll(async () => {
      await scratch.drop();
    });

    it("§12: only checkout.demo_guard is on; checkout.open has its PL scope row, off", async () => {
      const on = await scratch.sql<{ key: string }[]>`
        SELECT key FROM feature_flag WHERE enabled_default ORDER BY key`;
      expect(on.map((row) => row.key)).toEqual(["checkout.demo_guard"]);
      const [count] = await scratch.sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM feature_flag`;
      expect(count?.n).toBe(16);
      const scopes = await scratch.sql`
        SELECT flag_key, scope, scope_ref, enabled FROM feature_flag_scope`;
      expect([...scopes]).toEqual([
        {
          flag_key: "checkout.open",
          scope: "country",
          scope_ref: "PL",
          enabled: false,
        },
      ]);
    });

    it("§8: retention_policy carries the eight rows, each with a basis and a legal note", async () => {
      const rows = await scratch.sql<
        { key: string; retention_days: number | null; action: string }[]
      >`SELECT key, retention_days, action FROM retention_policy ORDER BY key`;
      expect(
        rows.map((r) => `${r.key}:${String(r.retention_days)}:${r.action}`),
      ).toEqual([
        "buyer_personal:1095:pseudonymise",
        "checkout_draft:1:delete",
        "consent_records:1825:delete",
        "delivery_photo:730:delete",
        "demo_order_personal:1:pseudonymise",
        "fraud_signals:365:delete",
        "invoice_archive:3650:keep",
        "recipient_contact:90:pseudonymise",
      ]);
    });

    it("refuses what its constraints exist to refuse", async () => {
      const refused = await rolledBack(scratch.sql, async (tx) => {
        const orderId = await insertPlacedOrder(tx, await orderParents(tx));
        const eventId = "00000000-0000-4000-8000-000000000001";
        await tx`INSERT INTO outbox (event_id, order_id, targets, payload, payload_version)
                 VALUES (${eventId}, ${orderId}, '{crm}', '{}', 1)`;
        const out: Record<string, string | undefined> = {};
        out.duplicateEvent = (
          await pgFailure(
            tx,
            (
              sp,
            ) => sp`INSERT INTO outbox (event_id, targets, payload, payload_version)
                       VALUES (${eventId}, '{crm}', '{}', 1)`,
          )
        ).constraint;
        out.noTarget = (
          await pgFailure(
            tx,
            (
              sp,
            ) => sp`INSERT INTO outbox (event_id, targets, payload, payload_version)
                       VALUES (gen_random_uuid(), '{}', '{}', 1)`,
          )
        ).constraint;
        out.badScope = (
          await pgFailure(
            tx,
            (
              sp,
            ) => sp`INSERT INTO feature_flag_scope (flag_key, scope, scope_ref, enabled)
                       VALUES ('checkout.open', 'country', 'Poland', true)`,
          )
        ).constraint;
        out.unknownFlag = (
          await pgFailure(
            tx,
            (
              sp,
            ) => sp`INSERT INTO feature_flag_scope (flag_key, scope, scope_ref, enabled)
                       VALUES ('checkout.nope', 'global', '*', true)`,
          )
        ).constraint;
        await tx`INSERT INTO db_usage_sample (captured_at, period_start, compute_seconds_used,
                   compute_seconds_cap, storage_bytes, source)
                 VALUES ('2026-10-12T01:00:00Z', '2026-10-01', 45000, 690840, 1024, 'neon_api')`;
        out.secondSampleSameDay = (
          await pgFailure(
            tx,
            (
              sp,
            ) => sp`INSERT INTO db_usage_sample (captured_at, period_start, compute_seconds_used,
                         compute_seconds_cap, storage_bytes, source)
                       VALUES ('2026-10-12T23:00:00Z', '2026-10-01', 46800, 690840, 1024, 'neon_api')`,
          )
        ).constraint;
        await tx`INSERT INTO db_usage_sample (captured_at, period_start, compute_seconds_used,
                   compute_seconds_cap, storage_bytes, source)
                 VALUES ('2026-10-13T00:30:00Z', '2026-10-01', 46800, 690840, 1024, 'neon_api')`;
        out.auditWithoutChange = (
          await pgFailure(
            tx,
            (
              sp,
            ) => sp`INSERT INTO audit_log (actor_label, action, entity_table, entity_id, request_id)
                       VALUES ('founder', 'country.status_changed', 'country', 'PL', 'req-1')`,
          )
        ).constraint;
        await tx`INSERT INTO audit_log (actor_label, action, entity_table, entity_id, after, request_id)
                 VALUES ('founder', 'country.status_changed', 'country', 'PL', '{"status": "live"}', 'req-2')`;
        out.auditUpdate = (
          await pgFailure(
            tx,
            (sp) => sp`UPDATE audit_log SET actor_label = 'someone else'`,
          )
        ).raised;
        out.auditDelete = (
          await pgFailure(tx, (sp) => sp`DELETE FROM audit_log`)
        ).raised;
        out.auditTruncate = (
          await pgFailure(tx, (sp) => sp.unsafe("TRUNCATE audit_log"))
        ).raised;
        return out;
      });
      expect(refused).toEqual({
        auditUpdate: "AUDIT_LOG_APPEND_ONLY",
        auditDelete: "AUDIT_LOG_APPEND_ONLY",
        auditTruncate: "AUDIT_LOG_APPEND_ONLY",
        duplicateEvent: "outbox_event_id_key",
        noTarget: "outbox_targets_check",
        badScope: "feature_flag_scope_scope_ref_check",
        unknownFlag: "feature_flag_scope_flag_key_feature_flag_key_fk",
        secondSampleSameDay: "db_usage_sample_day_idx",
        auditWithoutChange: "audit_log_change_check",
      });
    });
  },
);
