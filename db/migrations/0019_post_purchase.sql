-- 0019_post_purchase — the data spec 018's launch slice stands on (spec 018 §5.1 `NNNN_post_purchase`,
-- §12 task 1; AC-2, AC-16 trigger half, AC-27 schema half; TASK-337), carrying spec 002 §14 A8 for
-- specs 016 and 018 (A8.1 rows 37 and 38, A8.2 `sessions.created_at`, A8.3).
--
-- Runs after `0013_order_engine_columns` (spec 010's `order_reference(uuid)` and
-- `order_reference_idx`, which this file reads and never creates) and `0017_payments_a7` (spec 013,
-- TASK-254: `refund.succeeded_at`, `payment.captured_at`). Migrations `0007` to `0017` stay exactly
-- as merged: this file only ALTERs their tables and adds its own.
--
--   1. `"order"`: `tracking_token_version smallint NOT NULL DEFAULT 1` (a rotation bumps it, so
--      every token signed for the old version stops verifying). `public_token` gets a column
--      default of 16 CSPRNG bytes as base64url (22 characters) and the exact check
--      `^[A-Za-z0-9_-]{22}$` (it was `{22,}`); rows that do not match are backfilled first. So
--      spec 010's `place` names no `public_token` at all (AC-2).
--      **Declared deviation from §5.1's text:** §5.1 writes the default with pgcrypto's
--      `gen_random_bytes(16)`. Spec 002 AC-7 forbids every extension (`pg_extension` holds only
--      `plpgsql`), so the 16 bytes are the first half of a SHA-256 over two `gen_random_uuid()`
--      values instead: both are core, both draw from `pg_strong_random()` (the same CSPRNG
--      pgcrypto uses), the input carries 244 random bits and the output keeps 128. Same length,
--      alphabet and strength as the spec's expression.
--   2. `fulfillment_partner.display_first_name` (the name the buyer sees once the order is being
--      made; null means "Made by our florist in {city}").
--   3. `tax_registration`, `invoice_series`, `invoice_profile`, `invoice`, staff only except the
--      buyer's own invoices (`invoice_customer`, through `app_customer_owns_order`). The two
--      launch series (`FO-PL` and `FOK-PL`, 2026) are seeded here, because a series row is
--      numbering state the seed must never touch; the profiles reference the seeded `currency`
--      table, so they are seeded by `pnpm db:seed` (`seed/plan.ts`), not here.
--   4. `invoice_immutable()`: `UPDATE` of an invoice raises `INVOICE_IMMUTABLE` unless it is the
--      one-time `NULL → value` write of all three render columns with every other column
--      unchanged; `DELETE` and `TRUNCATE` raise (AC-16, the pattern of `0008`'s `order_event`).
--   5. Flags `account.open` (global, off) and `invoice.issue` (off, one `country` row for `PL`,
--      off). **Declared deviation:** §5.1 names the first flag `account`; `0009`'s
--      `feature_flag_key_check` requires a dotted key, so it is `account.open`, after
--      `checkout.open`.
--   6. Spec 002 §14 A8: `sessions.created_at` and the two `order_transition` rows into
--      `no_partner_available` from `authorised` and `paid_unrouted` (`{system}`), 73 → 75 rows.
--
-- No `recipient` column, retention row, route or consent purpose for an address book (spec 018
-- §13 Q6, AC-27).
--
-- Rollback: `0019_post_purchase.down.sql`, which refuses while an invoice exists
-- (`POST_PURCHASE_ROLLBACK_INVOICES_EXIST`: issued invoices are legal records, §12) or while an
-- order event records an A8 transition (`A8_ROLLBACK_ROWS_IN_USE`).

SET LOCAL ROLE app_owner;

/* ---------------------------------------------------------------------------
 * 1. "order": tracking token version, public_token default and exact check
 * ------------------------------------------------------------------------ */

ALTER TABLE public."order" ADD COLUMN tracking_token_version smallint NOT NULL DEFAULT 1;
ALTER TABLE public."order" ADD CONSTRAINT order_tracking_token_version_check CHECK (tracking_token_version >= 1);

-- Backfill first: a row whose token is not exactly 22 characters gets a fresh one.
UPDATE public."order"
SET public_token = translate(rtrim(encode(substring(
      sha256(uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid())) FROM 1 FOR 16),
      'base64'), '='), '+/', '-_')
WHERE public_token !~ '^[A-Za-z0-9_-]{22}$';

ALTER TABLE public."order" DROP CONSTRAINT order_public_token_check;
ALTER TABLE public."order" ADD CONSTRAINT order_public_token_check CHECK (public_token ~ '^[A-Za-z0-9_-]{22}$');
ALTER TABLE public."order" ALTER COLUMN public_token SET DEFAULT translate(rtrim(encode(substring(
      sha256(uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid())) FROM 1 FOR 16),
      'base64'), '='), '+/', '-_');

/* ---------------------------------------------------------------------------
 * 2. fulfillment_partner.display_first_name
 * ------------------------------------------------------------------------ */

ALTER TABLE public.fulfillment_partner ADD COLUMN display_first_name text NULL;
ALTER TABLE public.fulfillment_partner ADD CONSTRAINT fulfillment_partner_display_first_name_check CHECK (
  display_first_name IS NULL OR btrim(display_first_name) <> ''
);

/* ---------------------------------------------------------------------------
 * 3. tax_registration, invoice_series, invoice_profile, invoice
 * ------------------------------------------------------------------------ */

CREATE TABLE public.tax_registration (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_iso2 text        NOT NULL,
  vat_id       text        NOT NULL,
  valid_from   date        NOT NULL,
  valid_to     date        NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tax_registration_country_iso2_valid_from_key UNIQUE (country_iso2, valid_from),
  CONSTRAINT tax_registration_country_iso2_check CHECK (country_iso2 ~ '^[A-Z]{2}$'),
  CONSTRAINT tax_registration_vat_id_check CHECK (btrim(vat_id) <> ''),
  CONSTRAINT tax_registration_valid_to_check CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE TRIGGER tax_registration_set_updated_at BEFORE UPDATE ON public.tax_registration
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.invoice_series (
  key         text PRIMARY KEY,
  prefix      text        NOT NULL,
  year        smallint    NOT NULL,
  next_number integer     NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_series_prefix_year_key UNIQUE (prefix, year),
  CONSTRAINT invoice_series_key_check CHECK (key ~ '^[a-z0-9][a-z0-9-]*$'),
  CONSTRAINT invoice_series_prefix_check CHECK (prefix ~ '^[A-Z][A-Z0-9-]*$'),
  CONSTRAINT invoice_series_year_check CHECK (year BETWEEN 2000 AND 9999),
  CONSTRAINT invoice_series_next_number_check CHECK (next_number >= 1)
);

CREATE TRIGGER invoice_series_set_updated_at BEFORE UPDATE ON public.invoice_series
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- §13 Q4: `FO-PL/2026/000001`, credit notes `FOK-PL/2026/000001`. The accountant's answer is a
-- data change (spec 018 §8); `next_number` is never seeded again.
INSERT INTO public.invoice_series (key, prefix, year) VALUES
  ('fo-pl-2026', 'FO-PL', 2026),
  ('fok-pl-2026', 'FOK-PL', 2026);

CREATE TABLE public.invoice_profile (
  key                    text PRIMARY KEY,
  supply_model           text        NOT NULL,
  destination_iso2       text        NOT NULL,
  document_kind          text        NOT NULL,
  title_key              text        NOT NULL,
  issuer_statement_key   text        NULL,
  label_locales          text[]      NOT NULL,
  vat_bearing_line_kinds text[]      NOT NULL,
  series_key             text        NOT NULL,
  credit_series_key      text        NOT NULL,
  vat_currency_code      text        NULL,
  vat_rate_source        text        NULL,
  active                 boolean     NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_profile_series_key_invoice_series_key_fk FOREIGN KEY (series_key)
    REFERENCES public.invoice_series (key) ON DELETE RESTRICT,
  CONSTRAINT invoice_profile_credit_series_key_invoice_series_key_fk FOREIGN KEY (credit_series_key)
    REFERENCES public.invoice_series (key) ON DELETE RESTRICT,
  CONSTRAINT invoice_profile_vat_currency_code_currency_code_fk FOREIGN KEY (vat_currency_code)
    REFERENCES public.currency (code) ON DELETE RESTRICT,
  CONSTRAINT invoice_profile_key_check CHECK (key ~ '^[a-z0-9][a-z0-9-]*$'),
  CONSTRAINT invoice_profile_supply_model_check CHECK (supply_model IN ('principal', 'agent')),
  CONSTRAINT invoice_profile_destination_iso2_check CHECK (destination_iso2 ~ '^[A-Z]{2}$'),
  CONSTRAINT invoice_profile_document_kind_check CHECK (
    document_kind IN ('vat_invoice', 'receipt_on_behalf')
  ),
  CONSTRAINT invoice_profile_title_key_check CHECK (btrim(title_key) <> ''),
  CONSTRAINT invoice_profile_issuer_statement_key_check CHECK (
    issuer_statement_key IS NULL OR btrim(issuer_statement_key) <> ''
  ),
  CONSTRAINT invoice_profile_label_locales_check CHECK (cardinality(label_locales) >= 1),
  CONSTRAINT invoice_profile_vat_bearing_line_kinds_check CHECK (
    vat_bearing_line_kinds <@ ARRAY['product', 'addon', 'surcharge']::text[]
  ),
  CONSTRAINT invoice_profile_vat_rate_source_check CHECK (
    vat_rate_source IN ('nbp_previous_business_day')
  ),
  -- A second VAT currency needs its rate source, and a rate source needs a currency.
  CONSTRAINT invoice_profile_vat_currency_check CHECK (
    (vat_currency_code IS NULL) = (vat_rate_source IS NULL)
  )
);

CREATE UNIQUE INDEX invoice_profile_active_idx
  ON public.invoice_profile USING btree (supply_model, destination_iso2) WHERE active;

CREATE TRIGGER invoice_profile_set_updated_at BEFORE UPDATE ON public.invoice_profile
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- An invoice is in its order's currency: the key `(order_id, currency_code)` refers to
-- `"order" (id, buyer_currency_code)`, as `payment`'s does (spec 002 §2 money pair).
CREATE TABLE public.invoice (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind                text        NOT NULL,
  order_id            uuid        NOT NULL,
  refund_id           uuid        NULL,
  corrects_invoice_id uuid        NULL,
  series_key          text        NOT NULL,
  number              text        NOT NULL,
  issued_at           timestamptz NOT NULL,
  supply_date         date        NOT NULL,
  currency_code       text        NOT NULL,
  total_minor         bigint      NOT NULL,
  profile_key         text        NOT NULL,
  snapshot            jsonb       NOT NULL,
  snapshot_version    integer     NOT NULL,
  pdf_object_key      text        NULL,
  pdf_sha256          text        NULL,
  rendered_at         timestamptz NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_number_key UNIQUE (number),
  CONSTRAINT invoice_order_fkey FOREIGN KEY (order_id, currency_code)
    REFERENCES public."order" (id, buyer_currency_code) ON DELETE RESTRICT,
  CONSTRAINT invoice_refund_id_refund_id_fk FOREIGN KEY (refund_id)
    REFERENCES public.refund (id) ON DELETE RESTRICT,
  CONSTRAINT invoice_corrects_invoice_id_invoice_id_fk FOREIGN KEY (corrects_invoice_id)
    REFERENCES public.invoice (id) ON DELETE RESTRICT,
  CONSTRAINT invoice_series_key_invoice_series_key_fk FOREIGN KEY (series_key)
    REFERENCES public.invoice_series (key) ON DELETE RESTRICT,
  CONSTRAINT invoice_currency_code_currency_code_fk FOREIGN KEY (currency_code)
    REFERENCES public.currency (code) ON DELETE RESTRICT,
  CONSTRAINT invoice_profile_key_invoice_profile_key_fk FOREIGN KEY (profile_key)
    REFERENCES public.invoice_profile (key) ON DELETE RESTRICT,
  CONSTRAINT invoice_kind_check CHECK (kind IN ('invoice', 'credit_note')),
  -- An invoice answers no refund; a credit note always corrects an invoice.
  CONSTRAINT invoice_kind_links_check CHECK (
    (kind = 'invoice' AND refund_id IS NULL AND corrects_invoice_id IS NULL)
    OR (kind = 'credit_note' AND corrects_invoice_id IS NOT NULL)
  ),
  CONSTRAINT invoice_number_check CHECK (btrim(number) <> ''),
  CONSTRAINT invoice_currency_code_check CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT invoice_snapshot_check CHECK (jsonb_typeof(snapshot) = 'object'),
  CONSTRAINT invoice_snapshot_version_check CHECK (snapshot_version >= 1),
  CONSTRAINT invoice_pdf_sha256_check CHECK (pdf_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT invoice_pdf_object_key_check CHECK (btrim(pdf_object_key) <> ''),
  -- The render columns are written together, once (AC-16).
  CONSTRAINT invoice_render_check CHECK (
    (pdf_object_key IS NULL) = (pdf_sha256 IS NULL)
    AND (pdf_sha256 IS NULL) = (rendered_at IS NULL)
  )
);

CREATE UNIQUE INDEX invoice_one_per_order_idx
  ON public.invoice USING btree (order_id) WHERE kind = 'invoice';
CREATE UNIQUE INDEX invoice_one_per_refund_idx
  ON public.invoice USING btree (refund_id) WHERE kind = 'credit_note';
CREATE INDEX invoice_order_id_idx ON public.invoice USING btree (order_id);

/* ---------------------------------------------------------------------------
 * 4. invoice_immutable() (AC-16)
 * ------------------------------------------------------------------------ */

CREATE FUNCTION public.invoice_immutable() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public
AS $fn$
DECLARE
  render_columns constant text[] := ARRAY['pdf_object_key', 'pdf_sha256', 'rendered_at'];
BEGIN
  -- The one write allowed: the render columns go from all NULL to all set, and nothing else
  -- moves. A second render write, a partial one, or any other column raises.
  IF TG_OP = 'UPDATE'
     AND OLD.pdf_object_key IS NULL AND OLD.pdf_sha256 IS NULL AND OLD.rendered_at IS NULL
     AND NEW.pdf_object_key IS NOT NULL AND NEW.pdf_sha256 IS NOT NULL
     AND NEW.rendered_at IS NOT NULL
     AND (to_jsonb(NEW) - render_columns) = (to_jsonb(OLD) - render_columns)
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'INVOICE_IMMUTABLE: an issued invoice never changes (a credit note corrects it); % is refused', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.invoice_immutable() FROM PUBLIC;

CREATE TRIGGER invoice_immutable
  BEFORE UPDATE OR DELETE ON public.invoice
  FOR EACH ROW EXECUTE FUNCTION public.invoice_immutable();

CREATE TRIGGER invoice_immutable_statement
  BEFORE TRUNCATE ON public.invoice
  FOR EACH STATEMENT EXECUTE FUNCTION public.invoice_immutable();

/* ---------------------------------------------------------------------------
 * RLS: the buyer reads their own invoices; everything else is staff only
 * ------------------------------------------------------------------------ */

ALTER TABLE public.tax_registration ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice ENABLE ROW LEVEL SECURITY;

CREATE POLICY tax_registration_staff ON public.tax_registration FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY invoice_series_staff ON public.invoice_series FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY invoice_profile_staff ON public.invoice_profile FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY invoice_staff ON public.invoice FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY invoice_customer ON public.invoice FOR SELECT TO app_web
  USING (app_customer_owns_order(order_id));

/* ---------------------------------------------------------------------------
 * 5. Flags (spec 018 §12)
 * ------------------------------------------------------------------------ */

INSERT INTO public.feature_flag (key, description, enabled_default) VALUES
  ('account.open', 'The customer account and self-service privacy (spec 018 tasks 4 and 5). Global, or per locale once its strings are reviewed.', false),
  ('invoice.issue', 'Issue invoices and credit notes for live orders (spec 018). Per country, on only after docs/compliance/vat-signoff.md.', false);

INSERT INTO public.feature_flag_scope (flag_key, scope, scope_ref, enabled) VALUES
  ('invoice.issue', 'country', 'PL', false);

/* ---------------------------------------------------------------------------
 * 6. Spec 002 §14 A8: sessions.created_at, order_transition rows 37 and 38
 * ------------------------------------------------------------------------ */

-- Never updated by the adapter: a rolling refresh moves only `expires` (A8.2).
ALTER TABLE public.sessions ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();

INSERT INTO public.order_transition (from_status, event, to_status, allowed_actors) VALUES
  ('authorised', 'order.no_partner_available', 'no_partner_available', ARRAY['system']),
  ('paid_unrouted', 'order.no_partner_available', 'no_partner_available', ARRAY['system']);

RESET ROLE;
