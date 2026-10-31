/**
 * Migration `0030_routing_notifications` on a database (spec 016 §5.1 as amended by §14
 * A-founder-2026-10-22 item 3; §10 T-49; AC-49; TASK-327).
 *
 * T-49: introspection of `notification_delivery` (with `purchase_id`, without
 * `attached_invoice_id`) and `notification_delivery_invoice`; the three owner checks; RLS under
 * the `partner`, `customer` and `public` roles; up, down, up on a seeded PG16. Beside it, the rest
 * of §5.1: the withdrawal columns and their checks, `webhook_inbox` accepting `resend`, the two
 * flags, and `recipient_ref` refusing anything that is not `buyer`, `ops` or a user id (no
 * address is stored).
 *
 * Local disposable server only (`support/scratch-db.ts`).
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { insertPlacedOrder } from "../fixtures/order-state.ts";
import { orderParents, partner, unique } from "./support/rows.ts";
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

const server = await probeLocalServer();

const BEFORE = "0029";

/** A `live` order, its purchase and its country. */
async function liveOrder(
  tx: Tx,
): Promise<{ orderId: string; purchaseId: string; countryId: string }> {
  const parents = await orderParents(tx);
  const orderId = await insertPlacedOrder(tx, { ...parents, mode: "live" });
  const [row] = await tx<{ purchase_id: string }[]>`
    SELECT purchase_id FROM "order" WHERE id = ${orderId}`;
  return {
    orderId,
    purchaseId: row?.purchase_id ?? "",
    countryId: parents.countryId,
  };
}

/** One issued invoice on `orderId`, under a test profile. */
async function invoiceOn(tx: Tx, orderId: string): Promise<string> {
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
  return row?.id ?? "";
}

interface DeliveryFields {
  readonly source_key?: string;
  readonly order_id?: string | null;
  readonly purchase_id?: string | null;
  readonly template_key?: string;
  readonly audience?: string;
  readonly recipient_ref?: string;
  readonly status?: string;
}

async function delivery(tx: Tx, fields: DeliveryFields): Promise<string> {
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO notification_delivery ${tx({
      source_key: `outbox:${randomUUID()}`,
      order_id: null,
      purchase_id: null,
      template_key: "offer",
      audience: "florist",
      recipient_ref: randomUUID(),
      locale_code: "en",
      provider: "capture",
      status: "queued",
      status_at: new Date(),
      ...fields,
    })} RETURNING id`;
  return row?.id ?? "";
}

/** The schema facts §5.1 names, read from the catalogue. */
async function objects(sql: Sql | Tx) {
  const [row] = await sql<
    {
      delivery: string[] | null;
      invoice_link: string[] | null;
      assignment: string[] | null;
      rls: string[] | null;
      inbox_check: string | null;
      flags: { key: string; on: boolean }[] | null;
    }[]
  >`
    SELECT
      (SELECT array_agg(column_name::text ORDER BY column_name) FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'notification_delivery') AS delivery,
      (SELECT array_agg(column_name::text ORDER BY column_name) FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'notification_delivery_invoice') AS invoice_link,
      (SELECT array_agg(column_name::text ORDER BY column_name) FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'order_assignment'
          AND column_name LIKE 'withdrawn%') AS assignment,
      (SELECT array_agg(relname::text ORDER BY relname) FROM pg_class
        WHERE relname IN ('notification_delivery', 'notification_delivery_invoice')
          AND relrowsecurity) AS rls,
      (SELECT pg_get_constraintdef(oid) FROM pg_constraint
        WHERE conname = 'webhook_inbox_provider_check') AS inbox_check,
      (SELECT json_agg(json_build_object('key', key, 'on', enabled_default) ORDER BY key)
         FROM feature_flag WHERE key IN ('routing.auto', 'notifications.email')) AS flags`;
  return row;
}

const DELIVERY_COLUMNS = [
  "audience",
  "created_at",
  "id",
  "locale_code",
  "order_id",
  "provider",
  "provider_message_id",
  "purchase_id",
  "recipient_ref",
  "source_key",
  "status",
  "status_at",
  "template_key",
  "updated_at",
];

describe.skipIf(server.url === undefined)(
  `spec 016 — migration 0030_routing_notifications${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "routing");
    }, 600_000);

    afterAll(async () => {
      await scratch.drop();
    });

    it("T-49: creates notification_delivery with purchase_id and no attached_invoice_id, the invoice link, RLS on both", async () => {
      expect(await objects(scratch.sql)).toEqual({
        delivery: DELIVERY_COLUMNS,
        invoice_link: ["created_at", "invoice_id", "notification_delivery_id"],
        assignment: ["withdrawn_at", "withdrawn_reason"],
        rls: ["notification_delivery", "notification_delivery_invoice"],
        inbox_check:
          "CHECK ((provider = ANY (ARRAY['stripe'::text, 'mollie'::text, 'resend'::text])))",
        flags: [
          { key: "notifications.email", on: true },
          { key: "routing.auto", on: true },
        ],
      });
      const [scopes] = await scratch.sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM feature_flag_scope
        WHERE flag_key IN ('routing.auto', 'notifications.email')`;
      expect(scopes?.n).toBe(0);
    });

    it("T-49: a B1 row belongs to a purchase and to no order; no row belongs to both", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const { orderId, purchaseId } = await liveOrder(tx);
        const b1 = {
          template_key: "order-received",
          audience: "buyer",
          recipient_ref: "buyer",
          source_key: `purchase:${purchaseId}`,
        };
        const withOrder = await pgFailure(tx, (sp) =>
          delivery(sp, { ...b1, order_id: orderId }),
        );
        const withoutPurchase = await pgFailure(tx, (sp) => delivery(sp, b1));
        const both = await pgFailure(tx, (sp) =>
          delivery(sp, {
            template_key: "being-made",
            audience: "buyer",
            recipient_ref: "buyer",
            order_id: orderId,
            purchase_id: purchaseId,
          }),
        );
        const okB1 = await delivery(tx, { ...b1, purchase_id: purchaseId });
        const okOffer = await delivery(tx, { order_id: orderId });
        const okOps = await delivery(tx, {
          template_key: "alert-no-partner",
          audience: "ops",
          recipient_ref: "ops",
        });
        const again = await pgFailure(tx, (sp) =>
          delivery(sp, { ...b1, purchase_id: purchaseId }),
        );
        return {
          withOrder: withOrder.constraint,
          withoutPurchase: withoutPurchase.constraint,
          both: both.constraint,
          again: again.constraint,
          inserted: [okB1, okOffer, okOps].every((id) => id.length === 36),
        };
      });
      expect(result).toEqual({
        withOrder: "notification_delivery_order_received_check",
        withoutPurchase: "notification_delivery_order_received_check",
        both: "notification_delivery_owner_check",
        again: "notification_delivery_source_template_recipient_key",
        inserted: true,
      });
    });

    it("stores no address: recipient_ref is buyer, ops or a user id, and the closed lists hold", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const { orderId } = await liveOrder(tx);
        const fail = async (fields: DeliveryFields) =>
          (
            await pgFailure(tx, (sp) =>
              delivery(sp, { order_id: orderId, ...fields }),
            )
          ).constraint;
        return {
          email: await fail({ recipient_ref: "florist@example.test" }),
          name: await fail({ recipient_ref: "Anna Nowak" }),
          audience: await fail({ audience: "recipient" }),
          status: await fail({ status: "opened" }),
          template: await fail({ template_key: "Order Received" }),
        };
      });
      expect(result).toEqual({
        email: "notification_delivery_recipient_ref_check",
        name: "notification_delivery_recipient_ref_check",
        audience: "notification_delivery_audience_check",
        status: "notification_delivery_status_check",
        template: "notification_delivery_template_key_check",
      });
    });

    it("links each invoice a B1 carried once, and the links go with their delivery", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const { orderId, purchaseId } = await liveOrder(tx);
        const invoiceId = await invoiceOn(tx, orderId);
        const b1 = await delivery(tx, {
          template_key: "order-received",
          audience: "buyer",
          recipient_ref: "buyer",
          source_key: `purchase:${purchaseId}`,
          purchase_id: purchaseId,
        });
        await tx`INSERT INTO notification_delivery_invoice (notification_delivery_id, invoice_id)
                 VALUES (${b1}, ${invoiceId})`;
        const twice = await pgFailure(
          tx,
          (
            sp,
          ) => sp`INSERT INTO notification_delivery_invoice (notification_delivery_id, invoice_id)
                     VALUES (${b1}, ${invoiceId})`,
        );
        await tx`DELETE FROM notification_delivery WHERE id = ${b1}`;
        const [left] = await tx<{ n: number }[]>`
          SELECT count(*)::int AS n FROM notification_delivery_invoice WHERE invoice_id = ${invoiceId}`;
        return { twice: twice.constraint, left: left?.n };
      });
      expect(result).toEqual({
        twice: "notification_delivery_invoice_pkey",
        left: 0,
      });
    });

    it("T-49: RLS returns zero rows of either table to partner, customer and public, and every row to staff", async () => {
      const counts = async (
        role: string,
        extra: Partial<Parameters<typeof asApp>[1]> = {},
      ) =>
        rolledBack(scratch.sql, async (tx) => {
          const { orderId, purchaseId } = await liveOrder(tx);
          const florist = await partner(
            tx,
            (await orderParents(tx)).countryId,
            "active",
          );
          const b1 = await delivery(tx, {
            template_key: "order-received",
            audience: "buyer",
            recipient_ref: "buyer",
            source_key: `purchase:${purchaseId}`,
            purchase_id: purchaseId,
          });
          await delivery(tx, { order_id: orderId });
          await tx`INSERT INTO notification_delivery_invoice (notification_delivery_id, invoice_id)
                   VALUES (${b1}, ${await invoiceOn(tx, orderId)})`;
          await asApp(tx, {
            role,
            partnerIds: [florist],
            userId: randomUUID(),
            ...extra,
          });
          const [row] = await tx<{ deliveries: number; links: number }[]>`
            SELECT (SELECT count(*)::int FROM notification_delivery) AS deliveries,
                   (SELECT count(*)::int FROM notification_delivery_invoice) AS links`;
          return row;
        });
      expect(await counts("partner")).toEqual({ deliveries: 0, links: 0 });
      expect(await counts("customer")).toEqual({ deliveries: 0, links: 0 });
      expect(await counts("public")).toEqual({ deliveries: 0, links: 0 });
      expect(await counts("system")).toEqual({ deliveries: 2, links: 1 });
      expect(await counts("admin")).toEqual({ deliveries: 2, links: 1 });
    });

    it("a withdrawal has its time and its reason together, from the closed list", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const { orderId, countryId } = await liveOrder(tx);
        const florist = await partner(tx, countryId, "active");
        const [assignment] = await tx<{ id: string }[]>`
          INSERT INTO order_assignment (order_id, partner_id, offered_at, sla_expires_at, attempt)
          VALUES (${orderId}, ${florist}, now(), now() + interval '1 hour', 1) RETURNING id`;
        const id = assignment?.id ?? "";
        const timeOnly = await pgFailure(
          tx,
          (sp) =>
            sp`UPDATE order_assignment SET withdrawn_at = now() WHERE id = ${id}`,
        );
        const reasonOnly = await pgFailure(
          tx,
          (sp) =>
            sp`UPDATE order_assignment SET withdrawn_reason = 'order_cancelled' WHERE id = ${id}`,
        );
        const unknown = await pgFailure(
          tx,
          (sp) =>
            sp`UPDATE order_assignment SET withdrawn_at = now(), withdrawn_reason = 'florist_ill'
               WHERE id = ${id}`,
        );
        await tx`UPDATE order_assignment SET withdrawn_at = now(), withdrawn_reason = 'chargeback_open'
                 WHERE id = ${id}`;
        return {
          timeOnly: timeOnly.constraint,
          reasonOnly: reasonOnly.constraint,
          unknown: unknown.constraint,
        };
      });
      expect(result).toEqual({
        timeOnly: "order_assignment_withdrawn_check",
        reasonOnly: "order_assignment_withdrawn_check",
        unknown: "order_assignment_withdrawn_reason_check",
      });
    });

    it("webhook_inbox stores a resend row, and still refuses an unknown provider", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        await tx`INSERT INTO webhook_inbox (provider, event_id, signature_verified, raw)
                 VALUES ('resend', 'msg_1', true, '{}'::jsonb)`;
        const other = await pgFailure(
          tx,
          (
            sp,
          ) => sp`INSERT INTO webhook_inbox (provider, event_id, signature_verified, raw)
                     VALUES ('sendgrid', 'msg_1', true, '{}'::jsonb)`,
        );
        return other.constraint;
      });
      expect(result).toBe("webhook_inbox_provider_check");
    });
  },
);

describe.skipIf(server.url === undefined)(
  `spec 016 — 0030 up, down, up on a seeded database${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "routing_rt");
    }, 600_000);

    afterAll(async () => {
      await scratch.drop();
    });

    it("T-49: rolls back to 0029 (resend rows deleted, the rest kept) and applies again", async () => {
      const seeded = await scratch.sql.begin(async (tx) => {
        const { orderId, purchaseId, countryId } = await liveOrder(tx);
        const florist = await partner(tx, countryId, "active");
        await tx`INSERT INTO order_assignment (order_id, partner_id, offered_at, sla_expires_at,
                                               attempt, withdrawn_at, withdrawn_reason)
                 VALUES (${orderId}, ${florist}, now(), now() + interval '1 hour', 1, now(),
                         'order_cancelled')`;
        const b1 = await delivery(tx, {
          template_key: "order-received",
          audience: "buyer",
          recipient_ref: "buyer",
          source_key: `purchase:${purchaseId}`,
          purchase_id: purchaseId,
        });
        await tx`INSERT INTO notification_delivery_invoice (notification_delivery_id, invoice_id)
                 VALUES (${b1}, ${await invoiceOn(tx, orderId)})`;
        await tx`INSERT INTO webhook_inbox (provider, event_id, signature_verified, raw)
                 VALUES ('resend', 'msg_rt', true, '{}'::jsonb)`;
        await tx`INSERT INTO webhook_inbox (provider, event_id, signature_verified, raw, livemode,
                                            event_type)
                 VALUES ('stripe', 'evt_rt', true, '{}'::jsonb, false, 'charge.succeeded')`;
        return { orderId };
      });

      await runner(scratch.url, ["--down", "--to", BEFORE]);
      const down = await objects(scratch.sql);
      const [inbox] = await scratch.sql<{ providers: string[] }[]>`
        SELECT array_agg(provider ORDER BY provider) AS providers FROM webhook_inbox
        WHERE event_id IN ('msg_rt', 'evt_rt')`;
      const [assignments] = await scratch.sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM order_assignment WHERE order_id = ${seeded.orderId}`;
      expect(down).toEqual({
        delivery: null,
        invoice_link: null,
        assignment: null,
        rls: null,
        inbox_check:
          "CHECK ((provider = ANY (ARRAY['stripe'::text, 'mollie'::text])))",
        flags: null,
      });
      expect(inbox?.providers).toEqual(["stripe"]);
      expect(assignments?.n).toBe(1);

      await runner(scratch.url);
      const up = await objects(scratch.sql);
      expect(up?.delivery).toEqual(DELIVERY_COLUMNS);
      expect(up?.rls).toEqual([
        "notification_delivery",
        "notification_delivery_invoice",
      ]);
      expect(up?.flags).toEqual([
        { key: "notifications.email", on: true },
        { key: "routing.auto", on: true },
      ]);

      // And down once more, so the pair is proven twice on the same seeded rows.
      await runner(scratch.url, ["--down", "--to", BEFORE]);
      expect((await objects(scratch.sql))?.delivery).toBeNull();
      await runner(scratch.url);
      expect((await objects(scratch.sql))?.assignment).toEqual([
        "withdrawn_at",
        "withdrawn_reason",
      ]);
    });
  },
);
