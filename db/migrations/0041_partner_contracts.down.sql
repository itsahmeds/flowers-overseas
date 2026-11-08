-- Rollback of 0041_partner_contracts (spec 030b §14.3 "Down file, guard first", AC-57; TASK-442).
--
-- Guard first. Dropping the register would orphan signed contracts in R2: if any
-- `partner_contract` row exists, this file raises `PARTNER_CONTRACTS_ROLLBACK_ROWS_IN_USE` and the
-- runner's one transaction means nothing below runs and nothing changes.
--
-- Otherwise, in reverse order, and `audit_mask_columns()` is restored to the body `0039` wrote.

SET LOCAL ROLE app_owner;

DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.partner_contract) THEN
    RAISE EXCEPTION 'PARTNER_CONTRACTS_ROLLBACK_ROWS_IN_USE: florist contracts are stored; 0041_partner_contracts is not rolled back'
      USING ERRCODE = 'restrict_violation';
  END IF;
END
$guard$;

/* 5. retention */
DELETE FROM public.retention_policy WHERE key = 'partner_contract';

/* 4. audit: detach, and the masked-column list as 0039 wrote it */
DROP TRIGGER IF EXISTS partner_contract_audit ON public.partner_contract;
CREATE OR REPLACE FUNCTION public.audit_mask_columns(p_table text) RETURNS text[]
  LANGUAGE sql
  IMMUTABLE
  SET search_path = pg_catalog, public
AS $fn$
  SELECT CASE p_table
    WHEN 'fulfillment_partner' THEN
      ARRAY['legal_name', 'contact_email', 'contact_phone', 'contact_name']
    WHEN 'partner_application' THEN
      ARRAY['business_name', 'contact_name', 'contact_email', 'contact_phone', 'registration_number']
    WHEN 'review' THEN
      ARRAY['text', 'display_name']
    WHEN 'partner_note' THEN
      ARRAY['body']
    WHEN 'partner_contact_log' THEN
      ARRAY['summary']
    ELSE ARRAY[]::text[]
  END;
$fn$;

/* 3. activation */
DROP TRIGGER IF EXISTS partner_activation_requires_agreement ON public.fulfillment_partner;
DROP FUNCTION IF EXISTS public.partner_activation_requires_agreement();

/* 2. guard */
DROP TRIGGER IF EXISTS partner_contract_guard ON public.partner_contract;
DROP FUNCTION IF EXISTS public.partner_contract_guard();

/* 1. the register (its policies, indexes and triggers go with it) */
DROP TABLE IF EXISTS public.partner_contract;

RESET ROLE;
