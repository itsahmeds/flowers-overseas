-- Rollback of 0015_checkout_draft (spec 010 §5.1 B; TASK-203): drops the table, and its policy,
-- trigger, index and constraints with it. No other object references `checkout_draft`
-- (`order` has no foreign key to it), so nothing else moves.

SET LOCAL ROLE app_owner;

DROP TABLE IF EXISTS public.checkout_draft;

RESET ROLE;
