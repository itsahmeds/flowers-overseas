-- Rollback of 0003_catalog_pricing (spec 002 §5.1 "Rollbacks drop in reverse dependency order",
-- AC-4; §14 A5's "a rollback that restores the six-value check"; TASK-016).
--
-- Reverse dependency order, leaf tables first. Each `DROP TABLE` takes its own triggers,
-- constraints, indexes — including the three partial unique indexes of AC-9 and §14 A1 — with it,
-- so there is nothing else to drop: `0003` creates no type, no function, no role and no schema.
-- `public.set_updated_at()` is `0001`'s and stays.
--
-- No `CASCADE`: if a later migration's table still references one of these, the rollback must fail
-- loudly rather than silently take a stranger's table with it. `db:rollback` unwinds newest first,
-- so by the time this file runs `0004`'s media tables — which reference `product` — are gone.
--
-- **The one statement that is not a drop.** §14 A5 widened `occasion_country_rule_type_check` to
-- seven values; restoring the six-value list has to remove the rows the seventh value allowed,
-- because a `CHECK` is validated against existing rows when it is added. A5 says exactly that
-- ("after deleting or re-typing any seventh-type rows"). The `DELETE` is safe in Phase 0 and only
-- in Phase 0: every `occasion_country` row is seed-projected, `pnpm db:seed` restores it, and the
-- rows are a per-country date rule rather than anybody's data. Should this rollback ever be
-- needed against real authored rules, re-type them first and delete nothing.
--
-- `SET LOCAL ROLE app_owner` because `app_owner` owns every object `0003` created and only the
-- owner may drop it or alter the `0002` table it amended.

SET LOCAL ROLE app_owner;

DROP TABLE IF EXISTS public.country_price;
DROP TABLE IF EXISTS public.addon_country_price;
DROP TABLE IF EXISTS public.addon_translation;
DROP TABLE IF EXISTS public.addon;
DROP TABLE IF EXISTS public.product_occasion;
DROP TABLE IF EXISTS public.product_category;
DROP TABLE IF EXISTS public.product_tier;
DROP TABLE IF EXISTS public.product_translation;
DROP TABLE IF EXISTS public.product;
DROP TABLE IF EXISTS public.category_translation;
DROP TABLE IF EXISTS public.category;

-- §14 A5, reversed: the six-value list of `plan/03` §9, and the column comment `0002` shipped.
DELETE FROM public.occasion_country WHERE rule_type = 'orthodox_easter_offset';

ALTER TABLE public.occasion_country DROP CONSTRAINT occasion_country_rule_type_check;
ALTER TABLE public.occasion_country ADD CONSTRAINT occasion_country_rule_type_check CHECK (
  rule_type IN (
    'fixed', 'nth_weekday', 'last_weekday', 'easter_offset', 'lent_sunday', 'none'
  )
);

COMMENT ON COLUMN public.occasion_country.rule_type IS
  'plan/03 §9 verbatim: fixed | nth_weekday | last_weekday | easter_offset | lent_sunday | none. Evaluated by spec 009.';

RESET ROLE;
