-- 0003_catalog_pricing — the `catalog` tables and the retail price history (spec 002 §5.1
-- "`catalog`", §6, §7, §8, AC-5, AC-8, AC-9, AC-10; §14 A1 (a)(b), A2, A4, A5; TASK-016).
--
-- Eleven tables — `category`, `category_translation`, `product`, `product_translation`,
-- `product_tier`, `product_category`, `product_occasion`, `addon`, `addon_translation`,
-- `addon_country_price`, `country_price` — plus one widening of a `0002` constraint. Media
-- (`media_asset`, `media_variant`, `product_media`, `product_media_alt`) is migration `0004`
-- (TASK-017), so nothing here references an asset. No policy (RLS is `0011`, TASK-023), no seed
-- row (spec 006 owns the data), no function beyond the `updated_at` triggers that attach to
-- `public.set_updated_at()` from `0001`.
--
-- Order inside the file is dependency order: `category` and `product` before the rows that point
-- at them, `addon` before its prices, `country_price` last because it references `product`,
-- `product_tier`, `country` (`0002`) and `currency` (`0002`).
--
-- The four properties this migration is measured on
-- --------------------------------------------------
--
--   1. **Money is a pair** (AC-5, T-06). Every monetary column is `*_minor bigint NOT NULL` with a
--      `currency_code` column in the same table, `NOT NULL`, foreign-keyed to `currency (code)`
--      and carrying the `'^[A-Z]{3}$'` shape check. There is no `numeric`, no `double precision`
--      and no float anywhere: VAT is `vat_rate_bp` (basis points), as it is on `country`.
--      `bigint` because HUF and RON magnitudes are uncomfortable in `integer` (spec 002 §2).
--   2. **One active price per (product, country, tier, surcharge)** (AC-9, T-09). A partial unique
--      index `WHERE active_to IS NULL` plus `CHECK (active_to IS NULL OR active_to > active_from)`
--      instead of `EXCLUDE USING gist` (which would need `btree_gist` — AC-7 forbids the
--      extension). Rows are **superseded** by setting `active_to`, never updated in place, which
--      is what makes "schema price = visible price" (§6) a database fact and leaves the 30-day
--      lowest-price history the Omnibus Directive requires (§8, `plan/07` §2.1) lying in the
--      table rather than reconstructed from a log.
--
--      `NULLS NOT DISTINCT` is load-bearing on that index and is not decoration: `tier_key` and
--      `surcharge_kind` are nullable (a single-tier product's base price is `(NULL, NULL)`), and
--      under the default `NULLS DISTINCT` two rows with a null tier are *not* duplicates to
--      Postgres — the constraint AC-9 names would be silently unenforced for exactly the common
--      case. `NULLS NOT DISTINCT` is core Postgres from 15; this database is 16 (spec 002 §10
--      T-01, AC-31 restores into a stock `postgres:16`), so it costs no extension and dumps and
--      restores like any other index.
--   3. **Message keys, never literals** (§7). `product_tier.label_key` and `addon.key` hold keys:
--      `label_key` is checked against spec 005 §7's `catalog.*` dotted-camelCase alphabet, so a
--      row carrying the literal "Medium (12 stems)" is rejected by the database and not merely by
--      a reviewer. `product_translation.description_md` stays nullable on purpose — the seed
--      leaves it null, and a product with no description is non-indexable by data (§6, spec 005
--      AC-8's `isProductIndexable()`).
--   4. **`updated_at` on every table** (AC-10, T-10), maintained by `0001`'s shared
--      `set_updated_at()` trigger, so an `UPDATE` that changes nothing still advances the column
--      and sitemap `<lastmod>` cannot go stale (`plan/02` §10).
--
-- Column sets are §5.1's, in §5.1's order, and are pinned from the other side by
-- `SPEC_002_ROW_COLUMNS` in `scripts/catalogue-check.ts` (spec 005's projections write these rows;
-- `tests/unit/schema-catalog-pricing.test.ts` compares the two lists table by table). The three
-- §14 A1/A2 amendments are folded in here as promised, each with a one-line rollback:
--   (a) `addon_country_price.vat_rate_bp` + `UNIQUE (addon_id, country_id) WHERE active_to IS NULL`
--   (b) `product_tier.is_default` + `UNIQUE (product_id) WHERE is_default`
--   (c) `product_tier.stems` is **nullable** (A2 (b): an S/M/L arrangement and a single plant have
--       no stem count, and inventing one for a wreath would be a false product claim), and
--       `category(key, kind)` is A2 (a).
--
-- **`category.kind` value list.** §14 A2 (a) writes the three kinds as prose ("product-type |
-- occasion | flower-type") and then names the authority: "the shape `toCategoryRow()` projects".
-- That projection is merged and emits `productType` / `occasion` / `flowerType` — spec 005's facet
-- names, which are also the message-key segments — so those are the only three values that can
-- ever reach this column, and the CHECK list is written from the projection rather than from the
-- prose. Hyphenating the list here would reject every row the importer produces.
--
-- **Deviations from §5.1's conventions, declared rather than silent**
--
--   - *`ON DELETE` mix.* §5.1's convention is "`RESTRICT` by default; `CASCADE` only from a parent
--     to its own translation/variant rows". `product_translation`, `category_translation`,
--     `addon_translation` and `product_tier` cascade from their product/category/add-on, which is
--     the rule. `product_category` and `product_occasion` cascade from the **product** side only:
--     they are pure per-product derivatives with no identity of their own (the same reasoning
--     `0002` recorded for `country_holiday` and `occasion_country`), while their category and
--     occasion sides stay `RESTRICT` so a category that is still listing products cannot vanish.
--     `country_price.product_id` and `addon_country_price.addon_id` are `RESTRICT` **on purpose
--     and against the "own rows" reading**: the price history is the Omnibus evidence (§8), so a
--     product may be retired by `status` but not deleted out from under its own price record.
--   - *`country_price (product_id, tier_key)` foreign key.* §5.1 declares `tier_key NULL` with no
--     reference. It is declared here as a composite foreign key to `product_tier
--     (product_id, tier_key)` (`MATCH SIMPLE`, so a null tier — a base or surcharge row — skips
--     the check): a price for a tier the product does not offer is a price no buyer can select,
--     which is precisely the "price shown = price charged" invariant AC-9 exists to protect.
--   - *`product.retired_at` is tied to `status`.* `CHECK ((status = 'retired') = (retired_at IS
--     NOT NULL))`: §5.1 names both columns and `plan/02` §7 depends on the date being there the
--     moment a product is retired (200-with-alternatives, then 410 from that date). A retired
--     product with no retirement date is a 410 nobody can schedule, so the pair is constrained
--     rather than trusted.
--   - *No CHECK list on `primary_flower`, `colour_primary`, `style`, `substitution_class`.* §5.1
--     spells CHECK lists for `product_type`, `price_tier` and `status` and spells these four as
--     bare columns; §14 A4 settled that "§5.1's explicit column lists govern". They are open
--     taxonomies (`plan/10` §1.1 grows a flower type without a schema change) and are closed at
--     the boundary by zod (`src/config/catalogue/schemas.ts`), which is where AC-7's "every status
--     column has a CHECK value list" stops: none of the four is a status.
--
-- **Indexes, measured rather than copied** (`/review 75` nit 6 carry-forward). Postgres indexes a
-- primary key and a unique constraint and nothing else, so an index earns its place here only
-- where a *read this schema will actually serve* would otherwise sequentially scan a table:
--
--   - `product_category_category_idx` — the category hub page (`plan/02` §5.4) reads "products in
--     this category"; the primary key `(product_id, category_id)` leads with the wrong column.
--   - `product_occasion_occasion_idx` — the occasion hub page, same shape.
--   - `country_price_country_active_idx (country_id, product_id) WHERE active_to IS NULL` — a
--     country shop listing prices N products in one destination country. The AC-9 unique index
--     leads with `product_id` and serves the PDP's single-product read; this one serves the
--     country-first read, and its predicate keeps it to the live rows.
--   - `addon_country_price_country_active_idx (country_id) WHERE active_to IS NULL` — the checkout
--     add-on list for a destination country; the primary key leads with `addon_id`.
--
-- Deliberately **not** indexed, with the basis stated: the parent side of `locale_code` and
-- `currency_code` foreign keys (reference tables of four and ten rows that are never deleted, so
-- the only lookup an index would serve does not happen); `product_translation`/
-- `category_translation` by `locale_code` (their `UNIQUE (locale_code, slug)` already leads with
-- it); `country_price.tier_key` (reached through `product_id`, which every read supplies);
-- `product_tier`, `product_translation` and `category_translation` by parent id (the primary key
-- leads with it). The same measurement is due again in `0004` and `0005` — an index added before
-- a query that needs it is write cost with no reader.
--
-- **`occasion_country.rule_type` widening (§14 A5).** `0002` is on `main`, so the seventh rule
-- type of spec 009 §5.2 — `orthodox_easter_offset`, the Julian computus RO needs — arrives as a
-- drop-and-recreate of `occasion_country_rule_type_check` here. The rollback restores the
-- six-value list after removing any seventh-type row (A5's "deleting or re-typing"); Phase 0 rows
-- are seed-projected and `pnpm db:seed` puts them back.
--
-- Rollback: `0003_catalog_pricing.down.sql`.

SET LOCAL ROLE app_owner;

/* ---------------------------------------------------------------------------
 * category — the taxonomy hubs of `plan/10` §2.1 (5 product types + 10 occasions
 * + 8 flower types), one row per hub, and its per-locale URL and copy.
 * ------------------------------------------------------------------------ */

CREATE TABLE public.category (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text        NOT NULL,
  kind        text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT category_key_key UNIQUE (key),
  CONSTRAINT category_key_check CHECK (key ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
  CONSTRAINT category_kind_check CHECK (kind IN ('productType', 'occasion', 'flowerType'))
);

COMMENT ON COLUMN public.category.kind IS
  'Which facet the key is drawn from — the value set toCategoryRow() projects (spec 002 §14 A2).';

-- The translation shape of `product_translation` (§14 A4: the review triple belongs on every
-- prose-bearing translation table). A category hub is an indexable page, so it carries a slug and
-- `UNIQUE (locale_code, slug)` (AC-8).
CREATE TABLE public.category_translation (
  category_id        uuid        NOT NULL,
  locale_code        text        NOT NULL,
  name               text        NOT NULL,
  slug               text        NOT NULL,
  description_md     text        NULL,
  seo_title          text        NULL,
  seo_description    text        NULL,
  translation_status text        NOT NULL DEFAULT 'machine',
  reviewed           boolean     NOT NULL DEFAULT false,
  reviewed_by        text        NULL,
  reviewed_at        timestamptz NULL,
  source_hash        text        NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT category_translation_pkey PRIMARY KEY (category_id, locale_code),
  CONSTRAINT category_translation_category_id_category_id_fk FOREIGN KEY (category_id)
    REFERENCES public.category (id) ON DELETE CASCADE,
  CONSTRAINT category_translation_locale_code_locale_code_fk FOREIGN KEY (locale_code)
    REFERENCES public.locale (code) ON DELETE RESTRICT,
  CONSTRAINT category_translation_locale_slug_key UNIQUE (locale_code, slug),
  CONSTRAINT category_translation_slug_check CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT category_translation_status_check CHECK (translation_status IN ('machine', 'human'))
);

/* ---------------------------------------------------------------------------
 * product — the six facets of `plan/10` §1.1 and the retirement flag
 * ------------------------------------------------------------------------ */

-- `sku` is the natural key the seed upserts on (`plan/10` §4), which is why it is unique and why
-- `source` exists: a seed run never touches a `real` row. A product is retired by `status`, never
-- deleted — `retired_at` is what lets `plan/02` §7 serve 200-with-alternatives and then 410.
CREATE TABLE public.product (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku                text        NOT NULL,
  product_type       text        NOT NULL,
  primary_flower     text        NOT NULL,
  colour_primary     text        NOT NULL,
  style              text        NOT NULL,
  price_tier         text        NOT NULL,
  substitution_class text        NOT NULL,
  vase_included      boolean     NOT NULL DEFAULT false,
  stem_count         integer     NULL,
  freshness_days     integer     NOT NULL,
  partner_only       boolean     NOT NULL DEFAULT false,
  status             text        NOT NULL DEFAULT 'draft',
  retired_at         timestamptz NULL,
  source             text        NOT NULL DEFAULT 'seed',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_sku_key UNIQUE (sku),
  CONSTRAINT product_product_type_check CHECK (product_type IN (
    'bouquet', 'arrangement', 'plant', 'funeral', 'gift_set', 'hamper', 'voucher'
  )),
  CONSTRAINT product_price_tier_check CHECK (price_tier IN (
    'essential', 'classic', 'premium', 'luxury'
  )),
  CONSTRAINT product_status_check CHECK (status IN ('draft', 'active', 'retired')),
  CONSTRAINT product_source_check CHECK (source IN ('seed', 'real')),
  CONSTRAINT product_stem_count_check CHECK (stem_count IS NULL OR stem_count > 0),
  CONSTRAINT product_freshness_days_check CHECK (freshness_days > 0),
  CONSTRAINT product_retired_at_check CHECK (
    (status = 'retired') = (retired_at IS NOT NULL)
  )
);

COMMENT ON COLUMN public.product.retired_at IS
  'Set exactly when status = retired: plan/02 §7 serves 200-with-alternatives then 410 from this date.';

-- `description_md` is nullable and the seed leaves it null: `isProductIndexable()` (spec 005)
-- requires a description **and** a reviewed translation, so a thin PDP is non-indexable by data
-- rather than by a robots rule somebody has to remember (§6).
CREATE TABLE public.product_translation (
  product_id         uuid        NOT NULL,
  locale_code        text        NOT NULL,
  name               text        NOT NULL,
  slug               text        NOT NULL,
  description_md     text        NULL,
  seo_title          text        NULL,
  seo_description    text        NULL,
  translation_status text        NOT NULL DEFAULT 'machine',
  reviewed           boolean     NOT NULL DEFAULT false,
  reviewed_by        text        NULL,
  reviewed_at        timestamptz NULL,
  source_hash        text        NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_translation_pkey PRIMARY KEY (product_id, locale_code),
  CONSTRAINT product_translation_product_id_product_id_fk FOREIGN KEY (product_id)
    REFERENCES public.product (id) ON DELETE CASCADE,
  CONSTRAINT product_translation_locale_code_locale_code_fk FOREIGN KEY (locale_code)
    REFERENCES public.locale (code) ON DELETE RESTRICT,
  CONSTRAINT product_translation_locale_slug_key UNIQUE (locale_code, slug),
  CONSTRAINT product_translation_slug_check CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT product_translation_status_check CHECK (translation_status IN ('machine', 'human'))
);

-- `label_key` is a message key and the CHECK says so (§7): spec 005 §7's alphabet is a dotted
-- `catalog.*` path whose segments are camelCase identifiers, so "Medium (12 stems)" is rejected
-- here and not only in review. `stems` is nullable per §14 A2 (b); `is_default` and its
-- one-per-product partial unique index are §14 A1 (b).
CREATE TABLE public.product_tier (
  product_id  uuid        NOT NULL,
  tier_key    text        NOT NULL,
  label_key   text        NOT NULL,
  stems       integer     NULL,
  sort        integer     NOT NULL DEFAULT 0,
  is_default  boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_tier_pkey PRIMARY KEY (product_id, tier_key),
  CONSTRAINT product_tier_product_id_product_id_fk FOREIGN KEY (product_id)
    REFERENCES public.product (id) ON DELETE CASCADE,
  CONSTRAINT product_tier_label_key_check CHECK (label_key ~ '^catalog(\.[a-z][A-Za-z0-9]*)+$'),
  CONSTRAINT product_tier_stems_check CHECK (stems IS NULL OR stems > 0),
  CONSTRAINT product_tier_sort_check CHECK (sort >= 0)
);

CREATE UNIQUE INDEX product_tier_default_idx
  ON public.product_tier USING btree (product_id) WHERE is_default;

COMMENT ON INDEX public.product_tier_default_idx IS
  'One default tier per product (spec 002 §14 A1 (b)): the PDP has exactly one pre-selected size.';

-- Join tables. Both cascade from the product (a product's own derivative rows) and restrict on
-- the taxonomy side (a category still listing products is not deletable).
CREATE TABLE public.product_category (
  product_id  uuid        NOT NULL,
  category_id uuid        NOT NULL,
  sort        integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_category_pkey PRIMARY KEY (product_id, category_id),
  CONSTRAINT product_category_product_id_product_id_fk FOREIGN KEY (product_id)
    REFERENCES public.product (id) ON DELETE CASCADE,
  CONSTRAINT product_category_category_id_category_id_fk FOREIGN KEY (category_id)
    REFERENCES public.category (id) ON DELETE RESTRICT,
  CONSTRAINT product_category_sort_check CHECK (sort >= 0)
);

CREATE INDEX product_category_category_idx
  ON public.product_category USING btree (category_id);

CREATE TABLE public.product_occasion (
  product_id  uuid        NOT NULL,
  occasion_id uuid        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_occasion_pkey PRIMARY KEY (product_id, occasion_id),
  CONSTRAINT product_occasion_product_id_product_id_fk FOREIGN KEY (product_id)
    REFERENCES public.product (id) ON DELETE CASCADE,
  CONSTRAINT product_occasion_occasion_id_occasion_id_fk FOREIGN KEY (occasion_id)
    REFERENCES public.occasion (id) ON DELETE RESTRICT
);

CREATE INDEX product_occasion_occasion_idx
  ON public.product_occasion USING btree (occasion_id);

/* ---------------------------------------------------------------------------
 * addon — the six Phase 0 extras and their per-country prices
 * ------------------------------------------------------------------------ */

-- `key` is the natural key and a message-key segment (`catalog.addon.{key}.name`), so it carries
-- the same snake_case alphabet as `occasion.key`. There is no `default_selected` column and there
-- may not be one: CRD Art. 22 forbids a pre-ticked extra (`plan/07` §2.1), and a column nobody can
-- set is a better prohibition than a comment.
CREATE TABLE public.addon (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key                    text        NOT NULL,
  kind                   text        NOT NULL,
  allergen_note_required boolean     NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT addon_key_key UNIQUE (key),
  CONSTRAINT addon_key_check CHECK (key ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
  CONSTRAINT addon_kind_check CHECK (kind IN (
    'confectionery', 'vessel', 'balloon', 'plush', 'alcohol', 'stationery'
  ))
);

-- The same translation shape and the same review triple (§14 A4), minus `slug` and the `seo_*`
-- pair: an add-on has no page of its own, so a slug here would be a URL nothing serves and AC-8
-- does not list this table among the slug-unique ones.
CREATE TABLE public.addon_translation (
  addon_id           uuid        NOT NULL,
  locale_code        text        NOT NULL,
  name               text        NOT NULL,
  description_md     text        NULL,
  translation_status text        NOT NULL DEFAULT 'machine',
  reviewed           boolean     NOT NULL DEFAULT false,
  reviewed_by        text        NULL,
  reviewed_at        timestamptz NULL,
  source_hash        text        NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT addon_translation_pkey PRIMARY KEY (addon_id, locale_code),
  CONSTRAINT addon_translation_addon_id_addon_id_fk FOREIGN KEY (addon_id)
    REFERENCES public.addon (id) ON DELETE CASCADE,
  CONSTRAINT addon_translation_locale_code_locale_code_fk FOREIGN KEY (locale_code)
    REFERENCES public.locale (code) ON DELETE RESTRICT,
  CONSTRAINT addon_translation_status_check CHECK (translation_status IN ('machine', 'human'))
);

-- Priced per destination country with **its own** VAT rate (PL chocolates 23% against flowers 8%
-- — `plan/06` §4, spec 005 §13 Q3, folded in by §14 A1 (a)). Dated like `country_price` and
-- superseded the same way, so the add-on line of an invoice can always be reconstructed.
CREATE TABLE public.addon_country_price (
  addon_id      uuid        NOT NULL,
  country_id    uuid        NOT NULL,
  retail_minor  bigint      NOT NULL,
  currency_code text        NOT NULL,
  vat_rate_bp   integer     NOT NULL,
  active_from   date        NOT NULL,
  active_to     date        NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT addon_country_price_pkey PRIMARY KEY (addon_id, country_id, active_from),
  CONSTRAINT addon_country_price_addon_id_addon_id_fk FOREIGN KEY (addon_id)
    REFERENCES public.addon (id) ON DELETE RESTRICT,
  CONSTRAINT addon_country_price_country_id_country_id_fk FOREIGN KEY (country_id)
    REFERENCES public.country (id) ON DELETE RESTRICT,
  CONSTRAINT addon_country_price_currency_code_currency_code_fk FOREIGN KEY (currency_code)
    REFERENCES public.currency (code) ON DELETE RESTRICT,
  CONSTRAINT addon_country_price_currency_code_check CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT addon_country_price_retail_minor_check CHECK (retail_minor >= 0),
  CONSTRAINT addon_country_price_vat_rate_bp_check CHECK (vat_rate_bp BETWEEN 0 AND 10000),
  CONSTRAINT addon_country_price_active_range_check CHECK (
    active_to IS NULL OR active_to > active_from
  )
);

CREATE UNIQUE INDEX addon_country_price_active_idx
  ON public.addon_country_price USING btree (addon_id, country_id) WHERE active_to IS NULL;

COMMENT ON INDEX public.addon_country_price_active_idx IS
  'One active add-on price per (add-on, country) — spec 002 §14 A1 (a), the AC-9 rule applied to add-ons.';

CREATE INDEX addon_country_price_country_active_idx
  ON public.addon_country_price USING btree (country_id) WHERE active_to IS NULL;

/* ---------------------------------------------------------------------------
 * country_price — AC-9, and with it §6's "schema price = visible price"
 * ------------------------------------------------------------------------ */

-- `retail_minor` is the **all-in** price: VAT and delivery included by definition (`CLAUDE.md`,
-- `plan/07` §4), which is why a surcharge is its own dated row (`surcharge_kind`) and never a
-- multiplier applied at render — a multiplier is a float and a rounding bug.
--
-- There is deliberately **no buyer-country column**: prices key on the destination only, so the
-- discriminatory-pricing pattern EU 2018/302 forbids is not expressible in this schema (§8).
CREATE TABLE public.country_price (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     uuid        NOT NULL,
  country_id     uuid        NOT NULL,
  tier_key       text        NULL,
  retail_minor   bigint      NOT NULL,
  currency_code  text        NOT NULL,
  vat_rate_bp    integer     NOT NULL,
  surcharge_kind text        NULL,
  active_from    date        NOT NULL,
  active_to      date        NULL,
  source         text        NOT NULL DEFAULT 'seed',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT country_price_product_id_product_id_fk FOREIGN KEY (product_id)
    REFERENCES public.product (id) ON DELETE RESTRICT,
  CONSTRAINT country_price_country_id_country_id_fk FOREIGN KEY (country_id)
    REFERENCES public.country (id) ON DELETE RESTRICT,
  CONSTRAINT country_price_currency_code_currency_code_fk FOREIGN KEY (currency_code)
    REFERENCES public.currency (code) ON DELETE RESTRICT,
  -- MATCH SIMPLE (the default): a null `tier_key` — a base or surcharge row — skips the check,
  -- and a named tier must be one this product actually offers.
  CONSTRAINT country_price_tier_fkey FOREIGN KEY (product_id, tier_key)
    REFERENCES public.product_tier (product_id, tier_key) ON DELETE RESTRICT,
  CONSTRAINT country_price_currency_code_check CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT country_price_retail_minor_check CHECK (retail_minor > 0),
  CONSTRAINT country_price_vat_rate_bp_check CHECK (vat_rate_bp BETWEEN 0 AND 10000),
  CONSTRAINT country_price_surcharge_kind_check CHECK (surcharge_kind IN ('sunday', 'peak_day')),
  CONSTRAINT country_price_source_check CHECK (source IN ('seed', 'real')),
  CONSTRAINT country_price_active_range_check CHECK (
    active_to IS NULL OR active_to > active_from
  )
);

-- AC-9. `NULLS NOT DISTINCT` because `tier_key` and `surcharge_kind` are nullable and the default
-- would let two open-ended base prices coexist unnoticed (see the header).
CREATE UNIQUE INDEX country_price_active_idx
  ON public.country_price USING btree (product_id, country_id, tier_key, surcharge_kind)
  NULLS NOT DISTINCT
  WHERE active_to IS NULL;

COMMENT ON INDEX public.country_price_active_idx IS
  'AC-9: at most one active retail row per (product, country, tier, surcharge). Supersede by setting active_to; never update a price in place (§8, Omnibus 30-day history).';

CREATE INDEX country_price_country_active_idx
  ON public.country_price USING btree (country_id, product_id) WHERE active_to IS NULL;

/* ---------------------------------------------------------------------------
 * §14 A5 — `occasion_country.rule_type` gains `orthodox_easter_offset`
 * ------------------------------------------------------------------------ */

ALTER TABLE public.occasion_country DROP CONSTRAINT occasion_country_rule_type_check;
ALTER TABLE public.occasion_country ADD CONSTRAINT occasion_country_rule_type_check CHECK (
  rule_type IN (
    'fixed', 'nth_weekday', 'last_weekday', 'easter_offset', 'orthodox_easter_offset',
    'lent_sunday', 'none'
  )
);

COMMENT ON COLUMN public.occasion_country.rule_type IS
  'plan/03 §9 plus spec 009 §5.2''s Julian computus: fixed | nth_weekday | last_weekday | easter_offset | orthodox_easter_offset | lent_sunday | none. Evaluated by spec 009 (spec 002 §14 A5).';

/* ---------------------------------------------------------------------------
 * updated_at triggers (AC-10): one per table, all on `0001`'s shared function
 * ------------------------------------------------------------------------ */

CREATE TRIGGER category_set_updated_at BEFORE UPDATE ON public.category
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER category_translation_set_updated_at BEFORE UPDATE ON public.category_translation
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER product_set_updated_at BEFORE UPDATE ON public.product
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER product_translation_set_updated_at BEFORE UPDATE ON public.product_translation
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER product_tier_set_updated_at BEFORE UPDATE ON public.product_tier
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER product_category_set_updated_at BEFORE UPDATE ON public.product_category
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER product_occasion_set_updated_at BEFORE UPDATE ON public.product_occasion
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER addon_set_updated_at BEFORE UPDATE ON public.addon
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER addon_translation_set_updated_at BEFORE UPDATE ON public.addon_translation
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER addon_country_price_set_updated_at BEFORE UPDATE ON public.addon_country_price
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER country_price_set_updated_at BEFORE UPDATE ON public.country_price
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

RESET ROLE;
