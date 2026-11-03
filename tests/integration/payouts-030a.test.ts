/**
 * Spec 030a task 1 on a migrated PG16 scratch database (§10 T-01, T-02, T-04 to T-07, T-31,
 * T-32; AC-1, AC-2, AC-4 to AC-7, AC-31, AC-32; TASK-363), never the shared database:
 *
 *  - T-01 (AC-1): `savePayoutTerms` refuses each bad field with its code and writes nothing and
 *    no audit row; a valid save writes one audit row with the before and after values;
 *  - T-02 (AC-2): `fixPayoutAtAcceptance` fixes the unit amounts from the accepting florist's
 *    mapping, leaves the add-on null, and a second run changes no row (`updated_at` unmoved); a
 *    product with no mapping for its tier refuses `PAYOUT_AMOUNT_UNKNOWN` and writes nothing;
 *    `order_line_payout_write_once` refuses an overwrite (`ORDER_LINE_PAYOUT_FIXED`);
 *  - T-04 (AC-4): a `test` and a `demo` order walked to the photo get no amount and no payout;
 *  - T-05 (AC-5): limit 5 gives five `prepaid` payouts dated in Europe/Warsaw (the DST night of
 *    25 October 2026 included), the sixth none; limit 0 none;
 *  - T-06 (AC-6): two acceptances on two connections at four used make exactly one more;
 *  - T-07 (AC-7): the handler twice, through the real `assignment.accepted` event, enqueues F1
 *    once, and F1 sent twice through spec 016's pipeline reaches the founder once;
 *  - the lifecycle triggers of `0035`: status guard, frozen lines, the total kept by the database;
 *  - T-32 (AC-32): RLS under `partner` A and B, `customer`, `public`, `system` and `admin`;
 *  - T-31 (AC-31): the down file refuses with each guard row (catalogue and counts unchanged),
 *    succeeds on a clean database back to the pre-030a catalogue, and migrates again.
 */
import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { adminT } from "../../src/modules/admin/messages.ts";
import { formatMoney } from "../../src/modules/i18n/index.ts";
import {
  capturingMailer,
  sendJobNotifications,
} from "../../src/modules/notifications/index.ts";
import { registerOpsEmailTemplates } from "../../src/modules/notifications/emails/index.ts";
import {
  fixPayoutAtAcceptance,
  payoutsOutboxHandler,
  savePayoutTerms,
  sendPrepaidReady,
} from "../../src/modules/partners/payouts/index.ts";
import type { PartnerAdminRunner } from "../../src/modules/partners/admin/commands.ts";
import { readCatalogue } from "../../scripts/db-check-live.ts";
import { insertPlacedOrder, walkOrderTo } from "../fixtures/order-state.ts";
import * as make from "./support/rows.ts";
import { drizzleOver } from "./support/drizzle-tx.ts";
import { runnerOf } from "./support/sql-runner.ts";
import {
  MIGRATE_LOCK,
  asApp,
  pgFailure,
  probeLocalServer,
  rolledBack,
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
const MINE = FORWARD.find((name) => name.endsWith("_payouts_030a.sql")) ?? "";
const MY_VERSION = MINE.slice(0, 4);
const BEFORE = FORWARD[FORWARD.indexOf(MINE) - 1]?.slice(0, 4) ?? "";

const OPS = "ops@example.test";
const ORIGIN = "https://flowersoverseas.test";

interface Catalogue {
  readonly countryId: string;
  readonly productA: string;
  readonly productB: string;
  readonly addonId: string;
  readonly adminId: string;
}

/**
 * A florist in PL with mappings A 14900 PLN (base tier) and B 9900 PLN; returns its id. `demo`
 * for a florist a `test` or `demo` order may be offered to (`ASSIGNMENT_MODE_MISMATCH`).
 */
async function florist(
  tx: Tx,
  c: Catalogue,
  limit = 5,
  status: "active" | "demo" = "active",
): Promise<string> {
  const id = await make.partner(tx, c.countryId, status);
  await tx`UPDATE fulfillment_partner SET prepaid_order_limit = ${limit} WHERE id = ${id}`;
  await tx`INSERT INTO partner_catalog_mapping (partner_id, product_id, tier_key, partner_payout_minor, currency_code)
           VALUES (${id}, ${c.productA}, NULL, 14900, 'PLN'), (${id}, ${c.productB}, NULL, 9900, 'PLN')`;
  return id;
}

/** An order with product A (qty 2, `tierA`), B (qty 1) and one add-on line. */
async function order(
  tx: Tx,
  c: Catalogue,
  mode: "live" | "test" | "demo" = "live",
  tierA: string | null = null,
): Promise<string> {
  const buyer = await make.customer(tx);
  const orderId = await insertPlacedOrder(tx, {
    customerId: buyer,
    recipientId: await make.recipient(tx, buyer),
    countryId: c.countryId,
    mode,
  });
  await tx`INSERT INTO order_line (order_id, kind, product_id, addon_id, tier_key, qty, unit_retail_minor, currency_code, vat_rate_bp)
           VALUES (${orderId}, 'product', ${c.productA}, NULL, ${tierA}, 2, 8000, 'PLN', 800),
                  (${orderId}, 'product', ${c.productB}, NULL, NULL, 1, 2000, 'PLN', 800),
                  (${orderId}, 'addon', NULL, ${c.addonId}, NULL, 1, 900, 'PLN', 800)`;
  return orderId;
}

/** An accepted assignment of `orderId` to `partnerId`, answered at `at`. */
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

/** Runs `fn` as `app_web` in the `system` context, then back to the fixture role. */
async function asSystem<T>(tx: Tx, fn: () => Promise<T>): Promise<T> {
  await asApp(tx, { role: "system" });
  try {
    return await fn();
  } finally {
    await tx.unsafe("RESET ROLE");
  }
}

const quiet = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
} as never;

/** Fixes the payout of one acceptance as the handler does; returns the F1 enqueues. */
async function fix(
  tx: Tx,
  orderId: string,
  assignmentId: string,
  scheduled: string[] = [],
) {
  return asSystem(tx, () =>
    fixPayoutAtAcceptance(
      runnerOf(tx),
      { orderId, assignmentId },
      {
        schedulePrepaidReady: (id) => {
          scheduled.push(id);
          return Promise.resolve();
        },
        log: quiet,
      },
    ),
  );
}

/** The physical row ids of an order's lines: an UPDATE, even to the same values, moves them. */
async function ctids(tx: Tx, orderId: string): Promise<string[]> {
  const rows = await tx<{ ctid: string }[]>`
    SELECT ctid::text AS ctid FROM order_line WHERE order_id = ${orderId} ORDER BY id`;
  return rows.map((row) => row.ctid);
}

async function lines(sql: Sql | Tx, orderId: string) {
  return sql<
    {
      kind: string;
      partner_payout_minor: string | null;
      payout_currency_code: string | null;
      updated_at: string;
    }[]
  >`SELECT kind, partner_payout_minor::text, payout_currency_code, updated_at::text
    FROM order_line WHERE order_id = ${orderId} ORDER BY kind, qty DESC`;
}

async function prepaid(sql: Sql | Tx, partnerId: string) {
  return sql<
    {
      id: string;
      period_start: string;
      period_end: string;
      status: string;
      closed: boolean;
      total_minor: string;
      currency_code: string;
      line_amounts: string[];
      review: (string | null)[];
      updated_at: string;
    }[]
  >`SELECT p.id, p.period_start::text, p.period_end::text, p.status, p.closed_at IS NOT NULL AS closed,
           p.total_minor::text, p.currency_code, p.updated_at::text,
           jsonb_agg(l.amount_minor::text ORDER BY l.id) AS line_amounts,
           jsonb_agg(l.review_reason ORDER BY l.id) AS review
    FROM payout p JOIN payout_line l ON l.payout_id = p.id AND l.kind = 'order'
    WHERE p.partner_id = ${partnerId} AND p.kind = 'prepaid'
    GROUP BY p.id ORDER BY p.period_start, p.created_at`;
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
    const productA = await product(make.unique("FO-PAY-A"));
    const productB = await product(make.unique("FO-PAY-B"));
    await tx`INSERT INTO product_tier (product_id, tier_key, label_key, stems, sort, is_default)
             VALUES (${productA}, 'deluxe', 'catalog.tier.deluxe', 24, 1, false)`;
    const [addon] = await tx<{ id: string }[]>`
      INSERT INTO addon (key, kind) VALUES (${make.unique("chocolates_").replaceAll("-", "")}, 'confectionery')
      RETURNING id`;
    const adminId = randomUUID();
    await tx`INSERT INTO users (id, email) VALUES (${adminId}, ${`${make.unique("founder")}@example.test`})`;
    return { countryId, productA, productB, addonId: addon?.id ?? "", adminId };
  });
}

describe.skipIf(server.url === undefined)(
  `spec 030a payout data and the fixed amount${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    let c: Catalogue;

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "payouts030a");
      c = await setUpCatalogue(scratch.sql);
    }, 300_000);

    afterAll(async () => {
      await scratch.drop();
    });

    /* -------------------------------------------------------------------- */
    /* T-01                                                                 */
    /* -------------------------------------------------------------------- */

    describe("T-01 (AC-1) · savePayoutTerms", () => {
      let run: PartnerAdminRunner;
      const actor = () => ({ userId: c.adminId, requestId: "it-payouts" });

      beforeAll(() => {
        run = (context, fn) =>
          scratch.sql.begin(async (tx) => {
            await tx`SELECT set_config('app.audit_action', ${context.action}, true)`;
            await asApp(tx, {
              role: "admin",
              ...(context.userId === undefined
                ? {}
                : { userId: context.userId }),
            });
            return fn(drizzleOver(tx, scratch.sql));
          }) as never;
      });

      async function row(id: string) {
        const [found] = await scratch.sql<
          {
            payout_cadence: string;
            prepaid_order_limit: number;
            wise_recipient_id: string | null;
            version: string;
          }[]
        >`SELECT payout_cadence, prepaid_order_limit, wise_recipient_id,
                 to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS version
          FROM fulfillment_partner WHERE id = ${id}`;
        if (found === undefined) throw new Error("no partner");
        return found;
      }

      const audits = async (id: string) =>
        scratch.sql<{ action: string; before: unknown; after: unknown }[]>`
          SELECT action, before, after FROM audit_log
          WHERE entity_table = 'fulfillment_partner' AND entity_id = ${id} ORDER BY at, id`;

      it.each([
        [{ cadence: "monthly" }, { cadence: "cadence" }],
        [{ prepaidOrderLimit: "51" }, { prepaidOrderLimit: "prepaidLimit" }],
        [{ prepaidOrderLimit: "-1" }, { prepaidOrderLimit: "prepaidLimit" }],
        [{ prepaidOrderLimit: "2.5" }, { prepaidOrderLimit: "prepaidLimit" }],
        [{ wiseRecipientId: "12a" }, { wiseRecipientId: "wiseRecipient" }],
        [
          { wiseRecipientId: "1".repeat(21) },
          { wiseRecipientId: "wiseRecipient" },
        ],
      ])(
        "refuses %j with its field code, no write and no audit row",
        async (change, errors) => {
          const id = await scratch.sql.begin((tx) => florist(tx, c));
          const before = await row(id);
          const result = await savePayoutTerms(
            actor(),
            {
              partnerId: id,
              updatedAt: before.version,
              cadence: "weekly",
              prepaidOrderLimit: "5",
              wiseRecipientId: "",
              ...change,
            },
            run,
          );
          expect(result).toEqual({ ok: false, reason: "invalid", errors });
          expect(await row(id)).toEqual(before);
          expect(await audits(id)).toEqual([]);
        },
      );

      it("a valid save writes the three terms and one audit row with before and after", async () => {
        const id = await scratch.sql.begin((tx) => florist(tx, c));
        const before = await row(id);
        const result = await savePayoutTerms(
          actor(),
          {
            partnerId: id,
            updatedAt: before.version,
            cadence: "per_order",
            prepaidOrderLimit: "0",
            wiseRecipientId: "12345678",
          },
          run,
        );
        expect(result.ok).toBe(true);
        const after = await row(id);
        expect({
          cadence: after.payout_cadence,
          limit: after.prepaid_order_limit,
          wise: after.wise_recipient_id,
        }).toEqual({ cadence: "per_order", limit: 0, wise: "12345678" });
        const written = await audits(id);
        expect(written).toHaveLength(1);
        expect(written[0]?.action).toBe("partner.payout_terms");
        expect(written[0]?.before).toMatchObject({
          payout_cadence: "weekly",
          prepaid_order_limit: 5,
          wise_recipient_id: null,
        });
        expect(written[0]?.after).toMatchObject({
          payout_cadence: "per_order",
          prepaid_order_limit: 0,
          wise_recipient_id: "12345678",
        });
        // The version moved: a form opened before the save is a conflict.
        expect(
          await savePayoutTerms(
            actor(),
            {
              partnerId: id,
              updatedAt: before.version,
              cadence: "weekly",
              prepaidOrderLimit: "5",
              wiseRecipientId: "",
            },
            run,
          ),
        ).toEqual({ ok: false, reason: "conflict" });
      });
    });

    /* -------------------------------------------------------------------- */
    /* T-02, the write-once trigger                                         */
    /* -------------------------------------------------------------------- */

    describe("T-02 (AC-2) · the unit amount, fixed at acceptance", () => {
      it("sets A to 14900 PLN and B to 9900 PLN, leaves the add-on null; a second run changes no row", async () => {
        await rolledBack(scratch.sql, async (tx) => {
          const partnerId = await florist(tx, c, 0);
          const orderId = await order(tx, c);
          const assignmentId = await accepted(tx, orderId, partnerId);
          const first = await fix(tx, orderId, assignmentId);
          expect(first).toEqual({
            outcome: "fixed",
            linesFixed: 2,
            prepaidPayoutId: null,
          });
          const once = await lines(tx, orderId);
          expect(
            once.map(
              ({ kind, partner_payout_minor, payout_currency_code }) => ({
                kind,
                partner_payout_minor,
                payout_currency_code,
              }),
            ),
          ).toEqual([
            {
              kind: "addon",
              partner_payout_minor: null,
              payout_currency_code: null,
            },
            {
              kind: "product",
              partner_payout_minor: "14900",
              payout_currency_code: "PLN",
            },
            {
              kind: "product",
              partner_payout_minor: "9900",
              payout_currency_code: "PLN",
            },
          ]);
          const firstCtids = await ctids(tx, orderId);
          expect(await fix(tx, orderId, assignmentId)).toEqual({
            outcome: "fixed",
            linesFixed: 0,
            prepaidPayoutId: null,
          });
          expect(await lines(tx, orderId)).toEqual(once);
          // `now()` is the transaction's, so `updated_at` alone cannot see a rewrite here; a
          // rewritten row gets a new `ctid`, so the second run must leave every one in place.
          expect(await ctids(tx, orderId)).toEqual(firstCtids);
        });
      });

      it("a product with no mapping for its tier refuses PAYOUT_AMOUNT_UNKNOWN and writes nothing", async () => {
        await rolledBack(scratch.sql, async (tx) => {
          const partnerId = await florist(tx, c);
          const orderId = await order(tx, c, "live", "deluxe");
          const assignmentId = await accepted(tx, orderId, partnerId);
          const refused = await tx
            .savepoint((sp) => fix(sp as Tx, orderId, assignmentId))
            .then(
              () => "fixed",
              (error: unknown) => (error as { code?: string }).code,
            );
          expect(refused).toBe("PAYOUT_AMOUNT_UNKNOWN");
          expect(
            (await lines(tx, orderId)).map((l) => l.partner_payout_minor),
          ).toEqual([null, null, null]);
          expect(await prepaid(tx, partnerId)).toEqual([]);
        });
      });

      it("ORDER_LINE_PAYOUT_FIXED: a fixed amount or currency cannot be overwritten; a null one can be written", async () => {
        await rolledBack(scratch.sql, async (tx) => {
          const partnerId = await florist(tx, c, 0);
          const orderId = await order(tx, c);
          await fix(tx, orderId, await accepted(tx, orderId, partnerId));
          const amount = await pgFailure(
            tx,
            (sp) =>
              sp`UPDATE order_line SET partner_payout_minor = 15900
               WHERE order_id = ${orderId} AND partner_payout_minor = 14900`,
          );
          expect(amount.raised).toBe("ORDER_LINE_PAYOUT_FIXED");
          const currency = await pgFailure(
            tx,
            (sp) =>
              sp`UPDATE order_line SET payout_currency_code = 'EUR'
               WHERE order_id = ${orderId} AND partner_payout_minor = 14900`,
          );
          expect(currency.raised).toBe("ORDER_LINE_PAYOUT_FIXED");
          expect(
            (await lines(tx, orderId)).map((l) => l.partner_payout_minor),
          ).toEqual([null, "14900", "9900"]);
        });
      });
    });

    /* -------------------------------------------------------------------- */
    /* T-04                                                                 */
    /* -------------------------------------------------------------------- */

    it("T-04 (AC-4): a test order and a demo order walked to the photo get no amount, no payout and no line", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const partnerId = await florist(tx, c, 5, "demo");
        for (const mode of ["test", "demo"] as const) {
          const orderId = await order(tx, c, mode);
          await walkOrderTo(tx, orderId, "accepted");
          const assignmentId = await accepted(tx, orderId, partnerId);
          expect(await fix(tx, orderId, assignmentId)).toEqual({
            outcome: "not_live",
          });
          await walkOrderTo(tx, orderId, "photo_uploaded");
          expect(
            (await lines(tx, orderId)).map((l) => l.partner_payout_minor),
          ).toEqual([null, null, null]);
        }
        const [counts] = await tx<{ payouts: number; lines: number }[]>`
          SELECT (SELECT count(*)::int FROM payout WHERE partner_id = ${partnerId}) AS payouts,
                 (SELECT count(*)::int FROM payout_line l JOIN payout p ON p.id = l.payout_id
                   WHERE p.partner_id = ${partnerId}) AS lines`;
        expect({ ...counts }).toEqual({ payouts: 0, lines: 0 });
      });
    });

    /* -------------------------------------------------------------------- */
    /* T-05                                                                 */
    /* -------------------------------------------------------------------- */

    describe("T-05 (AC-5) · prepaid payouts", () => {
      // Acceptance instants and their Europe/Warsaw dates, across the DST night of 25 October.
      const AT: readonly [string, string][] = [
        ["2026-10-24T21:59:59Z", "2026-10-24"], // 23:59:59 CEST
        ["2026-10-24T22:00:00Z", "2026-10-25"], // 00:00 CEST
        ["2026-10-25T22:59:59Z", "2026-10-25"], // 23:59:59 CET, after the clocks went back
        ["2026-10-25T23:00:00Z", "2026-10-26"], // 00:00 CET
        ["2026-10-27T10:00:00Z", "2026-10-27"],
        ["2026-10-28T10:00:00Z", "2026-10-28"],
      ];

      it("limit 5: the first five accepted live orders each get one prepaid payout dated in Warsaw; the sixth none", async () => {
        await rolledBack(scratch.sql, async (tx) => {
          const partnerId = await florist(tx, c, 5);
          const created: (string | null)[] = [];
          const scheduled: string[] = [];
          for (const [at] of AT) {
            const orderId = await order(tx, c);
            const result = await fix(
              tx,
              orderId,
              await accepted(tx, orderId, partnerId, new Date(at)),
              scheduled,
            );
            created.push(
              result.outcome === "fixed" ? result.prepaidPayoutId : "?",
            );
          }
          expect(created.map((id) => id !== null)).toEqual([
            true,
            true,
            true,
            true,
            true,
            false,
          ]);
          expect(scheduled).toEqual(created.slice(0, 5));
          const rows = await prepaid(tx, partnerId);
          expect(
            rows.map((r) => ({
              start: r.period_start,
              end: r.period_end,
              status: r.status,
              closed: r.closed,
              total: r.total_minor,
              currency: r.currency_code,
              lines: r.line_amounts,
              review: r.review,
            })),
          ).toEqual(
            AT.slice(0, 5).map(([, date]) => ({
              start: date,
              end: date,
              status: "draft",
              closed: true,
              total: "39700",
              currency: "PLN",
              lines: ["39700"],
              review: ["unpriced_lines"],
            })),
          );
        });
      });

      it("limit 0: no prepaid payout at all; an order without add-ons carries no review flag", async () => {
        await rolledBack(scratch.sql, async (tx) => {
          const none = await florist(tx, c, 0);
          const orderId = await order(tx, c);
          await fix(tx, orderId, await accepted(tx, orderId, none));
          expect(await prepaid(tx, none)).toEqual([]);

          const one = await florist(tx, c, 1);
          const plain = await order(tx, c);
          await tx`DELETE FROM order_line WHERE order_id = ${plain} AND kind = 'addon'`;
          await fix(tx, plain, await accepted(tx, plain, one));
          expect((await prepaid(tx, one)).map((r) => r.review)).toEqual([
            [null],
          ]);
        });
      });
    });

    /* -------------------------------------------------------------------- */
    /* T-06                                                                 */
    /* -------------------------------------------------------------------- */

    it("T-06 (AC-6): two acceptances on two connections at four used create exactly one more prepaid payout", async () => {
      const setUp = await scratch.sql.begin(async (tx) => {
        const partnerId = await florist(tx, c, 5);
        for (let i = 0; i < 4; i += 1) {
          const orderId = await order(tx, c);
          await fix(tx, orderId, await accepted(tx, orderId, partnerId));
        }
        const pair: { orderId: string; assignmentId: string }[] = [];
        for (let i = 0; i < 2; i += 1) {
          const orderId = await order(tx, c);
          pair.push({
            orderId,
            assignmentId: await accepted(tx, orderId, partnerId),
          });
        }
        return { partnerId, pair };
      });
      const a = postgres(scratch.url, { max: 1, onnotice: () => undefined });
      const b = postgres(scratch.url, { max: 1, onnotice: () => undefined });
      try {
        await Promise.all(
          [a, b].map((connection, i) =>
            connection.begin((tx) => {
              const one = setUp.pair[i];
              if (one === undefined) throw new Error("no pair");
              return fix(tx, one.orderId, one.assignmentId);
            }),
          ),
        );
      } finally {
        await a.end({ timeout: 5 });
        await b.end({ timeout: 5 });
      }
      expect(await prepaid(scratch.sql, setUp.partnerId)).toHaveLength(5);
      const [paid] = await scratch.sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM payout_line
        WHERE kind = 'order' AND order_id IN ${scratch.sql(setUp.pair.map((p) => p.orderId))}`;
      expect(paid?.n).toBe(1);
    });

    /* -------------------------------------------------------------------- */
    /* T-07                                                                 */
    /* -------------------------------------------------------------------- */

    it("T-07 (AC-7): the handler run twice on the real event enqueues F1 once; F1 sent twice reaches the founder once", async () => {
      registerOpsEmailTemplates(
        {
          t: adminT as unknown as (
            key: string,
            values?: Readonly<Record<string, string>>,
          ) => string,
          orderHref: (id) => `/admin/orders/${id}`,
          payoutHref: (id) => `/admin/payouts/${id}`,
        },
        () => ORIGIN,
      );
      const capture = capturingMailer("Flowers Overseas <orders@example.test>");
      capture.clear();
      await rolledBack(scratch.sql, async (tx) => {
        const partnerId = await florist(tx, c, 5);
        const [code] = await tx<{ code: string }[]>`
          SELECT code FROM fulfillment_partner WHERE id = ${partnerId}`;
        const orderId = await order(tx, c);
        // The order reaches `accepted` through the machine, the last step with its real payload.
        const [edge] = await tx<{ from_status: string }[]>`
          SELECT from_status FROM order_transition
          WHERE event = 'assignment.accepted' AND to_status = 'accepted' LIMIT 1`;
        await walkOrderTo(tx, orderId, edge?.from_status ?? "");
        const assignmentId = await accepted(tx, orderId, partnerId);
        await tx`SELECT set_config('app.allow_status_write', 'on', true)`;
        await tx`SELECT set_config('app.transition_event', 'assignment.accepted', true)`;
        await tx`UPDATE "order" SET status = 'accepted' WHERE id = ${orderId}`;
        await tx`SELECT set_config('app.allow_status_write', '', true)`;
        await tx`SELECT set_config('app.transition_event', '', true)`;
        const [event] = await tx<{ id: string; seq: number }[]>`
          INSERT INTO order_event (order_id, seq, type, from_status, to_status, actor, payload, payload_version)
          SELECT ${orderId}, max(seq) + 1, 'assignment.accepted', ${edge?.from_status ?? ""}, 'accepted',
                 'system:test_fixture',
                 (${JSON.stringify({ mode: "live", assignment_id: assignmentId })}::text)::jsonb, 1
          FROM order_event WHERE order_id = ${orderId}
          RETURNING id, seq`;
        const scheduled: string[] = [];
        const handler = payoutsOutboxHandler({
          schedulePrepaidReady: (id) => {
            scheduled.push(id);
            return Promise.resolve();
          },
          log: quiet,
        });
        const delivery = {
          eventId: event?.id ?? "",
          orderId,
          type: "assignment.accepted" as const,
          seq: event?.seq ?? 0,
          fromStatus: edge?.from_status ?? null,
          toStatus: "accepted",
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
        expect(scheduled).toHaveLength(1);
        const payoutId = scheduled[0] ?? "";
        expect((await prepaid(tx, partnerId)).map((r) => r.id)).toEqual([
          payoutId,
        ]);

        const send = (
          executor: Parameters<typeof sendJobNotifications>[0],
          input: Parameters<typeof sendJobNotifications>[1],
        ) =>
          sendJobNotifications(executor, input, {
            mailer: () => capture,
            provider: () => "capture",
            opsAddress: () => OPS,
            siteOrigin: () => ORIGIN,
            emailEnabled: () => Promise.resolve(true),
            log: quiet,
          });
        for (let i = 0; i < 2; i += 1) {
          expect(
            await asSystem(tx, () =>
              sendPrepaidReady(payoutId, { executor: runnerOf(tx), send }),
            ),
          ).toBe(true);
        }
        const mails = capture.messages(OPS);
        expect(mails).toHaveLength(1);
        expect(mails[0]?.subject).toBe(
          // 2 × 14900 + 9900 = 39700 PLN minor, through the one money formatter.
          `Prepaid payout ready: ${code?.code ?? ""} · ${formatMoney({ amountMinor: 39700n, currency: "PLN" }, "en")}`,
        );
        expect(mails[0]?.text).toContain(`${ORIGIN}/admin/payouts/${payoutId}`);
        expect(mails[0]?.text).toContain("1 of 5");
        expect(mails[0]?.text).not.toContain("Test Buyer");
        expect(mails[0]?.text).not.toContain("Test Florist");
        const [deliveries] = await tx<{ n: number }[]>`
          SELECT count(*)::int AS n FROM notification_delivery
          WHERE source_key = ${`job:payouts.prepaid_ready:${payoutId}`}
            AND template_key = 'payout-prepaid-ready' AND recipient_ref = 'ops'`;
        expect(deliveries?.n).toBe(1);
      });
    });

    /* -------------------------------------------------------------------- */
    /* Money's awkward cases (self-review, TASK-363)                        */
    /* -------------------------------------------------------------------- */

    describe("awkward amounts, currencies, cancellations and retries", () => {
      async function prepaidCount(tx: Tx, partnerId: string): Promise<number> {
        const [row] = await tx<{ n: number }[]>`
          SELECT count(*)::int AS n FROM payout
          WHERE partner_id = ${partnerId} AND kind = 'prepaid'`;
        return row?.n ?? -1;
      }

      async function refusal(tx: Tx, orderId: string, assignmentId: string) {
        return tx
          .savepoint((sp) => fix(sp as Tx, orderId, assignmentId))
          .then(
            () => "fixed",
            (error: unknown) => (error as { code?: string }).code,
          );
      }

      it("zero: a florist whose prices are 0 gets the amounts fixed at 0, no prepaid payout, and keeps its prepaid slot", async () => {
        await rolledBack(scratch.sql, async (tx) => {
          const partnerId = await florist(tx, c, 5);
          await tx`UPDATE partner_catalog_mapping SET partner_payout_minor = 0
                   WHERE partner_id = ${partnerId}`;
          const orderId = await order(tx, c);
          const scheduled: string[] = [];
          expect(
            await fix(
              tx,
              orderId,
              await accepted(tx, orderId, partnerId),
              scheduled,
            ),
          ).toEqual({ outcome: "fixed", linesFixed: 2, prepaidPayoutId: null });
          expect(
            (await lines(tx, orderId)).map((l) => l.partner_payout_minor),
          ).toEqual([null, "0", "0"]);
          expect(scheduled).toEqual([]);
          expect(await prepaidCount(tx, partnerId)).toBe(0);
        });
      });

      it("currencies: the database refuses a price in EUR for a florist paid in PLN; amounts fixed in another currency refuse the prepaid payout", async () => {
        await rolledBack(scratch.sql, async (tx) => {
          const partnerId = await florist(tx, c, 5);
          const mapping = await pgFailure(
            tx,
            (sp) =>
              sp`UPDATE partner_catalog_mapping SET currency_code = 'EUR'
                 WHERE partner_id = ${partnerId} AND product_id = ${c.productB}`,
          );
          expect(mapping.constraint).toBe(
            "partner_catalog_mapping_partner_currency_fkey",
          );
          // Amounts fixed in EUR before (a florist whose currency changed since): the prepaid
          // step refuses rather than pay EUR amounts as PLN, and writes nothing.
          const orderId = await order(tx, c);
          await tx`UPDATE order_line SET partner_payout_minor = 100, payout_currency_code = 'EUR'
                   WHERE order_id = ${orderId} AND kind = 'product'`;
          const assignmentId = await accepted(tx, orderId, partnerId);
          expect(await refusal(tx, orderId, assignmentId)).toBe(
            "PAYOUT_CURRENCY_MISMATCH",
          );
          expect(await prepaidCount(tx, partnerId)).toBe(0);
        });
      });

      it("spec 030a Q5: an order cancelled after acceptance, handled late, still gets its prepaid payout (the founder recovers it by adjustment)", async () => {
        await rolledBack(scratch.sql, async (tx) => {
          const partnerId = await florist(tx, c, 5);
          const orderId = await order(tx, c);
          await walkOrderTo(tx, orderId, "accepted");
          const assignmentId = await accepted(tx, orderId, partnerId);
          await walkOrderTo(tx, orderId, "cancelled");
          const result = await fix(tx, orderId, assignmentId);
          expect(result).toMatchObject({ outcome: "fixed", linesFixed: 2 });
          const rows = await prepaid(tx, partnerId);
          expect(rows.map((r) => [r.total_minor, r.line_amounts])).toEqual([
            ["39700", ["39700"]],
          ]);
        });
      });

      it("a retry after a failed run accrues once: F1 cannot be enqueued, nothing stays; the next run writes one payout and one line", async () => {
        await rolledBack(scratch.sql, async (tx) => {
          const partnerId = await florist(tx, c, 5);
          const orderId = await order(tx, c);
          const assignmentId = await accepted(tx, orderId, partnerId);
          const failed = await tx
            .savepoint((sp) =>
              asSystem(sp as Tx, () =>
                fixPayoutAtAcceptance(
                  runnerOf(sp as Tx),
                  { orderId, assignmentId },
                  {
                    schedulePrepaidReady: () =>
                      Promise.reject(new Error("IT_QUEUE_DOWN")),
                    log: quiet,
                  },
                ),
              ),
            )
            .then(
              () => "fixed",
              (error: unknown) => String(error),
            );
          expect(failed).toMatch(/IT_QUEUE_DOWN/u);
          expect(
            (await lines(tx, orderId)).map((l) => l.partner_payout_minor),
          ).toEqual([null, null, null]);
          expect(await prepaidCount(tx, partnerId)).toBe(0);

          const scheduled: string[] = [];
          for (let i = 0; i < 3; i += 1) {
            await fix(tx, orderId, assignmentId, scheduled);
          }
          expect(scheduled).toHaveLength(1);
          const rows = await prepaid(tx, partnerId);
          expect(
            rows.map((r) => [r.id, r.total_minor, r.line_amounts]),
          ).toEqual([[scheduled[0], "39700", ["39700"]]]);
        });
      });

      it("AC-7: a prepaid order's later photo creates no line and no payout (no `payouts` route on the photo yet)", async () => {
        await rolledBack(scratch.sql, async (tx) => {
          const partnerId = await florist(tx, c, 5);
          const orderId = await order(tx, c);
          await walkOrderTo(tx, orderId, "accepted");
          await fix(tx, orderId, await accepted(tx, orderId, partnerId));
          const before = await prepaid(tx, partnerId);
          expect(before).toHaveLength(1);
          await walkOrderTo(tx, orderId, "photo_uploaded");
          const [counts] = await tx<{ payouts: number; lines: number }[]>`
            SELECT (SELECT count(*)::int FROM payout WHERE partner_id = ${partnerId}) AS payouts,
                   (SELECT count(*)::int FROM payout_line WHERE order_id = ${orderId}) AS lines`;
          expect({ ...counts }).toEqual({ payouts: 1, lines: 1 });
          const [targets] = await tx<{ n: number }[]>`
            SELECT count(*)::int AS n FROM outbox_delivery d
            JOIN outbox x ON x.id = d.outbox_id JOIN order_event e ON e.id = x.event_id
            WHERE e.order_id = ${orderId} AND e.type = 'order.photo_uploaded'
              AND d.target = 'payouts'`;
          expect(targets?.n).toBe(0);
        });
      });
    });

    /* -------------------------------------------------------------------- */
    /* The lifecycle triggers                                               */
    /* -------------------------------------------------------------------- */

    it("the payout lifecycle: status guard, frozen lines, the total kept by the database", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const partnerId = await florist(tx, c, 5);
        const orderId = await order(tx, c);
        const result = await fix(
          tx,
          orderId,
          await accepted(tx, orderId, partnerId),
        );
        const payoutId =
          result.outcome === "fixed" ? (result.prepaidPayoutId ?? "") : "";

        // The total follows the lines (an adjustment of -700 to a draft).
        await tx`INSERT INTO payout_line (payout_id, amount_minor, currency_code, kind, note)
                 VALUES (${payoutId}, -700, 'PLN', 'adjustment', 'Card not included')`;
        const total = async () =>
          (
            await tx<
              { t: string }[]
            >`SELECT total_minor::text AS t FROM payout WHERE id = ${payoutId}`
          )[0]?.t;
        expect(await total()).toBe("39000");
        const note = await pgFailure(
          tx,
          (sp) =>
            sp`INSERT INTO payout_line (payout_id, amount_minor, currency_code, kind, note)
             VALUES (${payoutId}, 500, 'PLN', 'goodwill', '  ')`,
        );
        expect(note.constraint).toBe("payout_line_note_check");

        const skip = await pgFailure(
          tx,
          (sp) =>
            sp`UPDATE payout SET status = 'paid', paid_at = now() WHERE id = ${payoutId}`,
        );
        expect(skip.raised).toBe("PAYOUT_STATUS_ILLEGAL");
        await tx`UPDATE payout SET status = 'statement_sent', sent_at = now(), statement_number = 'P-000001'
                 WHERE id = ${payoutId}`;
        const back = await pgFailure(
          tx,
          (sp) =>
            sp`UPDATE payout SET status = 'draft', sent_at = NULL, statement_number = NULL WHERE id = ${payoutId}`,
        );
        expect(back.raised).toBe("PAYOUT_STATUS_ILLEGAL");

        const frozenInsert = await pgFailure(
          tx,
          (sp) =>
            sp`INSERT INTO payout_line (payout_id, amount_minor, currency_code, kind, note)
             VALUES (${payoutId}, 100, 'PLN', 'goodwill', 'Late')`,
        );
        expect(frozenInsert.raised).toBe("PAYOUT_NOT_DRAFT");
        const frozenAmount = await pgFailure(
          tx,
          (sp) =>
            sp`UPDATE payout_line SET amount_minor = 1 WHERE payout_id = ${payoutId} AND kind = 'order'`,
        );
        expect(frozenAmount.raised).toBe("PAYOUT_NOT_DRAFT");
        const frozenDelete = await pgFailure(
          tx,
          (sp) =>
            sp`DELETE FROM payout_line WHERE payout_id = ${payoutId} AND kind = 'adjustment'`,
        );
        expect(frozenDelete.raised).toBe("PAYOUT_NOT_DRAFT");
        // Resolving the review flag is the one change a sent line admits.
        await tx`UPDATE payout_line SET reviewed_at = now(), reviewed_by = ${c.adminId}
                 WHERE payout_id = ${payoutId} AND kind = 'order'`;
        expect(await total()).toBe("39000");
        await tx`UPDATE payout SET status = 'paid', paid_at = now() WHERE id = ${payoutId}`;
      });
    });

    /* -------------------------------------------------------------------- */
    /* T-32                                                                 */
    /* -------------------------------------------------------------------- */

    it("T-32 (AC-32): a florist reads only its own payouts and lines, new columns included; payout_export is staff only", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const partnerA = await florist(tx, c, 5);
        const partnerB = await florist(tx, c, 5);
        for (const partnerId of [partnerA, partnerB]) {
          const orderId = await order(tx, c);
          await fix(tx, orderId, await accepted(tx, orderId, partnerId));
        }
        await tx`INSERT INTO payout_export (source_currency_code, created_by) VALUES ('EUR', ${c.adminId})`;
        const read = async (role: string, partnerIds: string[] = []) => {
          await asApp(tx, { role, partnerIds });
          try {
            const payouts = await tx<
              { partner_id: string; kind: string; closed: boolean }[]
            >`
              SELECT partner_id, kind, closed_at IS NOT NULL AS closed FROM payout
              WHERE partner_id IN (${partnerA}, ${partnerB})`;
            const reviewed = await tx<{ review_reason: string | null }[]>`
              SELECT l.review_reason FROM payout_line l
              WHERE l.payout_id IN (SELECT id FROM payout WHERE partner_id IN (${partnerA}, ${partnerB}))`;
            const [exports] = await tx<
              { n: number }[]
            >`SELECT count(*)::int AS n FROM payout_export`;
            return {
              partners: payouts.map((p) => p.partner_id).sort(),
              kinds: payouts.map((p) => `${p.kind}:${String(p.closed)}`),
              lines: reviewed.map((l) => l.review_reason),
              exports: exports?.n,
            };
          } finally {
            await tx.unsafe("RESET ROLE");
          }
        };
        expect(await read("partner", [partnerA])).toEqual({
          partners: [partnerA],
          kinds: ["prepaid:true"],
          lines: ["unpriced_lines"],
          exports: 0,
        });
        expect((await read("partner", [partnerB])).partners).toEqual([
          partnerB,
        ]);
        for (const role of ["customer", "public"]) {
          expect(await read(role)).toEqual({
            partners: [],
            kinds: [],
            lines: [],
            exports: 0,
          });
        }
        for (const role of ["system", "admin"]) {
          const seen = await read(role);
          expect(seen.partners).toEqual([partnerA, partnerB].sort());
          expect(seen.exports).toBe(1);
        }
      });
    });
  },
);

/* ---------------------------------------------------------------------------------------- */
/* T-31: the guarded down file, on databases of their own                                    */
/* ---------------------------------------------------------------------------------------- */

/** Every `public` table's row count. */
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
  `spec 030a rollback (AC-31, T-31)${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
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

    /** Rolls back every migration after this one, then tries this one's down file. */
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
      // `fresh` stops before 030a: the runner is told this migration and every later one are
      // applied, so it applies everything before them; then they are un-recorded and applied.
      fresh = await scratchDatabase(server.url as string, "payouts_rb", {
        migrate: false,
      });
      used = await scratchDatabase(server.url as string, "payouts_used");
    }, 600_000);

    afterAll(async () => {
      await fresh.drop();
      await used.drop();
    });

    it("a clean database: down succeeds and restores the pre-030a catalogue (payout_partner_period_key included); migrate again", async () => {
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
      const before030a = await readCatalogue(fresh.sql);
      expect(
        before030a["constraints"]?.["payout payout_partner_period_key"],
      ).toBe("UNIQUE (partner_id, period_start, period_end)");
      await fresh.sql`DELETE FROM public.schema_migrations WHERE version >= ${MY_VERSION}`;
      await locked(() => runner(fresh.url));
      const with030a = await readCatalogue(fresh.sql);
      expect(
        with030a["constraints"]?.["payout payout_partner_period_key"],
      ).toBeUndefined();

      expect(await down(fresh)).toBe("rolled back");
      expect(await readCatalogue(fresh.sql)).toEqual(before030a);

      await locked(() => runner(fresh.url));
      expect(await readCatalogue(fresh.sql)).toEqual(with030a);
    }, 600_000);

    it("PAYOUTS_030A_ROLLBACK_ROWS_IN_USE with a prepaid payout, a statement number, a payout_export row; nothing changes", async () => {
      const c = await setUpCatalogue(used.sql);
      const ids = await used.sql.begin(async (tx) => {
        const partnerId = await florist(tx, c, 5);
        const orderId = await order(tx, c);
        const result = await fix(
          tx,
          orderId,
          await accepted(tx, orderId, partnerId),
        );
        return {
          partnerId,
          prepaidId:
            result.outcome === "fixed" ? (result.prepaidPayoutId ?? "") : "",
        };
      });
      await locked(() => runner(used.url, ["--down", "--to", MY_VERSION]));

      const refuses = async () => {
        const catalogue = await readCatalogue(used.sql);
        const counts = await rowCounts(used.sql);
        expect(await down(used)).toContain("PAYOUTS_030A_ROLLBACK_ROWS_IN_USE");
        expect(await readCatalogue(used.sql)).toEqual(catalogue);
        expect(await rowCounts(used.sql)).toEqual(counts);
      };

      // 1. A prepaid payout.
      await refuses();
      await used.sql`DELETE FROM payout_line WHERE payout_id = ${ids.prepaidId}`;
      await used.sql`DELETE FROM payout WHERE id = ${ids.prepaidId}`;

      // 2. A weekly payout with a statement number.
      const [weekly] = await used.sql<{ id: string }[]>`
        INSERT INTO payout (partner_id, period_start, period_end, status, total_minor, currency_code,
                            kind, closed_at, sent_at, statement_number)
        VALUES (${ids.partnerId}, DATE '2026-10-19', DATE '2026-10-25', 'statement_sent', 0, 'PLN',
                'weekly', now(), now(), 'P-000001')
        RETURNING id`;
      await refuses();
      await used.sql`DELETE FROM payout WHERE id = ${weekly?.id ?? ""}`;

      // 3. A payout_export row alone.
      const [exported] = await used.sql<{ id: string }[]>`
        INSERT INTO payout_export (source_currency_code, created_by) VALUES ('EUR', ${c.adminId})
        RETURNING id`;
      await refuses();
      await used.sql`DELETE FROM payout_export WHERE id = ${exported?.id ?? ""}`;

      // Clean: it rolls back, then applies again.
      expect(await down(used)).toBe("rolled back");
      await locked(() => runner(used.url));
    }, 600_000);
  },
);
