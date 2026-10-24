-- 0029_cancel_window_a10: free cancellation until the delivery morning (spec 002 §14 A10, the
-- founder's "2 B" of 2026-10-14; spec 013 §14 A-founder-2026-10-14b; AC-52 to AC-54 of spec 002;
-- spec 013 §12 task 3; TASK-258).
--
--   1. Rows 39 and 40 of A6.3 (A10.2): `order.cancelled` from `accepted` and from `paid`, for
--      `buyer` and `admin` only. Set P (the buyer's window) is set E plus these two states. No
--      new event and no new state: the distinct events stay 28.
--   2. `payout_adjustment` (A10.3): what a florist who accepted an order the buyer then cancelled
--      may be owed. No amount column, on purpose: the florist agreement decides it, and the
--      payouts spec settles the row with a `payout_line`. Ids, a kind, a status and times only,
--      so no personal data. RLS: staff (`admin`, `system`) all; a partner reads its own rows and
--      writes none; `public` and `customer` read nothing.
--
-- Row 16's timing (06:00 destination-local on the delivery date, A10.1) is code, not data: spec
-- 013's production-start job (`src/modules/payments/production.ts`).
--
-- Rollback: `0029_cancel_window_a10.down.sql`, guarded by `A10_ROLLBACK_ROWS_IN_USE` (A10.4).

SET LOCAL ROLE app_owner;

/* ---------------------------------------------------------------------------
 * 1. Rows 39 and 40
 * ------------------------------------------------------------------------ */

INSERT INTO public.order_transition (from_status, event, to_status, allowed_actors) VALUES
  ('accepted', 'order.cancelled', 'cancelled', ARRAY['buyer', 'admin']),
  ('paid', 'order.cancelled', 'cancelled', ARRAY['buyer', 'admin']);

/* ---------------------------------------------------------------------------
 * 2. payout_adjustment
 * ------------------------------------------------------------------------ */

CREATE TABLE public.payout_adjustment (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       uuid        NOT NULL,
  partner_id     uuid        NOT NULL,
  assignment_id  uuid        NOT NULL,
  kind           text        NOT NULL,
  status         text        NOT NULL DEFAULT 'open',
  payout_line_id uuid        NULL,
  resolved_at    timestamptz NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payout_adjustment_assignment_id_key UNIQUE (assignment_id),
  CONSTRAINT payout_adjustment_order_id_order_id_fk FOREIGN KEY (order_id)
    REFERENCES public."order" (id) ON DELETE RESTRICT,
  CONSTRAINT payout_adjustment_partner_id_fulfillment_partner_id_fk FOREIGN KEY (partner_id)
    REFERENCES public.fulfillment_partner (id) ON DELETE RESTRICT,
  CONSTRAINT payout_adjustment_assignment_id_order_assignment_id_fk FOREIGN KEY (assignment_id)
    REFERENCES public.order_assignment (id) ON DELETE RESTRICT,
  CONSTRAINT payout_adjustment_payout_line_id_payout_line_id_fk FOREIGN KEY (payout_line_id)
    REFERENCES public.payout_line (id) ON DELETE RESTRICT,
  CONSTRAINT payout_adjustment_kind_check CHECK (kind IN ('withdrawn_by_buyer_after_acceptance')),
  CONSTRAINT payout_adjustment_status_check CHECK (status IN ('open', 'settled', 'waived')),
  CONSTRAINT payout_adjustment_resolved_check CHECK ((status = 'open') = (resolved_at IS NULL)),
  CONSTRAINT payout_adjustment_settled_line_check CHECK (
    status <> 'settled' OR payout_line_id IS NOT NULL
  )
);

CREATE INDEX payout_adjustment_order_id_idx ON public.payout_adjustment USING btree (order_id);
CREATE INDEX payout_adjustment_partner_id_idx ON public.payout_adjustment USING btree (partner_id);

COMMENT ON TABLE public.payout_adjustment IS
  'Spec 002 §14 A10.3: a florist accepted an order the buyer then cancelled; the florist agreement decides what is owed, and the payouts spec settles or waives the row. No amount here.';

CREATE TRIGGER payout_adjustment_set_updated_at BEFORE UPDATE ON public.payout_adjustment
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.payout_adjustment ENABLE ROW LEVEL SECURITY;

CREATE POLICY payout_adjustment_staff ON public.payout_adjustment FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY payout_adjustment_partner ON public.payout_adjustment FOR SELECT TO app_web
  USING (app_is_partner_of(partner_id));

RESET ROLE;
