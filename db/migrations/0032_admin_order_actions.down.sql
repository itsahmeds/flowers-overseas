SET LOCAL ROLE app_owner;

-- Rollback of 0032_admin_order_actions (spec 020a §5.1; AC-32), in reverse order.
--
-- `audit_log` rows written for past actions stay: that table is append-only (spec 012), so the
-- trail outlives the rollback.

/* 6. retention */
DELETE FROM public.retention_policy WHERE key = 'admin_order_action';

/* 4. notification_delivery.resend_of */
ALTER TABLE public.notification_delivery DROP CONSTRAINT IF EXISTS notification_delivery_resend_of_check;
ALTER TABLE public.notification_delivery DROP CONSTRAINT IF EXISTS notification_delivery_resend_of_fk;
ALTER TABLE public.notification_delivery DROP COLUMN IF EXISTS resend_of;

/* 5, 3, 2, 1. admin_order_action: its policy, triggers and index go with it */
DROP TABLE IF EXISTS public.admin_order_action;
DROP FUNCTION IF EXISTS public.admin_order_action_append_only();
