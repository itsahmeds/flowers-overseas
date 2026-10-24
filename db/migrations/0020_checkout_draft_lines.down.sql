-- Rollback of 0020_checkout_draft_lines (spec 010 §14 A-founder-2026-10-22 item 2 B; AC-66
-- draft half; TASK-348).
--
-- Back to `0015`'s one-bouquet draft:
--
--   1. the per-line columns come back to `checkout_draft`, nullable for now;
--   2. a draft with exactly one line and no purchase gets that line back (its last-seen amount
--      as the confirmed one, its two screens as `steps_completed`, step 2 counting only when the
--      buyer was saved too); every other draft (two or more lines, no line, or placed) is
--      **deleted**: drafts are disposable and hold no order. The count kept and the count deleted
--      are raised as a NOTICE, which the runner prints;
--   3. `0015`'s `NOT NULL`s, defaults, checks, keys and `order_id UNIQUE` are restored under their
--      names, `expires_at` goes back to 24 hours after the last activity, and the four basket
--      columns and `checkout_draft_line` are dropped;
--   4. the two `retention_policy` rows go back to `0015`'s one.

SET LOCAL ROLE app_owner;

ALTER TABLE public.checkout_draft
  ADD COLUMN destination_country_id uuid     NULL,
  ADD COLUMN product_id             uuid     NULL,
  ADD COLUMN tier_key               text     NULL,
  ADD COLUMN delivery_date          date     NULL,
  ADD COLUMN addon_keys             text[]   NULL,
  ADD COLUMN recipient              jsonb    NULL,
  ADD COLUMN card                   jsonb    NULL,
  ADD COLUMN quote                  jsonb    NULL,
  ADD COLUMN steps_completed        smallint NULL,
  ADD COLUMN order_id               uuid     NULL;

DO $lines$
DECLARE
  kept bigint;
  deleted bigint;
BEGIN
  UPDATE public.checkout_draft d
     SET destination_country_id = l.destination_country_id,
         product_id = l.product_id,
         tier_key = l.tier_key,
         delivery_date = l.delivery_date,
         addon_keys = l.addon_keys,
         recipient = l.recipient,
         card = l.card,
         quote = l.quote,
         confirmed_total_minor = l.last_seen_total_minor,
         confirmed_currency_code = l.last_seen_currency_code,
         steps_completed = CASE WHEN l.steps_completed = 2 AND NOT d.buyer_saved THEN 1
                                ELSE l.steps_completed END,
         expires_at = d.last_activity_at + interval '1 day'
    FROM public.checkout_draft_line l
   WHERE l.draft_id = d.id
     AND l.position = 1
     AND d.purchase_id IS NULL
     AND (SELECT count(*) FROM public.checkout_draft_line c WHERE c.draft_id = d.id) = 1;
  GET DIAGNOSTICS kept = ROW_COUNT;

  DELETE FROM public.checkout_draft WHERE product_id IS NULL;
  GET DIAGNOSTICS deleted = ROW_COUNT;

  RAISE NOTICE 'DRAFT_LINES_DOWN: kept % one-line drafts, deleted % drafts (multi-line, empty or placed)',
    kept, deleted;
END
$lines$;

DROP TABLE public.checkout_draft_line;

ALTER TABLE public.checkout_draft
  DROP CONSTRAINT checkout_draft_pending_notice_check,
  DROP CONSTRAINT checkout_draft_purchase_id_purchase_id_fk,
  DROP CONSTRAINT checkout_draft_purchase_id_key,
  DROP CONSTRAINT checkout_draft_currency_code_currency_code_fk,
  DROP COLUMN currency_code,
  DROP COLUMN buyer_saved,
  DROP COLUMN pending_notice,
  DROP COLUMN purchase_id;

ALTER TABLE public.checkout_draft
  ALTER COLUMN destination_country_id SET NOT NULL,
  ALTER COLUMN product_id SET NOT NULL,
  ALTER COLUMN tier_key SET NOT NULL,
  ALTER COLUMN addon_keys SET DEFAULT '{}',
  ALTER COLUMN addon_keys SET NOT NULL,
  ALTER COLUMN steps_completed SET DEFAULT 0,
  ALTER COLUMN steps_completed SET NOT NULL,
  ADD CONSTRAINT checkout_draft_order_id_key UNIQUE (order_id),
  ADD CONSTRAINT checkout_draft_destination_country_id_country_id_fk FOREIGN KEY (destination_country_id)
    REFERENCES public.country (id),
  ADD CONSTRAINT checkout_draft_product_id_product_id_fk FOREIGN KEY (product_id)
    REFERENCES public.product (id),
  ADD CONSTRAINT checkout_draft_order_id_order_id_fk FOREIGN KEY (order_id)
    REFERENCES public."order" (id) ON DELETE CASCADE,
  ADD CONSTRAINT checkout_draft_tier_key_check CHECK (char_length(tier_key) BETWEEN 1 AND 64),
  ADD CONSTRAINT checkout_draft_steps_completed_check CHECK (steps_completed BETWEEN 0 AND 3);

DELETE FROM public.retention_policy WHERE key = 'checkout_draft_personal';

UPDATE public.retention_policy
   SET retention_days = 1,
       legal_note = 'Spec 010 §5.1 A: a checkout draft is deleted 1 day after its last activity.'
 WHERE key = 'checkout_draft';

RESET ROLE;
