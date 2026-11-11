/**
 * Spec 021's gate and review queue against a disposable PG16 and spec 013's fake provider
 * (TASK-494): T-07 (AC-7), T-11's integration half (AC-11), T-14 (AC-14), T-15 (AC-15), T-16
 * (AC-16), T-18 (AC-18), T-20 (AC-20), T-21's integration half (AC-21), T-23's integration half
 * (AC-23), T-24 (AC-24), T-25 (AC-25), T-36 (AC-36), and the queue's no-PII read (AC-19's data
 * half). No network: the provider is `FakePaymentProvider`; Radar's facts are planted on it.
 *
 * The routing target is the real composition, `riskGatedRouting(routingOutboxHandler)`, with the
 * scheduler stubbed, so "routing started" is one `order.route` job (or spec 016's
 * `routing.auto` off path). Refunds go through spec 013's real `payments` target on the fake.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PAYMENT_METHODS } from "@/config/payment-methods";
import { TEST_RISK_HASH_KEY } from "@/lib/env.risk";
import { nextOccurrenceDates } from "@/modules/geo";
import {
  dispatchOutbox,
  type HandlerRegistry,
  type OrderExecutor,
} from "@/modules/orders";
import { routingOutboxHandler } from "@/modules/orders/routing/jobs";
import {
  cancelOrder,
  paymentsOutboxHandler,
  riskFactsFor,
  runPaymentsMonitor,
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
  decideReview,
  emailHash,
  type GateDeps,
  identityHash,
  isPeakDay,
  listOpenReviews,
  normaliseAddress,
  type RiskTransaction,
  riskGatedRouting,
  runReviewDeadlines,
  scoreOrder,
  velocityCounts,
} from "@/modules/risk";

import {
  applyTransition,
  insertPlacedOrder,
  walkOrderTo,
} from "../fixtures/order-state.ts";
import { base, country, customer, recipient } from "./support/rows.ts";
import {
  asApp,
  probeLocalServer,
  rolledBack,
  scratchDatabase,
  type ScratchDatabase,
  type Tx,
} from "./support/scratch-db.ts";
import { runnerOf } from "./support/sql-runner.ts";

const server = await probeLocalServer();
const KEY = Buffer.from(TEST_RISK_HASH_KEY, "base64");
const FAR_DATE = "2027-12-24";
const MIN = 60_000;
const HOUR = 60 * MIN;

const METHODS_ON: MethodSources = {
  enabledFlags: new Set(["payments.method.card"]),
  registry: PAYMENT_METHODS.map((method) => ({
    ...method,
    available: method.id !== "blik",
    ...(method.id === "blik" ? {} : { processor: "stripe" as const }),
  })),
};

/** Radar facts of an unremarkable, authenticated card payment. */
const CLEAN: FakeRiskFacts = {
  riskLevel: "normal",
  riskScore: 12,
  outcomeType: "authorized",
  threeDsOutcome: "authenticated",
  cardCountry: "PL",
  cardFingerprint: "fp_clean",
};

const ADMIN_ID = randomUUID();
const ADMIN = `admin:${ADMIN_ID}`;

interface Alert {
  readonly alert: string;
  readonly fields: Readonly<Record<string, unknown>>;
}

interface OrderOptions {
  readonly mode?: "test" | "live";
  readonly currency?: "PLN" | "EUR" | "GBP";
  readonly totalMinor?: number;
  readonly email?: string;
  readonly line1?: string;
  readonly cardMessage?: string;
  readonly deliveryDate?: string;
  readonly countryIso2?: string;
}

let fakes = 0;

describe.skipIf(server.url === undefined)(
  `spec 021 risk gate and queue${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "risk_gate");
      await scratch.sql.begin(async (tx) => {
        await base(tx);
        await tx`INSERT INTO users (id, email) VALUES (${ADMIN_ID}, 'risk-admin@example.test')`;
        await tx`INSERT INTO admin_profile (user_id, display_name) VALUES (${ADMIN_ID}, 'Risk Admin')`;
      });
    }, 600_000);

    afterAll(async () => {
      await scratch.drop();
    });

    const transactionOf =
      (): PaymentTransaction =>
      <T>(fn: (executor: OrderExecutor) => Promise<T>) =>
        scratch.sql.begin((tx) => fn(runnerOf(tx))) as Promise<T>;

    /** `withAdminContext` as the database sees it (the audit action, `app.role = admin`). */
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

    async function placed(options: OrderOptions = {}): Promise<{
      purchaseId: string;
      orderId: string;
    }> {
      return scratch.sql.begin(async (tx) => {
        const countryId = await country(tx, options.countryIso2 ?? "PL");
        const customerId = await customer(tx);
        const recipientId = await recipient(tx, customerId);
        const mode = options.mode ?? "test";
        const currency = options.currency ?? "PLN";
        const total = options.totalMinor ?? 10_000;
        const [row] = await tx<{ id: string }[]>`
          INSERT INTO purchase (mode, buyer_currency_code, total_minor, locale_code, customer_id)
          VALUES (${mode}, ${currency}, ${total}, 'en', ${customerId}) RETURNING id`;
        const purchaseId = row?.id ?? "";
        const orderId = await insertPlacedOrder(tx, {
          customerId,
          recipientId,
          countryId,
          mode,
          currencyCode: currency,
          totalMinor: total,
          purchaseId,
        });
        const buyer = {
          name: "Test Buyer",
          email: options.email ?? `${randomUUID()}@example.test`,
          countryIso2: "GB",
        };
        const recipientSnapshot = {
          fullName: "Test Recipient",
          phoneE164: "+48500000000",
          addressLines: [options.line1 ?? `ul. Testowa ${String(fakes)}`],
          postcode: "00-001",
          city: "Warszawa",
          placeKind: "home",
          ...(options.cardMessage === undefined
            ? {}
            : { cardMessage: options.cardMessage }),
        };
        await tx`UPDATE "order"
                 SET buyer_snapshot = ${tx.json(buyer)},
                     recipient_snapshot = ${tx.json(recipientSnapshot)},
                     delivery_date = ${options.deliveryDate ?? FAR_DATE}::date
                 WHERE id = ${orderId}`;
        return { purchaseId, orderId };
      });
    }

    /** A placed order paid on a fresh fake with `facts` planted: `paid_unrouted`, outbox pending. */
    async function paid(
      options: OrderOptions = {},
      facts: FakeRiskFacts = CLEAN,
    ): Promise<{ orderId: string; fake: FakePaymentProvider }> {
      fakes += 1;
      const fake = new FakePaymentProvider({ namespace: `rg${String(fakes)}` });
      const { purchaseId, orderId } = await placed(options);
      const started = await startPayment(purchaseId, lifecycle(fake));
      if (started.kind !== "started") throw new Error(started.kind);
      await fake.simulateSuccess(started.intentRef);
      await fake.simulateRiskFacts(started.intentRef, facts);
      const synced = await syncFromProvider(purchaseId, lifecycle(fake));
      if (synced.outcome !== "captured") throw new Error(synced.outcome);
      return { orderId, fake };
    }

    interface World {
      readonly alerts: Alert[];
      readonly inner: string[];
      readonly scheduled: string[];
      readonly deps: GateDeps;
    }

    function world(
      fake: FakePaymentProvider,
      options: {
        gate?: boolean;
        now?: () => Date;
        riskFactsFor?: GateDeps["riskFactsFor"];
      } = {},
    ): World {
      const alerts: Alert[] = [];
      return {
        alerts,
        inner: [],
        scheduled: [],
        deps: {
          riskFactsFor:
            options.riskFactsFor ??
            ((orderId, executor) =>
              riskFactsFor(orderId, {
                provider: fake,
                transaction: (fn) => fn(executor),
              })),
          cancelOrder: (orderId, actor, reason, connection) =>
            cancelOrder(orderId, actor, reason, connection),
          alert: (alert, fields) => {
            alerts.push({ alert, fields });
          },
          flag: (key) =>
            Promise.resolve(
              key === "risk.gate" ? (options.gate ?? true) : false,
            ),
          hashKey: () => KEY,
          now: options.now ?? (() => new Date()),
          transaction: transactionOf(),
          sleep: () => Promise.resolve(),
        },
      };
    }

    /** Delivers every pending row of `orderId` with the composed routing target. */
    async function deliver(
      orderId: string,
      fake: FakePaymentProvider,
      w: World,
    ): Promise<void> {
      const inner = routingOutboxHandler({
        schedule: (jobs) => {
          for (const job of jobs) {
            w.scheduled.push(
              `${job.name}:${"orderId" in job ? job.orderId : ""}`,
            );
          }
          return Promise.resolve();
        },
        alert: () => undefined,
      });
      const handlers: HandlerRegistry = {
        routing: riskGatedRouting(async (event, context) => {
          w.inner.push(event.type);
          await inner(event, context);
        }, w.deps),
        payments: paymentsOutboxHandler(lifecycle(fake)),
        invoices: () => Promise.resolve(),
        notifications: () => Promise.resolve(),
        "analytics.ga4": () => Promise.resolve(),
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

    const status = async (orderId: string): Promise<string> => {
      const [row] = await scratch.sql<{ status: string }[]>`
        SELECT status FROM "order" WHERE id = ${orderId}`;
      return row?.status ?? "";
    };
    const events = async (orderId: string) =>
      (
        await scratch.sql<
          {
            seq: number;
            type: string;
            actor: string;
            payload: Record<string, unknown>;
          }[]
        >`SELECT seq, type, actor, payload FROM order_event WHERE order_id = ${orderId}
          ORDER BY seq`
      ).map((row) => ({ ...row }));
    const reviews = async (orderId: string) =>
      (
        await scratch.sql<
          {
            id: string;
            status: string;
            deadline_at: Date | null;
            decided_by: string | null;
            decision_reason: string | null;
            recommendation: string;
          }[]
        >`SELECT id, status, deadline_at, decided_by, decision_reason, recommendation
          FROM risk_review WHERE order_id = ${orderId} ORDER BY created_at`
      ).map((row) => ({ ...row }));
    const assessment = async (orderId: string) => {
      const [row] = await scratch.sql<
        {
          decision: string;
          enforced: boolean;
          score: number;
          signals: { id: string; points: number }[];
        }[]
      >`SELECT decision, enforced, score::int AS score, signals FROM risk_assessment
        WHERE order_id = ${orderId} ORDER BY created_at DESC LIMIT 1`;
      return row;
    };
    const refunds = async (orderId: string) =>
      (
        await scratch.sql<{ reason: string; requested_by: string }[]>`
          SELECT reason, requested_by FROM refund WHERE order_id = ${orderId}`
      ).map((row) => ({ ...row }));
    const blocklistCount = async (): Promise<number> => {
      const [row] = await scratch.sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM risk_blocklist`;
      return row?.n ?? -1;
    };
    const fraudRefunds = (fake: FakePaymentProvider) =>
      fake.calls.filter((call) => call.method === "refund");

    /** An earlier delivered order with this email, so the next is not a first order. */
    async function deliveredBefore(
      email: string,
      mode: "test" | "live" = "test",
    ) {
      const { orderId } = await placed({ email, mode });
      await scratch.sql.begin(async (tx) => {
        await walkOrderTo(tx, orderId, "delivered");
        await tx`INSERT INTO risk_identity (order_id, kind, hash, expires_at)
                 VALUES (${orderId}, 'email', ${emailHash(email, KEY) ?? ""},
                         now() + interval '365 days')`;
      });
    }

    describe("T-07: pass, hold and cancel (AC-7, AC-11, AC-23)", () => {
      it("pass: the inner handler routes once; no review; still paid_unrouted until routed", async () => {
        const { orderId, fake } = await paid();
        const w = world(fake);
        await deliver(orderId, fake, w);
        expect(
          w.inner.filter((type) => type === "order.captured"),
        ).toHaveLength(1);
        expect(await reviews(orderId)).toEqual([]);
        const row = await assessment(orderId);
        expect(row?.decision).toBe("pass");
        expect(row?.enforced).toBe(true);
        const routed =
          w.scheduled.includes(`order.route:${orderId}`) ||
          (await status(orderId)) === "no_partner_available";
        expect(routed).toBe(true);
      });

      it("hold: the EUR 300.00 test order holds with exactly [S5] (AC-11), one review, one order.risk_held", async () => {
        const email = `${randomUUID()}@example.test`;
        await deliveredBefore(email);
        const before = Date.now();
        const { orderId, fake } = await paid({
          currency: "EUR",
          totalMinor: 30_000,
          email,
        });
        const w = world(fake);
        await deliver(orderId, fake, w);
        const row = await assessment(orderId);
        expect(row?.decision).toBe("hold");
        expect(row?.signals).toEqual([{ id: "S5", points: 0 }]);
        expect(w.inner).toEqual([]);
        expect(w.scheduled).toEqual([]);
        expect(await status(orderId)).toBe("paid_unrouted");
        const [review, ...others] = await reviews(orderId);
        expect(others).toEqual([]);
        expect(review?.status).toBe("open");
        expect(review?.recommendation).toBe("approve");
        // No destination cutoff in this fixture: the longest hold, 12 hours.
        const deadline = review?.deadline_at?.getTime() ?? 0;
        expect(deadline - before).toBeGreaterThanOrEqual(12 * HOUR - MIN);
        expect(deadline - Date.now()).toBeLessThanOrEqual(12 * HOUR);
        const held = (await events(orderId)).filter(
          (event) => event.type === "order.risk_held",
        );
        expect(held).toHaveLength(1);
        expect(held[0]?.actor).toBe("system:risk");
        expect(Object.keys(held[0]?.payload ?? {}).sort()).toEqual([
          "mode",
          "review_id",
          "rules_version",
          "score",
          "version",
        ]);
        expect(held[0]?.payload).toMatchObject({
          version: 1,
          mode: "test",
          review_id: review?.id,
          score: 0,
          rules_version: 1,
        });
        expect(w.alerts.map((alert) => alert.alert)).toEqual([
          "risk.review_opened",
        ]);
        // The queue reads it with no personal field (AC-19's data half).
        const queue = await scratch.sql.begin((tx) =>
          listOpenReviews(runnerOf(tx)),
        );
        const listed = queue.find((item) => item.orderId === orderId);
        expect(listed?.signals).toEqual([{ id: "S5", points: 0 }]);
        expect(JSON.stringify(listed)).not.toContain(email);
        expect(JSON.stringify(listed)).not.toContain("Test Recipient");
        expect(JSON.stringify(listed)).not.toContain("Testowa");
      });

      it("cancel: a blocklisted email cancels by system:risk with fraud_confirmed; one refund, Stripe reason fraudulent", async () => {
        const email = `${randomUUID()}@example.test`;
        await scratch.sql`
          INSERT INTO risk_blocklist (kind, hash, source, expires_at)
          VALUES ('email', ${emailHash(email, KEY) ?? ""}, 'admin', now() + interval '30 days')`;
        const listed = await blocklistCount();
        const { orderId, fake } = await paid({ email });
        const w = world(fake);
        await deliver(orderId, fake, w);
        expect((await assessment(orderId))?.decision).toBe("cancel");
        expect(await status(orderId)).toBe("cancelled");
        const cancels = (await events(orderId)).filter(
          (event) => event.type === "order.cancelled",
        );
        expect(cancels).toHaveLength(1);
        expect(cancels[0]?.actor).toBe("system:risk");
        expect(cancels[0]?.payload["reason"]).toBe("fraud_confirmed");
        expect(await refunds(orderId)).toHaveLength(1);
        expect((await refunds(orderId))[0]?.reason).toBe("fraud_confirmed");
        expect(fraudRefunds(fake)).toHaveLength(1);
        expect(fraudRefunds(fake)[0]?.reason).toBe("fraudulent");
        expect(w.scheduled).toEqual([]);
        expect(w.alerts.map((alert) => alert.alert)).toEqual([
          "risk.auto_cancelled",
        ]);
        // D1 leaves the list as it is.
        expect(await blocklistCount()).toBe(listed);
      });
    });

    describe("T-15: Radar facts unavailable (AC-15)", () => {
      it("two failures record S16 and hold; one failure then success uses the facts", async () => {
        const failing = await paid();
        const always = world(failing.fake, {
          riskFactsFor: () => Promise.reject(new Error("unavailable")),
        });
        await deliver(failing.orderId, failing.fake, always);
        const held = await assessment(failing.orderId);
        expect(held?.decision).toBe("hold");
        expect(held?.signals.map((signal) => signal.id)).toContain("S16");

        const flaky = await paid();
        let tries = 0;
        const once = world(flaky.fake);
        const real = once.deps.riskFactsFor;
        const w: World = {
          ...once,
          deps: {
            ...once.deps,
            riskFactsFor: (orderId, executor) => {
              tries += 1;
              return tries === 1
                ? Promise.reject(new Error("unavailable"))
                : real(orderId, executor);
            },
          },
        };
        await deliver(flaky.orderId, flaky.fake, w);
        expect(tries).toBe(2);
        const used = await assessment(flaky.orderId);
        expect(used?.signals.map((signal) => signal.id)).not.toContain("S16");
        expect(used?.decision).toBe("pass");
      });
    });

    describe("T-16: shadow mode (AC-16)", () => {
      it("records enforced = false and routes every order, with no review, hold, cancel or block", async () => {
        const holdEmail = `${randomUUID()}@example.test`;
        await deliveredBefore(holdEmail);
        const blocked = `${randomUUID()}@example.test`;
        await scratch.sql`
          INSERT INTO risk_blocklist (kind, hash, source, expires_at)
          VALUES ('email', ${emailHash(blocked, KEY) ?? ""}, 'admin', now() + interval '30 days')`;
        const listed = await blocklistCount();
        for (const options of [
          { currency: "EUR" as const, totalMinor: 30_000, email: holdEmail },
          { email: blocked },
        ]) {
          const { orderId, fake } = await paid(options);
          const w = world(fake, { gate: false });
          await deliver(orderId, fake, w);
          const row = await assessment(orderId);
          expect(row?.enforced).toBe(false);
          expect(row?.decision).not.toBe("pass");
          expect(
            w.inner.filter((type) => type === "order.captured"),
          ).toHaveLength(1);
          expect(await reviews(orderId)).toEqual([]);
          const types = (await events(orderId)).map((event) => event.type);
          expect(types).not.toContain("order.risk_held");
          expect(types).not.toContain("order.cancelled");
        }
        expect(await blocklistCount()).toBe(listed);
      });
    });

    describe("T-14: the velocity signals (AC-14)", () => {
      const hash = (
        kind: "email" | "card" | "recipient_address",
        value: string,
      ) => identityHash(kind, value, KEY);

      async function bareOrder(tx: Tx): Promise<string> {
        const countryId = await country(tx, "PL");
        const customerId = await customer(tx);
        const recipientId = await recipient(tx, customerId);
        return insertPlacedOrder(tx, {
          customerId,
          recipientId,
          countryId,
          mode: "test",
        });
      }

      async function identity(
        tx: Tx,
        orderId: string,
        kind: "email" | "card" | "recipient_address",
        value: string,
        createdAt: Date,
      ): Promise<void> {
        await tx`INSERT INTO risk_identity (order_id, kind, hash, created_at, expires_at)
                 VALUES (${orderId}, ${kind}, ${value}, ${createdAt.toISOString()}::timestamptz,
                         now() + interval '365 days')`;
      }

      it("counts each signal at its count, not one below, inside its window only", async () => {
        await rolledBack(scratch.sql, async (tx) => {
          const now = new Date();
          const email = hash("email", `v${randomUUID()}@example.test`);
          const card = hash("card", `fp_${randomUUID()}`);
          const address = hash("recipient_address", `PL|00001|${randomUUID()}`);
          const inside = new Date(now.getTime() - 6 * 24 * HOUR);
          const outside = new Date(now.getTime() - 7 * 24 * HOUR - 1000);
          // S7: two paid orders inside 24 h, one paid 24 h and 1 s ago.
          for (const paidAt of [
            new Date(now.getTime() - HOUR),
            new Date(now.getTime() - 2 * HOUR),
            new Date(now.getTime() - 24 * HOUR - 1000),
          ]) {
            const id = await bareOrder(tx);
            await applyTransition(
              tx,
              id,
              "order.captured",
              "paid_unrouted",
              paidAt,
            );
            await identity(tx, id, "email", email, inside);
          }
          // S8 and S9: two more addresses and cards in the window, one outside it.
          for (const [n, at] of [
            [1, inside],
            [2, inside],
            [3, outside],
          ] as const) {
            const id = await bareOrder(tx);
            await identity(tx, id, "email", email, at);
            await identity(
              tx,
              id,
              "recipient_address",
              hash("recipient_address", `a${String(n)}`),
              at,
            );
            await identity(tx, id, "card", hash("card", `c${String(n)}`), at);
          }
          const executor = runnerOf(tx);
          const counts = await velocityCounts(
            executor,
            { email, card, recipient_address: address },
            now,
          );
          // Two paid orders inside 24 h (the third is 1 s outside).
          expect(counts.paidOrdersByEmail24h).toBe(2);
          expect(counts.recipientAddressesByEmail7d).toBe(2);
          expect(counts.cardsByEmail7d).toBe(2);
          expect(counts.emailsByCard7d).toBe(0);

          // One more of each crosses the count: S7 at 3, S8 at 4, S9 at 3.
          const extra = await bareOrder(tx);
          await applyTransition(
            tx,
            extra,
            "order.captured",
            "paid_unrouted",
            now,
          );
          await identity(tx, extra, "email", email, now);
          await identity(tx, extra, "recipient_address", address, now);
          await identity(tx, extra, "card", card, now);
          const after = await velocityCounts(
            executor,
            { email, card, recipient_address: address },
            now,
          );
          expect(after.paidOrdersByEmail24h).toBe(3);
          expect(after.recipientAddressesByEmail7d).toBe(3);
          expect(after.cardsByEmail7d).toBe(3);
          expect(after.emailsByCard7d).toBe(1);
          expect(after.buyersByRecipientAddress7d).toBe(1);
          // S10 and S11: two more emails on this card and this address.
          for (const n of [1, 2]) {
            const id = await bareOrder(tx);
            const other = hash(
              "email",
              `o${String(n)}${randomUUID()}@example.test`,
            );
            await identity(tx, id, "email", other, now);
            await identity(tx, id, "card", card, now);
            await identity(tx, id, "recipient_address", address, now);
          }
          const crowd = await velocityCounts(
            executor,
            { email, card, recipient_address: address },
            now,
          );
          expect(crowd.emailsByCard7d).toBe(3);
          expect(crowd.buyersByRecipientAddress7d).toBe(3);
        });
      });

      it("fires each signal at its count and not one below, and needs 2 more on a peak day", () => {
        const input = (
          velocity: Partial<Parameters<typeof scoreOrder>[0]["velocity"]>,
          peakDay = false,
        ) =>
          scoreOrder({
            version: 1,
            mode: "test",
            totalMinor: 1000,
            currency: "PLN",
            destinationCountry: "PL",
            buyerCountryDeclared: "PL",
            sameDay: false,
            firstOrder: false,
            peakDay,
            cardMessageMatch: false,
            disposableEmail: false,
            blocklistMatch: false,
            declinedAttempts: 0,
            radar: {
              riskLevel: "normal",
              outcomeType: "authorized",
              liabilityShift: true,
              cardCountry: "PL",
              efwReceived: false,
            },
            velocity: {
              paidOrdersByEmail24h: 0,
              recipientAddressesByEmail7d: 0,
              cardsByEmail7d: 0,
              emailsByCard7d: 0,
              buyersByRecipientAddress7d: 0,
              ...velocity,
            },
            strict: false,
          }).signals.map((signal) => signal.id);
        const cases = [
          ["S7", "paidOrdersByEmail24h", 3, true],
          ["S8", "recipientAddressesByEmail7d", 4, true],
          ["S9", "cardsByEmail7d", 3, false],
          ["S10", "emailsByCard7d", 3, false],
          ["S11", "buyersByRecipientAddress7d", 3, true],
        ] as const;
        for (const [id, field, count, relaxed] of cases) {
          expect(input({ [field]: count }), id).toEqual([id]);
          expect(input({ [field]: count - 1 }), id).toEqual([]);
          expect(input({ [field]: count }, true), id).toEqual(
            relaxed ? [] : [id],
          );
          expect(input({ [field]: count + 2 }, true), id).toEqual([id]);
        }
      });

      it("hashes two spellings of one address, and a.b+x@gmail.com and ab@gmail.com, once", () => {
        expect(
          identityHash(
            "recipient_address",
            normaliseAddress({
              countryIso2: "pl",
              postcode: "00-001",
              line1: "ul. Łódzka 5",
            }),
            KEY,
          ),
        ).toBe(
          identityHash(
            "recipient_address",
            normaliseAddress({
              countryIso2: "PL",
              postcode: "00 001",
              line1: "UL LODZKA 5",
            }),
            KEY,
          ),
        );
        expect(emailHash("a.b+x@gmail.com", KEY)).toBe(
          emailHash("ab@gmail.com", KEY),
        );
      });

      it("marks Mother's Day in the destination as a peak day", () => {
        const [mothersDay] = nextOccurrenceDates(
          "mothers_day",
          "PL",
          "2027-01-01",
        );
        expect(mothersDay).toBeDefined();
        expect(isPeakDay("PL", mothersDay ?? "")).toBe(true);
        expect(isPeakDay("PL", "2027-07-14")).toBe(false);
      });
    });

    /** A `paid_unrouted` test order held directly (assessment and open review). */
    async function held(
      options: {
        score?: number;
        shift?: boolean | null;
        deadline?: Date;
      } = {},
    ): Promise<{ orderId: string; reviewId: string }> {
      return scratch.sql.begin(async (tx) => {
        const countryId = await country(tx, "PL");
        const customerId = await customer(tx);
        const recipientId = await recipient(tx, customerId);
        const orderId = await insertPlacedOrder(tx, {
          customerId,
          recipientId,
          countryId,
          mode: "test",
        });
        await tx`UPDATE "order" SET buyer_snapshot = ${tx.json({
          name: "Test Buyer",
          email: `${randomUUID()}@example.test`,
          countryIso2: "GB",
        })} WHERE id = ${orderId}`;
        await applyTransition(tx, orderId, "order.captured", "paid_unrouted");
        const [a] = await tx<{ id: string }[]>`
          INSERT INTO risk_assessment (order_id, stage, mode, rules_version, score, decision,
                                       enforced, signals, liability_shift)
          VALUES (${orderId}, 'routing', 'test', 1, ${options.score ?? 45}, 'hold', true,
                  '[{"id":"S1","points":30},{"id":"S3","points":15}]'::jsonb,
                  ${options.shift === undefined ? true : options.shift})
          RETURNING id`;
        await tx`INSERT INTO risk_identity (order_id, kind, hash, expires_at)
                 VALUES (${orderId}, 'email', ${identityHash("email", randomUUID(), KEY)},
                         now() + interval '365 days'),
                        (${orderId}, 'card', ${identityHash("card", randomUUID(), KEY)},
                         now() + interval '365 days')`;
        const [r] = await tx<{ id: string }[]>`
          INSERT INTO risk_review (order_id, assessment_id, kind, status, recommendation,
                                   deadline_at)
          VALUES (${orderId}, ${a?.id ?? ""}, 'pre_routing', 'open', 'approve',
                  ${(options.deadline ?? new Date(Date.now() + 6 * HOUR)).toISOString()}::timestamptz)
          RETURNING id`;
        return { orderId, reviewId: r?.id ?? "" };
      });
    }

    const decide = (
      reviewId: string,
      decision: "approve" | "cancel" | "cancel_block",
      reason: string,
    ) =>
      decideReview(
        { reviewId, decision, reason, expectedStatus: "open" },
        {
          actor: ADMIN,
          transaction: adminTransaction(`risk.review.${decision}`),
          cancelOrder: (orderId, actor, why, connection) =>
            cancelOrder(orderId, actor, why, connection),
        },
      );

    /** Delivers a directly held order's rows (no payment: the stub provider is never asked). */
    async function deliverHeld(orderId: string, w: World): Promise<void> {
      fakes += 1;
      await deliver(
        orderId,
        new FakePaymentProvider({ namespace: `rh${String(fakes)}` }),
        w,
      );
    }

    describe("T-18: deadlines and defaults (AC-18)", () => {
      it("due soon once at deadline minus 60 min; nothing at minus 1 s; released with shift and 45", async () => {
        const deadline = new Date(Date.now() + 3 * HOUR);
        const { orderId, reviewId } = await held({
          score: 45,
          shift: true,
          deadline,
        });
        fakes += 1;
        const w = world(
          new FakePaymentProvider({ namespace: `rd${String(fakes)}` }),
        );
        const tick = (at: Date) =>
          runReviewDeadlines({
            cancelOrder: w.deps.cancelOrder,
            alert: w.deps.alert,
            transaction: transactionOf(),
            now: () => at,
          });
        await tick(new Date(deadline.getTime() - 60 * MIN));
        await tick(new Date(deadline.getTime() - 59 * MIN));
        await tick(new Date(deadline.getTime() - 1000));
        const mine = () =>
          w.alerts.filter((alert) => alert.fields["order_id"] === orderId);
        expect(mine().map((alert) => alert.alert)).toEqual([
          "risk.review_due_soon",
        ]);
        expect((await reviews(orderId))[0]?.status).toBe("open");
        await tick(deadline);
        await tick(new Date(deadline.getTime() + MIN));
        const [review] = await reviews(orderId);
        expect(review?.id).toBe(reviewId);
        expect(review?.status).toBe("auto_released");
        expect(review?.decided_by).toBe("system:risk.deadline");
        const released = (await events(orderId)).filter(
          (event) => event.type === "order.risk_released",
        );
        expect(released).toHaveLength(1);
        expect(released[0]?.actor).toBe("system:risk.deadline");
        expect(released[0]?.payload["outcome"]).toBe("auto_released");
        expect(
          mine().filter((alert) => alert.alert === "risk.review_auto_decided"),
        ).toHaveLength(1);
        await deliverHeld(orderId, w);
        const started =
          w.scheduled.filter((job) => job === `order.route:${orderId}`).length +
          ((await status(orderId)) === "no_partner_available" ? 1 : 0);
        expect(started).toBe(1);
      });

      it("cancels with no liability shift, or at a score of 70, by system:risk.deadline with risk_cancel and no block", async () => {
        const listed = await blocklistCount();
        for (const options of [
          { score: 45, shift: false },
          { score: 70, shift: true },
        ]) {
          const deadline = new Date(Date.now() + HOUR);
          const { orderId } = await held({ ...options, deadline });
          fakes += 1;
          const w = world(
            new FakePaymentProvider({ namespace: `rc${String(fakes)}` }),
          );
          await runReviewDeadlines({
            cancelOrder: w.deps.cancelOrder,
            alert: w.deps.alert,
            transaction: transactionOf(),
            now: () => deadline,
          });
          const [review] = await reviews(orderId);
          expect(review?.status).toBe("auto_cancelled");
          expect(review?.decision_reason).toBe("deadline_default");
          const cancels = (await events(orderId)).filter(
            (event) => event.type === "order.cancelled",
          );
          expect(cancels).toHaveLength(1);
          expect(cancels[0]?.actor).toBe("system:risk.deadline");
          expect(cancels[0]?.payload["reason"]).toBe("risk_cancel");
          expect(
            w.alerts.filter(
              (alert) =>
                alert.alert === "risk.review_auto_decided" &&
                alert.fields["order_id"] === orderId,
            ),
          ).toHaveLength(1);
        }
        expect(await blocklistCount()).toBe(listed);
      });

      it("a decide_now hold applies the default at once", async () => {
        await scratch.sql.begin(async (tx) => {
          await country(tx, "DE");
          await tx`UPDATE country SET same_day_cutoff_local = '14:00' WHERE iso2 = 'DE'`;
        });
        const email = `${randomUUID()}@example.test`;
        // 12:30 UTC is 13:30 in Warsaw: the latest safe offer (14:00 + 2 h − 3 h) has passed.
        const heldAt = new Date("2027-03-10T12:30:00Z");
        const { orderId, fake } = await paid({
          currency: "EUR",
          totalMinor: 30_000,
          email,
          countryIso2: "DE",
          deliveryDate: "2027-03-10",
        });
        const w = world(fake, { now: () => heldAt });
        await deliver(orderId, fake, w);
        const [review] = await reviews(orderId);
        expect(review?.deadline_at?.getTime()).toBe(heldAt.getTime());
        expect(review?.status).toBe("auto_released");
        expect(w.alerts.map((alert) => alert.alert)).toEqual([
          "risk.review_opened",
          "risk.review_auto_decided",
        ]);
        expect(w.alerts[0]?.fields["outcome"]).toBe("under_60_minutes");
        expect(
          w.scheduled.filter((job) => job === `order.route:${orderId}`).length +
            ((await status(orderId)) === "no_partner_available" ? 1 : 0),
        ).toBe(1);
      });
    });

    describe("T-20, T-21, T-24: the admin decisions (AC-20, AC-21, AC-23, AC-24)", () => {
      it("approve: one audit row, approved by the admin, one order.risk_released, routing once; a second approve changes nothing", async () => {
        const { orderId, reviewId } = await held();
        const first = await decide(reviewId, "approve", "looks_genuine");
        expect(first.kind).toBe("approved");
        const second = await decide(reviewId, "approve", "looks_genuine");
        expect(second.kind).toBe("already_decided");
        const [review] = await reviews(orderId);
        expect(review?.status).toBe("approved");
        expect(review?.decided_by).toBe(ADMIN);
        expect(review?.decision_reason).toBe("looks_genuine");
        const [audit] = await scratch.sql<{ n: number }[]>`
          SELECT count(*)::int AS n FROM audit_log
          WHERE action = 'risk.review.approve' AND entity_id = ${reviewId}`;
        expect(audit?.n).toBe(1);
        const released = (await events(orderId)).filter(
          (event) => event.type === "order.risk_released",
        );
        expect(released).toHaveLength(1);
        expect(released[0]?.actor).toBe(ADMIN);
        expect(released[0]?.payload["outcome"]).toBe("approved");
        fakes += 1;
        const w = world(
          new FakePaymentProvider({ namespace: `ra${String(fakes)}` }),
        );
        await deliverHeld(orderId, w);
        expect(w.inner).toEqual(["order.risk_released"]);
        expect(
          w.scheduled.filter((job) => job === `order.route:${orderId}`).length +
            ((await status(orderId)) === "no_partner_available" ? 1 : 0),
        ).toBe(1);
      });

      it("cancel: risk_cancel by the admin, one full refund with no Stripe reason, no block", async () => {
        const email = `${randomUUID()}@example.test`;
        await deliveredBefore(email);
        const { orderId, fake } = await paid({
          currency: "EUR",
          totalMinor: 30_000,
          email,
        });
        const w = world(fake);
        await deliver(orderId, fake, w);
        const [review] = await reviews(orderId);
        const listed = await blocklistCount();
        expect(
          (await decide(review?.id ?? "", "cancel", "stolen_card_suspected"))
            .kind,
        ).toBe("cancelled");
        await deliver(orderId, fake, w);
        const cancels = (await events(orderId)).filter(
          (event) => event.type === "order.cancelled",
        );
        expect(cancels).toHaveLength(1);
        expect(cancels[0]?.actor).toBe(ADMIN);
        expect(cancels[0]?.payload["reason"]).toBe("risk_cancel");
        expect((await refunds(orderId)).map((refund) => refund.reason)).toEqual(
          ["risk_cancel"],
        );
        expect(fraudRefunds(fake)).toHaveLength(1);
        expect(fraudRefunds(fake)[0]?.reason).toBeUndefined();
        expect(await blocklistCount()).toBe(listed);
        expect(w.scheduled).toEqual([]);
      });

      it("cancel, refund and block: fraud_confirmed, Stripe fraudulent, email and card hashes listed by admin", async () => {
        const email = `${randomUUID()}@example.test`;
        await deliveredBefore(email);
        const { orderId, fake } = await paid(
          { currency: "EUR", totalMinor: 30_000, email },
          { ...CLEAN, cardFingerprint: `fp_${randomUUID()}` },
        );
        const w = world(fake);
        await deliver(orderId, fake, w);
        const [review] = await reviews(orderId);
        expect(
          (await decide(review?.id ?? "", "cancel_block", "card_testing")).kind,
        ).toBe("cancelled_blocked");
        await deliver(orderId, fake, w);
        expect((await refunds(orderId)).map((refund) => refund.reason)).toEqual(
          ["fraud_confirmed"],
        );
        expect(fraudRefunds(fake)[0]?.reason).toBe("fraudulent");
        const listed = await scratch.sql<{ kind: string; source: string }[]>`
          SELECT b.kind, b.source FROM risk_blocklist b
          JOIN risk_identity i ON i.kind = b.kind AND i.hash = b.hash
          WHERE i.order_id = ${orderId} ORDER BY b.kind`;
        expect(listed.map((row) => ({ ...row }))).toEqual([
          { kind: "card", source: "admin" },
          { kind: "email", source: "admin" },
        ]);
      });

      it("supersedes a review whose order the buyer cancelled or charged back, with no side effect", async () => {
        for (const leave of ["buyer", "chargeback"] as const) {
          const { orderId, reviewId } = await held();
          await scratch.sql.begin(async (tx) => {
            if (leave === "buyer") {
              await cancelOrder(orderId, "buyer", "buyer_cancel", {
                executor: runnerOf(tx),
              });
            } else {
              await walkOrderTo(tx, orderId, "chargeback_open");
            }
          });
          const before = (await events(orderId)).length;
          const result = await decide(
            reviewId,
            "cancel",
            "stolen_card_suspected",
          );
          expect(result.kind, leave).toBe("superseded");
          const [review] = await reviews(orderId);
          expect(review?.status).toBe("superseded");
          expect(review?.decision_reason).toBe("superseded");
          expect((await events(orderId)).length).toBe(before);
        }
      });

      it("refuses a reason the decision does not offer, writing nothing", async () => {
        const { orderId, reviewId } = await held();
        expect((await decide(reviewId, "approve", "card_testing")).kind).toBe(
          "refused",
        );
        expect((await reviews(orderId))[0]?.status).toBe("open");
      });
    });

    describe("T-25: races resolve to one outcome (AC-25)", () => {
      const RUNS = 50;

      async function outcome(orderId: string) {
        const all = await events(orderId);
        const seqs = all.map((event) => event.seq);
        expect(seqs).toEqual(seqs.map((_, index) => index + 1));
        return {
          released: all.filter((event) => event.type === "order.risk_released")
            .length,
          cancelled: all.filter((event) => event.type === "order.cancelled")
            .length,
          status: await status(orderId),
        };
      }

      it(`approve against the deadline default, ${String(RUNS)} runs`, async () => {
        for (let run = 0; run < RUNS; run += 1) {
          const deadline = new Date(Date.now() - 1000);
          const { orderId, reviewId } = await held({
            score: 75,
            shift: false,
            deadline,
          });
          const results = await Promise.all([
            decide(reviewId, "approve", "looks_genuine"),
            runReviewDeadlines({
              cancelOrder: (id, actor, reason, connection) =>
                cancelOrder(id, actor, reason, connection),
              alert: () => undefined,
              transaction: transactionOf(),
              now: () => new Date(),
            }),
          ]);
          const result = await outcome(orderId);
          expect(result.released + result.cancelled).toBe(1);
          expect(results[0].kind === "approved").toBe(result.released === 1);
        }
      }, 300_000);

      it(`approve against a buyer cancel, ${String(RUNS)} runs: never routed and cancelled`, async () => {
        for (let run = 0; run < RUNS; run += 1) {
          const { orderId, reviewId } = await held();
          await Promise.all([
            decide(reviewId, "approve", "looks_genuine"),
            scratch.sql.begin((tx) =>
              cancelOrder(orderId, "buyer", "buyer_cancel", {
                executor: runnerOf(tx),
              }),
            ),
          ]);
          const result = await outcome(orderId);
          expect(result.cancelled).toBe(1);
          expect(result.released).toBeLessThanOrEqual(1);
          fakes += 1;
          const w = world(
            new FakePaymentProvider({ namespace: `rr${String(fakes)}` }),
          );
          await deliverHeld(orderId, w).catch(() => undefined);
          expect(
            w.scheduled.filter((job) => job === `order.route:${orderId}`),
          ).toEqual([]);
          expect(await status(orderId)).toBe("cancelled");
        }
      }, 300_000);

      it(`an admin cancel against a system cancel, ${String(RUNS)} runs: one cancel, one refund request`, async () => {
        for (let run = 0; run < RUNS; run += 1) {
          const { orderId, reviewId } = await held();
          await Promise.all([
            decide(reviewId, "cancel", "stolen_card_suspected"),
            scratch.sql.begin((tx) =>
              cancelOrder(orderId, "system:risk", "fraud_confirmed", {
                executor: runnerOf(tx),
              }),
            ),
          ]);
          const result = await outcome(orderId);
          expect(result.cancelled).toBe(1);
          expect(result.released).toBe(0);
          const [review] = await reviews(orderId);
          expect(["cancelled", "superseded"]).toContain(review?.status);
          const [pending] = await scratch.sql<{ n: number }[]>`
            SELECT count(*)::int AS n FROM outbox_delivery d JOIN outbox o ON o.id = d.outbox_id
            WHERE o.order_id = ${orderId} AND d.target = 'payments'`;
          expect(pending?.n).toBe(1);
        }
      }, 300_000);
    });

    describe("T-36: the paid-not-routed monitor (AC-36)", () => {
      it("is silent for a held order before its deadline, and measures a released one from its release", async () => {
        const { orderId } = await held({
          deadline: new Date(Date.now() + 6 * HOUR),
        });
        const tick = async (at: Date) => {
          const alerts: string[] = [];
          await runPaymentsMonitor({
            transaction: transactionOf(),
            now: () => at,
            alert: (alert, fields) => {
              if (fields["order_id"] === orderId) alerts.push(alert);
            },
            log: { error: () => undefined } as never,
            livemode: false,
            firstOfferAt: (order) => order.securedAt,
          });
          return alerts;
        };
        expect(await tick(new Date(Date.now() + 5 * HOUR))).toEqual([]);

        const released = await held({
          deadline: new Date(Date.now() + 6 * HOUR),
        });
        await decide(released.reviewId, "approve", "looks_genuine");
        const [event] = await scratch.sql<{ occurred_at: Date }[]>`
          SELECT occurred_at FROM order_event
          WHERE order_id = ${released.orderId} AND type = 'order.risk_released'`;
        const releasedAt = event?.occurred_at.getTime() ?? 0;
        const watch = async (at: number) => {
          const alerts: string[] = [];
          await runPaymentsMonitor({
            transaction: transactionOf(),
            now: () => new Date(at),
            alert: (alert, fields) => {
              if (fields["order_id"] === released.orderId) alerts.push(alert);
            },
            log: { error: () => undefined } as never,
            livemode: false,
            firstOfferAt: (order) => order.securedAt,
          });
          return alerts;
        };
        expect(await watch(releasedAt + 5 * MIN)).toEqual([]);
        expect(await watch(releasedAt + 5 * MIN + 1000)).toEqual([
          "payment.paid_not_routed",
        ]);
      });
    });
  },
);
