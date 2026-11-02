/**
 * Migration `0019_purchase` up, down and up on PG16, with data in it (spec 010 §14
 * A-founder-2026-10-22 item 2 A; T-66 purchase half; AC-66; TASK-347).
 *
 *  1. Rolled back to `0018`, the scratch database gets committed demo, test and live orders, the
 *     live one paid and partly refunded, written the way `place` wrote them before `0019`.
 *  2. Up: every one of them has its **own** purchase, with its mode, currency, total, locale,
 *     customer and `created_at`, and every other column of every order is unchanged (`updated_at`
 *     included: the backfill does not touch it).
 *  3. A two-order purchase is placed and committed, so the rollback runs with purchases present.
 *  4. Down: `purchase`, the column, the key, the triggers and the function are gone, and every
 *     order keeps every other column, byte for byte.
 *  5. Up again: the round trip closes, and every order is back in a purchase of its own total.
 *
 * Its own scratch database, because it rolls migrations back.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { placePurchase, type PlaceOrderInput } from "@/modules/orders";

import { placeInput } from "../fixtures/order-engine.ts";
import { country, customer, recipient, unique } from "./support/rows.ts";
import {
  asApp,
  probeLocalServer,
  runner,
  scratchDatabase,
  type ScratchDatabase,
  type Sql,
  type Tx,
} from "./support/scratch-db.ts";
import { runnerOf } from "./support/sql-runner.ts";

const server = await probeLocalServer();

/** Three runner invocations and committed data: well past Vitest's 5 s default on a loaded runner. */
const MIGRATION_ROUND_TRIP_MS = 120_000;

/**
 * Every column of every order except `purchase_id`, as JSON text, by id. A forward run also applies
 * the migrations after `0019`, so `0021_post_purchase`'s `tracking_token_version` (TASK-337) is left
 * out with it: it is not this migration's column.
 */
async function ordersWithout(sql: Sql): Promise<Map<string, string>> {
  const rows = await sql<{ id: string; row: string }[]>`
    SELECT o.id, (to_jsonb(o) - 'purchase_id' - 'tracking_token_version')::text AS row
    FROM "order" o ORDER BY o.id`;
  return new Map(rows.map((r) => [r.id, r.row]));
}

async function objects(sql: Sql): Promise<{
  table: number;
  column: number;
  fn: number;
  triggers: number;
  key: number;
}> {
  const [row] = await sql<
    {
      table: number;
      column: number;
      fn: number;
      triggers: number;
      key: number;
    }[]
  >`
    SELECT (SELECT count(*)::int FROM pg_class WHERE relname = 'purchase') AS table,
           (SELECT count(*)::int FROM information_schema.columns
              WHERE table_name = 'order' AND column_name = 'purchase_id') AS column,
           (SELECT count(*)::int FROM pg_proc WHERE proname = 'purchase_total_check') AS fn,
           (SELECT count(*)::int FROM pg_trigger WHERE tgname = 'purchase_total_check') AS triggers,
           (SELECT count(*)::int FROM pg_constraint
              WHERE conname = 'order_purchase_id_buyer_currency_code_mode_purchase_fk') AS key`;
  return row ?? { table: -1, column: -1, fn: -1, triggers: -1, key: -1 };
}

/**
 * An order as `place` wrote one before `0019`: no purchase. Its token is 22 characters, the exact
 * shape `0021_post_purchase` keeps, so the forward run past `0019` leaves it alone.
 */
async function legacyOrder(
  tx: Tx,
  parents: { countryId: string; customerId: string; recipientId: string },
  mode: "demo" | "test" | "live",
  totalMinor: number,
  localeCode: string,
): Promise<string> {
  await tx`SELECT set_config('app.allow_status_write', 'on', true)`;
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO "order" (public_token, mode, customer_id, recipient_id, destination_country_id,
                         delivery_date, buyer_currency_code, buyer_total_minor,
                         base_currency_code, base_total_minor, terms_version, buyer_snapshot,
                         recipient_snapshot, locale_code, created_at)
    VALUES (${unique("legacy").padEnd(22, "x")}, ${mode}, ${parents.customerId},
            ${parents.recipientId}, ${parents.countryId}, DATE '2027-02-14', 'PLN',
            ${totalMinor}, 'PLN', ${totalMinor}, ${mode === "live" ? "2026-10" : null},
            '{"name": "Test Buyer"}'::jsonb, '{"city": "Warszawa"}'::jsonb, ${localeCode},
            now() - interval '3 days')
    RETURNING id`;
  await tx`SELECT set_config('app.allow_status_write', '', true)`;
  return row?.id ?? "";
}

describe.skipIf(server.url === undefined)(
  `0019_purchase up, down, up with data${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "purchase_mig");
    }, 600_000);
    afterAll(async () => {
      await scratch.drop();
    });

    it(
      "backfills one purchase per order (demo, test, live with a refund), keeps every order column through down, and applies again",
      async () => {
        await runner(scratch.url, ["--down", "--to", "0018"]);
        expect(await objects(scratch.sql)).toEqual({
          table: 0,
          column: 0,
          fn: 0,
          triggers: 0,
          key: 0,
        });

        const legacy = await scratch.sql.begin(async (tx) => {
          const countryId = await country(tx, "PL");
          const customerId = await customer(tx);
          const recipientId = await recipient(tx, customerId);
          const parents = { countryId, customerId, recipientId };
          const demo = await legacyOrder(tx, parents, "demo", 19_900, "en");
          const test = await legacyOrder(tx, parents, "test", 20_900, "pl");
          const live = await legacyOrder(tx, parents, "live", 21_900, "en");
          // The live order paid and partly refunded; the test order paid.
          const [payment] = await tx<{ id: string }[]>`
          INSERT INTO payment (order_id, provider, provider_ref, status, method, amount_minor,
                               currency_code, livemode, capture_method, amount_captured_minor,
                               captured_at)
          VALUES (${live}, 'stripe', ${unique("pi_")}, 'captured', 'card', 21900, 'PLN', true,
                  'automatic', 21900, now())
          RETURNING id`;
          await tx`
          INSERT INTO payment (order_id, provider, provider_ref, status, method, amount_minor,
                               currency_code, livemode, capture_method, amount_captured_minor,
                               captured_at)
          VALUES (${test}, 'stripe', ${unique("pi_")}, 'captured', 'card', 20900, 'PLN', false,
                  'automatic', 20900, now())`;
          await tx`
          INSERT INTO refund (payment_id, amount_minor, currency_code, reason, status, requested_by)
          VALUES (${payment?.id ?? ""}, 5000, 'PLN', 'quality', 'requested',
                  'admin:0b8e7d6c-5a4f-4e3d-8c2b-1a0f9e8d7c6b')`;
          return { demo, test, live, customerId, countryId };
        });
        const before = await ordersWithout(scratch.sql);
        expect(before.size).toBe(3);

        await runner(scratch.url);
        const backfilled = await scratch.sql<
          {
            order_id: string;
            purchase_id: string;
            same_mode: boolean;
            same_currency: boolean;
            same_total: boolean;
            same_locale: boolean;
            same_customer: boolean;
            same_created: boolean;
            siblings: number;
          }[]
        >`
        SELECT o.id AS order_id, p.id AS purchase_id,
               p.mode = o.mode AS same_mode,
               p.buyer_currency_code = o.buyer_currency_code AS same_currency,
               p.total_minor = o.buyer_total_minor AS same_total,
               p.locale_code = o.locale_code AS same_locale,
               p.customer_id = o.customer_id AS same_customer,
               p.created_at = o.created_at AS same_created,
               (SELECT count(*)::int FROM "order" s WHERE s.purchase_id = p.id) AS siblings
        FROM "order" o JOIN purchase p ON p.id = o.purchase_id ORDER BY o.id`;
        expect(backfilled).toHaveLength(3);
        for (const row of backfilled) {
          expect(row, row.order_id).toMatchObject({
            same_mode: true,
            same_currency: true,
            same_total: true,
            same_locale: true,
            same_customer: true,
            same_created: true,
            siblings: 1,
          });
        }
        expect(new Set(backfilled.map((row) => row.purchase_id)).size).toBe(3);
        const [purchaseCount] = await scratch.sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM purchase`;
        expect(purchaseCount?.n).toBe(3);
        expect(await ordersWithout(scratch.sql)).toEqual(before);

        // A basket of two, committed, so the rollback runs with a multi-order purchase present.
        await scratch.sql.begin(async (tx) => {
          const second = await recipient(tx, legacy.customerId);
          const parents = {
            countryId: legacy.countryId,
            customerId: legacy.customerId,
            recipientId: second,
            productId: "",
          };
          const [product] = await tx<{ id: string }[]>`
          INSERT INTO product (sku, product_type, primary_flower, colour_primary, style,
                               price_tier, substitution_class, freshness_days)
          VALUES (${unique("SKU-")}, 'bouquet', 'roses', 'red', 'classic', 'classic',
                  'main_flower', 5)
          RETURNING id`;
          const withProduct = { ...parents, productId: product?.id ?? "" };
          const orders: PlaceOrderInput[] = [
            placeInput(withProduct),
            placeInput(withProduct, { deliveryDate: "2027-02-15" }),
          ];
          await asApp(tx, { role: "system" });
          await placePurchase(
            {
              mode: "demo",
              buyerCurrency: "PLN",
              totalMinor: 2 * 19_900,
              localeCode: "en",
              customerId: legacy.customerId,
              orders,
            },
            { db: runnerOf(tx) },
          );
        });
        const withBasket = await ordersWithout(scratch.sql);
        expect(withBasket.size).toBe(5);

        // `0026_payment_purchase` (TASK-350) sits above `0019` and refuses to roll back while a
        // live payment exists (`PAYMENT_PURCHASE_ROLLBACK_BLOCKED`, spec 013 §8): the walk down
        // to `0018` stops there and changes nothing. The live payment and its refund are then
        // removed by hand, so `0019`'s own down still runs with a paid test order and a
        // multi-order purchase present.
        let blocked = "";
        try {
          await runner(scratch.url, ["--down", "--to", "0018"]);
        } catch (error) {
          blocked = error instanceof Error ? error.message : String(error);
        }
        expect(blocked).toContain("PAYMENT_PURCHASE_ROLLBACK_BLOCKED");
        expect(await ordersWithout(scratch.sql)).toEqual(withBasket);
        await scratch.sql.begin(async (tx) => {
          await tx`DELETE FROM refund`;
          await tx`DELETE FROM payment WHERE livemode`;
        });

        await runner(scratch.url, ["--down", "--to", "0018"]);
        expect(await objects(scratch.sql)).toEqual({
          table: 0,
          column: 0,
          fn: 0,
          triggers: 0,
          key: 0,
        });
        expect(await ordersWithout(scratch.sql)).toEqual(withBasket);
        const [paid] = await scratch.sql<
          { payments: number; refunds: number }[]
        >`
        SELECT (SELECT count(*)::int FROM payment) AS payments,
               (SELECT count(*)::int FROM refund) AS refunds`;
        expect(paid).toEqual({ payments: 1, refunds: 0 });

        await runner(scratch.url);
        expect(await objects(scratch.sql)).toEqual({
          table: 1,
          column: 1,
          fn: 1,
          triggers: 2,
          key: 1,
        });
        const [again] = await scratch.sql<{ orders: number; equal: number }[]>`
        SELECT count(*)::int AS orders,
               count(*) FILTER (WHERE p.total_minor = o.buyer_total_minor)::int AS equal
        FROM "order" o JOIN purchase p ON p.id = o.purchase_id`;
        expect(again).toEqual({ orders: 5, equal: 5 });
        expect(await ordersWithout(scratch.sql)).toEqual(withBasket);
      },
      MIGRATION_ROUND_TRIP_MS,
    );
  },
);
