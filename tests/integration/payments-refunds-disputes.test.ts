/**
 * Spec 013's refunds and disputes on a disposable PG16 and the in-memory `FakePaymentProvider`
 * (spec 013 §5.2 "Refunds", "Disputes", §14 A-founder-2026-10-22 items 6 and 7; spec 002 §14
 * A9.7; AC-24 refund and dispute sequences, AC-28 to AC-31 / T-24, T-28 to T-31; TASK-261).
 *
 * No Stripe account exists (spec 013 §14 item 12): every refund and dispute is the fake's, every
 * webhook is signed with the fake's secret and goes through the real inbox (`ingestWebhook`,
 * `processWebhook`). Each case pays its own purchase, so cases never share an order.
 */
import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PAYMENT_METHODS } from "@/config/payment-methods";
import type { OrderExecutor } from "@/modules/orders";
import {
  adminCancel,
  adminRefund,
  DISPUTABLE_STATES,
  REFUNDABLE_STATES,
  refund,
  succeededRefunds,
  type RefundResult,
} from "@/modules/payments";
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
  type ProviderRefund,
} from "@/modules/payments/provider";
import {
  ingestWebhook,
  processWebhook,
  replayWebhooks,
  type IngestDeps,
  type ProcessDeps,
} from "@/modules/payments/webhooks";

import {
  A6_STATES,
  A6_TRANSITIONS,
  A9_TRANSITIONS,
  A10_TRANSITIONS,
  SET_C_A9,
  SET_F,
  STATES,
  TRANSITIONS,
} from "../fixtures/order-machine.ts";
import { insertPlacedOrder, walkOrderTo } from "../fixtures/order-state.ts";
import { base, country, customer, recipient } from "./support/rows.ts";
import {
  MIGRATE_LOCK,
  probeLocalServer,
  runner,
  scratchDatabase,
  type ScratchDatabase,
} from "./support/scratch-db.ts";
import { runnerOf } from "./support/sql-runner.ts";

const server = await probeLocalServer();

const T0 = new Date("2026-10-16T08:00:00.000Z");
const FAR_DATE = "2027-12-24";
const ADMIN_ID = randomUUID();
const ADMIN = `admin:${ADMIN_ID}`;

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
function newFake(refunds: "sync" | "async" = "sync"): FakePaymentProvider {
  fakes += 1;
  return new FakePaymentProvider({
    now: () => T0,
    namespace: `rd${String(fakes)}`,
    refunds,
  });
}

interface Alert {
  readonly alert: string;
  readonly fields: Readonly<Record<string, unknown>>;
}

interface Paid {
  readonly purchaseId: string;
  readonly orderIds: readonly string[];
  readonly paymentId: string;
  readonly intentRef: string;
  readonly fake: FakePaymentProvider;
}

/** A provider that answers `refund` with `answer` instead of asking the fake. */
function refundingWith(
  fake: FakePaymentProvider,
  answer: (
    ...args: Parameters<PaymentProvider["refund"]>
  ) => ReturnType<PaymentProvider["refund"]>,
): PaymentProvider {
  return {
    name: fake.name,
    createIntent: (input) => fake.createIntent(input),
    retrieveIntent: (ref) => fake.retrieveIntent(ref),
    capture: (ref, key) => fake.capture(ref, key),
    cancel: (ref, key) => fake.cancel(ref, key),
    refund: answer,
    retrieveRefund: (ref) => fake.retrieveRefund(ref),
    listChargeRefunds: (ref) => fake.listChargeRefunds(ref),
    retrieveDispute: (ref) => fake.retrieveDispute(ref),
    verifyAndParseWebhook: (body, headers) =>
      fake.verifyAndParseWebhook(body, headers),
    listEventsSince: (since) => fake.listEventsSince(since),
  };
}

/** A tiny seeded generator, so the property case replays the same sequence every run. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 2 ** 32;
  };
}

describe.skipIf(server.url === undefined)(
  `spec 013 refunds and disputes${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "refunds");
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

    async function purchaseOf(totals: readonly number[]): Promise<{
      purchaseId: string;
      orderIds: string[];
    }> {
      return scratch.sql.begin(async (tx) => {
        await base(tx);
        const customerId = await customer(tx);
        const recipientId = await recipient(tx, customerId);
        const total = totals.reduce((a, b) => a + b, 0);
        const [row] = await tx<{ id: string }[]>`
          INSERT INTO purchase (mode, buyer_currency_code, total_minor, locale_code, customer_id)
          VALUES ('test', 'PLN', ${total}, 'en', ${customerId})
          RETURNING id`;
        const purchaseId = row?.id ?? "";
        const countryId = await country(tx, "PL");
        const orderIds: string[] = [];
        for (const totalMinor of totals) {
          const orderId = await insertPlacedOrder(tx, {
            customerId,
            recipientId,
            countryId,
            mode: "test",
            totalMinor,
            purchaseId,
          });
          await tx`UPDATE "order"
                   SET buyer_snapshot = '{"name": "Test Buyer", "countryIso2": "GB"}'::jsonb,
                       delivery_date = ${FAR_DATE}::date
                   WHERE id = ${orderId}`;
          orderIds.push(orderId);
        }
        return { purchaseId, orderIds };
      });
    }

    /** A `test` purchase paid on a fake: every order `paid_unrouted`, the payment `captured`. */
    async function paidPurchase(
      totals: readonly number[],
      refunds: "sync" | "async" = "sync",
    ): Promise<Paid> {
      const fake = newFake(refunds);
      const purchase = await purchaseOf(totals);
      const started = await startPayment(purchase.purchaseId, depsOf(fake));
      if (started.kind !== "started") throw new Error(started.kind);
      await fake.simulateSuccess(started.intentRef);
      const synced = await syncFromProvider(purchase.purchaseId, depsOf(fake));
      if (synced.outcome !== "captured") throw new Error(synced.outcome);
      return {
        ...purchase,
        paymentId: started.paymentId,
        intentRef: started.intentRef,
        fake,
      };
    }

    async function walk(orderId: string, target: string): Promise<void> {
      await scratch.sql.begin((tx) => walkOrderTo(tx, orderId, target));
    }

    async function status(orderId: string): Promise<string> {
      const [row] = await scratch.sql<{ status: string }[]>`
        SELECT status FROM "order" WHERE id = ${orderId}`;
      return row?.status ?? "";
    }

    interface EventRow {
      readonly type: string;
      readonly actor: string;
      readonly from_status: string | null;
      readonly to_status: string | null;
      readonly payload: Record<string, unknown>;
    }

    async function events(orderId: string): Promise<EventRow[]> {
      return (
        await scratch.sql<EventRow[]>`
          SELECT type, actor, from_status, to_status, payload FROM order_event
          WHERE order_id = ${orderId} ORDER BY seq`
      ).map((row) => ({ ...row }));
    }

    async function refundRows(orderId: string) {
      return (
        await scratch.sql<
          {
            id: string;
            order_id: string;
            purchase_id: string;
            amount_minor: string;
            status: string;
            requested_by: string;
            failure_code: string | null;
            succeeded_at: Date | null;
          }[]
        >`SELECT id, order_id, purchase_id, amount_minor, status, requested_by, failure_code,
                 succeeded_at
          FROM refund WHERE order_id = ${orderId} ORDER BY created_at, id`
      ).map((row) => ({ ...row }));
    }

    async function refundedOnPayment(paymentId: string): Promise<number> {
      const [row] = await scratch.sql<{ n: string }[]>`
        SELECT amount_refunded_minor AS n FROM payment WHERE id = ${paymentId}`;
      return Number(row?.n ?? -1);
    }

    const refundCalls = (fake: FakePaymentProvider) =>
      fake.calls.filter((call) => call.method === "refund").length;

    function money(amountMinor: number | bigint, currency = "PLN") {
      return { amountMinor, currency } as {
        amountMinor: number | bigint;
        currency: "PLN";
      };
    }

    function ingestOf(fake: FakePaymentProvider, enqueued: string[]) {
      const deps: IngestDeps = {
        provider: fake,
        livemode: false,
        transaction: transactionOf(),
        now: () => T0,
        enqueue: (inboxId) => {
          enqueued.push(inboxId);
          return Promise.resolve();
        },
      };
      return deps;
    }

    function processOf(fake: PaymentProvider, alerts: Alert[] = []) {
      const deps: ProcessDeps = {
        provider: fake,
        transaction: transactionOf(),
        now: () => T0,
        alert: (alert, fields) => {
          alerts.push({ alert, fields });
        },
        lifecycle: {
          transaction: transactionOf(),
          methodSources: () => Promise.resolve(METHODS_ON),
        },
      };
      return deps;
    }

    /** Signs, ingests and processes one new fake event about `ref`; returns its outcome. */
    async function webhook(
      fake: FakePaymentProvider,
      type: string,
      ref: string,
      alerts: Alert[] = [],
    ): Promise<string> {
      const event = await fake.simulateEvent(type, ref, T0);
      const rawBody = fake.eventBodyOf(event);
      const { headers } = fake.sign(rawBody, T0);
      const enqueued: string[] = [];
      const ingested = await ingestWebhook(
        rawBody,
        headers,
        ingestOf(fake, enqueued),
      );
      expect(ingested.status).toBe(200);
      const outcome = await processWebhook(
        enqueued[0] ?? "",
        processOf(fake, alerts),
      );
      return outcome.kind === "ignored"
        ? `ignored:${outcome.reason}`
        : outcome.kind;
    }

    const refundOf = (
      orderId: string,
      amountMinor: number | bigint,
      deps: LifecycleDeps,
      options: {
        actor?: string;
        reason?: "goodwill" | "other" | "quality";
        currency?: string;
      } = {},
    ): Promise<RefundResult> =>
      refund(
        {
          orderId,
          amount: money(amountMinor, options.currency),
          reason: options.reason ?? "goodwill",
          actor: options.actor ?? ADMIN,
        },
        deps,
      );

    // -----------------------------------------------------------------------------------------
    // The sets the code branches on equal the fixture's (spec 002 A6.3, A9.7)
    // -----------------------------------------------------------------------------------------

    it("set F and set C (A9.7, 16 states) in the code equal the transcribed machine", () => {
      expect([...REFUNDABLE_STATES].sort()).toEqual([...SET_F].sort());
      expect([...DISPUTABLE_STATES].sort()).toEqual([...SET_C_A9].sort());
      expect(DISPUTABLE_STATES).toHaveLength(16);
    });

    // -----------------------------------------------------------------------------------------
    // AC-28 / T-28
    // -----------------------------------------------------------------------------------------

    describe("refund refuses with a typed error, no provider call and no row (AC-28, T-28)", () => {
      it("a non-integer, zero, negative, unsafe or bigint-zero amount is REFUND_AMOUNT_INVALID", async () => {
        const paid = await paidPurchase([10_000]);
        const orderId = paid.orderIds[0] ?? "";
        await walk(orderId, "in_production");
        for (const amount of [
          0,
          -1,
          1.5,
          Number.NaN,
          Number.MAX_SAFE_INTEGER + 1,
          0n,
          -5n,
        ]) {
          expect(
            await refundOf(orderId, amount, depsOf(paid.fake)),
            String(amount),
          ).toEqual({ kind: "refused", code: "REFUND_AMOUNT_INVALID" });
        }
        expect(refundCalls(paid.fake)).toBe(0);
        expect(await refundRows(orderId)).toEqual([]);
      });

      it("a currency other than the payment's is CURRENCY_MISMATCH", async () => {
        const paid = await paidPurchase([10_000]);
        const orderId = paid.orderIds[0] ?? "";
        await walk(orderId, "in_production");
        expect(
          await refundOf(orderId, 1_000, depsOf(paid.fake), {
            currency: "EUR",
          }),
        ).toEqual({ kind: "refused", code: "CURRENCY_MISMATCH" });
        expect(refundCalls(paid.fake)).toBe(0);
        expect(await refundRows(orderId)).toEqual([]);
      });

      it("the named order's ceiling while the payment has headroom is REFUND_EXCEEDS_ORDER; one minor unit less is written", async () => {
        const paid = await paidPurchase([10_000, 12_000, 8_000]);
        const [first = ""] = paid.orderIds;
        await walk(first, "in_production");
        expect(await refundOf(first, 10_001, depsOf(paid.fake))).toMatchObject({
          kind: "refused",
          code: "REFUND_EXCEEDS_ORDER",
        });
        expect(refundCalls(paid.fake)).toBe(0);
        expect(await refundRows(first)).toEqual([]);
        // After a partial of 4 000, 6 001 passes the order's own total; 6 000 does not.
        expect(await refundOf(first, 4_000, depsOf(paid.fake))).toMatchObject({
          kind: "requested",
        });
        expect(await refundOf(first, 6_001, depsOf(paid.fake))).toMatchObject({
          kind: "refused",
          code: "REFUND_EXCEEDS_ORDER",
        });
        expect(await refundOf(first, 6_000, depsOf(paid.fake))).toMatchObject({
          kind: "requested",
        });
        expect(refundCalls(paid.fake)).toBe(2);
      });

      it("the purchase's captured ceiling is REFUND_EXCEEDS_CAPTURED even within the order's total", async () => {
        const paid = await paidPurchase([10_000, 12_000]);
        const [first = "", second = ""] = paid.orderIds;
        await walk(first, "in_production");
        await walk(second, "in_production");
        // A capture short of the purchase total (only reachable through a provider anomaly):
        // 15 000 captured for 22 000 of orders.
        await scratch.sql`UPDATE payment SET amount_captured_minor = 15000
                          WHERE id = ${paid.paymentId}`;
        expect(await refundOf(first, 10_000, depsOf(paid.fake))).toMatchObject({
          kind: "requested",
        });
        expect(await refundOf(second, 5_001, depsOf(paid.fake))).toMatchObject({
          kind: "refused",
          code: "REFUND_EXCEEDS_CAPTURED",
        });
        expect(await refundRows(second)).toEqual([]);
        expect(refundCalls(paid.fake)).toBe(1);
      });

      it("two concurrent refunds on one order that fit alone but not together: exactly one is written", async () => {
        const paid = await paidPurchase([10_000]);
        const orderId = paid.orderIds[0] ?? "";
        await walk(orderId, "in_production");
        // Both requests run inside open transactions at once: each holds its transaction open
        // until the other has finished its work too (or 400 ms have passed), so without the
        // payment lock both would read "nothing asked yet" before either commits.
        let arrived = 0;
        let release = (): void => undefined;
        const bothDone = new Promise<void>((resolve) => {
          release = resolve;
        });
        const overlapping: PaymentTransaction = <T>(
          fn: (executor: OrderExecutor) => Promise<T>,
        ) =>
          scratch.sql.begin(async (tx) => {
            const out = await fn(runnerOf(tx));
            arrived += 1;
            if (arrived >= 2) release();
            await Promise.race([
              bothDone,
              new Promise((resolve) => setTimeout(resolve, 400)),
            ]);
            return out;
          }) as Promise<T>;
        const deps = { ...depsOf(paid.fake), transaction: overlapping };
        const results = await Promise.all([
          refundOf(orderId, 6_000, deps),
          refundOf(orderId, 6_000, deps),
        ]);
        expect(results.map((r) => r.kind).sort()).toEqual([
          "refused",
          "requested",
        ]);
        expect(results.find((r) => r.kind === "refused")).toEqual({
          kind: "refused",
          code: "REFUND_EXCEEDS_ORDER",
        });
        expect(await refundRows(orderId)).toHaveLength(1);
        expect(refundCalls(paid.fake)).toBe(1);
      });

      for (const state of [
        "closed",
        "chargeback_open",
        "paid_unrouted",
        "refunded_full",
        "routed",
      ]) {
        it(`an order in ${state} is NOT_REFUNDABLE`, async () => {
          const paid = await paidPurchase([10_000]);
          const orderId = paid.orderIds[0] ?? "";
          await walk(orderId, state);
          expect(await refundOf(orderId, 1_000, depsOf(paid.fake))).toEqual({
            kind: "refused",
            code: "NOT_REFUNDABLE",
            status: state,
          });
          expect(refundCalls(paid.fake)).toBe(0);
          expect(await refundRows(orderId)).toEqual([]);
        });
      }

      it("an order with no captured payment is NOT_REFUNDABLE", async () => {
        const purchase = await purchaseOf([10_000]);
        const orderId = purchase.orderIds[0] ?? "";
        const fake = newFake();
        expect(await refundOf(orderId, 1_000, depsOf(fake))).toEqual({
          kind: "refused",
          code: "NOT_REFUNDABLE",
          status: "placed",
        });
        expect(refundCalls(fake)).toBe(0);
      });

      for (const state of ["cancelled", "cancelled_refunded"] as const) {
        it(`on ${state}, any amount but the order's remaining balance is REFUND_AMOUNT_NOT_BALANCE; the balance is refunded with row 32`, async () => {
          const paid = await paidPurchase([10_000, 7_000]);
          const [orderId = "", other = ""] = paid.orderIds;
          await walk(orderId, state);
          for (const amount of [5_000, 9_999, 10_001, 17_000]) {
            expect(
              await refundOf(orderId, amount, depsOf(paid.fake)),
              String(amount),
            ).toEqual({ kind: "refused", code: "REFUND_AMOUNT_NOT_BALANCE" });
          }
          expect(refundCalls(paid.fake)).toBe(0);
          expect(await refundRows(orderId)).toEqual([]);
          const before = await events(orderId);
          const otherBefore = await events(other);
          expect(
            await refundOf(orderId, 10_000, depsOf(paid.fake)),
          ).toMatchObject({
            kind: "requested",
            submitted: { kind: "succeeded" },
          });
          const added = (await events(orderId)).slice(before.length);
          expect(
            added.map((e) => [e.type, e.actor, e.from_status, e.to_status]),
          ).toEqual([
            ["order.refund_requested", ADMIN, state, state],
            ["order.refunded_full", "system:payments", state, state],
          ]);
          expect(await status(orderId)).toBe(state);
          expect(await events(other)).toEqual(otherBefore);
          expect(await refundedOnPayment(paid.paymentId)).toBe(10_000);
        });
      }

      it("the reconcile anomaly (abandoned, then captured): only system:payments or an admin, reason other, the order's whole balance; no order event on success", async () => {
        const fake = newFake();
        const purchase = await purchaseOf([10_000]);
        const orderId = purchase.orderIds[0] ?? "";
        const started = await startPayment(purchase.purchaseId, depsOf(fake));
        if (started.kind !== "started") throw new Error(started.kind);
        await walk(orderId, "abandoned");
        await fake.simulateSuccess(started.intentRef);
        // Reconcile's own anomaly refund is refused by the bank, so the balance is open again.
        const refusing = refundingWith(fake, (ref, amount) =>
          Promise.resolve({
            ref: `refused-${randomUUID()}`,
            intentRef: ref,
            status: "failed",
            amount: { ...amount },
          }),
        );
        const alerts: Alert[] = [];
        const synced = await syncFromProvider(
          purchase.purchaseId,
          depsOf(refusing, { alerts }),
        );
        expect(synced.outcome).toBe("captured_after_close");
        expect((await refundRows(orderId)).map((r) => r.status)).toEqual([
          "failed",
        ]);
        const calls = refundCalls(fake);
        expect(
          await refundOf(orderId, 10_000, depsOf(fake), { reason: "goodwill" }),
        ).toEqual({
          kind: "refused",
          code: "NOT_REFUNDABLE",
          status: "abandoned",
        });
        expect(
          await refundOf(orderId, 10_000, depsOf(fake), {
            actor: "buyer",
            reason: "other",
          }),
        ).toEqual({
          kind: "refused",
          code: "NOT_REFUNDABLE",
          status: "abandoned",
        });
        expect(
          await refundOf(orderId, 5_000, depsOf(fake), { reason: "other" }),
        ).toEqual({ kind: "refused", code: "REFUND_AMOUNT_NOT_BALANCE" });
        expect(refundCalls(fake)).toBe(calls);
        const before = await events(orderId);
        expect(
          await refundOf(orderId, 10_000, depsOf(fake), {
            actor: "system:payments",
            reason: "other",
          }),
        ).toMatchObject({
          kind: "requested",
          submitted: { kind: "succeeded" },
        });
        expect(
          (await events(orderId)).slice(before.length).map((e) => e.type),
        ).toEqual(["order.refund_requested"]);
        expect(await status(orderId)).toBe("abandoned");
        expect(await refundedOnPayment(started.paymentId)).toBe(10_000);
      });

      it("the signature has no destination: the input's keys are exactly orderId, amount, reason, actor, and the provider is asked for the payment's own intent", async () => {
        const paid = await paidPurchase([10_000]);
        const orderId = paid.orderIds[0] ?? "";
        await walk(orderId, "delivered");
        await refundOf(orderId, 2_500, depsOf(paid.fake));
        const call = paid.fake.calls.find((c) => c.method === "refund");
        expect(call?.ref).toBe(paid.intentRef);
        // The type half (no `destination` key on `RefundInput`) is `tests/unit/payments-types.test.ts`.
      });

      it("property: random refund sequences on a three-order purchase never take an order past its total or the purchase past captured", async () => {
        const totals = [10_000, 12_345, 7_655];
        const paid = await paidPurchase(totals);
        for (const id of paid.orderIds) await walk(id, "delivered");
        const random = seeded(20_261);
        const asked = [0, 0, 0];
        for (let step = 0; step < 40; step += 1) {
          const index = Math.floor(random() * 3);
          const orderId = paid.orderIds[index] ?? "";
          const total = totals[index] ?? 0;
          const amount = 1 + Math.floor(random() * (total * 0.6));
          if ((await status(orderId)) === "refunded_full") continue;
          const result = await refundOf(orderId, amount, depsOf(paid.fake));
          const fits = (asked[index] ?? 0) + amount <= total;
          expect(result.kind, `step ${String(step)}`).toBe(
            fits ? "requested" : "refused",
          );
          if (fits) asked[index] = (asked[index] ?? 0) + amount;
          for (const [i, id] of paid.orderIds.entries()) {
            const [sum] = await scratch.sql<{ n: string }[]>`
              SELECT coalesce(sum(amount_minor), 0) AS n FROM refund
              WHERE order_id = ${id} AND status IN ('requested', 'pending', 'succeeded')`;
            expect(Number(sum?.n)).toBe(asked[i]);
            expect(Number(sum?.n)).toBeLessThanOrEqual(totals[i] ?? 0);
          }
        }
        const refunded = await refundedOnPayment(paid.paymentId);
        expect(refunded).toBe(asked.reduce((a, b) => a + b, 0));
        expect(refunded).toBeLessThanOrEqual(30_000);
        for (const [i, id] of paid.orderIds.entries()) {
          expect(await status(id)).toBe(
            asked[i] === totals[i] ? "refunded_full" : "delivered",
          );
        }
      });
    });

    // -----------------------------------------------------------------------------------------
    // AC-29 / T-29
    // -----------------------------------------------------------------------------------------

    describe("the request, the settlement and its one event (AC-29, T-29)", () => {
      it("on a 3-order purchase: a partial on order 1 is row 30 on order 1 only; the rest is row 31 on order 1 only; amount_refunded_minor is the sum", async () => {
        const paid = await paidPurchase([10_000, 12_000, 8_000]);
        const [first = "", second = "", third = ""] = paid.orderIds;
        for (const id of paid.orderIds) await walk(id, "in_production");
        const others = [await events(second), await events(third)];
        const before = await events(first);

        const partial = await refundOf(first, 3_333, depsOf(paid.fake));
        expect(partial).toMatchObject({
          kind: "requested",
          submitted: { kind: "succeeded" },
        });
        const rest = await refundOf(first, 6_667, depsOf(paid.fake), {
          reason: "quality",
        });
        expect(rest).toMatchObject({ kind: "requested" });

        const rows = await refundRows(first);
        expect(
          rows.map((r) => [
            r.order_id,
            r.purchase_id,
            r.amount_minor,
            r.status,
            r.requested_by,
          ]),
        ).toEqual([
          [first, paid.purchaseId, "3333", "succeeded", ADMIN],
          [first, paid.purchaseId, "6667", "succeeded", ADMIN],
        ]);
        const fields = (r: (typeof rows)[number], reason: string) => ({
          mode: "test",
          refund_id: r.id,
          amount_minor: Number(r.amount_minor),
          currency_code: "PLN",
          reason,
        });
        const added = (await events(first)).slice(before.length);
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
            "order.refund_requested",
            ADMIN,
            "in_production",
            "in_production",
            fields(rows[0] ?? rows[1]!, "goodwill"),
          ],
          [
            "order.refunded_partial",
            "system:payments",
            "in_production",
            "in_production",
            fields(rows[0]!, "goodwill"),
          ],
          [
            "order.refund_requested",
            ADMIN,
            "in_production",
            "in_production",
            fields(rows[1]!, "quality"),
          ],
          [
            "order.refunded_full",
            "system:payments",
            "in_production",
            "refunded_full",
            fields(rows[1]!, "quality"),
          ],
        ]);
        expect(await status(first)).toBe("refunded_full");
        expect([await events(second), await events(third)]).toEqual(others);
        expect(await status(second)).toBe("in_production");
        expect(await refundedOnPayment(paid.paymentId)).toBe(10_000);
      });

      it("charge.refunded and refund.updated for one refund write one event, whichever comes first", async () => {
        for (const order of [
          ["refund.updated", "charge.refunded"],
          ["charge.refunded", "refund.updated"],
        ] as const) {
          const paid = await paidPurchase([10_000], "async");
          const orderId = paid.orderIds[0] ?? "";
          await walk(orderId, "in_production");
          const result = await refundOf(orderId, 4_000, depsOf(paid.fake));
          expect(result).toMatchObject({ submitted: { kind: "pending" } });
          const [row] = await refundRows(orderId);
          expect(row?.status).toBe("pending");
          const providerRef = (
            await scratch.sql<{ r: string }[]>`
              SELECT provider_ref AS r FROM refund WHERE id = ${row?.id ?? ""}`
          )[0]?.r;
          await paid.fake.simulateRefundOutcome(providerRef ?? "", "succeeded");
          const charge = await paid.fake.chargeRefOf(paid.intentRef);
          const outcomes: string[] = [];
          for (const type of order) {
            outcomes.push(
              await webhook(
                paid.fake,
                type,
                type === "charge.refunded" ? charge : (providerRef ?? ""),
              ),
            );
          }
          expect(outcomes).toEqual(["processed", "ignored:stale"]);
          const types = (await events(orderId)).map((e) => e.type);
          expect(
            types.filter((t) => t === "order.refunded_partial"),
          ).toHaveLength(1);
          expect(await refundedOnPayment(paid.paymentId)).toBe(4_000);
          expect((await refundRows(orderId))[0]?.status).toBe("succeeded");
        }
      });

      it("a crash after the provider made the refund but before we recorded it: payments.sweep resends the same key, and the provider makes one refund", async () => {
        const paid = await paidPurchase([10_000]);
        const orderId = paid.orderIds[0] ?? "";
        await walk(orderId, "delivered");
        let lost = true;
        const crashing = refundingWith(paid.fake, async (...args) => {
          const made = await paid.fake.refund(...args);
          if (lost) {
            lost = false;
            return providerFailure("unavailable");
          }
          return made;
        });
        const result = await refundOf(orderId, 2_000, depsOf(crashing));
        expect(result).toMatchObject({ submitted: { kind: "retry" } });
        expect((await refundRows(orderId))[0]?.status).toBe("requested");

        // `refund.created_at` is the database's clock: five minutes past it.
        const later = new Date(Date.now() + 6 * 60_000);
        const swept = await sweepPayments(
          depsOf(crashing, { clock: () => later }),
        );
        expect(swept.refundsRetried).toBeGreaterThanOrEqual(1);
        const rows = await refundRows(orderId);
        expect(rows.map((r) => r.status)).toEqual(["succeeded"]);
        const keys = paid.fake.calls
          .filter((c) => c.method === "refund")
          .map((c) => c.key);
        expect(keys).toEqual([rows[0]?.id, rows[0]?.id]);
        const made = await paid.fake.listChargeRefunds(
          await paid.fake.chargeRefOf(paid.intentRef),
        );
        expect(Array.isArray(made) ? made.length : -1).toBe(1);
        expect(await refundedOnPayment(paid.paymentId)).toBe(2_000);
        expect(
          (await events(orderId)).filter(
            (e) => e.type === "order.refunded_partial",
          ),
        ).toHaveLength(1);
      });

      it("refund.failed sets the row failed with its code and raises payment.refund_failed; no money moves and no order event", async () => {
        const paid = await paidPurchase([10_000], "async");
        const orderId = paid.orderIds[0] ?? "";
        await walk(orderId, "delivered");
        await refundOf(orderId, 3_000, depsOf(paid.fake));
        const [row] = await refundRows(orderId);
        const [{ r: ref = "" } = { r: "" }] = await scratch.sql<
          { r: string }[]
        >`
          SELECT provider_ref AS r FROM refund WHERE id = ${row?.id ?? ""}`;
        await paid.fake.simulateRefundOutcome(
          ref,
          "failed",
          "expired_or_canceled_card",
        );
        const alerts: Alert[] = [];
        const before = await events(orderId);
        expect(await webhook(paid.fake, "refund.failed", ref, alerts)).toBe(
          "processed",
        );
        expect(await refundRows(orderId)).toMatchObject([
          { status: "failed", failure_code: "expired_or_canceled_card" },
        ]);
        expect(alerts).toEqual([
          {
            alert: "payment.refund_failed",
            fields: {
              order_id: orderId,
              refund_id: row?.id,
              code: "expired_or_canceled_card",
            },
          },
        ]);
        expect(await events(orderId)).toEqual(before);
        expect(await refundedOnPayment(paid.paymentId)).toBe(0);
        // The money is back in reach: the whole total can be asked for again.
        expect(
          await refundOf(orderId, 10_000, depsOf(paid.fake)),
        ).toMatchObject({ kind: "requested" });
      });

      it("a success that settles after the order left the allowed set (closed) keeps the money fact, writes no event and raises payment.refund_state_mismatch", async () => {
        const paid = await paidPurchase([10_000], "async");
        const orderId = paid.orderIds[0] ?? "";
        await walk(orderId, "delivered");
        await refundOf(orderId, 1_500, depsOf(paid.fake));
        const [row] = await refundRows(orderId);
        const [{ r: ref = "" } = { r: "" }] = await scratch.sql<
          { r: string }[]
        >`
          SELECT provider_ref AS r FROM refund WHERE id = ${row?.id ?? ""}`;
        await walk(orderId, "closed");
        const before = await events(orderId);
        await paid.fake.simulateRefundOutcome(ref, "succeeded");
        const alerts: Alert[] = [];
        expect(await webhook(paid.fake, "refund.updated", ref, alerts)).toBe(
          "processed",
        );
        expect(await events(orderId)).toEqual(before);
        expect(await status(orderId)).toBe("closed");
        expect((await refundRows(orderId))[0]?.status).toBe("succeeded");
        expect(await refundedOnPayment(paid.paymentId)).toBe(1_500);
        expect(alerts).toEqual([
          {
            alert: "payment.refund_state_mismatch",
            fields: { order_id: orderId, refund_id: row?.id },
          },
        ]);
      });

      it("a refund whose create response was lost is matched by the refund id in its metadata", async () => {
        const paid = await paidPurchase([10_000], "async");
        const orderId = paid.orderIds[0] ?? "";
        await walk(orderId, "in_production");
        const lost = refundingWith(paid.fake, async (...args) => {
          await paid.fake.refund(...args);
          return providerFailure("unavailable");
        });
        await refundOf(orderId, 2_000, depsOf(lost));
        const [row] = await refundRows(orderId);
        expect(row?.status).toBe("requested");
        const made = (await paid.fake.listChargeRefunds(
          await paid.fake.chargeRefOf(paid.intentRef),
        )) as readonly ProviderRefund[];
        await paid.fake.simulateRefundOutcome(made[0]?.ref ?? "", "succeeded");
        expect(
          await webhook(paid.fake, "refund.updated", made[0]?.ref ?? ""),
        ).toBe("processed");
        expect(await refundRows(orderId)).toMatchObject([
          { id: row?.id, status: "succeeded" },
        ]);
        expect(await refundedOnPayment(paid.paymentId)).toBe(2_000);
      });

      it("a refund event about a refund we never asked for is ignored/unknown_object", async () => {
        const paid = await paidPurchase([10_000], "async");
        const made = await paid.fake.refund(
          paid.intentRef,
          money(500) as never,
          "outside-key",
          { orderId: randomUUID(), refundId: "not-a-uuid", reason: "other" },
        );
        expect(
          await webhook(
            paid.fake,
            "refund.created",
            (made as ProviderRefund).ref,
          ),
        ).toBe("ignored:unknown_object");
      });
    });

    // -----------------------------------------------------------------------------------------
    // AC-30 / T-30
    // -----------------------------------------------------------------------------------------

    describe("succeededRefunds (AC-30, T-30)", () => {
      it("an order with requested, pending, failed and two succeeded refunds returns exactly the two, with their amounts and dates", async () => {
        const paid = await paidPurchase([20_000]);
        const orderId = paid.orderIds[0] ?? "";
        await walk(orderId, "delivered");
        const t1 = new Date("2026-10-17T10:00:00.000Z");
        const t2 = new Date("2026-10-18T11:30:00.000Z");
        await refundOf(orderId, 1_000, depsOf(paid.fake, { clock: () => t1 }));
        await refundOf(orderId, 2_000, depsOf(paid.fake, { clock: () => t2 }));
        const answering = (status: "pending" | "failed") =>
          refundingWith(paid.fake, (ref, amount) =>
            Promise.resolve({
              ref: `${status}-${randomUUID()}`,
              intentRef: ref,
              status,
              amount: { ...amount },
            }),
          );
        await refundOf(orderId, 3_000, depsOf(answering("pending")));
        await refundOf(orderId, 4_000, depsOf(answering("failed")));
        await refundOf(
          orderId,
          5_000,
          depsOf(
            refundingWith(paid.fake, () =>
              Promise.resolve(providerFailure("unavailable")),
            ),
          ),
        );
        expect(
          (await refundRows(orderId)).map((r) => [r.amount_minor, r.status]),
        ).toEqual([
          ["1000", "succeeded"],
          ["2000", "succeeded"],
          ["3000", "pending"],
          ["4000", "failed"],
          ["5000", "requested"],
        ]);
        const read = await scratch.sql.begin((tx) =>
          succeededRefunds(orderId, { executor: runnerOf(tx) }),
        );
        expect(read).toEqual([
          { amount: { amountMinor: 1_000, currency: "PLN" }, succeededAt: t1 },
          { amount: { amountMinor: 2_000, currency: "PLN" }, succeededAt: t2 },
        ]);
      });
    });

    // -----------------------------------------------------------------------------------------
    // AC-31 / T-31
    // -----------------------------------------------------------------------------------------

    describe("disputes inside and outside set C (AC-31, T-31)", () => {
      async function disputesOf(paymentId: string) {
        return (
          await scratch.sql<
            {
              id: string;
              status: string;
              amount_minor: string;
              currency_code: string;
              reason: string;
              closed_at: Date | null;
            }[]
          >`SELECT id, status, amount_minor, currency_code, reason, closed_at
            FROM payment_dispute WHERE payment_id = ${paymentId}`
        ).map((row) => ({ ...row }));
      }

      for (const state of SET_C_A9) {
        it(`a dispute on a one-order purchase in ${state}: one dispute row, payment.dispute_opened, row 34`, async () => {
          const paid = await paidPurchase([9_000]);
          const orderId = paid.orderIds[0] ?? "";
          await walk(orderId, state);
          const ref = await paid.fake.simulateDispute(
            paid.intentRef,
            "fraudulent",
          );
          const alerts: Alert[] = [];
          expect(
            await webhook(paid.fake, "charge.dispute.created", ref, alerts),
          ).toBe("processed");
          const [dispute, ...more] = await disputesOf(paid.paymentId);
          expect(more).toEqual([]);
          expect(dispute).toMatchObject({
            status: "open",
            amount_minor: "9000",
            currency_code: "PLN",
            reason: "fraudulent",
            closed_at: null,
          });
          expect(alerts).toEqual([
            {
              alert: "payment.dispute_opened",
              fields: {
                payment_id: paid.paymentId,
                purchase_id: paid.purchaseId,
                dispute_id: dispute?.id,
              },
            },
          ]);
          const last = (await events(orderId)).at(-1);
          expect(last).toEqual({
            type: "order.chargeback_opened",
            actor: "system:payments",
            from_status: state,
            to_status: "chargeback_open",
            payload: {
              mode: "test",
              dispute_id: dispute?.id,
              amount_minor: 9_000,
              currency_code: "PLN",
            },
          });
          expect(await status(orderId)).toBe("chargeback_open");
        });
      }

      for (const state of ["cancelled", "cancelled_refunded"] as const) {
        it(`a dispute on ${state}: the dispute row, no order event, the status kept, payment.dispute_outside_machine`, async () => {
          const paid = await paidPurchase([9_000]);
          const orderId = paid.orderIds[0] ?? "";
          await walk(orderId, state);
          const before = await events(orderId);
          const ref = await paid.fake.simulateDispute(
            paid.intentRef,
            "general",
          );
          const alerts: Alert[] = [];
          expect(
            await webhook(paid.fake, "charge.dispute.created", ref, alerts),
          ).toBe("processed");
          const disputes = await disputesOf(paid.paymentId);
          expect(disputes).toHaveLength(1);
          expect(await events(orderId)).toEqual(before);
          expect(await status(orderId)).toBe(state);
          expect(alerts.map((a) => a.alert)).toEqual([
            "payment.dispute_opened",
            "payment.dispute_outside_machine",
          ]);
          expect(alerts[1]?.fields).toEqual({
            order_id: orderId,
            purchase_id: paid.purchaseId,
            payment_id: paid.paymentId,
            dispute_id: disputes[0]?.id,
          });
        });
      }

      for (const outcome of ["won", "lost"] as const) {
        it(`a three-order purchase in routed, in_production and cancelled: row 34 on two, one alert for the third; closed ${outcome} → row ${outcome === "won" ? 35 : 36} on the two`, async () => {
          const paid = await paidPurchase([5_000, 6_000, 7_000]);
          const [routed = "", making = "", cancelled = ""] = paid.orderIds;
          await walk(routed, "routed");
          await walk(making, "in_production");
          await walk(cancelled, "cancelled");
          const cancelledBefore = await events(cancelled);
          const ref = await paid.fake.simulateDispute(
            paid.intentRef,
            "product_not_received",
          );
          const alerts: Alert[] = [];
          expect(
            await webhook(paid.fake, "charge.dispute.created", ref, alerts),
          ).toBe("processed");
          const [dispute, ...more] = await disputesOf(paid.paymentId);
          expect(more).toEqual([]);
          expect(dispute?.amount_minor).toBe("18000");
          expect(await status(routed)).toBe("chargeback_open");
          expect(await status(making)).toBe("chargeback_open");
          expect(await status(cancelled)).toBe("cancelled");
          expect(
            alerts.filter((a) => a.alert === "payment.dispute_outside_machine"),
          ).toEqual([
            {
              alert: "payment.dispute_outside_machine",
              fields: {
                order_id: cancelled,
                purchase_id: paid.purchaseId,
                payment_id: paid.paymentId,
                dispute_id: dispute?.id,
              },
            },
          ]);

          await paid.fake.simulateDisputeOutcome(ref, outcome);
          const closing: Alert[] = [];
          expect(
            await webhook(paid.fake, "charge.dispute.closed", ref, closing),
          ).toBe("processed");
          const to = `chargeback_${outcome}`;
          for (const id of [routed, making]) {
            expect((await events(id)).at(-1)).toEqual({
              type: `order.chargeback_${outcome}`,
              actor: "system:payments",
              from_status: "chargeback_open",
              to_status: to,
              payload: { mode: "test", dispute_id: dispute?.id },
            });
            expect(await status(id)).toBe(to);
          }
          expect(await events(cancelled)).toEqual(cancelledBefore);
          expect(closing.map((a) => [a.alert, a.fields["order_id"]])).toEqual([
            ["payment.dispute_outside_machine", cancelled],
          ]);
          expect(await disputesOf(paid.paymentId)).toMatchObject([
            { id: dispute?.id, status: outcome },
          ]);
          expect(
            (await disputesOf(paid.paymentId))[0]?.closed_at,
          ).not.toBeNull();
        });
      }

      it("a dispute on an order we refunded in full (refunded_full is in C) opens the chargeback; a second delivery of created changes nothing", async () => {
        const paid = await paidPurchase([9_000]);
        const orderId = paid.orderIds[0] ?? "";
        await walk(orderId, "delivered");
        await refundOf(orderId, 9_000, depsOf(paid.fake));
        expect(await status(orderId)).toBe("refunded_full");
        const ref = await paid.fake.simulateDispute(
          paid.intentRef,
          "duplicate",
        );
        expect(await webhook(paid.fake, "charge.dispute.created", ref)).toBe(
          "processed",
        );
        expect(await status(orderId)).toBe("chargeback_open");
        const count = (await events(orderId)).length;
        expect(await webhook(paid.fake, "charge.dispute.created", ref)).toBe(
          "ignored:stale",
        );
        expect(await webhook(paid.fake, "charge.dispute.updated", ref)).toBe(
          "ignored:stale",
        );
        expect((await events(orderId)).length).toBe(count);
        expect(await disputesOf(paid.paymentId)).toHaveLength(1);
      });

      it("a dispute about an intent we never created is ignored/unknown_object", async () => {
        const stranger = newFake();
        const intent = await stranger.createIntent({
          amount: { amountMinor: 1_000, currency: "PLN" },
          captureMethod: "automatic",
          methodTypes: ["card"],
          metadata: {
            purchaseId: randomUUID(),
            paymentId: randomUUID(),
            orderCount: 1,
            destinationCountries: ["PL"],
            buyerCountryDeclared: "GB",
            isFirstOrder: true,
            orderMode: "test",
          },
          description: "stranger",
          idempotencyKey: "pi:create:stranger",
        });
        if ("kind" in intent) throw new Error("no intent");
        await stranger.simulateSuccess(intent.ref);
        const ref = await stranger.simulateDispute(intent.ref, "general");
        expect(await webhook(stranger, "charge.dispute.created", ref)).toBe(
          "ignored:unknown_object",
        );
      });
    });

    // -----------------------------------------------------------------------------------------
    // AC-24 / T-24, the refund and dispute sequences
    // -----------------------------------------------------------------------------------------

    describe("out of order equals in order (AC-24, T-24)", () => {
      it("refund.updated before charge.refunded: the same final rows as in order; the late one is ignored/stale", async () => {
        async function run(types: readonly string[]) {
          const paid = await paidPurchase([8_000, 4_000], "async");
          const [orderId = ""] = paid.orderIds;
          await walk(orderId, "in_production");
          await refundOf(orderId, 8_000, depsOf(paid.fake));
          const [row] = await refundRows(orderId);
          const [{ r: ref = "" } = { r: "" }] = await scratch.sql<
            { r: string }[]
          >`SELECT provider_ref AS r FROM refund WHERE id = ${row?.id ?? ""}`;
          await paid.fake.simulateRefundOutcome(ref, "succeeded");
          const charge = await paid.fake.chargeRefOf(paid.intentRef);
          const outcomes: string[] = [];
          for (const type of types) {
            outcomes.push(
              await webhook(
                paid.fake,
                type,
                type === "charge.refunded" ? charge : ref,
              ),
            );
          }
          return {
            outcomes,
            final: {
              refunds: (await refundRows(orderId)).map((r) => [
                r.amount_minor,
                r.status,
                r.succeeded_at?.toISOString(),
              ]),
              refunded: await refundedOnPayment(paid.paymentId),
              orders: await Promise.all(
                paid.orderIds.map(async (id) => ({
                  status: await status(id),
                  events: (await events(id)).map((e) => [
                    e.type,
                    e.from_status,
                    e.to_status,
                  ]),
                })),
              ),
            },
          };
        }
        const inOrder = await run(["charge.refunded", "refund.updated"]);
        const outOfOrder = await run(["refund.updated", "charge.refunded"]);
        expect(outOfOrder.final).toEqual(inOrder.final);
        expect(inOrder.outcomes).toEqual(["processed", "ignored:stale"]);
        expect(outOfOrder.outcomes).toEqual(["processed", "ignored:stale"]);
        expect(outOfOrder.final.orders.map((o) => o.status)).toEqual([
          "refunded_full",
          "paid_unrouted",
        ]);
      });

      it("charge.dispute.closed before charge.dispute.created: the same final rows as in order; the late one is ignored/stale", async () => {
        async function run(outOfOrder: boolean) {
          const paid = await paidPurchase([8_000]);
          const orderId = paid.orderIds[0] ?? "";
          await walk(orderId, "delivered");
          const ref = await paid.fake.simulateDispute(
            paid.intentRef,
            "fraudulent",
          );
          const outcomes: string[] = [];
          if (outOfOrder) {
            await paid.fake.simulateDisputeOutcome(ref, "lost");
            outcomes.push(
              await webhook(paid.fake, "charge.dispute.closed", ref),
              await webhook(paid.fake, "charge.dispute.created", ref),
            );
          } else {
            outcomes.push(
              await webhook(paid.fake, "charge.dispute.created", ref),
            );
            await paid.fake.simulateDisputeOutcome(ref, "lost");
            outcomes.push(
              await webhook(paid.fake, "charge.dispute.closed", ref),
            );
          }
          const [dispute] = await scratch.sql<
            Record<string, unknown>[]
          >`SELECT status, amount_minor, currency_code, reason, opened_at, closed_at,
                   evidence_due_by
            FROM payment_dispute WHERE payment_id = ${paid.paymentId}`;
          return {
            outcomes,
            final: {
              dispute: { ...dispute },
              status: await status(orderId),
              events: (await events(orderId)).map((e) => [
                e.type,
                e.from_status,
                e.to_status,
              ]),
            },
          };
        }
        const inOrder = await run(false);
        const outOfOrder = await run(true);
        expect(outOfOrder.final).toEqual(inOrder.final);
        expect(inOrder.outcomes).toEqual(["processed", "processed"]);
        expect(outOfOrder.outcomes).toEqual(["processed", "ignored:stale"]);
        expect(outOfOrder.final.status).toBe("chargeback_lost");
        expect(outOfOrder.final.events.slice(-2)).toEqual([
          ["order.chargeback_opened", "delivered", "chargeback_open"],
          ["order.chargeback_lost", "chargeback_open", "chargeback_lost"],
        ]);
      });

      it("a row TASK-260 left ignored/awaiting_handler is re-processed by --inbox-id into the refund path", async () => {
        const paid = await paidPurchase([8_000], "async");
        const orderId = paid.orderIds[0] ?? "";
        await walk(orderId, "in_production");
        await refundOf(orderId, 1_000, depsOf(paid.fake));
        const [row] = await refundRows(orderId);
        const [{ r: ref = "" } = { r: "" }] = await scratch.sql<
          { r: string }[]
        >`
          SELECT provider_ref AS r FROM refund WHERE id = ${row?.id ?? ""}`;
        await paid.fake.simulateRefundOutcome(ref, "succeeded");
        const event = await paid.fake.simulateEvent("refund.updated", ref, T0);
        const [inbox] = await scratch.sql<{ id: string }[]>`
          INSERT INTO webhook_inbox (provider, event_id, signature_verified, raw, livemode,
                                     event_type, object_ref, status, ignore_reason, processed_at)
          VALUES ('stripe', ${event.id}, true, '{}'::jsonb, false, 'refund.updated', ${ref},
                  'ignored', 'awaiting_handler', ${T0.toISOString()}::timestamptz)
          RETURNING id`;
        const enqueued: string[] = [];
        expect(
          await replayWebhooks(
            { inboxId: inbox?.id ?? "" },
            ingestOf(paid.fake, enqueued),
          ),
        ).toEqual({ seen: 1, inserted: 0, enqueued: 1 });
        expect(
          await processWebhook(enqueued[0] ?? "", processOf(paid.fake)),
        ).toEqual({ kind: "processed" });
        expect((await refundRows(orderId))[0]?.status).toBe("succeeded");
      });
    });

    // -----------------------------------------------------------------------------------------
    // adminRefund / adminCancel (§5.2)
    // -----------------------------------------------------------------------------------------

    describe("adminRefund and adminCancel (§5.2)", () => {
      const session = {
        userId: ADMIN_ID,
        displayName: "Test Admin",
        roles: ["admin" as const],
        timeZone: "Europe/Warsaw",
      };

      it("asks for orders.refund before reading the input, and refunds as admin:{userId}", async () => {
        const paid = await paidPurchase([10_000]);
        const orderId = paid.orderIds[0] ?? "";
        await walk(orderId, "delivered");
        const asked: string[] = [];
        const result = await adminRefund(
          { orderId, amountMinor: 2_000, currency: "PLN", reason: "quality" },
          {
            ...depsOf(paid.fake),
            guard: (permission) => {
              asked.push(permission);
              return Promise.resolve(session);
            },
          },
        );
        expect(asked).toEqual(["orders.refund"]);
        expect(result).toMatchObject({ kind: "requested" });
        expect((await refundRows(orderId))[0]?.requested_by).toBe(ADMIN);
      });

      it("a refused guard writes nothing; a float or text amount is invalid and writes nothing", async () => {
        const paid = await paidPurchase([10_000]);
        const orderId = paid.orderIds[0] ?? "";
        await walk(orderId, "delivered");
        await expect(
          adminRefund(
            { orderId, amountMinor: 2_000, currency: "PLN", reason: "quality" },
            {
              ...depsOf(paid.fake),
              guard: () => Promise.reject(new Error("FORBIDDEN")),
            },
          ),
        ).rejects.toThrow("FORBIDDEN");
        for (const amountMinor of [20.5, "2000", 0, -1]) {
          expect(
            await adminRefund(
              { orderId, amountMinor, currency: "PLN", reason: "quality" },
              { ...depsOf(paid.fake), guard: () => Promise.resolve(session) },
            ),
          ).toEqual({ kind: "invalid" });
        }
        expect(
          await adminRefund(
            {
              orderId,
              amountMinor: 2_000,
              currency: "PLN",
              reason: "quality",
              destination: "acct_x",
            },
            { ...depsOf(paid.fake), guard: () => Promise.resolve(session) },
          ),
        ).toEqual({ kind: "invalid" });
        expect(await refundRows(orderId)).toEqual([]);
        expect(refundCalls(paid.fake)).toBe(0);
      });

      it("adminCancel asks for orders.cancel and cancels as admin:{userId} with the chosen reason", async () => {
        const paid = await paidPurchase([10_000]);
        const orderId = paid.orderIds[0] ?? "";
        await walk(orderId, "routed");
        const asked: string[] = [];
        const result = await scratch.sql.begin((tx) =>
          adminCancel(
            { orderId, reason: "goodwill" },
            {
              connection: { executor: runnerOf(tx) },
              guard: (permission) => {
                asked.push(permission);
                return Promise.resolve(session);
              },
            },
          ),
        );
        expect(asked).toEqual(["orders.cancel"]);
        expect(result).toMatchObject({
          kind: "cancelled",
          fromStatus: "routed",
        });
        expect((await events(orderId)).at(-1)).toMatchObject({
          type: "order.cancelled",
          actor: ADMIN,
          payload: { mode: "test", reason: "goodwill" },
        });
      });
    });
  },
);

// ---------------------------------------------------------------------------------------------
// Spec 002 §14 A9.3 / AC-49: `0030_set_c_a9` and its guarded rollback, on a database of its own
// ---------------------------------------------------------------------------------------------

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const A9_FILE =
  readdirSync(resolve(REPO_ROOT, "db/migrations")).find((name) =>
    /^\d{4}_set_c_a9\.sql$/.test(name),
  ) ?? "";
const A9_VERSION = A9_FILE.slice(0, 4);
const BEFORE_A9 = String(Number(A9_VERSION) - 1).padStart(4, "0");

describe.skipIf(server.url === undefined)(
  `spec 002 A9 migration and rollback (AC-49)${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
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

    async function machine() {
      const statuses = await db.sql<
        { key: string; buyer_projection: string }[]
      >`SELECT key, buyer_projection FROM order_status ORDER BY key`;
      const rows = await db.sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM order_transition`;
      const fromRouting = await db.sql<{ from_status: string }[]>`
        SELECT from_status FROM order_transition
        WHERE event = 'order.chargeback_opened'
          AND from_status IN ('routed', 'no_partner_available', 'manual_reroute')
        ORDER BY 1`;
      return {
        projections: Object.fromEntries(
          statuses.map((row) => [row.key, row.buyer_projection]),
        ),
        rows: rows[0]?.n ?? -1,
        fromRouting: fromRouting.map((row) => row.from_status),
      };
    }

    const projectionsOf = (states: typeof STATES) =>
      Object.fromEntries(states.map((s) => [s.key, s.buyerProjection]));

    async function down(): Promise<string> {
      try {
        await locked(() => runner(db.url, ["--down", "--to", BEFORE_A9]));
        return "rolled back";
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    }

    beforeAll(async () => {
      db = await scratchDatabase(server.url as string, "a9_rb");
    }, 600_000);

    afterAll(async () => {
      await db.drop();
    });

    it("up: accepted and paid project to confirmed, three row-34 rows; down: both undone, nothing else; up again", async () => {
      expect(A9_VERSION > "0029").toBe(true);
      expect(await machine()).toEqual({
        projections: projectionsOf(STATES),
        rows: TRANSITIONS.length,
        fromRouting: ["manual_reroute", "no_partner_available", "routed"],
      });
      expect(A9_TRANSITIONS).toHaveLength(3);
      expect(await down()).toBe("rolled back");
      expect(await machine()).toEqual({
        projections: projectionsOf(A6_STATES),
        rows: A6_TRANSITIONS.length + A10_TRANSITIONS.length,
        fromRouting: [],
      });
      await locked(() => runner(db.url));
      expect((await machine()).rows).toBe(TRANSITIONS.length);
    }, 180_000);

    it("with a chargeback opened from routed in the history, down raises A9_ROLLBACK_ROWS_IN_USE and changes nothing", async () => {
      await db.sql.begin(async (tx) => {
        await base(tx);
        const countryId = await country(tx, "PL");
        const buyer = await customer(tx);
        const orderId = await insertPlacedOrder(tx, {
          customerId: buyer,
          recipientId: await recipient(tx, buyer),
          countryId,
        });
        await walkOrderTo(tx, orderId, "routed");
        await walkOrderTo(tx, orderId, "chargeback_open");
      });
      const before = await machine();
      const events = await db.sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM order_event`;
      expect(await down()).toContain("A9_ROLLBACK_ROWS_IN_USE");
      expect(await machine()).toEqual(before);
      expect(
        (
          await db.sql<
            { n: number }[]
          >`SELECT count(*)::int AS n FROM order_event`
        )[0]?.n,
      ).toBe(events[0]?.n);
    }, 180_000);
  },
);
