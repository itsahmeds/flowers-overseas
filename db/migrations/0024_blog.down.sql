-- 0024_blog rollback (spec 044 §5.1 "Rollback", AC-1; TASK-321).
--
-- Detaches the triggers, drops the view, the five tables and the functions, restores `0023`'s
-- `review_subject_hash()`, and restores the previous subject-kind check as `NOT VALID`: the ledger
-- is append-only, so any `blog_post_revision` rows stay as history and this file deletes none.

SET LOCAL ROLE app_owner;

DROP TRIGGER IF EXISTS admin_profile_blog_author_follow ON public.admin_profile;

DROP VIEW IF EXISTS public.blog_author_public;

ALTER TABLE IF EXISTS public.blog_post
  DROP CONSTRAINT IF EXISTS blog_post_published_revision_id_blog_post_revision_id_fk;

DROP TABLE IF EXISTS public.blog_post_occasion;
DROP TABLE IF EXISTS public.blog_post_country;
DROP TABLE IF EXISTS public.blog_post_revision;
DROP TABLE IF EXISTS public.blog_post;
DROP TABLE IF EXISTS public.blog_author;

DROP FUNCTION IF EXISTS public.blog_author_follow_profile();
DROP FUNCTION IF EXISTS public.blog_author_guard();
DROP FUNCTION IF EXISTS public.blog_post_rehash_drafts();
DROP FUNCTION IF EXISTS public.blog_slug_lock();
DROP FUNCTION IF EXISTS public.blog_publish_guard();
DROP FUNCTION IF EXISTS public.blog_revision_freeze();
DROP FUNCTION IF EXISTS public.blog_revision_hash();

CREATE OR REPLACE FUNCTION public.review_subject_hash(p_kind text, p_ref text, p_locale_code text)
  RETURNS text
  LANGUAGE sql
  STABLE
  SET search_path = pg_catalog, public
AS $fn$
  SELECT CASE p_kind
    WHEN 'product_translation' THEN (
      SELECT public.review_product_copy_hash(
               t.product_id, t.locale_code, t.name, t.slug, t.description_md, t.seo_title,
               t.seo_description)
      FROM public.product p
      JOIN public.product_translation t ON t.product_id = p.id AND t.locale_code = p_locale_code
      WHERE p.sku = p_ref)
    WHEN 'media_asset' THEN (
      SELECT a.checksum_sha256 FROM public.media_asset a
      WHERE a.checksum_sha256 = p_ref AND p_locale_code IS NULL
      LIMIT 1)
  END
$fn$;

DROP FUNCTION IF EXISTS public.blog_revision_approved(uuid, text, text, boolean);
DROP FUNCTION IF EXISTS public.review_blog_revision_current_hash(uuid);
DROP FUNCTION IF EXISTS public.review_blog_revision_hash(text, text, text, text, text, text, uuid, text, jsonb, uuid);

ALTER TABLE public.review_attestation DROP CONSTRAINT review_attestation_subject_kind_check;
ALTER TABLE public.review_attestation
  ADD CONSTRAINT review_attestation_subject_kind_check CHECK (subject_kind IN (
    'message', 'product_translation', 'category_translation', 'addon_translation',
    'occasion_translation', 'corridor_file', 'info_page_file', 'media_asset'
  )) NOT VALID;

RESET ROLE;
