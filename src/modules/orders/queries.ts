/**
 * The two read projections of orders (spec 010 §2, §5.2 `OrderListItemSchema`; AC-25; rulings R3
 * and R4; spec 012 §2.6; TASK-202).
 *
 *  - `listOrdersForPartner(partnerId)` — **the** partner-scoped order query (R4), under
 *    `app.role = 'partner'` with only that florist's id. It reads `partner_order` and
 *    `partner_order_line` (`0011`), never `"order"` or `order_line`, so RLS and the views'
 *    `app_partner_sees_order` decide what a florist sees: an open or accepted offer, nothing
 *    else. Spec 011's `listFloristAssignments` is built on `selectPartnerOrders` here and adds no
 *    second partner-scoped order query.
 *  - `listOrdersForAdmin(filter)` — spec 012's queue (R3), under `app.role = 'admin'`: newest
 *    first, 50 a page, filtered by status, destination country, delivery date and created date.
 *    `AdminOrderListItemSchema` extends `OrderListItemSchema` with the internal status, the total
 *    and the assigned partner; TASK-222 adds `orderQueueHead()` and `orderDetail()` beside it.
 *
 * Neither item carries contact data: no name, phone, email, street, postcode or card field
 * exists in either schema (`.strict()`), and neither query selects a snapshot column.
 */
import { randomUUID } from "node:crypto";

import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";

import { withAdminContext, withDbContext } from "@/lib/db";

import { drizzleExecutor, type OrderExecutor } from "./service/executor";
import { OrderModeSchema } from "./service/events";
import { orderReference } from "./service/reference";

/** The buyer-visible projections of spec 002 A6.4 (`order_status.buyer_projection`). */
export const BUYER_STATUSES = [
  "placed",
  "confirmed",
  "with_florist",
  "being_made",
  "on_its_way",
  "delivered",
  "closed",
  "cancelled",
] as const;

const IsoDate = z.iso.date();
const IsoDateTime = z.iso.datetime();

/** §5.2: what both lists carry. No contact data. */
export const OrderListItemSchema = z
  .object({
    orderId: z.uuid(),
    reference: z.string().regex(/^FO-[0-9A-Z]{4}-[0-9A-Z]{4}$/),
    mode: OrderModeSchema,
    buyerStatus: z.enum(BUYER_STATUSES),
    deliveryDate: IsoDate,
    cityName: z.string().nullable(),
    productName: z.string().nullable(),
    tierKey: z.string().nullable(),
    placedAt: IsoDateTime,
  })
  .strict();

export type OrderListItem = z.infer<typeof OrderListItemSchema>;

/** Spec 012 §2.6: the list item plus the internal status, the total and the assigned florist. */
export const AdminOrderListItemSchema = OrderListItemSchema.extend({
  status: z.string().min(1),
  totalMinor: z.number().int().nonnegative(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  assignedPartner: z
    .object({ partnerId: z.uuid(), code: z.string().min(1) })
    .strict()
    .nullable(),
}).strict();

export type AdminOrderListItem = z.infer<typeof AdminOrderListItemSchema>;

/** Spec 012 §2.6: 50 a page, newest first. */
export const ORDER_QUEUE_PAGE_SIZE = 50;

/** Spec 012 §2.6's filters. `createdOn` is a UTC calendar day. */
export const OrderQueueFilterSchema = z
  .object({
    status: z
      .string()
      .regex(/^[a-z][a-z_]*[a-z]$/)
      .optional(),
    countryIso2: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .optional(),
    deliveryDate: IsoDate.optional(),
    createdOn: IsoDate.optional(),
    page: z.number().int().positive().default(1),
  })
  .strict();

export type OrderQueueFilter = z.input<typeof OrderQueueFilterSchema>;

/** A locale code as `locale.code` stores it. Names fall back to `en` when a translation is missing. */
const LocaleSchema = z.string().regex(/^[a-z]{2}(-[a-z]{2})?$/);

const Minor = z.union([z.number(), z.string()]).transform((value, ctx) => {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(number)) {
    ctx.addIssue({ code: "custom", message: "not a safe integer" });
    return z.NEVER;
  }
  return number;
});

const BaseRow = z.object({
  id: z.uuid(),
  mode: OrderModeSchema,
  buyer_status: z.enum(BUYER_STATUSES),
  delivery_date: IsoDate,
  city_name: z.string().nullable(),
  product_name: z.string().nullable(),
  tier_key: z.string().nullable(),
  placed_at: IsoDateTime,
});

const AdminRow = BaseRow.extend({
  status: z.string().min(1),
  total_minor: Minor,
  currency: z.string(),
  partner_id: z.uuid().nullable(),
  partner_code: z.string().nullable(),
});

function baseItem(row: z.infer<typeof BaseRow>): OrderListItem {
  return {
    orderId: row.id,
    reference: orderReference(row.id),
    mode: row.mode,
    buyerStatus: row.buyer_status,
    deliveryDate: row.delivery_date,
    cityName: row.city_name,
    productName: row.product_name,
    tierKey: row.tier_key,
    placedAt: row.placed_at,
  };
}

/** `created_at` as an ISO 8601 UTC instant, independent of the session's time zone. */
const placedAt = (column: SQL): SQL =>
  sql`to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

const cityName = (cityId: SQL, locale: string): SQL => sql`(
  SELECT ct.name FROM city_translation ct
  WHERE ct.city_id = ${cityId} AND ct.locale_code IN (${locale}, 'en')
  ORDER BY (ct.locale_code = ${locale}) DESC LIMIT 1)`;

const productName = (productId: SQL, locale: string): SQL => sql`(
  SELECT pt.name FROM product_translation pt
  WHERE pt.product_id = ${productId} AND pt.locale_code IN (${locale}, 'en')
  ORDER BY (pt.locale_code = ${locale}) DESC LIMIT 1)`;

/**
 * The partner base query (R4), inside a transaction whose context is already a partner's. What a
 * florist sees is decided by `partner_order`'s `app_partner_sees_order`, not by a `WHERE` here.
 */
export async function selectPartnerOrders(
  executor: OrderExecutor,
  locale = "en",
): Promise<OrderListItem[]> {
  const code = LocaleSchema.parse(locale);
  const rows = await executor.execute(sql`
    SELECT o.id, o.mode, s.buyer_projection AS buyer_status,
           o.delivery_date::text AS delivery_date,
           ${cityName(sql`o.destination_city_id`, code)} AS city_name,
           ${productName(sql`l.product_id`, code)} AS product_name,
           l.tier_key, ${placedAt(sql`o.created_at`)} AS placed_at
    FROM partner_order o
    JOIN order_status s ON s.key = o.status
    LEFT JOIN LATERAL (
      SELECT pl.product_id, pl.tier_key FROM partner_order_line pl
      WHERE pl.order_id = o.id AND pl.kind = 'product'
      ORDER BY pl.id LIMIT 1
    ) l ON true
    ORDER BY o.created_at DESC, o.id`);
  return rows.map((row) =>
    OrderListItemSchema.parse(baseItem(BaseRow.parse(row))),
  );
}

/** The admin queue query, inside a transaction whose context is already staff. */
export async function selectAdminOrders(
  executor: OrderExecutor,
  filter: OrderQueueFilter = {},
  locale = "en",
): Promise<AdminOrderListItem[]> {
  const parsed = OrderQueueFilterSchema.parse(filter);
  const code = LocaleSchema.parse(locale);
  const conditions: SQL[] = [sql`true`];
  if (parsed.status !== undefined) {
    conditions.push(sql`o.status = ${parsed.status}`);
  }
  if (parsed.countryIso2 !== undefined) {
    conditions.push(sql`c.iso2 = ${parsed.countryIso2}`);
  }
  if (parsed.deliveryDate !== undefined) {
    conditions.push(sql`o.delivery_date = ${parsed.deliveryDate}::date`);
  }
  if (parsed.createdOn !== undefined) {
    conditions.push(
      sql`o.created_at >= (${parsed.createdOn}::date)::timestamp AT TIME ZONE 'UTC'`,
    );
    conditions.push(
      sql`o.created_at < (${parsed.createdOn}::date + 1)::timestamp AT TIME ZONE 'UTC'`,
    );
  }
  const offset = (parsed.page - 1) * ORDER_QUEUE_PAGE_SIZE;
  const rows = await executor.execute(sql`
    SELECT o.id, o.mode, o.status, s.buyer_projection AS buyer_status,
           o.delivery_date::text AS delivery_date,
           ${cityName(sql`o.destination_city_id`, code)} AS city_name,
           ${productName(sql`l.product_id`, code)} AS product_name,
           l.tier_key, ${placedAt(sql`o.created_at`)} AS placed_at,
           o.buyer_total_minor AS total_minor, o.buyer_currency_code AS currency,
           a.partner_id, a.partner_code
    FROM "order" o
    JOIN order_status s ON s.key = o.status
    JOIN country c ON c.id = o.destination_country_id
    LEFT JOIN LATERAL (
      SELECT ol.product_id, ol.tier_key FROM order_line ol
      WHERE ol.order_id = o.id AND ol.kind = 'product'
      ORDER BY ol.id LIMIT 1
    ) l ON true
    LEFT JOIN LATERAL (
      SELECT oa.partner_id, fp.code AS partner_code
      FROM order_assignment oa JOIN fulfillment_partner fp ON fp.id = oa.partner_id
      WHERE oa.order_id = o.id AND (oa.response IS NULL OR oa.response = 'accept')
      ORDER BY oa.attempt DESC LIMIT 1
    ) a ON true
    WHERE ${sql.join(conditions, sql` AND `)}
    ORDER BY o.created_at DESC, o.id
    LIMIT ${ORDER_QUEUE_PAGE_SIZE} OFFSET ${offset}`);
  return rows.map((raw) => {
    const row = AdminRow.parse(raw);
    return AdminOrderListItemSchema.parse({
      ...baseItem(row),
      status: row.status,
      totalMinor: row.total_minor,
      currency: row.currency,
      assignedPartner:
        row.partner_id === null || row.partner_code === null
          ? null
          : { partnerId: row.partner_id, code: row.partner_code },
    });
  });
}

export interface ListOptions {
  readonly locale?: string;
  readonly requestId?: string;
}

/** R4's one partner-scoped order query, under that florist's partner context only. */
export async function listOrdersForPartner(
  partnerId: string,
  options: ListOptions = {},
): Promise<OrderListItem[]> {
  const id = z.uuid().parse(partnerId);
  return withDbContext(
    {
      role: "partner",
      partnerIds: [id],
      requestId: options.requestId ?? randomUUID(),
    },
    (db) => selectPartnerOrders(drizzleExecutor(db), options.locale),
  );
}

/** R3's admin queue, under `app.role = 'admin'`. */
export async function listOrdersForAdmin(
  filter: OrderQueueFilter = {},
  options: ListOptions & { readonly userId?: string } = {},
): Promise<AdminOrderListItem[]> {
  return withAdminContext(
    {
      ...(options.userId === undefined ? {} : { userId: options.userId }),
      requestId: options.requestId ?? randomUUID(),
      // A read: the audit action names it, and no trigger records it (spec 012 §2.3).
      action: "orders.list",
    },
    (db) => selectAdminOrders(drizzleExecutor(db), filter, options.locale),
  );
}
