-- Rollback of 0039_finance_crm_030b (spec 030b §5.1 "Down file, guard first", AC-32; TASK-439).
--
-- Guard first. The founder's notes, the contact log, a contact person and a live balance fact
-- (the accounting record of a fee) would be lost: if any `partner_note` or `partner_contact_log`
-- row exists, any `payment_balance_txn` row has `livemode = true`, or any
-- `fulfillment_partner.contact_name` is set, this file raises `FINANCE_CRM_ROLLBACK_ROWS_IN_USE`
-- and the runner's one transaction means nothing below runs and nothing changes.
--
-- Otherwise, in reverse order, and `audit_mask_columns()` is restored to the body `0029` wrote.
-- Audit rows already written stay in `audit_log` (masked, the record of what was done).

SET LOCAL ROLE app_owner;

DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.partner_note)
     OR EXISTS (SELECT 1 FROM public.partner_contact_log)
     OR EXISTS (SELECT 1 FROM public.payment_balance_txn WHERE livemode)
     OR EXISTS (SELECT 1 FROM public.fulfillment_partner WHERE contact_name IS NOT NULL) THEN
    RAISE EXCEPTION 'FINANCE_CRM_ROLLBACK_ROWS_IN_USE: notes, contact-log entries, a contact name or live balance facts exist; 0039_finance_crm_030b is not rolled back'
      USING ERRCODE = 'restrict_violation';
  END IF;
END
$guard$;

/* 9. flag */
DELETE FROM public.feature_flag_scope WHERE flag_key = 'payments.balance_fetch';
DELETE FROM public.feature_flag WHERE key = 'payments.balance_fetch';

/* 8. retention */
DELETE FROM public.retention_policy
  WHERE key IN ('partner_note', 'partner_contact_log', 'payment_balance_txn');

/* 7. index */
DROP INDEX IF EXISTS public.payment_captured_at_idx;

/* 6. views */
DROP VIEW IF EXISTS public.finance_partner_position;
DROP VIEW IF EXISTS public.finance_order_facts;

/* 5. audit: detach, and the masked-column list as 0029 wrote it */
DROP TRIGGER IF EXISTS partner_contact_log_audit ON public.partner_contact_log;
DROP TRIGGER IF EXISTS partner_note_audit ON public.partner_note;
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

/* 4. fulfillment_partner */
DROP TRIGGER IF EXISTS partner_offboarded_at ON public.fulfillment_partner;
DROP FUNCTION IF EXISTS public.partner_offboarded_at();
ALTER TABLE public.fulfillment_partner DROP COLUMN IF EXISTS offboarded_at;
ALTER TABLE public.fulfillment_partner DROP CONSTRAINT IF EXISTS fulfillment_partner_contact_name_check;
ALTER TABLE public.fulfillment_partner DROP COLUMN IF EXISTS contact_name;

/* 3. partner_contact_log (with its policy, trigger and indexes) */
DROP TABLE IF EXISTS public.partner_contact_log;

/* 2. partner_note */
DROP TABLE IF EXISTS public.partner_note;

/* 1. payment_balance_txn (test-mode rows only, by the guard) */
DROP TABLE IF EXISTS public.payment_balance_txn;
DROP FUNCTION IF EXISTS public.payment_balance_txn_immutable();

RESET ROLE;
