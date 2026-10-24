/**
 * Spec 018 task 1, data and seams, on a disposable PG16 (TASK-337): migration `NNNN_post_purchase`
 * and its rollback, the tracking token, the invoice trigger, and spec 002 §14 A8 which ships in the
 * same file.
 *
 *  - **AC-2 / T-02:** `orderService.place` names no `public_token` and every order gets 22
 *    base64url characters from the column default; a tracking token decodes to exactly
 *    `{ publicToken, version }` and resolves to its order; after `rotateTrackingToken` the old
 *    token fails, the new one resolves and exactly one `audit_log` row records it. `resolve`'s one
 *    failure value for an unknown public token, a stale version, a payload with a third key, a
 *    guessed token, and an expired order (90 days after the delivery date in the destination's
 *    zone, DST night included; 90 days after the first cancelled-projection status).
 *  - **AC-16 / T-16 (trigger half):** every invoice column but the three render columns refuses an
 *    `UPDATE` with `INVOICE_IMMUTABLE`; the first `NULL → value` render write passes, a second, a
 *    partial and a mixed one raise; `DELETE` and `TRUNCATE` raise. As the superuser, so no role
 *    escapes it.
 *  - **AC-27 / T-36 (schema half):** `recipient` has no saving column and `retention_policy` no
 *    `saved_recipient` row.
 *  - **RLS:** the three reference tables are staff only; a buyer reads their own invoice only.
 *  - **Spec 002 §14 A8:** AC-14 (75 rows), AC-44, AC-45, AC-46 (the adapter writes `created_at`
 *    once), AC-47 (the guarded rollback).
 *  - **Rollback:** down then up with demo orders in place, introspection-identical to the schema
 *    before the migration; a rotated order's token changes on the way down so a revoked token
 *    never verifies again; the invoice guard and the A8 guard each refuse and change nothing.
 */
import { randomBytes } from "node:crypto";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  place,
  rotateTrackingToken,
  tracking,
  TRACKING_FAILURE,
  type Actor,
} from "@/modules/orders";
import { createAuthAdapter } from "@/lib/auth/adapter";
import { sign } from "@/lib/signed-link";

import { readCatalogue } from "../../scripts/db-check-live.ts";
import {
  placeInput,
  registerFixtureEventSchemas,
} from "../fixtures/order-engine.ts";
import { TRANSITIONS } from "../fixtures/order-machine.ts";
import {
  applyTransition,
  insertPlacedOrder,
  walkOrderTo,
} from "../fixtures/order-state.ts";
import { drizzleOver } from "./support/drizzle-tx.ts";
import { base, orderParents, unique } from "./support/rows.ts";
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

const SECRET = "t".repeat(64);
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/u;
const CLI_ACTOR = "system:orders.rotate_tracking" as Actor;
const RUNNER_TIMEOUT_MS = 240_000;

const MIGRATIONS = resolve(import.meta.dirname, "../../db/migrations");
/** This task's migration, whatever number it holds after a rebase. */
const FILE =
  readdirSync(MIGRATIONS).find((name) =>
    /^\d{4}_post_purchase\.sql$/u.test(name),
  ) ?? "";
const VERSION = FILE.slice(0, 4);
const BEFORE = String(Number(VERSION) - 1).padStart(4, "0");
const FROM_HERE = readdirSync(MIGRATIONS)
  .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(name))
  .filter((name) => !name.endsWith(".down.sql") && name.slice(0, 4) >= VERSION)
  .map((name) => ({ version: name.slice(0, 4), name: name.slice(5, -4) }));

const at = (iso: string) => () => new Date(iso);
const opts = (tx: Tx, now?: () => Date) => ({
  executor: runnerOf(tx),
  secret: SECRET,
  ...(now === undefined ? {} : { now }),
});

/** A product for `place`'s line. */
async function product(tx: Tx): Promise<string> {
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO product (sku, product_type, primary_flower, colour_primary, style, price_tier,
                         substitution_class, freshness_days)
    VALUES (${unique("SKU-")}, 'bouquet', 'roses', 'red', 'classic', 'classic', 'main_flower', 5)
    RETURNING id`;
  return row?.id ?? "";
}

/** A country with its own zone, for the expiry cases. */
async function zonedCountry(
  tx: Tx,
  iso2: string,
  zone: string,
): Promise<string> {
  await base(tx);
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO country (iso2, currency_code, vat_rate_bp, iana_zone)
    VALUES (${iso2}, 'PLN', 800, ${zone})
    ON CONFLICT (iso2) DO UPDATE SET iana_zone = EXCLUDED.iana_zone
    RETURNING id`;
  return row?.id ?? "";
}

async function placedOrder(
  tx: Tx,
  deliveryDate?: string,
  countryId?: string,
): Promise<string> {
  const parents = await orderParents(tx);
  const id = await insertPlacedOrder(tx, parents);
  if (deliveryDate !== undefined || countryId !== undefined) {
    await tx`UPDATE "order"
             SET delivery_date = coalesce(${deliveryDate ?? null}::date, delivery_date),
                 destination_country_id = coalesce(${countryId ?? null}::uuid, destination_country_id)
             WHERE id = ${id}`;
  }
  return id;
}

async function tokenOf(tx: Tx, orderId: string): Promise<string> {
  const link = await tracking.linkFor(orderId, "en", {
    ...opts(tx),
    origin: "https://flowersoverseas.com",
  });
  return link.split("/track/")[1] ?? "";
}

async function introspect(sql: Sql | Tx): Promise<Record<string, unknown>> {
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

describe.skipIf(server.url === undefined)(
  `spec 018 task 1 data and seams${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "postpurchase");
    }, 300_000);
    afterAll(async () => {
      await scratch.drop();
    });

    describe("AC-2 / T-02: the public token and the tracking token", () => {
      it("place names no public_token, and every order's token is 22 base64url characters from the default", async () => {
        const tokens = await rolledBack(scratch.sql, async (tx) => {
          const parents = await orderParents(tx);
          const productId = await product(tx);
          const out: string[] = [];
          for (let index = 0; index < 25; index += 1) {
            const { orderId } = await place(
              placeInput({ ...parents, productId }),
              { executor: runnerOf(tx) },
            );
            const [row] = await tx<{ public_token: string; v: number }[]>`
              SELECT public_token, tracking_token_version AS v FROM "order" WHERE id = ${orderId}`;
            expect(row?.v).toBe(1);
            out.push(row?.public_token ?? "");
          }
          return out;
        });
        for (const token of tokens) expect(token).toMatch(TOKEN_PATTERN);
        expect(new Set(tokens).size).toBe(tokens.length);
      });

      it("the default is core SQL (no extension) and the check is exact: 21 and 23 characters are refused", async () => {
        const result = await rolledBack(scratch.sql, async (tx) => {
          const [column] = await tx<{ d: string | null }[]>`
            SELECT pg_get_expr(d.adbin, d.adrelid) AS d
            FROM pg_attrdef d
            JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
            WHERE d.adrelid = 'public."order"'::regclass AND a.attname = 'public_token'`;
          const extensions = await tx<
            { extname: string }[]
          >`SELECT extname FROM pg_extension`;
          const parents = await orderParents(tx);
          const insert = (sp: Tx, token: string) => sp`
            INSERT INTO "order" (public_token, mode, customer_id, recipient_id, destination_country_id,
                                 delivery_date, buyer_currency_code, buyer_total_minor,
                                 base_currency_code, base_total_minor, buyer_snapshot, recipient_snapshot)
            VALUES (${token}, 'demo', ${parents.customerId}, ${parents.recipientId}, ${parents.countryId},
                    DATE '2027-02-14', 'PLN', 100, 'PLN', 100, '{}', '{}')`;
          const short = await pgFailure(tx, async (sp) => {
            await sp`SELECT set_config('app.allow_status_write', 'on', true)`;
            await insert(sp, "a".repeat(21));
          });
          const long = await pgFailure(tx, async (sp) => {
            await sp`SELECT set_config('app.allow_status_write', 'on', true)`;
            await insert(sp, "a".repeat(23));
          });
          const symbol = await pgFailure(tx, async (sp) => {
            await sp`SELECT set_config('app.allow_status_write', 'on', true)`;
            await insert(sp, `${"a".repeat(21)}=`);
          });
          return { column: column?.d ?? "", extensions, short, long, symbol };
        });
        expect(result.column).toContain("gen_random_uuid()");
        expect(result.column).toContain("sha256");
        expect(result.column).not.toContain("gen_random_bytes");
        expect(result.extensions.map((row) => row.extname)).toEqual([
          "plpgsql",
        ]);
        for (const failure of [result.short, result.long, result.symbol]) {
          expect(failure.constraint).toBe("order_public_token_check");
        }
      });

      it("a token decodes to exactly { publicToken, version } and resolves to its order", async () => {
        const result = await rolledBack(scratch.sql, async (tx) => {
          const id = await placedOrder(tx);
          const token = await tokenOf(tx, id);
          const [row] = await tx<{ public_token: string }[]>`
            SELECT public_token FROM "order" WHERE id = ${id}`;
          return {
            id,
            token,
            publicToken: row?.public_token ?? "",
            resolved: await tracking.resolve(
              token,
              opts(tx, at("2026-11-01T12:00:00Z")),
            ),
          };
        });
        const payload: unknown = JSON.parse(
          Buffer.from(result.token.split(".")[0] ?? "", "base64url").toString(
            "utf8",
          ),
        );
        expect(payload).toStrictEqual({
          publicToken: result.publicToken,
          version: 1,
        });
        expect(Object.keys(payload as object)).toHaveLength(2);
        expect(result.token).not.toContain(result.id);
        expect(result.resolved).toEqual({ ok: true, orderId: result.id });
      });

      it("rotation: the old token fails, the new one resolves, and exactly one audit_log row records it", async () => {
        const result = await rolledBack(scratch.sql, async (tx) => {
          const id = await placedOrder(tx);
          const other = await placedOrder(tx);
          const old = await tokenOf(tx, id);
          const otherToken = await tokenOf(tx, other);
          const rotated = await rotateTrackingToken(id, CLI_ACTOR, {
            executor: runnerOf(tx),
          });
          const fresh = await tokenOf(tx, id);
          const now = at("2026-11-01T12:00:00Z");
          const audit = await tx<
            {
              actor_label: string;
              action: string;
              entity_table: string;
              before: unknown;
              after: unknown;
              channel: string;
              row: string;
            }[]
          >`SELECT actor_label, action, entity_table, before, after, channel, a::text AS row
            FROM audit_log a WHERE entity_id = ${id}`;
          const [token] = await tx<{ public_token: string }[]>`
            SELECT public_token FROM "order" WHERE id = ${id}`;
          return {
            id,
            other,
            rotated,
            oldResult: await tracking.resolve(old, opts(tx, now)),
            freshResult: await tracking.resolve(fresh, opts(tx, now)),
            otherResult: await tracking.resolve(otherToken, opts(tx, now)),
            audit,
            otherAudit: await tx<{ n: number }[]>`
              SELECT count(*)::int AS n FROM audit_log WHERE entity_id = ${other}`,
            publicToken: token?.public_token ?? "",
            old,
            fresh,
          };
        });
        expect(result.rotated).toEqual({ version: 2 });
        expect(result.oldResult).toBe(TRACKING_FAILURE);
        expect(result.freshResult).toEqual({ ok: true, orderId: result.id });
        expect(result.otherResult).toEqual({ ok: true, orderId: result.other });
        expect(result.fresh).not.toBe(result.old);
        expect(result.audit).toHaveLength(1);
        expect(result.audit[0]).toMatchObject({
          actor_label: CLI_ACTOR,
          action: "order.tracking_token_rotated",
          entity_table: "order",
          before: { tracking_token_version: 1 },
          after: { tracking_token_version: 2 },
          channel: "cli",
        });
        // The audit row carries no credential.
        expect(result.audit[0]?.row).not.toContain(result.publicToken);
        expect(result.otherAudit[0]?.n).toBe(0);
      });

      it("a second rotation retires the second token too, with a second audit row", async () => {
        const result = await rolledBack(scratch.sql, async (tx) => {
          const id = await placedOrder(tx);
          const first = await tokenOf(tx, id);
          await rotateTrackingToken(id, CLI_ACTOR, { executor: runnerOf(tx) });
          const second = await tokenOf(tx, id);
          const rotated = await rotateTrackingToken(id, CLI_ACTOR, {
            executor: runnerOf(tx),
          });
          const third = await tokenOf(tx, id);
          const now = at("2026-11-01T12:00:00Z");
          const [count] = await tx<{ n: number }[]>`
            SELECT count(*)::int AS n FROM audit_log
            WHERE entity_id = ${id} AND action = 'order.tracking_token_rotated'`;
          return {
            id,
            rotated,
            results: [
              await tracking.resolve(first, opts(tx, now)),
              await tracking.resolve(second, opts(tx, now)),
              await tracking.resolve(third, opts(tx, now)),
            ],
            audits: count?.n,
          };
        });
        expect(result.rotated).toEqual({ version: 3 });
        expect(result.results).toEqual([
          TRACKING_FAILURE,
          TRACKING_FAILURE,
          { ok: true, orderId: result.id },
        ]);
        expect(result.audits).toBe(2);
      });

      it("rotating an unknown order throws and audits nothing; a malformed actor is refused", async () => {
        const result = await rolledBack(scratch.sql, async (tx) => {
          const missing = await rotateTrackingToken(
            "0d6c5b4a-3928-4716-a5f4-e3d2c1b0a998",
            CLI_ACTOR,
            { executor: runnerOf(tx) },
          ).catch((error: unknown) => String(error));
          const badActor = await rotateTrackingToken(
            "0d6c5b4a-3928-4716-a5f4-e3d2c1b0a998",
            "system:Bad-Actor" as Actor,
            { executor: runnerOf(tx) },
          ).catch((error: unknown) => (error as Error).name);
          const [count] = await tx<{ n: number }[]>`
            SELECT count(*)::int AS n FROM audit_log WHERE action = 'order.tracking_token_rotated'`;
          return { missing, badActor, audits: count?.n };
        });
        expect(result.missing).toContain("no such order");
        expect(result.badActor).toBe("ZodError");
        expect(result.audits).toBe(0);
      });

      it("one failure value for an unknown public token, a forged version, a third key, a string version, another purpose or key", async () => {
        const result = await rolledBack(scratch.sql, async (tx) => {
          const id = await placedOrder(tx);
          const [row] = await tx<{ public_token: string }[]>`
            SELECT public_token FROM "order" WHERE id = ${id}`;
          const publicToken = row?.public_token ?? "";
          const now = at("2026-11-01T12:00:00Z");
          const signed = (payload: Record<string, unknown>) =>
            sign("track", payload, undefined, { secret: SECRET });
          return [
            // Well signed, but no order holds it.
            await tracking.resolve(
              signed({
                publicToken: randomBytes(16).toString("base64url"),
                version: 1,
              }),
              opts(tx, now),
            ),
            // A version ahead of the order's.
            await tracking.resolve(
              signed({ publicToken, version: 2 }),
              opts(tx, now),
            ),
            // A third key (the order id) beside the two.
            await tracking.resolve(
              signed({ publicToken, version: 1, orderId: id }),
              opts(tx, now),
            ),
            await tracking.resolve(
              signed({ publicToken, version: "1" }),
              opts(tx, now),
            ),
            await tracking.resolve(
              signed({ publicToken: `${publicToken}A`, version: 1 }),
              opts(tx, now),
            ),
            await tracking.resolve(
              sign("invoice", { publicToken, version: 1 }, undefined, {
                secret: SECRET,
              }),
              opts(tx, now),
            ),
            await tracking.resolve(
              sign("track", { publicToken, version: 1 }, undefined, {
                secret: "u".repeat(64),
              }),
              opts(tx, now),
            ),
            // The right two keys still work, so the cases above failed for their own reason.
            await tracking.resolve(
              signed({ publicToken, version: 1 }),
              opts(tx, now),
            ),
          ];
        });
        expect(result.slice(0, 7)).toEqual(Array(7).fill(TRACKING_FAILURE));
        for (const failure of result.slice(0, 7))
          expect(failure).toBe(TRACKING_FAILURE);
        expect(result[7]).toMatchObject({ ok: true });
      });

      it("guessing: 300 random tokens and 300 well-formed tokens for random public tokens open nothing", async () => {
        const result = await rolledBack(scratch.sql, async (tx) => {
          await placedOrder(tx);
          const now = at("2026-11-01T12:00:00Z");
          let opened = 0;
          for (let index = 0; index < 300; index += 1) {
            const guessed = `${randomBytes(40).toString("base64url")}.${randomBytes(16).toString("base64url")}`;
            if ((await tracking.resolve(guessed, opts(tx, now))).ok)
              opened += 1;
            const forged = sign(
              "track",
              {
                publicToken: randomBytes(16).toString("base64url"),
                version: 1,
              },
              undefined,
              { secret: SECRET },
            );
            if ((await tracking.resolve(forged, opts(tx, now))).ok) opened += 1;
          }
          return opened;
        });
        expect(result).toBe(0);
      });

      it("expires at local midnight starting the 91st day after the delivery date in the destination's zone", async () => {
        const result = await rolledBack(scratch.sql, async (tx) => {
          // 2027-02-14 + 91 days = 2027-05-16; Warsaw is UTC+2 then, so the link ends 2027-05-15T22:00Z.
          const id = await placedOrder(tx, "2027-02-14");
          const token = await tokenOf(tx, id);
          return {
            id,
            lastMoment: await tracking.resolve(
              token,
              opts(tx, at("2027-05-15T21:59:59.999Z")),
            ),
            end: await tracking.resolve(
              token,
              opts(tx, at("2027-05-15T22:00:00.000Z")),
            ),
            later: await tracking.resolve(
              token,
              opts(tx, at("2027-05-16T22:00:01.000Z")),
            ),
            beforeDelivery: await tracking.resolve(
              token,
              opts(tx, at("2027-02-01T00:00:00Z")),
            ),
          };
        });
        expect(result.lastMoment).toEqual({ ok: true, orderId: result.id });
        expect(result.beforeDelivery).toEqual({ ok: true, orderId: result.id });
        expect(result.end).toBe(TRACKING_FAILURE);
        expect(result.later).toBe(TRACKING_FAILURE);
      });

      it("DST night: the end falls on the spring-forward date at that zone's midnight, per destination", async () => {
        const result = await rolledBack(scratch.sql, async (tx) => {
          // 2026-12-27 + 91 days = 2027-03-28, the night clocks go forward in the EU. Midnight
          // comes before the change, so Warsaw ends at 2027-03-27T23:00Z (UTC+1) and London at
          // 2027-03-28T00:00Z (UTC+0). A UTC reading of the date would give both the same end.
          const warsaw = await zonedCountry(tx, "PL", "Europe/Warsaw");
          const london = await zonedCountry(tx, "GB", "Europe/London");
          const inWarsaw = await placedOrder(tx, "2026-12-27", warsaw);
          const inLondon = await placedOrder(tx, "2026-12-27", london);
          const warsawToken = await tokenOf(tx, inWarsaw);
          const londonToken = await tokenOf(tx, inLondon);
          const between = at("2027-03-27T23:30:00Z");
          return {
            inLondon,
            warsawBefore: (
              await tracking.resolve(
                warsawToken,
                opts(tx, at("2027-03-27T22:59:59Z")),
              )
            ).ok,
            warsawBetween: await tracking.resolve(
              warsawToken,
              opts(tx, between),
            ),
            londonBetween: await tracking.resolve(
              londonToken,
              opts(tx, between),
            ),
            londonEnd: await tracking.resolve(
              londonToken,
              opts(tx, at("2027-03-28T00:00:00Z")),
            ),
          };
        });
        expect(result.warsawBefore).toBe(true);
        expect(result.warsawBetween).toBe(TRACKING_FAILURE);
        expect(result.londonBetween).toEqual({
          ok: true,
          orderId: result.inLondon,
        });
        expect(result.londonEnd).toBe(TRACKING_FAILURE);
      });

      it("a cancelled order's link ends 90 days after the first cancelled-projection status, whoever cancelled", async () => {
        const result = await rolledBack(scratch.sql, async (tx) => {
          // Delivery far ahead, so only the cancellation can end the link.
          const cancelled = await placedOrder(tx, "2028-12-24");
          await walkOrderTo(tx, cancelled, "cancelled");
          const failed = await placedOrder(tx, "2028-12-24");
          await applyTransition(
            tx,
            failed,
            "order.payment_failed",
            "payment_failed",
          );
          const open = await placedOrder(tx, "2028-12-24");
          const [clock] = await tx<{ t: Date }[]>`SELECT now() AS t`;
          const t = (clock?.t ?? new Date()).getTime();
          const day = 86_400_000;
          const plus = (days: number) => () => new Date(t + days * day);
          const tokens = {
            cancelled: await tokenOf(tx, cancelled),
            failed: await tokenOf(tx, failed),
            open: await tokenOf(tx, open),
          };
          return {
            ids: { cancelled, failed, open },
            day89: [
              (await tracking.resolve(tokens.cancelled, opts(tx, plus(89)))).ok,
              (await tracking.resolve(tokens.failed, opts(tx, plus(89)))).ok,
            ],
            day91: [
              await tracking.resolve(tokens.cancelled, opts(tx, plus(91))),
              await tracking.resolve(tokens.failed, opts(tx, plus(91))),
              await tracking.resolve(tokens.open, opts(tx, plus(91))),
            ],
          };
        });
        expect(result.day89).toEqual([true, true]);
        expect(result.day91[0]).toBe(TRACKING_FAILURE);
        expect(result.day91[1]).toBe(TRACKING_FAILURE);
        expect(result.day91[2]).toEqual({ ok: true, orderId: result.ids.open });
      });

      it("linkFor builds /{locale}/track/{token} on the origin and refuses an unknown locale", async () => {
        const result = await rolledBack(scratch.sql, async (tx) => {
          const id = await placedOrder(tx);
          return {
            link: await tracking.linkFor(id, "en-gb", {
              ...opts(tx),
              origin: "https://flowersoverseas.com/",
            }),
            bad: await tracking
              .linkFor(id, "xx", {
                ...opts(tx),
                origin: "https://flowersoverseas.com",
              })
              .catch((error: unknown) => String(error)),
          };
        });
        expect(result.link).toMatch(
          /^https:\/\/flowersoverseas\.com\/en-gb\/track\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}$/u,
        );
        expect(result.bad).toContain("unknown locale");
      });
    });

    describe("AC-16 / T-16: an invoice never changes", () => {
      /** One invoice on a live-shaped order, under a test profile; returns its id. */
      async function invoiceRow(
        tx: Tx,
      ): Promise<{ id: string; orderId: string }> {
        const orderId = await placedOrder(tx);
        await tx`INSERT INTO invoice_profile (key, supply_model, destination_iso2, document_kind, title_key,
                                             label_locales, vat_bearing_line_kinds, series_key,
                                             credit_series_key, active)
                 VALUES ('test-profile', 'principal', 'PL', 'vat_invoice', 'invoice.title.vatInvoice',
                         ARRAY['pl'], ARRAY['product'], 'fo-pl-2026', 'fok-pl-2026', true)
                 ON CONFLICT (key) DO NOTHING`;
        const [row] = await tx<{ id: string }[]>`
          INSERT INTO invoice (kind, order_id, series_key, number, issued_at, supply_date, currency_code,
                               total_minor, profile_key, snapshot, snapshot_version)
          VALUES ('invoice', ${orderId}, 'fo-pl-2026', ${unique("FO-PL/2026/")}, now(), DATE '2027-02-14',
                  'PLN', 18900, 'test-profile', '{"lines": []}'::jsonb, 1)
          RETURNING id`;
        return { id: row?.id ?? "", orderId };
      }

      it("refuses an UPDATE of every column but the render three, each by INVOICE_IMMUTABLE", async () => {
        const raised = await rolledBack(scratch.sql, async (tx) => {
          const { id } = await invoiceRow(tx);
          const other = await invoiceRow(tx);
          await tx`INSERT INTO invoice_profile (key, supply_model, destination_iso2, document_kind,
                                               title_key, label_locales, vat_bearing_line_kinds,
                                               series_key, credit_series_key, active)
                   VALUES ('test-profile-b', 'agent', 'PL', 'receipt_on_behalf', 'invoice.title.x',
                           ARRAY['pl'], ARRAY['surcharge'], 'fo-pl-2026', 'fok-pl-2026', false)`;
          const changes: Record<string, string> = {
            id: "id = gen_random_uuid()",
            kind: "kind = 'credit_note'",
            order_id: `order_id = '${other.orderId}'`,
            refund_id: "refund_id = gen_random_uuid()",
            corrects_invoice_id: `corrects_invoice_id = '${other.id}'`,
            series_key: "series_key = 'fok-pl-2026'",
            number: "number = number || 'x'",
            issued_at: "issued_at = issued_at + interval '1 second'",
            supply_date: "supply_date = supply_date + 1",
            currency_code: "currency_code = 'EUR'",
            total_minor: "total_minor = total_minor + 1",
            profile_key: "profile_key = 'test-profile-b'",
            snapshot: `snapshot = '{"lines": [1]}'::jsonb`,
            snapshot_version: "snapshot_version = 2",
            created_at: "created_at = created_at - interval '1 day'",
          };
          const [columns] = await tx<{ names: string[] }[]>`
            SELECT array_agg(attname::text ORDER BY attnum) AS names FROM pg_attribute
            WHERE attrelid = 'public.invoice'::regclass AND attnum > 0 AND NOT attisdropped`;
          const out: Record<string, string | undefined> = {};
          for (const column of columns?.names ?? []) {
            if (
              ["pdf_object_key", "pdf_sha256", "rendered_at"].includes(column)
            )
              continue;
            const set = changes[column];
            if (set === undefined) {
              out[column] = "no case";
              continue;
            }
            const failure = await pgFailure(tx, (sp) =>
              sp.unsafe(`UPDATE invoice SET ${set} WHERE id = '${id}'`),
            );
            out[column] = failure.raised;
          }
          // A no-op UPDATE is refused too: nothing but the one render write passes.
          out["(no-op)"] = (
            await pgFailure(
              tx,
              (sp) => sp`UPDATE invoice SET number = number WHERE id = ${id}`,
            )
          ).raised;
          return out;
        });
        expect(Object.keys(raised)).toHaveLength(16);
        for (const [column, code] of Object.entries(raised)) {
          expect(code, column).toBe("INVOICE_IMMUTABLE");
        }
      });

      it("allows the first NULL → value render write of all three; a second, a partial or a mixed one raises", async () => {
        const result = await rolledBack(scratch.sql, async (tx) => {
          const { id } = await invoiceRow(tx);
          const partialTarget = await invoiceRow(tx);
          const mixedTarget = await invoiceRow(tx);
          const sha = "a".repeat(64);
          const partial = await pgFailure(
            tx,
            (sp) => sp`
            UPDATE invoice SET pdf_object_key = 'invoices/2027/x.pdf' WHERE id = ${partialTarget.id}`,
          );
          const mixed = await pgFailure(
            tx,
            (sp) => sp`
            UPDATE invoice SET pdf_object_key = 'invoices/2027/y.pdf', pdf_sha256 = ${sha},
                               rendered_at = now(), total_minor = total_minor + 1
            WHERE id = ${mixedTarget.id}`,
          );
          const [first] = await tx<{ pdf_object_key: string }[]>`
            UPDATE invoice SET pdf_object_key = 'invoices/2027/z.pdf', pdf_sha256 = ${sha}, rendered_at = now()
            WHERE id = ${id} RETURNING pdf_object_key`;
          const second = await pgFailure(
            tx,
            (sp) => sp`
            UPDATE invoice SET pdf_object_key = 'invoices/2027/other.pdf' WHERE id = ${id}`,
          );
          const backToNull = await pgFailure(
            tx,
            (sp) => sp`
            UPDATE invoice SET pdf_object_key = NULL, pdf_sha256 = NULL, rendered_at = NULL
            WHERE id = ${id}`,
          );
          const same = await pgFailure(
            tx,
            (sp) => sp`
            UPDATE invoice SET pdf_sha256 = pdf_sha256 WHERE id = ${id}`,
          );
          return { first, partial, mixed, second, backToNull, same };
        });
        expect(result.first?.pdf_object_key).toBe("invoices/2027/z.pdf");
        expect(result.partial.raised).toBe("INVOICE_IMMUTABLE");
        expect(result.mixed.raised).toBe("INVOICE_IMMUTABLE");
        expect(result.second.raised).toBe("INVOICE_IMMUTABLE");
        expect(result.backToNull.raised).toBe("INVOICE_IMMUTABLE");
        expect(result.same.raised).toBe("INVOICE_IMMUTABLE");
      });

      it("refuses DELETE and TRUNCATE, as the superuser and as the runtime role", async () => {
        const result = await rolledBack(scratch.sql, async (tx) => {
          const { id } = await invoiceRow(tx);
          const asOwner = await pgFailure(
            tx,
            (sp) => sp`DELETE FROM invoice WHERE id = ${id}`,
          );
          const truncate = await pgFailure(
            tx,
            (sp) => sp`TRUNCATE invoice CASCADE`,
          );
          const asSystem = await pgFailure(tx, async (sp) => {
            await asApp(sp, { role: "system" });
            await sp`DELETE FROM invoice WHERE id = ${id}`;
          });
          const [left] = await tx<
            { n: number }[]
          >`SELECT count(*)::int AS n FROM invoice WHERE id = ${id}`;
          return { asOwner, truncate, asSystem, left: left?.n };
        });
        expect(result.asOwner.raised).toBe("INVOICE_IMMUTABLE");
        expect(result.truncate.raised).toBe("INVOICE_IMMUTABLE");
        expect(result.asSystem.raised).toBe("INVOICE_IMMUTABLE");
        expect(result.left).toBe(1);
      });

      it("the kind links hold: an invoice answers no refund, a credit note corrects an invoice", async () => {
        const result = await rolledBack(scratch.sql, async (tx) => {
          const { id, orderId } = await invoiceRow(tx);
          const insert = (sp: Tx, kind: string, corrects: string | null) => sp`
            INSERT INTO invoice (kind, order_id, corrects_invoice_id, series_key, number, issued_at,
                                 supply_date, currency_code, total_minor, profile_key, snapshot,
                                 snapshot_version)
            VALUES (${kind}, ${orderId}, ${corrects}, 'fok-pl-2026', ${unique("FOK-PL/2026/")}, now(),
                    DATE '2027-02-14', 'PLN', -18900, 'test-profile', '{}'::jsonb, 1)`;
          const orphanCredit = await pgFailure(tx, (sp) =>
            insert(sp, "credit_note", null),
          );
          const secondInvoice = await pgFailure(tx, (sp) =>
            insert(sp, "invoice", null),
          );
          // A credit note in a currency other than its order's.
          const wrongCurrency = await pgFailure(
            tx,
            (sp) => sp`
            INSERT INTO invoice (kind, order_id, corrects_invoice_id, series_key, number, issued_at,
                                 supply_date, currency_code, total_minor, profile_key, snapshot,
                                 snapshot_version)
            VALUES ('credit_note', ${orderId}, ${id}, 'fok-pl-2026', ${unique("FOK-PL/2026/")}, now(),
                    DATE '2027-02-14', 'EUR', -1, 'test-profile', '{}'::jsonb, 1)`,
          );
          await insert(tx, "credit_note", id);
          return { orphanCredit, secondInvoice, wrongCurrency };
        });
        expect(result.orphanCredit.constraint).toBe("invoice_kind_links_check");
        expect(result.secondInvoice.constraint).toBe(
          "invoice_one_per_order_idx",
        );
        expect(result.wrongCurrency.constraint).toBe("invoice_order_fkey");
      });
    });

    describe("RLS on the invoice tables (spec 018 §5.1)", () => {
      it("public reads none of the four; a buyer reads their own invoice and no reference row", async () => {
        const result = await rolledBack(scratch.sql, async (tx) => {
          const [user] = await tx<{ id: string }[]>`
            INSERT INTO users (email) VALUES (${`${unique("u")}@example.test`}) RETURNING id`;
          const userId = user?.id ?? "";
          const mine = await insertPlacedOrder(
            tx,
            await orderParents(tx, userId),
          );
          const theirs = await placedOrder(tx);
          await tx`INSERT INTO invoice_profile (key, supply_model, destination_iso2, document_kind,
                                               title_key, label_locales, vat_bearing_line_kinds,
                                               series_key, credit_series_key, active)
                   VALUES ('rls-profile', 'principal', 'PL', 'vat_invoice', 'invoice.title.vatInvoice',
                           ARRAY['pl'], ARRAY['product'], 'fo-pl-2026', 'fok-pl-2026', false)`;
          await tx`INSERT INTO tax_registration (country_iso2, vat_id, valid_from)
                   VALUES ('EE', 'EE000000000', DATE '2026-01-01')`;
          for (const orderId of [mine, theirs]) {
            await tx`INSERT INTO invoice (kind, order_id, series_key, number, issued_at, supply_date,
                                          currency_code, total_minor, profile_key, snapshot,
                                          snapshot_version)
                     VALUES ('invoice', ${orderId}, 'fo-pl-2026', ${unique("FO-PL/2026/")}, now(),
                             DATE '2027-02-14', 'PLN', 18900, 'rls-profile', '{}'::jsonb, 1)`;
          }
          const count = async (sp: Tx) =>
            sp<{ t: string; n: number }[]>`
              SELECT 'invoice' AS t, count(*)::int AS n FROM invoice
              UNION ALL SELECT 'invoice_profile', count(*)::int FROM invoice_profile
              UNION ALL SELECT 'invoice_series', count(*)::int FROM invoice_series
              UNION ALL SELECT 'tax_registration', count(*)::int FROM tax_registration`;
          const asPublic = await tx.savepoint(async (sp) => {
            await asApp(sp, { role: "public" });
            const rows = await count(sp);
            await sp.unsafe("RESET ROLE");
            return rows;
          });
          const asBuyer = await tx.savepoint(async (sp) => {
            await asApp(sp, { role: "customer", userId });
            const rows = await count(sp);
            const own = await sp<
              { order_id: string }[]
            >`SELECT order_id FROM invoice`;
            // The series is invisible to a buyer, so a write reaches no row.
            const write = await sp<{ key: string }[]>`
              UPDATE invoice_series SET next_number = 9 RETURNING key`;
            await sp.unsafe("RESET ROLE");
            return { rows, own, write };
          });
          const asSystem = await tx.savepoint(async (sp) => {
            await asApp(sp, { role: "system" });
            const rows = await count(sp);
            await sp.unsafe("RESET ROLE");
            return rows;
          });
          return { mine, asPublic, asBuyer, asSystem };
        });
        expect(result.asPublic.every((row) => row.n === 0)).toBe(true);
        expect(result.asBuyer.rows).toEqual([
          { t: "invoice", n: 1 },
          { t: "invoice_profile", n: 0 },
          { t: "invoice_series", n: 0 },
          { t: "tax_registration", n: 0 },
        ]);
        expect(result.asBuyer.own).toEqual([{ order_id: result.mine }]);
        expect(result.asBuyer.write).toEqual([]);
        expect(result.asSystem.find((row) => row.t === "invoice")?.n).toBe(2);
        expect(
          result.asSystem.find((row) => row.t === "invoice_series")?.n,
        ).toBeGreaterThanOrEqual(2);
      });
    });

    describe("AC-27 / T-36 schema half: no address book", () => {
      it("recipient has no saving column and retention_policy no saved_recipient row", async () => {
        const columns = await scratch.sql<{ column_name: string }[]>`
          SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'recipient'`;
        const names = columns.map((row) => row.column_name);
        expect(names).toContain("full_name");
        for (const forbidden of [
          "saved_at",
          "saved_consent_log_id",
          "last_used_at",
        ]) {
          expect(names).not.toContain(forbidden);
        }
        const [row] = await scratch.sql<{ n: number; total: number }[]>`
          SELECT count(*) FILTER (WHERE key = 'saved_recipient')::int AS n, count(*)::int AS total
          FROM retention_policy`;
        expect(row?.total).toBeGreaterThan(0);
        expect(row?.n).toBe(0);
      });
    });

    describe("the flags (spec 018 §12)", () => {
      it("account.open and invoice.issue exist, off, with one PL row for invoice.issue, off", async () => {
        const flags = await scratch.sql<
          { key: string; enabled_default: boolean }[]
        >`
          SELECT key, enabled_default FROM feature_flag
          WHERE key IN ('account.open', 'invoice.issue') ORDER BY key`;
        const scopes = await scratch.sql<
          {
            flag_key: string;
            scope: string;
            scope_ref: string;
            enabled: boolean;
          }[]
        >`
          SELECT flag_key, scope, scope_ref, enabled FROM feature_flag_scope
          WHERE flag_key IN ('account.open', 'invoice.issue')`;
        expect(flags).toEqual([
          { key: "account.open", enabled_default: false },
          { key: "invoice.issue", enabled_default: false },
        ]);
        expect(scopes).toEqual([
          {
            flag_key: "invoice.issue",
            scope: "country",
            scope_ref: "PL",
            enabled: false,
          },
        ]);
      });
    });

    describe("spec 002 §14 A8", () => {
      it("AC-14: order_transition holds the fixture's 75 rows, rows 37 and 38 with {system} only", async () => {
        const rows = await scratch.sql<
          {
            from_status: string;
            event: string;
            to_status: string;
            allowed_actors: string[];
          }[]
        >`
          SELECT from_status, event, to_status, allowed_actors FROM order_transition`;
        expect(rows).toHaveLength(75);
        expect(TRANSITIONS).toHaveLength(75);
        const a8 = rows.filter(
          (row) =>
            row.event === "order.no_partner_available" &&
            row.from_status !== "routed",
        );
        expect(
          a8
            .map((row) => [row.from_status, row.to_status, row.allowed_actors])
            .sort(),
        ).toEqual([
          ["authorised", "no_partner_available", ["system"]],
          ["paid_unrouted", "no_partner_available", ["system"]],
        ]);
      });

      it("AC-44: authorised and paid_unrouted move to no_partner_available with the event; order.routed into it raises", async () => {
        const result = await rolledBack(scratch.sql, async (tx) => {
          const fromAuthorised = await placedOrder(tx);
          await applyTransition(
            tx,
            fromAuthorised,
            "order.authorised",
            "authorised",
          );
          await applyTransition(
            tx,
            fromAuthorised,
            "order.no_partner_available",
            "no_partner_available",
          );
          const fromPaid = await placedOrder(tx);
          await applyTransition(
            tx,
            fromPaid,
            "order.captured",
            "paid_unrouted",
          );
          await applyTransition(
            tx,
            fromPaid,
            "order.no_partner_available",
            "no_partner_available",
          );
          const wrong = await placedOrder(tx);
          await applyTransition(tx, wrong, "order.authorised", "authorised");
          const illegal = await pgFailure(tx, (sp) =>
            applyTransition(sp, wrong, "order.routed", "no_partner_available"),
          );
          const statuses = await tx<{ status: string }[]>`
            SELECT status FROM "order" WHERE id IN (${fromAuthorised}, ${fromPaid}) ORDER BY status`;
          return { statuses: statuses.map((row) => row.status), illegal };
        });
        expect(result.statuses).toEqual([
          "no_partner_available",
          "no_partner_available",
        ]);
        expect(result.illegal.raised).toBe("ORDER_TRANSITION_ILLEGAL");
      });

      it("AC-45: walkOrderTo reaches no_partner_available in 2 events and manual_reroute in 3", async () => {
        const result = await rolledBack(scratch.sql, async (tx) => {
          const first = await placedOrder(tx);
          const second = await placedOrder(tx);
          return {
            noPartner: await walkOrderTo(tx, first, "no_partner_available"),
            reroute: await walkOrderTo(tx, second, "manual_reroute"),
          };
        });
        expect(result.noPartner).toHaveLength(2);
        expect(result.noPartner.at(-1)).toBe("order.no_partner_available");
        expect(result.reroute).toHaveLength(3);
      });

      it("AC-46: sessions.created_at is timestamptz not null default now(); the adapter writes it once and updateSession leaves it", async () => {
        const [column] = await scratch.sql<
          { type: string; nullable: string; def: string }[]
        >`
          SELECT data_type AS type, is_nullable AS nullable, column_default AS def
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'sessions' AND column_name = 'created_at'`;
        expect(column).toEqual({
          type: "timestamp with time zone",
          nullable: "NO",
          def: "now()",
        });
        const result = await rolledBack(scratch.sql, async (tx) => {
          const [user] = await tx<{ id: string }[]>`
            INSERT INTO users (email) VALUES (${`${unique("s")}@example.test`}) RETURNING id`;
          const [clock] = await tx<{ t: Date }[]>`SELECT now() AS t`;
          const adapter = createAuthAdapter(async (fn) => {
            await tx`SELECT set_config('app.role', 'system', true)`;
            return fn(drizzleOver(tx, scratch.sql));
          });
          const sessionToken = unique("session-");
          const expires = new Date(Date.now() + 86_400_000);
          await adapter.createSession?.({
            sessionToken,
            userId: user?.id ?? "",
            expires,
          });
          const [created] = await tx<{ created_at: Date }[]>`
            SELECT created_at FROM sessions WHERE session_token = ${sessionToken}`;
          await adapter.updateSession?.({
            sessionToken,
            expires: new Date(expires.getTime() + 86_400_000),
          });
          const [after] = await tx<{ created_at: Date; expires: Date }[]>`
            SELECT created_at, expires FROM sessions WHERE session_token = ${sessionToken}`;
          return {
            clock: clock?.t,
            created: created?.created_at,
            after,
            expires,
          };
        });
        // Drizzle's driver turns the pool's timestamp parser off, so the rows may read as strings.
        const ms = (value: unknown) => new Date(value as string).getTime();
        expect(ms(result.created)).toBe(ms(result.clock));
        expect(ms(result.after?.created_at)).toBe(ms(result.created));
        expect(ms(result.after?.expires)).toBe(
          result.expires.getTime() + 86_400_000,
        );
      });
    });
  },
);

describe.skipIf(server.url === undefined)(
  `spec 018 §5.1 / spec 002 A8.3 rollback of ${FILE}${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let before: ScratchDatabase;
    let db: ScratchDatabase;
    let guarded: ScratchDatabase;
    let beforeCatalogue: Record<string, unknown>;
    let afterCatalogue: Record<string, unknown>;

    beforeAll(async () => {
      // A database stopped just before this migration: the runner is told it and every later one
      // are applied, so it applies everything before them.
      before = await scratchDatabase(server.url as string, "ppbefore", {
        migrate: false,
      });
      await before.sql.unsafe(
        `CREATE TABLE public.schema_migrations (
           version text PRIMARY KEY, name text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`,
      );
      for (const migration of FROM_HERE) {
        await before.sql`INSERT INTO public.schema_migrations (version, name)
                         VALUES (${migration.version}, ${migration.name})`;
      }
      await locked(() => runner(before.url));
      beforeCatalogue = await introspect(before.sql);
      db = await scratchDatabase(server.url as string, "pprb");
      afterCatalogue = await introspect(db.sql);
      guarded = await scratchDatabase(server.url as string, "ppguard");
    }, 600_000);

    afterAll(async () => {
      await before.drop();
      await db.drop();
      await guarded.drop();
    });

    it(
      "down then up with demo orders: the catalogue returns to the one before, a rotated token stays revoked, an unrotated link survives",
      async () => {
        // Orders written before the round trip: one rotated once, one never.
        const ids = await db.sql.begin(async (tx) => {
          const kept = await insertPlacedOrder(tx, await orderParents(tx));
          const rotated = await insertPlacedOrder(tx, await orderParents(tx));
          return { kept, rotated };
        });
        const tokensBefore = await db.sql.begin(async (tx) => {
          const keptToken = await tokenOf(tx, ids.kept);
          const revoked = await tokenOf(tx, ids.rotated);
          await rotateTrackingToken(ids.rotated, CLI_ACTOR, {
            executor: runnerOf(tx),
          });
          return { keptToken, revoked };
        });
        const publicBefore = await db.sql<
          { id: string; public_token: string }[]
        >`
          SELECT id, public_token FROM "order" WHERE id IN (${ids.kept}, ${ids.rotated})`;

        await locked(() => runner(db.url, ["--down", "--to", BEFORE]));
        const rolled = await introspect(db.sql);
        const [left] = await db.sql<
          { transitions: number; flags: number; sessionCreated: number }[]
        >`
          SELECT (SELECT count(*) FROM order_transition)::int AS transitions,
                 (SELECT count(*) FROM feature_flag WHERE key IN ('account.open', 'invoice.issue'))::int AS flags,
                 (SELECT count(*) FROM information_schema.columns
                   WHERE table_name = 'sessions' AND column_name = 'created_at')::int AS "sessionCreated"`;
        const publicRolled = await db.sql<
          { id: string; public_token: string }[]
        >`
          SELECT id, public_token FROM "order" WHERE id IN (${ids.kept}, ${ids.rotated})`;

        await locked(() => runner(db.url));
        const again = await introspect(db.sql);
        const now = at("2026-11-01T12:00:00Z");
        const after = await db.sql.begin(async (tx) => ({
          kept: await tracking.resolve(tokensBefore.keptToken, opts(tx, now)),
          revoked: await tracking.resolve(tokensBefore.revoked, opts(tx, now)),
          versions: await tx<{ v: number }[]>`
            SELECT tracking_token_version AS v FROM "order" WHERE id IN (${ids.kept}, ${ids.rotated})`,
        }));

        expect(rolled).toEqual(beforeCatalogue);
        expect(left).toEqual({ transitions: 73, flags: 0, sessionCreated: 0 });
        const tokenOfId = (
          rows: { id: string; public_token: string }[],
          id: string,
        ) => rows.find((row) => row.id === id)?.public_token;
        expect(tokenOfId(publicRolled, ids.kept)).toBe(
          tokenOfId(publicBefore, ids.kept),
        );
        expect(tokenOfId(publicRolled, ids.rotated)).not.toBe(
          tokenOfId(publicBefore, ids.rotated),
        );
        expect(tokenOfId(publicRolled, ids.rotated)).toMatch(TOKEN_PATTERN);
        expect(again).toEqual(afterCatalogue);
        expect(after.kept).toEqual({ ok: true, orderId: ids.kept });
        expect(after.revoked).toBe(TRACKING_FAILURE);
        expect(after.versions.map((row) => row.v)).toEqual([1, 1]);
      },
      RUNNER_TIMEOUT_MS,
    );

    it(
      "the up file backfills a token that is not exactly 22 characters, and keeps every other",
      async () => {
        await locked(() => runner(guarded.url, ["--down", "--to", BEFORE]));
        const ids = await guarded.sql.begin(async (tx) => {
          const parents = await orderParents(tx);
          await tx`SELECT set_config('app.allow_status_write', 'on', true)`;
          const [long] = await tx<{ id: string }[]>`
            INSERT INTO "order" (public_token, mode, customer_id, recipient_id, destination_country_id,
                                 delivery_date, buyer_currency_code, buyer_total_minor,
                                 base_currency_code, base_total_minor, buyer_snapshot, recipient_snapshot)
            VALUES (${"L".repeat(30)}, 'demo', ${parents.customerId}, ${parents.recipientId},
                    ${parents.countryId}, DATE '2027-02-14', 'PLN', 100, 'PLN', 100, '{}', '{}')
            RETURNING id`;
          const exact = await insertPlacedOrder(tx, parents);
          return { long: long?.id ?? "", exact };
        });
        const [exactBefore] = await guarded.sql<{ public_token: string }[]>`
          SELECT public_token FROM "order" WHERE id = ${ids.exact}`;
        await locked(() => runner(guarded.url));
        const rows = await guarded.sql<{ id: string; public_token: string }[]>`
          SELECT id, public_token FROM "order" WHERE id IN (${ids.long}, ${ids.exact})`;
        const long =
          rows.find((row) => row.id === ids.long)?.public_token ?? "";
        expect(long).toMatch(TOKEN_PATTERN);
        expect(long).not.toBe("L".repeat(30));
        expect(rows.find((row) => row.id === ids.exact)?.public_token).toBe(
          exactBefore?.public_token,
        );
      },
      RUNNER_TIMEOUT_MS,
    );

    it(
      "AC-47 (002) and §12: an A8 transition in the history, or any invoice, makes the down file raise and change nothing",
      async () => {
        const orderId = await guarded.sql.begin(async (tx) => {
          const id = await insertPlacedOrder(tx, await orderParents(tx));
          await applyTransition(tx, id, "order.authorised", "authorised");
          await applyTransition(
            tx,
            id,
            "order.no_partner_available",
            "no_partner_available",
          );
          return id;
        });
        const catalogue = await introspect(guarded.sql);
        let a8 = "";
        try {
          await locked(() => runner(guarded.url, ["--down", "--to", BEFORE]));
        } catch (error) {
          a8 = error instanceof Error ? error.message : String(error);
        }
        expect(a8).toContain("A8_ROLLBACK_ROWS_IN_USE");
        expect(await introspect(guarded.sql)).toEqual(catalogue);

        // A second database, with an invoice and no A8 event.
        const invoiced = await scratchDatabase(server.url as string, "ppinv");
        try {
          await invoiced.sql.begin(async (tx) => {
            const id = await insertPlacedOrder(tx, await orderParents(tx));
            await tx`INSERT INTO invoice_profile (key, supply_model, destination_iso2, document_kind,
                                                 title_key, label_locales, vat_bearing_line_kinds,
                                                 series_key, credit_series_key, active)
                     VALUES ('guard-profile', 'principal', 'PL', 'vat_invoice', 'invoice.title.vatInvoice',
                             ARRAY['pl'], ARRAY['product'], 'fo-pl-2026', 'fok-pl-2026', true)`;
            await tx`INSERT INTO invoice (kind, order_id, series_key, number, issued_at, supply_date,
                                          currency_code, total_minor, profile_key, snapshot,
                                          snapshot_version)
                     VALUES ('invoice', ${id}, 'fo-pl-2026', 'FO-PL/2026/000001', now(), DATE '2027-02-14',
                             'PLN', 18900, 'guard-profile', '{}'::jsonb, 1)`;
          });
          const invoicedCatalogue = await introspect(invoiced.sql);
          let invoice = "";
          try {
            await locked(() =>
              runner(invoiced.url, ["--down", "--to", BEFORE]),
            );
          } catch (error) {
            invoice = error instanceof Error ? error.message : String(error);
          }
          const [count] = await invoiced.sql<
            { n: number }[]
          >`SELECT count(*)::int AS n FROM invoice`;
          expect(invoice).toContain("POST_PURCHASE_ROLLBACK_INVOICES_EXIST");
          expect(await introspect(invoiced.sql)).toEqual(invoicedCatalogue);
          expect(count?.n).toBe(1);
        } finally {
          await invoiced.drop();
        }
        expect(orderId).toMatch(/^[0-9a-f-]{36}$/u);
      },
      RUNNER_TIMEOUT_MS,
    );
  },
);
