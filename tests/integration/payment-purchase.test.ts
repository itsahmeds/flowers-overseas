/**
 * Migration `NNNN_payment_purchase` on a disposable PG16: one payment per purchase, each refund
 * names its order (spec 013 §14 A-founder-2026-10-22 item 2; AC-48, T-48; spec 010 §14
 * A-founder-2026-10-22 item 13 (b), (e), §13 Q19; TASK-350).
 *
 *  - **Constraints:** a payment in another currency than its purchase, a second live payment, a
 *    refund naming another purchase's order, a refund taking one order above its own total while
 *    the payment has headroom (`REFUND_EXCEEDS_ORDER`), A7's per-payment check, zero and
 *    one-minor-unit refunds, an exponent-0 currency, a property test over random refund sequences
 *    on a three-order purchase.
 *  - **Concurrency:** two refunds on one order that fit alone but not together, from two
 *    connections, commit exactly one (the trigger's payment lock); two refunds on two orders of
 *    one purchase both commit, and their sum stays within the charge.
 *  - **Read helpers:** `paymentForOrder` answers the purchase's payment for each of its orders.
 *  - **Rollback:** backfill over demo orders with no payment and over test-mode one-order payments
 *    and refunds; up, down, up; the down file raises `PAYMENT_PURCHASE_ROLLBACK_BLOCKED` and
 *    changes nothing with a live payment, or with a payment for a two-order purchase; `0017` is
 *    byte-identical; `db:check`'s connected half passes.
 *
 * The rollback cases use a database of their own, because they roll migrations back.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as committedMirror from "../../db/schema/index.ts";
import { paymentForOrder, paymentForPurchase } from "@/modules/payments";

import { recipientEmailViolations } from "../../scripts/db-check.ts";
import {
  SNAPSHOT_FILE,
  liveCheck,
  readCatalogue,
  readSnapshot,
  type CatalogueSnapshot,
} from "../../scripts/db-check-live.ts";
import { insertPlacedOrder, walkOrderTo } from "../fixtures/order-state.ts";
import { orderParents } from "./support/rows.ts";
import {
  MIGRATE_LOCK,
  pgFailure,
  probeLocalServer,
  rolledBack,
  runner,
  scratchDatabase,
  type ScratchDatabase,
  type Sql,
  type Tx,
} from "./support/scratch-db.ts";
import { runnerOf } from "./support/sql-runner.ts";

const server = await probeLocalServer();

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const MIGRATIONS = resolve(REPO_ROOT, "db/migrations");

/** This migration, whatever number it took when it merged, and the version just below it. */
const FORWARD = readdirSync(MIGRATIONS)
  .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
  .filter((name) => !name.endsWith(".down.sql"))
  .sort();
const THIS_FILE =
  FORWARD.find((name) => /^\d{4}_payment_purchase\.sql$/.test(name)) ?? "";
const THIS_VERSION = THIS_FILE.slice(0, 4);
const BEFORE = (
  FORWARD.filter((name) => name.slice(0, 4) < THIS_VERSION).at(-1) ?? "0000"
).slice(0, 4);

/** `0017_payments_a7.sql` as TASK-254 merged it (§14 item 2: "is not edited"). */
const A7_SHA256 =
  "5300d7ae5969970634df87db8a5ed0305e245bd01736f94d3c27b36f5e557162";

/** Each runner case is a child process or more: far past Vitest's 5 s default. */
const RUNNER_TIMEOUT_MS = 180_000;

interface Purchase {
  readonly purchaseId: string;
  readonly orderIds: readonly string[];
  readonly customerId: string;
}

/** A purchase of `totals.length` orders, in `currency` (written before its orders; checked at commit). */
async function purchaseOf(
  tx: Tx,
  totals: readonly number[],
  options: { mode?: "demo" | "test" | "live"; currency?: string } = {},
): Promise<Purchase> {
  const parents = await orderParents(tx);
  const mode = options.mode ?? "test";
  const currency = options.currency ?? "PLN";
  const total = totals.reduce((sum, value) => sum + value, 0);
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO purchase (mode, buyer_currency_code, total_minor, locale_code, customer_id)
    VALUES (${mode}, ${currency}, ${total}, 'en', ${parents.customerId})
    RETURNING id`;
  const purchaseId = row?.id ?? "";
  const orderIds: string[] = [];
  for (const totalMinor of totals) {
    orderIds.push(
      await insertPlacedOrder(tx, {
        ...parents,
        mode,
        currencyCode: currency,
        totalMinor,
        purchaseId,
      }),
    );
  }
  return { purchaseId, orderIds, customerId: parents.customerId };
}

/** The purchase's payment, captured in full unless told otherwise. */
async function pay(
  tx: Tx,
  purchase: Purchase,
  amountMinor: number,
  options: { currency?: string; status?: string; livemode?: boolean } = {},
): Promise<string> {
  const status = options.status ?? "captured";
  const captured = status === "captured" ? amountMinor : 0;
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO payment (purchase_id, provider, provider_ref, status, method, amount_minor,
                         currency_code, livemode, capture_method, amount_captured_minor,
                         captured_at)
    VALUES (${purchase.purchaseId}, 'stripe', ${`pi_${crypto.randomUUID().slice(0, 12)}`},
            ${status}, 'card', ${amountMinor}, ${options.currency ?? "PLN"},
            ${options.livemode ?? false}, 'automatic', ${captured},
            ${status === "captured" ? new Date() : null})
    RETURNING id`;
  return row?.id ?? "";
}

type RefundStatus =
  "requested" | "pending" | "succeeded" | "failed" | "cancelled";

/** One refund row, as the refund service writes it. */
function refundInsert(
  sp: Tx,
  fields: {
    paymentId: string;
    orderId: string;
    purchaseId: string;
    amountMinor: number;
    currency?: string;
    status?: RefundStatus;
  },
) {
  const status = fields.status ?? "requested";
  const hasRef = status !== "requested" && status !== "failed";
  return sp<{ id: string }[]>`
    INSERT INTO refund (payment_id, order_id, purchase_id, provider_ref, amount_minor,
                        currency_code, reason, status, requested_by, succeeded_at)
    VALUES (${fields.paymentId}, ${fields.orderId}, ${fields.purchaseId},
            ${hasRef ? `re_${crypto.randomUUID().slice(0, 12)}` : null}, ${fields.amountMinor},
            ${fields.currency ?? "PLN"}, 'other', ${status}, 'system:payments',
            ${status === "succeeded" ? new Date() : null})
    RETURNING id`;
}

/** A deterministic PRNG (mulberry32), so a failing sequence is reproducible from its seed. */
function prng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const COUNTED: ReadonlySet<RefundStatus> = new Set([
  "requested",
  "pending",
  "succeeded",
]);

describe.skipIf(server.url === undefined)(
  `spec 013 AC-48 — one payment per purchase${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "paypur");
    }, 600_000);

    afterAll(async () => {
      await scratch.drop();
    });

    describe("constraints (T-48)", () => {
      it("a payment in another currency than its purchase is a foreign-key error", async () => {
        const failure = await rolledBack(scratch.sql, async (tx) => {
          const purchase = await purchaseOf(tx, [18_900]);
          return pgFailure(tx, (sp) =>
            pay(sp, purchase, 18_900, { currency: "EUR" }),
          );
        });
        expect(failure).toMatchObject({
          code: "23503",
          constraint: "payment_purchase_fkey",
        });
      });

      it("a second live payment for one purchase is a unique violation; once the first failed, a second is accepted", async () => {
        const result = await rolledBack(scratch.sql, async (tx) => {
          const purchase = await purchaseOf(tx, [1_000, 2_000, 3_000]);
          const first = await pay(tx, purchase, 6_000, { status: "pending" });
          const second = await pgFailure(tx, (sp) =>
            pay(sp, purchase, 6_000, { status: "pending" }),
          );
          await tx`UPDATE payment SET status = 'failed' WHERE id = ${first}`;
          const third = await pay(tx, purchase, 6_000, { status: "pending" });
          return { second, accepted: third !== "" };
        });
        expect(result.second).toMatchObject({
          code: "23505",
          constraint: "payment_one_live_per_purchase_idx",
        });
        expect(result.accepted).toBe(true);
      });

      it("a refund naming an order of another purchase, or another purchase than its payment's, is a foreign-key error", async () => {
        const result = await rolledBack(scratch.sql, async (tx) => {
          const mine = await purchaseOf(tx, [1_000, 2_000]);
          const other = await purchaseOf(tx, [5_000]);
          const paymentId = await pay(tx, mine, 3_000);
          const foreignOrder = await pgFailure(tx, (sp) =>
            refundInsert(sp, {
              paymentId,
              orderId: other.orderIds[0] ?? "",
              purchaseId: mine.purchaseId,
              amountMinor: 100,
            }),
          );
          const foreignPurchase = await pgFailure(tx, (sp) =>
            refundInsert(sp, {
              paymentId,
              orderId: other.orderIds[0] ?? "",
              purchaseId: other.purchaseId,
              amountMinor: 100,
            }),
          );
          return { foreignOrder, foreignPurchase };
        });
        expect(result.foreignOrder).toMatchObject({
          code: "23503",
          constraint: "refund_order_purchase_fkey",
        });
        expect(result.foreignPurchase).toMatchObject({
          code: "23503",
          constraint: "refund_payment_purchase_fkey",
        });
      });

      it("REFUND_EXCEEDS_ORDER: one order's refunds stop at its own total while the payment still has headroom", async () => {
        const result = await rolledBack(scratch.sql, async (tx) => {
          const purchase = await purchaseOf(tx, [1_000, 2_000, 3_000]);
          const paymentId = await pay(tx, purchase, 6_000);
          const [a, b] = purchase.orderIds;
          const on = (orderId: string, amountMinor: number) => (sp: Tx) =>
            refundInsert(sp, {
              paymentId,
              orderId,
              purchaseId: purchase.purchaseId,
              amountMinor,
            });
          await on(a ?? "", 400)(tx);
          await on(a ?? "", 600)(tx);
          const oneMore = await pgFailure(tx, on(a ?? "", 1));
          // The other orders keep their own ceilings.
          await on(b ?? "", 2_000)(tx);
          const [headroom] = await tx<{ captured: number; asked: number }[]>`
            SELECT p.amount_captured_minor::int AS captured,
                   (SELECT sum(amount_minor)::int FROM refund WHERE payment_id = p.id) AS asked
            FROM payment p WHERE p.id = ${paymentId}`;
          // An update that revives a failed refund, and one that raises an amount, are checked too.
          const c = purchase.orderIds[2] ?? "";
          const [failed] = await on(c, 3_000)(tx);
          await tx`UPDATE refund SET status = 'failed' WHERE id = ${failed?.id ?? ""}`;
          const [again] = await on(c, 3_000)(tx);
          const revive = await pgFailure(
            tx,
            (sp) =>
              sp`UPDATE refund SET status = 'requested' WHERE id = ${failed?.id ?? ""}`,
          );
          const raise = await pgFailure(
            tx,
            (sp) =>
              sp`UPDATE refund SET amount_minor = 3001 WHERE id = ${again?.id ?? ""}`,
          );
          return { oneMore, headroom, revive, raise };
        });
        expect(result.oneMore).toMatchObject({
          code: "23514",
          raised: "REFUND_EXCEEDS_ORDER",
        });
        expect(result.headroom).toEqual({ captured: 6_000, asked: 3_000 });
        expect(result.revive.raised).toBe("REFUND_EXCEEDS_ORDER");
        expect(result.raise.raised).toBe("REFUND_EXCEEDS_ORDER");
      });

      it("failed and cancelled refunds do not count toward the ceiling; requested, pending and succeeded do", async () => {
        const result = await rolledBack(scratch.sql, async (tx) => {
          const purchase = await purchaseOf(tx, [1_000]);
          const paymentId = await pay(tx, purchase, 1_000);
          const orderId = purchase.orderIds[0] ?? "";
          const base = { paymentId, orderId, purchaseId: purchase.purchaseId };
          await refundInsert(tx, {
            ...base,
            amountMinor: 1_000,
            status: "failed",
          });
          await refundInsert(tx, {
            ...base,
            amountMinor: 1_000,
            status: "cancelled",
          });
          await refundInsert(tx, { ...base, amountMinor: 300 });
          await refundInsert(tx, {
            ...base,
            amountMinor: 300,
            status: "pending",
          });
          await refundInsert(tx, {
            ...base,
            amountMinor: 400,
            status: "succeeded",
          });
          return pgFailure(tx, (sp) =>
            refundInsert(sp, { ...base, amountMinor: 1, status: "pending" }),
          );
        });
        expect(result.raised).toBe("REFUND_EXCEEDS_ORDER");
      });

      it("a zero refund is refused by its check; one minor unit is accepted up to the total, and one more is not", async () => {
        const result = await rolledBack(scratch.sql, async (tx) => {
          const purchase = await purchaseOf(tx, [2]);
          const paymentId = await pay(tx, purchase, 2);
          const base = {
            paymentId,
            orderId: purchase.orderIds[0] ?? "",
            purchaseId: purchase.purchaseId,
          };
          const zero = await pgFailure(tx, (sp) =>
            refundInsert(sp, { ...base, amountMinor: 0 }),
          );
          await refundInsert(tx, { ...base, amountMinor: 1 });
          await refundInsert(tx, { ...base, amountMinor: 1 });
          const third = await pgFailure(tx, (sp) =>
            refundInsert(sp, { ...base, amountMinor: 1 }),
          );
          return { zero, third };
        });
        expect(result.zero).toMatchObject({
          code: "23514",
          constraint: "refund_amount_minor_check",
        });
        expect(result.third.raised).toBe("REFUND_EXCEEDS_ORDER");
      });

      it("A7's check still holds the per-payment ceiling: amount_refunded_minor above amount_captured_minor is refused", async () => {
        const failure = await rolledBack(scratch.sql, async (tx) => {
          const purchase = await purchaseOf(tx, [1_000, 2_000]);
          const paymentId = await pay(tx, purchase, 3_000);
          await tx`UPDATE payment SET amount_refunded_minor = 3000 WHERE id = ${paymentId}`;
          return pgFailure(
            tx,
            (sp) =>
              sp`UPDATE payment SET amount_refunded_minor = 3001 WHERE id = ${paymentId}`,
          );
        });
        expect(failure.constraint).toBe("payment_amount_refunded_minor_check");
      });

      it("an exponent-0 currency (JPY-style): the ceiling is the order's whole-unit total", async () => {
        const result = await rolledBack(scratch.sql, async (tx) => {
          await tx`INSERT INTO currency (code, minor_unit_exponent) VALUES ('JPY', 0)
                   ON CONFLICT DO NOTHING`;
          const purchase = await purchaseOf(tx, [500, 700, 800], {
            currency: "JPY",
          });
          const paymentId = await pay(tx, purchase, 2_000, { currency: "JPY" });
          const base = {
            paymentId,
            purchaseId: purchase.purchaseId,
            currency: "JPY",
          };
          await refundInsert(tx, {
            ...base,
            orderId: purchase.orderIds[1] ?? "",
            amountMinor: 700,
          });
          return pgFailure(tx, (sp) =>
            refundInsert(sp, {
              ...base,
              orderId: purchase.orderIds[1] ?? "",
              amountMinor: 1,
            }),
          );
        });
        expect(result.raised).toBe("REFUND_EXCEEDS_ORDER");
      });

      it("a full refund of order 2 while order 1 is delivered: order 1 keeps its status and its whole ceiling", async () => {
        const result = await rolledBack(scratch.sql, async (tx) => {
          const purchase = await purchaseOf(tx, [1_000, 2_000]);
          const paymentId = await pay(tx, purchase, 3_000);
          const [one, two] = purchase.orderIds;
          await walkOrderTo(tx, one ?? "", "delivered");
          await refundInsert(tx, {
            paymentId,
            orderId: two ?? "",
            purchaseId: purchase.purchaseId,
            amountMinor: 2_000,
            status: "succeeded",
          });
          await refundInsert(tx, {
            paymentId,
            orderId: one ?? "",
            purchaseId: purchase.purchaseId,
            amountMinor: 1_000,
          });
          const [row] = await tx<{ status: string }[]>`
            SELECT status FROM "order" WHERE id = ${one ?? ""}`;
          return row?.status;
        });
        expect(result).toBe("delivered");
      });

      it("property: random refund sequences on a three-order purchase are accepted exactly when the named order stays within its total", async () => {
        const totals = [1_000, 2_500, 3_999] as const;
        const statuses: readonly RefundStatus[] = [
          "requested",
          "pending",
          "succeeded",
          "failed",
          "cancelled",
        ];
        const mismatches: string[] = [];
        let accepted = 0;
        let refused = 0;
        for (let seed = 1; seed <= 60; seed += 1) {
          const random = prng(seed);
          const outcome = await rolledBack(scratch.sql, async (tx) => {
            const purchase = await purchaseOf(tx, totals);
            const paymentId = await pay(tx, purchase, 7_499);
            const asked = [0, 0, 0];
            const steps = 6 + Math.floor(random() * 8);
            const local: string[] = [];
            for (let step = 0; step < steps; step += 1) {
              const index = Math.floor(random() * 3);
              const total = totals[index] ?? 0;
              const amount = 1 + Math.floor(random() * total);
              const status = statuses[Math.floor(random() * statuses.length)];
              if (status === undefined) continue;
              const counts = COUNTED.has(status);
              const expected = !counts || (asked[index] ?? 0) + amount <= total;
              let ok = true;
              try {
                await tx.savepoint((sp) =>
                  refundInsert(sp, {
                    paymentId,
                    orderId: purchase.orderIds[index] ?? "",
                    purchaseId: purchase.purchaseId,
                    amountMinor: amount,
                    status,
                  }),
                );
              } catch (error) {
                if (
                  !(error instanceof postgres.PostgresError) ||
                  !error.message.startsWith("REFUND_EXCEEDS_ORDER")
                ) {
                  throw error;
                }
                ok = false;
              }
              if (ok !== expected) {
                local.push(
                  `seed ${String(seed)} step ${String(step)}: order ${String(index)} ${status} ${String(amount)} after ${String(asked[index])}`,
                );
              }
              if (ok && counts) asked[index] = (asked[index] ?? 0) + amount;
              if (ok) accepted += 1;
              else refused += 1;
            }
            const [sums] = await tx<{ over: number; purchase: number }[]>`
              SELECT count(*) FILTER (WHERE s.asked > o.buyer_total_minor)::int AS over,
                     coalesce(sum(s.asked), 0)::int AS purchase
              FROM "order" o
              JOIN LATERAL (
                SELECT coalesce(sum(r.amount_minor), 0) AS asked FROM refund r
                WHERE r.order_id = o.id AND r.status IN ('requested', 'pending', 'succeeded')
              ) s ON true
              WHERE o.purchase_id = ${purchase.purchaseId}`;
            if ((sums?.over ?? 1) !== 0 || (sums?.purchase ?? 0) > 7_499) {
              local.push(`seed ${String(seed)}: invariant broken`);
            }
            return local;
          });
          mismatches.push(...outcome);
        }
        expect(mismatches).toEqual([]);
        // The sequences exercised both branches, many times each.
        expect(accepted).toBeGreaterThan(100);
        expect(refused).toBeGreaterThan(50);
      }, 120_000);
    });

    describe("concurrency: the trigger's payment lock (T-48 mutation)", () => {
      /** A one-connection client, so `BEGIN` and `COMMIT` are this test's to send. */
      function client(): postgres.Sql {
        return postgres(scratch.url, { max: 1, onnotice: () => undefined });
      }

      /** Waits until a backend of this database is waiting on a lock, or `settled` says it finished. */
      async function lockWaitOrSettled(settled: () => boolean): Promise<void> {
        for (let i = 0; i < 100; i += 1) {
          if (settled()) return;
          const [row] = await scratch.sql<{ n: number }[]>`
            SELECT count(*)::int AS n FROM pg_stat_activity
            WHERE datname = current_database() AND wait_event_type = 'Lock'`;
          if ((row?.n ?? 0) > 0) return;
          await new Promise((done) => setTimeout(done, 50));
        }
      }

      async function committedPurchase(totals: readonly number[]) {
        return scratch.sql.begin(async (tx) => {
          const purchase = await purchaseOf(tx, totals);
          const paymentId = await pay(
            tx,
            purchase,
            totals.reduce((a, b) => a + b, 0),
          );
          return { purchase, paymentId };
        });
      }

      async function race(
        first: { orderId: string; amountMinor: number },
        second: { orderId: string; amountMinor: number },
        context: { purchaseId: string; paymentId: string },
      ): Promise<{ second: string }> {
        const one = client();
        const two = client();
        try {
          await one`BEGIN`;
          await one`INSERT INTO refund (payment_id, order_id, purchase_id, amount_minor,
                                        currency_code, reason, status, requested_by)
                    VALUES (${context.paymentId}, ${first.orderId}, ${context.purchaseId},
                            ${first.amountMinor}, 'PLN', 'other', 'requested', 'system:payments')`;
          await two`BEGIN`;
          let settled = false;
          const pending =
            two`INSERT INTO refund (payment_id, order_id, purchase_id, amount_minor,
                                                  currency_code, reason, status, requested_by)
                              VALUES (${context.paymentId}, ${second.orderId},
                                      ${context.purchaseId}, ${second.amountMinor}, 'PLN',
                                      'other', 'requested', 'system:payments')`
              .then(() => "inserted")
              .catch((error: unknown) =>
                error instanceof Error ? error.message : String(error),
              )
              .finally(() => {
                settled = true;
              });
          await lockWaitOrSettled(() => settled);
          await one`COMMIT`;
          const outcome = await pending;
          if (outcome === "inserted") await two`COMMIT`;
          else await two`ROLLBACK`;
          return { second: outcome };
        } finally {
          await one.end({ timeout: 5 });
          await two.end({ timeout: 5 });
        }
      }

      it("two refunds on one order that fit alone but not together: exactly one commits", async () => {
        const { purchase, paymentId } = await committedPurchase([1_000]);
        const orderId = purchase.orderIds[0] ?? "";
        const result = await race(
          { orderId, amountMinor: 600 },
          { orderId, amountMinor: 600 },
          { purchaseId: purchase.purchaseId, paymentId },
        );
        const [row] = await scratch.sql<{ n: number; sum: number }[]>`
          SELECT count(*)::int AS n, coalesce(sum(amount_minor), 0)::int AS sum
          FROM refund WHERE order_id = ${orderId}`;
        expect(result.second).toMatch(/^REFUND_EXCEEDS_ORDER/);
        expect(row).toEqual({ n: 1, sum: 600 });
      }, 30_000);

      it("two full refunds on two orders of one purchase both commit, their sum is the charge, and one more unit is refused", async () => {
        const { purchase, paymentId } = await committedPurchase([1_000, 2_000]);
        const [a, b] = purchase.orderIds;
        const result = await race(
          { orderId: a ?? "", amountMinor: 1_000 },
          { orderId: b ?? "", amountMinor: 2_000 },
          { purchaseId: purchase.purchaseId, paymentId },
        );
        const [row] = await scratch.sql<{ sum: number }[]>`
          SELECT coalesce(sum(amount_minor), 0)::int AS sum
          FROM refund WHERE purchase_id = ${purchase.purchaseId}`;
        const more = await rolledBack(scratch.sql, (tx) =>
          pgFailure(tx, (sp) =>
            refundInsert(sp, {
              paymentId,
              orderId: b ?? "",
              purchaseId: purchase.purchaseId,
              amountMinor: 1,
            }),
          ),
        );
        expect(result.second).toBe("inserted");
        expect(row?.sum).toBe(3_000);
        expect(more.raised).toBe("REFUND_EXCEEDS_ORDER");
      }, 30_000);
    });

    describe("paymentForOrder and paymentForPurchase", () => {
      it("every order of a purchase answers with the purchase's live payment, even beside a newer failed one; none before one exists; another purchase answers its own", async () => {
        const result = await rolledBack(scratch.sql, async (tx) => {
          const executor = runnerOf(tx);
          const purchase = await purchaseOf(tx, [1_000, 2_000, 3_000]);
          const other = await purchaseOf(tx, [4_000]);
          const none = await paymentForOrder(purchase.orderIds[0] ?? "", {
            executor,
          });
          const failed = await pay(tx, purchase, 6_000, { status: "pending" });
          await tx`UPDATE payment SET status = 'failed' WHERE id = ${failed}`;
          const afterFailure = await paymentForPurchase(purchase.purchaseId, {
            executor,
          });
          const live = await pay(tx, purchase, 6_000);
          // A newer ended attempt does not hide the live payment.
          await tx`
            INSERT INTO payment (purchase_id, provider, status, amount_minor, currency_code,
                                 livemode, created_at)
            VALUES (${purchase.purchaseId}, 'stripe', 'failed', 6000, 'PLN', false,
                    now() + interval '1 minute')`;
          const otherPayment = await pay(tx, other, 4_000);
          const perOrder = [];
          for (const orderId of purchase.orderIds) {
            perOrder.push(await paymentForOrder(orderId, { executor }));
          }
          const ofOther = await paymentForOrder(other.orderIds[0] ?? "", {
            executor,
          });
          return {
            none,
            failed,
            afterFailure,
            live,
            perOrder,
            otherPayment,
            ofOther,
          };
        });
        expect(result.none).toBeNull();
        expect(result.afterFailure).toMatchObject({
          paymentId: result.failed,
          status: "failed",
        });
        for (const record of result.perOrder) {
          expect(record).toMatchObject({
            paymentId: result.live,
            status: "captured",
            amountMinor: 6_000,
            amountCapturedMinor: 6_000,
            amountRefundedMinor: 0,
            currency: "PLN",
            livemode: false,
          });
          expect(record?.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
        }
        expect(result.ofOther?.paymentId).toBe(result.otherPayment);
      });
    });
  },
);

/** The introspection snapshot: `db:check`'s catalogue facts plus every column's type and nullability. */
async function introspect(sql: Sql | Tx): Promise<CatalogueSnapshot> {
  const columns = await sql<{ k: string; v: string }[]>`
    SELECT c.relname || '.' || a.attname AS k,
           format_type(a.atttypid, a.atttypmod) || CASE WHEN a.attnotnull THEN ' not null' ELSE '' END AS v
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v') AND a.attnum > 0 AND NOT a.attisdropped
    ORDER BY 1`;
  return {
    ...(await readCatalogue(sql)),
    columns: Object.fromEntries(columns.map((row) => [row.k, row.v])),
  };
}

/** Rows as plain objects (a driver result carries extra properties). */
function plain(rows: readonly object[]): object[] {
  return rows.map((row) => ({ ...row }));
}

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
  `spec 013 AC-48 — backfill and rollback${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let rb: ScratchDatabase;

    /** Runs the real runner with the cross-suite migrate lock held, as `scratchDatabase` does. */
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
      try {
        await locked(() => runner(rb.url, ["--down", "--to", BEFORE]));
        return "rolled back";
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    }

    beforeAll(async () => {
      rb = await scratchDatabase(server.url as string, "paypur_rb");
    }, 600_000);

    afterAll(async () => {
      await rb.drop();
    });

    it("0017_payments_a7.sql is byte-identical (item 2: not edited)", () => {
      const bytes = readFileSync(resolve(MIGRATIONS, "0017_payments_a7.sql"));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(A7_SHA256);
      expect(THIS_VERSION > "0017").toBe(true);
    });

    it(
      "backfill over demo orders with no payment and over test-mode one-order payments and refunds; up, down, up",
      async () => {
        const after = await introspect(rb.sql);
        // Down on an empty payment table, then data in the shape before this migration.
        expect(await down()).toBe("rolled back");
        const before = await introspect(rb.sql);
        const seeded = await rb.sql.begin(async (tx) => {
          const parents = await orderParents(tx);
          const demoA = await insertPlacedOrder(tx, {
            ...parents,
            mode: "demo",
          });
          const demoB = await insertPlacedOrder(tx, {
            ...parents,
            mode: "demo",
          });
          const paid = await insertPlacedOrder(tx, {
            ...parents,
            mode: "test",
            totalMinor: 20_900,
          });
          const [payment] = await tx<{ id: string }[]>`
            INSERT INTO payment (order_id, provider, provider_ref, status, method, amount_minor,
                                 currency_code, livemode, capture_method, amount_captured_minor,
                                 captured_at, updated_at)
            VALUES (${paid}, 'stripe', 'pi_backfill', 'captured', 'card', 20900, 'PLN', false,
                    'automatic', 20900, now(), now() - interval '3 days')
            RETURNING id`;
          await tx`
            INSERT INTO refund (payment_id, provider_ref, amount_minor, currency_code, reason,
                                status, requested_by, succeeded_at)
            VALUES (${payment?.id ?? ""}, 're_backfill', 900, 'PLN', 'quality', 'succeeded',
                    'system:payments', now())`;
          const [failedPaid] = await tx<{ id: string }[]>`
            INSERT INTO payment (order_id, provider, status, amount_minor, currency_code, livemode)
            VALUES (${paid}, 'stripe', 'failed', 20900, 'PLN', false) RETURNING id`;
          return {
            demo: [demoA, demoB],
            paid,
            paymentId: payment?.id ?? "",
            failedId: failedPaid?.id ?? "",
          };
        });
        const stamps = await rb.sql<{ id: string; updated_at: string }[]>`
          SELECT id, updated_at::text FROM payment ORDER BY id`;
        const refundStamps = await rb.sql<{ id: string; updated_at: string }[]>`
          SELECT id, updated_at::text FROM refund ORDER BY id`;

        await locked(() => runner(rb.url));
        const backfilled = await rb.sql<{ id: string; same: boolean }[]>`
          SELECT p.id, p.purchase_id = o.purchase_id AS same
          FROM payment p JOIN "order" o ON o.id = ${seeded.paid} ORDER BY p.id`;
        const refunds = await rb.sql<
          { order_id: string; same_purchase: boolean }[]
        >`
          SELECT r.order_id, r.purchase_id = p.purchase_id AS same_purchase
          FROM refund r JOIN payment p ON p.id = r.payment_id`;
        const [column] = await rb.sql<{ n: number }[]>`
          SELECT count(*)::int AS n FROM information_schema.columns
          WHERE table_name = 'payment' AND column_name = 'order_id'`;
        const [demoPayments] = await rb.sql<{ n: number }[]>`
          SELECT count(*)::int AS n FROM payment p JOIN "order" o ON o.purchase_id = p.purchase_id
          WHERE o.id IN ${rb.sql(seeded.demo)}`;
        expect(backfilled).toHaveLength(2);
        expect(backfilled.every((row) => row.same)).toBe(true);
        expect(plain(refunds)).toEqual([
          { order_id: seeded.paid, same_purchase: true },
        ]);
        expect(column?.n).toBe(0);
        expect(demoPayments?.n).toBe(0);
        expect(
          plain(
            await rb.sql`SELECT id, updated_at::text FROM payment ORDER BY id`,
          ),
        ).toEqual(plain(stamps));
        expect(
          plain(
            await rb.sql`SELECT id, updated_at::text FROM refund ORDER BY id`,
          ),
        ).toEqual(plain(refundStamps));
        expect(await introspect(rb.sql)).toEqual(after);

        // Down with test-mode one-order payments: each gets its order back.
        expect(await down()).toBe("rolled back");
        const restored = await rb.sql<{ id: string; order_id: string }[]>`
          SELECT id, order_id FROM payment ORDER BY id`;
        expect(restored.map((row) => row.order_id)).toEqual([
          seeded.paid,
          seeded.paid,
        ]);
        expect(await introspect(rb.sql)).toEqual(before);

        await locked(() => runner(rb.url));
        expect(await introspect(rb.sql)).toEqual(after);

        // db:check's connected half: column drift, RLS coverage, the money pair, the snapshot.
        const result = await liveCheck(
          rb.sql,
          committedMirror,
          readSnapshot(resolve(REPO_ROOT, SNAPSHOT_FILE)),
          recipientEmailViolations,
        );
        expect(result.problems).toEqual([]);
        expect(result.ok).toBe(true);
      },
      RUNNER_TIMEOUT_MS,
    );

    it(
      "PAYMENT_PURCHASE_ROLLBACK_BLOCKED with a live payment, and with a payment for a two-order purchase; nothing changes",
      async () => {
        const live = await rb.sql.begin(async (tx) => {
          const purchase = await purchaseOf(tx, [5_000], { mode: "live" });
          return pay(tx, purchase, 5_000, { livemode: true });
        });
        const catalogue = await introspect(rb.sql);
        const counts = await rowCounts(rb.sql);
        const withLive = await down();
        expect(withLive).toContain("PAYMENT_PURCHASE_ROLLBACK_BLOCKED");
        expect(await introspect(rb.sql)).toEqual(catalogue);
        expect(await rowCounts(rb.sql)).toEqual(counts);
        await rb.sql`DELETE FROM payment WHERE id = ${live}`;

        await rb.sql.begin(async (tx) => {
          const purchase = await purchaseOf(tx, [1_000, 2_000]);
          await pay(tx, purchase, 3_000);
        });
        const counts2 = await rowCounts(rb.sql);
        const withBasket = await down();
        expect(withBasket).toContain("PAYMENT_PURCHASE_ROLLBACK_BLOCKED");
        expect(await introspect(rb.sql)).toEqual(catalogue);
        expect(await rowCounts(rb.sql)).toEqual(counts2);
      },
      RUNNER_TIMEOUT_MS,
    );
  },
);
