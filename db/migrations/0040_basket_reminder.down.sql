-- Rollback of 0040_basket_reminder (spec 034 §5.1 "Rollback", AC-26; TASK-449).
--
-- Refuses with BASKET_REMINDER_CONSENT_ROWS_EXIST, changing nothing, once any `contact` consent
-- row exists: those rows are records kept under a legal obligation (Art. 7(1)), so after the first
-- real consent this is a forward fix, never a rollback. No order, purchase or line is touched.
-- Roll the code back first.

SET LOCAL ROLE app_owner;

DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.consent_log WHERE subject_kind = 'contact') THEN
    RAISE EXCEPTION 'BASKET_REMINDER_CONSENT_ROWS_EXIST: contact consent rows are legal records; fix forward instead';
  END IF;
END
$guard$;

DELETE FROM public.feature_flag_scope WHERE flag_key = 'marketing.basket_reminder';
DELETE FROM public.feature_flag WHERE key = 'marketing.basket_reminder';
DELETE FROM public.retention_policy
 WHERE key IN ('basket_reminder_tokens', 'basket_reminder', 'email_suppression');

DROP TABLE IF EXISTS public.email_suppression;

ALTER TABLE public.consent_log DROP CONSTRAINT consent_log_subject_check;
ALTER TABLE public.consent_log ADD CONSTRAINT consent_log_subject_check CHECK (
  CASE subject_kind
    WHEN 'visitor' THEN anonymous_id IS NOT NULL AND subject_ref IS NULL
    ELSE subject_ref IS NOT NULL
  END
);
ALTER TABLE public.consent_log DROP CONSTRAINT consent_log_subject_kind_check;
ALTER TABLE public.consent_log ADD CONSTRAINT consent_log_subject_kind_check
  CHECK (subject_kind IN ('visitor', 'customer', 'recipient'));
DROP INDEX IF EXISTS public.consent_log_subject_hmac_idx;
ALTER TABLE public.consent_log DROP COLUMN subject_hmac;

ALTER TABLE public.checkout_draft
  DROP CONSTRAINT checkout_draft_restored_from_reminder_id_basket_reminder_id_fk,
  DROP COLUMN restored_from_reminder_id;

DROP TABLE IF EXISTS public.basket_reminder;

UPDATE public.checkout_draft SET pending_notice = NULL
 WHERE pending_notice IN ('restored', 'restored_details');
ALTER TABLE public.checkout_draft DROP CONSTRAINT checkout_draft_pending_notice_check;
ALTER TABLE public.checkout_draft ADD CONSTRAINT checkout_draft_pending_notice_check
  CHECK (pending_notice IN ('added', 'full', 'other_mode', 'other_currency'));

ALTER TABLE public.checkout_draft
  DROP CONSTRAINT checkout_draft_reminder_consent_pair_check,
  DROP COLUMN reminder_consent_version,
  DROP COLUMN reminder_consent_at;

RESET ROLE;
