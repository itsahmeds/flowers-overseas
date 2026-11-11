-- 0047_buyer_account: the buyer account's details, preferences, saved recipients and occasion
-- reminders (spec 018 §14 A-founder-2026-10-22 C.7.2, C.7.3, C.7.4, C.11; AC-53, AC-54, AC-55,
-- AC-56 table half; TASK-352).
--
-- Numbered 0047 by the orchestrator (2026-11-11): 0045 and 0046 are held for other builders. It
-- follows this spec's first migration (`0021_post_purchase`, TASK-337) and precedes
-- `NNNN_privacy_requests` (TASK-345).
--
--   A. `customer` gains four of C.11's five columns: `preferred_locale` and `preferred_currency`
--      (the buyer's own choices, C.7.2), `reminder_consent` and `reminder_unsubscribe_token`
--      (C.7.4, written by TASK-353's consent flow only). The fifth, `last_signed_in_at`, shipped in
--      `0036_buyer_sign_in` (TASK-344) and is neither added nor dropped here. The buyer's own
--      update guard (`0011`) also pins the two reminder columns and `last_signed_in_at`, so a
--      buyer session changes name, phone, country and the two preferences, and nothing else.
--   B. `saved_recipient`: a copy of an order's recipient the buyer chose to keep (C.7.3). Exactly
--      full name, phone, address lines, postcode, city, country and `last_used_at`: **no card
--      message, delivery note, place kind or email** (`plan/07` §1.3; `db:check`'s recipient-email
--      rule covers this table). At most 20 per customer (`SAVED_RECIPIENT_LIMIT`, a constraint
--      trigger serialised per customer).
--   C. `occasion_reminder`: an occasion, a day and a month (no year, so no age), a lead time and
--      an optional saved recipient (C.7.4). No free text. At most 50 per customer
--      (`OCCASION_REMINDER_LIMIT`). TASK-353 writes and sends them.
--   D. RLS: both tables customer-scoped through `customer.user_id = app.user_id`
--      (`app_customer_owns`), plus the staff policy; `app.role = 'public'` reads nothing.
--   E. Retention: `saved_recipient` (730 days after `last_used_at`, delete; the sweep step is
--      `retention.sweep`'s), `occasion_reminder` (keep until withdrawal, removal or erasure),
--      `buyer_account_inactive` (730 days, pseudonymise; its sweep step is TASK-345's).
--   F. Flags `account.recipients` and `account.reminders`, global, default off.
--
-- Rollback: `0047_buyer_account.down.sql`, which refuses with `BUYER_ACCOUNT_DATA_EXISTS` once a
-- buyer has saved a recipient, a reminder, a preference or a reminder consent (C.11: from then
-- on, a forward fix).

SET LOCAL ROLE app_owner;

/* ---------------------------------------------------------------------------
 * A. customer
 * ------------------------------------------------------------------------ */

ALTER TABLE public.customer ADD COLUMN preferred_locale text NULL;
ALTER TABLE public.customer ADD COLUMN preferred_currency text NULL;
ALTER TABLE public.customer ADD COLUMN reminder_consent boolean NOT NULL DEFAULT false;
ALTER TABLE public.customer ADD COLUMN reminder_unsubscribe_token text NULL;
ALTER TABLE public.customer
  ADD CONSTRAINT customer_preferred_locale_locale_code_fk FOREIGN KEY (preferred_locale)
    REFERENCES public.locale (code) ON DELETE RESTRICT;
ALTER TABLE public.customer
  ADD CONSTRAINT customer_preferred_currency_currency_code_fk FOREIGN KEY (preferred_currency)
    REFERENCES public.currency (code) ON DELETE RESTRICT;
ALTER TABLE public.customer
  ADD CONSTRAINT customer_reminder_unsubscribe_token_key UNIQUE (reminder_unsubscribe_token);
ALTER TABLE public.customer
  ADD CONSTRAINT customer_reminder_unsubscribe_token_check
    CHECK (reminder_unsubscribe_token ~ '^[A-Za-z0-9_-]{22}$');

COMMENT ON COLUMN public.customer.preferred_locale IS
  'spec 018 C.7.2: the language of emails no order carries; never redirects or changes a URL.';
COMMENT ON COLUMN public.customer.preferred_currency IS
  'spec 018 C.7.2: the buyer''s currency; saving it writes fo_currency on that no-store response.';
COMMENT ON COLUMN public.customer.reminder_consent IS
  'spec 018 C.7.4: explicit consent to occasion reminders, independent of marketing_consent.';
COMMENT ON COLUMN public.customer.reminder_unsubscribe_token IS
  'spec 018 C.11: 16 CSPRNG bytes, base64url, set at first consent; rotates when consent is given again.';

CREATE OR REPLACE FUNCTION public.customer_self_update_guard() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF app_current_role() = 'customer' AND (
    NEW.id, NEW.email_normalised, NEW.marketing_consent, NEW.redacted, NEW.redacted_at,
    NEW.created_at, NEW.reminder_consent, NEW.reminder_unsubscribe_token, NEW.last_signed_in_at
  ) IS DISTINCT FROM (
    OLD.id, OLD.email_normalised, OLD.marketing_consent, OLD.redacted, OLD.redacted_at,
    OLD.created_at, OLD.reminder_consent, OLD.reminder_unsubscribe_token, OLD.last_signed_in_at
  ) THEN
    RAISE EXCEPTION 'CUSTOMER_COLUMN_READ_ONLY: a buyer edits only name, phone, country and preferences here'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$fn$;

/* ---------------------------------------------------------------------------
 * B. saved_recipient
 * ------------------------------------------------------------------------ */

CREATE TABLE public.saved_recipient (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  uuid        NOT NULL,
  full_name    text        NOT NULL,
  phone_e164   text        NOT NULL,
  lines        text[]      NOT NULL,
  postal_code  text        NULL,
  city         text        NOT NULL,
  country_id   uuid        NOT NULL,
  last_used_at timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saved_recipient_customer_id_customer_id_fk FOREIGN KEY (customer_id)
    REFERENCES public.customer (id) ON DELETE CASCADE,
  CONSTRAINT saved_recipient_country_id_country_id_fk FOREIGN KEY (country_id)
    REFERENCES public.country (id),
  CONSTRAINT saved_recipient_full_name_check CHECK (btrim(full_name) <> ''),
  CONSTRAINT saved_recipient_phone_e164_check CHECK (phone_e164 ~ '^\+[1-9][0-9]{1,14}$'),
  CONSTRAINT saved_recipient_lines_check
    CHECK (cardinality(lines) BETWEEN 1 AND 4 AND array_position(lines, NULL) IS NULL),
  CONSTRAINT saved_recipient_city_check CHECK (btrim(city) <> '')
);

COMMENT ON TABLE public.saved_recipient IS
  'Spec 018 C.7.3: a recipient the buyer chose to keep. No card message, delivery note, place kind or email (plan/07 §1.3). At most 20 per customer; deleted 730 days after last_used_at.';

CREATE INDEX saved_recipient_customer_id_idx ON public.saved_recipient (customer_id);
CREATE INDEX saved_recipient_phone_e164_idx ON public.saved_recipient (phone_e164);

CREATE TRIGGER saved_recipient_set_updated_at BEFORE UPDATE ON public.saved_recipient
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- At most 20 per customer. SECURITY DEFINER so the count is every row of the customer whatever
-- the caller's own view; the advisory lock serialises two saves of one customer, so the second
-- counts the first.
CREATE FUNCTION public.saved_recipient_limit() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $fn$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('saved_recipient:' || NEW.customer_id::text, 0));
  IF (SELECT count(*) FROM public.saved_recipient WHERE customer_id = NEW.customer_id) > 20 THEN
    RAISE EXCEPTION 'SAVED_RECIPIENT_LIMIT: at most 20 saved recipients per customer'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$fn$;

CREATE CONSTRAINT TRIGGER saved_recipient_limit
  AFTER INSERT OR UPDATE OF customer_id ON public.saved_recipient
  FOR EACH ROW EXECUTE FUNCTION public.saved_recipient_limit();

/* ---------------------------------------------------------------------------
 * C. occasion_reminder
 * ------------------------------------------------------------------------ */

CREATE TABLE public.occasion_reminder (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id        uuid        NOT NULL,
  saved_recipient_id uuid        NULL,
  occasion_key       text        NOT NULL,
  day                smallint    NOT NULL,
  month              smallint    NOT NULL,
  lead_days          smallint    NOT NULL,
  last_sent_for      date        NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT occasion_reminder_customer_id_customer_id_fk FOREIGN KEY (customer_id)
    REFERENCES public.customer (id) ON DELETE CASCADE,
  CONSTRAINT occasion_reminder_saved_recipient_id_saved_recipient_id_fk
    FOREIGN KEY (saved_recipient_id) REFERENCES public.saved_recipient (id) ON DELETE SET NULL,
  CONSTRAINT occasion_reminder_occasion_key_check
    CHECK (occasion_key IN ('birthday', 'anniversary', 'name_day', 'other')),
  CONSTRAINT occasion_reminder_lead_days_check CHECK (lead_days IN (3, 7, 14)),
  -- A real calendar day; 29 February is allowed (it fires for 28 February in a common year).
  CONSTRAINT occasion_reminder_calendar_check CHECK (
    month BETWEEN 1 AND 12 AND day >= 1 AND day <= CASE
      WHEN month = 2 THEN 29
      WHEN month IN (4, 6, 9, 11) THEN 30
      ELSE 31
    END
  )
);

COMMENT ON TABLE public.occasion_reminder IS
  'Spec 018 C.7.4: an occasion, day and month (no year), a lead time and an optional saved recipient. No free text. At most 50 per customer.';

CREATE INDEX occasion_reminder_customer_id_idx ON public.occasion_reminder (customer_id);
CREATE INDEX occasion_reminder_month_day_idx ON public.occasion_reminder (month, day);

CREATE TRIGGER occasion_reminder_set_updated_at BEFORE UPDATE ON public.occasion_reminder
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE FUNCTION public.occasion_reminder_limit() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $fn$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('occasion_reminder:' || NEW.customer_id::text, 0));
  IF (SELECT count(*) FROM public.occasion_reminder WHERE customer_id = NEW.customer_id) > 50 THEN
    RAISE EXCEPTION 'OCCASION_REMINDER_LIMIT: at most 50 reminders per customer'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$fn$;

CREATE CONSTRAINT TRIGGER occasion_reminder_limit
  AFTER INSERT OR UPDATE OF customer_id ON public.occasion_reminder
  FOR EACH ROW EXECUTE FUNCTION public.occasion_reminder_limit();

/* ---------------------------------------------------------------------------
 * D. RLS
 * ------------------------------------------------------------------------ */

ALTER TABLE public.saved_recipient ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.occasion_reminder ENABLE ROW LEVEL SECURITY;

CREATE POLICY saved_recipient_staff ON public.saved_recipient FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY saved_recipient_customer ON public.saved_recipient FOR ALL TO app_web
  USING (app_customer_owns(customer_id)) WITH CHECK (app_customer_owns(customer_id));
CREATE POLICY occasion_reminder_staff ON public.occasion_reminder FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY occasion_reminder_customer ON public.occasion_reminder FOR ALL TO app_web
  USING (app_customer_owns(customer_id)) WITH CHECK (app_customer_owns(customer_id));

/* ---------------------------------------------------------------------------
 * E. Retention
 * ------------------------------------------------------------------------ */

INSERT INTO public.retention_policy (key, entity_table, basis, retention_days, action, legal_note) VALUES
  ('saved_recipient', 'saved_recipient', 'Art. 6(1)(f) legitimate interest (LIA: docs/compliance/lia-saved-recipients.md)', 730, 'delete',
   'Spec 018 C.7.3: a saved recipient is deleted 730 days after last_used_at, or when the buyer removes it, or at account erasure or closure. The order''s own recipient keeps the 90-day sweep.'),
  ('occasion_reminder', 'occasion_reminder', 'Art. 6(1)(a) consent', NULL, 'keep',
   'Spec 018 C.7.4: kept until the buyer withdraws consent or removes it, or the account is erased.'),
  ('buyer_account_inactive', 'customer', 'Art. 6(1)(b) contract', 730, 'pseudonymise',
   'Spec 018 C.9: an account whose last sign-in and latest order are both more than 730 days old, with reminder consent off, is closed with erasure semantics (TASK-345).');

/* ---------------------------------------------------------------------------
 * F. Flags
 * ------------------------------------------------------------------------ */

INSERT INTO public.feature_flag (key, description, enabled_default) VALUES
  ('account.recipients', 'Saved recipients in the account (spec 018 C.7.3): the save box on an order and the recipients page. Off in production until the founder signs docs/compliance/lia-saved-recipients.md.', false),
  ('account.reminders', 'Occasion reminders in the account (spec 018 C.7.4): the reminders page and the daily email. Off until the founder approves the email and the consent line.', false);

RESET ROLE;
