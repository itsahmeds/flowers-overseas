/**
 * Spec 013's acceptance handler and spec 011's early dispatch, on a disposable PG16 and the
 * in-memory `FakePaymentProvider` (spec 013 §5.2 "Production start on acceptance", §12 request on
 * spec 011; §14 A-founder-2026-10-14b; AC-13, AC-16 / T-13, T-16; TASK-259).
 *
 * Every order is paid through the real lifecycle (`startPayment`, the fake's success,
 * `syncFromProvider`: row 2, payment `captured`), walked to `routed`, offered to one florist, and
 * accepted through spec 011's `respondToOffer` running as production does: a partner-context read
 * and a system transaction, each on its own connection. The `payments` deliveries run through the
 * real dispatcher with `paymentsOutboxHandler`; the other targets are stubs. No Stripe account
 * exists: no case reaches the network.
 *
 *  - T-13: accept on paid `test` and `live` orders → zero provider calls, row 14
 *    (`provider_call: false`) by `system:payments`, `captured_at` unchanged; three days ahead →
 *    `paid`, no row 16; at 09:00 local on the delivery date → rows 14 and 16 in one transaction;
 *    a buyer cancel between accept and delivery → nothing written, `sent`; the row delivered twice
 *    → each event once; payment forced to `failed` → `PAYMENT_NOT_CAPTURED`, nothing written,
 *    `dead`, `outbox.dead`; `demoOrderEffect` never for `test`, still for `demo`; no other actor
 *    writes `order.in_production` for `test` and `live`.
 *  - Early dispatch (spec 013 §12 on spec 011): out for delivery at 05:30 local on the delivery
 *    date → row 16 by `system:payments.production_start` then row 19, one transaction; on the day
 *    before (23:59 local, across the Warsaw DST night of 25 Oct 2026) → refused, nothing written;
 *    a failing `startProduction` rolls the dispatch back and a retry goes through.
 *  - T-16: 50 runs of a concurrent buyer cancel and an accept on one `routed` order → always
 *    `cancelled`, one full refund, no row 16, `seq` contiguous; both orders of arrival observed.
 */
import { randomUUID } from "node:crypto";

import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";

import { PAYMENT_METHODS } from "@/config/payment-methods";
import {
  createDemoOrderEffect,
  acceptedOrderEffectFor,
  type AcceptedOrderEffect,
} from "@/modules/orders/demo/effect";
import {
  FloristActionError,
  markOutForDelivery,
  respondToOffer,
  type FloristCommandContext,
  type FloristCommandDeps,
  type FloristCommandRuntime,
} from "@/modules/orders/florist-actions";
import {
  dispatchOutbox,
  type HandlerRegistry,
  type OrderExecutor,
} from "@/modules/orders";
import {
  cancelOrder,
  createPaymentAcceptedOrderEffect,
  paymentsOutboxHandler,
  startProduction,
  type OutboxNudge,
} from "@/modules/payments";
import { FakePaymentProvider } from "@/modules/payments/fake";
import {
  startPayment,
  syncFromProvider,
  type LifecycleDeps,
  type PaymentTransaction,
} from "@/modules/payments/lifecycle";
import type { MethodSources } from "@/modules/payments/methods";

import { insertPlacedOrder, walkOrderTo } from "../fixtures/order-state.ts";
import { base, country, customer, partner, recipient } from "./support/rows.ts";
import {
  asApp,
  probeLocalServer,
  scratchDatabase,
  type ScratchDatabase,
} from "./support/scratch-db.ts";
import { runnerOf } from "./support/sql-runner.ts";

const server = await probeLocalServer();

/** Placement and acceptance, 10:00 Warsaw on 16 Oct 2026 (CEST). */
const T0 = new Date("2026-10-16T08:00:00.000Z");
/** Three days ahead of `T0`. */
const AHEAD = "2026-10-19";
/** The Warsaw DST night: clocks go back at 03:00 CEST (01:00Z) on 25 Oct 2026. */
const DST_DATE = "2026-10-25";

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

const SYSTEM_IN_PRODUCTION_WRITERS = new Set([
  "system:payments",
  "system:payments.production_start",
]);

interface EventRow {
  readonly seq: number;
  readonly type: string;
  readonly actor: string;
  readonly from_status: string | null;
  readonly to_status: string | null;
  readonly payload: Record<string, unknown>;
  readonly occurred_at: Date;
}

interface Routed {
  readonly orderId: string;
  readonly paymentId: string;
  readonly partnerId: string;
  readonly assignmentId: string;
  readonly fake: FakePaymentProvider;
  readonly florist: FloristCommandContext;
}

let fakes = 0;

describe.skipIf(server.url === undefined)(
  `spec 013 acceptance handler and early dispatch${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "accept");
    }, 600_000);

    afterAll(async () => {
      await scratch.drop();
    });

    const transactionOf =
      (): PaymentTransaction =>
      <T>(fn: (executor: OrderExecutor) => Promise<T>) =>
        scratch.sql.begin((tx) => fn(runnerOf(tx))) as Promise<T>;

    /** Production's two transactions, over the scratch database. */
    const runtime: FloristCommandRuntime = {
      asPartner<T>(
        ctx: FloristCommandContext,
        fn: (executor: OrderExecutor) => Promise<T>,
      ): Promise<T> {
        return scratch.sql.begin(async (tx) => {
          await asApp(tx, {
            role: "partner",
            userId: ctx.userId,
            partnerIds: ctx.partnerIds,
          });
          return fn(runnerOf(tx));
        }) as Promise<T>;
      },
      asSystem<T>(
        _job: string,
        fn: (executor: OrderExecutor) => Promise<T>,
      ): Promise<T> {
        return scratch.sql.begin(async (tx) => {
          await asApp(tx, { role: "system" });
          return fn(runnerOf(tx));
        }) as Promise<T>;
      },
    };

    function lifecycle(provider: FakePaymentProvider): LifecycleDeps {
      return {
        provider,
        transaction: transactionOf(),
        now: () => T0,
        alert: () => undefined,
        methodSources: () => Promise.resolve(METHODS_ON),
      };
    }

    /** A paid order of `mode`, walked to `routed` and offered to one florist until `at` + 1 h. */
    async function routedOrder(options: {
      readonly mode?: "test" | "live" | "demo";
      readonly deliveryDate: string;
      readonly offeredAt?: Date;
      readonly totalMinor?: number;
    }): Promise<Routed> {
      const mode = options.mode ?? "test";
      const offeredAt = options.offeredAt ?? T0;
      fakes += 1;
      const fake = new FakePaymentProvider({
        now: () => T0,
        namespace: `ac${String(fakes)}`,
        livemode: mode === "live",
      });
      const totalMinor = options.totalMinor ?? 18_900;
      const placed = await scratch.sql.begin(async (tx) => {
        await base(tx);
        const customerId = await customer(tx);
        const countryId = await country(tx, "PL");
        const orderId = await insertPlacedOrder(tx, {
          customerId,
          recipientId: await recipient(tx, customerId),
          countryId,
          mode,
          totalMinor,
        });
        await tx`UPDATE "order"
                 SET buyer_snapshot = '{"name": "Test Buyer", "countryIso2": "GB"}'::jsonb,
                     delivery_date = ${options.deliveryDate}::date
                 WHERE id = ${orderId}`;
        const [row] = await tx<{ purchase_id: string }[]>`
          SELECT purchase_id FROM "order" WHERE id = ${orderId}`;
        return { orderId, countryId, purchaseId: row?.purchase_id ?? "" };
      });
      let paymentId = "";
      if (mode === "demo") {
        await scratch.sql.begin((tx) =>
          walkOrderTo(tx, placed.orderId, "routed"),
        );
      } else {
        const started = await startPayment(placed.purchaseId, lifecycle(fake));
        if (started.kind !== "started") throw new Error(started.kind);
        await fake.simulateSuccess(started.intentRef);
        const synced = await syncFromProvider(
          placed.purchaseId,
          lifecycle(fake),
        );
        if (synced.outcome !== "captured") throw new Error(synced.outcome);
        paymentId = started.paymentId;
        await scratch.sql.begin((tx) =>
          walkOrderTo(tx, placed.orderId, "routed"),
        );
      }
      const offered = await scratch.sql.begin(async (tx) => {
        const partnerId = await partner(
          tx,
          placed.countryId,
          mode === "live" ? "active" : "demo",
        );
        const [assignment] = await tx<{ id: string }[]>`
          INSERT INTO order_assignment (order_id, partner_id, offered_at, sla_expires_at, attempt)
          VALUES (${placed.orderId}, ${partnerId}, ${offeredAt.toISOString()}::timestamptz,
                  ${new Date(offeredAt.getTime() + 3_600_000).toISOString()}::timestamptz, 1)
          RETURNING id`;
        return { partnerId, assignmentId: assignment?.id ?? "" };
      });
      return {
        orderId: placed.orderId,
        paymentId,
        partnerId: offered.partnerId,
        assignmentId: offered.assignmentId,
        fake,
        florist: { userId: randomUUID(), partnerIds: [offered.partnerId] },
      };
    }

    interface Spies {
      readonly demo: {
        afterAccept: Mock<AcceptedOrderEffect["afterAccept"]>;
        afterDecline: Mock<AcceptedOrderEffect["afterDecline"]>;
      };
      readonly nudge: Mock<OutboxNudge>;
    }

    function spies(): Spies {
      const real = createDemoOrderEffect();
      return {
        demo: {
          afterAccept: vi.fn(real.afterAccept),
          afterDecline: vi.fn(real.afterDecline),
        },
        nudge: vi.fn<OutboxNudge>(() => Promise.resolve()),
      };
    }

    function commandDeps(
      at: Date,
      spy: Spies = spies(),
      extra: Partial<FloristCommandDeps> = {},
    ): FloristCommandDeps {
      return {
        runtime,
        now: () => at,
        environment: "staging",
        effectFor: (mode, environment) =>
          acceptedOrderEffectFor(mode, environment, {
            demo: spy.demo,
            paid: createPaymentAcceptedOrderEffect(spy.nudge),
            routed: { afterDecline: () => Promise.resolve() },
          }),
        ...extra,
      };
    }

    const accept = (order: Routed, at: Date, spy?: Spies) =>
      respondToOffer(
        order.florist,
        order.assignmentId,
        { response: "accept" },
        commandDeps(at, spy),
      );

    const alerts: { alert: string; fields: Record<string, unknown> }[] = [];

    /** Delivers every due outbox row of `orderId`: `payments` real, the rest stubs. */
    async function deliver(
      orderId: string,
      fake: FakePaymentProvider,
      clock: Date,
    ): Promise<void> {
      const handlers: HandlerRegistry = {
        payments: paymentsOutboxHandler({
          provider: fake,
          transaction: transactionOf(),
          now: () => clock,
          alert: () => undefined,
        }),
        routing: () => Promise.resolve(),
        invoices: () => Promise.resolve(),
        notifications: () => Promise.resolve(),
        payouts: () => Promise.resolve(),
      };
      for (let run = 0; run < 12; run += 1) {
        const counts = await dispatchOutbox({
          handlers,
          transaction: transactionOf(),
          orderId,
          retryBaseSeconds: 0,
          // The backoff is read against `updated_at` (the database's clock), not the order's.
          now: () => new Date(Date.now() + 60_000),
          alert: (alert, fields) => {
            alerts.push({ alert, fields: { ...fields } });
          },
        });
        if (counts.claimed === 0) return;
      }
    }

    async function events(orderId: string): Promise<EventRow[]> {
      const rows = await scratch.sql<EventRow[]>`
        SELECT seq, type, actor, from_status, to_status, payload, occurred_at FROM order_event
        WHERE order_id = ${orderId} ORDER BY seq`;
      return rows.map((row) => ({ ...row }));
    }

    async function status(orderId: string): Promise<string> {
      const [row] = await scratch.sql<{ status: string }[]>`
        SELECT status FROM "order" WHERE id = ${orderId}`;
      return row?.status ?? "";
    }

    async function capturedAt(paymentId: string): Promise<string> {
      const [row] = await scratch.sql<{ at: string; status: string }[]>`
        SELECT captured_at::text AS at, status FROM payment WHERE id = ${paymentId}`;
      return `${row?.status ?? ""}@${row?.at ?? ""}`;
    }

    async function paymentsDelivery(orderId: string, type: string) {
      const [row] = await scratch.sql<
        { status: string; attempts: number; last_error: string | null }[]
      >`
        SELECT d.status, d.attempts, d.last_error
        FROM outbox_delivery d JOIN outbox o ON o.id = d.outbox_id
        JOIN order_event e ON e.id = o.event_id
        WHERE o.order_id = ${orderId} AND d.target = 'payments' AND e.type = ${type}`;
      return row === undefined ? undefined : { ...row };
    }

    async function codeOf(promise: Promise<unknown>): Promise<string> {
      try {
        await promise;
        return "done";
      } catch (error) {
        if (error instanceof FloristActionError) return error.code;
        throw error;
      }
    }

    const after = (rows: readonly EventRow[], from: number) =>
      rows
        .filter((row) => row.seq > from)
        .map((row) => [row.type, row.actor, row.from_status, row.to_status]);

    // -----------------------------------------------------------------------------------------
    // AC-13 / T-13
    // -----------------------------------------------------------------------------------------

    describe("the acceptance delivery (AC-13, T-13)", () => {
      for (const mode of ["test", "live"] as const) {
        it(`${mode}, delivery three days ahead: zero provider calls, row 14 by system:payments with provider_call false, captured_at unchanged, the order stays paid with no row 16; the nudge asked for this order; the demo effect never ran`, async () => {
          const order = await routedOrder({ mode, deliveryDate: AHEAD });
          const before = await events(order.orderId);
          const paidAt = await capturedAt(order.paymentId);
          const providerCalls = order.fake.calls.length;
          const spy = spies();

          await accept(order, T0, spy);
          await deliver(order.orderId, order.fake, T0);

          expect(after(await events(order.orderId), before.length)).toEqual([
            [
              "assignment.accepted",
              `partner:${order.partnerId}`,
              "routed",
              "accepted",
            ],
            ["order.captured", "system:payments", "accepted", "paid"],
          ]);
          const captured = (await events(order.orderId)).at(-1);
          expect(captured?.payload).toEqual({
            mode,
            payment_id: order.paymentId,
            provider_call: false,
          });
          expect(await status(order.orderId)).toBe("paid");
          expect(order.fake.calls.length).toBe(providerCalls);
          expect(await capturedAt(order.paymentId)).toBe(paidAt);
          expect(paidAt.startsWith("captured@")).toBe(true);
          expect(
            await paymentsDelivery(order.orderId, "assignment.accepted"),
          ).toEqual({ status: "sent", attempts: 1, last_error: null });
          expect(spy.nudge).toHaveBeenCalledExactlyOnceWith(order.orderId);
          expect(spy.demo.afterAccept).not.toHaveBeenCalled();
        });

        it(`${mode}, accepted at 09:00 local on the delivery date: rows 14 and 16 by system:payments in one transaction`, async () => {
          // 09:00 Warsaw (CEST) on 16 Oct 2026.
          const at = new Date("2026-10-16T07:00:00.000Z");
          const order = await routedOrder({
            mode,
            deliveryDate: "2026-10-16",
            offeredAt: at,
          });
          const before = await events(order.orderId);
          const providerCalls = order.fake.calls.length;

          await accept(order, at);
          await deliver(order.orderId, order.fake, at);

          const rows = await events(order.orderId);
          expect(after(rows, before.length)).toEqual([
            [
              "assignment.accepted",
              `partner:${order.partnerId}`,
              "routed",
              "accepted",
            ],
            ["order.captured", "system:payments", "accepted", "paid"],
            ["order.in_production", "system:payments", "paid", "in_production"],
          ]);
          const [row14, row16] = rows.slice(-2);
          // `occurred_at` is the transaction's `now()`: one value, one transaction.
          expect(row16?.occurred_at.getTime()).toBe(
            row14?.occurred_at.getTime(),
          );
          expect(row16?.payload).toEqual({ mode });
          expect(order.fake.calls.length).toBe(providerCalls);
          expect(await status(order.orderId)).toBe("in_production");
        });
      }

      it("a buyer cancel between the accept and the delivery: the acceptance delivery writes nothing and is sent; the cancel refunds once", async () => {
        const order = await routedOrder({ deliveryDate: AHEAD });
        await accept(order, T0);
        const cancelled = await scratch.sql.begin((tx) =>
          cancelOrder(order.orderId, "buyer", "buyer_cancel", {
            executor: runnerOf(tx),
          }),
        );
        expect(cancelled).toMatchObject({
          kind: "cancelled",
          fromStatus: "accepted",
        });
        const before = await events(order.orderId);

        await deliver(order.orderId, order.fake, T0);

        const added = after(await events(order.orderId), before.length);
        expect(added.map(([type]) => type)).toEqual([
          "order.refund_requested",
          "order.refunded_full",
        ]);
        expect(
          (await events(order.orderId)).filter(
            (e) => e.type === "order.captured" && e.from_status === "accepted",
          ),
        ).toEqual([]);
        expect(
          await paymentsDelivery(order.orderId, "assignment.accepted"),
        ).toEqual({ status: "sent", attempts: 1, last_error: null });
        expect(await status(order.orderId)).toBe("cancelled");
      });

      it("the row delivered twice writes each event once (and the handler never builds the provider for an acceptance)", async () => {
        const order = await routedOrder({
          deliveryDate: "2026-10-16",
          offeredAt: new Date("2026-10-16T07:00:00.000Z"),
        });
        const at = new Date("2026-10-16T07:00:00.000Z");
        await accept(order, at);
        const [accepted] = await scratch.sql<{ seq: number; id: string }[]>`
          SELECT seq, id FROM order_event
          WHERE order_id = ${order.orderId} AND type = 'assignment.accepted'`;
        const build = vi.fn(() => order.fake);
        const handler = paymentsOutboxHandler({
          provider: build,
          now: () => at,
        });
        const event = {
          eventId: accepted?.id ?? "",
          orderId: order.orderId,
          type: "assignment.accepted" as const,
          seq: accepted?.seq ?? 0,
          fromStatus: "routed",
          toStatus: "accepted",
          mode: "test" as const,
        };
        for (let run = 0; run < 2; run += 1) {
          await scratch.sql.begin((tx) =>
            handler(event, {
              deliveryId: randomUUID(),
              outboxId: randomUUID(),
              target: "payments",
              attempt: 1,
              executor: runnerOf(tx),
            }),
          );
        }
        const types = (await events(order.orderId)).map((e) => e.type);
        expect(types.filter((t) => t === "order.captured")).toHaveLength(2);
        expect(types.filter((t) => t === "order.in_production")).toHaveLength(
          1,
        );
        expect(types.slice(-3)).toEqual([
          "assignment.accepted",
          "order.captured",
          "order.in_production",
        ]);
        expect(build).not.toHaveBeenCalled();
      });

      it("a payment that is not captured: PAYMENT_NOT_CAPTURED, nothing written, retried to dead with outbox.dead", async () => {
        const order = await routedOrder({ deliveryDate: AHEAD });
        await scratch.sql`UPDATE payment SET status = 'failed' WHERE id = ${order.paymentId}`;
        await accept(order, T0);
        const before = await events(order.orderId);

        await deliver(order.orderId, order.fake, T0);

        expect(await events(order.orderId)).toHaveLength(before.length);
        expect(await status(order.orderId)).toBe("accepted");
        const delivery = await paymentsDelivery(
          order.orderId,
          "assignment.accepted",
        );
        expect(delivery).toMatchObject({ status: "dead", attempts: 8 });
        expect(delivery?.last_error).toContain("PAYMENT_NOT_CAPTURED");
        expect(
          alerts.filter(
            (a) =>
              a.alert === "outbox.dead" &&
              a.fields["order_id"] === order.orderId,
          ),
        ).toHaveLength(1);
      });

      it("a demo order still takes the demo effect (system:demo), and the payments target never sees it", async () => {
        const order = await routedOrder({
          mode: "demo",
          deliveryDate: AHEAD,
        });
        const spy = spies();
        const before = await events(order.orderId);
        await accept(order, T0, spy);
        expect(spy.demo.afterAccept).toHaveBeenCalledTimes(1);
        expect(spy.nudge).not.toHaveBeenCalled();
        expect(after(await events(order.orderId), before.length)).toEqual([
          [
            "assignment.accepted",
            `partner:${order.partnerId}`,
            "routed",
            "accepted",
          ],
          ["order.captured", "system:demo", "accepted", "paid"],
          ["order.in_production", "system:demo", "paid", "in_production"],
        ]);
        expect(
          await paymentsDelivery(order.orderId, "assignment.accepted"),
        ).toBeUndefined();
      });
    });

    // -----------------------------------------------------------------------------------------
    // Spec 013 §12 on spec 011: the early dispatch
    // -----------------------------------------------------------------------------------------

    describe("markOutForDelivery on a paid order (spec 013 §12 on spec 011)", () => {
      /** Accepted days ahead and delivered: `paid` until the delivery morning. */
      async function paidAhead(deliveryDate: string): Promise<Routed> {
        const order = await routedOrder({ deliveryDate });
        await accept(order, T0);
        await deliver(order.orderId, order.fake, T0);
        expect(await status(order.orderId)).toBe("paid");
        return order;
      }

      const dispatch = (
        order: Routed,
        at: Date,
        extra: Partial<FloristCommandDeps> = {},
      ) =>
        markOutForDelivery(
          order.florist,
          order.assignmentId,
          commandDeps(at, spies(), extra),
        );

      it("at 05:30 local on the delivery date (the DST night's morning): row 16 by system:payments.production_start, then row 19, one transaction", async () => {
        const order = await paidAhead(DST_DATE);
        const before = await events(order.orderId);
        // 05:30 CET on 25 Oct 2026, after the clocks went back at 01:00Z.
        const at = new Date("2026-10-25T04:30:00.000Z");
        expect(await codeOf(dispatch(order, at))).toBe("done");
        const rows = await events(order.orderId);
        expect(after(rows, before.length)).toEqual([
          [
            "order.in_production",
            "system:payments.production_start",
            "paid",
            "in_production",
          ],
          [
            "order.out_for_delivery",
            `partner:${order.partnerId}`,
            "in_production",
            "out_for_delivery",
          ],
        ]);
        const [row16, row19] = rows.slice(-2);
        expect(row19?.occurred_at.getTime()).toBe(row16?.occurred_at.getTime());
      });

      it("on the day before (23:59 local, CEST, the night before the DST change): refused, nothing written", async () => {
        const order = await paidAhead(DST_DATE);
        const before = await events(order.orderId);
        const at = new Date("2026-10-24T21:59:00.000Z");
        expect(await codeOf(dispatch(order, at))).toBe("ORDER_STATE_CHANGED");
        expect(await events(order.orderId)).toHaveLength(before.length);
        expect(await status(order.orderId)).toBe("paid");
      });

      it("an ordinary date at 05:30 local (CET, 2 Nov 2026) dispatches; a startProduction that fails rolls the dispatch back, and the retry goes through", async () => {
        const order = await paidAhead("2026-11-02");
        const before = await events(order.orderId);
        const at = new Date("2026-11-02T04:30:00.000Z");
        const failing = vi.fn(() =>
          Promise.reject(new Error("connection reset")),
        );
        await expect(
          dispatch(order, at, { startProduction: failing as never }),
        ).rejects.toThrow("connection reset");
        expect(failing).toHaveBeenCalledTimes(1);
        expect(await events(order.orderId)).toHaveLength(before.length);
        expect(await status(order.orderId)).toBe("paid");

        const real = vi.fn(startProduction);
        expect(
          await codeOf(dispatch(order, at, { startProduction: real })),
        ).toBe("done");
        expect(real).toHaveBeenCalledTimes(1);
        expect(await status(order.orderId)).toBe("out_for_delivery");
        // A second tap writes nothing more, and does not call startProduction again.
        expect(
          await codeOf(dispatch(order, at, { startProduction: real })),
        ).toBe("ORDER_STATE_CHANGED");
        expect(real).toHaveBeenCalledTimes(1);
        expect(await events(order.orderId)).toHaveLength(before.length + 2);
      });
    });

    // -----------------------------------------------------------------------------------------
    // AC-16 / T-16
    // -----------------------------------------------------------------------------------------

    describe("cancel against accept (AC-16, T-16)", () => {
      it("50 runs on a routed order three days ahead: always cancelled, one full refund, no row 16, seq contiguous; both orders of arrival", async () => {
        const outcomes = { cancelFirst: 0, acceptFirst: 0 };
        for (let run = 0; run < 50; run += 1) {
          const order = await routedOrder({
            deliveryDate: AHEAD,
            totalMinor: 7_500,
          });
          // Alternate head starts so both orders of arrival happen.
          const cancelDelay = run % 2 === 0 ? 0 : 10 + (run % 5) * 3;
          const acceptDelay = run % 2 === 0 ? 10 + (run % 5) * 3 : 0;
          const wait = (ms: number) =>
            new Promise((resolve) => setTimeout(resolve, ms));
          const [cancelled, accepted] = await Promise.all([
            wait(cancelDelay).then(() =>
              scratch.sql.begin((tx) =>
                cancelOrder(order.orderId, "buyer", "buyer_cancel", {
                  executor: runnerOf(tx),
                }),
              ),
            ),
            wait(acceptDelay).then(() => codeOf(accept(order, T0))),
          ]);
          await deliver(order.orderId, order.fake, T0);

          expect(cancelled.kind, `run ${String(run)}`).toBe("cancelled");
          const rows = await events(order.orderId);
          expect(
            rows.map((row) => row.seq),
            `run ${String(run)} seq`,
          ).toEqual(rows.map((_, index) => index + 1));
          expect(await status(order.orderId)).toBe("cancelled");
          expect(rows.some((row) => row.type === "order.in_production")).toBe(
            false,
          );
          const refunds = await scratch.sql<
            { amount_minor: string; status: string }[]
          >`SELECT amount_minor, status FROM refund WHERE order_id = ${order.orderId}`;
          expect(refunds.map((r) => ({ ...r }))).toEqual([
            { amount_minor: "7500", status: "succeeded" },
          ]);
          expect(
            order.fake.calls.filter((call) => call.method === "refund"),
          ).toHaveLength(1);

          const [assignment] = await scratch.sql<
            { response: string | null }[]
          >`SELECT response FROM order_assignment WHERE id = ${order.assignmentId}`;
          if (accepted === "done") {
            outcomes.acceptFirst += 1;
            expect(cancelled).toMatchObject({ fromStatus: "accepted" });
            expect(assignment?.response).toBe("accept");
            // The acceptance delivery wrote nothing after the cancel.
            const cancelSeq =
              rows.find((row) => row.type === "order.cancelled")?.seq ?? 0;
            expect(
              rows
                .filter(
                  (row) =>
                    row.seq > cancelSeq && row.actor === "system:payments",
                )
                .map((row) => row.type),
            ).toEqual(["order.refund_requested", "order.refunded_full"]);
            expect(
              await paymentsDelivery(order.orderId, "assignment.accepted"),
            ).toMatchObject({ status: "sent" });
          } else {
            outcomes.cancelFirst += 1;
            expect(accepted).toBe("ORDER_STATE_CHANGED");
            expect(cancelled).toMatchObject({ fromStatus: "routed" });
            expect(assignment?.response).toBeNull();
            expect(rows.some((row) => row.type === "assignment.accepted")).toBe(
              false,
            );
          }
        }
        expect(outcomes.cancelFirst).toBeGreaterThan(0);
        expect(outcomes.acceptFirst).toBeGreaterThan(0);
      }, 300_000);
    });

    // -----------------------------------------------------------------------------------------
    // AC-13: "No other spec's code writes order.in_production for these modes"
    // -----------------------------------------------------------------------------------------

    it("every order.in_production of a test or live order in this database was written by spec 013's two actors", async () => {
      const rows = await scratch.sql<{ actor: string }[]>`
        SELECT DISTINCT e.actor FROM order_event e JOIN "order" o ON o.id = e.order_id
        WHERE e.type = 'order.in_production' AND o.mode IN ('test', 'live')`;
      const actors = rows.map((row) => row.actor);
      expect(actors.length).toBeGreaterThan(0);
      for (const actor of actors) {
        expect(SYSTEM_IN_PRODUCTION_WRITERS.has(actor), actor).toBe(true);
      }
    });
  },
);
