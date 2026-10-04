-- 0004_media — the media tables: an image is an R2 object key plus the facts about it (spec 002
-- §5.1 "`catalog`" media sentence, §8 "Accessibility", AC-10, AC-11, AC-22; §14 A1 (c); ADR-0015;
-- TASK-017).
--
-- Four tables — `media_asset`, `media_variant`, `product_media`, `product_media_alt` — and their
-- `updated_at` triggers. No policy (RLS is `0011`, TASK-023: AC-17's "`media_asset` where
-- `visibility = 'public'`" is a policy on this table, written there), no seed row (spec 002 §2:
-- **zero** media assets; imagery is spec 006), no function beyond the triggers that attach to
-- `public.set_updated_at()` from `0001`.
--
-- The three properties this migration is measured on
-- --------------------------------------------------
--
--   1. **Keys, never bytes** (ADR-0015, AC-22). The bytes live in Cloudflare R2. A row records
--      where the object is (`bucket`, `object_key`) and what it is (`mime`, pixel `width`/`height`,
--      `bytes` — the size, a `bigint` — and `checksum_sha256`). There is no `bytea` column here or
--      anywhere else, which `db:check` will assert across the whole database (TASK-027). Keys are
--      minted by `objectKey()` in `src/lib/storage.ts`; the `*_object_key_check` pattern below is
--      that function's alphabet, so a key the seam can produce is a key this table accepts, and a
--      key with a leading slash, an upper-case letter or a space is refused at the door.
--   2. **One primary image per product** (AC-11, T-11). `product_media_primary_idx` is a partial
--      unique index on `(product_id) WHERE is_primary`, and `is_primary` is `NOT NULL` so a null
--      cannot slip past the predicate. Spec 009's `Product.image[0]` and the listing card read this
--      row, so two primaries would make the page's image depend on row order.
--   3. **Alt text is stored per locale and never blank** (§8, `plan/01` §6, AC-11).
--      `product_media_alt.alt` is `NOT NULL`, and `btrim(alt) <> ''` on top: an empty `alt` on a
--      product image tells a screen reader the image is decorative, which is the failure AC-11
--      exists to prevent and which `NOT NULL` alone lets through. A locale with no row is simply
--      absent — spec 006 AC-18 renders the placeholder and §6 keeps that locale's PDP out of the
--      index — rather than falling back to another locale's words.
--
-- Column sets are §5.1's in §5.1's order, then §14 A1 (c)'s six `media_asset` columns
-- (`generator_model`, `credit`, `licence`, `depicts`, `reviewed_by`, `reviewed_at`) and
-- `media_variant.checksum_sha256`, exactly as spec 006's projections write them
-- (`MEDIA_ASSET_ROW_COLUMNS` and its siblings in `seed/schema/media.ts`; pinned against this file
-- by `tests/unit/schema-media.test.ts`). The value lists are the seed's tuples, verbatim.
--
-- **Deviations from §5.1's conventions, declared rather than silent**
--
--   - *`width`/`height` are nullable, together.* §5.1 lists them as bare columns. A `partner`
--     asset may be a PDF (`payout.statement_media_asset_id`, `partner_application.media_asset_ids`)
--     and a PDF has no pixel size; inventing one would be a false fact. The pair is constrained
--     instead: both null or both positive, and an asset with an image MIME type must have them.
--   - *`media_asset_reviewed_check`.* An `approved` asset must name its reviewer and date. This is
--     spec 006 §2.4's provenance rule (`seed:check` refuses the same row, spec 006 AC-8), repeated
--     here because the admin review queue of spec 012 writes this table without going through the
--     seed's zod schema.
--   - *`visibility`, `kind`, `source` and `depicts` have no default.* A forgotten visibility must
--     fail the insert, not silently publish a delivery photograph or hide a product shot.
--   - *`media_variant` is keyed by `(media_asset_id, variant, format)`.* §5.1 states that triple as
--     `UNIQUE`; as with `product_tier` in `0003`, a variant row has no identity of its own, so the
--     triple is the primary key and no surrogate id exists. `product_media` keeps a surrogate `id`
--     because `product_media_alt.product_media_id` points at it (§5.1).
--   - *`ON DELETE`.* Variants cascade from their asset and alt rows from their image (§5.1: "CASCADE
--     only from a parent to its own translation/variant rows"). `product_media` cascades from the
--     product side, as `product_category` does in `0003`, and restricts on the asset side: an asset
--     still shown on a product page cannot vanish from under it.
--   - *No cross-table rule that a `product_media` asset is public.* That would take a trigger or a
--     composite key §5.1 does not name. The public role reads `media_asset` only where
--     `visibility = 'public'` (AC-17, `0011`), so a private asset joined to a product renders
--     nothing to the public rather than leaking.
--
-- **Indexes, measured rather than copied** (`/review 75` nit 6, as in `0003`). Postgres indexes a
-- primary key and a unique constraint and nothing else; beyond those, exactly two:
--
--   - `product_media_primary_idx` — AC-11 itself, and the listing card's "primary image of each of
--     these products" read.
--   - `product_media_media_asset_idx (media_asset_id)` — the `RESTRICT` check every `media_asset`
--     delete runs against `product_media`, and the retention sweep deletes delivery photographs
--     daily (spec 002 §8, `plan/07` §1.2); `UNIQUE (product_id, media_asset_id)` leads with the
--     wrong column to serve it. It also answers the review queue's "which products show this
--     asset?" when an asset is rejected.
--
-- Deliberately **not** indexed: `media_variant (media_asset_id)` (the primary key leads with it),
-- `product_media_alt` by image (the primary key leads with it) or by locale (four locales, and no
-- read starts from the locale), `media_asset` by `review_state` (the review queue is an admin read
-- over a table of a few hundred rows; measure again when it is not).
--
-- Rollback: `0004_media.down.sql`.

SET LOCAL ROLE app_owner;

/* ---------------------------------------------------------------------------
 * media_asset — one stored original: where it is, what it is, where it came from
 * ------------------------------------------------------------------------ */

CREATE TABLE public.media_asset (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind                  text        NOT NULL,
  bucket                text        NOT NULL,
  object_key            text        NOT NULL,
  mime                  text        NOT NULL,
  width                 integer     NULL,
  height                integer     NULL,
  bytes                 bigint      NOT NULL,
  checksum_sha256       text        NOT NULL,
  visibility            text        NOT NULL,
  source                text        NOT NULL,
  generator_prompt_hash text        NULL,
  generator_seed        bigint      NULL,
  exif_stripped         boolean     NOT NULL DEFAULT false,
  review_state          text        NOT NULL DEFAULT 'pending',
  generator_model       text        NULL,
  credit                text        NULL,
  licence               text        NULL,
  depicts               text        NOT NULL,
  reviewed_by           text        NULL,
  reviewed_at           timestamptz NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT media_asset_object_key_key UNIQUE (object_key),
  CONSTRAINT media_asset_object_key_check CHECK (object_key ~ '^[a-z0-9][a-z0-9/_.-]*$'),
  CONSTRAINT media_asset_bucket_check CHECK (bucket ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$'),
  CONSTRAINT media_asset_mime_check CHECK (mime ~ '^[a-z]+/[a-z0-9.+-]+$'),
  CONSTRAINT media_asset_dimensions_check CHECK (
    (width IS NULL AND height IS NULL) OR (width > 0 AND height > 0)
  ),
  CONSTRAINT media_asset_image_dimensions_check CHECK (
    mime NOT LIKE 'image/%' OR width IS NOT NULL
  ),
  CONSTRAINT media_asset_bytes_check CHECK (bytes > 0),
  CONSTRAINT media_asset_checksum_sha256_check CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT media_asset_generator_prompt_hash_check CHECK (
    generator_prompt_hash IS NULL OR generator_prompt_hash ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT media_asset_generator_seed_check CHECK (generator_seed IS NULL OR generator_seed >= 0),
  CONSTRAINT media_asset_kind_check CHECK (kind IN (
    'product', 'delivery_proof', 'brand', 'partner'
  )),
  CONSTRAINT media_asset_visibility_check CHECK (visibility IN ('public', 'private')),
  CONSTRAINT media_asset_source_check CHECK (source IN ('ai', 'photo', 'partner')),
  CONSTRAINT media_asset_review_state_check CHECK (review_state IN (
    'pending', 'approved', 'rejected'
  )),
  CONSTRAINT media_asset_depicts_check CHECK (depicts IN (
    'product', 'brand', 'context', 'delivery'
  )),
  CONSTRAINT media_asset_reviewed_check CHECK (
    review_state <> 'approved' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  )
);

COMMENT ON TABLE public.media_asset IS
  'An object in R2 (ADR-0015): its address and facts, never its bytes. Keys are minted by objectKey() in src/lib/storage.ts.';
COMMENT ON COLUMN public.media_asset.bytes IS
  'The object''s size in bytes — a number, not the content.';

/* ---------------------------------------------------------------------------
 * media_variant — the derived ladder, written once per (asset, variant, format)
 * ------------------------------------------------------------------------ */

-- Filled by `media.derive_variants` (spec 006, TASK-082) or by the seed from
-- `seed/data/media-variants.json`. `variant` is the ladder step's name — the width as a string for
-- the page ladder (`'640'`) — in `objectKey()`'s segment alphabet.
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
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT media_variant_pkey PRIMARY KEY (media_asset_id, variant, format),
  CONSTRAINT media_variant_media_asset_id_media_asset_id_fk FOREIGN KEY (media_asset_id)
    REFERENCES public.media_asset (id) ON DELETE CASCADE,
  CONSTRAINT media_variant_object_key_key UNIQUE (object_key),
  CONSTRAINT media_variant_object_key_check CHECK (object_key ~ '^[a-z0-9][a-z0-9/_.-]*$'),
  CONSTRAINT media_variant_variant_check CHECK (variant ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT media_variant_format_check CHECK (format IN ('avif', 'webp', 'jpeg')),
  CONSTRAINT media_variant_dimensions_check CHECK (width > 0 AND height > 0),
  CONSTRAINT media_variant_bytes_check CHECK (bytes > 0),
  CONSTRAINT media_variant_checksum_sha256_check CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$')
);

/* ---------------------------------------------------------------------------
 * product_media — which assets a product shows, in which order, and its primary
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

-- AC-11: at most one primary image per product.
CREATE UNIQUE INDEX product_media_primary_idx
  ON public.product_media USING btree (product_id) WHERE is_primary;

COMMENT ON INDEX public.product_media_primary_idx IS
  'AC-11: one primary image per product — the image Product.image[0] and the listing card show.';

CREATE INDEX product_media_media_asset_idx
  ON public.product_media USING btree (media_asset_id);

/* ---------------------------------------------------------------------------
 * product_media_alt — alt text per image per locale, stored, never generated at render
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
  CONSTRAINT product_media_alt_alt_check CHECK (btrim(alt) <> '')
);

COMMENT ON COLUMN public.product_media_alt.alt IS
  'AC-11 / plan/01 §6: authored per locale, NOT NULL and never blank; a missing locale renders the placeholder, never another locale''s alt.';

/* ---------------------------------------------------------------------------
 * updated_at triggers (AC-10): one per table, all on `0001`'s shared function
 * ------------------------------------------------------------------------ */

CREATE TRIGGER media_asset_set_updated_at BEFORE UPDATE ON public.media_asset
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER media_variant_set_updated_at BEFORE UPDATE ON public.media_variant
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER product_media_set_updated_at BEFORE UPDATE ON public.product_media
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER product_media_alt_set_updated_at BEFORE UPDATE ON public.product_media_alt
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

RESET ROLE;
