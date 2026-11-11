/**
 * The confirmation states' read against a disposable PG16 (spec 013 §5.3, the projection table;
 * AC-6 integration half; T-06; TASK-263). `getPaymentConfirmations` over real rows:
 *
 *  - a `test` order walked (`walkOrderTo`) to each of A6.4's 26 statuses gives exactly the
 *    table's key (the fixture's cancelling actor is `system:test_fixture`, so the two cancelled
 *    statuses read "We could not deliver");
 *  - a paid `test` purchase on the fake provider cancelled through spec 013's `cancelOrder` by
 *    `buyer` (from `paid`), by `admin:{id}` with `buyer_cancel` (from `routed`) and by
 *    `system:routing.no_partner_expiry` with `no_partner` (from `no_partner_available`): the
 *    actor class picks the wording, the refunding form until spec 013's cancel handler has
 *    refunded the order on the fake, then the refunded form, `{amount}` the order's total; no
 *    state carries the reason.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PAYMENT_METHODS } from "@/config/payment-methods";
import {
  dispatchOutbox,
  type HandlerRegistry,
  type OrderExecutor,
} from "@/modules/orders";
import { cancelOrder, paymentsOutboxHandler } from "@/modules/payments";
import {
  confirmationKey,
  getPaymentConfirmations,
} from "@/modules/payments/confirmation";
import { FakePaymentProvider } from "@/modules/payments/fake";
import {
  startPayment,
  syncFromProvider,
  type LifecycleDeps,
  type PaymentTransaction,
} from "@/modules/payments/lifecycle";
import type { MethodSources } from "@/modules/payments/methods";

import { STATES } from "../fixtures/order-machine.ts";
import { insertPlacedOrder, walkOrderTo } from "../fixtures/order-state.ts";
import { country, customer, recipient } from "./support/rows.ts";
import {
  probeLocalServer,
  rolledBack,
  scratchDatabase,
  type ScratchDatabase,
} from "./support/scratch-db.ts";
import { runnerOf } from "./support/sql-runner.ts";

const server = await probeLocalServer();
const T0 = new Date("2026-10-16T08:00:00.000Z");
const ADMIN = "admin:4c0a7f4e-1d2b-4e5f-8a9b-0c1d2e3f4a5b";

const METHODS_ON: MethodSources = {
  enabledFlags: new Set(["payments.method.card"]),
  registry: PAYMENT_METHODS.map((method) => ({
    ...method,
    available: method.id !== "blik",
    ...(method.id === "blik" ? {} : { processor: "stripe" as const }),
  })),
};

/** §5.3's table for an order cancelled by the fixture's `system` actor. */
const EXPECTED_KEY: Readonly<Record<string, string>> = {
  placed: "payments.confirmation.notCompleted",
  payment_failed: "payments.confirmation.cancelled",
  abandoned: "payments.confirmation.cancelled",
  authorised: "payments.confirmation.paid",
  paid_unrouted: "payments.confirmation.paid",
  routed: "payments.confirmation.paid",
  no_partner_available: "payments.confirmation.paid",
  manual_reroute: "payments.confirmation.paid",
  accepted: "payments.confirmation.paid",
  paid: "payments.confirmation.paid",
  in_production: "tracking.headline.beingMade",
  awaiting_buyer: "tracking.headline.beingMade",
  out_for_delivery: "tracking.headline.onItsWay",
  delivery_failed: "tracking.headline.onItsWay",
  redelivery_scheduled: "tracking.headline.onItsWay",
  delivered: "tracking.headline.delivered",
  photo_uploaded: "tracking.headline.delivered",
  disputed: "tracking.headline.delivered",
  closed: "tracking.headline.closed",
  resolved: "tracking.headline.closed",
  refunded_full: "tracking.headline.closed",
  chargeback_open: "tracking.headline.closed",
  chargeback_won: "tracking.headline.closed",
  chargeback_lost: "tracking.headline.closed",
  cancelled: "payments.confirmation.notDeliveredRefunding",
  cancelled_refunded: "payments.confirmation.notDeliveredRefunding",
};

describe.skipIf(server.url === undefined)(
  `spec 013 confirmation states${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "payconf");
    }, 600_000);
    afterAll(async () => {
      await scratch.drop();
    });

    const transactionOf =
      (): PaymentTransaction =>
      <T>(fn: (executor: OrderExecutor) => Promise<T>) =>
        scratch.sql.begin((tx) => fn(runnerOf(tx))) as Promise<T>;

    const depsOf = (provider: FakePaymentProvider): LifecycleDeps => ({
      provider,
      transaction: transactionOf(),
      now: () => T0,
      alert: () => undefined,
      methodSources: () => Promise.resolve(METHODS_ON),
    });

    let fakes = 0;
    /** A committed, paid one-order `test` purchase (PLN 189.00) walked on to `status`. */
    async function paidOrder(
      status: string,
    ): Promise<{ orderId: string; fake: FakePaymentProvider }> {
      const { purchaseId, orderId } = await scratch.sql.begin(async (tx) => {
        const countryId = await country(tx, "PL");
        const customerId = await customer(tx);
        const recipientId = await recipient(tx, customerId);
        const [row] = await tx<{ id: string }[]>`
          INSERT INTO purchase (mode, buyer_currency_code, total_minor, locale_code, customer_id)
          VALUES ('test', 'PLN', 18900, 'en', ${customerId}) RETURNING id`;
        const id = await insertPlacedOrder(tx, {
          customerId,
          recipientId,
          countryId,
          mode: "test",
          totalMinor: 18_900,
          purchaseId: row?.id ?? "",
        });
        await tx`UPDATE "order"
                 SET buyer_snapshot = ${tx.json({ name: "Test Buyer", email: "buyer@example.test", countryIso2: "GB" })},
                     delivery_date = DATE '2027-12-24'
                 WHERE id = ${id}`;
        return { purchaseId: row?.id ?? "", orderId: id };
      });
      fakes += 1;
      const fake = new FakePaymentProvider({
        now: () => T0,
        namespace: `pc${String(fakes)}`,
      });
      const started = await startPayment(purchaseId, depsOf(fake));
      if (started.kind !== "started") throw new Error(started.kind);
      await fake.simulateSuccess(started.intentRef);
      const synced = await syncFromProvider(purchaseId, depsOf(fake));
      if (synced.outcome !== "captured") throw new Error(synced.outcome);
      await scratch.sql.begin((tx) => walkOrderTo(tx, orderId, status));
      return { orderId, fake };
    }

    async function deliver(orderId: string, fake: FakePaymentProvider) {
      const handlers: HandlerRegistry = {
        payments: paymentsOutboxHandler(depsOf(fake)),
        routing: () => Promise.resolve(),
        invoices: () => Promise.resolve(),
        notifications: () => Promise.resolve(),
        "analytics.ga4": () => Promise.resolve(),
        risk: () => Promise.resolve(),
        reviews: () => Promise.resolve(),
        payouts: () => Promise.resolve(),
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

    const stateOf = async (orderId: string) => {
      const map = await scratch.sql.begin((tx) =>
        getPaymentConfirmations([orderId], { executor: runnerOf(tx) }),
      );
      const state = map.get(orderId);
      if (state === undefined) throw new Error("no state");
      return state;
    };

    it("AC-6: an order walked to each of the 26 statuses reads exactly the table's key", async () => {
      const keys = await rolledBack(scratch.sql, async (tx) => {
        const out: Record<string, string> = {};
        for (const state of STATES) {
          const countryId = await country(tx, "PL");
          const customerId = await customer(tx);
          const recipientId = await recipient(tx, customerId);
          const id = await insertPlacedOrder(tx, {
            customerId,
            recipientId,
            countryId,
            mode: "test",
          });
          await walkOrderTo(tx, id, state.key);
          const map = await getPaymentConfirmations([id], {
            executor: runnerOf(tx),
          });
          const found = map.get(id);
          out[state.key] =
            found === undefined ? "missing" : confirmationKey(found);
        }
        return out;
      });
      expect(Object.keys(keys)).toHaveLength(26);
      expect(keys).toEqual(EXPECTED_KEY);
    });

    const cases = [
      {
        name: "buyer from paid",
        from: "paid",
        actor: "buyer",
        reason: "buyer_cancel",
        stem: "cancelledByYou",
      },
      {
        name: "admin with buyer_cancel from routed",
        from: "routed",
        actor: ADMIN,
        reason: "buyer_cancel",
        stem: "cancelledByYou",
      },
      {
        name: "the no-partner expiry from no_partner_available",
        from: "no_partner_available",
        actor: "system:routing.no_partner_expiry",
        reason: "no_partner",
        stem: "notDelivered",
      },
    ] as const;

    for (const entry of cases) {
      it(`AC-6: cancelled by ${entry.name}: ${entry.stem}Refunding, then ${entry.stem}Refunded, with the order's amount`, async () => {
        const { orderId, fake } = await paidOrder(entry.from);
        const cancelled = await scratch.sql.begin((tx) =>
          cancelOrder(orderId, entry.actor, entry.reason, {
            executor: runnerOf(tx),
          }),
        );
        expect(cancelled.kind).not.toBe("refused");
        const refunding = await stateOf(orderId);
        expect(confirmationKey(refunding)).toBe(
          `payments.confirmation.${entry.stem}Refunding`,
        );
        expect(refunding).toMatchObject({
          amount: { amountMinor: 18_900, currency: "PLN" },
        });
        await deliver(orderId, fake);
        const refunded = await stateOf(orderId);
        expect(confirmationKey(refunded)).toBe(
          `payments.confirmation.${entry.stem}Refunded`,
        );
        expect(refunded).toMatchObject({
          amount: { amountMinor: 18_900, currency: "PLN" },
        });
        expect(JSON.stringify(refunded)).not.toMatch(
          /no_partner|buyer_cancel|reason/u,
        );
      });
    }
  },
);
