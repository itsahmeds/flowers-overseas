/**
 * Drizzle definitions for the media tables — `media_asset`, `media_variant`, `product_media` and
 * `product_media_alt` (spec 002 §5.1, §8, AC-10, AC-11, AC-22; §14 A1 (c); ADR-0015; migration
 * `0004_media.sql`; TASK-017).
 *
 * The typed mirror of the migration, as `catalog.ts` is of `0003`: the applied SQL is hand-written
 * and `pnpm db:check` compares the two sides table by table (AC-26). Three properties to read off
 * this file:
 *
 *  - **keys, never bytes** (ADR-0015, AC-22) — a row is an R2 address (`bucket`, `objectKey`) and
 *    facts about the object (`mime`, `width`, `height`, `bytes` as a size, `checksumSha256`); no
 *    column is binary, and `objectKey`'s check is the alphabet `objectKey()` in
 *    `src/lib/storage.ts` mints;
 *  - **one primary image per product** (AC-11) — `product_media_primary_idx`, unique on
 *    `product_id` where `is_primary`;
 *  - **alt text is authored per locale and never blank** (AC-11, §8) — `productMediaAlt.alt` is
 *    `notNull()` and must hold a letter or a digit (`ALT_CHECK_SQL`).
 *
 * The value tuples below repeat spec 006's (`seed/schema/media.ts`) rather than import them:
 * `db/schema/` depends on nothing outside itself, and `tests/unit/schema-media.test.ts` asserts the
 * migration's CHECK lists, these tuples and the seed's are one list.
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

/* -------------------------------------------------------------------------- */
/* The closed value sets (CHECK lists, never a Postgres enum — AC-7)          */
/* -------------------------------------------------------------------------- */

/** `media_asset.kind` — §5.1's list: what the object belongs to. */
export const mediaAssetKinds = [
  "product",
  "delivery_proof",
  "brand",
  "partner",
] as const;

/** `media_asset.visibility` — whether the public role may read the row (AC-17, `0011`). */
export const mediaAssetVisibilities = ["public", "private"] as const;

/** `media_asset.source` — who made the object. */
export const mediaSources = ["ai", "photo", "partner"] as const;

/** `media_asset.review_state` — an unapproved asset never renders (spec 006 §12). */
export const mediaReviewStates = ["pending", "approved", "rejected"] as const;

/** `media_asset.depicts` — §14 A1 (c), spec 006 §2.4's value set. */
export const mediaDepicts = [
  "product",
  "brand",
  "context",
  "delivery",
] as const;

/** `media_variant.format` — §5.1's list. */
export const mediaFormats = ["avif", "webp", "jpeg"] as const;

/** `('a', 'b')` for a `CHECK … IN` list, from the tuples above. */
function valueList(values: readonly string[]): string {
  return `(${values.map((value) => `'${value}'`).join(", ")})`;
}

/** `objectKey()`'s alphabet; `tests/unit/schema-media.test.ts` holds it equal to `src/lib/storage.ts`'s. */
export const OBJECT_KEY_PATTERN =
  "^[a-z0-9][a-z0-9_-]*([.][a-z0-9_-]+)*(/[a-z0-9][a-z0-9_-]*([.][a-z0-9_-]+)*)*$";
/**
 * `product_media_alt_alt_check`: an alt text holds a letter or a digit (AC-11, §8). `[[:alnum:]]`
 * under the ICU collation `und-x-icu` is Unicode L or Nd, whatever the database's LC_CTYPE; the
 * four Hangul fillers (U+115F, U+1160, U+3164, U+FFA0) are letters that render as nothing, so
 * `translate` drops them first. An allowlist, because invisible characters have no end.
 */
export const ALT_CHECK_SQL = String.raw`(translate(alt, U&'\115F\1160\3164\FFA0', '') COLLATE "und-x-icu") ~ '[[:alnum:]]'`;
/** A lowercase hex SHA-256. */
const SHA256_PATTERN = "^[0-9a-f]{64}$";

/* -------------------------------------------------------------------------- */
/* media_asset                                                                */
/* -------------------------------------------------------------------------- */

export const mediaAsset = pgTable(
  "media_asset",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(),
    bucket: text("bucket").notNull(),
    objectKey: text("object_key").notNull(),
    mime: text("mime").notNull(),
    /** Nullable together with `height`: a PDF statement has no pixel size. */
    width: integer("width"),
    height: integer("height"),
    /** The object's size, never its content. */
    bytes: bigint("bytes", { mode: "number" }).notNull(),
    checksumSha256: text("checksum_sha256").notNull(),
    visibility: text("visibility").notNull(),
    source: text("source").notNull(),
    generatorPromptHash: text("generator_prompt_hash"),
    generatorSeed: bigint("generator_seed", { mode: "number" }),
    exifStripped: boolean("exif_stripped").notNull().default(false),
    reviewState: text("review_state").notNull().default("pending"),
    generatorModel: text("generator_model"),
    credit: text("credit"),
    licence: text("licence"),
    depicts: text("depicts").notNull(),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    unique("media_asset_object_key_key").on(table.objectKey),
    check(
      "media_asset_object_key_check",
      sql.raw(`object_key ~ '${OBJECT_KEY_PATTERN}'`),
    ),
    check(
      "media_asset_bucket_check",
      sql.raw(`bucket ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$'`),
    ),
    check("media_asset_mime_check", sql.raw(`mime ~ '^[a-z]+/[a-z0-9.+-]+$'`)),
    check(
      "media_asset_dimensions_check",
      sql`(${table.width} is null and ${table.height} is null) or (${table.width} > 0 and ${table.height} > 0)`,
    ),
    check(
      "media_asset_image_dimensions_check",
      sql`${table.mime} not like 'image/%' or ${table.width} is not null`,
    ),
    check("media_asset_bytes_check", sql`${table.bytes} > 0`),
    check(
      "media_asset_checksum_sha256_check",
      sql.raw(`checksum_sha256 ~ '${SHA256_PATTERN}'`),
    ),
    check(
      "media_asset_generator_prompt_hash_check",
      sql.raw(
        `generator_prompt_hash is null or generator_prompt_hash ~ '${SHA256_PATTERN}'`,
      ),
    ),
    check(
      "media_asset_generator_seed_check",
      sql`${table.generatorSeed} is null or ${table.generatorSeed} >= 0`,
    ),
    check(
      "media_asset_kind_check",
      sql.raw(`kind in ${valueList(mediaAssetKinds)}`),
    ),
    check(
      "media_asset_visibility_check",
      sql.raw(`visibility in ${valueList(mediaAssetVisibilities)}`),
    ),
    check(
      "media_asset_source_check",
      sql.raw(`source in ${valueList(mediaSources)}`),
    ),
    check(
      "media_asset_review_state_check",
      sql.raw(`review_state in ${valueList(mediaReviewStates)}`),
    ),
    check(
      "media_asset_depicts_check",
      sql.raw(`depicts in ${valueList(mediaDepicts)}`),
    ),
    check(
      "media_asset_reviewed_check",
      sql`${table.reviewState} <> 'approved' or (${table.reviewedBy} is not null and ${table.reviewedAt} is not null)`,
    ),
  ],
);

/* -------------------------------------------------------------------------- */
/* media_variant                                                              */
/* -------------------------------------------------------------------------- */

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
    ...timestamps,
  },
  (table) => [
    primaryKey({
      name: "media_variant_pkey",
      columns: [table.mediaAssetId, table.variant, table.format],
    }),
    unique("media_variant_object_key_key").on(table.objectKey),
    check(
      "media_variant_object_key_check",
      sql.raw(`object_key ~ '${OBJECT_KEY_PATTERN}'`),
    ),
    check(
      "media_variant_variant_check",
      sql.raw(`variant ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
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
      sql.raw(`checksum_sha256 ~ '${SHA256_PATTERN}'`),
    ),
  ],
);

/* -------------------------------------------------------------------------- */
/* product_media                                                              */
/* -------------------------------------------------------------------------- */

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
    uniqueIndex("product_media_primary_idx")
      .on(table.productId)
      .where(sql`is_primary`),
    index("product_media_media_asset_idx").on(table.mediaAssetId),
  ],
);

/* -------------------------------------------------------------------------- */
/* product_media_alt                                                          */
/* -------------------------------------------------------------------------- */

export const productMediaAlt = pgTable(
  "product_media_alt",
  {
    productMediaId: uuid("product_media_id")
      .notNull()
      .references(() => productMedia.id, { onDelete: "cascade" }),
    localeCode: text("locale_code")
      .notNull()
      .references(() => locale.code, { onDelete: "restrict" }),
    /** Authored per locale, never generated at render (`plan/01` §6, AC-11). */
    alt: text("alt").notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      name: "product_media_alt_pkey",
      columns: [table.productMediaId, table.localeCode],
    }),
    check("product_media_alt_alt_check", sql.raw(ALT_CHECK_SQL)),
  ],
);
