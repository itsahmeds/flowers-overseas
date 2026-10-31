-- Rollback of 0026_payment_purchase (spec 013 §14 A-founder-2026-10-22 item 2 "Rollback",
-- AC-48, T-48; TASK-350).
--
-- Guard first. A real payment is part of the accounting record (spec 013 §8), and a payment for a
-- purchase of two or more orders has no single order to return to. While any `payment` has
-- `livemode = true`, or belongs to a purchase with more than one order, this file raises
-- `PAYMENT_PURCHASE_ROLLBACK_BLOCKED`; the runner wraps the file in one transaction, so nothing
-- below runs and nothing changes.
--
-- Otherwise, in reverse: the ceiling trigger and its function; `payment.order_id` re-added
-- nullable, filled from the purchase's single order, `NOT NULL`, with its money-pair key, its
-- index, A7's per-order partial index, and `0011`'s customer policy and function as they were;
-- the per-purchase index, `refund`'s two keys, its index and both columns; `payment`'s key,
-- index, `UNIQUE (id, purchase_id)` and `purchase_id`; the two added `UNIQUE`s. Every refund
-- keeps its payment, so it still reaches its order through it. The fills switch off the
-- `updated_at` triggers, as the up file's do.

SET LOCAL ROLE app_owner;

DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.payment WHERE livemode) THEN
    RAISE EXCEPTION 'PAYMENT_PURCHASE_ROLLBACK_BLOCKED: a live payment exists; 0026_payment_purchase is not rolled back (spec 013 §8)'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.payment p
    WHERE (SELECT count(*) FROM public."order" o WHERE o.purchase_id = p.purchase_id) > 1
  ) THEN
    RAISE EXCEPTION 'PAYMENT_PURCHASE_ROLLBACK_BLOCKED: a payment pays for a purchase of more than one order; 0026_payment_purchase is not rolled back'
      USING ERRCODE = 'restrict_violation';
  END IF;
END
$guard$;

/* 6. The per-order refund ceiling */

DROP TRIGGER IF EXISTS refund_order_ceiling ON public.refund;
DROP FUNCTION IF EXISTS public.refund_order_ceiling();

/* 5. payment.order_id comes back; 0011's customer read path as it was */

DROP POLICY IF EXISTS payment_customer ON public.payment;

ALTER TABLE public.payment ADD COLUMN order_id uuid NULL;

ALTER TABLE public.payment DISABLE TRIGGER payment_set_updated_at;

UPDATE public.payment p SET order_id = o.id
FROM public."order" o
WHERE o.purchase_id = p.purchase_id;

ALTER TABLE public.payment ENABLE TRIGGER payment_set_updated_at;

ALTER TABLE public.payment ALTER COLUMN order_id SET NOT NULL;

ALTER TABLE public.payment
  ADD CONSTRAINT payment_order_fkey FOREIGN KEY (order_id, currency_code)
    REFERENCES public."order" (id, buyer_currency_code) ON DELETE RESTRICT;

CREATE INDEX payment_order_id_idx ON public.payment USING btree (order_id);

CREATE OR REPLACE FUNCTION public.app_customer_owns_payment(target uuid) RETURNS boolean
  LANGUAGE sql STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.payment p JOIN public."order" o ON o.id = p.order_id
    JOIN public.customer c ON c.id = o.customer_id
    WHERE p.id = target AND app_is_customer_user(c.user_id)
  )
$fn$;

CREATE POLICY payment_customer ON public.payment FOR SELECT TO app_web
  USING (app_customer_owns_order(order_id));

/* 4. refund.order_id, refund.purchase_id */

ALTER TABLE public.refund DROP CONSTRAINT IF EXISTS refund_order_purchase_fkey;
ALTER TABLE public.refund DROP CONSTRAINT IF EXISTS refund_payment_purchase_fkey;
DROP INDEX IF EXISTS public.refund_order_id_idx;
ALTER TABLE public.refund DROP COLUMN IF EXISTS purchase_id;
ALTER TABLE public.refund DROP COLUMN IF EXISTS order_id;

/* 3. One live payment per order again */

DROP INDEX IF EXISTS public.payment_one_live_per_purchase_idx;

CREATE UNIQUE INDEX payment_one_live_per_order_idx
  ON public.payment USING btree (order_id) WHERE status NOT IN ('cancelled', 'failed');

/* 2. payment.purchase_id */

DROP INDEX IF EXISTS public.payment_purchase_id_idx;
ALTER TABLE public.payment DROP CONSTRAINT IF EXISTS payment_id_purchase_id_key;
ALTER TABLE public.payment DROP CONSTRAINT IF EXISTS payment_purchase_fkey;
ALTER TABLE public.payment DROP COLUMN IF EXISTS purchase_id;

/* 1. Targets of the composite keys */

ALTER TABLE public."order" DROP CONSTRAINT IF EXISTS order_id_purchase_id_key;
ALTER TABLE public.purchase DROP CONSTRAINT IF EXISTS purchase_id_buyer_currency_code_key;

RESET ROLE;
