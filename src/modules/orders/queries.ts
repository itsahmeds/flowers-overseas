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
 *    and the assigned partner.
 *
 * Neither item carries contact data: no name, phone, email, street, postcode or card field
 * exists in either schema (`.strict()`), and neither query selects a snapshot column.
 *
 * Beside the queue, spec 012's other reads (§2.6, §5.2; TASK-222), each under `app.role = 'admin'`
 * and none a write:
 *
 *  - `orderQueueHead()` → `OrderQueueHeadSchema` (`{ latestCreatedAt, count }`), and its
 *    `orderQueueHeadTag()`, what the queue's 3-second poll compares;
 *  - `countOrdersForAdmin(filter)` and `orderQueueFilterOptions()`, the queue's pager and its
 *    status and destination choices;
 *  - `orderDetail(id, { includeRecipient })` → `AdminOrderDetailSchema`: lines, totals and the VAT
 *    split, the `order_event` timeline with its payloads, assignments and payments. The recipient
 *    snapshot is **selected** only when the caller asks for it (the page asks only for
 *    `orders.view_pii`), so a finance read never carries it; the buyer snapshot and the
 *    `public_token` are never selected at all.
 */
import { randomUUID } from "node:crypto";

import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";

import { withAdminContext, withDbContext } from "@/lib/db";

import { drizzleExecutor, type OrderExecutor } from "./service/executor";
import { OrderModeSchema } from "./service/events";
import { RecipientSnapshotSchema, VatSplitSchema } from "./service/place";
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

/** An IANA zone name's shape; Postgres refuses a zone it does not know. */
const ZoneNameSchema = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/);

/**
 * Spec 012 §2.6's filters. `createdOn` is a UTC calendar day. The queue's form (artboard
 * `admin-orders-desktop.dc.html`) filters by ranges: `deliveryFrom`/`deliveryTo` are calendar
 * dates (the destination's own), `createdFrom`/`createdTo` whole days in `timeZone` (the viewer's
 * `admin_profile.time_zone`); every bound is inclusive.
 */
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
    deliveryFrom: IsoDate.optional(),
    deliveryTo: IsoDate.optional(),
    createdFrom: IsoDate.optional(),
    createdTo: IsoDate.optional(),
    timeZone: ZoneNameSchema.default("UTC"),
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

/** The `WHERE` terms of a parsed queue filter, over `"order" o` joined to `country c`. */
function queueConditions(
  parsed: z.output<typeof OrderQueueFilterSchema>,
): SQL[] {
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
  if (parsed.deliveryFrom !== undefined) {
    conditions.push(sql`o.delivery_date >= ${parsed.deliveryFrom}::date`);
  }
  if (parsed.deliveryTo !== undefined) {
    conditions.push(sql`o.delivery_date <= ${parsed.deliveryTo}::date`);
  }
  if (parsed.createdFrom !== undefined) {
    conditions.push(
      sql`o.created_at >= (${parsed.createdFrom}::date)::timestamp AT TIME ZONE ${parsed.timeZone}`,
    );
  }
  if (parsed.createdTo !== undefined) {
    conditions.push(
      sql`o.created_at < (${parsed.createdTo}::date + 1)::timestamp AT TIME ZONE ${parsed.timeZone}`,
    );
  }
  return conditions;
}

/** The admin queue query, inside a transaction whose context is already staff. */
export async function selectAdminOrders(
  executor: OrderExecutor,
  filter: OrderQueueFilter = {},
  locale = "en",
): Promise<AdminOrderListItem[]> {
  const parsed = OrderQueueFilterSchema.parse(filter);
  const code = LocaleSchema.parse(locale);
  const conditions = queueConditions(parsed);
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

/* -------------------------------------------------------------------------- */
/* Spec 012 §2.6: the queue's head, pager and choices, and one order's detail */
/* (TASK-222). Reads only, under `app.role = 'admin'`.                        */
/* -------------------------------------------------------------------------- */

/** The audit action each read runs under (spec 012 §2.3: no trigger records a read). */
export const ORDER_READ_ACTIONS = Object.freeze({
  head: "orders.head",
  count: "orders.count",
  options: "orders.options",
  detail: "orders.detail",
} as const);

/** What the queue's poll compares: the newest order's creation instant and how many there are. */
export const OrderQueueHeadSchema = z
  .object({
    latestCreatedAt: IsoDateTime.nullable(),
    count: z.number().int().nonnegative(),
  })
  .strict();
export type OrderQueueHead = z.infer<typeof OrderQueueHeadSchema>;

/**
 * The head as an opaque strong `ETag` (`"count.latest"`): the queue's island compares it between
 * polls and never parses it, so the browser ships no schema. Equal heads, equal tags.
 */
export function orderQueueHeadTag(head: OrderQueueHead): string {
  const parsed = OrderQueueHeadSchema.parse(head);
  return `"${String(parsed.count)}.${parsed.latestCreatedAt ?? "none"}"`;
}

const HeadRow = z.object({
  latest: IsoDateTime.nullable(),
  count: Minor,
});

/** The head of every order, inside a transaction whose context is already staff. */
export async function selectOrderQueueHead(
  executor: OrderExecutor,
): Promise<OrderQueueHead> {
  const [raw] = await executor.execute(sql`
    SELECT ${placedAt(sql`max(o.created_at)`)} AS latest, count(*)::int AS count
    FROM "order" o`);
  const row = HeadRow.parse(raw);
  return OrderQueueHeadSchema.parse({
    latestCreatedAt: row.latest,
    count: row.count,
  });
}

/** How many orders match `filter`, all pages together (the pager's "of n"). */
export async function selectAdminOrderCount(
  executor: OrderExecutor,
  filter: OrderQueueFilter = {},
): Promise<number> {
  const parsed = OrderQueueFilterSchema.parse(filter);
  const [raw] = await executor.execute(sql`
    SELECT count(*)::int AS count
    FROM "order" o
    JOIN country c ON c.id = o.destination_country_id
    WHERE ${sql.join(queueConditions(parsed), sql` AND `)}`);
  return z.object({ count: Minor }).parse(raw).count;
}

/** The queue's status and destination choices. */
export const OrderQueueFilterOptionsSchema = z
  .object({
    statuses: z.array(z.string().min(1)),
    countries: z.array(
      z
        .object({ iso2: z.string().regex(/^[A-Z]{2}$/), name: z.string() })
        .strict(),
    ),
  })
  .strict();
export type OrderQueueFilterOptions = z.infer<
  typeof OrderQueueFilterOptionsSchema
>;

export async function selectOrderQueueFilterOptions(
  executor: OrderExecutor,
  locale = "en",
): Promise<OrderQueueFilterOptions> {
  const code = LocaleSchema.parse(locale);
  const statuses = await executor.execute(
    sql`SELECT key FROM order_status ORDER BY key`,
  );
  const countries = await executor.execute(sql`
    SELECT c.iso2, coalesce(${countryName(sql`c.id`, code)}, c.iso2) AS name
    FROM country c ORDER BY name, c.iso2`);
  return OrderQueueFilterOptionsSchema.parse({
    statuses: statuses.map(
      (row) => z.object({ key: z.string() }).parse(row).key,
    ),
    countries: countries.map((row) =>
      z.object({ iso2: z.string(), name: z.string() }).parse(row),
    ),
  });
}

const countryName = (countryId: SQL, locale: string): SQL => sql`(
  SELECT ctr.name FROM country_translation ctr
  WHERE ctr.country_id = ${countryId} AND ctr.locale_code IN (${locale}, 'en')
  ORDER BY (ctr.locale_code = ${locale}) DESC LIMIT 1)`;

const addonName = (addonId: SQL, locale: string): SQL => sql`(
  SELECT at.name FROM addon_translation at
  WHERE at.addon_id = ${addonId} AND at.locale_code IN (${locale}, 'en')
  ORDER BY (at.locale_code = ${locale}) DESC LIMIT 1)`;

const OrderLineKindSchema = z.enum(["product", "addon", "surcharge"]);

/** One line as the detail shows it: what it is, how many, at what VAT rate and for how much. */
export const AdminOrderLineSchema = z
  .object({
    lineId: z.uuid(),
    kind: OrderLineKindSchema,
    name: z.string().nullable(),
    tierKey: z.string().nullable(),
    qty: z.number().int().positive(),
    unitRetailMinor: z.number().int().nonnegative(),
    amountMinor: z.number().int().nonnegative(),
    vatRateBp: z.number().int().min(0).max(10_000),
  })
  .strict();

/** One `order_event` row. The payload is the stored JSON, shown raw. */
export const AdminOrderEventSchema = z
  .object({
    seq: z.number().int().positive(),
    type: z.string().min(1),
    fromStatus: z.string().nullable(),
    toStatus: z.string().nullable(),
    actor: z.string().min(1),
    occurredAt: IsoDateTime,
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();

/** One offer to a florist and its answer. */
export const AdminOrderAssignmentSchema = z
  .object({
    assignmentId: z.uuid(),
    partnerId: z.uuid(),
    partnerCode: z.string().min(1),
    attempt: z.number().int().positive(),
    offeredAt: IsoDateTime,
    answerBy: IsoDateTime,
    respondedAt: IsoDateTime.nullable(),
    response: z.enum(["accept", "decline", "timeout"]).nullable(),
    reason: z.string().nullable(),
  })
  .strict();

/** One payment row, read only: no card field exists on the table. */
export const AdminOrderPaymentSchema = z
  .object({
    paymentId: z.uuid(),
    provider: z.string().min(1),
    /** Null until the provider reports how the buyer paid. */
    method: z.string().min(1).nullable(),
    status: z.string().min(1),
    amountMinor: z.number().int().positive(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    createdAt: IsoDateTime,
    capturedAt: IsoDateTime.nullable(),
  })
  .strict();

/**
 * Spec 012 §2.6's order detail. `recipient` is `null` unless the caller asked for it; no buyer
 * snapshot, no `public_token` and no payment-card field is a key of this schema (`.strict()`).
 */
export const AdminOrderDetailSchema = z
  .object({
    orderId: z.uuid(),
    reference: z.string().regex(/^FO-[0-9A-Z]{4}-[0-9A-Z]{4}$/),
    mode: OrderModeSchema,
    status: z.string().min(1),
    buyerStatus: z.enum(BUYER_STATUSES),
    placedAt: IsoDateTime,
    deliveryDate: IsoDate,
    deliveryWindow: z.string().nullable(),
    destination: z
      .object({
        iso2: z.string().regex(/^[A-Z]{2}$/),
        name: z.string(),
        timeZone: z.string().min(1),
      })
      .strict(),
    cityName: z.string().nullable(),
    totalMinor: z.number().int().nonnegative(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    vatBreakdown: z.array(VatSplitSchema),
    lines: z.array(AdminOrderLineSchema),
    recipient: RecipientSnapshotSchema.nullable(),
    events: z.array(AdminOrderEventSchema),
    assignments: z.array(AdminOrderAssignmentSchema),
    payments: z.array(AdminOrderPaymentSchema),
  })
  .strict();
export type AdminOrderDetail = z.infer<typeof AdminOrderDetailSchema>;
export type AdminOrderLine = z.infer<typeof AdminOrderLineSchema>;
export type AdminOrderEvent = z.infer<typeof AdminOrderEventSchema>;
export type AdminOrderAssignment = z.infer<typeof AdminOrderAssignmentSchema>;
export type AdminOrderPayment = z.infer<typeof AdminOrderPaymentSchema>;

export interface OrderDetailOptions {
  /** Select the recipient snapshot; only for a viewer holding `orders.view_pii`. */
  readonly includeRecipient: boolean;
  readonly locale?: string;
}

const DetailRow = z.object({
  id: z.uuid(),
  mode: OrderModeSchema,
  status: z.string(),
  buyer_status: z.enum(BUYER_STATUSES),
  placed_at: IsoDateTime,
  delivery_date: IsoDate,
  delivery_window: z.string().nullable(),
  iso2: z.string(),
  country_name: z.string(),
  iana_zone: z.string(),
  city_name: z.string().nullable(),
  total_minor: Minor,
  currency: z.string(),
  vat_breakdown: z.array(VatSplitSchema),
  recipient_snapshot: z.unknown(),
});

const LineRow = z.object({
  id: z.uuid(),
  kind: OrderLineKindSchema,
  name: z.string().nullable(),
  tier_key: z.string().nullable(),
  qty: z.number().int(),
  unit_retail_minor: Minor,
  vat_rate_bp: z.number().int(),
});

const EventRow = z.object({
  seq: z.number().int(),
  type: z.string(),
  from_status: z.string().nullable(),
  to_status: z.string().nullable(),
  actor: z.string(),
  occurred_at: IsoDateTime,
  payload: z.record(z.string(), z.unknown()),
});

const AssignmentRow = z.object({
  id: z.uuid(),
  partner_id: z.uuid(),
  partner_code: z.string(),
  attempt: z.number().int(),
  offered_at: IsoDateTime,
  answer_by: IsoDateTime,
  responded_at: IsoDateTime.nullable(),
  response: z.enum(["accept", "decline", "timeout"]).nullable(),
  reason: z.string().nullable(),
});

const PaymentRow = z.object({
  id: z.uuid(),
  provider: z.string(),
  method: z.string().nullable(),
  status: z.string(),
  amount_minor: Minor,
  currency_code: z.string(),
  created_at: IsoDateTime,
  captured_at: IsoDateTime.nullable(),
});

/** One order's detail, inside a transaction whose context is already staff; `null` if none. */
export async function selectOrderDetail(
  executor: OrderExecutor,
  orderId: string,
  options: OrderDetailOptions,
): Promise<AdminOrderDetail | null> {
  const id = z.uuid().parse(orderId);
  const code = LocaleSchema.parse(options.locale ?? "en");
  const recipient = options.includeRecipient
    ? sql`o.recipient_snapshot`
    : sql`NULL::jsonb`;
  const [head] = await executor.execute(sql`
    SELECT o.id, o.mode, o.status, s.buyer_projection AS buyer_status,
           ${placedAt(sql`o.created_at`)} AS placed_at,
           o.delivery_date::text AS delivery_date, o.delivery_window,
           c.iso2, coalesce(${countryName(sql`c.id`, code)}, c.iso2) AS country_name,
           c.iana_zone, ${cityName(sql`o.destination_city_id`, code)} AS city_name,
           o.buyer_total_minor AS total_minor, o.buyer_currency_code AS currency,
           o.vat_breakdown, ${recipient} AS recipient_snapshot
    FROM "order" o
    JOIN order_status s ON s.key = o.status
    JOIN country c ON c.id = o.destination_country_id
    WHERE o.id = ${id}`);
  if (head === undefined) return null;
  const order = DetailRow.parse(head);
  const lines = await executor.execute(sql`
    SELECT ol.id, ol.kind, ol.tier_key, ol.qty, ol.unit_retail_minor, ol.vat_rate_bp,
           CASE ol.kind
             WHEN 'product' THEN ${productName(sql`ol.product_id`, code)}
             WHEN 'addon' THEN ${addonName(sql`ol.addon_id`, code)}
           END AS name
    FROM order_line ol
    WHERE ol.order_id = ${id}
    ORDER BY CASE ol.kind WHEN 'product' THEN 0 WHEN 'addon' THEN 1 ELSE 2 END,
             ol.created_at, ol.id`);
  const events = await executor.execute(sql`
    SELECT e.seq, e.type, e.from_status, e.to_status, e.actor, e.payload,
           ${placedAt(sql`e.occurred_at`)} AS occurred_at
    FROM order_event e
    WHERE e.order_id = ${id}
    ORDER BY e.seq`);
  const assignments = await executor.execute(sql`
    SELECT oa.id, oa.partner_id, fp.code AS partner_code, oa.attempt,
           ${placedAt(sql`oa.offered_at`)} AS offered_at,
           ${placedAt(sql`oa.sla_expires_at`)} AS answer_by,
           CASE WHEN oa.responded_at IS NULL THEN NULL
                ELSE ${placedAt(sql`oa.responded_at`)} END AS responded_at,
           oa.response, oa.reason
    FROM order_assignment oa
    JOIN fulfillment_partner fp ON fp.id = oa.partner_id
    WHERE oa.order_id = ${id}
    ORDER BY oa.attempt`);
  const payments = await executor.execute(sql`
    SELECT p.id, p.provider, p.method, p.status, p.amount_minor, p.currency_code,
           ${placedAt(sql`p.created_at`)} AS created_at,
           CASE WHEN p.captured_at IS NULL THEN NULL
                ELSE ${placedAt(sql`p.captured_at`)} END AS captured_at
    FROM payment p
    WHERE p.order_id = ${id}
    ORDER BY p.created_at, p.id`);
  return AdminOrderDetailSchema.parse({
    orderId: order.id,
    reference: orderReference(order.id),
    mode: order.mode,
    status: order.status,
    buyerStatus: order.buyer_status,
    placedAt: order.placed_at,
    deliveryDate: order.delivery_date,
    deliveryWindow: order.delivery_window,
    destination: {
      iso2: order.iso2,
      name: order.country_name,
      timeZone: order.iana_zone,
    },
    cityName: order.city_name,
    totalMinor: order.total_minor,
    currency: order.currency,
    vatBreakdown: order.vat_breakdown,
    lines: lines.map((raw) => {
      const line = LineRow.parse(raw);
      return {
        lineId: line.id,
        kind: line.kind,
        name: line.name,
        tierKey: line.tier_key,
        qty: line.qty,
        unitRetailMinor: line.unit_retail_minor,
        amountMinor: line.unit_retail_minor * line.qty,
        vatRateBp: line.vat_rate_bp,
      };
    }),
    recipient: options.includeRecipient
      ? RecipientSnapshotSchema.parse(order.recipient_snapshot)
      : null,
    events: events.map((raw) => {
      const event = EventRow.parse(raw);
      return {
        seq: event.seq,
        type: event.type,
        fromStatus: event.from_status,
        toStatus: event.to_status,
        actor: event.actor,
        occurredAt: event.occurred_at,
        payload: event.payload,
      };
    }),
    assignments: assignments.map((raw) => {
      const row = AssignmentRow.parse(raw);
      return {
        assignmentId: row.id,
        partnerId: row.partner_id,
        partnerCode: row.partner_code,
        attempt: row.attempt,
        offeredAt: row.offered_at,
        answerBy: row.answer_by,
        respondedAt: row.responded_at,
        response: row.response,
        reason: row.reason,
      };
    }),
    payments: payments.map((raw) => {
      const row = PaymentRow.parse(raw);
      return {
        paymentId: row.id,
        provider: row.provider,
        method: row.method,
        status: row.status,
        amountMinor: row.amount_minor,
        currency: row.currency_code,
        createdAt: row.created_at,
        capturedAt: row.captured_at,
      };
    }),
  });
}

/** Who reads, for the transaction's `app.user_id` and request id. */
export interface AdminReadOptions extends ListOptions {
  readonly userId?: string;
}

function adminRead<T>(
  options: AdminReadOptions,
  action: string,
  fn: (executor: OrderExecutor) => Promise<T>,
): Promise<T> {
  return withAdminContext(
    {
      ...(options.userId === undefined ? {} : { userId: options.userId }),
      requestId: options.requestId ?? randomUUID(),
      action,
    },
    (db) => fn(drizzleExecutor(db)),
  );
}

/** The queue's head (spec 012 §2.6 "Arrival within 5 s"). */
export function orderQueueHead(
  options: AdminReadOptions = {},
): Promise<OrderQueueHead> {
  return adminRead(options, ORDER_READ_ACTIONS.head, (executor) =>
    selectOrderQueueHead(executor),
  );
}

/** How many orders match `filter`. */
export function countOrdersForAdmin(
  filter: OrderQueueFilter = {},
  options: AdminReadOptions = {},
): Promise<number> {
  return adminRead(options, ORDER_READ_ACTIONS.count, (executor) =>
    selectAdminOrderCount(executor, filter),
  );
}

/** The queue's status and destination choices. */
export function orderQueueFilterOptions(
  options: AdminReadOptions = {},
): Promise<OrderQueueFilterOptions> {
  return adminRead(options, ORDER_READ_ACTIONS.options, (executor) =>
    selectOrderQueueFilterOptions(executor, options.locale),
  );
}

/** One order's detail; the recipient only when `includeRecipient` (spec 012 §2.6, AC-19). */
export function orderDetail(
  orderId: string,
  options: AdminReadOptions & OrderDetailOptions,
): Promise<AdminOrderDetail | null> {
  return adminRead(options, ORDER_READ_ACTIONS.detail, (executor) =>
    selectOrderDetail(executor, orderId, options),
  );
}
