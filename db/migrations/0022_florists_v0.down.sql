-- Rollback of 0022_florists_v0 (spec 011 §5.1 "Rollback"; TASK-211).
--
-- In reverse: the retention rows, the partner media policy and its lookup, the member's language,
-- the public insert policy, the constraints, then the four columns. Rows written by the form
-- survive a rollback of the constraints but lose `contact_name`, `weekend_delivery`,
-- `privacy_notice_version` and `decided_at`: export applications first
-- (`docs/runbooks/florists.md`). `0022` creates no table, type, role or schema.

SET LOCAL ROLE app_owner;

DELETE FROM public.retention_policy
  WHERE key IN ('partner_application', 'auth_session', 'auth_verification_token');

DROP POLICY IF EXISTS media_asset_partner ON public.media_asset;
DROP FUNCTION IF EXISTS public.app_partner_sees_media(uuid);

ALTER TABLE public.partner_member
  DROP CONSTRAINT IF EXISTS partner_member_locale_code_check,
  DROP CONSTRAINT IF EXISTS partner_member_locale_code_locale_code_fk,
  DROP COLUMN IF EXISTS locale_code;

DROP POLICY IF EXISTS partner_application_public_insert ON public.partner_application;

ALTER TABLE public.partner_application
  DROP CONSTRAINT IF EXISTS partner_application_lengths_check,
  DROP CONSTRAINT IF EXISTS partner_application_media_asset_ids_empty_check,
  DROP CONSTRAINT IF EXISTS partner_application_capacity_per_day_range_check,
  DROP CONSTRAINT IF EXISTS partner_application_preferred_channel_check,
  DROP CONSTRAINT IF EXISTS partner_application_weekend_delivery_check;

ALTER TABLE public.partner_application
  ALTER COLUMN contact_phone DROP NOT NULL,
  ALTER COLUMN contact_email DROP NOT NULL,
  ALTER COLUMN country_id DROP NOT NULL;

ALTER TABLE public.partner_application
  DROP COLUMN IF EXISTS decided_at,
  DROP COLUMN IF EXISTS privacy_notice_version,
  DROP COLUMN IF EXISTS weekend_delivery,
  DROP COLUMN IF EXISTS contact_name;

RESET ROLE;
