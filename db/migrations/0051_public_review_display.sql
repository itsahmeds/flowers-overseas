SET LOCAL ROLE app_owner;

-- 0051_public_review_display: what the reviews page, the blocks and the build read (spec 022a §2
-- "Display", §5.3 card, §5.4; AC-18 page half, AC-25; TASK-373).
--
-- Numbered 0051 (orchestrator, 2026-11-11): 0047 to 0050 are held by other builders.
--
--   1. `public_review` gains `withheld_reason`: the moderation reason of a review published
--      without its text (`personal_data`, `abuse` or `illegal`), else `NULL`. The card prints
--      "This review's comment was withheld: {reason label}" from it (§5.3); a review whose text
--      was redacted on erasure, or that never had text, shows no such line. The removal reasons
--      and the moderation note stay private. Added as the view's last column, so
--      `CREATE OR REPLACE VIEW` keeps every existing column and grant.
--   2. The build reads published reviews through the view, never the table (TASK-368's
--      carry-forward): `app_build` gains `SELECT` on `public_review` and loses `0018`'s
--      `review_build_read` policy and its table `SELECT` on `review`.
--
-- Rollback: `0051_public_review_display.down.sql` restores `0029`'s view and `0018`'s build read.

CREATE OR REPLACE VIEW public.public_review WITH (security_barrier = true) AS
  SELECT r.id, r.rating, CASE WHEN r.text_visible THEN r.text END AS text, r.display_name,
         r.locale_code, r.published_at, date_trunc('month', r.delivered_on)::date AS delivered_month,
         r.destination_country_id, r.product_id, r.response_text, r.response_at,
         CASE WHEN NOT r.text_visible THEN r.moderation_reason END AS withheld_reason
  FROM public.review r
  WHERE r.moderation_status = 'published';

DROP POLICY review_build_read ON public.review;
REVOKE SELECT ON public.review FROM app_build;
GRANT SELECT ON public.public_review TO app_build;

RESET ROLE;
