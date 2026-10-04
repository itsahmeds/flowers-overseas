-- Rollback of 0004_media (spec 002 §5.1 "Rollbacks drop in reverse dependency order", AC-4;
-- §14 A1 (c) "each column has a one-line rollback"; TASK-017).
--
-- Leaf tables first. Each `DROP TABLE` takes its own triggers, constraints and indexes with it —
-- the AC-11 partial unique index, the `product_media_media_asset_idx` index and every §14 A1 (c)
-- column included — so there is nothing else to drop: `0004` creates no type, no function, no role
-- and no schema. `public.set_updated_at()` is `0001`'s and stays.
--
-- No `CASCADE`: if a later migration's table still references one of these (`delivery_proof`,
-- `substitution_note`, `payout`), the rollback must fail loudly rather than silently take a
-- stranger's table with it. `db:rollback` unwinds newest first, so those are gone by now.
--
-- No R2 object is touched. The rows are addresses; the objects they addressed stay in the bucket
-- and the seed (spec 006) re-creates the rows from `seed/data/media*.json`.

SET LOCAL ROLE app_owner;

DROP TABLE IF EXISTS public.product_media_alt;
DROP TABLE IF EXISTS public.product_media;
DROP TABLE IF EXISTS public.media_variant;
DROP TABLE IF EXISTS public.media_asset;

RESET ROLE;
