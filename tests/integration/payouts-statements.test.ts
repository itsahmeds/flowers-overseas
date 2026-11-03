/**
 * Spec 030a task 2b on a migrated PG16 scratch database (§10 T-10's statement half, T-16 to T-20;
 * AC-10, AC-16 to AC-20; TASK-365), never the shared database:
 *
 *  - T-16 (AC-16): manual lines on a draft and the total after each insert and removal; the
 *    refusals; every verb on a sent statement's lines, by command and by SQL, `PAYOUT_NOT_DRAFT`;
 *  - T-17 (AC-17): settle (into the open weekly payout, created for a `per_order` florist too) and
 *    waive (the reason audited); a second settle or waive `PAYOUT_ADJUSTMENT_RESOLVED`;
 *  - T-18 (AC-18): an open adjustment at 23:59 on the period's Sunday blocks a weekly statement,
 *    one at 00:01 on the Monday does not, and a prepaid payout is never blocked;
 *  - T-19 (AC-19): each refusal of `sendStatement` in order, with no write and no number used;
 *    success, the pattern and two consecutive numbers;
 *  - T-20 (AC-20): three direct status updates refused `PAYOUT_STATUS_ILLEGAL`;
 *  - T-10 (AC-10): a flagged order line blocks the send until `resolveReview`.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  type PayoutActor,
  accrueOrder,
  addManualLine,
  closeDuePayouts,
  fixPayoutAtAcceptance,
  removeManualLine,
  resolveReview,
  sendStatement,
  settleAdjustment,
  waiveAdjustment,
} from "../../src/modules/partners/payouts/index.ts";
import { insertPlacedOrder } from "../fixtures/order-state.ts";
import * as make from "./support/rows.ts";
import { runnerOf } from "./support/sql-runner.ts";
import {
  asApp,
  pgFailure,
  probeLocalServer,
  rolledBack,
  scratchDatabase,
  type ScratchDatabase,
  type Sql,
  type Tx,
} from "./support/scratch-db.ts";

const server = await probeLocalServer();

const quiet = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
} as never;

interface Catalogue {
  readonly countryId: string;
  readonly productA: string;
  readonly addonId: string;
  readonly adminId: string;
}

async function setUpCatalogue(sql: Sql): Promise<Catalogue> {
  return sql.begin(async (tx) => {
    const countryId = await make.country(tx, "PL");
    const [product] = await tx<{ id: string }[]>`
      INSERT INTO product (sku, product_type, primary_flower, colour_primary, style,
                           price_tier, substitution_class, freshness_days)
      VALUES (${make.unique("FO-STM-A")}, 'bouquet', 'roses', 'red', 'classic', 'classic', 'main_flower', 5)
      RETURNING id`;
    const [addon] = await tx<{ id: string }[]>`
      INSERT INTO addon (key, kind) VALUES (${make.unique("vase_").replaceAll("-", "")}, 'confectionery')
      RETURNING id`;
    const adminId = randomUUID();
    await tx`INSERT INTO users (id, email) VALUES (${adminId}, ${`${make.unique("founder")}@example.test`})`;
    return {
      countryId,
      productA: product?.id ?? "",
      addonId: addon?.id ?? "",
      adminId,
    };
  });
}

/** A florist in PL paid 14900 PLN for product A; weekly unless asked, prepaid limit 0 unless asked. */
async function florist(
  tx: Tx,
  c: Catalogue,
  cadence: "weekly" | "per_order" = "weekly",
  limit = 0,
): Promise<string> {
  const id = await make.partner(tx, c.countryId, "active");
  await tx`UPDATE fulfillment_partner SET payout_cadence = ${cadence}, prepaid_order_limit = ${limit}
           WHERE id = ${id}`;
  await tx`INSERT INTO partner_catalog_mapping (partner_id, product_id, tier_key, partner_payout_minor, currency_code)
           VALUES (${id}, ${c.productA}, NULL, 14900, 'PLN')`;
  return id;
}

/** A live order of A (qty 1), with an add-on line when asked; its accepted assignment. */
async function acceptedOrder(
  tx: Tx,
  c: Catalogue,
  partnerId: string,
  addon = false,
): Promise<{ orderId: string; assignmentId: string }> {
  const buyer = await make.customer(tx);
  const orderId = await insertPlacedOrder(tx, {
    customerId: buyer,
    recipientId: await make.recipient(tx, buyer),
    countryId: c.countryId,
    mode: "live",
  });
  await tx`INSERT INTO order_line (order_id, kind, product_id, addon_id, tier_key, qty, unit_retail_minor, currency_code, vat_rate_bp)
           VALUES (${orderId}, 'product', ${c.productA}, NULL, NULL, 1, 8000, 'PLN', 800)`;
  if (addon) {
    await tx`INSERT INTO order_line (order_id, kind, product_id, addon_id, tier_key, qty, unit_retail_minor, currency_code, vat_rate_bp)
             VALUES (${orderId}, 'addon', NULL, ${c.addonId}, NULL, 1, 900, 'PLN', 800)`;
  }
  const at = new Date();
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO order_assignment (order_id, partner_id, offered_at, sla_expires_at, attempt, response, responded_at)
    VALUES (${orderId}, ${partnerId}, ${new Date(at.getTime() - 60_000).toISOString()},
            ${new Date(at.getTime() + 3_600_000).toISOString()}, 1, 'accept', ${at.toISOString()})
    RETURNING id`;
  return { orderId, assignmentId: row?.id ?? "" };
}

/** A payout of `partnerId` written as a fixture: draft, the given kind, period and close. */
async function payout(
  tx: Tx,
  partnerId: string,
  options: {
    kind?: "weekly" | "prepaid" | "per_order";
    start?: string;
    end?: string;
    closed?: boolean;
  } = {},
): Promise<string> {
  const kind = options.kind ?? "weekly";
  const start = options.start ?? "2026-10-19";
  const end = options.end ?? (kind === "weekly" ? "2026-10-25" : start);
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO payout (partner_id, period_start, period_end, status, total_minor, currency_code,
                        kind, closed_at)
    VALUES (${partnerId}, ${start}, ${end}, 'draft', 0, 'PLN', ${kind},
            ${options.closed === false ? null : new Date().toISOString()})
    RETURNING id`;
  return row?.id ?? "";
}

/** A positive goodwill line written as a fixture (the commands are what T-16 tests). */
async function goodwill(tx: Tx, payoutId: string, amount = 2000) {
  await tx`INSERT INTO payout_line (payout_id, amount_minor, currency_code, kind, note)
           VALUES (${payoutId}, ${amount}, 'PLN', 'goodwill', 'fixture')`;
}

async function row(tx: Tx, payoutId: string) {
  const [found] = await tx<
    {
      status: string;
      total_minor: string;
      statement_number: string | null;
      sent: boolean;
      json: string;
    }[]
  >`SELECT status, total_minor::text, statement_number, sent_at IS NOT NULL AS sent,
           row_to_json(p)::text AS json
    FROM payout p WHERE id = ${payoutId}`;
  if (found === undefined) throw new Error("no payout");
  return found;
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  return promise.then(
    () => "done",
    (error: unknown) => (error as { code?: string }).code ?? String(error),
  );
}

describe.skipIf(server.url === undefined)(
  `spec 030a lines, adjustments and statements${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    let c: Catalogue;
    let actor: PayoutActor;

    beforeAll(async () => {
      scratch = await scratchDatabase(
        server.url as string,
        "payoutsstatements",
      );
      c = await setUpCatalogue(scratch.sql);
      actor = { userId: c.adminId, requestId: "it-payouts-365" };
    }, 300_000);

    afterAll(async () => {
      await scratch.drop();
    });

    /** Runs a command as the signed-in admin, inside a savepoint of `tx`. */
    async function asAdmin<T>(
      tx: Tx,
      fn: (executor: ReturnType<typeof runnerOf>) => Promise<T>,
    ): Promise<T> {
      return tx.savepoint(async (sp) => {
        await asApp(sp as unknown as Tx, { role: "admin", userId: c.adminId });
        try {
          return await fn(runnerOf(sp as unknown as Tx));
        } finally {
          await sp.unsafe("RESET ROLE");
        }
      }) as Promise<T>;
    }

    const send = (tx: Tx, payoutId: string, scheduled: string[] = []) =>
      asAdmin(tx, (executor) =>
        sendStatement(executor, payoutId, actor, {
          scheduleEmail: (id) => {
            scheduled.push(id);
            return Promise.resolve();
          },
          log: quiet,
        }),
      );

    /* -------------------------------------------------------------------- */
    /* T-16                                                                 */
    /* -------------------------------------------------------------------- */

    describe("T-16 (AC-16) · manual lines", () => {
      it("an adjustment of -5000 and a goodwill of 2000 with notes; the total follows each insert and removal", async () => {
        await rolledBack(scratch.sql, async (tx) => {
          const partnerId = await florist(tx, c);
          const id = await payout(tx, partnerId);
          await goodwill(tx, id, 10000);
          const total = async () => (await row(tx, id)).total_minor;
          const minus = await asAdmin(tx, (e) =>
            addManualLine(
              e,
              id,
              {
                kind: "adjustment",
                amountMinor: "-5000",
                note: "Card not included",
              },
              actor,
            ),
          );
          expect(await total()).toBe("5000");
          const plus = await asAdmin(tx, (e) =>
            addManualLine(
              e,
              id,
              { kind: "goodwill", amountMinor: 2000, note: "Sunday delivery" },
              actor,
            ),
          );
          expect(await total()).toBe("7000");
          if (!minus.ok || !plus.ok) throw new Error("not added");
          await asAdmin(tx, (e) => removeManualLine(e, minus.lineId, actor));
          expect(await total()).toBe("12000");
          await asAdmin(tx, (e) => removeManualLine(e, plus.lineId, actor));
          expect(await total()).toBe("10000");
          const audits = await tx<{ action: string }[]>`
            SELECT action FROM audit_log WHERE request_id = 'it-payouts-365'
              AND entity_table = 'payout_line' ORDER BY at, id`;
          expect(audits.map((a) => a.action).sort()).toEqual([
            "payout.line_added",
            "payout.line_added",
            "payout.line_removed",
            "payout.line_removed",
          ]);
        });
      });

      it.each([
        [
          { kind: "goodwill", amountMinor: 0, note: "nothing" },
          ["amountMinor"],
        ],
        [{ kind: "goodwill", amountMinor: -1, note: "minus" }, ["amountMinor"]],
        [{ kind: "adjustment", amountMinor: 0, note: "zero" }, ["amountMinor"]],
        [{ kind: "adjustment", amountMinor: 500 }, ["note"]],
        [{ kind: "adjustment", amountMinor: 500, note: "  a " }, ["note"]],
        [
          { kind: "adjustment", amountMinor: "5.5", note: "half" },
          ["amountMinor"],
        ],
      ])("refuses %j with no write", async (input, fields) => {
        await rolledBack(scratch.sql, async (tx) => {
          const partnerId = await florist(tx, c);
          const id = await payout(tx, partnerId);
          await goodwill(tx, id);
          const before = await row(tx, id);
          expect(
            await asAdmin(tx, (e) => addManualLine(e, id, input, actor)),
          ).toEqual({ ok: false, reason: "invalid", fields });
          expect(await row(tx, id)).toEqual(before);
        });
      });

      it("an order line is not removable; a settled adjustment's line is not removable", async () => {
        await rolledBack(scratch.sql, async (tx) => {
          const partnerId = await florist(tx, c);
          const { orderId, assignmentId } = await acceptedOrder(
            tx,
            c,
            partnerId,
          );
          await asAdmin(tx, (e) =>
            fixPayoutAtAcceptance(
              e,
              { orderId, assignmentId },
              { schedulePrepaidReady: () => Promise.resolve(), log: quiet },
            ),
          );
          await asAdmin(tx, (e) =>
            accrueOrder(e, { orderId, source: "photo" }, { log: quiet }),
          );
          const [line] = await tx<{ id: string }[]>`
            SELECT id FROM payout_line WHERE order_id = ${orderId} AND kind = 'order'`;
          expect(
            await codeOf(
              asAdmin(tx, (e) => removeManualLine(e, line?.id ?? "", actor)),
            ),
          ).toBe("PAYOUT_LINE_NOT_REMOVABLE");
          const other = await acceptedOrder(tx, c, partnerId);
          const [adjustment] = await tx<{ id: string }[]>`
            INSERT INTO payout_adjustment (order_id, partner_id, assignment_id, kind)
            VALUES (${other.orderId}, ${partnerId}, ${other.assignmentId}, 'withdrawn_by_buyer_after_acceptance')
            RETURNING id`;
          const settled = await asAdmin(tx, (e) =>
            settleAdjustment(
              e,
              adjustment?.id ?? "",
              { amountMinor: 5000, note: "Flowers bought" },
              actor,
            ),
          );
          if (!settled.ok || settled.lineId === null)
            throw new Error("no line");
          const lineId = settled.lineId;
          expect(
            await codeOf(
              asAdmin(tx, (e) => removeManualLine(e, lineId, actor)),
            ),
          ).toBe("PAYOUT_LINE_NOT_REMOVABLE");
        });
      });

      it("a sent statement's lines: every verb, by command and by SQL, raises PAYOUT_NOT_DRAFT", async () => {
        await rolledBack(scratch.sql, async (tx) => {
          const partnerId = await florist(tx, c);
          const id = await payout(tx, partnerId);
          const added = await asAdmin(tx, (e) =>
            addManualLine(
              e,
              id,
              { kind: "goodwill", amountMinor: 2000, note: "Sunday" },
              actor,
            ),
          );
          if (!added.ok) throw new Error("not added");
          await send(tx, id);
          expect(
            await codeOf(
              asAdmin(tx, (e) =>
                addManualLine(
                  e,
                  id,
                  { kind: "adjustment", amountMinor: -100, note: "late" },
                  actor,
                ),
              ),
            ),
          ).toBe("PAYOUT_NOT_DRAFT");
          expect(
            await codeOf(
              asAdmin(tx, (e) => removeManualLine(e, added.lineId, actor)),
            ),
          ).toBe("PAYOUT_NOT_DRAFT");
          const insert = await pgFailure(
            tx,
            (sp) =>
              sp`INSERT INTO payout_line (payout_id, amount_minor, currency_code, kind, note)
                 VALUES (${id}, 100, 'PLN', 'goodwill', 'sql')`,
          );
          const update = await pgFailure(
            tx,
            (sp) =>
              sp`UPDATE payout_line SET amount_minor = 1 WHERE id = ${added.lineId}`,
          );
          const remove = await pgFailure(
            tx,
            (sp) => sp`DELETE FROM payout_line WHERE id = ${added.lineId}`,
          );
          expect([insert.raised, update.raised, remove.raised]).toEqual([
            "PAYOUT_NOT_DRAFT",
            "PAYOUT_NOT_DRAFT",
            "PAYOUT_NOT_DRAFT",
          ]);
          expect((await row(tx, id)).total_minor).toBe("2000");
        });
      });
    });

    /* -------------------------------------------------------------------- */
    /* T-17                                                                 */
    /* -------------------------------------------------------------------- */

    describe("T-17 (AC-17) · settle and waive", () => {
      async function openAdjustment(tx: Tx, partnerId: string) {
        const { orderId, assignmentId } = await acceptedOrder(tx, c, partnerId);
        const [adjustment] = await tx<{ id: string }[]>`
          INSERT INTO payout_adjustment (order_id, partner_id, assignment_id, kind)
          VALUES (${orderId}, ${partnerId}, ${assignmentId}, 'withdrawn_by_buyer_after_acceptance')
          RETURNING id`;
        return { adjustmentId: adjustment?.id ?? "", orderId };
      }

      async function adjustmentRow(tx: Tx, id: string) {
        const [found] = await tx<
          { status: string; line: string | null; resolved: boolean }[]
        >`SELECT status, payout_line_id AS line, resolved_at IS NOT NULL AS resolved
          FROM payout_adjustment WHERE id = ${id}`;
        return found;
      }

      it.each(["weekly", "per_order"] as const)(
        "settle 5000 for a %s florist: one adjustment line with the order in the open weekly payout, the row settled",
        async (cadence) => {
          await rolledBack(scratch.sql, async (tx) => {
            const partnerId = await florist(tx, c, cadence);
            const { adjustmentId, orderId } = await openAdjustment(
              tx,
              partnerId,
            );
            const result = await asAdmin(tx, (e) =>
              settleAdjustment(
                e,
                adjustmentId,
                { amountMinor: "5000", note: "Flowers already bought" },
                actor,
                { now: () => new Date("2026-10-21T08:00:00Z") },
              ),
            );
            expect(result.ok).toBe(true);
            const lines = await tx<
              {
                kind: string;
                payout_kind: string;
                closed: boolean;
                order_id: string;
                amount: string;
                id: string;
                period_end: string;
              }[]
            >`SELECT l.id, l.kind, p.kind AS payout_kind, p.closed_at IS NOT NULL AS closed,
                     l.order_id, l.amount_minor::text AS amount, p.period_end::text
              FROM payout_line l JOIN payout p ON p.id = l.payout_id
              WHERE p.partner_id = ${partnerId}`;
            expect(
              lines.map((l) => [
                l.kind,
                l.payout_kind,
                l.closed,
                l.order_id,
                l.amount,
                l.period_end,
              ]),
            ).toEqual([
              ["adjustment", "weekly", false, orderId, "5000", "2026-10-25"],
            ]);
            expect(await adjustmentRow(tx, adjustmentId)).toEqual({
              status: "settled",
              line: lines[0]?.id,
              resolved: true,
            });
          });
        },
      );

      it("waive: the row waived with resolved_at and the reason audited; a second settle or waive of either row refuses PAYOUT_ADJUSTMENT_RESOLVED", async () => {
        await rolledBack(scratch.sql, async (tx) => {
          const partnerId = await florist(tx, c);
          const settled = await openAdjustment(tx, partnerId);
          const waived = await openAdjustment(tx, partnerId);
          await asAdmin(tx, (e) =>
            settleAdjustment(
              e,
              settled.adjustmentId,
              { amountMinor: 5000, note: "Bought" },
              actor,
            ),
          );
          expect(
            await asAdmin(tx, (e) =>
              waiveAdjustment(
                e,
                waived.adjustmentId,
                { reason: "Cancelled before work" },
                actor,
              ),
            ),
          ).toEqual({ ok: true, lineId: null });
          expect(await adjustmentRow(tx, waived.adjustmentId)).toEqual({
            status: "waived",
            line: null,
            resolved: true,
          });
          const [audit] = await tx<{ reason: string }[]>`
            SELECT reason FROM audit_log
            WHERE action = 'payout.adjustment_waived' AND entity_id = ${waived.adjustmentId}`;
          expect(audit?.reason).toBe("Cancelled before work");
          for (const id of [settled.adjustmentId, waived.adjustmentId]) {
            expect(
              await codeOf(
                asAdmin(tx, (e) =>
                  settleAdjustment(
                    e,
                    id,
                    { amountMinor: 1, note: "again" },
                    actor,
                  ),
                ),
              ),
            ).toBe("PAYOUT_ADJUSTMENT_RESOLVED");
            expect(
              await codeOf(
                asAdmin(tx, (e) =>
                  waiveAdjustment(e, id, { reason: "and again, twice" }, actor),
                ),
              ),
            ).toBe("PAYOUT_ADJUSTMENT_RESOLVED");
          }
          // Refusals of the schemas write nothing either.
          const third = await openAdjustment(tx, partnerId);
          expect(
            await asAdmin(tx, (e) =>
              settleAdjustment(
                e,
                third.adjustmentId,
                { amountMinor: 0, note: "zero" },
                actor,
              ),
            ),
          ).toEqual({ ok: false, reason: "invalid" });
          expect(
            await asAdmin(tx, (e) =>
              waiveAdjustment(
                e,
                third.adjustmentId,
                { reason: "too short" },
                actor,
              ),
            ),
          ).toEqual({ ok: false, reason: "invalid" });
          expect((await adjustmentRow(tx, third.adjustmentId))?.status).toBe(
            "open",
          );
        });
      });
    });

    /* -------------------------------------------------------------------- */
    /* T-18                                                                 */
    /* -------------------------------------------------------------------- */

    describe("T-18 (AC-18) · an open adjustment and the period's end", () => {
      async function withAdjustmentAt(tx: Tx, partnerId: string, at: string) {
        const { orderId, assignmentId } = await acceptedOrder(tx, c, partnerId);
        await tx`INSERT INTO payout_adjustment (order_id, partner_id, assignment_id, kind, created_at)
                 VALUES (${orderId}, ${partnerId}, ${assignmentId},
                         'withdrawn_by_buyer_after_acceptance', ${at})`;
      }

      it("23:59 on Sunday 25 October in Warsaw (CET) blocks the weekly statement; 00:01 on the Monday does not", async () => {
        await rolledBack(scratch.sql, async (tx) => {
          const before = await florist(tx, c);
          const blocked = await payout(tx, before);
          await goodwill(tx, blocked);
          await withAdjustmentAt(tx, before, "2026-10-25T22:59:00Z");
          expect(await codeOf(send(tx, blocked))).toBe(
            "PAYOUT_ADJUSTMENT_OPEN",
          );
          expect((await row(tx, blocked)).status).toBe("draft");

          const after = await florist(tx, c);
          const free = await payout(tx, after);
          await goodwill(tx, free);
          await withAdjustmentAt(tx, after, "2026-10-25T23:01:00Z");
          expect(await codeOf(send(tx, free))).toBe("done");
        });
      });

      it("a prepaid payout with an open adjustment sends", async () => {
        await rolledBack(scratch.sql, async (tx) => {
          const partnerId = await florist(tx, c);
          const id = await payout(tx, partnerId, {
            kind: "prepaid",
            start: "2026-10-21",
          });
          await goodwill(tx, id);
          await withAdjustmentAt(tx, partnerId, "2026-10-20T10:00:00Z");
          expect(await codeOf(send(tx, id))).toBe("done");
        });
      });
    });

    /* -------------------------------------------------------------------- */
    /* T-19                                                                 */
    /* -------------------------------------------------------------------- */

    describe("T-19 (AC-19) · sendStatement", () => {
      it("refuses, in order and with no write and no number used: sent, open, total 0, total -100", async () => {
        await rolledBack(scratch.sql, async (tx) => {
          const partnerId = await florist(tx, c);
          const [{ last } = { last: "0" }] = await tx<{ last: string }[]>`
            SELECT coalesce((SELECT last_value FROM payout_statement_number_seq
                             WHERE is_called), 0)::text AS last`;
          const sent = await payout(tx, partnerId, {
            start: "2026-10-05",
            end: "2026-10-11",
          });
          await goodwill(tx, sent);
          await send(tx, sent);
          const open = await payout(tx, partnerId, {
            start: "2026-10-26",
            end: "2026-11-01",
            closed: false,
          });
          const zero = await payout(tx, partnerId, {
            start: "2026-10-12",
            end: "2026-10-18",
          });
          const negative = await payout(tx, partnerId);
          await tx`INSERT INTO payout_line (payout_id, amount_minor, currency_code, kind, note)
                   VALUES (${negative}, -100, 'PLN', 'adjustment', 'claw-back')`;
          const cases: [string, string][] = [
            [sent, "PAYOUT_STATUS_ILLEGAL"],
            [open, "PAYOUT_NOT_CLOSED"],
            [zero, "PAYOUT_TOTAL_NOT_POSITIVE"],
            [negative, "PAYOUT_TOTAL_NOT_POSITIVE"],
          ];
          for (const [id, code] of cases) {
            const before = await row(tx, id);
            expect(await codeOf(send(tx, id)), code).toBe(code);
            expect(await row(tx, id)).toEqual(before);
          }
          const [{ used } = { used: "" }] = await tx<{ used: string }[]>`
            SELECT last_value::text AS used FROM payout_statement_number_seq`;
          // Only the first, successful send took a number.
          expect(BigInt(used)).toBe(BigInt(last) + 1n);
        });
      });

      it("the order of the refusals: open beats a zero total, a zero total beats a review flag, a flag beats an open adjustment", async () => {
        await rolledBack(scratch.sql, async (tx) => {
          const partnerId = await florist(tx, c);
          const { orderId, assignmentId } = await acceptedOrder(
            tx,
            c,
            partnerId,
            true,
          );
          await withAdjustmentOn(tx, partnerId);
          await asAdmin(tx, (e) =>
            fixPayoutAtAcceptance(
              e,
              { orderId, assignmentId },
              { schedulePrepaidReady: () => Promise.resolve(), log: quiet },
            ),
          );
          await asAdmin(tx, (e) =>
            accrueOrder(
              e,
              { orderId, source: "photo" },
              { now: () => new Date("2026-10-21T08:00:00Z"), log: quiet },
            ),
          );
          const [open] = await tx<{ id: string }[]>`
            SELECT id FROM payout WHERE partner_id = ${partnerId}`;
          const id = open?.id ?? "";
          // Open, positive, flagged, with an open adjustment: not closed first.
          expect(await codeOf(send(tx, id))).toBe("PAYOUT_NOT_CLOSED");
          await tx`UPDATE payout SET closed_at = now() WHERE id = ${id}`;
          const [minus] = await tx<{ id: string }[]>`
            INSERT INTO payout_line (payout_id, amount_minor, currency_code, kind, note)
            VALUES (${id}, -14900, 'PLN', 'adjustment', 'claw-back') RETURNING id`;
          expect(await codeOf(send(tx, id))).toBe("PAYOUT_TOTAL_NOT_POSITIVE");
          await tx`DELETE FROM payout_line WHERE id = ${minus?.id ?? ""}`;
          expect(await codeOf(send(tx, id))).toBe("PAYOUT_REVIEW_OPEN");
        });

        async function withAdjustmentOn(tx: Tx, partnerId: string) {
          const other = await acceptedOrder(tx, c, partnerId);
          await tx`INSERT INTO payout_adjustment (order_id, partner_id, assignment_id, kind, created_at)
                   VALUES (${other.orderId}, ${partnerId}, ${other.assignmentId},
                           'withdrawn_by_buyer_after_acceptance', '2026-10-20T10:00:00Z')`;
        }
      });

      it("success: statement_sent, sent_at, P-NNNNNN, one audit row, the email enqueued; two sends are consecutive", async () => {
        await rolledBack(scratch.sql, async (tx) => {
          const partnerId = await florist(tx, c);
          const first = await payout(tx, partnerId, {
            start: "2026-10-05",
            end: "2026-10-11",
          });
          const second = await payout(tx, partnerId);
          await goodwill(tx, first);
          await goodwill(tx, second);
          const scheduled: string[] = [];
          const a = await send(tx, first, scheduled);
          const b = await send(tx, second, scheduled);
          expect(a.statementNumber).toMatch(/^P-[0-9]{6}$/u);
          expect(Number(b.statementNumber.slice(2))).toBe(
            Number(a.statementNumber.slice(2)) + 1,
          );
          const sent = await row(tx, first);
          expect({
            status: sent.status,
            number: sent.statement_number,
            sent: sent.sent,
          }).toEqual({
            status: "statement_sent",
            number: a.statementNumber,
            sent: true,
          });
          expect(scheduled).toEqual([first, second]);
          const [audits] = await tx<{ n: number }[]>`
            SELECT count(*)::int AS n FROM audit_log
            WHERE action = 'payout.statement_sent' AND entity_id IN (${first}, ${second})`;
          expect(audits?.n).toBe(2);
        });
      });
    });

    /* -------------------------------------------------------------------- */
    /* T-20                                                                 */
    /* -------------------------------------------------------------------- */

    it("T-20 (AC-20): draft to paid, paid to statement_sent and statement_sent to draft each raise PAYOUT_STATUS_ILLEGAL", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const partnerId = await florist(tx, c);
        const draft = await payout(tx, partnerId, {
          start: "2026-10-05",
          end: "2026-10-11",
        });
        await goodwill(tx, draft);
        const toPaid = await pgFailure(
          tx,
          (sp) =>
            sp`UPDATE payout SET status = 'paid', paid_at = now() WHERE id = ${draft}`,
        );
        const sentId = await payout(tx, partnerId, {
          start: "2026-10-12",
          end: "2026-10-18",
        });
        await goodwill(tx, sentId);
        await send(tx, sentId);
        const toDraft = await pgFailure(
          tx,
          (sp) =>
            sp`UPDATE payout SET status = 'draft', sent_at = NULL, statement_number = NULL
               WHERE id = ${sentId}`,
        );
        await tx`UPDATE payout SET status = 'paid', paid_at = now() WHERE id = ${sentId}`;
        const back = await pgFailure(
          tx,
          (sp) =>
            sp`UPDATE payout SET status = 'statement_sent', paid_at = NULL WHERE id = ${sentId}`,
        );
        expect([toPaid.raised, back.raised, toDraft.raised]).toEqual([
          "PAYOUT_STATUS_ILLEGAL",
          "PAYOUT_STATUS_ILLEGAL",
          "PAYOUT_STATUS_ILLEGAL",
        ]);
      });
    });

    /* -------------------------------------------------------------------- */
    /* T-10's statement half                                                */
    /* -------------------------------------------------------------------- */

    it("T-10 (AC-10): an order with an add-on accrues flagged; the closed payout refuses PAYOUT_REVIEW_OPEN; after resolveReview it sends", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const partnerId = await florist(tx, c);
        const { orderId, assignmentId } = await acceptedOrder(
          tx,
          c,
          partnerId,
          true,
        );
        await asAdmin(tx, (e) =>
          fixPayoutAtAcceptance(
            e,
            { orderId, assignmentId },
            { schedulePrepaidReady: () => Promise.resolve(), log: quiet },
          ),
        );
        await asAdmin(tx, (e) =>
          accrueOrder(
            e,
            { orderId, source: "photo" },
            { now: () => new Date("2026-10-21T08:00:00Z"), log: quiet },
          ),
        );
        await asAdmin(tx, (e) =>
          closeDuePayouts(new Date("2026-10-25T23:30:00Z"), {
            executor: e,
            sendReady: () => Promise.resolve(),
            log: quiet,
          }),
        );
        const [line] = await tx<{ id: string; payout_id: string }[]>`
          SELECT id, payout_id FROM payout_line WHERE order_id = ${orderId} AND kind = 'order'`;
        const id = line?.payout_id ?? "";
        expect(await codeOf(send(tx, id))).toBe("PAYOUT_REVIEW_OPEN");
        await asAdmin(tx, (e) => resolveReview(e, line?.id ?? "", actor));
        // Twice is harmless.
        await asAdmin(tx, (e) => resolveReview(e, line?.id ?? "", actor));
        expect(await codeOf(send(tx, id))).toBe("done");
        const [reviewed] = await tx<{ by: string; at: boolean }[]>`
          SELECT reviewed_by::text AS by, reviewed_at IS NOT NULL AS at
          FROM payout_line WHERE id = ${line?.id ?? ""}`;
        expect(reviewed).toEqual({ by: c.adminId, at: true });
        // A resolve on a sent statement's flagged line is still allowed (frozen-lines exception)
        // and a line with no flag refuses.
        const plain = await payout(tx, partnerId, {
          start: "2026-10-05",
          end: "2026-10-11",
        });
        await goodwill(tx, plain);
        const [plainLine] = await tx<{ id: string }[]>`
          SELECT id FROM payout_line WHERE payout_id = ${plain}`;
        expect(
          await codeOf(
            asAdmin(tx, (e) => resolveReview(e, plainLine?.id ?? "", actor)),
          ),
        ).toBe("PAYOUT_REVIEW_NONE");
      });
    });
  },
);
