/**
 * Migration `0011` as `app_web` sees it (spec 002 AC-16, AC-17, AC-18; T-16, T-17, T-18; `plan/12`
 * §4 "RLS: vendor cannot read another partner's orders"; §8; TASK-023, review round 1).
 *
 * One rolled-back transaction per case on a scratch database of a disposable local Postgres 16.
 * Rows are written, and every ownership fact is captured, as the server's superuser — never through
 * a query the policy under test filters — and then each context (`asApp`) runs inside a savepoint
 * that is rolled back, so the role and the `app.*` settings never leak into the next context.
 *
 *  - **T-16**: two partners, each with rows in every partner-scoped table. Each partner sees
 *    exactly its own rows (by the row keys captured as owner) and none of the other's; the other's
 *    `UPDATE`/`DELETE` affect 0 rows; a partner writes only coverage and blackouts, never another
 *    partner's, never money.
 *  - **The partner read path**: `partner_order` / `partner_order_line` show the fulfilment columns
 *    and never the buyer, the token or retail totals; `"order"` itself shows partners nothing; a
 *    declined or timed-out florist sees nothing of the order.
 *  - **Customer scope**: own rows only, ownership cannot be re-pointed, the buyer edits only the
 *    contact fields, and the timeline comes through `customer_order_event`.
 *  - **Deny by default**: no `app.role`, an empty one or an unknown one reads as `public`, and
 *    `public` with a user id reads nothing private.
 *  - **T-17**: as `public`, the reference set as the owner sees it, and nothing private.
 *  - **T-18**: `app_web`'s flags, and what it cannot do.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  CUSTOMER_SCOPED_TABLES,
  CUSTOMER_VIEWS,
  PARTNER_FORBIDDEN_COLUMNS,
  PARTNER_SCOPED_TABLES,
  PARTNER_VIEWS,
  PUBLIC_REFERENCE_TABLES,
} from "../../db/rls.ts";
import { insertPlacedOrder } from "../fixtures/order-state.ts";
import {
  country,
  customer,
  mediaAsset,
  partner,
  recipient,
  unique,
} from "./support/rows.ts";
import {
  asApp,
  pgFailure,
  probeLocalServer,
  rolledBack,
  scratchDatabase,
  type ScratchDatabase,
  type Tx,
} from "./support/scratch-db.ts";

const server = await probeLocalServer();

class Undo extends Error {}

/** Runs `fn` in a savepoint that is always rolled back, after `enter` has set its context. */
async function inSavepoint<T>(
  tx: Tx,
  enter: (sp: Tx) => Promise<unknown>,
  fn: (sp: Tx) => Promise<T>,
): Promise<T> {
  let result: T | undefined;
  try {
    await tx.savepoint(async (sp) => {
      await enter(sp);
      result = await fn(sp);
      throw new Undo();
    });
  } catch (error) {
    if (!(error instanceof Undo)) throw error;
  }
  return result as T;
}

/** Runs `fn` as `app_web` in `context`, inside a savepoint that is always rolled back. */
function as<T>(
  tx: Tx,
  context: Parameters<typeof asApp>[1],
  fn: (sp: Tx) => Promise<T>,
): Promise<T> {
  return inSavepoint(tx, (sp) => asApp(sp, context), fn);
}

const tableSql = (table: string): string =>
  table === "order" ? 'public."order"' : `public.${table}`;

async function countOf(sp: Tx, table: string, where = "true"): Promise<number> {
  const [row] = await sp.unsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM ${tableSql(table)} t WHERE ${where}`,
  );
  return row?.n ?? -1;
}

async function product(tx: Tx): Promise<string> {
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO product (sku, product_type, primary_flower, colour_primary, style, price_tier,
                         substitution_class, freshness_days)
    VALUES (${unique("SKU-")}, 'bouquet', 'rose', 'red', 'classic', 'classic', 'roses', 7)
    RETURNING id`;
  return row?.id ?? "";
}

interface PartnerWorld {
  partnerId: string;
  userId: string;
  orderId: string;
  assignmentId: string;
}

/** A partner with rows in every partner-scoped table, and one order offered to it. */
async function partnerWorld(
  tx: Tx,
  countryId: string,
  productId: string,
): Promise<PartnerWorld> {
  const partnerId = await partner(tx, countryId, "demo");
  const [user] = await tx<{ id: string }[]>`
    INSERT INTO users (email) VALUES (${`${unique("florist")}@example.test`}) RETURNING id`;
  const userId = user?.id ?? "";
  await tx`INSERT INTO partner_member (user_id, partner_id, role) VALUES (${userId}, ${partnerId}, 'owner')`;
  await tx`INSERT INTO partner_translation (partner_id, locale_code, display_name)
           VALUES (${partnerId}, 'en', 'Florist')`;
  const [city] = await tx<{ id: string }[]>`
    INSERT INTO city (country_id) VALUES (${countryId}) RETURNING id`;
  await tx`INSERT INTO partner_coverage (partner_id, city_id, capacity_per_day)
           VALUES (${partnerId}, ${city?.id ?? ""}, 15)`;
  await tx`INSERT INTO partner_blackout (partner_id, date) VALUES (${partnerId}, DATE '2027-01-01')`;
  await tx`INSERT INTO partner_catalog_mapping (partner_id, product_id, partner_payout_minor, currency_code)
           VALUES (${partnerId}, ${productId}, 9000, 'PLN')`;
  const buyer = await customer(tx);
  const orderId = await insertPlacedOrder(tx, {
    customerId: buyer,
    recipientId: await recipient(tx, buyer),
    countryId,
  });
  await tx`INSERT INTO order_line (order_id, kind, product_id, qty, unit_retail_minor, currency_code,
                                   vat_rate_bp, partner_payout_minor, payout_currency_code)
           VALUES (${orderId}, 'product', ${productId}, 1, 18900, 'PLN', 800, 9000, 'PLN')`;
  const [assignment] = await tx<{ id: string }[]>`
    INSERT INTO order_assignment (order_id, partner_id, sla_expires_at, attempt)
    VALUES (${orderId}, ${partnerId}, now() + interval '1 hour', 1) RETURNING id`;
  await tx`INSERT INTO delivery_proof (order_id, media_asset_id, uploaded_by)
           VALUES (${orderId}, ${await mediaAsset(tx)}, 'partner:test')`;
  await tx`INSERT INTO substitution_note (order_id, proposed_by, proposal_md)
           VALUES (${orderId}, 'partner:test', 'Peonies instead of roses')`;
  const [payout] = await tx<{ id: string }[]>`
    INSERT INTO payout (partner_id, period_start, period_end, total_minor, currency_code)
    VALUES (${partnerId}, DATE '2027-02-01', DATE '2027-02-07', 9000, 'PLN') RETURNING id`;
  await tx`INSERT INTO payout_line (payout_id, order_id, amount_minor, currency_code, kind)
           VALUES (${payout?.id ?? ""}, ${orderId}, 9000, 'PLN', 'order')`;
  return { partnerId, userId, orderId, assignmentId: assignment?.id ?? "" };
}

type PartnerTable = keyof typeof PARTNER_SCOPED_TABLES;

/** Who owns a row, read as the superuser only (this is the fact the policy must reproduce). */
const OWNER: Record<PartnerTable, string> = {
  fulfillment_partner: "t.id",
  partner_translation: "t.partner_id",
  partner_member: "t.partner_id",
  partner_coverage: "t.partner_id",
  partner_blackout: "t.partner_id",
  partner_catalog_mapping: "t.partner_id",
  payout: "t.partner_id",
  payout_line:
    "(SELECT p.partner_id FROM public.payout p WHERE p.id = t.payout_id)",
  order_assignment: "t.partner_id",
  delivery_proof:
    "(SELECT a.partner_id FROM public.order_assignment a WHERE a.order_id = t.order_id)",
  substitution_note:
    "(SELECT a.partner_id FROM public.order_assignment a WHERE a.order_id = t.order_id)",
};

/** A key that names one row of each table, stable within the transaction. */
const KEY: Record<PartnerTable, string> = {
  fulfillment_partner: "t.id::text",
  partner_translation: "t.partner_id::text || '/' || t.locale_code",
  partner_member: "t.user_id::text || '/' || t.partner_id::text",
  partner_coverage: "t.id::text",
  partner_blackout: "t.partner_id::text || '/' || t.date::text",
  partner_catalog_mapping: "t.id::text",
  payout: "t.id::text",
  payout_line: "t.id::text",
  order_assignment: "t.id::text",
  delivery_proof: "t.id::text",
  substitution_note: "t.id::text",
};

/** A no-op column per table for the `UPDATE` probes. */
const TOUCH: Record<PartnerTable, string> = {
  fulfillment_partner: "legal_name = legal_name",
  partner_translation: "display_name = display_name",
  partner_member: "role = role",
  partner_coverage: "capacity_per_day = capacity_per_day",
  partner_blackout: "reason = reason",
  partner_catalog_mapping: "can_fulfil = can_fulfil",
  payout: "total_minor = total_minor",
  payout_line: "note = note",
  order_assignment: "reason = reason",
  delivery_proof: "approved = approved",
  substitution_note: "proposal_md = proposal_md",
};

async function keysOf(
  tx: Tx,
  table: PartnerTable,
  partnerId: string,
): Promise<string[]> {
  const rows = await tx.unsafe<{ k: string }[]>(
    `SELECT ${KEY[table]} AS k FROM ${tableSql(table)} t WHERE ${OWNER[table]} = $1`,
    [partnerId],
  );
  return rows.map((row) => row.k);
}

describe.skipIf(server.url === undefined)(
  `migration 0011 applied — RLS as app_web${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "rls");
    }, 300_000);
    afterAll(async () => {
      await scratch.drop();
    });

    it("T-16 / AC-16: each partner sees exactly its own rows, by the keys captured as owner, and cannot touch the other's", async () => {
      const report = await rolledBack(scratch.sql, async (tx) => {
        const countryId = await country(tx);
        const productId = await product(tx);
        const a = await partnerWorld(tx, countryId, productId);
        const b = await partnerWorld(tx, countryId, productId);
        const out: Record<string, Record<string, number>> = {};
        for (const table of Object.keys(
          PARTNER_SCOPED_TABLES,
        ) as PartnerTable[]) {
          const keysA = await keysOf(tx, table, a.partnerId);
          const keysB = await keysOf(tx, table, b.partnerId);
          const hits = (sp: Tx, keys: string[]) =>
            sp
              .unsafe<{ n: number }[]>(
                `SELECT count(*)::int AS n FROM ${tableSql(table)} t WHERE ${KEY[table]} = ANY($1::text[])`,
                [keys],
              )
              .then((rows) => rows[0]?.n ?? -1);
          const change = (sp: Tx, verb: "UPDATE" | "DELETE", keys: string[]) =>
            sp.unsafe(
              verb === "UPDATE"
                ? `UPDATE ${tableSql(table)} t SET ${TOUCH[table]} WHERE ${KEY[table]} = ANY($1::text[])`
                : `DELETE FROM ${tableSql(table)} t WHERE ${KEY[table]} = ANY($1::text[])`,
              [keys],
            );
          const asA = await as(
            tx,
            { role: "partner", partnerIds: [a.partnerId] },
            async (sp) => ({
              own: await hits(sp, keysA),
              other: await hits(sp, keysB),
              all: await countOf(sp, table),
              ownUpdate: (await change(sp, "UPDATE", keysA)).count,
            }),
          );
          const asB = await as(
            tx,
            { role: "partner", partnerIds: [b.partnerId] },
            async (sp) => ({
              own: await hits(sp, keysB),
              other: await hits(sp, keysA),
              updateA: (await change(sp, "UPDATE", keysA)).count,
              deleteA: (await change(sp, "DELETE", keysA)).count,
            }),
          );
          out[table] = {
            rowsOfA: keysA.length,
            rowsOfB: keysB.length,
            aSeesA: asA.own,
            aSeesB: asA.other,
            aSeesInAll: asA.all,
            aUpdatesOwn: asA.ownUpdate,
            bSeesB: asB.own,
            bSeesA: asB.other,
            bUpdatesA: asB.updateA,
            bDeletesA: asB.deleteA,
            rowsOfAAfter: (await keysOf(tx, table, a.partnerId)).length,
          };
        }
        return out;
      });
      for (const [table, mode] of Object.entries(PARTNER_SCOPED_TABLES)) {
        const row = report[table];
        const n = row?.rowsOfA ?? 0;
        expect(n, table).toBeGreaterThan(0);
        expect(row, table).toEqual({
          rowsOfA: n,
          rowsOfB: n,
          aSeesA: n,
          aSeesB: 0,
          aSeesInAll: n,
          aUpdatesOwn: mode === "write" ? n : 0,
          bSeesB: n,
          bSeesA: 0,
          bUpdatesA: 0,
          bDeletesA: 0,
          rowsOfAAfter: n,
        });
      }
    });

    it("§8 / item 1: partners read orders only through the views, never the buyer, the token or retail totals", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const countryId = await country(tx);
        const productId = await product(tx);
        const a = await partnerWorld(tx, countryId, productId);
        const b = await partnerWorld(tx, countryId, productId);
        const viewColumns = await tx<
          { table_name: string; column_name: string }[]
        >`
          SELECT table_name, column_name FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name IN ('partner_order', 'partner_order_line', 'customer_order_event')
          ORDER BY table_name, ordinal_position`;
        const seen = await as(
          tx,
          { role: "partner", partnerIds: [a.partnerId] },
          async (sp) => ({
            orderRows: await countOf(sp, "order"),
            orderLeak: await countOf(
              sp,
              "order",
              "t.buyer_snapshot IS NOT NULL OR t.customer_id IS NOT NULL OR t.public_token IS NOT NULL",
            ),
            lineRows: await countOf(sp, "order_line"),
            viewOrders: (
              await sp<{ id: string }[]>`SELECT id FROM partner_order`
            ).map((r) => r.id),
            viewLines: (
              await sp<
                { order_id: string }[]
              >`SELECT order_id FROM partner_order_line`
            ).map((r) => r.order_id),
            buyerColumn: await pgFailure(
              sp,
              (inner) => inner`SELECT buyer_snapshot FROM partner_order`,
            ),
            writeThroughView: await pgFailure(
              sp,
              (inner) => inner`UPDATE partner_order SET delivery_window = 'pm'`,
            ),
          }),
        );
        return { a, b, viewColumns, seen };
      });
      const columns = (table: string) =>
        result.viewColumns
          .filter((c) => c.table_name === table)
          .map((c) => c.column_name);
      expect(columns("partner_order")).toEqual([
        ...PARTNER_VIEWS.partner_order,
      ]);
      expect(columns("partner_order_line")).toEqual([
        ...PARTNER_VIEWS.partner_order_line,
      ]);
      expect(columns("customer_order_event")).toEqual([
        ...CUSTOMER_VIEWS.customer_order_event,
      ]);
      for (const forbidden of PARTNER_FORBIDDEN_COLUMNS) {
        expect(columns("partner_order"), forbidden).not.toContain(forbidden);
        expect(columns("partner_order_line"), forbidden).not.toContain(
          forbidden,
        );
      }
      expect(result.seen.orderRows).toBe(0);
      expect(result.seen.orderLeak).toBe(0);
      expect(result.seen.lineRows).toBe(0);
      expect(result.seen.viewOrders).toEqual([result.a.orderId]);
      expect(result.seen.viewLines).toEqual([result.a.orderId]);
      expect(result.seen.buyerColumn.code).toBe("42703");
      expect(result.seen.writeThroughView.code).toBe("42501");
    });

    it("item 1: a florist whose offer was declined or timed out reads nothing of the order; an accepted one still does", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const countryId = await country(tx);
        const productId = await product(tx);
        const a = await partnerWorld(tx, countryId, productId);
        const probe = () =>
          as(
            tx,
            { role: "partner", partnerIds: [a.partnerId] },
            async (sp) => ({
              order: (
                await sp<
                  { n: number }[]
                >`SELECT count(*)::int AS n FROM partner_order`
              )[0]?.n,
              lines: (
                await sp<
                  { n: number }[]
                >`SELECT count(*)::int AS n FROM partner_order_line`
              )[0]?.n,
              proof: await countOf(sp, "delivery_proof"),
              note: await countOf(sp, "substitution_note"),
              assignment: await countOf(sp, "order_assignment"),
            }),
          );
        const out: Record<string, unknown> = { open: await probe() };
        for (const response of ["decline", "timeout", "accept"] as const) {
          await tx`UPDATE order_assignment SET response = ${response}, responded_at = now()
                   WHERE id = ${a.assignmentId}`;
          out[response] = await probe();
        }
        return out;
      });
      const visible = { order: 1, lines: 1, proof: 1, note: 1, assignment: 1 };
      const gone = { order: 0, lines: 0, proof: 0, note: 0, assignment: 1 };
      expect(result).toEqual({
        open: visible,
        decline: gone,
        timeout: gone,
        accept: visible,
      });
    });

    it("item 2 / H3: a partner writes only its own coverage and blackouts — never another partner's, never its payout", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const countryId = await country(tx);
        const productId = await product(tx);
        const a = await partnerWorld(tx, countryId, productId);
        const b = await partnerWorld(tx, countryId, productId);
        const ctx = { role: "partner", partnerIds: [a.partnerId] };
        const out = {
          raisePayout: await as(
            tx,
            ctx,
            async (sp) =>
              (
                await sp`UPDATE partner_catalog_mapping SET partner_payout_minor = 999999
                      WHERE partner_id = ${a.partnerId}`
              ).count,
          ),
          toggleFulfil: await as(
            tx,
            ctx,
            async (sp) =>
              (
                await sp`UPDATE partner_catalog_mapping SET can_fulfil = false
                      WHERE partner_id = ${a.partnerId}`
              ).count,
          ),
          insertMapping: await as(tx, ctx, (sp) =>
            pgFailure(
              sp,
              (inner) =>
                inner`INSERT INTO partner_catalog_mapping (partner_id, product_id, tier_key, partner_payout_minor, currency_code)
                    VALUES (${a.partnerId}, ${productId}, 'large', 1, 'PLN')`,
            ),
          ),
          ownCoverage: await as(
            tx,
            ctx,
            async (sp) =>
              (
                await sp`UPDATE partner_coverage SET capacity_per_day = 10
                      WHERE partner_id = ${a.partnerId}`
              ).count,
          ),
          coverageToB: await as(tx, ctx, (sp) =>
            pgFailure(
              sp,
              (inner) =>
                inner`UPDATE partner_coverage SET partner_id = ${b.partnerId} WHERE partner_id = ${a.partnerId}`,
            ),
          ),
          insertCoverageForB: await as(tx, ctx, (sp) =>
            pgFailure(sp, async (inner) => {
              const [city] = await inner<{ id: string }[]>`
                SELECT city_id AS id FROM partner_coverage WHERE partner_id = ${a.partnerId}`;
              await inner`INSERT INTO partner_coverage (partner_id, city_id, capacity_per_day)
                          VALUES (${b.partnerId}, ${city?.id ?? ""}, 5)`;
            }),
          ),
          blackoutToB: await as(tx, ctx, (sp) =>
            pgFailure(
              sp,
              (inner) =>
                inner`UPDATE partner_blackout SET partner_id = ${b.partnerId} WHERE partner_id = ${a.partnerId}`,
            ),
          ),
          insertBlackoutForB: await as(tx, ctx, (sp) =>
            pgFailure(
              sp,
              (inner) =>
                inner`INSERT INTO partner_blackout (partner_id, date) VALUES (${b.partnerId}, DATE '2027-03-01')`,
            ),
          ),
          customerSeesPartners: await as(
            tx,
            { role: "customer", partnerIds: [a.partnerId] },
            (sp) => countOf(sp, "fulfillment_partner"),
          ),
        };
        const [payout] = await tx<{ minor: string }[]>`
          SELECT partner_payout_minor::text AS minor FROM partner_catalog_mapping
          WHERE partner_id = ${a.partnerId}`;
        return { ...out, payoutAfter: payout?.minor };
      });
      expect(result.raisePayout).toBe(0);
      expect(result.toggleFulfil).toBe(0);
      expect(result.payoutAfter).toBe("9000");
      expect(result.insertMapping.code).toBe("42501");
      expect(result.ownCoverage).toBe(1);
      for (const key of [
        "coverageToB",
        "insertCoverageForB",
        "blackoutToB",
        "insertBlackoutForB",
      ] as const) {
        expect(result[key].code, key).toBe("42501");
      }
      expect(result.customerSeesPartners).toBe(0);
    });

    it("customer scope: a buyer reads their own records only, cannot re-point ownership, and edits only contact fields", async () => {
      const report = await rolledBack(scratch.sql, async (tx) => {
        const countryId = await country(tx);
        const users = await tx<{ id: string }[]>`
          INSERT INTO users (email) VALUES ('buyer-a@example.test'), ('buyer-b@example.test') RETURNING id`;
        const ua = users[0]?.id ?? "";
        const ub = users[1]?.id ?? "";
        const worlds: {
          customerId: string;
          recipientId: string;
          orderId: string;
        }[] = [];
        for (const userId of [ua, ub]) {
          const customerId = await customer(tx, userId);
          const recipientId = await recipient(tx, customerId);
          await tx`INSERT INTO address (customer_id, kind, lines, city, country_iso2)
                   VALUES (${customerId}, 'billing', '{"1 Test Street"}', 'Testtown', 'GB')`;
          await tx`INSERT INTO recipient_address (recipient_id, lines, city, country_id)
                   VALUES (${recipientId}, '{"2 Test Street"}', 'Warszawa', ${countryId})`;
          const orderId = await insertPlacedOrder(tx, {
            customerId,
            recipientId,
            countryId,
          });
          await tx`INSERT INTO order_line (order_id, kind, qty, unit_retail_minor, currency_code, vat_rate_bp)
                   VALUES (${orderId}, 'surcharge', 1, 500, 'PLN', 800)`;
          await tx`INSERT INTO delivery_proof (order_id, media_asset_id, uploaded_by)
                   VALUES (${orderId}, ${await mediaAsset(tx)}, 'partner:test')`;
          await tx`INSERT INTO substitution_note (order_id, proposed_by, proposal_md)
                   VALUES (${orderId}, 'partner:test', 'Tulips')`;
          const [payment] = await tx<{ id: string }[]>`
            INSERT INTO payment (order_id, provider, provider_ref, status, method, amount_minor, currency_code, livemode)
            VALUES (${orderId}, 'stripe', ${unique("pi_")}, 'authorised', 'card', 18900, 'PLN', false) RETURNING id`;
          await tx`INSERT INTO refund (payment_id, provider_ref, amount_minor, currency_code, reason, status,
                                       requested_by, succeeded_at)
                   VALUES (${payment?.id ?? ""}, ${unique("re_")}, 500, 'PLN', 'addon_missing', 'succeeded',
                           'system:payments', now())`;
          worlds.push({ customerId, recipientId, orderId });
        }
        const [mine, theirs] = worlds as [
          (typeof worlds)[number],
          (typeof worlds)[number],
        ];
        const ctx = { role: "customer", userId: ua };
        const out: Record<string, { own: number; total: number }> = {};
        for (const table of Object.keys(CUSTOMER_SCOPED_TABLES)) {
          out[table] = {
            total: await countOf(tx, table),
            own: await as(tx, ctx, (sp) => countOf(sp, table)),
          };
        }
        const refused = (fn: (sp: Tx) => Promise<unknown>) =>
          as(tx, ctx, (sp) => pgFailure(sp, fn)).then(
            (f) => f.raised ?? f.code,
          );
        // HOLE 2 (a), review r2: the column guard is the buyer's alone; staff correct an email
        // and the retention sweep (`system`) redacts, so both still write every guarded column.
        const staffEdit = (role: "admin" | "system") =>
          as(
            tx,
            { role },
            async (sp) =>
              (
                await sp`UPDATE customer SET email_normalised = 'corrected@example.test',
                     marketing_consent = true, redacted = true, redacted_at = now(),
                     created_at = created_at - interval '1 day'
                   WHERE id = ${mine.customerId}`
              ).count,
          );
        const edits = {
          rawEvents: await as(tx, ctx, (sp) => countOf(sp, "order_event")),
          timeline: await as(tx, ctx, async (sp) =>
            (
              await sp<
                { order_id: string }[]
              >`SELECT order_id FROM customer_order_event`
            ).map((r) => r.order_id),
          ),
          ownName: await as(
            tx,
            ctx,
            async (sp) =>
              (
                await sp`UPDATE customer SET name = 'Renamed' WHERE id = ${mine.customerId}`
              ).count,
          ),
          otherName: await as(
            tx,
            ctx,
            async (sp) =>
              (
                await sp`UPDATE customer SET name = 'Renamed' WHERE id = ${theirs.customerId}`
              ).count,
          ),
          repointUser: await refused(
            (sp) =>
              sp`UPDATE customer SET user_id = ${ub} WHERE id = ${mine.customerId}`,
          ),
          // No WHERE: nothing reads a column, so no SELECT policy re-checks the new row and
          // only the UPDATE policy's WITH CHECK stands between the buyer and another account.
          repointUserBare: await refused(
            (sp) => sp`UPDATE customer SET user_id = ${ub}`,
          ),
          recipientForOther: await refused(
            (sp) =>
              sp`INSERT INTO recipient (customer_id, full_name, phone_e164)
               VALUES (${theirs.customerId}, 'Planted', '+48500000001')`,
          ),
          recipientAddressForOther: await refused(
            (sp) =>
              sp`INSERT INTO recipient_address (recipient_id, lines, city, country_id)
               VALUES (${theirs.recipientId}, '{"4 Test Street"}', 'Warszawa', ${countryId})`,
          ),
          consent: await refused(
            (sp) =>
              sp`UPDATE customer SET marketing_consent = true WHERE id = ${mine.customerId}`,
          ),
          redact: await refused(
            (sp) =>
              sp`UPDATE customer SET redacted = true, redacted_at = now() WHERE id = ${mine.customerId}`,
          ),
          email: await refused(
            (sp) =>
              sp`UPDATE customer SET email_normalised = 'other@example.test' WHERE id = ${mine.customerId}`,
          ),
          // HOLE 2 (b): `created_at` starts the retention clock (spec 002 §8). A new `id` would
          // also break the keys into it, so `raised` (not 23503) is what names the guard.
          createdAt: await refused(
            (sp) =>
              sp`UPDATE customer SET created_at = created_at - interval '3 years' WHERE id = ${mine.customerId}`,
          ),
          id: await refused(
            (sp) =>
              sp`UPDATE customer SET id = gen_random_uuid() WHERE id = ${mine.customerId}`,
          ),
          adminEdits: await staffEdit("admin"),
          systemEdits: await staffEdit("system"),
          addressForOther: await refused(
            (sp) =>
              sp`INSERT INTO address (customer_id, kind, lines, city, country_iso2)
               VALUES (${theirs.customerId}, 'billing', '{"3 Test Street"}', 'Testtown', 'GB')`,
          ),
          repointAddress: await refused(
            (sp) =>
              sp`UPDATE address SET customer_id = ${theirs.customerId} WHERE customer_id = ${mine.customerId}`,
          ),
          repointRecipient: await refused(
            (sp) =>
              sp`UPDATE recipient SET customer_id = ${theirs.customerId} WHERE id = ${mine.recipientId}`,
          ),
          repointRecipientAddress: await refused(
            (sp) =>
              sp`UPDATE recipient_address SET recipient_id = ${theirs.recipientId}
               WHERE recipient_id = ${mine.recipientId}`,
          ),
          ownOrder: await as(
            tx,
            ctx,
            async (sp) =>
              (
                await sp`UPDATE "order" SET delivery_window = 'am' WHERE id = ${mine.orderId}`
              ).count,
          ),
          ownUser: await as(tx, ctx, (sp) => countOf(sp, "users")),
        };
        return { out, edits, mine };
      });
      for (const [table, counts] of Object.entries(report.out)) {
        expect(counts, table).toEqual({ total: 2, own: 1 });
      }
      expect(report.edits).toEqual({
        rawEvents: 0,
        timeline: [report.mine.orderId],
        ownName: 1,
        otherName: 0,
        repointUser: "42501",
        repointUserBare: "42501",
        recipientForOther: "42501",
        recipientAddressForOther: "42501",
        consent: "CUSTOMER_COLUMN_READ_ONLY",
        redact: "CUSTOMER_COLUMN_READ_ONLY",
        email: "CUSTOMER_COLUMN_READ_ONLY",
        createdAt: "CUSTOMER_COLUMN_READ_ONLY",
        id: "CUSTOMER_COLUMN_READ_ONLY",
        adminEdits: 1,
        systemEdits: 1,
        addressForOther: "42501",
        repointAddress: "42501",
        repointRecipient: "42501",
        repointRecipientAddress: "42501",
        ownOrder: 0,
        ownUser: 1,
      });
    });

    it("item 4 / H3: no app.role, an empty one or an unknown one reads as public, and public with a user id reads nothing private", async () => {
      const PRIVATE = [
        "order",
        "customer",
        "payment",
        "webhook_inbox",
        "users",
        "address",
        "partner_member",
      ];
      const result = await rolledBack(scratch.sql, async (tx) => {
        const countryId = await country(tx);
        const [user] = await tx<{ id: string }[]>`
          INSERT INTO users (email) VALUES ('buyer@example.test') RETURNING id`;
        const userId = user?.id ?? "";
        const customerId = await customer(tx, userId);
        await tx`INSERT INTO address (customer_id, kind, lines, city, country_iso2)
                 VALUES (${customerId}, 'billing', '{"1 Test Street"}', 'Testtown', 'GB')`;
        const orderId = await insertPlacedOrder(tx, {
          customerId,
          recipientId: await recipient(tx, customerId),
          countryId,
        });
        await tx`INSERT INTO payment (order_id, provider, provider_ref, status, method, amount_minor, currency_code, livemode)
                 VALUES (${orderId}, 'stripe', 'pi_unset', 'authorised', 'card', 18900, 'PLN', false)`;
        await tx`INSERT INTO webhook_inbox (provider, event_id, signature_verified, raw, livemode, event_type)
                 VALUES ('stripe', 'evt_unset', true, '{}', false, 'payment_intent.succeeded')`;
        const p = await partner(tx, countryId);
        await tx`INSERT INTO partner_member (user_id, partner_id, role) VALUES (${userId}, ${p}, 'owner')`;
        const owner: Record<string, number> = {};
        for (const table of PRIVATE) owner[table] = await countOf(tx, table);
        const read = (sp: Tx) =>
          Promise.all(
            [...PRIVATE, "country"].map((table) => countOf(sp, table)),
          ).then((counts) =>
            Object.fromEntries(
              [...PRIVATE, "country"].map((t, i) => [t, counts[i]]),
            ),
          );
        return {
          owner,
          // Nothing set at all: only the role switch.
          unset: await inSavepoint(
            tx,
            (sp) => sp.unsafe("SET LOCAL ROLE app_web"),
            read,
          ),
          empty: await inSavepoint(
            tx,
            async (sp) => {
              await sp`SELECT set_config('app.role', '', true)`;
              await sp`SELECT set_config('app.user_id', ${userId}, true)`;
              await sp`SELECT set_config('app.partner_ids', ${p}, true)`;
              await sp.unsafe("SET LOCAL ROLE app_web");
            },
            read,
          ),
          unknown: await as(
            tx,
            { role: "root", userId, partnerIds: [p] },
            read,
          ),
          publicWithUser: await as(
            tx,
            { role: "public", userId, partnerIds: [p] },
            read,
          ),
        };
      });
      for (const table of PRIVATE) {
        expect(
          result.owner[table],
          `${table} has rows to hide`,
        ).toBeGreaterThan(0);
      }
      const expected = {
        ...Object.fromEntries(PRIVATE.map((t) => [t, 0])),
        country: 1,
      };
      expect(result.unset).toEqual(expected);
      expect(result.empty).toEqual(expected);
      expect(result.unknown).toEqual(expected);
      expect(result.publicWithUser).toEqual(expected);
    });

    it("T-17 / AC-17: public reads the reference set as fully as the owner sees it, and nothing private", async () => {
      const report = await rolledBack(scratch.sql, async (tx) => {
        const countryId = await country(tx);
        await tx`INSERT INTO country_translation (country_id, locale_code, name, slug)
                 VALUES (${countryId}, 'en', 'Poland', 'poland')`;
        await tx`INSERT INTO country_locale_content (country_id, locale_code, state, h1, intro_md)
                 VALUES (${countryId}, 'en', 'guide', 'Flowers to Poland', 'Intro')`;
        await tx`INSERT INTO city (country_id) VALUES (${countryId})`;
        const productId = await product(tx);
        await tx`INSERT INTO product_translation (product_id, locale_code, name, slug)
                 VALUES (${productId}, 'en', 'Red roses', 'red-roses')`;
        await tx`INSERT INTO country_price (product_id, country_id, retail_minor, currency_code, vat_rate_bp, active_from)
                 VALUES (${productId}, ${countryId}, 18900, 'PLN', 800, DATE '2026-10-01')`;
        const [category] = await tx<{ id: string }[]>`
          INSERT INTO category (key, kind) VALUES ('bouquets', 'productType') RETURNING id`;
        await tx`INSERT INTO category_translation (category_id, locale_code, name, slug)
                 VALUES (${category?.id ?? ""}, 'en', 'Bouquets', 'bouquets')`;
        const [occasion] = await tx<{ id: string }[]>`
          INSERT INTO occasion (key, kind) VALUES ('birthday', 'evergreen') RETURNING id`;
        await tx`INSERT INTO occasion_translation (occasion_id, locale_code, name, slug)
                 VALUES (${occasion?.id ?? ""}, 'en', 'Birthday', 'birthday')`;
        await mediaAsset(tx, { kind: "product", visibility: "public" });
        await mediaAsset(tx, { kind: "product", visibility: "private" });
        await tx`INSERT INTO review (source, rating, moderation_status, published_at)
                 VALUES ('internal', 5, 'published', now()), ('internal', 1, 'pending', NULL)`;
        const [someone] = await tx<{ id: string }[]>`
          INSERT INTO users (email) VALUES ('someone@example.test') RETURNING id`;
        const someoneId = someone?.id ?? "";
        await tx`INSERT INTO sessions (session_token, user_id, expires)
                 VALUES ('t17-session', ${someoneId}, now() + interval '1 day')`;
        await tx`INSERT INTO accounts (user_id, type, provider, provider_account_id)
                 VALUES (${someoneId}, 'email', 'resend', 'someone@example.test')`;
        await tx`INSERT INTO verification_tokens (identifier, token, expires)
                 VALUES ('someone@example.test', 'hashed', now() + interval '1 hour')`;
        const world = await partnerWorld(tx, countryId, productId);
        await tx`INSERT INTO payment (order_id, provider, provider_ref, status, method, amount_minor, currency_code, livemode)
                 VALUES (${world.orderId}, 'stripe', 'pi_t17', 'authorised', 'card', 18900, 'PLN', false)`;
        await tx`INSERT INTO outbox (event_id, order_id, targets, payload, payload_version)
                 VALUES (gen_random_uuid(), ${world.orderId}, '{crm}', '{}', 1)`;
        await tx`INSERT INTO audit_log (actor_label, action, entity_table, entity_id, after, request_id)
                 VALUES ('founder', 'country.status_changed', 'country', 'PL', '{"status": "demo"}', 'req-t17')`;
        await tx`INSERT INTO webhook_inbox (provider, event_id, signature_verified, raw, livemode, event_type)
                 VALUES ('stripe', 'evt_t17', true, '{}', false, 'payment_intent.succeeded')`;
        await tx`INSERT INTO consent_log (subject_kind, subject_ref, choices, policy_version, occurred_at)
                 VALUES ('customer', gen_random_uuid(), '{"analytics": false}', 1, now())`;
        await tx`INSERT INTO partner_application (business_name, city, language_code)
                 VALUES ('Applicant Florist', 'Kraków', 'pl')`;

        const PRIVATE = [
          "customer",
          "recipient",
          "order",
          "order_line",
          "order_event",
          "payment",
          "outbox",
          "audit_log",
          "users",
          "sessions",
          "accounts",
          "verification_tokens",
          "webhook_inbox",
          "consent_log",
          "partner_application",
          "feature_flag",
          "retention_policy",
          ...Object.keys(PARTNER_SCOPED_TABLES),
        ];
        const owner: Record<string, number> = {};
        for (const table of [...PUBLIC_REFERENCE_TABLES, ...PRIVATE]) {
          owner[table] = await countOf(tx, table);
        }
        const seen = await as(tx, { role: "public" }, async (sp) => {
          const out: Record<string, number> = {};
          for (const table of [...PUBLIC_REFERENCE_TABLES, ...PRIVATE]) {
            out[table] = await countOf(sp, table);
          }
          out.media_asset_private = await countOf(
            sp,
            "media_asset",
            "t.visibility <> 'public'",
          );
          out.media_asset = await countOf(sp, "media_asset");
          out.review_unpublished = await countOf(
            sp,
            "review",
            "t.moderation_status <> 'published'",
          );
          out.review = await countOf(sp, "review");
          out.partner_order =
            (
              await sp<
                { n: number }[]
              >`SELECT count(*)::int AS n FROM partner_order`
            )[0]?.n ?? -1;
          out.customer_order_event =
            (
              await sp<
                { n: number }[]
              >`SELECT count(*)::int AS n FROM customer_order_event`
            )[0]?.n ?? -1;
          return out;
        });
        return { owner, seen, PRIVATE };
      });
      for (const table of [
        "country",
        "country_translation",
        "country_locale_content",
        "city",
        "product",
        "product_translation",
        "country_price",
        "category",
        "category_translation",
        "occasion",
        "occasion_translation",
        "order_status",
        "order_transition",
      ]) {
        expect(report.owner[table], table).toBeGreaterThan(0);
      }
      for (const table of PUBLIC_REFERENCE_TABLES) {
        expect(report.seen[table], table).toBe(report.owner[table]);
      }
      for (const table of report.PRIVATE) {
        expect(
          report.owner[table],
          `${table} has rows to hide`,
        ).toBeGreaterThan(0);
        expect(report.seen[table], table).toBe(0);
      }
      expect(report.seen.media_asset).toBe(1);
      expect(report.seen.media_asset_private).toBe(0);
      expect(report.seen.review).toBe(1);
      expect(report.seen.review_unpublished).toBe(0);
      expect(report.seen.partner_order).toBe(0);
      expect(report.seen.customer_order_event).toBe(0);
    });

    it("T-18 / AC-18: app_web has no escape hatch", async () => {
      const [flags] = await scratch.sql<
        { rolbypassrls: boolean; rolsuper: boolean }[]
      >`
        SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = 'app_web'`;
      expect(flags).toEqual({ rolbypassrls: false, rolsuper: false });
      const result = await rolledBack(scratch.sql, async (tx) => {
        const context = { role: "admin" };
        const failure = (statement: string) =>
          as(tx, context, (sp) =>
            pgFailure(sp, (inner) => inner.unsafe(statement)),
          );
        // The connecting role (review 71): a login that holds app_web and nothing else, the
        // shape a dedicated runtime login has. Rolled back with the transaction.
        await tx.unsafe(
          "CREATE ROLE fo_it_runtime_login LOGIN NOSUPERUSER NOBYPASSRLS IN ROLE app_web",
        );
        const login = await (async () => {
          let out: {
            escape?: { code: string };
            afterReset?: boolean | undefined;
          } = {};
          try {
            await tx.savepoint(async (sp) => {
              await sp.unsafe("SET SESSION AUTHORIZATION fo_it_runtime_login");
              await asApp(sp, context);
              const escape = await pgFailure(sp, (inner) =>
                inner.unsafe("SET ROLE app_owner"),
              );
              await sp.unsafe("RESET ROLE");
              const [row] = await sp<{ bypass: boolean }[]>`
                SELECT rolbypassrls AS bypass FROM pg_roles WHERE rolname = current_user`;
              out = { escape, afterReset: row?.bypass };
              throw new Undo();
            });
          } catch (error) {
            if (!(error instanceof Undo)) throw error;
          }
          return out;
        })();
        return {
          current: await as(
            tx,
            context,
            async (sp) =>
              (
                await sp<{ bypass: boolean }[]>`
              SELECT rolbypassrls AS bypass FROM pg_roles WHERE rolname = current_user`
              )[0]?.bypass,
          ),
          create: await failure("CREATE TABLE public.escape (id int)"),
          alter: await failure(
            'ALTER TABLE public."order" DISABLE ROW LEVEL SECURITY',
          ),
          truncate: await failure("TRUNCATE public.audit_log"),
          login,
        };
      });
      expect(result.current).toBe(false);
      expect(result.create.code).toBe("42501");
      expect(result.alter.code).toBe("42501");
      expect(result.truncate.code).toBe("42501");
      expect(result.login.escape?.code).toBe("42501");
      expect(result.login.afterReset).toBe(false);
    });

    it("T-18 / AC-18 (last clause, TASK-024): app_web cannot read pgboss internals it was not granted", async () => {
      // `0012` grants `app_web` USAGE on schema `pgboss` and nothing inside it. The census is read
      // from the catalogue, so a table pg-boss adds in a later schema version is covered too.
      const tables = (
        await scratch.sql<{ name: string }[]>`
          SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'pgboss' AND c.relkind IN ('r', 'p') ORDER BY 1`
      ).map((row) => row.name);
      expect(tables).toEqual(
        expect.arrayContaining(["job", "queue", "version"]),
      );
      const [grants] = await scratch.sql<{ usage: boolean; create: boolean }[]>`
        SELECT has_schema_privilege('app_web', 'pgboss', 'USAGE') AS usage,
               has_schema_privilege('app_web', 'pgboss', 'CREATE') AS create`;
      expect(grants).toEqual({ usage: true, create: false });
      // EXECUTE on every pgboss function is revoked, read from the catalogue (breaker hole 2 / review
      // N2, PR 224): `create_queue` failing below is also explained by its own INSERT, so the
      // revoke needs this assertion of its own.
      const functions = await scratch.sql<{ name: string; execute: boolean }[]>`
        SELECT p.oid::regprocedure::text AS name,
               has_function_privilege('app_web', p.oid, 'EXECUTE') AS execute
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'pgboss' ORDER BY 1`;
      expect(functions.length).toBeGreaterThan(0);
      expect(functions.filter((f) => f.execute).map((f) => f.name)).toEqual([]);

      const result = await rolledBack(scratch.sql, async (tx) => {
        const context = { role: "admin" };
        const failure = (statement: string) =>
          as(tx, context, (sp) =>
            pgFailure(sp, (inner) => inner.unsafe(statement)),
          );
        const reads: Record<string, string> = {};
        for (const table of tables) {
          reads[table] = (
            await failure(`SELECT 1 FROM pgboss.${table} LIMIT 1`)
          ).code;
        }
        return {
          reads,
          insert: await failure(
            "INSERT INTO pgboss.job (name, data) VALUES ('retention.sweep', '{}')",
          ),
          createQueue: await failure(
            "SELECT pgboss.create_queue('escape', '{}'::jsonb)",
          ),
          create: await failure("CREATE TABLE pgboss.escape (id int)"),
        };
      });
      for (const table of tables) {
        expect(result.reads[table], `SELECT on pgboss.${table}`).toBe("42501");
      }
      expect(result.insert.code).toBe("42501");
      expect(result.createQueue.code).toBe("42501");
      expect(result.create.code).toBe("42501");
    });
  },
);
