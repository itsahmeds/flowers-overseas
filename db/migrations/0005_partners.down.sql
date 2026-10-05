-- Rollback of 0005_partners (spec 002 §5.1 "Rollbacks drop in reverse dependency order", AC-4;
-- TASK-018).
--
-- The guard trigger on `media_asset` first, because that table is `0004`'s and stays; then the
-- nine tables, leaf first. Each `DROP TABLE` takes its own triggers, constraints and indexes with
-- it, including `partner_application_media_check`. The two trigger functions are this migration's
-- and go last. `public.set_updated_at()` is `0001`'s and stays.
--
-- No `CASCADE`: if a later migration's object still references one of these (`order_assignment`
-- and the `payout_line → "order"` constraint from `0007`, the `partner_member → users` constraint
-- from `0010`), the rollback must fail loudly rather than take a stranger's object with it.
-- `db:rollback` unwinds newest first, so those are gone by now.

SET LOCAL ROLE app_owner;

DROP TRIGGER IF EXISTS media_asset_partner_application_guard ON public.media_asset;

DROP TABLE IF EXISTS public.payout_line;
DROP TABLE IF EXISTS public.payout;
DROP TABLE IF EXISTS public.partner_application;
DROP TABLE IF EXISTS public.partner_catalog_mapping;
DROP TABLE IF EXISTS public.partner_blackout;
DROP TABLE IF EXISTS public.partner_coverage;
DROP TABLE IF EXISTS public.partner_member;
DROP TABLE IF EXISTS public.partner_translation;
DROP TABLE IF EXISTS public.fulfillment_partner;

DROP FUNCTION IF EXISTS public.media_asset_partner_application_guard();
DROP FUNCTION IF EXISTS public.partner_application_media_check();

RESET ROLE;
