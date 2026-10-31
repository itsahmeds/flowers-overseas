/**
 * Migration `0007` as a database holds it (spec 002 §5.1 "`orders`" and "`payments`", §14 A6,
 * AC-14 / T-14 integration half; spec 010 §5.1 A; TASK-019).
 *
 *  - **the machine** — `order_status` and `order_transition`, read back out of a migrated scratch
 *    database, equal `tests/fixtures/order-machine.ts` in both directions on every column, and
 *    `is_terminal` matches what the rows themselves imply;
 *  - **the deferred key** — `payout_line_order_id_order_id_fk` exists with `ON DELETE RESTRICT`;
 *  - **behaviour**, in transactions that are always rolled back: each constraint refuses the row
 *    it exists to refuse, named by the constraint that refused it.
 *
 * Runs on a disposable local Postgres 16 only (`support/scratch-db.ts`), never on the shared
 * database.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFERRED_FOREIGN_KEYS } from "../fixtures/schema-foreign-keys.ts";
import {
  STATES,
  STATUS_PRESERVING_EVENTS,
  TRANSITIONS,
  TRANSITION_EVENTS,
} from "../fixtures/order-machine.ts";
import { insertPlacedOrder } from "../fixtures/order-state.ts";
import { orderParents } from "./support/rows.ts";
import {
  pgFailure,
  probeLocalServer,
  rolledBack,
  scratchDatabase,
  type ScratchDatabase,
} from "./support/scratch-db.ts";

const server = await probeLocalServer();

describe.skipIf(server.url === undefined)(
  `migration 0007 applied — orders and payments${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "orders");
    }, 300_000);
    afterAll(async () => {
      await scratch.drop();
    });

    it("AC-14: order_status equals A6.4, both ways", async () => {
      const rows = await scratch.sql<
        { key: string; is_terminal: boolean; buyer_projection: string }[]
      >`SELECT key, is_terminal, buyer_projection FROM order_status`;
      expect(
        new Set(
          rows.map(
            (r) => `${r.key}|${String(r.is_terminal)}|${r.buyer_projection}`,
          ),
        ),
      ).toEqual(
        new Set(
          STATES.map(
            (s) => `${s.key}|${String(s.isTerminal)}|${s.buyerProjection}`,
          ),
        ),
      );
      expect(rows).toHaveLength(26);
    });

    it("AC-14: order_transition equals A6.3 (73 rows) plus A8.1's rows 37 and 38, A10's rows 39 and 40 and A9.7's three row-34 rows, both ways, actors included", async () => {
      const rows = await scratch.sql<
        {
          from_status: string;
          event: string;
          to_status: string;
          allowed_actors: string[];
        }[]
      >`SELECT from_status, event, to_status, allowed_actors FROM order_transition`;
      expect(rows).toHaveLength(80);
      expect(
        new Set(
          rows.map(
            (r) =>
              `${r.from_status}|${r.event}|${r.to_status}|${r.allowed_actors.join(",")}`,
          ),
        ),
      ).toEqual(
        new Set(
          TRANSITIONS.map(
            (t) => `${t.from}|${t.event}|${t.to}|${t.allowedActors.join(",")}`,
          ),
        ),
      );
    });

    it("AC-14: is_terminal is exactly 'no row to a different state', from the database's own rows", async () => {
      const rows = await scratch.sql<{ key: string; mismatch: boolean }[]>`
        SELECT s.key,
               s.is_terminal <> NOT EXISTS (
                 SELECT 1 FROM order_transition t
                 WHERE t.from_status = s.key AND t.to_status <> t.from_status
               ) AS mismatch
        FROM order_status s`;
      expect(rows.filter((r) => r.mismatch).map((r) => r.key)).toEqual([]);
    });

    it("AC-14: the distinct events are the 28 transition events; no status-preserving event has a row", async () => {
      const rows = await scratch.sql<{ event: string }[]>`
        SELECT DISTINCT event FROM order_transition`;
      expect(new Set(rows.map((r) => r.event))).toEqual(
        new Set(TRANSITION_EVENTS),
      );
      const preserving = await scratch.sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM order_transition
        WHERE event IN ${scratch.sql([...STATUS_PRESERVING_EVENTS])}`;
      expect(preserving[0]?.n).toBe(0);
    });

    it("the deferred keys of 0005 whose parent 0007 creates exist, with their delete rule", async () => {
      const mine = DEFERRED_FOREIGN_KEYS.filter(
        ([, , , , , file]) => file === "0007_orders_payments.sql",
      );
      const rows = await scratch.sql<{ fk: string; rule: string }[]>`
        SELECT conname AS fk, confdeltype::text AS rule FROM pg_constraint
        WHERE contype = 'f' AND conname IN ${scratch.sql(mine.map(([name]) => name))}
        ORDER BY conname`;
      expect(rows).toEqual(mine.map(([fk]) => ({ fk, rule: "r" })));
    });

    it("refuses what its constraints exist to refuse", async () => {
      const refused = await rolledBack(scratch.sql, async (tx) => {
        const parents = await orderParents(tx);
        const orderId = await insertPlacedOrder(tx, parents);
        const out: Record<string, string> = {};
        const by = async (
          label: string,
          fn: () => Promise<unknown>,
        ): Promise<void> => {
          const failure = await pgFailure(tx, fn);
          out[label] = failure.constraint ?? failure.raised ?? failure.code;
        };
        await tx`SELECT set_config('app.allow_status_write', 'on', true)`;
        await by(
          "no mode",
          () =>
            tx`INSERT INTO "order" (customer_id, recipient_id, destination_country_id,
               delivery_date, buyer_currency_code, buyer_total_minor, base_currency_code,
               base_total_minor, buyer_snapshot, recipient_snapshot)
             VALUES (${parents.customerId}, ${parents.recipientId},
               ${parents.countryId}, DATE '2027-02-14', 'PLN', 100, 'PLN', 100, '{}', '{}')`,
        );
        await by(
          "live without terms",
          () =>
            tx`INSERT INTO "order" (mode, customer_id, recipient_id,
               destination_country_id, delivery_date, buyer_currency_code, buyer_total_minor,
               base_currency_code, base_total_minor, buyer_snapshot, recipient_snapshot,
               purchase_id)
             VALUES ('live', ${parents.customerId}, ${parents.recipientId},
               ${parents.countryId}, DATE '2027-02-14', 'PLN', 100, 'PLN', 100, '{}', '{}',
               gen_random_uuid())`,
        );
        await by(
          "float-ish fx missing",
          () =>
            tx`INSERT INTO "order" (mode, customer_id, recipient_id,
               destination_country_id, delivery_date, buyer_currency_code, buyer_total_minor,
               base_currency_code, base_total_minor, buyer_snapshot, recipient_snapshot,
               purchase_id)
             VALUES ('demo', ${parents.customerId}, ${parents.recipientId},
               ${parents.countryId}, DATE '2027-02-14', 'GBP', 100, 'PLN', 100, '{}', '{}',
               gen_random_uuid())`,
        );
        await tx`SELECT set_config('app.allow_status_write', '', true)`;
        await by(
          "line in another currency",
          () =>
            tx`INSERT INTO order_line (order_id, kind, qty, unit_retail_minor, currency_code, vat_rate_bp)
             VALUES (${orderId}, 'surcharge', 1, 500, 'EUR', 800)`,
        );
        await by(
          "product line without product",
          () =>
            tx`INSERT INTO order_line (order_id, kind, qty, unit_retail_minor, currency_code, vat_rate_bp)
             VALUES (${orderId}, 'product', 1, 500, 'PLN', 800)`,
        );
        await by(
          "duplicate seq",
          () =>
            tx`INSERT INTO order_event (order_id, seq, type, actor, payload_version)
             VALUES (${orderId}, 1, 'order.placed', 'system:test', 1)`,
        );
        await by(
          "hyphen-free actor class",
          () =>
            tx`INSERT INTO order_event (order_id, seq, type, actor, payload_version)
             VALUES (${orderId}, 2, 'order.placed', 'florist:x', 1)`,
        );
        const [payment] = await tx<{ id: string }[]>`
          INSERT INTO payment (purchase_id, provider, provider_ref, status, method, amount_minor, currency_code, livemode)
          VALUES ((SELECT purchase_id FROM "order" WHERE id = ${orderId}), 'stripe', 'pi_test_1', 'authorised', 'card', 18900, 'PLN', false) RETURNING id`;
        // `failed`, so the one-live-payment-per-purchase index (0026) cannot be what refuses it.
        await by(
          "payment in another currency",
          () =>
            tx`INSERT INTO payment (purchase_id, provider, provider_ref, status, method, amount_minor, currency_code, livemode)
             VALUES ((SELECT purchase_id FROM "order" WHERE id = ${orderId}), 'stripe', 'pi_test_2', 'failed', 'card', 100, 'EUR', false)`,
        );
        await by(
          "refund in another currency",
          () =>
            tx`INSERT INTO refund (payment_id, order_id, purchase_id, provider_ref, amount_minor, currency_code, reason, status, requested_by)
             VALUES (${payment?.id ?? ""}, ${orderId}, (SELECT purchase_id FROM "order" WHERE id = ${orderId}),
                     're_test_1', 100, 'EUR', 'addon_missing', 'pending', 'system:payments')`,
        );
        await by(
          "captured without captured_at",
          () =>
            tx`UPDATE payment SET status = 'captured' WHERE id = ${payment?.id ?? ""}`,
        );
        await tx`INSERT INTO webhook_inbox (provider, event_id, signature_verified, raw, livemode, event_type)
                 VALUES ('stripe', 'evt_1', true, '{}', false, 'payment_intent.succeeded')`;
        await by(
          "webhook retry",
          () =>
            tx`INSERT INTO webhook_inbox (provider, event_id, signature_verified, raw, livemode, event_type)
             VALUES ('stripe', 'evt_1', true, '{}', false, 'payment_intent.succeeded')`,
        );
        // `trustpilot`, so spec 022a's `review_internal_verified_check` (`0029`: an `internal`
        // review is a verified order's) is not the constraint that answers first.
        await by(
          "review rating 6",
          () =>
            tx`INSERT INTO review (source, rating) VALUES ('trustpilot', 6)`,
        );
        await by(
          "verified review without order",
          () =>
            tx`INSERT INTO review (source, rating, verified_order) VALUES ('trustpilot', 5, true)`,
        );
        return out;
      });
      expect(refused).toEqual({
        "no mode": "23502",
        "live without terms": "order_terms_version_check",
        "float-ish fx missing": "order_fx_check",
        "line in another currency": "order_line_order_fkey",
        "product line without product": "order_line_subject_check",
        "duplicate seq": "order_event_order_id_seq_key",
        "hyphen-free actor class": "order_event_actor_check",
        "payment in another currency": "payment_purchase_fkey",
        "refund in another currency": "refund_payment_fkey",
        "captured without captured_at": "payment_captured_check",
        "webhook retry": "webhook_inbox_provider_event_id_key",
        "review rating 6": "review_rating_check",
        "verified review without order": "review_verified_order_check",
      });
    });

    it("seeds no review, order or payment (§6)", async () => {
      const [row] = await scratch.sql<{ n: number }[]>`
        SELECT (SELECT count(*) FROM review) + (SELECT count(*) FROM "order")
             + (SELECT count(*) FROM payment) AS n`;
      expect(Number(row?.n)).toBe(0);
    });
  },
);
