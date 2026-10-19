-- 0015_checkout_draft — an unfinished checkout, kept on the server between its steps
-- (spec 010 §5.1 B `NNNN_checkout_draft`, §8 "Security", AC-6, AC-13, AC-17; TASK-203).
--
--   `checkout_draft`  one row per checkout a product page started. The buyer's browser holds a
--                     256-bit random token in the `fo_checkout` cookie; this table holds only
--                     its SHA-256 (`token_sha256`), so a copy of the database yields no usable
--                     cookie. The selection (product, tier, date, add-ons), the steps' values
--                     (`recipient`, `buyer`, `card`), the signed quote of spec 005 and the
--                     amounts the buyer saw (`expected_*`: what the product page displayed;
--                     `confirmed_*`: the last total the buyer saw and accepted) live here until
--                     placement. `order_id UNIQUE` is the idempotency key of placement
--                     (TASK-205): one draft yields at most one order.
--
-- Money pairs follow spec 002's rule (`*_minor bigint` beside a currency column with an FK), so
-- `db:check`'s money gate passes unchanged. Retention: the `checkout_draft` row of
-- `retention_policy` (0009) deletes a draft 24 hours after its last activity; `expires_at` is
-- that instant and moves with every step.
--
-- RLS enabled, one policy, for `app.role = 'system'` only: the checkout reads and writes drafts
-- under `withSystemContext('checkout', …)`. No public, customer or partner policy.
--
-- Rollback: `0015_checkout_draft.down.sql` (drops the table; nothing references it).

SET LOCAL ROLE app_owner;

CREATE TABLE public.checkout_draft (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_sha256            text        NOT NULL,
  locale_code             text        NOT NULL,
  destination_country_id  uuid        NOT NULL,
  product_id              uuid        NOT NULL,
  tier_key                text        NOT NULL,
  delivery_date           date        NULL,
  addon_keys              text[]      NOT NULL DEFAULT '{}',
  recipient               jsonb       NULL,
  buyer                   jsonb       NULL,
  card                    jsonb       NULL,
  quote                   jsonb       NULL,
  expected_total_minor    bigint      NULL,
  expected_currency_code  text        NULL,
  confirmed_total_minor   bigint      NULL,
  confirmed_currency_code text        NULL,
  mode                    text        NOT NULL,
  steps_completed         smallint    NOT NULL DEFAULT 0,
  order_id                uuid        NULL,
  last_activity_at        timestamptz NOT NULL DEFAULT now(),
  expires_at              timestamptz NOT NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT checkout_draft_token_sha256_key UNIQUE (token_sha256),
  CONSTRAINT checkout_draft_order_id_key UNIQUE (order_id),
  CONSTRAINT checkout_draft_locale_code_locale_code_fk FOREIGN KEY (locale_code)
    REFERENCES public.locale (code),
  CONSTRAINT checkout_draft_destination_country_id_country_id_fk FOREIGN KEY (destination_country_id)
    REFERENCES public.country (id),
  CONSTRAINT checkout_draft_product_id_product_id_fk FOREIGN KEY (product_id)
    REFERENCES public.product (id),
  CONSTRAINT checkout_draft_expected_currency_code_currency_code_fk FOREIGN KEY (expected_currency_code)
    REFERENCES public.currency (code),
  CONSTRAINT checkout_draft_confirmed_currency_code_currency_code_fk FOREIGN KEY (confirmed_currency_code)
    REFERENCES public.currency (code),
  CONSTRAINT checkout_draft_order_id_order_id_fk FOREIGN KEY (order_id)
    REFERENCES public."order" (id) ON DELETE CASCADE,
  CONSTRAINT checkout_draft_token_sha256_check CHECK (token_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT checkout_draft_tier_key_check CHECK (char_length(tier_key) BETWEEN 1 AND 64),
  CONSTRAINT checkout_draft_mode_check CHECK (mode IN ('demo', 'test', 'live')),
  CONSTRAINT checkout_draft_steps_completed_check CHECK (steps_completed BETWEEN 0 AND 3),
  CONSTRAINT checkout_draft_expected_pair_check CHECK (
    (expected_total_minor IS NULL) = (expected_currency_code IS NULL)
    AND (expected_total_minor IS NULL OR expected_total_minor >= 0)
  ),
  CONSTRAINT checkout_draft_confirmed_pair_check CHECK (
    (confirmed_total_minor IS NULL) = (confirmed_currency_code IS NULL)
    AND (confirmed_total_minor IS NULL OR confirmed_total_minor >= 0)
  ),
  CONSTRAINT checkout_draft_expires_at_check CHECK (expires_at > last_activity_at)
);

CREATE INDEX checkout_draft_expires_at_idx
  ON public.checkout_draft USING btree (expires_at);

CREATE TRIGGER checkout_draft_set_updated_at BEFORE UPDATE ON public.checkout_draft
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.checkout_draft ENABLE ROW LEVEL SECURITY;

CREATE POLICY checkout_draft_system ON public.checkout_draft FOR ALL TO app_web
  USING (public.app_current_role() = 'system')
  WITH CHECK (public.app_current_role() = 'system');

RESET ROLE;
