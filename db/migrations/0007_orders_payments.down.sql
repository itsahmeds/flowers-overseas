-- Rollback of 0007_orders_payments (spec 002 §5.1 "Rollbacks drop in reverse dependency order",
-- AC-4; TASK-019).
--
-- The deferred key on `0005`'s `payout_line` first, then the twelve tables, leaf first; each
-- `DROP TABLE` takes its triggers, constraints, indexes and seeded rows with it. `0007` creates
-- no type, function, role or schema.
--
-- No `CASCADE`: if a later migration's object still references one of these (`0008`'s triggers,
-- `0009`'s `outbox.order_id`), the rollback must fail loudly. `db:rollback` unwinds newest first.

SET LOCAL ROLE app_owner;

ALTER TABLE public.payout_line DROP CONSTRAINT IF EXISTS payout_line_order_id_order_id_fk;

DROP TABLE IF EXISTS public.webhook_inbox;
DROP TABLE IF EXISTS public.refund;
DROP TABLE IF EXISTS public.payment;
DROP TABLE IF EXISTS public.review;
DROP TABLE IF EXISTS public.delivery_proof;
DROP TABLE IF EXISTS public.substitution_note;
DROP TABLE IF EXISTS public.order_assignment;
DROP TABLE IF EXISTS public.order_event;
DROP TABLE IF EXISTS public.order_line;
DROP TABLE IF EXISTS public."order";
DROP TABLE IF EXISTS public.order_transition;
DROP TABLE IF EXISTS public.order_status;

RESET ROLE;
