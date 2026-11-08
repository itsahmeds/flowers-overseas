-- Rollback of 0036_buyer_sign_in (spec 018 C.11; TASK-344). Sign-in keeps working; the account
-- only stops recording when it was last used.

SET LOCAL ROLE app_owner;

ALTER TABLE public.customer DROP COLUMN IF EXISTS last_signed_in_at;

RESET ROLE;
