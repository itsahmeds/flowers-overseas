/**
 * Migration `0011` as `app_web` sees it (spec 002 AC-16, AC-17, AC-18; T-16, T-17, T-18; `plan/12`
 * §4 "RLS: vendor cannot read another partner's orders"; TASK-023).
 *
 * One rolled-back transaction per case on a scratch database of a disposable local Postgres 16.
 * Rows are written as the server's superuser, then each context (`asApp`) runs inside a savepoint
 * that is rolled back, so the role and the `app.*` settings never leak into the next context.
 *
 *  - **T-16**: two partners, A and B, each with a row in every partner-scoped table. As A: A's rows
 *    and none of B's; as B: the mirror image; `UPDATE` and `DELETE` of A's rows as B affect 0
 *    rows; A may change A's own configuration, and nothing in its order or money records.
 *  - **T-17**: as `public`, the reference set reads as fully as the superuser sees it, `media_asset`
 *    only public, `review` only published, and the private set returns 0 rows.
 *  - **T-18**: `app_web`'s flags, and what it cannot do.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  CUSTOMER_SCOPED_TABLES,
  PARTNER_SCOPED_TABLES,
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

/** Runs `fn` as `app_web` in `context`, inside a savepoint that is always rolled back. */
async function as<T>(
  tx: Tx,
  context: Parameters<typeof asApp>[1],
  fn: (sp: Tx) => Promise<T>,
): Promise<T> {
  let result: T | undefined;
  try {
    await tx.savepoint(async (sp) => {
      await asApp(sp, context);
      result = await fn(sp);
      throw new Undo();
    });
  } catch (error) {
    if (!(error instanceof Undo)) throw error;
  }
  return result as T;
}

const tableSql = (table: string): string =>
  table === "order" ? 'public."order"' : `public.${table}`;

interface PartnerWorld {
  partnerId: string;
  userId: string;
  orderId: string;
}

/** A partner with one row in every partner-scoped table. */
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
  await tx`INSERT INTO order_line (order_id, kind, product_id, qty, unit_retail_minor, currency_code, vat_rate_bp)
           VALUES (${orderId}, 'product', ${productId}, 1, 18900, 'PLN', 800)`;
  await tx`INSERT INTO order_assignment (order_id, partner_id, sla_expires_at, attempt)
           VALUES (${orderId}, ${partnerId}, now() + interval '1 hour', 1)`;
  await tx`INSERT INTO delivery_proof (order_id, media_asset_id, uploaded_by)
           VALUES (${orderId}, ${await mediaAsset(tx)}, 'partner:test')`;
  await tx`INSERT INTO substitution_note (order_id, proposed_by, proposal_md)
           VALUES (${orderId}, 'partner:test', 'Peonies instead of roses')`;
  const [payout] = await tx<{ id: string }[]>`
    INSERT INTO payout (partner_id, period_start, period_end, total_minor, currency_code)
    VALUES (${partnerId}, DATE '2027-02-01', DATE '2027-02-07', 9000, 'PLN') RETURNING id`;
  await tx`INSERT INTO payout_line (payout_id, order_id, amount_minor, currency_code, kind)
           VALUES (${payout?.id ?? ""}, ${orderId}, 9000, 'PLN', 'order')`;
  return { partnerId, userId, orderId };
}

/** How the rows of each partner-scoped table belong to a partner. */
const OWNER: Record<keyof typeof PARTNER_SCOPED_TABLES, string> = {
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
  order:
    "(SELECT a.partner_id FROM public.order_assignment a WHERE a.order_id = t.id)",
  order_line:
    "(SELECT a.partner_id FROM public.order_assignment a WHERE a.order_id = t.order_id)",
  delivery_proof:
    "(SELECT a.partner_id FROM public.order_assignment a WHERE a.order_id = t.order_id)",
  substitution_note:
    "(SELECT a.partner_id FROM public.order_assignment a WHERE a.order_id = t.order_id)",
};

/** A no-op column per table for the `UPDATE` probes. */
const TOUCH: Record<keyof typeof PARTNER_SCOPED_TABLES, string> = {
  fulfillment_partner: "legal_name = legal_name",
  partner_translation: "display_name = display_name",
  partner_member: "role = role",
  partner_coverage: "capacity_per_day = capacity_per_day",
  partner_blackout: "reason = reason",
  partner_catalog_mapping: "can_fulfil = can_fulfil",
  payout: "total_minor = total_minor",
  payout_line: "note = note",
  order_assignment: "reason = reason",
  order: "delivery_window = delivery_window",
  order_line: "qty = qty",
  delivery_proof: "approved = approved",
  substitution_note: "proposal_md = proposal_md",
};

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

    it("T-16 / AC-16: each partner sees its own rows only, and cannot touch the other's", async () => {
      const report = await rolledBack(scratch.sql, async (tx) => {
        const countryId = await country(tx);
        const [product] = await tx<{ id: string }[]>`
          INSERT INTO product (sku, product_type, primary_flower, colour_primary, style, price_tier,
                               substitution_class, freshness_days)
          VALUES ('SKU-RLS-1', 'bouquet', 'rose', 'red', 'classic', 'classic', 'roses', 7)
          RETURNING id`;
        const a = await partnerWorld(tx, countryId, product?.id ?? "");
        const b = await partnerWorld(tx, countryId, product?.id ?? "");
        const out: Record<string, Record<string, number>> = {};
        for (const table of Object.keys(
          PARTNER_SCOPED_TABLES,
        ) as (keyof typeof PARTNER_SCOPED_TABLES)[]) {
          const owner = OWNER[table];
          const count = (sp: Tx, partnerId: string) =>
            sp.unsafe<{ n: number }[]>(
              `SELECT count(*)::int AS n FROM ${tableSql(table)} t WHERE ${owner} = $1`,
              [partnerId],
            );
          const change = (
            sp: Tx,
            verb: "UPDATE" | "DELETE",
            partnerId: string,
          ) =>
            sp.unsafe(
              verb === "UPDATE"
                ? `UPDATE ${tableSql(table)} t SET ${TOUCH[table]} WHERE ${owner} = $1`
                : `DELETE FROM ${tableSql(table)} t WHERE ${owner} = $1`,
              [partnerId],
            );
          const [superA] = await count(tx, a.partnerId);
          const asA = await as(
            tx,
            { role: "partner", partnerIds: [a.partnerId] },
            async (sp) => ({
              own: (await count(sp, a.partnerId))[0]?.n ?? -1,
              other: (await count(sp, b.partnerId))[0]?.n ?? -1,
              ownUpdate: (await change(sp, "UPDATE", a.partnerId)).count,
            }),
          );
          const asB = await as(
            tx,
            { role: "partner", partnerIds: [b.partnerId] },
            async (sp) => ({
              own: (await count(sp, b.partnerId))[0]?.n ?? -1,
              other: (await count(sp, a.partnerId))[0]?.n ?? -1,
              updateA: (await change(sp, "UPDATE", a.partnerId)).count,
              deleteA: (await change(sp, "DELETE", a.partnerId)).count,
            }),
          );
          const [afterA] = await count(tx, a.partnerId);
          out[table] = {
            rowsOfA: superA?.n ?? -1,
            aSeesA: asA.own,
            aSeesB: asA.other,
            aUpdatesOwn: asA.ownUpdate,
            bSeesB: asB.own,
            bSeesA: asB.other,
            bUpdatesA: asB.updateA,
            bDeletesA: asB.deleteA,
            rowsOfAAfter: afterA?.n ?? -1,
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
          aSeesA: n,
          aSeesB: 0,
          aUpdatesOwn: mode === "write" ? n : 0,
          bSeesB: n,
          bSeesA: 0,
          bUpdatesA: 0,
          bDeletesA: 0,
          rowsOfAAfter: n,
        });
      }
    });

    it("T-16: a partner cannot write a row for another partner, and no role other than partner reads partner rows", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const countryId = await country(tx);
        const a = await partner(tx, countryId);
        const b = await partner(tx, countryId);
        const insertForB = await as(
          tx,
          { role: "partner", partnerIds: [a] },
          (sp) =>
            pgFailure(
              sp,
              (inner) =>
                inner`INSERT INTO partner_blackout (partner_id, date) VALUES (${b}, DATE '2027-03-01')`,
            ),
        );
        const customerSees = await as(
          tx,
          { role: "customer", partnerIds: [a] },
          async (sp) =>
            (
              await sp<
                { n: number }[]
              >`SELECT count(*)::int AS n FROM fulfillment_partner`
            )[0]?.n,
        );
        return { insertForB, customerSees };
      });
      expect(result.insertForB.code).toBe("42501");
      expect(result.customerSees).toBe(0);
    });

    it("customer scope: a buyer reads their own records only, and edits only their address book", async () => {
      const report = await rolledBack(scratch.sql, async (tx) => {
        const countryId = await country(tx);
        const users = await tx<{ id: string }[]>`
          INSERT INTO users (email) VALUES ('buyer-a@example.test'), ('buyer-b@example.test') RETURNING id`;
        const ua = users[0]?.id ?? "";
        const ub = users[1]?.id ?? "";
        const worlds: { customerId: string; orderId: string }[] = [];
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
            INSERT INTO payment (order_id, provider, provider_ref, status, method, amount_minor, currency_code)
            VALUES (${orderId}, 'stripe', ${unique("pi_")}, 'authorised', 'card', 18900, 'PLN') RETURNING id`;
          await tx`INSERT INTO refund (payment_id, provider_ref, amount_minor, currency_code, reason, status)
                   VALUES (${payment?.id ?? ""}, ${unique("re_")}, 500, 'PLN', 'addon_missing', 'succeeded')`;
          worlds.push({ customerId, orderId });
        }
        const out: Record<
          string,
          { own: number; other: number; total: number }
        > = {};
        for (const table of Object.keys(CUSTOMER_SCOPED_TABLES)) {
          const [total] = await tx.unsafe<{ n: number }[]>(
            `SELECT count(*)::int AS n FROM ${tableSql(table)}`,
          );
          const seen = await as<number>(
            tx,
            { role: "customer", userId: ua },
            async (sp) =>
              (
                await sp.unsafe<{ n: number }[]>(
                  `SELECT count(*)::int AS n FROM ${tableSql(table)}`,
                )
              )[0]?.n ?? -1,
          );
          out[table] = { own: seen, other: 0, total: total?.n ?? -1 };
        }
        const edits = await as(
          tx,
          { role: "customer", userId: ua },
          async (sp) => ({
            ownRecipient: (
              await sp`UPDATE recipient SET full_name = 'Renamed' WHERE customer_id = ${worlds[0]?.customerId ?? ""}`
            ).count,
            otherRecipient: (
              await sp`UPDATE recipient SET full_name = 'Renamed' WHERE customer_id = ${worlds[1]?.customerId ?? ""}`
            ).count,
            ownOrder: (
              await sp`UPDATE "order" SET delivery_window = 'am' WHERE id = ${worlds[0]?.orderId ?? ""}`
            ).count,
            ownUser: (
              await sp<{ n: number }[]>`SELECT count(*)::int AS n FROM users`
            )[0]?.n,
          }),
        );
        return { out, edits };
      });
      for (const [table, counts] of Object.entries(report.out)) {
        expect(counts.total, table).toBe(2);
        expect(counts.own, table).toBe(1);
      }
      expect(report.edits).toEqual({
        ownRecipient: 1,
        otherRecipient: 0,
        ownOrder: 0,
        ownUser: 1,
      });
    });

    it("T-17 / AC-17: public reads the reference set as fully as the owner sees it, and nothing private", async () => {
      const report = await rolledBack(scratch.sql, async (tx) => {
        const countryId = await country(tx);
        await tx`INSERT INTO country_translation (country_id, locale_code, name, slug)
                 VALUES (${countryId}, 'en', 'Poland', 'poland')`;
        await tx`INSERT INTO country_locale_content (country_id, locale_code, state, h1, intro_md)
                 VALUES (${countryId}, 'en', 'guide', 'Flowers to Poland', 'Intro')`;
        await tx`INSERT INTO city (country_id) VALUES (${countryId})`;
        const [product] = await tx<{ id: string }[]>`
          INSERT INTO product (sku, product_type, primary_flower, colour_primary, style, price_tier,
                               substitution_class, freshness_days)
          VALUES ('SKU-RLS-2', 'bouquet', 'rose', 'red', 'classic', 'classic', 'roses', 7)
          RETURNING id`;
        await tx`INSERT INTO product_translation (product_id, locale_code, name, slug)
                 VALUES (${product?.id ?? ""}, 'en', 'Red roses', 'red-roses')`;
        await tx`INSERT INTO country_price (product_id, country_id, retail_minor, currency_code, vat_rate_bp, active_from)
                 VALUES (${product?.id ?? ""}, ${countryId}, 18900, 'PLN', 800, DATE '2026-10-01')`;
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
        const buyer = await customer(tx);
        await insertPlacedOrder(tx, {
          customerId: buyer,
          recipientId: await recipient(tx, buyer),
          countryId,
        });
        const [someone] = await tx<{ id: string }[]>`
          INSERT INTO users (email) VALUES ('someone@example.test') RETURNING id`;
        await tx`INSERT INTO sessions (session_token, user_id, expires)
                 VALUES ('t17-session', ${someone?.id ?? ""}, now() + interval '1 day')`;
        const world = await partnerWorld(tx, countryId, product?.id ?? "");
        await tx`INSERT INTO payment (order_id, provider, provider_ref, status, method, amount_minor, currency_code)
                 VALUES (${world.orderId}, 'stripe', 'pi_t17', 'authorised', 'card', 18900, 'PLN')`;
        await tx`INSERT INTO outbox (event_id, order_id, targets, payload, payload_version)
                 VALUES (gen_random_uuid(), ${world.orderId}, '{crm}', '{}', 1)`;
        await tx`INSERT INTO audit_log (actor_label, action, entity_table, entity_id, after, request_id)
                 VALUES ('founder', 'country.status_changed', 'country', 'PL', '{"status": "demo"}', 'req-t17')`;

        const count = (sp: Tx, table: string) =>
          sp
            .unsafe<{ n: number }[]>(
              `SELECT count(*)::int AS n FROM ${tableSql(table)}`,
            )
            .then((rows) => rows[0]?.n ?? -1);
        const PRIVATE = [
          "customer",
          "recipient",
          "order",
          "order_event",
          "payment",
          "outbox",
          "audit_log",
          "users",
          "sessions",
          "feature_flag",
          "retention_policy",
          ...Object.keys(PARTNER_SCOPED_TABLES),
        ];
        const owner: Record<string, number> = {};
        for (const table of [
          ...PUBLIC_REFERENCE_TABLES,
          ...PRIVATE,
          "media_asset",
          "review",
        ]) {
          owner[table] = await count(tx, table);
        }
        const seen = await as(tx, { role: "public" }, async (sp) => {
          const out: Record<string, number> = {};
          for (const table of [...PUBLIC_REFERENCE_TABLES, ...PRIVATE]) {
            out[table] = await count(sp, table);
          }
          out.media_asset_private =
            (
              await sp<
                { n: number }[]
              >`SELECT count(*)::int AS n FROM media_asset WHERE visibility <> 'public'`
            )[0]?.n ?? -1;
          out.media_asset = await count(sp, "media_asset");
          out.review_unpublished =
            (
              await sp<
                { n: number }[]
              >`SELECT count(*)::int AS n FROM review WHERE moderation_status <> 'published'`
            )[0]?.n ?? -1;
          out.review = await count(sp, "review");
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
  },
);
