/**
 * Spec 013's lifecycle, cancel and production half, on a disposable PG16 and the in-memory
 * `FakePaymentProvider` (spec 013 §5.2 "Cancellation", "Production start on the delivery
 * morning"; spec 002 §14 A10; AC-15, AC-44, AC-45 of spec 013 and AC-52 to AC-54 of spec 002 /
 * T-15, T-44, T-45, T-52, T-53, T-54; TASK-258).
 *
 * No Stripe account exists (spec 013 §14 item 12): every case drives the fake provider, which
 * makes no network call. Cases that pay commit on their own purchase, because `startPayment`,
 * reconcile and the refund path each run their own transactions. The production-start job reads
 * every `paid` order of the database, so its cases assert per order, on delivery dates no other
 * case uses, with clocks that never reach the cancel cases' date (2027-12-24).
 */
import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PAYMENT_METHODS } from "@/config/payment-methods";
import {
  dispatchOutbox,
  transition,
  type HandlerRegistry,
  type OrderExecutor,
} from "@/modules/orders";
import {
  cancelOrder,
  paymentsOutboxHandler,
  PRODUCTION_START_ACTOR,
  productionStartAt,
  refundCancelledOrder,
  runProductionStart,
  startProduction,
} from "@/modules/payments";
import type { RefundReason } from "@/modules/payments/events";
import { FakePaymentProvider } from "@/modules/payments/fake";
import {
  startPayment,
  sweepPayments,
  syncFromProvider,
  type LifecycleDeps,
  type PaymentTransaction,
} from "@/modules/payments/lifecycle";
import type { MethodSources } from "@/modules/payments/methods";
import {
  providerFailure,
  type PaymentProvider,
} from "@/modules/payments/provider";

import {
  A6_TRANSITIONS,
  A10_TRANSITIONS,
  SET_E,
} from "../fixtures/order-machine.ts";
import { insertPlacedOrder, walkOrderTo } from "../fixtures/order-state.ts";
import { base, country, customer, partner, recipient } from "./support/rows.ts";
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
import { readCatalogue } from "../../scripts/db-check-live.ts";

const server = await probeLocalServer();

const T0 = new Date("2026-10-16T08:00:00.000Z");
/** The cancel cases' delivery date: no production-start clock in this file reaches it. */
const FAR_DATE = "2027-12-24";

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const FORWARD = readdirSync(resolve(REPO_ROOT, "db/migrations"))
  .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
  .filter((name) => !name.endsWith(".down.sql"))
  .sort();
const A10_FILE =
  FORWARD.find((name) => /^\d{4}_cancel_window_a10\.sql$/.test(name)) ?? "";
const A10_VERSION = A10_FILE.slice(0, 4);
const BEFORE_A10 = (
  FORWARD.filter((name) => name.slice(0, 4) < A10_VERSION).at(-1) ?? "0000"
).slice(0, 4);
const RUNNER_TIMEOUT_MS = 180_000;

/** Every launch method on, as the founder's admin flip would make it. */
const METHODS_ON: MethodSources = {
  enabledFlags: new Set([
    "payments.method.card",
    "payments.method.apple-pay",
    "payments.method.google-pay",
  ]),
  registry: PAYMENT_METHODS.map((method) => ({
    ...method,
    available: method.id !== "blik",
    ...(method.id === "blik" ? {} : { processor: "stripe" as const }),
  })),
};

let fakes = 0;
function newFake(): FakePaymentProvider {
  fakes += 1;
  return new FakePaymentProvider({
    now: () => T0,
    namespace: `cx${String(fakes)}`,
  });
}

interface Alert {
  readonly alert: string;
  readonly fields: Readonly<Record<string, unknown>>;
}

interface Purchase {
  readonly purchaseId: string;
  readonly orderIds: readonly string[];
}

interface Paid extends Purchase {
  readonly paymentId: string;
  readonly fake: FakePaymentProvider;
}

interface EventRow {
  readonly seq: number;
  readonly type: string;
  readonly actor: string;
  readonly from_status: string | null;
  readonly to_status: string | null;
  readonly payload: Record<string, unknown>;
}

const ADMIN = `admin:${randomUUID()}`;
const PARTNER = `partner:${randomUUID()}`;
const EXPIRY = "system:routing.no_partner_expiry";

/** Rows as plain objects (a driver result carries extra properties). */
function plain<T extends object>(rows: readonly T[]): T[] {
  return rows.map((row) => ({ ...row }));
}

describe.skipIf(server.url === undefined)(
  `spec 013 lifecycle, cancel and production half${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "cancel");
    }, 600_000);

    afterAll(async () => {
      await scratch.drop();
    });

    const transactionOf =
      (): PaymentTransaction =>
      <T>(fn: (executor: OrderExecutor) => Promise<T>) =>
        scratch.sql.begin((tx) => fn(runnerOf(tx))) as Promise<T>;

    function depsOf(
      provider: PaymentProvider,
      options: { alerts?: Alert[]; clock?: () => Date } = {},
    ): LifecycleDeps {
      const alerts = options.alerts ?? [];
      return {
        provider,
        transaction: transactionOf(),
        now: options.clock ?? (() => T0),
        alert: (alert, fields) => {
          alerts.push({ alert, fields });
        },
        methodSources: () => Promise.resolve(METHODS_ON),
      };
    }

    /** A committed purchase of `totals.length` placed orders (PLN), delivered on `deliveryDate`. */
    async function purchaseOf(
      totals: readonly number[],
      options: {
        mode?: "demo" | "test" | "live";
        deliveryDate?: string;
        cityZone?: string;
      } = {},
    ): Promise<Purchase> {
      return scratch.sql.begin(async (tx) => {
        await base(tx);
        const customerId = await customer(tx);
        const recipientId = await recipient(tx, customerId);
        const mode = options.mode ?? "test";
        const total = totals.reduce((a, b) => a + b, 0);
        const [row] = await tx<{ id: string }[]>`
          INSERT INTO purchase (mode, buyer_currency_code, total_minor, locale_code, customer_id)
          VALUES (${mode}, 'PLN', ${total}, 'en', ${customerId})
          RETURNING id`;
        const purchaseId = row?.id ?? "";
        const countryId = await country(tx, "PL");
        let cityId: string | null = null;
        if (options.cityZone !== undefined) {
          const [city] = await tx<{ id: string }[]>`
            INSERT INTO city (country_id, iana_zone) VALUES (${countryId}, ${options.cityZone})
            RETURNING id`;
          cityId = city?.id ?? null;
        }
        const orderIds: string[] = [];
        for (const totalMinor of totals) {
          const orderId = await insertPlacedOrder(tx, {
            customerId,
            recipientId,
            countryId,
            mode,
            totalMinor,
            purchaseId,
          });
          await tx`UPDATE "order"
                   SET buyer_snapshot = '{"name": "Test Buyer", "countryIso2": "GB"}'::jsonb,
                       delivery_date = ${options.deliveryDate ?? FAR_DATE}::date,
                       destination_city_id = ${cityId}
                   WHERE id = ${orderId}`;
          orderIds.push(orderId);
        }
        return { purchaseId, orderIds };
      });
    }

    /** A `test` purchase paid on the fake: every order `paid_unrouted`, the payment `captured`. */
    async function paidPurchase(
      totals: readonly number[],
      options: { deliveryDate?: string } = {},
    ): Promise<Paid> {
      const fake = newFake();
      const purchase = await purchaseOf(totals, options);
      const started = await startPayment(purchase.purchaseId, depsOf(fake));
      if (started.kind !== "started") throw new Error(started.kind);
      await fake.simulateSuccess(started.intentRef);
      const synced = await syncFromProvider(purchase.purchaseId, depsOf(fake));
      if (synced.outcome !== "captured") throw new Error(synced.outcome);
      return { ...purchase, paymentId: started.paymentId, fake };
    }

    async function walk(orderId: string, target: string): Promise<void> {
      await scratch.sql.begin((tx) => walkOrderTo(tx, orderId, target));
    }

    async function status(orderId: string): Promise<string> {
      const [row] = await scratch.sql<{ status: string }[]>`
        SELECT status FROM "order" WHERE id = ${orderId}`;
      return row?.status ?? "";
    }

    async function events(orderId: string): Promise<EventRow[]> {
      return plain(
        await scratch.sql<EventRow[]>`
          SELECT seq, type, actor, from_status, to_status, payload FROM order_event
          WHERE order_id = ${orderId} ORDER BY seq`,
      );
    }

    async function outboxRows(orderId: string): Promise<number> {
      const [row] = await scratch.sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM outbox WHERE order_id = ${orderId}`;
      return row?.n ?? -1;
    }

    async function refundsOf(orderId: string) {
      return plain(
        await scratch.sql<
          {
            id: string;
            order_id: string;
            amount_minor: string;
            currency_code: string;
            reason: string;
            status: string;
            requested_by: string;
          }[]
        >`SELECT id, order_id, amount_minor, currency_code, reason, status, requested_by
          FROM refund WHERE order_id = ${orderId} ORDER BY created_at, id`,
      );
    }

    async function refundedOnPayment(paymentId: string): Promise<number> {
      const [row] = await scratch.sql<{ n: string }[]>`
        SELECT amount_refunded_minor AS n FROM payment WHERE id = ${paymentId}`;
      return Number(row?.n ?? -1);
    }

    /** Delivers every pending outbox row of `orderId`: `payments` real, `routing` a stub. */
    async function deliver(
      orderId: string,
      deps: LifecycleDeps,
    ): Promise<void> {
      const handlers: HandlerRegistry = {
        payments: paymentsOutboxHandler(deps),
        routing: () => Promise.resolve(),
      };
      for (let run = 0; run < 10; run += 1) {
        const counts = await dispatchOutbox({
          handlers,
          transaction: transactionOf(),
          orderId,
        });
        if (counts.claimed === 0) return;
      }
    }

    const callsOf = (fake: FakePaymentProvider, method: string) =>
      fake.calls.filter((call) => call.method === method);

    /** `cancelOrder` in a committed transaction of its own on the scratch database. */
    const cancel = (orderId: string, actor: string, reason: RefundReason) =>
      scratch.sql.begin((tx) =>
        cancelOrder(orderId, actor, reason, { executor: runnerOf(tx) }),
      );

    /** `startProduction` in a committed transaction of its own, at `at`. */
    const produce = (orderId: string, at: string) =>
      scratch.sql.begin((tx) =>
        startProduction(orderId, PRODUCTION_START_ACTOR, {
          executor: runnerOf(tx),
          now: () => new Date(at),
        }),
      );

    // -----------------------------------------------------------------------------------------
    // AC-15 / T-15
    // -----------------------------------------------------------------------------------------

    describe("cancelOrder and the refund on cancel (AC-15, T-15)", () => {
      const E_CAPTURED = SET_E.filter((state) => state !== "authorised");
      const E_ACTORS = [
        ["buyer", "buyer_cancel"],
        [ADMIN, "goodwill"],
        [EXPIRY, "no_partner"],
      ] as const;

      for (const state of E_CAPTURED) {
        for (const [actor, reason] of E_ACTORS) {
          it(`from ${state} by ${actor.split(":")[0] ?? actor} (${reason}): row 13, one refund of the order's total with the reason, then row 32 with the status left cancelled; no provider.cancel`, async () => {
            const paid = await paidPurchase([18_900]);
            const orderId = paid.orderIds[0] ?? "";
            await walk(orderId, state);
            const before = await events(orderId);

            const result = await cancel(orderId, actor, reason);
            expect(result).toMatchObject({
              kind: "cancelled",
              fromStatus: state,
            });
            await deliver(orderId, depsOf(paid.fake));

            const added = (await events(orderId)).slice(before.length);
            const refunds = await refundsOf(orderId);
            expect(refunds).toHaveLength(1);
            const refundId = refunds[0]?.id ?? "";
            const money = {
              mode: "test",
              refund_id: refundId,
              amount_minor: 18_900,
              currency_code: "PLN",
              reason,
            };
            expect(
              added.map((e) => [
                e.type,
                e.actor,
                e.from_status,
                e.to_status,
                e.payload,
              ]),
            ).toEqual([
              [
                "order.cancelled",
                actor,
                state,
                "cancelled",
                { mode: "test", reason },
              ],
              ["order.refund_requested", "system:payments", null, null, money],
              [
                "order.refunded_full",
                "system:payments",
                "cancelled",
                "cancelled",
                money,
              ],
            ]);
            expect(refunds[0]).toMatchObject({
              order_id: orderId,
              amount_minor: "18900",
              currency_code: "PLN",
              reason,
              status: "succeeded",
              requested_by: "system:payments",
            });
            expect(await status(orderId)).toBe("cancelled");
            expect(callsOf(paid.fake, "refund").map((c) => c.key)).toEqual([
              refundId,
            ]);
            expect(callsOf(paid.fake, "cancel")).toEqual([]);
            expect(await refundedOnPayment(paid.paymentId)).toBe(18_900);
          });
        }
      }

      it("from authorised (no money taken at launch): row 13 applies, and nothing is refunded or called", async () => {
        const fake = newFake();
        const purchase = await purchaseOf([18_900]);
        const orderId = purchase.orderIds[0] ?? "";
        await walk(orderId, "authorised");
        const result = await cancel(orderId, "buyer", "buyer_cancel");
        expect(result).toMatchObject({
          kind: "cancelled",
          fromStatus: "authorised",
        });
        await deliver(orderId, depsOf(fake));
        expect(await refundsOf(orderId)).toEqual([]);
        expect(fake.calls).toEqual([]);
      });

      for (const [actor, reason] of E_ACTORS) {
        it(`a three-order purchase, order 2 cancelled by ${actor.split(":")[0] ?? actor}: one refund naming order 2 for its own remaining balance; orders 1 and 3 get no event, refund or outbox row`, async () => {
          const paid = await paidPurchase([10_000, 12_500, 9_900]);
          const [first = "", second = "", third = ""] = paid.orderIds;
          for (const orderId of paid.orderIds) await walk(orderId, "routed");
          // Order 2 already had 2 500 back: its remaining balance is 10 000, the purchase's 29 900.
          await scratch.sql.begin(async (tx) => {
            await tx`
              INSERT INTO refund (payment_id, order_id, purchase_id, amount_minor, currency_code,
                                  reason, status, requested_by, provider_ref, succeeded_at)
              VALUES (${paid.paymentId}, ${second}, ${paid.purchaseId}, 2500, 'PLN', 'goodwill',
                      'succeeded', ${ADMIN}, ${`re_prior_${randomUUID()}`}, now())`;
            await tx`UPDATE payment SET amount_refunded_minor = 2500 WHERE id = ${paid.paymentId}`;
          });
          const othersBefore = await Promise.all(
            [first, third].map(async (id) => ({
              events: await events(id),
              outbox: await outboxRows(id),
            })),
          );

          await cancel(second, actor, reason);
          for (const orderId of paid.orderIds) {
            await deliver(orderId, depsOf(paid.fake));
          }

          const refunds = await refundsOf(second);
          expect(
            refunds.map((r) => [r.amount_minor, r.reason, r.status]),
          ).toEqual([
            ["2500", "goodwill", "succeeded"],
            ["10000", reason, "succeeded"],
          ]);
          expect(await refundsOf(first)).toEqual([]);
          expect(await refundsOf(third)).toEqual([]);
          expect(
            await Promise.all(
              [first, third].map(async (id) => ({
                events: await events(id),
                outbox: await outboxRows(id),
              })),
            ),
          ).toEqual(othersBefore);
          expect(await status(second)).toBe("cancelled");
          expect(await refundedOnPayment(paid.paymentId)).toBe(12_500);
          expect(callsOf(paid.fake, "cancel")).toEqual([]);
        });
      }

      for (const state of ["accepted", "paid"] as const) {
        it(`from ${state}: an admin reason other than buyer_cancel is CANCEL_REASON_NOT_ALLOWED, system and partner are ORDER_ACTOR_NOT_ALLOWED, each writing nothing; then the buyer's cancel applies (row ${state === "accepted" ? "39" : "40"}) and is refunded`, async () => {
          const paid = await paidPurchase([15_000]);
          const orderId = paid.orderIds[0] ?? "";
          await walk(orderId, state);
          const before = {
            events: await events(orderId),
            outbox: await outboxRows(orderId),
          };
          const refusals = [
            await cancel(orderId, ADMIN, "goodwill"),
            await cancel(orderId, ADMIN, "no_partner"),
            await cancel(orderId, "buyer", "quality"),
            await cancel(orderId, EXPIRY, "no_partner"),
            await cancel(orderId, "system:payments", "buyer_cancel"),
            await cancel(orderId, PARTNER, "buyer_cancel"),
            await cancel(orderId, PARTNER, "goodwill"),
          ];
          expect(refusals).toEqual([
            { kind: "refused", code: "CANCEL_REASON_NOT_ALLOWED" },
            { kind: "refused", code: "CANCEL_REASON_NOT_ALLOWED" },
            { kind: "refused", code: "CANCEL_REASON_NOT_ALLOWED" },
            { kind: "refused", code: "ORDER_ACTOR_NOT_ALLOWED" },
            { kind: "refused", code: "ORDER_ACTOR_NOT_ALLOWED" },
            { kind: "refused", code: "ORDER_ACTOR_NOT_ALLOWED" },
            { kind: "refused", code: "ORDER_ACTOR_NOT_ALLOWED" },
          ]);
          expect({
            events: await events(orderId),
            outbox: await outboxRows(orderId),
          }).toEqual(before);
          expect(await status(orderId)).toBe(state);

          const applied = await cancel(orderId, "buyer", "buyer_cancel");
          expect(applied).toMatchObject({
            kind: "cancelled",
            fromStatus: state,
          });
          await deliver(orderId, depsOf(paid.fake));
          expect(
            (await refundsOf(orderId)).map((r) => [
              r.amount_minor,
              r.reason,
              r.status,
            ]),
          ).toEqual([["15000", "buyer_cancel", "succeeded"]]);
          expect((await events(orderId)).at(-1)).toMatchObject({
            type: "order.refunded_full",
            from_status: "cancelled",
            to_status: "cancelled",
          });
          expect(callsOf(paid.fake, "cancel")).toEqual([]);
        });

        it(`from ${state}: the admin's buyer_cancel applies too`, async () => {
          const paid = await paidPurchase([15_000]);
          const orderId = paid.orderIds[0] ?? "";
          await walk(orderId, state);
          expect(await cancel(orderId, ADMIN, "buyer_cancel")).toMatchObject({
            kind: "cancelled",
            fromStatus: state,
          });
          await deliver(orderId, depsOf(paid.fake));
          expect(await status(orderId)).toBe("cancelled");
          expect(await refundsOf(orderId)).toHaveLength(1);
        });
      }

      it("from in_production and later: ORDER_TRANSITION_ILLEGAL for buyer and admin, nothing written, no provider call", async () => {
        const paid = await paidPurchase([12_000, 13_000, 14_000, 15_000]);
        const states = [
          "in_production",
          "awaiting_buyer",
          "out_for_delivery",
          "delivered",
        ];
        for (const [index, state] of states.entries()) {
          await walk(paid.orderIds[index] ?? "", state);
        }
        const callsBefore = paid.fake.calls.length;
        for (const [index, state] of states.entries()) {
          const orderId = paid.orderIds[index] ?? "";
          const before = {
            events: await events(orderId),
            outbox: await outboxRows(orderId),
          };
          expect(
            [
              await cancel(orderId, "buyer", "buyer_cancel"),
              await cancel(orderId, ADMIN, "buyer_cancel"),
              await cancel(orderId, ADMIN, "quality"),
            ],
            state,
          ).toEqual([
            { kind: "refused", code: "ORDER_TRANSITION_ILLEGAL" },
            { kind: "refused", code: "ORDER_TRANSITION_ILLEGAL" },
            { kind: "refused", code: "ORDER_TRANSITION_ILLEGAL" },
          ]);
          expect(
            {
              events: await events(orderId),
              outbox: await outboxRows(orderId),
            },
            state,
          ).toEqual(before);
          await deliver(orderId, depsOf(paid.fake));
          expect(await refundsOf(orderId), state).toEqual([]);
        }
        expect(paid.fake.calls).toHaveLength(callsBefore);
      });

      it("an unknown order is ORDER_NOT_FOUND; a cancel in the caller's transaction rolls back with it", async () => {
        expect(await cancel(randomUUID(), "buyer", "buyer_cancel")).toEqual({
          kind: "refused",
          code: "ORDER_NOT_FOUND",
        });
        const purchase = await purchaseOf([9_000]);
        const orderId = purchase.orderIds[0] ?? "";
        await walk(orderId, "routed");
        const inside = await rolledBack(scratch.sql, (tx) =>
          cancelOrder(orderId, ADMIN, "goodwill", { executor: runnerOf(tx) }),
        );
        expect(inside).toMatchObject({ kind: "cancelled" });
        expect(await status(orderId)).toBe("routed");
      });

      it("the refund is made once: a redelivery finds nothing left; a provider that is down leaves it requested, and payments.sweep (d) sends the same key again", async () => {
        const paid = await paidPurchase([11_000]);
        const orderId = paid.orderIds[0] ?? "";
        await walk(orderId, "routed");
        let down = true;
        const flaky: PaymentProvider = {
          name: paid.fake.name,
          createIntent: (input) => paid.fake.createIntent(input),
          retrieveIntent: (ref) => paid.fake.retrieveIntent(ref),
          capture: (ref, key) => paid.fake.capture(ref, key),
          cancel: (ref, key) => paid.fake.cancel(ref, key),
          refund: (ref, amount, key, metadata) =>
            down
              ? Promise.resolve(providerFailure("unavailable"))
              : paid.fake.refund(ref, amount, key, metadata),
          verifyAndParseWebhook: (body, headers) =>
            paid.fake.verifyAndParseWebhook(body, headers),
          listEventsSince: (since) => paid.fake.listEventsSince(since),
        };
        await cancel(orderId, "buyer", "buyer_cancel");
        await deliver(orderId, depsOf(flaky));
        const requested = await refundsOf(orderId);
        expect(requested.map((r) => r.status)).toEqual(["requested"]);
        expect(await status(orderId)).toBe("cancelled");

        // A redelivery resumes the same row; still down, still requested.
        expect(await refundCancelledOrder(orderId, depsOf(flaky))).toEqual({
          kind: "resumed",
          refundId: requested[0]?.id,
          submitted: { kind: "retry" },
        });

        down = false;
        const now = new Date(Date.now() + 6 * 60_000);
        const counts = await sweepPayments(depsOf(flaky, { clock: () => now }));
        expect(counts.refundsRetried).toBeGreaterThanOrEqual(1);
        const settled = await refundsOf(orderId);
        expect(settled.map((r) => [r.id, r.status])).toEqual([
          [requested[0]?.id, "succeeded"],
        ]);
        expect(callsOf(paid.fake, "refund").map((c) => c.key)).toEqual([
          requested[0]?.id,
        ]);
        // Nothing left: a third run writes nothing and calls nothing.
        expect(await refundCancelledOrder(orderId, depsOf(flaky))).toEqual({
          kind: "nothing_to_refund",
        });
        expect(callsOf(paid.fake, "refund")).toHaveLength(1);
        expect(
          (await events(orderId)).filter(
            (e) => e.type === "order.refunded_full",
          ),
        ).toHaveLength(1);
      });
    });

    // -----------------------------------------------------------------------------------------
    // AC-44 / T-44
    // -----------------------------------------------------------------------------------------

    describe("production start on the delivery morning (AC-44, T-44)", () => {
      async function orderIn(
        target: string,
        options: {
          mode?: "demo" | "test" | "live";
          deliveryDate: string;
          cityZone?: string;
        },
      ): Promise<string> {
        const purchase = await purchaseOf([10_000], options);
        const orderId = purchase.orderIds[0] ?? "";
        await walk(orderId, target);
        return orderId;
      }

      const tick = (at: string) =>
        runProductionStart({
          transaction: transactionOf(),
          now: () => new Date(at),
        });

      const startEvents = async (orderId: string) =>
        (await events(orderId)).filter((e) => e.type === "order.in_production");

      it("25 Oct 2026, Warsaw: 05:59:59 local writes nothing; 06:00:00 writes one row 16 by system:payments.production_start; a second tick nothing; routed, cancelled and demo orders untouched; a live order starts too", async () => {
        const date = "2026-10-25";
        const paid = await orderIn("paid", { deliveryDate: date });
        const live = await orderIn("paid", {
          deliveryDate: date,
          mode: "live",
        });
        const routed = await orderIn("routed", { deliveryDate: date });
        const cancelled = await orderIn("paid", { deliveryDate: date });
        expect(await cancel(cancelled, "buyer", "buyer_cancel")).toMatchObject({
          kind: "cancelled",
        });
        const demo = await orderIn("paid", {
          deliveryDate: date,
          mode: "demo",
        });
        const untouched = [routed, cancelled, demo];
        const before = await Promise.all(untouched.map((id) => events(id)));

        // 06:00 CET on the night the clocks go back is 05:00Z.
        await tick("2026-10-25T04:59:59.000Z");
        expect(await status(paid)).toBe("paid");
        expect(await status(live)).toBe("paid");

        await tick("2026-10-25T05:00:00.000Z");
        for (const orderId of [paid, live]) {
          const started = await startEvents(orderId);
          expect(
            started.map((e) => [e.actor, e.from_status, e.to_status]),
          ).toEqual([[PRODUCTION_START_ACTOR, "paid", "in_production"]]);
          expect(await status(orderId)).toBe("in_production");
        }
        expect((await startEvents(paid))[0]?.payload).toEqual({ mode: "test" });
        expect((await startEvents(live))[0]?.payload).toEqual({ mode: "live" });

        await tick("2026-10-25T05:01:00.000Z");
        expect(await startEvents(paid)).toHaveLength(1);
        expect(await Promise.all(untouched.map((id) => events(id)))).toEqual(
          before,
        );
        expect(await status(demo)).toBe("paid");
      });

      it("the city's zone wins over the country's: a London city in a Warsaw country starts at 06:00 London", async () => {
        const orderId = await orderIn("paid", {
          deliveryDate: "2026-10-26",
          cityZone: "Europe/London",
        });
        await tick("2026-10-26T05:00:00.000Z"); // 06:00 Warsaw, 05:00 London
        expect(await status(orderId)).toBe("paid");
        await tick("2026-10-26T06:00:00.000Z"); // 06:00 London
        expect(await status(orderId)).toBe("in_production");
      });

      it("28 Mar 2027, Warsaw: the job starts at 04:00Z (06:00 CEST), not at 03:59:59Z", async () => {
        const orderId = await orderIn("paid", { deliveryDate: "2027-03-28" });
        await tick("2027-03-28T03:59:59.000Z");
        expect(await status(orderId)).toBe("paid");
        await tick("2027-03-28T04:00:00.000Z");
        expect(await status(orderId)).toBe("in_production");
      });

      it("startProduction: PRODUCTION_NOT_DUE on D-1 at 23:59 local, writing nothing; row 16 at 05:45 local on D", async () => {
        const orderId = await orderIn("paid", { deliveryDate: "2027-03-29" });
        const before = await events(orderId);
        // 23:59 CEST on 28 Mar is 21:59Z; 05:45 CEST on 29 Mar is 03:45Z.
        expect(await produce(orderId, "2027-03-28T21:59:00.000Z")).toEqual({
          kind: "refused",
          code: "PRODUCTION_NOT_DUE",
        });
        expect(await events(orderId)).toEqual(before);
        const started = await produce(orderId, "2027-03-29T03:45:00.000Z");
        expect(started).toMatchObject({ kind: "started" });
        expect(
          (await startEvents(orderId)).map((e) => [e.actor, e.to_status]),
        ).toEqual([[PRODUCTION_START_ACTOR, "in_production"]]);
        // Not paid any more: the engine's refusal, passed through.
        expect(await produce(orderId, "2027-03-29T03:46:00.000Z")).toEqual({
          kind: "refused",
          code: "ORDER_TRANSITION_ILLEGAL",
        });
        expect(await produce(randomUUID(), "2027-03-29T03:46:00.000Z")).toEqual(
          { kind: "refused", code: "ORDER_NOT_FOUND" },
        );
      });

      it("productionStartAt agrees with the job for the order the job reads", () => {
        expect(
          productionStartAt({
            deliveryDate: "2026-10-25",
            zone: "Europe/Warsaw",
          }).toISOString(),
        ).toBe("2026-10-25T05:00:00.000Z");
      });
    });

    // -----------------------------------------------------------------------------------------
    // AC-45 / T-45
    // -----------------------------------------------------------------------------------------

    describe("cancel against the production-start tick (AC-45, T-45)", () => {
      it("50 runs on a paid order at its instant: exactly one applies; a refund only when the cancel won; seq contiguous", async () => {
        const outcomes = { cancel: 0, start: 0 };
        for (let run = 0; run < 50; run += 1) {
          const paid = await paidPurchase([7_500], {
            deliveryDate: "2026-11-02",
          });
          const orderId = paid.orderIds[0] ?? "";
          await walk(orderId, "paid");
          const at = new Date(
            productionStartAt({
              deliveryDate: "2026-11-02",
              zone: "Europe/Warsaw",
            }).getTime() + 1_000,
          );
          const [cancelled] = await Promise.all([
            cancel(orderId, "buyer", "buyer_cancel"),
            runProductionStart({
              transaction: transactionOf(),
              now: () => at,
            }),
          ]);
          await deliver(orderId, depsOf(paid.fake));
          const log = await events(orderId);
          const started = log.filter((e) => e.type === "order.in_production");
          const refunds = await refundsOf(orderId);
          if (cancelled.kind === "cancelled") {
            outcomes.cancel += 1;
            expect(started, `run ${String(run)}`).toEqual([]);
            expect(await status(orderId)).toBe("cancelled");
            expect(refunds.map((r) => [r.amount_minor, r.status])).toEqual([
              ["7500", "succeeded"],
            ]);
          } else {
            outcomes.start += 1;
            expect(cancelled).toEqual({
              kind: "refused",
              code: "ORDER_TRANSITION_ILLEGAL",
            });
            expect(started, `run ${String(run)}`).toHaveLength(1);
            expect(await status(orderId)).toBe("in_production");
            expect(refunds).toEqual([]);
            expect(callsOf(paid.fake, "refund")).toEqual([]);
          }
          expect(log.map((e) => e.seq)).toEqual(
            log.map((_, index) => index + 1),
          );
        }
        expect(outcomes.cancel + outcomes.start).toBe(50);
      }, 300_000);
    });

    // -----------------------------------------------------------------------------------------
    // Spec 002 AC-52 / T-52
    // -----------------------------------------------------------------------------------------

    describe("rows 39 and 40 (spec 002 AC-52, T-52)", () => {
      it("both rows carry exactly allowed_actors = {buyer,admin}, and the table holds A6's rows plus these two", async () => {
        const rows = plain(
          await scratch.sql<
            { from_status: string; allowed_actors: string[] }[]
          >`
            SELECT from_status, allowed_actors FROM order_transition
            WHERE event = 'order.cancelled' AND from_status IN ('accepted', 'paid')
            ORDER BY from_status`,
        );
        expect(rows).toEqual([
          { from_status: "accepted", allowed_actors: ["buyer", "admin"] },
          { from_status: "paid", allowed_actors: ["buyer", "admin"] },
        ]);
        const [count] = await scratch.sql<{ n: number }[]>`
          SELECT count(*)::int AS n FROM order_transition`;
        expect(count?.n).toBe(A6_TRANSITIONS.length + A10_TRANSITIONS.length);
      });

      for (const state of ["accepted", "paid"] as const) {
        it(`from ${state}: transition by buyer and by admin applies; system and partner are ORDER_ACTOR_NOT_ALLOWED; then row 32 by system leaves the status cancelled`, async () => {
          const purchase = await purchaseOf([10_000]);
          const orderId = purchase.orderIds[0] ?? "";
          await walk(orderId, state);
          const payload = { mode: "test", reason: "buyer_cancel" };
          const outcome = async (actor: string) =>
            rolledBack(scratch.sql, async (tx) => {
              try {
                const written = await transition(
                  orderId,
                  "order.cancelled",
                  actor,
                  payload,
                  { executor: runnerOf(tx) },
                );
                return written.toStatus;
              } catch (error) {
                return (error as { code?: string }).code ?? String(error);
              }
            });
          expect([
            await outcome("buyer"),
            await outcome(ADMIN),
            await outcome("system:payments"),
            await outcome(PARTNER),
          ]).toEqual([
            "cancelled",
            "cancelled",
            "ORDER_ACTOR_NOT_ALLOWED",
            "ORDER_ACTOR_NOT_ALLOWED",
          ]);
          const after = await rolledBack(scratch.sql, async (tx) => {
            const executor = runnerOf(tx);
            await transition(orderId, "order.cancelled", "buyer", payload, {
              executor,
            });
            const refunded = await transition(
              orderId,
              "order.refunded_full",
              "system:payments",
              {
                mode: "test",
                refund_id: randomUUID(),
                amount_minor: 10_000,
                currency_code: "PLN",
                reason: "buyer_cancel",
              },
              { executor },
            );
            return [refunded.fromStatus, refunded.toStatus];
          });
          expect(after).toEqual(["cancelled", "cancelled"]);
        });
      }

      it("from in_production, awaiting_buyer and out_for_delivery the event is ORDER_TRANSITION_ILLEGAL, in the engine and in the database", async () => {
        for (const state of [
          "in_production",
          "awaiting_buyer",
          "out_for_delivery",
        ]) {
          const purchase = await purchaseOf([10_000]);
          const orderId = purchase.orderIds[0] ?? "";
          await walk(orderId, state);
          const code = await rolledBack(scratch.sql, async (tx) => {
            try {
              await transition(
                orderId,
                "order.cancelled",
                "buyer",
                { mode: "test", reason: "buyer_cancel" },
                { executor: runnerOf(tx) },
              );
              return "applied";
            } catch (error) {
              return (error as { code?: string }).code ?? String(error);
            }
          });
          expect(code, state).toBe("ORDER_TRANSITION_ILLEGAL");
          const raised = await rolledBack(scratch.sql, (tx) =>
            pgFailure(tx, async (sp) => {
              await sp`SELECT set_config('app.allow_status_write', 'on', true)`;
              await sp`SELECT set_config('app.transition_event', 'order.cancelled', true)`;
              await sp`UPDATE "order" SET status = 'cancelled' WHERE id = ${orderId}`;
            }),
          );
          expect(raised.raised, state).toBe("ORDER_TRANSITION_ILLEGAL");
        }
        // The database's own rule lets the two new rows through, with the flag and the event set.
        const purchase = await purchaseOf([10_000]);
        const orderId = purchase.orderIds[0] ?? "";
        await walk(orderId, "accepted");
        const updated = await rolledBack(scratch.sql, async (tx) => {
          await tx`SELECT set_config('app.allow_status_write', 'on', true)`;
          await tx`SELECT set_config('app.transition_event', 'order.cancelled', true)`;
          await tx`UPDATE "order" SET status = 'cancelled' WHERE id = ${orderId}`;
          const [row] = await tx<{ status: string }[]>`
            SELECT status FROM "order" WHERE id = ${orderId}`;
          return row?.status;
        });
        expect(updated).toBe("cancelled");
      });
    });

    // -----------------------------------------------------------------------------------------
    // Spec 002 AC-53 / T-53
    // -----------------------------------------------------------------------------------------

    describe("payout_adjustment (spec 002 AC-53, T-53)", () => {
      async function world(tx: Tx) {
        await base(tx);
        const countryId = await country(tx, "PL");
        const partnerId = await partner(tx, countryId, "demo");
        const buyer = await customer(tx);
        const orderId = await insertPlacedOrder(tx, {
          customerId: buyer,
          recipientId: await recipient(tx, buyer),
          countryId,
        });
        const [assignment] = await tx<{ id: string }[]>`
          INSERT INTO order_assignment (order_id, partner_id, sla_expires_at, attempt)
          VALUES (${orderId}, ${partnerId}, now() + interval '1 hour', 1) RETURNING id`;
        const [payout] = await tx<{ id: string }[]>`
          INSERT INTO payout (partner_id, period_start, period_end, total_minor, currency_code)
          VALUES (${partnerId}, DATE '2027-02-01', DATE '2027-02-07', 500, 'PLN') RETURNING id`;
        const [line] = await tx<{ id: string }[]>`
          INSERT INTO payout_line (payout_id, order_id, amount_minor, currency_code, kind)
          VALUES (${payout?.id ?? ""}, ${orderId}, 500, 'PLN', 'adjustment') RETURNING id`;
        return {
          orderId,
          partnerId,
          assignmentId: assignment?.id ?? "",
          lineId: line?.id ?? "",
        };
      }

      it("refuses each invalid row by its constraint name; a valid row is open by default; no *_minor column", async () => {
        const result = await rolledBack(scratch.sql, async (tx) => {
          const w = await world(tx);
          const insert = (
            sp: Tx,
            fields: {
              kind?: string;
              status?: string;
              resolvedAt?: string | null;
              lineId?: string | null;
            },
          ) => sp`
            INSERT INTO payout_adjustment (order_id, partner_id, assignment_id, kind, status,
                                           resolved_at, payout_line_id)
            VALUES (${w.orderId}, ${w.partnerId}, ${w.assignmentId},
                    ${fields.kind ?? "withdrawn_by_buyer_after_acceptance"},
                    ${fields.status ?? "open"}, ${fields.resolvedAt ?? null}::timestamptz,
                    ${fields.lineId ?? null})`;
          const failures = [
            await pgFailure(tx, (sp) => insert(sp, { kind: "goodwill" })),
            await pgFailure(tx, (sp) =>
              insert(sp, {
                status: "settled",
                resolvedAt: "2027-02-08T00:00:00Z",
              }),
            ),
            await pgFailure(tx, (sp) =>
              insert(sp, { resolvedAt: "2027-02-08T00:00:00Z" }),
            ),
            await pgFailure(tx, (sp) => insert(sp, { status: "waived" })),
          ];
          const [valid] = await tx<
            { status: string; resolved_at: Date | null }[]
          >`
            INSERT INTO payout_adjustment (order_id, partner_id, assignment_id, kind)
            VALUES (${w.orderId}, ${w.partnerId}, ${w.assignmentId},
                    'withdrawn_by_buyer_after_acceptance')
            RETURNING status, resolved_at`;
          const twice = await pgFailure(tx, (sp) => insert(sp, {}));
          const settled = await tx<{ status: string }[]>`
            UPDATE payout_adjustment SET status = 'settled', resolved_at = now(),
                                         payout_line_id = ${w.lineId}
            WHERE assignment_id = ${w.assignmentId} RETURNING status`;
          return {
            constraints: [...failures, twice].map((f) => f.constraint),
            valid: valid === undefined ? undefined : { ...valid },
            settled: settled.map((r) => r.status),
          };
        });
        expect(result.constraints).toEqual([
          "payout_adjustment_kind_check",
          "payout_adjustment_settled_line_check",
          "payout_adjustment_resolved_check",
          "payout_adjustment_resolved_check",
          "payout_adjustment_assignment_id_key",
        ]);
        expect(result.valid).toEqual({ status: "open", resolved_at: null });
        expect(result.settled).toEqual(["settled"]);
        const columns = await scratch.sql<{ column_name: string }[]>`
          SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'payout_adjustment'
          ORDER BY ordinal_position`;
        expect(columns.map((c) => c.column_name)).toEqual([
          "id",
          "order_id",
          "partner_id",
          "assignment_id",
          "kind",
          "status",
          "payout_line_id",
          "resolved_at",
          "created_at",
          "updated_at",
        ]);
        expect(columns.filter((c) => c.column_name.endsWith("_minor"))).toEqual(
          [],
        );
      });
    });
  },
);

// ---------------------------------------------------------------------------------------------
// Spec 002 AC-54 / T-54: the guarded rollback, on databases of their own
// ---------------------------------------------------------------------------------------------

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
  `spec 002 A10 rollback (AC-54, T-54)${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
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
      try {
        await locked(() => runner(db.url, ["--down", "--to", BEFORE_A10]));
        return "rolled back";
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    }

    beforeAll(async () => {
      // `fresh` stops just before A10: the runner is told A10 and every later migration are
      // applied, so it applies everything before them; then they are un-recorded and applied.
      fresh = await scratchDatabase(server.url as string, "a10_rb", {
        migrate: false,
      });
      used = await scratchDatabase(server.url as string, "a10_used");
    }, 600_000);

    afterAll(async () => {
      await fresh.drop();
      await used.drop();
    });

    it(
      "a fresh database: down succeeds, order_transition is back to A6's rows, the snapshot equals the one before A10; migrate again",
      async () => {
        expect(A10_VERSION > "0028").toBe(true);
        const later = FORWARD.filter((name) => name.slice(0, 4) >= A10_VERSION);
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
        const beforeA10 = await readCatalogue(fresh.sql);
        const [pre] = await fresh.sql<{ n: number }[]>`
          SELECT count(*)::int AS n FROM order_transition`;
        expect(pre?.n).toBe(A6_TRANSITIONS.length);
        await fresh.sql`DELETE FROM public.schema_migrations WHERE version >= ${A10_VERSION}`;
        await locked(() => runner(fresh.url));
        const withA10 = await readCatalogue(fresh.sql);
        expect(withA10).not.toEqual(beforeA10);

        expect(await down(fresh)).toBe("rolled back");
        const [count] = await fresh.sql<{ n: number }[]>`
          SELECT count(*)::int AS n FROM order_transition`;
        expect(count?.n).toBe(A6_TRANSITIONS.length);
        expect(await readCatalogue(fresh.sql)).toEqual(beforeA10);

        await locked(() => runner(fresh.url));
        expect(await readCatalogue(fresh.sql)).toEqual(withA10);
      },
      RUNNER_TIMEOUT_MS,
    );

    it(
      "A10_ROLLBACK_ROWS_IN_USE with a payout_adjustment row, then with an order cancelled from paid; nothing changes",
      async () => {
        const ids = await used.sql.begin(async (tx) => {
          await base(tx);
          const countryId = await country(tx, "PL");
          const partnerId = await partner(tx, countryId, "demo");
          const buyer = await customer(tx);
          const orderId = await insertPlacedOrder(tx, {
            customerId: buyer,
            recipientId: await recipient(tx, buyer),
            countryId,
          });
          const [assignment] = await tx<{ id: string }[]>`
            INSERT INTO order_assignment (order_id, partner_id, sla_expires_at, attempt)
            VALUES (${orderId}, ${partnerId}, now() + interval '1 hour', 1) RETURNING id`;
          const [adjustment] = await tx<{ id: string }[]>`
            INSERT INTO payout_adjustment (order_id, partner_id, assignment_id, kind)
            VALUES (${orderId}, ${partnerId}, ${assignment?.id ?? ""},
                    'withdrawn_by_buyer_after_acceptance') RETURNING id`;
          return { orderId, adjustmentId: adjustment?.id ?? "" };
        });
        const catalogue = await readCatalogue(used.sql);
        const counts = await rowCounts(used.sql);
        const withAdjustment = await down(used);
        expect(withAdjustment).toContain("A10_ROLLBACK_ROWS_IN_USE");
        expect(await readCatalogue(used.sql)).toEqual(catalogue);
        expect(await rowCounts(used.sql)).toEqual(counts);
        await used.sql`DELETE FROM payout_adjustment WHERE id = ${ids.adjustmentId}`;

        // A `paid` order cancelled by the buyer: row 40 is in the history.
        await used.sql.begin(async (tx) => {
          await walkOrderTo(tx, ids.orderId, "paid");
          await walkOrderTo(tx, ids.orderId, "cancelled");
        });
        const [last] = await used.sql<{ from_status: string; type: string }[]>`
          SELECT from_status, type FROM order_event WHERE order_id = ${ids.orderId}
          ORDER BY seq DESC LIMIT 1`;
        expect({ ...last }).toEqual({
          from_status: "paid",
          type: "order.cancelled",
        });
        const counts2 = await rowCounts(used.sql);
        const withCancel = await down(used);
        expect(withCancel).toContain("A10_ROLLBACK_ROWS_IN_USE");
        expect(await readCatalogue(used.sql)).toEqual(catalogue);
        expect(await rowCounts(used.sql)).toEqual(counts2);
      },
      RUNNER_TIMEOUT_MS,
    );
  },
);
