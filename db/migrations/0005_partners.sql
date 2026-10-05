-- 0005_partners — the florist side of the relay: who the partners are, who may act for them, what
-- they cover and make, when they are closed, who applied, and what they are paid (spec 002 §5.1
-- "`partners`", §2 "RLS and roles", §8; spec 010 §5.1 A; spec 011 §5.1; `plan/11` §1; TASK-018).
--
-- Nine tables — `fulfillment_partner`, `partner_translation`, `partner_member`,
-- `partner_coverage`, `partner_blackout`, `partner_catalog_mapping`, `partner_application`,
-- `payout`, `payout_line` — their `updated_at` triggers, the trigger that keeps a payout in its
-- partner's currency, the pair that keeps coverage in the partner's country, and the trigger pair that makes `partner_application.media_asset_ids` a real
-- reference to `0004`'s `media_asset`. No policy (RLS
-- is `0011`, TASK-023: AC-16's partner scoping keys on `partner_member`, written there), no seed row
-- (the demo partners are TASK-026's).
--
-- The four properties this migration is measured on
-- --------------------------------------------------
--
--   1. **A partner's status is a value, never a code path** (`CLAUDE.md`: "Country/partner go-live
--      is a data flip in admin"). `fulfillment_partner.status` is §5.1's five-value CHECK list, and
--      `demo` is in it because spec 010 §5.1 A's `ASSIGNMENT_MODE_MISMATCH` trigger (TASK-019/020)
--      routes demo and test orders only to `status = 'demo'` partners and live orders only to
--      `active` ones. There is **no default**: a partner row that forgot its status must fail the
--      insert, not silently become a demo florist that receives demo orders or an active one that
--      receives real ones.
--   2. **`partner_member` is the org scope** (`plan/11` §1, AC-16). One person may belong to
--      several partners (a chain), so membership is a row per (user, partner) and the primary key
--      leads with `user_id`: spec 011's `requireFloristContext()` loads a member's partners on
--      every request, and TASK-023's policies read the resulting `app.partner_ids`.
--   3. **Money is integer minor units plus a currency** (§2, AC-5). `partner_payout_minor`,
--      `total_minor` and `amount_minor` are `bigint`, each beside a `currency_code` foreign-keyed
--      to `currency` and shape-checked. Everything a partner is paid is in the partner's
--      `payout_currency_code`: a mapping references the partner by `(partner_id, currency_code)`,
--      a payout is checked against the partner's currency when it is written
--      (`payout_currency_check()`, which locks the partner row `FOR SHARE`), and a `payout_line`
--      references its payout by `(payout_id, currency_code)`. An order is paid once:
--      `payout_line_order_once_idx` admits one `order` line per order across every payout.
--   4. **`media_asset_ids` references `0004`'s assets** (TASK-018 brief). Postgres has no foreign
--      key from an array element, so two triggers stand in for one: an application may list only
--      existing `kind = 'partner'`, `visibility = 'private'` assets (raised as `23503`, the
--      foreign-key SQLSTATE), and such an asset can be neither deleted nor made public or
--      re-kinded while an application lists it. The check **locks the listed assets `FOR SHARE`**,
--      as a real foreign key locks its parent row: a concurrent delete, or an update of `kind` or
--      `visibility` (which takes `FOR NO KEY UPDATE`, and so would not wait for `FOR KEY SHARE`),
--      waits for the application's transaction and then meets the guard; an application written
--      while such an update is in flight waits for it and re-reads the row. Both functions are
--      `SECURITY DEFINER` as `app_owner` with a pinned `search_path`, so the check sees every row
--      whatever policy the caller's role reads through once TASK-023 enables RLS.
--
-- Column sets are §5.1's, in §5.1's order, then `created_at` / `updated_at`. The value lists are
-- the tuples in `db/schema/partners.ts`, pinned against this file by
-- `tests/unit/schema-partners-customers.test.ts`.
--
-- **Deviations from §5.1's text, declared rather than silent**
--
--   - *Not-null choices.* §5.1 marks only some columns `NULL`. Required here: a partner's code,
--     legal name, city label, country, status, channel, contact email, payout currency and daily
--     capacity; an application's business name, city and language. Nullable, because spec 011's
--     own migration tightens them (`country_id`, `contact_email`, `contact_phone`) or because they
--     are optional by nature (`coverage_note`, the URLs, `registration_number`).
--   - *`partner_member.user_id` and `payout_line.order_id` have no foreign key yet.* `users` is
--     `0010` (TASK-022) and `"order"` is `0007` (TASK-019); each of those migrations adds the
--     constraint, and its rollback drops it (carried forward in their briefs).
--   - *Primary keys.* `partner_translation`, `partner_member` and `partner_blackout` are keyed by
--     §5.1's unique tuple, as `product_tier` is in `0003`: the rows have no identity of their own.
--     `partner_coverage`, `partner_catalog_mapping` and `payout_line` keep a surrogate `id`,
--     because their natural key has a nullable column (`city_id`/`postcode_zone_id`, `tier_key`,
--     `order_id`).
--   - *`NULLS NOT DISTINCT`* on `partner_coverage`'s and `partner_catalog_mapping`'s natural keys.
--     §5.1 writes `UNIQUE (partner_id, product_id, tier_key)` with `tier_key NULL`; under the
--     default two base-tier mappings for one product would both be accepted and the payout would
--     depend on row order. Core Postgres from 15, as in `0003`.
--   - *`partner_catalog_mapping (product_id, tier_key)`* references `product_tier`, `MATCH SIMPLE`,
--     exactly as `country_price` does in `0003`: a null tier skips the check, a named tier must be
--     one the product offers.
--   - *Two supporting keys on parent tables.* `fulfillment_partner_id_payout_currency_key UNIQUE
--     (id, payout_currency_code)` for the mapping's composite reference, and, on `0002`'s
--     `postcode_zone`, `postcode_zone_id_city_key UNIQUE (id, city_id)`, so that a coverage row
--     naming both a city and a zone names a zone *in* that city (`partner_coverage_zone_city_fkey`,
--     `MATCH SIMPLE`: a row with only one of the two skips it). The rollback drops both.
--   - *Currency changes.* Because a mapping references the partner's currency (`NO ACTION`), a
--     partner's `payout_currency_code` cannot change while mappings exist in the old one: the
--     amounts are in that currency, and re-labelling them would be a money bug. Admin replaces the
--     mappings and the currency in one transaction. Payouts are history: they are checked when
--     written, not when the partner later changes currency.
--   - *Coverage stays in the partner's country* (breaker r2 on PR 200). There is no extra column:
--     `partner_coverage_country_check()` compares the row's city and zone with the partner's
--     `country_id`, locking the partner row `FOR SHARE`. `fulfillment_partner_coverage_country_guard()`
--     refuses moving a partner to another country while it still covers the old one. A mis-entered
--     admin row would otherwise route one country's orders to another country's florist. Moving a
--     city or zone between countries is not checked; `0002`'s composite keys make that a data fix,
--     never an admin action.
--   - *Shape checks* beyond §5.1, each one line: `code` is a lowercase slug (the seed's natural
--     key), phones are E.164, basis-point rates are 0..10000, capacities are positive, a payout
--     period ends on or after it starts, an accepted invitation was accepted after it was sent.
--
-- **Indexes, measured rather than copied** (as in `0003`/`0004`). Beyond primary keys and unique
-- constraints (the two supporting keys above included), exactly three:
--
--   - `payout_line_payout_id_idx (payout_id)` — a statement's lines, the `RESTRICT` check on a
--     payout delete, and TASK-023's policy that reaches a line's partner through its payout.
--   - `payout_line_order_once_idx` — the "an order is paid once" rule above.
--   - `partner_application_media_asset_ids_idx` (GIN, core `array_ops`) — the media guard runs on
--     every `media_asset` delete, and the retention sweep deletes delivery photographs daily.
--
-- Deliberately **not** indexed: `fulfillment_partner` by country or status (tens of rows; routing
-- reads them all), `partner_coverage` by city or zone (its unique key leads with `partner_id`,
-- which is what the partner scope filters on; measure again at a few hundred partners),
-- `partner_member` by `partner_id` (an admin read over a handful of rows).
--
-- Rollback: `0005_partners.down.sql`.

SET LOCAL ROLE app_owner;

/* ---------------------------------------------------------------------------
 * fulfillment_partner — a vetted local florist (or a demo one)
 * ------------------------------------------------------------------------ */

CREATE TABLE public.fulfillment_partner (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                  text        NOT NULL,
  legal_name            text        NOT NULL,
  city_label            text        NOT NULL,
  country_id            uuid        NOT NULL,
  status                text        NOT NULL,
  public_profile_opt_in boolean     NOT NULL DEFAULT false,
  notification_channel  text        NOT NULL DEFAULT 'email',
  contact_email         text        NOT NULL,
  contact_phone         text        NULL,
  payout_currency_code  text        NOT NULL,
  capacity_per_day      integer     NOT NULL,
  rating_90d_bp         integer     NULL,
  acceptance_rate_bp    integer     NULL,
  source                text        NOT NULL DEFAULT 'seed',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fulfillment_partner_code_key UNIQUE (code),
  -- (id, payout_currency_code) so a mapping can only be in its partner's currency.
  CONSTRAINT fulfillment_partner_id_payout_currency_key UNIQUE (id, payout_currency_code),
  CONSTRAINT fulfillment_partner_country_id_country_id_fk FOREIGN KEY (country_id)
    REFERENCES public.country (id) ON DELETE RESTRICT,
  CONSTRAINT fulfillment_partner_payout_currency_code_currency_code_fk FOREIGN KEY (payout_currency_code)
    REFERENCES public.currency (code) ON DELETE RESTRICT,
  CONSTRAINT fulfillment_partner_code_check CHECK (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT fulfillment_partner_status_check CHECK (status IN (
    'demo', 'onboarding', 'active', 'paused', 'offboarded'
  )),
  CONSTRAINT fulfillment_partner_notification_channel_check CHECK (notification_channel IN (
    'email', 'whatsapp'
  )),
  CONSTRAINT fulfillment_partner_contact_phone_check CHECK (contact_phone ~ '^\+[1-9][0-9]{1,14}$'),
  CONSTRAINT fulfillment_partner_whatsapp_phone_check CHECK (
    notification_channel <> 'whatsapp' OR contact_phone IS NOT NULL
  ),
  CONSTRAINT fulfillment_partner_payout_currency_code_check CHECK (payout_currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT fulfillment_partner_capacity_per_day_check CHECK (capacity_per_day > 0),
  CONSTRAINT fulfillment_partner_rating_90d_bp_check CHECK (rating_90d_bp BETWEEN 0 AND 10000),
  CONSTRAINT fulfillment_partner_acceptance_rate_bp_check CHECK (acceptance_rate_bp BETWEEN 0 AND 10000),
  CONSTRAINT fulfillment_partner_source_check CHECK (source IN ('seed', 'real'))
);

COMMENT ON COLUMN public.fulfillment_partner.status IS
  'Go-live is a data flip in admin (plan/10 §4), never a deploy. demo partners receive only demo/test orders, active ones only live orders (spec 010 §5.1 A). No default.';

/* ---------------------------------------------------------------------------
 * partner_translation — the partner's public name and blurb per locale
 * ------------------------------------------------------------------------ */

CREATE TABLE public.partner_translation (
  partner_id   uuid        NOT NULL,
  locale_code  text        NOT NULL,
  display_name text        NOT NULL,
  blurb_md     text        NULL,
  reviewed     boolean     NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_translation_pkey PRIMARY KEY (partner_id, locale_code),
  CONSTRAINT partner_translation_partner_id_fulfillment_partner_id_fk FOREIGN KEY (partner_id)
    REFERENCES public.fulfillment_partner (id) ON DELETE CASCADE,
  CONSTRAINT partner_translation_locale_code_locale_code_fk FOREIGN KEY (locale_code)
    REFERENCES public.locale (code) ON DELETE RESTRICT
);

/* ---------------------------------------------------------------------------
 * partner_member — who may act for a partner (the org scope of plan/11 §1)
 * ------------------------------------------------------------------------ */

-- `user_id` will reference `users (id)` from `0010` (TASK-022), which adds the constraint.
CREATE TABLE public.partner_member (
  user_id     uuid        NOT NULL,
  partner_id  uuid        NOT NULL,
  role        text        NOT NULL,
  invited_at  timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_member_pkey PRIMARY KEY (user_id, partner_id),
  CONSTRAINT partner_member_partner_id_fulfillment_partner_id_fk FOREIGN KEY (partner_id)
    REFERENCES public.fulfillment_partner (id) ON DELETE RESTRICT,
  CONSTRAINT partner_member_role_check CHECK (role IN ('owner', 'staff')),
  CONSTRAINT partner_member_accepted_at_check CHECK (accepted_at >= invited_at)
);

COMMENT ON TABLE public.partner_member IS
  'plan/11 §1 org scope: a member''s partner_id rows become app.partner_ids, which every partner-scoped policy reads (AC-16, migration 0011).';

/* ---------------------------------------------------------------------------
 * partner_coverage — where a partner delivers: a city, a postcode zone, or both
 * ------------------------------------------------------------------------ */

-- The supporting key for `partner_coverage_zone_city_fkey` (header: "Two supporting keys").
ALTER TABLE public.postcode_zone
  ADD CONSTRAINT postcode_zone_id_city_key UNIQUE (id, city_id);

CREATE TABLE public.partner_coverage (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id       uuid        NOT NULL,
  city_id          uuid        NULL,
  postcode_zone_id uuid        NULL,
  capacity_per_day integer     NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_coverage_partner_id_fulfillment_partner_id_fk FOREIGN KEY (partner_id)
    REFERENCES public.fulfillment_partner (id) ON DELETE RESTRICT,
  CONSTRAINT partner_coverage_city_id_city_id_fk FOREIGN KEY (city_id)
    REFERENCES public.city (id) ON DELETE RESTRICT,
  CONSTRAINT partner_coverage_postcode_zone_id_postcode_zone_id_fk FOREIGN KEY (postcode_zone_id)
    REFERENCES public.postcode_zone (id) ON DELETE RESTRICT,
  -- MATCH SIMPLE (the default): only a row naming both is checked; its zone must be in its city.
  CONSTRAINT partner_coverage_zone_city_fkey FOREIGN KEY (postcode_zone_id, city_id)
    REFERENCES public.postcode_zone (id, city_id) ON DELETE RESTRICT,
  CONSTRAINT partner_coverage_target_check CHECK (city_id IS NOT NULL OR postcode_zone_id IS NOT NULL),
  CONSTRAINT partner_coverage_capacity_per_day_check CHECK (capacity_per_day > 0)
);

-- The seed's natural key (TASK-026 upserts on it) and "no duplicate coverage row".
CREATE UNIQUE INDEX partner_coverage_partner_target_idx
  ON public.partner_coverage USING btree (partner_id, city_id, postcode_zone_id)
  NULLS NOT DISTINCT;

COMMENT ON COLUMN public.partner_coverage.capacity_per_day IS
  'Per-area override; NULL means the partner''s own capacity_per_day.';

/* ---------------------------------------------------------------------------
 * partner_blackout — a date the partner cannot deliver
 * ------------------------------------------------------------------------ */

CREATE TABLE public.partner_blackout (
  partner_id uuid        NOT NULL,
  date       date        NOT NULL,
  reason     text        NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_blackout_pkey PRIMARY KEY (partner_id, date),
  CONSTRAINT partner_blackout_partner_id_fulfillment_partner_id_fk FOREIGN KEY (partner_id)
    REFERENCES public.fulfillment_partner (id) ON DELETE RESTRICT
);

/* ---------------------------------------------------------------------------
 * partner_catalog_mapping — what a partner can make, and what it is paid for it
 * ------------------------------------------------------------------------ */

CREATE TABLE public.partner_catalog_mapping (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id           uuid        NOT NULL,
  product_id           uuid        NOT NULL,
  tier_key             text        NULL,
  can_fulfil           boolean     NOT NULL DEFAULT true,
  partner_payout_minor bigint      NOT NULL,
  currency_code        text        NOT NULL,
  source               text        NOT NULL DEFAULT 'seed',
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_catalog_mapping_partner_id_fulfillment_partner_id_fk FOREIGN KEY (partner_id)
    REFERENCES public.fulfillment_partner (id) ON DELETE RESTRICT,
  CONSTRAINT partner_catalog_mapping_product_id_product_id_fk FOREIGN KEY (product_id)
    REFERENCES public.product (id) ON DELETE RESTRICT,
  -- MATCH SIMPLE (the default): a null `tier_key` skips the check, a named tier must exist.
  CONSTRAINT partner_catalog_mapping_tier_fkey FOREIGN KEY (product_id, tier_key)
    REFERENCES public.product_tier (product_id, tier_key) ON DELETE RESTRICT,
  CONSTRAINT partner_catalog_mapping_currency_code_currency_code_fk FOREIGN KEY (currency_code)
    REFERENCES public.currency (code) ON DELETE RESTRICT,
  -- A mapping is in its partner's payout currency.
  CONSTRAINT partner_catalog_mapping_partner_currency_fkey FOREIGN KEY (partner_id, currency_code)
    REFERENCES public.fulfillment_partner (id, payout_currency_code) ON DELETE RESTRICT,
  CONSTRAINT partner_catalog_mapping_currency_code_check CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT partner_catalog_mapping_partner_payout_minor_check CHECK (partner_payout_minor >= 0),
  CONSTRAINT partner_catalog_mapping_source_check CHECK (source IN ('seed', 'real'))
);

-- §5.1's UNIQUE (partner_id, product_id, tier_key); NULLS NOT DISTINCT so one base-tier row only.
CREATE UNIQUE INDEX partner_catalog_mapping_partner_product_tier_idx
  ON public.partner_catalog_mapping USING btree (partner_id, product_id, tier_key)
  NULLS NOT DISTINCT;

/* ---------------------------------------------------------------------------
 * partner_application — the "become a partner" form (written by spec 011)
 * ------------------------------------------------------------------------ */

CREATE TABLE public.partner_application (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name        text        NOT NULL,
  city                 text        NOT NULL,
  country_id           uuid        NULL,
  coverage_note        text        NULL,
  capacity_per_day     integer     NULL,
  registration_number  text        NULL,
  instagram_url        text        NULL,
  website_url          text        NULL,
  preferred_channel    text        NULL,
  language_code        text        NOT NULL,
  contact_email        text        NULL,
  contact_phone        text        NULL,
  media_asset_ids      uuid[]      NOT NULL DEFAULT '{}',
  status               text        NOT NULL DEFAULT 'new',
  converted_partner_id uuid        NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_application_country_id_country_id_fk FOREIGN KEY (country_id)
    REFERENCES public.country (id) ON DELETE RESTRICT,
  CONSTRAINT partner_application_language_code_locale_code_fk FOREIGN KEY (language_code)
    REFERENCES public.locale (code) ON DELETE RESTRICT,
  CONSTRAINT partner_application_converted_partner_fkey FOREIGN KEY (converted_partner_id)
    REFERENCES public.fulfillment_partner (id) ON DELETE RESTRICT,
  CONSTRAINT partner_application_status_check CHECK (status IN (
    'new', 'contacted', 'rejected', 'converted'
  )),
  CONSTRAINT partner_application_converted_check CHECK (
    (status = 'converted') = (converted_partner_id IS NOT NULL)
  ),
  CONSTRAINT partner_application_capacity_per_day_check CHECK (capacity_per_day > 0),
  CONSTRAINT partner_application_media_asset_ids_check CHECK (
    array_position(media_asset_ids, NULL) IS NULL
  )
);

CREATE INDEX partner_application_media_asset_ids_idx
  ON public.partner_application USING gin (media_asset_ids);

COMMENT ON COLUMN public.partner_application.media_asset_ids IS
  'media_asset ids (kind partner, private); kept honest by partner_application_media_check() and media_asset_partner_application_guard(), since an array element cannot carry a foreign key.';

/* ---------------------------------------------------------------------------
 * payout — one statement per partner per period
 * ------------------------------------------------------------------------ */

CREATE TABLE public.payout (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id               uuid        NOT NULL,
  period_start             date        NOT NULL,
  period_end               date        NOT NULL,
  status                   text        NOT NULL DEFAULT 'draft',
  total_minor              bigint      NOT NULL,
  currency_code            text        NOT NULL,
  statement_media_asset_id uuid        NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payout_partner_id_fulfillment_partner_id_fk FOREIGN KEY (partner_id)
    REFERENCES public.fulfillment_partner (id) ON DELETE RESTRICT,
  CONSTRAINT payout_currency_code_currency_code_fk FOREIGN KEY (currency_code)
    REFERENCES public.currency (code) ON DELETE RESTRICT,
  CONSTRAINT payout_statement_media_asset_id_media_asset_id_fk FOREIGN KEY (statement_media_asset_id)
    REFERENCES public.media_asset (id) ON DELETE RESTRICT,
  -- The idempotency key of `payout.accrue` (declared in spec 002 §2, built later).
  CONSTRAINT payout_partner_period_key UNIQUE (partner_id, period_start, period_end),
  -- (id, currency_code) so `payout_line` can only be in its payout's currency.
  CONSTRAINT payout_id_currency_code_key UNIQUE (id, currency_code),
  CONSTRAINT payout_status_check CHECK (status IN ('draft', 'statement_sent', 'paid')),
  CONSTRAINT payout_currency_code_check CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT payout_period_check CHECK (period_end >= period_start)
);

/* ---------------------------------------------------------------------------
 * payout_line — what one payout is made of
 * ------------------------------------------------------------------------ */

-- `order_id` will reference `"order" (id)` from `0007` (TASK-019), which adds the constraint.
CREATE TABLE public.payout_line (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id     uuid        NOT NULL,
  order_id      uuid        NULL,
  amount_minor  bigint      NOT NULL,
  currency_code text        NOT NULL,
  kind          text        NOT NULL,
  note          text        NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payout_line_payout_fkey FOREIGN KEY (payout_id, currency_code)
    REFERENCES public.payout (id, currency_code) ON DELETE RESTRICT,
  CONSTRAINT payout_line_currency_code_currency_code_fk FOREIGN KEY (currency_code)
    REFERENCES public.currency (code) ON DELETE RESTRICT,
  CONSTRAINT payout_line_currency_code_check CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT payout_line_kind_check CHECK (kind IN ('order', 'adjustment', 'goodwill')),
  CONSTRAINT payout_line_order_check CHECK (kind <> 'order' OR order_id IS NOT NULL),
  CONSTRAINT payout_line_amount_minor_check CHECK (
    CASE kind WHEN 'adjustment' THEN amount_minor <> 0 ELSE amount_minor > 0 END
  )
);

CREATE INDEX payout_line_payout_id_idx ON public.payout_line USING btree (payout_id);

-- An order is paid once, across every payout.
CREATE UNIQUE INDEX payout_line_order_once_idx
  ON public.payout_line USING btree (order_id) WHERE kind = 'order';

/* ---------------------------------------------------------------------------
 * payout currency — a payout is in its partner's payout currency when it is written
 * ------------------------------------------------------------------------ */

CREATE FUNCTION public.payout_currency_check() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $fn$
DECLARE
  expected text;
BEGIN
  -- FOR SHARE: the partner's currency cannot change under a payout being written.
  SELECT payout_currency_code INTO expected
  FROM public.fulfillment_partner WHERE id = NEW.partner_id
  FOR SHARE;
  IF FOUND AND NEW.currency_code IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'PAYOUT_CURRENCY_MISMATCH: a payout in % for a partner paid in %',
      NEW.currency_code, expected
      USING ERRCODE = 'check_violation';
  END IF;
  -- A missing partner is the foreign key's to report.
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER payout_currency_check
  BEFORE INSERT OR UPDATE OF partner_id, currency_code ON public.payout
  FOR EACH ROW EXECUTE FUNCTION public.payout_currency_check();

REVOKE EXECUTE ON FUNCTION public.payout_currency_check() FROM PUBLIC;

/* ---------------------------------------------------------------------------
 * coverage country — a partner covers only its own country
 * ------------------------------------------------------------------------ */

CREATE FUNCTION public.partner_coverage_country_check() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $fn$
DECLARE
  partner_country uuid;
  area_country    uuid;
BEGIN
  -- FOR SHARE: the partner's country cannot change under a coverage row being written.
  SELECT country_id INTO partner_country
  FROM public.fulfillment_partner WHERE id = NEW.partner_id
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN NEW;  -- a missing partner is the foreign key's to report
  END IF;
  IF NEW.city_id IS NOT NULL THEN
    SELECT country_id INTO area_country FROM public.city WHERE id = NEW.city_id;
    IF FOUND AND area_country <> partner_country THEN
      RAISE EXCEPTION 'PARTNER_COVERAGE_COUNTRY_MISMATCH: city % is not in partner %''s country', NEW.city_id, NEW.partner_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.postcode_zone_id IS NOT NULL THEN
    SELECT country_id INTO area_country FROM public.postcode_zone WHERE id = NEW.postcode_zone_id;
    IF FOUND AND area_country <> partner_country THEN
      RAISE EXCEPTION 'PARTNER_COVERAGE_COUNTRY_MISMATCH: zone % is not in partner %''s country', NEW.postcode_zone_id, NEW.partner_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER partner_coverage_country_check
  BEFORE INSERT OR UPDATE OF partner_id, city_id, postcode_zone_id ON public.partner_coverage
  FOR EACH ROW EXECUTE FUNCTION public.partner_coverage_country_check();

CREATE FUNCTION public.fulfillment_partner_coverage_country_guard() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF NEW.country_id IS DISTINCT FROM OLD.country_id AND EXISTS (
    SELECT 1
    FROM public.partner_coverage AS coverage
    LEFT JOIN public.city AS city ON city.id = coverage.city_id
    LEFT JOIN public.postcode_zone AS zone ON zone.id = coverage.postcode_zone_id
    WHERE coverage.partner_id = NEW.id
      AND (city.country_id <> NEW.country_id OR zone.country_id <> NEW.country_id)
  ) THEN
    RAISE EXCEPTION 'PARTNER_COVERAGE_COUNTRY_MISMATCH: partner % still covers areas outside its new country', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER fulfillment_partner_coverage_country_guard
  BEFORE UPDATE OF country_id ON public.fulfillment_partner
  FOR EACH ROW EXECUTE FUNCTION public.fulfillment_partner_coverage_country_guard();

REVOKE EXECUTE ON FUNCTION public.partner_coverage_country_check() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fulfillment_partner_coverage_country_guard() FROM PUBLIC;

/* ---------------------------------------------------------------------------
 * media_asset_ids — the reference an array cannot declare
 * ------------------------------------------------------------------------ */

CREATE FUNCTION public.partner_application_media_check() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $fn$
DECLARE
  locked  uuid[];
  missing uuid;
BEGIN
  -- FOR SHARE, as a foreign key locks its parent: a concurrent DELETE (FOR UPDATE) or an UPDATE
  -- of kind/visibility (FOR NO KEY UPDATE) waits for this transaction, then meets the guard. The
  -- predicate is inside the locking query, so a row changed while we waited is re-read.
  SELECT coalesce(array_agg(asset.id), '{}') INTO locked
  FROM (
    SELECT id FROM public.media_asset
    WHERE id = ANY (NEW.media_asset_ids) AND kind = 'partner' AND visibility = 'private'
    FOR SHARE
  ) AS asset;
  SELECT listed INTO missing
  FROM unnest(NEW.media_asset_ids) AS listed
  WHERE listed IS NOT NULL  -- a null element is partner_application_media_asset_ids_check's
    AND NOT (listed = ANY (locked))
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'PARTNER_APPLICATION_MEDIA_ASSET: % is not a private partner media_asset', missing
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER partner_application_media_check
  BEFORE INSERT OR UPDATE OF media_asset_ids ON public.partner_application
  FOR EACH ROW EXECUTE FUNCTION public.partner_application_media_check();

CREATE FUNCTION public.media_asset_partner_application_guard() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.id = OLD.id AND NEW.kind = 'partner' AND NEW.visibility = 'private' THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.partner_application
    WHERE media_asset_ids @> ARRAY[OLD.id]
  ) THEN
    RAISE EXCEPTION 'PARTNER_APPLICATION_MEDIA_ASSET: % is listed by a partner_application', OLD.id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER media_asset_partner_application_guard
  BEFORE DELETE OR UPDATE OF id, kind, visibility ON public.media_asset
  FOR EACH ROW EXECUTE FUNCTION public.media_asset_partner_application_guard();

REVOKE EXECUTE ON FUNCTION public.partner_application_media_check() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.media_asset_partner_application_guard() FROM PUBLIC;

/* ---------------------------------------------------------------------------
 * updated_at triggers (AC-10): one per table, all on `0001`'s shared function
 * ------------------------------------------------------------------------ */

CREATE TRIGGER fulfillment_partner_set_updated_at BEFORE UPDATE ON public.fulfillment_partner
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER partner_translation_set_updated_at BEFORE UPDATE ON public.partner_translation
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER partner_member_set_updated_at BEFORE UPDATE ON public.partner_member
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER partner_coverage_set_updated_at BEFORE UPDATE ON public.partner_coverage
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER partner_blackout_set_updated_at BEFORE UPDATE ON public.partner_blackout
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER partner_catalog_mapping_set_updated_at BEFORE UPDATE ON public.partner_catalog_mapping
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER partner_application_set_updated_at BEFORE UPDATE ON public.partner_application
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER payout_set_updated_at BEFORE UPDATE ON public.payout
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER payout_line_set_updated_at BEFORE UPDATE ON public.payout_line
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

RESET ROLE;
