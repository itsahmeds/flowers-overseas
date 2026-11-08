/**
 * The pay step against a disposable PG16 and spec 013's fake provider (spec 013 §5.2 "How a paid
 * order flows"; §14 A-founder-2026-10-22 item 3; AC-1, AC-4, AC-5 integration halves; T-01,
 * T-04, T-05; TASK-262). No network and no key: the provider is `FakePaymentProvider`, MSW is
 * not needed because nothing here builds a request, and the Stripe key in the environment is a
 * stubbed `sk_test_` placeholder that only the mode decision reads.
 *
 *  - **AC-1:** a `test` basket of 1, 2 and 5 deliveries placed through `runPay`: one intent for
 *    `purchase.total_minor` in its currency, the seven metadata keys, the references in basket
 *    order, no `receipt_email` and no `shipping` in the Stripe parameters, automatic capture
 *    with no per-method override and `request_three_d_secure: 'any'`; every order stays
 *    `placed`; a second "Pay" answers the same client secret with one payment row.
 *  - **AC-5:** a 3-order purchase declined: our message key, all three `placed`, attempts 1,
 *    one `order.payment_attempt_failed` per order, none again for the same decline; the refresh
 *    renders the unpaid step; a retry on the same intent and the return route move all three to
 *    `paid_unrouted`.
 *  - **AC-4:** `paymentReturnLocation` answers `/{locale}/checkout/done`; no captured log line
 *    carries the client secret.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { FX_SNAPSHOT_AS_OF } from "../../src/config/catalogue/fx.data.ts";
import { CHECKOUT_SAMPLES } from "../../src/config/checkout-samples.ts";
import { PAYMENT_METHODS } from "../../src/config/payment-methods.ts";
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
  paymentReturnLocation,
  runBuyerStep,
  runCardStep,
  runApplyDiscount,
  checkoutScreen as screenFor,
  runPay,
  runPaymentDeclined,
  runRecipientStep,
  startCheckout,
  unpaidPurchase,
} from "@/modules/checkout";
import { orderReference, type OrderExecutor } from "@/modules/orders";
import { FakePaymentProvider } from "@/modules/payments/fake";
import type { PaymentTransaction } from "@/modules/payments/lifecycle";
import type { MethodSources } from "@/modules/payments/methods";
import { registerStripePaymentSteps } from "@/modules/payments/pay-step";
import type { CreateIntentInput } from "@/modules/payments/provider";
import { stripeCreateIntentParams } from "@/modules/payments/stripe/params";

import { country, partner } from "./support/rows.ts";
import {
  asApp,
  probeLocalServer,
  rolledBack,
  scratchDatabase,
  type ScratchDatabase,
  type Sql,
  type Tx,
} from "./support/scratch-db.ts";
import { runnerOf } from "./support/sql-runner.ts";

const server = await probeLocalServer();

const T0 = new Date(`${FX_SNAPSHOT_AS_OF}T09:00:00.000Z`);
const at = (minutes: number): Date => new Date(T0.getTime() + minutes * 60_000);
const DAY = 24 * 60;

const PRODUCTS = await listProducts({ countryIso: "PL" });
const [PRODUCT, SECOND] = PRODUCTS;
if (PRODUCT === undefined || SECOND === undefined) {
  throw new Error("the dataset needs two products priced for PL");
}
const [TIER] = await listTiers(PRODUCT.sku);
const [SECOND_TIER] = await listTiers(SECOND.sku);
if (TIER === undefined || SECOND_TIER === undefined) {
  throw new Error("each product needs a tier");
}

const OPEN: CheckoutFlagReader = () => Promise.resolve(true);
const SAMPLE = CHECKOUT_SAMPLES.PL;

/** The first selectable demo date three days out, so a one-day clock move keeps it. */
const DELIVERY_DATE =
  nextDeliveryDate("PL", new Date(T0.getTime() + 3 * DAY * 60_000)) ?? "";

let db: ScratchDatabase | undefined;

beforeAll(async () => {
  if (server.url !== undefined) {
    db = await scratchDatabase(server.url, "checkout_place");
  }
}, 180_000);

afterAll(async () => {
  await db?.drop();
});

/** PL with one demo florist, both products, then the system context. */
async function seed(tx: Tx | Sql): Promise<void> {
  const plId = await country(tx as Tx, "PL");
  await tx`INSERT INTO locale (code, bcp47, name) VALUES ('en-gb', 'en-GB', 'English (UK)')
           ON CONFLICT DO NOTHING`;
  for (const sku of [PRODUCT?.sku ?? "", SECOND?.sku ?? ""]) {
    await tx`
      INSERT INTO product (sku, product_type, primary_flower, colour_primary, style, price_tier,
                           substitution_class, freshness_days)
      VALUES (${sku}, 'bouquet', 'roses', 'red', 'classic', 'classic', 'main_flower', 5)
      ON CONFLICT DO NOTHING`;
  }
  const [florists] = await tx<{ n: number }[]>`
    SELECT count(*)::int AS n FROM fulfillment_partner WHERE status = 'demo'`;
  if ((florists?.n ?? 0) === 0) await partner(tx as Tx, plId, "demo");
}

async function seeded(tx: Tx): Promise<DraftConnection> {
  await seed(tx);
  await asApp(tx, { role: "system" });
  return { executor: runnerOf(tx) };
}

function form(values: Record<string, string | readonly string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    for (const item of typeof value === "string" ? [value] : value) {
      data.append(key, item);
    }
  }
  return data;
}

async function shown(
  sku: string,
  tierKey: string,
): Promise<{ amountMinor: number; currency: string }> {
  const projection = await priceProjection("pl", {
    productId: sku,
    tierKey,
    countryIso: "PL",
    now: T0,
  });
  return projection.displayPrice;
}

/** "Add to basket" (or "Try a demo order") for one product; returns the basket's token. */
async function add(
  connection: DraftConnection,
  sku: string,
  tierKey: string,
  token: string | null = null,
): Promise<string> {
  const display = await shown(sku, tierKey);
  const response = await startCheckout(
    new Request("http://flowersoverseas.test/api/checkout/start", {
      method: "POST",
      headers: {
        host: "flowersoverseas.test",
        origin: "http://flowersoverseas.test",
        "content-type": "application/x-www-form-urlencoded",
        ...(token === null ? {} : { cookie: `fo_checkout=${token}` }),
      },
      body: new URLSearchParams({
        locale: "pl",
        countryIso: "PL",
        sku,
        tierKey,
        expectedTotalMinor: String(display.amountMinor),
        expectedCurrency: display.currency,
        then: "checkout",
      }).toString(),
    }),
    { now: () => T0, connection, flags: OPEN },
  );
  if (token !== null) return token;
  const started = draftTokenFromCookieHeader(
    response.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith("fo_checkout=")),
  );
  if (started === null) {
    throw new Error(
      `no basket: ${String(response.status)} ${response.headers.get("location") ?? ""}`,
    );
  }
  return started;
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

/** Steps 1 and 2 of every line, as the buyer posts them. */
async function fill(
  connection: DraftConnection,
  token: string,
  lines: number,
): Promise<void> {
  for (let line = 1; line <= lines; line += 1) {
    const outcome = await runRecipientStep(
      ctx(connection, token),
      form({
        line: String(line),
        ...SAMPLE.recipient.fields,
        fullName: `Anna Przykładowa ${String(line)}`,
        placeKind: SAMPLE.recipient.placeKind,
        deliveryNote: "",
        deliveryDate: DELIVERY_DATE,
      }),
    );
    location(outcome);
  }
  for (let line = 1; line <= lines; line += 1) {
    const outcome = await runCardStep(
      ctx(connection, token),
      form({
        line: String(line),
        cardMessage: `Wszystkiego najlepszego ${String(line)}`,
        signAs: "Sam",
      }),
    );
    location(outcome);
  }
  // Step 3, "Your details", once per order (spec 010 §14 A-founder-2026-10-25a item 1).
  location(
    await runBuyerStep(
      ctx(connection, token),
      form({
        email: SAMPLE.buyer.email,
        buyerName: SAMPLE.buyer.buyerName,
        buyerPhone: "",
        residenceCountry: SAMPLE.buyer.residenceCountry,
      }),
    ),
  );
}

async function draftOf(
  connection: DraftConnection,
  token: string,
  minutes = 2,
): Promise<Draft> {
  const lookup = await loadDraft(token, at(minutes), connection);
  if (lookup.status !== "active") throw new Error(`draft ${lookup.status}`);
  return lookup.draft;
}

/** The total the review displays: the basket's assessed total. */
async function reviewTotal(
  connection: DraftConnection,
  token: string,
  minutes = 2,
): Promise<{ amountMinor: number; currency: string }> {
  const assessed = await assessBasket(
    await draftOf(connection, token, minutes),
    {
      locale: "pl",
      now: at(minutes),
      flags: OPEN,
    },
  );
  if (assessed.total === null) throw new Error("no total");
  return assessed.total;
}
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

/** The fake, recording every `createIntent` input (what the adapter would send, AC-1). */
class RecordingFake extends FakePaymentProvider {
  readonly inputs: CreateIntentInput[] = [];
  override createIntent(input: CreateIntentInput) {
    this.inputs.push(input);
    return super.createIntent(input);
  }
}

/** The step's lifecycle on the test's own transaction (one connection, rolled back after). */
let current: { provider: RecordingFake; executor: OrderExecutor } | null = null;
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
      transaction: (<T>(fn: (executor: OrderExecutor) => Promise<T>) => {
        if (current === null) throw new Error("no transaction");
        return fn(current.executor);
      }) as PaymentTransaction,
      now: () => at(2),
      alert: () => undefined,
    },
  },
});

const describeDb = server.url === undefined ? describe.skip : describe;

describeDb(`the pay step (${server.reason})`, () => {
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

  /** A `test` basket of `lines` deliveries, filled; its token and the review's total. */
  async function basket(
    tx: Tx,
    lines: number,
  ): Promise<{
    connection: DraftConnection;
    token: string;
    fake: RecordingFake;
  }> {
    const connection = await seeded(tx);
    const fake = new RecordingFake({ now: () => at(2) });
    current = { provider: fake, executor: runnerOf(tx) };
    let token = await add(connection, PRODUCT?.sku ?? "", TIER?.tierKey ?? "");
    for (let line = 2; line <= lines; line += 1) {
      token = await add(
        connection,
        (line % 2 === 0 ? SECOND?.sku : PRODUCT?.sku) ?? "",
        (line % 2 === 0 ? SECOND_TIER?.tierKey : TIER?.tierKey) ?? "",
        token,
      );
    }
    await fill(connection, token, lines);
    expect((await draftOf(connection, token)).mode).toBe("test");
    return { connection, token, fake };
  }

  async function payForm(connection: DraftConnection, token: string) {
    const total = await reviewTotal(connection, token);
    return form({
      seenTotalMinor: String(total.amountMinor),
      seenCurrency: total.currency,
    });
  }

  it("spec 047 AC-18, T-18: a discounted test basket's intent is buyer_total_minor, the discounted total, with the same metadata keys", async () => {
    await rolledBack(sql(), async (tx) => {
      const { connection, token, fake } = await basket(tx, 2);
      await tx.unsafe("RESET ROLE");
      await tx`
        INSERT INTO discount_code (code, code_normalised, campaign_label, kind, percent_bp, starts_at)
        VALUES ('POLONIA10', 'POLONIA10', 'Fixture campaign', 'percent', 1000,
                ${at(-1440).toISOString()}::timestamptz)`;
      await asApp(tx, { role: "system" });
      const before = await reviewTotal(connection, token);
      const applied = await runApplyDiscount(
        ctx(connection, token, 2),
        form({ code: "POLONIA10" }),
      );
      expect(applied.kind === "notice" && applied.notice.kind).toBe("applied");
      const screen = await screenFor({
        locale: "pl",
        token,
        step: "review",
        connection,
        flags: OPEN,
        now: () => at(2),
      });
      if (screen.kind !== "step" || screen.total === null) {
        throw new Error("no review");
      }
      const charged = screen.total;
      expect(charged.amountMinor).toBeLessThan(before.amountMinor);

      const outcome = await runPay(
        ctx(connection, token, 2),
        form({
          seenTotalMinor: String(charged.amountMinor),
          seenCurrency: charged.currency,
        }),
      );
      expect(outcome.kind).toBe("confirm");
      const [totals] = await tx<{ purchase: string; orders: string }[]>`
        SELECT p.total_minor::text AS purchase,
               (SELECT sum(buyer_total_minor) FROM "order" WHERE purchase_id = p.id)::text AS orders
          FROM purchase p`;
      expect(Number(totals?.purchase)).toBe(charged.amountMinor);
      expect(Number(totals?.orders)).toBe(charged.amountMinor);
      const [input] = fake.inputs;
      if (input === undefined) throw new Error("no intent");
      expect(input.amount).toEqual({
        amountMinor: charged.amountMinor,
        currency: charged.currency,
      });
      expect(
        Object.keys(stripeCreateIntentParams(input).metadata).sort(),
      ).toEqual(
        [
          "buyer_country_declared",
          "destination_countries",
          "is_first_order",
          "order_count",
          "order_mode",
          "payment_id",
          "purchase_id",
        ].sort(),
      );
    });
  });

  for (const lines of [1, 2, 5]) {
    it(`AC-1 (${String(lines)} deliveries): one intent for purchase.total_minor, seven keys, the references, no receipt or shipping`, async () => {
      await rolledBack(sql(), async (tx) => {
        const { connection, token, fake } = await basket(tx, lines);
        const outcome = await runPay(
          ctx(connection, token, 2),
          await payForm(connection, token),
        );
        expect(outcome.kind).toBe("confirm");
        const draft = await draftOf(connection, token);
        const purchaseId = draft.purchaseId ?? "";
        const [purchase] = await tx<
          { total_minor: string; currency: string }[]
        >`
          SELECT total_minor::text, buyer_currency_code AS currency FROM purchase WHERE id = ${purchaseId}`;
        const orders = await tx<
          { id: string; status: string; buyer_total_minor: string }[]
        >`
          SELECT o.id, o.status, o.buyer_total_minor::text FROM "order" o
            JOIN checkout_draft_line l ON l.order_id = o.id
           WHERE o.purchase_id = ${purchaseId} ORDER BY l.position`;
        expect(orders).toHaveLength(lines);
        expect(orders.every((order) => order.status === "placed")).toBe(true);
        expect(Number(purchase?.total_minor)).toBe(
          orders.reduce(
            (sum, order) => sum + Number(order.buyer_total_minor),
            0,
          ),
        );
        expect(fake.inputs).toHaveLength(1);
        const [input] = fake.inputs;
        if (input === undefined) throw new Error("no intent");
        expect(input.amount).toEqual({
          amountMinor: Number(purchase?.total_minor),
          currency: purchase?.currency,
        });
        expect(input.captureMethod).toBe("automatic");
        expect(input.description).toBe(
          orders.map((order) => orderReference(order.id)).join(", "),
        );
        const params = stripeCreateIntentParams(input);
        expect(Object.keys(params.metadata).sort()).toEqual(
          [
            "buyer_country_declared",
            "destination_countries",
            "is_first_order",
            "order_count",
            "order_mode",
            "payment_id",
            "purchase_id",
          ].sort(),
        );
        expect(params.metadata.order_count).toBe(String(lines));
        expect(params.metadata.purchase_id).toBe(purchaseId);
        expect(params.metadata.order_mode).toBe("test");
        expect(params).not.toHaveProperty("receipt_email");
        expect(params).not.toHaveProperty("shipping");
        expect(params.capture_method).toBe("automatic");
        expect(params.payment_method_options).toEqual({
          card: { request_three_d_secure: "any" },
        });
        expect(params.payment_method_types).toEqual(["card"]);
        expect(outcome).toEqual({
          kind: "confirm",
          clientSecret: expect.stringMatching(/_secret_fake$/u),
        });

        // A second "Pay" (double click, retry): the same intent, one payment row.
        const again = await runPay(
          ctx(connection, token, 3),
          await payForm(connection, token),
        );
        expect(again).toEqual(outcome);
        const keys = new Set(fake.inputs.map((entry) => entry.idempotencyKey));
        expect(keys.size).toBe(1);
        const [{ n } = { n: 0 }] = await tx<{ n: number }[]>`
          SELECT count(*)::int AS n FROM payment WHERE purchase_id = ${purchaseId}`;
        expect(n).toBe(1);
      });
    });
  }

  it("AC-5, AC-4: a decline on a 3-order purchase, the refresh, the retry and the return route", async () => {
    const lines: unknown[] = [];
    const spies = (["info", "warn", "error", "debug"] as const).map((level) =>
      vi.spyOn(logger, level).mockImplementation((...args: unknown[]) => {
        lines.push(args);
        return undefined as never;
      }),
    );
    try {
      await rolledBack(sql(), async (tx) => {
        const { connection, token, fake } = await basket(tx, 3);
        const paid = await runPay(
          ctx(connection, token, 2),
          await payForm(connection, token),
        );
        if (paid.kind !== "confirm") throw new Error(JSON.stringify(paid));
        const ref = paid.clientSecret.replace(/_secret_fake$/u, "");
        const purchaseId = (await draftOf(connection, token)).purchaseId ?? "";
        const events = async () =>
          tx<{ order_id: string; payload: unknown }[]>`
            SELECT e.order_id, e.payload FROM order_event e JOIN "order" o ON o.id = e.order_id
             WHERE o.purchase_id = ${purchaseId} AND e.type = 'order.payment_attempt_failed'`;

        await fake.simulateDecline(ref, "insufficient_funds");
        expect(await runPaymentDeclined(ctx(connection, token, 3))).toEqual({
          kind: "error",
          messageKey: "payments.error.insufficientFunds",
        });
        const statuses = await tx<{ status: string }[]>`
          SELECT status FROM "order" WHERE purchase_id = ${purchaseId}`;
        expect(statuses.map((row) => row.status)).toEqual([
          "placed",
          "placed",
          "placed",
        ]);
        const [payment] = await tx<{ attempts: number }[]>`
          SELECT attempts FROM payment WHERE purchase_id = ${purchaseId}`;
        expect(payment?.attempts).toBe(1);
        const first = await events();
        expect(first).toHaveLength(3);
        expect(new Set(first.map((row) => row.order_id)).size).toBe(3);
        expect(JSON.stringify(first)).not.toMatch(
          /insufficient funds|your card/iu,
        );

        // The same decline reported again: no new event.
        await runPaymentDeclined(ctx(connection, token, 4));
        expect(await events()).toHaveLength(3);

        // The refresh: step 3 for the unpaid purchase, from its orders.
        expect(
          await checkoutScreen({
            locale: "pl",
            token,
            connection,
            flags: OPEN,
            now: () => at(5),
          }),
        ).toEqual({ kind: "unpaid", mode: "test" });
        const unpaid = await unpaidPurchase(ctx(connection, token, 5));
        expect(unpaid?.purchaseId).toBe(purchaseId);
        expect(unpaid?.buyerCountry).toBe(SAMPLE.buyer.residenceCountry);

        // The retry on the same intent, then the return route.
        const retried = await runPay(ctx(connection, token, 6), form({}));
        expect(retried).toEqual(paid);
        await fake.simulateSuccess(ref);
        expect(await paymentReturnLocation(ctx(connection, token, 7))).toBe(
          "/pl/checkout/done",
        );
        const after = await tx<{ status: string }[]>`
          SELECT status FROM "order" WHERE purchase_id = ${purchaseId}`;
        expect(after.map((row) => row.status)).toEqual([
          "paid_unrouted",
          "paid_unrouted",
          "paid_unrouted",
        ]);
        expect(
          await checkoutScreen({
            locale: "pl",
            token,
            connection,
            flags: OPEN,
            now: () => at(8),
          }),
        ).toEqual({ kind: "placed" });
        expect(fake.inputs).toHaveLength(2);
        expect(
          new Set(fake.inputs.map((entry) => entry.idempotencyKey)).size,
        ).toBe(1);
        // AC-4: no log line carries the client secret.
        expect(JSON.stringify(lines)).not.toContain(paid.clientSecret);
        expect(JSON.stringify(lines)).not.toMatch(/_secret_/u);
      });
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
});
