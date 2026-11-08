/**
 * Spec 047's data half on a migrated PG16 scratch database (§10 T-01, T-02 database half, T-15,
 * T-16, T-19 payout half, T-20, T-30; AC-1, AC-2, AC-15, AC-16, AC-19, AC-20, AC-30; TASK-445),
 * never the shared database:
 *
 *  - T-02 (AC-2): the database refuses each rule of §5.1 by its named constraint, or
 *    `DISCOUNT_SHAPE_INVALID` at commit; `issueCode` turns a taken code into a field error;
 *  - `issueCode` in an admin context writes the code and its scope rows, each audited once with
 *    `discount.create`; RLS hides every discount table from `customer`, `partner` and `public`;
 *  - T-15 (AC-15): five concurrent placements against a total cap of 3 give exactly three
 *    `order_discount` rows; a per-email cap of 1 refuses "Anna+x@Example.com" after
 *    "anna@example.com" with `already_used_by_you`;
 *  - T-16 (AC-16): a `demo` use never counts against `live`; a live order walked to `abandoned`
 *    frees its place; a delivered order walked to `refunded_full` still counts; a basket of two
 *    orders is one use, and one cancelled order of it does not give the use back;
 *  - T-19 (AC-19): the same lines with and without a discount get identical payout columns from
 *    spec 030a's `fixPayoutAtAcceptance`;
 *  - T-20 (AC-20): `linePaidAmounts` is price minus share per line; the database's per-order
 *    refund ceiling holds at the discounted total (the chocolates' paid amount refunds, one minor
 *    unit past the remaining balance is refused); `codeStats` counts and sums live uses;
 *  - T-01 (AC-1): with a live `order_discount` the down file raises
 *    `DISCOUNT_ROLLBACK_LIVE_ORDERS` and changes nothing; without, migrate, rollback, migrate
 *    leaves the catalogue identical.
 */
import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readCatalogue } from "../../scripts/db-check-live.ts";
import {
  codeStats,
  countUses,
  discountFinanceRows,
  emailKey,
  evaluateCode,
  issueCode,
  loadCode,
  lockAndCount,
  type DiscountConnection,
} from "../../src/modules/discounts/index.ts";
import { linePaidAmounts } from "../../src/modules/orders/line-paid-amounts.ts";
import { fixPayoutAtAcceptance } from "../../src/modules/partners/payouts/index.ts";
import { insertPlacedOrder, walkOrderTo } from "../fixtures/order-state.ts";
import { drizzleOver } from "./support/drizzle-tx.ts";
import * as make from "./support/rows.ts";
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
const MINE = FORWARD.find((name) => name.endsWith("_discount_codes.sql")) ?? "";
const MY_VERSION = MINE.slice(0, 4);
const BEFORE = FORWARD[FORWARD.indexOf(MINE) - 1]?.slice(0, 4) ?? "";

interface Catalogue {
  readonly countryId: string;
  readonly roses: string;
  readonly tulips: string;
  readonly chocolates: string;
  readonly adminId: string;
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
    const roses = await product(make.unique("FO-DSC-A"));
    const tulips = await product(make.unique("FO-DSC-B"));
    const [addon] = await tx<{ id: string }[]>`
      INSERT INTO addon (key, kind) VALUES (${make.unique("chocolates_").replaceAll("-", "")}, 'confectionery')
      RETURNING id`;
    const adminId = randomUUID();
    await tx`INSERT INTO users (id, email) VALUES (${adminId}, ${`${make.unique("founder")}@example.test`})`;
    return { countryId, roses, tulips, chocolates: addon?.id ?? "", adminId };
  });
}

/** Runs `fn` in an admin context with `action`, as `withAdminContext` does, and commits. */
async function asAdmin<T>(
  sql: Sql,
  action: string,
  userId: string,
  fn: (connection: DiscountConnection, tx: Tx) => Promise<T>,
): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`SELECT set_config('app.audit_action', ${action}, true)`;
    await asApp(tx, { role: "admin", userId });
    return fn({ db: drizzleOver(tx, sql) }, tx);
  }) as Promise<T>;
}

/** Inserts a code directly (fixtures only), committed; returns its id. */
async function code(
  sql: Sql,
  fields: {
    readonly text: string;
    readonly maxRedemptions?: number | null;
    readonly maxPerEmail?: number | null;
  },
): Promise<string> {
  return sql.begin(async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      INSERT INTO discount_code (code, code_normalised, campaign_label, kind, percent_bp, starts_at,
                                 max_redemptions, max_per_email)
      VALUES (${fields.text}, ${fields.text}, 'Fixture campaign', 'percent', 1000,
              now() - interval '1 day', ${fields.maxRedemptions ?? null},
              ${fields.maxPerEmail === undefined ? 1 : fields.maxPerEmail})
      RETURNING id`;
    return row?.id ?? "";
  }) as Promise<string>;
}

/** A placed order of 21 000 PLN units in its own purchase (or `purchaseId`), committed. */
async function placed(
  sql: Sql,
  c: Catalogue,
  mode: "demo" | "test" | "live" = "live",
  totalMinor = 21_000,
): Promise<string> {
  return sql.begin(async (tx) => {
    const buyer = await make.customer(tx);
    return insertPlacedOrder(tx, {
      customerId: buyer,
      recipientId: await make.recipient(tx, buyer),
      countryId: c.countryId,
      mode,
      totalMinor,
    });
  }) as Promise<string>;
}

/** Writes an order's discount row, as placement will (TASK-447). */
async function redeem(
  tx: Tx | Sql,
  orderId: string,
  codeId: string,
  email: string,
  mode: "demo" | "test" | "live",
  amountMinor = 2100,
): Promise<void> {
  await tx`
    INSERT INTO order_discount (order_id, discount_code_id, code_snapshot, kind, percent_bp,
                                amount_minor, currency_code, base_amount_minor, base_currency_code,
                                email_key_sha256, mode)
    SELECT ${orderId}, id, code_normalised, kind, percent_bp, ${amountMinor}, 'PLN', ${amountMinor},
           'PLN', ${emailKey(email)}, ${mode}
      FROM discount_code WHERE id = ${codeId}`;
}

async function walk(sql: Sql, orderId: string, target: string): Promise<void> {
  await sql.begin(async (tx) => {
    await walkOrderTo(tx, orderId, target);
  });
}

describe.skipIf(server.url === undefined)(
  `spec 047 discount data${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    let c: Catalogue;

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "discounts");
      c = await setUpCatalogue(scratch.sql);
    }, 300_000);

    afterAll(async () => {
      await scratch.drop();
    });

    describe("T-02 (AC-2) · the database refuses each rule", () => {
      const insertCode = (tx: Tx, patch: Record<string, unknown>) => {
        const row = {
          code: "POLONIA10",
          code_normalised: "POLONIA10",
          campaign_label: "Fixture",
          kind: "percent",
          percent_bp: 1000,
          starts_at: "2026-11-01T00:00:00Z",
          ends_at: null,
          ...patch,
        };
        return tx`INSERT INTO discount_code ${tx(row)} RETURNING id`;
      };

      it.each([
        [{ percent_bp: 99 }, "discount_code_percent_bp_check"],
        [{ percent_bp: 5001 }, "discount_code_percent_bp_check"],
        [{ ends_at: "2026-11-01T00:00:00Z" }, "discount_code_ends_at_check"],
        [{ ends_at: "2026-10-31T00:00:00Z" }, "discount_code_ends_at_check"],
        [{ code_normalised: "ABC12" }, "discount_code_code_normalised_check"],
        [
          { code_normalised: "A".repeat(33) },
          "discount_code_code_normalised_check",
        ],
        [
          { code_normalised: "POLONİA10" },
          "discount_code_code_normalised_check",
        ],
        [
          { code_normalised: "polonia10" },
          "discount_code_code_normalised_check",
        ],
        [
          { kind: "percent", percent_bp: null },
          "discount_code_kind_percent_check",
        ],
      ])("refuses %j by %s", async (patch, constraint) => {
        await rolledBack(scratch.sql, async (tx) => {
          const failure = await pgFailure(tx, (sp) => insertCode(sp, patch));
          expect(failure.constraint).toBe(constraint);
        });
      });

      it("refuses a second code with the same normalised text", async () => {
        await rolledBack(scratch.sql, async (tx) => {
          await insertCode(tx, {});
          const failure = await pgFailure(tx, (sp) =>
            insertCode(sp, { code: "polonia-10" }),
          );
          expect(failure.constraint).toBe("discount_code_code_normalised_key");
        });
      });

      it("refuses a fixed amount above half its minimum, and accepts exactly half", async () => {
        await rolledBack(scratch.sql, async (tx) => {
          const [row] = await insertCode(tx, {
            kind: "fixed",
            percent_bp: null,
          });
          const id = String(row?.["id"]);
          const failure = await pgFailure(
            tx,
            (
              sp,
            ) => sp`INSERT INTO discount_code_currency (discount_code_id, currency_code, amount_off_minor, min_order_minor)
                       VALUES (${id}, 'GBP', 1001, 2000)`,
          );
          expect(failure.constraint).toBe(
            "discount_code_currency_ceiling_check",
          );
          await tx`INSERT INTO discount_code_currency (discount_code_id, currency_code, amount_off_minor, min_order_minor)
                   VALUES (${id}, 'GBP', 1000, 2000)`;
          await tx`SET CONSTRAINTS ALL IMMEDIATE`;
        });
      });

      it("refuses a fixed code with no amount and a percent code with one (DISCOUNT_SHAPE_INVALID)", async () => {
        await rolledBack(scratch.sql, async (tx) => {
          const fixed = await pgFailure(tx, async (sp) => {
            const [row] = await insertCode(sp, {
              kind: "fixed",
              percent_bp: null,
            });
            await sp`INSERT INTO discount_code_currency (discount_code_id, currency_code, min_order_minor)
                     VALUES (${String(row?.["id"])}, 'GBP', 2000)`;
            await sp`SET CONSTRAINTS ALL IMMEDIATE`;
          });
          expect(fixed.raised).toBe("DISCOUNT_SHAPE_INVALID");
          const percent = await pgFailure(tx, async (sp) => {
            const [row] = await insertCode(sp, {});
            await sp`INSERT INTO discount_code_currency (discount_code_id, currency_code, amount_off_minor, min_order_minor)
                     VALUES (${String(row?.["id"])}, 'GBP', 500, 2000)`;
            await sp`SET CONSTRAINTS ALL IMMEDIATE`;
          });
          expect(percent.raised).toBe("DISCOUNT_SHAPE_INVALID");
        });
      });
    });

    describe("issueCode in an admin context (AC-30, AC-2)", () => {
      it("writes the code and its scope rows, each audited once as discount.create", async () => {
        const result = await asAdmin(
          scratch.sql,
          "discount.create",
          c.adminId,
          (connection) =>
            issueCode(
              {
                code: "ealing-2026",
                campaignLabel: "Polish Saturday school, Ealing",
                kind: "fixed",
                currencies: [
                  { currency: "GBP", amountOffMinor: 500, minOrderMinor: 2000 },
                  { currency: "EUR", amountOffMinor: 600, minOrderMinor: 2400 },
                ],
                startsAt: "2026-11-01T00:00:00+00:00",
                endsAt: "2026-11-30T23:59:00+00:00",
                maxRedemptions: 200,
                countryIds: [c.countryId],
                productIds: [c.roses],
                source: "admin",
              },
              { userId: c.adminId },
              connection,
            ),
        );
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.codeNormalised).toBe("EALING2026");
        const audits = await scratch.sql<
          { table_name: string; action: string }[]
        >`
          SELECT entity_table AS table_name, action FROM audit_log
           WHERE action = 'discount.create' AND entity_id LIKE ${`${result.id}%`}
           ORDER BY entity_table`;
        expect(audits.map((row) => row.table_name)).toEqual([
          "discount_code",
          "discount_code_country",
          "discount_code_currency",
          "discount_code_currency",
          "discount_code_product",
        ]);
        const loaded = await asAdmin(
          scratch.sql,
          "discounts.read",
          c.adminId,
          (connection) => loadCode({ id: result.id }, connection),
        );
        expect(loaded?.code.maxPerEmail).toBe(1);
        expect(loaded?.currencies).toEqual([
          { currency: "EUR", amountOffMinor: 600, minOrderMinor: 2400 },
          { currency: "GBP", amountOffMinor: 500, minOrderMinor: 2000 },
        ]);

        const again = await asAdmin(
          scratch.sql,
          "discount.create",
          c.adminId,
          (connection) =>
            issueCode(
              {
                code: "EALING 2026",
                campaignLabel: "Duplicate",
                kind: "percent",
                percentBp: 1000,
                currencies: [],
                startsAt: "2026-11-01T00:00:00+00:00",
                countryIds: [],
                productIds: [],
                source: "admin",
              },
              { userId: c.adminId },
              connection,
            ),
        );
        expect(again).toEqual({
          ok: false,
          issues: [{ field: "code", error: "codeTaken" }],
        });
      });

      it("hides every discount table from customer, partner and public (RLS)", async () => {
        const id = await code(scratch.sql, { text: "RLSCODE01" });
        const orderId = await placed(scratch.sql, c, "demo");
        await redeem(scratch.sql, orderId, id, "rls@example.test", "demo");
        for (const role of ["customer", "partner", "public"]) {
          await rolledBack(scratch.sql, async (tx) => {
            await asApp(tx, { role, userId: randomUUID() });
            for (const table of [
              "discount_code",
              "discount_code_currency",
              "discount_code_country",
              "discount_code_product",
              "order_discount",
            ]) {
              const rows = await tx.unsafe(`SELECT 1 FROM public.${table}`);
              expect(rows.length, `${role} ${table}`).toBe(0);
            }
          });
        }
        await rolledBack(scratch.sql, async (tx) => {
          await asApp(tx, { role: "admin", userId: c.adminId });
          const rows =
            await tx`SELECT 1 FROM order_discount WHERE order_id = ${orderId}`;
          expect(rows.length).toBe(1);
        });
      });
    });

    describe("T-15 (AC-15) · caps under concurrency and per email", () => {
      it("five concurrent placements against a cap of 3 give exactly three discounted orders", async () => {
        const id = await code(scratch.sql, {
          text: "CAPTHREE1",
          maxRedemptions: 3,
          maxPerEmail: null,
        });
        const orders: string[] = [];
        for (let index = 0; index < 5; index += 1)
          orders.push(await placed(scratch.sql, c));
        const pool = postgres(scratch.url, {
          max: 6,
          onnotice: () => undefined,
        });
        try {
          const outcomes = await Promise.all(
            orders.map((orderId, index) =>
              pool.begin(async (tx) => {
                await asApp(tx, { role: "system" });
                const connection = { db: drizzleOver(tx, pool) };
                const counts = await lockAndCount(
                  id,
                  "live",
                  emailKey(`b${String(index)}@example.test`),
                  connection,
                );
                const loaded = await loadCode({ id }, connection);
                if (counts === null || loaded === null) return "missing";
                const result = evaluateCode({
                  ...loaded,
                  now: new Date(),
                  purchase: {
                    currency: "PLN",
                    lines: [
                      {
                        grossMinor: 21_000,
                        currency: "PLN",
                        destinationCountryId: c.countryId,
                        productId: c.roses,
                      },
                    ],
                  },
                  emailKey: emailKey(`b${String(index)}@example.test`),
                  counts,
                  locked: false,
                });
                if (!result.ok) return result.reason;
                await new Promise((done) => setTimeout(done, 20));
                await redeem(
                  tx,
                  orderId,
                  id,
                  `b${String(index)}@example.test`,
                  "live",
                  result.amount.amountMinor,
                );
                return "placed";
              }),
            ),
          );
          expect(outcomes.filter((o) => o === "placed")).toHaveLength(3);
          expect(outcomes.filter((o) => o === "used_up")).toHaveLength(2);
        } finally {
          await pool.end({ timeout: 5 });
        }
        const [count] = await scratch.sql<{ n: string }[]>`
          SELECT count(*)::text AS n FROM order_discount WHERE discount_code_id = ${id}`;
        expect(count?.n).toBe("3");
      });

      it("refuses Anna+x@Example.com after anna@example.com with already_used_by_you", async () => {
        const id = await code(scratch.sql, {
          text: "ONCEEACH1",
          maxPerEmail: 1,
        });
        await redeem(
          scratch.sql,
          await placed(scratch.sql, c),
          id,
          "anna@example.com",
          "live",
        );
        const outcome = await scratch.sql.begin(async (tx) => {
          await asApp(tx, { role: "system" });
          const connection = { db: drizzleOver(tx, scratch.sql) };
          const counts = await lockAndCount(
            id,
            "live",
            emailKey("Anna+x@Example.com"),
            connection,
          );
          const loaded = await loadCode({ id }, connection);
          if (counts === null || loaded === null) return "missing";
          const result = evaluateCode({
            ...loaded,
            now: new Date(),
            purchase: {
              currency: "PLN",
              lines: [
                {
                  grossMinor: 21_000,
                  currency: "PLN",
                  destinationCountryId: c.countryId,
                  productId: c.roses,
                },
              ],
            },
            emailKey: emailKey("Anna+x@Example.com"),
            counts,
            locked: false,
          });
          return result.ok ? "ok" : result.reason;
        });
        expect(outcome).toBe("already_used_by_you");
      });
    });

    describe("T-16 (AC-16) · uses counted per mode and by status, one per purchase", () => {
      const live = async (id: string) =>
        scratch.sql.begin(async (tx) => {
          await asApp(tx, { role: "admin", userId: c.adminId });
          return (
            await countUses(id, "live", null, {
              db: drizzleOver(tx, scratch.sql),
            })
          ).uses;
        });

      it("a demo use never counts against live", async () => {
        const id = await code(scratch.sql, { text: "MODECHK01" });
        await redeem(
          scratch.sql,
          await placed(scratch.sql, c, "demo"),
          id,
          "d@example.test",
          "demo",
        );
        await redeem(
          scratch.sql,
          await placed(scratch.sql, c, "test"),
          id,
          "t@example.test",
          "test",
        );
        expect(await live(id)).toBe(0);
      });

      it("an abandoned live order frees its place; a refunded delivered order still counts", async () => {
        const id = await code(scratch.sql, { text: "STATUS001" });
        const abandoned = await placed(scratch.sql, c);
        await redeem(scratch.sql, abandoned, id, "a@example.test", "live");
        const refunded = await placed(scratch.sql, c);
        await redeem(scratch.sql, refunded, id, "r@example.test", "live");
        expect(await live(id)).toBe(2);
        await walk(scratch.sql, abandoned, "abandoned");
        expect(await live(id)).toBe(1);
        await walk(scratch.sql, refunded, "delivered");
        expect(await live(id)).toBe(1);
        await walk(scratch.sql, refunded, "refunded_full");
        expect(await live(id)).toBe(1);
        for (const status of [
          "payment_failed",
          "cancelled",
          "cancelled_refunded",
        ]) {
          const orderId = await placed(scratch.sql, c);
          await redeem(
            scratch.sql,
            orderId,
            id,
            `${status}@example.test`,
            "live",
          );
          await walk(scratch.sql, orderId, status);
          expect(await live(id), status).toBe(1);
        }
      });

      it("a basket of two orders is one use, and one cancelled order of it keeps the use", async () => {
        const id = await code(scratch.sql, { text: "BASKET001" });
        const [first, second] = await scratch.sql.begin(async (tx) => {
          const buyer = await make.customer(tx);
          const recipient = await make.recipient(tx, buyer);
          const [purchase] = await tx<{ id: string }[]>`
            INSERT INTO purchase (mode, buyer_currency_code, total_minor, locale_code, customer_id)
            VALUES ('live', 'PLN', 30000, 'en', ${buyer}) RETURNING id`;
          const purchaseId = purchase?.id ?? "";
          const one = await insertPlacedOrder(tx, {
            customerId: buyer,
            recipientId: recipient,
            countryId: c.countryId,
            mode: "live",
            totalMinor: 18_000,
            purchaseId,
          });
          const two = await insertPlacedOrder(tx, {
            customerId: buyer,
            recipientId: recipient,
            countryId: c.countryId,
            mode: "live",
            totalMinor: 12_000,
            purchaseId,
          });
          await redeem(tx, one, id, "basket@example.test", "live", 1800);
          await redeem(tx, two, id, "basket@example.test", "live", 1200);
          return [one, two];
        });
        expect(await live(id)).toBe(1);
        await walk(scratch.sql, first ?? "", "cancelled");
        expect(await live(id)).toBe(1);
        await walk(scratch.sql, second ?? "", "cancelled");
        expect(await live(id)).toBe(0);
      });
    });

    describe("T-19 (AC-19) · the florist's pay never moves", () => {
      it("gives identical payout columns with and without a discount", async () => {
        const partnerId = await scratch.sql.begin(async (tx) => {
          const id = await make.partner(tx, c.countryId, "active");
          await tx`INSERT INTO partner_catalog_mapping (partner_id, product_id, tier_key, partner_payout_minor, currency_code)
                   VALUES (${id}, ${c.roses}, NULL, 9900, 'PLN')`;
          return id;
        });
        const discountId = await code(scratch.sql, { text: "PAYOUT001" });
        const payouts: unknown[] = [];
        for (const discounted of [false, true]) {
          const orderId = await placed(scratch.sql, c);
          await scratch.sql`
            INSERT INTO order_line (order_id, kind, product_id, addon_id, qty, unit_retail_minor, currency_code, vat_rate_bp, discount_minor)
            VALUES (${orderId}, 'product', ${c.roses}, NULL, 1, 15999, 'PLN', 800, ${discounted ? 1600 : 0}),
                   (${orderId}, 'addon', NULL, ${c.chocolates}, 1, 3999, 'PLN', 2300, ${discounted ? 400 : 0})`;
          if (discounted)
            await redeem(
              scratch.sql,
              orderId,
              discountId,
              "pay@example.test",
              "live",
              2000,
            );
          await scratch.sql.begin(async (tx) => {
            const at = new Date();
            const [assignment] = await tx<{ id: string }[]>`
              INSERT INTO order_assignment (order_id, partner_id, offered_at, sla_expires_at, attempt, response, responded_at)
              VALUES (${orderId}, ${partnerId}, ${new Date(at.getTime() - 60_000).toISOString()},
                      ${new Date(at.getTime() + 3_600_000).toISOString()}, 1, 'accept', ${at.toISOString()})
              RETURNING id`;
            await asApp(tx, { role: "system" });
            await fixPayoutAtAcceptance(
              runnerOf(tx),
              { orderId, assignmentId: assignment?.id ?? "" },
              {
                schedulePrepaidReady: () => Promise.resolve(),
                log: {
                  info: () => undefined,
                  warn: () => undefined,
                  error: () => undefined,
                  debug: () => undefined,
                } as never,
              },
            );
          });
          payouts.push(
            await scratch.sql`SELECT kind, partner_payout_minor::text, payout_currency_code
                              FROM order_line WHERE order_id = ${orderId} ORDER BY kind`,
          );
        }
        expect(payouts[1]).toEqual(payouts[0]);
        expect(JSON.stringify(payouts[0])).toContain("9900");
      });
    });

    describe("T-20 (AC-20) · paid amounts, refund ceilings and stats", () => {
      it("linePaidAmounts is price minus share; refunds stop at the discounted total", async () => {
        const id = await code(scratch.sql, { text: "REFUND001" });
        // AC-8's fixture: bouquet 15 999 at 8 %, chocolates 3 999 at 23 %, surcharge 1 000 at 8 %;
        // 10 % off is 2 100, shared 1 600, 400, 100; charged 18 898.
        const orderId = await placed(scratch.sql, c, "live", 18_898);
        await scratch.sql`
          INSERT INTO order_line (order_id, kind, product_id, addon_id, qty, unit_retail_minor, currency_code, vat_rate_bp, discount_minor)
          VALUES (${orderId}, 'product', ${c.roses}, NULL, 1, 15999, 'PLN', 800, 1600),
                 (${orderId}, 'addon', NULL, ${c.chocolates}, 1, 3999, 'PLN', 2300, 400),
                 (${orderId}, 'surcharge', NULL, NULL, 1, 1000, 'PLN', 800, 100)`;
        await redeem(
          scratch.sql,
          orderId,
          id,
          "refund@example.test",
          "live",
          2100,
        );
        const paid = await scratch.sql.begin(async (tx) => {
          await asApp(tx, { role: "system" });
          return linePaidAmounts(orderId, { executor: runnerOf(tx) });
        });
        expect(
          paid.map((line) => [line.kind, line.paidMinor, line.vatRateBp]),
        ).toEqual([
          ["product", 14399, 800],
          ["addon", 3599, 2300],
          ["surcharge", 900, 800],
        ]);

        await walk(scratch.sql, orderId, "delivered");
        const [purchase] = await scratch.sql<{ purchase_id: string }[]>`
          SELECT purchase_id FROM "order" WHERE id = ${orderId}`;
        const purchaseId = purchase?.purchase_id ?? "";
        const [payment] = await scratch.sql<{ id: string }[]>`
          INSERT INTO payment (purchase_id, provider, provider_ref, status, method, amount_minor,
                               currency_code, livemode, capture_method, amount_captured_minor, captured_at)
          VALUES (${purchaseId}, 'stripe', ${`pi_${randomUUID().slice(0, 12)}`}, 'captured', 'card',
                  18898, 'PLN', true, 'automatic', 18898, now())
          RETURNING id`;
        const refund = (tx: Tx | Sql, amountMinor: number) => tx`
          INSERT INTO refund (payment_id, order_id, purchase_id, amount_minor, currency_code, reason, status, requested_by)
          VALUES (${payment?.id ?? ""}, ${orderId}, ${purchaseId}, ${amountMinor}, 'PLN', 'other', 'requested', 'system:payments')`;
        await refund(scratch.sql, 3599);
        await rolledBack(scratch.sql, async (tx) => {
          const failure = await pgFailure(tx, (sp) =>
            refund(sp, 18_898 - 3599 + 1),
          );
          expect(failure.raised).toBe("REFUND_EXCEEDS_ORDER");
          await refund(tx, 18_898 - 3599);
        });
        await refund(scratch.sql, 18_898 - 3599);
        await walk(scratch.sql, orderId, "refunded_full");

        const stats = await asAdmin(
          scratch.sql,
          "discounts.read",
          c.adminId,
          (connection) => codeStats(id, connection),
        );
        expect(stats).toEqual({
          liveUses: 1,
          discountByCurrency: [{ amountMinor: 2100, currency: "PLN" }],
        });
        const rows = await asAdmin(
          scratch.sql,
          "discounts.read",
          c.adminId,
          (connection) =>
            discountFinanceRows(
              {
                from: new Date(Date.now() - 86_400_000),
                to: new Date(Date.now() + 86_400_000),
                codeId: id,
              },
              connection,
            ),
        );
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          orderId,
          campaignLabel: "Fixture campaign",
          currency: "PLN",
          grossBeforeMinor: 20_998,
          discountMinor: 2100,
          chargedMinor: 18_898,
          payoutMinorInBase: null,
          marginAfterBaseMinor: null,
        });
      });
    });
  },
);

describe.skipIf(server.url === undefined)(
  `spec 047 rollback (AC-1, T-01)${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let db: ScratchDatabase;

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

    async function down(): Promise<string> {
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
      db = await scratchDatabase(server.url as string, "discounts_rb");
    }, 300_000);

    afterAll(async () => {
      await db.drop();
    });

    it("refuses with a live discounted order, then rolls back and migrates again cleanly", async () => {
      expect(BEFORE < MY_VERSION).toBe(true);
      const c = await setUpCatalogue(db.sql);
      const first = await readCatalogue(db.sql);
      const id = await code(db.sql, { text: "GUARD0001" });
      const orderId = await placed(db.sql, c);
      await redeem(db.sql, orderId, id, "guard@example.test", "live");

      expect(await down()).toContain("DISCOUNT_ROLLBACK_LIVE_ORDERS");
      expect(await readCatalogue(db.sql)).toEqual(first);
      const [still] = await db.sql<
        { n: string }[]
      >`SELECT count(*)::text AS n FROM order_discount`;
      expect(still?.n).toBe("1");

      await db.sql`DELETE FROM order_discount`;
      expect(await down()).toBe("rolled back");
      const [gone] = await db.sql<{ t: string | null }[]>`
        SELECT to_regclass('public.discount_code')::text AS t`;
      expect(gone?.t).toBeNull();
      const [column] = await db.sql<{ n: string }[]>`
        SELECT count(*)::text AS n FROM information_schema.columns
         WHERE table_name = 'order_line' AND column_name = 'discount_minor'`;
      expect(column?.n).toBe("0");

      await locked(() => runner(db.url));
      expect(await readCatalogue(db.sql)).toEqual(first);
    });
  },
);
