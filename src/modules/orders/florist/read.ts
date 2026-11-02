/**
 * The florist inbox's read models (spec 011 §5.2 "Orders", read models; AC-23, AC-24, AC-25;
 * ruling R4; TASK-214).
 *
 *  - `listFloristAssignments(ctx)` → `FloristAssignmentListItem[]`, the inbox list;
 *  - `floristOrderView(ctx, assignmentId)` → `FloristOrderView | null`, one order page.
 *
 * Both run under the florist's **partner context** (`app.role = 'partner'`, `app.partner_ids` =
 * their partners) and read only through `partner_order` and `partner_order_line` (`0011`), never
 * `"order"` or `order_line`, so the database's `app_partner_sees_order` decides which orders a
 * florist sees, and `order_assignment`'s own policy shows them only their own assignments. The
 * list is built on R4's one partner-scoped base query, `selectPartnerOrders` (TASK-202), and adds
 * the assignment, payout and answer-by facts for the orders it returned.
 *
 * Minimisation (§8): no buyer column is selected anywhere (the views do not even carry one).
 * The recipient snapshot is selected **only** for a stage that prints it (`accepted`,
 * `outForDelivery`, `delivered`), in a second statement after the stage is decided; before
 * acceptance only its town and postcode are read. The returned shapes are TASK-210's schemas,
 * parsed, so a field the type does not carry cannot leave this file.
 *
 * What the florist receives: the order lines' `partner_payout_minor` where the order carries it
 * (`placeDemoOrder`), else the florist's `partner_catalog_mapping` for the product and tier (an
 * order from spec 010's checkout), the same figure either way. An order with neither is not
 * listed and logs `florists.inbox_no_payout` with its assignment id only.
 *
 * Withdrawn (spec 016 §5.3, TASK-330): an assignment with `withdrawn_at` shows the "no longer
 * yours" stage with no recipient field and no payout, in the list until its delivery date passes.
 */
import { randomUUID } from "node:crypto";

import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";

import { type DbContextInput, withDbContext } from "@/lib/db";
import { logger } from "@/lib/logger";
import { zonedDate } from "@/modules/geo";
import { formatAddressBlock } from "@/modules/i18n";
import {
  type FloristAssignmentListItem,
  FloristAssignmentListItemSchema,
  type FloristOrderView,
  FloristOrderViewSchema,
  type FloristRecipient,
  listGroupOf,
} from "@/modules/partners";

import { selectPartnerOrders } from "../queries";
import { drizzleExecutor, type OrderExecutor } from "../service/executor";
import { RecipientSnapshotSchema } from "../service/place";

import { floristStageOf } from "./stage";

/** A florist language, as `partner_member.locale_code` stores it. */
const LocaleSchema = z.enum(["en", "pl", "de"]);

const Instant = z.union([z.date(), z.string()]).transform((value, ctx) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    ctx.addIssue({ code: "custom", message: "not an instant" });
    return z.NEVER;
  }
  return date;
});

const Minor = z.union([z.number(), z.string()]).transform((value, ctx) => {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    ctx.addIssue({
      code: "custom",
      message: "not a non-negative safe integer",
    });
    return z.NEVER;
  }
  return number;
});

const FactsRow = z.object({
  assignment_id: z.uuid(),
  order_id: z.uuid(),
  response: z.enum(["accept"]).nullable(),
  sla_expires_at: Instant,
  withdrawn_at: Instant.nullable(),
  status: z.string().min(1),
  delivery_date: z.iso.date(),
  country_iso2: z.string().regex(/^[A-Z]{2}$/u),
  time_zone: z.string().min(1),
  postcode: z.string().nullable(),
  town: z.string().nullable(),
  product_name: z.string().nullable(),
  sku: z.string().nullable(),
  tier_label_key: z.string().nullable(),
  tier_stems: z.coerce.number().int().positive().nullable(),
  addon_keys: z.array(z.string()).nullable(),
  line_payout_minor: Minor.nullable(),
  line_payout_currencies: z.coerce.number().int().nonnegative(),
  line_payout_currency: z.string().nullable(),
  mapping_payout_minor: Minor.nullable(),
  mapping_currency: z.string().nullable(),
  has_photo: z.boolean(),
});
type Facts = z.infer<typeof FactsRow>;

/**
 * The facts of the florist's live assignments (open or accepted), filtered by `where`, inside a
 * transaction whose context is already a partner's.
 */
async function selectFacts(
  executor: OrderExecutor,
  where: SQL,
  locale: string,
): Promise<Facts[]> {
  const code = LocaleSchema.parse(locale);
  const rows = await executor.execute(sql`
    SELECT a.id AS assignment_id, a.order_id, a.response, a.sla_expires_at, a.withdrawn_at,
           o.status, o.delivery_date::text AS delivery_date,
           c.iso2 AS country_iso2, coalesce(ci.iana_zone, c.iana_zone) AS time_zone,
           coalesce(o.destination_postcode, o.recipient_snapshot ->> 'postcode') AS postcode,
           coalesce((
             SELECT ct.name FROM city_translation ct
             WHERE ct.city_id = o.destination_city_id AND ct.locale_code IN (${code}, 'en')
             ORDER BY (ct.locale_code = ${code}) DESC LIMIT 1
           ), o.recipient_snapshot ->> 'city') AS town,
           (SELECT pt.name FROM product_translation pt
             WHERE pt.product_id = pl.product_id AND pt.locale_code IN (${code}, 'en')
             ORDER BY (pt.locale_code = ${code}) DESC LIMIT 1) AS product_name,
           p.sku, t.label_key AS tier_label_key, t.stems AS tier_stems,
           (SELECT array_agg('catalog.addon.' || ad.key || '.name' ORDER BY ad.key)
             FROM partner_order_line al JOIN addon ad ON ad.id = al.addon_id
             WHERE al.order_id = o.id AND al.kind = 'addon') AS addon_keys,
           (SELECT sum(l.partner_payout_minor) FROM partner_order_line l
             WHERE l.order_id = o.id AND l.partner_payout_minor IS NOT NULL) AS line_payout_minor,
           (SELECT count(DISTINCT l.payout_currency_code) FROM partner_order_line l
             WHERE l.order_id = o.id AND l.partner_payout_minor IS NOT NULL)
             AS line_payout_currencies,
           (SELECT min(l.payout_currency_code) FROM partner_order_line l
             WHERE l.order_id = o.id AND l.partner_payout_minor IS NOT NULL)
             AS line_payout_currency,
           m.partner_payout_minor AS mapping_payout_minor, m.currency_code AS mapping_currency,
           EXISTS (SELECT 1 FROM delivery_proof d WHERE d.order_id = o.id) AS has_photo
    FROM order_assignment a
    JOIN partner_order o ON o.id = a.order_id
    JOIN country c ON c.id = o.destination_country_id
    LEFT JOIN city ci ON ci.id = o.destination_city_id
    LEFT JOIN LATERAL (
      SELECT l.product_id, l.tier_key FROM partner_order_line l
      WHERE l.order_id = o.id AND l.kind = 'product'
      ORDER BY l.id LIMIT 1
    ) pl ON true
    LEFT JOIN product p ON p.id = pl.product_id
    LEFT JOIN product_tier t ON t.product_id = pl.product_id AND t.tier_key = pl.tier_key
    LEFT JOIN LATERAL (
      SELECT mm.partner_payout_minor, mm.currency_code FROM partner_catalog_mapping mm
      WHERE mm.partner_id = a.partner_id AND mm.product_id = pl.product_id
        AND (mm.tier_key = pl.tier_key OR mm.tier_key IS NULL)
      ORDER BY (mm.tier_key IS NULL), mm.id LIMIT 1
    ) m ON true
    WHERE (a.response IS NULL OR a.response = 'accept') AND ${where}
    ORDER BY a.sla_expires_at, a.id`);
  return rows.map((row) => FactsRow.parse(row));
}

/** What the florist receives for these facts, or `null` when nothing says. */
function payoutOf(
  facts: Facts,
): { amountMinor: number; currency: string } | null {
  if (facts.line_payout_minor !== null) {
    if (
      facts.line_payout_currencies !== 1 ||
      facts.line_payout_currency === null
    ) {
      return null;
    }
    return {
      amountMinor: facts.line_payout_minor,
      currency: facts.line_payout_currency,
    };
  }
  if (facts.mapping_payout_minor === null || facts.mapping_currency === null) {
    return null;
  }
  return {
    amountMinor: facts.mapping_payout_minor,
    currency: facts.mapping_currency,
  };
}

/** The fields every stage shares, or `null` (logged) when the order cannot be shown. */
function baseOf(facts: Facts, productName: string | null) {
  const name = productName ?? facts.product_name;
  const payout = payoutOf(facts);
  if (
    name === null ||
    facts.sku === null ||
    facts.tier_label_key === null ||
    facts.town === null ||
    facts.postcode === null ||
    payout === null
  ) {
    logger.warn(
      { assignment_id: facts.assignment_id, payout: payout !== null },
      "florists.inbox_no_payout",
    );
    return null;
  }
  return {
    assignmentId: facts.assignment_id,
    product: {
      sku: facts.sku,
      name,
      tier: { labelKey: facts.tier_label_key, stems: facts.tier_stems },
      addonNameKeys: facts.addon_keys ?? [],
    },
    delivery: {
      date: facts.delivery_date,
      timeZone: facts.time_zone,
      countryIso2: facts.country_iso2,
      town: facts.town,
      postcode: facts.postcode,
    },
    payout,
  };
}

/** The recipient as the order page prints it, read only for a stage that carries one. */
async function selectRecipient(
  executor: OrderExecutor,
  orderId: string,
  countryIso2: string,
): Promise<FloristRecipient> {
  const [row] = await executor.execute(sql`
    SELECT recipient_snapshot FROM partner_order WHERE id = ${orderId}`);
  const snapshot = RecipientSnapshotSchema.parse(
    z.object({ recipient_snapshot: z.unknown() }).parse(row).recipient_snapshot,
  );
  const locality = formatAddressBlock(
    {
      ...(snapshot.postcode === undefined
        ? {}
        : { postcode: snapshot.postcode }),
      city: snapshot.city,
    },
    countryIso2,
  );
  return {
    fullName: snapshot.fullName,
    phoneE164: snapshot.phoneE164,
    addressLines: [...snapshot.addressLines, ...locality],
    ...(snapshot.deliveryNote === undefined || snapshot.deliveryNote === ""
      ? {}
      : { deliveryNote: snapshot.deliveryNote }),
    ...(snapshot.cardMessage === undefined || snapshot.cardMessage === ""
      ? {}
      : { cardMessage: snapshot.cardMessage }),
  };
}

export interface FloristReadOptions {
  /** The member's language: product and town names, `en` where a translation is missing. */
  readonly locale?: string;
  /** The clock an open offer's answer-by time is compared with (tests pin it). */
  readonly now?: Date;
}

/** The order list of §2, inside a partner-context transaction (`executor`). */
export async function selectFloristAssignments(
  executor: OrderExecutor,
  options: FloristReadOptions = {},
): Promise<FloristAssignmentListItem[]> {
  const locale = options.locale ?? "en";
  const now = options.now ?? new Date();
  const orders = await selectPartnerOrders(executor, locale);
  if (orders.length === 0) return [];
  const names = new Map(
    orders.map((order) => [order.orderId, order.productName]),
  );
  const ids = orders.map((order) => sql`${order.orderId}::uuid`);
  const facts = await selectFacts(
    executor,
    sql`a.order_id IN (${sql.join(ids, sql`, `)})`,
    locale,
  );
  const items: FloristAssignmentListItem[] = [];
  for (const fact of facts) {
    const stage = floristStageOf(
      {
        status: fact.status,
        response: fact.response,
        slaExpiresAt: fact.sla_expires_at,
        withdrawnAt: fact.withdrawn_at,
        hasPhoto: fact.has_photo,
      },
      now,
    );
    if (stage === null) continue;
    const base = baseOf(fact, names.get(fact.order_id) ?? null);
    if (base === null) continue;
    if (stage === "withdrawn" && withdrawnGone(base.delivery, now)) continue;
    items.push(
      FloristAssignmentListItemSchema.parse({
        assignmentId: base.assignmentId,
        stage,
        product: base.product,
        delivery: base.delivery,
        ...(stage === "withdrawn" ? {} : { payout: base.payout }),
        ...(stage === "offer"
          ? { answerBy: fact.sla_expires_at.toISOString() }
          : {}),
      }),
    );
  }
  return sortItems(items);
}

/**
 * A withdrawn order is listed under "In progress" until its delivery date passes in the
 * destination's zone, then it is gone from the list (spec 016 §5.3; TASK-330).
 */
export function withdrawnGone(
  delivery: { readonly date: string; readonly timeZone: string },
  now: Date,
): boolean {
  return zonedDate(now, delivery.timeZone) > delivery.date;
}

/** Within a group: open offers by the time to answer, then by delivery date; stable by id. */
function sortItems(
  items: FloristAssignmentListItem[],
): FloristAssignmentListItem[] {
  const groupRank = { waiting: 0, inProgress: 1, delivered: 2 } as const;
  return [...items].sort((left, right) => {
    const group =
      groupRank[listGroupOf(left.stage)] - groupRank[listGroupOf(right.stage)];
    if (group !== 0) return group;
    const answer = (left.answerBy ?? "").localeCompare(right.answerBy ?? "");
    if (answer !== 0) return answer;
    const date = left.delivery.date.localeCompare(right.delivery.date);
    if (date !== 0) return date;
    return left.assignmentId.localeCompare(right.assignmentId);
  });
}

/** One order page of §2, inside a partner-context transaction; `null` is a 404. */
export async function selectFloristOrderView(
  executor: OrderExecutor,
  assignmentId: string,
  options: FloristReadOptions = {},
): Promise<FloristOrderView | null> {
  if (!z.uuid().safeParse(assignmentId).success) return null;
  const now = options.now ?? new Date();
  const [fact] = await selectFacts(
    executor,
    sql`a.id = ${assignmentId}`,
    options.locale ?? "en",
  );
  if (fact === undefined) return null;
  const stage = floristStageOf(
    {
      status: fact.status,
      response: fact.response,
      slaExpiresAt: fact.sla_expires_at,
      withdrawnAt: fact.withdrawn_at,
      hasPhoto: fact.has_photo,
    },
    now,
  );
  if (stage === null) return null;
  const base = baseOf(fact, null);
  if (base === null) return null;
  switch (stage) {
    case "offer":
      return FloristOrderViewSchema.parse({
        stage,
        ...base,
        answerBy: fact.sla_expires_at.toISOString(),
      });
    case "expired":
    case "photoReceived":
      return FloristOrderViewSchema.parse({ stage, ...base });
    case "withdrawn":
      return FloristOrderViewSchema.parse({
        stage,
        assignmentId: base.assignmentId,
        product: base.product,
        delivery: base.delivery,
      });
    case "accepted":
    case "outForDelivery":
    case "delivered":
      return FloristOrderViewSchema.parse({
        stage,
        ...base,
        recipient: await selectRecipient(
          executor,
          fact.order_id,
          fact.country_iso2,
        ),
      });
  }
}

/** The partner context a florist request reads under (`toDbContext()` of `lib/auth/florist`). */
export type FloristReadContext = DbContextInput & { readonly role: "partner" };

function partnerContext(ctx: FloristReadContext): DbContextInput {
  return {
    role: "partner",
    partnerIds: ctx.partnerIds ?? [],
    ...(ctx.userId === undefined ? {} : { userId: ctx.userId }),
    requestId: ctx.requestId ?? randomUUID(),
  };
}

/** `listFloristAssignments(ctx)` (§5.2): the signed-in member's list, under partner context. */
export function listFloristAssignments(
  ctx: FloristReadContext,
  options: FloristReadOptions = {},
): Promise<FloristAssignmentListItem[]> {
  return withDbContext(partnerContext(ctx), (db) =>
    selectFloristAssignments(drizzleExecutor(db), options),
  );
}

/** `floristOrderView(ctx, assignmentId)` (§5.2): one order, or `null` (404), under partner context. */
export function floristOrderView(
  ctx: FloristReadContext,
  assignmentId: string,
  options: FloristReadOptions = {},
): Promise<FloristOrderView | null> {
  return withDbContext(partnerContext(ctx), (db) =>
    selectFloristOrderView(drizzleExecutor(db), assignmentId, options),
  );
}
