-- 0033_catalogue_cms — the catalogue CMS cutover's schema (spec 012b §5.1 item 3, §2.3, §2.5,
-- §2.6, §2.7; AC-7, AC-19, AC-39; TASK-294).
--
--   * `country.first_live_at`   set once by a trigger when `status` becomes `live`, never cleared,
--                               backfilled for rows already `live` (exposure, §2.5).
--   * `product.first_active_at` set once by a trigger at the first `draft → active` (or an insert
--                               that is already `active`), never cleared, backfilled for rows
--                               already `active` (advisor F2, §2.6).
--   * `country_price_guard()`   refuses a `DELETE` or a `retail_minor` change on a `country_price`
--                               row once its product's `first_active_at` is set: from then on a
--                               price is only superseded (§2.6). `addon_country_price` has no
--                               product, and add-ons stay repository-authored until slice B, so
--                               the guard is on `country_price` only (TASK-294 brief, Result).
--   * `saleable_offer`          the (product, tier, country) triples a real florist can make:
--                               an `active` partner (never `demo`) with a mapping that can fulfil
--                               it and coverage in the country (advisor F3, AC-39). Owned by
--                               `app_owner` and run with its rights, ids only, so `app_web` and
--                               `app_build` read it without reading a partner table.
--   * `media_asset.supplier_partner_id`  a florist's bouquet photo names its florist (§2.7).
--   * `publish_run`             one structural publish (§2.3), at most one open per environment.
--   * the `catalogue.placeholder_window` flag row, global and on (§12 "Feature flags").
--   * the audit trigger on the twelve tables §5.1 names (`country` has it from `0016`), and the
--     attester's name masked in `audit_log` (`review_attestation` is personal data, AC-28).
--
-- Rollback: `0033_catalogue_cms.down.sql`.

SET LOCAL ROLE app_owner;

/* ---------------------------------------------------------------------------
 * country.first_live_at
 * ------------------------------------------------------------------------ */

ALTER TABLE public.country ADD COLUMN first_live_at timestamptz NULL;

UPDATE public.country SET first_live_at = updated_at WHERE status = 'live';

CREATE FUNCTION public.country_first_live_at() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.first_live_at IS NOT NULL THEN
    NEW.first_live_at := OLD.first_live_at;
  ELSIF NEW.status = 'live' THEN
    NEW.first_live_at := coalesce(NEW.first_live_at, now());
  ELSE
    NEW.first_live_at := NULL;
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER country_first_live_at
  BEFORE INSERT OR UPDATE ON public.country
  FOR EACH ROW EXECUTE FUNCTION public.country_first_live_at();

/* ---------------------------------------------------------------------------
 * product.first_active_at and the price-row guard (F2)
 * ------------------------------------------------------------------------ */

ALTER TABLE public.product ADD COLUMN first_active_at timestamptz NULL;

UPDATE public.product SET first_active_at = updated_at WHERE status = 'active';

CREATE FUNCTION public.product_first_active_at() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.first_active_at IS NOT NULL THEN
    NEW.first_active_at := OLD.first_active_at;
  ELSIF NEW.status = 'active' THEN
    NEW.first_active_at := coalesce(NEW.first_active_at, now());
  ELSE
    NEW.first_active_at := NULL;
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER product_first_active_at
  BEFORE INSERT OR UPDATE ON public.product
  FOR EACH ROW EXECUTE FUNCTION public.product_first_active_at();

CREATE FUNCTION public.country_price_guard() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF (TG_OP = 'DELETE' OR NEW.retail_minor IS DISTINCT FROM OLD.retail_minor)
     AND EXISTS (
       SELECT 1 FROM public.product p
       WHERE p.id = OLD.product_id AND p.first_active_at IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'PRICE_SUPERSEDE_ONLY: a price of a product that has been active is superseded, never changed or deleted'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER country_price_guard
  BEFORE UPDATE OR DELETE ON public.country_price
  FOR EACH ROW EXECUTE FUNCTION public.country_price_guard();

REVOKE EXECUTE ON FUNCTION public.country_first_live_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.product_first_active_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.country_price_guard() FROM PUBLIC;

/* ---------------------------------------------------------------------------
 * saleable_offer (F3, AC-39)
 * ------------------------------------------------------------------------ */

-- A mapping with a null `tier_key` is the partner's row for every size of the product (`0005`:
-- "one base-tier row"), so it lists each of the product's tiers, or the bare product when it has
-- none. Coverage is a city or a postcode zone; either names the country through its city.
CREATE VIEW public.saleable_offer WITH (security_barrier = true) AS
  SELECT DISTINCT m.product_id, t.tier_key, ci.country_id
  FROM public.partner_catalog_mapping m
  JOIN public.fulfillment_partner p
    ON p.id = m.partner_id AND p.status = 'active'
  LEFT JOIN public.product_tier t
    ON t.product_id = m.product_id AND (m.tier_key IS NULL OR t.tier_key = m.tier_key)
  JOIN public.partner_coverage pc ON pc.partner_id = m.partner_id
  LEFT JOIN public.postcode_zone z ON z.id = pc.postcode_zone_id
  JOIN public.city ci ON ci.id = coalesce(pc.city_id, z.city_id)
  WHERE m.can_fulfil
    AND (t.tier_key IS NOT NULL OR m.tier_key IS NULL);

COMMENT ON VIEW public.saleable_offer IS
  'Spec 012b §2.5 (F3): (product, tier, country) a non-demo active florist can make and deliver. Ids only; owner rights, so the public roles never read a partner table.';

-- Read only: `0001`'s default privileges grant DML on every new relation to `app_web`.
REVOKE ALL ON public.saleable_offer FROM app_web;
GRANT SELECT ON public.saleable_offer TO app_web;
GRANT SELECT ON public.saleable_offer TO app_build;

/* ---------------------------------------------------------------------------
 * media_asset.supplier_partner_id (§2.7)
 * ------------------------------------------------------------------------ */

-- A florist's bouquet photo (`kind = 'product'`, `source = 'partner'`) names its florist. A
-- delivery proof (specs 018, 027, 029) and an application's photos (spec 011) are partner-sourced
-- too, but come from no catalogue supplier: the rule binds the catalogue's photos only.
ALTER TABLE public.media_asset
  ADD COLUMN supplier_partner_id uuid NULL,
  ADD CONSTRAINT media_asset_supplier_partner_id_fulfillment_partner_id_fk
    FOREIGN KEY (supplier_partner_id) REFERENCES public.fulfillment_partner (id) ON DELETE RESTRICT,
  ADD CONSTRAINT media_asset_supplier_partner_check
    CHECK (kind <> 'product' OR source <> 'partner' OR supplier_partner_id IS NOT NULL);

/* ---------------------------------------------------------------------------
 * publish_run (§2.3, AC-6, AC-7)
 * ------------------------------------------------------------------------ */

CREATE TABLE public.publish_run (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment            text        NOT NULL,
  reason                 text        NOT NULL,
  requested_by           uuid        NULL,
  requested_at           timestamptz NOT NULL DEFAULT now(),
  target_ref             text        NOT NULL,
  head_sha               char(40)    NULL,
  expected_hash          char(64)    NOT NULL,
  added_count            integer     NOT NULL,
  removed_count          integer     NOT NULL,
  status                 text        NOT NULL,
  provider_deployment_id text        NULL,
  error_code             text        NULL,
  finished_at            timestamptz NULL,
  CONSTRAINT publish_run_requested_by_users_id_fk FOREIGN KEY (requested_by)
    REFERENCES public.users (id) ON DELETE RESTRICT,
  CONSTRAINT publish_run_environment_check
    CHECK (environment IN ('production', 'staging', 'preview')),
  CONSTRAINT publish_run_status_check CHECK (status IN (
    'requested', 'building', 'deployed', 'verified', 'failed', 'timed_out'
  )),
  CONSTRAINT publish_run_expected_hash_check CHECK (expected_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT publish_run_head_sha_check CHECK (head_sha IS NULL OR head_sha ~ '^[0-9a-f]{40}$'),
  CONSTRAINT publish_run_counts_check CHECK (added_count >= 0 AND removed_count >= 0),
  CONSTRAINT publish_run_reason_check CHECK (btrim(reason) <> ''),
  CONSTRAINT publish_run_error_code_check CHECK (
    error_code IS NULL OR error_code ~ '^[A-Z][A-Z0-9_]*$'
  ),
  CONSTRAINT publish_run_finished_check CHECK (
    (status IN ('verified', 'failed', 'timed_out')) = (finished_at IS NOT NULL)
  )
);

-- One open run per environment (AC-6).
CREATE UNIQUE INDEX publish_run_open_idx ON public.publish_run USING btree (environment)
  WHERE status IN ('requested', 'building', 'deployed');
-- The daily limit counts an environment's runs by request time (AC-6).
CREATE INDEX publish_run_environment_requested_idx
  ON public.publish_run USING btree (environment, requested_at DESC);

ALTER TABLE public.publish_run ENABLE ROW LEVEL SECURITY;
CREATE POLICY publish_run_staff ON public.publish_run FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());

/* ---------------------------------------------------------------------------
 * the audit trail (§5.1 item 3; `audit_row_change()` from `0016`)
 * ------------------------------------------------------------------------ */

CREATE TRIGGER product_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.product
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('id');
CREATE TRIGGER product_translation_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.product_translation
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('product_id', 'locale_code');
CREATE TRIGGER product_tier_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.product_tier
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('product_id', 'tier_key');
CREATE TRIGGER product_category_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.product_category
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('product_id', 'category_id');
CREATE TRIGGER product_occasion_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.product_occasion
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('product_id', 'occasion_id');
CREATE TRIGGER country_price_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.country_price
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('id');
CREATE TRIGGER media_asset_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.media_asset
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('id');
CREATE TRIGGER product_media_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.product_media
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('id');
CREATE TRIGGER product_media_alt_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.product_media_alt
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('product_media_id', 'locale_code');
CREATE TRIGGER reviewer_locale_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.reviewer_locale
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('user_id', 'locale_code');
CREATE TRIGGER review_attestation_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.review_attestation
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('id');
CREATE TRIGGER publish_run_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.publish_run
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('id');

-- An admin write leaves `source = 'real'` (spec 012 §2.3) on the catalogue rows that carry one.
CREATE TRIGGER product_audit_source
  BEFORE INSERT OR UPDATE ON public.product
  FOR EACH ROW EXECUTE FUNCTION public.audit_mark_real();
CREATE TRIGGER country_price_audit_source
  BEFORE INSERT OR UPDATE ON public.country_price
  FOR EACH ROW EXECUTE FUNCTION public.audit_mark_real();

-- The attester's name is personal data with its own retention (AC-28): `audit_log` keeps the
-- mask, never the name. Every other table keeps its list exactly as `0029_reviews_close` left it.
CREATE OR REPLACE FUNCTION public.audit_mask_columns(p_table text) RETURNS text[]
  LANGUAGE sql
  IMMUTABLE
  SET search_path = pg_catalog, public
AS $fn$
  SELECT CASE p_table
    WHEN 'fulfillment_partner' THEN
      ARRAY['legal_name', 'contact_email', 'contact_phone']
    WHEN 'partner_application' THEN
      ARRAY['business_name', 'contact_name', 'contact_email', 'contact_phone', 'registration_number']
    WHEN 'review' THEN
      ARRAY['text', 'display_name']
    WHEN 'review_attestation' THEN
      ARRAY['attester_name']
    ELSE ARRAY[]::text[]
  END;
$fn$;

/* ---------------------------------------------------------------------------
 * the placeholder window (§2.5, §12 "Feature flags"): global, on from the cutover
 * ------------------------------------------------------------------------ */

-- The founder turns it off when opening the site to search engines, and it cannot be turned back
-- on (§13 Q6; the one-way toggle is TASK-297's). While on, removing a `source = 'seed'` product's
-- URL at a publish is allowed (AC-8).
INSERT INTO public.feature_flag (key, description, enabled_default) VALUES
  ('catalogue.placeholder_window', 'Placeholder products may be retired, removed and renamed freely while on (spec 012b). Admin only, one way: off when indexing opens, never on again.', true);

INSERT INTO public.feature_flag_scope (flag_key, scope, scope_ref, enabled) VALUES
  ('catalogue.placeholder_window', 'global', '*', true);

RESET ROLE;
