/**
 * Spec 021 after routing, against a disposable PG16 and spec 013's fake provider (TASK-495):
 * T-26's integration half (AC-26: an early fraud warning by order state through `webhook.process`,
 * the `accepted` retry, the `paid` deadline refund, `decide_now`, a replay), T-27 (AC-27: the
 * `risk` target on a `fraudulent` dispute, nothing for `product_not_received`, the next order
 * refused at the pay step), T-28's data half (AC-28: the evidence pack's limits and its text, what
 * it contains and lacks), the post-routing "Keep the order" and "Refund in full" decisions, and
 * T-32 (AC-32: every `risk.*` log line and alert over these paths and the gate's keeps to §11's
 * allow-list, and no line or alert carries an email, a hash, a card fingerprint, an address or a
 * card message). No network: the provider is `FakePaymentProvider`.
 */
import { randomUUID } from "node:crypto";

import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { PAYMENT_METHODS } from "@/config/payment-methods";
import { TEST_RISK_HASH_KEY } from "@/lib/env.risk";
import { logger } from "@/lib/logger";
import { adminT } from "@/modules/admin/messages";
import { formatDate, formatMoney, loadMessages } from "@/modules/i18n";
import {
  dispatchOutbox,
  type HandlerRegistry,
  type OrderExecutor,
  orderReference,
} from "@/modules/orders";
import { routingOutboxHandler } from "@/modules/orders/routing/jobs";
import {
  cancelOrder,
  disputesFor,
  type EarlyFraudWarningHandler,
  paymentsOutboxHandler,
  processWebhook,
  productionStartAt,
  requestBalanceRefund,
  riskFactsFor,
  submitRefund,
} from "@/modules/payments";
import {
  FakePaymentProvider,
  type FakeRiskFacts,
} from "@/modules/payments/fake";
import {
  type LifecycleDeps,
  type PaymentTransaction,
  startPayment,
  syncFromProvider,
} from "@/modules/payments/lifecycle";
import type { MethodSources } from "@/modules/payments/methods";
import {
  EVIDENCE_MAX_BYTES,
  EVIDENCE_MAX_PAGES,
  type EvidenceTranslate,
  type GateDeps,
  type RiskRefund,
  type RiskTransaction,
  buildEvidencePack,
  dailyCounters,
  decideReview,
  detectSiteVelocity,
  emailHash,
  handleEarlyFraudWarning,
  prePayCheck,
  riskGatedRouting,
  riskOutboxHandler,
  runReviewDeadlines,
} from "@/modules/risk";

import { applyTransition, walkOrderTo } from "../fixtures/order-state.ts";
import { insertPlacedOrder } from "../fixtures/order-state.ts";
import { pdfObjects, pdfText } from "../fixtures/pdf-text.ts";
import {
  base,
  country,
  customer,
  mediaAsset,
  recipient,
} from "./support/rows.ts";
import {
  asApp,
  probeLocalServer,
  scratchDatabase,
  type ScratchDatabase,
} from "./support/scratch-db.ts";
import { runnerOf } from "./support/sql-runner.ts";

const server = await probeLocalServer();
const KEY = Buffer.from(TEST_RISK_HASH_KEY, "base64");
const FAR_DATE = "2027-12-24";
const ZONE = "Europe/Warsaw";
const MIN = 60_000;

const METHODS_ON: MethodSources = {
  enabledFlags: new Set(["payments.method.card"]),
  registry: PAYMENT_METHODS.map((method) => ({
    ...method,
    available: method.id !== "blik",
    ...(method.id === "blik" ? {} : { processor: "stripe" as const }),
  })),
};

const CLEAN: FakeRiskFacts = {
  riskLevel: "normal",
  riskScore: 12,
  outcomeType: "authorized",
  threeDsOutcome: "authenticated",
  cardCountry: "PL",
  cardFingerprint: "fp_after_routing_clean",
};

/** The fixture's personal values: none may reach a log line, an alert or the evidence pack's no-list. */
const CARD_MESSAGE = "Kocham Cię najmocniej, sekretna wiadomość";
const SIGN_AS = "Twoja tajemnicza Ania";
const RECIPIENT_PHONE = "+48501234567";
const BUYER_PHONE = "+447700900123";
const FLORIST_NAME = "Kwiaciarnia Pod Różą";
const CONFIRMATION_SENT = new Date("2027-12-20T08:00:00Z");

const ADMIN_ID = randomUUID();
const ADMIN = `admin:${ADMIN_ID}`;

interface Alert {
  readonly alert: string;
  readonly fields: Readonly<Record<string, unknown>>;
}

interface OrderOptions {
  readonly totalMinor?: number;
  readonly currency?: "PLN" | "EUR" | "GBP";
  readonly email?: string;
  readonly locale?: string;
  readonly deliveryDate?: string;
}

/** §11's allowed log fields for this spec (AC-32). */
const ALLOWED_LOG_KEYS = new Set([
  "request_id",
  "order_id",
  "review_id",
  "assessment_id",
  "event_id",
  "mode",
  "stage",
  "decision",
  "enforced",
  "score",
  "signals",
  "rules_version",
  "reason",
  "outcome",
  "radar_risk_level",
  "liability_shift",
  "job",
  "duration_ms",
  "count",
  "window_minutes",
]);

let fakes = 0;

describe.skipIf(server.url === undefined)(
  `spec 021 after routing${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    const lines: { msg: string; fields: Record<string, unknown> }[] = [];
    const alerts: Alert[] = [];
    const emails: string[] = [];
    const fingerprints: string[] = [];
    const streets: string[] = [];

    beforeAll(async () => {
      for (const level of ["info", "warn", "error"] as const) {
        const original = logger[level];
        vi.spyOn(logger, level).mockImplementation((fields, msg) => {
          lines.push({
            msg: msg ?? "",
            fields: { ...(fields as Record<string, unknown>) },
          });
          original(fields, msg);
        });
      }
      scratch = await scratchDatabase(server.url as string, "risk_after");
      await scratch.sql.begin(async (tx) => {
        await base(tx);
        await tx`INSERT INTO users (id, email) VALUES (${ADMIN_ID}, 'risk-after@example.test')`;
        await tx`INSERT INTO admin_profile (user_id, display_name) VALUES (${ADMIN_ID}, 'Risk Admin')`;
      });
    }, 600_000);

    afterAll(async () => {
      vi.restoreAllMocks();
      await scratch.drop();
    });

    const transactionOf =
      (): PaymentTransaction =>
      <T>(fn: (executor: OrderExecutor) => Promise<T>) =>
        scratch.sql.begin((tx) => fn(runnerOf(tx))) as Promise<T>;

    const adminTransaction =
      (action: string): RiskTransaction =>
      <T>(fn: (executor: OrderExecutor) => Promise<T>) =>
        scratch.sql.begin(async (tx) => {
          await tx`SELECT set_config('app.audit_action', ${action}, true)`;
          await asApp(tx, { role: "admin", userId: ADMIN_ID });
          return fn(runnerOf(tx));
        }) as Promise<T>;

    function lifecycle(fake: FakePaymentProvider): LifecycleDeps {
      return {
        provider: fake,
        transaction: transactionOf(),
        now: () => new Date(),
        alert: () => undefined,
        methodSources: () => Promise.resolve(METHODS_ON),
      };
    }

    const alert = (name: string, fields: Readonly<Record<string, unknown>>) => {
      alerts.push({ alert: name, fields });
    };

    async function placed(options: OrderOptions = {}): Promise<{
      purchaseId: string;
      orderId: string;
      email: string;
    }> {
      fakes += 1;
      const email = options.email ?? `${randomUUID()}@example.test`;
      const street = `ul. Ukryta ${String(fakes)}`;
      emails.push(email);
      streets.push(street);
      const purchase = await scratch.sql.begin(async (tx) => {
        const countryId = await country(tx, "PL");
        const customerId = await customer(tx);
        const recipientId = await recipient(tx, customerId);
        const currency = options.currency ?? "PLN";
        const total = options.totalMinor ?? 10_000;
        const [row] = await tx<{ id: string }[]>`
          INSERT INTO purchase (mode, buyer_currency_code, total_minor, locale_code, customer_id)
          VALUES ('test', ${currency}, ${total}, ${options.locale ?? "en"}, ${customerId})
          RETURNING id`;
        const purchaseId = row?.id ?? "";
        const orderId = await insertPlacedOrder(tx, {
          customerId,
          recipientId,
          countryId,
          mode: "test",
          currencyCode: currency,
          totalMinor: total,
          purchaseId,
        });
        await tx`UPDATE "order"
                 SET buyer_snapshot = ${tx.json({
                   name: "Test Buyer",
                   email,
                   phoneE164: BUYER_PHONE,
                   countryIso2: "GB",
                 })},
                     recipient_snapshot = ${tx.json({
                       fullName: "Zofia Odbiorczyni",
                       phoneE164: RECIPIENT_PHONE,
                       addressLines: [street],
                       postcode: "00-001",
                       city: "Warszawa",
                       placeKind: "home",
                       cardMessage: CARD_MESSAGE,
                       signAs: SIGN_AS,
                     })},
                     delivery_date = ${options.deliveryDate ?? FAR_DATE}::date,
                     terms_version = '2026-10'
                 WHERE id = ${orderId}`;
        return { purchaseId, orderId };
      });
      return { ...purchase, email };
    }

    /** Placed, paid on a fresh fake with `facts`, and its row 2 delivered through the gate. */
    async function paid(
      options: OrderOptions = {},
      facts: FakeRiskFacts = CLEAN,
    ): Promise<{
      orderId: string;
      purchaseId: string;
      intentRef: string;
      email: string;
      fake: FakePaymentProvider;
    }> {
      const fake = new FakePaymentProvider({
        namespace: `ra${String(fakes)}`,
      });
      const order = await placed(options);
      const fingerprint = `fp_${randomUUID()}`;
      fingerprints.push(fingerprint);
      const started = await startPayment(order.purchaseId, lifecycle(fake));
      if (started.kind !== "started") throw new Error(started.kind);
      await fake.simulateSuccess(started.intentRef);
      await fake.simulateRiskFacts(started.intentRef, {
        ...facts,
        cardFingerprint: fingerprint,
      });
      const synced = await syncFromProvider(order.purchaseId, lifecycle(fake));
      if (synced.outcome !== "captured") throw new Error(synced.outcome);
      await deliver(order.orderId, fake);
      return { ...order, intentRef: started.intentRef, fake };
    }

    function gateDeps(fake: FakePaymentProvider): GateDeps {
      return {
        riskFactsFor: (orderId, executor) =>
          riskFactsFor(orderId, {
            provider: fake,
            transaction: (fn) => fn(executor),
          }),
        cancelOrder: (orderId, actor, reason, connection) =>
          cancelOrder(orderId, actor, reason, connection),
        alert,
        flag: (key) => Promise.resolve(key === "risk.gate"),
        hashKey: () => KEY,
        transaction: transactionOf(),
        sleep: () => Promise.resolve(),
      };
    }

    async function deliver(
      orderId: string,
      fake: FakePaymentProvider,
    ): Promise<void> {
      const inner = routingOutboxHandler({
        schedule: () => Promise.resolve(),
        alert: () => undefined,
      });
      const handlers: HandlerRegistry = {
        routing: riskGatedRouting(inner, gateDeps(fake)),
        payments: paymentsOutboxHandler(lifecycle(fake)),
        invoices: () => Promise.resolve(),
        notifications: () => Promise.resolve(),
        "analytics.ga4": () => Promise.resolve(),
        payouts: () => Promise.resolve(),
        reviews: () => Promise.resolve(),
        risk: riskOutboxHandler({
          disputesFor: (executor, id) => disputesFor(executor, id),
        }),
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

    const refundBalance: RiskRefund = (orderId, actor, reason, executor) =>
      requestBalanceRefund(orderId, actor, reason, executor);

    function efwHandler(now: () => Date = () => new Date()) {
      const handler: EarlyFraudWarningHandler = async (input, executor) => {
        await handleEarlyFraudWarning(input, executor, {
          cancelOrder: (orderId, actor, reason, connection) =>
            cancelOrder(orderId, actor, reason, connection),
          refundBalance,
          productionStartAt: (timing) => productionStartAt(timing),
          alert,
          now,
        });
      };
      return handler;
    }

    /** Stores one webhook of `type` about `objectRef` and processes it. */
    async function webhook(
      fake: FakePaymentProvider,
      type: string,
      objectRef: string,
      now: () => Date = () => new Date(),
    ): Promise<{ inboxId: string; kind: string }> {
      const [row] = await scratch.sql<{ id: string }[]>`
        INSERT INTO webhook_inbox (provider, event_id, signature_verified, raw, livemode,
                                   event_type, object_ref, status)
        VALUES ('stripe', ${`evt_${randomUUID()}`}, true, '{}'::jsonb, false, ${type},
                ${objectRef}, 'received')
        RETURNING id`;
      const inboxId = row?.id ?? "";
      const outcome = await processWebhook(inboxId, {
        provider: fake,
        transaction: transactionOf(),
        alert: () => undefined,
        earlyFraudWarning: efwHandler(now),
      });
      return { inboxId, kind: outcome.kind };
    }

    async function reprocess(
      fake: FakePaymentProvider,
      inboxId: string,
    ): Promise<string> {
      const outcome = await processWebhook(inboxId, {
        provider: fake,
        transaction: transactionOf(),
        alert: () => undefined,
        earlyFraudWarning: efwHandler(),
      });
      return outcome.kind;
    }

    const status = async (orderId: string): Promise<string> => {
      const [row] = await scratch.sql<{ status: string }[]>`
        SELECT status FROM "order" WHERE id = ${orderId}`;
      return row?.status ?? "";
    };
    const reviews = async (orderId: string) =>
      (
        await scratch.sql<
          {
            id: string;
            kind: string;
            status: string;
            deadline_at: Date | null;
            recommendation: string;
            decided_by: string | null;
            decision_reason: string | null;
          }[]
        >`SELECT id, kind, status, deadline_at, recommendation, decided_by, decision_reason
          FROM risk_review WHERE order_id = ${orderId} ORDER BY created_at`
      ).map((row) => ({ ...row }));
    const refunds = async (orderId: string) =>
      (
        await scratch.sql<
          { reason: string; requested_by: string; amount_minor: string }[]
        >`SELECT reason, requested_by, amount_minor::text FROM refund WHERE order_id = ${orderId}`
      ).map((row) => ({ ...row }));
    const cancelEvents = async (orderId: string) =>
      (
        await scratch.sql<{ actor: string; reason: string }[]>`
          SELECT actor, payload ->> 'reason' AS reason FROM order_event
          WHERE order_id = ${orderId} AND type = 'order.cancelled'`
      ).map((row) => ({ ...row }));
    const blocklist = async (email: string) =>
      (
        await scratch.sql<{ kind: string; source: string }[]>`
          SELECT b.kind, b.source FROM risk_blocklist b
          WHERE b.hash IN (SELECT hash FROM risk_identity i
                           WHERE i.order_id IN (SELECT id FROM "order"
                                                WHERE buyer_snapshot ->> 'email' = ${email}))
          ORDER BY b.kind`
      ).map((row) => ({ ...row }));
    const walk = (orderId: string, target: string) =>
      scratch.sql.begin((tx) => walkOrderTo(tx, orderId, target));

    describe("T-26: an early fraud warning by order state (AC-26)", () => {
      it("placed: nothing yet; the gate then sees efwReceived (D2) and cancels with fraud_confirmed", async () => {
        const fake = new FakePaymentProvider({ namespace: "raplaced" });
        const order = await placed();
        const started = await startPayment(order.purchaseId, lifecycle(fake));
        if (started.kind !== "started") throw new Error(started.kind);
        await fake.simulateSuccess(started.intentRef);
        await fake.simulateRiskFacts(started.intentRef, CLEAN);
        const ref = await fake.simulateEarlyFraudWarning(
          started.intentRef,
          "unauthorized_use_of_card",
        );
        const processed = await webhook(
          fake,
          "radar.early_fraud_warning.created",
          ref,
        );
        expect(processed.kind).toBe("processed");
        expect(await status(order.orderId)).toBe("placed");
        expect(await reviews(order.orderId)).toEqual([]);
        await syncFromProvider(order.purchaseId, lifecycle(fake));
        await deliver(order.orderId, fake);
        expect(await status(order.orderId)).toBe("cancelled");
        expect(await cancelEvents(order.orderId)).toEqual([
          { actor: "system:risk", reason: "fraud_confirmed" },
        ]);
        expect(await blocklist(order.email)).toEqual([
          { kind: "card", source: "efw" },
          { kind: "email", source: "efw" },
        ]);
      });

      it("paid_unrouted with an open review: cancel by system:risk with fraud_confirmed, the review auto_cancelled, blocklisted with source efw, risk.auto_cancelled, Stripe told fraudulent", async () => {
        const order = await paid({ currency: "EUR", totalMinor: 30_000 });
        expect(await status(order.orderId)).toBe("paid_unrouted");
        const [held] = await reviews(order.orderId);
        expect(held?.status).toBe("open");
        const before = alerts.length;
        const ref = await order.fake.simulateEarlyFraudWarning(
          order.intentRef,
          "misc",
        );
        await webhook(order.fake, "radar.early_fraud_warning.created", ref);
        expect(await status(order.orderId)).toBe("cancelled");
        expect(await cancelEvents(order.orderId)).toEqual([
          { actor: "system:risk", reason: "fraud_confirmed" },
        ]);
        const [review] = await reviews(order.orderId);
        expect(review?.status).toBe("auto_cancelled");
        expect(review?.decision_reason).toBe("efw");
        expect(await blocklist(order.email)).toEqual([
          { kind: "card", source: "efw" },
          { kind: "email", source: "efw" },
        ]);
        expect(alerts.slice(before).map((a) => a.alert)).toEqual([
          "risk.auto_cancelled",
        ]);
        await deliver(order.orderId, order.fake);
        expect(await refunds(order.orderId)).toEqual([
          {
            reason: "fraud_confirmed",
            requested_by: "system:payments",
            amount_minor: "30000",
          },
        ]);
        expect(
          order.fake.calls
            .filter((call) => call.method === "refund")
            .map((call) => call.reason),
        ).toEqual(["fraudulent"]);
      });

      it.each(["routed", "no_partner_available", "manual_reroute"])(
        "%s: cancelOrder by system:risk with fraud_confirmed, blocklist, risk.auto_cancelled; a replay changes nothing",
        async (state) => {
          const order = await paid();
          await walk(order.orderId, state);
          const ref = await order.fake.simulateEarlyFraudWarning(
            order.intentRef,
            "misc",
          );
          const first = await webhook(
            order.fake,
            "radar.early_fraud_warning.created",
            ref,
          );
          expect(first.kind).toBe("processed");
          expect(await status(order.orderId)).toBe("cancelled");
          expect(await cancelEvents(order.orderId)).toEqual([
            { actor: "system:risk", reason: "fraud_confirmed" },
          ]);
          expect(await blocklist(order.email)).toHaveLength(2);
          const before = alerts.length;
          await webhook(order.fake, "radar.early_fraud_warning.created", ref);
          expect(await cancelEvents(order.orderId)).toHaveLength(1);
          expect(alerts.length).toBe(before);
        },
      );

      it("accepted: ORDER_IN_HANDOVER fails the inbox row; once row 14 makes it paid, the retry opens one post_routing review", async () => {
        const order = await paid();
        await walk(order.orderId, "accepted");
        const ref = await order.fake.simulateEarlyFraudWarning(
          order.intentRef,
          "misc",
        );
        const first = await webhook(
          order.fake,
          "radar.early_fraud_warning.created",
          ref,
        );
        expect(first.kind).toBe("failed");
        const [inbox] = await scratch.sql<
          { status: string; last_error: string }[]
        >`SELECT status, last_error FROM webhook_inbox WHERE id = ${first.inboxId}`;
        expect(inbox).toEqual({
          status: "failed",
          last_error: "ORDER_IN_HANDOVER",
        });
        expect(await reviews(order.orderId)).toEqual([]);
        await walk(order.orderId, "paid");
        expect(await reprocess(order.fake, first.inboxId)).toBe("processed");
        const post = await reviews(order.orderId);
        expect(post.map((r) => [r.kind, r.status, r.recommendation])).toEqual([
          ["post_routing", "open", "refund"],
        ]);
      });

      it("paid: deadline = productionStartAt − 60 min; nothing a second before; at the deadline one full refund with fraud_confirmed, auto_refunded, refunded_full", async () => {
        const order = await paid();
        await walk(order.orderId, "paid");
        const ref = await order.fake.simulateEarlyFraudWarning(
          order.intentRef,
          "misc",
        );
        await webhook(order.fake, "radar.early_fraud_warning.created", ref);
        const deadline = new Date(
          productionStartAt({ deliveryDate: FAR_DATE, zone: ZONE }).getTime() -
            60 * MIN,
        );
        const [review] = await reviews(order.orderId);
        expect(review?.kind).toBe("post_routing");
        expect(review?.deadline_at?.toISOString()).toBe(deadline.toISOString());
        const deps = {
          cancelOrder: (
            orderId: string,
            actor: string,
            reason: "risk_cancel" | "fraud_confirmed",
            connection: { readonly executor: OrderExecutor },
          ) => cancelOrder(orderId, actor, reason, connection),
          refundBalance,
          submitRefund: async (refundId: string) => {
            await submitRefund(refundId, {
              provider: order.fake,
              transaction: transactionOf(),
            });
          },
          alert,
          transaction: transactionOf(),
        };
        await runReviewDeadlines({
          ...deps,
          now: () => new Date(deadline.getTime() - 1000),
        });
        expect((await reviews(order.orderId))[0]?.status).toBe("open");
        expect(await refunds(order.orderId)).toEqual([]);
        await runReviewDeadlines({ ...deps, now: () => deadline });
        await runReviewDeadlines({ ...deps, now: () => deadline });
        const [decided] = await reviews(order.orderId);
        expect(decided?.status).toBe("auto_refunded");
        expect(decided?.decided_by).toBe("system:risk.deadline");
        expect(await refunds(order.orderId)).toEqual([
          {
            reason: "fraud_confirmed",
            requested_by: "system:risk.deadline",
            amount_minor: "10000",
          },
        ]);
        expect(await status(order.orderId)).toBe("refunded_full");
      });

      it("paid, under 30 minutes before the deadline: decide_now refunds in full at once", async () => {
        const order = await paid();
        await walk(order.orderId, "paid");
        const ref = await order.fake.simulateEarlyFraudWarning(
          order.intentRef,
          "misc",
        );
        const start = productionStartAt({
          deliveryDate: FAR_DATE,
          zone: ZONE,
        });
        const now = new Date(start.getTime() - 80 * MIN);
        await webhook(
          order.fake,
          "radar.early_fraud_warning.created",
          ref,
          () => now,
        );
        const [review] = await reviews(order.orderId);
        expect(review?.status).toBe("auto_refunded");
        expect(await refunds(order.orderId)).toEqual([
          {
            reason: "fraud_confirmed",
            requested_by: "system:risk.deadline",
            amount_minor: "10000",
          },
        ]);
      });

      it.each(["in_production", "delivered", "closed"])(
        "%s: an open post_routing review with no deadline and risk.efw_after_routing; a second warning adds nothing",
        async (state) => {
          const order = await paid();
          await walk(order.orderId, state);
          const before = alerts.length;
          const ref = await order.fake.simulateEarlyFraudWarning(
            order.intentRef,
            "misc",
          );
          await webhook(order.fake, "radar.early_fraud_warning.created", ref);
          const post = await reviews(order.orderId);
          expect(post.map((r) => [r.kind, r.status, r.deadline_at])).toEqual([
            ["post_routing", "open", null],
          ]);
          expect(alerts.slice(before).map((a) => a.alert)).toEqual([
            "risk.efw_after_routing",
          ]);
          const again = await order.fake.simulateEarlyFraudWarning(
            order.intentRef,
            "misc",
          );
          await webhook(order.fake, "radar.early_fraud_warning.created", again);
          expect(await reviews(order.orderId)).toHaveLength(1);
          expect(await status(order.orderId)).toBe(state);
        },
      );

      it.each(["chargeback_open", "cancelled", "refunded_full"])(
        "%s: nothing",
        async (state) => {
          const order = await paid();
          await walk(order.orderId, state);
          const ref = await order.fake.simulateEarlyFraudWarning(
            order.intentRef,
            "misc",
          );
          const before = alerts.length;
          const result = await webhook(
            order.fake,
            "radar.early_fraud_warning.created",
            ref,
          );
          expect(result.kind).toBe("processed");
          expect(await status(order.orderId)).toBe(state);
          expect(
            (await reviews(order.orderId)).filter(
              (r) => r.kind === "post_routing",
            ),
          ).toEqual([]);
          expect(alerts.length).toBe(before);
        },
      );

      it("an unknown warning is ignored as unknown_object; without the handler the row waits as awaiting_handler", async () => {
        const fake = new FakePaymentProvider({ namespace: "raunknown" });
        const unknown = await webhook(
          fake,
          "radar.early_fraud_warning.created",
          "raunknown_issfr_9999",
        );
        expect(unknown.kind).toBe("ignored");
        const [row] = await scratch.sql<{ id: string }[]>`
          INSERT INTO webhook_inbox (provider, event_id, signature_verified, raw, livemode,
                                     event_type, object_ref, status)
          VALUES ('stripe', ${`evt_${randomUUID()}`}, true, '{}'::jsonb, false,
                  'radar.early_fraud_warning.created', 'x', 'received')
          RETURNING id`;
        const outcome = await processWebhook(row?.id ?? "", {
          provider: fake,
          transaction: transactionOf(),
          alert: () => undefined,
        });
        expect(outcome).toEqual({
          kind: "ignored",
          reason: "awaiting_handler",
        });
      });
    });

    describe("post-routing decisions on a paid order: Keep the order, Refund in full", () => {
      async function postReview() {
        const order = await paid();
        await walk(order.orderId, "paid");
        const ref = await order.fake.simulateEarlyFraudWarning(
          order.intentRef,
          "misc",
        );
        await webhook(order.fake, "radar.early_fraud_warning.created", ref);
        const [review] = await reviews(order.orderId);
        return { ...order, reviewId: review?.id ?? "" };
      }

      it("Refund in full: the remaining balance with risk_cancel by the admin, cancelled, refunded_full once; a second post is already_decided", async () => {
        const order = await postReview();
        const submitted: string[] = [];
        const deps = {
          actor: ADMIN,
          transaction: adminTransaction("risk.review.cancel"),
          cancelOrder: (
            orderId: string,
            actor: string,
            reason: "risk_cancel" | "fraud_confirmed",
            connection: { readonly executor: OrderExecutor },
          ) => cancelOrder(orderId, actor, reason, connection),
          refundBalance,
          submitRefund: async (refundId: string) => {
            submitted.push(refundId);
            await submitRefund(refundId, {
              provider: order.fake,
              transaction: transactionOf(),
            });
          },
        };
        const input = {
          reviewId: order.reviewId,
          decision: "cancel",
          reason: "efw",
          expectedStatus: "open",
        };
        const first = await decideReview(input, deps);
        expect(first.kind).toBe("refunded");
        const second = await decideReview(input, deps);
        expect(second.kind).toBe("already_decided");
        expect(submitted).toHaveLength(1);
        expect(await refunds(order.orderId)).toEqual([
          { reason: "risk_cancel", requested_by: ADMIN, amount_minor: "10000" },
        ]);
        expect(await status(order.orderId)).toBe("refunded_full");
        expect((await reviews(order.orderId))[0]?.status).toBe("cancelled");
      });

      it("Keep the order: approved, no refund; cancel and block is refused", async () => {
        const order = await postReview();
        const deps = {
          actor: ADMIN,
          transaction: adminTransaction("risk.review.approve"),
          cancelOrder: (
            orderId: string,
            actor: string,
            reason: "risk_cancel" | "fraud_confirmed",
            connection: { readonly executor: OrderExecutor },
          ) => cancelOrder(orderId, actor, reason, connection),
          refundBalance,
        };
        const blocked = await decideReview(
          {
            reviewId: order.reviewId,
            decision: "cancel_block",
            reason: "efw",
            expectedStatus: "open",
          },
          deps,
        );
        expect(blocked).toEqual({
          kind: "refused",
          code: "POST_ROUTING_NO_ACTION",
        });
        const kept = await decideReview(
          {
            reviewId: order.reviewId,
            decision: "approve",
            reason: "looks_genuine",
            expectedStatus: "open",
          },
          deps,
        );
        expect(kept.kind).toBe("approved");
        expect(await refunds(order.orderId)).toEqual([]);
        expect(await status(order.orderId)).toBe("paid");
      });
    });

    describe("T-27: fraud disputes blocklist through the risk target (AC-27)", () => {
      it("fraudulent: email and card hashes on the blocklist with source dispute, the open review superseded; the next order with that email is refused at the pay step", async () => {
        const order = await paid({ currency: "EUR", totalMinor: 30_000 });
        const [held] = await reviews(order.orderId);
        expect(held?.status).toBe("open");
        const dispute = await order.fake.simulateDispute(
          order.intentRef,
          "fraudulent",
        );
        await webhook(order.fake, "charge.dispute.created", dispute);
        expect(await status(order.orderId)).toBe("chargeback_open");
        await deliver(order.orderId, order.fake);
        expect(await blocklist(order.email)).toEqual([
          { kind: "card", source: "dispute" },
          { kind: "email", source: "dispute" },
        ]);
        const [review] = await reviews(order.orderId);
        expect(review?.status).toBe("superseded");
        await deliver(order.orderId, order.fake);
        expect(await blocklist(order.email)).toHaveLength(2);

        const next = await placed({ email: order.email.toUpperCase() });
        const verdict = await prePayCheck(next.purchaseId, {
          hashKey: () => KEY,
          flag: () => Promise.resolve(false),
          transaction: transactionOf(),
        });
        expect(verdict).toEqual({ ok: false, reason: "blocked_email" });
      });

      it("product_not_received: no blocklist row", async () => {
        const order = await paid();
        const dispute = await order.fake.simulateDispute(
          order.intentRef,
          "product_not_received",
        );
        await webhook(order.fake, "charge.dispute.created", dispute);
        expect(await status(order.orderId)).toBe("chargeback_open");
        await deliver(order.orderId, order.fake);
        expect(await blocklist(order.email)).toEqual([]);
        expect(
          emailHash(order.email, KEY) === null ? "no hash" : "hashed",
        ).toBe("hashed");
      });
    });

    describe("T-28: the evidence pack of a delivered order (AC-28, data half)", () => {
      it("A4, within 4.5 MB and 19 pages; contains the reference, the amount, 3DS, every UTC time and the zone, the recipient and address, the photo time and the cancellation sentence of the order's locale (pl); lacks the card message, sign as, both phones and the florist", async () => {
        const order = await paid({ locale: "pl", totalMinor: 18_950 });
        const times: Date[] = [];
        const uploadedAt = new Date("2027-12-24T10:15:00Z");
        await scratch.sql.begin(async (tx) => {
          await walkOrderTo(tx, order.orderId, "out_for_delivery");
          await applyTransition(
            tx,
            order.orderId,
            "order.delivered",
            "delivered",
            new Date("2027-12-24T10:02:00Z"),
          );
          await walkOrderTo(tx, order.orderId, "photo_uploaded");
          const assetId = await mediaAsset(tx);
          await tx`INSERT INTO delivery_proof (order_id, media_asset_id, uploaded_by, uploaded_at)
                   VALUES (${order.orderId}, ${assetId}, 'partner', ${uploadedAt})`;
          await tx`INSERT INTO notification_delivery (source_key, purchase_id, template_key,
                                                      audience, recipient_ref, locale_code,
                                                      provider, status, status_at, created_at)
                   VALUES (${`evidence:${order.orderId}`}, ${order.purchaseId}, 'order-received',
                           'buyer', 'buyer', 'pl', 'resend', 'delivered',
                           ${CONFIRMATION_SENT}, ${CONFIRMATION_SENT})`;
          for (const row of await tx<{ at: Date }[]>`
            SELECT occurred_at AS at FROM order_event WHERE order_id = ${order.orderId}
              AND type IN ('order.placed', 'order.captured', 'order.in_production',
                           'order.out_for_delivery', 'order.delivered', 'order.photo_uploaded')`) {
            times.push(row.at);
          }
        });
        const photo = await sharp({
          create: {
            width: 120,
            height: 90,
            channels: 3,
            background: "#c8b8d8",
          },
        })
          .jpeg()
          .toBuffer();
        const bytes = await buildEvidencePack(order.orderId, {
          transaction: adminTransaction("risk.read"),
          authorisationFor: async (id) => {
            const facts = await riskFactsFor(id, {
              provider: order.fake,
              transaction: transactionOf(),
            });
            return {
              threeDsResult: facts.threeDsResult,
              liabilityShift: facts.liabilityShift,
              cardBrand: "visa",
              cardLast4: "4242",
            };
          },
          photoBytes: () => Promise.resolve(photo),
          t: adminT as unknown as EvidenceTranslate,
        });
        expect(bytes).not.toBeNull();
        const pdf = bytes as Uint8Array;
        expect(pdf.byteLength).toBeLessThanOrEqual(EVIDENCE_MAX_BYTES);
        const pages = pdfObjects(pdf).filter((object) =>
          /\/Type \/Page\b/u.test(object.dictionary),
        );
        expect(pages.length).toBeGreaterThan(0);
        expect(pages.length).toBeLessThanOrEqual(EVIDENCE_MAX_PAGES);
        for (const page of pages) {
          expect(page.dictionary).toMatch(
            /\/MediaBox \[0 0 595\.28 841\.89\]/u,
          );
        }
        // A wrapped line is its own text run; PDFKit may break after a hyphen ("14-" / "day").
        const text = pdfText(pdf).replace(/\s+/gu, " ").replace(/- /gu, "-");
        const cancellation = (
          loadMessages("pl", ["checkout"]) as {
            checkout: { legal: { cancellation: string } };
          }
        ).checkout.legal.cancellation;
        expect(text).toContain(orderReference(order.orderId));
        const flat = (value: string): string => value.replace(/\s+/gu, " ");
        expect(text).toContain(
          flat(formatMoney({ amountMinor: 18_950, currency: "PLN" }, "en")),
        );
        expect(text).toContain("authenticated");
        expect(text).toContain("visa ending 4242");
        expect(text).toContain(ZONE);
        expect(times.length).toBeGreaterThanOrEqual(6);
        for (const at of times) {
          expect(text).toContain(
            flat(formatDate(at, "en", "dayMonthYearTime", "UTC")),
          );
        }
        expect(text).toContain(
          flat(formatDate(CONFIRMATION_SENT, "en", "dayMonthYearTime", "UTC")),
        );
        expect(text).toContain("Zofia Odbiorczyni");
        expect(text).toContain(streets[streets.length - 1]);
        expect(text).toContain("00-001 Warszawa");
        expect(text).toContain(
          flat(formatDate(uploadedAt, "en", "dayMonthYearTime", "UTC")),
        );
        expect(text).toContain(flat(cancellation));
        for (const absent of [
          CARD_MESSAGE,
          SIGN_AS,
          RECIPIENT_PHONE,
          BUYER_PHONE,
          FLORIST_NAME,
          "risk",
          "score",
        ]) {
          expect(text.toLowerCase()).not.toContain(absent.toLowerCase());
        }
      });

      it("a demo or unknown order has no pack", async () => {
        const none = await buildEvidencePack(randomUUID(), {
          transaction: adminTransaction("risk.read"),
          authorisationFor: () => Promise.reject(new Error("unused")),
          photoBytes: () => Promise.resolve(null),
          t: adminT as unknown as EvidenceTranslate,
        });
        expect(none).toBeNull();
      });
    });

    describe("risk.monitor: the site velocity alert and the daily counter line (§5.2, §11)", () => {
      it("risk.velocity_site fires once when a 6th new-email live order is paid within the hour; 5 do not, and the next tick adds nothing", async () => {
        const t = new Date("2027-03-03T12:00:00Z");
        const at = (minutes: number) => new Date(t.getTime() - minutes * MIN);
        for (const minutes of [50, 40, 30, 20, 10, 0]) {
          await scratch.sql.begin(async (tx) => {
            const countryId = await country(tx, "PL");
            const customerId = await customer(tx);
            const recipientId = await recipient(tx, customerId);
            const orderId = await insertPlacedOrder(tx, {
              customerId,
              recipientId,
              countryId,
              mode: "live",
              currencyCode: "PLN",
              totalMinor: 10_000,
            });
            await tx`UPDATE "order" SET delivery_date = ${FAR_DATE}::date WHERE id = ${orderId}`;
            await applyTransition(
              tx,
              orderId,
              "order.captured",
              "paid_unrouted",
              at(minutes),
            );
            await tx`INSERT INTO risk_identity (order_id, kind, hash, created_at, expires_at)
                     VALUES (${orderId}, 'email',
                             ${emailHash(`${randomUUID()}@example.test`, KEY) ?? ""},
                             ${at(minutes)}, ${new Date(t.getTime() + 86_400_000)})`;
          });
        }
        const velocity = (now: Date) =>
          detectSiteVelocity({
            alert,
            transaction: transactionOf(),
            now: () => now,
          });
        const before = alerts.length;
        expect(await velocity(at(1))).toEqual({ count: 5, alerted: false });
        expect(await velocity(t)).toEqual({ count: 6, alerted: true });
        expect(await velocity(at(-1))).toEqual({ count: 6, alerted: false });
        expect(alerts.slice(before)).toEqual([
          {
            alert: "risk.velocity_site",
            fields: { count: 6, window_minutes: 60 },
          },
        ]);
      });

      it("the daily counter line: on the first tick of a UTC day, counts by decision, review outcome and pause; nothing at 00:01", async () => {
        const midnight = new Date(
          Math.ceil(Date.now() / 86_400_000) * 86_400_000,
        );
        const rows = await dailyCounters({
          transaction: transactionOf(),
          now: () => midnight,
        });
        expect(rows.some((row) => row.stage === "assessment")).toBe(true);
        expect(rows.some((row) => row.stage === "review")).toBe(true);
        expect(
          await dailyCounters({
            transaction: transactionOf(),
            now: () => new Date(midnight.getTime() + MIN),
          }),
        ).toEqual([]);
      });
    });

    describe("T-32: logs and alerts over every path keep to §11 and carry no personal data (AC-32)", () => {
      it("every risk.* line's keys are allowed; no line or alert holds an email, a hash, a fingerprint, a street or the card message", () => {
        const riskLines = lines.filter((line) => line.msg.startsWith("risk."));
        expect(riskLines.length).toBeGreaterThan(5);
        for (const line of riskLines) {
          for (const key of Object.keys(line.fields)) {
            expect(ALLOWED_LOG_KEYS.has(key), `${line.msg}: ${key}`).toBe(true);
          }
        }
        const hashes = emails.map((email) => emailHash(email, KEY) ?? "");
        const forbidden = [
          ...emails,
          ...hashes,
          ...fingerprints,
          ...streets,
          CARD_MESSAGE,
          SIGN_AS,
        ].filter((value) => value !== "");
        const everything = [
          ...lines.map((line) => JSON.stringify(line)),
          ...alerts.map((entry) => JSON.stringify(entry)),
        ];
        for (const value of forbidden) {
          for (const line of everything) {
            expect(line.includes(value), value).toBe(false);
          }
        }
        for (const entry of alerts) {
          for (const key of Object.keys(entry.fields)) {
            expect(ALLOWED_LOG_KEYS.has(key), `${entry.alert}: ${key}`).toBe(
              true,
            );
          }
        }
      });
    });
  },
);
