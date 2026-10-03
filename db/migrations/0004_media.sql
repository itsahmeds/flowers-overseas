-- 0004_media — media assets as keys, never bytes (spec 002 §5.1 "Media, per ADR-0015", §7, §8,
-- AC-11, AC-22; §14 A1 (c); TASK-017).
--
-- Four tables — `media_asset`, `media_variant`, `product_media`, `product_media_alt` — and nothing
-- else. No policy (RLS is `0011`, TASK-023), no seed row (spec 006 owns the imagery; AC-32 wants
-- **zero** `media_asset` rows from spec 002's seed), no function beyond the `updated_at` triggers
-- that attach to `public.set_updated_at()` from `0001`.
--
-- The properties this migration is measured on
-- ---------------------------------------------
--
--   1. **Keys, not bytes** (ADR-0015, AC-22). An image lives in Cloudflare R2; the database holds
--      the bucket, the object key, the dimensions, the byte count and the SHA-256 of what was
--      uploaded. There is no `bytea` column here or anywhere (`db:check` asserts it, TASK-027),
--      and `object_key` is unique on both tables, because two rows naming one object is two
--      owners of one delete. Keys are built by `objectKey()` in `src/lib/storage.ts` and checked
--      here against the same alphabet: lowercase segments separated by `/`, no leading slash, no
--      `..`, so a key can never climb out of its prefix.
--   2. **Exactly one primary image per product** (AC-11, T-11) — a partial unique index
--      `(product_id) WHERE is_primary`, the shape `product_tier_default_idx` already uses.
--   3. **Alt text is stored, per locale, and never empty** (AC-11, §8 "Accessibility", `plan/01`
--      §6). `product_media_alt.alt` is `NOT NULL` and must contain a non-blank character: an
--      empty alt on a product image is the decorative-image escape hatch, and a product photo is
--      never decorative. It is never generated at render.
--   4. **Provenance is columns** (§14 A1 (c), spec 006 §8): `source`, `generator_model`,
--      `generator_prompt_hash`, `generator_seed`, `credit`, `licence`, `depicts`, `review_state`,
--      `reviewed_by`, `reviewed_at`. Two pairings are constrained rather than trusted: an
--      `approved` asset names its reviewer and date (spec 006 AC-8's rule, held by the database
--      too), and a `delivery`-depicting asset is never AI-generated — an AI image presented as a
--      delivery photo is the misleading action spec 006 §8 exists to prevent.
--   5. **Delivery photos are private and EXIF-stripped** (§8, AC-19). `media_asset` records both
--      facts (`visibility`, `exif_stripped`); the guard that refuses a `delivery_proof` row
--      pointing at an asset that is not both is migration `0008` (TASK-020), because
--      `delivery_proof` is created by `0007`.
--
-- **Deviations from §5.1's column list, declared rather than silent**
--
--   - *`updated_at` on `media_asset`, `product_media` and `product_media_alt`.* §5.1 names
--     `created_at` only on `media_asset`; the §5.1 convention ("where it is ever updated,
--     `updated_at`") governs, because `review_state` moves from `pending` to `approved` and an alt
--     text is corrected. `media_variant` is "filled once by `media.derive_variants`" (§5.1) and a
--     re-encode replaces the row, so it carries `created_at` only.
--   - *`kind` and `depicts` both exist.* §5.1's `kind` says which *bucket and key prefix* an asset
--     belongs to (`product` | `delivery_proof` | `brand` | `partner`, the `ObjectKind` set of
--     `src/lib/storage.ts` minus `backup`, which is never an asset row); §14 A1 (c)'s `depicts`
--     says what the picture *shows* (`product` | `brand` | `context` | `delivery`, spec 006 §2).
--     A product-kind asset may depict context (a lifestyle shot on a product page), which is why
--     the two are not one column.
--   - *`media_variant.variant`.* §5.1 names the column and `UNIQUE (media_asset_id, variant,
--     format)`; spec 006's ladder names a variant by its width (`640`, `1280`, …) or `original`,
--     so the column is a lowercase token, not an integer.
--   - *`ON DELETE`.* `media_variant` and `product_media_alt` cascade from their parent (§5.1: a
--     parent to its own variant/translation rows). `product_media` cascades from the product side
--     (a product's own derivative rows, as `product_category` does in `0003`) and **restricts** on
--     the asset side, so an asset still on a product page cannot be deleted out from under it.
--
-- Indexes, measured (the `0003` rule: an index earns its place by naming the read it serves):
-- `product_media_primary_idx` is AC-11's constraint and also serves "the primary image of
-- product P"; `product_media_asset_idx` serves the asset-side `RESTRICT` check and "which products
-- show asset A" (the retention sweep and the review queue both ask it). `media_variant` is reached
-- through its unique `(media_asset_id, variant, format)`, which leads with the parent id.
--
-- Rollback: `0004_media.down.sql`.

SET LOCAL ROLE app_owner;

/* ---------------------------------------------------------------------------
 * media_asset — one uploaded original, described, never stored
 * ------------------------------------------------------------------------ */

CREATE TABLE public.media_asset (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind                  text        NOT NULL,
  bucket                text        NOT NULL,
  object_key            text        NOT NULL,
  mime                  text        NOT NULL,
  width                 integer     NOT NULL,
  height                integer     NOT NULL,
  bytes                 bigint      NOT NULL,
  checksum_sha256       text        NOT NULL,
  visibility            text        NOT NULL DEFAULT 'private',
  source                text        NOT NULL,
  depicts               text        NOT NULL,
  generator_model       text        NULL,
  generator_prompt_hash text        NULL,
  generator_seed        text        NULL,
  credit                text        NULL,
  licence               text        NULL,
  exif_stripped         boolean     NOT NULL DEFAULT false,
  review_state          text        NOT NULL DEFAULT 'pending',
  reviewed_by           text        NULL,
  reviewed_at           timestamptz NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT media_asset_object_key_key UNIQUE (object_key),
  CONSTRAINT media_asset_kind_check CHECK (kind IN ('product', 'delivery_proof', 'brand', 'partner')),
  CONSTRAINT media_asset_bucket_check CHECK (bucket ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$'),
  CONSTRAINT media_asset_object_key_check CHECK (
    object_key ~ '^[a-z0-9][a-z0-9._-]*(/[a-z0-9][a-z0-9._-]*)*$' AND object_key !~ '\.\.'
  ),
  CONSTRAINT media_asset_mime_check CHECK (mime ~ '^(image|application)/[a-z0-9.+-]+$'),
  CONSTRAINT media_asset_dimensions_check CHECK (width > 0 AND height > 0),
  CONSTRAINT media_asset_bytes_check CHECK (bytes > 0),
  CONSTRAINT media_asset_checksum_sha256_check CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT media_asset_visibility_check CHECK (visibility IN ('public', 'private')),
  CONSTRAINT media_asset_source_check CHECK (source IN ('ai', 'photo', 'partner')),
  CONSTRAINT media_asset_depicts_check CHECK (depicts IN ('product', 'brand', 'context', 'delivery')),
  CONSTRAINT media_asset_review_state_check CHECK (review_state IN ('pending', 'approved', 'rejected')),
  CONSTRAINT media_asset_reviewed_check CHECK (
    review_state <> 'approved' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  ),
  CONSTRAINT media_asset_delivery_not_ai_check CHECK (NOT (depicts = 'delivery' AND source = 'ai'))
);

COMMENT ON TABLE public.media_asset IS
  'Spec 002 §5.1 / ADR-0015: an object in R2, described by key, size and checksum. The bytes are never in the database (AC-22).';
COMMENT ON COLUMN public.media_asset.object_key IS
  'Built by objectKey() in src/lib/storage.ts: lowercase "/"-separated segments, no leading slash, no "..".';
COMMENT ON COLUMN public.media_asset.exif_stripped IS
  'True once EXIF/GPS has been removed before upload (plan/01 §6). A delivery_proof may only reference a private, stripped asset (0008, AC-19).';

/* ---------------------------------------------------------------------------
 * media_variant — the derived encodes, filled once by `media.derive_variants`
 * ------------------------------------------------------------------------ */

CREATE TABLE public.media_variant (
  media_asset_id  uuid        NOT NULL,
  variant         text        NOT NULL,
  object_key      text        NOT NULL,
  format          text        NOT NULL,
  width           integer     NOT NULL,
  height          integer     NOT NULL,
  bytes           bigint      NOT NULL,
  checksum_sha256 text        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT media_variant_pkey PRIMARY KEY (media_asset_id, variant, format),
  CONSTRAINT media_variant_media_asset_id_media_asset_id_fk FOREIGN KEY (media_asset_id)
    REFERENCES public.media_asset (id) ON DELETE CASCADE,
  CONSTRAINT media_variant_object_key_key UNIQUE (object_key),
  CONSTRAINT media_variant_variant_check CHECK (variant ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
  CONSTRAINT media_variant_object_key_check CHECK (
    object_key ~ '^[a-z0-9][a-z0-9._-]*(/[a-z0-9][a-z0-9._-]*)*$' AND object_key !~ '\.\.'
  ),
  CONSTRAINT media_variant_format_check CHECK (format IN ('avif', 'webp', 'jpeg')),
  CONSTRAINT media_variant_dimensions_check CHECK (width > 0 AND height > 0),
  CONSTRAINT media_variant_bytes_check CHECK (bytes > 0),
  CONSTRAINT media_variant_checksum_sha256_check CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$')
);

/* ---------------------------------------------------------------------------
 * product_media — which assets a product page shows, in what order (AC-11)
 * ------------------------------------------------------------------------ */

CREATE TABLE public.product_media (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     uuid        NOT NULL,
  media_asset_id uuid        NOT NULL,
  sort           integer     NOT NULL DEFAULT 0,
  is_primary     boolean     NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_media_product_id_product_id_fk FOREIGN KEY (product_id)
    REFERENCES public.product (id) ON DELETE CASCADE,
  CONSTRAINT product_media_media_asset_id_media_asset_id_fk FOREIGN KEY (media_asset_id)
    REFERENCES public.media_asset (id) ON DELETE RESTRICT,
  CONSTRAINT product_media_product_asset_key UNIQUE (product_id, media_asset_id),
  CONSTRAINT product_media_sort_check CHECK (sort >= 0)
);

-- AC-11: one primary image per product. The PDP, the listing card and `Product.image[0]` (spec
-- 009) all read "the" primary image; two would make the answer depend on a scan order.
CREATE UNIQUE INDEX product_media_primary_idx
  ON public.product_media USING btree (product_id) WHERE is_primary;

COMMENT ON INDEX public.product_media_primary_idx IS
  'AC-11: at most one is_primary row per product.';

CREATE INDEX product_media_asset_idx
  ON public.product_media USING btree (media_asset_id);

/* ---------------------------------------------------------------------------
 * product_media_alt — alt text per locale, stored, never generated (AC-11)
 * ------------------------------------------------------------------------ */

CREATE TABLE public.product_media_alt (
  product_media_id uuid        NOT NULL,
  locale_code      text        NOT NULL,
  alt              text        NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_media_alt_pkey PRIMARY KEY (product_media_id, locale_code),
  CONSTRAINT product_media_alt_product_media_id_product_media_id_fk FOREIGN KEY (product_media_id)
    REFERENCES public.product_media (id) ON DELETE CASCADE,
  CONSTRAINT product_media_alt_locale_code_locale_code_fk FOREIGN KEY (locale_code)
    REFERENCES public.locale (code) ON DELETE RESTRICT,
  CONSTRAINT product_media_alt_alt_check CHECK (alt ~ '[^[:space:]]')
);

/* ---------------------------------------------------------------------------
 * updated_at triggers (AC-10)
 * ------------------------------------------------------------------------ */

CREATE TRIGGER media_asset_set_updated_at BEFORE UPDATE ON public.media_asset
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER product_media_set_updated_at BEFORE UPDATE ON public.product_media
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER product_media_alt_set_updated_at BEFORE UPDATE ON public.product_media_alt
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

RESET ROLE;
