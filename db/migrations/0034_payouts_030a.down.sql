-- Rollback of 0034_payouts_030a (spec 030a §5.1 "Down file, guard first", AC-31; TASK-363).
--
-- Guard first. If any `payout` is not `weekly` (a prepaid or per-order payout), carries a
-- statement number or sits in an export, or any `payout_export` row exists, a florist's statement
-- or payment would lose its record: this file raises `PAYOUTS_030A_ROLLBACK_ROWS_IN_USE`, and the
-- runner's one transaction means nothing below runs and nothing changes.
--
-- Otherwise it drops in reverse order and restores `0005`'s `payout_partner_period_key`.
-- `order_line.partner_payout_minor` values written by 030a stay: the columns are spec 002's and
-- remain valid without the write-once trigger.

SET LOCAL ROLE app_owner;

DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.payout
    WHERE kind <> 'weekly' OR statement_number IS NOT NULL OR export_id IS NOT NULL
  ) OR EXISTS (SELECT 1 FROM public.payout_export) THEN
    RAISE EXCEPTION 'PAYOUTS_030A_ROLLBACK_ROWS_IN_USE: a prepaid or per-order payout, a statement number or a Wise export exists; 0034_payouts_030a is not rolled back'
      USING ERRCODE = 'restrict_violation';
  END IF;
END
$guard$;

/* 6. flag */
DELETE FROM public.feature_flag_scope WHERE flag_key = 'payouts.accrue';
DELETE FROM public.feature_flag WHERE key = 'payouts.accrue';

/* 5. triggers */
DROP TRIGGER IF EXISTS order_line_payout_write_once ON public.order_line;
DROP FUNCTION IF EXISTS public.order_line_payout_write_once();
DROP TRIGGER IF EXISTS payout_total_sync ON public.payout_line;
DROP FUNCTION IF EXISTS public.payout_total_sync();
DROP TRIGGER IF EXISTS payout_line_frozen ON public.payout_line;
DROP FUNCTION IF EXISTS public.payout_line_frozen();
DROP TRIGGER IF EXISTS payout_status_guard ON public.payout;
DROP FUNCTION IF EXISTS public.payout_status_guard();

/* 4. payout_line */
ALTER TABLE public.payout_line DROP CONSTRAINT IF EXISTS payout_line_note_check;
ALTER TABLE public.payout_line DROP CONSTRAINT IF EXISTS payout_line_reviewed_pair_check;
ALTER TABLE public.payout_line DROP CONSTRAINT IF EXISTS payout_line_reviewed_check;
ALTER TABLE public.payout_line DROP CONSTRAINT IF EXISTS payout_line_reviewed_by_users_id_fk;
ALTER TABLE public.payout_line DROP CONSTRAINT IF EXISTS payout_line_review_reason_check;
ALTER TABLE public.payout_line DROP COLUMN IF EXISTS reviewed_by;
ALTER TABLE public.payout_line DROP COLUMN IF EXISTS reviewed_at;
ALTER TABLE public.payout_line DROP COLUMN IF EXISTS review_reason;

/* 3. payout */
DROP SEQUENCE IF EXISTS public.payout_statement_number_seq;
DROP INDEX IF EXISTS public.payout_open_weekly_idx;
DROP INDEX IF EXISTS public.payout_export_id_idx;
ALTER TABLE public.payout DROP CONSTRAINT IF EXISTS payout_export_status_check;
ALTER TABLE public.payout DROP CONSTRAINT IF EXISTS payout_closed_check;
ALTER TABLE public.payout DROP CONSTRAINT IF EXISTS payout_paid_check;
ALTER TABLE public.payout DROP CONSTRAINT IF EXISTS payout_statement_number_status_check;
ALTER TABLE public.payout DROP CONSTRAINT IF EXISTS payout_sent_check;
ALTER TABLE public.payout DROP CONSTRAINT IF EXISTS payout_export_id_payout_export_id_fk;
ALTER TABLE public.payout DROP CONSTRAINT IF EXISTS payout_statement_number_check;
ALTER TABLE public.payout DROP CONSTRAINT IF EXISTS payout_statement_number_key;
ALTER TABLE public.payout DROP COLUMN IF EXISTS export_id;
ALTER TABLE public.payout DROP COLUMN IF EXISTS statement_number;
ALTER TABLE public.payout DROP COLUMN IF EXISTS paid_at;
ALTER TABLE public.payout DROP COLUMN IF EXISTS sent_at;
ALTER TABLE public.payout DROP COLUMN IF EXISTS closed_at;
DROP INDEX IF EXISTS public.payout_weekly_period_idx;
-- Every payout left is weekly (the guard), so the restored key holds.
ALTER TABLE public.payout ADD CONSTRAINT payout_partner_period_key
  UNIQUE (partner_id, period_start, period_end);
ALTER TABLE public.payout DROP CONSTRAINT IF EXISTS payout_kind_period_check;
ALTER TABLE public.payout DROP CONSTRAINT IF EXISTS payout_kind_check;
ALTER TABLE public.payout DROP COLUMN IF EXISTS kind;

/* 2. payout_export */
DROP TABLE IF EXISTS public.payout_export;

/* 1. fulfillment_partner */
ALTER TABLE public.fulfillment_partner DROP CONSTRAINT IF EXISTS fulfillment_partner_wise_recipient_id_check;
ALTER TABLE public.fulfillment_partner DROP COLUMN IF EXISTS wise_recipient_id;
ALTER TABLE public.fulfillment_partner DROP CONSTRAINT IF EXISTS fulfillment_partner_prepaid_order_limit_check;
ALTER TABLE public.fulfillment_partner DROP COLUMN IF EXISTS prepaid_order_limit;
ALTER TABLE public.fulfillment_partner DROP CONSTRAINT IF EXISTS fulfillment_partner_payout_cadence_check;
ALTER TABLE public.fulfillment_partner DROP COLUMN IF EXISTS payout_cadence;

RESET ROLE;
