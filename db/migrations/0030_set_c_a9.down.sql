-- Rollback of 0030_set_c_a9 (spec 002 §14 A9.3, AC-49; TASK-261).
--
-- Guard first. If any `order_event` records `order.chargeback_opened` from `routed`,
-- `no_partner_available` or `manual_reroute`, the history would hold a transition the table no
-- longer allows: this file raises `A9_ROLLBACK_ROWS_IN_USE`, and the runner's one transaction
-- leaves everything as it was.
--
-- Otherwise: delete the three rows, then set `accepted` and `paid` back to `with_florist`. The
-- projection is read from the table when a page renders and is stored in no order or event row,
-- so rolling it back rewrites no history.

SET LOCAL ROLE app_owner;

DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.order_event
    WHERE type = 'order.chargeback_opened'
      AND from_status IN ('routed', 'no_partner_available', 'manual_reroute')
  ) THEN
    RAISE EXCEPTION 'A9_ROLLBACK_ROWS_IN_USE: a chargeback opened from a routing state exists; 0030_set_c_a9 is not rolled back'
      USING ERRCODE = 'restrict_violation';
  END IF;
END
$guard$;

DELETE FROM public.order_transition
WHERE event = 'order.chargeback_opened'
  AND from_status IN ('routed', 'no_partner_available', 'manual_reroute');

UPDATE public.order_status SET buyer_projection = 'with_florist'
WHERE key IN ('accepted', 'paid') AND buyer_projection = 'confirmed';

RESET ROLE;
