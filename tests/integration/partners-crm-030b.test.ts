/**
 * Spec 030b T-26, T-27 (audit read), T-28, T-29, T-30 on a migrated PG16 scratch database, never
 * the shared database (AC-26 to AC-30; TASK-441):
 *
 *  - T-28 (AC-28): `addNote` keeps 2000 characters and refuses 2001, empty, whitespace and the
 *    three contact-detail shapes with no write; pinned notes first, each group newest first; a
 *    stale edit changes nothing; delete removes the row; each write leaves one audit row with
 *    `body` masked, and the note text appears nowhere in `audit_log`;
 *  - T-29 (AC-29): `logContact`'s refusals write nothing; "Follow-ups due" across midnight in the
 *    viewer's zone (due today, overdue, not tomorrow, not done); `markFollowUpDone`; the database
 *    check refuses a done mark without a follow-up date;
 *  - T-30 (AC-30): contact-name refusals write nothing; a valid save writes one audit row with
 *    `contact_name` masked;
 *  - T-27 (AC-27): `logAdminRead('partner_crm', id)` writes one `partner_crm.viewed` row with no
 *    before or after; the last accepted order is the newest accepted live assignment (a `test`
 *    order cannot be offered to a live florist: `ASSIGNMENT_MODE_MISMATCH`);
 *  - T-26 (AC-26): `partnerMoney` for a florist with payouts in every status, an open adjustment
 *    and offers by outcome; a `demo` florist is the "no money" state.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { logAdminRead } from "@/modules/admin";
import { partnerMoney } from "@/modules/admin/finance";
import type { PartnerAdminRunner } from "@/modules/partners";
import {
  addNote,
  deleteNote,
  editNote,
  logContact,
  markFollowUpDone,
  partnerListCrm,
  partnerRelationship,
  readFollowUpsDue,
  saveContactName,
} from "@/modules/partners/crm";

import { insertPlacedOrder, walkOrderTo } from "../fixtures/order-state.ts";
import { drizzleOver } from "./support/drizzle-tx.ts";
import * as make from "./support/rows.ts";
import { runnerOf } from "./support/sql-runner.ts";
import {
  asApp,
  pgFailure,
  probeLocalServer,
  scratchDatabase,
  type ScratchDatabase,
} from "./support/scratch-db.ts";

const server = await probeLocalServer();

const ZONE = "Europe/Warsaw";
const NOTE_TEXT =
  "Prefers tulips from the market; asks two days notice for 21 stems.";

describe.skipIf(server.url === undefined)(
  `spec 030b florist CRM${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    let run: PartnerAdminRunner;
    let countryId: string;
    const adminId = randomUUID();
    const actor = { userId: adminId, requestId: "it-partners-crm" };

    async function newPartner(status: make.PartnerStatus = "active") {
      return scratch.sql.begin((tx) => make.partner(tx, countryId, status));
    }

    async function auditRows(table: string, id: string) {
      return scratch.sql<
        { action: string; before: unknown; after: unknown }[]
      >`SELECT action, before, after FROM audit_log
        WHERE entity_table = ${table} AND entity_id = ${id} ORDER BY at, id`;
    }

    async function noteRow(partnerId: string) {
      return scratch.sql<
        { id: string; body: string; pinned: boolean; version: string }[]
      >`SELECT id, body, pinned,
               to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS version
        FROM partner_note WHERE partner_id = ${partnerId} ORDER BY created_at`;
    }

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "partnerscrm");
      await scratch.sql.begin(async (tx) => {
        countryId = await make.country(tx, "PL");
        await tx`INSERT INTO users (id, email, name) VALUES (${adminId}, 'founder@example.test', 'Test Admin')`;
      });
      run = (context, fn) =>
        scratch.sql.begin(async (tx) => {
          await tx`SELECT set_config('app.audit_action', ${context.action}, true)`;
          await asApp(tx, {
            role: "admin",
            ...(context.userId === undefined ? {} : { userId: context.userId }),
          });
          return fn(drizzleOver(tx, scratch.sql));
        }) as never;
    }, 300_000);

    afterAll(async () => {
      await scratch.drop();
    });

    describe("T-28 · notes (AC-28)", () => {
      it("keeps 2000 characters, refuses 2001 and each refused shape with no write", async () => {
        const partnerId = await newPartner();
        expect(
          await addNote(actor, { partnerId, body: "a".repeat(2000) }, run),
        ).toMatchObject({ ok: true });
        for (const body of [
          "a".repeat(2001),
          "",
          "   ",
          "Write to anna@example.pl",
          "Call +48 600 100 200",
          "Call 600 100 200",
        ]) {
          expect(await addNote(actor, { partnerId, body }, run)).toMatchObject({
            ok: false,
            reason: "invalid",
          });
        }
        expect(
          await addNote(
            actor,
            {
              partnerId,
              body: "Met on 2026-10-21, agreed 149,00 zł for size M",
            },
            run,
          ),
        ).toMatchObject({ ok: true });
        expect(await noteRow(partnerId)).toHaveLength(2);
      });

      it("lists pinned first, each group newest first; a stale edit changes nothing; delete removes", async () => {
        const partnerId = await newPartner();
        for (const [body, pinned] of [
          ["first unpinned", ""],
          ["first pinned", "on"],
          ["second unpinned", ""],
          ["second pinned", "on"],
        ] as const) {
          await addNote(actor, { partnerId, body, pinned }, run);
        }
        const record = await partnerRelationship(actor, partnerId, run);
        expect(record?.notes.map((note) => note.body)).toEqual([
          "second pinned",
          "first pinned",
          "second unpinned",
          "first unpinned",
        ]);

        const [note] = await noteRow(partnerId);
        if (note === undefined) throw new Error("no note");
        expect(
          await editNote(
            actor,
            { noteId: note.id, updatedAt: note.version, body: NOTE_TEXT },
            run,
          ),
        ).toMatchObject({ ok: true });
        expect(
          await editNote(
            actor,
            { noteId: note.id, updatedAt: note.version, body: "stale" },
            run,
          ),
        ).toEqual({ ok: false, reason: "conflict" });
        const [after] = await noteRow(partnerId);
        expect(after?.body).toBe(NOTE_TEXT);

        expect(
          await deleteNote(
            actor,
            { noteId: note.id, updatedAt: after?.version },
            run,
          ),
        ).toMatchObject({ ok: true });
        expect((await noteRow(partnerId)).map((n) => n.id)).not.toContain(
          note.id,
        );

        const audit = await auditRows("partner_note", note.id);
        expect(audit.map((row) => row.action)).toEqual([
          "partner_crm.note.add",
          "partner_crm.note.edit",
          "partner_crm.note.delete",
        ]);
        expect(audit[1]?.after).toMatchObject({ body: "[masked]" });
        const [leak] = await scratch.sql<{ n: number }[]>`
          SELECT count(*)::int AS n FROM audit_log
          WHERE before::text LIKE ${`%${NOTE_TEXT.slice(0, 20)}%`}
             OR after::text LIKE ${`%${NOTE_TEXT.slice(0, 20)}%`}`;
        expect(leak?.n).toBe(0);
      });
    });

    describe("T-29 · contact log and follow-ups (AC-29)", () => {
      const NOW = new Date("2026-10-27T23:30:00.000Z"); // 00:30 on 28 Oct in Warsaw
      const entry = (
        partnerId: string,
        change: Record<string, string> = {},
      ) => ({
        partnerId,
        occurredAt: "2026-10-27T10:00:00.000Z",
        channel: "phone",
        direction: "outbound",
        topic: "pricing",
        summary: "Agreed the 21-stem price.",
        ...change,
      });

      it("refuses each bad field with no write", async () => {
        const partnerId = await newPartner();
        for (const change of [
          { channel: "fax" },
          { direction: "sideways" },
          { topic: "gossip" },
          { summary: "a".repeat(1001) },
          { occurredAt: "2026-10-27T23:36:00.000Z" },
          { summary: "Call 600 100 200" },
        ]) {
          expect(
            await logContact(
              actor,
              entry(partnerId, change),
              NOW,
              undefined,
              run,
            ),
          ).toMatchObject({ ok: false, reason: "invalid" });
        }
        const [count] = await scratch.sql<{ n: number }[]>`
          SELECT count(*)::int AS n FROM partner_contact_log WHERE partner_id = ${partnerId}`;
        expect(count?.n).toBe(0);
      });

      it("lists exactly the open entries due today or earlier in the viewer's zone", async () => {
        const partnerId = await newPartner();
        for (const followUpOn of [
          "2026-10-28",
          "2026-10-26",
          "2026-10-29",
          "2026-10-25",
        ]) {
          expect(
            await logContact(
              actor,
              entry(partnerId, { followUpOn, summary: `due ${followUpOn}` }),
              NOW,
              undefined,
              run,
            ),
          ).toMatchObject({ ok: true });
        }
        const [done] = await scratch.sql<{ id: string }[]>`
          SELECT id FROM partner_contact_log
          WHERE partner_id = ${partnerId} AND follow_up_on = '2026-10-25'`;
        expect(
          await markFollowUpDone(actor, { entryId: done?.id }, run),
        ).toMatchObject({ ok: true });

        const due = await run({ ...actor, action: "partner_crm.read" }, (db) =>
          readFollowUpsDue(db, ZONE, NOW, partnerId),
        );
        expect(due.map((d) => d.followUpOn)).toEqual([
          "2026-10-26",
          "2026-10-28",
        ]);
        // In UTC it is still the 27th: the 28th is not yet due there.
        const dueUtc = await run(
          { ...actor, action: "partner_crm.read" },
          (db) => readFollowUpsDue(db, "UTC", NOW, partnerId),
        );
        expect(dueUtc.map((d) => d.followUpOn)).toEqual(["2026-10-26"]);
        const columns = await partnerListCrm(actor, ZONE, NOW, run);
        expect(columns.get(partnerId)?.followUps).toBe(2);
      });

      it("refuses a done mark without a follow-up date, in the command and the database", async () => {
        const partnerId = await newPartner();
        await logContact(actor, entry(partnerId), NOW, undefined, run);
        const [row] = await scratch.sql<{ id: string }[]>`
          SELECT id FROM partner_contact_log WHERE partner_id = ${partnerId}`;
        expect(
          await markFollowUpDone(actor, { entryId: row?.id }, run),
        ).toEqual({
          ok: false,
          reason: "no_follow_up",
        });
        const failure = await scratch.sql.begin((tx) =>
          pgFailure(
            tx,
            (sp) =>
              sp`UPDATE partner_contact_log SET follow_up_done_at = now() WHERE id = ${row?.id ?? ""}`,
          ),
        );
        expect(failure.constraint).toBe("partner_contact_log_follow_up_check");
      });
    });

    describe("T-30 · contact person (AC-30)", () => {
      async function version(partnerId: string) {
        const [row] = await scratch.sql<{ v: string; name: string | null }[]>`
          SELECT to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS v,
                 contact_name AS name
          FROM fulfillment_partner WHERE id = ${partnerId}`;
        return row;
      }

      it("refuses 1, 121 characters and an email; a valid save writes one masked audit row", async () => {
        const partnerId = await newPartner();
        for (const contactName of [
          "P",
          "a".repeat(121),
          "piotr.nowak@example.com",
        ]) {
          expect(
            await saveContactName(
              actor,
              {
                partnerId,
                updatedAt: (await version(partnerId))?.v,
                contactName,
              },
              run,
            ),
          ).toMatchObject({ ok: false, reason: "invalid" });
        }
        expect((await version(partnerId))?.name).toBeNull();
        expect(
          await saveContactName(
            actor,
            {
              partnerId,
              updatedAt: (await version(partnerId))?.v,
              contactName: "Piotr Nowak",
            },
            run,
          ),
        ).toMatchObject({ ok: true });
        expect((await version(partnerId))?.name).toBe("Piotr Nowak");
        const audit = await auditRows("fulfillment_partner", partnerId);
        const saved = audit.filter(
          (row) => row.action === "partner_crm.contact_name",
        );
        expect(saved).toHaveLength(1);
        expect(saved[0]?.after).toMatchObject({ contact_name: "[masked]" });
        expect(JSON.stringify(audit)).not.toContain("Piotr");
      });
    });

    describe("T-27 · the read audit and the last accepted order (AC-27)", () => {
      it("writes one partner_crm.viewed row with no before or after", async () => {
        const partnerId = await newPartner();
        await logAdminRead(actor, "partner_crm", partnerId, run as never);
        const rows = await auditRows("partner_crm", partnerId);
        expect(rows).toEqual([
          { action: "partner_crm.viewed", before: null, after: null },
        ]);
      });

      it("reads the newest accepted assignment of a live order, and none before", async () => {
        const partnerId = await newPartner();
        expect(
          (await partnerRelationship(actor, partnerId, run))?.lastAcceptedAt,
        ).toBeNull();
        await scratch.sql.begin(async (tx) => {
          const customerId = await make.customer(tx);
          const recipientId = await make.recipient(tx, customerId);
          for (const at of ["2026-10-22T09:00:00Z", "2026-10-09T09:00:00Z"]) {
            const orderId = await insertPlacedOrder(tx, {
              customerId,
              recipientId,
              countryId,
              mode: "live",
            });
            await tx`INSERT INTO order_assignment (order_id, partner_id, offered_at, sla_expires_at,
                                                  responded_at, response, attempt)
                     VALUES (${orderId}, ${partnerId}, ${at}::timestamptz - interval '1 hour',
                             ${at}::timestamptz + interval '1 hour', ${at}, 'accept', 1)`;
          }
        });
        expect(
          (
            await partnerRelationship(actor, partnerId, run)
          )?.lastAcceptedAt?.toISOString(),
        ).toBe("2026-10-22T09:00:00.000Z");
      });
    });

    describe("T-26 · partnerMoney (AC-26)", () => {
      const NOW = new Date("2026-10-28T12:00:00.000Z");
      const RANGE = {
        from: "2026-10-01",
        to: "2026-10-28",
        basis: "paid" as const,
        mode: "live" as const,
      };

      async function money(partnerId: string) {
        return scratch.sql.begin(async (tx) => {
          await asApp(tx, { role: "admin", userId: adminId });
          return partnerMoney(runnerOf(tx), partnerId, RANGE, ZONE, NOW);
        });
      }

      it("is the no-money state for a demo florist", async () => {
        expect(await money(await newPartner("demo"))).toEqual({ kind: "demo" });
      });

      it("owes draft plus sent, lists paid statements, counts adjustments and outcomes", async () => {
        const partnerId = await newPartner("active");
        await scratch.sql.begin(async (tx) => {
          await tx`INSERT INTO payout (partner_id, period_start, period_end, status, total_minor,
                                       currency_code, kind)
                   VALUES (${partnerId}, '2026-10-26', '2026-11-01', 'draft', 14900, 'PLN', 'weekly')`;
          await tx`INSERT INTO payout (partner_id, period_start, period_end, status, total_minor,
                                       currency_code, kind, closed_at, sent_at, statement_number)
                   VALUES (${partnerId}, '2026-10-19', '2026-10-25', 'statement_sent', 12600, 'PLN',
                           'weekly', '2026-10-26T06:00:00Z', '2026-10-26T07:00:00Z', 'P-000128')`;
          await tx`INSERT INTO payout (partner_id, period_start, period_end, status, total_minor,
                                       currency_code, kind, closed_at, sent_at, paid_at, statement_number)
                   VALUES (${partnerId}, '2026-10-12', '2026-10-18', 'paid', 14900, 'PLN', 'weekly',
                           '2026-10-19T06:00:00Z', '2026-10-19T07:00:00Z', '2026-10-27T10:00:00Z', 'P-000127'),
                          (${partnerId}, '2026-09-07', '2026-09-13', 'paid', 10000, 'PLN', 'weekly',
                           '2026-09-14T06:00:00Z', '2026-09-14T07:00:00Z', '2026-09-20T10:00:00Z', 'P-000101')`;
          const customerId = await make.customer(tx);
          const recipientId = await make.recipient(tx, customerId);
          const outcomes = [
            ["accept", "delivered"],
            ["accept", "cancelled"],
            ["decline", "routed"],
            ["timeout", "routed"],
          ] as const;
          let assignmentForAdjustment = "";
          let orderForAdjustment = "";
          for (const [response, status] of outcomes) {
            const orderId = await insertPlacedOrder(tx, {
              customerId,
              recipientId,
              countryId,
              mode: "live",
            });
            const [assignment] = await tx<{ id: string }[]>`
              INSERT INTO order_assignment (order_id, partner_id, offered_at, sla_expires_at,
                                            responded_at, response, attempt)
              VALUES (${orderId}, ${partnerId}, '2026-10-20T09:00:00Z', '2026-10-20T11:00:00Z',
                      '2026-10-20T10:00:00Z', ${response}, 1)
              RETURNING id`;
            if (status !== "routed") await walkOrderTo(tx, orderId, status);
            if (status === "cancelled") {
              assignmentForAdjustment = assignment?.id ?? "";
              orderForAdjustment = orderId;
            }
          }
          await tx`INSERT INTO payout_adjustment (order_id, partner_id, assignment_id, kind)
                   VALUES (${orderForAdjustment}, ${partnerId}, ${assignmentForAdjustment},
                           'withdrawn_by_buyer_after_acceptance')`;
        });

        const result = await money(partnerId);
        if (result.kind !== "money") throw new Error("expected money");
        expect(result.owedNow).toEqual([
          {
            currency: "PLN",
            minor: 27500n,
            oldestUnpaid: {
              statementNumber: "P-000128",
              sentAt: new Date("2026-10-26T07:00:00Z"),
            },
          },
        ]);
        expect(
          result.paidInRange.map((s) => [s.statementNumber, s.totalMinor]),
        ).toEqual([["P-000127", 14900n]]);
        expect(result.paidAllTime).toEqual([
          {
            currency: "PLN",
            minor: 24900n,
            since: new Date("2026-09-20T10:00:00Z"),
          },
        ]);
        expect(result.openAdjustments).toBe(1);
        expect(result.outcomes).toEqual({
          accepted: 2,
          delivered: 1,
          cancelledAfterAcceptance: 1,
          declined: 1,
          timedOut: 1,
        });
        expect(result.totals.orders).toBe(0);
      });
    });
  },
);
