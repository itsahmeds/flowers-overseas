-- Rollback of 0008_order_integrity (spec 002 §5.1, AC-4; TASK-020).
--
-- The triggers, then their functions. `0008` creates no table, type, role or schema.

SET LOCAL ROLE app_owner;

DROP TRIGGER IF EXISTS media_asset_delivery_proof_guard ON public.media_asset;
DROP TRIGGER IF EXISTS delivery_proof_asset_check ON public.delivery_proof;
DROP TRIGGER IF EXISTS order_assignment_mode_check ON public.order_assignment;
DROP TRIGGER IF EXISTS order_mode_immutable ON public."order";
DROP TRIGGER IF EXISTS order_insert_guard ON public."order";
DROP TRIGGER IF EXISTS order_status_guard ON public."order";
DROP TRIGGER IF EXISTS order_event_append_only_statement ON public.order_event;
DROP TRIGGER IF EXISTS order_event_append_only ON public.order_event;

DROP FUNCTION IF EXISTS public.media_asset_delivery_proof_guard();
DROP FUNCTION IF EXISTS public.delivery_proof_asset_check();
DROP FUNCTION IF EXISTS public.order_assignment_mode_check();
DROP FUNCTION IF EXISTS public.order_mode_immutable();
DROP FUNCTION IF EXISTS public.order_insert_guard();
DROP FUNCTION IF EXISTS public.order_status_guard();
DROP FUNCTION IF EXISTS public.order_event_append_only();

RESET ROLE;
