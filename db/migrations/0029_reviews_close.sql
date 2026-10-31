SET LOCAL ROLE app_owner;

-- 0029_reviews_close: the review data of spec 022a (§5.1; AC-19; TASK-368).
--
--   1. `review` gains the moderation, reply, display and routing columns: `display_name` (first
--      name only, by the buyer's choice), `text_visible`, `moderation_reason`, `moderation_note`,
--      `moderated_by`, `moderated_at`, `response_text`, `response_at`, and the denormalised
--      `destination_country_id`, `product_id`, `partner_id`, `delivered_on`, so display and routing
--      read a review without joining the private `order`; plus `redacted_at` (erasure).
--   2. Checks: an `internal` review is a verified order's (`verified_order` and `order_id`);
--      `hidden` exactly when the reason is a removal reason; text withheld only on a published
--      review and only for a withholding reason; text at most 2 000 characters (the form caps
--      graphemes at 1 000). Removal and withholding cannot be done without a lawful reason.
--   3. Trigger `review_content_immutable`: an `UPDATE` that changes `rating`, `text` (except to
--      `NULL` with `redacted_at` set), `order_id`, `source`, `verified_order` or `created_at`
--      raises `REVIEW_CONTENT_IMMUTABLE`. Moderation never rewrites a buyer's words or stars.
--   4. Spec 012's `audit_row_change()` attached to `review`, and `audit_mask_columns()` gains
--      `review`'s two personal columns (`text`, `display_name`), so an audited change records
--      *that* they changed, never what they held (spec 012 AC-11's rule; a redaction must not
--      leave the erased words in `audit_log`).
--   5. `review_invite`: one invite per order, the token's SHA-256 only, no address (resolved at
--      send time from `order.buyer_snapshot`). The hash is lower-case hex `text`, not the
--      `bytea` §5.1 names: `bytea` is refused in `public` (spec 002 AC-22, ADR-0015), and
--      `checkout_draft.token_sha256` (`0015`) is the precedent. RLS: staff (system and admin) only.
--   6. `customer.review_invite_opt_out_at`: the buyer's objection, kept across orders.
--   7. View `public_review` (`security_barrier`, owned by `app_owner`, read-only to `app_web`):
--      published reviews only, `text` `NULL` when withheld, no private column. The public read
--      policy on `review` (`review_read`, `0011`) is dropped, so the table itself is staff only.
--   8. Flags `reviews.invite` and `reviews.trustpilot`, global, default off.
--
-- No `order_transition` or `order_status` row changes: A6 rows 26, 29 and 33 exist.
--
-- Rollback: `0029_reviews_close.down.sql`, which refuses (`REVIEWS_ROLLBACK_DATA_PRESENT`) while
-- any `internal` review or any invite exists.

/* ---------------------------------------------------------------------------
 * 1. review: columns
 * ------------------------------------------------------------------------ */

ALTER TABLE public.review ADD COLUMN display_name text NULL;
ALTER TABLE public.review ADD COLUMN text_visible boolean NOT NULL DEFAULT true;
ALTER TABLE public.review ADD COLUMN moderation_reason text NULL;
ALTER TABLE public.review ADD COLUMN moderation_note text NULL;
ALTER TABLE public.review ADD COLUMN moderated_by uuid NULL;
ALTER TABLE public.review ADD COLUMN moderated_at timestamptz NULL;
ALTER TABLE public.review ADD COLUMN response_text text NULL;
ALTER TABLE public.review ADD COLUMN response_at timestamptz NULL;
ALTER TABLE public.review ADD COLUMN destination_country_id uuid NULL;
ALTER TABLE public.review ADD COLUMN product_id uuid NULL;
ALTER TABLE public.review ADD COLUMN partner_id uuid NULL;
ALTER TABLE public.review ADD COLUMN delivered_on date NULL;
ALTER TABLE public.review ADD COLUMN redacted_at timestamptz NULL;

ALTER TABLE public.review
  ADD CONSTRAINT review_moderated_by_users_id_fk FOREIGN KEY (moderated_by)
  REFERENCES public.users (id) ON DELETE RESTRICT;
ALTER TABLE public.review
  ADD CONSTRAINT review_destination_country_id_country_id_fk FOREIGN KEY (destination_country_id)
  REFERENCES public.country (id) ON DELETE RESTRICT;
ALTER TABLE public.review
  ADD CONSTRAINT review_product_id_product_id_fk FOREIGN KEY (product_id)
  REFERENCES public.product (id) ON DELETE RESTRICT;
ALTER TABLE public.review
  ADD CONSTRAINT review_partner_id_fulfillment_partner_id_fk FOREIGN KEY (partner_id)
  REFERENCES public.fulfillment_partner (id) ON DELETE RESTRICT;

/* ---------------------------------------------------------------------------
 * 2. review: checks
 * ------------------------------------------------------------------------ */

ALTER TABLE public.review ADD CONSTRAINT review_moderation_reason_check CHECK (
  moderation_reason IN (
    'personal_data', 'abuse', 'illegal', 'not_genuine', 'duplicate', 'test_order'
  )
);
ALTER TABLE public.review ADD CONSTRAINT review_internal_verified_check CHECK (
  source <> 'internal' OR (verified_order AND order_id IS NOT NULL)
);
ALTER TABLE public.review ADD CONSTRAINT review_hidden_reason_check CHECK (
  (moderation_status = 'hidden')
  = coalesce(moderation_reason IN ('not_genuine', 'duplicate', 'test_order'), false)
);
ALTER TABLE public.review ADD CONSTRAINT review_text_withheld_check CHECK (
  text_visible
  OR (
    moderation_status = 'published'
    AND coalesce(moderation_reason IN ('personal_data', 'abuse', 'illegal'), false)
  )
);
ALTER TABLE public.review ADD CONSTRAINT review_text_length_check CHECK (
  char_length(text) <= 2000
);

/* ---------------------------------------------------------------------------
 * 3. review_content_immutable
 * ------------------------------------------------------------------------ */

CREATE FUNCTION public.review_content_immutable() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF NEW.rating IS DISTINCT FROM OLD.rating
     OR NEW.order_id IS DISTINCT FROM OLD.order_id
     OR NEW.source IS DISTINCT FROM OLD.source
     OR NEW.verified_order IS DISTINCT FROM OLD.verified_order
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR (
       NEW.text IS DISTINCT FROM OLD.text
       AND NOT (NEW.text IS NULL AND NEW.redacted_at IS NOT NULL)
     )
  THEN
    RAISE EXCEPTION 'REVIEW_CONTENT_IMMUTABLE: a review''s rating, text, order, source, verification and creation time never change (text may only be erased with redacted_at set)'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER review_content_immutable
  BEFORE UPDATE ON public.review
  FOR EACH ROW EXECUTE FUNCTION public.review_content_immutable();

/* ---------------------------------------------------------------------------
 * 4. the audit trail on review, with its personal columns masked
 * ------------------------------------------------------------------------ */

CREATE OR REPLACE FUNCTION public.audit_mask_columns(p_table text) RETURNS text[]
  LANGUAGE sql
  IMMUTABLE
  SET search_path = pg_catalog, public
AS $fn$
  SELECT CASE p_table
    WHEN 'fulfillment_partner' THEN
      ARRAY['legal_name', 'contact_email', 'contact_phone']
    WHEN 'partner_application' THEN
      ARRAY['business_name', 'contact_name', 'contact_email', 'contact_phone', 'registration_number']
    WHEN 'review' THEN
      ARRAY['text', 'display_name']
    ELSE ARRAY[]::text[]
  END;
$fn$;

CREATE TRIGGER review_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.review
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('id');

/* ---------------------------------------------------------------------------
 * 5. review_invite
 * ------------------------------------------------------------------------ */

CREATE TABLE public.review_invite (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       uuid        NOT NULL,
  customer_id    uuid        NOT NULL,
  token_hash     text        NOT NULL,
  send_after     timestamptz NOT NULL,
  expires_at     timestamptz NOT NULL,
  sent_at        timestamptz NULL,
  trustpilot_bcc boolean     NOT NULL DEFAULT false,
  used_at        timestamptz NULL,
  skipped_reason text        NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT review_invite_order_id_key UNIQUE (order_id),
  CONSTRAINT review_invite_token_hash_key UNIQUE (token_hash),
  CONSTRAINT review_invite_order_id_order_id_fk FOREIGN KEY (order_id)
    REFERENCES public."order" (id) ON DELETE RESTRICT,
  CONSTRAINT review_invite_customer_id_customer_id_fk FOREIGN KEY (customer_id)
    REFERENCES public.customer (id) ON DELETE RESTRICT,
  CONSTRAINT review_invite_token_hash_check CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT review_invite_skipped_reason_check CHECK (
    skipped_reason IN ('opted_out', 'redacted', 'expired')
  )
);

-- The `review.request` job's read: unsent, unskipped invites by `send_after` (spec 022a §5.2).
CREATE INDEX review_invite_due_idx ON public.review_invite USING btree (send_after)
  WHERE sent_at IS NULL AND skipped_reason IS NULL;

CREATE TRIGGER review_invite_set_updated_at BEFORE UPDATE ON public.review_invite
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.review_invite ENABLE ROW LEVEL SECURITY;
CREATE POLICY review_invite_staff ON public.review_invite FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());

/* ---------------------------------------------------------------------------
 * 6. customer.review_invite_opt_out_at
 * ------------------------------------------------------------------------ */

ALTER TABLE public.customer ADD COLUMN review_invite_opt_out_at timestamptz NULL;

/* ---------------------------------------------------------------------------
 * 7. public_review, and no public read of review itself
 * ------------------------------------------------------------------------ */

DROP POLICY review_read ON public.review;

CREATE VIEW public.public_review WITH (security_barrier = true) AS
  SELECT r.id, r.rating, CASE WHEN r.text_visible THEN r.text END AS text, r.display_name,
         r.locale_code, r.published_at, date_trunc('month', r.delivered_on)::date AS delivered_month,
         r.destination_country_id, r.product_id, r.response_text, r.response_at
  FROM public.review r
  WHERE r.moderation_status = 'published';

-- Default privileges granted `app_web` DML on the view; it is read-only, like `0011`'s three.
REVOKE INSERT, UPDATE, DELETE ON public.public_review FROM app_web;

/* ---------------------------------------------------------------------------
 * 8. the two flags
 * ------------------------------------------------------------------------ */

INSERT INTO public.feature_flag (key, description, enabled_default) VALUES
  ('reviews.invite', 'One review email to every delivered live order, 24 hours after the photo (spec 022a). Off until the founder approves the copy and the review policy.', false),
  ('reviews.trustpilot', 'The review email carries Trustpilot''s automatic feedback BCC (spec 022a §13 Q2). Off until the Trustpilot DPA is filed.', false);

RESET ROLE;
