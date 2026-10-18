-- Rollback of 0013_order_engine_columns (spec 010 §14 A2.2, A3.1; AC-47; TASK-245).
--
-- The column (its foreign key goes with it), then the index, then the function the index reads.
-- `0013` creates no table, type, role or schema.

SET LOCAL ROLE app_owner;

ALTER TABLE public."order" DROP COLUMN IF EXISTS locale_code;

DROP INDEX IF EXISTS public.order_reference_idx;

DROP FUNCTION IF EXISTS public.order_reference(uuid);

RESET ROLE;
