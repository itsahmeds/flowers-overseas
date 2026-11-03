/**
 * The admin payout pages' reads on a migrated PG16 scratch database (spec 030a §2.7, §5.3, AC-29;
 * TASK-367), never the shared database: the SQL behind `/admin/payouts`, `/admin/payouts/[id]`,
 * `/admin/payouts/exports/[id]` and the "Payout terms" block runs under the `admin` role (RLS on)
 * and returns what the pages draw:
 *
 *  - the five groups by status, close and export; the paid group reaches back 8 weeks only;
 *  - an open review and an open adjustment created before the period end show as refusals and
 *    hold the weekly payout, not a prepaid one; the adjustment list says which hold a statement;
 *  - the waiver list: a live order delivered more than 2 hours ago with no `order` line, and not
 *    one delivered an hour ago;
 *  - one payout's lines with the order reference and the settled flag; one export's rows in
 *    statement order with its totals per currency; a cancelled export's count from its audit row;
 *  - a florist's terms with "used n of m".
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  type PayoutActor,
  cancelExport,
  createWiseExport,
  exportDetail,
  markPaid,
  payoutDetail,
  payoutTermsOf,
  payoutsOverview,
  sendStatement,
  settleAdjustment,
} from "../../src/modules/partners/payouts/index.ts";
import { insertPlacedOrder } from "../fixtures/order-state.ts";
import * as make from "./support/rows.ts";
import { runnerOf } from "./support/sql-runner.ts";
import {
  asApp,
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

describe.skipIf(server.url === undefined)(
  `spec 030a admin payout reads${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    let c: Catalogue;
    let actor: PayoutActor;

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "payoutsadmin");
      c = await setUpCatalogue(scratch.sql);
      actor = { userId: c.adminId, requestId: "it-payouts-367" };
    }, 300_000);

    afterAll(async () => {
      await scratch.drop();
    });

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

    const send = (tx: Tx, payoutId: string) =>
      asAdmin(tx, (e) =>
        sendStatement(e, payoutId, actor, {
          scheduleEmail: () => Promise.resolve(),
          log: quiet,
        }),
      );

    it("sorts payouts into the five groups and names each refusal", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const a = await florist(tx, c);
        await tx`UPDATE fulfillment_partner SET wise_recipient_id = '48213077' WHERE id = ${a}`;
        const open = await payout(tx, a, {
          start: "2026-10-26",
          end: "2026-11-01",
          closed: false,
        });
        await goodwill(tx, open, 14900);
        const ready = await payout(tx, a, {
          start: "2026-10-12",
          end: "2026-10-18",
        });
        await goodwill(tx, ready, 29800);
        const flagged = await payout(tx, a, {
          start: "2026-10-05",
          end: "2026-10-11",
        });
        await goodwill(tx, flagged, 1000);
        await tx`UPDATE payout_line SET review_reason = 'unpriced_lines' WHERE payout_id = ${flagged}`;
        const zero = await payout(tx, a, {
          start: "2026-09-28",
          end: "2026-10-04",
        });
        const sent = await payout(tx, a, {
          start: "2026-09-21",
          end: "2026-09-27",
        });
        await goodwill(tx, sent, 12900);
        await send(tx, sent);
        const exported = await payout(tx, a, {
          start: "2026-09-14",
          end: "2026-09-20",
        });
        await goodwill(tx, exported, 64000);
        await send(tx, exported);
        const created = await asAdmin(tx, (e) =>
          createWiseExport(e, { payoutIds: [exported] }, actor, { log: quiet }),
        );
        if (!created.ok) throw new Error("no export");
        const paid = await payout(tx, a, {
          start: "2026-09-07",
          end: "2026-09-13",
        });
        await goodwill(tx, paid, 45500);
        await send(tx, paid);
        await tx`UPDATE payout SET export_id = ${created.exportId} WHERE id = ${paid}`;
        await asAdmin(tx, (e) => markPaid(e, paid, actor));
        const old = await payout(tx, a, {
          start: "2026-06-01",
          end: "2026-06-07",
        });
        await goodwill(tx, old, 100);
        await send(tx, old);
        await tx`UPDATE payout SET export_id = ${created.exportId} WHERE id = ${old}`;
        await asAdmin(tx, (e) => markPaid(e, old, actor));
        await tx`SET LOCAL session_replication_role = replica`;
        await tx`UPDATE payout SET paid_at = now() - interval '57 days' WHERE id = ${old}`;
        await tx`SET LOCAL session_replication_role = DEFAULT`;

        const view = await asAdmin(tx, payoutsOverview);
        const ids = (rows: readonly { id: string }[]) =>
          rows.map((r) => r.id).sort();
        expect(ids(view.open)).toEqual([open]);
        expect(ids(view.ready)).toEqual([ready, flagged, zero].sort());
        expect(ids(view.sent)).toEqual([sent]);
        expect(ids(view.exported)).toEqual([exported]);
        expect(ids(view.paid)).toEqual([paid]);
        const by = (id: string) =>
          [...view.open, ...view.ready].find((r) => r.id === id);
        expect(by(open)?.refusals).toEqual(["PAYOUT_NOT_CLOSED"]);
        expect(by(ready)?.refusals).toEqual([]);
        expect(by(ready)?.totalMinor).toBe(29800n);
        expect(by(flagged)?.refusals).toEqual(["PAYOUT_REVIEW_OPEN"]);
        expect(by(flagged)?.reviewCount).toBe(1);
        expect(by(zero)?.refusals).toEqual(["PAYOUT_TOTAL_NOT_POSITIVE"]);
        expect(view.exported[0]?.exportCreatedAt).toBeInstanceOf(Date);
        expect(view.sent[0]?.statementNumber).toMatch(/^P-[0-9]{6}$/u);
      });
    });

    it("an open adjustment holds a closed weekly statement of its period, not a prepaid one", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const a = await florist(tx, c);
        const weekly = await payout(tx, a, {
          start: "2026-10-19",
          end: "2026-10-25",
        });
        await goodwill(tx, weekly, 61200);
        const prepaid = await payout(tx, a, {
          kind: "prepaid",
          start: "2026-10-24",
        });
        await goodwill(tx, prepaid, 12900);
        const { orderId, assignmentId } = await acceptedOrder(tx, c, a);
        // 23 Oct 18:05 in Warsaw: inside the weekly period.
        await tx`INSERT INTO payout_adjustment (order_id, partner_id, assignment_id, kind, created_at)
                 VALUES (${orderId}, ${a}, ${assignmentId}, 'withdrawn_by_buyer_after_acceptance',
                         '2026-10-23T16:05:00Z')`;
        const view = await asAdmin(tx, payoutsOverview);
        const w = view.ready.find((r) => r.id === weekly);
        const p = view.ready.find((r) => r.id === prepaid);
        expect(w?.refusals).toEqual(["PAYOUT_ADJUSTMENT_OPEN"]);
        expect(w?.blockingAdjustment?.reference).toMatch(/^FO-/u);
        expect(p?.refusals).toEqual([]);
        expect(view.adjustments).toHaveLength(1);
        expect(view.adjustments[0]?.holdsStatement).toBe(true);
        expect(view.adjustments[0]?.currency).toBe("PLN");
        const detail = await asAdmin(tx, (e) => payoutDetail(e, prepaid));
        expect(detail?.prepaidRank).toBe(1);
        expect(detail?.refusals).toEqual([]);
      });
    });

    it("lists a live order delivered over 2 hours ago with no order line, not one delivered an hour ago", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const a = await florist(tx, c);
        const late = await acceptedOrder(tx, c, a);
        const recent = await acceptedOrder(tx, c, a);
        for (const [order, hours] of [
          [late.orderId, 19],
          [recent.orderId, 1],
        ] as const) {
          await tx`SET LOCAL session_replication_role = replica`;
          await tx`UPDATE "order" SET status = 'delivered' WHERE id = ${order}`;
          await tx`INSERT INTO order_event (order_id, seq, type, from_status, to_status, actor, payload_version, occurred_at)
                   VALUES (${order}, 90, 'order.delivered', 'out_for_delivery', 'delivered', 'system:test', 1,
                           now() - make_interval(hours => ${hours}))`;
          await tx`SET LOCAL session_replication_role = DEFAULT`;
        }
        const view = await asAdmin(tx, payoutsOverview);
        expect(view.waivers.map((w) => w.orderId)).toEqual([late.orderId]);
        expect(view.waivers[0]?.reference).toMatch(/^FO-/u);
      });
    });

    it("reads one payout's lines, with the settled flag and the order reference", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const a = await florist(tx, c, "weekly");
        const { orderId, assignmentId } = await acceptedOrder(tx, c, a);
        const [adj] = await tx<{ id: string }[]>`
          INSERT INTO payout_adjustment (order_id, partner_id, assignment_id, kind)
          VALUES (${orderId}, ${a}, ${assignmentId}, 'withdrawn_by_buyer_after_acceptance')
          RETURNING id`;
        const settled = await asAdmin(tx, (e) =>
          settleAdjustment(
            e,
            adj?.id ?? "",
            { amountMinor: 4500, note: "Bouquet made" },
            actor,
          ),
        );
        if (!settled.ok || settled.lineId === null)
          throw new Error("not settled");
        const [line] = await tx<{ payout_id: string }[]>`
          SELECT payout_id FROM payout_line WHERE id = ${settled.lineId}`;
        const detail = await asAdmin(tx, (e) =>
          payoutDetail(e, line?.payout_id ?? ""),
        );
        expect(detail?.lines).toHaveLength(1);
        expect(detail?.lines[0]).toMatchObject({
          kind: "adjustment",
          orderId,
          amountMinor: 4500n,
          note: "Bouquet made",
          settled: true,
        });
        expect(detail?.lines[0]?.reference).toMatch(/^FO-/u);
        expect(
          await asAdmin(tx, (e) => payoutDetail(e, randomUUID())),
        ).toBeUndefined();
        expect(
          await asAdmin(tx, (e) => payoutDetail(e, "not-a-uuid")),
        ).toBeUndefined();
      });
    });

    it("reads an export in statement order with its totals, and a cancelled one's count", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const a = await florist(tx, c);
        await tx`UPDATE fulfillment_partner SET wise_recipient_id = '48213077' WHERE id = ${a}`;
        const one = await payout(tx, a, {
          start: "2026-08-03",
          end: "2026-08-09",
        });
        await goodwill(tx, one, 14900);
        await send(tx, one);
        const two = await payout(tx, a, {
          start: "2026-08-10",
          end: "2026-08-16",
        });
        await goodwill(tx, two, 123450);
        await send(tx, two);
        const created = await asAdmin(tx, (e) =>
          createWiseExport(e, { payoutIds: [two, one] }, actor, { log: quiet }),
        );
        if (!created.ok) throw new Error("no export");
        const detail = await asAdmin(tx, (e) =>
          exportDetail(e, created.exportId),
        );
        expect(detail?.payouts.map((p) => p.id)).toEqual([one, two]);
        expect(detail?.payouts[0]?.wiseRecipientId).toBe("48213077");
        expect(detail?.totals).toEqual([
          { currency: "PLN", totalMinor: 138350n },
        ]);
        expect(detail?.sourceCurrency).toBe("EUR");
        await asAdmin(tx, (e) => cancelExport(e, created.exportId, actor));
        const cancelled = await asAdmin(tx, (e) =>
          exportDetail(e, created.exportId),
        );
        expect(cancelled?.cancelledAt).toBeInstanceOf(Date);
        expect(cancelled?.cancelledCount).toBe(2);
        expect(cancelled?.payouts).toEqual([]);
      });
    });

    it("reads a florist's terms with the prepaid payouts used", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const a = await florist(tx, c, "per_order", 5);
        await payout(tx, a, { kind: "prepaid", start: "2026-10-20" });
        await payout(tx, a, { kind: "prepaid", start: "2026-10-21" });
        expect(await asAdmin(tx, (e) => payoutTermsOf(e, a))).toEqual({
          cadence: "per_order",
          prepaidOrderLimit: 5,
          wiseRecipientId: null,
          prepaidUsed: 2,
        });
      });
    });
  },
);
