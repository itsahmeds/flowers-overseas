-- Rollback of 0009_notifications_ops (spec 002 §5.1, AC-4; TASK-021).
--
-- The seven tables, leaf first; each takes its seed rows, triggers and indexes with it; then the
-- one function, `audit_log_append_only()`. `0009` creates no type, role or schema. No `CASCADE`: `0010`'s `audit_log → users` key is
-- dropped by `0010`'s own rollback first.

SET LOCAL ROLE app_owner;

DROP TABLE IF EXISTS public.db_usage_sample;
DROP TABLE IF EXISTS public.retention_policy;
DROP TABLE IF EXISTS public.audit_log;
DROP TABLE IF EXISTS public.feature_flag_scope;
DROP TABLE IF EXISTS public.feature_flag;
DROP TABLE IF EXISTS public.outbox_attempt;
DROP TABLE IF EXISTS public.outbox;

DROP FUNCTION IF EXISTS public.audit_log_append_only();

RESET ROLE;
