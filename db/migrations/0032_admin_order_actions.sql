-- 0032_admin_order_actions — the record of every admin order action (spec 020a §5.1
-- `NNNN_admin_order_actions`; AC-5, AC-6, AC-7, AC-32; TASK-357's action core, built in TASK-359
-- by the orchestrator's ruling of 2026-11-02).
--
-- Numbered 0032: `0031` is held by PR 450 (TASK-331, `0031_sign_in_callback`); `pnpm db:check`
-- reports the gap until that one merges.
--
--   1. `admin_order_action`: one row per action that took effect. Its primary key is the form's
--      `actionId`, so a second submission of one form finds the row and does nothing (AC-5). It
--      holds ids, a reason code and money only: no note, name, email or address (§5.1). The
--      note travels in `app.audit_reason` into `audit_log.reason` and nowhere else.
--   2. Append-only: `UPDATE`, `DELETE` and `TRUNCATE` raise `ADMIN_ORDER_ACTION_APPEND_ONLY`
--      (spec 012's raise pattern, `0009`'s `audit_log_append_only()`).
--   3. Spec 012's `audit_row_change()` on insert: the audit row is written by the trigger in the
--      action's own transaction (AC-6); an admin-context insert without `app.audit_action` raises
--      `AUDIT_ACTION_MISSING` (AC-7).
--   4. `notification_delivery.resend_of`: a resend points at the row it repeats, and only an
--      `admin:` source key may (spec 020a §2.5; the resend itself is TASK-360's).
--   5. RLS: `admin` and `system` only, deny by default (spec 002 §5.5).
--   6. `retention_policy` row `admin_order_action`: deleted after 3 years, spec 012's `audit_log`
--      period. The money facts stay on `refund` and `order_event`.
--
-- Rollback: `0032_admin_order_actions.down.sql`. `audit_log` rows written for past actions stay
-- (that table is append-only), so the trail outlives a rollback (AC-32).

SET LOCAL ROLE app_owner;

/* ---------------------------------------------------------------------------
 * 1. admin_order_action
 * ------------------------------------------------------------------------ */

CREATE TABLE public.admin_order_action (
  id                       uuid        PRIMARY KEY,
  order_id                 uuid        NOT NULL,
  kind                     text        NOT NULL,
  actor_user_id            uuid        NOT NULL,
  reason                   text        NULL,
  amount_minor             bigint      NULL,
  currency_code            text        NULL,
  partner_id               uuid        NULL,
  notification_delivery_id uuid        NULL,
  result_ref               text        NOT NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_order_action_order_id_order_id_fk FOREIGN KEY (order_id)
    REFERENCES public."order" (id) ON DELETE RESTRICT,
  CONSTRAINT admin_order_action_actor_user_id_users_id_fk FOREIGN KEY (actor_user_id)
    REFERENCES public.users (id) ON DELETE RESTRICT,
  CONSTRAINT admin_order_action_currency_code_currency_code_fk FOREIGN KEY (currency_code)
    REFERENCES public.currency (code) ON DELETE RESTRICT,
  CONSTRAINT admin_order_action_partner_id_fulfillment_partner_id_fk FOREIGN KEY (partner_id)
    REFERENCES public.fulfillment_partner (id) ON DELETE RESTRICT,
  CONSTRAINT admin_order_action_notification_delivery_id_fk FOREIGN KEY (notification_delivery_id)
    REFERENCES public.notification_delivery (id) ON DELETE RESTRICT,
  CONSTRAINT admin_order_action_kind_check CHECK (
    kind IN ('reroute', 'cancel', 'refund_full', 'refund_partial', 'resend')
  ),
  -- Spec 013 §5.1 item 3's refund reasons (`refund_reason_check`, `0017`): a cancel's three are
  -- among them.
  CONSTRAINT admin_order_action_reason_check CHECK (reason IN (
    'buyer_cancel', 'no_partner', 'authorisation_lapsing', 'redelivery_failed', 'addon_missing',
    'late_delivery', 'substitution_complaint', 'quality', 'goodwill', 'duplicate', 'other'
  )),
  CONSTRAINT admin_order_action_amount_minor_check CHECK (amount_minor > 0),
  CONSTRAINT admin_order_action_money_pair_check CHECK (
    (amount_minor IS NULL) = (currency_code IS NULL)
  ),
  CONSTRAINT admin_order_action_refund_amount_check CHECK (
    (kind IN ('refund_full', 'refund_partial')) = (amount_minor IS NOT NULL)
  ),
  CONSTRAINT admin_order_action_reroute_partner_check CHECK (
    (kind = 'reroute') = (partner_id IS NOT NULL)
  ),
  CONSTRAINT admin_order_action_resend_delivery_check CHECK (
    (kind = 'resend') = (notification_delivery_id IS NOT NULL)
  ),
  CONSTRAINT admin_order_action_reason_kind_check CHECK (
    (kind IN ('cancel', 'refund_full', 'refund_partial')) = (reason IS NOT NULL)
  ),
  CONSTRAINT admin_order_action_result_ref_check CHECK (result_ref <> '')
);

-- The order's action history and the resend rate limit (spec 020a §5.2) read by order and time.
CREATE INDEX admin_order_action_order_id_created_at_idx
  ON public.admin_order_action USING btree (order_id, created_at);

/* ---------------------------------------------------------------------------
 * 2. append-only
 * ------------------------------------------------------------------------ */

CREATE FUNCTION public.admin_order_action_append_only() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public
AS $fn$
BEGIN
  RAISE EXCEPTION 'ADMIN_ORDER_ACTION_APPEND_ONLY: admin_order_action is append-only (% refused)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$fn$;

CREATE TRIGGER admin_order_action_append_only
  BEFORE UPDATE OR DELETE ON public.admin_order_action
  FOR EACH ROW EXECUTE FUNCTION public.admin_order_action_append_only();
CREATE TRIGGER admin_order_action_append_only_truncate
  BEFORE TRUNCATE ON public.admin_order_action
  FOR EACH STATEMENT EXECUTE FUNCTION public.admin_order_action_append_only();

REVOKE EXECUTE ON FUNCTION public.admin_order_action_append_only() FROM PUBLIC;

/* ---------------------------------------------------------------------------
 * 3. the audit row, by trigger
 * ------------------------------------------------------------------------ */

CREATE TRIGGER admin_order_action_audit
  AFTER INSERT ON public.admin_order_action
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('id');

/* ---------------------------------------------------------------------------
 * 4. notification_delivery.resend_of
 * ------------------------------------------------------------------------ */

ALTER TABLE public.notification_delivery ADD COLUMN resend_of uuid NULL;
ALTER TABLE public.notification_delivery
  ADD CONSTRAINT notification_delivery_resend_of_fk FOREIGN KEY (resend_of)
  REFERENCES public.notification_delivery (id) ON DELETE RESTRICT;
ALTER TABLE public.notification_delivery
  ADD CONSTRAINT notification_delivery_resend_of_check CHECK (
    resend_of IS NULL OR source_key LIKE 'admin:%'
  );

/* ---------------------------------------------------------------------------
 * 5. RLS
 * ------------------------------------------------------------------------ */

ALTER TABLE public.admin_order_action ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_order_action_staff ON public.admin_order_action FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());

/* ---------------------------------------------------------------------------
 * 6. retention
 * ------------------------------------------------------------------------ */

INSERT INTO public.retention_policy (key, entity_table, basis, retention_days, action, legal_note)
VALUES ('admin_order_action', 'admin_order_action', 'Art. 6(1)(c) legal obligation and 6(1)(f) legitimate interest', 1095, 'delete',
        'Spec 020a §5.1: the record of each admin order action is deleted after 3 years, spec 012''s audit_log period; the money facts stay on refund and order_event.');
