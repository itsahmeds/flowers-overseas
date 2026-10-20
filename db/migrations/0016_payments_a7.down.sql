-- Rollback of 0016_payments_a7 (spec 002 §14 A7.8; spec 013 §5.1 "Rollback", AC-37; TASK-254).
--
-- Guard first: a real payment, its refunds and its disputes are part of the accounting record
-- (spec 013 §8) and a rollback never deletes them. While any `payment` row has `livemode = true`
-- this file raises `A7_ROLLBACK_LIVE_PAYMENTS`; the runner wraps the file in one transaction, so
-- nothing below runs and nothing changes. After the first live payment the recovery path is flags
-- first (spec 013 §12).
--
-- With no live payment, in reverse order: the outbox trigger, its function and
-- `outbox_delivery`; `outbox_attempt.target`; the six `webhook_inbox` columns and their checks;
-- `payment_dispute`; the `refund` and `payment` rows `0007`'s checks would refuse (all test-mode
-- rows, since the guard proved none is live), then `0007`'s checks and `NOT NULL`s; the added
-- columns, checks and the partial unique index. The result is introspection-identical to the
-- schema before A7 (T-37, spec 002 T-44).

SET LOCAL ROLE app_owner;

DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.payment WHERE livemode) THEN
    RAISE EXCEPTION 'A7_ROLLBACK_LIVE_PAYMENTS: a live payment exists; 0016_payments_a7 is not rolled back (spec 013 §12: flags first)'
      USING ERRCODE = 'restrict_violation';
  END IF;
END
$guard$;

/* 5. outbox_delivery, outbox_attempt.target */

DROP TRIGGER IF EXISTS outbox_delivery_fanout ON public.outbox;
DROP FUNCTION IF EXISTS public.outbox_delivery_fanout();
DROP TABLE IF EXISTS public.outbox_delivery;
ALTER TABLE public.outbox_attempt DROP COLUMN IF EXISTS target;

/* 4. webhook_inbox */

ALTER TABLE public.webhook_inbox
  DROP CONSTRAINT IF EXISTS webhook_inbox_stripe_fields_check,
  DROP CONSTRAINT IF EXISTS webhook_inbox_status_check,
  DROP COLUMN IF EXISTS last_error,
  DROP COLUMN IF EXISTS ignore_reason,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS object_ref,
  DROP COLUMN IF EXISTS event_type,
  DROP COLUMN IF EXISTS livemode;

/* 3. payment_dispute */

DROP TABLE IF EXISTS public.payment_dispute;

/* 2. refund, and the rows 0007 would refuse */

DELETE FROM public.refund
WHERE status = 'requested'
   OR provider_ref IS NULL
   OR payment_id IN (
     SELECT id FROM public.payment
     WHERE status = 'processing' OR provider_ref IS NULL OR method IS NULL
   );

ALTER TABLE public.refund
  DROP CONSTRAINT IF EXISTS refund_succeeded_at_check,
  DROP CONSTRAINT IF EXISTS refund_reason_check,
  DROP CONSTRAINT IF EXISTS refund_provider_ref_required_check,
  DROP CONSTRAINT IF EXISTS refund_status_check;

ALTER TABLE public.refund
  ADD CONSTRAINT refund_status_check CHECK (status IN ('pending', 'succeeded', 'failed', 'cancelled')),
  ALTER COLUMN provider_ref SET NOT NULL,
  DROP COLUMN IF EXISTS failure_code,
  DROP COLUMN IF EXISTS succeeded_at,
  DROP COLUMN IF EXISTS requested_by;

/* 1. payment, and the rows 0007 would refuse */

DELETE FROM public.payment
WHERE status = 'processing' OR provider_ref IS NULL OR method IS NULL;

DROP INDEX IF EXISTS public.payment_one_live_per_order_idx;

ALTER TABLE public.payment
  DROP CONSTRAINT IF EXISTS payment_attempts_check,
  DROP CONSTRAINT IF EXISTS payment_amount_refunded_minor_check,
  DROP CONSTRAINT IF EXISTS payment_amount_captured_minor_check,
  DROP CONSTRAINT IF EXISTS payment_capture_method_check,
  DROP CONSTRAINT IF EXISTS payment_method_required_check,
  DROP CONSTRAINT IF EXISTS payment_provider_ref_required_check,
  DROP CONSTRAINT IF EXISTS payment_status_check;

ALTER TABLE public.payment
  ADD CONSTRAINT payment_status_check CHECK (status IN (
    'pending', 'requires_action', 'authorised', 'captured', 'failed', 'cancelled'
  )),
  ALTER COLUMN provider_ref SET NOT NULL,
  ALTER COLUMN method SET NOT NULL,
  DROP COLUMN IF EXISTS card_last4,
  DROP COLUMN IF EXISTS card_brand,
  DROP COLUMN IF EXISTS last_decline_ref,
  DROP COLUMN IF EXISTS last_decline_code,
  DROP COLUMN IF EXISTS attempts,
  DROP COLUMN IF EXISTS failed_at,
  DROP COLUMN IF EXISTS auth_expires_at,
  DROP COLUMN IF EXISTS authorised_at,
  DROP COLUMN IF EXISTS amount_refunded_minor,
  DROP COLUMN IF EXISTS amount_captured_minor,
  DROP COLUMN IF EXISTS capture_method,
  DROP COLUMN IF EXISTS livemode;

RESET ROLE;
