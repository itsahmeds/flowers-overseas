-- 0030_routing_notifications — the data spec 016's routing and notification pipeline stand on
-- (spec 016 §5.1 `NNNN_routing_notifications`, as amended by §14 A-founder-2026-10-14b and
-- A-founder-2026-10-22 item 3; §12 task 1a; AC-49; TASK-327).
--
-- Runs after `0019_purchase` (spec 010: `purchase`) and `0021_post_purchase` (spec 018:
-- `invoice`, and spec 002 §14 A8's two `order_transition` rows, which this file therefore does
-- not carry). Every earlier migration stays exactly as merged: this file only ALTERs their tables
-- and adds its own.
--
--   1. `order_assignment.withdrawn_at` and `withdrawn_reason`, both null or both set: an offer
--      that was open or accepted and then stopped by us (cancellation, full refund, chargeback).
--      Spec 002's `response` (`accept`, `decline`, `timeout`) cannot say it; the payouts spec
--      reads the time.
--   2. `notification_delivery`: one row per email sent (or held, or failed) and what Resend later
--      said about it. **No address, name or subject is stored**: `recipient_ref` is `buyer`,
--      `ops` or a florist member's user id (checked), and the address is resolved at send time
--      (spec 016 §5.1, §8 "Minimisation"). A B1 (`order-received`) row belongs to a purchase and
--      to no order (one confirmation per purchase, A-founder-2026-10-22); every other row to an
--      order, or to nothing (an ops alert). The unique `(source_key, template_key,
--      recipient_ref)` is the pipeline's idempotency key (AC-19, AC-44).
--   3. `notification_delivery_invoice`: each invoice a B1 carried, so B8 knows whether it still
--      has to send it (replaces §5.1's `attached_invoice_id`, A-founder-2026-10-22 item 3).
--   4. RLS: both tables `system` and `admin` only (deny by default, spec 002 §5.5).
--   5. `webhook_inbox.provider` accepts `resend` (the same store-before-process inbox).
--   6. Flags `routing.auto` (country scope, default on) and `notifications.email` (global, default
--      on): the two rollback switches of spec 016 §12, both high-risk in the registry.
--
-- Rollback: `0030_routing_notifications.down.sql`.

SET LOCAL ROLE app_owner;

/* ---------------------------------------------------------------------------
 * 1. order_assignment: withdrawn by us
 * ------------------------------------------------------------------------ */

ALTER TABLE public.order_assignment ADD COLUMN withdrawn_at timestamptz NULL;
ALTER TABLE public.order_assignment ADD COLUMN withdrawn_reason text NULL;
ALTER TABLE public.order_assignment ADD CONSTRAINT order_assignment_withdrawn_reason_check CHECK (
  withdrawn_reason IN (
    'order_cancelled', 'payment_failed', 'refunded_full', 'chargeback_open', 'cancelled_refunded'
  )
);
ALTER TABLE public.order_assignment ADD CONSTRAINT order_assignment_withdrawn_check CHECK (
  (withdrawn_at IS NULL) = (withdrawn_reason IS NULL)
);

/* ---------------------------------------------------------------------------
 * 2. notification_delivery
 * ------------------------------------------------------------------------ */

CREATE TABLE public.notification_delivery (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key          text        NOT NULL,
  order_id            uuid        NULL,
  purchase_id         uuid        NULL,
  template_key        text        NOT NULL,
  audience            text        NOT NULL,
  recipient_ref       text        NOT NULL,
  locale_code         text        NOT NULL,
  provider            text        NOT NULL,
  provider_message_id text        NULL,
  status              text        NOT NULL,
  status_at           timestamptz NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_delivery_source_template_recipient_key
    UNIQUE (source_key, template_key, recipient_ref),
  CONSTRAINT notification_delivery_provider_message_id_key UNIQUE (provider_message_id),
  CONSTRAINT notification_delivery_order_id_order_id_fk FOREIGN KEY (order_id)
    REFERENCES public."order" (id) ON DELETE RESTRICT,
  CONSTRAINT notification_delivery_purchase_id_purchase_id_fk FOREIGN KEY (purchase_id)
    REFERENCES public.purchase (id) ON DELETE RESTRICT,
  CONSTRAINT notification_delivery_locale_code_locale_code_fk FOREIGN KEY (locale_code)
    REFERENCES public.locale (code) ON DELETE RESTRICT,
  CONSTRAINT notification_delivery_source_key_check CHECK (source_key <> ''),
  CONSTRAINT notification_delivery_template_key_check CHECK (template_key ~ '^[a-z][a-z0-9-]*$'),
  CONSTRAINT notification_delivery_audience_check CHECK (audience IN ('buyer', 'florist', 'ops')),
  -- `buyer`, `ops`, or a florist member's user id: never an address or a name (§5.1).
  CONSTRAINT notification_delivery_recipient_ref_check CHECK (
    recipient_ref IN ('buyer', 'ops')
    OR recipient_ref ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  CONSTRAINT notification_delivery_provider_check CHECK (provider IN ('resend', 'capture')),
  CONSTRAINT notification_delivery_status_check CHECK (status IN (
    'queued', 'sent', 'delivered', 'delivery_delayed', 'bounced', 'complained', 'failed'
  )),
  -- A row belongs to an order, to a purchase (B1 only), or to neither (an ops alert).
  CONSTRAINT notification_delivery_owner_check CHECK (order_id IS NULL OR purchase_id IS NULL),
  CONSTRAINT notification_delivery_order_received_check CHECK (
    template_key <> 'order-received' OR (purchase_id IS NOT NULL AND order_id IS NULL)
  )
);

CREATE INDEX notification_delivery_order_id_idx ON public.notification_delivery USING btree (order_id);
CREATE INDEX notification_delivery_purchase_id_idx ON public.notification_delivery USING btree (purchase_id);

CREATE TRIGGER notification_delivery_set_updated_at BEFORE UPDATE ON public.notification_delivery
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.notification_delivery IS
  'spec 016 §5.1: one row per email of the pipeline. No address, name or subject: recipient_ref is buyer, ops or a florist member''s user id, and the address is resolved at send time.';

/* ---------------------------------------------------------------------------
 * 3. notification_delivery_invoice
 * ------------------------------------------------------------------------ */

CREATE TABLE public.notification_delivery_invoice (
  notification_delivery_id uuid        NOT NULL,
  invoice_id               uuid        NOT NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_delivery_invoice_pkey PRIMARY KEY (notification_delivery_id, invoice_id),
  CONSTRAINT notification_delivery_invoice_delivery_id_fk FOREIGN KEY (notification_delivery_id)
    REFERENCES public.notification_delivery (id) ON DELETE CASCADE,
  CONSTRAINT notification_delivery_invoice_invoice_id_invoice_id_fk FOREIGN KEY (invoice_id)
    REFERENCES public.invoice (id) ON DELETE RESTRICT
);

CREATE INDEX notification_delivery_invoice_invoice_id_idx
  ON public.notification_delivery_invoice USING btree (invoice_id);

/* ---------------------------------------------------------------------------
 * 4. RLS: staff only
 * ------------------------------------------------------------------------ */

ALTER TABLE public.notification_delivery ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_delivery_invoice ENABLE ROW LEVEL SECURITY;

CREATE POLICY notification_delivery_staff ON public.notification_delivery FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY notification_delivery_invoice_staff ON public.notification_delivery_invoice FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());

/* ---------------------------------------------------------------------------
 * 5. webhook_inbox accepts resend
 * ------------------------------------------------------------------------ */

ALTER TABLE public.webhook_inbox DROP CONSTRAINT webhook_inbox_provider_check;
ALTER TABLE public.webhook_inbox ADD CONSTRAINT webhook_inbox_provider_check CHECK (
  provider IN ('stripe', 'mollie', 'resend')
);

/* ---------------------------------------------------------------------------
 * 6. Flags (spec 016 §12)
 * ------------------------------------------------------------------------ */

INSERT INTO public.feature_flag (key, description, enabled_default) VALUES
  ('routing.auto', 'Paid orders are offered to florists automatically (spec 016). Off for a country: every paid order there goes straight to the founder as no partner available, and is cancelled and refunded at its grace end if nobody acts.', true),
  ('notifications.email', 'Order emails are sent (spec 016). Off: every email waits, held and never dropped, until it is turned on again.', true);

RESET ROLE;
