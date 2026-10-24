/**
 * Order references never clash, and the order carries its locale, against a migrated PG16 (spec
 * 010 §14 A2.2, A2.3, A3.1; AC-45 and AC-47 integration halves, T-45, T-47; TASK-245).
 *
 * Migration `0013_order_engine_columns`: the `IMMUTABLE` SQL `order_reference(uuid)`, equal to
 * the TypeScript `orderReference` on the shared fixture and on 1 000 random ids; the unique
 * `order_reference_idx` that refuses a second order with the same reference; `"order".locale_code`.
 * `place` writes the order row first inside a savepoint and, on a violation of that index only,
 * rolls back to it and retries with a new id, at most five times.
 *
 * Every case runs on a scratch database of a disposable local Postgres 16
 * (`support/scratch-db.ts`); never the shared Phase 0 database.
 */
import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  isOrderEngineError,
  type OrderErrorCode,
  orderReference,
  type OutboxTargetResolver,
  place,
} from "@/modules/orders";

import { placeInput, type PlaceParents } from "../fixtures/order-engine.ts";
import {
  clashingId,
  nearMissId,
  PINNED_REFERENCES,
  scriptedIds,
} from "../fixtures/order-reference.ts";
import { country, customer, recipient, unique } from "./support/rows.ts";
import {
  pgFailure,
  probeLocalServer,
  rolledBack,
  runner,
  scratchDatabase,
  type ScratchDatabase,
  type Tx,
} from "./support/scratch-db.ts";
import { runnerOf } from "./support/sql-runner.ts";

const server = await probeLocalServer();

const db = (tx: Tx) => ({ db: runnerOf(tx) });

/** One staff target, so a successful placement writes exactly one outbox row. */
const oneTarget: OutboxTargetResolver = () => [
  { name: "ops.fixture", audience: "staff" },
];

let isoCounter = Math.floor(Math.random() * 400);
function nextIso(): string {
  isoCounter += 1;
  const n = isoCounter % 676;
  return String.fromCharCode(65 + Math.floor(n / 26), 65 + (n % 26));
}

async function parents(tx: Tx): Promise<PlaceParents> {
  const countryId = await country(tx, nextIso());
  const customerId = await customer(tx);
  const recipientId = await recipient(tx, customerId);
  const [product] = await tx<{ id: string }[]>`
    INSERT INTO product (sku, product_type, primary_flower, colour_primary, style, price_tier,
                         substitution_class, freshness_days)
    VALUES (${unique("SKU-")}, 'bouquet', 'roses', 'red', 'classic', 'classic', 'main_flower', 5)
    RETURNING id`;
  return {
    countryId,
    customerId,
    recipientId,
    productId: product?.id ?? "",
  };
}

interface Counts {
  readonly orders: number;
  readonly lines: number;
  readonly events: number;
  readonly outbox: number;
}

async function counts(tx: Tx): Promise<Counts> {
  const [row] = await tx<Counts[]>`
    SELECT (SELECT count(*)::int FROM "order") AS orders,
           (SELECT count(*)::int FROM order_line) AS lines,
           (SELECT count(*)::int FROM order_event) AS events,
           (SELECT count(*)::int FROM outbox) AS outbox`;
  if (row === undefined) throw new Error("no counts");
  return row;
}

async function switchSetting(tx: Tx): Promise<string> {
  const [row] = await tx<{ allow: string }[]>`
    SELECT coalesce(current_setting('app.allow_status_write', true), '') AS allow`;
  return row?.allow ?? "?";
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

/**
 * A raw copy of order `from` under the id `id` (and, when given, another locale), with the insert
 * switch on (A1.3).
 */
async function rawCopy(
  tx: Tx,
  from: string,
  id: string,
  localeCode?: string,
): Promise<void> {
  await tx`SELECT set_config('app.allow_status_write', 'on', true)`;
  await tx`
    INSERT INTO "order" (id, public_token, mode, customer_id, recipient_id, destination_country_id,
                         destination_postcode, delivery_date, status, buyer_currency_code,
                         buyer_total_minor, base_currency_code, base_total_minor, vat_breakdown,
                         buyer_snapshot, recipient_snapshot, locale_code, purchase_id)
    SELECT ${id}, ${`${randomUUID().replaceAll("-", "")}abcdefgh`}, mode, customer_id,
           recipient_id, destination_country_id, destination_postcode, delivery_date, 'placed',
           buyer_currency_code, buyer_total_minor, base_currency_code, base_total_minor,
           vat_breakdown, buyer_snapshot, recipient_snapshot,
           coalesce(${localeCode ?? null}::text, locale_code), purchase_id
    FROM "order" WHERE id = ${from}`;
}

describe.skipIf(server.url === undefined)(
  `order references and locale on PG16${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "reference");
    }, 300_000);
    afterAll(async () => {
      await scratch.drop();
    });

    it("AC-45: order_reference(uuid) is IMMUTABLE and equals orderReference on the pinned fixture and on 1 000 random ids", async () => {
      const ids = [
        ...PINNED_REFERENCES.map(([id]) => id),
        ...Array.from({ length: 1000 }, () => randomUUID()),
      ];
      const rows = await scratch.sql<{ id: string; reference: string }[]>`
        SELECT value AS id, order_reference(value::uuid) AS reference
        FROM jsonb_array_elements_text((${JSON.stringify(ids)}::text)::jsonb) AS value`;
      expect(rows).toHaveLength(1010);
      const sqlSide = new Map(rows.map((row) => [row.id, row.reference]));
      for (const [id, reference] of PINNED_REFERENCES) {
        expect(sqlSide.get(id), id).toBe(reference);
      }
      for (const id of ids) {
        expect(sqlSide.get(id), id).toBe(orderReference(id));
      }
      const [fn] = await scratch.sql<
        { volatility: string; strict: boolean; owner: string }[]
      >`
        SELECT p.provolatile AS volatility, p.proisstrict AS strict,
               pg_get_userbyid(p.proowner) AS owner
        FROM pg_proc p WHERE p.proname = 'order_reference'
          AND p.pronamespace = 'public'::regnamespace`;
      expect(fn).toEqual({ volatility: "i", strict: true, owner: "app_owner" });
      const [index] = await scratch.sql<{ definition: string }[]>`
        SELECT pg_get_indexdef('public.order_reference_idx'::regclass) AS definition`;
      expect(index?.definition).toBe(
        'CREATE UNIQUE INDEX order_reference_idx ON public."order" USING btree (order_reference(id))',
      );
    });

    it("AC-45: a raw insert whose id derives an existing reference is refused by order_reference_idx; one differing in the 40th bit is not", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const p = await parents(tx);
        const { orderId } = await place(placeInput(p), db(tx));
        const clash = await pgFailure(tx, (sp) =>
          rawCopy(sp, orderId, clashingId(orderId)),
        );
        const near = nearMissId(orderId);
        await rawCopy(tx, orderId, near);
        const [stored] = await tx<{ n: number }[]>`
          SELECT count(*)::int AS n FROM "order" WHERE id = ${near}`;
        return { clash, near: stored?.n };
      });
      expect(result.clash).toMatchObject({
        code: "23505",
        constraint: "order_reference_idx",
      });
      expect(result.near).toBe(1);
    });

    it("AC-45: with one clash forced, place ends on a new id: one order, a different reference, order.placed at seq 1 on the new id", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const p = await parents(tx);
        const first = await place(placeInput(p), db(tx));
        const before = await counts(tx);
        const clash = clashingId(first.orderId);
        const fresh = randomUUID();
        const ids = scriptedIds([clash, fresh]);
        const { orderId } = await place(placeInput(p), {
          ...db(tx),
          outboxTargets: oneTarget,
          newId: ids.next,
        });
        const after = await counts(tx);
        const events = await tx<{ seq: number; type: string }[]>`
          SELECT seq, type FROM order_event WHERE order_id = ${orderId} ORDER BY seq`;
        const [clashRows] = await tx<{ n: number }[]>`
          SELECT (SELECT count(*) FROM "order" WHERE id = ${clash})
               + (SELECT count(*) FROM order_line WHERE order_id = ${clash})
               + (SELECT count(*) FROM order_event WHERE order_id = ${clash})::int AS n`;
        const [lines] = await tx<{ n: number }[]>`
          SELECT count(*)::int AS n FROM order_line WHERE order_id = ${orderId}`;
        const references = await tx<{ reference: string }[]>`
          SELECT order_reference(id) AS reference FROM "order"
          WHERE id IN (${first.orderId}, ${orderId}) ORDER BY created_at, id`;
        return {
          first: first.orderId,
          orderId,
          fresh,
          calls: ids.calls(),
          before,
          after,
          events,
          clashRows: Number(clashRows?.n),
          lines: lines?.n,
          references: references.map((row) => row.reference),
          setting: await switchSetting(tx),
        };
      });
      expect(result.orderId).toBe(result.fresh);
      expect(result.calls).toBe(2);
      expect(result.after).toEqual({
        orders: result.before.orders + 1,
        lines: result.before.lines + 2,
        events: result.before.events + 1,
        outbox: result.before.outbox + 1,
      });
      expect(result.events).toEqual([{ seq: 1, type: "order.placed" }]);
      expect(result.clashRows).toBe(0);
      expect(result.lines).toBe(2);
      expect(new Set(result.references).size).toBe(2);
      expect(orderReference(result.orderId)).not.toBe(
        orderReference(result.first),
      );
      expect(result.setting).toBe("");
    });

    it("AC-45: five clashes in a row return ORDER_REFERENCE_UNAVAILABLE, write nothing to order, order_line, order_event or outbox, and leave the transaction usable", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const p = await parents(tx);
        const first = await place(placeInput(p), db(tx));
        const before = await counts(tx);
        const ids = scriptedIds(
          Array.from({ length: 6 }, () => clashingId(first.orderId)),
        );
        const code = await refusal(
          place(placeInput(p), {
            ...db(tx),
            outboxTargets: oneTarget,
            newId: ids.next,
          }),
        );
        // The transaction accepts a following statement, and a following placement.
        const after = await counts(tx);
        const setting = await switchSetting(tx);
        const next = await place(placeInput(p), {
          ...db(tx),
          outboxTargets: oneTarget,
        });
        return {
          code,
          calls: ids.calls(),
          before,
          after,
          setting,
          next: next.orderId,
          final: await counts(tx),
        };
      });
      expect(result.code).toBe("ORDER_REFERENCE_UNAVAILABLE");
      expect(result.calls).toBe(5);
      expect(result.after).toEqual(result.before);
      expect(result.setting).toBe("");
      expect(result.next).toMatch(/^[0-9a-f-]{36}$/);
      expect(result.final.orders).toBe(result.before.orders + 1);
    });

    it("AC-45: a unique violation on another index is raised once, as the driver raised it, and not retried", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const p = await parents(tx);
        await place(placeInput(p), db(tx));
        // `0019`'s deferred purchase check has queued events, and Postgres refuses DDL on a table
        // with pending trigger events: run them now (the purchase totals its one order).
        await tx`SET CONSTRAINTS ALL IMMEDIATE`;
        // A second unique index on "order", for this transaction only: a second order for the
        // same customer violates it, with a fresh id whose reference is free.
        await tx`CREATE UNIQUE INDEX fixture_one_order_per_customer ON "order" (customer_id)`;
        await tx`SET CONSTRAINTS ALL DEFERRED`;
        const ids = scriptedIds([]);
        const failure = await pgFailure(tx, (sp) =>
          place(placeInput(p), { ...db(sp), newId: ids.next }),
        );
        return { failure, calls: ids.calls() };
      });
      expect(result.failure).toMatchObject({
        code: "23505",
        constraint: "fixture_one_order_per_customer",
      });
      expect(result.calls).toBe(1);
    });

    it("AC-47: place writes order.locale_code from the input for en, en-gb, de and pl, never the column default", async () => {
      const stored = await rolledBack(scratch.sql, async (tx) => {
        const p = await parents(tx);
        await tx`INSERT INTO locale (code, bcp47, name)
                 VALUES ('en-gb', 'en-GB', 'English (UK)'), ('de', 'de-DE', 'Deutsch')
                 ON CONFLICT DO NOTHING`;
        // A default no input names, so a value read back can only have come from the input.
        await tx`INSERT INTO locale (code, bcp47, name) VALUES ('xx-default', 'und', 'Default probe')`;
        await tx`ALTER TABLE "order" ALTER COLUMN locale_code SET DEFAULT 'xx-default'`;
        const out: Record<string, string | undefined> = {};
        for (const localeCode of ["en", "en-gb", "de", "pl"]) {
          const { orderId } = await place(
            placeInput(p, { localeCode }),
            db(tx),
          );
          const [row] = await tx<{ locale_code: string }[]>`
            SELECT locale_code FROM "order" WHERE id = ${orderId}`;
          out[localeCode] = row?.locale_code;
        }
        return out;
      });
      expect(stored).toEqual({
        en: "en",
        "en-gb": "en-gb",
        de: "de",
        pl: "pl",
      });
    });

    it("AC-47: an order naming a locale absent from locale raises the foreign-key error, through place and through a raw insert", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const p = await parents(tx);
        // A lone order's own purchase (`0019`) is written first, in the same locale, so its key
        // is the one that refuses.
        const throughPlace = await pgFailure(tx, (sp) =>
          place(placeInput(p, { localeCode: "zz" }), db(sp)),
        );
        const { orderId } = await place(placeInput(p), db(tx));
        const [purchase] = await tx<{ purchase_id: string }[]>`
          SELECT purchase_id FROM "order" WHERE id = ${orderId}`;
        // Into an existing purchase, the order's own key refuses.
        const intoPurchase = await pgFailure(tx, (sp) =>
          place(
            placeInput(p, {
              localeCode: "zz",
              purchaseId: purchase?.purchase_id ?? "",
            }),
            db(sp),
          ),
        );
        const raw = await pgFailure(tx, (sp) =>
          rawCopy(sp, orderId, randomUUID(), "zz"),
        );
        return { throughPlace, intoPurchase, raw };
      });
      expect(result.throughPlace).toMatchObject({
        code: "23503",
        constraint: "purchase_locale_code_locale_code_fk",
      });
      for (const failure of [result.intoPurchase, result.raw]) {
        expect(failure).toMatchObject({
          code: "23503",
          constraint: "order_locale_code_locale_code_fk",
        });
      }
    });
  },
);

describe.skipIf(server.url === undefined)(
  `0013_order_engine_columns round trip on PG16${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "ref_trip");
    }, 300_000);
    afterAll(async () => {
      await scratch.drop();
    });

    async function objects(sql: postgres.Sql): Promise<{
      column: number;
      fn: number;
      index: number;
      version: number;
    }> {
      const [row] = await sql<
        { column: number; fn: number; index: number; version: number }[]
      >`
        SELECT (SELECT count(*)::int FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'order'
                  AND column_name = 'locale_code') AS column,
               (SELECT count(*)::int FROM pg_proc WHERE proname = 'order_reference') AS fn,
               (SELECT count(*)::int FROM pg_class WHERE relname = 'order_reference_idx') AS index,
               (SELECT count(*)::int FROM schema_migrations WHERE version = '0013') AS version`;
      if (row === undefined) throw new Error("no row");
      return row;
    }

    it("AC-47 / A2.2: the down file drops the index, the function and the column; the up file restores them; an existing clash fails the up file with nothing changed", async () => {
      const PRESENT = { column: 1, fn: 1, index: 1, version: 1 };
      const ABSENT = { column: 0, fn: 0, index: 0, version: 0 };
      expect(await objects(scratch.sql)).toEqual(PRESENT);

      await runner(scratch.url, ["--down", "--to", "0012"]);
      expect(await objects(scratch.sql)).toEqual(ABSENT);

      await runner(scratch.url);
      expect(await objects(scratch.sql)).toEqual(PRESENT);
      const [column] = await scratch.sql<
        { is_nullable: string; column_default: string }[]
      >`
        SELECT is_nullable, column_default FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'order' AND column_name = 'locale_code'`;
      expect(column).toEqual({
        is_nullable: "NO",
        column_default: "'en'::text",
      });

      // Two committed orders whose ids derive one reference, written before 0013 exists.
      await runner(scratch.url, ["--down", "--to", "0012"]);
      const firstId = randomUUID();
      const secondId = clashingId(firstId);
      await scratch.sql.begin(async (tx) => {
        const p = await parents(tx);
        for (const id of [firstId, secondId]) {
          await tx`SELECT set_config('app.allow_status_write', 'on', true)`;
          await tx`
            INSERT INTO "order" (id, public_token, mode, customer_id, recipient_id,
                                 destination_country_id, delivery_date, status,
                                 buyer_currency_code, buyer_total_minor, base_currency_code,
                                 base_total_minor, buyer_snapshot, recipient_snapshot)
            VALUES (${id}, ${`${randomUUID().replaceAll("-", "")}abcdefgh`}, 'demo',
                    ${p.customerId}, ${p.recipientId}, ${p.countryId}, '2027-02-14', 'placed',
                    'PLN', 19900, 'PLN', 19900, '{}'::jsonb, '{}'::jsonb)`;
        }
      });
      await expect(runner(scratch.url)).rejects.toThrow();
      expect(await objects(scratch.sql)).toEqual(ABSENT);

      // Fixed by hand, as A2.2 says: then the up file applies, and the existing order backfills.
      await scratch.sql.begin(async (tx) => {
        await tx`DELETE FROM "order" WHERE id = ${secondId}`;
      });
      await runner(scratch.url);
      expect(await objects(scratch.sql)).toEqual(PRESENT);
      const [kept] = await scratch.sql<{ locale_code: string }[]>`
        SELECT locale_code FROM "order" WHERE id = ${firstId}`;
      expect(kept?.locale_code).toBe("en");
    }, 600_000);
  },
);
