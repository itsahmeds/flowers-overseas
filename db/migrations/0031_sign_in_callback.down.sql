-- Rollback of 0031_sign_in_callback (spec 016 §12; TASK-331). Links minted with a callback still
-- sign in afterwards; they land on the surface's home instead of the order.

SET LOCAL ROLE app_owner;

ALTER TABLE public.verification_tokens DROP CONSTRAINT IF EXISTS verification_tokens_callback_path_check;
ALTER TABLE public.verification_tokens DROP COLUMN IF EXISTS callback_path;

RESET ROLE;
