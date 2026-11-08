-- Rollback of 0042_analytics_ga4 (spec 023 §5.1 "Rollback", AC-29; TASK-491).
--
-- Reverse order: the flag, the retention row, `analytics_dispatch` (its index with it), then
-- `order_analytics`. No guard: these rows are measurement records, not accounting records;
-- losing them loses only the ability to send a later refund to GA4.

SET LOCAL ROLE app_owner;

DELETE FROM public.feature_flag_scope WHERE flag_key = 'analytics.mp_send';
DELETE FROM public.feature_flag WHERE key = 'analytics.mp_send';

DELETE FROM public.retention_policy WHERE key = 'order_analytics_ga_ids';

DROP TABLE IF EXISTS public.analytics_dispatch;
DROP TABLE IF EXISTS public.order_analytics;

RESET ROLE;
