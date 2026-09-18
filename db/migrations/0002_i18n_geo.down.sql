-- Rollback of 0002_i18n_geo (spec 002 §5.1 "Rollbacks drop in reverse dependency order", AC-4;
-- TASK-015).
--
-- Reverse dependency order, leaf tables first. Each `DROP TABLE` takes its own triggers,
-- constraints, indexes and any sequence it owns with it, so there is nothing else to drop: `0002`
-- creates no type, no function, no role and no schema. `public.set_updated_at()` is `0001`'s and
-- stays — the triggers that reference it are gone with their tables.
--
-- No `CASCADE`: if a later migration's table still references one of these, the rollback must
-- fail loudly rather than silently take a stranger's table with it. `db:rollback` unwinds newest
-- first, so by the time this file runs there is nothing left above it.
--
-- `SET LOCAL ROLE app_owner` because `app_owner` owns every object `0002` created and only the
-- owner may drop it.

SET LOCAL ROLE app_owner;

DROP TABLE IF EXISTS public.fx_rate;
DROP TABLE IF EXISTS public.occasion_country;
DROP TABLE IF EXISTS public.occasion_translation;
DROP TABLE IF EXISTS public.occasion;
DROP TABLE IF EXISTS public.country_holiday;
DROP TABLE IF EXISTS public.postcode_zone;
DROP TABLE IF EXISTS public.city_translation;
DROP TABLE IF EXISTS public.city;
DROP TABLE IF EXISTS public.region;
DROP TABLE IF EXISTS public.country_locale_content;
DROP TABLE IF EXISTS public.country_translation;
DROP TABLE IF EXISTS public.country;
DROP TABLE IF EXISTS public.currency;
DROP TABLE IF EXISTS public.message_catalog;
DROP TABLE IF EXISTS public.locale;

RESET ROLE;
