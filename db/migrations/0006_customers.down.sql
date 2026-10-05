-- Rollback of 0006_customers (spec 002 §5.1 "Rollbacks drop in reverse dependency order", AC-4;
-- TASK-018).
--
-- The five tables, leaf first; each `DROP TABLE` takes its own triggers, constraints and indexes
-- with it (the `lower(email_normalised)` index included). Then the supporting key this migration
-- added to `0002`'s `postcode_zone`, once nothing references it. `0006` creates no type, function,
-- role or schema.
--
-- No `CASCADE`: if a later migration's object still references one of these (`"order".customer_id`
-- and `recipient_id` from `0007`, the `customer → users` constraint from `0010`), the rollback must
-- fail loudly rather than take a stranger's object with it. `db:rollback` unwinds newest first.

SET LOCAL ROLE app_owner;

DROP TABLE IF EXISTS public.consent_log;
DROP TABLE IF EXISTS public.recipient_address;
DROP TABLE IF EXISTS public.recipient;
DROP TABLE IF EXISTS public.address;
DROP TABLE IF EXISTS public.customer;

ALTER TABLE public.postcode_zone DROP CONSTRAINT IF EXISTS postcode_zone_id_country_key;

RESET ROLE;
