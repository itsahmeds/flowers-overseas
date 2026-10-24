-- Rollback of 0029_cancel_window_a10 (spec 002 §14 A10.4, AC-54; TASK-258).
--
-- Guard first. If any `order_event` records `order.cancelled` from `accepted` or `paid`, the
-- history would hold a transition the table no longer allows; if any `payout_adjustment` row
-- exists, a florist's claim would be lost. Either way this file raises `A10_ROLLBACK_ROWS_IN_USE`;
-- the runner wraps the file in one transaction, so nothing below runs and nothing changes.
--
-- Otherwise: drop `payout_adjustment` with its policies and trigger, then delete rows 39 and 40.
-- A code rollback of the production-start job must first write row 16 for every `paid` order
-- waiting for its instant, or keep the job running until none waits (spec 013 §12).

SET LOCAL ROLE app_owner;

DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.order_event
    WHERE type = 'order.cancelled' AND from_status IN ('accepted', 'paid')
  ) OR EXISTS (SELECT 1 FROM public.payout_adjustment) THEN
    RAISE EXCEPTION 'A10_ROLLBACK_ROWS_IN_USE: a cancel after acceptance or a payout adjustment exists; 0029_cancel_window_a10 is not rolled back'
      USING ERRCODE = 'restrict_violation';
  END IF;
END
$guard$;

DROP TABLE IF EXISTS public.payout_adjustment;

DELETE FROM public.order_transition
WHERE event = 'order.cancelled' AND from_status IN ('accepted', 'paid');

RESET ROLE;
