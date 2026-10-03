-- Rollback of 0004_media (spec 002 §5.1 "Rollbacks drop in reverse dependency order", AC-4;
-- TASK-017).
--
-- Leaf tables first. Each `DROP TABLE` takes its own triggers, constraints and indexes —
-- including AC-11's `product_media_primary_idx` — with it; `0004` creates no type, function,
-- role or schema. No `CASCADE`: `0005`'s `payout.statement_media_asset_id` and `0007`'s
-- `delivery_proof`/`substitution_note` reference `media_asset`, and `db:rollback` unwinds newest
-- first, so by the time this runs they are gone; if one is not, the rollback must fail loudly.

SET LOCAL ROLE app_owner;

DROP TABLE IF EXISTS public.product_media_alt;
DROP TABLE IF EXISTS public.product_media;
DROP TABLE IF EXISTS public.media_variant;
DROP TABLE IF EXISTS public.media_asset;

RESET ROLE;
