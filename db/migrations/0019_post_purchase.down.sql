-- Rollback of 0019_post_purchase (spec 018 §5.1 "Rollback", §12; spec 002 §14 A8.3, AC-47;
-- TASK-337).
--
-- Guards first; the runner wraps the file in one transaction, so a guard that raises changes
-- nothing:
--
--   - `POST_PURCHASE_ROLLBACK_INVOICES_EXIST` while any `invoice` row exists. Issued invoices are
--     legal records (spec 018 §12 "Rollback"): once one exists the tables are kept and a forward
--     fix is required. The down file is for pre-production only.
--   - `A8_ROLLBACK_ROWS_IN_USE` while an `order_event` records either A8 transition
--     (`order.no_partner_available` from `authorised` or `paid_unrouted`): the history would hold a
--     transition the table no longer allows (A8.3).
--
-- Then, in reverse order: A8's two rows and `sessions.created_at`; the flag rows; the invoice
-- tables (their policies, trigger and series rows go with them) and `invoice_immutable()`;
-- `display_first_name`; and `"order"` back to `0007`'s shape (no default, the `{22,}` check)
-- without `tracking_token_version`.
--
-- A rotated order (version above 1) gets a fresh `public_token` before the version column goes:
-- otherwise a down-then-up would reset every version to 1 and a token revoked by a rotation would
-- verify again. Every other token is kept, so a buyer's link survives a round trip.

SET LOCAL ROLE app_owner;

DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.invoice) THEN
    RAISE EXCEPTION 'POST_PURCHASE_ROLLBACK_INVOICES_EXIST: an invoice exists; 0019_post_purchase is not rolled back (spec 018 §12: forward fix)'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.order_event
    WHERE type = 'order.no_partner_available'
      AND from_status IN ('authorised', 'paid_unrouted')
  ) THEN
    RAISE EXCEPTION 'A8_ROLLBACK_ROWS_IN_USE: an order_event records an A8 transition; 0019_post_purchase is not rolled back (spec 002 §14 A8.3)'
      USING ERRCODE = 'restrict_violation';
  END IF;
END
$guard$;

/* 6. Spec 002 §14 A8 */

DELETE FROM public.order_transition
WHERE event = 'order.no_partner_available'
  AND from_status IN ('authorised', 'paid_unrouted')
  AND to_status = 'no_partner_available';

ALTER TABLE public.sessions DROP COLUMN IF EXISTS created_at;

/* 5. Flags */

DELETE FROM public.feature_flag_scope WHERE flag_key IN ('account.open', 'invoice.issue');
DELETE FROM public.feature_flag WHERE key IN ('account.open', 'invoice.issue');

/* 3, 4. Invoice tables, their policies and triggers, and invoice_immutable() */

DROP TABLE IF EXISTS public.invoice;
DROP FUNCTION IF EXISTS public.invoice_immutable();
DROP TABLE IF EXISTS public.invoice_profile;
DROP TABLE IF EXISTS public.invoice_series;
DROP TABLE IF EXISTS public.tax_registration;

/* 2. fulfillment_partner */

ALTER TABLE public.fulfillment_partner
  DROP CONSTRAINT IF EXISTS fulfillment_partner_display_first_name_check,
  DROP COLUMN IF EXISTS display_first_name;

/* 1. "order" */

UPDATE public."order"
SET public_token = translate(rtrim(encode(substring(
      sha256(uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid())) FROM 1 FOR 16),
      'base64'), '='), '+/', '-_')
WHERE tracking_token_version > 1;

ALTER TABLE public."order" ALTER COLUMN public_token DROP DEFAULT;
ALTER TABLE public."order" DROP CONSTRAINT IF EXISTS order_public_token_check;
ALTER TABLE public."order"
  ADD CONSTRAINT order_public_token_check CHECK (public_token ~ '^[A-Za-z0-9_-]{22,}$');
ALTER TABLE public."order"
  DROP CONSTRAINT IF EXISTS order_tracking_token_version_check,
  DROP COLUMN IF EXISTS tracking_token_version;

RESET ROLE;
