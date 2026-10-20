-- Rollback of 0016_audit_trail (spec 012 §5.1; TASK-218): drops the triggers and functions, then
-- the two columns, and restores `0009`'s `audit_log_change_check`.
--
-- `audit_log` is append-only, so view rows (no `before`, no `after`) written while `0016` stood
-- cannot be removed; the restored check is therefore added `NOT VALID`: it binds every new row,
-- exactly as `0009` did, without rewriting the record. `0009`'s append-only function and its two
-- triggers were never touched by `0016` and stay.

SET LOCAL ROLE app_owner;

DROP TRIGGER IF EXISTS country_status_flip_guard ON public.country;
DROP TRIGGER IF EXISTS fulfillment_partner_status_flip_guard ON public.fulfillment_partner;

DROP TRIGGER IF EXISTS country_audit_source ON public.country;
DROP TRIGGER IF EXISTS fulfillment_partner_audit_source ON public.fulfillment_partner;
DROP TRIGGER IF EXISTS partner_catalog_mapping_audit_source ON public.partner_catalog_mapping;

DROP TRIGGER IF EXISTS country_audit ON public.country;
DROP TRIGGER IF EXISTS fulfillment_partner_audit ON public.fulfillment_partner;
DROP TRIGGER IF EXISTS partner_coverage_audit ON public.partner_coverage;
DROP TRIGGER IF EXISTS partner_blackout_audit ON public.partner_blackout;
DROP TRIGGER IF EXISTS partner_catalog_mapping_audit ON public.partner_catalog_mapping;
DROP TRIGGER IF EXISTS partner_application_audit ON public.partner_application;
DROP TRIGGER IF EXISTS feature_flag_audit ON public.feature_flag;
DROP TRIGGER IF EXISTS feature_flag_scope_audit ON public.feature_flag_scope;
DROP TRIGGER IF EXISTS user_role_audit ON public.user_role;
DROP TRIGGER IF EXISTS admin_profile_audit ON public.admin_profile;

DROP FUNCTION IF EXISTS public.audit_record_view(text, text);
DROP FUNCTION IF EXISTS public.status_flip_guard();
DROP FUNCTION IF EXISTS public.audit_mark_real();
DROP FUNCTION IF EXISTS public.audit_row_change();
DROP FUNCTION IF EXISTS public.audit_write(text, text, jsonb, jsonb);
DROP FUNCTION IF EXISTS public.audit_mask(text, jsonb);
DROP FUNCTION IF EXISTS public.audit_mask_columns(text);

DROP INDEX IF EXISTS public.audit_log_action_idx;
DROP INDEX IF EXISTS public.audit_log_actor_idx;
DROP INDEX IF EXISTS public.audit_log_at_idx;

ALTER TABLE public.audit_log DROP CONSTRAINT IF EXISTS audit_log_view_check;
ALTER TABLE public.audit_log DROP CONSTRAINT IF EXISTS audit_log_change_check;
ALTER TABLE public.audit_log
  ADD CONSTRAINT audit_log_change_check CHECK (before IS NOT NULL OR after IS NOT NULL) NOT VALID;

ALTER TABLE public.audit_log
  DROP CONSTRAINT IF EXISTS audit_log_reason_check,
  DROP CONSTRAINT IF EXISTS audit_log_channel_check,
  DROP COLUMN IF EXISTS channel,
  DROP COLUMN IF EXISTS reason;

RESET ROLE;
