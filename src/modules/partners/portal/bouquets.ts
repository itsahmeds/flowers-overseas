/**
 * @purpose The florist's own bouquets: `floristBouquets(ctx)` under partner RLS, strict row schema, `floristBouquetState`
 * @spec 030b
 *
 * Spec 030b §14.2 C, §14.4 (AC-52 to AC-55; TASK-444). A signed-in florist reads every
 * `partner_catalog_mapping` row of their own partner(s) and nothing else:
 *
 *  - The query runs in the florist's **partner context** (`app.role = 'partner'`,
 *    `app.partner_ids` = the memberships `requireFloristContext` admitted at this request), so
 *    Postgres row-level security decides which mappings, coverage rows and partner rows exist
 *    (`0011`: `partner_catalog_mapping_partner`, `partner_coverage_partner`,
 *    `fulfillment_partner_partner`). The explicit `partner_id = ANY(...)` filter repeats the same
 *    ids; it narrows, it never widens.
 *  - It selects exactly the columns of `FloristBouquetRowSchema` plus the four inputs of
 *    `floristBouquetState`. Saleability is one `EXISTS` (an open price in a `live` country where
 *    the partner has coverage) that returns a boolean and no price. No retail price, VAT, margin,
 *    payout share, other florist or florist count is read, and the raw row schema is strict, so a
 *    column added to the select fails the parse (AC-53).
 *  - A mapping with no size (`tier_key` null) is the florist's amount for every size of the
 *    product, so it shows once per size, unless a size-specific mapping of the same partner names
 *    that size (the same precedence the inbox's payout read uses).
 *
 * Logs `florist.bouquets_viewed` with the partner ids and the row count only (§14.7).
 */
import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { z } from "zod";

import type { FloristContext } from "@/lib/auth/florist";
import { withDbContext } from "@/lib/db";
import { logger } from "@/lib/logger";

/** A bouquet's state on the florist's page (§14.2 C). */
export const FLORIST_BOUQUET_STATES = [
  "on_sale",
  "not_yet_on_sale",
  "paused",
  "withdrawn",
] as const;
export const FloristBouquetStateSchema = z.enum(FLORIST_BOUQUET_STATES);
export type FloristBouquetState = z.infer<typeof FloristBouquetStateSchema>;

export interface FloristBouquetStateInput {
  readonly productStatus: string;
  readonly canFulfil: boolean;
  readonly partnerStatus: string;
  readonly liveCoveredPriceExists: boolean;
}

/**
 * The state of one mapping (AC-54): `withdrawn` for a retired product; `paused` when the florist
 * cannot make it or the shop is paused; `on_sale` for an active product of an active shop with an
 * open price in a live country it covers; otherwise `not_yet_on_sale` (a draft product, or no
 * such price and coverage yet).
 */
export function floristBouquetState(
  input: FloristBouquetStateInput,
): FloristBouquetState {
  if (input.productStatus === "retired") return "withdrawn";
  if (!input.canFulfil || input.partnerStatus === "paused") return "paused";
  if (
    input.productStatus === "active" &&
    input.partnerStatus === "active" &&
    input.liveCoveredPriceExists
  ) {
    return "on_sale";
  }
  return "not_yet_on_sale";
}

/** One card of `/vendor/bouquets`. No field for a retail price, VAT, margin or another florist. */
export const FloristBouquetRowSchema = z.strictObject({
  mappingId: z.uuid(),
  sku: z.string().min(1),
  productName: z.string().min(1),
  photoId: z.uuid().nullable(),
  sizeKey: z.string().min(1).nullable(),
  sizeLabelKey: z.string().min(1).nullable(),
  stems: z.number().int().positive().nullable(),
  payoutMinor: z.bigint().nonnegative(),
  currency: z.string().regex(/^[A-Z]{3}$/u),
  state: FloristBouquetStateSchema,
});
export type FloristBouquetRow = z.infer<typeof FloristBouquetRowSchema>;

/** The statement's row, before the state is decided. Strict: an extra column is refused. */
const RawRowSchema = z.strictObject({
  mapping_id: z.uuid(),
  sku: z.string().min(1),
  product_name: z.string().min(1),
  photo_id: z.uuid().nullable(),
  size_key: z.string().nullable(),
  size_label_key: z.string().nullable(),
  stems: z.coerce.number().int().positive().nullable(),
  payout_minor: z.union([z.string(), z.number(), z.bigint()]),
  currency: z.string(),
  product_status: z.string(),
  can_fulfil: z.boolean(),
  partner_status: z.string(),
  live_covered: z.boolean(),
});

const LanguageSchema = z.enum(["en", "pl", "de"]);

/** What the statement runs on: a Drizzle transaction, or a raw executor in tests. */
export interface BouquetExecutor {
  execute(query: ReturnType<typeof sql>): PromiseLike<unknown>;
}

/**
 * The statement itself, inside a transaction whose context is already the florist's partner
 * context. Exported for the PG16 suite; pages call `floristBouquets`.
 */
export async function selectFloristBouquets(
  executor: BouquetExecutor,
  options: { readonly locale: string; readonly partnerIds: readonly string[] },
): Promise<FloristBouquetRow[]> {
  const locale = LanguageSchema.parse(options.locale);
  const partnerIds = z.array(z.uuid()).parse(options.partnerIds);
  if (partnerIds.length === 0) return [];
  const ids = sql.join(
    partnerIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  const rows = (await executor.execute(sql`
    SELECT DISTINCT ON (m.partner_id, p.sku, t.sort, t.tier_key)
           m.id AS mapping_id,
           p.sku,
           coalesce((
             SELECT pt.name FROM product_translation pt
             WHERE pt.product_id = p.id AND pt.locale_code IN (${locale}, 'en')
             ORDER BY (pt.locale_code = ${locale}) DESC LIMIT 1
           ), p.sku) AS product_name,
           (SELECT pm.media_asset_id FROM product_media pm
             JOIN media_asset ma ON ma.id = pm.media_asset_id AND ma.visibility = 'public'
             WHERE pm.product_id = p.id AND pm.is_primary LIMIT 1) AS photo_id,
           t.tier_key AS size_key,
           t.label_key AS size_label_key,
           coalesce(t.stems, p.stem_count) AS stems,
           m.partner_payout_minor AS payout_minor,
           m.currency_code AS currency,
           p.status AS product_status,
           m.can_fulfil,
           fp.status AS partner_status,
           EXISTS (
             SELECT 1 FROM country_price cp
             JOIN country c ON c.id = cp.country_id AND c.status = 'live'
             WHERE cp.product_id = p.id
               AND (cp.tier_key IS NULL OR cp.tier_key IS NOT DISTINCT FROM t.tier_key)
               AND cp.surcharge_kind IS NULL
               AND cp.active_from <= current_date
               AND (cp.active_to IS NULL OR cp.active_to > current_date)
               AND EXISTS (
                 SELECT 1 FROM partner_coverage pc
                 LEFT JOIN city ci ON ci.id = pc.city_id
                 LEFT JOIN postcode_zone z ON z.id = pc.postcode_zone_id
                 WHERE pc.partner_id = m.partner_id
                   AND coalesce(ci.country_id, z.country_id) = cp.country_id
               )
           ) AS live_covered
    FROM partner_catalog_mapping m
    JOIN fulfillment_partner fp ON fp.id = m.partner_id
    JOIN product p ON p.id = m.product_id
    LEFT JOIN product_tier t
      ON t.product_id = m.product_id AND (m.tier_key IS NULL OR t.tier_key = m.tier_key)
    WHERE m.partner_id IN (${ids})
    ORDER BY m.partner_id, p.sku, t.sort, t.tier_key, (m.tier_key IS NULL), m.id`)) as readonly unknown[];
  return rows.map((raw) => {
    const row = RawRowSchema.parse(raw);
    return FloristBouquetRowSchema.parse({
      mappingId: row.mapping_id,
      sku: row.sku,
      productName: row.product_name,
      photoId: row.photo_id,
      sizeKey: row.size_key,
      sizeLabelKey: row.size_label_key,
      stems: row.stems,
      payoutMinor: BigInt(row.payout_minor),
      currency: row.currency,
      state: floristBouquetState({
        productStatus: row.product_status,
        canFulfil: row.can_fulfil,
        partnerStatus: row.partner_status,
        liveCoveredPriceExists: row.live_covered,
      }),
    });
  });
}

/** `floristBouquets(ctx)` (§14.4): the signed-in member's bouquets, under partner context. */
export async function floristBouquets(
  ctx: FloristContext,
  options: { readonly requestId?: string } = {},
): Promise<FloristBouquetRow[]> {
  const partnerIds = ctx.memberships.map((membership) => membership.partnerId);
  const rows = await withDbContext(
    {
      role: "partner",
      userId: ctx.userId,
      partnerIds,
      requestId: options.requestId ?? randomUUID(),
    },
    (db) => selectFloristBouquets(db, { locale: ctx.locale, partnerIds }),
  );
  logger.info(
    { partner_ids: partnerIds, rows: rows.length },
    "florist.bouquets_viewed",
  );
  return rows;
}
