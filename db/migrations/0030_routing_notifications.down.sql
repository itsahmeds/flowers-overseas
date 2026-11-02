-- Rollback of 0030_routing_notifications (spec 016 §5.1 "Rollback line" per change, as amended by
-- §14 A-founder-2026-10-22 item 3; TASK-327).
--
-- In reverse order: the two flag rows; `webhook_inbox.provider` back to `0007`'s check after
-- deleting the `resend` rows (they could not exist under it); `notification_delivery_invoice`
-- before `notification_delivery` (its policies, trigger and indexes go with each table); and
-- `order_assignment`'s two checks and two columns. The runner wraps the file in one transaction.

SET LOCAL ROLE app_owner;

/* 6. Flags */

DELETE FROM public.feature_flag_scope WHERE flag_key IN ('routing.auto', 'notifications.email');
DELETE FROM public.feature_flag WHERE key IN ('routing.auto', 'notifications.email');

/* 5. webhook_inbox */

DELETE FROM public.webhook_inbox WHERE provider = 'resend';
ALTER TABLE public.webhook_inbox DROP CONSTRAINT IF EXISTS webhook_inbox_provider_check;
ALTER TABLE public.webhook_inbox ADD CONSTRAINT webhook_inbox_provider_check CHECK (
  provider IN ('stripe', 'mollie')
);

/* 2, 3, 4. notification_delivery_invoice, then notification_delivery */

DROP TABLE IF EXISTS public.notification_delivery_invoice;
DROP TABLE IF EXISTS public.notification_delivery;

/* 1. order_assignment */

ALTER TABLE public.order_assignment DROP CONSTRAINT IF EXISTS order_assignment_withdrawn_check;
ALTER TABLE public.order_assignment DROP CONSTRAINT IF EXISTS order_assignment_withdrawn_reason_check;
ALTER TABLE public.order_assignment DROP COLUMN IF EXISTS withdrawn_reason;
ALTER TABLE public.order_assignment DROP COLUMN IF EXISTS withdrawn_at;

RESET ROLE;
