-- 0025_product_facets — the product facts the catalogue reads and spec 002 §5.1 has no column
-- for (spec 005 AC-27, spec 012b §2.2; TASK-070).
--
-- `dbCatalogueProvider` must hand over the same `ProductData` record the static provider does
-- (spec 005 AC-27: the same contract suite, the same seeded dataset), and spec 012b §2.2 makes the
-- database the only runtime source of "products, tiers, facets". Spec 002 §5.1's `product` row
-- stores the *primary* flower and colour only, `product_occasion` holds the occasion set, and
-- three authored facts had nowhere to live (`src/config/catalogue/schemas.ts`, `seed/project.ts`):
--
--   * `other_flowers`  — the flower types after the primary (`plan/10` §1.1 "many, one primary");
--   * `other_colours`  — the colours after the primary (same rule);
--   * `allergen_note`  — the gift sets that contain food (`plan/10` §1.1's allergen attribute);
--   * `product_occasion.sort` — the authored order of a product's occasions, which the edge table
--     has no column for (`product_category` has one); the seed writes the edges from now on.
--
-- The primary stays in its own column, so nothing that reads `primary_flower` / `colour_primary`
-- changes, and a primary listed again among the others is refused. The arrays default to empty,
-- so every existing row is valid the moment the columns exist and no other writer has to change.
--
-- The one-time backfill puts the authored values on rows the seed already wrote. A production seed
-- runs `--insert-only` (spec 012b AC-1) and never updates an existing row, so without it a database
-- seeded before this migration would keep empty facets for good. It touches `source = 'seed'` rows
-- only (`plan/10` §4: never a `real` row) and only while all three still hold their defaults, so it
-- cannot overwrite an admin edit. On a fresh database it matches no row; the seed writes the
-- columns from then on (`seed/plan.ts`). The values are the authored dataset on the day this
-- migration was written, and `tests/integration/catalog-db-providers.test.ts` proves a database
-- seeded before it reads back exactly as the dataset after it.
--
-- Rollback: `0025_product_facets.down.sql` drops the four columns and their checks.

SET LOCAL ROLE app_owner;

ALTER TABLE public.product
  ADD COLUMN other_flowers text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN other_colours text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN allergen_note boolean NOT NULL DEFAULT false;

ALTER TABLE public.product_occasion
  ADD COLUMN sort integer NOT NULL DEFAULT 0,
  ADD CONSTRAINT product_occasion_sort_check CHECK (sort >= 0);

ALTER TABLE public.product
  ADD CONSTRAINT product_other_flowers_check
    CHECK (NOT (primary_flower = ANY (other_flowers))),
  ADD CONSTRAINT product_other_colours_check
    CHECK (NOT (colour_primary = ANY (other_colours)));

UPDATE public.product AS p
SET other_flowers = f.other_flowers,
    other_colours = f.other_colours,
    allergen_note = f.allergen_note
FROM (VALUES
  ('FO-BQ-001', ARRAY['mixed'], '{}'::text[], false),
  ('FO-BQ-002', ARRAY['mixed'], '{}'::text[], false),
  ('FO-BQ-003', ARRAY['mixed'], '{}'::text[], false),
  ('FO-BQ-004', ARRAY['mixed'], ARRAY['pink', 'white'], false),
  ('FO-BQ-005', ARRAY['mixed'], '{}'::text[], false),
  ('FO-BQ-006', ARRAY['mixed'], '{}'::text[], false),
  ('FO-BQ-007', ARRAY['mixed'], '{}'::text[], false),
  ('FO-BQ-008', ARRAY['mixed'], '{}'::text[], false),
  ('FO-BQ-009', ARRAY['mixed'], '{}'::text[], false),
  ('FO-BQ-010', ARRAY['mixed'], '{}'::text[], false),
  ('FO-BQ-011', ARRAY['mixed'], '{}'::text[], false),
  ('FO-BQ-012', ARRAY['mixed'], '{}'::text[], false),
  ('FO-BQ-013', ARRAY['mixed'], '{}'::text[], false),
  ('FO-BQ-014', ARRAY['mixed'], ARRAY['orange', 'pink'], false),
  ('FO-BQ-015', ARRAY['mixed'], '{}'::text[], false),
  ('FO-BQ-016', ARRAY['mixed'], '{}'::text[], false),
  ('FO-BQ-017', ARRAY['mixed'], '{}'::text[], false),
  ('FO-BQ-018', ARRAY['mixed'], '{}'::text[], false),
  ('FO-BQ-019', ARRAY['mixed'], '{}'::text[], false),
  ('FO-BQ-020', ARRAY['mixed'], ARRAY['pink', 'white'], false),
  ('FO-BQ-021', ARRAY['mixed'], '{}'::text[], false),
  ('FO-BQ-022', ARRAY['mixed'], '{}'::text[], false),
  ('FO-BQ-023', ARRAY['mixed'], '{}'::text[], false),
  ('FO-BQ-024', ARRAY['mixed'], '{}'::text[], false),
  ('FO-BQ-025', ARRAY['mixed'], '{}'::text[], false),
  ('FO-BQ-026', ARRAY['mixed'], ARRAY['orange', 'pink'], false),
  ('FO-BQ-027', ARRAY['mixed'], '{}'::text[], false),
  ('FO-BQ-029', '{}'::text[], ARRAY['pink', 'white'], false),
  ('FO-BQ-031', '{}'::text[], ARRAY['pink', 'white'], false),
  ('FO-BQ-032', '{}'::text[], ARRAY['orange', 'pink'], false),
  ('FO-BQ-038', ARRAY['mixed'], '{}'::text[], false),
  ('FO-BQ-039', ARRAY['mixed'], '{}'::text[], false),
  ('FO-BQ-040', ARRAY['mixed'], '{}'::text[], false),
  ('FO-AR-001', '{}'::text[], ARRAY['pink', 'white'], false),
  ('FO-AR-004', '{}'::text[], ARRAY['orange', 'pink'], false),
  ('FO-AR-014', '{}'::text[], ARRAY['pink', 'white'], false),
  ('FO-FN-008', '{}'::text[], ARRAY['pink', 'white'], false),
  ('FO-GS-001', '{}'::text[], '{}'::text[], true),
  ('FO-GS-005', '{}'::text[], '{}'::text[], true),
  ('FO-GS-006', '{}'::text[], ARRAY['pink', 'white'], false),
  ('FO-GS-007', '{}'::text[], '{}'::text[], true),
  ('FO-GS-010', '{}'::text[], ARRAY['orange', 'pink'], false),
  ('FO-GS-011', '{}'::text[], '{}'::text[], true),
  ('FO-GS-012', '{}'::text[], ARRAY['pink', 'white'], false)
) AS f (sku, other_flowers, other_colours, allergen_note)
WHERE p.sku = f.sku
  AND p.source = 'seed'
  AND p.other_flowers = '{}'
  AND p.other_colours = '{}'
  AND NOT p.allergen_note;

RESET ROLE;
