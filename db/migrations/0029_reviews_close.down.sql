SET LOCAL ROLE app_owner;

-- Rollback of 0029_reviews_close (spec 022a §5.1; TASK-368), in reverse order.
--
-- Refuses with `REVIEWS_ROLLBACK_DATA_PRESENT`, changing nothing, while any `internal` review or
-- any invite exists: dropping the columns would lose a buyer's verified review or the record that
-- an order was invited (spec 002 §14 A10's guard precedent). On a database with neither, every
-- object `0029` created is dropped and `0011`'s public read of `review` comes back.

DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.review WHERE source = 'internal')
     OR EXISTS (SELECT 1 FROM public.review_invite) THEN
    RAISE EXCEPTION 'REVIEWS_ROLLBACK_DATA_PRESENT: first-party reviews or review invites exist; rolling back 0029 would drop them'
      USING ERRCODE = 'restrict_violation';
  END IF;
END;
$guard$;

/* 8. the two flags */
DELETE FROM public.feature_flag_scope WHERE flag_key IN ('reviews.invite', 'reviews.trustpilot');
DELETE FROM public.feature_flag WHERE key IN ('reviews.invite', 'reviews.trustpilot');

/* 7. public_review, and the public read of review as 0011 wrote it */
DROP VIEW IF EXISTS public.public_review;
CREATE POLICY review_read ON public.review FOR SELECT TO app_web
  USING (moderation_status = 'published');

/* 6. customer.review_invite_opt_out_at */
ALTER TABLE public.customer DROP COLUMN IF EXISTS review_invite_opt_out_at;

/* 5. review_invite (its policy, trigger and index go with it) */
DROP TABLE IF EXISTS public.review_invite;

/* 4. the audit trail on review; audit_mask_columns as 0016 wrote it */
DROP TRIGGER IF EXISTS review_audit ON public.review;
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
    ELSE ARRAY[]::text[]
  END;
$fn$;

/* 3. review_content_immutable */
DROP TRIGGER IF EXISTS review_content_immutable ON public.review;
DROP FUNCTION IF EXISTS public.review_content_immutable();

/* 2. review: checks */
ALTER TABLE public.review DROP CONSTRAINT IF EXISTS review_text_length_check;
ALTER TABLE public.review DROP CONSTRAINT IF EXISTS review_text_withheld_check;
ALTER TABLE public.review DROP CONSTRAINT IF EXISTS review_hidden_reason_check;
ALTER TABLE public.review DROP CONSTRAINT IF EXISTS review_internal_verified_check;
ALTER TABLE public.review DROP CONSTRAINT IF EXISTS review_moderation_reason_check;

/* 1. review: columns (their foreign keys go with them) */
ALTER TABLE public.review DROP COLUMN IF EXISTS redacted_at;
ALTER TABLE public.review DROP COLUMN IF EXISTS delivered_on;
ALTER TABLE public.review DROP COLUMN IF EXISTS partner_id;
ALTER TABLE public.review DROP COLUMN IF EXISTS product_id;
ALTER TABLE public.review DROP COLUMN IF EXISTS destination_country_id;
ALTER TABLE public.review DROP COLUMN IF EXISTS response_at;
ALTER TABLE public.review DROP COLUMN IF EXISTS response_text;
ALTER TABLE public.review DROP COLUMN IF EXISTS moderated_at;
ALTER TABLE public.review DROP COLUMN IF EXISTS moderated_by;
ALTER TABLE public.review DROP COLUMN IF EXISTS moderation_note;
ALTER TABLE public.review DROP COLUMN IF EXISTS moderation_reason;
ALTER TABLE public.review DROP COLUMN IF EXISTS text_visible;
ALTER TABLE public.review DROP COLUMN IF EXISTS display_name;

RESET ROLE;
