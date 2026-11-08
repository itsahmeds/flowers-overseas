-- Rollback of 0040_ops_alerts (spec 025 §5.1 "Rollback", AC-36; TASK-488).
--
-- The alert history is lost: every row of `ops_alert` and `ops_alert_notification` and the quiet
-- hours setting go with their tables. No order or money data lives here, so there is no guard.
-- Roll the code back first: with the tables gone, `raiseAlert` falls back to Sentry plus the log
-- (AC-4), so a rollback never silences the Sentry trail.

SET LOCAL ROLE app_owner;

DELETE FROM public.feature_flag_scope WHERE flag_key = 'alerts.push';
DELETE FROM public.feature_flag WHERE key = 'alerts.push';

DELETE FROM public.retention_policy WHERE key = 'ops_alert';

DROP TABLE IF EXISTS public.ops_alert_setting;
DROP TABLE IF EXISTS public.ops_alert_notification;
DROP TABLE IF EXISTS public.ops_alert;

RESET ROLE;
