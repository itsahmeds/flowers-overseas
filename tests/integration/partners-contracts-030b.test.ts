/**
 * Spec 030b T-31 to T-35, AC-37 to AC-41, AC-43 (log half) and AC-59 against a scratch database
 * (TASK-442). The storage is `InMemoryStorage` on an injected clock, so the 59 and 61 second
 * checks of a signed URL are exact:
 *
 *  - upload stores the bytes unchanged at `originals/contract/{id}`, version 1, one audit row,
 *    and copies an agreement's signed date and template into the profile terms;
 *  - a second agreement supersedes the first in one transaction; a stale `expectedCurrentId` is
 *    `version_conflict` with no row and no object; two annexes stay current;
 *  - the immutability trigger refuses a changed file column;
 *  - withdraw inside 7 days restores version 1 and its terms; after 7 days the command and the
 *    trigger refuse; the only agreement of an active florist pauses it;
 *  - the download URL serves the bytes as an attachment at 59 seconds and 403 at 61; an altered
 *    object is `checksum_mismatch` with the alert;
 *  - `→ active` without an agreement is refused by the trigger, also with only an addendum;
 *  - no captured log line carries the note, the reason, an object key or a signed URL.
 */
import { createHash, randomUUID } from "node:crypto";

import { PDFDocument } from "@cantoo/pdf-lib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createLogger } from "@/lib/logger";
import { InMemoryStorage } from "@/lib/storage";
import type { PartnerAdminRunner } from "@/modules/partners";
import {
  type ContractDeps,
  contractDownloadUrl,
  editContractDetails,
  partnerContracts,
  uploadContract,
  withdrawContract,
} from "@/modules/partners/contracts";

import { drizzleOver } from "./support/drizzle-tx.ts";
import * as make from "./support/rows.ts";
import {
  asApp,
  pgFailure,
  probeLocalServer,
  scratchDatabase,
  type ScratchDatabase,
} from "./support/scratch-db.ts";

const server = await probeLocalServer();

const NOTE = "Replaces v1 after the delivery fee clause.";
const REASON = "Uploaded the unsigned draft by mistake.";
const BUCKET = "fo-private-test";

describe.skipIf(server.url === undefined)(
  `spec 030b florist contracts${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    let run: PartnerAdminRunner;
    let countryId: string;
    let clock = new Date("2026-10-28T10:00:00.000Z");
    const storage = new InMemoryStorage({ now: () => clock });
    const lines: string[] = [];
    const alerts: string[] = [];
    const adminId = randomUUID();
    const actor = { userId: adminId, requestId: "it-partners-contracts" };
    let pdf2: Uint8Array;

    function deps(): Partial<ContractDeps> {
      return {
        store: async () => ({ storage, bucket: BUCKET }),
        run,
        now: () => clock,
        log: createLogger({
          level: "trace",
          write: (line) => lines.push(line),
        }),
        alert: (alert) => alerts.push(alert),
      };
    }

    const fields = (patch: Record<string, string> = {}) => ({
      docKind: "agreement",
      templateVersion: "pa-pl-2026-10",
      languageCode: "pl",
      signedOn: "2026-10-20",
      effectiveOn: "2026-10-21",
      noticeDays: "30",
      expectedCurrentId: "",
      ...patch,
    });

    async function newPartner(status: make.PartnerStatus = "onboarding") {
      const id = await scratch.sql.begin((tx) =>
        make.partner(tx, countryId, status),
      );
      const [row] = await scratch.sql<{ code: string }[]>`
        SELECT code FROM fulfillment_partner WHERE id = ${id}`;
      return { id, code: row?.code ?? "" };
    }

    async function rows(partnerId: string) {
      return scratch.sql<
        {
          id: string;
          doc_kind: string;
          version_no: number;
          object_key: string;
          checksum_sha256: string;
          superseded_by: string | null;
          updated_at: string;
        }[]
      >`SELECT id, doc_kind, version_no, object_key, checksum_sha256, superseded_by,
               to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at
        FROM partner_contract WHERE partner_id = ${partnerId}
        ORDER BY doc_kind, version_no`;
    }

    async function profile(partnerId: string) {
      const [row] = await scratch.sql<
        {
          status: string;
          terms_signed_at: string | null;
          terms_version: string | null;
        }[]
      >`SELECT status, terms_signed_at::text AS terms_signed_at, terms_version
        FROM fulfillment_partner WHERE id = ${partnerId}`;
      return row;
    }

    /**
     * Moves an upload into the past. The window is measured against the database's `now()` (the
     * trigger) and the row's `uploaded_at`, so the test moves the row, not the clock; the
     * immutability trigger is bypassed for the fixture only (`session_replication_role`).
     */
    async function backdate(contractId: string, interval: string) {
      await scratch.sql.begin(async (tx) => {
        await tx`SET LOCAL session_replication_role = replica`;
        await tx`UPDATE partner_contract SET uploaded_at = now() - ${interval}::interval
                 WHERE id = ${contractId}`;
      });
    }

    beforeAll(async () => {
      scratch = await scratchDatabase(
        server.url as string,
        "partnerscontracts",
      );
      await scratch.sql.begin(async (tx) => {
        countryId = await make.country(tx, "PL");
        await tx`INSERT INTO users (id, email, name) VALUES (${adminId}, 'founder@example.test', 'Test Admin')`;
      });
      run = (context, fn) =>
        scratch.sql.begin(async (tx) => {
          await tx`SELECT set_config('app.audit_action', ${context.action}, true)`;
          if (context.reason !== undefined) {
            await tx`SELECT set_config('app.audit_reason', ${context.reason}, true)`;
          }
          await asApp(tx, {
            role: "admin",
            ...(context.userId === undefined ? {} : { userId: context.userId }),
          });
          return fn(drizzleOver(tx, scratch.sql));
        }) as never;
      const doc = await PDFDocument.create();
      doc.addPage([200, 200]);
      doc.addPage([200, 200]);
      pdf2 = await doc.save();
    }, 300_000);

    afterAll(async () => {
      await scratch.drop();
    });

    describe("T-31 · upload, supersede and terms sync (AC-37, AC-38, AC-39)", () => {
      it("stores the bytes unchanged, version 1, one audit row, and copies the terms", async () => {
        clock = new Date("2026-10-28T10:00:00.000Z");
        const { id } = await newPartner();
        const result = await uploadContract(
          actor,
          id,
          fields({ note: NOTE }),
          pdf2,
          deps(),
        );
        expect(result).toMatchObject({ ok: true, versionNo: 1 });
        const [row] = await rows(id);
        expect(row?.object_key).toBe(`originals/contract/${row?.id}`);
        const head = await storage.head({
          bucket: BUCKET,
          objectKey: row?.object_key ?? "",
        });
        expect(head?.bytes).toBe(pdf2.byteLength);
        expect(row?.checksum_sha256).toBe(
          createHash("sha256").update(pdf2).digest("hex"),
        );
        expect(await profile(id)).toMatchObject({
          terms_signed_at: "2026-10-20",
          terms_version: "pa-pl-2026-10",
        });
        const audit = await scratch.sql<
          { action: string; after: { note?: unknown } }[]
        >`
          SELECT action, after FROM audit_log
          WHERE entity_table = 'partner_contract' AND entity_id = ${row?.id ?? ""}`;
        expect(audit.map((a) => a.action)).toEqual(["partner_contract.upload"]);
        expect(JSON.stringify(audit[0]?.after)).not.toContain(NOTE);
      });

      it("refuses a file by content: nothing stored, no row", async () => {
        const { id } = await newPartner();
        const png = Uint8Array.from([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        ]);
        expect(await uploadContract(actor, id, fields(), png, deps())).toEqual({
          ok: false,
          reason: "rule",
          ruleId: "contract.not_pdf",
        });
        expect(await rows(id)).toEqual([]);
      });

      it("a second agreement supersedes the first; a stale expected id is a conflict", async () => {
        const { id } = await newPartner();
        const first = await uploadContract(actor, id, fields(), pdf2, deps());
        expect(first.ok).toBe(true);
        const firstId = first.ok ? first.contractId : "";
        const stale = await uploadContract(
          actor,
          id,
          fields({ templateVersion: "pa-pl-2026-11" }),
          pdf2,
          deps(),
        );
        expect(stale).toEqual({ ok: false, reason: "version_conflict" });
        expect((await rows(id)).length).toBe(1);

        const second = await uploadContract(
          actor,
          id,
          fields({
            templateVersion: "pa-pl-2026-11",
            signedOn: "2026-10-27",
            effectiveOn: "2026-10-27",
            expectedCurrentId: firstId,
          }),
          pdf2,
          deps(),
        );
        expect(second).toMatchObject({ ok: true, versionNo: 2 });
        const after = await rows(id);
        expect(
          after.map((r) => [r.version_no, r.superseded_by !== null]),
        ).toEqual([
          [1, true],
          [2, false],
        ]);
        expect(after[0]?.superseded_by).toBe(after[1]?.id);
        expect(await profile(id)).toMatchObject({
          terms_signed_at: "2026-10-27",
          terms_version: "pa-pl-2026-11",
        });
        const record = await partnerContracts(actor, id, clock, run);
        expect(record?.rows.map((r) => [r.versionNo, r.current])).toEqual([
          [2, true],
          [1, false],
        ]);

        // An addendum leaves the agreement current and the terms unchanged; two annexes are current.
        for (const docKind of ["dpa_addendum", "annex", "annex"]) {
          expect(
            await uploadContract(
              actor,
              id,
              fields({
                docKind,
                templateVersion: `${docKind.replace("_", "-")}-1`,
              }),
              pdf2,
              deps(),
            ),
          ).toMatchObject({ ok: true });
        }
        const all = await rows(id);
        expect(
          all.filter((r) => r.superseded_by === null).map((r) => r.doc_kind),
        ).toEqual(["agreement", "annex", "annex", "dpa_addendum"]);
        expect(await profile(id)).toMatchObject({
          terms_version: "pa-pl-2026-11",
        });
      });

      it("the trigger refuses a change to a file column", async () => {
        const { id } = await newPartner();
        await uploadContract(actor, id, fields(), pdf2, deps());
        const [row] = await rows(id);
        const message = await scratch.sql.begin(async (tx) => {
          await tx`SELECT set_config('app.audit_action', 'partner_contract.edit', true)`;
          await asApp(tx, { role: "admin", userId: adminId });
          return pgFailure(
            tx,
            (sp) =>
              sp`UPDATE partner_contract SET bytes = 1 WHERE id = ${row?.id ?? ""}`,
          );
        });
        expect(message.raised).toBe("CONTRACT_FILE_IMMUTABLE");
      });

      it("edits the details of the current version only", async () => {
        const { id } = await newPartner();
        await uploadContract(actor, id, fields(), pdf2, deps());
        const [row] = await rows(id);
        expect(
          await editContractDetails(
            actor,
            {
              ...fields({ reviewOn: "2027-10-20", noticeDays: "45" }),
              contractId: row?.id,
              updatedAt: row?.updated_at,
            },
            deps(),
          ),
        ).toMatchObject({ ok: true });
        const [review] = await scratch.sql<
          { review_on: string; notice_days: number }[]
        >`
          SELECT review_on::text AS review_on, notice_days FROM partner_contract
          WHERE id = ${row?.id ?? ""}`;
        expect(review).toEqual({ review_on: "2027-10-20", notice_days: 45 });
      });
    });

    describe("T-33 · withdraw (AC-41)", () => {
      it("inside 7 days restores version 1 and its terms; after 7 days refuses", async () => {
        clock = new Date("2026-10-28T10:00:00.000Z");
        const { id } = await newPartner();
        const first = await uploadContract(actor, id, fields(), pdf2, deps());
        const second = await uploadContract(
          actor,
          id,
          fields({
            templateVersion: "pa-pl-2026-11",
            signedOn: "2026-10-27",
            effectiveOn: "2026-10-27",
            expectedCurrentId: first.ok ? first.contractId : "",
          }),
          pdf2,
          deps(),
        );
        const v2 = (await rows(id))[1];
        expect(v2?.version_no).toBe(2);

        await backdate(v2?.id ?? "", "6 days 23 hours");
        clock = new Date();
        expect(
          await withdrawContract(
            actor,
            {
              contractId: v2?.id,
              updatedAt: v2?.updated_at,
              reason: "too short",
            },
            deps(),
          ),
        ).toMatchObject({ ok: false, reason: "invalid" });
        expect(
          await withdrawContract(
            actor,
            { contractId: v2?.id, updatedAt: v2?.updated_at, reason: REASON },
            deps(),
          ),
        ).toMatchObject({ ok: true });
        const left = await rows(id);
        expect(left.map((r) => [r.version_no, r.superseded_by])).toEqual([
          [1, null],
        ]);
        expect(
          await storage.head({
            bucket: BUCKET,
            objectKey: v2?.object_key ?? "",
          }),
        ).toBeNull();
        expect(await profile(id)).toMatchObject({
          terms_signed_at: "2026-10-20",
          terms_version: "pa-pl-2026-10",
        });
        expect(second.ok).toBe(true);

        // Version 1 is now 7 days and 1 minute past its upload.
        const v1 = left[0];
        await backdate(v1?.id ?? "", "7 days 1 minute");
        clock = new Date();
        expect(
          await withdrawContract(
            actor,
            { contractId: v1?.id, updatedAt: v1?.updated_at, reason: REASON },
            deps(),
          ),
        ).toMatchObject({ ok: false, reason: "window_closed" });
        const message = await scratch.sql.begin(async (tx) => {
          await tx`SELECT set_config('app.audit_action', 'partner_contract.withdraw', true)`;
          await asApp(tx, { role: "admin", userId: adminId });
          return pgFailure(
            tx,
            (sp) => sp`DELETE FROM partner_contract WHERE id = ${v1?.id ?? ""}`,
          );
        });
        expect(message.raised).toBe("CONTRACT_WITHDRAW_WINDOW_CLOSED");
      });

      it("withdrawing the only agreement of an active florist pauses it", async () => {
        clock = new Date("2026-10-28T10:00:00.000Z");
        const { id } = await newPartner();
        await uploadContract(actor, id, fields(), pdf2, deps());
        await scratch.sql.begin(async (tx) => {
          await tx`SELECT set_config('app.role', 'admin', true),
                          set_config('app.audit_action', 'partner.status.active', true)`;
          await tx`UPDATE fulfillment_partner SET status = 'active' WHERE id = ${id}`;
        });
        const [row] = await rows(id);
        expect(
          await withdrawContract(
            actor,
            { contractId: row?.id, updatedAt: row?.updated_at, reason: REASON },
            deps(),
          ),
        ).toMatchObject({ ok: true });
        expect((await profile(id))?.status).toBe("paused");
        expect(await rows(id)).toEqual([]);
      });
    });

    describe("T-34 · download (AC-40)", () => {
      it("a 60-second attachment URL; 403 at 61 seconds; an altered object is refused", async () => {
        clock = new Date("2026-10-28T10:00:00.000Z");
        const { id, code } = await newPartner();
        await uploadContract(actor, id, fields(), pdf2, deps());
        const [row] = await rows(id);
        const download = await contractDownloadUrl(
          actor,
          row?.id ?? "",
          deps(),
        );
        expect(download.ok).toBe(true);
        const url = download.ok ? download.url : "";
        const issued = clock;
        clock = new Date(issued.getTime() + 59_000);
        const ok = await storage.fetch(url);
        expect(ok.status).toBe(200);
        expect(ok.headers.get("content-disposition")).toBe(
          `attachment; filename="contract-${code}-agreement-v1.pdf"`,
        );
        expect(ok.headers.get("content-type")).toBe("application/pdf");
        expect(new Uint8Array(await ok.arrayBuffer())).toEqual(pdf2);
        clock = new Date(issued.getTime() + 61_000);
        expect((await storage.fetch(url)).status).toBe(403);
        const reads = await scratch.sql<{ n: number }[]>`
          SELECT count(*)::int AS n FROM audit_log
          WHERE entity_table = 'partner_contract' AND entity_id = ${row?.id ?? ""}
            AND action = 'partner_contract.viewed'`;
        expect(reads[0]?.n).toBe(1);

        await storage.put({
          bucket: BUCKET,
          objectKey: row?.object_key ?? "",
          body: new TextEncoder().encode("%PDF-altered"),
          mime: "application/pdf",
        });
        alerts.length = 0;
        expect(await contractDownloadUrl(actor, row?.id ?? "", deps())).toEqual(
          {
            ok: false,
            reason: "checksum_mismatch",
          },
        );
        expect(alerts).toEqual(["partners.contract_checksum_mismatch"]);
      });
    });

    describe("T-35 · the activation gate (AC-59)", () => {
      it("refuses → active without an agreement, also with only an addendum", async () => {
        const { id } = await newPartner();
        const refused = () =>
          scratch.sql.begin(async (tx) => {
            await tx`SELECT set_config('app.role', 'admin', true),
                            set_config('app.audit_action', 'partner.status.active', true)`;
            return pgFailure(
              tx,
              (sp) =>
                sp`UPDATE fulfillment_partner SET status = 'active' WHERE id = ${id}`,
            );
          });
        expect((await refused()).raised).toBe("PARTNER_NO_SIGNED_AGREEMENT");
        await uploadContract(
          actor,
          id,
          fields({ docKind: "dpa_addendum", templateVersion: "dpa-1" }),
          pdf2,
          deps(),
        );
        expect((await refused()).raised).toBe("PARTNER_NO_SIGNED_AGREEMENT");
        await uploadContract(actor, id, fields(), pdf2, deps());
        await scratch.sql.begin(async (tx) => {
          await tx`SELECT set_config('app.role', 'admin', true),
                          set_config('app.audit_action', 'partner.status.active', true)`;
          await tx`UPDATE fulfillment_partner SET status = 'active' WHERE id = ${id}`;
        });
        expect((await profile(id))?.status).toBe("active");
      });
    });

    it("AC-43: no captured log line carries the note, the reason, an object key or a URL", () => {
      const text = lines.join("\n");
      expect(text).not.toContain(NOTE);
      expect(text).not.toContain(REASON);
      expect(text).not.toMatch(/originals\/contract\//u);
      expect(text).not.toMatch(/storage\.invalid/u);
    });
  },
);
