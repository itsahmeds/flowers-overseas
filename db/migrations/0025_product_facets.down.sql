-- Rollback of 0025_product_facets: drop the three product facet columns, the occasion edge's
-- `sort` and their checks (TASK-070). The values they held are the authored dataset's, which the
-- seed writes again after a forward migration.

SET LOCAL ROLE app_owner;

ALTER TABLE public.product
  DROP CONSTRAINT product_other_colours_check,
  DROP CONSTRAINT product_other_flowers_check,
  DROP COLUMN allergen_note,
  DROP COLUMN other_colours,
  DROP COLUMN other_flowers;

ALTER TABLE public.product_occasion
  DROP CONSTRAINT product_occasion_sort_check,
  DROP COLUMN sort;

RESET ROLE;
