-- 0043_risk_021: fraud pre-checks, the risk tables and spec 002 §14 A11
-- (spec 021 §5.1; AC-31, AC-33, AC-35; TASK-493).
--
-- Numbered 0043 (orchestrator, 2026-11-08): main ends at 0042 (TASK-491). Runs after spec 013's
-- `0017_payments_a7` (refund reasons) and the outbox and order tables it references.
--
--   A. Five tables of the new `risk` module: `risk_identity`, `risk_assessment`, `risk_review`,
--      `risk_blocklist`, `risk_pause`. **No email, card fingerprint, address or name column**:
--      an identity is a keyed hash (HMAC-SHA-256 under `RISK_HASH_KEY`, 32 bytes) stored as 64
--      lower-case hex characters. Spec 021 §5.1 writes `bytea`; spec 002 AC-22 bans `bytea` in
--      `public` (ADR-0015, `scripts/db-check-live.ts`), so the 32 bytes are hex text, checked by
--      the same `^[0-9a-f]{64}$` rule `basket_reminder.email_hmac` uses.
--   B. Spec 002 §14 A11 (b): `refund.reason` gains `risk_cancel` and `fraud_confirmed`.
--   C. A11 (c): retention rows (identity email and card 12 months, recipient address 90 days,
--      assessments and reviews 12 months, blocklist 12 months after the last match, pause 30
--      days). A11 (a), the two catalogue names, is registry data with no database object.
--   D. Flags `risk.gate` (on), `risk.strict` (off), `risk.pay_pause` (off).
--   E. RLS on all five, for the system role and admin sessions only: `risk_identity`,
--      `risk_assessment` and `risk_pause` are written by the system role and read by an admin
--      (`purchase`'s pair of policies); `risk_review` and `risk_blocklist`, the two tables admin
--      decides on, take the staff policy and carry spec 012's `audit_row_change()`. No customer,
--      partner or public policy (`db/rls.ts`).
--
-- Rollback: `0043_risk_021.down.sql`, which refuses with `A11_ROLLBACK_REASON_IN_USE` once any
-- refund carries `risk_cancel` or `fraud_confirmed`.

SET LOCAL ROLE app_owner;

/* ---------------------------------------------------------------------------
 * A. The five risk tables
 * ------------------------------------------------------------------------ */

CREATE TABLE public.risk_identity (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   uuid        NOT NULL,
  kind       text        NOT NULL,
  hash       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT risk_identity_order_id_kind_hash_key UNIQUE (order_id, kind, hash),
  CONSTRAINT risk_identity_order_id_order_id_fk FOREIGN KEY (order_id)
    REFERENCES public."order" (id) ON DELETE CASCADE,
  CONSTRAINT risk_identity_kind_check CHECK (kind IN ('email', 'card', 'recipient_address')),
  CONSTRAINT risk_identity_hash_check CHECK (hash ~ '^[0-9a-f]{64}$')
);

COMMENT ON TABLE public.risk_identity IS
  'Spec 021 §5.1 item 1: keyed hashes (HMAC-SHA-256 under RISK_HASH_KEY, hex) of an order''s normalised buyer email, card fingerprint and recipient address. No raw identifier is stored.';

CREATE INDEX risk_identity_kind_hash_created_at_idx
  ON public.risk_identity (kind, hash, created_at);

CREATE TABLE public.risk_assessment (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         uuid        NOT NULL,
  stage            text        NOT NULL,
  mode             text        NOT NULL,
  rules_version    integer     NOT NULL,
  score            smallint    NOT NULL,
  decision         text        NOT NULL,
  enforced         boolean     NOT NULL,
  signals          jsonb       NOT NULL,
  liability_shift  boolean     NULL,
  radar_risk_level text        NULL,
  radar_risk_score smallint    NULL,
  radar_outcome    text        NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT risk_assessment_order_id_order_id_fk FOREIGN KEY (order_id)
    REFERENCES public."order" (id) ON DELETE CASCADE,
  CONSTRAINT risk_assessment_stage_check CHECK (stage IN ('routing', 'post_routing')),
  CONSTRAINT risk_assessment_mode_check CHECK (mode IN ('test', 'live')),
  CONSTRAINT risk_assessment_rules_version_check CHECK (rules_version > 0),
  CONSTRAINT risk_assessment_score_check CHECK (score BETWEEN 0 AND 100),
  CONSTRAINT risk_assessment_decision_check CHECK (decision IN ('pass', 'hold', 'cancel')),
  CONSTRAINT risk_assessment_signals_check CHECK (jsonb_typeof(signals) = 'array'),
  CONSTRAINT risk_assessment_radar_risk_level_check CHECK (radar_risk_level ~ '^[a-z_]{1,32}$'),
  CONSTRAINT risk_assessment_radar_risk_score_check CHECK (radar_risk_score BETWEEN 0 AND 100),
  CONSTRAINT risk_assessment_radar_outcome_check CHECK (radar_outcome ~ '^[a-z_]{1,32}$')
);

COMMENT ON TABLE public.risk_assessment IS
  'Spec 021 §5.1 item 2: one scoring of an order. signals is RiskSignalsV1, an array of { id, points } with no values.';

CREATE INDEX risk_assessment_order_id_created_at_idx
  ON public.risk_assessment (order_id, created_at);

CREATE TABLE public.risk_review (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            uuid        NOT NULL,
  assessment_id       uuid        NOT NULL,
  kind                text        NOT NULL,
  status              text        NOT NULL,
  recommendation      text        NOT NULL,
  deadline_at         timestamptz NULL,
  due_soon_alerted_at timestamptz NULL,
  decided_at          timestamptz NULL,
  decided_by          text        NULL,
  decision_reason     text        NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT risk_review_order_id_order_id_fk FOREIGN KEY (order_id)
    REFERENCES public."order" (id) ON DELETE CASCADE,
  CONSTRAINT risk_review_assessment_id_risk_assessment_id_fk FOREIGN KEY (assessment_id)
    REFERENCES public.risk_assessment (id) ON DELETE CASCADE,
  CONSTRAINT risk_review_kind_check CHECK (kind IN ('pre_routing', 'post_routing')),
  CONSTRAINT risk_review_status_check CHECK (status IN (
    'open', 'approved', 'cancelled', 'auto_released', 'auto_cancelled', 'auto_refunded', 'superseded')),
  CONSTRAINT risk_review_recommendation_check CHECK (recommendation IN ('approve', 'cancel', 'refund')),
  CONSTRAINT risk_review_decided_by_check CHECK (decided_by ~ '^(system:[a-z][a-z0-9_.]*|admin:[0-9A-Za-z_-]{1,64})$'),
  CONSTRAINT risk_review_decision_reason_check CHECK (decision_reason IN (
    'looks_genuine', 'buyer_contacted', 'card_testing', 'stolen_card_suspected', 'blocklist_match',
    'efw', 'deadline_default', 'superseded', 'other')),
  CONSTRAINT risk_review_open_check CHECK ((status = 'open') = (decided_at IS NULL)),
  CONSTRAINT risk_review_deadline_check CHECK (deadline_at IS NOT NULL OR kind = 'post_routing')
);

COMMENT ON TABLE public.risk_review IS
  'Spec 021 §5.1 item 3: a held order waiting for a person, with its deadline and the decision.';

CREATE UNIQUE INDEX risk_review_order_id_open_key
  ON public.risk_review (order_id) WHERE status = 'open';
CREATE INDEX risk_review_status_deadline_at_idx
  ON public.risk_review (status, deadline_at);

CREATE TABLE public.risk_blocklist (
  kind            text        NOT NULL,
  hash            text        NOT NULL,
  source          text        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_matched_at timestamptz NULL,
  expires_at      timestamptz NOT NULL,
  CONSTRAINT risk_blocklist_pkey PRIMARY KEY (kind, hash),
  CONSTRAINT risk_blocklist_kind_check CHECK (kind IN ('email', 'card')),
  CONSTRAINT risk_blocklist_hash_check CHECK (hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT risk_blocklist_source_check CHECK (source IN ('dispute', 'admin', 'efw'))
);

COMMENT ON TABLE public.risk_blocklist IS
  'Spec 021 §5.1 item 4: keyed hashes of an email or card refused at the pay step and cancelled by the gate.';

CREATE TABLE public.risk_pause (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cause      text        NOT NULL,
  starts_at  timestamptz NOT NULL,
  ends_at    timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT risk_pause_cause_check CHECK (cause IN ('card_testing', 'admin')),
  CONSTRAINT risk_pause_window_check CHECK (ends_at > starts_at)
);

COMMENT ON TABLE public.risk_pause IS
  'Spec 021 §5.1 item 5: a window in which new payments are refused (card-testing burst or admin pause).';

CREATE INDEX risk_pause_ends_at_idx ON public.risk_pause (ends_at);

CREATE TRIGGER risk_review_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.risk_review
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('id');
CREATE TRIGGER risk_blocklist_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.risk_blocklist
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('kind', 'hash');

/* ---------------------------------------------------------------------------
 * B. Spec 002 §14 A11 (b): two refund reasons
 * ------------------------------------------------------------------------ */

ALTER TABLE public.refund DROP CONSTRAINT refund_reason_check;
ALTER TABLE public.refund ADD CONSTRAINT refund_reason_check CHECK (reason IN (
  'buyer_cancel', 'no_partner', 'authorisation_lapsing', 'redelivery_failed', 'addon_missing',
  'late_delivery', 'substitution_complaint', 'quality', 'goodwill', 'duplicate', 'other',
  'risk_cancel', 'fraud_confirmed'
));

/* ---------------------------------------------------------------------------
 * C. Retention (A11 (c)) and D. the flags
 * ------------------------------------------------------------------------ */

INSERT INTO public.retention_policy (key, entity_table, basis, retention_days, action, legal_note) VALUES
  ('risk_identity_email_card', 'risk_identity', 'Legitimate interest (Recital 47)', 365, 'delete',
   'Spec 021 §5.1 A11 (c), plan/07 §1.2 fraud row: email and card hashes deleted 12 months after created_at.'),
  ('risk_identity_recipient_address', 'risk_identity', 'Legitimate interest (Recital 47)', 90, 'delete',
   'Spec 021 §5.1 A11 (c), plan/07 §1.3: recipient-address hashes deleted 90 days after created_at, aligned with recipient contact data.'),
  ('risk_assessment', 'risk_assessment', 'Legitimate interest (Recital 47)', 365, 'delete',
   'Spec 021 §5.1 A11 (c): assessments deleted 12 months after created_at (their reviews go with them).'),
  ('risk_review', 'risk_review', 'Legitimate interest (Recital 47)', 365, 'delete',
   'Spec 021 §5.1 A11 (c): decided reviews deleted 12 months after created_at. An open review is never swept.'),
  ('risk_blocklist', 'risk_blocklist', 'Legitimate interest (Recital 47)', 365, 'delete',
   'Spec 021 §5.1 A11 (c): a blocklist entry deleted 12 months after last_matched_at, or after created_at when never matched.'),
  ('risk_pause', 'risk_pause', 'Legitimate interest (Recital 47)', 30, 'delete',
   'Spec 021 §5.1 A11 (c): a payment pause deleted 30 days after ends_at.');

INSERT INTO public.feature_flag (key, description, enabled_default) VALUES
  ('risk.gate', 'The fraud gate before routing acts on its decision (spec 021). Off is shadow mode: every order is assessed and recorded, never held or cancelled.', true),
  ('risk.strict', 'Stricter fraud thresholds (spec 021): hold at a score of 20 and every first order at or above the strict band.', false),
  ('risk.pay_pause', 'Refuse every new payment while on (spec 021). Nothing is charged; buyers read "Payments are not available right now".', false);

/* ---------------------------------------------------------------------------
 * E. RLS
 * ------------------------------------------------------------------------ */

ALTER TABLE public.risk_identity ENABLE ROW LEVEL SECURITY;
CREATE POLICY risk_identity_system ON public.risk_identity FOR ALL TO app_web
  USING (public.app_current_role() = 'system')
  WITH CHECK (public.app_current_role() = 'system');
CREATE POLICY risk_identity_admin ON public.risk_identity FOR SELECT TO app_web
  USING (public.app_current_role() = 'admin');

ALTER TABLE public.risk_assessment ENABLE ROW LEVEL SECURITY;
CREATE POLICY risk_assessment_system ON public.risk_assessment FOR ALL TO app_web
  USING (public.app_current_role() = 'system')
  WITH CHECK (public.app_current_role() = 'system');
CREATE POLICY risk_assessment_admin ON public.risk_assessment FOR SELECT TO app_web
  USING (public.app_current_role() = 'admin');

ALTER TABLE public.risk_review ENABLE ROW LEVEL SECURITY;
CREATE POLICY risk_review_staff ON public.risk_review FOR ALL TO app_web
  USING (app_is_staff())
  WITH CHECK (app_is_staff());

ALTER TABLE public.risk_blocklist ENABLE ROW LEVEL SECURITY;
CREATE POLICY risk_blocklist_staff ON public.risk_blocklist FOR ALL TO app_web
  USING (app_is_staff())
  WITH CHECK (app_is_staff());

ALTER TABLE public.risk_pause ENABLE ROW LEVEL SECURITY;
CREATE POLICY risk_pause_system ON public.risk_pause FOR ALL TO app_web
  USING (public.app_current_role() = 'system')
  WITH CHECK (public.app_current_role() = 'system');
CREATE POLICY risk_pause_admin ON public.risk_pause FOR SELECT TO app_web
  USING (public.app_current_role() = 'admin');

RESET ROLE;
