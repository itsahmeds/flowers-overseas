-- 0013_order_engine_columns — order references never clash, and the order carries its language
-- (spec 010 §14 A2.2, A3.1; AC-45, AC-47; TASK-245).
--
-- Three objects, in one transaction (the runner wraps the file):
--
--   1. `order_reference(uuid) returns text`, `IMMUTABLE`: exactly what `orderReference` in
--      `src/modules/orders/service/reference.ts` returns (A2.1): Crockford base32 (digits and
--      capitals without I, L, O, U) of the id's **first 40 bits**, written `FO-` + four characters
--      + `-` + four characters. The first ten hex digits of the id are the 40 bits; they are read
--      as `bit(40)` and then as a `bigint`, and each five-bit group, most significant first, picks
--      one character. `tests/integration/order-reference.test.ts` holds it equal to the
--      TypeScript function on a pinned fixture of ten ids and on 1 000 random ones. `STRICT`, so
--      a null id is a null reference; `PARALLEL SAFE`, because it reads nothing but its argument.
--      Spec 018 reads the function; it creates neither it nor the index (A2.2).
--   2. `order_reference_idx`, unique on `order_reference(id)`: the database refuses a second order
--      under the same reference, which `orderService.place` meets inside a savepoint and answers
--      with a new id (A2.3). If an existing demo order already clashes, `CREATE UNIQUE INDEX`
--      fails, this whole file rolls back with nothing changed, and the clash is fixed by hand.
--   3. `"order".locale_code` (A3.1): the language the buyer last used in checkout, which buyer
--      emails are written in (specs 016, 018). The default `'en'` exists only so existing demo
--      orders backfill; `place` always writes the column and never relies on it. The foreign
--      key follows the Drizzle naming of `0007` (`<table>_<column>_<parent>_<parent_column>_fk`).
--
-- Rollback: `0013_order_engine_columns.down.sql` (the column, then the index, then the function).

SET LOCAL ROLE app_owner;

CREATE FUNCTION public.order_reference(order_id uuid) RETURNS text
  LANGUAGE sql
  IMMUTABLE
  STRICT
  PARALLEL SAFE
AS $fn$
  SELECT 'FO-'
    || substr(alphabet, ((bits >> 35) & 31)::int + 1, 1)
    || substr(alphabet, ((bits >> 30) & 31)::int + 1, 1)
    || substr(alphabet, ((bits >> 25) & 31)::int + 1, 1)
    || substr(alphabet, ((bits >> 20) & 31)::int + 1, 1)
    || '-'
    || substr(alphabet, ((bits >> 15) & 31)::int + 1, 1)
    || substr(alphabet, ((bits >> 10) & 31)::int + 1, 1)
    || substr(alphabet, ((bits >> 5) & 31)::int + 1, 1)
    || substr(alphabet, (bits & 31)::int + 1, 1)
  FROM (
    SELECT '0123456789ABCDEFGHJKMNPQRSTVWXYZ'::text AS alphabet,
           ('x' || left(replace(order_id::text, '-', ''), 10))::bit(40)::bigint AS bits
  ) AS parts
$fn$;

COMMENT ON FUNCTION public.order_reference(uuid) IS
  'Spec 010 §14 A2.2: the buyer-facing reference FO-XXXX-XXXX, equal to orderReference() in src/modules/orders/service/reference.ts.';

REVOKE EXECUTE ON FUNCTION public.order_reference(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.order_reference(uuid) TO app_web;

CREATE UNIQUE INDEX order_reference_idx ON public."order" (public.order_reference(id));

ALTER TABLE public."order"
  ADD COLUMN locale_code text NOT NULL DEFAULT 'en',
  ADD CONSTRAINT order_locale_code_locale_code_fk FOREIGN KEY (locale_code)
    REFERENCES public.locale (code) ON DELETE RESTRICT;

COMMENT ON COLUMN public."order".locale_code IS
  'Spec 010 §14 A3.1: the checkout draft''s locale at placement, written by orderService.place; the default only backfills orders placed before 0013.';

RESET ROLE;
