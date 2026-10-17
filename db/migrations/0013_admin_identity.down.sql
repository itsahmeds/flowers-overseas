-- Rollback of 0013_admin_identity (spec 012 §5.1; TASK-217): drops the two tables, their
-- policies, trigger and index with them.

SET LOCAL ROLE app_owner;

DROP TABLE IF EXISTS public.auth_email_send;
DROP TABLE IF EXISTS public.admin_profile;

RESET ROLE;
