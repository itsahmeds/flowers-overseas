-- Rollback of 0037_discount_codes (spec 047 §5.1 "Rollback", AC-1; TASK-445).
--
-- Guard first. A live discounted order is part of the accounting record (the same rule as spec
-- 013's A7 rollback): if any `order_discount` row has `mode = 'live'`, this file raises
-- `DISCOUNT_ROLLBACK_LIVE_ORDERS`, and the runner's one transaction means nothing below runs and
-- nothing changes. After that, rollback is flags only (spec 047 §12).
--
-- Otherwise, in reverse order: detach the audit triggers, drop the flag, the `checkout_draft`
-- columns, `order_line.discount_minor`, `order_discount`, the scope tables, the shape trigger and
-- its function, `discount_code_currency` and `discount_code`. The audit rows already written stay
-- in `audit_log` (they are the record of what the founder did).

SET LOCAL ROLE app_owner;

DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.order_discount WHERE mode = 'live') THEN
    RAISE EXCEPTION 'DISCOUNT_ROLLBACK_LIVE_ORDERS: a live order carries a discount; 0037_discount_codes is not rolled back'
      USING ERRCODE = 'restrict_violation';
  END IF;
END
$guard$;

/* 9. audit */
DROP TRIGGER IF EXISTS discount_code_product_audit ON public.discount_code_product;
DROP TRIGGER IF EXISTS discount_code_country_audit ON public.discount_code_country;
DROP TRIGGER IF EXISTS discount_code_currency_audit ON public.discount_code_currency;
DROP TRIGGER IF EXISTS discount_code_audit ON public.discount_code;

/* 10. flag */
DELETE FROM public.feature_flag_scope WHERE flag_key = 'checkout.discount_codes';
DELETE FROM public.feature_flag WHERE key = 'checkout.discount_codes';

/* 7. checkout_draft */
ALTER TABLE public.checkout_draft DROP CONSTRAINT IF EXISTS checkout_draft_discount_failed_attempts_check;
ALTER TABLE public.checkout_draft DROP CONSTRAINT IF EXISTS checkout_draft_discount_code_id_discount_code_id_fk;
ALTER TABLE public.checkout_draft DROP COLUMN IF EXISTS discount_locked_until;
ALTER TABLE public.checkout_draft DROP COLUMN IF EXISTS discount_window_started_at;
ALTER TABLE public.checkout_draft DROP COLUMN IF EXISTS discount_failed_attempts;
ALTER TABLE public.checkout_draft DROP COLUMN IF EXISTS discount_code_id;

/* 6. order_line */
ALTER TABLE public.order_line DROP CONSTRAINT IF EXISTS order_line_discount_minor_check;
ALTER TABLE public.order_line DROP COLUMN IF EXISTS discount_minor;

/* 5. order_discount (with its policy and index) */
DROP TABLE IF EXISTS public.order_discount;

/* 4. scope */
DROP TABLE IF EXISTS public.discount_code_product;
DROP TABLE IF EXISTS public.discount_code_country;

/* 3. shape trigger */
DROP TRIGGER IF EXISTS discount_code_shape_check ON public.discount_code_currency;
DROP TRIGGER IF EXISTS discount_code_shape_check ON public.discount_code;
DROP FUNCTION IF EXISTS public.discount_code_shape_check();

/* 2, 1. the codes */
DROP TABLE IF EXISTS public.discount_code_currency;
DROP TABLE IF EXISTS public.discount_code;

RESET ROLE;
