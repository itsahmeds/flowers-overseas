/**
 * Spec 030a task 3's export commands on a migrated PG16 scratch database (§10 T-24, T-27, T-28;
 * AC-24, AC-25 (from the database), AC-27, AC-28; TASK-366), never the shared database:
 *
 *  - T-24 (AC-24): `createWiseExport` refuses a draft, a payout already in an active export, 1001
 *    payouts and a florist with no Wise recipient id (naming its code), each with no write;
 *  - AC-25 from the rows: `wiseExportFile` writes the legal names, recipient ids, amounts and
 *    statement numbers of the export, twice identically, with the currency's own exponent;
 *  - T-27 (AC-27): cancel with no paid payout frees the payouts for a new export; with one paid,
 *    `PAYOUT_EXPORT_PAID` and nothing changes;
 *  - T-28 (AC-28): `markPaid` and `markExportPaid`, and the three refusals.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  type PayoutActor,
  cancelExport,
  createWiseExport,
  markExportPaid,
  markPaid,
  sendStatement,
  wiseExportFile,
} from "../../src/modules/partners/payouts/index.ts";
import * as make from "./support/rows.ts";
import { runnerOf } from "./support/sql-runner.ts";
import {
  asApp,
  probeLocalServer,
  rolledBack,
  scratchDatabase,
  type ScratchDatabase,
  type Tx,
} from "./support/scratch-db.ts";

const server = await probeLocalServer();

const quiet = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
} as never;

describe.skipIf(server.url === undefined)(
  `spec 030a Wise export and payment${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    let countryId: string;
    let actor: PayoutActor;

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "payoutswise");
      const adminId = randomUUID();
      countryId = await scratch.sql.begin(async (tx) => {
        await tx`INSERT INTO users (id, email) VALUES (${adminId}, ${`${make.unique("founder")}@example.test`})`;
        await tx`INSERT INTO currency (code, minor_unit_exponent) VALUES ('JPY', 0), ('KWD', 3)
                 ON CONFLICT DO NOTHING`;
        return make.country(tx, "PL");
      });
      actor = { userId: adminId, requestId: "it-payouts-366" };
    }, 300_000);

    afterAll(async () => {
      await scratch.drop();
    });

    async function asAdmin<T>(
      tx: Tx,
      fn: (executor: ReturnType<typeof runnerOf>) => Promise<T>,
    ): Promise<T> {
      return tx.savepoint(async (sp) => {
        await asApp(sp as unknown as Tx, {
          role: "admin",
          userId: actor.userId,
        });
        try {
          return await fn(runnerOf(sp as unknown as Tx));
        } finally {
          await sp.unsafe("RESET ROLE");
        }
      }) as Promise<T>;
    }

    async function codeOf(promise: Promise<unknown>): Promise<string> {
      return promise.then(
        () => "done",
        (error: unknown) => (error as { code?: string }).code ?? String(error),
      );
    }

    /** A florist with a legal name and, unless null, a Wise recipient id. */
    async function florist(
      tx: Tx,
      options: { name?: string; wise?: string | null; currency?: string } = {},
    ) {
      const id = await make.partner(tx, countryId, "active");
      await tx`UPDATE fulfillment_partner
               SET legal_name = ${options.name ?? "Kwiaciarnia Lipa"},
                   wise_recipient_id = ${options.wise === undefined ? "12345678" : options.wise},
                   payout_currency_code = ${options.currency ?? "PLN"}
               WHERE id = ${id}`;
      const [code] = await tx<{ code: string }[]>`
        SELECT code FROM fulfillment_partner WHERE id = ${id}`;
      return { id, code: code?.code ?? "" };
    }

    let week = 0;
    /** A closed weekly draft of `amount` for `partnerId`, sent unless `draft`. */
    async function statement(
      tx: Tx,
      partnerId: string,
      amount: number,
      options: { draft?: boolean; currency?: string } = {},
    ): Promise<string> {
      week += 1;
      const start = new Date(Date.UTC(2025, 0, 6 + 7 * week));
      const end = new Date(start.getTime() + 6 * 86_400_000);
      const [row] = await tx<{ id: string }[]>`
        INSERT INTO payout (partner_id, period_start, period_end, status, total_minor, currency_code,
                            kind, closed_at)
        VALUES (${partnerId}, ${start.toISOString().slice(0, 10)}, ${end.toISOString().slice(0, 10)},
                'draft', 0, ${options.currency ?? "PLN"}, 'weekly', now())
        RETURNING id`;
      const id = row?.id ?? "";
      await tx`INSERT INTO payout_line (payout_id, amount_minor, currency_code, kind, note)
               VALUES (${id}, ${amount}, ${options.currency ?? "PLN"}, 'goodwill', 'fixture')`;
      if (options.draft !== true) {
        await asAdmin(tx, (e) =>
          sendStatement(e, id, actor, {
            scheduleEmail: () => Promise.resolve(),
            log: quiet,
          }),
        );
      }
      return id;
    }

    const exportsCount = async (tx: Tx) =>
      (
        await tx<{ n: number }[]>`SELECT count(*)::int AS n FROM payout_export`
      )[0]?.n;

    /* -------------------------------------------------------------------- */
    /* T-24                                                                 */
    /* -------------------------------------------------------------------- */

    describe("T-24 (AC-24) · createWiseExport refusals, each with no write", () => {
      it("a draft payout", async () => {
        await rolledBack(scratch.sql, async (tx) => {
          const f = await florist(tx);
          const sent = await statement(tx, f.id, 14900);
          const draft = await statement(tx, f.id, 14900, { draft: true });
          const before = await exportsCount(tx);
          expect(
            await codeOf(
              asAdmin(tx, (e) =>
                createWiseExport(e, { payoutIds: [sent, draft] }, actor, {
                  log: quiet,
                }),
              ),
            ),
          ).toBe("PAYOUT_STATUS_ILLEGAL");
          expect(await exportsCount(tx)).toBe(before);
        });
      });

      it("a payout already in an active export", async () => {
        await rolledBack(scratch.sql, async (tx) => {
          const f = await florist(tx);
          const one = await statement(tx, f.id, 14900);
          const two = await statement(tx, f.id, 9900);
          await asAdmin(tx, (e) =>
            createWiseExport(e, { payoutIds: [one] }, actor, { log: quiet }),
          );
          const before = await exportsCount(tx);
          expect(
            await codeOf(
              asAdmin(tx, (e) =>
                createWiseExport(e, { payoutIds: [two, one] }, actor, {
                  log: quiet,
                }),
              ),
            ),
          ).toBe("PAYOUT_IN_EXPORT");
          expect(await exportsCount(tx)).toBe(before);
          const [free] = await tx<{ export_id: string | null }[]>`
            SELECT export_id FROM payout WHERE id = ${two}`;
          expect(free?.export_id).toBeNull();
        });
      });

      it("1001 payouts, and a payout listed twice", async () => {
        await rolledBack(scratch.sql, async (tx) => {
          const f = await florist(tx);
          const one = await statement(tx, f.id, 14900);
          const ids = Array.from({ length: 1001 }, () => randomUUID());
          expect(
            await asAdmin(tx, (e) =>
              createWiseExport(e, { payoutIds: ids }, actor, { log: quiet }),
            ),
          ).toEqual({ ok: false, reason: "invalid" });
          expect(
            await asAdmin(tx, (e) =>
              createWiseExport(e, { payoutIds: [one, one] }, actor, {
                log: quiet,
              }),
            ),
          ).toEqual({ ok: false, reason: "invalid" });
          expect(await exportsCount(tx)).toBe(0);
        });
      });

      it("a florist with no Wise recipient id: PAYOUT_WISE_RECIPIENT_MISSING naming its code", async () => {
        await rolledBack(scratch.sql, async (tx) => {
          const ok = await florist(tx);
          const missing = await florist(tx, { wise: null });
          const a = await statement(tx, ok.id, 14900);
          const b = await statement(tx, missing.id, 9900);
          const refused = await asAdmin(tx, (e) =>
            createWiseExport(e, { payoutIds: [a, b] }, actor, { log: quiet }),
          ).then(
            () => null,
            (error: unknown) =>
              error as { code: string; partnerCodes: string[] },
          );
          expect(refused?.code).toBe("PAYOUT_WISE_RECIPIENT_MISSING");
          expect(refused?.partnerCodes).toEqual([missing.code]);
          expect(await exportsCount(tx)).toBe(0);
        });
      });
    });

    /* -------------------------------------------------------------------- */
    /* AC-25 from the database                                              */
    /* -------------------------------------------------------------------- */

    it("AC-25: the file of an export from its rows, twice identical, with each currency's exponent", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const lipa = await florist(tx, {
          name: "Kwiaciarnia Lipa",
          wise: "12345678",
        });
        const evil = await florist(tx, {
          name: '=HYPERLINK("x")',
          wise: "87654321",
        });
        const yen = await florist(tx, {
          name: "Hana",
          wise: "555",
          currency: "JPY",
        });
        const dinar = await florist(tx, {
          name: "Zahra",
          wise: "777",
          currency: "KWD",
        });
        const a = await statement(tx, lipa.id, 14900);
        const b = await statement(tx, evil.id, 123450);
        const c = await statement(tx, yen.id, 149, { currency: "JPY" });
        const d = await statement(tx, dinar.id, 1234, { currency: "KWD" });
        const created = await asAdmin(tx, (e) =>
          createWiseExport(e, { payoutIds: [d, c, b, a] }, actor, {
            log: quiet,
          }),
        );
        if (!created.ok) throw new Error("no export");
        const first = await asAdmin(tx, (e) =>
          wiseExportFile(e, created.exportId),
        );
        const second = await asAdmin(tx, (e) =>
          wiseExportFile(e, created.exportId),
        );
        expect(second.body).toBe(first.body);
        expect(first.filename).toBe(`wise-${created.exportId}.csv`);
        const lines = first.body.split("\r\n");
        expect(lines[0]).toBe(
          "name,recipientId,sourceCurrency,targetCurrency,amountCurrency,amount,paymentReference",
        );
        expect(
          lines.slice(1, 5).map((line) => line.replace(/,P-[0-9]{6}$/u, "")),
        ).toEqual([
          "Kwiaciarnia Lipa,12345678,EUR,PLN,PLN,149.00",
          '"\'=HYPERLINK(""x"")",87654321,EUR,PLN,PLN,1234.50',
          "Hana,555,EUR,JPY,JPY,149",
          "Zahra,777,EUR,KWD,KWD,1.234",
        ]);
        const numbers = lines.slice(1, 5).map((line) => line.slice(-8));
        expect(numbers).toEqual([...numbers].sort());
        const [x] = await tx<{ source: string; by: string }[]>`
          SELECT source_currency_code AS source, created_by::text AS by FROM payout_export
          WHERE id = ${created.exportId}`;
        expect(x).toEqual({ source: "EUR", by: actor.userId });
      });
    });

    /* -------------------------------------------------------------------- */
    /* T-27                                                                 */
    /* -------------------------------------------------------------------- */

    describe("T-27 (AC-27) · cancelExport", () => {
      it("with no paid payout: cancelled_at set, payouts freed, re-exported", async () => {
        await rolledBack(scratch.sql, async (tx) => {
          const f = await florist(tx);
          const a = await statement(tx, f.id, 14900);
          const b = await statement(tx, f.id, 9900);
          const first = await asAdmin(tx, (e) =>
            createWiseExport(e, { payoutIds: [a, b] }, actor, { log: quiet }),
          );
          if (!first.ok) throw new Error("no export");
          await asAdmin(tx, (e) => cancelExport(e, first.exportId, actor));
          const [x] = await tx<{ cancelled: boolean }[]>`
            SELECT cancelled_at IS NOT NULL AS cancelled FROM payout_export WHERE id = ${first.exportId}`;
          expect(x?.cancelled).toBe(true);
          expect(
            await codeOf(asAdmin(tx, (e) => wiseExportFile(e, first.exportId))),
          ).toBe("PAYOUT_EXPORT_CANCELLED");
          const again = await asAdmin(tx, (e) =>
            createWiseExport(e, { payoutIds: [a, b] }, actor, { log: quiet }),
          );
          expect(again.ok).toBe(true);
        });
      });

      it("with one paid payout: PAYOUT_EXPORT_PAID and nothing changes", async () => {
        await rolledBack(scratch.sql, async (tx) => {
          const f = await florist(tx);
          const a = await statement(tx, f.id, 14900);
          const b = await statement(tx, f.id, 9900);
          const created = await asAdmin(tx, (e) =>
            createWiseExport(e, { payoutIds: [a, b] }, actor, { log: quiet }),
          );
          if (!created.ok) throw new Error("no export");
          await asAdmin(tx, (e) => markPaid(e, a, actor, { log: quiet }));
          const snapshot = () => tx<{ row: string }[]>`
            SELECT row_to_json(t)::text AS row FROM (
              SELECT id, status, export_id, paid_at FROM payout WHERE id IN (${a}, ${b})
              UNION ALL SELECT id, cancelled_at::text, NULL, NULL FROM payout_export
              WHERE id = ${created.exportId}) t ORDER BY 1`;
          const before = await snapshot();
          expect(
            await codeOf(
              asAdmin(tx, (e) => cancelExport(e, created.exportId, actor)),
            ),
          ).toBe("PAYOUT_EXPORT_PAID");
          expect(await snapshot()).toEqual(before);
        });
      });
    });

    /* -------------------------------------------------------------------- */
    /* T-28                                                                 */
    /* -------------------------------------------------------------------- */

    describe("T-28 (AC-28) · markPaid", () => {
      it("a sent payout in an active export becomes paid with paid_at; markExportPaid pays the rest", async () => {
        await rolledBack(scratch.sql, async (tx) => {
          const f = await florist(tx);
          const a = await statement(tx, f.id, 14900);
          const b = await statement(tx, f.id, 9900);
          const created = await asAdmin(tx, (e) =>
            createWiseExport(e, { payoutIds: [a, b] }, actor, { log: quiet }),
          );
          if (!created.ok) throw new Error("no export");
          await asAdmin(tx, (e) => markPaid(e, a, actor, { log: quiet }));
          expect(
            await asAdmin(tx, (e) =>
              markExportPaid(e, created.exportId, actor, { log: quiet }),
            ),
          ).toEqual({ paid: 1 });
          const rows = await tx<{ status: string; paid: boolean }[]>`
            SELECT status, paid_at IS NOT NULL AS paid FROM payout WHERE id IN (${a}, ${b})`;
          expect(rows).toEqual([
            { status: "paid", paid: true },
            { status: "paid", paid: true },
          ]);
          // Twice: nothing left to pay, the paid one refuses.
          expect(
            await asAdmin(tx, (e) =>
              markExportPaid(e, created.exportId, actor, { log: quiet }),
            ),
          ).toEqual({ paid: 0 });
          expect(await codeOf(asAdmin(tx, (e) => markPaid(e, a, actor)))).toBe(
            "PAYOUT_STATUS_ILLEGAL",
          );
        });
      });

      it("refuses a payout in no export, in a cancelled export, and in draft", async () => {
        await rolledBack(scratch.sql, async (tx) => {
          const f = await florist(tx);
          const loose = await statement(tx, f.id, 14900);
          const cancelled = await statement(tx, f.id, 9900);
          const draft = await statement(tx, f.id, 500, { draft: true });
          const created = await asAdmin(tx, (e) =>
            createWiseExport(e, { payoutIds: [cancelled] }, actor, {
              log: quiet,
            }),
          );
          if (!created.ok) throw new Error("no export");
          await asAdmin(tx, (e) => cancelExport(e, created.exportId, actor));
          expect(
            await codeOf(asAdmin(tx, (e) => markPaid(e, loose, actor))),
          ).toBe("PAYOUT_NOT_EXPORTED");
          expect(
            await codeOf(asAdmin(tx, (e) => markPaid(e, cancelled, actor))),
          ).toBe("PAYOUT_NOT_EXPORTED");
          expect(
            await codeOf(asAdmin(tx, (e) => markPaid(e, draft, actor))),
          ).toBe("PAYOUT_STATUS_ILLEGAL");
          const rows = await tx<{ status: string }[]>`
            SELECT status FROM payout WHERE id IN (${loose}, ${cancelled}, ${draft})`;
          expect(rows.map((r) => r.status).sort()).toEqual([
            "draft",
            "statement_sent",
            "statement_sent",
          ]);
        });
      });
    });
  },
);
