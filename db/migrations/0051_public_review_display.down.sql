-- Rollback of 0051_public_review_display (spec 022a §5.3; TASK-373): `0029`'s view without
-- `withheld_reason`, and `0018`'s build read of published reviews on the table.

SET LOCAL ROLE app_owner;

REVOKE SELECT ON public.public_review FROM app_build;
GRANT SELECT ON public.review TO app_build;
CREATE POLICY review_build_read ON public.review FOR SELECT TO app_build
  USING (moderation_status = 'published');

DROP VIEW public.public_review;
CREATE VIEW public.public_review WITH (security_barrier = true) AS
  SELECT r.id, r.rating, CASE WHEN r.text_visible THEN r.text END AS text, r.display_name,
         r.locale_code, r.published_at, date_trunc('month', r.delivered_on)::date AS delivered_month,
         r.destination_country_id, r.product_id, r.response_text, r.response_at
  FROM public.review r
  WHERE r.moderation_status = 'published';
REVOKE INSERT, UPDATE, DELETE ON public.public_review FROM app_web;
GRANT SELECT ON public.public_review TO app_web;

RESET ROLE;
