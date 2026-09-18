-- 0002_i18n_geo — the `i18n` and `geo` tables (spec 002 §5.1 "`i18n`" and "`geo`", §6, §7,
-- AC-7 and AC-8; `plan/03` §9; TASK-015).
--
-- Fifteen tables and nothing else: no policy (RLS is migration `0011`, TASK-023), no seed row
-- (spec 006 owns the data), no function beyond the `updated_at` triggers that attach to
-- `public.set_updated_at()` from `0001`.
--
-- Order inside the file is dependency order, and `locale` and `currency` come first because
-- every other table in it references one of them: `locale` → `message_catalog`,
-- `country_translation`, `country_locale_content`, `city_translation`, `occasion_translation`;
-- `currency` → `country.currency_code` and both sides of `fx_rate`.
--
-- The four rules this migration is measured against (§9 AC-7, §5.1 "Conventions"):
--
--   1. **No extension.** `gen_random_uuid()` is core from PG13; nothing here needs `citext`,
--      `unaccent` or `btree_gist`, so the dump restores on a stock Postgres (ADR-0015, AC-31).
--   2. **No `enum` type.** Every closed value set is a `text` column with a `CHECK` value list,
--      because adding a value to an enum inside a transaction is awkward and a `CHECK` dumps and
--      restores identically. Each list is named `<table>_<column>_check` so a later migration can
--      drop and recreate exactly one of them.
--   3. **Integer-only money adjacency.** No `numeric` and no `double precision` appears:
--      `country.vat_rate_bp` is basis points, `fx_rate.rate_ppm` is parts per million,
--      `currency.minor_unit_exponent` is the `Intl` exponent. There is no `*_minor` column in
--      this migration — retail money arrives with `country_price` in `0003`.
--   4. **Every localisable entity has a `*_translation` sibling** keyed `(entity_id, locale_code)`
--      with the slug uniqueness of §6: `UNIQUE (locale_code, slug)` on `country_translation` and
--      `occasion_translation`, `UNIQUE (locale_code, country_id, slug)` on `city_translation`
--      (the same city name in two countries is two legitimate URLs; twice in one country is not).
--      AC-8 is verified by TASK-016; this migration is where the constraints land.
--
-- Uniqueness is declared as the primary key wherever the spec's `UNIQUE (…)` *is* the row's
-- natural key (`country_translation`, `city_translation`, `occasion_translation`,
-- `country_locale_content`, `country_holiday`, `occasion_country`, `postcode_zone`, `fx_rate`),
-- rather than as a surrogate `uuid` plus a redundant second index. A duplicate insert is rejected
-- by the same index either way, which is what §6 and T-08 assert.
--
-- `city_translation`'s uniqueness spans a column of its *parent* (`country_id`), so the column is
-- carried on the child and kept honest by a composite foreign key to `city (id, country_id)` —
-- a translation cannot claim a country its city does not belong to. `postcode_zone` and `city`
-- reference their parents the same way, which is why `country` and `region` carry the otherwise
-- redundant `UNIQUE (id, country_id)` / `UNIQUE (id, iso2)` keys a composite reference needs.
--
-- `rtl` and `fallback_code` exist on `locale` from this migration on purpose (§7): the
-- RTL-readiness promise of `plan/03` §4 must not cost a migration the day a first RTL locale is
-- added, and `en-gb → en` fallback is already true today.
--
-- Every constraint is **named explicitly**, and the foreign keys carry Drizzle Kit's naming
-- convention (`<table>_<column>_<parent>_<parent_column>_fk`) rather than Postgres's implicit
-- `_fkey`, so that `pnpm db:generate` against `db/schema/` keeps producing an empty diff and the
-- drift rule of AC-26 compares like with like (`db/migrations/README.md`).
--
-- Grants are inherited, not written: `0001`'s `ALTER DEFAULT PRIVILEGES FOR ROLE app_owner`
-- grants `app_web` `SELECT, INSERT, UPDATE, DELETE` on every table `app_owner` creates in
-- `public`, which is exactly what the preamble below makes these tables.
--
-- Rollback: `0002_i18n_geo.down.sql`.

SET LOCAL ROLE app_owner;

/* ---------------------------------------------------------------------------
 * i18n
 * ------------------------------------------------------------------------ */

-- The launch locale set is ADR-0003's `en`, `en-gb`, `de`, `pl`; the rows are spec 006's.
-- `fallback_code` is a self-reference, so `en-gb` may fall back to `en` and `en` to nothing.
CREATE TABLE public.locale (
  code            text PRIMARY KEY,
  bcp47           text        NOT NULL,
  name            text        NOT NULL,
  is_launch       boolean     NOT NULL DEFAULT false,
  rtl             boolean     NOT NULL DEFAULT false,
  fallback_code   text        NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT locale_fallback_code_locale_code_fk FOREIGN KEY (fallback_code)
    REFERENCES public.locale (code) ON DELETE RESTRICT,
  CONSTRAINT locale_code_check CHECK (code = lower(code) AND code <> ''),
  CONSTRAINT locale_fallback_not_self_check CHECK (fallback_code IS NULL OR fallback_code <> code)
);

COMMENT ON TABLE public.locale IS
  'Spec 002 §5.1 i18n: the locale registry. rtl and fallback_code exist from 0002 so RTL costs no later migration (§7).';

-- Admin-editable message overrides plus the review metadata of `plan/03` §6. The *runtime* UI
-- catalogue stays `messages/{locale}.json` in the repository (spec 003); nothing reads this table
-- until 003/012, and `source` here means "who wrote the string", not the seed/real flag.
CREATE TABLE public.message_catalog (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  locale_code   text        NOT NULL,
  namespace     text        NOT NULL,
  key           text        NOT NULL,
  value         text        NOT NULL,
  source        text        NOT NULL DEFAULT 'machine',
  reviewed      boolean     NOT NULL DEFAULT false,
  reviewed_by   text        NULL,
  reviewed_at   timestamptz NULL,
  source_hash   text        NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT message_catalog_locale_code_locale_code_fk FOREIGN KEY (locale_code)
    REFERENCES public.locale (code) ON DELETE RESTRICT,
  CONSTRAINT message_catalog_locale_namespace_key_key UNIQUE (locale_code, namespace, key),
  CONSTRAINT message_catalog_source_check CHECK (source IN ('human', 'machine'))
);

/* ---------------------------------------------------------------------------
 * geo — currency first, then the country tree, then the occasion calendar
 * ------------------------------------------------------------------------ */

-- `minor_unit_exponent` is what makes `Intl.NumberFormat` correct for the zero-decimal and
-- three-decimal currencies (§7); `rounding_style` is the psychological-rounding rule spec 005
-- applies, stored as data so a new one is a row and not a deploy.
CREATE TABLE public.currency (
  code                 text PRIMARY KEY,
  minor_unit_exponent  smallint    NOT NULL,
  rounding_style       text        NOT NULL DEFAULT 'none',
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT currency_code_check CHECK (code ~ '^[A-Z]{3}$'),
  CONSTRAINT currency_minor_unit_exponent_check CHECK (minor_unit_exponent BETWEEN 0 AND 4),
  CONSTRAINT currency_rounding_style_check CHECK (rounding_style IN ('x99', 'x90', 'x9', 'none'))
);

COMMENT ON COLUMN public.currency.minor_unit_exponent IS
  'ISO 4217 exponent (JPY 0, EUR 2, …) so *_minor columns and Intl agree — spec 002 §7.';

-- `vat_rate_bp` is basis points (`plan/12` §2: VAT stays an integer). `supply_model` is nullable
-- until open question B1 is answered (`plan/06` §4) and is snapshotted onto `order` in 0007.
-- `status` is the go-live flip of `plan/10` §4: a data change in admin, never a code change.
CREATE TABLE public.country (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  iso2                  text        NOT NULL,
  status                text        NOT NULL DEFAULT 'demo',
  currency_code         text        NOT NULL,
  vat_rate_bp           integer     NOT NULL,
  iana_zone             text        NOT NULL,
  same_day_cutoff_local time        NULL,
  delivery_days         text[]      NOT NULL DEFAULT '{}',
  sunday_delivery       text        NOT NULL DEFAULT 'none',
  guide_published       boolean     NOT NULL DEFAULT false,
  supply_model          text        NULL,
  source                text        NOT NULL DEFAULT 'seed',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT country_currency_code_currency_code_fk FOREIGN KEY (currency_code)
    REFERENCES public.currency (code) ON DELETE RESTRICT,
  CONSTRAINT country_iso2_key UNIQUE (iso2),
  -- (id, iso2) so a child table may carry the ISO code without being able to disagree with it.
  CONSTRAINT country_id_iso2_key UNIQUE (id, iso2),
  CONSTRAINT country_iso2_check CHECK (iso2 ~ '^[A-Z]{2}$'),
  CONSTRAINT country_status_check CHECK (status IN ('demo', 'live', 'disabled')),
  CONSTRAINT country_vat_rate_bp_check CHECK (vat_rate_bp BETWEEN 0 AND 10000),
  CONSTRAINT country_sunday_delivery_check CHECK (sunday_delivery IN ('none', 'peak', 'always')),
  CONSTRAINT country_supply_model_check CHECK (supply_model IN ('principal', 'agent')),
  CONSTRAINT country_source_check CHECK (source IN ('seed', 'real'))
);

COMMENT ON COLUMN public.country.same_day_cutoff_local IS
  'Local wall-clock cutoff, evaluated in iana_zone by spec 009 — never stored as an instant (plan/03 §10).';

-- The exonyms of `plan/03` §5: "Poland"/"Polen"/"Polska" are three rows, and the slug that
-- appears in a shop URL is per locale. UNIQUE (locale_code, slug) is §6, verified by TASK-016.
CREATE TABLE public.country_translation (
  country_id   uuid        NOT NULL,
  locale_code  text        NOT NULL,
  name         text        NOT NULL,
  slug         text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT country_translation_pkey PRIMARY KEY (country_id, locale_code),
  CONSTRAINT country_translation_country_id_country_id_fk FOREIGN KEY (country_id)
    REFERENCES public.country (id) ON DELETE CASCADE,
  CONSTRAINT country_translation_locale_code_locale_code_fk FOREIGN KEY (locale_code)
    REFERENCES public.locale (code) ON DELETE RESTRICT,
  CONSTRAINT country_translation_locale_slug_key UNIQUE (locale_code, slug),
  CONSTRAINT country_translation_slug_check CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

-- The corridor-page source of `plan/02` §5.2. `state` separates the demo-era guide from the live
-- wording (`plan/10` §4: "same table, state = live variant"). `reviewed` is the noindex gate of
-- §6 — a machine-translated guide is never indexable, so the column defaults to false.
CREATE TABLE public.country_locale_content (
  country_id       uuid        NOT NULL,
  locale_code      text        NOT NULL,
  state            text        NOT NULL,
  h1               text        NOT NULL,
  intro_md         text        NOT NULL,
  faq              jsonb       NOT NULL DEFAULT '[]'::jsonb,
  local_flowers_md text        NULL,
  taboos_md        text        NULL,
  version          integer     NOT NULL DEFAULT 1,
  reviewed         boolean     NOT NULL DEFAULT false,
  reviewed_by      text        NULL,
  reviewed_at      timestamptz NULL,
  source           text        NOT NULL DEFAULT 'seed',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT country_locale_content_pkey PRIMARY KEY (country_id, locale_code, state),
  CONSTRAINT country_locale_content_country_id_country_id_fk FOREIGN KEY (country_id)
    REFERENCES public.country (id) ON DELETE CASCADE,
  CONSTRAINT country_locale_content_locale_code_locale_code_fk FOREIGN KEY (locale_code)
    REFERENCES public.locale (code) ON DELETE RESTRICT,
  CONSTRAINT country_locale_content_state_check CHECK (state IN ('guide', 'live')),
  CONSTRAINT country_locale_content_source_check CHECK (source IN ('seed', 'real')),
  CONSTRAINT country_locale_content_version_check CHECK (version >= 1)
);

-- Administrative region (voivodeship, Bundesland, county). Named by spec 002 §2's `geo` list with
-- no column set of its own; it carries the country it belongs to, the code that country's own
-- administration uses and an endonym. Localised place names are city-level data in practice, so
-- there is no `region_translation` until a page needs one.
CREATE TABLE public.region (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id  uuid        NOT NULL,
  code        text        NOT NULL,
  name        text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT region_country_id_country_id_fk FOREIGN KEY (country_id)
    REFERENCES public.country (id) ON DELETE RESTRICT,
  CONSTRAINT region_country_code_key UNIQUE (country_id, code),
  -- (id, country_id) so `city` cannot point at a region of a different country.
  CONSTRAINT region_id_country_key UNIQUE (id, country_id)
);

-- A city carries no name: names and slugs are `city_translation` rows, because a city page URL is
-- per locale (§6). `iana_zone` is nullable and overrides the country's only where a country spans
-- zones; `is_indexable` is ADR-0007's "index only true pages" as a column.
CREATE TABLE public.city (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id   uuid        NOT NULL,
  region_id    uuid        NULL,
  iana_zone    text        NULL,
  is_indexable boolean     NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT city_country_id_country_id_fk FOREIGN KEY (country_id)
    REFERENCES public.country (id) ON DELETE RESTRICT,
  -- MATCH SIMPLE (the default): a NULL `region_id` skips the check, so a city without a region is
  -- legal and a city *with* one cannot borrow a region from another country.
  CONSTRAINT city_region_fkey FOREIGN KEY (region_id, country_id)
    REFERENCES public.region (id, country_id) ON DELETE RESTRICT,
  -- (id, country_id) so `city_translation` can key its slug uniqueness on the country (§6).
  CONSTRAINT city_id_country_key UNIQUE (id, country_id)
);

CREATE INDEX city_country_idx ON public.city USING btree (country_id);

-- UNIQUE (locale_code, country_id, slug): "Kraków" in PL and a same-named place in another
-- country are two legitimate URLs; two in one country are a collision (§6, T-08).
CREATE TABLE public.city_translation (
  city_id      uuid        NOT NULL,
  country_id   uuid        NOT NULL,
  locale_code  text        NOT NULL,
  name         text        NOT NULL,
  slug         text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT city_translation_pkey PRIMARY KEY (city_id, locale_code),
  CONSTRAINT city_translation_locale_code_locale_code_fk FOREIGN KEY (locale_code)
    REFERENCES public.locale (code) ON DELETE RESTRICT,
  CONSTRAINT city_translation_city_fkey FOREIGN KEY (city_id, country_id)
    REFERENCES public.city (id, country_id) ON DELETE CASCADE,
  CONSTRAINT city_translation_locale_country_slug_key UNIQUE (locale_code, country_id, slug),
  CONSTRAINT city_translation_slug_check CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

-- Postcode prefix → city, the routing input of spec 016. `prefix` is the leading characters of a
-- destination postcode, uppercased and stripped of spaces by the caller.
CREATE TABLE public.postcode_zone (
  country_id  uuid        NOT NULL,
  prefix      text        NOT NULL,
  city_id     uuid        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT postcode_zone_pkey PRIMARY KEY (country_id, prefix),
  CONSTRAINT postcode_zone_city_fkey FOREIGN KEY (city_id, country_id)
    REFERENCES public.city (id, country_id) ON DELETE RESTRICT,
  CONSTRAINT postcode_zone_prefix_check CHECK (prefix = upper(prefix) AND prefix <> '')
);

CREATE INDEX postcode_zone_city_idx ON public.postcode_zone USING btree (city_id);

-- Public holidays per destination country. `closed = true` means florists do not deliver, which
-- is a cutoff input for spec 009 rather than a display fact.
CREATE TABLE public.country_holiday (
  country_id  uuid        NOT NULL,
  "date"      date        NOT NULL,
  name        text        NOT NULL,
  closed      boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT country_holiday_pkey PRIMARY KEY (country_id, "date"),
  CONSTRAINT country_holiday_country_id_country_id_fk FOREIGN KEY (country_id)
    REFERENCES public.country (id) ON DELETE CASCADE
);

-- The occasion facet of `plan/10` §1.1: `evergreen` (birthday, sympathy …) or `seasonal` (the
-- dated ones). The dates themselves are `occasion_country` rows.
CREATE TABLE public.occasion (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text        NOT NULL,
  kind        text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT occasion_key_key UNIQUE (key),
  CONSTRAINT occasion_key_check CHECK (key ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
  CONSTRAINT occasion_kind_check CHECK (kind IN ('evergreen', 'seasonal'))
);

CREATE TABLE public.occasion_translation (
  occasion_id  uuid        NOT NULL,
  locale_code  text        NOT NULL,
  name         text        NOT NULL,
  slug         text        NOT NULL,
  intro_md     text        NULL,
  reviewed     boolean     NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT occasion_translation_pkey PRIMARY KEY (occasion_id, locale_code),
  CONSTRAINT occasion_translation_occasion_id_occasion_id_fk FOREIGN KEY (occasion_id)
    REFERENCES public.occasion (id) ON DELETE CASCADE,
  CONSTRAINT occasion_translation_locale_code_locale_code_fk FOREIGN KEY (locale_code)
    REFERENCES public.locale (code) ON DELETE RESTRICT,
  CONSTRAINT occasion_translation_locale_slug_key UNIQUE (locale_code, slug),
  CONSTRAINT occasion_translation_slug_check CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

-- The occasion calendar as data (`plan/03` §9). The six `rule_type` values are that section's
-- verbatim: `fixed(MM-DD)`, `nth_weekday(month, weekday, n)`, `last_weekday(month, weekday)`,
-- `easter_offset(days)`, `lent_sunday(n)` (UK Mothering Sunday) and `none`; `rule` holds that
-- rule type's arguments. The evaluator `occasionDate(rule, year)` is **spec 009's** — no date
-- arithmetic lives here, only the rows it reads.
CREATE TABLE public.occasion_country (
  occasion_id             uuid        NOT NULL,
  country_id              uuid        NOT NULL,
  rule_type               text        NOT NULL,
  rule                    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  observed                boolean     NOT NULL DEFAULT true,
  indexable_override      boolean     NULL,
  promo_start_offset_days integer     NOT NULL DEFAULT 0,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT occasion_country_pkey PRIMARY KEY (occasion_id, country_id),
  CONSTRAINT occasion_country_occasion_id_occasion_id_fk FOREIGN KEY (occasion_id)
    REFERENCES public.occasion (id) ON DELETE CASCADE,
  CONSTRAINT occasion_country_country_id_country_id_fk FOREIGN KEY (country_id)
    REFERENCES public.country (id) ON DELETE CASCADE,
  CONSTRAINT occasion_country_rule_type_check CHECK (rule_type IN (
    'fixed', 'nth_weekday', 'last_weekday', 'easter_offset', 'lent_sunday', 'none'
  )),
  CONSTRAINT occasion_country_promo_offset_check CHECK (promo_start_offset_days >= 0)
);

COMMENT ON COLUMN public.occasion_country.rule_type IS
  'plan/03 §9 verbatim: fixed | nth_weekday | last_weekday | easter_offset | lent_sunday | none. Evaluated by spec 009.';

-- Parts per million as a bigint, never a float (§7): 1 EUR = 4.3215 PLN is 4321500.
CREATE TABLE public.fx_rate (
  base_code   text        NOT NULL,
  quote_code  text        NOT NULL,
  rate_ppm    bigint      NOT NULL,
  as_of       date        NOT NULL,
  source      text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fx_rate_pkey PRIMARY KEY (base_code, quote_code, as_of),
  CONSTRAINT fx_rate_base_code_currency_code_fk FOREIGN KEY (base_code)
    REFERENCES public.currency (code) ON DELETE RESTRICT,
  CONSTRAINT fx_rate_quote_code_currency_code_fk FOREIGN KEY (quote_code)
    REFERENCES public.currency (code) ON DELETE RESTRICT,
  CONSTRAINT fx_rate_rate_ppm_check CHECK (rate_ppm > 0),
  CONSTRAINT fx_rate_distinct_currencies_check CHECK (base_code <> quote_code)
);

COMMENT ON COLUMN public.fx_rate.source IS
  'The rate provider ("ecb"), an open set that grows without a migration — not a status, so no CHECK value list (spec 002 AC-7).';

/* ---------------------------------------------------------------------------
 * updated_at triggers (AC-10): one per table, all on `0001`'s shared function
 * ------------------------------------------------------------------------ */

CREATE TRIGGER locale_set_updated_at BEFORE UPDATE ON public.locale
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER message_catalog_set_updated_at BEFORE UPDATE ON public.message_catalog
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER currency_set_updated_at BEFORE UPDATE ON public.currency
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER country_set_updated_at BEFORE UPDATE ON public.country
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER country_translation_set_updated_at BEFORE UPDATE ON public.country_translation
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER country_locale_content_set_updated_at BEFORE UPDATE ON public.country_locale_content
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER region_set_updated_at BEFORE UPDATE ON public.region
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER city_set_updated_at BEFORE UPDATE ON public.city
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER city_translation_set_updated_at BEFORE UPDATE ON public.city_translation
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER postcode_zone_set_updated_at BEFORE UPDATE ON public.postcode_zone
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER country_holiday_set_updated_at BEFORE UPDATE ON public.country_holiday
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER occasion_set_updated_at BEFORE UPDATE ON public.occasion
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER occasion_translation_set_updated_at BEFORE UPDATE ON public.occasion_translation
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER occasion_country_set_updated_at BEFORE UPDATE ON public.occasion_country
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER fx_rate_set_updated_at BEFORE UPDATE ON public.fx_rate
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

RESET ROLE;
