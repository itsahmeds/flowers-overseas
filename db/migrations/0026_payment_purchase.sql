-- 0026_payment_purchase: one payment per purchase, and each refund names its order
-- (spec 013 §14 A-founder-2026-10-22 item 2, AC-48, T-48; spec 010 §14 A-founder-2026-10-22
-- item 13 (b), (e) and §13 Q19; TASK-350).
--
-- Q19, approved by the founder 2026-10-22: "the payment belongs to the purchase, and each refund
-- names its order (a refund can never exceed that order's own amount; a dispute covers every
-- order of the purchase)". `0017_payments_a7.sql` is not edited; this file only ALTERs.
--
--   1. Targets of the new composite keys: `purchase UNIQUE (id, buyer_currency_code)` (the
--      payment's money pair) and `"order" UNIQUE (id, purchase_id)` (a refund's order).
--   2. `payment.purchase_id`, backfilled from its order **before** `SET NOT NULL`, with
--      `FOREIGN KEY (purchase_id, currency_code) REFERENCES purchase (id, buyer_currency_code)`:
--      a payment in another currency than its purchase is a foreign-key violation. `payment`
--      gains `UNIQUE (id, purchase_id)` for the refund's key.
--   3. A7's "one live payment per order" becomes one live payment per **purchase**. A coded
--      check runs first, so a database that already holds two live payments for one purchase
--      fails with `PAYMENT_PURCHASE_BACKFILL` rather than an anonymous unique violation.
--   4. `refund.order_id` and `refund.purchase_id`, backfilled from the payment, with
--      `FOREIGN KEY (payment_id, purchase_id) REFERENCES payment (id, purchase_id)` and
--      `FOREIGN KEY (order_id, purchase_id) REFERENCES "order" (id, purchase_id)`: a refund can
--      only name an order of the purchase its payment paid for. A database fact, not a service
--      check.
--   5. `payment.order_id`, its money-pair key and its index are dropped: a payment for three
--      orders has no single order. `0011`'s customer read path went through that column, so
--      `app_customer_owns_payment(target)` now joins through the purchase and the
--      `payment_customer` policy calls it: a buyer still reads exactly the payments of their own
--      orders (RLS semantics unchanged; the system and admin policies are untouched).
--   6. `refund_order_ceiling()`, run by a constraint trigger after every insert and every update
--      of `status`, `amount_minor` or `order_id` on `refund`: it locks the refund's `payment` row
--      (`FOR NO KEY UPDATE`, which every other refund's lock waits for), then raises
--      `REFUND_EXCEEDS_ORDER` when the named order's refunds in `requested`, `pending` or
--      `succeeded` sum above its `buyer_total_minor`. The payment lock
--      serialises concurrent refunds on one purchase; the sum is read after the lock is held, in
--      a fresh snapshot (READ COMMITTED), so it sees the refund a concurrent transaction committed
--      while this one waited. `SECURITY DEFINER` as `app_owner` with a pinned `search_path`, so
--      the sum counts every refund whatever the caller's `app.role`. A7's
--      `payment_amount_refunded_minor_check` keeps the per-payment ceiling.
--
-- The backfills switch off `payment_set_updated_at` and `refund_set_updated_at` for their one
-- `UPDATE` each, so every existing row keeps its `updated_at`. A DO block proves each backfill.
--
-- Rollback: `0026_payment_purchase.down.sql`, guarded by `PAYMENT_PURCHASE_ROLLBACK_BLOCKED`.

SET LOCAL ROLE app_owner;

/* ---------------------------------------------------------------------------
 * 1. Targets of the composite keys
 * ------------------------------------------------------------------------ */

ALTER TABLE public.purchase
  ADD CONSTRAINT purchase_id_buyer_currency_code_key UNIQUE (id, buyer_currency_code);

ALTER TABLE public."order"
  ADD CONSTRAINT order_id_purchase_id_key UNIQUE (id, purchase_id);

/* ---------------------------------------------------------------------------
 * 2. payment.purchase_id
 * ------------------------------------------------------------------------ */

ALTER TABLE public.payment ADD COLUMN purchase_id uuid NULL;

ALTER TABLE public.payment DISABLE TRIGGER payment_set_updated_at;

UPDATE public.payment p SET purchase_id = o.purchase_id
FROM public."order" o
WHERE o.id = p.order_id;

ALTER TABLE public.payment ENABLE TRIGGER payment_set_updated_at;

DO $check$
DECLARE
  bad bigint;
BEGIN
  SELECT count(*) INTO bad
  FROM public.payment p
  JOIN public."order" o ON o.id = p.order_id
  WHERE p.purchase_id IS DISTINCT FROM o.purchase_id;
  IF bad <> 0 THEN
    RAISE EXCEPTION 'PAYMENT_PURCHASE_BACKFILL: % payments without their order''s purchase', bad;
  END IF;
  SELECT count(*) INTO bad FROM (
    SELECT purchase_id FROM public.payment
    WHERE status NOT IN ('cancelled', 'failed')
    GROUP BY purchase_id HAVING count(*) > 1
  ) twice;
  IF bad <> 0 THEN
    RAISE EXCEPTION 'PAYMENT_PURCHASE_BACKFILL: % purchases hold more than one live payment', bad;
  END IF;
END
$check$;

ALTER TABLE public.payment ALTER COLUMN purchase_id SET NOT NULL;

ALTER TABLE public.payment
  ADD CONSTRAINT payment_purchase_fkey FOREIGN KEY (purchase_id, currency_code)
    REFERENCES public.purchase (id, buyer_currency_code) ON DELETE RESTRICT;

ALTER TABLE public.payment
  ADD CONSTRAINT payment_id_purchase_id_key UNIQUE (id, purchase_id);

CREATE INDEX payment_purchase_id_idx ON public.payment USING btree (purchase_id);

COMMENT ON COLUMN public.payment.purchase_id IS
  'Spec 013 §14 A-founder-2026-10-22 item 2: the purchase this payment pays for, in its currency; one live payment per purchase.';

/* ---------------------------------------------------------------------------
 * 3. One live payment per purchase
 * ------------------------------------------------------------------------ */

DROP INDEX public.payment_one_live_per_order_idx;

CREATE UNIQUE INDEX payment_one_live_per_purchase_idx
  ON public.payment USING btree (purchase_id) WHERE status NOT IN ('cancelled', 'failed');

/* ---------------------------------------------------------------------------
 * 4. refund.order_id, refund.purchase_id
 * ------------------------------------------------------------------------ */

ALTER TABLE public.refund ADD COLUMN order_id uuid NULL;
ALTER TABLE public.refund ADD COLUMN purchase_id uuid NULL;

ALTER TABLE public.refund DISABLE TRIGGER refund_set_updated_at;

UPDATE public.refund r SET order_id = p.order_id, purchase_id = p.purchase_id
FROM public.payment p
WHERE p.id = r.payment_id;

ALTER TABLE public.refund ENABLE TRIGGER refund_set_updated_at;

DO $check$
DECLARE
  bad bigint;
BEGIN
  SELECT count(*) INTO bad
  FROM public.refund r
  JOIN public.payment p ON p.id = r.payment_id
  WHERE r.order_id IS DISTINCT FROM p.order_id
     OR r.purchase_id IS DISTINCT FROM p.purchase_id;
  IF bad <> 0 THEN
    RAISE EXCEPTION 'PAYMENT_PURCHASE_BACKFILL: % refunds without their payment''s order and purchase', bad;
  END IF;
END
$check$;

ALTER TABLE public.refund ALTER COLUMN order_id SET NOT NULL;
ALTER TABLE public.refund ALTER COLUMN purchase_id SET NOT NULL;

ALTER TABLE public.refund
  ADD CONSTRAINT refund_payment_purchase_fkey FOREIGN KEY (payment_id, purchase_id)
    REFERENCES public.payment (id, purchase_id) ON DELETE RESTRICT;

ALTER TABLE public.refund
  ADD CONSTRAINT refund_order_purchase_fkey FOREIGN KEY (order_id, purchase_id)
    REFERENCES public."order" (id, purchase_id) ON DELETE RESTRICT;

CREATE INDEX refund_order_id_idx ON public.refund USING btree (order_id);

COMMENT ON COLUMN public.refund.order_id IS
  'Spec 013 §14 A-founder-2026-10-22 item 2: the order this refund returns money for; an order of the purchase its payment paid for.';

/* ---------------------------------------------------------------------------
 * 5. payment.order_id goes; the customer read path joins through the purchase
 * ------------------------------------------------------------------------ */

DROP POLICY payment_customer ON public.payment;

CREATE OR REPLACE FUNCTION public.app_customer_owns_payment(target uuid) RETURNS boolean
  LANGUAGE sql STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.payment p JOIN public."order" o ON o.purchase_id = p.purchase_id
    JOIN public.customer c ON c.id = o.customer_id
    WHERE p.id = target AND app_is_customer_user(c.user_id)
  )
$fn$;

ALTER TABLE public.payment DROP CONSTRAINT payment_order_fkey;
DROP INDEX public.payment_order_id_idx;
ALTER TABLE public.payment DROP COLUMN order_id;

CREATE POLICY payment_customer ON public.payment FOR SELECT TO app_web
  USING (app_customer_owns_payment(id));

/* ---------------------------------------------------------------------------
 * 6. The per-order refund ceiling
 * ------------------------------------------------------------------------ */

CREATE FUNCTION public.refund_order_ceiling() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $fn$
DECLARE
  ceiling bigint;
  asked bigint;
BEGIN
  -- The lock every money write on a purchase takes first (spec 013 §14 item 4): a concurrent
  -- refund on any order of the same purchase waits here until this transaction ends. `NO KEY
  -- UPDATE` rather than `UPDATE`: it excludes every other refund's lock just the same, but not
  -- the `KEY SHARE` lock a refund's own foreign-key check takes on this row, so two concurrent
  -- inserts queue here instead of deadlocking.
  PERFORM 1 FROM public.payment p WHERE p.id = NEW.payment_id FOR NO KEY UPDATE;
  SELECT o.buyer_total_minor INTO ceiling FROM public."order" o WHERE o.id = NEW.order_id;
  SELECT coalesce(sum(r.amount_minor), 0) INTO asked
  FROM public.refund r
  WHERE r.order_id = NEW.order_id AND r.status IN ('requested', 'pending', 'succeeded');
  IF asked > ceiling THEN
    RAISE EXCEPTION 'REFUND_EXCEEDS_ORDER: refunds of % minor units on an order of % minor units',
      asked, ceiling
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END
$fn$;

COMMENT ON FUNCTION public.refund_order_ceiling() IS
  'Spec 013 §14 A-founder-2026-10-22 item 2: under the payment row lock, an order''s requested, pending and succeeded refunds never exceed its buyer_total_minor (REFUND_EXCEEDS_ORDER).';

REVOKE EXECUTE ON FUNCTION public.refund_order_ceiling() FROM PUBLIC;

CREATE CONSTRAINT TRIGGER refund_order_ceiling
  AFTER INSERT OR UPDATE OF status, amount_minor, order_id ON public.refund
  FOR EACH ROW EXECUTE FUNCTION public.refund_order_ceiling();

RESET ROLE;
