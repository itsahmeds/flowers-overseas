/**
 * Spec 030b AC-42 (the job half), AC-43 (the role half), AC-44 and AC-57 for the florist contracts
 * (TASK-442), against scratch databases:
 *
 *  - `partners.contract_reminders` sends C1 once when the notice window opens in the florist's
 *    zone (not an hour before), nothing on a second run, nothing for a superseded version, one
 *    more after `review_on` is edited, and C2 once after the date; the emails carry the code,
 *    kind, version, date and link and never the legal name or the note;
 *  - `partner_contract` returns no row and refuses an insert for `partner`, `customer` and
 *    `public`; `admin` and `system` read every row; `app_build` has no grant;
 *  - `retention.sweep` deletes the objects and then the rows 10 years and 1 day after the
 *    offboarding, keeps them a day earlier and for a florist not offboarded; a failing object
 *    delete keeps the row, and the third failure raises the alert once;
 *  - `0041_partner_contracts` migrates, rolls back to the previous snapshot (`audit_mask_columns()`
 *    included) and migrates again; its down file refuses with one `partner_contract` row.
 */
import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createLogger } from "@/lib/logger";
import { InMemoryStorage, type Storage } from "@/lib/storage";
import { adminT } from "@/modules/admin/messages";
import { orderDetailHref } from "@/modules/admin/orders";
import {
  type MailMessage,
  sendOpsJobNotification,
} from "@/modules/notifications";
import {
  type OpsCopy,
  registerOpsEmailTemplates,
} from "@/modules/notifications/emails";
import { runContractReminders } from "@/modules/partners/contracts";

import {
  CONTRACT_PURGE_FAILED_ALERT,
  runRetentionSweep,
} from "../../src/jobs/retention.ts";
import { readCatalogue } from "../../scripts/db-check-live.ts";
import { drizzleOver } from "./support/drizzle-tx.ts";
import * as make from "./support/rows.ts";
import { runnerOf } from "./support/sql-runner.ts";
import {
  MIGRATE_LOCK,
  asApp,
  pgFailure,
  probeLocalServer,
  runner,
  scratchDatabase,
  type ScratchDatabase,
  type Sql,
  type Tx,
} from "./support/scratch-db.ts";

const server = await probeLocalServer();

const MIGRATIONS = resolve(import.meta.dirname, "../../db/migrations");
const FORWARD = readdirSync(MIGRATIONS)
  .filter(
    (name) => /^\d{4}_.+\.sql$/u.test(name) && !name.endsWith(".down.sql"),
  )
  .sort();
const MINE =
  FORWARD.find((name) => name.endsWith("_partner_contracts.sql")) ?? "";
const MY_VERSION = MINE.slice(0, 4);
const BEFORE = FORWARD[FORWARD.indexOf(MINE) - 1]?.slice(0, 4) ?? "";

const ORIGIN = "https://flowersoverseas.com";
const OPS = "ops@example.test";
const NOTE = "Clause 7 renegotiated over the phone.";
const LEGAL_NAME = "Test Florist";
const BUCKET = "fo-private-test";

const COPY: OpsCopy = {
  t: adminT as unknown as OpsCopy["t"],
  orderHref: orderDetailHref,
  contractsHref: (code) =>
    `/admin/partners/${encodeURIComponent(code)}/contracts`,
};

interface ContractFixture {
  readonly kind?: "agreement" | "dpa_addendum" | "annex";
  readonly version?: number;
  readonly reviewOn?: string | null;
  readonly noticeDays?: number;
  readonly note?: string | null;
  readonly supersededBy?: string | null;
}

/** One `partner_contract` row inserted as the owner (no RLS), its object key from its id. */
async function contract(
  tx: Tx,
  partnerId: string,
  uploader: string,
  fixture: ContractFixture = {},
): Promise<{ id: string; objectKey: string }> {
  const id = randomUUID();
  const objectKey = `originals/contract/${id}`;
  await tx`INSERT INTO locale (code, bcp47, name) VALUES ('en', 'en', 'English') ON CONFLICT DO NOTHING`;
  await tx`
    INSERT INTO partner_contract (id, partner_id, doc_kind, version_no, template_version,
                                  language_code, signed_on, effective_on, review_on, notice_days,
                                  note, bucket, object_key, bytes, page_count, checksum_sha256,
                                  uploaded_by, superseded_at, superseded_by)
    VALUES (${id}, ${partnerId}, ${fixture.kind ?? "agreement"}, ${fixture.version ?? 1},
            'pa-pl-2026-10', 'en', '2026-10-01', '2026-10-01', ${fixture.reviewOn ?? null},
            ${fixture.noticeDays ?? 30}, ${fixture.note ?? null}, ${BUCKET}, ${objectKey}, 8, 1,
            ${"0".repeat(64)}, ${uploader},
            CASE WHEN ${fixture.supersededBy ?? null}::uuid IS NULL THEN NULL ELSE now() END,
            ${fixture.supersededBy ?? null})`;
  return { id, objectKey };
}

/** Sets a florist offboarded at `at`, fixture only (triggers off for this statement). */
async function offboard(tx: Tx, partnerId: string, at: string): Promise<void> {
  await tx`SET LOCAL session_replication_role = replica`;
  await tx`UPDATE fulfillment_partner SET status = 'offboarded', offboarded_at = ${at}::timestamptz
           WHERE id = ${partnerId}`;
  await tx`SET LOCAL session_replication_role = origin`;
}

async function codeOf(sql: Sql, partnerId: string): Promise<string> {
  const [row] = await sql<{ code: string }[]>`
    SELECT code FROM fulfillment_partner WHERE id = ${partnerId}`;
  return row?.code ?? "";
}

describe.skipIf(server.url === undefined)(
  `spec 030b contract reminders, roles and retention${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    let countryId: string;
    const uploader = randomUUID();
    const lines: string[] = [];
    const log = createLogger({
      level: "trace",
      write: (line) => lines.push(line),
    });

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "contractjobs");
      await scratch.sql.begin(async (tx) => {
        countryId = await make.country(tx, "PL");
        await tx`INSERT INTO users (id, email) VALUES (${uploader}, 'founder@example.test')`;
      });
      registerOpsEmailTemplates(COPY, () => ORIGIN);
    }, 300_000);

    afterAll(async () => {
      await scratch.drop();
    });

    describe("partners.contract_reminders (AC-42)", () => {
      const mails: MailMessage[] = [];
      let clock = new Date("2026-10-31T22:30:00.000Z");
      const run = () =>
        runContractReminders({
          now: () => clock,
          log,
          transaction: (fn) =>
            scratch.sql.begin(async (tx) => {
              await asApp(tx, { role: "system" });
              return fn(drizzleOver(tx, scratch.sql));
            }) as never,
          send: (db, input) =>
            sendOpsJobNotification(
              {
                async execute(query) {
                  const rows: unknown = await db.execute(query);
                  return rows as never;
                },
              },
              { job: "partners.contract_reminders", ...input },
              {
                mailer: () => ({
                  send: (message) => {
                    mails.push(message);
                    return Promise.resolve({
                      providerRef: `re_${String(mails.length)}`,
                    });
                  },
                }),
                provider: () => "capture",
                emailEnabled: () => Promise.resolve(true),
                opsAddress: () => OPS,
                siteOrigin: () => ORIGIN,
                now: () => clock,
                log,
              },
            ),
        });

      it("sends C1 at 00:30 Warsaw on the first day of the window, once; nothing for a superseded version; one more after an edit; C2 once after the date", async () => {
        const { polish, contractId, superseded } = await scratch.sql.begin(
          async (tx) => {
            const polishId = await make.partner(tx, countryId, "onboarding");
            const current = await contract(tx, polishId, uploader, {
              reviewOn: "2026-12-01",
              noticeDays: 30,
              note: NOTE,
            });
            // A second florist: version 1 had the same dates and is superseded by version 2,
            // which has no review date.
            const otherId = await make.partner(tx, countryId, "onboarding");
            const v2 = await contract(tx, otherId, uploader, { version: 2 });
            const v1 = await contract(tx, otherId, uploader, {
              reviewOn: "2026-12-01",
              noticeDays: 30,
              supersededBy: v2.id,
            });
            return {
              polish: polishId,
              contractId: current.id,
              superseded: v1.id,
            };
          },
        );
        const code = await codeOf(scratch.sql, polish);

        // 23:30 on 31 October in Warsaw: the window opens tomorrow.
        clock = new Date("2026-10-31T22:30:00.000Z");
        expect(await run()).toEqual({ sent: 0, skipped: 0, held: 0 });
        expect(mails).toHaveLength(0);

        // 00:30 on 1 November in Warsaw.
        clock = new Date("2026-10-31T23:30:00.000Z");
        expect(await run()).toEqual({ sent: 1, skipped: 0, held: 0 });
        expect(mails).toHaveLength(1);
        const due = mails[0];
        expect(due?.to).toBe(OPS);
        expect(due?.subject).toBe(
          `Contract review due: ${code} · agreement v1 · 1 Dec 2026`,
        );
        expect(due?.text).toContain(`Florist: ${code}`);
        expect(due?.text).toContain("Document: Florist agreement v1");
        expect(due?.text).toContain("Review date: 1 Dec 2026, Europe/Warsaw");
        expect(due?.text).toContain(
          `${ORIGIN}/admin/partners/${code}/contracts`,
        );
        expect(due?.html).toContain("The review date is in 30 days.");

        // A second run and a retry of the same hour send nothing.
        expect(await run()).toEqual({ sent: 0, skipped: 1, held: 0 });
        expect(await run()).toEqual({ sent: 0, skipped: 1, held: 0 });
        expect(mails).toHaveLength(1);

        // The review date moves to 15 January: the window opens on 16 December, local.
        await scratch.sql.begin(async (tx) => {
          await tx`SET LOCAL session_replication_role = replica`;
          await tx`UPDATE partner_contract SET review_on = '2027-01-15' WHERE id = ${contractId}`;
        });
        clock = new Date("2026-12-15T22:30:00.000Z");
        expect(await run()).toEqual({ sent: 0, skipped: 0, held: 0 });
        clock = new Date("2026-12-15T23:30:00.000Z");
        expect(await run()).toEqual({ sent: 1, skipped: 0, held: 0 });
        expect(mails[1]?.subject).toBe(
          `Contract review due: ${code} · agreement v1 · 15 Jan 2027`,
        );

        // 00:30 on 16 January, local: the date has passed and the version is still current.
        clock = new Date("2027-01-15T23:30:00.000Z");
        expect(await run()).toEqual({ sent: 1, skipped: 0, held: 0 });
        expect(mails[2]?.subject).toBe(
          `Contract review date passed: ${code} · agreement v1`,
        );
        expect(await run()).toEqual({ sent: 0, skipped: 1, held: 0 });
        expect(mails).toHaveLength(3);

        const keys = await scratch.sql<
          { source_key: string; template_key: string; status: string }[]
        >`SELECT source_key, template_key, status FROM notification_delivery
          WHERE source_key LIKE 'job:partners.contract_reminders:%' ORDER BY created_at, id`;
        expect(keys).toEqual([
          {
            source_key: `job:partners.contract_reminders:${contractId}:2026-12-01:due`,
            template_key: "contract-review-due",
            status: "sent",
          },
          {
            source_key: `job:partners.contract_reminders:${contractId}:2027-01-15:due`,
            template_key: "contract-review-due",
            status: "sent",
          },
          {
            source_key: `job:partners.contract_reminders:${contractId}:2027-01-15:passed`,
            template_key: "contract-review-passed",
            status: "sent",
          },
        ]);
        expect(keys.some((row) => row.source_key.includes(superseded))).toBe(
          false,
        );

        // No email and no log line carries the legal name or the note (AC-42, AC-43).
        for (const mail of mails) {
          const all = `${mail.subject}${mail.text}${mail.html}`;
          expect(all).not.toContain(LEGAL_NAME);
          expect(all).not.toContain(NOTE);
        }
        const logged = lines.join("\n");
        expect(logged).not.toContain(LEGAL_NAME);
        expect(logged).not.toContain(NOTE);
        expect(
          lines.filter((line) =>
            line.includes('"msg":"partners.contract_reminder_sent"'),
          ),
        ).toHaveLength(3);
      });
    });

    describe("row-level security on partner_contract (AC-43)", () => {
      it("partner, customer and public read nothing and insert nothing; admin and system read every row; app_build has no grant", async () => {
        const own = await scratch.sql.begin(async (tx) => {
          const id = await make.partner(tx, countryId, "onboarding");
          await contract(tx, id, uploader, { kind: "annex" });
          return id;
        });
        const [total] = await scratch.sql<
          { n: number }[]
        >`SELECT count(*)::int AS n FROM partner_contract`;
        expect(total?.n).toBeGreaterThan(0);
        const insert = (tx: Tx) =>
          tx`INSERT INTO partner_contract (partner_id, doc_kind, version_no, template_version,
                 language_code, signed_on, effective_on, bucket, object_key, bytes, page_count,
                 checksum_sha256, uploaded_by)
               VALUES (${own}, 'annex', 9, 'pa-pl-2026-10', 'en', '2026-10-01', '2026-10-01',
                       ${BUCKET}, ${`originals/contract/${randomUUID()}`}, 8, 1,
                       ${"0".repeat(64)}, ${uploader})`;
        for (const context of [
          { role: "partner", userId: randomUUID(), partnerIds: [own] },
          { role: "customer", userId: randomUUID() },
          { role: "public" },
        ]) {
          await scratch.sql.begin(async (tx) => {
            await asApp(tx, context);
            const [seen] = await tx<
              { n: number }[]
            >`SELECT count(*)::int AS n FROM partner_contract`;
            expect(seen?.n, context.role).toBe(0);
            const refused = await pgFailure(tx, insert);
            expect(refused.code, context.role).toBe("42501");
          });
        }
        for (const role of ["admin", "system"]) {
          await scratch.sql.begin(async (tx) => {
            await asApp(tx, { role, userId: uploader });
            const [seen] = await tx<
              { n: number }[]
            >`SELECT count(*)::int AS n FROM partner_contract`;
            expect(seen?.n, role).toBe(total?.n);
          });
        }
        const [grants] = await scratch.sql<
          { any_grant: boolean }[]
        >`SELECT has_table_privilege('app_build', 'public.partner_contract',
                                     'SELECT, INSERT, UPDATE, DELETE') AS any_grant`;
        expect(grants?.any_grant).toBe(false);
      });
    });

    describe("retention.sweep on partner_contract (AC-44)", () => {
      const alerts: { alert: string; contractId: string | undefined }[] = [];
      const sweep = (now: Date, store: Storage) =>
        scratch.sql.begin(async (tx) => {
          await asApp(tx, { role: "system" });
          await tx`SELECT set_config('app.request_id', 'system:retention.sweep', true)`;
          return runRetentionSweep(runnerOf(tx), {
            now,
            dryRun: false,
            contractStorage: store,
            alert: (alert, fields) =>
              alerts.push({ alert, contractId: fields["contract_id"] }),
          });
        });

      it("deletes the objects then the rows 10 years and 1 day after the offboarding, keeps them a day earlier and for a florist still working", async () => {
        const storage = new InMemoryStorage();
        const { gone, staying } = await scratch.sql.begin(async (tx) => {
          const goneId = await make.partner(tx, countryId, "onboarding");
          const v2 = await contract(tx, goneId, uploader, { version: 2 });
          const v1 = await contract(tx, goneId, uploader, {
            supersededBy: v2.id,
          });
          await offboard(tx, goneId, "2016-06-01T10:00:00Z");
          const stayingId = await make.partner(tx, countryId, "onboarding");
          const kept = await contract(tx, stayingId, uploader, {
            kind: "annex",
          });
          return {
            gone: { id: goneId, keys: [v1.objectKey, v2.objectKey] },
            staying: { id: stayingId, keys: [kept.objectKey] },
          };
        });
        for (const objectKey of [...gone.keys, ...staying.keys]) {
          await storage.put({
            bucket: BUCKET,
            objectKey,
            body: new TextEncoder().encode("%PDF-1.7"),
            mime: "application/pdf",
          });
        }
        const count = async (partnerId: string) => {
          const [row] = await scratch.sql<{ n: number }[]>`
            SELECT count(*)::int AS n FROM partner_contract WHERE partner_id = ${partnerId}`;
          return row?.n;
        };
        const present = async (keys: readonly string[]) => {
          const found = await Promise.all(
            keys.map((objectKey) =>
              storage.head({ bucket: BUCKET, objectKey }),
            ),
          );
          return found.filter((head) => head !== null && head !== undefined)
            .length;
        };

        // 10 years less 1 day: kept.
        const kept = await sweep(new Date("2026-05-31T10:00:00Z"), storage);
        expect(await count(gone.id)).toBe(2);
        expect(await present(gone.keys)).toBe(2);
        expect(
          kept.policies.find((policy) => policy.key === "partner_contract"),
        ).toMatchObject({ status: "applied", counts: { partner_contract: 0 } });

        // 10 years and 1 day: the objects, then the rows; the working florist keeps its own.
        const swept = await sweep(new Date("2026-06-02T10:00:00Z"), storage);
        expect(
          swept.policies.find((policy) => policy.key === "partner_contract"),
        ).toMatchObject({
          status: "applied",
          counts: { partner_contract: 2, objects: 2 },
        });
        expect(await count(gone.id)).toBe(0);
        expect(await present(gone.keys)).toBe(0);
        expect(await count(staying.id)).toBe(1);
        expect(await present(staying.keys)).toBe(1);
        expect(alerts).toEqual([]);
      });

      it("a failing object delete keeps the row for the next sweep; the third failure raises the alert once", async () => {
        const healthy = new InMemoryStorage();
        const { partnerId, contractId, objectKey } = await scratch.sql.begin(
          async (tx) => {
            const id = await make.partner(tx, countryId, "onboarding");
            const row = await contract(tx, id, uploader);
            await offboard(tx, id, "2016-06-01T10:00:00Z");
            return {
              partnerId: id,
              contractId: row.id,
              objectKey: row.objectKey,
            };
          },
        );
        await healthy.put({
          bucket: BUCKET,
          objectKey,
          body: new TextEncoder().encode("%PDF-1.7"),
          mime: "application/pdf",
        });
        const failing: Storage = Object.assign(
          Object.create(healthy) as Storage,
          {
            delete: () => Promise.reject(new Error("R2 unavailable")),
          },
        );
        const count = async () => {
          const [row] = await scratch.sql<{ n: number }[]>`
            SELECT count(*)::int AS n FROM partner_contract WHERE partner_id = ${partnerId}`;
          return row?.n;
        };
        const at = new Date("2026-06-02T10:00:00Z");
        alerts.length = 0;
        for (const expected of [0, 0, 1, 1]) {
          const result = await sweep(at, failing);
          expect(
            result.policies.find((policy) => policy.key === "partner_contract"),
          ).toMatchObject({ skipped: { object_delete_failed: 1 } });
          expect(await count()).toBe(1);
          expect(alerts).toHaveLength(expected);
        }
        expect(alerts).toEqual([
          { alert: CONTRACT_PURGE_FAILED_ALERT, contractId },
        ]);
        await sweep(at, healthy);
        expect(await count()).toBe(0);
        expect(await healthy.head({ bucket: BUCKET, objectKey })).toBeFalsy();
      });
    });
  },
);

/* ---------------------------------------------------------------------------------------- */
/* AC-57: the guarded down file, on databases of their own                                   */
/* ---------------------------------------------------------------------------------------- */

async function rowCounts(sql: Sql): Promise<Record<string, number>> {
  const tables = await sql<{ name: string }[]>`
    SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY 1`;
  const out: Record<string, number> = {};
  for (const { name } of tables) {
    const [row] = await sql.unsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM public."${name}"`,
    );
    out[name] = row?.n ?? -1;
  }
  return out;
}

describe.skipIf(server.url === undefined)(
  `0041_partner_contracts rollback (AC-57)${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let fresh: ScratchDatabase;
    let used: ScratchDatabase;

    async function locked<T>(fn: () => Promise<T>): Promise<T> {
      const admin = postgres(server.url as string, {
        max: 1,
        onnotice: () => undefined,
      });
      await admin`SELECT pg_advisory_lock(${MIGRATE_LOCK})`;
      try {
        return await fn();
      } finally {
        await admin`SELECT pg_advisory_unlock(${MIGRATE_LOCK})`;
        await admin.end({ timeout: 5 });
      }
    }

    async function down(db: ScratchDatabase): Promise<string> {
      await locked(() => runner(db.url, ["--down", "--to", MY_VERSION]));
      try {
        await locked(() => runner(db.url, ["--down", "--to", BEFORE]));
        return "rolled back";
      } catch (error) {
        const stderr = (error as { stderr?: string }).stderr ?? "";
        return `${stderr} ${error instanceof Error ? error.message : String(error)}`;
      }
    }

    beforeAll(async () => {
      fresh = await scratchDatabase(server.url as string, "contracts_rb", {
        migrate: false,
      });
      used = await scratchDatabase(server.url as string, "contracts_used");
    }, 600_000);

    afterAll(async () => {
      await fresh.drop();
      await used.drop();
    });

    it("a clean database: down restores the previous catalogue, audit_mask_columns() included; migrate again", async () => {
      expect(MY_VERSION).toMatch(/^\d{4}$/u);
      expect(BEFORE < MY_VERSION).toBe(true);
      const later = FORWARD.filter((name) => name.slice(0, 4) >= MY_VERSION);
      await fresh.sql.unsafe(
        `CREATE TABLE public.schema_migrations (
           version text PRIMARY KEY, name text NOT NULL,
           applied_at timestamptz NOT NULL DEFAULT now())`,
      );
      for (const name of later) {
        await fresh.sql`INSERT INTO public.schema_migrations (version, name)
                        VALUES (${name.slice(0, 4)}, ${name.slice(5, -4)})`;
      }
      await locked(() => runner(fresh.url));
      const before = await readCatalogue(fresh.sql);
      await fresh.sql`DELETE FROM public.schema_migrations WHERE version >= ${MY_VERSION}`;
      await locked(() => runner(fresh.url));
      const withMine = await readCatalogue(fresh.sql);
      expect(
        withMine["functions"]?.["audit_mask_columns(p_table text)"],
      ).not.toEqual(before["functions"]?.["audit_mask_columns(p_table text)"]);
      expect(await down(fresh)).toBe("rolled back");
      expect(await readCatalogue(fresh.sql)).toEqual(before);
      await locked(() => runner(fresh.url));
      expect(await readCatalogue(fresh.sql)).toEqual(withMine);
    }, 600_000);

    it("PARTNER_CONTRACTS_ROLLBACK_ROWS_IN_USE with one partner_contract row; nothing changes", async () => {
      const uploader = randomUUID();
      const contractId = await used.sql.begin(async (tx) => {
        const countryId = await make.country(tx, "PL");
        const partnerId = await make.partner(tx, countryId, "onboarding");
        await tx`INSERT INTO users (id, email) VALUES (${uploader}, 'rb@example.test')`;
        return (await contract(tx, partnerId, uploader)).id;
      });
      await locked(() => runner(used.url, ["--down", "--to", MY_VERSION]));
      const catalogue = await readCatalogue(used.sql);
      const counts = await rowCounts(used.sql);
      expect(await down(used)).toContain(
        "PARTNER_CONTRACTS_ROLLBACK_ROWS_IN_USE",
      );
      expect(await readCatalogue(used.sql)).toEqual(catalogue);
      expect(await rowCounts(used.sql)).toEqual(counts);

      // With the row withdrawn (inside its 7 days), the down file runs.
      await used.sql`DELETE FROM partner_contract WHERE id = ${contractId}`;
      expect(await down(used)).toBe("rolled back");
      await locked(() => runner(used.url));
    }, 600_000);
  },
);
