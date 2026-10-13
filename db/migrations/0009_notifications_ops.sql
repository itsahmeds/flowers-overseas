-- 0009_notifications_ops — the outbox, feature flags, the audit log, retention policy and the
-- database-usage probe's table (spec 002 §5.1 "`notifications`" and "platform / ops", §8, §12,
-- §13 Q7; spec 010 §5.1 A; `plan/07` §1.2; `plan/10` §4; `plan/12` §2; TASK-021).
--
-- Seven tables and their seed rows:
--
--   `outbox`, `outbox_attempt`   the only integration point of the order machine (`plan/11` §2):
--                                written by spec 010's engine in the transition's transaction,
--                                drained by spec 017;
--   `feature_flag`,              flags live in the database with a 60 s cache, **never in env**
--   `feature_flag_scope`         (`plan/12` §2 "Flags"); a country or partner go-live is a data
--                                flip in admin (CLAUDE.md), so these are seeded here;
--   `audit_log`                  the record of every admin data change, first the country and
--                                partner status flips of `plan/10` §4 (spec 012 writes it);
--   `retention_policy`           basis, period and legal note per flow of `plan/07` §1.2, so the
--                                privacy policy's retention table is generated from data and
--                                `retention.sweep` (TASK-025) applies the same rows;
--   `db_usage_sample`            one row per UTC day from `neon.usage_probe` (TASK-029).
--
-- Seeds (§12, spec 010 §5.1 A): `checkout.demo_guard` on; `checkout.open`, `payments.stripe`,
-- `payments.mollie`, `corridor.{iso2}` for the eight seeded countries and `locale.{code}` for the
-- four launch locales off; one `country` scope row for `checkout.open` in `PL`, **off** — spec 010
-- §12 turns it on in staging through admin, and production waits for spec 010 §13 Q1, so the
-- migration (which runs identically everywhere) seeds the switch, not the decision.
--
-- Retention rows carry `plan/07` §1.2's figures verbatim; §13 Q7 keeps the 10-year invoice and
-- 2-year photo figures flagged for the accountant (B1) and legal review (B4): the numbers may
-- move, the mechanism does not. `demo_order_personal` is 24 hours in production and 7 days on
-- staging and PR environments (spec 010 §5.1 A). A migration cannot tell the environments apart,
-- so the row carries the production figure (1 day) and the legal note states the staging/PR
-- figure for the sweep to apply there (TASK-025's carry-forward).
--
-- **Deviation from §5.1's text, declared:** `db_usage_sample` stores compute as
-- `compute_seconds_used` / `compute_seconds_cap bigint`, not `compute_hours_* numeric`. Every
-- migration is held to "no numeric, decimal, real, float or money column"
-- (`tests/unit/schema-i18n-geo.test.ts`), and seconds are the unit Neon's consumption API reports,
-- so the integer loses nothing; the probe (TASK-029) divides by 3600 for the 70 % / 90 % warning.
--
-- No policy (RLS is `0011`). Rollback: `0009_notifications_ops.down.sql`.

SET LOCAL ROLE app_owner;

/* ---------------------------------------------------------------------------
 * outbox, outbox_attempt
 * ------------------------------------------------------------------------ */

CREATE TABLE public.outbox (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        uuid        NOT NULL,
  order_id        uuid        NULL,
  targets         text[]      NOT NULL,
  payload         jsonb       NOT NULL,
  payload_version integer     NOT NULL,
  status          text        NOT NULL DEFAULT 'pending',
  available_at    timestamptz NOT NULL DEFAULT now(),
  attempts        integer     NOT NULL DEFAULT 0,
  last_error      text        NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outbox_event_id_key UNIQUE (event_id),
  CONSTRAINT outbox_order_id_order_id_fk FOREIGN KEY (order_id)
    REFERENCES public."order" (id) ON DELETE RESTRICT,
  CONSTRAINT outbox_targets_check CHECK (
    cardinality(targets) > 0 AND array_position(targets, NULL) IS NULL
  ),
  CONSTRAINT outbox_payload_check CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT outbox_payload_version_check CHECK (payload_version >= 1),
  CONSTRAINT outbox_status_check CHECK (status IN ('pending', 'sent', 'failed', 'dead')),
  CONSTRAINT outbox_attempts_check CHECK (attempts >= 0)
);

CREATE INDEX outbox_pending_idx
  ON public.outbox USING btree (available_at) WHERE status IN ('pending', 'failed');
CREATE INDEX outbox_order_id_idx ON public.outbox USING btree (order_id);

CREATE TABLE public.outbox_attempt (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id    uuid        NOT NULL,
  attempt      integer     NOT NULL,
  at           timestamptz NOT NULL DEFAULT now(),
  status       text        NOT NULL,
  error        text        NULL,
  provider_ref text        NULL,
  CONSTRAINT outbox_attempt_outbox_id_attempt_key UNIQUE (outbox_id, attempt),
  CONSTRAINT outbox_attempt_outbox_id_outbox_id_fk FOREIGN KEY (outbox_id)
    REFERENCES public.outbox (id) ON DELETE RESTRICT,
  CONSTRAINT outbox_attempt_attempt_check CHECK (attempt >= 1),
  CONSTRAINT outbox_attempt_status_check CHECK (status IN ('sent', 'failed')),
  CONSTRAINT outbox_attempt_error_check CHECK (status <> 'failed' OR error IS NOT NULL)
);

/* ---------------------------------------------------------------------------
 * feature_flag, feature_flag_scope
 * ------------------------------------------------------------------------ */

CREATE TABLE public.feature_flag (
  key             text PRIMARY KEY,
  description     text        NOT NULL,
  enabled_default boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feature_flag_key_check CHECK (key ~ '^[a-z][a-z_]*([.][a-z0-9_-]+)+$'),
  CONSTRAINT feature_flag_description_check CHECK (btrim(description) <> '')
);

CREATE TABLE public.feature_flag_scope (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key   text        NOT NULL,
  scope      text        NOT NULL,
  scope_ref  text        NOT NULL,
  enabled    boolean     NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feature_flag_scope_flag_key_scope_scope_ref_key UNIQUE (flag_key, scope, scope_ref),
  CONSTRAINT feature_flag_scope_flag_key_feature_flag_key_fk FOREIGN KEY (flag_key)
    REFERENCES public.feature_flag (key) ON DELETE RESTRICT,
  CONSTRAINT feature_flag_scope_scope_check CHECK (scope IN (
    'global', 'country', 'locale', 'payment_method', 'partner'
  )),
  CONSTRAINT feature_flag_scope_scope_ref_check CHECK (
    CASE scope
      WHEN 'global' THEN scope_ref = '*'
      WHEN 'country' THEN scope_ref ~ '^[A-Z]{2}$'
      WHEN 'locale' THEN scope_ref ~ '^[a-z]{2}(-[a-z]{2})?$'
      ELSE scope_ref ~ '^[a-z0-9][a-z0-9_-]*$'
    END
  )
);

INSERT INTO public.feature_flag (key, description, enabled_default) VALUES
  ('checkout.demo_guard', 'Every checkout is a demo: no card is charged and no florist is paid (spec 010). On until spec 013 merges and the founder decides.', true),
  ('checkout.open', 'Checkout is open for a destination country (country scope; spec 010 checkoutMode()).', false),
  ('payments.stripe', 'Stripe takes payments (ADR-0005; spec 013).', false),
  ('payments.mollie', 'Mollie takes payments, the fallback (ADR-0005).', false),
  ('corridor.de', 'Corridor to Germany is live.', false),
  ('corridor.es', 'Corridor to Spain is live.', false),
  ('corridor.fr', 'Corridor to France is live.', false),
  ('corridor.gb', 'Corridor to the United Kingdom is live.', false),
  ('corridor.it', 'Corridor to Italy is live.', false),
  ('corridor.nl', 'Corridor to the Netherlands is live.', false),
  ('corridor.pl', 'Corridor to Poland is live.', false),
  ('corridor.ro', 'Corridor to Romania is live.', false),
  ('locale.de', 'The de locale is published.', false),
  ('locale.en', 'The en locale is published.', false),
  ('locale.en-gb', 'The en-gb locale is published.', false),
  ('locale.pl', 'The pl locale is published.', false);

INSERT INTO public.feature_flag_scope (flag_key, scope, scope_ref, enabled) VALUES
  ('checkout.open', 'country', 'PL', false);

/* ---------------------------------------------------------------------------
 * audit_log — admin data changes, with before and after
 * ------------------------------------------------------------------------ */

-- `actor_user_id` gains its key to `users` in `0010` (ON DELETE SET NULL: the record outlives the
-- account, and `actor_label` keeps who it was).
CREATE TABLE public.audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid        NULL,
  actor_label   text        NOT NULL,
  action        text        NOT NULL,
  entity_table  text        NOT NULL,
  entity_id     text        NOT NULL,
  before        jsonb       NULL,
  after         jsonb       NULL,
  request_id    text        NOT NULL,
  at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_log_actor_label_check CHECK (btrim(actor_label) <> ''),
  CONSTRAINT audit_log_action_check CHECK (action ~ '^[a-z][a-z_]*([.][a-z_]+)*$'),
  CONSTRAINT audit_log_entity_table_check CHECK (entity_table ~ '^[a-z][a-z_]*$'),
  CONSTRAINT audit_log_change_check CHECK (before IS NOT NULL OR after IS NOT NULL)
);

CREATE INDEX audit_log_entity_idx ON public.audit_log USING btree (entity_table, entity_id, at);

-- Append-only, like order_event (review round 1, nit 4): a record of who changed what cannot be
-- edited or removed by the application it records. Pseudonymising personal data inside
-- `before`/`after` is a retention concern for TASK-025, through a migration-owned path.
--
-- One UPDATE passes: the one `0010`'s key `actor_user_id → users ON DELETE SET NULL` makes when
-- an actor's account is deleted (Auth.js `deleteUser`, an erasure). It sets `actor_user_id` from
-- a value to NULL, changes no other column, and the user it pointed at no longer exists. While
-- that key stands no other statement can produce that state, so a hand-written UPDATE is still
-- refused, and `actor_label` keeps who it was (review round 2, breaker HOLE 1). `users` arrives
-- in `0010`; before it does (and after its rollback) the branch is never planned.
CREATE FUNCTION public.audit_log_append_only() RETURNS trigger
  LANGUAGE plpgsql
AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.actor_user_id IS NOT NULL
       AND NEW.actor_user_id IS NULL
       AND (to_jsonb(NEW) - 'actor_user_id') = (to_jsonb(OLD) - 'actor_user_id')
       AND to_regclass('public.users') IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = OLD.actor_user_id) THEN
        RETURN NEW;
      END IF;
    END IF;
  END IF;
  RAISE EXCEPTION 'AUDIT_LOG_APPEND_ONLY: audit_log is append-only; % is refused', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$fn$;

CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_append_only();

CREATE TRIGGER audit_log_append_only_statement
  BEFORE TRUNCATE ON public.audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION public.audit_log_append_only();

REVOKE EXECUTE ON FUNCTION public.audit_log_append_only() FROM PUBLIC;

/* ---------------------------------------------------------------------------
 * retention_policy — plan/07 §1.2, verbatim
 * ------------------------------------------------------------------------ */

CREATE TABLE public.retention_policy (
  key            text PRIMARY KEY,
  entity_table   text        NOT NULL,
  basis          text        NOT NULL,
  retention_days integer     NULL,
  action         text        NOT NULL,
  legal_note     text        NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT retention_policy_key_check CHECK (key ~ '^[a-z][a-z_]*$'),
  CONSTRAINT retention_policy_entity_table_check CHECK (entity_table ~ '^[a-z][a-z_]*$'),
  CONSTRAINT retention_policy_retention_days_check CHECK (retention_days > 0),
  CONSTRAINT retention_policy_action_check CHECK (action IN ('delete', 'pseudonymise', 'keep')),
  CONSTRAINT retention_policy_period_check CHECK (action = 'keep' OR retention_days IS NOT NULL)
);

INSERT INTO public.retention_policy (key, entity_table, basis, retention_days, action, legal_note) VALUES
  ('recipient_contact', 'recipient', 'Art. 6(1)(f) legitimate interest', 90, 'pseudonymise',
   'plan/07 §1.2: Delete/pseudonymise recipient contact data 90 days after delivery unless the recipient created an account or a dispute is open; keep city-level data for analytics. Applies to recipient, recipient_address and order.recipient_snapshot.'),
  ('delivery_photo', 'delivery_proof', 'Contract + legitimate interest', 730, 'delete',
   'plan/07 §1.2: 2 years (chargeback window + margin); public gallery use only with recipient consent. Figure flagged for legal review (B4, spec 002 §13 Q7).'),
  ('buyer_personal', 'customer', 'Art. 6(1)(b) contract', 1095, 'pseudonymise',
   'plan/07 §1.2: personal fields pseudonymised after 3 years, invoice archive retained.'),
  ('invoice_archive', 'order', 'Legal obligation (EE/PL accounting law)', 3650, 'keep',
   'plan/07 §1.2: Order + 10 years for invoice records (EE/PL accounting law). Figure flagged for the accountant (B1, spec 002 §13 Q7).'),
  ('fraud_signals', 'webhook_inbox', 'Legitimate interest (Recital 47)', 365, 'delete',
   'plan/07 §1.2: Fraud signals (IP, device, velocity), 12 months. Applies to webhook_inbox.raw (spec 002 §8).'),
  ('consent_records', 'consent_log', 'Legal obligation (Art. 7(1))', 1825, 'delete',
   'plan/07 §1.2: Consent records, 5 years after withdrawal.'),
  ('checkout_draft', 'checkout_draft', 'Art. 6(1)(b) contract (steps prior to entering a contract)', 1, 'delete',
   'Spec 010 §5.1 A: a checkout draft is deleted 1 day after its last activity.'),
  ('demo_order_personal', 'order', 'Art. 6(1)(f) legitimate interest (demonstration)', 1, 'pseudonymise',
   'Spec 010 §5.1 A: personal data of orders with mode demo or test is pseudonymised 24 hours after placement in production, and 7 days after placement on staging and PR environments.');

/* ---------------------------------------------------------------------------
 * db_usage_sample — one row per UTC day (TASK-029's probe)
 * ------------------------------------------------------------------------ */

CREATE TABLE public.db_usage_sample (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at        timestamptz NOT NULL DEFAULT now(),
  period_start       date        NOT NULL,
  compute_seconds_used bigint   NOT NULL,
  compute_seconds_cap  bigint   NOT NULL,
  storage_bytes      bigint      NOT NULL,
  source             text        NOT NULL,
  CONSTRAINT db_usage_sample_compute_seconds_check CHECK (
    compute_seconds_used >= 0 AND compute_seconds_cap > 0
  ),
  CONSTRAINT db_usage_sample_storage_bytes_check CHECK (storage_bytes >= 0),
  CONSTRAINT db_usage_sample_source_check CHECK (source IN ('neon_api', 'manual'))
);

CREATE UNIQUE INDEX db_usage_sample_day_idx
  ON public.db_usage_sample USING btree (((captured_at AT TIME ZONE 'UTC')::date));

/* ---------------------------------------------------------------------------
 * updated_at (AC-10)
 * ------------------------------------------------------------------------ */

CREATE TRIGGER outbox_set_updated_at BEFORE UPDATE ON public.outbox
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER feature_flag_set_updated_at BEFORE UPDATE ON public.feature_flag
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER feature_flag_scope_set_updated_at BEFORE UPDATE ON public.feature_flag_scope
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER retention_policy_set_updated_at BEFORE UPDATE ON public.retention_policy
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

RESET ROLE;
