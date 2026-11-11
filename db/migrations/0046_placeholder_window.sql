-- 0046_placeholder_window: the `catalogue.placeholder_window` flag row (spec 012b §2.5, §12
-- "Feature flags", AC-8; TASK-295).
--
-- Numbered 0046 (orchestrator, 2026-11-11): main ends at 0045 (TASK-352).
-- Global and on from the cutover: while on, a publish may remove a `source = 'seed'` product's URL
-- (AC-8). The founder turns it off once, when the site opens to search engines, and it is never
-- turned back on (§13 Q6; the one-way control is TASK-297's). `src/config/feature-flags.ts`
-- registers the key; the reader refuses a key with no row (`FlagNotSeededError`).
--
-- Rollback: `0046_placeholder_window.down.sql` deletes the flag row and any scope row an admin wrote.

SET LOCAL ROLE app_owner;

INSERT INTO public.feature_flag (key, description, enabled_default) VALUES
  ('catalogue.placeholder_window', 'Placeholder products may be retired, removed from a country and renamed freely while on, and a publish may remove their URLs (spec 012b). Admin only, one way: turned off when the site opens to search engines, never on again.', true);

RESET ROLE;
