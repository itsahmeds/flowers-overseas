/**
 * What a florist message reads about one assignment, at send time, through the delivery's own
 * transaction (spec 016 §5.2 "V1": product, tier, add-ons, date, town and postcode, payout in the
 * florist's currency, answer-by time; §8 "Minimisation"; TASK-332).
 *
 * The same facts the florist inbox shows before acceptance (`src/modules/orders/florist/read.ts`),
 * read the same way: the product's and the town's names in the florist's language (else English),
 * the add-ons as `catalog.addon.*` keys, the destination's zone, and what the florist receives,
 * i.e. the order lines' `partner_payout_minor` where the order carries it, else the florist's
 * `partner_catalog_mapping` for the product and tier. From the recipient snapshot only the
 * **postcode and the town** are read, and only as a fallback; no buyer column is selected at all.
 * The query runs in the pipeline's `system` context, so it reads `"order"` and `order_line` directly.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import type { FloristLanguage } from "@/config/florists";
import type { OrderExecutor } from "@/modules/orders";

import { type FloristMessageFacts, FloristMessageFactsSchema } from "./florist";

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
    ctx.addIssue({ code: "custom", message: "not a non-negative integer" });
    return z.NEVER;
  }
  return number;
});

const FactsRow = z.object({
  assignment_id: z.uuid(),
  sla_expires_at: Instant,
  delivery_date: z.iso.date(),
  time_zone: z.string().min(3),
  postcode: z.string().nullable(),
  town: z.string().nullable(),
  product_name: z.string().nullable(),
  tier_label_key: z.string().nullable(),
  tier_stems: z.coerce.number().int().positive().nullable(),
  addon_keys: z.array(z.string()).nullable(),
  line_payout_minor: Minor.nullable(),
  line_payout_currencies: z.coerce.number().int().nonnegative(),
  line_payout_currency: z.string().nullable(),
  mapping_payout_minor: Minor.nullable(),
  mapping_currency: z.string().nullable(),
  partner_code: z.string().min(1),
  partner_name: z.string().min(1),
});
type Row = z.infer<typeof FactsRow>;

/** A message the order's data cannot fill: thrown, so the delivery is retried, then `dead`. */
export class FloristFactsMissing extends Error {
  readonly code = "EMAIL_FACTS_MISSING";

  constructor(what: string) {
    super(`EMAIL_FACTS_MISSING: ${what}`);
    this.name = "FloristFactsMissing";
  }
}

function payoutOf(row: Row): { amountMinor: number; currency: string } | null {
  if (row.line_payout_minor !== null) {
    if (row.line_payout_currencies !== 1 || row.line_payout_currency === null)
      return null;
    return {
      amountMinor: row.line_payout_minor,
      currency: row.line_payout_currency,
    };
  }
  if (row.mapping_payout_minor === null || row.mapping_currency === null)
    return null;
  return {
    amountMinor: row.mapping_payout_minor,
    currency: row.mapping_currency,
  };
}

/** The facts of `assignmentId` in `language`, for V1 to V5 and the W copy. */
export async function loadFloristMessageFacts(
  executor: OrderExecutor,
  assignmentId: string,
  language: FloristLanguage,
): Promise<FloristMessageFacts> {
  const [found] = await executor.execute(sql`
    SELECT a.id AS assignment_id, a.sla_expires_at,
           o.delivery_date::text AS delivery_date,
           coalesce(ci.iana_zone, c.iana_zone) AS time_zone,
           coalesce(o.destination_postcode, o.recipient_snapshot ->> 'postcode') AS postcode,
           coalesce((
             SELECT ct.name FROM city_translation ct
             WHERE ct.city_id = o.destination_city_id AND ct.locale_code IN (${language}, 'en')
             ORDER BY (ct.locale_code = ${language}) DESC LIMIT 1
           ), o.recipient_snapshot ->> 'city') AS town,
           (SELECT pt.name FROM product_translation pt
             WHERE pt.product_id = pl.product_id AND pt.locale_code IN (${language}, 'en')
             ORDER BY (pt.locale_code = ${language}) DESC LIMIT 1) AS product_name,
           t.label_key AS tier_label_key, t.stems AS tier_stems,
           (SELECT array_agg('catalog.addon.' || ad.key || '.name' ORDER BY ad.key)
             FROM order_line al JOIN addon ad ON ad.id = al.addon_id
             WHERE al.order_id = o.id AND al.kind = 'addon') AS addon_keys,
           (SELECT sum(l.partner_payout_minor) FROM order_line l
             WHERE l.order_id = o.id AND l.partner_payout_minor IS NOT NULL) AS line_payout_minor,
           (SELECT count(DISTINCT l.payout_currency_code) FROM order_line l
             WHERE l.order_id = o.id AND l.partner_payout_minor IS NOT NULL)
             AS line_payout_currencies,
           (SELECT min(l.payout_currency_code) FROM order_line l
             WHERE l.order_id = o.id AND l.partner_payout_minor IS NOT NULL)
             AS line_payout_currency,
           m.partner_payout_minor AS mapping_payout_minor, m.currency_code AS mapping_currency,
           p.code AS partner_code, p.legal_name AS partner_name
    FROM order_assignment a
    JOIN "order" o ON o.id = a.order_id
    JOIN fulfillment_partner p ON p.id = a.partner_id
    JOIN country c ON c.id = o.destination_country_id
    LEFT JOIN city ci ON ci.id = o.destination_city_id
    LEFT JOIN LATERAL (
      SELECT l.product_id, l.tier_key FROM order_line l
      WHERE l.order_id = o.id AND l.kind = 'product'
      ORDER BY l.id LIMIT 1
    ) pl ON true
    LEFT JOIN product_tier t ON t.product_id = pl.product_id AND t.tier_key = pl.tier_key
    LEFT JOIN LATERAL (
      SELECT mm.partner_payout_minor, mm.currency_code FROM partner_catalog_mapping mm
      WHERE mm.partner_id = a.partner_id AND mm.product_id = pl.product_id
        AND (mm.tier_key = pl.tier_key OR mm.tier_key IS NULL)
      ORDER BY (mm.tier_key IS NULL), mm.id LIMIT 1
    ) m ON true
    WHERE a.id = ${assignmentId}`);
  if (found === undefined) {
    throw new FloristFactsMissing("the assignment does not exist");
  }
  const row = FactsRow.parse(found);
  if (
    row.product_name === null ||
    row.tier_label_key === null ||
    row.town === null ||
    row.postcode === null
  ) {
    throw new FloristFactsMissing(
      "the order has no product, tier, town or postcode to show",
    );
  }
  return FloristMessageFactsSchema.parse({
    assignmentId: row.assignment_id,
    productName: row.product_name,
    tierLabelKey: row.tier_label_key,
    tierStems: row.tier_stems,
    addonKeys: row.addon_keys ?? [],
    deliveryDate: row.delivery_date,
    timeZone: row.time_zone,
    town: row.town,
    postcode: row.postcode,
    payout: payoutOf(row),
    answerBy: row.sla_expires_at,
    partnerCode: row.partner_code,
    partnerName: row.partner_name,
  });
}
