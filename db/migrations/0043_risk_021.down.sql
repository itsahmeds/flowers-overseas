-- Rollback of 0043_risk_021 (spec 021 §5.1 "Rollback", AC-35; TASK-493).
--
-- Refuses with A11_ROLLBACK_REASON_IN_USE, changing nothing, once any refund carries `risk_cancel`
-- or `fraud_confirmed`: a refund is part of the accounting record (spec 013's A7 guard), so after
-- the first risk refund this is a forward fix, never a rollback. Roll the code back first.

SET LOCAL ROLE app_owner;

DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.refund WHERE reason IN ('risk_cancel', 'fraud_confirmed')) THEN
    RAISE EXCEPTION 'A11_ROLLBACK_REASON_IN_USE: a refund carries risk_cancel or fraud_confirmed; fix forward instead';
  END IF;
END
$guard$;

DELETE FROM public.feature_flag_scope WHERE flag_key IN ('risk.gate', 'risk.strict', 'risk.pay_pause');
DELETE FROM public.feature_flag WHERE key IN ('risk.gate', 'risk.strict', 'risk.pay_pause');
DELETE FROM public.retention_policy
 WHERE key IN ('risk_identity_email_card', 'risk_identity_recipient_address', 'risk_assessment',
               'risk_review', 'risk_blocklist', 'risk_pause');

ALTER TABLE public.refund DROP CONSTRAINT refund_reason_check;
ALTER TABLE public.refund ADD CONSTRAINT refund_reason_check CHECK (reason IN (
  'buyer_cancel', 'no_partner', 'authorisation_lapsing', 'redelivery_failed', 'addon_missing',
  'late_delivery', 'substitution_complaint', 'quality', 'goodwill', 'duplicate', 'other'
));

DROP TRIGGER IF EXISTS risk_blocklist_audit ON public.risk_blocklist;
DROP TRIGGER IF EXISTS risk_review_audit ON public.risk_review;

DROP TABLE IF EXISTS public.risk_pause;
DROP TABLE IF EXISTS public.risk_blocklist;
DROP TABLE IF EXISTS public.risk_review;
DROP TABLE IF EXISTS public.risk_assessment;
DROP TABLE IF EXISTS public.risk_identity;

RESET ROLE;
