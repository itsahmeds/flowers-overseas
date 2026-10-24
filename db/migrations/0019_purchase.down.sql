-- Rollback of 0019_purchase (spec 010 §14 A-founder-2026-10-22 item 2 A; AC-66; TASK-347).
--
-- In reverse: the two constraint triggers and their function, the composite foreign key, the
-- column (its index goes with it), then `purchase` (its policies go with it). Orders keep every
-- other column, so no order data is lost; the purchases themselves are dropped.

SET LOCAL ROLE app_owner;

DROP TRIGGER IF EXISTS purchase_total_check ON public."order";

DROP TRIGGER IF EXISTS purchase_total_check ON public.purchase;

DROP FUNCTION IF EXISTS public.purchase_total_check();

ALTER TABLE public."order"
  DROP CONSTRAINT IF EXISTS order_purchase_id_buyer_currency_code_mode_purchase_fk;

ALTER TABLE public."order" DROP COLUMN IF EXISTS purchase_id;

DROP TABLE IF EXISTS public.purchase;

RESET ROLE;
