-- 0020_checkout_draft_lines: a checkout draft becomes a basket of up to five lines
-- (spec 010 §14 A-founder-2026-10-22 items 1 D3 to D8, 2 B and C; AC-54, AC-55, AC-66 draft
-- half; TASK-348). Reshapes TASK-203's `0015_checkout_draft`.
--
--   1. `checkout_draft_line`: one bouquet for one recipient on one date in one destination, with
--      its own add-ons, card, signed quote of spec 005 and the amount the buyer last saw for it
--      (`last_seen_total_minor` beside its own currency FK, so `db:check`'s money-pair gate passes
--      unchanged). `position BETWEEN 1 AND 5` mirrors `BASKET_MAX_LINES` in
--      `src/config/checkout.ts` (a test pins the two equal; changing the config is a migration).
--      `steps_completed` counts the line's own screens: 1 = step 1 (recipient), 2 = step 2
--      (card). `order_id UNIQUE` is the order the line became.
--   2. `checkout_draft` keeps the basket-level fields and gains `currency_code` (the basket's
--      currency, set by its first line), `buyer_saved`, `pending_notice` (the start route's
--      refusal or "added" notice, read by the next basket render, so no notice ever travels in a
--      URL) and `purchase_id UNIQUE` (placement's idempotency key, replacing `order_id UNIQUE`).
--      The per-line columns move to the line. `expires_at` becomes `last_activity_at + 30 days`.
--   3. The up migration copies every draft into one line at position 1, so nothing is lost, and
--      refuses (`DRAFT_LINES_PLACED_DRAFT`, nothing changed) if any draft has `order_id` set:
--      placement (TASK-205) ships after this migration, so none can.
--   4. RLS: `checkout_draft_line_system`, the same single `system` policy as `checkout_draft`.
--   5. `retention_policy` (item 2 C): `checkout_draft` now deletes 30 days after the last
--      activity; the new `checkout_draft_personal` clears the buyer and every line's recipient and
--      card 1 day after it.
--
-- Rollback: `0020_checkout_draft_lines.down.sql` keeps a one-line, unplaced draft as a `0015`
-- draft and deletes every other one (drafts are disposable and hold no order), printing the count.

SET LOCAL ROLE app_owner;

DO $placed$
BEGIN
  IF EXISTS (SELECT 1 FROM public.checkout_draft WHERE order_id IS NOT NULL) THEN
    RAISE EXCEPTION 'DRAFT_LINES_PLACED_DRAFT: a placed checkout draft exists; this migration runs before placement ships';
  END IF;
END
$placed$;

CREATE TABLE public.checkout_draft_line (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id                uuid        NOT NULL,
  position                smallint    NOT NULL,
  destination_country_id  uuid        NOT NULL,
  product_id              uuid        NOT NULL,
  tier_key                text        NOT NULL,
  delivery_date           date        NULL,
  addon_keys              text[]      NOT NULL DEFAULT '{}',
  recipient               jsonb       NULL,
  card                    jsonb       NULL,
  quote                   jsonb       NULL,
  last_seen_total_minor   bigint      NULL,
  last_seen_currency_code text        NULL,
  steps_completed         smallint    NOT NULL DEFAULT 0,
  order_id                uuid        NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT checkout_draft_line_draft_id_position_key UNIQUE (draft_id, position),
  CONSTRAINT checkout_draft_line_order_id_key UNIQUE (order_id),
  CONSTRAINT checkout_draft_line_draft_id_checkout_draft_id_fk FOREIGN KEY (draft_id)
    REFERENCES public.checkout_draft (id) ON DELETE CASCADE,
  CONSTRAINT checkout_draft_line_destination_country_id_country_id_fk FOREIGN KEY (destination_country_id)
    REFERENCES public.country (id),
  CONSTRAINT checkout_draft_line_product_id_product_id_fk FOREIGN KEY (product_id)
    REFERENCES public.product (id),
  CONSTRAINT checkout_draft_line_last_seen_currency_code_currency_code_fk FOREIGN KEY (last_seen_currency_code)
    REFERENCES public.currency (code),
  CONSTRAINT checkout_draft_line_order_id_order_id_fk FOREIGN KEY (order_id)
    REFERENCES public."order" (id),
  CONSTRAINT checkout_draft_line_position_check CHECK (position BETWEEN 1 AND 5),
  CONSTRAINT checkout_draft_line_tier_key_check CHECK (char_length(tier_key) BETWEEN 1 AND 64),
  CONSTRAINT checkout_draft_line_steps_completed_check CHECK (steps_completed BETWEEN 0 AND 2),
  CONSTRAINT checkout_draft_line_last_seen_pair_check CHECK (
    (last_seen_total_minor IS NULL) = (last_seen_currency_code IS NULL)
    AND (last_seen_total_minor IS NULL OR last_seen_total_minor >= 0)
  )
);

CREATE TRIGGER checkout_draft_line_set_updated_at BEFORE UPDATE ON public.checkout_draft_line
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.checkout_draft_line ENABLE ROW LEVEL SECURITY;

CREATE POLICY checkout_draft_line_system ON public.checkout_draft_line FOR ALL TO app_web
  USING (public.app_current_role() = 'system')
  WITH CHECK (public.app_current_role() = 'system');

ALTER TABLE public.checkout_draft
  ADD COLUMN currency_code  text    NULL,
  ADD COLUMN buyer_saved    boolean NOT NULL DEFAULT false,
  ADD COLUMN pending_notice text    NULL,
  ADD COLUMN purchase_id    uuid    NULL,
  ADD CONSTRAINT checkout_draft_currency_code_currency_code_fk FOREIGN KEY (currency_code)
    REFERENCES public.currency (code),
  ADD CONSTRAINT checkout_draft_purchase_id_key UNIQUE (purchase_id),
  ADD CONSTRAINT checkout_draft_purchase_id_purchase_id_fk FOREIGN KEY (purchase_id)
    REFERENCES public.purchase (id),
  ADD CONSTRAINT checkout_draft_pending_notice_check
    CHECK (pending_notice IN ('added', 'full', 'other_mode', 'other_currency'));

-- Every draft becomes line 1 of itself: nothing is lost. The line's last-seen amount is the
-- draft's confirmed one (the total the buyer last saw); its screens are the draft's first two.
INSERT INTO public.checkout_draft_line (
  draft_id, position, destination_country_id, product_id, tier_key, delivery_date, addon_keys,
  recipient, card, quote, last_seen_total_minor, last_seen_currency_code, steps_completed,
  created_at, updated_at)
SELECT d.id, 1, d.destination_country_id, d.product_id, d.tier_key, d.delivery_date, d.addon_keys,
       d.recipient, d.card, d.quote, d.confirmed_total_minor, d.confirmed_currency_code,
       LEAST(d.steps_completed, 2), d.created_at, d.updated_at
FROM public.checkout_draft d;

UPDATE public.checkout_draft d
   SET currency_code = CASE WHEN d.quote ->> 'currency' ~ '^[A-Z]{3}$'
                                 AND EXISTS (SELECT 1 FROM public.currency c
                                             WHERE c.code = d.quote ->> 'currency')
                            THEN d.quote ->> 'currency' END,
       buyer_saved = d.steps_completed >= 2,
       expires_at = d.last_activity_at + interval '30 days';

ALTER TABLE public.checkout_draft
  DROP COLUMN destination_country_id,
  DROP COLUMN product_id,
  DROP COLUMN tier_key,
  DROP COLUMN delivery_date,
  DROP COLUMN addon_keys,
  DROP COLUMN recipient,
  DROP COLUMN card,
  DROP COLUMN quote,
  DROP COLUMN steps_completed,
  DROP COLUMN order_id;

UPDATE public.retention_policy
   SET retention_days = 30,
       legal_note = 'Spec 010 §14 A-founder-2026-10-22 item 2 C: a checkout draft (the basket) and its lines are deleted 30 days after its last activity.'
 WHERE key = 'checkout_draft';

INSERT INTO public.retention_policy (key, entity_table, basis, retention_days, action, legal_note)
VALUES ('checkout_draft_personal', 'checkout_draft',
        'Art. 6(1)(b) contract (steps prior to entering a contract)', 1, 'pseudonymise',
        'Spec 010 §14 A-founder-2026-10-22 item 2 C: the buyer''s details and every line''s recipient and card are cleared 1 day after the draft''s last activity; the lines themselves stay for 30 days.');

RESET ROLE;
