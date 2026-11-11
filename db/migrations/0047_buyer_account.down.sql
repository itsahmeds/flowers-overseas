-- Rollback of 0047_buyer_account (spec 018 §14 A-founder-2026-10-22 C.11 "Rollback"; TASK-352).
--
-- Pre-production only. Refuses with BUYER_ACCOUNT_DATA_EXISTS, changing nothing, once any buyer
-- has saved a recipient, a reminder, a preference or a reminder consent: from then on this is a
-- forward fix (C.11). Otherwise drops the two tables, the four `customer` columns this migration
-- added (`last_signed_in_at` is `0036`'s and stays), the three retention rows and the two flag
-- rows, and restores `0011`'s buyer update guard. Roll the code back first.

SET LOCAL ROLE app_owner;

DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.saved_recipient)
     OR EXISTS (SELECT 1 FROM public.occasion_reminder)
     OR EXISTS (
       SELECT 1 FROM public.customer
       WHERE preferred_locale IS NOT NULL OR preferred_currency IS NOT NULL
          OR reminder_consent OR reminder_unsubscribe_token IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'BUYER_ACCOUNT_DATA_EXISTS: buyers have saved account data; fix forward instead';
  END IF;
END
$guard$;

DELETE FROM public.feature_flag_scope WHERE flag_key IN ('account.recipients', 'account.reminders');
DELETE FROM public.feature_flag WHERE key IN ('account.recipients', 'account.reminders');
DELETE FROM public.retention_policy
 WHERE key IN ('saved_recipient', 'occasion_reminder', 'buyer_account_inactive');

DROP TABLE IF EXISTS public.occasion_reminder;
DROP FUNCTION IF EXISTS public.occasion_reminder_limit();
DROP TABLE IF EXISTS public.saved_recipient;
DROP FUNCTION IF EXISTS public.saved_recipient_limit();

CREATE OR REPLACE FUNCTION public.customer_self_update_guard() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF app_current_role() = 'customer' AND (
    NEW.id, NEW.email_normalised, NEW.marketing_consent, NEW.redacted, NEW.redacted_at,
    NEW.created_at
  ) IS DISTINCT FROM (
    OLD.id, OLD.email_normalised, OLD.marketing_consent, OLD.redacted, OLD.redacted_at,
    OLD.created_at
  ) THEN
    RAISE EXCEPTION 'CUSTOMER_COLUMN_READ_ONLY: a buyer edits only name, phone and country here'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$fn$;

ALTER TABLE public.customer
  DROP CONSTRAINT customer_reminder_unsubscribe_token_check,
  DROP CONSTRAINT customer_reminder_unsubscribe_token_key,
  DROP CONSTRAINT customer_preferred_currency_currency_code_fk,
  DROP CONSTRAINT customer_preferred_locale_locale_code_fk,
  DROP COLUMN reminder_unsubscribe_token,
  DROP COLUMN reminder_consent,
  DROP COLUMN preferred_currency,
  DROP COLUMN preferred_locale;

RESET ROLE;
