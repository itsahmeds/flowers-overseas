-- 0019_purchase: the record that groups the orders of one basket, paid together
-- (spec 010 §14 A-founder-2026-10-22 items 1 D1, D9 and 2 A; AC-63, AC-66, AC-69; TASK-347).
--
-- A basket line becomes its own order (its own florist, date, VAT and reference); the lines are
-- bought together, by one buyer, in one payment. `purchase` is that grouping. Buyer-facing copy
-- never says "purchase".
--
--   1. `purchase`: mode, the buyer's currency, the total, the locale and the guest customer. The
--      money pair (`total_minor` beside `buyer_currency_code`, FK `currency`) satisfies
--      `db:check`'s money gate. `UNIQUE (id, buyer_currency_code, mode)` is the target of the
--      orders' composite key. The currency column is `text` with the `^[A-Z]{3}$` check, like
--      `currency.code` and `"order".buyer_currency_code`, so the composite key compares like types.
--   2. `"order".purchase_id`, backfilled **before** `SET NOT NULL`: one purchase per existing
--      order, with that order's mode, currency, `buyer_total_minor`, `locale_code`, `customer_id`
--      and `created_at`. The backfill switches off `order_set_updated_at` for its one `UPDATE`, so
--      every existing order keeps its `updated_at` (and every other column) as it was; a DO block
--      then proves each order has its own purchase with an equal total.
--   3. `FOREIGN KEY (purchase_id, buyer_currency_code, mode) REFERENCES purchase (id,
--      buyer_currency_code, mode)`: "one currency and one mode per purchase" is a database fact.
--      A demo order and a live order can never share one payment.
--   4. `purchase_total_check()`, run by a `DEFERRABLE INITIALLY DEFERRED` constraint trigger on
--      `purchase` (insert, update) and on `"order"` (insert, update of `purchase_id` or
--      `buyer_total_minor`): **at commit**, the purchase's `total_minor` equals the sum of its
--      orders' `buyer_total_minor`, and a purchase with no order fails the same test. Error
--      `PURCHASE_TOTAL_MISMATCH`. `SECURITY DEFINER` (owner `app_owner`, which RLS does not
--      filter) with a pinned `search_path`, so the sum counts every order whatever the
--      committing transaction's `app.role`. So the amount charged once (spec 013) is provably
--      the sum of the orders.
--   5. RLS: `purchase_system` (all, `app.role = 'system'`) and `purchase_admin` (select,
--      `app.role = 'admin'`). No partner, customer or public policy: a florist never sees the
--      purchase or, through it, a sibling order.
--
-- Rollback: `0019_purchase.down.sql` (the triggers and their function, the foreign key, the
-- column, then the table). Orders keep every other column.

SET LOCAL ROLE app_owner;

CREATE TABLE public.purchase (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  mode                text        NOT NULL,
  buyer_currency_code text        NOT NULL,
  total_minor         bigint      NOT NULL,
  locale_code         text        NOT NULL,
  customer_id         uuid        NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchase_id_buyer_currency_code_mode_key UNIQUE (id, buyer_currency_code, mode),
  CONSTRAINT purchase_buyer_currency_code_currency_code_fk FOREIGN KEY (buyer_currency_code)
    REFERENCES public.currency (code) ON DELETE RESTRICT,
  CONSTRAINT purchase_locale_code_locale_code_fk FOREIGN KEY (locale_code)
    REFERENCES public.locale (code) ON DELETE RESTRICT,
  CONSTRAINT purchase_customer_id_customer_id_fk FOREIGN KEY (customer_id)
    REFERENCES public.customer (id) ON DELETE RESTRICT,
  CONSTRAINT purchase_mode_check CHECK (mode IN ('demo', 'test', 'live')),
  CONSTRAINT purchase_buyer_currency_code_check CHECK (buyer_currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT purchase_total_minor_check CHECK (total_minor >= 0)
);

CREATE INDEX purchase_customer_id_idx ON public.purchase USING btree (customer_id);

COMMENT ON TABLE public.purchase IS
  'Spec 010 §14 A-founder-2026-10-22: the orders of one basket, bought together in one payment; total_minor equals the sum of its orders at commit (purchase_total_check).';

ALTER TABLE public."order" ADD COLUMN purchase_id uuid NULL;

-- The backfill: one purchase per existing order. `updated_at` is not touched.
ALTER TABLE public."order" DISABLE TRIGGER order_set_updated_at;

UPDATE public."order" SET purchase_id = gen_random_uuid();

ALTER TABLE public."order" ENABLE TRIGGER order_set_updated_at;

INSERT INTO public.purchase (id, mode, buyer_currency_code, total_minor, locale_code, customer_id,
                             created_at)
SELECT o.purchase_id, o.mode, o.buyer_currency_code, o.buyer_total_minor, o.locale_code,
       o.customer_id, o.created_at
FROM public."order" o;

ALTER TABLE public."order" ALTER COLUMN purchase_id SET NOT NULL;

ALTER TABLE public."order"
  ADD CONSTRAINT order_purchase_id_buyer_currency_code_mode_purchase_fk FOREIGN KEY (purchase_id, buyer_currency_code, mode)
    REFERENCES public.purchase (id, buyer_currency_code, mode) ON DELETE RESTRICT;

CREATE INDEX order_purchase_id_idx ON public."order" USING btree (purchase_id);

COMMENT ON COLUMN public."order".purchase_id IS
  'Spec 010 §14 A-founder-2026-10-22: the purchase this order was bought in; same currency and mode by the composite key.';

-- The backfill's proof: every order has its own purchase, with an equal total.
DO $check$
DECLARE
  bad bigint;
BEGIN
  SELECT count(*) INTO bad
  FROM public."order" o
  LEFT JOIN public.purchase p ON p.id = o.purchase_id
  WHERE p.id IS NULL
     OR p.total_minor <> o.buyer_total_minor
     OR (SELECT count(*) FROM public."order" s WHERE s.purchase_id = o.purchase_id) <> 1;
  IF bad <> 0 THEN
    RAISE EXCEPTION 'PURCHASE_BACKFILL: % orders without their own purchase of an equal total', bad;
  END IF;
END
$check$;

CREATE FUNCTION public.purchase_total_check() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $fn$
DECLARE
  targets uuid[];
  target uuid;
  expected bigint;
  actual bigint;
  orders bigint;
BEGIN
  IF TG_TABLE_NAME = 'purchase' THEN
    targets := ARRAY[NEW.id];
  ELSIF TG_OP = 'UPDATE' AND OLD.purchase_id IS DISTINCT FROM NEW.purchase_id THEN
    targets := ARRAY[NEW.purchase_id, OLD.purchase_id];
  ELSE
    targets := ARRAY[NEW.purchase_id];
  END IF;
  FOREACH target IN ARRAY targets LOOP
    SELECT p.total_minor INTO expected FROM public.purchase p WHERE p.id = target;
    -- A purchase deleted later in the same transaction has nothing left to check.
    CONTINUE WHEN NOT FOUND;
    SELECT count(*), coalesce(sum(o.buyer_total_minor), 0) INTO orders, actual
    FROM public."order" o WHERE o.purchase_id = target;
    IF orders = 0 OR actual <> expected THEN
      RAISE EXCEPTION 'PURCHASE_TOTAL_MISMATCH: a purchase of % minor units has % orders summing to %',
        expected, orders, actual
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN NULL;
END
$fn$;

COMMENT ON FUNCTION public.purchase_total_check() IS
  'Spec 010 §14 A-founder-2026-10-22 item 2 A: at commit, purchase.total_minor equals the sum of its orders'' buyer_total_minor, and a purchase has at least one order.';

REVOKE EXECUTE ON FUNCTION public.purchase_total_check() FROM PUBLIC;

CREATE CONSTRAINT TRIGGER purchase_total_check
  AFTER INSERT OR UPDATE ON public.purchase
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.purchase_total_check();

CREATE CONSTRAINT TRIGGER purchase_total_check
  AFTER INSERT OR UPDATE OF purchase_id, buyer_total_minor ON public."order"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.purchase_total_check();

ALTER TABLE public.purchase ENABLE ROW LEVEL SECURITY;

CREATE POLICY purchase_system ON public.purchase FOR ALL TO app_web
  USING (public.app_current_role() = 'system')
  WITH CHECK (public.app_current_role() = 'system');

CREATE POLICY purchase_admin ON public.purchase FOR SELECT TO app_web
  USING (public.app_current_role() = 'admin');

RESET ROLE;
