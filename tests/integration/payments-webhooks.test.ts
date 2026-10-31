/**
 * The payment webhook inbox on a disposable PG16 and the in-memory `FakePaymentProvider` (spec
 * 013 §5.2 "Webhook inbox"; AC-10 event half, AC-21 to AC-26 / T-10, T-21 to T-26; TASK-260).
 *
 * No Stripe account exists (spec 013 §14 item 12): every event is the fake's, signed with the
 * fake's secret the way Stripe signs (`t=…,v1=HMAC-SHA256(t.body)`), and every intent is
 * retrieved from the fake. AC-24's refund and dispute sequences need TASK-261's paths: here those
 * types are proved to be stored and left `ignored` with `awaiting_handler`, moving nothing.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PAYMENT_METHODS } from "@/config/payment-methods";
import type { OrderExecutor } from "@/modules/orders";
import { FakePaymentProvider } from "@/modules/payments/fake";
import {
  startPayment,
  type LifecycleDeps,
  type PaymentTransaction,
} from "@/modules/payments/lifecycle";
import type { MethodSources } from "@/modules/payments/methods";
import type { WebhookHeaders } from "@/modules/payments/provider";
import {
  ingestStripeWebhook,
  ingestWebhook,
  processWebhook,
  replayStripeWebhooks,
  replayWebhooks,
  WEBHOOK_MAX_BYTES,
  type IngestDeps,
  type ProcessDeps,
} from "@/modules/payments/webhooks";

import { insertPlacedOrder } from "../fixtures/order-state.ts";
import { base, country, customer, recipient } from "./support/rows.ts";
import {
  probeLocalServer,
  scratchDatabase,
  type ScratchDatabase,
} from "./support/scratch-db.ts";
import { runnerOf } from "./support/sql-runner.ts";

const server = await probeLocalServer();

const T0 = new Date("2026-10-16T08:00:00.000Z");

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
function newFake(options: { livemode?: boolean } = {}): FakePaymentProvider {
  fakes += 1;
  return new FakePaymentProvider({
    now: () => T0,
    namespace: `wh${String(fakes)}`,
    ...(options.livemode === undefined ? {} : { livemode: options.livemode }),
  });
}

interface Alert {
  readonly alert: string;
  readonly fields: Readonly<Record<string, unknown>>;
}

describe.skipIf(server.url === undefined)(
  `spec 013 webhook inbox${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "webhooks");
    }, 600_000);

    afterAll(async () => {
      await scratch.drop();
    });

    const transactionOf =
      (): PaymentTransaction =>
      <T>(fn: (executor: OrderExecutor) => Promise<T>) =>
        scratch.sql.begin((tx) => fn(runnerOf(tx))) as Promise<T>;

    function lifecycleOf(fake: FakePaymentProvider): LifecycleDeps {
      return {
        provider: fake,
        transaction: transactionOf(),
        now: () => T0,
        alert: () => undefined,
        methodSources: () => Promise.resolve(METHODS_ON),
      };
    }

    function ingestOf(
      fake: FakePaymentProvider,
      enqueued: string[] = [],
      livemode = false,
    ): IngestDeps {
      return {
        provider: fake,
        livemode,
        transaction: transactionOf(),
        now: () => T0,
        enqueue: (inboxId) => {
          enqueued.push(inboxId);
          return Promise.resolve();
        },
      };
    }

    function processOf(
      fake: FakePaymentProvider,
      alerts: Alert[] = [],
    ): ProcessDeps {
      return {
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
    }

    /** A committed `test` purchase of `totals` with its payment started on `fake`. */
    async function started(
      fake: FakePaymentProvider,
      totals: readonly number[] = [18_900],
    ): Promise<{
      orderIds: string[];
      paymentId: string;
      intentRef: string;
    }> {
      const orderIds = await scratch.sql.begin(async (tx) => {
        await base(tx);
        const customerId = await customer(tx);
        const recipientId = await recipient(tx, customerId);
        const total = totals.reduce((a, b) => a + b, 0);
        const [row] = await tx<{ id: string }[]>`
          INSERT INTO purchase (mode, buyer_currency_code, total_minor, locale_code, customer_id)
          VALUES ('test', 'PLN', ${total}, 'en', ${customerId}) RETURNING id`;
        const countryId = await country(tx, "PL");
        const ids: string[] = [];
        for (const totalMinor of totals) {
          const orderId = await insertPlacedOrder(tx, {
            customerId,
            recipientId,
            countryId,
            mode: "test",
            totalMinor,
            purchaseId: row?.id ?? "",
          });
          await tx`UPDATE "order"
                   SET buyer_snapshot = '{"name": "Test Buyer", "countryIso2": "GB"}'::jsonb
                   WHERE id = ${orderId}`;
          ids.push(orderId);
        }
        return ids;
      });
      const purchaseId = (
        await scratch.sql<{ purchase_id: string }[]>`
          SELECT purchase_id FROM "order" WHERE id = ${orderIds[0] ?? ""}`
      )[0]?.purchase_id;
      const result = await startPayment(purchaseId ?? "", lifecycleOf(fake));
      if (result.kind !== "started") throw new Error(result.kind);
      return {
        orderIds,
        paymentId: result.paymentId,
        intentRef: result.intentRef,
      };
    }

    /** A signed delivery of a new fake event about `ref`. */
    async function delivery(
      fake: FakePaymentProvider,
      type: string,
      ref: string,
      signedAt: Date = T0,
    ): Promise<{ eventId: string; rawBody: string; headers: WebhookHeaders }> {
      const event = await fake.simulateEvent(type, ref, T0);
      const rawBody = fake.eventBodyOf(event);
      const { headers } = fake.sign(rawBody, signedAt);
      return { eventId: event.id, rawBody, headers: { ...headers } };
    }

    async function rowsOf(eventId: string) {
      return scratch.sql<
        {
          id: string;
          status: string;
          ignore_reason: string | null;
          attempts: number;
          processed_at: Date | null;
          signature_verified: boolean;
        }[]
      >`SELECT id, status, ignore_reason, attempts, processed_at, signature_verified
        FROM webhook_inbox WHERE event_id = ${eventId}`;
    }

    async function orderEvents(orderId: string) {
      return (
        await scratch.sql<{ type: string }[]>`
          SELECT type FROM order_event WHERE order_id = ${orderId} ORDER BY seq`
      ).map((row) => row.type);
    }

    async function statusOf(orderId: string): Promise<string> {
      const [row] = await scratch.sql<{ status: string }[]>`
        SELECT status FROM "order" WHERE id = ${orderId}`;
      return row?.status ?? "";
    }

    async function inboxCount(): Promise<number> {
      const [row] = await scratch.sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM webhook_inbox`;
      return row?.n ?? -1;
    }

    // -------------------------------------------------------------------------------------------

    describe("ingest (AC-21, AC-22, T-21, T-22)", () => {
      it("signed with the secret → 200 and one row; wrong secret, no header, 301 s old → 400 and no row; 1 MB + 1 → 413 and no row", async () => {
        const fake = newFake();
        const good = await delivery(
          fake,
          "payment_intent.succeeded",
          "wh_pi_x",
        );
        const enqueued: string[] = [];
        const ok = await ingestWebhook(
          good.rawBody,
          good.headers,
          ingestOf(fake, enqueued),
        );
        expect(ok).toMatchObject({ status: 200, fresh: true });
        expect(await rowsOf(good.eventId)).toHaveLength(1);
        expect(enqueued).toHaveLength(1);

        const other = new FakePaymentProvider({
          webhookSecret: "fake_whsec_other",
        });
        const cases = [
          await delivery(fake, "payment_intent.succeeded", "wh_pi_y"),
          await delivery(fake, "payment_intent.succeeded", "wh_pi_z"),
          await delivery(
            fake,
            "payment_intent.succeeded",
            "wh_pi_w",
            new Date(T0.getTime() - 301_000),
          ),
        ];
        const [wrongSecret, noHeader, stale] = cases;
        const before = await inboxCount();
        const answers = [
          await ingestWebhook(
            wrongSecret?.rawBody ?? "",
            other.sign(wrongSecret?.rawBody ?? "", T0).headers,
            ingestOf(fake),
          ),
          await ingestWebhook(noHeader?.rawBody ?? "", {}, ingestOf(fake)),
          await ingestWebhook(
            stale?.rawBody ?? "",
            stale?.headers ?? {},
            ingestOf(fake),
          ),
        ];
        expect(answers.map((a) => a.status)).toEqual([400, 400, 400]);
        const huge = `${" ".repeat(WEBHOOK_MAX_BYTES - good.rawBody.length + 1)}${good.rawBody}`;
        expect(
          (
            await ingestWebhook(
              huge,
              fake.sign(huge, T0).headers,
              ingestOf(fake),
            )
          ).status,
        ).toBe(413);
        expect(await inboxCount()).toBe(before);
        // At exactly the cap it is read (and its signature decides).
        const atCap = `${" ".repeat(WEBHOOK_MAX_BYTES - good.rawBody.length)}${good.rawBody}`;
        expect(
          (
            await ingestWebhook(
              atCap,
              fake.sign(atCap, T0).headers,
              ingestOf(fake),
            )
          ).status,
        ).toBe(200);
      });

      it("the job is asked for after the insert commits, and nothing is processed in the request; a store failure is 500; an enqueue failure is 500 with the row kept", async () => {
        const fake = newFake();
        const { intentRef, orderIds } = await started(fake);
        await fake.simulateSuccess(intentRef);
        const hook = await delivery(
          fake,
          "payment_intent.succeeded",
          intentRef,
        );
        let visibleAtEnqueue = -1;
        const result = await ingestWebhook(hook.rawBody, hook.headers, {
          ...ingestOf(fake),
          enqueue: async () => {
            visibleAtEnqueue = (await rowsOf(hook.eventId)).length;
          },
        });
        expect(result.status).toBe(200);
        expect(visibleAtEnqueue).toBe(1);
        expect(await statusOf(orderIds[0] ?? "")).toBe("placed");
        expect((await rowsOf(hook.eventId))[0]?.status).toBe("received");

        const broken = await delivery(
          fake,
          "payment_intent.processing",
          intentRef,
        );
        expect(
          (
            await ingestWebhook(broken.rawBody, broken.headers, {
              ...ingestOf(fake),
              transaction: () => Promise.reject(new Error("connection lost")),
            })
          ).status,
        ).toBe(500);
        expect(await rowsOf(broken.eventId)).toEqual([]);

        const noQueue = await delivery(
          fake,
          "payment_intent.processing",
          intentRef,
        );
        expect(
          (
            await ingestWebhook(noQueue.rawBody, noQueue.headers, {
              ...ingestOf(fake),
              enqueue: () => Promise.reject(new Error("queue down")),
            })
          ).status,
        ).toBe(500);
        expect(await rowsOf(noQueue.eventId)).toHaveLength(1);
        // The provider's retry finds the row open and asks again.
        const asked: string[] = [];
        expect(
          await ingestWebhook(
            noQueue.rawBody,
            noQueue.headers,
            ingestOf(fake, asked),
          ),
        ).toMatchObject({ status: 200, fresh: false });
        expect(asked).toHaveLength(1);
      });

      it("the endpoint: 503 without the secrets; a declared body over the cap is 413 unread; a signed body is 200", async () => {
        const fake = newFake();
        const hook = await delivery(
          fake,
          "payment_intent.processing",
          "wh_pi_ep",
        );
        const request = (body: string, headers: WebhookHeaders) =>
          new Request("https://flowersoverseas.test/api/webhooks/stripe", {
            method: "POST",
            body,
            headers: Object.fromEntries(
              Object.entries(headers).filter(
                (entry): entry is [string, string] => entry[1] !== undefined,
              ),
            ),
          });
        const config = {
          secretKey: "sk_test_contract_emulated",
          webhookSecret: "fake_whsec_contract",
          livemode: false,
          enqueue: () => Promise.resolve(),
          transaction: transactionOf(),
        };
        expect(
          (
            await ingestStripeWebhook(
              request(hook.rawBody, hook.headers),
              { ...config, webhookSecret: undefined },
              () => fake,
            )
          ).status,
        ).toBe(503);
        expect(
          (
            await ingestStripeWebhook(
              request(hook.rawBody, {
                ...hook.headers,
                "content-length": String(WEBHOOK_MAX_BYTES + 1),
              }),
              config,
              () => fake,
            )
          ).status,
        ).toBe(413);
        expect(await rowsOf(hook.eventId)).toEqual([]);
        const response = await ingestStripeWebhook(
          request(hook.rawBody, hook.headers),
          { ...config, enqueue: () => Promise.resolve() },
          () => fake,
        );
        expect(response.status).toBe(200);
        expect(await response.text()).toBe("");
      });

      it("the replay route's body: 400 for a bad request, 503 without the secrets, counts with them", async () => {
        const fake = newFake();
        await fake.simulateEvent("payment_intent.processing", "wh_pi_rp", T0);
        const config = {
          secretKey: "sk_test_contract_emulated",
          webhookSecret: "fake_whsec_contract",
          livemode: false,
          enqueue: () => Promise.resolve(),
          transaction: transactionOf(),
        };
        const post = (body: string) =>
          new Request(
            "https://flowersoverseas.test/api/internal/payments/replay-webhooks",
            { method: "POST", body },
          );
        expect(
          (await replayStripeWebhooks(post("{}"), config, () => fake)).status,
        ).toBe(400);
        expect(
          (await replayStripeWebhooks(post("not json"), config, () => fake))
            .status,
        ).toBe(400);
        expect(
          (
            await replayStripeWebhooks(
              post(JSON.stringify({ since: "2026-10-16T07:00:00Z" })),
              { ...config, secretKey: undefined },
              () => fake,
            )
          ).status,
        ).toBe(503);
        expect(
          await replayStripeWebhooks(
            post(
              JSON.stringify({ since: "2026-10-16T07:00:00Z", dryRun: true }),
            ),
            config,
            () => fake,
          ),
        ).toEqual({
          status: 200,
          body: { ok: true, seen: 1, inserted: 0, enqueued: 0 },
        });
        expect(
          (
            await replayStripeWebhooks(
              post(
                JSON.stringify({
                  inboxId: "3f2a1c64-9b7e-4d21-8f0a-5c6d7e8f9a0b",
                }),
              ),
              config,
              () => fake,
            )
          ).status,
        ).toBe(404);
      });
    });

    describe("livemode (AC-10 event half, T-10)", () => {
      it("a live event in a test environment is stored ignored with livemode_mismatch, asks for nothing, moves nothing", async () => {
        const live = newFake({ livemode: true });
        const hook = await delivery(
          live,
          "payment_intent.succeeded",
          "wh_pi_live",
        );
        const enqueued: string[] = [];
        const eventCount = async () =>
          (
            await scratch.sql<
              { n: number }[]
            >`SELECT count(*)::int AS n FROM order_event`
          )[0]?.n;
        const before = await eventCount();
        expect(
          await ingestWebhook(
            hook.rawBody,
            hook.headers,
            ingestOf(live, enqueued, false),
          ),
        ).toMatchObject({ status: 200 });
        const [row] = await rowsOf(hook.eventId);
        expect(row).toMatchObject({
          status: "ignored",
          ignore_reason: "livemode_mismatch",
          signature_verified: true,
        });
        expect(row?.processed_at).not.toBeNull();
        expect(enqueued).toEqual([]);
        expect(await eventCount()).toBe(before);
      });
    });

    describe("process once (AC-23, T-23)", () => {
      it("the same event twice in sequence: one row, one processing run, one order.captured per order", async () => {
        const fake = newFake();
        const { intentRef, orderIds } = await started(fake, [10_000, 12_000]);
        await fake.simulateSuccess(intentRef);
        const hook = await delivery(
          fake,
          "payment_intent.succeeded",
          intentRef,
        );
        const enqueued: string[] = [];
        await ingestWebhook(
          hook.rawBody,
          hook.headers,
          ingestOf(fake, enqueued),
        );
        const first = await processWebhook(enqueued[0] ?? "", processOf(fake));
        await ingestWebhook(
          hook.rawBody,
          hook.headers,
          ingestOf(fake, enqueued),
        );
        const again = await processWebhook(enqueued[0] ?? "", processOf(fake));
        expect(first).toEqual({ kind: "processed" });
        expect(again).toEqual({ kind: "skipped", status: "processed" });
        expect(enqueued).toHaveLength(1);
        expect(await rowsOf(hook.eventId)).toHaveLength(1);
        for (const orderId of orderIds) {
          expect(
            (await orderEvents(orderId)).filter((t) => t === "order.captured"),
          ).toHaveLength(1);
        }
        expect(
          fake.calls.filter((c) => c.method === "retrieveIntent"),
        ).toHaveLength(1);
      });

      it("the same event twice concurrently: one row, one run, at most one event", async () => {
        const fake = newFake();
        const { intentRef, orderIds } = await started(fake);
        await fake.simulateSuccess(intentRef);
        const hook = await delivery(
          fake,
          "payment_intent.succeeded",
          intentRef,
        );
        const enqueued: string[] = [];
        const answers = await Promise.all([
          ingestWebhook(hook.rawBody, hook.headers, ingestOf(fake, enqueued)),
          ingestWebhook(hook.rawBody, hook.headers, ingestOf(fake, enqueued)),
        ]);
        expect(answers.map((a) => a.status)).toEqual([200, 200]);
        expect(await rowsOf(hook.eventId)).toHaveLength(1);
        const runs = await Promise.all(
          enqueued.map((id) => processWebhook(id, processOf(fake))),
        );
        expect(runs.filter((r) => r.kind === "processed")).toHaveLength(1);
        expect(
          (await orderEvents(orderIds[0] ?? "")).filter(
            (t) => t === "order.captured",
          ),
        ).toHaveLength(1);
        expect(
          fake.calls.filter((c) => c.method === "retrieveIntent"),
        ).toHaveLength(1);
      });
    });

    describe("out of order (AC-24, T-24)", () => {
      /** Delivers `types` about the purchase's intent in order and returns the final facts. */
      async function run(
        order: readonly string[],
        prepare: (fake: FakePaymentProvider, ref: string) => Promise<void>,
      ) {
        const fake = newFake();
        const { intentRef, orderIds, paymentId } = await started(
          fake,
          [9_000, 11_000],
        );
        await prepare(fake, intentRef);
        const outcomes: string[] = [];
        for (const type of order) {
          const hook = await delivery(fake, type, intentRef);
          const enqueued: string[] = [];
          await ingestWebhook(
            hook.rawBody,
            hook.headers,
            ingestOf(fake, enqueued),
          );
          const outcome = await processWebhook(
            enqueued[0] ?? "",
            processOf(fake),
          );
          outcomes.push(
            outcome.kind === "ignored"
              ? `ignored:${outcome.reason}`
              : outcome.kind,
          );
        }
        const [payment] = await scratch.sql<
          { status: string; amount_captured_minor: string; attempts: number }[]
        >`SELECT status, amount_captured_minor, attempts FROM payment WHERE id = ${paymentId}`;
        return {
          outcomes,
          final: {
            payment: { ...payment },
            orders: await Promise.all(
              orderIds.map(async (id) => ({
                status: await statusOf(id),
                events: await orderEvents(id),
              })),
            ),
          },
        };
      }

      it("succeeded before amount_capturable_updated equals in order; the stale one is ignored/stale", async () => {
        const succeed = (fake: FakePaymentProvider, ref: string) =>
          fake.simulateSuccess(ref);
        const inOrder = await run(
          [
            "payment_intent.amount_capturable_updated",
            "payment_intent.succeeded",
          ],
          succeed,
        );
        const outOfOrder = await run(
          [
            "payment_intent.succeeded",
            "payment_intent.amount_capturable_updated",
          ],
          succeed,
        );
        expect(outOfOrder.final).toEqual(inOrder.final);
        expect(outOfOrder.outcomes).toEqual(["processed", "ignored:stale"]);
        expect(outOfOrder.final.orders.map((o) => o.status)).toEqual([
          "paid_unrouted",
          "paid_unrouted",
        ]);
      });

      it("payment_failed after succeeded equals in order; the stale one is ignored/stale", async () => {
        const declineThenSucceed = async (
          fake: FakePaymentProvider,
          ref: string,
        ) => {
          await fake.simulateDecline(ref, "card_declined");
          await fake.simulateSuccess(ref);
        };
        const inOrder = await run(
          ["payment_intent.payment_failed", "payment_intent.succeeded"],
          declineThenSucceed,
        );
        const outOfOrder = await run(
          ["payment_intent.succeeded", "payment_intent.payment_failed"],
          declineThenSucceed,
        );
        expect(outOfOrder.final).toEqual(inOrder.final);
        expect(outOfOrder.outcomes).toEqual(["processed", "ignored:stale"]);
      });

      it("refund and dispute types are stored and left ignored/awaiting_handler, moving nothing (their paths are TASK-261's)", async () => {
        const fake = newFake();
        const { intentRef, orderIds } = await started(fake);
        const before = await orderEvents(orderIds[0] ?? "");
        for (const type of [
          "refund.updated",
          "charge.refunded",
          "charge.dispute.closed",
          "charge.dispute.created",
        ]) {
          const hook = await delivery(fake, type, intentRef);
          const enqueued: string[] = [];
          await ingestWebhook(
            hook.rawBody,
            hook.headers,
            ingestOf(fake, enqueued),
          );
          expect(
            await processWebhook(enqueued[0] ?? "", processOf(fake)),
            type,
          ).toEqual({ kind: "ignored", reason: "awaiting_handler" });
        }
        expect(await orderEvents(orderIds[0] ?? "")).toEqual(before);
      });
    });

    describe("unknown, unmatched and failing rows (AC-25, T-25)", () => {
      it("an unknown type is 200 and ignored/unknown_type; an intent we never created is ignored/unknown_object", async () => {
        const fake = newFake();
        const unknown = await delivery(fake, "customer.created", "cus_123");
        const enqueued: string[] = [];
        expect(
          (
            await ingestWebhook(
              unknown.rawBody,
              unknown.headers,
              ingestOf(fake, enqueued),
            )
          ).status,
        ).toBe(200);
        expect(
          await processWebhook(enqueued[0] ?? "", processOf(fake)),
        ).toEqual({
          kind: "ignored",
          reason: "unknown_type",
        });
        const stranger = await delivery(
          fake,
          "payment_intent.succeeded",
          "pi_not_ours",
        );
        await ingestWebhook(
          stranger.rawBody,
          stranger.headers,
          ingestOf(fake, enqueued),
        );
        expect(
          await processWebhook(enqueued[1] ?? "", processOf(fake)),
        ).toEqual({
          kind: "ignored",
          reason: "unknown_object",
        });
      });

      it("a row that fails InboxEventSchema is failed and retried, and dead on the eighth attempt with one webhook.dead", async () => {
        const fake = newFake();
        const [row] = await scratch.sql<{ id: string }[]>`
          INSERT INTO webhook_inbox (provider, event_id, signature_verified, raw, livemode,
                                     event_type, object_ref)
          VALUES ('stripe', 'evt_malformed_1', true, '{}'::jsonb, false, 'Not A Type', NULL)
          RETURNING id`;
        const alerts: Alert[] = [];
        const outcomes: string[] = [];
        for (let attempt = 1; attempt <= 9; attempt += 1) {
          const outcome = await processWebhook(
            row?.id ?? "",
            processOf(fake, alerts),
          );
          outcomes.push(outcome.kind);
        }
        expect(outcomes).toEqual([
          "failed",
          "failed",
          "failed",
          "failed",
          "failed",
          "failed",
          "failed",
          "dead",
          "skipped",
        ]);
        const [after] = await scratch.sql<
          { status: string; attempts: number; last_error: string }[]
        >`SELECT status, attempts, last_error FROM webhook_inbox WHERE id = ${row?.id ?? ""}`;
        expect({ ...after }).toEqual({
          status: "dead",
          attempts: 8,
          last_error: "schema_invalid",
        });
        expect(alerts.map((a) => a.alert)).toEqual(["webhook.dead"]);
      });

      it("a provider that cannot be reached fails the row for a retry, and the retry processes it", async () => {
        const fake = newFake();
        const { intentRef, orderIds } = await started(fake);
        await fake.simulateSuccess(intentRef);
        const hook = await delivery(
          fake,
          "payment_intent.succeeded",
          intentRef,
        );
        const enqueued: string[] = [];
        await ingestWebhook(
          hook.rawBody,
          hook.headers,
          ingestOf(fake, enqueued),
        );
        let down = true;
        const flaky = Object.assign(
          Object.create(fake) as FakePaymentProvider,
          {
            retrieveIntent: (ref: string) =>
              down
                ? Promise.resolve({
                    kind: "provider_failure" as const,
                    failure: "unavailable" as const,
                  })
                : fake.retrieveIntent(ref),
          },
        );
        expect(
          await processWebhook(enqueued[0] ?? "", processOf(flaky)),
        ).toEqual({
          kind: "failed",
          attempts: 1,
        });
        expect(await statusOf(orderIds[0] ?? "")).toBe("placed");
        down = false;
        expect(
          await processWebhook(enqueued[0] ?? "", processOf(flaky)),
        ).toEqual({
          kind: "processed",
        });
        expect(await statusOf(orderIds[0] ?? "")).toBe("paid_unrouted");
      });
    });

    describe("replay (AC-26, T-26)", () => {
      it("feeds events.list through the same insert; a second run changes nothing; --inbox-id re-opens one row; --dry-run writes nothing", async () => {
        const fake = newFake();
        const { intentRef, orderIds } = await started(fake);
        await fake.simulateSuccess(intentRef);
        // The endpoint saw the first event; the second never arrived.
        const seen = await delivery(
          fake,
          "payment_intent.processing",
          intentRef,
        );
        await ingestWebhook(seen.rawBody, seen.headers, ingestOf(fake));
        const missed = await fake.simulateEvent(
          "payment_intent.succeeded",
          intentRef,
          T0,
        );

        const dryBefore = await inboxCount();
        expect(
          await replayWebhooks(
            { since: new Date(T0.getTime() - 3_600_000), dryRun: true },
            ingestOf(fake),
          ),
        ).toEqual({ seen: 2, inserted: 0, enqueued: 0 });
        expect(await inboxCount()).toBe(dryBefore);

        const enqueued: string[] = [];
        expect(
          await replayWebhooks(
            { since: new Date(T0.getTime() - 3_600_000) },
            ingestOf(fake, enqueued),
          ),
        ).toEqual({ seen: 2, inserted: 1, enqueued: 1 });
        const [missedRow] = await rowsOf(missed.id);
        expect(missedRow?.status).toBe("received");
        expect(
          await processWebhook(enqueued[0] ?? "", processOf(fake)),
        ).toEqual({
          kind: "processed",
        });
        expect(await statusOf(orderIds[0] ?? "")).toBe("paid_unrouted");

        const afterFirst = await inboxCount();
        expect(
          await replayWebhooks(
            { since: new Date(T0.getTime() - 3_600_000) },
            ingestOf(fake),
          ),
        ).toEqual({ seen: 2, inserted: 0, enqueued: 0 });
        expect(await inboxCount()).toBe(afterFirst);

        const reopened: string[] = [];
        expect(
          await replayWebhooks(
            { inboxId: missedRow?.id ?? "" },
            ingestOf(fake, reopened),
          ),
        ).toEqual({ seen: 1, inserted: 0, enqueued: 1 });
        expect((await rowsOf(missed.id))[0]?.status).toBe("received");
        expect(
          await processWebhook(reopened[0] ?? "", processOf(fake)),
        ).toEqual({
          kind: "ignored",
          reason: "stale",
        });
        expect(
          (await orderEvents(orderIds[0] ?? "")).filter(
            (t) => t === "order.captured",
          ),
        ).toHaveLength(1);
      });
    });
  },
);
