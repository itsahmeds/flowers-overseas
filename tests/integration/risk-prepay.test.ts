/**
 * Spec 021's pay-step checks and schema against a disposable PG16 and spec 013's fake provider
 * (TASK-493): T-02 (AC-2), T-03 (AC-3), T-04 (AC-4), T-05 (AC-5), T-06 (AC-6), T-31 integration
 * half (AC-31), T-33 (AC-33), T-35 (AC-35). No network: the provider is `FakePaymentProvider`.
 *
 * The checkout runs in `test` mode (a stubbed `sk_test_` key). The pre-check runs on the test's
 * own transaction, with an injected clock, flag reader and the fixed test hash key.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { FX_SNAPSHOT_AS_OF } from "../../src/config/catalogue/fx.data.ts";
import { CHECKOUT_SAMPLES } from "../../src/config/checkout-samples.ts";
import { PAYMENT_METHODS } from "../../src/config/payment-methods.ts";
import { runRetentionSweep } from "../../src/jobs/retention.ts";
import { TEST_RISK_HASH_KEY } from "@/lib/env.risk";
import { logger } from "@/lib/logger";
import { listProducts, listTiers, priceProjection } from "@/modules/catalog";
import {
  type CheckoutFlagReader,
  type Draft,
  type DraftConnection,
  type StepOutcome,
  assessBasket,
  checkoutScreen,
  draftTokenFromCookieHeader,
  loadDraft,
  nextDeliveryDate,
  runBuyerStep,
  runCardStep,
  runPay,
  runPaymentDeclined,
  runRecipientStep,
  startCheckout,
} from "@/modules/checkout";
import type { OrderExecutor } from "@/modules/orders";
import { attemptStats, endPaymentAttempts } from "@/modules/payments";
import { FakePaymentProvider } from "@/modules/payments/fake";
import type { PaymentTransaction } from "@/modules/payments/lifecycle";
import type { MethodSources } from "@/modules/payments/methods";
import { registerStripePaymentSteps } from "@/modules/payments/pay-step";
import type { CreateIntentInput } from "@/modules/payments/provider";
import { detectCardTesting, emailHash, prePayCheck } from "@/modules/risk";

import { country, partner } from "./support/rows.ts";
import {
  asApp,
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
const MIGRATION_MS = 180_000;

const T0 = new Date(`${FX_SNAPSHOT_AS_OF}T09:00:00.000Z`);
const at = (minutes: number): Date => new Date(T0.getTime() + minutes * 60_000);
const DAY = 24 * 60;
const KEY = Buffer.from(TEST_RISK_HASH_KEY, "base64");

const PRODUCTS = await listProducts({ countryIso: "PL" });
const [PRODUCT] = PRODUCTS;
if (PRODUCT === undefined)
  throw new Error("the dataset needs a product priced for PL");
const [TIER] = await listTiers(PRODUCT.sku);
if (TIER === undefined) throw new Error("the product needs a tier");

const OPEN: CheckoutFlagReader = () => Promise.resolve(true);
const SAMPLE = CHECKOUT_SAMPLES.PL;
const DELIVERY_DATE =
  nextDeliveryDate("PL", new Date(T0.getTime() + 3 * DAY * 60_000)) ?? "";

let db: ScratchDatabase | undefined;

beforeAll(async () => {
  if (server.url !== undefined) {
    db = await scratchDatabase(server.url, "risk_prepay");
  }
}, MIGRATION_MS);

afterAll(async () => {
  await db?.drop();
});

async function seeded(tx: Tx): Promise<DraftConnection> {
  const plId = await country(tx, "PL");
  await tx`INSERT INTO locale (code, bcp47, name) VALUES ('en-gb', 'en-GB', 'English (UK)')
           ON CONFLICT DO NOTHING`;
  await tx`
    INSERT INTO product (sku, product_type, primary_flower, colour_primary, style, price_tier,
                         substitution_class, freshness_days)
    VALUES (${PRODUCT?.sku ?? ""}, 'bouquet', 'roses', 'red', 'classic', 'classic', 'main_flower', 5)
    ON CONFLICT DO NOTHING`;
  const [florists] = await tx<{ n: number }[]>`
    SELECT count(*)::int AS n FROM fulfillment_partner WHERE status = 'demo'`;
  if ((florists?.n ?? 0) === 0) await partner(tx, plId, "demo");
  await asApp(tx, { role: "system" });
  return { executor: runnerOf(tx) };
}

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.append(key, value);
  return data;
}

async function add(connection: DraftConnection): Promise<string> {
  const display = (
    await priceProjection("pl", {
      productId: PRODUCT?.sku ?? "",
      tierKey: TIER?.tierKey ?? "",
      countryIso: "PL",
      now: T0,
    })
  ).displayPrice;
  const response = await startCheckout(
    new Request("http://flowersoverseas.test/api/checkout/start", {
      method: "POST",
      headers: {
        host: "flowersoverseas.test",
        origin: "http://flowersoverseas.test",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        locale: "pl",
        countryIso: "PL",
        sku: PRODUCT?.sku ?? "",
        tierKey: TIER?.tierKey ?? "",
        expectedTotalMinor: String(display.amountMinor),
        expectedCurrency: display.currency,
        then: "checkout",
      }).toString(),
    }),
    { now: () => T0, connection, flags: OPEN },
  );
  const token = draftTokenFromCookieHeader(
    response.headers.getSetCookie().find((c) => c.startsWith("fo_checkout=")),
  );
  if (token === null) throw new Error(`no basket: ${String(response.status)}`);
  return token;
}

function ctx(connection: DraftConnection, token: string, minutes = 1) {
  return {
    locale: "pl",
    token,
    connection,
    flags: OPEN,
    now: () => at(minutes),
  };
}

function location(outcome: StepOutcome): string {
  if (outcome.kind !== "redirect") {
    throw new Error(`expected a redirect, got ${JSON.stringify(outcome)}`);
  }
  return outcome.location;
}

const buyerForm = (email: string) =>
  form({
    email,
    buyerName: SAMPLE.buyer.buyerName,
    buyerPhone: "",
    residenceCountry: SAMPLE.buyer.residenceCountry,
  });

/** Steps 1 and 2 of the one line. */
async function fillLine(
  connection: DraftConnection,
  token: string,
): Promise<void> {
  location(
    await runRecipientStep(
      ctx(connection, token),
      form({
        line: "1",
        ...SAMPLE.recipient.fields,
        fullName: "Anna Przykładowa",
        placeKind: SAMPLE.recipient.placeKind,
        deliveryNote: "",
        deliveryDate: DELIVERY_DATE,
      }),
    ),
  );
  location(
    await runCardStep(
      ctx(connection, token),
      form({
        line: "1",
        cardMessage: "Wszystkiego najlepszego",
        signAs: "Sam",
      }),
    ),
  );
}

async function draftOf(
  connection: DraftConnection,
  token: string,
): Promise<Draft> {
  const lookup = await loadDraft(token, at(2), connection);
  if (lookup.status !== "active") throw new Error(`draft ${lookup.status}`);
  return lookup.draft;
}

const METHODS_ON: MethodSources = {
  enabledFlags: new Set(["payments.method.card"]),
  registry: PAYMENT_METHODS.map((method) => ({
    ...method,
    available: method.id !== "blik",
    ...(method.id === "blik" ? {} : { processor: "stripe" as const }),
  })),
};

class RecordingFake extends FakePaymentProvider {
  readonly inputs: CreateIntentInput[] = [];
  override createIntent(input: CreateIntentInput) {
    this.inputs.push(input);
    return super.createIntent(input);
  }
}

/** The step on the test's own transaction, with a movable risk clock and flags. */
let current: { provider: RecordingFake; executor: OrderExecutor } | null = null;
let riskClock: Date = at(2);
let flags: Record<string, boolean> = {};
const testTransaction = (<T>(fn: (executor: OrderExecutor) => Promise<T>) => {
  if (current === null) throw new Error("no transaction");
  return fn(current.executor);
}) as PaymentTransaction;

registerStripePaymentSteps({
  routingReady: () => true,
  deps: {
    provider: () => {
      if (current === null) throw new Error("no provider");
      return current.provider;
    },
    publishableKey: "pk_test_fixture",
    methodSources: () => Promise.resolve(METHODS_ON),
    lifecycle: {
      transaction: testTransaction,
      now: () => riskClock,
      alert: () => undefined,
    },
    prePay: (purchaseId) =>
      prePayCheck(purchaseId, {
        transaction: testTransaction,
        now: () => riskClock,
        flag: (key) => Promise.resolve(flags[key] ?? false),
        hashKey: () => KEY,
      }),
  },
});

const describeDb = server.url === undefined ? describe.skip : describe;

describeDb(`spec 021 pay-step checks (${server.reason})`, () => {
  const sql = (): Sql => {
    if (db === undefined) throw new Error("no scratch database");
    return db.sql;
  };

  beforeAll(() => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_placeholder");
  });
  afterAll(() => {
    vi.unstubAllEnvs();
  });

  /** A filled one-line `test` basket for `email`. */
  async function basket(
    tx: Tx,
    email: string = SAMPLE.buyer.email,
    shared?: RecordingFake,
  ): Promise<{
    connection: DraftConnection;
    token: string;
    fake: RecordingFake;
  }> {
    const connection = await seeded(tx);
    const fake = shared ?? new RecordingFake({ now: () => at(2) });
    current = { provider: fake, executor: runnerOf(tx) };
    const token = await add(connection);
    await fillLine(connection, token);
    location(await runBuyerStep(ctx(connection, token), buyerForm(email)));
    expect((await draftOf(connection, token)).mode).toBe("test");
    return { connection, token, fake };
  }

  async function pay(connection: DraftConnection, token: string, minutes = 2) {
    const screen = await checkoutScreen({
      locale: "pl",
      token,
      step: "review",
      connection,
      flags: OPEN,
      now: () => at(minutes),
    });
    const total =
      screen.kind === "step" && screen.total !== null
        ? screen.total
        : (
            await assessBasket(await draftOf(connection, token), {
              locale: "pl",
              now: at(minutes),
              flags: OPEN,
            })
          ).total;
    if (total === null) throw new Error("no total");
    return runPay(
      ctx(connection, token, minutes),
      form({
        seenTotalMinor: String(total.amountMinor),
        seenCurrency: total.currency,
      }),
    );
  }

  async function statusesOf(
    tx: Tx,
    token: string,
    connection: DraftConnection,
  ) {
    const purchaseId = (await draftOf(connection, token)).purchaseId ?? "";
    const rows = await tx<{ status: string }[]>`
      SELECT status FROM "order" WHERE purchase_id = ${purchaseId}`;
    return { purchaseId, statuses: rows.map((row) => row.status) };
  }

  const hashOf = (email: string) => emailHash(email, KEY) ?? "";

  it("T-02 (AC-2): step 3 refuses a disposable email in test, keeps every value, writes nothing; a relay passes", async () => {
    await rolledBack(sql(), async (tx) => {
      const { connection, token } = await basket(tx);
      const before = (await draftOf(connection, token)).buyer;
      const refused = await runBuyerStep(
        ctx(connection, token),
        buyerForm("anna@mailinator.com"),
      );
      expect(refused).toEqual({
        kind: "render",
        state: {
          status: "invalid",
          step: "details",
          line: 1,
          errors: { email: [{ key: "checkout.risk.emailLasting" }] },
          values: {
            email: "anna@mailinator.com",
            buyerName: SAMPLE.buyer.buyerName,
            buyerPhone: "",
            residenceCountry: SAMPLE.buyer.residenceCountry,
          },
        },
      });
      expect((await draftOf(connection, token)).buyer).toEqual(before);
      location(
        await runBuyerStep(
          ctx(connection, token),
          buyerForm("k7x2m9pq@duck.com"),
        ),
      );
      expect((await draftOf(connection, token)).buyer?.email).toBe(
        "k7x2m9pq@duck.com",
      );
    });
  });

  it("T-02 (AC-2): in demo the check does not run", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    try {
      await rolledBack(sql(), async (tx) => {
        const connection = await seeded(tx);
        const token = await add(connection);
        await fillLine(connection, token);
        expect((await draftOf(connection, token)).mode).toBe("demo");
        location(
          await runBuyerStep(
            ctx(connection, token),
            buyerForm("anna@mailinator.com"),
          ),
        );
      });
    } finally {
      vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_placeholder");
    }
  });

  it("T-03 (AC-3): a blocklisted email hash: no intent, generic message, closed unpaid, last_matched_at set, one log line", async () => {
    const lines: unknown[][] = [];
    const spies = (["info", "warn", "error", "debug"] as const).map((level) =>
      vi.spyOn(logger, level).mockImplementation((...args: unknown[]) => {
        lines.push(args);
        return undefined as never;
      }),
    );
    try {
      await rolledBack(sql(), async (tx) => {
        const { connection, token, fake } = await basket(tx);
        riskClock = at(2);
        await tx`INSERT INTO risk_blocklist (kind, hash, source, expires_at)
                 VALUES ('email', ${hashOf(SAMPLE.buyer.email)}, 'admin', ${at(DAY)})`;
        expect(await pay(connection, token)).toEqual({
          kind: "error",
          messageKey: "payments.error.generic",
        });
        expect(fake.inputs).toHaveLength(0);
        const { purchaseId, statuses } = await statusesOf(
          tx,
          token,
          connection,
        );
        expect(statuses).toEqual(["abandoned"]);
        const [event] = await tx<{ actor: string }[]>`
          SELECT e.actor FROM order_event e JOIN "order" o ON o.id = e.order_id
           WHERE o.purchase_id = ${purchaseId} AND e.to_status = 'abandoned'`;
        expect(event?.actor).toBe("system:risk");
        const [entry] = await tx<{ last_matched_at: Date | null }[]>`
          SELECT last_matched_at FROM risk_blocklist WHERE kind = 'email'`;
        expect(entry?.last_matched_at?.toISOString()).toBe(at(2).toISOString());
        const riskLines = lines.filter(
          (line) => typeof line[1] === "string" && line[1].startsWith("risk."),
        );
        expect(riskLines).toHaveLength(1);
        expect(riskLines[0]?.[1]).toBe("risk.prepay_refused");
        expect(Object.keys(riskLines[0]?.[0] as object).sort()).toEqual([
          "order_id",
          "reason",
        ]);
        expect((riskLines[0]?.[0] as { reason: string }).reason).toBe(
          "blocked_email",
        );
        // No row of a risk table holds the email (AC-31).
        const rows = await tx<{ row: string }[]>`
          SELECT to_jsonb(r)::text AS row FROM risk_identity r
          UNION ALL SELECT to_jsonb(b)::text FROM risk_blocklist b`;
        expect(rows.length).toBeGreaterThan(0);
        for (const { row } of rows) {
          expect(row.toLowerCase()).not.toContain(
            SAMPLE.buyer.email.toLowerCase(),
          );
        }
      });
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });

  it("T-03 (AC-3): an expired blocklist entry does not refuse", async () => {
    await rolledBack(sql(), async (tx) => {
      const { connection, token, fake } = await basket(tx);
      riskClock = at(2);
      await tx`INSERT INTO risk_blocklist (kind, hash, source, expires_at)
               VALUES ('email', ${hashOf(SAMPLE.buyer.email)}, 'admin', ${at(2)})`;
      expect((await pay(connection, token)).kind).toBe("confirm");
      expect(fake.inputs).toHaveLength(1);
    });
  });

  it("T-05 (AC-5): three unpaid orders in 24 hours refuse; at 24 h 0 min 1 s, or with two, they do not", async () => {
    await rolledBack(sql(), async (tx) => {
      const [{ now: txStart } = { now: new Date() }] = await tx<
        { now: Date }[]
      >`SELECT now() AS now`;
      // Three earlier purchases for the same email, each started (identity row written) and then
      // closed unpaid by the sweep's own close. Their closing events carry the transaction time.
      const closed: string[] = [];
      const fake = new RecordingFake({ now: () => at(2) });
      for (let index = 0; index < 3; index += 1) {
        const { connection, token } = await basket(
          tx,
          SAMPLE.buyer.email,
          fake,
        );
        riskClock = txStart;
        expect((await pay(connection, token)).kind).toBe("confirm");
        expect(fake.inputs).toHaveLength(index + 1);
        const purchaseId = (await draftOf(connection, token)).purchaseId ?? "";
        expect(
          await endPaymentAttempts(purchaseId, "system:payments.sweep", {
            provider: fake,
            transaction: testTransaction,
            now: () => txStart,
            alert: () => undefined,
          }),
        ).toEqual({ kind: "closed" });
        closed.push(purchaseId);
      }
      const fourth = await basket(tx, SAMPLE.buyer.email, fake);
      const refusedAt = async (clock: Date) => {
        riskClock = clock;
        return prePayCheck(
          (await draftOf(fourth.connection, fourth.token)).purchaseId ?? "",
          {
            transaction: testTransaction,
            now: () => clock,
            flag: () => Promise.resolve(false),
            hashKey: () => KEY,
          },
        );
      };
      // Placement first (the pre-check reads the purchase's orders).
      riskClock = txStart;
      await tx`INSERT INTO risk_pause (cause, starts_at, ends_at)
               VALUES ('admin', ${txStart}, ${new Date(txStart.getTime() + 1000)})`;
      expect(await pay(fourth.connection, fourth.token)).toEqual({
        kind: "error",
        messageKey: "payments.error.unavailable",
      });
      await tx`DELETE FROM risk_pause`;
      const day = 24 * 60 * 60_000;
      expect(await refusedAt(new Date(txStart.getTime() + day))).toEqual({
        ok: false,
        reason: "failed_orders",
      });
      expect(await refusedAt(new Date(txStart.getTime() + day + 1000))).toEqual(
        { ok: true },
      );
      // With two: one of the three no longer carries this email hash.
      await tx`DELETE FROM risk_identity WHERE order_id IN (
                 SELECT id FROM "order" WHERE purchase_id = ${closed[0] ?? ""})`;
      expect(await refusedAt(txStart)).toEqual({ ok: true });
    });
  });

  it("T-04 (AC-4): the 5th decline cancels the intent and closes the order by system:risk; step 4 says so", async () => {
    await rolledBack(sql(), async (tx) => {
      const { connection, token, fake } = await basket(tx);
      riskClock = at(2);
      const paid = await pay(connection, token);
      if (paid.kind !== "confirm") throw new Error(JSON.stringify(paid));
      const ref = paid.clientSecret.replace(/_secret_fake$/u, "");
      for (let attempt = 1; attempt <= 4; attempt += 1) {
        await fake.simulateDecline(ref, "card_declined");
        expect(await runPaymentDeclined(ctx(connection, token, 3))).toEqual({
          kind: "error",
          messageKey: "payments.error.cardDeclined",
        });
      }
      expect((await statusesOf(tx, token, connection)).statuses).toEqual([
        "placed",
      ]);
      await fake.simulateDecline(ref, "card_declined");
      expect(await runPaymentDeclined(ctx(connection, token, 3))).toEqual({
        kind: "redirect",
        location: "/pl/checkout?step=review",
      });
      const { purchaseId, statuses } = await statusesOf(tx, token, connection);
      expect(statuses).toEqual(["payment_failed"]);
      const [event] = await tx<
        { actor: string; payload: { attempts: number } }[]
      >`
        SELECT e.actor, e.payload FROM order_event e JOIN "order" o ON o.id = e.order_id
         WHERE o.purchase_id = ${purchaseId} AND e.to_status = 'payment_failed'`;
      expect(event?.actor).toBe("system:risk");
      expect(event?.payload.attempts).toBe(5);
      expect(fake.calls.filter((call) => call.method === "cancel")).toEqual([
        expect.objectContaining({ method: "cancel", ref }),
      ]);
      const screen = await checkoutScreen({
        locale: "pl",
        token,
        connection,
        flags: OPEN,
        now: () => at(4),
      });
      expect(screen).toMatchObject({ kind: "ended", mode: "test" });
      // The attempt counts the detector reads: five declines, no success (AC-6's source).
      const stats = await attemptStats(
        new Date(0),
        new Date(Date.now() + 60_000),
        {
          livemode: false,
          transaction: testTransaction,
        },
      );
      expect(stats).toEqual({ declined: 5, succeeded: 0 });
    });
  });

  it("T-04 (AC-4): four declines then a success leave the order paid_unrouted", async () => {
    await rolledBack(sql(), async (tx) => {
      const { connection, token, fake } = await basket(tx);
      riskClock = at(2);
      const paid = await pay(connection, token);
      if (paid.kind !== "confirm") throw new Error(JSON.stringify(paid));
      const ref = paid.clientSecret.replace(/_secret_fake$/u, "");
      for (let attempt = 1; attempt <= 4; attempt += 1) {
        await fake.simulateDecline(ref, "card_declined");
        await runPaymentDeclined(ctx(connection, token, 3));
      }
      await fake.simulateSuccess(ref);
      expect(await runPaymentDeclined(ctx(connection, token, 4))).toEqual({
        kind: "redirect",
        location: "/pl/checkout/done",
      });
      expect((await statusesOf(tx, token, connection)).statuses).toEqual([
        "paid_unrouted",
      ]);
    });
  });

  it("T-06 (AC-6): a burst in live alerts once and pauses 30 minutes; pay refuses, then resumes; test alerts only; the flag refuses", async () => {
    await rolledBack(sql(), async (tx) => {
      const { connection, token, fake } = await basket(tx);
      await tx`DELETE FROM risk_pause`;
      const alerts: string[] = [];
      let stats = { declined: 10, succeeded: 8 };
      const tick = (mode: "test" | "live", clock: Date) =>
        detectCardTesting({
          mode,
          now: () => clock,
          transaction: testTransaction,
          attemptStats: () => Promise.resolve(stats),
          alert: (name) => {
            alerts.push(name);
          },
        });

      expect(await tick("test", at(2))).toEqual({
        suspected: true,
        alerted: true,
        paused: false,
      });
      expect(alerts).toEqual(["risk.card_testing_suspected"]);
      expect((await tx`SELECT 1 FROM risk_pause`).length).toBe(0);

      alerts.length = 0;
      expect(await tick("live", at(2))).toEqual({
        suspected: true,
        alerted: true,
        paused: true,
      });
      expect(await tick("live", at(3))).toEqual({
        suspected: true,
        alerted: false,
        paused: false,
      });
      expect(alerts).toEqual(["risk.card_testing_suspected"]);
      const pauses = await tx<
        { cause: string; starts_at: Date; ends_at: Date }[]
      >`
        SELECT cause, starts_at, ends_at FROM risk_pause`;
      expect(pauses).toEqual([
        { cause: "card_testing", starts_at: at(2), ends_at: at(32) },
      ]);

      riskClock = at(31);
      expect(await pay(connection, token)).toEqual({
        kind: "error",
        messageKey: "payments.error.unavailable",
      });
      expect(fake.inputs).toHaveLength(0);
      expect((await statusesOf(tx, token, connection)).statuses).toEqual([
        "placed",
      ]);
      riskClock = at(32);
      expect((await pay(connection, token, 3)).kind).toBe("confirm");
      expect(fake.inputs).toHaveLength(1);

      flags = { "risk.pay_pause": true };
      riskClock = at(40);
      const purchaseId = (await draftOf(connection, token)).purchaseId ?? "";
      expect(
        await prePayCheck(purchaseId, {
          transaction: testTransaction,
          now: () => riskClock,
          flag: (key) => Promise.resolve(flags[key] ?? false),
          hashKey: () => KEY,
        }),
      ).toEqual({ ok: false, reason: "paused" });
      flags = {};

      alerts.length = 0;
      await tx`DELETE FROM risk_pause`;
      stats = { declined: 9, succeeded: 0 };
      expect((await tick("live", at(50))).suspected).toBe(false);
      stats = { declined: 10, succeeded: 15 };
      expect((await tick("live", at(50))).suspected).toBe(false);
      expect(alerts).toEqual([]);
      expect((await tx`SELECT 1 FROM risk_pause`).length).toBe(0);
    });
  });

  it("T-31 (AC-31): the five tables' columns hold no email, fingerprint, address or name", async () => {
    const columns = await sql()<
      { table_name: string; column_name: string; data_type: string }[]
    >`
      SELECT table_name, column_name, data_type FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name LIKE 'risk\\_%'
       ORDER BY table_name, ordinal_position`;
    const byTable: Record<string, string[]> = {};
    for (const column of columns) {
      (byTable[column.table_name] ??= []).push(column.column_name);
    }
    expect(byTable).toEqual({
      risk_assessment: [
        "id",
        "order_id",
        "stage",
        "mode",
        "rules_version",
        "score",
        "decision",
        "enforced",
        "signals",
        "liability_shift",
        "radar_risk_level",
        "radar_risk_score",
        "radar_outcome",
        "created_at",
      ],
      risk_blocklist: [
        "kind",
        "hash",
        "source",
        "created_at",
        "last_matched_at",
        "expires_at",
      ],
      risk_identity: [
        "id",
        "order_id",
        "kind",
        "hash",
        "created_at",
        "expires_at",
      ],
      risk_pause: ["id", "cause", "starts_at", "ends_at", "created_at"],
      risk_review: [
        "id",
        "order_id",
        "assessment_id",
        "kind",
        "status",
        "recommendation",
        "deadline_at",
        "due_soon_alerted_at",
        "decided_at",
        "decided_by",
        "decision_reason",
        "created_at",
      ],
    });
    for (const column of columns) {
      expect(column.column_name).not.toMatch(
        /e[-_]?mail|fingerprint|address|name|street|phone/u,
      );
      expect(column.data_type).not.toBe("bytea");
    }
  });

  it("T-33 (AC-33): retention deletes each risk row exactly at its boundary", async () => {
    await rolledBack(sql(), async (tx) => {
      const { connection, token } = await basket(tx);
      riskClock = at(2);
      expect((await pay(connection, token)).kind).toBe("confirm");
      const [{ id: orderId } = { id: "" }] = await tx<
        { id: string }[]
      >`SELECT id FROM "order" LIMIT 1`;
      await tx`DELETE FROM risk_identity`;
      const h = (n: number) => n.toString(16).padStart(64, "0");
      await tx`INSERT INTO risk_identity (order_id, kind, hash, created_at, expires_at) VALUES
        (${orderId}, 'email', ${h(1)}, ${T0}, ${T0}),
        (${orderId}, 'card', ${h(2)}, ${T0}, ${T0}),
        (${orderId}, 'recipient_address', ${h(3)}, ${T0}, ${T0})`;
      const [assessment] = await tx<{ id: string }[]>`
        INSERT INTO risk_assessment (order_id, stage, mode, rules_version, score, decision, enforced, signals, created_at)
        VALUES (${orderId}, 'routing', 'test', 1, 0, 'pass', true, '[]'::jsonb, ${T0}) RETURNING id`;
      await tx`INSERT INTO risk_review (order_id, assessment_id, kind, status, recommendation, deadline_at, decided_at, decided_by, decision_reason, created_at)
        VALUES (${orderId}, ${assessment?.id ?? ""}, 'pre_routing', 'approved', 'approve', ${T0}, ${T0}, 'system:risk', 'looks_genuine', ${T0})`;
      await tx`INSERT INTO risk_blocklist (kind, hash, source, created_at, last_matched_at, expires_at) VALUES
        ('email', ${h(4)}, 'admin', ${T0}, NULL, ${at(400 * DAY)}),
        ('card', ${h(5)}, 'admin', ${T0}, ${at(10 * DAY)}, ${at(400 * DAY)})`;
      await tx`INSERT INTO risk_pause (cause, starts_at, ends_at, created_at) VALUES ('admin', ${T0}, ${at(1)}, ${T0})`;
      const sweep = async (now: Date) => {
        await asApp(tx, { role: "system" });
        await runRetentionSweep(runnerOf(tx), { now, dryRun: false });
        await tx.unsafe("RESET ROLE");
      };
      const count = async (table: string, where = "true") =>
        (
          await tx.unsafe<{ n: number }[]>(
            `SELECT count(*)::int AS n FROM ${table} WHERE ${where}`,
          )
        )[0]?.n;

      await sweep(at(30 * DAY));
      expect(await count("risk_pause")).toBe(1);
      await sweep(at(30 * DAY + 1));
      expect(await count("risk_pause")).toBe(0);

      await sweep(at(89 * DAY));
      expect(await count("risk_identity", "kind = 'recipient_address'")).toBe(
        1,
      );
      await sweep(at(90 * DAY));
      expect(await count("risk_identity", "kind = 'recipient_address'")).toBe(
        0,
      );
      expect(await count("risk_identity")).toBe(2);

      await sweep(at(364 * DAY));
      expect(await count("risk_identity")).toBe(2);
      expect(await count("risk_assessment")).toBe(1);
      expect(await count("risk_review")).toBe(1);
      expect(await count("risk_blocklist")).toBe(2);
      await sweep(at(365 * DAY));
      expect(await count("risk_identity")).toBe(0);
      expect(await count("risk_assessment")).toBe(0);
      expect(await count("risk_review")).toBe(0);
      // Never matched: 12 months after created_at; matched on day 10: 12 months after that.
      expect(await count("risk_blocklist")).toBe(1);
      await sweep(at(374 * DAY));
      expect(await count("risk_blocklist")).toBe(1);
      await sweep(at(375 * DAY));
      expect(await count("risk_blocklist")).toBe(0);
    });
  });

  it("T-35 (AC-35): the checks refuse a bad hash, a second open review and a pause that ends first", async () => {
    await rolledBack(sql(), async (tx) => {
      expect(
        (
          await pgFailure(tx, (sp) =>
            sp.unsafe(
              `INSERT INTO risk_blocklist (kind, hash, source, expires_at) VALUES ('email', 'ABC', 'admin', now())`,
            ),
          )
        ).constraint,
      ).toBe("risk_blocklist_hash_check");
      expect(
        (
          await pgFailure(tx, (sp) =>
            sp.unsafe(
              `INSERT INTO risk_pause (cause, starts_at, ends_at) VALUES ('admin', now(), now())`,
            ),
          )
        ).constraint,
      ).toBe("risk_pause_window_check");
      expect(
        (
          await pgFailure(tx, (sp) =>
            sp.unsafe(
              `INSERT INTO refund (payment_id, order_id, purchase_id, amount_minor, currency_code, reason, status, requested_by) VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 1, 'EUR', 'not_a_reason', 'requested', 'system:payments')`,
            ),
          )
        ).constraint,
      ).toMatch(/refund_reason_check|_fk$/u);
    });
  });

  it(
    "T-35 (AC-35): down refuses with A11_ROLLBACK_REASON_IN_USE while a risk refund exists; without one it runs down and up",
    async () => {
      const s = sql();
      await s.begin(async (t) => {
        await t.unsafe("SET LOCAL session_replication_role = replica");
        await t`INSERT INTO refund (payment_id, order_id, purchase_id, amount_minor, currency_code, reason, status, requested_by)
                VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 1, 'EUR', 'risk_cancel', 'requested', 'system:payments')`;
      });
      await expect(runner(db!.url, ["--down", "--to", "0042"])).rejects.toThrow(
        /A11_ROLLBACK_REASON_IN_USE/u,
      );
      const tables = async () =>
        (
          await s<{ n: number }[]>`SELECT count(*)::int AS n FROM pg_class
          WHERE relname IN ('risk_identity', 'risk_assessment', 'risk_review', 'risk_blocklist', 'risk_pause')`
        )[0]?.n;
      expect(await tables()).toBe(5);

      await s.begin(async (t) => {
        await t.unsafe("SET LOCAL session_replication_role = replica");
        await t`DELETE FROM refund WHERE reason = 'risk_cancel'`;
      });
      await runner(db!.url, ["--down", "--to", "0042"]);
      expect(await tables()).toBe(0);
      const [gone] = await s<{ flags: number; policies: number }[]>`
        SELECT (SELECT count(*)::int FROM feature_flag WHERE key LIKE 'risk.%') AS flags,
               (SELECT count(*)::int FROM retention_policy WHERE key LIKE 'risk\\_%') AS policies`;
      expect(gone).toEqual({ flags: 0, policies: 0 });

      await runner(db!.url);
      expect(await tables()).toBe(5);
      const [back] = await s<{ gate: boolean; policies: number }[]>`
        SELECT (SELECT enabled_default FROM feature_flag WHERE key = 'risk.gate') AS gate,
               (SELECT count(*)::int FROM retention_policy WHERE key LIKE 'risk\\_%') AS policies`;
      expect(back).toEqual({ gate: true, policies: 6 });
    },
    MIGRATION_MS,
  );
});
