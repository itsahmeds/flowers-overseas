-- Rollback of 0049_product_origin (spec 030b §14.3 "Down file, guard first", AC-57; TASK-443).
--
-- Guard first. An origin set by the supplier save, the import or an admin is a choice we cannot
-- derive again: if any `product_origin` row has `source <> 'backfill'`, this file raises
-- `PRODUCT_ORIGIN_ROLLBACK_ROWS_IN_USE` and the runner's one transaction means nothing below runs.
-- Backfilled rows are derivable and are deleted, then everything is dropped in reverse order.

SET LOCAL ROLE app_owner;

DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.product_origin WHERE source <> 'backfill') THEN
    RAISE EXCEPTION 'PRODUCT_ORIGIN_ROLLBACK_ROWS_IN_USE: a florist was chosen for a bouquet; 0049_product_origin is not rolled back'
      USING ERRCODE = 'restrict_violation';
  END IF;
END
$guard$;

/* 5. backfill */
DELETE FROM public.product_origin WHERE source = 'backfill';

/* 4. mappings by product */
DROP INDEX IF EXISTS public.partner_catalog_mapping_product_tier_idx;

/* 3, 2, 1. RLS, audit and the table go with it */
DROP TRIGGER IF EXISTS product_origin_audit ON public.product_origin;
DROP TABLE public.product_origin;

RESET ROLE;
