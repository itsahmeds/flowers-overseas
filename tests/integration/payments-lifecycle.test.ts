/**
 * Spec 013's payment lifecycle, payment half, on a disposable PG16 and the in-memory
 * `FakePaymentProvider` (spec 013 §5.2; §14 A-founder-2026-10-22 items 3 to 5; AC-11, AC-12,
 * AC-14 integration half, AC-17, AC-18, AC-49 / T-11, T-12, T-14, T-17, T-18, T-49; TASK-257).
 *
 * No Stripe account exists (§14 item 12): every case drives the fake provider, which makes no
 * network call. Each case commits on its own scratch purchase, because `startPayment` commits
 * the `pending` row before the provider call and reconcile runs in its own transaction.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PAYMENT_METHODS } from "@/config/payment-methods";
import {
  dispatchOutbox,
  notConfiguredHandler,
  type HandlerRegistry,
  type OrderExecutor,
  type OutboxDeliveryEvent,
} from "@/modules/orders";
import { paymentForOrder } from "@/modules/payments";
import { FakePaymentProvider } from "@/modules/payments/fake";
import {
  reconcile,
  startPayment,
  sweepPayments,
  syncFromProvider,
  type LifecycleDeps,
  type PaymentTransaction,
} from "@/modules/payments/lifecycle";
import type { MethodSources } from "@/modules/payments/methods";
import type {
  CreateIntentInput,
  PaymentProvider,
  ProviderIntent,
} from "@/modules/payments/provider";

import { insertPlacedOrder, walkOrderTo } from "../fixtures/order-state.ts";
import { base, country, customer, recipient } from "./support/rows.ts";
import {
  probeLocalServer,
  scratchDatabase,
  type ScratchDatabase,
} from "./support/scratch-db.ts";
import { runnerOf, sqlText } from "./support/sql-runner.ts";

const server = await probeLocalServer();

const T0 = new Date("2026-10-16T08:00:00.000Z");

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
/** A fake whose references no other fake in this database shares. */
function newFake(options: { livemode?: boolean } = {}): FakePaymentProvider {
  fakes += 1;
  return new FakePaymentProvider({
    now: () => T0,
    namespace: `lc${String(fakes)}`,
    ...(options.livemode === undefined ? {} : { livemode: options.livemode }),
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

describe.skipIf(server.url === undefined)(
  `spec 013 lifecycle, payment half${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "lifecycle");
    }, 600_000);

    afterAll(async () => {
      await scratch.drop();
    });

    /** A committed transaction on the scratch database, as the engine's executor. */
    function transactionOf(
      wrap: (executor: OrderExecutor) => OrderExecutor = (e) => e,
    ): PaymentTransaction {
      return <T>(fn: (executor: OrderExecutor) => Promise<T>) =>
        scratch.sql.begin((tx) => fn(wrap(runnerOf(tx)))) as Promise<T>;
    }

    function depsOf(
      provider: PaymentProvider,
      options: {
        clock?: () => Date;
        alerts?: Alert[];
        wrap?: (executor: OrderExecutor) => OrderExecutor;
      } = {},
    ): LifecycleDeps {
      const alerts = options.alerts ?? [];
      return {
        provider,
        transaction: transactionOf(options.wrap),
        now: options.clock ?? (() => T0),
        alert: (alert, fields) => {
          alerts.push({ alert, fields });
        },
        methodSources: () => Promise.resolve(METHODS_ON),
      };
    }

    /** A committed `test` purchase of `totals.length` orders (PLN), to `destinations` in turn. */
    async function purchaseOf(
      totals: readonly number[],
      options: {
        mode?: "test" | "live";
        destinations?: readonly string[];
        createdAt?: Date;
      } = {},
    ): Promise<Purchase> {
      return scratch.sql.begin(async (tx) => {
        await base(tx);
        const customerId = await customer(tx);
        const recipientId = await recipient(tx, customerId);
        const mode = options.mode ?? "test";
        const total = totals.reduce((a, b) => a + b, 0);
        const [row] = await tx<{ id: string }[]>`
          INSERT INTO purchase (mode, buyer_currency_code, total_minor, locale_code, customer_id,
                                created_at)
          VALUES (${mode}, 'PLN', ${total}, 'en', ${customerId}, ${options.createdAt ?? T0})
          RETURNING id`;
        const purchaseId = row?.id ?? "";
        const orderIds: string[] = [];
        for (const [index, totalMinor] of totals.entries()) {
          const iso2 = options.destinations?.[index] ?? "PL";
          const countryId = await country(tx, iso2);
          const orderId = await insertPlacedOrder(tx, {
            customerId,
            recipientId,
            countryId,
            mode,
            totalMinor,
            purchaseId,
          });
          await tx`UPDATE "order"
                   SET buyer_snapshot = '{"name": "Test Buyer", "countryIso2": "GB"}'::jsonb
                   WHERE id = ${orderId}`;
          orderIds.push(orderId);
        }
        return { purchaseId, orderIds };
      });
    }

    async function statuses(purchase: Purchase): Promise<string[]> {
      const rows = await scratch.sql<{ status: string }[]>`
        SELECT status FROM "order" WHERE id IN ${scratch.sql(purchase.orderIds)}
        ORDER BY array_position(${scratch.sql.array([...purchase.orderIds])}::uuid[], id)`;
      return rows.map((row) => row.status);
    }

    async function events(orderId: string) {
      return scratch.sql<
        {
          seq: number;
          type: string;
          actor: string;
          to_status: string | null;
          payload: unknown;
        }[]
      >`SELECT seq, type, actor, to_status, payload FROM order_event
        WHERE order_id = ${orderId} ORDER BY seq`;
    }

    async function paymentRow(paymentId: string) {
      const [row] = await scratch.sql<
        {
          status: string;
          capture_method: string | null;
          captured_at: Date | null;
          amount_captured_minor: string;
          attempts: number;
          purchase_id: string;
        }[]
      >`SELECT status, capture_method, captured_at, amount_captured_minor, attempts, purchase_id
        FROM payment WHERE id = ${paymentId}`;
      return row;
    }

    /** Starts the purchase's payment on `provider`; fails the case if it did not start. */
    async function started(
      provider: FakePaymentProvider,
      purchase: Purchase,
      deps?: LifecycleDeps,
    ): Promise<{ paymentId: string; intentRef: string }> {
      const result = await startPayment(
        purchase.purchaseId,
        deps ?? depsOf(provider),
      );
      if (result.kind !== "started")
        throw new Error(`not started: ${result.kind}`);
      return { paymentId: result.paymentId, intentRef: result.intentRef };
    }

    describe("startPayment and syncFromProvider (AC-49, T-49)", () => {
      it("a three-order purchase to two destinations: the pending row is committed before the provider call; one intent, key pi:create:{paymentId}, the seven metadata keys", async () => {
        const fake = newFake();
        const purchase = await purchaseOf([10_000, 12_500, 9_900], {
          destinations: ["PL", "DE", "PL"],
        });
        let rowsAtCall = -1;
        let sent: CreateIntentInput | undefined;
        const spy: PaymentProvider = {
          ...fake,
          name: fake.name,
          createIntent: async (input) => {
            const [row] = await scratch.sql<{ n: number }[]>`
              SELECT count(*)::int AS n FROM payment
              WHERE purchase_id = ${purchase.purchaseId} AND status = 'pending'`;
            rowsAtCall = row?.n ?? -1;
            sent = input;
            return fake.createIntent(input);
          },
          retrieveIntent: (ref) => fake.retrieveIntent(ref),
          capture: (ref, key) => fake.capture(ref, key),
          cancel: (ref, key) => fake.cancel(ref, key),
          refund: (ref, amount, key, metadata) =>
            fake.refund(ref, amount, key, metadata),
          verifyAndParseWebhook: (body, headers) =>
            fake.verifyAndParseWebhook(body, headers),
          listEventsSince: (since) => fake.listEventsSince(since),
        };
        const first = await startPayment(purchase.purchaseId, depsOf(spy));
        const second = await startPayment(purchase.purchaseId, depsOf(spy));
        const payments = await scratch.sql<
          { id: string; provider_ref: string | null }[]
        >`
          SELECT id, provider_ref FROM payment WHERE purchase_id = ${purchase.purchaseId}`;
        expect(first.kind).toBe("started");
        expect(second.kind).toBe("started");
        if (first.kind !== "started" || second.kind !== "started") return;
        expect(rowsAtCall).toBe(1);
        expect(payments).toHaveLength(1);
        expect(payments[0]?.provider_ref).toBe(first.intentRef);
        expect(second.intentRef).toBe(first.intentRef);
        expect(sent?.idempotencyKey).toBe(`pi:create:${first.paymentId}`);
        expect(sent?.amount).toEqual({ amountMinor: 32_400, currency: "PLN" });
        expect(sent?.captureMethod).toBe("automatic");
        // Basket order comes from the checkout's lines; these fixture orders have none, so the
        // distinct destinations are compared as a set.
        expect([...(sent?.metadata.destinationCountries ?? [])].sort()).toEqual(
          ["DE", "PL"],
        );
        expect(sent?.metadata).toEqual({
          purchaseId: purchase.purchaseId,
          paymentId: first.paymentId,
          orderCount: 3,
          destinationCountries: sent?.metadata.destinationCountries,
          buyerCountryDeclared: "GB",
          isFirstOrder: true,
          orderMode: "test",
        });
        expect(sent?.description.split(", ")).toHaveLength(3);
        expect(
          fake.calls.filter((call) => call.method === "createIntent"),
        ).toHaveLength(2);
      });

      it("sync with the intent succeeded writes row 2 on all three orders in one transaction, three routing deliveries, and a second sync writes nothing; paymentForOrder answers the same payment x3", async () => {
        const fake = newFake();
        const purchase = await purchaseOf([10_000, 12_500, 9_900], {
          destinations: ["PL", "DE", "PL"],
        });
        const { paymentId, intentRef } = await started(fake, purchase);
        await fake.simulateSuccess(intentRef);
        const clock = new Date("2026-10-16T08:03:17.000Z");
        const result = await syncFromProvider(
          purchase.purchaseId,
          depsOf(fake, { clock: () => clock }),
        );
        const xmins = await scratch.sql<{ x: string }[]>`
          SELECT DISTINCT xmin::text AS x FROM "order" WHERE purchase_id = ${purchase.purchaseId}`;
        const again = await syncFromProvider(purchase.purchaseId, depsOf(fake));
        const routed: { orderId: string; mode: string }[] = [];
        const handlers: HandlerRegistry = {
          routing: (event: OutboxDeliveryEvent) => {
            routed.push({ orderId: event.orderId, mode: event.mode });
            return Promise.resolve();
          },
          payments: notConfiguredHandler("payments"),
        };
        await dispatchOutbox({
          handlers,
          transaction: transactionOf(),
          orderId: purchase.orderIds[0] ?? "",
        });
        for (const orderId of purchase.orderIds.slice(1)) {
          await dispatchOutbox({
            handlers,
            transaction: transactionOf(),
            orderId,
          });
        }
        const payment = await paymentRow(paymentId);
        const perOrder = await Promise.all(
          purchase.orderIds.map((orderId) =>
            scratch.sql.begin((tx) =>
              paymentForOrder(orderId, { executor: runnerOf(tx) }),
            ),
          ),
        );
        expect(result.outcome).toBe("captured");
        expect(again.outcome).toBe("stale");
        expect(await statuses(purchase)).toEqual([
          "paid_unrouted",
          "paid_unrouted",
          "paid_unrouted",
        ]);
        expect(xmins).toHaveLength(1);
        for (const orderId of purchase.orderIds) {
          const log = await events(orderId);
          expect(log.map((e) => [e.seq, e.type, e.actor, e.to_status])).toEqual(
            [
              [1, "order.placed", expect.any(String), null],
              [2, "order.captured", "system:payments", "paid_unrouted"],
            ],
          );
          expect(log[1]?.payload).toEqual({
            mode: "test",
            payment_id: paymentId,
            provider_call: true,
          });
        }
        expect(payment).toMatchObject({
          status: "captured",
          capture_method: "automatic",
          amount_captured_minor: "32400",
        });
        expect(payment?.captured_at?.toISOString()).toBe(clock.toISOString());
        expect(routed.map((r) => r.orderId).sort()).toEqual(
          [...purchase.orderIds].sort(),
        );
        expect(routed.every((r) => r.mode === "test")).toBe(true);
        expect(new Set(perOrder.map((p) => p?.paymentId))).toEqual(
          new Set([paymentId]),
        );
      });

      it("a failure injected on the third order's transition leaves all three placed and the payment not captured", async () => {
        const fake = newFake();
        const purchase = await purchaseOf([1_000, 2_000, 3_000]);
        const { paymentId, intentRef } = await started(fake, purchase);
        await fake.simulateSuccess(intentRef);
        let writes = 0;
        const failing = (executor: OrderExecutor): OrderExecutor => ({
          async execute(query) {
            if (/UPDATE "order" SET status/.test(sqlText(query))) {
              writes += 1;
              if (writes === 3) throw new Error("injected: third order");
            }
            return executor.execute(query);
          },
        });
        await expect(
          syncFromProvider(
            purchase.purchaseId,
            depsOf(fake, { wrap: failing }),
          ),
        ).rejects.toThrow("injected: third order");
        expect(await statuses(purchase)).toEqual([
          "placed",
          "placed",
          "placed",
        ]);
        expect((await paymentRow(paymentId))?.status).toBe("pending");
      });

      it("with no method flag on, startPayment answers payments_unavailable and writes no payment (fail closed)", async () => {
        const fake = newFake();
        const purchase = await purchaseOf([5_000]);
        const result = await startPayment(purchase.purchaseId, {
          ...depsOf(fake),
          methodSources: () =>
            Promise.resolve({ enabledFlags: new Set<string>() }),
        });
        const [row] = await scratch.sql<{ n: number }[]>`
          SELECT count(*)::int AS n FROM payment WHERE purchase_id = ${purchase.purchaseId}`;
        expect(result).toEqual({ kind: "payments_unavailable" });
        expect(row?.n).toBe(0);
        expect(fake.calls).toEqual([]);
      });
    });

    describe("the reconcile table (AC-11, T-11), against one-order and three-order purchases", () => {
      for (const totals of [[18_900], [1_000, 2_000, 3_000]] as const) {
        const label = `${String(totals.length)}-order`;

        it(`${label}: a new decline appends one order.payment_attempt_failed per order; the same decline again appends none`, async () => {
          const fake = newFake();
          const purchase = await purchaseOf(totals);
          const { paymentId, intentRef } = await started(fake, purchase);
          await fake.simulateDecline(intentRef, "insufficient_funds");
          await syncFromProvider(purchase.purchaseId, depsOf(fake));
          await syncFromProvider(purchase.purchaseId, depsOf(fake));
          expect(await statuses(purchase)).toEqual(totals.map(() => "placed"));
          for (const orderId of purchase.orderIds) {
            const log = await events(orderId);
            expect(log.map((e) => [e.seq, e.type, e.actor])).toEqual([
              [1, "order.placed", expect.any(String)],
              [2, "order.payment_attempt_failed", "system:payments"],
            ]);
            expect(log[1]?.payload).toEqual({
              mode: "test",
              payment_id: paymentId,
              attempt: 1,
              decline_code: "insufficient_funds",
            });
          }
          expect((await paymentRow(paymentId))?.attempts).toBe(1);
        });

        it(`${label}: succeeded against abandoned orders writes no transition, captures, refunds each order its own total at once (one order.refund_requested each), and alerts once`, async () => {
          const fake = newFake();
          const purchase = await purchaseOf(totals);
          const { paymentId, intentRef } = await started(fake, purchase);
          await scratch.sql.begin(async (tx) => {
            for (const orderId of purchase.orderIds)
              await walkOrderTo(tx, orderId, "abandoned");
          });
          const before = await Promise.all(
            purchase.orderIds.map((id) => events(id)),
          );
          await fake.simulateSuccess(intentRef);
          const alerts: Alert[] = [];
          const result = await syncFromProvider(
            purchase.purchaseId,
            depsOf(fake, { alerts }),
          );
          const refunds = await scratch.sql<
            {
              order_id: string;
              amount_minor: string;
              reason: string;
              status: string;
            }[]
          >`
            SELECT order_id, amount_minor, reason, status FROM refund WHERE payment_id = ${paymentId}`;
          expect(result.outcome).toBe("captured_after_close");
          const after = await Promise.all(
            purchase.orderIds.map((id) => events(id)),
          );
          for (const [index, log] of after.entries()) {
            const prior = before[index] ?? [];
            expect(log.slice(0, prior.length)).toEqual(prior);
            expect(
              log.slice(prior.length).map((e) => [e.type, e.to_status]),
            ).toEqual([["order.refund_requested", null]]);
          }
          expect((await paymentRow(paymentId))?.status).toBe("captured");
          expect(
            fake.calls
              .filter((call) => call.method === "refund")
              .map((call) => call.key)
              .sort(),
          ).toEqual(
            (
              await scratch.sql<{ id: string }[]>`
                SELECT id FROM refund WHERE payment_id = ${paymentId}`
            )
              .map((r) => r.id)
              .sort(),
          );
          expect(
            refunds
              .map((r) => [
                r.order_id,
                Number(r.amount_minor),
                r.reason,
                r.status,
              ])
              .sort(),
          ).toEqual(
            purchase.orderIds
              .map((orderId, index) => [
                orderId,
                totals[index],
                "other",
                "succeeded",
              ])
              .sort(),
          );
          expect(alerts.map((a) => a.alert)).toEqual([
            "payment.captured_after_close",
          ]);
          expect(alerts[0]?.fields["purchase_id"]).toBe(purchase.purchaseId);
        });

        it(`${label}: requires_capture is captured once with capture:{paymentId}, alerts unexpected_hold, and ends in row 2 on every order, never row 1`, async () => {
          const fake = newFake();
          const purchase = await purchaseOf(totals);
          const { paymentId, intentRef } = await started(fake, purchase);
          await fake.simulateHold(intentRef);
          const alerts: Alert[] = [];
          const result = await syncFromProvider(
            purchase.purchaseId,
            depsOf(fake, { alerts }),
          );
          expect(result.outcome).toBe("captured");
          expect(fake.calls.filter((c) => c.method === "capture")).toEqual([
            { method: "capture", ref: intentRef, key: `capture:${paymentId}` },
          ]);
          expect(alerts.map((a) => a.alert)).toEqual([
            "payment.unexpected_hold",
          ]);
          expect(await statuses(purchase)).toEqual(
            totals.map(() => "paid_unrouted"),
          );
          const [authorised] = await scratch.sql<{ n: number }[]>`
            SELECT count(*)::int AS n FROM order_event
            WHERE order_id IN ${scratch.sql(purchase.orderIds)} AND to_status = 'authorised'`;
          expect(authorised?.n).toBe(0);
        });

        it(`${label}: an intent for another amount than the purchase total moves no order, cancels the intent, fails the payment, alerts with purchase_id`, async () => {
          const fake = newFake();
          const purchase = await purchaseOf(totals);
          const { paymentId, intentRef } = await started(fake, purchase);
          const retrieved = (await fake.retrieveIntent(
            intentRef,
          )) as ProviderIntent;
          const firstOrderOnly: ProviderIntent = {
            ...retrieved,
            status: "succeeded",
            amount: { amountMinor: totals[0], currency: "PLN" },
          };
          // A one-order purchase's total is its first order's: make the mismatch one unit.
          const intent =
            totals.length === 1
              ? {
                  ...firstOrderOnly,
                  amount: {
                    amountMinor: totals[0] + 1,
                    currency: "PLN" as const,
                  },
                }
              : firstOrderOnly;
          const alerts: Alert[] = [];
          const result = await reconcile(
            paymentId,
            intent,
            depsOf(fake, { alerts }),
          );
          expect(result.outcome).toBe("amount_mismatch");
          expect(await statuses(purchase)).toEqual(totals.map(() => "placed"));
          expect((await paymentRow(paymentId))?.status).toBe("failed");
          expect(fake.calls.filter((c) => c.method === "cancel")).toEqual([
            { method: "cancel", ref: intentRef, key: `void:${paymentId}` },
          ]);
          expect(alerts).toEqual([
            {
              alert: "payment.amount_mismatch",
              fields: {
                payment_id: paymentId,
                purchase_id: purchase.purchaseId,
              },
            },
          ]);
        });

        it(`${label}: processing and requires_action wait; a foreign canceled intent alerts and writes nothing`, async () => {
          const fake = newFake();
          const purchase = await purchaseOf(totals);
          const { paymentId, intentRef } = await started(fake, purchase);
          const retrieved = (await fake.retrieveIntent(
            intentRef,
          )) as ProviderIntent;
          const before = await Promise.all(
            purchase.orderIds.map((id) => events(id)),
          );
          const alerts: Alert[] = [];
          const deps = depsOf(fake, { alerts });
          const waiting = await reconcile(
            paymentId,
            { ...retrieved, status: "processing" },
            deps,
          );
          const action = await reconcile(
            paymentId,
            { ...retrieved, status: "requires_action" },
            deps,
          );
          const cancelled = await reconcile(
            paymentId,
            { ...retrieved, status: "canceled" },
            deps,
          );
          expect([waiting.outcome, action.outcome, cancelled.outcome]).toEqual([
            "waiting",
            "waiting",
            "unexpected_cancel",
          ]);
          expect(
            await Promise.all(purchase.orderIds.map((id) => events(id))),
          ).toEqual(before);
          expect(alerts.map((a) => a.alert)).toEqual([
            "payment.unexpected_cancel",
          ]);
        });
      }

      it("a foreign canceled intent on paid orders (routed, in_production) alerts and moves nothing (AC-18)", async () => {
        const fake = newFake();
        const purchase = await purchaseOf([1_000, 2_000]);
        const { paymentId, intentRef } = await started(fake, purchase);
        await fake.simulateSuccess(intentRef);
        await syncFromProvider(purchase.purchaseId, depsOf(fake));
        await scratch.sql.begin(async (tx) => {
          await walkOrderTo(tx, purchase.orderIds[0] ?? "", "routed");
          await walkOrderTo(tx, purchase.orderIds[1] ?? "", "in_production");
        });
        const before = await Promise.all(
          purchase.orderIds.map((id) => events(id)),
        );
        const retrieved = (await fake.retrieveIntent(
          intentRef,
        )) as ProviderIntent;
        const alerts: Alert[] = [];
        const result = await reconcile(
          paymentId,
          { ...retrieved, status: "canceled" },
          depsOf(fake, { alerts }),
        );
        expect(result.outcome).toBe("unexpected_cancel");
        expect(
          await Promise.all(purchase.orderIds.map((id) => events(id))),
        ).toEqual(before);
        expect(alerts.map((a) => a.alert)).toEqual([
          "payment.unexpected_cancel",
        ]);
      });
    });

    describe("the routing hand-off (AC-12, T-12)", () => {
      it("test and live orders entering paid_unrouted get one routing delivery each; with no routing handler the delivery retries and ends dead with outbox.dead", async () => {
        const fake = newFake({ livemode: false });
        const live = newFake({ livemode: true });
        const testPurchase = await purchaseOf([4_000]);
        const livePurchase = await purchaseOf([5_000], { mode: "live" });
        for (const [provider, purchase] of [
          [fake, testPurchase],
          [live, livePurchase],
        ] as const) {
          const { intentRef } = await started(
            provider,
            purchase,
            depsOf(provider),
          );
          await provider.simulateSuccess(intentRef);
          await syncFromProvider(purchase.purchaseId, depsOf(provider));
        }
        const routed: { orderId: string; mode: string }[] = [];
        await dispatchOutbox({
          handlers: {
            routing: (event) => {
              routed.push({ orderId: event.orderId, mode: event.mode });
              return Promise.resolve();
            },
            payments: notConfiguredHandler("payments"),
          },
          transaction: transactionOf(),
          orderId: testPurchase.orderIds[0] ?? "",
        });
        // The live order's delivery meets the stand-in handler: eight attempts, then dead.
        const alerts: Alert[] = [];
        for (let run = 0; run < 8; run += 1) {
          await dispatchOutbox({
            handlers: {
              routing: notConfiguredHandler("routing"),
              payments: notConfiguredHandler("payments"),
            },
            transaction: transactionOf(),
            orderId: livePurchase.orderIds[0] ?? "",
            retryBaseSeconds: 0,
            alert: (alert, fields) => {
              alerts.push({ alert, fields });
            },
          });
        }
        const [delivery] = await scratch.sql<
          { status: string; attempts: number; last_error: string }[]
        >`
          SELECT d.status, d.attempts, d.last_error FROM outbox_delivery d
          JOIN outbox o ON o.id = d.outbox_id
          WHERE o.order_id = ${livePurchase.orderIds[0] ?? ""} AND d.target = 'routing'`;
        expect(routed).toEqual([
          { orderId: testPurchase.orderIds[0], mode: "test" },
        ]);
        expect(delivery?.status).toBe("dead");
        expect(delivery?.attempts).toBe(8);
        expect(delivery?.last_error).toContain("ROUTING_NOT_CONFIGURED");
        expect(alerts.map((a) => a.alert)).toEqual(["outbox.dead"]);
      });
    });

    describe("payments.sweep (AC-17, AC-18, T-17, T-18)", () => {
      it("at 1 h 59 min nothing happens; at 2 h 0 min 1 s the intent is cancelled first and then every order is abandoned in one transaction", async () => {
        const fake = newFake();
        const purchase = await purchaseOf([1_000, 2_000, 3_000]);
        const { paymentId, intentRef } = await started(fake, purchase);
        const early = new Date(T0.getTime() + (119 * 60 + 0) * 1000);
        const late = new Date(T0.getTime() + (120 * 60 + 1) * 1000);
        await sweepPayments(depsOf(fake, { clock: () => early }));
        const afterEarly = await statuses(purchase);
        const cancelsEarly = fake.calls.filter(
          (c) => c.method === "cancel",
        ).length;
        await sweepPayments(depsOf(fake, { clock: () => late }));
        const xmins = await scratch.sql<{ x: string }[]>`
          SELECT DISTINCT xmin::text AS x FROM "order" WHERE purchase_id = ${purchase.purchaseId}`;
        expect(afterEarly).toEqual(["placed", "placed", "placed"]);
        expect(cancelsEarly).toBe(0);
        expect(fake.calls.filter((c) => c.method === "cancel")).toEqual([
          { method: "cancel", ref: intentRef, key: `void:${paymentId}` },
        ]);
        expect(await statuses(purchase)).toEqual([
          "abandoned",
          "abandoned",
          "abandoned",
        ]);
        expect(xmins).toHaveLength(1);
        // Never paid with, so no method: the row ends `failed`, not live.
        expect((await paymentRow(paymentId))?.status).toBe("failed");
        for (const orderId of purchase.orderIds) {
          const log = await events(orderId);
          expect(log.at(-1)).toMatchObject({
            type: "order.abandoned",
            actor: "system:payments.sweep",
            payload: { mode: "test", payment_id: paymentId },
          });
        }
      });

      it("after a failed attempt the sweep writes row 3 (payment_failed) on every order", async () => {
        const fake = newFake();
        const purchase = await purchaseOf([1_000, 2_000]);
        const { intentRef } = await started(fake, purchase);
        await fake.simulateDecline(intentRef, "card_declined");
        await syncFromProvider(purchase.purchaseId, depsOf(fake));
        const late = new Date(T0.getTime() + (120 * 60 + 1) * 1000);
        await sweepPayments(depsOf(fake, { clock: () => late }));
        expect(await statuses(purchase)).toEqual([
          "payment_failed",
          "payment_failed",
        ]);
      });

      it("processing stays placed; succeeded becomes paid_unrouted; a refused cancel stays placed", async () => {
        const late = new Date(T0.getTime() + (120 * 60 + 1) * 1000);
        const processingFake = newFake();
        const processing = await purchaseOf([1_000, 2_000]);
        const p = await started(processingFake, processing);
        const procIntent = (await processingFake.retrieveIntent(
          p.intentRef,
        )) as ProviderIntent;
        const processingProvider: PaymentProvider = Object.assign(
          Object.create(processingFake) as FakePaymentProvider,
          {
            retrieveIntent: () =>
              Promise.resolve({ ...procIntent, status: "processing" as const }),
          },
        );
        await sweepPayments(depsOf(processingProvider, { clock: () => late }));

        const paidFake = newFake();
        const paid = await purchaseOf([3_000, 4_000]);
        const q = await started(paidFake, paid);
        await paidFake.simulateSuccess(q.intentRef);
        await sweepPayments(depsOf(paidFake, { clock: () => late }));

        const refusingFake = newFake();
        const refusing = await purchaseOf([5_000]);
        await started(refusingFake, refusing);
        const refusingProvider: PaymentProvider = Object.assign(
          Object.create(refusingFake) as FakePaymentProvider,
          {
            cancel: () =>
              Promise.resolve({
                kind: "provider_failure" as const,
                failure: "state_conflict" as const,
              }),
          },
        );
        await sweepPayments(depsOf(refusingProvider, { clock: () => late }));

        expect(await statuses(processing)).toEqual(["placed", "placed"]);
        expect(await statuses(paid)).toEqual([
          "paid_unrouted",
          "paid_unrouted",
        ]);
        expect(await statuses(refusing)).toEqual(["placed"]);
      });

      it("AC-18: no hold branch: paid orders in E states and accepted, swept from 0 to 8 days, get no cancel, no lapse refund and no capture call", async () => {
        const fake = newFake();
        const purchase = await purchaseOf([1_000, 2_000, 3_000]);
        const { intentRef, paymentId } = await started(fake, purchase);
        await fake.simulateSuccess(intentRef);
        await syncFromProvider(purchase.purchaseId, depsOf(fake));
        await scratch.sql.begin(async (tx) => {
          await walkOrderTo(tx, purchase.orderIds[1] ?? "", "routed");
          await walkOrderTo(tx, purchase.orderIds[2] ?? "", "accepted");
        });
        for (let hours = 0; hours <= 8 * 24; hours += 6) {
          const at = new Date(T0.getTime() + hours * 3_600_000);
          await sweepPayments(depsOf(fake, { clock: () => at }));
        }
        const [counts] = await scratch.sql<
          { cancelled: number; lapse: number }[]
        >`
          SELECT (SELECT count(*)::int FROM order_event
                  WHERE order_id IN ${scratch.sql(purchase.orderIds)} AND type = 'order.cancelled') AS cancelled,
                 (SELECT count(*)::int FROM refund
                  WHERE payment_id = ${paymentId} AND reason = 'authorisation_lapsing') AS lapse`;
        expect(counts).toEqual({ cancelled: 0, lapse: 0 });
        expect(
          fake.calls.filter(
            (c) => c.method === "capture" || c.method === "cancel",
          ),
        ).toEqual([]);
        expect(await statuses(purchase)).toEqual([
          "paid_unrouted",
          "routed",
          "accepted",
        ]);
      });

      it("a pending payment that never reached the provider is failed after 15 minutes", async () => {
        const purchase = await purchaseOf([2_500]);
        const [row] = await scratch.sql<{ id: string }[]>`
          INSERT INTO payment (purchase_id, provider, status, amount_minor, currency_code, livemode,
                               created_at)
          VALUES (${purchase.purchaseId}, 'stripe', 'pending', 2500, 'PLN', false, ${T0})
          RETURNING id`;
        const fake = newFake();
        const at = new Date(T0.getTime() + 15 * 60_000);
        const counts = await sweepPayments(depsOf(fake, { clock: () => at }));
        expect(counts.failedPending).toBeGreaterThanOrEqual(1);
        expect((await paymentRow(row?.id ?? ""))?.status).toBe("failed");
      });
    });

    describe("AC-14, integration half", () => {
      it("across this suite, no system:payments event goes to authorised and no row 15 is written", async () => {
        const [row] = await scratch.sql<
          { authorised: number; row15: number }[]
        >`
          SELECT count(*) FILTER (WHERE to_status = 'authorised' AND actor LIKE 'system:payments%')::int AS authorised,
                 count(*) FILTER (WHERE from_status = 'accepted' AND to_status = 'payment_failed')::int AS row15
          FROM order_event`;
        expect(row).toEqual({ authorised: 0, row15: 0 });
      });
    });
  },
);
