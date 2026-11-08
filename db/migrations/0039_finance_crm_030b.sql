-- 0039_finance_crm_030b — admin finance and the florist CRM: the provider's balance facts, the
-- founder's notes and contact log, the contact person, the retention clock, the two finance
-- views (spec 030b §5.1; AC-4, AC-9, AC-32, AC-33; TASK-439).
--
--   1. `payment_balance_txn`: one row per provider balance transaction (Stripe's fee, settled
--      amount and FX of every money movement), immutable by trigger
--      (`BALANCE_TXN_IMMUTABLE`). Ids, amounts, currencies, rates and dates only; no personal
--      data (no charge object is ever fetched, spec 030b §2.2).
--   2. `partner_note`: the founder's notes on a florist (1 to 2000 characters).
--   3. `partner_contact_log`: the contact log and its follow-ups.
--   4. `fulfillment_partner.contact_name` (the person we speak to) and `offboarded_at`, set once
--      by `partner_offboarded_at` when the status becomes `offboarded` and never cleared;
--      backfilled for rows already offboarded.
--   5. `audit_mask_columns()` gains `fulfillment_partner.contact_name`, `partner_note.body` and
--      `partner_contact_log.summary`; spec 012's `audit_row_change()` is attached to the two new
--      CRM tables, so every write is audited and the text never reaches `audit_log`.
--   6. Views `finance_order_facts` and `finance_partner_position` (`security_invoker`, so they
--      read with the caller's RLS); `SELECT` to `app_web` only.
--   7. Index `payment (captured_at)` for the date-range scan.
--   8. `retention_policy` rows `partner_note` and `partner_contact_log` (delete 730 days after
--      the florist's `offboarded_at`, §13 Q11) and `payment_balance_txn` (kept 10 years).
--   9. Flag `payments.balance_fetch` (global, on).
--  10. RLS on the three tables: staff (`admin`, `system`) only.
--
-- Rollback: `0039_finance_crm_030b.down.sql`, guarded by `FINANCE_CRM_ROLLBACK_ROWS_IN_USE`.

SET LOCAL ROLE app_owner;

/* ---------------------------------------------------------------------------
 * 1. payment_balance_txn
 * ------------------------------------------------------------------------ */

CREATE TABLE public.payment_balance_txn (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id                uuid        NOT NULL,
  refund_id                 uuid        NULL,
  dispute_id                uuid        NULL,
  kind                      text        NOT NULL,
  provider                  text        NOT NULL,
  provider_txn_ref          text        NOT NULL,
  source_ref                text        NOT NULL,
  provider_type             text        NOT NULL,
  reporting_category        text        NOT NULL,
  presentment_amount_minor  bigint      NULL,
  presentment_currency_code text        NULL,
  amount_minor              bigint      NOT NULL,
  fee_minor                 bigint      NOT NULL,
  net_minor                 bigint      NOT NULL,
  settlement_currency_code  text        NOT NULL,
  effective_rate_ppm        bigint      NULL,
  provider_exchange_rate    text        NULL,
  provider_created_at       timestamptz NOT NULL,
  available_on              date        NULL,
  livemode                  boolean     NOT NULL,
  fetched_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_balance_txn_provider_txn_ref_key UNIQUE (provider_txn_ref),
  CONSTRAINT payment_balance_txn_payment_id_payment_id_fk FOREIGN KEY (payment_id)
    REFERENCES public.payment (id) ON DELETE RESTRICT,
  CONSTRAINT payment_balance_txn_refund_id_refund_id_fk FOREIGN KEY (refund_id)
    REFERENCES public.refund (id) ON DELETE RESTRICT,
  CONSTRAINT payment_balance_txn_dispute_id_payment_dispute_id_fk FOREIGN KEY (dispute_id)
    REFERENCES public.payment_dispute (id) ON DELETE RESTRICT,
  CONSTRAINT payment_balance_txn_presentment_currency_code_currency_code_fk
    FOREIGN KEY (presentment_currency_code) REFERENCES public.currency (code) ON DELETE RESTRICT,
  CONSTRAINT payment_balance_txn_settlement_currency_code_currency_code_fk
    FOREIGN KEY (settlement_currency_code) REFERENCES public.currency (code) ON DELETE RESTRICT,
  CONSTRAINT payment_balance_txn_kind_check
    CHECK (kind IN ('charge', 'refund', 'refund_failure', 'dispute', 'dispute_reversal', 'other')),
  CONSTRAINT payment_balance_txn_provider_check CHECK (provider IN ('stripe', 'mollie')),
  CONSTRAINT payment_balance_txn_effective_rate_ppm_check CHECK (effective_rate_ppm > 0),
  CONSTRAINT payment_balance_txn_provider_exchange_rate_check
    CHECK (provider_exchange_rate ~ '^[0-9]+(\.[0-9]+)?$'),
  CONSTRAINT payment_balance_txn_net_check CHECK (net_minor = amount_minor - fee_minor),
  CONSTRAINT payment_balance_txn_presentment_pair_check
    CHECK ((presentment_amount_minor IS NULL) = (presentment_currency_code IS NULL)),
  CONSTRAINT payment_balance_txn_refund_check
    CHECK (kind NOT IN ('refund', 'refund_failure') OR refund_id IS NOT NULL),
  CONSTRAINT payment_balance_txn_dispute_check
    CHECK (kind NOT IN ('dispute', 'dispute_reversal') OR dispute_id IS NOT NULL)
);

CREATE INDEX payment_balance_txn_payment_id_idx ON public.payment_balance_txn USING btree (payment_id);
CREATE INDEX payment_balance_txn_refund_id_idx ON public.payment_balance_txn USING btree (refund_id);
CREATE INDEX payment_balance_txn_dispute_id_idx ON public.payment_balance_txn USING btree (dispute_id);

COMMENT ON TABLE public.payment_balance_txn IS
  'Spec 030b §2.2: the provider''s balance transactions (fee, settled amount, FX), as reported. Never updated or deleted (BALANCE_TXN_IMMUTABLE). No personal data.';

CREATE FUNCTION public.payment_balance_txn_immutable() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public
AS $fn$
BEGIN
  RAISE EXCEPTION 'BALANCE_TXN_IMMUTABLE: a provider balance fact is never changed; % is refused', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$fn$;

CREATE TRIGGER payment_balance_txn_immutable
  BEFORE UPDATE OR DELETE ON public.payment_balance_txn
  FOR EACH ROW EXECUTE FUNCTION public.payment_balance_txn_immutable();

/* ---------------------------------------------------------------------------
 * 2. partner_note
 * ------------------------------------------------------------------------ */

CREATE TABLE public.partner_note (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id     uuid        NOT NULL,
  body           text        NOT NULL,
  pinned         boolean     NOT NULL DEFAULT false,
  author_user_id uuid        NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_note_partner_id_fulfillment_partner_id_fk FOREIGN KEY (partner_id)
    REFERENCES public.fulfillment_partner (id) ON DELETE RESTRICT,
  CONSTRAINT partner_note_author_user_id_users_id_fk FOREIGN KEY (author_user_id)
    REFERENCES public.users (id) ON DELETE RESTRICT,
  CONSTRAINT partner_note_body_check CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000)
);

CREATE INDEX partner_note_partner_idx
  ON public.partner_note USING btree (partner_id, pinned DESC, created_at DESC);

CREATE TRIGGER partner_note_set_updated_at BEFORE UPDATE ON public.partner_note
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

/* ---------------------------------------------------------------------------
 * 3. partner_contact_log
 * ------------------------------------------------------------------------ */

CREATE TABLE public.partner_contact_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id        uuid        NOT NULL,
  occurred_at       timestamptz NOT NULL,
  channel           text        NOT NULL,
  direction         text        NOT NULL,
  topic             text        NOT NULL,
  summary           text        NOT NULL,
  follow_up_on      date        NULL,
  follow_up_done_at timestamptz NULL,
  author_user_id    uuid        NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_contact_log_partner_id_fulfillment_partner_id_fk FOREIGN KEY (partner_id)
    REFERENCES public.fulfillment_partner (id) ON DELETE RESTRICT,
  CONSTRAINT partner_contact_log_author_user_id_users_id_fk FOREIGN KEY (author_user_id)
    REFERENCES public.users (id) ON DELETE RESTRICT,
  CONSTRAINT partner_contact_log_channel_check
    CHECK (channel IN ('phone', 'email', 'whatsapp', 'video', 'in_person', 'other')),
  CONSTRAINT partner_contact_log_direction_check CHECK (direction IN ('inbound', 'outbound')),
  CONSTRAINT partner_contact_log_topic_check
    CHECK (topic IN ('onboarding', 'order_issue', 'payout', 'pricing', 'quality', 'other')),
  CONSTRAINT partner_contact_log_summary_check
    CHECK (char_length(btrim(summary)) BETWEEN 1 AND 1000),
  CONSTRAINT partner_contact_log_follow_up_check
    CHECK (follow_up_done_at IS NULL OR follow_up_on IS NOT NULL)
);

CREATE INDEX partner_contact_log_partner_idx
  ON public.partner_contact_log USING btree (partner_id, occurred_at DESC);
CREATE INDEX partner_contact_log_follow_up_idx
  ON public.partner_contact_log USING btree (follow_up_on)
  WHERE follow_up_on IS NOT NULL AND follow_up_done_at IS NULL;

CREATE TRIGGER partner_contact_log_set_updated_at BEFORE UPDATE ON public.partner_contact_log
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

/* ---------------------------------------------------------------------------
 * 4. fulfillment_partner: the contact person and the retention clock
 * ------------------------------------------------------------------------ */

ALTER TABLE public.fulfillment_partner ADD COLUMN contact_name text NULL;
ALTER TABLE public.fulfillment_partner
  ADD CONSTRAINT fulfillment_partner_contact_name_check
  CHECK (contact_name IS NULL OR char_length(btrim(contact_name)) BETWEEN 2 AND 120);
ALTER TABLE public.fulfillment_partner ADD COLUMN offboarded_at timestamptz NULL;

COMMENT ON COLUMN public.fulfillment_partner.offboarded_at IS
  'Spec 030b §5.1: when the florist became offboarded, set once by partner_offboarded_at and never cleared; the retention clock of partner_note and partner_contact_log.';

UPDATE public.fulfillment_partner SET offboarded_at = now() WHERE status = 'offboarded';

-- Set once: the first move to `offboarded` stamps it; afterwards nothing (a later move, a direct
-- write, a move back) changes it, and no other path can set it.
CREATE FUNCTION public.partner_offboarded_at() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF OLD.offboarded_at IS NOT NULL THEN
    NEW.offboarded_at := OLD.offboarded_at;
  ELSIF NEW.status = 'offboarded' AND OLD.status IS DISTINCT FROM 'offboarded' THEN
    NEW.offboarded_at := now();
  ELSE
    NEW.offboarded_at := OLD.offboarded_at;
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER partner_offboarded_at
  BEFORE UPDATE ON public.fulfillment_partner
  FOR EACH ROW EXECUTE FUNCTION public.partner_offboarded_at();

/* ---------------------------------------------------------------------------
 * 5. the audit trail: three more masked columns, the CRM tables audited
 * ------------------------------------------------------------------------ */

CREATE OR REPLACE FUNCTION public.audit_mask_columns(p_table text) RETURNS text[]
  LANGUAGE sql
  IMMUTABLE
  SET search_path = pg_catalog, public
AS $fn$
  SELECT CASE p_table
    WHEN 'fulfillment_partner' THEN
      ARRAY['legal_name', 'contact_email', 'contact_phone', 'contact_name']
    WHEN 'partner_application' THEN
      ARRAY['business_name', 'contact_name', 'contact_email', 'contact_phone', 'registration_number']
    WHEN 'review' THEN
      ARRAY['text', 'display_name']
    WHEN 'partner_note' THEN
      ARRAY['body']
    WHEN 'partner_contact_log' THEN
      ARRAY['summary']
    ELSE ARRAY[]::text[]
  END;
$fn$;

CREATE TRIGGER partner_note_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.partner_note
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('id');
CREATE TRIGGER partner_contact_log_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.partner_contact_log
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('id');

/* ---------------------------------------------------------------------------
 * 6. the finance views (read with the caller's RLS)
 * ------------------------------------------------------------------------ */

-- One row per order whose purchase has a captured payment. Facts only: every figure is computed
-- by spec 030b §5.2's tested TypeScript, never here.
CREATE VIEW public.finance_order_facts WITH (security_invoker = true) AS
  SELECT
    o.id AS order_id,
    public.order_reference(o.id) AS order_reference,
    o.mode,
    o.purchase_id,
    siblings.order_count AS purchase_order_count,
    siblings.total_minor AS purchase_orders_total_minor,
    pay.id AS payment_id,
    pay.provider,
    pay.captured_at,
    o.delivery_date,
    o.destination_country_id,
    dc.iso2 AS destination_iso2,
    o.status,
    o.supply_model,
    o.buyer_currency_code,
    o.buyer_total_minor,
    o.vat_breakdown,
    coalesce((SELECT sum((split ->> 'vatMinor')::bigint)
                FROM jsonb_array_elements(o.vat_breakdown) AS split), 0)::bigint AS vat_total_minor,
    acc.partner_id,
    acc.responded_at AS accepted_at,
    fixed.fixed_minor,
    fixed.fixed_currency_code,
    coalesce(lines.payout_lines, '[]'::jsonb) AS payout_lines,
    coalesce(adj.open_adjustments, 0) AS open_adjustments,
    coalesce(rf.succeeded_minor, 0)::bigint AS refunds_succeeded_minor,
    coalesce(rf.requested_minor, 0)::bigint AS refunds_requested_minor,
    coalesce(rf.pending_minor, 0)::bigint AS refunds_pending_minor
  FROM public."order" o
  JOIN LATERAL (
    SELECT p.id, p.provider, p.captured_at
    FROM public.payment p
    WHERE p.purchase_id = o.purchase_id AND p.captured_at IS NOT NULL
    ORDER BY p.captured_at
    LIMIT 1
  ) pay ON true
  JOIN public.country dc ON dc.id = o.destination_country_id
  JOIN LATERAL (
    SELECT count(*)::int AS order_count, sum(s.buyer_total_minor)::bigint AS total_minor
    FROM public."order" s WHERE s.purchase_id = o.purchase_id
  ) siblings ON true
  LEFT JOIN LATERAL (
    SELECT a.partner_id, a.responded_at
    FROM public.order_assignment a
    WHERE a.order_id = o.id AND a.response = 'accept' AND a.withdrawn_at IS NULL
    ORDER BY a.responded_at DESC
    LIMIT 1
  ) acc ON true
  LEFT JOIN LATERAL (
    SELECT sum(l.partner_payout_minor * l.qty)::bigint AS fixed_minor,
           min(l.payout_currency_code) AS fixed_currency_code
    FROM public.order_line l
    WHERE l.order_id = o.id AND l.partner_payout_minor IS NOT NULL
  ) fixed ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
             'kind', pl.kind,
             'amountMinor', pl.amount_minor::text,
             'currency', pl.currency_code,
             'payoutStatus', po.status,
             'paidAt', po.paid_at)
           ORDER BY pl.id) AS payout_lines
    FROM public.payout_line pl
    JOIN public.payout po ON po.id = pl.payout_id
    WHERE pl.order_id = o.id
  ) lines ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS open_adjustments
    FROM public.payout_adjustment pa
    WHERE pa.order_id = o.id AND pa.status = 'open'
  ) adj ON true
  LEFT JOIN LATERAL (
    SELECT sum(r.amount_minor) FILTER (WHERE r.status = 'succeeded') AS succeeded_minor,
           sum(r.amount_minor) FILTER (WHERE r.status = 'requested') AS requested_minor,
           sum(r.amount_minor) FILTER (WHERE r.status = 'pending') AS pending_minor
    FROM public.refund r
    WHERE r.order_id = o.id
  ) rf ON true
  -- Staff only, whatever the base tables' own policies grant a florist or a buyer (AC-4).
  WHERE o.mode IN ('live', 'test') AND app_is_staff();

-- Per florist and currency: what is open, closed, sent and paid, the open adjustments and the
-- earliest unpaid statement.
CREATE VIEW public.finance_partner_position WITH (security_invoker = true) AS
  SELECT
    po.partner_id,
    po.currency_code,
    coalesce(sum(po.total_minor) FILTER (WHERE po.status = 'draft' AND po.closed_at IS NULL), 0)::bigint
      AS draft_open_minor,
    coalesce(sum(po.total_minor) FILTER (WHERE po.status = 'draft' AND po.closed_at IS NOT NULL), 0)::bigint
      AS draft_closed_minor,
    coalesce(sum(po.total_minor) FILTER (WHERE po.status = 'statement_sent'), 0)::bigint
      AS statement_sent_minor,
    coalesce(sum(po.total_minor) FILTER (WHERE po.status = 'paid'), 0)::bigint AS paid_minor,
    (SELECT count(*)::int FROM public.payout_adjustment pa
      WHERE pa.partner_id = po.partner_id AND pa.status = 'open') AS open_adjustments,
    min(po.sent_at) FILTER (WHERE po.status = 'statement_sent') AS earliest_unpaid_statement_at
  FROM public.payout po
  -- Staff only: a florist reads its own payouts, never this position (AC-4).
  WHERE app_is_staff()
  GROUP BY po.partner_id, po.currency_code;

REVOKE ALL ON public.finance_order_facts FROM app_web;
REVOKE ALL ON public.finance_partner_position FROM app_web;
GRANT SELECT ON public.finance_order_facts TO app_web;
GRANT SELECT ON public.finance_partner_position TO app_web;

/* ---------------------------------------------------------------------------
 * 7. the date-range scan
 * ------------------------------------------------------------------------ */

CREATE INDEX payment_captured_at_idx ON public.payment USING btree (captured_at);

/* ---------------------------------------------------------------------------
 * 8. retention
 * ------------------------------------------------------------------------ */

INSERT INTO public.retention_policy (key, entity_table, basis, retention_days, action, legal_note) VALUES
  ('partner_note', 'partner_note',
   'Art. 6(1)(b) contract and Art. 6(1)(f) legitimate interest', 730, 'delete',
   'spec 030b §8, §13 Q11: the founder''s notes on a florist are deleted 24 months after the florist is offboarded (fulfillment_partner.offboarded_at); while active, until deleted by hand.'),
  ('partner_contact_log', 'partner_contact_log',
   'Art. 6(1)(b) contract and Art. 6(1)(f) legitimate interest', 730, 'delete',
   'spec 030b §8, §13 Q11: the contact log is deleted 24 months after the florist is offboarded (fulfillment_partner.offboarded_at).'),
  ('payment_balance_txn', 'payment_balance_txn',
   'Art. 6(1)(c) legal obligation (accounting records)', 3650, 'keep',
   'spec 030b §8, plan/07 §1.2: provider fee and settlement facts are kept 10 years with the payment records; no personal data.');

/* ---------------------------------------------------------------------------
 * 9. flag
 * ------------------------------------------------------------------------ */

INSERT INTO public.feature_flag (key, description, enabled_default) VALUES
  ('payments.balance_fetch', 'Fetches each payment''s fee, settled amount and FX from the provider''s balance transactions (spec 030b). Off: the fetch jobs wait and finance shows fees pending; nothing is lost.', true);

/* ---------------------------------------------------------------------------
 * 10. RLS: staff only
 * ------------------------------------------------------------------------ */

ALTER TABLE public.payment_balance_txn ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_balance_txn_staff ON public.payment_balance_txn FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());

ALTER TABLE public.partner_note ENABLE ROW LEVEL SECURITY;
CREATE POLICY partner_note_staff ON public.partner_note FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());

ALTER TABLE public.partner_contact_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY partner_contact_log_staff ON public.partner_contact_log FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());

RESET ROLE;
