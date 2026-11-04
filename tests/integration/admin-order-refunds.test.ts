/**
 * Spec 020a's refund actions and the action core on a disposable PG16 and the in-memory
 * `FakePaymentProvider` (spec 020a §2.1, §2.4, §5.1, §5.2; AC-4 to AC-7, AC-17 to AC-21, AC-23 /
 * T-05 to T-08, T-18 to T-20, T-22, T-24; TASK-359).
 *
 * Every action runs as the real thing would: `adminOrderRefund` → `runOrderAction` in an
 * admin-context transaction (`app.role = admin`, `app.audit_action`, `app.audit_reason`, then
 * `SET LOCAL ROLE app_web`, so RLS and spec 012's audit trigger are live) → spec 013's
 * `requestRefund` → after the commit `submitRefund` on the fake. Each case pays its own purchase.
 *
 * TASK-361 adds T-32 (AC-31): the log and Sentry spy of `support/pii-watch.ts` over the suite.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { PAYMENT_METHODS } from "@/config/payment-methods";
import {
  type OrderActionTransaction,
  orderRefunds,
} from "@/modules/admin/order-actions";
import {
  adminOrderRefund,
  type AdminOrderRefundDeps,
} from "@/modules/admin/order-actions/refund";
import type { OrderExecutor } from "@/modules/orders";
import { cancelOrder, refundCancelledOrder } from "@/modules/payments";
import { FakePaymentProvider } from "@/modules/payments/fake";
import {
  startPayment,
  syncFromProvider,
  type LifecycleDeps,
  type PaymentTransaction,
} from "@/modules/payments/lifecycle";
import type { MethodSources } from "@/modules/payments/methods";
import {
  providerFailure,
  type PaymentProvider,
} from "@/modules/payments/provider";

import { SET_F } from "../fixtures/order-machine.ts";
import { insertPlacedOrder, walkOrderTo } from "../fixtures/order-state.ts";
import { base, country, customer, recipient } from "./support/rows.ts";
import {
  asApp,
  pgFailure,
  probeLocalServer,
  scratchDatabase,
  type ScratchDatabase,
  type Tx,
} from "./support/scratch-db.ts";
import { runnerOf, sqlText } from "./support/sql-runner.ts";
import { watchLogsAndSentry } from "./support/pii-watch.ts";

const sentry = vi.hoisted(() => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}));
vi.mock("@sentry/nextjs", async (original) => ({
  ...(await original<typeof import("@sentry/nextjs")>()),
  ...sentry,
}));

const server = await probeLocalServer();
const watch = watchLogsAndSentry(sentry);

const T0 = new Date("2026-11-02T08:00:00.000Z");
const FAR_DATE = "2027-12-24";
const ADMIN_ID = randomUUID();
const ADMIN_NAME = "Refund Admin";
const BUYER_NAME = "Sentinel Buyer Name";
const NOTE = "SENTINEL-NOTE-7 buyer phoned";

const SESSION = {
  userId: ADMIN_ID,
  displayName: ADMIN_NAME,
  roles: ["admin" as const],
  timeZone: "Europe/Warsaw",
};

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
    namespace: `ar${String(fakes)}`,
    refunds: "sync",
  });
}

/** The fake, except that `refund` answers with `answer`. */
function refundingWith(
  fake: FakePaymentProvider,
  answer: PaymentProvider["refund"],
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

const failing = (fake: FakePaymentProvider): PaymentProvider =>
  refundingWith(fake, (ref, amount) =>
    Promise.resolve({
      ref: `failed-${randomUUID()}`,
      intentRef: ref,
      status: "failed",
      amount: { ...amount },
    }),
  );

const pendingAnswer = (fake: FakePaymentProvider): PaymentProvider =>
  refundingWith(fake, (ref, amount) =>
    Promise.resolve({
      ref: `pending-${randomUUID()}`,
      intentRef: ref,
      status: "pending",
      amount: { ...amount },
    }),
  );

const unavailable = (fake: FakePaymentProvider): PaymentProvider =>
  refundingWith(fake, () => Promise.resolve(providerFailure("unavailable")));

/** A tiny seeded generator, so the property case replays the same sequences every run. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 2 ** 32;
  };
}

/** Minor units as the PLN text an admin types ("57.99"). */
function plnText(minor: number): string {
  const whole = Math.trunc(minor / 100);
  const cents = minor % 100;
  return `${String(whole)}.${String(cents).padStart(2, "0")}`;
}

interface Paid {
  readonly purchaseId: string;
  readonly orderIds: readonly string[];
  readonly paymentId: string;
  readonly fake: FakePaymentProvider;
}

describe.skipIf(server.url === undefined)(
  `spec 020a refund actions${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "admin_refunds");
      await scratch.sql`INSERT INTO users (id, email) VALUES (${ADMIN_ID}, 'refund-admin@example.test')`;
      await scratch.sql`INSERT INTO admin_profile (user_id, display_name) VALUES (${ADMIN_ID}, ${ADMIN_NAME})`;
    }, 600_000);

    afterAll(async () => {
      await scratch.drop();
    });

    const transactionOf =
      (): PaymentTransaction =>
      <T>(fn: (executor: OrderExecutor) => Promise<T>) =>
        scratch.sql.begin((tx) => fn(runnerOf(tx))) as Promise<T>;

    /** `withAdminContext` as the database sees it, on the scratch database. */
    const adminTransaction: OrderActionTransaction = (context, fn) =>
      scratch.sql.begin(async (tx) => {
        await tx`SELECT set_config('app.audit_action', ${context.action}, true)`;
        await tx`SELECT set_config('app.audit_reason', ${context.reason ?? ""}, true)`;
        await asApp(tx, {
          role: "admin",
          ...(context.userId === undefined ? {} : { userId: context.userId }),
        });
        return fn(runnerOf(tx));
      }) as never;

    /**
     * `adminTransaction`, except that each caller pauses just before it looks the action id up,
     * until the other caller arrives there too (or 300 ms pass). With the lock in place the second
     * caller is still waiting on the lock, so the first times out and goes on; without it both
     * look up at once and both miss, which is the race T-06 exists to catch.
     */
    function racingTransaction(): OrderActionTransaction {
      let arrived = 0;
      let release: () => void = () => undefined;
      const together = new Promise<void>((resolve) => {
        release = resolve;
      });
      return (context, fn) =>
        adminTransaction(context, (executor) =>
          fn({
            async execute(query) {
              if (/FROM admin_order_action WHERE id/.test(sqlText(query))) {
                arrived += 1;
                if (arrived >= 2) release();
                await Promise.race([
                  together,
                  new Promise((resolve) => setTimeout(resolve, 300)),
                ]);
              }
              return executor.execute(query);
            },
          }),
        );
    }

    function lifecycleOf(provider: PaymentProvider): LifecycleDeps {
      return {
        provider,
        transaction: transactionOf(),
        now: () => T0,
        alert: () => undefined,
        methodSources: () => Promise.resolve(METHODS_ON),
      };
    }

    function depsOf(
      provider: PaymentProvider,
      guard: AdminOrderRefundDeps["guard"] = () => Promise.resolve(SESSION),
    ): AdminOrderRefundDeps {
      return {
        guard,
        transaction: adminTransaction,
        refund: lifecycleOf(provider),
      };
    }

    async function purchaseOf(
      totals: readonly number[],
      mode: "test" | "demo" = "test",
    ): Promise<{ purchaseId: string; orderIds: string[] }> {
      return scratch.sql.begin(async (tx) => {
        await base(tx);
        const customerId = await customer(tx);
        const recipientId = await recipient(tx, customerId);
        const total = totals.reduce((a, b) => a + b, 0);
        const [row] = await tx<{ id: string }[]>`
          INSERT INTO purchase (mode, buyer_currency_code, total_minor, locale_code, customer_id)
          VALUES (${mode}, 'PLN', ${total}, 'en', ${customerId})
          RETURNING id`;
        const purchaseId = row?.id ?? "";
        const countryId = await country(tx, "PL");
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
                   SET buyer_snapshot = ${tx.json({ name: BUYER_NAME, countryIso2: "GB" })},
                       delivery_date = ${FAR_DATE}::date
                   WHERE id = ${orderId}`;
          orderIds.push(orderId);
        }
        return { purchaseId, orderIds };
      }) as Promise<{ purchaseId: string; orderIds: string[] }>;
    }

    async function paidPurchase(totals: readonly number[]): Promise<Paid> {
      const fake = newFake();
      const purchase = await purchaseOf(totals);
      const started = await startPayment(
        purchase.purchaseId,
        lifecycleOf(fake),
      );
      if (started.kind !== "started") throw new Error(started.kind);
      await fake.simulateSuccess(started.intentRef);
      const synced = await syncFromProvider(
        purchase.purchaseId,
        lifecycleOf(fake),
      );
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

    async function seqOf(orderId: string): Promise<number> {
      const [row] = await scratch.sql<{ seq: number }[]>`
        SELECT coalesce(max(seq), 0)::int AS seq FROM order_event WHERE order_id = ${orderId}`;
      return row?.seq ?? 0;
    }

    interface RefundRow {
      readonly id: string;
      readonly amount_minor: string;
      readonly status: string;
      readonly reason: string;
      readonly requested_by: string;
    }

    async function refundRows(orderId: string): Promise<RefundRow[]> {
      return (
        await scratch.sql<RefundRow[]>`
          SELECT id, amount_minor, status, reason, requested_by
          FROM refund WHERE order_id = ${orderId} ORDER BY created_at, id`
      ).map((row) => ({ ...row }));
    }

    async function counts(orderId: string): Promise<{
      refunds: number;
      actions: number;
      audits: number;
      events: number;
    }> {
      const [row] = await scratch.sql<
        { refunds: number; actions: number; audits: number; events: number }[]
      >`
        SELECT (SELECT count(*)::int FROM refund WHERE order_id = ${orderId}) AS refunds,
               (SELECT count(*)::int FROM admin_order_action WHERE order_id = ${orderId}) AS actions,
               (SELECT count(*)::int FROM audit_log a
                  JOIN admin_order_action x ON a.entity_id = x.id::text
                 WHERE a.entity_table = 'admin_order_action' AND x.order_id = ${orderId}) AS audits,
               (SELECT count(*)::int FROM order_event WHERE order_id = ${orderId}) AS events`;
      return row ?? { refunds: -1, actions: -1, audits: -1, events: -1 };
    }

    const refundCalls = (fake: FakePaymentProvider) =>
      fake.calls.filter((call) => call.method === "refund").length;

    /** One submission, with the order's current `expectedSeq` unless given. */
    async function act(
      orderId: string,
      body: Record<string, unknown>,
      deps: AdminOrderRefundDeps,
      options: { actionId?: string; expectedSeq?: number } = {},
    ) {
      return adminOrderRefund(
        {
          orderId,
          actionId: options.actionId ?? randomUUID(),
          expectedSeq: options.expectedSeq ?? (await seqOf(orderId)),
          ...body,
        },
        deps,
      );
    }

    const full = (reason = "quality", note?: string) => ({
      kind: "full",
      reason,
      ...(note === undefined ? {} : { note }),
    });
    const partial = (amountText: string, reason = "quality") => ({
      kind: "partial",
      amountText,
      reason,
    });

    // -----------------------------------------------------------------------------------------
    // The migration (AC-7)
    // -----------------------------------------------------------------------------------------

    it("T-08: admin_order_action is append-only; an admin insert without app.audit_action raises AUDIT_ACTION_MISSING", async () => {
      const paid = await paidPurchase([5_800]);
      const orderId = paid.orderIds[0] ?? "";
      await walk(orderId, "delivered");
      const result = await act(orderId, partial("10"), depsOf(paid.fake));
      expect(result).toMatchObject({ ok: true, replayed: false });
      await scratch.sql.begin(async (tx: Tx) => {
        const update = await pgFailure(tx, (sp) =>
          sp.unsafe(
            `UPDATE admin_order_action SET result_ref = 'x' WHERE order_id = '${orderId}'`,
          ),
        );
        expect(update.raised).toBe("ADMIN_ORDER_ACTION_APPEND_ONLY");
        const remove = await pgFailure(tx, (sp) =>
          sp.unsafe(
            `DELETE FROM admin_order_action WHERE order_id = '${orderId}'`,
          ),
        );
        expect(remove.raised).toBe("ADMIN_ORDER_ACTION_APPEND_ONLY");
        await tx`SELECT set_config('app.audit_action', '', true)`;
        await asApp(tx, { role: "admin", userId: ADMIN_ID });
        const missing = await pgFailure(
          tx,
          (sp) => sp`
            INSERT INTO admin_order_action (id, order_id, kind, actor_user_id, reason, result_ref)
            VALUES (${randomUUID()}, ${orderId}, 'cancel', ${ADMIN_ID}, 'other', 'x')`,
        );
        expect(missing.raised).toBe("AUDIT_ACTION_MISSING");
      });
    });

    // -----------------------------------------------------------------------------------------
    // The action core: staleness, replay, audit (AC-4, AC-5, AC-6)
    // -----------------------------------------------------------------------------------------

    it("T-05: a stale expectedSeq is ORDER_CHANGED and writes nothing; a demo order is DEMO_ORDER", async () => {
      const paid = await paidPurchase([5_800]);
      const orderId = paid.orderIds[0] ?? "";
      await walk(orderId, "delivered");
      const before = await counts(orderId);
      const seq = await seqOf(orderId);
      expect(
        await act(orderId, partial("10"), depsOf(paid.fake), {
          expectedSeq: seq - 1,
        }),
      ).toEqual({ ok: false, code: "ORDER_CHANGED" });
      expect(await counts(orderId)).toEqual(before);
      expect(refundCalls(paid.fake)).toBe(0);

      const demo = await purchaseOf([5_800], "demo");
      const demoId = demo.orderIds[0] ?? "";
      expect(await act(demoId, full(), depsOf(paid.fake))).toEqual({
        ok: false,
        code: "DEMO_ORDER",
      });
      expect((await counts(demoId)).actions).toBe(0);
    });

    it("T-06: one actionId twice in sequence and twice in parallel: one refund, one provider call, the second replayed with the first resultRef", async () => {
      for (const parallel of [false, true]) {
        const paid = await paidPurchase([5_800]);
        const orderId = paid.orderIds[0] ?? "";
        await walk(orderId, "delivered");
        const actionId = randomUUID();
        const expectedSeq = await seqOf(orderId);
        const deps = {
          ...depsOf(paid.fake),
          ...(parallel ? { transaction: racingTransaction() } : {}),
        };
        const submit = () =>
          act(orderId, partial("12,50"), deps, { actionId, expectedSeq });
        const results = parallel
          ? await Promise.all([submit(), submit()])
          : [await submit(), await submit()];
        const okResults = results.filter((r) => r.ok);
        expect(okResults).toHaveLength(2);
        const refs = new Set(okResults.map((r) => (r.ok ? r.resultRef : "")));
        expect(refs.size).toBe(1);
        expect(results.map((r) => (r.ok ? r.replayed : null)).sort()).toEqual([
          false,
          true,
        ]);
        const rows = await refundRows(orderId);
        expect(rows.map((r) => [r.id, r.amount_minor])).toEqual([
          [[...refs][0], "1250"],
        ]);
        expect(refundCalls(paid.fake)).toBe(1);
        expect((await counts(orderId)).actions).toBe(1);
      }
    });

    it("T-07: an effective action writes one action row and one audit row in the refund's transaction, with the note as reason and no buyer data; a refused one writes neither", async () => {
      const paid = await paidPurchase([5_800]);
      const orderId = paid.orderIds[0] ?? "";
      await walk(orderId, "delivered");
      const actionId = randomUUID();
      const result = await act(
        orderId,
        { kind: "partial", amountText: "20", reason: "other", note: NOTE },
        depsOf(paid.fake),
        { actionId },
      );
      expect(result).toMatchObject({ ok: true, kind: "refund_partial" });
      const [action] = await scratch.sql<
        {
          kind: string;
          reason: string;
          amount_minor: string;
          currency_code: string;
          actor_user_id: string;
          result_ref: string;
          xmin: string;
        }[]
      >`SELECT kind, reason, amount_minor, currency_code, actor_user_id, result_ref,
               xmin::text AS xmin
        FROM admin_order_action WHERE id = ${actionId}`;
      expect(action).toMatchObject({
        kind: "refund_partial",
        reason: "other",
        amount_minor: "2000",
        currency_code: "PLN",
        actor_user_id: ADMIN_ID,
        result_ref: result.ok ? result.resultRef : "",
      });
      const audits = await scratch.sql<
        {
          action: string;
          actor_user_id: string;
          actor_label: string;
          reason: string;
          after: unknown;
          xmin: string;
        }[]
      >`SELECT action, actor_user_id, actor_label, reason, after, xmin::text AS xmin
        FROM audit_log WHERE entity_table = 'admin_order_action' AND entity_id = ${actionId}`;
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({
        action: "order.action.refund_partial",
        actor_user_id: ADMIN_ID,
        actor_label: ADMIN_NAME,
        reason: NOTE,
      });
      const [refundTx] = await scratch.sql<{ xmin: string }[]>`
        SELECT xmin::text AS xmin FROM order_event
        WHERE order_id = ${orderId} AND type = 'order.refund_requested'`;
      expect(audits[0]?.xmin).toBe(action?.xmin);
      expect(refundTx?.xmin).toBe(action?.xmin);
      const written = JSON.stringify([action, audits]);
      expect(written).not.toContain(BUYER_NAME);
      expect(JSON.stringify(action)).not.toContain("SENTINEL-NOTE-7");

      const before = await counts(orderId);
      expect(
        await act(orderId, partial("99999"), depsOf(paid.fake)),
      ).toMatchObject({ ok: false, code: "REFUND_EXCEEDS_CAPTURED" });
      expect(await counts(orderId)).toEqual(before);
    });

    it("the guard runs first: a refused guard reads and writes nothing", async () => {
      const paid = await paidPurchase([5_800]);
      const orderId = paid.orderIds[0] ?? "";
      await walk(orderId, "delivered");
      const before = await counts(orderId);
      const asked: string[] = [];
      await expect(
        act(
          orderId,
          partial("10"),
          depsOf(paid.fake, (permission) => {
            asked.push(permission);
            return Promise.reject(new Error("FORBIDDEN"));
          }),
        ),
      ).rejects.toThrow("FORBIDDEN");
      expect(asked).toEqual(["orders.refund"]);
      expect(await counts(orderId)).toEqual(before);
      const ops = await act(
        orderId,
        partial("10"),
        depsOf(paid.fake, () =>
          Promise.resolve({ ...SESSION, roles: ["ops"] }),
        ),
      );
      expect(ops).toEqual({ ok: false, code: "FORBIDDEN" });
      expect(await counts(orderId)).toEqual(before);
    });

    // -----------------------------------------------------------------------------------------
    // Refund in full (AC-17)
    // -----------------------------------------------------------------------------------------

    for (const state of SET_F) {
      it(`T-18: in ${state}, "Refund in full" requests captured minus succeeded and pending refunds; with no partial outstanding it ends refunded_full`, async () => {
        const paid = await paidPurchase([5_800, 4_000]);
        const orderId = paid.orderIds[0] ?? "";
        await walk(orderId, state);
        expect(
          await act(orderId, partial("10"), depsOf(paid.fake)),
        ).toMatchObject({ ok: true });
        expect(
          await act(orderId, partial("5"), depsOf(pendingAnswer(paid.fake))),
        ).toMatchObject({ ok: true });
        expect((await refundRows(orderId)).map((r) => r.status)).toEqual([
          "succeeded",
          "pending",
        ]);
        const result = await act(
          orderId,
          full("goodwill"),
          depsOf(pendingAnswer(paid.fake)),
        );
        expect(result).toMatchObject({ ok: true, kind: "refund_full" });
        const rows = await refundRows(orderId);
        expect(rows.at(-1)).toMatchObject({
          amount_minor: "4300",
          reason: "goodwill",
          requested_by: `admin:${ADMIN_ID}`,
        });
        // The other order of the purchase is untouched (each refund names its order).
        expect(await refundRows(paid.orderIds[1] ?? "")).toEqual([]);

        // With nothing pending, the full refund settles and the order ends refunded_full.
        const second = await paidPurchase([5_800]);
        const secondId = second.orderIds[0] ?? "";
        await walk(secondId, state);
        expect(
          await act(secondId, partial("10"), depsOf(second.fake)),
        ).toMatchObject({ ok: true });
        expect(
          await act(secondId, full("goodwill"), depsOf(second.fake)),
        ).toMatchObject({ ok: true });
        expect(
          (await refundRows(secondId)).map((r) => [r.amount_minor, r.status]),
        ).toEqual([
          ["1000", "succeeded"],
          ["4800", "succeeded"],
        ]);
        expect(await status(secondId)).toBe("refunded_full");
      });
    }

    it("T-18: a cancelled order whose automatic refund failed: the remainder, with the cancellation's reason, status unchanged", async () => {
      const paid = await paidPurchase([5_800]);
      const orderId = paid.orderIds[0] ?? "";
      await walk(orderId, "routed");
      await scratch.sql.begin((tx) =>
        cancelOrder(orderId, `admin:${ADMIN_ID}`, "buyer_cancel", {
          executor: runnerOf(tx),
        }),
      );
      const automatic = await refundCancelledOrder(
        orderId,
        lifecycleOf(failing(paid.fake)),
      );
      expect(automatic).toMatchObject({
        kind: "requested",
        submitted: { kind: "failed" },
      });
      expect(await status(orderId)).toBe("cancelled");
      // A partial refund is not offered on a cancelled order.
      expect(await act(orderId, partial("10"), depsOf(paid.fake))).toEqual({
        ok: false,
        code: "NOT_REFUNDABLE",
      });
      const result = await act(orderId, full("quality"), depsOf(paid.fake));
      expect(result).toMatchObject({ ok: true, kind: "refund_full" });
      expect((await refundRows(orderId)).at(-1)).toMatchObject({
        amount_minor: "5800",
        reason: "buyer_cancel",
        status: "succeeded",
      });
      expect(await status(orderId)).toBe("cancelled");
      // Nothing remains: a second retry is refused, no provider call.
      const calls = refundCalls(paid.fake);
      expect(await act(orderId, full("quality"), depsOf(paid.fake))).toEqual({
        ok: false,
        code: "NOT_REFUNDABLE",
      });
      expect(refundCalls(paid.fake)).toBe(calls);
    });

    // -----------------------------------------------------------------------------------------
    // Refund in part (AC-18, AC-19, AC-20)
    // -----------------------------------------------------------------------------------------

    it("T-19: remaining 5 800: 5 800 is the full-refund message, 5 801 REFUND_EXCEEDS_CAPTURED, no provider call; 5 799 succeeds with the status unchanged", async () => {
      const paid = await paidPurchase([5_800]);
      const orderId = paid.orderIds[0] ?? "";
      await walk(orderId, "delivered");
      expect(await act(orderId, partial("58.00"), depsOf(paid.fake))).toEqual({
        ok: false,
        code: "REFUND_EXCEEDS_CAPTURED",
        hint: "use_full_refund",
      });
      expect(await act(orderId, partial("58.01"), depsOf(paid.fake))).toEqual({
        ok: false,
        code: "REFUND_EXCEEDS_CAPTURED",
      });
      expect(refundCalls(paid.fake)).toBe(0);
      expect(await refundRows(orderId)).toEqual([]);
      expect(
        await act(orderId, partial("57.99"), depsOf(paid.fake)),
      ).toMatchObject({ ok: true, kind: "refund_partial" });
      expect(
        (await refundRows(orderId)).map((r) => [r.amount_minor, r.status]),
      ).toEqual([["5799", "succeeded"]]);
      expect(await status(orderId)).toBe("delivered");
      expect(refundCalls(paid.fake)).toBe(1);
      // One unit left: below two, so no partial; the full refund takes it.
      expect(await act(orderId, partial("0.01"), depsOf(paid.fake))).toEqual({
        ok: false,
        code: "NOT_REFUNDABLE",
      });
      expect(
        await act(orderId, full("goodwill"), depsOf(paid.fake)),
      ).toMatchObject({ ok: true });
      expect(await status(orderId)).toBe("refunded_full");
    });

    it("money text: zero, rounding, signs and floats are AMOUNT_INVALID and write nothing", async () => {
      const paid = await paidPurchase([5_800]);
      const orderId = paid.orderIds[0] ?? "";
      await walk(orderId, "delivered");
      const before = await counts(orderId);
      for (const text of [
        "0",
        "0.00",
        "12.505",
        "1e3",
        "-5",
        " ",
        "",
        "12.50 zł",
        "0,001",
      ]) {
        expect(
          await act(orderId, partial(text), depsOf(paid.fake)),
          text,
        ).toEqual({
          ok: false,
          code: "AMOUNT_INVALID",
        });
      }
      expect(await counts(orderId)).toEqual(before);
      expect(refundCalls(paid.fake)).toBe(0);
      expect(
        await act(orderId, partial("0,01"), depsOf(paid.fake)),
      ).toMatchObject({ ok: true });
      expect((await refundRows(orderId)).map((r) => r.amount_minor)).toEqual([
        "1",
      ]);
    });

    it("T-20: two concurrent partials of 3 000 on 5 000: one row, one refusal; re-read expectedSeq: REFUND_EXCEEDS_CAPTURED", async () => {
      const paid = await paidPurchase([5_000]);
      const orderId = paid.orderIds[0] ?? "";
      await walk(orderId, "delivered");
      const expectedSeq = await seqOf(orderId);
      const results = await Promise.all([
        act(orderId, partial("30"), depsOf(paid.fake), { expectedSeq }),
        act(orderId, partial("30"), depsOf(paid.fake), { expectedSeq }),
      ]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      const refused = results.find((r) => !r.ok);
      expect(["ORDER_CHANGED", "REFUND_EXCEEDS_CAPTURED"]).toContain(
        refused !== undefined && !refused.ok ? refused.code : "",
      );
      expect(await refundRows(orderId)).toHaveLength(1);
      expect(await act(orderId, partial("30"), depsOf(paid.fake))).toEqual({
        ok: false,
        code: "REFUND_EXCEEDS_CAPTURED",
      });
      expect(await refundRows(orderId)).toHaveLength(1);
      expect(refundCalls(paid.fake)).toBe(1);
    });

    it("T-20 property: 200 random sequences of full and partial refunds and refund failures never refund more than the order's total or the payment's capture", async () => {
      const random = seeded(20_202);
      const SEQUENCES = 200;
      const PER_PURCHASE = 20;
      let checked = 0;
      for (let batch = 0; batch < SEQUENCES / PER_PURCHASE; batch += 1) {
        const totals = Array.from(
          { length: PER_PURCHASE },
          () => 200 + Math.floor(random() * 9_800),
        );
        const paid = await paidPurchase(totals);
        for (const orderId of paid.orderIds) {
          await walk(orderId, "delivered");
        }
        for (const [index, orderId] of paid.orderIds.entries()) {
          const total = totals[index] ?? 0;
          const steps = 2 + Math.floor(random() * 4);
          for (let step = 0; step < steps; step += 1) {
            const roll = random();
            const provider = random() < 0.25 ? failing(paid.fake) : paid.fake;
            const body =
              roll < 0.2
                ? full("goodwill")
                : partial(plnText(1 + Math.floor(random() * (total + 200))));
            await act(orderId, body, depsOf(provider));
            const [sums] = await scratch.sql<
              { order_sum: string; payment_sum: string; captured: string }[]
            >`
              SELECT
                (SELECT coalesce(sum(amount_minor), 0) FROM refund
                  WHERE order_id = ${orderId} AND status <> 'failed') AS order_sum,
                (SELECT coalesce(sum(amount_minor), 0) FROM refund
                  WHERE payment_id = ${paid.paymentId} AND status <> 'failed') AS payment_sum,
                (SELECT amount_captured_minor FROM payment WHERE id = ${paid.paymentId}) AS captured`;
            expect(BigInt(sums?.order_sum ?? "-1")).toBeLessThanOrEqual(
              BigInt(total),
            );
            expect(BigInt(sums?.payment_sum ?? "-1")).toBeLessThanOrEqual(
              BigInt(sums?.captured ?? "0"),
            );
          }
          checked += 1;
        }
      }
      expect(checked).toBe(SEQUENCES);
    }, 600_000);

    it("T-21 (DB half): the chosen reason reaches the refund row and order.refund_requested unchanged; a forged system reason or other without a note is INPUT_INVALID", async () => {
      const paid = await paidPurchase([5_800]);
      const orderId = paid.orderIds[0] ?? "";
      await walk(orderId, "delivered");
      expect(
        await act(
          orderId,
          partial("13.50", "substitution_complaint"),
          depsOf(paid.fake),
        ),
      ).toMatchObject({ ok: true });
      expect((await refundRows(orderId))[0]?.reason).toBe(
        "substitution_complaint",
      );
      const [event] = await scratch.sql<{ reason: string; actor: string }[]>`
        SELECT payload ->> 'reason' AS reason, actor FROM order_event
        WHERE order_id = ${orderId} AND type = 'order.refund_requested'`;
      expect(event).toEqual({
        reason: "substitution_complaint",
        actor: `admin:${ADMIN_ID}`,
      });
      const before = await counts(orderId);
      for (const body of [
        partial("1", "buyer_cancel"),
        partial("1", "redelivery_failed"),
        full("no_partner"),
        { kind: "partial", amountText: "1", reason: "other" },
        { ...partial("1"), destination: "acct_x" },
      ]) {
        expect(await act(orderId, body, depsOf(paid.fake))).toEqual({
          ok: false,
          code: "INPUT_INVALID",
        });
      }
      expect(await counts(orderId)).toEqual(before);
    });

    // -----------------------------------------------------------------------------------------
    // Not refundable (AC-21)
    // -----------------------------------------------------------------------------------------

    for (const state of [
      "refunded_full",
      "closed",
      "chargeback_open",
      "chargeback_won",
      "chargeback_lost",
    ]) {
      it(`T-22: on ${state} a forged refund, full or partial, is NOT_REFUNDABLE with no provider call and no row`, async () => {
        const paid = await paidPurchase([5_800]);
        const orderId = paid.orderIds[0] ?? "";
        await walk(orderId, state);
        const before = await counts(orderId);
        for (const body of [full(), partial("10")]) {
          expect(await act(orderId, body, depsOf(paid.fake))).toEqual({
            ok: false,
            code: "NOT_REFUNDABLE",
          });
        }
        expect(await counts(orderId)).toEqual(before);
        expect(refundCalls(paid.fake)).toBe(0);
      });
    }

    it("T-22: on placed (nothing captured) a forged refund is NOT_REFUNDABLE", async () => {
      const purchase = await purchaseOf([5_800]);
      const orderId = purchase.orderIds[0] ?? "";
      const fake = newFake();
      for (const body of [full(), partial("10")]) {
        expect(await act(orderId, body, depsOf(fake))).toEqual({
          ok: false,
          code: "NOT_REFUNDABLE",
        });
      }
      expect((await counts(orderId)).actions).toBe(0);
    });

    it("T-22: an abandoned order with a captured payment: only the full refund, reason fixed to other", async () => {
      const fake = newFake();
      const purchase = await purchaseOf([5_800]);
      const orderId = purchase.orderIds[0] ?? "";
      const started = await startPayment(
        purchase.purchaseId,
        lifecycleOf(fake),
      );
      if (started.kind !== "started") throw new Error(started.kind);
      await walk(orderId, "abandoned");
      await fake.simulateSuccess(started.intentRef);
      const synced = await syncFromProvider(
        purchase.purchaseId,
        lifecycleOf(failing(fake)),
      );
      expect(synced.outcome).toBe("captured_after_close");
      expect(await act(orderId, partial("10"), depsOf(fake))).toEqual({
        ok: false,
        code: "NOT_REFUNDABLE",
      });
      const result = await act(orderId, full("goodwill"), depsOf(fake));
      expect(result).toMatchObject({ ok: true, kind: "refund_full" });
      expect((await refundRows(orderId)).at(-1)).toMatchObject({
        amount_minor: "5800",
        reason: "other",
        status: "succeeded",
      });
      expect(await status(orderId)).toBe("abandoned");
    });

    // -----------------------------------------------------------------------------------------
    // The refunds list (AC-23)
    // -----------------------------------------------------------------------------------------

    it("T-24: the list shows requested, pending, succeeded and failed rows with their fields; remaining is the total minus requested, pending and succeeded", async () => {
      const paid = await paidPurchase([5_800]);
      const orderId = paid.orderIds[0] ?? "";
      await walk(orderId, "delivered");
      expect(
        await act(orderId, partial("10", "quality"), depsOf(paid.fake)),
      ).toMatchObject({ ok: true });
      expect(
        await act(
          orderId,
          partial("5", "late_delivery"),
          depsOf(pendingAnswer(paid.fake)),
        ),
      ).toMatchObject({ ok: true });
      expect(
        await act(
          orderId,
          partial("7", "goodwill"),
          depsOf(failing(paid.fake)),
        ),
      ).toMatchObject({ ok: true });
      expect(
        await act(
          orderId,
          partial("3", "duplicate"),
          depsOf(unavailable(paid.fake)),
        ),
      ).toMatchObject({ ok: true });

      const list = await orderRefunds(
        orderId,
        { userId: ADMIN_ID },
        { transaction: adminTransaction },
      );
      expect(list).not.toBeNull();
      expect(
        list?.refunds.map((r) => [
          r.status,
          r.amountMinor,
          r.currencyCode,
          r.reason,
          r.requestedBy,
          r.succeededAt === null ? null : "set",
        ]),
      ).toEqual([
        [
          "succeeded",
          1000n,
          "PLN",
          "quality",
          { kind: "admin", displayName: ADMIN_NAME },
          "set",
        ],
        [
          "pending",
          500n,
          "PLN",
          "late_delivery",
          { kind: "admin", displayName: ADMIN_NAME },
          null,
        ],
        [
          "failed",
          700n,
          "PLN",
          "goodwill",
          { kind: "admin", displayName: ADMIN_NAME },
          null,
        ],
        [
          "requested",
          300n,
          "PLN",
          "duplicate",
          { kind: "admin", displayName: ADMIN_NAME },
          null,
        ],
      ]);
      expect(list?.capturedMinor).toBe(5_800n);
      expect(list?.remainingMinor).toBe(5_800n - 1_000n - 500n - 300n);
      expect(list?.refundInFlight).toBe(true);
      expect(
        JSON.stringify(list, (_k, v: unknown) =>
          typeof v === "bigint" ? v.toString() : v,
        ),
      ).not.toContain(BUYER_NAME);
      expect(
        await orderRefunds(
          randomUUID(),
          { userId: ADMIN_ID },
          { transaction: adminTransaction },
        ),
      ).toBeNull();
    });

    it("T-32 (AC-31): over this suite no log line or Sentry event carries a person, the note, a token or a link", async () => {
      const tokens = (
        await scratch.sql<
          { public_token: string }[]
        >`SELECT public_token FROM "order"`
      ).map((row) => row.public_token);
      expect(watch.captured()).toContain("admin.order_action");
      watch.expectClean([
        "SENTINEL-NOTE-7",
        BUYER_NAME,
        "Test Recipient",
        "+48500000000",
        "@example.test",
        ...tokens,
      ]);
    });
  },
);
