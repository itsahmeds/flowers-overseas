/**
 * Drizzle definitions for the media tables — `media_asset`, `media_variant`, `product_media` and
 * `product_media_alt` (spec 002 §5.1 "Media, per ADR-0015", §8, AC-11, AC-22; §14 A1 (c);
 * migration `0004_media.sql`; TASK-017).
 *
 * The typed mirror of the hand-written migration, as `catalog.ts` is of `0003`. What to read off
 * this file:
 *
 *  - **keys, never bytes** (ADR-0015, AC-22) — an asset is a bucket, an `objectKey`, dimensions,
 *    a byte count and a SHA-256. No column holds binary data; the bytes are in R2, reached through
 *    `src/lib/storage.ts`;
 *  - **one primary image per product** (AC-11) — `product_media_primary_idx`, partial on
 *    `is_primary`;
 *  - **alt text per locale, stored and never blank** (AC-11, `plan/01` §6);
 *  - **provenance as columns** (§14 A1 (c)) — an `approved` asset names its reviewer, and a
 *    delivery-depicting asset is never AI-generated.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { product } from "./catalog.ts";
import { locale, timestamps } from "./i18n.ts";

/** `media_asset.kind` — which bucket and key prefix: `ObjectKind` minus `backup` (no asset row). */
export const mediaAssetKinds = [
  "product",
  "delivery_proof",
  "brand",
  "partner",
] as const;

/** `media_asset.visibility` — public assets are served from `R2_PUBLIC_BASE_URL`; private ones by signed URL. */
export const mediaVisibilities = ["public", "private"] as const;

/** `media_asset.source` — who made the picture (spec 006 §2). */
export const mediaSources = ["ai", "photo", "partner"] as const;

/** `media_asset.depicts` — what the picture shows (§14 A1 (c), spec 006 §2). */
export const mediaDepicts = [
  "product",
  "brand",
  "context",
  "delivery",
] as const;

/** `media_asset.review_state` — the founder's sign-off (spec 006 §2.4). */
export const mediaReviewStates = ["pending", "approved", "rejected"] as const;

/** `media_variant.format` — AVIF + WebP for the ladder, one JPEG for OG/email (spec 006 Q5). */
export const mediaFormats = ["avif", "webp", "jpeg"] as const;

/** `('a', 'b')` for a `CHECK … IN` list. */
function valueList(values: readonly string[]): string {
  return `(${values.map((value) => `'${value}'`).join(", ")})`;
}

/** The object-key alphabet `objectKey()` produces: lowercase `/`-separated segments, no `..`. */
const OBJECT_KEY_PATTERN = "^[a-z0-9][a-z0-9._-]*(/[a-z0-9][a-z0-9._-]*)*$";

export const mediaAsset = pgTable(
  "media_asset",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(),
    bucket: text("bucket").notNull(),
    objectKey: text("object_key").notNull(),
    mime: text("mime").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    bytes: bigint("bytes", { mode: "number" }).notNull(),
    checksumSha256: text("checksum_sha256").notNull(),
    visibility: text("visibility").notNull().default("private"),
    source: text("source").notNull(),
    depicts: text("depicts").notNull(),
    generatorModel: text("generator_model"),
    generatorPromptHash: text("generator_prompt_hash"),
    generatorSeed: text("generator_seed"),
    credit: text("credit"),
    licence: text("licence"),
    exifStripped: boolean("exif_stripped").notNull().default(false),
    reviewState: text("review_state").notNull().default("pending"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    unique("media_asset_object_key_key").on(table.objectKey),
    check(
      "media_asset_kind_check",
      sql.raw(`kind in ${valueList(mediaAssetKinds)}`),
    ),
    check(
      "media_asset_bucket_check",
      sql.raw(`bucket ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$'`),
    ),
    check(
      "media_asset_object_key_check",
      sql.raw(
        `object_key ~ '${OBJECT_KEY_PATTERN}' and object_key !~ '\\.\\.'`,
      ),
    ),
    check(
      "media_asset_mime_check",
      sql.raw(`mime ~ '^(image|application)/[a-z0-9.+-]+$'`),
    ),
    check(
      "media_asset_dimensions_check",
      sql`${table.width} > 0 and ${table.height} > 0`,
    ),
    check("media_asset_bytes_check", sql`${table.bytes} > 0`),
    check(
      "media_asset_checksum_sha256_check",
      sql.raw(`checksum_sha256 ~ '^[0-9a-f]{64}$'`),
    ),
    check(
      "media_asset_visibility_check",
      sql.raw(`visibility in ${valueList(mediaVisibilities)}`),
    ),
    check(
      "media_asset_source_check",
      sql.raw(`source in ${valueList(mediaSources)}`),
    ),
    check(
      "media_asset_depicts_check",
      sql.raw(`depicts in ${valueList(mediaDepicts)}`),
    ),
    check(
      "media_asset_review_state_check",
      sql.raw(`review_state in ${valueList(mediaReviewStates)}`),
    ),
    check(
      "media_asset_reviewed_check",
      sql`${table.reviewState} <> 'approved' or (${table.reviewedBy} is not null and ${table.reviewedAt} is not null)`,
    ),
    check(
      "media_asset_delivery_not_ai_check",
      sql`not (${table.depicts} = 'delivery' and ${table.source} = 'ai')`,
    ),
  ],
);

/** Filled once by `media.derive_variants`; a re-encode replaces the row, so no `updated_at`. */
export const mediaVariant = pgTable(
  "media_variant",
  {
    mediaAssetId: uuid("media_asset_id")
      .notNull()
      .references(() => mediaAsset.id, { onDelete: "cascade" }),
    variant: text("variant").notNull(),
    objectKey: text("object_key").notNull(),
    format: text("format").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    bytes: bigint("bytes", { mode: "number" }).notNull(),
    checksumSha256: text("checksum_sha256").notNull(),
    createdAt: timestamps.createdAt,
  },
  (table) => [
    primaryKey({
      name: "media_variant_pkey",
      columns: [table.mediaAssetId, table.variant, table.format],
    }),
    unique("media_variant_object_key_key").on(table.objectKey),
    check(
      "media_variant_variant_check",
      sql.raw(`variant ~ '^[a-z0-9]+(_[a-z0-9]+)*$'`),
    ),
    check(
      "media_variant_object_key_check",
      sql.raw(
        `object_key ~ '${OBJECT_KEY_PATTERN}' and object_key !~ '\\.\\.'`,
      ),
    ),
    check(
      "media_variant_format_check",
      sql.raw(`format in ${valueList(mediaFormats)}`),
    ),
    check(
      "media_variant_dimensions_check",
      sql`${table.width} > 0 and ${table.height} > 0`,
    ),
    check("media_variant_bytes_check", sql`${table.bytes} > 0`),
    check(
      "media_variant_checksum_sha256_check",
      sql.raw(`checksum_sha256 ~ '^[0-9a-f]{64}$'`),
    ),
  ],
);

export const productMedia = pgTable(
  "product_media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    mediaAssetId: uuid("media_asset_id")
      .notNull()
      .references(() => mediaAsset.id, { onDelete: "restrict" }),
    sort: integer("sort").notNull().default(0),
    isPrimary: boolean("is_primary").notNull().default(false),
    ...timestamps,
  },
  (table) => [
    unique("product_media_product_asset_key").on(
      table.productId,
      table.mediaAssetId,
    ),
    check("product_media_sort_check", sql`${table.sort} >= 0`),
    /** AC-11: at most one primary image per product. */
    uniqueIndex("product_media_primary_idx")
      .on(table.productId)
      .where(sql`is_primary`),
    index("product_media_asset_idx").on(table.mediaAssetId),
  ],
);

/** Alt text per locale: stored, `NOT NULL`, never blank, never generated at render (`plan/01` §6). */
export const productMediaAlt = pgTable(
  "product_media_alt",
  {
    productMediaId: uuid("product_media_id")
      .notNull()
      .references(() => productMedia.id, { onDelete: "cascade" }),
    localeCode: text("locale_code")
      .notNull()
      .references(() => locale.code, { onDelete: "restrict" }),
    alt: text("alt").notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      name: "product_media_alt_pkey",
      columns: [table.productMediaId, table.localeCode],
    }),
    check("product_media_alt_alt_check", sql.raw(`alt ~ '[^[:space:]]'`)),
  ],
);
