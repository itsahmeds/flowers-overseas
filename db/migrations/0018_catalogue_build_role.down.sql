-- Rollback of 0018_catalogue_build_role (spec 012b §5.1 item 1; TASK-292): the build policies,
-- the grants, then the role.
--
-- The role is dropped only when no other database of the cluster still holds a privilege or an
-- object for it (`pg_shdepend`): roles are cluster-wide, and a rollback in one CI scratch database
-- must not fail because another one is still migrated. On a single database (Neon production, a
-- local one) nothing else depends on it and it is dropped.

SET LOCAL ROLE app_owner;

DROP POLICY IF EXISTS addon_build_read ON public.addon;
DROP POLICY IF EXISTS addon_country_price_build_read ON public.addon_country_price;
DROP POLICY IF EXISTS addon_translation_build_read ON public.addon_translation;
DROP POLICY IF EXISTS category_build_read ON public.category;
DROP POLICY IF EXISTS category_translation_build_read ON public.category_translation;
DROP POLICY IF EXISTS city_build_read ON public.city;
DROP POLICY IF EXISTS city_translation_build_read ON public.city_translation;
DROP POLICY IF EXISTS country_build_read ON public.country;
DROP POLICY IF EXISTS country_holiday_build_read ON public.country_holiday;
DROP POLICY IF EXISTS country_locale_content_build_read ON public.country_locale_content;
DROP POLICY IF EXISTS country_price_build_read ON public.country_price;
DROP POLICY IF EXISTS country_translation_build_read ON public.country_translation;
DROP POLICY IF EXISTS currency_build_read ON public.currency;
DROP POLICY IF EXISTS feature_flag_build_read ON public.feature_flag;
DROP POLICY IF EXISTS feature_flag_scope_build_read ON public.feature_flag_scope;
DROP POLICY IF EXISTS fx_rate_build_read ON public.fx_rate;
DROP POLICY IF EXISTS locale_build_read ON public.locale;
DROP POLICY IF EXISTS occasion_build_read ON public.occasion;
DROP POLICY IF EXISTS occasion_country_build_read ON public.occasion_country;
DROP POLICY IF EXISTS occasion_translation_build_read ON public.occasion_translation;
DROP POLICY IF EXISTS postcode_zone_build_read ON public.postcode_zone;
DROP POLICY IF EXISTS product_build_read ON public.product;
DROP POLICY IF EXISTS product_category_build_read ON public.product_category;
DROP POLICY IF EXISTS product_media_build_read ON public.product_media;
DROP POLICY IF EXISTS product_media_alt_build_read ON public.product_media_alt;
DROP POLICY IF EXISTS product_occasion_build_read ON public.product_occasion;
DROP POLICY IF EXISTS product_tier_build_read ON public.product_tier;
DROP POLICY IF EXISTS product_translation_build_read ON public.product_translation;
DROP POLICY IF EXISTS region_build_read ON public.region;
DROP POLICY IF EXISTS media_asset_build_read ON public.media_asset;
DROP POLICY IF EXISTS media_variant_build_read ON public.media_variant;
DROP POLICY IF EXISTS review_build_read ON public.review;

REVOKE ALL ON
  public.addon,
  public.addon_country_price,
  public.addon_translation,
  public.category,
  public.category_translation,
  public.city,
  public.city_translation,
  public.country,
  public.country_holiday,
  public.country_locale_content,
  public.country_price,
  public.country_translation,
  public.currency,
  public.feature_flag,
  public.feature_flag_scope,
  public.fx_rate,
  public.locale,
  public.media_asset,
  public.media_variant,
  public.occasion,
  public.occasion_country,
  public.occasion_translation,
  public.postcode_zone,
  public.product,
  public.product_category,
  public.product_media,
  public.product_media_alt,
  public.product_occasion,
  public.product_tier,
  public.product_translation,
  public.region,
  public.review
FROM app_build;

RESET ROLE;

REVOKE ALL ON SCHEMA public FROM app_build;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_build') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_shdepend d
      WHERE d.refclassid = 'pg_authid'::regclass
        AND d.refobjid = (SELECT oid FROM pg_roles WHERE rolname = 'app_build')
        AND d.dbid <> (SELECT oid FROM pg_database WHERE datname = current_database())
    ) THEN
      DROP ROLE app_build;
    END IF;
  END IF;
END
$$;
