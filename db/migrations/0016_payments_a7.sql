-- 0016_payments_a7 — payments as spec 013 needs them (spec 002 §14 A7, approved by the founder
-- 2026-10-14; spec 013 §5.1 items 1 to 6, §12 "Migration order"; AC-37; TASK-254).
--
-- Spec 002 §14 A7 governs every line below; spec 013 §5.1 is the request. Migrations `0007` to
-- `0011` stay exactly as merged (A7.1): this file only ALTERs their tables. Nothing here touches
-- `order_status` or `order_transition`. A7.2's catalogue item (`order.payment_attempt_failed`,
-- status-preserving) is data in `src/modules/orders/service/events.ts` and
-- `tests/fixtures/order-machine.ts`, with no database object.
--
--   1. `payment` (A7.3): `provider_ref` and `method` nullable while the row is `pending` or
--      `failed` (the row is written before the provider call); status gains `processing`; the
--      money, lifecycle and card columns; the captured/refunded bounds; one live payment per
--      order. `livemode` is `NOT NULL` with **no default**: the table is empty when A7 runs (no
--      payment step exists before spec 013), and on a non-empty table this file fails loudly
--      rather than guessing a mode. The hold-only parts (`authorised`, `capture_method =
--      'manual'`, `authorised_at`, `auth_expires_at`) ship and stay empty at launch (spec 013 §14).
--   2. `refund` (A7.4): `provider_ref` nullable while `requested` or `failed` (the row's own id is
--      the provider idempotency key); status gains `requested`; the eleven reasons; who asked;
--      `succeeded_at` set exactly when `succeeded` (the `{date}` of advisor F4).
--   3. `payment_dispute` (A7.5): new, in its payment's currency through `(payment_id,
--      currency_code)`, so `db:check`'s money pair holds. RLS: staff (`admin`, `system`) only.
--   4. `webhook_inbox` (A7.6): processing columns; every Stripe row names its mode and type, and
--      a row of another provider (spec 016's `resend`) may leave both null.
--   5. `outbox_delivery` (A7.7): one row per `(outbox row, target)`, made by an `AFTER INSERT ON
--      outbox` trigger, so a target that fails never holds up, or re-runs, one that succeeded;
--      `outbox_attempt.target` names the delivery an attempt was for. RLS: `system` only.
--
-- The trigger function is `SECURITY DEFINER` as `app_owner` with a pinned `search_path`, as
-- `0008`'s are: an admin's transition writes its outbox row under `app.role = 'admin'`, and the
-- deliveries it fans out to are a `system`-only table.
--
-- Rollback: `0016_payments_a7.down.sql`, which refuses with `A7_ROLLBACK_LIVE_PAYMENTS` and
-- changes nothing while any `payment.livemode = true` row exists (A7.8).

SET LOCAL ROLE app_owner;

/* ---------------------------------------------------------------------------
 * 1. payment (A7.3)
 * ------------------------------------------------------------------------ */

ALTER TABLE public.payment
  ALTER COLUMN provider_ref DROP NOT NULL,
  ALTER COLUMN method DROP NOT NULL,
  ADD COLUMN livemode              boolean     NOT NULL,
  ADD COLUMN capture_method        text        NULL,
  ADD COLUMN amount_captured_minor bigint      NOT NULL DEFAULT 0,
  ADD COLUMN amount_refunded_minor bigint      NOT NULL DEFAULT 0,
  ADD COLUMN authorised_at         timestamptz NULL,
  ADD COLUMN auth_expires_at       timestamptz NULL,
  ADD COLUMN failed_at             timestamptz NULL,
  ADD COLUMN attempts              integer     NOT NULL DEFAULT 0,
  ADD COLUMN last_decline_code     text        NULL,
  ADD COLUMN last_decline_ref      text        NULL,
  ADD COLUMN card_brand            text        NULL,
  ADD COLUMN card_last4            char(4)     NULL;

ALTER TABLE public.payment DROP CONSTRAINT payment_status_check;

ALTER TABLE public.payment
  ADD CONSTRAINT payment_status_check CHECK (status IN (
    'pending', 'requires_action', 'processing', 'authorised', 'captured', 'failed', 'cancelled'
  )),
  ADD CONSTRAINT payment_provider_ref_required_check CHECK (
    provider_ref IS NOT NULL OR status IN ('pending', 'failed')
  ),
  ADD CONSTRAINT payment_method_required_check CHECK (
    method IS NOT NULL OR status IN ('pending', 'failed')
  ),
  ADD CONSTRAINT payment_capture_method_check CHECK (capture_method IN ('manual', 'automatic')),
  ADD CONSTRAINT payment_amount_captured_minor_check CHECK (
    amount_captured_minor BETWEEN 0 AND amount_minor
  ),
  ADD CONSTRAINT payment_amount_refunded_minor_check CHECK (
    amount_refunded_minor BETWEEN 0 AND amount_captured_minor
  ),
  ADD CONSTRAINT payment_attempts_check CHECK (attempts >= 0);

CREATE UNIQUE INDEX payment_one_live_per_order_idx
  ON public.payment USING btree (order_id) WHERE status NOT IN ('cancelled', 'failed');

/* ---------------------------------------------------------------------------
 * 2. refund (A7.4)
 * ------------------------------------------------------------------------ */

ALTER TABLE public.refund
  ALTER COLUMN provider_ref DROP NOT NULL,
  ADD COLUMN requested_by text        NOT NULL,
  ADD COLUMN succeeded_at timestamptz NULL,
  ADD COLUMN failure_code text        NULL;

ALTER TABLE public.refund DROP CONSTRAINT refund_status_check;

ALTER TABLE public.refund
  ADD CONSTRAINT refund_status_check CHECK (status IN (
    'requested', 'pending', 'succeeded', 'failed', 'cancelled'
  )),
  ADD CONSTRAINT refund_provider_ref_required_check CHECK (
    provider_ref IS NOT NULL OR status IN ('requested', 'failed')
  ),
  ADD CONSTRAINT refund_reason_check CHECK (reason IN (
    'buyer_cancel', 'no_partner', 'authorisation_lapsing', 'redelivery_failed', 'addon_missing',
    'late_delivery', 'substitution_complaint', 'quality', 'goodwill', 'duplicate', 'other'
  )),
  ADD CONSTRAINT refund_succeeded_at_check CHECK (
    (status = 'succeeded') = (succeeded_at IS NOT NULL)
  );

/* ---------------------------------------------------------------------------
 * 3. payment_dispute (A7.5)
 * ------------------------------------------------------------------------ */

CREATE TABLE public.payment_dispute (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id      uuid        NOT NULL,
  currency_code   text        NOT NULL,
  provider_ref    text        NOT NULL,
  amount_minor    bigint      NOT NULL,
  reason          text        NOT NULL,
  status          text        NOT NULL,
  evidence_due_by timestamptz NULL,
  opened_at       timestamptz NOT NULL,
  closed_at       timestamptz NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_dispute_provider_ref_key UNIQUE (provider_ref),
  CONSTRAINT payment_dispute_payment_fkey FOREIGN KEY (payment_id, currency_code)
    REFERENCES public.payment (id, currency_code) ON DELETE RESTRICT,
  CONSTRAINT payment_dispute_currency_code_currency_code_fk FOREIGN KEY (currency_code)
    REFERENCES public.currency (code) ON DELETE RESTRICT,
  CONSTRAINT payment_dispute_amount_minor_check CHECK (amount_minor > 0),
  CONSTRAINT payment_dispute_currency_code_check CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT payment_dispute_status_check CHECK (status IN ('open', 'won', 'lost', 'closed'))
);

CREATE INDEX payment_dispute_payment_id_idx ON public.payment_dispute USING btree (payment_id);

CREATE TRIGGER payment_dispute_set_updated_at BEFORE UPDATE ON public.payment_dispute
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.payment_dispute ENABLE ROW LEVEL SECURITY;

CREATE POLICY payment_dispute_staff ON public.payment_dispute FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());

/* ---------------------------------------------------------------------------
 * 4. webhook_inbox (A7.6)
 * ------------------------------------------------------------------------ */

ALTER TABLE public.webhook_inbox
  ADD COLUMN livemode      boolean NULL,
  ADD COLUMN event_type    text    NULL,
  ADD COLUMN object_ref    text    NULL,
  ADD COLUMN status        text    NOT NULL DEFAULT 'received',
  ADD COLUMN ignore_reason text    NULL,
  ADD COLUMN last_error    text    NULL,
  ADD CONSTRAINT webhook_inbox_status_check CHECK (status IN (
    'received', 'processed', 'ignored', 'failed', 'dead'
  )),
  ADD CONSTRAINT webhook_inbox_stripe_fields_check CHECK (
    provider <> 'stripe' OR (livemode IS NOT NULL AND event_type IS NOT NULL)
  );

/* ---------------------------------------------------------------------------
 * 5. outbox_delivery, outbox_attempt.target (A7.7)
 * ------------------------------------------------------------------------ */

CREATE TABLE public.outbox_delivery (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id  uuid        NOT NULL,
  target     text        NOT NULL,
  status     text        NOT NULL DEFAULT 'pending',
  attempts   integer     NOT NULL DEFAULT 0,
  last_error text        NULL,
  sent_at    timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outbox_delivery_outbox_id_target_key UNIQUE (outbox_id, target),
  CONSTRAINT outbox_delivery_outbox_id_outbox_id_fk FOREIGN KEY (outbox_id)
    REFERENCES public.outbox (id) ON DELETE RESTRICT,
  CONSTRAINT outbox_delivery_status_check CHECK (status IN ('pending', 'sent', 'dead')),
  CONSTRAINT outbox_delivery_attempts_check CHECK (attempts >= 0)
);

CREATE INDEX outbox_delivery_pending_idx
  ON public.outbox_delivery USING btree (created_at) WHERE status = 'pending';

CREATE TRIGGER outbox_delivery_set_updated_at BEFORE UPDATE ON public.outbox_delivery
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.outbox_delivery ENABLE ROW LEVEL SECURITY;

CREATE POLICY outbox_delivery_system ON public.outbox_delivery FOR ALL TO app_web
  USING (public.app_current_role() = 'system')
  WITH CHECK (public.app_current_role() = 'system');

ALTER TABLE public.outbox_attempt ADD COLUMN target text NULL;

-- Exactly one delivery per element of `targets`. A target named twice in one row is a duplicate
-- `(outbox_id, target)` and fails the insert, so the writer's bug cannot pass as one delivery.
CREATE FUNCTION public.outbox_delivery_fanout() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $fn$
BEGIN
  INSERT INTO public.outbox_delivery (outbox_id, target)
  SELECT NEW.id, target FROM unnest(NEW.targets) AS target;
  RETURN NULL;
END
$fn$;

REVOKE EXECUTE ON FUNCTION public.outbox_delivery_fanout() FROM PUBLIC;

CREATE TRIGGER outbox_delivery_fanout AFTER INSERT ON public.outbox
  FOR EACH ROW EXECUTE FUNCTION public.outbox_delivery_fanout();

RESET ROLE;
