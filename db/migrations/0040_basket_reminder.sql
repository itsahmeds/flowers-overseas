-- 0040_basket_reminder: one consented reminder email for a basket left unfinished
-- (spec 034 §5.1; AC-8, AC-26, AC-27; TASK-449).
--
-- Numbered 0040 (orchestrator, 2026-11-08): main ends at 0039 (TASK-439). Runs after spec 010's
-- `0020_checkout_draft_lines` and `0019_purchase`, which it depends on.
--
--   A. `checkout_draft` gains the buyer's current choice (`reminder_consent_at` with the wording
--      version, both or neither), `restored_from_reminder_id` (a basket rebuilt from the email
--      link, for attribution) and two `pending_notice` values, `restored` and `restored_details`.
--   B. `basket_reminder`: one row per reminder of a draft (`sequence` 1; 2 is allowed so a second
--      reminder is an amendment, not a migration). **No email, name or money column**: the address
--      is read from the draft at send time, the proof is `email_hmac` (a keyed hash), the tokens
--      are stored as SHA-256 only, and recovered revenue is read from `purchase` by join.
--   C. `email_suppression`: a keyed hash of an address that stopped basket emails, bounced or
--      complained. An upsert keeps the strongest reason.
--   D. `consent_log` gains the `contact` subject: an address known only as `subject_hmac`
--      (`HMAC-SHA256(CONTACT_HMAC_SECRET, normalised email)`), so consent is provable for five
--      years without a readable address.
--   E. Retention: tokens and the hash cleared 60 days after the send (`pseudonymise`), reminder
--      rows deleted at 395 days, suppression deleted 5 years after `updated_at`. The existing
--      `consent_records` row (1 825 days) covers the `contact` rows. Flag
--      `marketing.basket_reminder`, global, default off.
--   F. RLS: `basket_reminder` is written by the system role and read by an admin session
--      (`purchase`'s pair of policies); `email_suppression` is the system role's only. No customer,
--      partner or public policy (`db/rls.ts`).
--
-- Rollback: `0040_basket_reminder.down.sql`, which refuses with
-- `BASKET_REMINDER_CONSENT_ROWS_EXIST` once any `contact` consent row exists.

SET LOCAL ROLE app_owner;

/* ---------------------------------------------------------------------------
 * B. basket_reminder (before A, which references it)
 * ------------------------------------------------------------------------ */

CREATE TABLE public.basket_reminder (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id                 uuid        NULL,
  sequence                 smallint    NOT NULL DEFAULT 1,
  locale_code              text        NOT NULL,
  status                   text        NOT NULL,
  skip_reason              text        NULL,
  scheduled_for            timestamptz NOT NULL,
  sent_at                  timestamptz NULL,
  line_count               smallint    NULL,
  email_hmac               text        NULL,
  restore_token_sha256     text        NULL,
  restore_expires_at       timestamptz NULL,
  unsubscribe_token_sha256 text        NULL,
  provider_message_id      text        NULL,
  delivery_status          text        NULL,
  restore_count            integer     NOT NULL DEFAULT 0,
  first_restored_at        timestamptz NULL,
  recovered_purchase_id    uuid        NULL,
  recovered_at             timestamptz NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT basket_reminder_draft_id_sequence_key UNIQUE (draft_id, sequence),
  CONSTRAINT basket_reminder_restore_token_sha256_key UNIQUE (restore_token_sha256),
  CONSTRAINT basket_reminder_unsubscribe_token_sha256_key UNIQUE (unsubscribe_token_sha256),
  CONSTRAINT basket_reminder_provider_message_id_key UNIQUE (provider_message_id),
  CONSTRAINT basket_reminder_recovered_purchase_id_key UNIQUE (recovered_purchase_id),
  CONSTRAINT basket_reminder_draft_id_checkout_draft_id_fk FOREIGN KEY (draft_id)
    REFERENCES public.checkout_draft (id) ON DELETE SET NULL,
  CONSTRAINT basket_reminder_locale_code_locale_code_fk FOREIGN KEY (locale_code)
    REFERENCES public.locale (code),
  CONSTRAINT basket_reminder_recovered_purchase_id_purchase_id_fk FOREIGN KEY (recovered_purchase_id)
    REFERENCES public.purchase (id),
  CONSTRAINT basket_reminder_sequence_check CHECK (sequence BETWEEN 1 AND 2),
  CONSTRAINT basket_reminder_status_check CHECK (status IN ('scheduled', 'sent', 'skipped', 'failed')),
  CONSTRAINT basket_reminder_skip_reason_check CHECK (skip_reason IN (
    'purchased', 'purchased_elsewhere', 'consent_withdrawn', 'suppressed', 'recent_reminder',
    'no_available_line', 'no_email', 'too_late', 'flag_off')),
  CONSTRAINT basket_reminder_line_count_check CHECK (line_count BETWEEN 1 AND 5),
  CONSTRAINT basket_reminder_email_hmac_check CHECK (email_hmac ~ '^[0-9a-f]{64}$'),
  CONSTRAINT basket_reminder_restore_token_sha256_check CHECK (restore_token_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT basket_reminder_unsubscribe_token_sha256_check CHECK (unsubscribe_token_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT basket_reminder_delivery_status_check CHECK (delivery_status IN (
    'sent', 'delivery_delayed', 'delivered', 'bounced', 'complained', 'failed')),
  CONSTRAINT basket_reminder_restore_count_check CHECK (restore_count >= 0),
  CONSTRAINT basket_reminder_skipped_check CHECK ((status = 'skipped') = (skip_reason IS NOT NULL)),
  CONSTRAINT basket_reminder_sent_check CHECK ((status = 'sent') = (sent_at IS NOT NULL)),
  CONSTRAINT basket_reminder_restore_pair_check CHECK ((restore_token_sha256 IS NULL) = (restore_expires_at IS NULL)),
  CONSTRAINT basket_reminder_recovered_pair_check CHECK ((recovered_purchase_id IS NULL) = (recovered_at IS NULL)),
  CONSTRAINT basket_reminder_recovered_sent_check CHECK (recovered_purchase_id IS NULL OR status = 'sent')
);

COMMENT ON TABLE public.basket_reminder IS
  'Spec 034 §5.1 B: one reminder of a checkout draft. No email, name or money column: the address is read from the draft at send time, the proof is a keyed hash, tokens are SHA-256 only, revenue is joined from purchase.';

CREATE INDEX basket_reminder_status_scheduled_for_idx
  ON public.basket_reminder (status, scheduled_for);
CREATE INDEX basket_reminder_email_hmac_sent_at_idx
  ON public.basket_reminder (email_hmac, sent_at);

CREATE TRIGGER basket_reminder_set_updated_at BEFORE UPDATE ON public.basket_reminder
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

/* ---------------------------------------------------------------------------
 * A. checkout_draft
 * ------------------------------------------------------------------------ */

ALTER TABLE public.checkout_draft
  ADD COLUMN reminder_consent_at       timestamptz NULL,
  ADD COLUMN reminder_consent_version  integer     NULL,
  ADD COLUMN restored_from_reminder_id uuid        NULL,
  ADD CONSTRAINT checkout_draft_reminder_consent_pair_check
    CHECK ((reminder_consent_at IS NULL) = (reminder_consent_version IS NULL)),
  ADD CONSTRAINT checkout_draft_restored_from_reminder_id_basket_reminder_id_fk
    FOREIGN KEY (restored_from_reminder_id) REFERENCES public.basket_reminder (id) ON DELETE SET NULL;

ALTER TABLE public.checkout_draft DROP CONSTRAINT checkout_draft_pending_notice_check;
ALTER TABLE public.checkout_draft ADD CONSTRAINT checkout_draft_pending_notice_check
  CHECK (pending_notice IN ('added', 'full', 'other_mode', 'other_currency', 'restored', 'restored_details'));

/* ---------------------------------------------------------------------------
 * C. email_suppression
 * ------------------------------------------------------------------------ */

CREATE TABLE public.email_suppression (
  email_hmac text        NOT NULL,
  scope      text        NOT NULL,
  reason     text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_suppression_pkey PRIMARY KEY (email_hmac, scope),
  CONSTRAINT email_suppression_email_hmac_check CHECK (email_hmac ~ '^[0-9a-f]{64}$'),
  CONSTRAINT email_suppression_scope_check CHECK (scope IN ('basket_reminder')),
  CONSTRAINT email_suppression_reason_check CHECK (reason IN ('unsubscribed', 'bounced', 'complained'))
);

COMMENT ON TABLE public.email_suppression IS
  'Spec 034 §5.1 C: an address (as contactHmac) that stopped basket emails, bounced or complained. An upsert keeps the strongest reason (complained > bounced > unsubscribed).';

CREATE TRIGGER email_suppression_set_updated_at BEFORE UPDATE ON public.email_suppression
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

/* ---------------------------------------------------------------------------
 * D. consent_log: the `contact` subject
 * ------------------------------------------------------------------------ */

ALTER TABLE public.consent_log ADD COLUMN subject_hmac text NULL;
CREATE INDEX consent_log_subject_hmac_idx ON public.consent_log (subject_hmac);

ALTER TABLE public.consent_log DROP CONSTRAINT consent_log_subject_kind_check;
ALTER TABLE public.consent_log ADD CONSTRAINT consent_log_subject_kind_check
  CHECK (subject_kind IN ('visitor', 'customer', 'recipient', 'contact'));

ALTER TABLE public.consent_log DROP CONSTRAINT consent_log_subject_check;
ALTER TABLE public.consent_log ADD CONSTRAINT consent_log_subject_check CHECK (
  CASE subject_kind
    WHEN 'visitor' THEN anonymous_id IS NOT NULL AND subject_ref IS NULL AND subject_hmac IS NULL
    WHEN 'contact' THEN subject_hmac IS NOT NULL AND subject_hmac ~ '^[0-9a-f]{64}$'
                        AND subject_ref IS NULL AND anonymous_id IS NULL
    ELSE subject_ref IS NOT NULL AND subject_hmac IS NULL
  END
);

/* ---------------------------------------------------------------------------
 * E. retention and the flag
 * ------------------------------------------------------------------------ */

INSERT INTO public.retention_policy (key, entity_table, basis, retention_days, action, legal_note) VALUES
  ('basket_reminder_tokens', 'basket_reminder', 'Art. 6(1)(a) consent', 60, 'pseudonymise',
   'Spec 034 §5.1 E: the restore and unsubscribe token hashes, restore_expires_at and email_hmac are cleared 60 days after sent_at (after created_at when never sent), well past the 30 days mailbox providers expect unsubscribe and bounce handling to work.'),
  ('basket_reminder', 'basket_reminder', 'Art. 6(1)(a) consent', 395, 'delete',
   'Spec 034 §5.1 E: a reminder row is deleted 395 days after created_at (a year of metrics plus a month). The purchase is never touched.'),
  ('email_suppression', 'email_suppression', 'Legal obligation (Art. 21(3) objection honoured)', 1825, 'delete',
   'Spec 034 §5.1 E: a suppression is deleted 5 years after updated_at, matching the consent proof.');

INSERT INTO public.feature_flag (key, description, enabled_default) VALUES
  ('marketing.basket_reminder', 'One basket reminder email, only to buyers who ticked the box on checkout step 3 (spec 034). Off: the box is hidden and nothing is scheduled or sent; restore and unsubscribe links keep working.', false);

/* ---------------------------------------------------------------------------
 * F. RLS
 * ------------------------------------------------------------------------ */

ALTER TABLE public.basket_reminder ENABLE ROW LEVEL SECURITY;

CREATE POLICY basket_reminder_system ON public.basket_reminder FOR ALL TO app_web
  USING (public.app_current_role() = 'system')
  WITH CHECK (public.app_current_role() = 'system');

CREATE POLICY basket_reminder_admin ON public.basket_reminder FOR SELECT TO app_web
  USING (public.app_current_role() = 'admin');

ALTER TABLE public.email_suppression ENABLE ROW LEVEL SECURITY;

CREATE POLICY email_suppression_system ON public.email_suppression FOR ALL TO app_web
  USING (public.app_current_role() = 'system')
  WITH CHECK (public.app_current_role() = 'system');

RESET ROLE;
