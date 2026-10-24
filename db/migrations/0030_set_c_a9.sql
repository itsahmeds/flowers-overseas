-- 0030_set_c_a9: spec 002 §14 A9 (the founder's ruling of 2026-10-14: no relay language to
-- buyers), as A9.3 says to ship it, in one file: the projection change of A9.1 and the three
-- row-34 rows of A9.7. Shipped by spec 013's TASK-261, whose dispute path (AC-31) needs A9.7's
-- set C; A9.3 names "the first migration of spec 016 or 018" as the carrier, and none of those
-- carries it yet (declared in docs/tasks/TASK-261.md).
--
--   1. A9.1: `accepted` and `paid` project to `confirmed` for the buyer (they read
--      `with_florist`, which named a florist). `with_florist` stays an allowed value of the
--      column's check and no row uses it.
--   2. A9.7: set C gains `routed`, `no_partner_available` and `manual_reroute`, so a bank dispute
--      on a charged order still waiting for its florist opens a chargeback (row 34,
--      `order.chargeback_opened`, `chargeback_open`, `{system}`). Three rows; the distinct
--      events stay 28 and no state is added.
--
-- Rollback: `0030_set_c_a9.down.sql`, guarded by `A9_ROLLBACK_ROWS_IN_USE` (A9.3).

SET LOCAL ROLE app_owner;

UPDATE public.order_status SET buyer_projection = 'confirmed'
WHERE key IN ('accepted', 'paid') AND buyer_projection = 'with_florist';

INSERT INTO public.order_transition (from_status, event, to_status, allowed_actors) VALUES
  ('routed', 'order.chargeback_opened', 'chargeback_open', ARRAY['system']),
  ('no_partner_available', 'order.chargeback_opened', 'chargeback_open', ARRAY['system']),
  ('manual_reroute', 'order.chargeback_opened', 'chargeback_open', ARRAY['system']);

RESET ROLE;
