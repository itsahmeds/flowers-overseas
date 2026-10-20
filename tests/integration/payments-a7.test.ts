/**
 * Spec 002 §14 A7 as migration `NNNN_payments_a7` builds it, on a disposable PG16 (spec 013
 * AC-19 connected half, AC-37 / T-19, T-37; spec 002 A7.10 AC-14, AC-17, AC-37 … AC-43 / T-14,
 * T-17, T-38 … T-44; TASK-254).
 *
 *  - **Catalogue (T-14, T-38):** `order.payment_attempt_failed` has no `order_transition` row, the
 *    distinct events are still the 28, the row count is the fixture's and A7 does not change it;
 *    appended to a `placed` order it leaves the order `placed`.
 *  - **Engine paths (T-19):** each event spec 013 registers is written through its one path with
 *    its schema; a failing payload is refused with nothing written; the other path is refused.
 *  - **Constraints (T-39 … T-43):** each acceptance and refusal of A7.3 … A7.7, by constraint name.
 *  - **RLS (T-17 extended):** `payment_dispute` for staff, `outbox_delivery` for `system` only.
 *  - **Rollback (T-37, T-44):** the catalogue before A7; migrate; one live payment → the down file
 *    raises `A7_ROLLBACK_LIVE_PAYMENTS` and the catalogue and every row count are unchanged; on a
 *    second database holding only test-mode rows (a `processing` payment, a `requested` refund)
 *    the rollback succeeds and the catalogue equals the one before A7; migrate again; `db:check`'s
 *    connected half passes, RLS coverage and the money pair included.
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as committedMirror from "../../db/schema/index.ts";
import "@/modules/payments/events";
import {
  appendEvent,
  isOrderEngineError,
  transition,
  type OrderErrorCode,
} from "@/modules/orders";
import {
  PAYMENT_EVENT_SCHEMAS,
  type PaymentEventType,
} from "@/modules/payments/events";

import { recipientEmailViolations } from "../../scripts/db-check.ts";
import {
  SNAPSHOT_FILE,
  liveCheck,
  readCatalogue,
  readSnapshot,
  type CatalogueSnapshot,
} from "../../scripts/db-check-live.ts";
import { registerFixtureEventSchemas } from "../fixtures/order-engine.ts";
import {
  STATUS_PRESERVING_EVENTS,
  TRANSITION_EVENTS,
  TRANSITIONS,
} from "../fixtures/order-machine.ts";
import { insertPlacedOrder, walkOrderTo } from "../fixtures/order-state.ts";
import { orderParents, partner } from "./support/rows.ts";
import {
  asApp,
  MIGRATE_LOCK,
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
registerFixtureEventSchemas();

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const MIGRATIONS = resolve(REPO_ROOT, "db/migrations");

/** A7's file, whatever number it took when it merged, and every migration from it on. */
const A7_FILE =
  readdirSync(MIGRATIONS).find((name) =>
    /^\d{4}_payments_a7\.sql$/.test(name),
  ) ?? "";
const A7_VERSION = A7_FILE.slice(0, 4);
const BEFORE_A7 = String(Number(A7_VERSION) - 1).padStart(4, "0");
const FROM_A7 = readdirSync(MIGRATIONS)
  .filter(
    (name) =>
      /^\d{4}_[a-z0-9_]+\.sql$/.test(name) && !name.endsWith(".down.sql"),
  )
  .filter((name) => name.slice(0, 4) >= A7_VERSION)
  .map((name) => ({ version: name.slice(0, 4), name: name.slice(5, -4) }));
const A7_DOWN = readFileSync(
  resolve(MIGRATIONS, A7_FILE.replace(/\.sql$/, ".down.sql")),
  "utf8",
);

const ORDER_ID_OTHER = "0d6c5b4a-3928-4716-a5f4-e3d2c1b0a998";

/** The introspection snapshot: `db:check`'s catalogue facts plus every column's type and nullability. */
async function introspect(sql: Sql | Tx): Promise<CatalogueSnapshot> {
  const columns = await sql<{ k: string; v: string }[]>`
    SELECT c.relname || '.' || a.attname AS k,
           format_type(a.atttypid, a.atttypmod) || CASE WHEN a.attnotnull THEN ' not null' ELSE '' END AS v
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v') AND a.attnum > 0 AND NOT a.attisdropped
    ORDER BY 1`;
  return {
    ...(await readCatalogue(sql)),
    columns: Object.fromEntries(columns.map((row) => [row.k, row.v])),
  };
}

/** Every `public` table's row count. */
async function rowCounts(sql: Sql | Tx): Promise<Record<string, number>> {
  const tables = await sql<{ name: string }[]>`
    SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY 1`;
  const out: Record<string, number> = {};
  for (const { name } of tables) {
    const [row] = await sql.unsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM public."${name}"`,
    );
    out[name] = row?.n ?? -1;
  }
  return out;
}

/** Runs the real runner with the cross-suite migrate lock held, as `scratchDatabase` does. */
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

async function refusal(promise: Promise<unknown>): Promise<OrderErrorCode> {
  try {
    await promise;
  } catch (error) {
    if (isOrderEngineError(error)) return error.code;
    throw error;
  }
  throw new Error("expected a refusal, and the call succeeded");
}

/** A `test` order (PLN 18 900) and its payment, as the lifecycle writes one. */
async function orderWithPayment(
  tx: Tx,
  payment: {
    status: string;
    providerRef?: string | null;
    method?: string | null;
    livemode?: boolean;
  } = {
    status: "captured",
  },
): Promise<{ orderId: string; paymentId: string }> {
  const orderId = await insertPlacedOrder(tx, {
    ...(await orderParents(tx)),
    mode: "test",
  });
  const providerRef =
    payment.providerRef === undefined
      ? `pi_${crypto.randomUUID().slice(0, 12)}`
      : payment.providerRef;
  const method = payment.method === undefined ? "card" : payment.method;
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO payment (order_id, provider, provider_ref, status, method, amount_minor, currency_code,
                         livemode, capture_method, amount_captured_minor, captured_at)
    VALUES (${orderId}, 'stripe', ${providerRef}, ${payment.status}, ${method}, 18900, 'PLN',
            ${payment.livemode ?? false}, 'automatic',
            ${payment.status === "captured" ? 18900 : 0},
            ${payment.status === "captured" ? new Date() : null})
    RETURNING id`;
  return { orderId, paymentId: row?.id ?? "" };
}

describe.skipIf(server.url === undefined)(
  `spec 002 §14 A7 — the payments migration${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "a7");
    }, 600_000);

    afterAll(async () => {
      await scratch.drop();
    });

    describe("the catalogue (spec 002 T-14 amended, T-38)", () => {
      it("AC-37 (002): no row for order.payment_attempt_failed, the 28 distinct events, the fixture's row count", async () => {
        const [rows] = await scratch.sql<
          { n: number; attempt: number; distinct: number }[]
        >`
          SELECT count(*)::int AS n,
                 count(*) FILTER (WHERE event = 'order.payment_attempt_failed')::int AS attempt,
                 count(DISTINCT event)::int AS distinct
          FROM order_transition`;
        expect(rows).toEqual({
          n: TRANSITIONS.length,
          attempt: 0,
          distinct: 28,
        });
        expect(TRANSITION_EVENTS).toHaveLength(28);
        expect(STATUS_PRESERVING_EVENTS).toHaveLength(9);
        expect(STATUS_PRESERVING_EVENTS).toContain(
          "order.payment_attempt_failed",
        );
        const preserving = await scratch.sql<{ n: number }[]>`
          SELECT count(*)::int AS n FROM order_transition
          WHERE event IN ${scratch.sql([...STATUS_PRESERVING_EVENTS])}`;
        expect(preserving[0]?.n).toBe(0);
      });

      it("AC-37 (002): appended with the next seq to a placed order, the order stays placed; transition refuses it", async () => {
        const result = await rolledBack(scratch.sql, async (tx) => {
          const { orderId, paymentId } = await orderWithPayment(tx, {
            status: "pending",
            providerRef: null,
            method: null,
          });
          const appended = await appendEvent(
            orderId,
            "order.payment_attempt_failed",
            "system:payments",
            {
              mode: "test",
              payment_id: paymentId,
              attempt: 1,
              decline_code: "card_declined",
            },
            { executor: runnerOf(tx) },
          );
          const [order] = await tx<{ status: string }[]>`
            SELECT status FROM "order" WHERE id = ${orderId}`;
          const [event] = await tx<
            { from_status: string; to_status: string; actor: string }[]
          >`
            SELECT from_status, to_status, actor FROM order_event WHERE id = ${appended.eventId}`;
          const byTransition = await refusal(
            transition(
              orderId,
              "order.payment_attempt_failed",
              "system:payments",
              {
                mode: "test",
                payment_id: paymentId,
                attempt: 2,
                decline_code: null,
              },
              { executor: runnerOf(tx) },
            ),
          );
          const byBuyer = await refusal(
            appendEvent(
              orderId,
              "order.payment_attempt_failed",
              "buyer",
              {
                mode: "test",
                payment_id: paymentId,
                attempt: 2,
                decline_code: null,
              },
              { executor: runnerOf(tx) },
            ),
          );
          return {
            seq: appended.seq,
            status: order?.status,
            event,
            byTransition,
            byBuyer,
          };
        });
        expect(result).toEqual({
          seq: 2,
          status: "placed",
          event: {
            from_status: "placed",
            to_status: "placed",
            actor: "system:payments",
          },
          byTransition: "ORDER_TRANSITION_ILLEGAL",
          byBuyer: "ORDER_ACTOR_NOT_ALLOWED",
        });
      });
    });

    describe("each spec 013 event takes its one engine path with its schema (spec 013 T-19)", () => {
      const ids = {
        payment_id: "6a1d0c2e-4b5f-4e7a-9c8d-0f1e2d3c4b5a",
        refund_id: "7b2e1d3f-5c6a-4f8b-8d9e-1a2b3c4d5e6f",
        dispute_id: "8c3f2e4a-6d7b-4a9c-9e0f-2b3c4d5e6f7a",
      };
      const payloads: Readonly<
        Record<PaymentEventType, Record<string, unknown>>
      > = {
        "order.payment_failed": {
          mode: "test",
          payment_id: ids.payment_id,
          attempts: 1,
        },
        "order.abandoned": { mode: "test", payment_id: null },
        "order.cancelled": { mode: "test", reason: "no_partner" },
        "order.refunded_partial": {
          mode: "test",
          refund_id: ids.refund_id,
          amount_minor: 500,
          currency_code: "PLN",
          reason: "quality",
        },
        "order.refunded_full": {
          mode: "test",
          refund_id: ids.refund_id,
          amount_minor: 18_900,
          currency_code: "PLN",
          reason: "buyer_cancel",
        },
        "order.chargeback_opened": {
          mode: "test",
          dispute_id: ids.dispute_id,
          amount_minor: 18_900,
          currency_code: "PLN",
        },
        "order.chargeback_won": { mode: "test", dispute_id: ids.dispute_id },
        "order.chargeback_lost": { mode: "test", dispute_id: ids.dispute_id },
        "order.refund_requested": {
          mode: "test",
          refund_id: ids.refund_id,
          amount_minor: 500,
          currency_code: "PLN",
          reason: "goodwill",
        },
        "order.payment_attempt_failed": {
          mode: "test",
          payment_id: ids.payment_id,
          attempt: 1,
          decline_code: "expired_card",
        },
      };

      it("writes each through its path as system:payments; a failing payload writes nothing; the other path is refused", async () => {
        const outcomes = await rolledBack(scratch.sql, async (tx) => {
          const out: Record<string, unknown> = {};
          for (const type of Object.keys(
            PAYMENT_EVENT_SCHEMAS,
          ) as PaymentEventType[]) {
            const writer = PAYMENT_EVENT_SCHEMAS[type].writer;
            const orderId = await insertPlacedOrder(tx, {
              ...(await orderParents(tx)),
              mode: "test",
            });
            const row =
              writer === "transition"
                ? TRANSITIONS.find(
                    (t) =>
                      t.event === type && t.allowedActors.includes("system"),
                  )
                : undefined;
            if (row !== undefined) await walkOrderTo(tx, orderId, row.from);
            const connection = { executor: runnerOf(tx) };
            const count = async (): Promise<number> => {
              const [n] = await tx<{ n: number }[]>`
                SELECT count(*)::int AS n FROM order_event WHERE order_id = ${orderId}`;
              return n?.n ?? -1;
            };
            const write = (payload: unknown) =>
              writer === "transition"
                ? transition(
                    orderId,
                    type,
                    "system:payments",
                    payload,
                    connection,
                  )
                : appendEvent(
                    orderId,
                    type,
                    "system:payments",
                    payload,
                    connection,
                  );
            const before = await count();
            const invalid = await refusal(
              write({ ...payloads[type], extra: true }),
            );
            const afterInvalid = await count();
            const wrongPath = await refusal(
              writer === "transition"
                ? appendEvent(
                    orderId,
                    type,
                    "system:payments",
                    payloads[type],
                    connection,
                  )
                : transition(
                    orderId,
                    type,
                    "system:payments",
                    payloads[type],
                    connection,
                  ),
            );
            const written = await write(payloads[type]);
            const [event] = await tx<
              { payload: unknown; payload_version: number }[]
            >`
              SELECT payload, payload_version FROM order_event WHERE id = ${written.eventId}`;
            out[type] = {
              invalid,
              unchanged: afterInvalid === before,
              wrongPath,
              payload: event?.payload,
              version: event?.payload_version,
            };
          }
          return out;
        });
        for (const type of Object.keys(
          PAYMENT_EVENT_SCHEMAS,
        ) as PaymentEventType[]) {
          expect(outcomes[type], type).toEqual({
            invalid: "ORDER_PAYLOAD_INVALID",
            unchanged: true,
            wrongPath:
              PAYMENT_EVENT_SCHEMAS[type].writer === "transition"
                ? "ORDER_EVENT_NEEDS_TRANSITION"
                : "ORDER_TRANSITION_ILLEGAL",
            payload: payloads[type],
            version: 1,
          });
        }
      });
    });

    describe("constraints (spec 002 T-39 … T-43)", () => {
      it("AC-38 (002): payment — pending without ref or method, processing, the money bounds, one live payment per order", async () => {
        const result = await rolledBack(scratch.sql, async (tx) => {
          const orderId = await insertPlacedOrder(tx, {
            ...(await orderParents(tx)),
            mode: "test",
          });
          const insert = (sp: Tx, fields: Record<string, unknown>) =>
            sp`INSERT INTO payment ${sp({
              order_id: orderId,
              provider: "stripe",
              status: "pending",
              amount_minor: 18900,
              currency_code: "PLN",
              livemode: false,
              ...fields,
            })} RETURNING id`;
          const out: Record<string, string | undefined> = {};
          out["authorised without ref"] = (
            await pgFailure(tx, (sp) =>
              insert(sp, { status: "authorised", method: "card" }),
            )
          ).constraint;
          out["authorised without method"] = (
            await pgFailure(tx, (sp) =>
              insert(sp, { status: "authorised", provider_ref: "pi_a" }),
            )
          ).constraint;
          out["no livemode"] = (
            await pgFailure(
              tx,
              (sp) =>
                sp`INSERT INTO payment (order_id, provider, status, amount_minor, currency_code)
                 VALUES (${orderId}, 'stripe', 'pending', 18900, 'PLN')`,
            )
          ).code;
          out["captured above amount"] = (
            await pgFailure(tx, (sp) =>
              insert(sp, { status: "failed", amount_captured_minor: 18901 }),
            )
          ).constraint;
          out["refunded above captured"] = (
            await pgFailure(tx, (sp) =>
              insert(sp, {
                status: "failed",
                amount_captured_minor: 100,
                amount_refunded_minor: 101,
              }),
            )
          ).constraint;
          out["unknown status"] = (
            await pgFailure(tx, (sp) =>
              insert(sp, {
                status: "held",
                provider_ref: "pi_h",
                method: "card",
              }),
            )
          ).constraint;
          out["capture method hold"] = (
            await pgFailure(tx, (sp) => insert(sp, { capture_method: "hold" }))
          ).constraint;
          // Accepted: pending with neither ref nor method; then a second live one is refused.
          const [pending] = await insert(tx, {});
          out["second while pending"] = (
            await pgFailure(tx, (sp) => insert(sp, {}))
          ).constraint;
          await tx`UPDATE payment SET status = 'processing', provider_ref = 'pi_p', method = 'card'
                   WHERE id = ${pending?.id ?? ""}`;
          out["second while processing"] = (
            await pgFailure(tx, (sp) => insert(sp, {}))
          ).constraint;
          await tx`UPDATE payment SET status = 'failed' WHERE id = ${pending?.id ?? ""}`;
          const [second] = await insert(tx, {});
          out["second once failed"] =
            second?.id === undefined ? "refused" : "inserted";
          return out;
        });
        expect(result).toEqual({
          "authorised without ref": "payment_provider_ref_required_check",
          "authorised without method": "payment_method_required_check",
          "no livemode": "23502",
          "captured above amount": "payment_amount_captured_minor_check",
          "refunded above captured": "payment_amount_refunded_minor_check",
          "unknown status": "payment_status_check",
          "capture method hold": "payment_capture_method_check",
          "second while pending": "payment_one_live_per_order_idx",
          "second while processing": "payment_one_live_per_order_idx",
          "second once failed": "inserted",
        });
      });

      it("AC-39 (002): refund — requested without ref, succeeded needs ref and succeeded_at, the eleven reasons, requested_by", async () => {
        const result = await rolledBack(scratch.sql, async (tx) => {
          const { paymentId } = await orderWithPayment(tx);
          const insert = (sp: Tx, fields: Record<string, unknown>) =>
            sp`INSERT INTO refund ${sp({
              payment_id: paymentId,
              amount_minor: 500,
              currency_code: "PLN",
              reason: "quality",
              status: "requested",
              requested_by: "admin:0b8e7d6c-5a4f-4e3d-8c2b-1a0f9e8d7c6b",
              ...fields,
            })} RETURNING id`;
          const out: Record<string, string | undefined> = {};
          const [requested] = await insert(tx, {});
          out["requested without ref"] =
            requested?.id === undefined ? "refused" : "inserted";
          out["succeeded without ref"] = (
            await pgFailure(tx, (sp) =>
              insert(sp, { status: "succeeded", succeeded_at: new Date() }),
            )
          ).constraint;
          out["succeeded without succeeded_at"] = (
            await pgFailure(tx, (sp) =>
              insert(sp, { status: "succeeded", provider_ref: "re_1" }),
            )
          ).constraint;
          out["pending with succeeded_at"] = (
            await pgFailure(tx, (sp) =>
              insert(sp, {
                status: "pending",
                provider_ref: "re_2",
                succeeded_at: new Date(),
              }),
            )
          ).constraint;
          out["unknown reason"] = (
            await pgFailure(tx, (sp) => insert(sp, { reason: "fraud" }))
          ).constraint;
          out["no requested_by"] = (
            await pgFailure(
              tx,
              (sp) =>
                sp`INSERT INTO refund (payment_id, amount_minor, currency_code, reason, status)
                 VALUES (${paymentId}, 500, 'PLN', 'quality', 'requested')`,
            )
          ).code;
          const [succeeded] = await insert(tx, {
            status: "succeeded",
            provider_ref: "re_ok",
            succeeded_at: new Date(),
          });
          out["succeeded with both"] =
            succeeded?.id === undefined ? "refused" : "inserted";
          for (const reason of [
            "buyer_cancel",
            "no_partner",
            "authorisation_lapsing",
            "redelivery_failed",
            "addon_missing",
            "late_delivery",
            "substitution_complaint",
            "quality",
            "goodwill",
            "duplicate",
            "other",
          ]) {
            await insert(tx, { reason });
          }
          out["eleven reasons"] = "inserted";
          return out;
        });
        expect(result).toEqual({
          "requested without ref": "inserted",
          "succeeded without ref": "refund_provider_ref_required_check",
          "succeeded without succeeded_at": "refund_succeeded_at_check",
          "pending with succeeded_at": "refund_succeeded_at_check",
          "unknown reason": "refund_reason_check",
          "no requested_by": "23502",
          "succeeded with both": "inserted",
          "eleven reasons": "inserted",
        });
      });

      it("AC-40 (002): payment_dispute — its payment's currency, a unique ref, four statuses, a positive amount", async () => {
        const result = await rolledBack(scratch.sql, async (tx) => {
          const { paymentId } = await orderWithPayment(tx);
          const insert = (sp: Tx, fields: Record<string, unknown>) =>
            sp`INSERT INTO payment_dispute ${sp({
              payment_id: paymentId,
              currency_code: "PLN",
              provider_ref: "dp_1",
              amount_minor: 18900,
              reason: "fraudulent",
              status: "open",
              opened_at: new Date(),
              ...fields,
            })} RETURNING id`;
          const out: Record<string, string | undefined> = {};
          out["another currency"] = (
            await pgFailure(tx, (sp) => insert(sp, { currency_code: "EUR" }))
          ).constraint;
          out["zero amount"] = (
            await pgFailure(tx, (sp) => insert(sp, { amount_minor: 0 }))
          ).constraint;
          out["unknown status"] = (
            await pgFailure(tx, (sp) => insert(sp, { status: "pending" }))
          ).constraint;
          const [valid] = await insert(tx, {});
          out.valid = valid?.id === undefined ? "refused" : "inserted";
          out["duplicate ref"] = (
            await pgFailure(tx, (sp) => insert(sp, {}))
          ).constraint;
          return out;
        });
        expect(result).toEqual({
          "another currency": "payment_dispute_payment_fkey",
          "zero amount": "payment_dispute_amount_minor_check",
          "unknown status": "payment_dispute_status_check",
          valid: "inserted",
          "duplicate ref": "payment_dispute_provider_ref_key",
        });
      });

      it("AC-41 (002): webhook_inbox — a Stripe row names its mode and type, a Mollie row need not, received by default, five statuses", async () => {
        const result = await rolledBack(scratch.sql, async (tx) => {
          const insert = (sp: Tx, fields: Record<string, unknown>) =>
            sp`INSERT INTO webhook_inbox ${sp({
              provider: "stripe",
              event_id: `evt_${crypto.randomUUID()}`,
              signature_verified: true,
              raw: {},
              livemode: false,
              event_type: "payment_intent.succeeded",
              ...fields,
            })} RETURNING status`;
          const out: Record<string, string | undefined> = {};
          out["stripe without livemode"] = (
            await pgFailure(tx, (sp) => insert(sp, { livemode: null }))
          ).constraint;
          out["stripe without event_type"] = (
            await pgFailure(tx, (sp) => insert(sp, { event_type: null }))
          ).constraint;
          out["unknown status"] = (
            await pgFailure(tx, (sp) => insert(sp, { status: "queued" }))
          ).constraint;
          const [mollie] = await insert(tx, {
            provider: "mollie",
            livemode: null,
            event_type: null,
          });
          out["mollie without both"] = mollie?.status;
          const [stripe] = await insert(tx, {});
          out["stripe default status"] = stripe?.status;
          return out;
        });
        expect(result).toEqual({
          "stripe without livemode": "webhook_inbox_stripe_fields_check",
          "stripe without event_type": "webhook_inbox_stripe_fields_check",
          "unknown status": "webhook_inbox_status_check",
          "mollie without both": "received",
          "stripe default status": "received",
        });
      });

      it("AC-42 (002): one outbox row with two targets makes exactly two pending deliveries; a duplicate pair is refused; an attempt carries its target", async () => {
        const result = await rolledBack(scratch.sql, async (tx) => {
          const orderId = await insertPlacedOrder(tx, {
            ...(await orderParents(tx)),
            mode: "live",
          });
          const [row] = await tx<{ id: string }[]>`
            INSERT INTO outbox (event_id, order_id, targets, payload, payload_version)
            VALUES (gen_random_uuid(), ${orderId}, '{routing,payments}', '{}', 1) RETURNING id`;
          const outboxId = row?.id ?? "";
          const deliveries = await tx<
            { target: string; status: string; attempts: number }[]
          >`
            SELECT target, status, attempts FROM outbox_delivery WHERE outbox_id = ${outboxId}
            ORDER BY target`;
          const duplicate = (
            await pgFailure(
              tx,
              (sp) =>
                sp`INSERT INTO outbox_delivery (outbox_id, target) VALUES (${outboxId}, 'routing')`,
            )
          ).constraint;
          const twice = (
            await pgFailure(
              tx,
              (sp) =>
                sp`INSERT INTO outbox (event_id, order_id, targets, payload, payload_version)
                   VALUES (gen_random_uuid(), ${orderId}, '{routing,routing}', '{}', 1)`,
            )
          ).constraint;
          const [attempt] = await tx<{ target: string }[]>`
            INSERT INTO outbox_attempt (outbox_id, attempt, status, error, target)
            VALUES (${outboxId}, 1, 'failed', 'Error: x', 'routing') RETURNING target`;
          const badStatus = (
            await pgFailure(
              tx,
              (sp) =>
                sp`UPDATE outbox_delivery SET status = 'failed' WHERE outbox_id = ${outboxId}`,
            )
          ).constraint;
          return {
            deliveries,
            duplicate,
            twice,
            attempt: attempt?.target,
            badStatus,
          };
        });
        expect(result).toEqual({
          deliveries: [
            { target: "payments", status: "pending", attempts: 0 },
            { target: "routing", status: "pending", attempts: 0 },
          ],
          duplicate: "outbox_delivery_outbox_id_target_key",
          twice: "outbox_delivery_outbox_id_target_key",
          attempt: "routing",
          badStatus: "outbox_delivery_status_check",
        });
      });
    });

    describe("RLS (spec 002 T-17 extended)", () => {
      it("AC-17 (002): payment_dispute for admin and system only; outbox_delivery for system only", async () => {
        const result = await rolledBack(scratch.sql, async (tx) => {
          const { orderId, paymentId } = await orderWithPayment(tx);
          const [order] = await tx<{ country: string }[]>`
            SELECT destination_country_id AS country FROM "order" WHERE id = ${orderId}`;
          const partnerId = await partner(tx, order?.country ?? "", "active");
          const [user] = await tx<{ id: string }[]>`
            INSERT INTO users (email) VALUES (${`a7-${crypto.randomUUID()}@example.test`}) RETURNING id`;
          await tx`INSERT INTO payment_dispute (payment_id, currency_code, provider_ref, amount_minor,
                                                reason, status, opened_at)
                   VALUES (${paymentId}, 'PLN', 'dp_rls', 18900, 'fraudulent', 'open', now())`;
          await tx`INSERT INTO outbox (event_id, order_id, targets, payload, payload_version)
                   VALUES (gen_random_uuid(), ${orderId}, '{payments}', '{}', 1)`;
          const contexts: Record<string, Parameters<typeof asApp>[1]> = {
            public: { role: "public" },
            partner: { role: "partner", partnerIds: [partnerId] },
            customer: { role: "customer", userId: user?.id ?? "" },
            admin: { role: "admin", userId: ORDER_ID_OTHER },
            system: { role: "system" },
          };
          const out: Record<string, [number, number]> = {};
          for (const [name, context] of Object.entries(contexts)) {
            const marker = new Error("undo");
            try {
              await tx.savepoint(async (sp) => {
                await asApp(sp, context);
                const [row] = await sp<
                  { disputes: number; deliveries: number }[]
                >`
                  SELECT (SELECT count(*) FROM payment_dispute)::int AS disputes,
                         (SELECT count(*) FROM outbox_delivery)::int AS deliveries`;
                out[name] = [row?.disputes ?? -1, row?.deliveries ?? -1];
                throw marker;
              });
            } catch (error) {
              if (error !== marker) throw error;
            }
          }
          return out;
        });
        expect(result).toEqual({
          public: [0, 0],
          partner: [0, 0],
          customer: [0, 0],
          admin: [1, 0],
          system: [1, 1],
        });
      });
    });
  },
);

describe.skipIf(server.url === undefined)(
  `spec 013 T-37 / spec 002 T-44 — A7's rollback${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let first: ScratchDatabase;
    let second: ScratchDatabase;
    let beforeA7: CatalogueSnapshot;
    let afterA7: CatalogueSnapshot;
    let transitionsBefore: number;

    beforeAll(async () => {
      // A database stopped just before A7: the runner is told A7 and every later migration are
      // applied, so it applies everything before them and nothing else.
      first = await scratchDatabase(server.url as string, "a7rb", {
        migrate: false,
      });
      await first.sql.unsafe(
        `CREATE TABLE public.schema_migrations (
           version text PRIMARY KEY, name text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`,
      );
      for (const migration of FROM_A7) {
        await first.sql`INSERT INTO public.schema_migrations (version, name)
                        VALUES (${migration.version}, ${migration.name})`;
      }
      await locked(() => runner(first.url));
      beforeA7 = await introspect(first.sql);
      const [count] = await first.sql<
        { n: number }[]
      >`SELECT count(*)::int AS n FROM order_transition`;
      transitionsBefore = count?.n ?? -1;
      await first.sql`DELETE FROM public.schema_migrations WHERE version >= ${A7_VERSION}`;
      await locked(() => runner(first.url));
      afterA7 = await introspect(first.sql);
      second = await scratchDatabase(server.url as string, "a7rb2");
    }, 600_000);

    afterAll(async () => {
      await first.drop();
      await second.drop();
    });

    it("A7 changes the catalogue and not the transition rows", async () => {
      expect(afterA7).not.toEqual(beforeA7);
      expect(Object.keys(afterA7["columns"] ?? {})).toContain(
        "payment.livemode",
      );
      expect(Object.keys(beforeA7["columns"] ?? {})).not.toContain(
        "payment.livemode",
      );
      const [count] = await first.sql<
        { n: number }[]
      >`SELECT count(*)::int AS n FROM order_transition`;
      expect(count?.n).toBe(transitionsBefore);
      expect(transitionsBefore).toBe(TRANSITIONS.length);
    });

    it("db:check's connected half passes after the forward migration: column drift, RLS coverage, the money pair, the snapshot", async () => {
      const result = await liveCheck(
        first.sql,
        committedMirror,
        readSnapshot(resolve(REPO_ROOT, SNAPSHOT_FILE)),
        recipientEmailViolations,
      );
      expect(result.problems).toEqual([]);
      expect(result.ok).toBe(true);
      expect(result.summary.join("\n")).toMatch(
        /RLS coverage: (\d+)\/\1 tables/,
      );
    });

    it("AC-37 / AC-43 (002): with one live payment the down file raises A7_ROLLBACK_LIVE_PAYMENTS and changes nothing", async () => {
      const { orderId } = await (async () => {
        const id = await first.sql.begin(async (tx) => {
          const made = await orderWithPayment(tx, {
            status: "captured",
            livemode: true,
          });
          await tx`INSERT INTO refund (payment_id, provider_ref, amount_minor, currency_code, reason,
                                       status, requested_by)
                   VALUES (${made.paymentId}, 're_live', 500, 'PLN', 'quality', 'requested',
                           'system:payments')`;
          return made;
        });
        return id;
      })();
      const snapshot = await introspect(first.sql);
      const counts = await rowCounts(first.sql);
      let raised = "";
      try {
        await first.sql.begin(async (tx) => {
          await tx.unsafe(A7_DOWN);
        });
      } catch (error) {
        raised = error instanceof Error ? error.message : String(error);
      }
      // And through the runner, the way `pnpm db:rollback` would meet it.
      let runnerRaised = "";
      try {
        await locked(() => runner(first.url, ["--down", "--to", BEFORE_A7]));
      } catch (error) {
        runnerRaised = error instanceof Error ? error.message : String(error);
      }
      const [live] = await first.sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM payment WHERE order_id = ${orderId} AND livemode`;
      expect(raised).toMatch(/^A7_ROLLBACK_LIVE_PAYMENTS/);
      expect(runnerRaised).toContain("A7_ROLLBACK_LIVE_PAYMENTS");
      expect(await introspect(first.sql)).toEqual(snapshot);
      expect(snapshot).toEqual(afterA7);
      expect(await rowCounts(first.sql)).toEqual(counts);
      expect(live?.n).toBe(1);
    });

    it("AC-43 (002): with only test-mode rows (a processing payment, a requested refund) the rollback succeeds and the catalogue equals the one before A7; migrate again restores A7", async () => {
      await second.sql.begin(async (tx) => {
        const processing = await orderWithPayment(tx, { status: "processing" });
        await orderWithPayment(tx, {
          status: "pending",
          providerRef: null,
          method: null,
        });
        await tx`INSERT INTO refund (payment_id, amount_minor, currency_code, reason, status, requested_by)
                 VALUES (${processing.paymentId}, 500, 'PLN', 'quality', 'requested', 'system:payments')`;
        await tx`INSERT INTO payment_dispute (payment_id, currency_code, provider_ref, amount_minor,
                                              reason, status, opened_at)
                 VALUES (${processing.paymentId}, 'PLN', 'dp_test', 18900, 'fraudulent', 'open', now())`;
      });
      expect(await introspect(second.sql)).toEqual(afterA7);

      await locked(() => runner(second.url, ["--down", "--to", BEFORE_A7]));
      const rolled = await introspect(second.sql);
      const [left] = await second.sql<{ payments: number; refunds: number }[]>`
        SELECT (SELECT count(*) FROM payment)::int AS payments,
               (SELECT count(*) FROM refund)::int AS refunds`;

      await locked(() => runner(second.url));
      const again = await introspect(second.sql);

      expect(rolled).toEqual(beforeA7);
      expect(left).toEqual({ payments: 0, refunds: 0 });
      expect(again).toEqual(afterA7);
    });

    it("A7.3: the forward migration refuses a payment table that already holds rows, and leaves the schema as it was", async () => {
      await locked(() => runner(second.url, ["--down", "--to", BEFORE_A7]));
      // A row in 0007's shape (no livemode column yet), as an earlier test payment would be.
      await second.sql.begin(async (tx) => {
        const orderId = await insertPlacedOrder(tx, {
          ...(await orderParents(tx)),
          mode: "test",
        });
        await tx`INSERT INTO payment (order_id, provider, provider_ref, status, method, amount_minor,
                                      currency_code)
                 VALUES (${orderId}, 'stripe', 'pi_old', 'requires_action', 'card', 18900, 'PLN')`;
      });
      let refused = "";
      try {
        await locked(() => runner(second.url));
      } catch (error) {
        refused = error instanceof Error ? error.message : String(error);
      }
      expect(refused).toContain(
        'column "livemode" of relation "payment" contains null values',
      );
      expect(await introspect(second.sql)).toEqual(beforeA7);
    });
  },
);
