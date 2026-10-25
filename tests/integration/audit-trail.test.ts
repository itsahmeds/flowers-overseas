/**
 * T-12 – T-15: the audit trail and the status-flip guard on a migrated scratch database (spec 012
 * §2.3, §5.1 `NNNN_audit_trail`, AC-10 – AC-13; TASK-218).
 *
 *  - T-12 (AC-10): for each of the ten audited tables, an insert, an update and a delete in admin
 *    context each write exactly one `audit_log` row naming actor, action, table, row id and
 *    request id; the same writes without `app.audit_action` raise `AUDIT_ACTION_MISSING` and leave
 *    the table as it was; an admin write to a `source`-carrying row leaves `source = 'real'`.
 *  - T-13 (AC-11): `UPDATE` and `DELETE` on `audit_log` raise; a partner's contact email change is
 *    logged with the column named and the mask in place of both addresses, which appear nowhere
 *    in the row.
 *  - T-14 (AC-12): a status change of `country` or `fulfillment_partner` outside admin context —
 *    as `app_web` under the `system` role, as `app_owner`, as the server's superuser — raises
 *    `STATUS_FLIP_OUTSIDE_ADMIN`; the same change through `withAdminContext` with an action
 *    succeeds; a seed insert of a `demo` country does too.
 *  - T-15 (AC-13): `logAdminRead` writes exactly one view row per call, with the viewer and the id
 *    and no before or after.
 *
 * The admin-context writes of T-12 and T-13 enter `app_web` with the session variables
 * `withAdminContext` sets (`asAdmin` below). T-14's admin path and T-15 run the real
 * `src/lib/db.ts` against the scratch database, so `withAdminContext`'s own `SET LOCAL
 * app.audit_action` is what the trigger reads.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  AUDIT_MASK,
  AUDITED_TABLES,
  logAdminRead,
} from "../../src/modules/admin/audit.ts";
import { country as insertCountry, partner, unique } from "./support/rows.ts";
import {
  asApp,
  pgFailure,
  probeLocalServer,
  rolledBack,
  scratchDatabase,
  type ScratchDatabase,
  type Tx,
} from "./support/scratch-db.ts";

const target = vi.hoisted(() => ({ url: "" }));
// `db.ts` reads the pool's URL through `@/lib/env`; point it at the scratch database.
vi.mock("@/lib/env", () => ({
  get env() {
    return { DATABASE_URL: target.url };
  },
}));
const reported = vi.hoisted(() => [] as string[]);
vi.mock("@/lib/sentry", () => ({
  captureGuardError: (signal: string) => {
    reported.push(signal);
  },
}));

const server = await probeLocalServer();

const FOUNDER_NAME = "Founder Test";

/** Enters `app_web` as an admin, with the audit settings `withAdminContext` issues. */
async function asAdmin(
  tx: Tx,
  context: { userId: string; action?: string; reason?: string },
): Promise<void> {
  await tx`SELECT set_config('app.audit_action', ${context.action ?? ""}, true)`;
  await tx`SELECT set_config('app.audit_reason', ${context.reason ?? ""}, true)`;
  await asApp(tx, { role: "admin", userId: context.userId });
}

interface AuditRow {
  actor_user_id: string | null;
  actor_label: string;
  action: string;
  entity_table: string;
  entity_id: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  request_id: string;
  reason: string | null;
  channel: string;
}

async function auditRows(
  tx: Tx,
  table: string,
  entityId: string,
): Promise<AuditRow[]> {
  return tx<AuditRow[]>`
    SELECT actor_user_id, actor_label, action, entity_table, entity_id, before, after,
           request_id, reason, channel
    FROM audit_log WHERE entity_table = ${table} AND entity_id = ${entityId}
    ORDER BY at, id`;
}

async function auditCount(tx: Tx): Promise<number> {
  const [row] = await tx<
    { n: number }[]
  >`SELECT count(*)::int AS n FROM audit_log`;
  return row?.n ?? 0;
}

/** One audited table: how to make its parents, and a row's insert, update and delete. */
interface TableCase {
  readonly table: (typeof AUDITED_TABLES)[number];
  /** Parent rows, made as the superuser before the admin context (no audit). */
  readonly parents: (tx: Tx) => Promise<Record<string, string>>;
  /** Inserts one row and returns the id the audit row names. */
  readonly insert: (tx: Tx, p: Record<string, string>) => Promise<string>;
  readonly update: (
    tx: Tx,
    id: string,
    p: Record<string, string>,
  ) => Promise<unknown>;
  readonly remove: (
    tx: Tx,
    id: string,
    p: Record<string, string>,
  ) => Promise<unknown>;
  /** A column the update changes. */
  readonly changed: string;
  readonly source: boolean;
}

async function one(query: Promise<{ id: string }[]>): Promise<string> {
  const [row] = await query;
  if (row === undefined) throw new Error("no row returned");
  return row.id;
}

async function product(tx: Tx): Promise<string> {
  return one(tx<{ id: string }[]>`
    INSERT INTO product (
      sku, product_type, primary_flower, colour_primary, style, price_tier,
      substitution_class, freshness_days
    )
    VALUES (${unique("ZZ-AUD-")}, 'bouquet', 'roses', 'red', 'classic', 'classic', 'main_flower', 5)
    RETURNING id`);
}

async function user(tx: Tx): Promise<string> {
  return one(tx<{ id: string }[]>`
    INSERT INTO users (email) VALUES (${`${unique("audit")}@example.test`}) RETURNING id`);
}

const CASES: readonly TableCase[] = [
  {
    table: "country",
    parents: async (tx) => {
      await insertCountry(tx);
      return {};
    },
    insert: (tx) =>
      one(tx<{ id: string }[]>`
        INSERT INTO country (iso2, currency_code, vat_rate_bp, iana_zone)
        VALUES ('DE', 'EUR', 1900, 'Europe/Berlin') RETURNING id`),
    update: (tx, id) =>
      tx`UPDATE country SET vat_rate_bp = 700 WHERE id = ${id}`,
    remove: (tx, id) => tx`DELETE FROM country WHERE id = ${id}`,
    changed: "vat_rate_bp",
    source: true,
  },
  {
    table: "fulfillment_partner",
    parents: async (tx) => ({ countryId: await insertCountry(tx) }),
    insert: (tx, p) =>
      one(tx<{ id: string }[]>`
        INSERT INTO fulfillment_partner (code, legal_name, city_label, country_id, status,
                                         contact_email, payout_currency_code, capacity_per_day)
        VALUES (${unique("audit-")}, 'Test Florist', 'Warszawa', ${p["countryId"] ?? ""}, 'onboarding',
                'florist@example.test', 'PLN', 6)
        RETURNING id`),
    update: (tx, id) =>
      tx`UPDATE fulfillment_partner SET capacity_per_day = 8 WHERE id = ${id}`,
    remove: (tx, id) => tx`DELETE FROM fulfillment_partner WHERE id = ${id}`,
    changed: "capacity_per_day",
    source: true,
  },
  {
    table: "partner_coverage",
    parents: async (tx) => {
      const countryId = await insertCountry(tx);
      const partnerId = await partner(tx, countryId);
      const cityId = await one(
        tx<
          { id: string }[]
        >`INSERT INTO city (country_id) VALUES (${countryId}) RETURNING id`,
      );
      return { partnerId, cityId };
    },
    insert: (tx, p) =>
      one(tx<{ id: string }[]>`
        INSERT INTO partner_coverage (partner_id, city_id)
        VALUES (${p["partnerId"] ?? ""}, ${p["cityId"] ?? ""}) RETURNING id`),
    update: (tx, id) =>
      tx`UPDATE partner_coverage SET capacity_per_day = 3 WHERE id = ${id}`,
    remove: (tx, id) => tx`DELETE FROM partner_coverage WHERE id = ${id}`,
    changed: "capacity_per_day",
    source: false,
  },
  {
    table: "partner_blackout",
    parents: async (tx) => ({
      partnerId: await partner(tx, await insertCountry(tx)),
    }),
    insert: async (tx, p) => {
      await tx`INSERT INTO partner_blackout (partner_id, date)
               VALUES (${p["partnerId"] ?? ""}, DATE '2027-02-14')`;
      return `${p["partnerId"] ?? ""}:2027-02-14`;
    },
    update: (tx, _id, p) =>
      tx`UPDATE partner_blackout SET reason = 'Holiday'
         WHERE partner_id = ${p["partnerId"] ?? ""} AND date = DATE '2027-02-14'`,
    remove: (tx, _id, p) =>
      tx`DELETE FROM partner_blackout
         WHERE partner_id = ${p["partnerId"] ?? ""} AND date = DATE '2027-02-14'`,
    changed: "reason",
    source: false,
  },
  {
    table: "partner_catalog_mapping",
    parents: async (tx) => ({
      partnerId: await partner(tx, await insertCountry(tx)),
      productId: await product(tx),
    }),
    insert: (tx, p) =>
      one(tx<{ id: string }[]>`
        INSERT INTO partner_catalog_mapping (partner_id, product_id, partner_payout_minor, currency_code)
        VALUES (${p["partnerId"] ?? ""}, ${p["productId"] ?? ""}, 2500, 'PLN') RETURNING id`),
    update: (tx, id) =>
      tx`UPDATE partner_catalog_mapping SET partner_payout_minor = 3000 WHERE id = ${id}`,
    remove: (tx, id) =>
      tx`DELETE FROM partner_catalog_mapping WHERE id = ${id}`,
    changed: "partner_payout_minor",
    source: true,
  },
  {
    table: "partner_application",
    parents: async (tx) => ({ countryId: await insertCountry(tx) }),
    // `0022_florists_v0` (TASK-211): country, contact and notice version are required.
    insert: (tx, p) =>
      one(tx<{ id: string }[]>`
        INSERT INTO partner_application (business_name, city, language_code, country_id,
                                         contact_name, contact_email, contact_phone,
                                         privacy_notice_version)
        VALUES ('Test Florist', 'Warszawa', 'en', ${p["countryId"] ?? ""}, 'Test Applicant',
                'applicant@example.test', '+48 500 000 000', '2026-10-04') RETURNING id`),
    update: (tx, id) =>
      tx`UPDATE partner_application SET status = 'contacted' WHERE id = ${id}`,
    remove: (tx, id) => tx`DELETE FROM partner_application WHERE id = ${id}`,
    changed: "status",
    source: false,
  },
  {
    table: "feature_flag",
    parents: () => Promise.resolve({}),
    insert: async (tx) => {
      await tx`INSERT INTO feature_flag (key, description)
               VALUES ('audit.test_flag', 'A flag for the audit test.')`;
      return "audit.test_flag";
    },
    update: (tx, id) =>
      tx`UPDATE feature_flag SET enabled_default = true WHERE key = ${id}`,
    remove: (tx, id) => tx`DELETE FROM feature_flag WHERE key = ${id}`,
    changed: "enabled_default",
    source: false,
  },
  {
    table: "feature_flag_scope",
    parents: async (tx) => {
      await tx`INSERT INTO feature_flag (key, description)
               VALUES ('audit.scope_flag', 'A scoped flag for the audit test.')`;
      return {};
    },
    insert: (tx) =>
      one(tx<{ id: string }[]>`
        INSERT INTO feature_flag_scope (flag_key, scope, scope_ref, enabled)
        VALUES ('audit.scope_flag', 'country', 'DE', true) RETURNING id`),
    update: (tx, id) =>
      tx`UPDATE feature_flag_scope SET enabled = false WHERE id = ${id}`,
    remove: (tx, id) => tx`DELETE FROM feature_flag_scope WHERE id = ${id}`,
    changed: "enabled",
    source: false,
  },
  {
    table: "user_role",
    parents: async (tx) => ({ userId: await user(tx) }),
    insert: async (tx, p) => {
      await tx`INSERT INTO user_role (user_id, role) VALUES (${p["userId"] ?? ""}, 'ops')`;
      return `${p["userId"] ?? ""}:ops`;
    },
    update: (tx, _id, p) =>
      tx`UPDATE user_role SET created_at = created_at - interval '1 day'
         WHERE user_id = ${p["userId"] ?? ""} AND role = 'ops'`,
    remove: (tx, _id, p) =>
      tx`DELETE FROM user_role WHERE user_id = ${p["userId"] ?? ""} AND role = 'ops'`,
    changed: "created_at",
    source: false,
  },
  {
    table: "admin_profile",
    parents: async (tx) => ({ userId: await user(tx) }),
    insert: async (tx, p) => {
      await tx`INSERT INTO admin_profile (user_id, display_name)
               VALUES (${p["userId"] ?? ""}, 'Audit Person')`;
      return p["userId"] ?? "";
    },
    update: (tx, id) =>
      tx`UPDATE admin_profile SET display_name = 'Audit Person Two' WHERE user_id = ${id}`,
    remove: (tx, id) => tx`DELETE FROM admin_profile WHERE user_id = ${id}`,
    changed: "display_name",
    source: false,
  },
];

describe.skipIf(server.url === undefined)(
  `audit trail and status-flip guard${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    let founder = "";

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "audit");
      target.url = scratch.url;
      founder = randomUUID();
      await scratch.sql`INSERT INTO users (id, email) VALUES (${founder}, 'founder@example.test')`;
      await scratch.sql`INSERT INTO admin_profile (user_id, display_name) VALUES (${founder}, ${FOUNDER_NAME})`;
    }, 600_000);

    afterAll(async () => {
      await scratch?.drop();
    });

    it("covers exactly the ten tables of §5.1", async () => {
      expect(CASES.map((c) => c.table)).toEqual([...AUDITED_TABLES]);
      const triggers = await scratch.sql<{ table: string }[]>`
        SELECT c.relname AS table FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_proc p ON p.oid = t.tgfoid
        WHERE p.proname = 'audit_row_change' AND NOT t.tgisinternal
        ORDER BY 1`;
      expect(triggers.map((row) => row.table)).toEqual(
        [...AUDITED_TABLES].sort(),
      );
    });

    describe.each(CASES)("T-12 (AC-10): $table", (c) => {
      it("insert, update and delete in admin context each write exactly one audit row", async () => {
        const result = await rolledBack(scratch.sql, async (tx) => {
          const p = await c.parents(tx);
          const start = await auditCount(tx);
          await asAdmin(tx, { userId: founder, action: "audit_test.insert" });
          const id = await c.insert(tx, p);
          const afterInsert = await auditRows(tx, c.table, id);
          await tx`SELECT set_config('app.audit_action', 'audit_test.update', true)`;
          await c.update(tx, id, p);
          await tx`SELECT set_config('app.audit_action', 'audit_test.delete', true)`;
          await c.remove(tx, id, p);
          return {
            id,
            afterInsert: afterInsert.length,
            rows: await auditRows(tx, c.table, id),
            added: (await auditCount(tx)) - start,
          };
        });
        expect(result.afterInsert).toBe(1);
        expect(result.added).toBe(3);
        expect(result.rows.map((row) => row.action)).toEqual([
          "audit_test.insert",
          "audit_test.update",
          "audit_test.delete",
        ]);
        for (const row of result.rows) {
          expect(row).toMatchObject({
            actor_user_id: founder,
            actor_label: FOUNDER_NAME,
            entity_table: c.table,
            entity_id: result.id,
            request_id: "integration-test",
            channel: "admin",
            reason: null,
          });
        }
        const [inserted, updated, deleted] = result.rows;
        expect(inserted?.before).toBeNull();
        expect(inserted?.after).not.toBeNull();
        expect(Object.keys(updated?.after ?? {})).toContain(c.changed);
        expect(Object.keys(updated?.before ?? {})).toContain(c.changed);
        expect(updated?.before?.[c.changed]).not.toEqual(
          updated?.after?.[c.changed],
        );
        expect(deleted?.before).not.toBeNull();
        expect(deleted?.after).toBeNull();
      });

      it("without app.audit_action, the insert, the update and the delete each raise AUDIT_ACTION_MISSING and leave the table as it was", async () => {
        const result = await rolledBack(scratch.sql, async (tx) => {
          const p = await c.parents(tx);
          const read = async (): Promise<string> => {
            const [row] = await tx.unsafe<{ rows: string }[]>(
              `SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]')::text AS rows
               FROM public.${c.table} t`,
            );
            return row?.rows ?? "";
          };
          const empty = await read();
          const start = await auditCount(tx);
          await asAdmin(tx, { userId: founder });
          const insert = await pgFailure(tx, (sp) => c.insert(sp, p));
          const afterInsert = await read();
          // The row the update and the delete aim at, written outside admin context (no audit).
          await tx.unsafe("RESET ROLE");
          await tx`SELECT set_config('app.role', '', true)`;
          const existing = await c.insert(tx, p);
          const withRow = await read();
          await asAdmin(tx, { userId: founder });
          const update = await pgFailure(tx, (sp) => c.update(sp, existing, p));
          const remove = await pgFailure(tx, (sp) => c.remove(sp, existing, p));
          return {
            raised: [insert.raised, update.raised, remove.raised],
            insertChanged: afterInsert !== empty,
            rowUnchanged: (await read()) === withRow,
            added: (await auditCount(tx)) - start,
          };
        });
        expect(result).toEqual({
          raised: [
            "AUDIT_ACTION_MISSING",
            "AUDIT_ACTION_MISSING",
            "AUDIT_ACTION_MISSING",
          ],
          insertChanged: false,
          rowUnchanged: true,
          added: 0,
        });
      });

      if (c.source) {
        it("an admin insert and an admin update of a seeded row leave source = 'real'", async () => {
          const result = await rolledBack(scratch.sql, async (tx) => {
            const p = await c.parents(tx);
            const seeded = await c.insert(tx, p);
            const seededSource = await tx.unsafe<{ source: string }[]>(
              `SELECT source FROM public.${c.table} WHERE id = $1`,
              [seeded],
            );
            await asAdmin(tx, { userId: founder, action: "audit_test.update" });
            await c.update(tx, seeded, p);
            const updated = await tx.unsafe<{ source: string }[]>(
              `SELECT source FROM public.${c.table} WHERE id = $1`,
              [seeded],
            );
            await c.remove(tx, seeded, p);
            await tx`SELECT set_config('app.audit_action', 'audit_test.insert', true)`;
            const inserted = await c.insert(tx, p);
            const fresh = await tx.unsafe<{ source: string }[]>(
              `SELECT source FROM public.${c.table} WHERE id = $1`,
              [inserted],
            );
            return {
              seeded: seededSource[0]?.source,
              updated: updated[0]?.source,
              fresh: fresh[0]?.source,
            };
          });
          expect(result).toEqual({
            seeded: "seed",
            updated: "real",
            fresh: "real",
          });
        });
      }
    });

    it("T-12: a write outside admin context (the seed, a job) writes no audit row", async () => {
      const added = await rolledBack(scratch.sql, async (tx) => {
        const start = await auditCount(tx);
        const countryId = await insertCountry(tx);
        await partner(tx, countryId);
        await asApp(tx, { role: "system" });
        await tx`UPDATE fulfillment_partner SET capacity_per_day = 9`;
        return (await auditCount(tx)) - start;
      });
      expect(added).toBe(0);
    });

    describe("T-13 (AC-11)", () => {
      it("UPDATE and DELETE on audit_log raise, for the admin context and for the owner", async () => {
        const result = await rolledBack(scratch.sql, async (tx) => {
          const countryId = await insertCountry(tx);
          await asAdmin(tx, { userId: founder, action: "audit_test.insert" });
          await partner(tx, countryId);
          const asAdminUpdate = await pgFailure(
            tx,
            (sp) => sp`UPDATE audit_log SET action = 'audit_test.forged'`,
          );
          const asAdminDelete = await pgFailure(
            tx,
            (sp) => sp`DELETE FROM audit_log`,
          );
          await tx.unsafe("RESET ROLE");
          await tx.unsafe("SET LOCAL ROLE app_owner");
          const asOwnerUpdate = await pgFailure(
            tx,
            (sp) => sp`UPDATE audit_log SET reason = 'forged'`,
          );
          const asOwnerDelete = await pgFailure(
            tx,
            (sp) => sp`DELETE FROM audit_log`,
          );
          return [
            asAdminUpdate,
            asAdminDelete,
            asOwnerUpdate,
            asOwnerDelete,
          ].map((failure) => failure.raised);
        });
        expect(result).toEqual([
          "AUDIT_LOG_APPEND_ONLY",
          "AUDIT_LOG_APPEND_ONLY",
          "AUDIT_LOG_APPEND_ONLY",
          "AUDIT_LOG_APPEND_ONLY",
        ]);
      });

      it("a partner's contact email change names the column and stores the mask, never either address", async () => {
        const oldAddress = "old.florist@example.test";
        const newAddress = "new.florist@example.test";
        const rows = await rolledBack(scratch.sql, async (tx) => {
          const countryId = await insertCountry(tx);
          const id = await partner(tx, countryId);
          await tx`UPDATE fulfillment_partner SET contact_email = ${oldAddress} WHERE id = ${id}`;
          await asAdmin(tx, { userId: founder, action: "partner.update" });
          await tx`UPDATE fulfillment_partner SET contact_email = ${newAddress} WHERE id = ${id}`;
          return tx<
            {
              before: Record<string, unknown>;
              after: Record<string, unknown>;
              whole: string;
            }[]
          >`
            SELECT before, after, to_jsonb(audit_log)::text AS whole FROM audit_log
            WHERE entity_table = 'fulfillment_partner' AND entity_id = ${id}`;
        });
        expect(rows).toHaveLength(1);
        const [row] = rows;
        expect(row?.before["contact_email"]).toBe(AUDIT_MASK);
        expect(row?.after["contact_email"]).toBe(AUDIT_MASK);
        expect(row?.whole).not.toContain(oldAddress);
        expect(row?.whole).not.toContain(newAddress);
        expect(row?.whole).not.toContain("florist@example");
      });

      it("masks every personal column of a partner and an application on insert, and leaves the others readable", async () => {
        const result = await rolledBack(scratch.sql, async (tx) => {
          const countryId = await insertCountry(tx);
          await asAdmin(tx, { userId: founder, action: "audit_test.insert" });
          const [created] = await tx<{ id: string }[]>`
            INSERT INTO fulfillment_partner (code, legal_name, city_label, country_id, status,
                                             contact_email, contact_phone, payout_currency_code,
                                             capacity_per_day)
            VALUES ('audit-mask', 'Kwiaciarnia Jana Kowalskiego', 'Warszawa', ${countryId},
                    'onboarding', 'jan.kowalski@example.test', '+48500000001', 'PLN', 6)
            RETURNING id`;
          const [application] = await tx<{ id: string }[]>`
            INSERT INTO partner_application (business_name, city, language_code, contact_email,
                                             contact_phone, registration_number, website_url,
                                             country_id, contact_name, privacy_notice_version)
            VALUES ('Kwiaty Anny Nowak', 'Krakow', 'en', 'anna.nowak@example.test', '+48500000002',
                    '5250000000', 'https://florist.example.test', ${countryId}, 'Anna Nowak',
                    '2026-10-04')
            RETURNING id`;
          return tx<
            {
              entity_table: string;
              after: Record<string, unknown>;
              whole: string;
            }[]
          >`
            SELECT entity_table, after, to_jsonb(audit_log)::text AS whole FROM audit_log
            WHERE entity_id IN (${created?.id ?? ""}, ${application?.id ?? ""})
            ORDER BY entity_table`;
        });
        const partnerRow = result.find(
          (r) => r.entity_table === "fulfillment_partner",
        );
        const applicationRow = result.find(
          (r) => r.entity_table === "partner_application",
        );
        for (const column of ["legal_name", "contact_email", "contact_phone"]) {
          expect(partnerRow?.after[column], column).toBe(AUDIT_MASK);
        }
        expect(partnerRow?.after["city_label"]).toBe("Warszawa");
        expect(partnerRow?.after["code"]).toBe("audit-mask");
        for (const column of [
          "business_name",
          "contact_name",
          "contact_email",
          "contact_phone",
          "registration_number",
        ]) {
          expect(applicationRow?.after[column], column).toBe(AUDIT_MASK);
        }
        expect(applicationRow?.after["city"]).toBe("Krakow");
        const text = result.map((r) => r.whole).join("\n");
        for (const secret of [
          "Kowalsk",
          "Nowak",
          "+48500000001",
          "+48500000002",
          "5250000000",
          '@example.test"',
        ]) {
          expect(text, secret).not.toContain(secret);
        }
      });

      it("records the reason and the channel the transaction carries", async () => {
        const [row] = await rolledBack(scratch.sql, async (tx) => {
          await tx`SELECT set_config('app.audit_channel', 'cli', true)`;
          await asAdmin(tx, {
            userId: founder,
            action: "flag.checkout_open.on",
            reason: "Demo call at 11:00",
          });
          await tx`INSERT INTO feature_flag (key, description) VALUES ('audit.reason_flag', 'Reason test.')`;
          return auditRows(tx, "feature_flag", "audit.reason_flag");
        });
        expect(row).toMatchObject({
          reason: "Demo call at 11:00",
          channel: "cli",
          action: "flag.checkout_open.on",
        });
      });
    });

    describe("T-14 (AC-12)", () => {
      const statusUpdates = [
        [
          "country",
          (tx: Tx, id: string) =>
            tx`UPDATE country SET status = 'live' WHERE id = ${id}`,
        ],
        [
          "fulfillment_partner",
          (tx: Tx, id: string) =>
            tx`UPDATE fulfillment_partner SET status = 'active' WHERE id = ${id}`,
        ],
      ] as const;

      async function ids(tx: Tx) {
        const countryId = await insertCountry(tx);
        const partnerId = await partner(tx, countryId, "onboarding");
        return { country: countryId, fulfillment_partner: partnerId };
      }

      it.each(statusUpdates)(
        "a %s status change raises STATUS_FLIP_OUTSIDE_ADMIN as app_web (system role), as app_owner and as the superuser",
        async (table, update) => {
          const raised = await rolledBack(scratch.sql, async (tx) => {
            const id = (await ids(tx))[table];
            const asSuperuser = await pgFailure(tx, (sp) => update(sp, id));
            await tx.unsafe("SET LOCAL ROLE app_owner");
            const asOwner = await pgFailure(tx, (sp) => update(sp, id));
            await tx.unsafe("RESET ROLE");
            await asApp(tx, { role: "system" });
            const asSystem = await pgFailure(tx, (sp) => update(sp, id));
            return [asSuperuser.raised, asOwner.raised, asSystem.raised];
          });
          expect(raised).toEqual([
            "STATUS_FLIP_OUTSIDE_ADMIN",
            "STATUS_FLIP_OUTSIDE_ADMIN",
            "STATUS_FLIP_OUTSIDE_ADMIN",
          ]);
        },
      );

      it("other columns still change outside admin, and a seed insert of a demo country succeeds", async () => {
        const result = await rolledBack(scratch.sql, async (tx) => {
          const { country: countryId, fulfillment_partner: partnerId } =
            await ids(tx);
          await tx`UPDATE country SET vat_rate_bp = 2300 WHERE id = ${countryId}`;
          await tx`UPDATE fulfillment_partner SET capacity_per_day = 9 WHERE id = ${partnerId}`;
          await tx`UPDATE fulfillment_partner SET status = status WHERE id = ${partnerId}`;
          const [seeded] = await tx<{ status: string; source: string }[]>`
            INSERT INTO country (iso2, currency_code, vat_rate_bp, iana_zone, status)
            VALUES ('CZ', 'EUR', 2100, 'Europe/Prague', 'demo') RETURNING status, source`;
          return seeded;
        });
        expect(result).toEqual({ status: "demo", source: "seed" });
      });

      it("the same changes inside withAdminContext with an action succeed and are audited", async () => {
        const { country: countryId, fulfillment_partner: partnerId } =
          await scratch.sql.begin((tx) => ids(tx));
        const db = await import("../../src/lib/db.ts");
        const { country, fulfillmentPartner } =
          await import("../../db/schema/index.ts");
        const { eq } = await import("drizzle-orm");
        await db.withAdminContext(
          { userId: founder, action: "country.status.live" },
          (tx) =>
            tx
              .update(country)
              .set({ status: "live" })
              .where(eq(country.id, countryId)),
        );
        await db.withAdminContext(
          {
            userId: founder,
            action: "partner.status.active",
            reason: "Terms signed",
          },
          (tx) =>
            tx
              .update(fulfillmentPartner)
              .set({ status: "active" })
              .where(eq(fulfillmentPartner.id, partnerId)),
        );
        const [c] = await scratch.sql<
          { status: string }[]
        >`SELECT status FROM country WHERE id = ${countryId}`;
        const [p] = await scratch.sql<
          { status: string }[]
        >`SELECT status FROM fulfillment_partner WHERE id = ${partnerId}`;
        expect(c?.status).toBe("live");
        expect(p?.status).toBe("active");
        const rows = await scratch.sql<
          {
            action: string;
            reason: string | null;
            before: Record<string, unknown>;
            after: Record<string, unknown>;
          }[]
        >`
          SELECT action, reason, before, after FROM audit_log
          WHERE entity_id IN (${countryId}, ${partnerId}) ORDER BY at`;
        expect(
          rows.map((r) => [
            r.action,
            r.reason,
            r.before["status"],
            r.after["status"],
          ]),
        ).toEqual([
          ["country.status.live", null, "demo", "live"],
          ["partner.status.active", "Terms signed", "onboarding", "active"],
        ]);
      });

      it("an admin-context write with no action through db.ts raises, is logged as an error and reported to Sentry", async () => {
        const db = await import("../../src/lib/db.ts");
        const { fulfillmentPartner } = await import("../../db/schema/index.ts");
        reported.length = 0;
        await expect(
          db.withDbContext(
            { role: "admin", requestId: "audit-missing" },
            (tx) => tx.update(fulfillmentPartner).set({ capacityPerDay: 11 }),
          ),
        ).rejects.toMatchObject({
          cause: { message: expect.stringMatching(/^AUDIT_ACTION_MISSING:/) },
        });
        await expect(
          db.withDbContext(
            { role: "system", requestId: "flip-attempt" },
            (tx) => tx.update(fulfillmentPartner).set({ status: "paused" }),
          ),
        ).rejects.toMatchObject({
          cause: {
            message: expect.stringMatching(/^STATUS_FLIP_OUTSIDE_ADMIN:/),
          },
        });
        expect(reported).toEqual([
          "AUDIT_ACTION_MISSING",
          "STATUS_FLIP_OUTSIDE_ADMIN",
        ]);
      });
    });

    describe("T-15 (AC-13)", () => {
      it("logAdminRead writes exactly one view row per call: viewer, entity, id, no values", async () => {
        const orderId = randomUUID();
        const applicationId = randomUUID();
        const requestId = randomUUID();
        const [{ n: start } = { n: 0 }] = await scratch.sql<
          { n: number }[]
        >`SELECT count(*)::int AS n FROM audit_log`;
        await logAdminRead({ userId: founder, requestId }, "order", orderId);
        await logAdminRead(
          { userId: founder, requestId },
          "application",
          applicationId,
        );
        const rows = await scratch.sql<AuditRow[]>`
          SELECT actor_user_id, actor_label, action, entity_table, entity_id, before, after,
                 request_id, reason, channel
          FROM audit_log WHERE request_id = ${requestId} ORDER BY at, id`;
        const [{ n: end } = { n: 0 }] = await scratch.sql<
          { n: number }[]
        >`SELECT count(*)::int AS n FROM audit_log`;
        expect(end - start).toBe(2);
        expect(rows).toEqual([
          {
            actor_user_id: founder,
            actor_label: FOUNDER_NAME,
            action: "order.viewed",
            entity_table: "order",
            entity_id: orderId,
            before: null,
            after: null,
            request_id: requestId,
            reason: null,
            channel: "admin",
          },
          {
            actor_user_id: founder,
            actor_label: FOUNDER_NAME,
            action: "application.viewed",
            entity_table: "partner_application",
            entity_id: applicationId,
            before: null,
            after: null,
            request_id: requestId,
            reason: null,
            channel: "admin",
          },
        ]);
      });

      it("a view is recorded only in admin context, only under a .viewed action, and a view row carries no values", async () => {
        const result = await rolledBack(scratch.sql, async (tx) => {
          await asApp(tx, { role: "system" });
          const outside = await pgFailure(
            tx,
            (sp) =>
              sp`SELECT public.audit_record_view('order', ${randomUUID()})`,
          );
          await tx.unsafe("RESET ROLE");
          await asAdmin(tx, { userId: founder, action: "order.update" });
          const wrongAction = await pgFailure(
            tx,
            (sp) =>
              sp`SELECT public.audit_record_view('order', ${randomUUID()})`,
          );
          const forged = await pgFailure(
            tx,
            (
              sp,
            ) => sp`INSERT INTO audit_log (actor_label, action, entity_table, entity_id, before, request_id)
                       VALUES ('x', 'order.viewed', 'order', 'x', '{"a":1}', 'r')`,
          );
          const direct = await pgFailure(
            tx,
            (sp) => sp`SELECT public.audit_write('order', 'x', NULL, NULL)`,
          );
          return {
            outside: outside.raised,
            wrongAction: wrongAction.raised,
            forged: forged.constraint,
            direct: direct.code,
          };
        });
        expect(result).toEqual({
          outside: "AUDIT_VIEW_OUTSIDE_ADMIN",
          wrongAction: "AUDIT_ACTION_MISSING",
          forged: "audit_log_view_check",
          // `audit_write` is the triggers' own: the runtime role cannot call it.
          direct: "42501",
        });
      });
    });
  },
);
