/**
 * Spec 030a task 2a on a migrated PG16 scratch database (§10 T-03, T-08 to T-15, T-33; AC-3,
 * AC-8 to AC-15, AC-33; TASK-364), never the shared database:
 *
 *  - T-03 (AC-3): a mapping changed after acceptance does not reach the accrued line;
 *  - T-08 (AC-8): a weekly florist's photo opens one weekly payout to the Sunday, a second order
 *    joins it, a second run writes nothing, `total_minor` is the sum of the lines; the real
 *    `payouts` handler on an `order.photo_uploaded` delivery does the same;
 *  - T-09 (AC-9): a `per_order` florist gets a one-order payout, closed, dated in Warsaw;
 *  - T-10 (AC-10): an add-on or a surcharge flags the line `unpriced_lines`;
 *  - T-11 (AC-11): a null unit amount raises `PAYOUT_AMOUNT_UNKNOWN`, writes nothing, the
 *    dispatcher keeps the delivery retryable; `payouts.watch` 61 minutes later sends F3 and
 *    raises the alert once, and not again on the next run;
 *  - T-12 (AC-12): the waiver from `delivered`, refused from four other states, for `test`, and
 *    for a 9-character reason;
 *  - T-13 (AC-13): `payouts.accrue` off holds the photo's delivery `pending`; on, it accrues;
 *  - T-14 (AC-14): `closeDuePayouts` across the DST night with positive, zero and negative totals,
 *    a second run, and F2 once per closing run;
 *  - T-15 (AC-15): two concurrent accruals with no open payout make one; after it closes, the next
 *    accrual starts the day after its `period_end`;
 *  - T-33 (AC-33): a live order walked by the real florist commands and the real dispatcher ends
 *    with one `order` line of its amount in the florist's open weekly payout.
 */
import { randomUUID } from "node:crypto";

import postgres from "postgres";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { InMemoryStorage } from "../../src/lib/storage.ts";
import { runProductionStart } from "../../src/modules/payments/index.ts";
import { adminT } from "../../src/modules/admin/messages.ts";
import {
  capturingMailer,
  sendJobNotifications,
  sendOpsJobNotification,
} from "../../src/modules/notifications/index.ts";
import { registerOpsEmailTemplates } from "../../src/modules/notifications/emails/index.ts";
import {
  type FloristCommandRuntime,
  markDelivered,
  markOutForDelivery,
  respondToOffer,
} from "../../src/modules/orders/florist-actions/index.ts";
import {
  type DeliveryTransaction,
  dispatchOutbox,
  type OrderExecutor,
  orderReference,
  transition,
} from "../../src/modules/orders/index.ts";
import {
  accrueOrder,
  accrueWithoutPhoto,
  closeDuePayouts,
  fixPayoutAtAcceptance,
  payoutsOutboxHandler,
  registerPayoutsOutbox,
  watchMissingLines,
} from "../../src/modules/partners/payouts/index.ts";
import { insertPlacedOrder, walkOrderTo } from "../fixtures/order-state.ts";
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

const OPS = "ops@example.test";
const ORIGIN = "https://flowersoverseas.test";

interface Catalogue {
  readonly countryId: string;
  readonly productA: string;
  readonly productB: string;
  readonly addonId: string;
  readonly adminId: string;
}

const quiet = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
} as never;

/** A florist in PL with mappings A 14900 PLN and B 9900 PLN; prepaid limit 0 unless asked. */
async function florist(
  tx: Tx,
  c: Catalogue,
  cadence: "weekly" | "per_order" = "weekly",
  limit = 0,
): Promise<string> {
  const id = await make.partner(tx, c.countryId, "active");
  await tx`UPDATE fulfillment_partner SET prepaid_order_limit = ${limit}, payout_cadence = ${cadence}
           WHERE id = ${id}`;
  await tx`INSERT INTO partner_catalog_mapping (partner_id, product_id, tier_key, partner_payout_minor, currency_code)
           VALUES (${id}, ${c.productA}, NULL, 14900, 'PLN'), (${id}, ${c.productB}, NULL, 9900, 'PLN')`;
  return id;
}

/** An order with A (qty 2), B (qty 1) and, unless `plain`, one add-on line. */
async function order(
  tx: Tx,
  c: Catalogue,
  options: {
    mode?: "live" | "test";
    extra?: "addon" | "surcharge" | null;
  } = {},
): Promise<string> {
  const buyer = await make.customer(tx);
  const orderId = await insertPlacedOrder(tx, {
    customerId: buyer,
    recipientId: await make.recipient(tx, buyer),
    countryId: c.countryId,
    mode: options.mode ?? "live",
  });
  await tx`INSERT INTO order_line (order_id, kind, product_id, addon_id, tier_key, qty, unit_retail_minor, currency_code, vat_rate_bp)
           VALUES (${orderId}, 'product', ${c.productA}, NULL, NULL, 2, 8000, 'PLN', 800),
                  (${orderId}, 'product', ${c.productB}, NULL, NULL, 1, 2000, 'PLN', 800)`;
  const extra = options.extra === undefined ? null : options.extra;
  if (extra === "addon") {
    await tx`INSERT INTO order_line (order_id, kind, product_id, addon_id, tier_key, qty, unit_retail_minor, currency_code, vat_rate_bp)
             VALUES (${orderId}, 'addon', NULL, ${c.addonId}, NULL, 1, 900, 'PLN', 800)`;
  } else if (extra === "surcharge") {
    await tx`INSERT INTO order_line (order_id, kind, product_id, addon_id, tier_key, qty, unit_retail_minor, currency_code, vat_rate_bp)
             VALUES (${orderId}, 'surcharge', NULL, NULL, NULL, 1, 1500, 'PLN', 800)`;
  }
  return orderId;
}

/** An accepted assignment of `orderId` to `partnerId`. */
async function accepted(
  tx: Tx,
  orderId: string,
  partnerId: string,
  at: Date = new Date(),
): Promise<string> {
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO order_assignment (order_id, partner_id, offered_at, sla_expires_at, attempt, response, responded_at)
    VALUES (${orderId}, ${partnerId}, ${new Date(at.getTime() - 60_000).toISOString()}, ${new Date(at.getTime() + 3_600_000).toISOString()}, 1, 'accept', ${at.toISOString()})
    RETURNING id`;
  return row?.id ?? "";
}

async function asSystem<T>(tx: Tx, fn: () => Promise<T>): Promise<T> {
  await asApp(tx, { role: "system" });
  try {
    return await fn();
  } finally {
    await tx.unsafe("RESET ROLE");
  }
}

/** Accepts `orderId` for `partnerId` and fixes its amounts, as the acceptance handler does. */
async function acceptAndFix(
  tx: Tx,
  orderId: string,
  partnerId: string,
): Promise<void> {
  const assignmentId = await accepted(tx, orderId, partnerId);
  await asSystem(tx, () =>
    fixPayoutAtAcceptance(
      runnerOf(tx),
      { orderId, assignmentId },
      { schedulePrepaidReady: () => Promise.resolve(), log: quiet },
    ),
  );
}

async function accrue(tx: Tx, orderId: string, now: Date) {
  return asSystem(tx, () =>
    accrueOrder(
      runnerOf(tx),
      { orderId, source: "photo" },
      { now: () => now, log: quiet },
    ),
  );
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  return promise.then(
    () => "done",
    (error: unknown) => (error as { code?: string }).code ?? String(error),
  );
}

interface PayoutRow {
  id: string;
  kind: string;
  period_start: string;
  period_end: string;
  closed: boolean;
  total_minor: string;
  lines: { order_id: string | null; amount: string; review: string | null }[];
}

async function payouts(sql: Sql | Tx, partnerId: string): Promise<PayoutRow[]> {
  return sql<PayoutRow[]>`
    SELECT p.id, p.kind, p.period_start::text, p.period_end::text,
           p.closed_at IS NOT NULL AS closed, p.total_minor::text,
           coalesce((SELECT jsonb_agg(jsonb_build_object('order_id', l.order_id,
                                                         'amount', l.amount_minor::text,
                                                         'review', l.review_reason)
                                      ORDER BY l.created_at, l.id)
                     FROM payout_line l WHERE l.payout_id = p.id), '[]'::jsonb) AS lines
    FROM payout p WHERE p.partner_id = ${partnerId}
    ORDER BY p.period_start, p.created_at`;
}

async function setUpCatalogue(sql: Sql): Promise<Catalogue> {
  return sql.begin(async (tx) => {
    const countryId = await make.country(tx, "PL");
    const product = async (sku: string) => {
      const [row] = await tx<{ id: string }[]>`
        INSERT INTO product (sku, product_type, primary_flower, colour_primary, style,
                             price_tier, substitution_class, freshness_days)
        VALUES (${sku}, 'bouquet', 'roses', 'red', 'classic', 'classic', 'main_flower', 5)
        RETURNING id`;
      return row?.id ?? "";
    };
    const productA = await product(make.unique("FO-ACC-A"));
    const productB = await product(make.unique("FO-ACC-B"));
    const [addon] = await tx<{ id: string }[]>`
      INSERT INTO addon (key, kind) VALUES (${make.unique("card_").replaceAll("-", "")}, 'confectionery')
      RETURNING id`;
    const adminId = randomUUID();
    await tx`INSERT INTO users (id, email) VALUES (${adminId}, ${`${make.unique("founder")}@example.test`})`;
    return { countryId, productA, productB, addonId: addon?.id ?? "", adminId };
  });
}

/** 10:00 on Wednesday 21 October 2026 in Warsaw (CEST, UTC+2). */
const AC8_INSTANT = new Date("2026-10-21T08:00:00Z");

describe.skipIf(server.url === undefined)(
  `spec 030a accrual and the weekly close${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    let c: Catalogue;

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "payoutsaccrual");
      c = await setUpCatalogue(scratch.sql);
      registerOpsEmailTemplates(
        {
          t: adminT as unknown as (
            key: string,
            values?: Readonly<Record<string, string>>,
          ) => string,
          orderHref: (id) => `/admin/orders/${id}`,
          payoutHref: (id) => `/admin/payouts/${id}`,
          payoutsHref: () => "/admin/payouts",
        },
        () => ORIGIN,
      );
    }, 300_000);

    afterAll(async () => {
      await scratch.drop();
    });

    /* -------------------------------------------------------------------- */
    /* T-03                                                                 */
    /* -------------------------------------------------------------------- */

    it("T-03 (AC-3): a mapping changed to 15900 after acceptance still accrues 2 × 14900 + 9900 = 39700", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const partnerId = await florist(tx, c);
        const orderId = await order(tx, c);
        await acceptAndFix(tx, orderId, partnerId);
        await tx`UPDATE partner_catalog_mapping SET partner_payout_minor = 15900
                 WHERE partner_id = ${partnerId} AND product_id = ${c.productA}`;
        expect((await accrue(tx, orderId, AC8_INSTANT)).outcome).toBe(
          "accrued",
        );
        const [payout] = await payouts(tx, partnerId);
        expect(payout?.lines.map((l) => l.amount)).toEqual(["39700"]);
        const direct = await pgFailure(
          tx,
          (sp) =>
            sp`UPDATE order_line SET partner_payout_minor = 15900
               WHERE order_id = ${orderId} AND product_id = ${c.productA}`,
        );
        expect(direct.raised).toBe("ORDER_LINE_PAYOUT_FIXED");
      });
    });

    /* -------------------------------------------------------------------- */
    /* T-08                                                                 */
    /* -------------------------------------------------------------------- */

    describe("T-08 (AC-8) · a weekly florist's photo", () => {
      it("opens one weekly payout to Sunday 25 October; a second order joins it; twice writes one line per order; the total is the sum", async () => {
        await rolledBack(scratch.sql, async (tx) => {
          const partnerId = await florist(tx, c);
          const first = await order(tx, c, { extra: null });
          const second = await order(tx, c, { extra: null });
          await acceptAndFix(tx, first, partnerId);
          await acceptAndFix(tx, second, partnerId);
          await tx`UPDATE order_line SET qty = 1 WHERE order_id = ${second} AND product_id = ${c.productA}`;
          for (let i = 0; i < 2; i += 1) {
            await accrue(tx, first, AC8_INSTANT);
            await accrue(
              tx,
              second,
              new Date(AC8_INSTANT.getTime() + 3_600_000),
            );
          }
          const rows = await payouts(tx, partnerId);
          expect(
            rows.map((r) => ({
              kind: r.kind,
              start: r.period_start,
              end: r.period_end,
              closed: r.closed,
              total: r.total_minor,
              lines: r.lines
                .map((l) => [l.order_id, l.amount])
                .sort((x, y) => String(x[1]).localeCompare(String(y[1]))),
            })),
          ).toEqual([
            {
              kind: "weekly",
              start: "2026-10-21",
              end: "2026-10-25",
              closed: false,
              // 39700 + (14900 + 9900) = 64500
              total: "64500",
              lines: [
                [second, "24800"],
                [first, "39700"],
              ],
            },
          ]);
        });
      });

      it("the real payouts handler on an order.photo_uploaded delivery accrues, and again writes nothing", async () => {
        await rolledBack(scratch.sql, async (tx) => {
          const partnerId = await florist(tx, c);
          const orderId = await order(tx, c, { extra: null });
          await acceptAndFix(tx, orderId, partnerId);
          const handler = payoutsOutboxHandler({
            now: () => AC8_INSTANT,
            log: quiet,
          });
          const delivery = {
            eventId: randomUUID(),
            orderId,
            type: "order.photo_uploaded" as const,
            seq: 9,
            fromStatus: "delivered",
            toStatus: "photo_uploaded",
            mode: "live" as const,
          };
          for (let i = 0; i < 2; i += 1) {
            await asSystem(tx, () =>
              handler(delivery, {
                deliveryId: randomUUID(),
                outboxId: randomUUID(),
                target: "payouts",
                attempt: i + 1,
                executor: runnerOf(tx),
              }),
            );
          }
          const rows = await payouts(tx, partnerId);
          expect(
            rows.map((r) => [r.kind, r.period_end, r.total_minor]),
          ).toEqual([["weekly", "2026-10-25", "39700"]]);
        });
      });
    });

    /* -------------------------------------------------------------------- */
    /* T-09                                                                 */
    /* -------------------------------------------------------------------- */

    it("T-09 (AC-9): a per_order florist's photo makes a closed one-order payout dated in Warsaw", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const partnerId = await florist(tx, c, "per_order");
        const orderId = await order(tx, c, { extra: null });
        await acceptAndFix(tx, orderId, partnerId);
        // 00:30 CET on 26 October is still the 25th in UTC: the date is Warsaw's.
        await accrue(tx, orderId, new Date("2026-10-25T23:30:00Z"));
        const rows = await payouts(tx, partnerId);
        expect(
          rows.map((r) => ({
            kind: r.kind,
            start: r.period_start,
            end: r.period_end,
            closed: r.closed,
            lines: r.lines.map((l) => l.amount),
          })),
        ).toEqual([
          {
            kind: "per_order",
            start: "2026-10-26",
            end: "2026-10-26",
            closed: true,
            lines: ["39700"],
          },
        ]);
      });
    });

    /* -------------------------------------------------------------------- */
    /* T-10                                                                 */
    /* -------------------------------------------------------------------- */

    it.each(["addon", "surcharge", null] as const)(
      "T-10 (AC-10): an order with %s accrues flagged for review only when it has an unpriced line",
      async (extra) => {
        await rolledBack(scratch.sql, async (tx) => {
          const partnerId = await florist(tx, c);
          const orderId = await order(tx, c, { extra });
          await acceptAndFix(tx, orderId, partnerId);
          await accrue(tx, orderId, AC8_INSTANT);
          const [payout] = await payouts(tx, partnerId);
          expect(payout?.lines.map((l) => [l.amount, l.review])).toEqual([
            ["39700", extra === null ? null : "unpriced_lines"],
          ]);
        });
      },
    );

    /* -------------------------------------------------------------------- */
    /* T-11                                                                 */
    /* -------------------------------------------------------------------- */

    describe("T-11 (AC-11) · a missing unit amount", () => {
      it("raises PAYOUT_AMOUNT_UNKNOWN, writes no line, and the dispatcher keeps the delivery retryable", async () => {
        await rolledBack(scratch.sql, async (tx) => {
          const partnerId = await florist(tx, c);
          const orderId = await order(tx, c, { extra: null });
          // Accepted, but the amounts were never fixed (a mapping missing at acceptance).
          await accepted(tx, orderId, partnerId);
          expect(
            await codeOf(
              tx.savepoint((sp) =>
                accrue(sp as unknown as Tx, orderId, AC8_INSTANT),
              ),
            ),
          ).toBe("PAYOUT_AMOUNT_UNKNOWN");
          expect(await payouts(tx, partnerId)).toEqual([]);

          // Through the engine and the dispatcher: the photo's `payouts` delivery fails and stays.
          await walkOrderTo(tx, orderId, "delivered");
          await asSystem(tx, () =>
            transition(
              orderId,
              "order.photo_uploaded",
              `partner:${partnerId}`,
              {
                mode: "live",
                media_asset_id: randomUUID(),
                by_user_id: randomUUID(),
              },
              { executor: runnerOf(tx) },
            ),
          );
          await dispatch(tx, orderId, AC8_INSTANT, { retryBaseSeconds: 30 });
          const [delivery] = await tx<{ status: string; attempts: number }[]>`
            SELECT d.status, d.attempts FROM outbox_delivery d JOIN outbox x ON x.id = d.outbox_id
            WHERE x.order_id = ${orderId} AND d.target = 'payouts'`;
          expect(delivery?.attempts).toBe(1);
          expect(["sent", "dead"]).not.toContain(delivery?.status);
          expect(await payouts(tx, partnerId)).toEqual([]);
        });
      });

      it("payouts.watch 61 minutes after the photo sends F3 and raises the alert once; the next run sends nothing", async () => {
        const capture = capturingMailer(
          "Flowers Overseas <orders@example.test>",
        );
        capture.clear();
        await rolledBack(scratch.sql, async (tx) => {
          const partnerId = await florist(tx, c);
          const orderId = await order(tx, c, { extra: null });
          await accepted(tx, orderId, partnerId);
          await walkOrderTo(tx, orderId, "photo_uploaded");
          const [photo] = await tx<{ at: Date }[]>`
            SELECT occurred_at AS at FROM order_event
            WHERE order_id = ${orderId} AND type = 'order.photo_uploaded'`;
          const photoAt = photo?.at ?? new Date();
          const alerts: [string, string | undefined][] = [];
          const run = (minutes: number) =>
            watchMissingLines({
              now: () => new Date(photoAt.getTime() + minutes * 60_000),
              transaction: (fn) =>
                tx.savepoint(async (sp) => {
                  await asApp(sp as unknown as Tx, { role: "system" });
                  try {
                    return await fn(runnerOf(sp as unknown as Tx));
                  } finally {
                    await sp.unsafe("RESET ROLE");
                  }
                }) as never,
              send: (executor, input) =>
                sendJobNotifications(executor, input, {
                  mailer: () => capture,
                  provider: () => "capture",
                  opsAddress: () => OPS,
                  siteOrigin: () => ORIGIN,
                  emailEnabled: () => Promise.resolve(true),
                  log: quiet,
                }),
              alert: (name, fields) => alerts.push([name, fields.order_id]),
              log: quiet,
            });
          // 59 minutes: not yet.
          expect(await run(59)).toEqual({ alerted: 0, held: 0 });
          expect(await run(61)).toEqual({ alerted: 1, held: 0 });
          expect(await run(122)).toEqual({ alerted: 0, held: 0 });
          expect(alerts).toEqual([["payouts.line_missing", orderId]]);
          const mails = capture.messages(OPS);
          expect(mails).toHaveLength(1);
          expect(mails[0]?.subject).toBe(
            `No payout line: ${orderReference(orderId)}`,
          );
          expect(mails[0]?.text).toContain(`${ORIGIN}/admin/orders/${orderId}`);
          expect(mails[0]?.text).not.toContain("Test Recipient");
        });
      });
    });

    /* -------------------------------------------------------------------- */
    /* T-12                                                                 */
    /* -------------------------------------------------------------------- */

    describe("T-12 (AC-12) · the photo waiver", () => {
      async function waive(
        tx: Tx,
        orderId: string,
        reason: string,
      ): Promise<string> {
        await asApp(tx, { role: "admin", userId: c.adminId });
        try {
          return await tx
            .savepoint(async (sp) => {
              const result = await accrueWithoutPhoto(
                runnerOf(sp as unknown as Tx),
                orderId,
                { reason },
                { userId: c.adminId, requestId: "it-waiver" },
                { now: () => AC8_INSTANT, log: quiet },
              );
              return result.ok ? result.outcome.outcome : result.reason;
            })
            .catch(
              (error: unknown) => (error as { code?: string }).code ?? "?",
            );
        } finally {
          await tx.unsafe("RESET ROLE");
        }
      }

      it("from delivered with a 10-character reason it accrues as AC-8 and audits the reason", async () => {
        await rolledBack(scratch.sql, async (tx) => {
          const partnerId = await florist(tx, c);
          const orderId = await order(tx, c, { extra: null });
          await acceptAndFix(tx, orderId, partnerId);
          await walkOrderTo(tx, orderId, "delivered");
          expect(await waive(tx, orderId, "0123456789")).toBe("accrued");
          const rows = await payouts(tx, partnerId);
          expect(
            rows.map((r) => [r.kind, r.period_end, r.total_minor]),
          ).toEqual([["weekly", "2026-10-25", "39700"]]);
          const audit = await tx<{ reason: string; action: string }[]>`
            SELECT reason, action FROM audit_log
            WHERE entity_table = 'order' AND entity_id = ${orderId}`;
          expect(audit).toEqual([
            { reason: "0123456789", action: "payout.photo_waived" },
          ]);
        });
      });

      it.each([
        "routed",
        "in_production",
        "out_for_delivery",
        "photo_uploaded",
      ])(
        "refuses PAYOUT_WAIVER_ILLEGAL from %s and writes nothing",
        async (state) => {
          await rolledBack(scratch.sql, async (tx) => {
            const partnerId = await florist(tx, c);
            const orderId = await order(tx, c, { extra: null });
            await acceptAndFix(tx, orderId, partnerId);
            await walkOrderTo(tx, orderId, state);
            expect(await waive(tx, orderId, "0123456789")).toBe(
              "PAYOUT_WAIVER_ILLEGAL",
            );
            expect(await payouts(tx, partnerId)).toEqual([]);
          });
        },
      );

      it("refuses a test order in delivered, and a 9-character reason, writing nothing", async () => {
        await rolledBack(scratch.sql, async (tx) => {
          const partnerId = await florist(tx, c);
          const testOrder = await order(tx, c, { mode: "test", extra: null });
          await walkOrderTo(tx, testOrder, "delivered");
          expect(await waive(tx, testOrder, "0123456789")).toBe(
            "PAYOUT_WAIVER_ILLEGAL",
          );
          const live = await order(tx, c, { extra: null });
          await acceptAndFix(tx, live, partnerId);
          await walkOrderTo(tx, live, "delivered");
          expect(await waive(tx, live, "012345678")).toBe("invalid");
          expect(await waive(tx, live, "  012345678  ")).toBe("invalid");
          expect(await payouts(tx, partnerId)).toEqual([]);
          const [audits] = await tx<{ n: number }[]>`
            SELECT count(*)::int AS n FROM audit_log
            WHERE entity_table = 'order' AND entity_id IN (${testOrder}, ${live})`;
          expect(audits?.n).toBe(0);
        });
      });
    });

    /* -------------------------------------------------------------------- */
    /* T-13                                                                 */
    /* -------------------------------------------------------------------- */

    it("T-13 (AC-13): payouts.accrue off holds the photo's delivery pending with no line; on, the next tick accrues", async () => {
      let enabled = false;
      registerPayoutsOutbox({
        accrueEnabled: () => Promise.resolve(enabled),
        now: () => AC8_INSTANT,
        log: quiet,
      });
      await rolledBack(scratch.sql, async (tx) => {
        const partnerId = await florist(tx, c);
        const orderId = await order(tx, c, { extra: null });
        await acceptAndFix(tx, orderId, partnerId);
        await walkOrderTo(tx, orderId, "delivered");
        await asSystem(tx, () =>
          transition(
            orderId,
            "order.photo_uploaded",
            `partner:${partnerId}`,
            {
              mode: "live",
              media_asset_id: randomUUID(),
              by_user_id: randomUUID(),
            },
            { executor: runnerOf(tx) },
          ),
        );
        const state = () => tx<{ status: string; attempts: number }[]>`
          SELECT d.status, d.attempts FROM outbox_delivery d JOIN outbox x ON x.id = d.outbox_id
          WHERE x.order_id = ${orderId} AND d.target = 'payouts'`;
        await dispatch(tx, orderId, AC8_INSTANT, { useHold: true });
        expect(await state()).toEqual([{ status: "pending", attempts: 0 }]);
        expect(await payouts(tx, partnerId)).toEqual([]);
        enabled = true;
        await dispatch(tx, orderId, AC8_INSTANT, { useHold: true });
        expect((await state()).map((d) => d.status)).toEqual(["sent"]);
        expect(
          (await payouts(tx, partnerId)).map((r) => [r.kind, r.total_minor]),
        ).toEqual([["weekly", "39700"]]);
      });
    });

    /* -------------------------------------------------------------------- */
    /* T-14                                                                 */
    /* -------------------------------------------------------------------- */

    describe("T-14 (AC-14) · the weekly close across the DST night", () => {
      /** 23:30 CET on Sunday 25 October, after the clocks went back. */
      const SUNDAY_2330 = new Date("2026-10-25T22:30:00Z");
      /** 00:30 CET on Monday 26 October. */
      const MONDAY_0030 = new Date("2026-10-25T23:30:00Z");

      async function openPayout(tx: Tx, total: number): Promise<string> {
        const partnerId = await florist(tx, c);
        const orderId = await order(tx, c, { extra: null });
        await acceptAndFix(tx, orderId, partnerId);
        await accrue(tx, orderId, AC8_INSTANT);
        const [payout] = await payouts(tx, partnerId);
        if (total !== 39700) {
          // Bring the total to `total` with an adjustment line (spec 030a §2.4's claw-back).
          await tx`INSERT INTO payout_line (payout_id, amount_minor, currency_code, kind, note)
                   VALUES (${payout?.id ?? ""}, ${total - 39700}, 'PLN', 'adjustment', 'claw-back')`;
        }
        return partnerId;
      }

      it("positive: open at 23:30 Sunday, closed at 00:30 Monday; zero and negative roll to 1 November and stay open; a second run changes nothing; F2 once per closing run", async () => {
        const capture = capturingMailer(
          "Flowers Overseas <orders@example.test>",
        );
        capture.clear();
        await rolledBack(scratch.sql, async (tx) => {
          // Only this test's payouts are open: close any earlier open payout out of the way.
          const positive = await openPayout(tx, 39700);
          const zero = await openPayout(tx, 0);
          const negative = await openPayout(tx, -100);
          const close = (at: Date) =>
            asSystem(tx, () =>
              closeDuePayouts(at, {
                executor: runnerOf(tx),
                sendReady: (executor, input) =>
                  sendOpsJobNotification(
                    executor,
                    {
                      job: "payouts.close",
                      jobId: input.closedAt.toISOString(),
                    },
                    {
                      mailer: () => capture,
                      provider: () => "capture",
                      opsAddress: () => OPS,
                      siteOrigin: () => ORIGIN,
                      emailEnabled: () => Promise.resolve(true),
                      log: quiet,
                    },
                  ).then(() => undefined),
                log: quiet,
              }),
            );
          const view = async (partnerId: string) =>
            (await payouts(tx, partnerId)).map((r) => ({
              end: r.period_end,
              closed: r.closed,
              total: r.total_minor,
            }));

          expect(await close(SUNDAY_2330)).toEqual({
            closed: 0,
            rolledOver: 0,
          });
          expect(await view(positive)).toEqual([
            { end: "2026-10-25", closed: false, total: "39700" },
          ]);

          expect(await close(MONDAY_0030)).toEqual({
            closed: 1,
            rolledOver: 2,
          });
          expect(await view(positive)).toEqual([
            { end: "2026-10-25", closed: true, total: "39700" },
          ]);
          expect(await view(zero)).toEqual([
            { end: "2026-11-01", closed: false, total: "0" },
          ]);
          expect(await view(negative)).toEqual([
            { end: "2026-11-01", closed: false, total: "-100" },
          ]);

          const before = await tx<{ row: string }[]>`
            SELECT row_to_json(p)::text AS row FROM payout p
            WHERE partner_id IN (${positive}, ${zero}, ${negative}) ORDER BY id`;
          expect(await close(new Date("2026-10-26T00:30:00Z"))).toEqual({
            closed: 0,
            rolledOver: 0,
          });
          const after = await tx<{ row: string }[]>`
            SELECT row_to_json(p)::text AS row FROM payout p
            WHERE partner_id IN (${positive}, ${zero}, ${negative}) ORDER BY id`;
          expect(after).toEqual(before);

          const mails = capture.messages(OPS);
          expect(mails.map((m) => m.subject)).toEqual([
            "1 payout ready for review",
          ]);
          // The ready group holds the one closed payout; nothing needs a look first.
          expect(mails[0]?.text).toContain("Ready to send: 1\n");
          expect(mails[0]?.text).not.toContain("Need a look first");
          expect(mails[0]?.text).toContain(`${ORIGIN}/admin/payouts`);
        });
      });
    });

    it("T-14 (AC-14) · F2's counts: a flagged line and an open adjustment dated before the period's end need a look first", async () => {
      const capture = capturingMailer("Flowers Overseas <orders@example.test>");
      capture.clear();
      await rolledBack(scratch.sql, async (tx) => {
        // Florist 1: a line with an add-on (review flag). Florist 2: a clean line, and an open
        // adjustment created at 23:59 on Sunday the 25th, Warsaw time (CET).
        const one = await florist(tx, c);
        const flagged = await order(tx, c, { extra: "addon" });
        await acceptAndFix(tx, flagged, one);
        await accrue(tx, flagged, AC8_INSTANT);
        const two = await florist(tx, c);
        const clean = await order(tx, c, { extra: null });
        await acceptAndFix(tx, clean, two);
        await accrue(tx, clean, AC8_INSTANT);
        const withdrawn = await order(tx, c, { extra: null });
        const assignment = await accepted(tx, withdrawn, two);
        await tx`INSERT INTO payout_adjustment (order_id, partner_id, assignment_id, kind, created_at)
                 VALUES (${withdrawn}, ${two}, ${assignment}, 'withdrawn_by_buyer_after_acceptance',
                         '2026-10-25T22:59:00Z')`;
        await asSystem(tx, () =>
          closeDuePayouts(new Date("2026-10-25T23:30:00Z"), {
            executor: runnerOf(tx),
            sendReady: (executor, input) =>
              sendOpsJobNotification(
                executor,
                { job: "payouts.close", jobId: input.closedAt.toISOString() },
                {
                  mailer: () => capture,
                  provider: () => "capture",
                  opsAddress: () => OPS,
                  siteOrigin: () => ORIGIN,
                  emailEnabled: () => Promise.resolve(true),
                  log: quiet,
                },
              ).then(() => undefined),
            log: quiet,
          }),
        );
        const [mail] = capture.messages(OPS);
        expect(mail?.subject).toBe("2 payouts ready for review");
        expect(mail?.text).toContain(
          "Ready to send: 2\nNeed a look first: 2 (a line to review, an open adjustment)\n",
        );
      });
    });

    /* -------------------------------------------------------------------- */
    /* Awkward cases (self-review, TASK-364)                                */
    /* -------------------------------------------------------------------- */

    describe("awkward cases: zero, currency mismatch, the year end, a refund after accrual", () => {
      it("zero: amounts fixed at 0 accrue no line (no zero order line exists) and the order stays watchable", async () => {
        await rolledBack(scratch.sql, async (tx) => {
          const partnerId = await florist(tx, c);
          await tx`UPDATE partner_catalog_mapping SET partner_payout_minor = 0
                   WHERE partner_id = ${partnerId}`;
          const orderId = await order(tx, c, { extra: null });
          await acceptAndFix(tx, orderId, partnerId);
          expect((await accrue(tx, orderId, AC8_INSTANT)).outcome).toBe("zero");
          expect(await payouts(tx, partnerId)).toEqual([]);
        });
      });

      it("a prepaid order's photo (AC-7's photo half, TASK-363's hand-over) accrues nothing more: one line, one payout", async () => {
        await rolledBack(scratch.sql, async (tx) => {
          const partnerId = await florist(tx, c, "weekly", 5);
          const orderId = await order(tx, c, { extra: null });
          await acceptAndFix(tx, orderId, partnerId);
          for (let i = 0; i < 2; i += 1) {
            expect((await accrue(tx, orderId, AC8_INSTANT)).outcome).toBe(
              "already_accrued",
            );
          }
          expect(
            (await payouts(tx, partnerId)).map((r) => [r.kind, r.lines.length]),
          ).toEqual([["prepaid", 1]]);
        });
      });

      it("currency mismatch: amounts fixed in EUR for a florist paid in PLN refuse PAYOUT_CURRENCY_MISMATCH and write nothing", async () => {
        await rolledBack(scratch.sql, async (tx) => {
          const partnerId = await florist(tx, c);
          const orderId = await order(tx, c, { extra: null });
          await accepted(tx, orderId, partnerId);
          await tx`UPDATE order_line SET partner_payout_minor = 14900, payout_currency_code = 'EUR'
                   WHERE order_id = ${orderId}`;
          expect(
            await codeOf(
              tx.savepoint((sp) =>
                accrue(sp as unknown as Tx, orderId, AC8_INSTANT),
              ),
            ),
          ).toBe("PAYOUT_CURRENCY_MISMATCH");
          expect(await payouts(tx, partnerId)).toEqual([]);
        });
      });

      it("the year end: a week from 30 December to 3 January stays open at 23:30 on the 3rd and closes at 00:30 on the 4th, Warsaw time", async () => {
        await rolledBack(scratch.sql, async (tx) => {
          const partnerId = await florist(tx, c);
          const orderId = await order(tx, c, { extra: null });
          await acceptAndFix(tx, orderId, partnerId);
          await accrue(tx, orderId, new Date("2026-12-30T10:00:00Z"));
          const close = (at: Date) =>
            asSystem(tx, () =>
              closeDuePayouts(at, {
                executor: runnerOf(tx),
                sendReady: () => Promise.resolve(),
                log: quiet,
              }),
            );
          const view = async () =>
            (await payouts(tx, partnerId)).map((r) => [
              r.period_start,
              r.period_end,
              r.closed,
            ]);
          await close(new Date("2027-01-03T22:30:00Z"));
          expect(await view()).toEqual([["2026-12-30", "2027-01-03", false]]);
          await close(new Date("2027-01-03T23:30:00Z"));
          expect(await view()).toEqual([["2026-12-30", "2027-01-03", true]]);
        });
      });

      it("a refund after accrual: no payouts route exists for a refund, so the line stands (spec 030a §13 Q13)", async () => {
        const { payoutOutboxTargets } =
          await import("../../src/modules/orders/outbox/routes.ts");
        for (const event of [
          "order.refunded_partial",
          "order.refunded_full",
          "order.cancelled",
          "order.chargeback_opened",
        ] as const) {
          expect(payoutOutboxTargets(event, "live"), event).toEqual([]);
        }
        expect(
          payoutOutboxTargets("order.photo_uploaded", "live").map(
            (t) => t.name,
          ),
        ).toEqual(["payouts"]);
        expect(payoutOutboxTargets("order.photo_uploaded", "test")).toEqual([]);
      });
    });

    /* -------------------------------------------------------------------- */
    /* T-15                                                                 */
    /* -------------------------------------------------------------------- */

    it("T-15 (AC-15): two concurrent accruals with no open payout create one; after it closes, the next starts the day after its period_end", async () => {
      const setUp = await scratch.sql.begin(async (tx) => {
        const partnerId = await florist(tx, c);
        const ids: string[] = [];
        for (let i = 0; i < 3; i += 1) {
          const orderId = await order(tx, c, { extra: null });
          await acceptAndFix(tx, orderId, partnerId);
          ids.push(orderId);
        }
        return { partnerId, ids };
      });
      const a = postgres(scratch.url, { max: 1, onnotice: () => undefined });
      const b = postgres(scratch.url, { max: 1, onnotice: () => undefined });
      try {
        await Promise.all(
          [a, b].map((connection, i) =>
            connection.begin((tx) =>
              accrue(tx, setUp.ids[i] ?? "", AC8_INSTANT),
            ),
          ),
        );
      } finally {
        await a.end({ timeout: 5 });
        await b.end({ timeout: 5 });
      }
      const open = await payouts(scratch.sql, setUp.partnerId);
      expect(
        open.map((r) => [r.kind, r.period_start, r.period_end, r.lines.length]),
      ).toEqual([["weekly", "2026-10-21", "2026-10-25", 2]]);

      await scratch.sql.begin(async (tx) => {
        await tx`UPDATE payout SET closed_at = now() WHERE id = ${open[0]?.id ?? ""}`;
        // Accrued on Wednesday 4 November: the new payout starts on Monday 26 October, the day
        // after the closed one's end, and ends on Sunday 8 November.
        await accrue(tx, setUp.ids[2] ?? "", new Date("2026-11-04T10:00:00Z"));
      });
      const after = await payouts(scratch.sql, setUp.partnerId);
      expect(
        after.map((r) => [
          r.period_start,
          r.period_end,
          r.closed,
          r.total_minor,
        ]),
      ).toEqual([
        ["2026-10-21", "2026-10-25", true, "79400"],
        ["2026-10-26", "2026-11-08", false, "39700"],
      ]);
    });

    /* -------------------------------------------------------------------- */
    /* T-33                                                                 */
    /* -------------------------------------------------------------------- */

    it("T-33 (AC-33): a live order walked by the real florist commands and dispatcher ends with one order line of its amount in the open weekly payout", async () => {
      // Fixture: the florist, the order placed and offered (spec 002's walkOrderTo for the steps
      // before acceptance). Everything after is the real commands and the real dispatcher.
      const world = await scratch.sql.begin(async (tx) => {
        const partnerId = await florist(tx, c);
        const orderId = await order(tx, c, { extra: null });
        await walkOrderTo(tx, orderId, "routed");
        const [offer] = await tx<{ id: string }[]>`
          INSERT INTO order_assignment (order_id, partner_id, sla_expires_at, attempt)
          VALUES (${orderId}, ${partnerId}, now() + interval '1 hour', 1)
          RETURNING id`;
        return { partnerId, orderId, assignmentId: offer?.id ?? "" };
      });
      const runtime: FloristCommandRuntime = {
        asPartner: (ctx, fn) =>
          scratch.sql.begin(async (tx) => {
            await asApp(tx, {
              role: "partner",
              userId: ctx.userId,
              partnerIds: ctx.partnerIds,
            });
            return fn(runnerOf(tx));
          }) as never,
        asSystem: (_job, fn) =>
          scratch.sql.begin(async (tx) => {
            await asApp(tx, { role: "system" });
            return fn(runnerOf(tx));
          }) as never,
      };
      const now = new Date();
      const florist1 = { userId: randomUUID(), partnerIds: [world.partnerId] };
      const deps = { runtime, now: () => now, environment: "test" };
      const committed: DeliveryTransaction = (fn) =>
        scratch.sql.begin(async (tx) => {
          await asApp(tx, { role: "system" });
          return fn(runnerOf(tx));
        }) as never;
      const run = () =>
        dispatchOutbox({
          handlers: {
            invoices: () => Promise.resolve(),
            payments: () => Promise.resolve(),
            routing: () => Promise.resolve(),
            notifications: () => Promise.resolve(),
            "analytics.ga4": () => Promise.resolve(),
            risk: () => Promise.resolve(),
            payouts: payoutsOutboxHandler({
              now: () => now,
              schedulePrepaidReady: () => Promise.resolve(),
              log: quiet,
            }),
          },
          transaction: committed,
          orderId: world.orderId,
          retryBaseSeconds: 0,
          heldTargets: [],
          alert: () => undefined,
          log: quiet,
        });

      await respondToOffer(
        florist1,
        world.assignmentId,
        { response: "accept" },
        deps,
      );
      await run();
      // Capture on acceptance is spec 013's TASK-259 branch, not built yet: the engine's own
      // `transition` writes it, as that branch will; the delivery morning is the real job.
      await scratch.sql.begin(async (tx) => {
        await asApp(tx, { role: "system" });
        await transition(
          world.orderId,
          "order.captured",
          "system:payments",
          { mode: "live", provider_call: false },
          { executor: runnerOf(tx) },
        );
      });
      await runProductionStart({
        transaction: committed,
        now: () => new Date("2027-02-14T12:00:00Z"),
      });
      await markOutForDelivery(florist1, world.assignmentId, deps);
      const photo = new Uint8Array(
        await sharp({
          create: {
            width: 1600,
            height: 1200,
            channels: 3,
            background: { r: 200, g: 80, b: 90 },
          },
        })
          .jpeg()
          .toBuffer(),
      );
      await markDelivered(florist1, world.assignmentId, photo, {
        ...deps,
        store: { storage: new InMemoryStorage(), bucket: "private-test" },
      });
      await run();

      // Reads only from here.
      const [status] = await scratch.sql<{ status: string }[]>`
        SELECT status FROM "order" WHERE id = ${world.orderId}`;
      expect(status?.status).toBe("photo_uploaded");
      const rows = await payouts(scratch.sql, world.partnerId);
      expect(
        rows.map((r) => ({
          kind: r.kind,
          closed: r.closed,
          lines: r.lines.map((l) => [l.order_id, l.amount]),
        })),
      ).toEqual([
        {
          kind: "weekly",
          closed: false,
          lines: [[world.orderId, "39700"]],
        },
      ]);
    });

    /** One dispatch run over `orderId`'s deliveries, each in a savepoint of `tx`. */
    async function dispatch(
      tx: Tx,
      orderId: string,
      now: Date,
      options: { useHold?: boolean; retryBaseSeconds?: number } = {},
    ) {
      const savepoints: DeliveryTransaction = <T>(
        fn: (executor: OrderExecutor) => Promise<T>,
      ) =>
        tx.savepoint(async (sp) => {
          await asApp(sp as unknown as Tx, { role: "system" });
          try {
            return await fn(runnerOf(sp as unknown as Tx));
          } finally {
            await sp.unsafe("RESET ROLE");
          }
        }) as Promise<T>;
      const noop = () => Promise.resolve();
      return dispatchOutbox({
        handlers: {
          invoices: noop,
          payments: noop,
          routing: noop,
          notifications: noop,
          "analytics.ga4": () => Promise.resolve(),
          risk: () => Promise.resolve(),
          payouts: payoutsOutboxHandler({ now: () => now, log: quiet }),
        },
        transaction: savepoints,
        orderId,
        retryBaseSeconds: options.retryBaseSeconds ?? 0,
        alert: () => undefined,
        log: quiet,
        ...(options.useHold === true ? {} : { heldTargets: [] }),
      });
    }
  },
);
