/**
 * Spec 023's server side on a migrated PG16 scratch database, never the shared database (§10 T-19
 * database half, T-20 to T-24, T-28 integration half, T-29, T-30; AC-19 to AC-24, AC-28 to AC-30;
 * TASK-491). The Measurement Protocol is a recording fake `fetch`; nothing leaves the machine.
 *
 *  - T-19 (AC-19): `recordOrderContext` writes one row for a `test` order with the ids, none for a
 *    `demo` order, and a forced failure is logged `analytics.context_failed` and never thrown.
 *  - T-20 (AC-20): one request to `region1`'s `/mp/collect` with the id and secret, a body that
 *    parses `MpPurchaseBodySchema` with exactly four top-level keys, the random transaction id, the
 *    captured value and instant, consent by the marketing answer; one `sent` row.
 *  - T-21 (AC-21): row 14 sends nothing and writes nothing; redelivery sends nothing; a second
 *    `sent` purchase fails on `analytics_one_purchase_sent`; a crash after the 2xx resends the same
 *    transaction id and leaves one `sent` row.
 *  - T-22 (AC-22): each skip reason, zero requests, one row; `value_mismatch` raises its alert.
 *  - T-23 (AC-23): a network error, the timeout and a 503 throw; a 400 is `rejected` with its alert.
 *  - T-24 (AC-24): partial then full refund, each one `refund` with the purchase's ids; redelivery;
 *    `no_purchase_sent`; `ids_cleared`.
 *  - T-28 (AC-28): no captured log line holds the secret, the client id, the session id or the
 *    transaction id.
 *  - T-29 (AC-29): the checks, RLS for a non-`system` role, and the down, up round trip.
 *  - T-30 (AC-30): the retention sweep clears the ids at 61 days and not at 59.
 */
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Ga4ServerConfig } from "@/lib/env.analytics";
import type { Logger } from "@/lib/logger";
import {
  MpPurchaseBodySchema,
  MpRefundBodySchema,
  ga4OutboxHandler,
  recordOrderContext,
} from "@/modules/analytics";
import type {
  OrderExecutor,
  OutboxDeliveryEvent,
  OutboxHandlerContext,
} from "@/modules/orders";

import { runRetentionSweep } from "../../src/jobs/retention.ts";
import { readCatalogue } from "../../scripts/db-check-live.ts";
import {
  FIXTURE_ACTOR,
  applyTransition,
  insertPlacedOrder,
  walkOrderTo,
} from "../fixtures/order-state.ts";
import * as make from "./support/rows.ts";
import { runnerOf, sqlText } from "./support/sql-runner.ts";
import {
  MIGRATE_LOCK,
  asApp,
  pgFailure,
  probeLocalServer,
  rolledBack,
  runner,
  scratchDatabase,
  type ScratchDatabase,
  type Tx,
} from "./support/scratch-db.ts";

const server = await probeLocalServer();

const MIGRATIONS = resolve(import.meta.dirname, "../../db/migrations");
const FORWARD = readdirSync(MIGRATIONS)
  .filter(
    (name) => /^\d{4}_.+\.sql$/u.test(name) && !name.endsWith(".down.sql"),
  )
  .sort();
const MINE = FORWARD.find((name) => name.endsWith("_analytics_ga4.sql")) ?? "";
const BEFORE = FORWARD[FORWARD.indexOf(MINE) - 1]?.slice(0, 4) ?? "";

const T0 = new Date("2026-11-08T10:00:00.000Z");
const HOUR = 3_600_000;
const SECRET = "fixtureSecret_ga4_9f3a";
const CLIENT_ID = "123456789.1700000000";
const SESSION_ID = "1700000123";
const CONFIG: Ga4ServerConfig = {
  configured: true,
  measurementId: "G-FIXTURE00",
  apiSecret: SECRET,
  validate: false,
  environment: "staging",
};

interface Call {
  readonly url: URL;
  readonly body: unknown;
}

/** A recording `fetch`: answers `status`, or throws / hangs for the transport cases. */
function fakeFetch(answer: number | "network" | "hang" = 204) {
  const calls: Call[] = [];
  const fn = ((input: string | URL, init?: RequestInit) => {
    calls.push({
      url: new URL(String(input)),
      body: JSON.parse(String(init?.body)) as unknown,
    });
    if (answer === "network") {
      return Promise.reject(new TypeError("fetch failed"));
    }
    if (answer === "hang") {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(init.signal?.reason as Error);
        });
      });
    }
    return Promise.resolve(new Response(null, { status: answer }));
  }) as typeof fetch;
  return { fn, calls };
}

interface Line {
  readonly msg: string;
  readonly fields: unknown;
}

function captureLog(): { log: Logger; lines: Line[] } {
  const lines: Line[] = [];
  const record =
    () =>
    (fields: unknown, msg?: string): void => {
      lines.push({ msg: msg ?? "", fields });
    };
  const log = {
    info: record(),
    warn: record(),
    error: record(),
    debug: record(),
  } as unknown as Logger;
  return { log, lines };
}

/** A legal transition with a payload (the refund events carry `refund_id` and the amount). */
async function transitionWithPayload(
  tx: Tx,
  orderId: string,
  event: string,
  to: string,
  payload: Record<string, unknown>,
): Promise<string> {
  const [current] = await tx<{ status: string; seq: number | null }[]>`
    SELECT o.status, (SELECT max(seq) FROM order_event e WHERE e.order_id = o.id) AS seq
    FROM "order" o WHERE o.id = ${orderId} FOR UPDATE`;
  await tx`SELECT set_config('app.allow_status_write', 'on', true)`;
  await tx`SELECT set_config('app.transition_event', ${event}, true)`;
  await tx`UPDATE "order" SET status = ${to} WHERE id = ${orderId}`;
  await tx`SELECT set_config('app.allow_status_write', '', true)`;
  await tx`SELECT set_config('app.transition_event', '', true)`;
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO order_event (order_id, seq, type, from_status, to_status, actor, payload,
                             payload_version)
    VALUES (${orderId}, ${(current?.seq ?? 0) + 1}, ${event}, ${current?.status ?? null}, ${to},
            ${FIXTURE_ACTOR}, ${tx.json(payload as never)}, 1)
    RETURNING id`;
  return row?.id ?? "";
}

interface Fixture {
  readonly orderId: string;
  readonly purchaseId: string;
  readonly paymentId: string;
  readonly capturedEventId: string;
  readonly transactionId: string;
  readonly reference: string;
}

interface FixtureOptions {
  readonly mode?: "test" | "live" | "demo";
  readonly analytics?: boolean;
  readonly marketing?: boolean;
  readonly clientId?: string | null;
  readonly context?: boolean;
  /** The payment's captured amount (default: the order total, 4599). */
  readonly captured?: number;
}

/** A placed GBP order of one product line at 45.99, captured at `T0`, with its context. */
async function fixture(tx: Tx, options: FixtureOptions = {}): Promise<Fixture> {
  const mode = options.mode ?? "live";
  await make.base(tx);
  const countryId = await make.country(tx, "PL");
  const customerId = await make.customer(tx);
  const recipientId = await make.recipient(tx, customerId);
  const [product] = await tx<{ id: string }[]>`
    INSERT INTO product (sku, product_type, primary_flower, colour_primary, style, price_tier,
                         substitution_class, freshness_days)
    VALUES ('FO-BQ-023', 'bouquet', 'tulips', 'pink', 'classic', 'classic', 'main_flower', 5)
    ON CONFLICT (sku) DO UPDATE SET sku = EXCLUDED.sku
    RETURNING id`;
  const productId = product?.id ?? "";
  await tx`INSERT INTO product_translation (product_id, locale_code, name, slug)
           VALUES (${productId}, 'en', 'Spring Tulips', ${make.unique("spring-tulips-")})
           ON CONFLICT DO NOTHING`;
  const orderId = await insertPlacedOrder(tx, {
    customerId,
    recipientId,
    countryId,
    mode,
    currencyCode: "GBP",
    totalMinor: 4599,
  });
  await tx`INSERT INTO order_line (order_id, kind, product_id, tier_key, qty, unit_retail_minor,
                                   currency_code, vat_rate_bp)
           VALUES (${orderId}, 'product', ${productId}, 'stems_18', 1, 4599, 'GBP', 800)`;
  const [order] = await tx<{ purchase_id: string; public_token: string }[]>`
    SELECT purchase_id, public_token FROM "order" WHERE id = ${orderId}`;
  const purchaseId = order?.purchase_id ?? "";
  const [payment] = await tx<{ id: string }[]>`
    INSERT INTO payment (purchase_id, provider, provider_ref, status, method, amount_minor,
                         currency_code, livemode, capture_method, amount_captured_minor,
                         captured_at)
    VALUES (${purchaseId}, 'stripe', ${make.unique("pi_ga_")}, 'captured', 'card',
            ${options.captured ?? 4599}, 'GBP', ${mode === "live"}, 'automatic',
            ${options.captured ?? 4599}, ${T0.toISOString()}::timestamptz)
    RETURNING id`;
  await applyTransition(tx, orderId, "order.captured", "paid_unrouted");
  const [event] = await tx<{ id: string }[]>`
    SELECT id FROM order_event WHERE order_id = ${orderId} AND type = 'order.captured'`;
  if (options.context !== false) {
    const analytics = options.analytics ?? true;
    await recordOrderContext(
      [orderId],
      {
        analyticsConsent: analytics,
        marketingConsent: options.marketing ?? false,
        consentPolicyVersion: "1",
        gaClientId: analytics
          ? options.clientId === undefined
            ? CLIENT_ID
            : options.clientId
          : null,
        gaSessionId: analytics && options.clientId !== null ? SESSION_ID : null,
      },
      { executor: runnerOf(tx) },
    );
  }
  const [context] = await tx<{ ga_transaction_id: string }[]>`
    SELECT ga_transaction_id FROM order_analytics WHERE order_id = ${orderId}`;
  return {
    orderId,
    purchaseId,
    paymentId: payment?.id ?? "",
    capturedEventId: event?.id ?? "",
    transactionId: context?.ga_transaction_id ?? "",
    reference: order?.public_token ?? "",
  };
}

function deliveryEvent(
  f: Fixture,
  overrides: Partial<OutboxDeliveryEvent> = {},
): OutboxDeliveryEvent {
  return {
    eventId: f.capturedEventId,
    orderId: f.orderId,
    type: "order.captured",
    seq: 2,
    fromStatus: "placed",
    toStatus: "paid_unrouted",
    mode: "live",
    ...overrides,
  };
}

function contextOf(executor: OrderExecutor): OutboxHandlerContext {
  return {
    deliveryId: "0b8e7d6c-5a4f-4e3d-8c2b-1a0f9e8d7c6b",
    outboxId: "1c9f8e7d-6b5a-4f4e-9d3c-2b1a0f9e8d7c",
    target: "analytics.ga4",
    attempt: 1,
    executor,
  };
}

async function dispatchRows(tx: Tx, orderId: string) {
  return tx<
    {
      kind: string;
      outcome: string;
      skip_reason: string | null;
      http_status: number | null;
    }[]
  >`SELECT kind, outcome, skip_reason, http_status FROM analytics_dispatch
    WHERE order_id = ${orderId} ORDER BY finished_at, id`;
}

interface Alert {
  readonly alert: string;
  readonly fields: unknown;
}

function handlerFor(
  fetch: typeof globalThis.fetch,
  overrides: {
    config?: Ga4ServerConfig;
    flag?: boolean;
    now?: Date;
    alerts?: Alert[];
    log?: Logger;
  } = {},
) {
  return ga4OutboxHandler({
    config: () => overrides.config ?? CONFIG,
    flagOn: () => Promise.resolve(overrides.flag ?? true),
    fetch,
    now: () => overrides.now ?? new Date(T0.getTime() + HOUR),
    timeoutMs: 50,
    alert: (alert, fields) => overrides.alerts?.push({ alert, fields }),
    log: overrides.log ?? captureLog().log,
  });
}

describe.skipIf(server.url === undefined)(
  `spec 023 GA4 server side${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "ga491");
    }, 600_000);

    afterAll(async () => {
      await scratch.drop();
    });

    it("T-19 (AC-19): one row for a test order with the ids, none for demo, a failure only logged", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const test = await fixture(tx, { mode: "test" });
        const [row] =
          await tx`SELECT * FROM order_analytics WHERE order_id = ${test.orderId}`;
        expect(row).toMatchObject({
          analytics_consent: true,
          ga_client_id: CLIENT_ID,
          ga_session_id: SESSION_ID,
        });
        expect(row?.["ga_transaction_id"]).not.toBe(test.orderId);

        const demo = await fixture(tx, { mode: "demo" });
        expect(
          await tx`SELECT 1 FROM order_analytics WHERE order_id = ${demo.orderId}`,
        ).toHaveLength(0);

        const { log, lines } = captureLog();
        const failing: OrderExecutor = {
          execute: (query) => {
            const text = sqlText(query);
            if (text.includes("INSERT INTO order_analytics")) {
              return Promise.reject(new Error("forced"));
            }
            return runnerOf(tx).execute(query);
          },
        };
        await expect(
          recordOrderContext(
            [test.orderId],
            {
              analyticsConsent: false,
              marketingConsent: false,
              consentPolicyVersion: "1",
              gaClientId: null,
              gaSessionId: null,
            },
            { executor: failing, log },
          ),
        ).resolves.toBeUndefined();
        expect(lines.map((line) => line.msg)).toContain(
          "analytics.context_failed",
        );
      });
    });

    it("T-20 (AC-20): one purchase request with exactly the stated body; one sent row", async () => {
      for (const marketing of [false, true]) {
        await rolledBack(scratch.sql, async (tx) => {
          const f = await fixture(tx, { marketing });
          const fake = fakeFetch(204);
          await handlerFor(fake.fn)(deliveryEvent(f), contextOf(runnerOf(tx)));
          expect(fake.calls).toHaveLength(1);
          const call = fake.calls[0] as Call;
          expect(call.url.origin + call.url.pathname).toBe(
            "https://region1.google-analytics.com/mp/collect",
          );
          expect(call.url.searchParams.get("measurement_id")).toBe(
            "G-FIXTURE00",
          );
          expect(call.url.searchParams.get("api_secret")).toBe(SECRET);
          const body = MpPurchaseBodySchema.parse(call.body);
          expect(Object.keys(call.body as object).sort()).toEqual(
            ["client_id", "consent", "events", "timestamp_micros"].sort(),
          );
          const params = body.events[0].params;
          expect(params.transaction_id).toBe(f.transactionId);
          expect(params.transaction_id).not.toBe(f.orderId);
          expect(params.transaction_id).not.toBe(f.reference);
          expect(params.value).toBe(45.99);
          expect(params.currency).toBe("GBP");
          expect(params.items).toEqual([
            {
              item_id: "FO-BQ-023",
              item_name: "Spring Tulips",
              item_category: "product",
              item_variant: "stems_18",
              price: 45.99,
              quantity: 1,
              item_destination_country: "PL",
            },
          ]);
          expect(params.checkout_channel).toBe("checkout");
          expect(params.debug_mode).toBe(1);
          expect(body.timestamp_micros).toBe(T0.getTime() * 1000);
          expect(body.client_id).toBe(CLIENT_ID);
          const signal = marketing ? "GRANTED" : "DENIED";
          expect(body.consent).toEqual({
            ad_user_data: signal,
            ad_personalization: signal,
          });
          expect(await dispatchRows(tx, f.orderId)).toEqual([
            {
              kind: "purchase",
              outcome: "sent",
              skip_reason: null,
              http_status: 204,
            },
          ]);
        });
      }
    });

    it("T-21 (AC-21): row 14 nothing; redelivery nothing; the index refuses a second sent; a crash resends the same id", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const f = await fixture(tx);
        const fake = fakeFetch(204);
        const handler = handlerFor(fake.fn);
        await handler(
          deliveryEvent(f, { fromStatus: "accepted", toStatus: "paid" }),
          contextOf(runnerOf(tx)),
        );
        expect(fake.calls).toHaveLength(0);
        expect(await dispatchRows(tx, f.orderId)).toEqual([]);

        // A crash after the 2xx and before the commit: the savepoint is the delivery's work.
        await tx
          .savepoint(async (sp) => {
            await handler(deliveryEvent(f), contextOf(runnerOf(sp)));
            throw new Error("crash");
          })
          .catch(() => undefined);
        expect(fake.calls).toHaveLength(1);
        expect(await dispatchRows(tx, f.orderId)).toEqual([]);

        await handler(deliveryEvent(f), contextOf(runnerOf(tx)));
        expect(fake.calls).toHaveLength(2);
        const ids = fake.calls.map(
          (call) =>
            MpPurchaseBodySchema.parse(call.body).events[0].params
              .transaction_id,
        );
        expect(ids[0]).toBe(ids[1]);

        await handler(deliveryEvent(f), contextOf(runnerOf(tx)));
        expect(fake.calls).toHaveLength(2);
        expect(await dispatchRows(tx, f.orderId)).toHaveLength(1);

        const failure = await pgFailure(
          tx,
          (sp) => sp`
          INSERT INTO analytics_dispatch (order_id, event_id, kind, outcome, http_status)
          SELECT ${f.orderId}, e.id, 'purchase', 'sent', 204 FROM order_event e
          WHERE e.order_id = ${f.orderId} AND e.type = 'order.placed'`,
        );
        expect(failure.constraint).toBe("analytics_one_purchase_sent");
      });
    });

    it("T-22 (AC-22): each skip reason writes one row and sends nothing", async () => {
      const cases: readonly {
        reason: string;
        options?: FixtureOptions;
        handler?: Parameters<typeof handlerFor>[1];
        mode?: "test" | "live";
      }[] = [
        {
          reason: "not_configured",
          handler: { config: { configured: false, environment: "staging" } },
        },
        { reason: "disabled", handler: { flag: false } },
        {
          reason: "mode_not_live",
          options: { mode: "test" },
          mode: "test",
          handler: { config: { ...CONFIG, environment: "production" } },
        },
        { reason: "no_context", options: { context: false } },
        { reason: "no_consent", options: { analytics: false } },
        { reason: "no_client_id", options: { clientId: null } },
        {
          reason: "too_old",
          handler: { now: new Date(T0.getTime() + 72 * HOUR) },
        },
        { reason: "value_mismatch", options: { captured: 4600 } },
      ];
      for (const entry of cases) {
        await rolledBack(scratch.sql, async (tx) => {
          const f = await fixture(tx, entry.options ?? {});
          const fake = fakeFetch(204);
          const alerts: Alert[] = [];
          await handlerFor(fake.fn, { ...entry.handler, alerts })(
            deliveryEvent(f, { mode: entry.mode ?? "live" }),
            contextOf(runnerOf(tx)),
          );
          expect(fake.calls, entry.reason).toHaveLength(0);
          expect(await dispatchRows(tx, f.orderId), entry.reason).toEqual([
            {
              kind: "purchase",
              outcome: "skipped",
              skip_reason: entry.reason,
              http_status: null,
            },
          ]);
          expect(
            alerts.map((a) => a.alert),
            entry.reason,
          ).toEqual(
            entry.reason === "value_mismatch"
              ? ["analytics.value_mismatch"]
              : [],
          );
        });
      }
    });

    it("T-23 (AC-23): network error, timeout and 503 throw; 400 is rejected with its alert", async () => {
      for (const answer of ["network", "hang", 503] as const) {
        await rolledBack(scratch.sql, async (tx) => {
          const f = await fixture(tx);
          const fake = fakeFetch(answer);
          await expect(
            handlerFor(fake.fn)(deliveryEvent(f), contextOf(runnerOf(tx))),
          ).rejects.toThrow(/ANALYTICS_MP_(TRANSPORT|SERVER)/u);
          expect(await dispatchRows(tx, f.orderId)).toEqual([]);
        });
      }
      await rolledBack(scratch.sql, async (tx) => {
        const f = await fixture(tx);
        const alerts: Alert[] = [];
        await handlerFor(fakeFetch(400).fn, { alerts })(
          deliveryEvent(f),
          contextOf(runnerOf(tx)),
        );
        expect(await dispatchRows(tx, f.orderId)).toEqual([
          {
            kind: "purchase",
            outcome: "skipped",
            skip_reason: "rejected",
            http_status: 400,
          },
        ]);
        expect(alerts.map((a) => a.alert)).toEqual(["analytics.rejected"]);
      });
    });

    it("T-24 (AC-24) and T-28 (AC-28): partial then full refund; redelivery; no purchase; ids cleared; nothing secret logged", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const f = await fixture(tx);
        const fake = fakeFetch(204);
        const { log, lines } = captureLog();
        const handler = handlerFor(fake.fn, {
          log,
          now: new Date(T0.getTime() + 5 * HOUR),
        });
        await handler(deliveryEvent(f), contextOf(runnerOf(tx)));
        await walkOrderTo(tx, f.orderId, "paid");
        const refund = async (
          amount: number,
          at: Date,
          event: string,
          to: string,
        ) => {
          const [row] = await tx<{ id: string }[]>`
            INSERT INTO refund (payment_id, order_id, purchase_id, provider_ref, amount_minor,
                                currency_code, reason, status, requested_by, succeeded_at)
            VALUES (${f.paymentId}, ${f.orderId}, ${f.purchaseId}, ${make.unique("re_")},
                    ${amount}, 'GBP', 'goodwill', 'succeeded', 'admin',
                    ${at.toISOString()}::timestamptz)
            RETURNING id`;
          const eventId = await transitionWithPayload(
            tx,
            f.orderId,
            event,
            to,
            {
              mode: "live",
              refund_id: row?.id,
              amount_minor: amount,
              currency_code: "GBP",
              reason: "goodwill",
            },
          );
          return deliveryEvent(f, {
            eventId,
            type: event as OutboxDeliveryEvent["type"],
            fromStatus: "paid",
            toStatus: to,
          });
        };
        const partial = await refund(
          1000,
          new Date(T0.getTime() + 2 * HOUR),
          "order.refunded_partial",
          "paid",
        );
        await handler(partial, contextOf(runnerOf(tx)));
        const full = await refund(
          3599,
          new Date(T0.getTime() + 3 * HOUR),
          "order.refunded_full",
          "refunded_full",
        );
        await handler(full, contextOf(runnerOf(tx)));
        await handler(full, contextOf(runnerOf(tx)));
        expect(fake.calls).toHaveLength(3);
        const refunds = fake.calls
          .slice(1)
          .map((call) => MpRefundBodySchema.parse(call.body));
        expect(refunds.map((body) => body.events[0].params.value)).toEqual([
          10, 35.99,
        ]);
        expect(refunds.map((body) => body.timestamp_micros)).toEqual([
          (T0.getTime() + 2 * HOUR) * 1000,
          (T0.getTime() + 3 * HOUR) * 1000,
        ]);
        for (const body of refunds) {
          expect(body.client_id).toBe(CLIENT_ID);
          expect(body.events[0].params.transaction_id).toBe(f.transactionId);
          expect("items" in body.events[0].params).toBe(false);
        }
        expect(
          (await dispatchRows(tx, f.orderId)).map((r) => r.outcome),
        ).toEqual(["sent", "sent", "sent"]);
        const logged = JSON.stringify(lines);
        for (const secret of [SECRET, CLIENT_ID, SESSION_ID, f.transactionId]) {
          expect(logged).not.toContain(secret);
        }
        expect(lines.map((line) => line.msg)).toContain("analytics.dispatch");
      });

      for (const reason of ["no_purchase_sent", "ids_cleared"] as const) {
        await rolledBack(scratch.sql, async (tx) => {
          const f = await fixture(tx);
          const fake = fakeFetch(204);
          const handler = handlerFor(fake.fn);
          if (reason === "ids_cleared") {
            await handler(deliveryEvent(f), contextOf(runnerOf(tx)));
            await tx`UPDATE order_analytics SET ga_client_id = NULL, ga_session_id = NULL,
                     ids_cleared_at = now() WHERE order_id = ${f.orderId}`;
          }
          await walkOrderTo(tx, f.orderId, "paid");
          const [row] = await tx<{ id: string }[]>`
            INSERT INTO refund (payment_id, order_id, purchase_id, provider_ref, amount_minor,
                                currency_code, reason, status, requested_by, succeeded_at)
            VALUES (${f.paymentId}, ${f.orderId}, ${f.purchaseId}, ${make.unique("re_")}, 1000,
                    'GBP', 'goodwill', 'succeeded', 'admin', now())
            RETURNING id`;
          const eventId = await transitionWithPayload(
            tx,
            f.orderId,
            "order.refunded_partial",
            "paid",
            {
              mode: "live",
              refund_id: row?.id,
              amount_minor: 1000,
              currency_code: "GBP",
            },
          );
          const before = fake.calls.length;
          await handler(
            deliveryEvent(f, {
              eventId,
              type: "order.refunded_partial",
              fromStatus: "paid",
              toStatus: "paid",
            }),
            contextOf(runnerOf(tx)),
          );
          expect(fake.calls.length).toBe(before);
          const rows = await dispatchRows(tx, f.orderId);
          expect(rows.find((r) => r.kind === "refund")).toEqual({
            kind: "refund",
            outcome: "skipped",
            skip_reason: reason,
            http_status: null,
          });
        });
      }
    });

    it("T-29 (AC-29): the checks refuse bad rows; a non-system role reads none", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const f = await fixture(tx);
        expect(
          (
            await pgFailure(
              tx,
              (sp) => sp`
              UPDATE order_analytics SET analytics_consent = false WHERE order_id = ${f.orderId}`,
            )
          ).constraint,
        ).toBe("order_analytics_consent_ids_check");
        const insert = (
          outcome: string,
          reason: string | null,
          kind = "purchase",
        ) =>
          pgFailure(
            tx,
            (sp) => sp`
            INSERT INTO analytics_dispatch (order_id, event_id, kind, outcome, skip_reason)
            VALUES (${f.orderId}, ${f.capturedEventId}, ${kind}, ${outcome}, ${reason})`,
          );
        expect((await insert("skipped", null)).constraint).toBe(
          "analytics_dispatch_skipped_check",
        );
        expect((await insert("sent", "disabled")).constraint).toBe(
          "analytics_dispatch_skipped_check",
        );
        expect((await insert("skipped", "disabled", "refund")).constraint).toBe(
          "analytics_dispatch_refund_check",
        );
        await handlerFor(fakeFetch(204).fn)(
          deliveryEvent(f),
          contextOf(runnerOf(tx)),
        );
        for (const role of ["admin", "partner", "customer", "public"]) {
          const counts = await tx.savepoint(async (sp) => {
            await asApp(sp as unknown as Tx, { role });
            const [a] = await sp<
              { n: number }[]
            >`SELECT count(*)::int AS n FROM order_analytics`;
            const [d] = await sp<
              { n: number }[]
            >`SELECT count(*)::int AS n FROM analytics_dispatch`;
            await sp.unsafe("RESET ROLE");
            return [a?.n, d?.n];
          });
          expect(counts, role).toEqual([0, 0]);
        }
        const systemCounts = await tx.savepoint(async (sp) => {
          await asApp(sp as unknown as Tx, { role: "system" });
          const [a] = await sp<
            { n: number }[]
          >`SELECT count(*)::int AS n FROM order_analytics`;
          await sp.unsafe("RESET ROLE");
          return a?.n ?? 0;
        });
        expect(systemCounts).toBeGreaterThan(0);
      });
    });

    it("T-30 (AC-30): the sweep clears the ids at 61 days and not at 59", async () => {
      await rolledBack(scratch.sql, async (tx) => {
        const old = await fixture(tx, { mode: "test" });
        const young = await fixture(tx, { mode: "test" });
        const now = new Date("2027-03-01T00:00:00.000Z");
        const day = 24 * HOUR;
        await tx`UPDATE order_analytics SET created_at = ${new Date(now.getTime() - 61 * day).toISOString()}::timestamptz
                 WHERE order_id = ${old.orderId}`;
        await tx`UPDATE order_analytics SET created_at = ${new Date(now.getTime() - 59 * day).toISOString()}::timestamptz
                 WHERE order_id = ${young.orderId}`;
        const result = await runRetentionSweep(runnerOf(tx), {
          now,
          dryRun: false,
        });
        expect(
          result.policies.find(
            (policy) => policy.key === "order_analytics_ga_ids",
          ),
        ).toMatchObject({ status: "applied" });
        const rows = await tx<
          {
            order_id: string;
            ga_client_id: string | null;
            ga_session_id: string | null;
            ids_cleared_at: Date | null;
          }[]
        >`SELECT order_id, ga_client_id, ga_session_id, ids_cleared_at FROM order_analytics
          WHERE order_id IN (${old.orderId}, ${young.orderId})`;
        const byId = new Map(rows.map((row) => [row.order_id, row]));
        expect(byId.get(old.orderId)).toMatchObject({
          ga_client_id: null,
          ga_session_id: null,
        });
        expect(byId.get(old.orderId)?.ids_cleared_at?.toISOString()).toBe(
          now.toISOString(),
        );
        expect(byId.get(young.orderId)).toMatchObject({
          ga_client_id: CLIENT_ID,
          ga_session_id: SESSION_ID,
          ids_cleared_at: null,
        });
      });
    });

    it("T-29 (AC-29): the migration rolls back and re-applies to the same catalogue", async () => {
      const fresh = await scratchDatabase(server.url as string, "ga491rt");
      const locked = async <T>(fn: () => Promise<T>): Promise<T> => {
        await fresh.sql`SELECT pg_advisory_lock(${MIGRATE_LOCK})`;
        try {
          return await fn();
        } finally {
          await fresh.sql`SELECT pg_advisory_unlock(${MIGRATE_LOCK})`;
        }
      };
      try {
        const withMine = await readCatalogue(fresh.sql);
        await locked(() => runner(fresh.url, ["--down", "--to", BEFORE]));
        const without = await readCatalogue(fresh.sql);
        expect(JSON.stringify(without)).not.toContain("order_analytics");
        expect(
          await fresh.sql`SELECT 1 FROM retention_policy WHERE key = 'order_analytics_ga_ids'`,
        ).toHaveLength(0);
        expect(
          await fresh.sql`SELECT 1 FROM feature_flag WHERE key = 'analytics.mp_send'`,
        ).toHaveLength(0);
        await locked(() => runner(fresh.url));
        expect(await readCatalogue(fresh.sql)).toEqual(withMine);
      } finally {
        await fresh.drop();
      }
    }, 600_000);
  },
);
