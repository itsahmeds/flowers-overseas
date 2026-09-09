/**
 * The imagery manifests and their projections onto spec 002 §5.1's media tables (spec 006 §2.1
 * "Media bytes"/"Alt text"/"Provenance", §5.1's projection table, §5.2's pinned field lists,
 * AC-3; TASK-072).
 *
 * Three files are described here and nothing else: `seed/data/media.json` (the asset manifest a
 * human authors, TASK-077), `seed/data/media-variants.json` (written by `pnpm media:variants`,
 * TASK-078) and `seed/data/alt/{locale}.json` (per-locale alt text, TASK-073/079). This task
 * ships the schemas and the projections; the bytes, the prompts and the alt strings are those
 * tasks'.
 *
 * **Provenance is data, not a comment** (spec 006 §2.4, §8, AC-8). The refinements below are the
 * enforcement: an `ai` asset without generator, model, prompt hash and seed does not parse; a
 * `photo` asset without credit and licence does not parse; an `approved` asset without a reviewer
 * and a date does not parse; and a `depicts: "delivery"` asset is rejected outright, because a
 * real delivery photograph is spec 018/027 data that carries consent (`plan/07` §1.2) and an
 * AI-generated one presented as a delivery is a misleading commercial practice (UCPD, ADR-0014).
 *
 * **What the manifest deliberately does not carry, and why it is not a missing column.** Spec 002
 * §5.1's `media_asset` stores the *stored object*: bucket, key, mime, pixel dimensions, bytes,
 * checksum. None of those is authorable — they are facts about a file that only the pipeline that
 * wrote the file knows — so they arrive as `MediaAssetOriginalSchema`, the second argument of
 * `toMediaAssetRow()`. That is the "a foreign key is passed in, never invented" convention of
 * `src/config/catalogue/projections.ts` applied to byte facts, and it keeps the projection pure.
 * Conversely three manifest fields have **no** column and are not projected: `slot` (a render
 * slot, consumed by `src/modules/ui/media/slots.ts`), `capturedAt` (spec 002 §5.1 has no
 * `captured_at`; the date a photograph was taken is content, recorded in
 * `content/imagery/prompts/`), and `generator` (the vendor; spec 006 §5.1 (b) enumerates the
 * columns `media_asset` gains and `generator_model` is the one that carries the generator's
 * identity into the database). Each is stated here so a reader can tell a decision from an
 * omission.
 */
import { z } from "zod";

import {
  IsoDateSchema,
  SkuSchema,
} from "../../src/config/catalogue/schemas.ts";

/* -------------------------------------------------------------------------- */
/* Value sets — spec 002 §5.1's CHECK lists and spec 006 §2.4's additions.    */
/* -------------------------------------------------------------------------- */

/** `media_asset.kind` — spec 002 §5.1's CHECK list, verbatim. */
export const mediaAssetKinds = [
  "product",
  "delivery_proof",
  "brand",
  "partner",
] as const;
export type MediaAssetKind = (typeof mediaAssetKinds)[number];

/** `media_asset.source` — spec 002 §5.1's CHECK list, verbatim. */
export const mediaSources = ["ai", "photo", "partner"] as const;
export type MediaSource = (typeof mediaSources)[number];

/**
 * `media_asset.depicts` — spec 006 §2.4's value set and spec 002 §14 A1 (c)'s new column. It is
 * finer than `kind` on purpose: spec 009 builds `Product.image[]` from `product`-depicting assets
 * only, because a brand or in-home context shot does not depict the offered product and
 * misleading structured data is a manual-action risk (`plan/02` §9, §15).
 */
export const mediaDepicts = [
  "product",
  "brand",
  "context",
  "delivery",
] as const;
export type MediaDepicts = (typeof mediaDepicts)[number];

/** `media_asset.visibility` — spec 002 §5.1's CHECK list, verbatim. */
export const mediaVisibilities = ["public", "private"] as const;
export type MediaVisibility = (typeof mediaVisibilities)[number];

/** `media_asset.review_state` — spec 002 §5.1's CHECK list, verbatim. */
export const mediaReviewStates = ["pending", "approved", "rejected"] as const;
export type MediaReviewState = (typeof mediaReviewStates)[number];

/**
 * `media_variant.format` — spec 002 §5.1's CHECK list, verbatim. The page ladder is AVIF + WebP
 * (spec 006 §13 Q5); `jpeg` exists for the single 1200 px OG/email asset per image.
 */
export const mediaFormats = ["avif", "webp", "jpeg"] as const;
export type MediaFormat = (typeof mediaFormats)[number];

/**
 * The named render slots of spec 006 §2.5 / `plan/01` §6. A slot fixes the aspect ratio, the
 * `sizes` string and the per-slot byte cap, all of which live in `src/modules/ui/media/slots.ts`
 * (TASK-079); the manifest only says which slot an asset was cropped for, so `seed:check` can
 * apply the right cap (spec 006 §2.3 rule 9) without importing a UI module.
 */
export const mediaSlots = [
  "hero",
  "occasionTile",
  "productHero",
  "productDetail",
  "productThumb",
  "context",
  "og",
] as const;
export type MediaSlot = (typeof mediaSlots)[number];

/* -------------------------------------------------------------------------- */
/* Shared field schemas.                                                      */
/* -------------------------------------------------------------------------- */

/**
 * An asset id: opaque, lowercase, ASCII, derived from the SKU and the role, and carrying no
 * personal data (spec 006 §8 "No PII can enter a URL"). It is a URL segment
 * (`/media/{assetId}/{width}.{fmt}`), which is why the character set is this narrow.
 */
export const AssetIdSchema = z
  .string()
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "an asset id is lowercase ASCII, hyphen-separated: it is a URL segment (spec 006 §2.1)",
  );

/** A lowercase hex SHA-256, as `media_asset.checksum_sha256` and `media_variant` store it. */
export const Sha256Schema = z
  .string()
  .regex(/^[0-9a-f]{64}$/, "must be a lowercase hex sha256");

/** An R2/CDN object key (spec 002 §5.2's `objectKey(kind, id, variant)` convention). */
export const ObjectKeySchema = z
  .string()
  .regex(
    /^[a-z0-9][a-z0-9/_.-]*$/,
    "must be an object key: lowercase, slash-separated, no leading slash (spec 002 §5.2)",
  );

/** A reviewer: an initial-plus-surname or a role, never an email address (spec 006 §8, AC-9). */
const ReviewerSchema = z
  .string()
  .min(2)
  .refine((value) => !value.includes("@"), {
    error:
      "a reviewer is named, not emailed: no address may enter the dataset (spec 006 §8, AC-9)",
  });

/** A review timestamp — an instant, unlike the dataset's calendar dates. */
const ReviewedAtSchema = z.iso.datetime();

/** A licence identifier for a `photo` asset: SPDX-ish or a named free licence class. */
const LicenceSchema = z.string().min(2);

/* -------------------------------------------------------------------------- */
/* media.json — the asset manifest.                                           */
/* -------------------------------------------------------------------------- */

/**
 * One asset in `seed/data/media.json`, with the field list of spec 006 §5.2 verbatim and its four
 * refinements enforced (AC-8, T-08).
 *
 * `productSku` is optional because the homepage hero, the occasion tiles and the delivery band
 * belong to no product (spec 006 §2.4); when it is absent, `sortOrder`/`isPrimary` still describe
 * the asset's place in its slot but no `product_media` row is projected.
 */
export const MediaAssetManifestSchema = z
  .object({
    id: AssetIdSchema,
    depicts: z.enum(mediaDepicts),
    slot: z.enum(mediaSlots),
    source: z.enum(mediaSources),
    generator: z.string().min(2).optional(),
    generatorModel: z.string().min(2).optional(),
    promptHash: Sha256Schema.optional(),
    generatorSeed: z.number().int().nonnegative().optional(),
    capturedAt: IsoDateSchema.optional(),
    credit: z.string().min(2).optional(),
    licence: LicenceSchema.optional(),
    reviewState: z.enum(mediaReviewStates),
    reviewedBy: ReviewerSchema.optional(),
    reviewedAt: ReviewedAtSchema.optional(),
    productSku: SkuSchema.optional(),
    sortOrder: z.number().int().min(0),
    isPrimary: z.boolean(),
  })
  .strict()
  .superRefine((asset, ctx) => {
    if (asset.depicts === "delivery") {
      ctx.addIssue({
        code: "custom",
        path: ["depicts"],
        message: `\`${asset.id}\`: a \`delivery\`-depicting asset is rejected in Phase 0 — a real delivery photograph carries consent and is spec 018/027 data (spec 006 §2.4, plan/07 §1.2)`,
      });
    }
    if (asset.source === "ai") {
      for (const field of [
        "generator",
        "generatorModel",
        "promptHash",
        "generatorSeed",
      ] as const) {
        if (asset[field] === undefined) {
          ctx.addIssue({
            code: "custom",
            path: [field],
            message: `\`${asset.id}\` is AI-generated and must record \`${field}\` so the image can be regenerated and labelled (spec 006 §2.4, ADR-0014)`,
          });
        }
      }
    }
    if (asset.source === "photo") {
      for (const field of ["credit", "licence"] as const) {
        if (asset[field] === undefined) {
          ctx.addIssue({
            code: "custom",
            path: [field],
            message: `\`${asset.id}\` is a photograph and must record \`${field}\`: the free-licence class spec 006 §13 Q1 permits is only usable with both (spec 006 §8)`,
          });
        }
      }
    }
    if (asset.reviewState === "approved") {
      for (const field of ["reviewedBy", "reviewedAt"] as const) {
        if (asset[field] === undefined) {
          ctx.addIssue({
            code: "custom",
            path: [field],
            message: `\`${asset.id}\` is approved and must record \`${field}\`: an approval with no reviewer and no date is not an audit trail (spec 006 AC-8)`,
          });
        }
      }
    }
  });

export type MediaAssetManifest = z.infer<typeof MediaAssetManifestSchema>;

/**
 * The byte facts of the stored original, produced by `pnpm media:variants` (TASK-078) and never
 * authored: they are what spec 002 §5.1's `media_asset` actually stores about the object.
 * `exifStripped` is a claim the pipeline makes about the file it wrote, which is why it is here
 * and not in the manifest — EXIF/GPS removal is unconditional (`plan/01` §6, AC-12) and spec 002
 * enforces it with a trigger on the delivery-proof path.
 */
export const MediaAssetOriginalSchema = z
  .object({
    bucket: z.string().min(1),
    objectKey: ObjectKeySchema,
    mime: z
      .string()
      .regex(/^image\/[a-z0-9.+-]+$/, "must be an image mime type"),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    bytes: z.number().int().positive(),
    checksumSha256: Sha256Schema,
    exifStripped: z.boolean(),
  })
  .strict();

export type MediaAssetOriginal = z.infer<typeof MediaAssetOriginalSchema>;

/* -------------------------------------------------------------------------- */
/* media-variants.json — the derived ladder.                                  */
/* -------------------------------------------------------------------------- */

/**
 * One derived variant (spec 006 §5.2's field list verbatim). `variant` is the ladder step's name
 * — the `variant` column of spec 002 §5.1's `UNIQUE (media_asset_id, variant, format)` — and it
 * is the width as a string for the page ladder (`"640"`) so the key convention of
 * `objectKey(kind, id, variant)` needs no second vocabulary.
 */
export const MediaVariantManifestSchema = z
  .object({
    assetId: AssetIdSchema,
    variant: z.string().min(1),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    format: z.enum(mediaFormats),
    bytes: z.number().int().positive(),
    checksumSha256: Sha256Schema,
    objectKey: ObjectKeySchema,
  })
  .strict();

export type MediaVariantManifest = z.infer<typeof MediaVariantManifestSchema>;

/* -------------------------------------------------------------------------- */
/* alt/{locale}.json — per-locale alt text.                                   */
/* -------------------------------------------------------------------------- */

/**
 * One alt-text entry, keyed by asset id (spec 006 §2.1 "Alt text").
 *
 * `alt` has a minimum length because an **empty** alt on a product image is the failure spec 006
 * AC-8 and AC-18 name explicitly: an informative image with `alt=""` is announced as nothing at
 * all (WCAG 1.1.1), and the honest fallback is to render the placeholder instead of the image.
 * The upper bound is the screen-reader courtesy limit; a description belongs in the copy file.
 */
export const AltEntrySchema = z
  .object({
    assetId: AssetIdSchema,
    alt: z.string().min(8).max(220),
  })
  .strict();

export type AltEntry = z.infer<typeof AltEntrySchema>;

/**
 * A whole `seed/data/alt/{locale}.json`: the locale, and one entry per asset. The file's locale
 * is the `locale_code` of every row it projects, so an entry cannot claim a different one.
 */
export const AltManifestSchema = z
  .object({
    locale: z.string().min(2),
    entries: z.array(AltEntrySchema),
  })
  .strict()
  .superRefine((manifest, ctx) => {
    const seen = new Set<string>();
    manifest.entries.forEach((entry, index) => {
      if (seen.has(entry.assetId)) {
        ctx.addIssue({
          code: "custom",
          path: ["entries", index, "assetId"],
          message: `duplicate alt entry for \`${entry.assetId}\` in \`${manifest.locale}\` (spec 002 §5.1 UNIQUE (product_media_id, locale_code))`,
        });
      }
      seen.add(entry.assetId);
    });
  });

export type AltManifest = z.infer<typeof AltManifestSchema>;

/* -------------------------------------------------------------------------- */
/* Derived classification: kind and visibility from `depicts`.                */
/* -------------------------------------------------------------------------- */

/**
 * `media_asset.kind` from `depicts` (spec 006 §2.4 + spec 002 §5.1).
 *
 * `depicts` is the finer field spec 002 §14 A1 (c) adds and `kind` is the coarse one the tables
 * already had, so exactly one of them has to be derived or the two can disagree on the same
 * asset. Deriving is the only option that cannot: a `context` shot is brand imagery (it shows the
 * product in a home, not the offered arrangement, which is why spec 009 excludes it from
 * `Product.image[]`), and a `delivery` asset maps to `delivery_proof` — a value this dataset can
 * never produce, because `MediaAssetManifestSchema` rejects `depicts: "delivery"` outright. The
 * `partner` kind belongs to spec 011's partner uploads and has no `depicts` value here.
 */
export function mediaAssetKindFor(depicts: MediaDepicts): MediaAssetKind {
  switch (depicts) {
    case "product":
      return "product";
    case "brand":
    case "context":
      return "brand";
    case "delivery":
      return "delivery_proof";
  }
}

/**
 * `media_asset.visibility` from `depicts`. Catalogue and brand imagery is public by definition —
 * it is rendered on a page Googlebot must fetch (spec 006 §6) — while a delivery proof is
 * private, which spec 002 §5.1 enforces with a trigger (AC-19). Deriving it keeps the two rules
 * in one place instead of on 24 authored rows.
 */
export function mediaAssetVisibilityFor(
  depicts: MediaDepicts,
): MediaVisibility {
  return depicts === "delivery" ? "private" : "public";
}

/* -------------------------------------------------------------------------- */
/* Projections onto spec 002 §5.1's media tables (AC-3).                      */
/* -------------------------------------------------------------------------- */

/**
 * Spec 002 §5.1 `media_asset` columns in declaration order, minus the generated `id` and
 * `created_at` (the `src/config/catalogue/projections.ts` convention: the seed upserts on the
 * natural key — here `object_key` — and the database mints the rest), followed by the six columns
 * spec 002 §14 A1 (c) adds in the order that amendment lists them.
 */
export const MEDIA_ASSET_ROW_COLUMNS = [
  "kind",
  "bucket",
  "object_key",
  "mime",
  "width",
  "height",
  "bytes",
  "checksum_sha256",
  "visibility",
  "source",
  "generator_prompt_hash",
  "generator_seed",
  "exif_stripped",
  "review_state",
  "generator_model",
  "credit",
  "licence",
  "depicts",
  "reviewed_by",
  "reviewed_at",
] as const;

export interface MediaAssetRow {
  kind: string;
  bucket: string;
  object_key: string;
  mime: string;
  width: number;
  height: number;
  bytes: number;
  checksum_sha256: string;
  visibility: string;
  source: string;
  generator_prompt_hash: string | null;
  generator_seed: number | null;
  exif_stripped: boolean;
  review_state: string;
  generator_model: string | null;
  credit: string | null;
  licence: string | null;
  depicts: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

/**
 * Project a manifest asset plus the byte facts of its original onto spec 002 §5.1's `media_asset`
 * row. Every optional manifest field becomes an explicit `null`, so the projected key list is the
 * column list whatever the asset carries — which is what AC-3's pinned test asserts and what
 * makes an `INSERT … VALUES` from these rows safe to generate.
 */
export function toMediaAssetRow(
  asset: MediaAssetManifest,
  original: MediaAssetOriginal,
): MediaAssetRow {
  return {
    kind: mediaAssetKindFor(asset.depicts),
    bucket: original.bucket,
    object_key: original.objectKey,
    mime: original.mime,
    width: original.width,
    height: original.height,
    bytes: original.bytes,
    checksum_sha256: original.checksumSha256,
    visibility: mediaAssetVisibilityFor(asset.depicts),
    source: asset.source,
    generator_prompt_hash: asset.promptHash ?? null,
    generator_seed: asset.generatorSeed ?? null,
    exif_stripped: original.exifStripped,
    review_state: asset.reviewState,
    generator_model: asset.generatorModel ?? null,
    credit: asset.credit ?? null,
    licence: asset.licence ?? null,
    depicts: asset.depicts,
    reviewed_by: asset.reviewedBy ?? null,
    reviewed_at: asset.reviewedAt ?? null,
  };
}

/** The id of an already-upserted asset row, resolved by the caller. */
export interface MediaAssetRef {
  readonly mediaAssetId: string;
}

/** The id of an already-upserted `product_media` row, resolved by the caller. */
export interface ProductMediaRef {
  readonly productMediaId: string;
}

/**
 * Spec 002 §5.1 `media_variant` columns in declaration order, plus `checksum_sha256` (spec 002
 * §14 A1 (c)), which is what lets the committed manifest and the database row be compared
 * (spec 006 §2.1 "one committed manifest … is the only source of widths/bytes/checksums").
 */
export const MEDIA_VARIANT_ROW_COLUMNS = [
  "media_asset_id",
  "variant",
  "object_key",
  "format",
  "width",
  "height",
  "bytes",
  "checksum_sha256",
] as const;

export interface MediaVariantRow {
  media_asset_id: string;
  variant: string;
  object_key: string;
  format: string;
  width: number;
  height: number;
  bytes: number;
  checksum_sha256: string;
}

/** Project one manifest variant onto spec 002 §5.1's `media_variant` row. */
export function toMediaVariantRow(
  variant: MediaVariantManifest,
  ref: MediaAssetRef,
): MediaVariantRow {
  return {
    media_asset_id: ref.mediaAssetId,
    variant: variant.variant,
    object_key: variant.objectKey,
    format: variant.format,
    width: variant.width,
    height: variant.height,
    bytes: variant.bytes,
    checksum_sha256: variant.checksumSha256,
  };
}

/** Spec 002 §5.1 `product_media(product_id, media_asset_id, sort, is_primary)`. */
export const PRODUCT_MEDIA_ROW_COLUMNS = [
  "product_id",
  "media_asset_id",
  "sort",
  "is_primary",
] as const;

/** Spec 002 §5.1's partial unique index: one primary image per product (AC-11). */
export const PRODUCT_MEDIA_PRIMARY_INDEX_COLUMNS = ["product_id"] as const;

export interface ProductMediaRow {
  product_id: string;
  media_asset_id: string;
  sort: number;
  is_primary: boolean;
}

/**
 * Project the product half of a manifest asset onto spec 002 §5.1's `product_media` row. Only an
 * asset with a `productSku` has one; the caller resolves both ids (`plan/10` §4 upserts products
 * on `sku` and assets on `object_key`).
 */
export function toProductMediaRow(
  asset: MediaAssetManifest,
  ref: { readonly productId: string } & MediaAssetRef,
): ProductMediaRow {
  return {
    product_id: ref.productId,
    media_asset_id: ref.mediaAssetId,
    sort: asset.sortOrder,
    is_primary: asset.isPrimary,
  };
}

/** Spec 002 §5.1 `product_media_alt(product_media_id, locale_code, alt)`. */
export const PRODUCT_MEDIA_ALT_ROW_COLUMNS = [
  "product_media_id",
  "locale_code",
  "alt",
] as const;

export interface ProductMediaAltRow {
  product_media_id: string;
  locale_code: string;
  alt: string;
}

/**
 * Project one alt entry onto spec 002 §5.1's `product_media_alt` row. `alt` is `NOT NULL` there
 * and non-empty here: alt text is stored per locale and never generated at render (`plan/01` §6),
 * so a locale with no entry renders the placeholder rather than an English alt on a Polish page
 * (spec 006 AC-18).
 */
export function toProductMediaAltRow(
  entry: AltEntry,
  ref: ProductMediaRef & { readonly localeCode: string },
): ProductMediaAltRow {
  return {
    product_media_id: ref.productMediaId,
    locale_code: ref.localeCode,
    alt: entry.alt,
  };
}
