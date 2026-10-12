-- Rollback of 0010_auth (spec 002 §5.1, AC-4; TASK-022).
--
-- The three keys into `users`, then the five tables, leaf first. `0010` creates no type,
-- function, role or schema.

SET LOCAL ROLE app_owner;

ALTER TABLE public.audit_log DROP CONSTRAINT IF EXISTS audit_log_actor_user_id_users_id_fk;
ALTER TABLE public.customer DROP CONSTRAINT IF EXISTS customer_user_id_users_id_fk;
ALTER TABLE public.partner_member DROP CONSTRAINT IF EXISTS partner_member_user_id_users_id_fk;

DROP TABLE IF EXISTS public.user_role;
DROP TABLE IF EXISTS public.verification_tokens;
DROP TABLE IF EXISTS public.sessions;
DROP TABLE IF EXISTS public.accounts;
DROP TABLE IF EXISTS public.users;

RESET ROLE;
