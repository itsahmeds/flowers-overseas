-- Rollback of 0033_catalogue_cms (TASK-294): detach the triggers, drop `saleable_offer`, drop
-- `publish_run`, drop the three columns and the functions, restore the mask list
-- `0029_reviews_close` left.

SET LOCAL ROLE app_owner;

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
    ELSE ARRAY[]::text[]
  END;
$fn$;

DROP TRIGGER country_price_audit_source ON public.country_price;
DROP TRIGGER product_audit_source ON public.product;

DROP TRIGGER publish_run_audit ON public.publish_run;
DROP TRIGGER review_attestation_audit ON public.review_attestation;
DROP TRIGGER reviewer_locale_audit ON public.reviewer_locale;
DROP TRIGGER product_media_alt_audit ON public.product_media_alt;
DROP TRIGGER product_media_audit ON public.product_media;
DROP TRIGGER media_asset_audit ON public.media_asset;
DROP TRIGGER country_price_audit ON public.country_price;
DROP TRIGGER product_occasion_audit ON public.product_occasion;
DROP TRIGGER product_category_audit ON public.product_category;
DROP TRIGGER product_tier_audit ON public.product_tier;
DROP TRIGGER product_translation_audit ON public.product_translation;
DROP TRIGGER product_audit ON public.product;

DROP TABLE IF EXISTS public.publish_run;

ALTER TABLE public.media_asset
  DROP CONSTRAINT media_asset_supplier_partner_check,
  DROP CONSTRAINT media_asset_supplier_partner_id_fulfillment_partner_id_fk,
  DROP COLUMN supplier_partner_id;

DROP VIEW public.saleable_offer;

DROP TRIGGER country_price_guard ON public.country_price;
DROP FUNCTION public.country_price_guard();

DROP TRIGGER product_first_active_at ON public.product;
DROP FUNCTION public.product_first_active_at();
ALTER TABLE public.product DROP COLUMN first_active_at;

DROP TRIGGER country_first_live_at ON public.country;
DROP FUNCTION public.country_first_live_at();
ALTER TABLE public.country DROP COLUMN first_live_at;

RESET ROLE;
