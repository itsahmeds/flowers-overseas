-- 0037_discount_codes — admin-made discount codes, entered at checkout, paid for by us (spec 047
-- §5.1; AC-1, AC-2 database half; TASK-445).
--
-- Numbered 0037 (orchestrator, 2026-11-08): main ends at 0036 (TASK-344).
--
--   1. `discount_code`: the code as typed and normalised (unique, `^[A-Z0-9]{6,32}$`), the internal
--      campaign label, the kind (`percent` in basis points 100 to 5 000, or `fixed`), the start and
--      optional end instant, the total and per-email caps, the status, and the referral hook
--      (`source` `admin` | `referral`, `issuer_ref`). Every insert goes through `issueCode`
--      (`src/modules/discounts/issue.ts`, AC-30).
--   2. `discount_code_currency`: per currency, the fixed amount off and the minimum order, integer
--      minor units beside their currency; the 50 % ceiling of §13 Q1 as a check.
--   3. `discount_code_shape_check`, a deferred constraint trigger on both tables: a fixed code has
--      at least one currency amount, a percent code none (`DISCOUNT_SHAPE_INVALID`).
--   4. `discount_code_country`, `discount_code_product`: the scope; no rows means all.
--   5. `order_discount`: one row per order that carries a share of a purchase's discount (§14
--      A-orchestrator-2026-10-25 item 2), with the code snapshot, the amount in the order currency
--      and in the base currency, the folded-email key for the per-email cap, and the mode.
--   6. `order_line.discount_minor`: each line's share; paid amount = `unit_retail_minor * qty -
--      discount_minor`. Default 0, so every existing order is unchanged.
--   7. `checkout_draft`: the applied code and the per-checkout guessing lock (no IP is read).
--   8. RLS: staff (`admin`, `system`) only on every new table; no `public`, `customer` or
--      `partner` policy, so a florist never sees what the buyer paid or which code was used.
--   9. Audit: `0016`'s `audit_row_change()` on the four `discount_code*` tables.
--  10. Flag `checkout.discount_codes`, country scope, off by default.
--
-- No personal column: the email key is a SHA-256 of the folded email, never the email.
--
-- Rollback: `0037_discount_codes.down.sql`, guarded by `DISCOUNT_ROLLBACK_LIVE_ORDERS`.

SET LOCAL ROLE app_owner;

/* ---------------------------------------------------------------------------
 * 1. discount_code
 * ------------------------------------------------------------------------ */

CREATE TABLE public.discount_code (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text        NOT NULL,
  code_normalised  text        NOT NULL,
  campaign_label   text        NOT NULL,
  kind             text        NOT NULL,
  percent_bp       integer     NULL,
  starts_at        timestamptz NOT NULL,
  ends_at          timestamptz NULL,
  max_redemptions  integer     NULL,
  max_per_email    integer     NULL DEFAULT 1,
  status           text        NOT NULL DEFAULT 'active',
  source           text        NOT NULL DEFAULT 'admin',
  issuer_ref       text        NULL,
  note             text        NULL,
  created_by       uuid        NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT discount_code_code_normalised_key UNIQUE (code_normalised),
  CONSTRAINT discount_code_created_by_users_id_fk FOREIGN KEY (created_by)
    REFERENCES public.users (id) ON DELETE RESTRICT,
  CONSTRAINT discount_code_code_check CHECK (char_length(code) BETWEEN 1 AND 64),
  CONSTRAINT discount_code_code_normalised_check CHECK (code_normalised ~ '^[A-Z0-9]{6,32}$'),
  CONSTRAINT discount_code_campaign_label_check CHECK (char_length(campaign_label) BETWEEN 1 AND 80),
  CONSTRAINT discount_code_kind_check CHECK (kind IN ('percent', 'fixed')),
  CONSTRAINT discount_code_percent_bp_check CHECK (percent_bp BETWEEN 100 AND 5000),
  CONSTRAINT discount_code_kind_percent_check CHECK ((kind = 'percent') = (percent_bp IS NOT NULL)),
  CONSTRAINT discount_code_ends_at_check CHECK (ends_at IS NULL OR ends_at > starts_at),
  CONSTRAINT discount_code_max_redemptions_check CHECK (max_redemptions > 0),
  CONSTRAINT discount_code_max_per_email_check CHECK (max_per_email > 0),
  CONSTRAINT discount_code_status_check CHECK (status IN ('active', 'disabled')),
  CONSTRAINT discount_code_source_check CHECK (source IN ('admin', 'referral')),
  CONSTRAINT discount_code_issuer_ref_check CHECK (char_length(issuer_ref) BETWEEN 1 AND 200),
  CONSTRAINT discount_code_note_check CHECK (char_length(note) <= 2000)
);

COMMENT ON TABLE public.discount_code IS
  'Spec 047 §5.1: an admin-made discount code. The campaign label is internal and never shown to a buyer; source and issuer_ref are the referral hook. Every insert goes through issueCode.';

CREATE TRIGGER discount_code_updated_at
  BEFORE UPDATE ON public.discount_code
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

/* ---------------------------------------------------------------------------
 * 2. discount_code_currency
 * ------------------------------------------------------------------------ */

CREATE TABLE public.discount_code_currency (
  discount_code_id uuid   NOT NULL,
  currency_code    text   NOT NULL,
  amount_off_minor bigint NULL,
  min_order_minor  bigint NOT NULL DEFAULT 0,
  CONSTRAINT discount_code_currency_pkey PRIMARY KEY (discount_code_id, currency_code),
  CONSTRAINT discount_code_currency_discount_code_id_fk FOREIGN KEY (discount_code_id)
    REFERENCES public.discount_code (id) ON DELETE CASCADE,
  CONSTRAINT discount_code_currency_currency_code_fk FOREIGN KEY (currency_code)
    REFERENCES public.currency (code) ON DELETE RESTRICT,
  CONSTRAINT discount_code_currency_currency_code_check CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT discount_code_currency_amount_off_minor_check CHECK (amount_off_minor > 0),
  CONSTRAINT discount_code_currency_min_order_minor_check CHECK (min_order_minor >= 0),
  CONSTRAINT discount_code_currency_ceiling_check
    CHECK (amount_off_minor IS NULL OR amount_off_minor * 2 <= min_order_minor)
);

COMMENT ON TABLE public.discount_code_currency IS
  'Spec 047 §5.1: a code''s fixed amount and minimum order per currency, integer minor units. A fixed amount is at most half its minimum order (§13 Q1).';

/* ---------------------------------------------------------------------------
 * 3. The shape of a code: a fixed code has an amount, a percent code none
 * ------------------------------------------------------------------------ */

CREATE FUNCTION public.discount_code_shape_check() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public
AS $fn$
DECLARE
  target  uuid;
  v_kind  text;
  amounts bigint;
BEGIN
  IF TG_TABLE_NAME = 'discount_code' THEN
    target := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    target := OLD.discount_code_id;
  ELSE
    target := NEW.discount_code_id;
  END IF;
  SELECT c.kind INTO v_kind FROM public.discount_code c WHERE c.id = target;
  -- A code deleted later in the same transaction has nothing left to check.
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  SELECT count(*) INTO amounts FROM public.discount_code_currency r
   WHERE r.discount_code_id = target AND r.amount_off_minor IS NOT NULL;
  IF v_kind = 'fixed' AND amounts = 0 THEN
    RAISE EXCEPTION 'DISCOUNT_SHAPE_INVALID: a fixed code needs an amount in at least one currency'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_kind = 'percent' AND amounts > 0 THEN
    RAISE EXCEPTION 'DISCOUNT_SHAPE_INVALID: a percent code has no fixed amount'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END
$fn$;

COMMENT ON FUNCTION public.discount_code_shape_check() IS
  'Spec 047 §5.1: at commit, a fixed code has at least one currency amount and a percent code none (DISCOUNT_SHAPE_INVALID).';

REVOKE EXECUTE ON FUNCTION public.discount_code_shape_check() FROM PUBLIC;

CREATE CONSTRAINT TRIGGER discount_code_shape_check
  AFTER INSERT OR UPDATE OF kind ON public.discount_code
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.discount_code_shape_check();

CREATE CONSTRAINT TRIGGER discount_code_shape_check
  AFTER INSERT OR UPDATE OR DELETE ON public.discount_code_currency
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.discount_code_shape_check();

/* ---------------------------------------------------------------------------
 * 4. Scope: destinations and products (no rows means all)
 * ------------------------------------------------------------------------ */

CREATE TABLE public.discount_code_country (
  discount_code_id uuid NOT NULL,
  country_id       uuid NOT NULL,
  CONSTRAINT discount_code_country_pkey PRIMARY KEY (discount_code_id, country_id),
  CONSTRAINT discount_code_country_discount_code_id_fk FOREIGN KEY (discount_code_id)
    REFERENCES public.discount_code (id) ON DELETE CASCADE,
  CONSTRAINT discount_code_country_country_id_fk FOREIGN KEY (country_id)
    REFERENCES public.country (id) ON DELETE RESTRICT
);

CREATE INDEX discount_code_country_country_id_idx
  ON public.discount_code_country USING btree (country_id);

CREATE TABLE public.discount_code_product (
  discount_code_id uuid NOT NULL,
  product_id       uuid NOT NULL,
  CONSTRAINT discount_code_product_pkey PRIMARY KEY (discount_code_id, product_id),
  CONSTRAINT discount_code_product_discount_code_id_fk FOREIGN KEY (discount_code_id)
    REFERENCES public.discount_code (id) ON DELETE CASCADE,
  CONSTRAINT discount_code_product_product_id_fk FOREIGN KEY (product_id)
    REFERENCES public.product (id) ON DELETE RESTRICT
);

CREATE INDEX discount_code_product_product_id_idx
  ON public.discount_code_product USING btree (product_id);

/* ---------------------------------------------------------------------------
 * 5. order_discount
 * ------------------------------------------------------------------------ */

CREATE TABLE public.order_discount (
  order_id           uuid        PRIMARY KEY,
  discount_code_id   uuid        NOT NULL,
  code_snapshot      text        NOT NULL,
  kind               text        NOT NULL,
  percent_bp         integer     NULL,
  amount_minor       bigint      NOT NULL,
  currency_code      text        NOT NULL,
  base_amount_minor  bigint      NOT NULL,
  base_currency_code text        NOT NULL,
  email_key_sha256   text        NOT NULL,
  mode               text        NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_discount_order_fkey FOREIGN KEY (order_id, currency_code)
    REFERENCES public."order" (id, buyer_currency_code) ON DELETE RESTRICT,
  CONSTRAINT order_discount_discount_code_id_fk FOREIGN KEY (discount_code_id)
    REFERENCES public.discount_code (id) ON DELETE RESTRICT,
  CONSTRAINT order_discount_base_currency_code_fk FOREIGN KEY (base_currency_code)
    REFERENCES public.currency (code) ON DELETE RESTRICT,
  CONSTRAINT order_discount_code_snapshot_check CHECK (code_snapshot ~ '^[A-Z0-9]{6,32}$'),
  CONSTRAINT order_discount_kind_check CHECK (kind IN ('percent', 'fixed')),
  CONSTRAINT order_discount_percent_bp_check CHECK (percent_bp BETWEEN 100 AND 5000),
  CONSTRAINT order_discount_kind_percent_check CHECK ((kind = 'percent') = (percent_bp IS NOT NULL)),
  CONSTRAINT order_discount_amount_minor_check CHECK (amount_minor > 0),
  CONSTRAINT order_discount_base_amount_minor_check CHECK (base_amount_minor > 0),
  CONSTRAINT order_discount_currency_code_check CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT order_discount_base_currency_code_check CHECK (base_currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT order_discount_email_key_sha256_check CHECK (email_key_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT order_discount_mode_check CHECK (mode IN ('demo', 'test', 'live'))
);

COMMENT ON TABLE public.order_discount IS
  'Spec 047 §5.1, §14 A-orchestrator-2026-10-25 item 2: an order''s share of its purchase''s discount. The code string is a snapshot; the email key is a SHA-256 of the folded email, for the per-email cap only.';

CREATE INDEX order_discount_code_mode_idx
  ON public.order_discount USING btree (discount_code_id, mode);

/* ---------------------------------------------------------------------------
 * 6. order_line.discount_minor
 * ------------------------------------------------------------------------ */

ALTER TABLE public.order_line ADD COLUMN discount_minor bigint NOT NULL DEFAULT 0;
ALTER TABLE public.order_line ADD CONSTRAINT order_line_discount_minor_check
  CHECK (discount_minor >= 0 AND discount_minor <= unit_retail_minor * qty);

COMMENT ON COLUMN public.order_line.discount_minor IS
  'Spec 047 §5.1: this line''s share of the order''s discount; paid amount = unit_retail_minor * qty - discount_minor. Never read by payouts (AC-19).';

/* ---------------------------------------------------------------------------
 * 7. checkout_draft: the applied code and the per-checkout lock
 * ------------------------------------------------------------------------ */

ALTER TABLE public.checkout_draft ADD COLUMN discount_code_id uuid NULL;
ALTER TABLE public.checkout_draft ADD COLUMN discount_failed_attempts smallint NOT NULL DEFAULT 0;
ALTER TABLE public.checkout_draft ADD COLUMN discount_window_started_at timestamptz NULL;
ALTER TABLE public.checkout_draft ADD COLUMN discount_locked_until timestamptz NULL;
ALTER TABLE public.checkout_draft
  ADD CONSTRAINT checkout_draft_discount_code_id_discount_code_id_fk FOREIGN KEY (discount_code_id)
    REFERENCES public.discount_code (id) ON DELETE SET NULL;
ALTER TABLE public.checkout_draft ADD CONSTRAINT checkout_draft_discount_failed_attempts_check
  CHECK (discount_failed_attempts >= 0);

/* ---------------------------------------------------------------------------
 * 8. RLS: staff only
 * ------------------------------------------------------------------------ */

ALTER TABLE public.discount_code ENABLE ROW LEVEL SECURITY;
CREATE POLICY discount_code_staff ON public.discount_code FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());

ALTER TABLE public.discount_code_currency ENABLE ROW LEVEL SECURITY;
CREATE POLICY discount_code_currency_staff ON public.discount_code_currency FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());

ALTER TABLE public.discount_code_country ENABLE ROW LEVEL SECURITY;
CREATE POLICY discount_code_country_staff ON public.discount_code_country FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());

ALTER TABLE public.discount_code_product ENABLE ROW LEVEL SECURITY;
CREATE POLICY discount_code_product_staff ON public.discount_code_product FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());

ALTER TABLE public.order_discount ENABLE ROW LEVEL SECURITY;
CREATE POLICY order_discount_staff ON public.order_discount FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());

/* ---------------------------------------------------------------------------
 * 9. Audit (spec 012's trigger)
 * ------------------------------------------------------------------------ */

CREATE TRIGGER discount_code_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.discount_code
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('id');
CREATE TRIGGER discount_code_currency_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.discount_code_currency
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('discount_code_id', 'currency_code');
CREATE TRIGGER discount_code_country_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.discount_code_country
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('discount_code_id', 'country_id');
CREATE TRIGGER discount_code_product_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.discount_code_product
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('discount_code_id', 'product_id');

/* ---------------------------------------------------------------------------
 * 10. Flag (spec 047 §12)
 * ------------------------------------------------------------------------ */

INSERT INTO public.feature_flag (key, description, enabled_default) VALUES
  ('checkout.discount_codes', 'The "Add a discount code" control at checkout for a destination (spec 047). Off until the founder turns it on per destination.', false);

RESET ROLE;
