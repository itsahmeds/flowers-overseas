-- 0024_blog — editorial posts in the database, approved through the review ledger (spec 044
-- §2.2 to §2.6, §5.1, AC-1 to AC-4, AC-17; proposed ADR-0023, Appendix B; TASK-321).
--
-- Numbered after `0023_review_attestation` (spec 012b's ledger, TASK-293), whose subject-kind check
-- it widens and whose `review_subject_hash()` it extends. Spec 044 §5.1 also orders it after
-- `NNNN_catalogue_cms` (TASK-294), which has no migration yet; nothing here reads a table or
-- column that migration adds, so the order of the two does not matter to either.
--
--   `blog_author`          a real person with an admin account, named on posts (§2.2). The byline
--                          is the person's own `admin_profile.display_name`, copied at creation and
--                          kept equal to it (`blog_author_follow_profile()`); `own_name_confirmed_at`
--                          is the person's own "this is my own name" (advisor fix 2), which only
--                          they can give (`app.user_id` = the author's user) and which any change
--                          of the name clears. `consented_at` is the recorded agreement to be named.
--   `blog_post`            one post in one locale: slug, author, status, the published revision.
--   `blog_post_revision`   the post's text. One open draft per post; a revision freezes when it is
--                          approved (`frozen_at`, set only by `attest()`) and is never changed again
--                          except for its first `published_at`.
--   `blog_post_country`    destination country tags, ordered (`sort`: the lowest is the first tag).
--   `blog_post_occasion`   occasion tags.
--   `blog_author_public`   the public read path for authors: `id` and `display_name` of an author
--                          with a published post, and nothing else (a `security_barrier` view, as
--                          `0011`'s partner views): `app_web` and `app_build` never read
--                          `user_id`, `consented_at` or a draft author.
--
-- The hash (`review_blog_revision_hash()`, the twin of `blogRevisionHash()` in
-- `src/modules/i18n/attestation.ts`): `fo.review.blog_post_revision.v1`, then title, slug, excerpt,
-- SEO title, SEO description, body, cover media id, cover alt, `|allows` and one `|a` with the
-- sentence, rule and reason of each honesty allow entry in list order, then `|author` and the
-- author id; each field `|~` (NULL) or `|{UTF-8 byte length}:{value}`, ids as lower-case text. The
-- slug and the author live on the post, so a draft's stored `value_hash` is refreshed when either
-- changes (`blog_post_rehash_drafts()`); a frozen revision keeps the hash it was approved under,
-- and every check reads the hash of what would be served now (`review_subject_hash()`).
--
-- Triggers (§2.4, §5.1 item 5):
--   `blog_revision_hash()`     BEFORE INSERT OR UPDATE on revisions: recomputes `value_hash` (a
--                              frozen revision's is left as it was approved).
--   `blog_revision_freeze()`   BEFORE UPDATE OR DELETE on revisions: a frozen revision changes only
--                              by its first `published_at` (`BLOG_REVISION_FROZEN`); `frozen_at` is
--                              set only under `app.allow_review_write` with an `approved` ledger
--                              row for the current hash written in the same transaction
--                              (`REVIEW_DIRECT_WRITE`, `REVIEW_WITHOUT_ATTESTATION`, as `0023`).
--   `blog_publish_guard()`     BEFORE INSERT OR UPDATE on posts: a published revision must be the
--                              post's own (`BLOG_PUBLISH_FOREIGN_REVISION`), frozen, and its latest
--                              ledger decision `approved` for its current hash
--                              (`BLOG_PUBLISH_WITHOUT_ATTESTATION`); the author must not be withdrawn
--                              (`BLOG_AUTHOR_WITHDRAWN`) and must have confirmed their own name
--                              (`BLOG_AUTHOR_NAME_UNCONFIRMED`).
--   `blog_slug_lock()`         BEFORE UPDATE on posts: once `first_published_at` is set, the slug,
--                              the locale and `first_published_at` itself never change
--                              (`BLOG_SLUG_LOCKED`).
--   helpers                    `blog_post_rehash_drafts()` (AFTER UPDATE OF slug, author_id on
--                              posts), `blog_author_guard()` and `blog_author_follow_profile()`.
--
-- RLS (§5.1 item 7): staff policies on all five tables; `app_web` in the public context and
-- `app_build` read a post only when `status = 'published'`, a revision only when it is the
-- published revision of such a post, a tag only of such a post, and an author only through
-- `blog_author_public`. The audit trigger of `0016` is attached to all five tables, and
-- `audit_mark_real()` to the two that carry `source`.
--
-- Rollback: `0024_blog.down.sql` (the triggers, the tables, the functions, and the previous
-- subject-kind check restored `NOT VALID`, so ledger rows of kind `blog_post_revision` stay).

SET LOCAL ROLE app_owner;

/* ---------------------------------------------------------------------------
 * the ledger learns the new subject kind (§5.1 item 6)
 * ------------------------------------------------------------------------ */

ALTER TABLE public.review_attestation DROP CONSTRAINT review_attestation_subject_kind_check;
ALTER TABLE public.review_attestation
  ADD CONSTRAINT review_attestation_subject_kind_check CHECK (subject_kind IN (
    'message', 'product_translation', 'category_translation', 'addon_translation',
    'occasion_translation', 'corridor_file', 'info_page_file', 'media_asset',
    'blog_post_revision'
  ));

/* ---------------------------------------------------------------------------
 * tables
 * ------------------------------------------------------------------------ */

CREATE TABLE public.blog_author (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid        NOT NULL,
  display_name          text        NOT NULL,
  consented_at          timestamptz NOT NULL,
  own_name_confirmed_at timestamptz NULL,
  withdrawn_at          timestamptz NULL,
  source                text        NOT NULL DEFAULT 'real',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT blog_author_user_id_users_id_fk FOREIGN KEY (user_id)
    REFERENCES public.users (id) ON DELETE RESTRICT,
  CONSTRAINT blog_author_user_id_key UNIQUE (user_id),
  CONSTRAINT blog_author_display_name_check CHECK (length(btrim(display_name)) > 0),
  CONSTRAINT blog_author_source_check CHECK (source IN ('seed', 'real'))
);

CREATE TABLE public.blog_post (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  locale_code           text        NOT NULL,
  slug                  text        NOT NULL,
  author_id             uuid        NOT NULL,
  status                text        NOT NULL DEFAULT 'draft',
  published_revision_id uuid        NULL,
  first_published_at    timestamptz NULL,
  unpublished_at        timestamptz NULL,
  unpublish_reason      text        NULL,
  translation_group_id  uuid        NULL,
  source                text        NOT NULL DEFAULT 'real',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT blog_post_locale_code_locale_code_fk FOREIGN KEY (locale_code)
    REFERENCES public.locale (code) ON DELETE RESTRICT,
  CONSTRAINT blog_post_author_id_blog_author_id_fk FOREIGN KEY (author_id)
    REFERENCES public.blog_author (id) ON DELETE RESTRICT,
  CONSTRAINT blog_post_locale_code_slug_key UNIQUE (locale_code, slug),
  CONSTRAINT blog_post_status_check CHECK (status IN ('draft', 'published', 'unpublished')),
  CONSTRAINT blog_post_published_check CHECK (status <> 'published' OR published_revision_id IS NOT NULL),
  CONSTRAINT blog_post_unpublished_check CHECK (status <> 'unpublished' OR unpublish_reason IS NOT NULL),
  CONSTRAINT blog_post_unpublish_reason_check CHECK (unpublish_reason IS NULL OR btrim(unpublish_reason) <> ''),
  CONSTRAINT blog_post_slug_check CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT blog_post_source_check CHECK (source IN ('seed', 'real'))
);

CREATE TABLE public.blog_post_revision (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id         uuid        NOT NULL,
  title           text        NOT NULL,
  excerpt         text        NOT NULL,
  seo_title       text        NOT NULL,
  seo_description text        NOT NULL,
  body_md         text        NOT NULL,
  cover_media_id  uuid        NULL,
  cover_alt       text        NULL,
  honesty_allow   jsonb       NOT NULL DEFAULT '[]'::jsonb,
  value_hash      char(64)    NOT NULL,
  created_by      uuid        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  frozen_at       timestamptz NULL,
  published_at    timestamptz NULL,
  CONSTRAINT blog_post_revision_post_id_blog_post_id_fk FOREIGN KEY (post_id)
    REFERENCES public.blog_post (id) ON DELETE RESTRICT,
  CONSTRAINT blog_post_revision_cover_media_id_media_asset_id_fk FOREIGN KEY (cover_media_id)
    REFERENCES public.media_asset (id) ON DELETE RESTRICT,
  CONSTRAINT blog_post_revision_created_by_users_id_fk FOREIGN KEY (created_by)
    REFERENCES public.users (id) ON DELETE RESTRICT,
  CONSTRAINT blog_post_revision_cover_check CHECK ((cover_media_id IS NULL) = (cover_alt IS NULL)),
  CONSTRAINT blog_post_revision_published_check CHECK (published_at IS NULL OR frozen_at IS NOT NULL),
  CONSTRAINT blog_post_revision_honesty_allow_check CHECK (jsonb_typeof(honesty_allow) = 'array'),
  CONSTRAINT blog_post_revision_value_hash_check CHECK (value_hash ~ '^[0-9a-f]{64}$')
);

-- One open draft per post (§5.1 item 3).
CREATE UNIQUE INDEX blog_post_revision_open_draft_key
  ON public.blog_post_revision USING btree (post_id) WHERE frozen_at IS NULL;
CREATE INDEX blog_post_revision_post_id_idx
  ON public.blog_post_revision USING btree (post_id, created_at DESC);

ALTER TABLE public.blog_post
  ADD CONSTRAINT blog_post_published_revision_id_blog_post_revision_id_fk
    FOREIGN KEY (published_revision_id) REFERENCES public.blog_post_revision (id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX blog_post_author_id_idx ON public.blog_post USING btree (author_id);
-- The index and the sitemap read newest first per locale.
CREATE INDEX blog_post_locale_published_idx
  ON public.blog_post USING btree (locale_code, first_published_at DESC) WHERE status = 'published';

CREATE TABLE public.blog_post_country (
  post_id    uuid     NOT NULL,
  country_id uuid     NOT NULL,
  sort       smallint NOT NULL,
  CONSTRAINT blog_post_country_pkey PRIMARY KEY (post_id, country_id),
  CONSTRAINT blog_post_country_post_id_sort_key UNIQUE (post_id, sort),
  CONSTRAINT blog_post_country_post_id_blog_post_id_fk FOREIGN KEY (post_id)
    REFERENCES public.blog_post (id) ON DELETE CASCADE,
  CONSTRAINT blog_post_country_country_id_country_id_fk FOREIGN KEY (country_id)
    REFERENCES public.country (id) ON DELETE RESTRICT,
  CONSTRAINT blog_post_country_sort_check CHECK (sort >= 0)
);
CREATE INDEX blog_post_country_country_id_idx ON public.blog_post_country USING btree (country_id);

CREATE TABLE public.blog_post_occasion (
  post_id     uuid NOT NULL,
  occasion_id uuid NOT NULL,
  CONSTRAINT blog_post_occasion_pkey PRIMARY KEY (post_id, occasion_id),
  CONSTRAINT blog_post_occasion_post_id_blog_post_id_fk FOREIGN KEY (post_id)
    REFERENCES public.blog_post (id) ON DELETE CASCADE,
  CONSTRAINT blog_post_occasion_occasion_id_occasion_id_fk FOREIGN KEY (occasion_id)
    REFERENCES public.occasion (id) ON DELETE RESTRICT
);
CREATE INDEX blog_post_occasion_occasion_id_idx ON public.blog_post_occasion USING btree (occasion_id);

CREATE TRIGGER blog_author_set_updated_at BEFORE UPDATE ON public.blog_author
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER blog_post_set_updated_at BEFORE UPDATE ON public.blog_post
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER blog_post_revision_set_updated_at BEFORE UPDATE ON public.blog_post_revision
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

/* ---------------------------------------------------------------------------
 * the hash (§2.4; the twin of `blogRevisionHash()`)
 * ------------------------------------------------------------------------ */

CREATE FUNCTION public.review_blog_revision_hash(
  p_title           text,
  p_slug            text,
  p_excerpt         text,
  p_seo_title       text,
  p_seo_description text,
  p_body_md         text,
  p_cover_media_id  uuid,
  p_cover_alt       text,
  p_honesty_allow   jsonb,
  p_author_id       uuid
) RETURNS text
  LANGUAGE sql
  IMMUTABLE
  SET search_path = pg_catalog, public
AS $fn$
  SELECT encode(sha256(convert_to(
    'fo.review.blog_post_revision.v1'
      || public.review_hash_part(p_title)
      || public.review_hash_part(p_slug)
      || public.review_hash_part(p_excerpt)
      || public.review_hash_part(p_seo_title)
      || public.review_hash_part(p_seo_description)
      || public.review_hash_part(p_body_md)
      || public.review_hash_part(lower(p_cover_media_id::text))
      || public.review_hash_part(p_cover_alt)
      || '|allows'
      || coalesce((
        SELECT string_agg(
                 '|a' || public.review_hash_part(e.value ->> 'sentence')
                      || public.review_hash_part(e.value ->> 'rule')
                      || public.review_hash_part(e.value ->> 'reason'),
                 '' ORDER BY e.ordinality)
        FROM jsonb_array_elements(coalesce(p_honesty_allow, '[]'::jsonb)) WITH ORDINALITY AS e(value, ordinality)
      ), '')
      || '|author'
      || public.review_hash_part(lower(p_author_id::text)),
    'UTF8')), 'hex')
$fn$;

-- The hash of what a revision would serve now: its own fields with its post's slug and author.
CREATE FUNCTION public.review_blog_revision_current_hash(p_revision_id uuid) RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $fn$
  SELECT public.review_blog_revision_hash(
           r.title, p.slug, r.excerpt, r.seo_title, r.seo_description, r.body_md,
           r.cover_media_id, r.cover_alt, r.honesty_allow, p.author_id)
  FROM public.blog_post_revision r
  JOIN public.blog_post p ON p.id = r.post_id
  WHERE r.id = p_revision_id
$fn$;

-- `0023`'s function, with the third kind: a revision is referenced by its id and reviewed in its
-- post's locale; any other locale, or a reference that is not a revision, has no hash.
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
    WHEN 'blog_post_revision' THEN (
      SELECT public.review_blog_revision_current_hash(r.id)
      FROM public.blog_post_revision r
      JOIN public.blog_post p ON p.id = r.post_id
      WHERE r.id::text = p_ref AND p.locale_code = p_locale_code)
  END
$fn$;

-- Whether a revision's latest ledger decision is `approved` for `p_hash`. `p_own` also requires
-- the row to have been written by this transaction (the freeze, as `0023`'s guard).
CREATE FUNCTION public.blog_revision_approved(p_revision_id uuid, p_locale_code text, p_hash text,
                                              p_own boolean)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $fn$
  SELECT coalesce((
    SELECT a.decision = 'approved' AND a.value_hash = p_hash
           AND (NOT p_own OR public.review_row_is_own(a.xmin))
    FROM public.review_attestation a
    WHERE a.subject_kind = 'blog_post_revision'
      AND a.subject_ref = p_revision_id::text
      AND a.locale_code = p_locale_code
    ORDER BY a.attested_at DESC, (a.channel = 'admin') DESC, a.id DESC
    LIMIT 1
  ), false)
$fn$;

/* ---------------------------------------------------------------------------
 * revisions: hash and freeze
 * ------------------------------------------------------------------------ */

CREATE FUNCTION public.blog_revision_hash() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_slug   text;
  v_author uuid;
BEGIN
  -- A frozen revision keeps the hash it was approved under (`blog_revision_freeze()` refuses the
  -- rest of the change).
  IF TG_OP = 'UPDATE' AND OLD.frozen_at IS NOT NULL THEN
    NEW.value_hash := OLD.value_hash;
    RETURN NEW;
  END IF;
  SELECT p.slug, p.author_id INTO v_slug, v_author FROM public.blog_post p WHERE p.id = NEW.post_id;
  NEW.value_hash := public.review_blog_revision_hash(
    NEW.title, v_slug, NEW.excerpt, NEW.seo_title, NEW.seo_description, NEW.body_md,
    NEW.cover_media_id, NEW.cover_alt, NEW.honesty_allow, v_author);
  RETURN NEW;
END;
$fn$;

CREATE FUNCTION public.blog_revision_freeze() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_locale text;
  v_slug   text;
  v_author uuid;
  v_hash   text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.frozen_at IS NOT NULL THEN
      RAISE EXCEPTION 'BLOG_REVISION_FROZEN: revision % was approved and is never deleted', OLD.id
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.frozen_at IS NOT NULL THEN
    -- The one change a frozen revision takes: its first publish time.
    IF OLD.published_at IS NULL AND NEW.published_at IS NOT NULL
       AND (to_jsonb(NEW) - 'published_at' - 'updated_at')
           = (to_jsonb(OLD) - 'published_at' - 'updated_at') THEN
      RETURN NEW;
    END IF;
    IF to_jsonb(NEW) - 'updated_at' = to_jsonb(OLD) - 'updated_at' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'BLOG_REVISION_FROZEN: revision % was approved or published and never changes', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NEW.published_at IS NOT NULL AND NEW.frozen_at IS NULL THEN
    RAISE EXCEPTION 'BLOG_REVISION_FROZEN: only an approved revision is published'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NEW.frozen_at IS NOT NULL THEN
    -- Freezing: `attest()` alone, under the session flag, with its own approved ledger row.
    IF coalesce(current_setting('app.allow_review_write', true), '') <> 'on' THEN
      RAISE EXCEPTION 'REVIEW_DIRECT_WRITE: blog_post_revision.frozen_at changes only through attest()'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT p.locale_code, p.slug, p.author_id INTO v_locale, v_slug, v_author
      FROM public.blog_post p WHERE p.id = NEW.post_id;
    v_hash := public.review_blog_revision_hash(
      NEW.title, v_slug, NEW.excerpt, NEW.seo_title, NEW.seo_description, NEW.body_md,
      NEW.cover_media_id, NEW.cover_alt, NEW.honesty_allow, v_author);
    IF NOT public.blog_revision_approved(NEW.id, v_locale, v_hash, true) THEN
      RAISE EXCEPTION 'REVIEW_WITHOUT_ATTESTATION: blog_post_revision needs an approved review_attestation row for its current hash in this transaction'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

-- Named so the hash runs before the freeze check (BEFORE triggers fire in name order).
CREATE TRIGGER blog_post_revision_a_hash
  BEFORE INSERT OR UPDATE ON public.blog_post_revision
  FOR EACH ROW EXECUTE FUNCTION public.blog_revision_hash();
CREATE TRIGGER blog_post_revision_b_freeze
  BEFORE INSERT OR UPDATE OR DELETE ON public.blog_post_revision
  FOR EACH ROW EXECUTE FUNCTION public.blog_revision_freeze();

/* ---------------------------------------------------------------------------
 * posts: the publish guard, the slug lock, draft rehash
 * ------------------------------------------------------------------------ */


CREATE FUNCTION public.blog_publish_guard() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_rev_post  uuid;
  v_frozen    timestamptz;
  v_hash      text;
  v_withdrawn timestamptz;
  v_confirmed timestamptz;
BEGIN
  -- What makes text public: a new published pointer, or a post becoming `published`. Anything
  -- else (an unpublish, a reassignment, a tag or timestamp change) publishes nothing new.
  IF TG_OP = 'UPDATE'
     AND NEW.published_revision_id IS NOT DISTINCT FROM OLD.published_revision_id
     AND NOT (NEW.status = 'published' AND OLD.status <> 'published') THEN
    RETURN NEW;
  END IF;
  IF NEW.published_revision_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT r.post_id, r.frozen_at,
         public.review_blog_revision_hash(
           r.title, NEW.slug, r.excerpt, r.seo_title, r.seo_description, r.body_md,
           r.cover_media_id, r.cover_alt, r.honesty_allow, NEW.author_id)
    INTO v_rev_post, v_frozen, v_hash
    FROM public.blog_post_revision r WHERE r.id = NEW.published_revision_id;
  IF v_rev_post IS DISTINCT FROM NEW.id THEN
    RAISE EXCEPTION 'BLOG_PUBLISH_FOREIGN_REVISION: post % publishes only its own revisions', NEW.id
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF v_frozen IS NULL
     OR NOT public.blog_revision_approved(NEW.published_revision_id, NEW.locale_code, v_hash, false) THEN
    RAISE EXCEPTION 'BLOG_PUBLISH_WITHOUT_ATTESTATION: revision % has no approved review_attestation row for its current hash', NEW.published_revision_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT a.withdrawn_at, a.own_name_confirmed_at INTO v_withdrawn, v_confirmed
    FROM public.blog_author a WHERE a.id = NEW.author_id;
  IF v_withdrawn IS NOT NULL THEN
    RAISE EXCEPTION 'BLOG_AUTHOR_WITHDRAWN: post % has a withdrawn author', NEW.id
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF v_confirmed IS NULL THEN
    RAISE EXCEPTION 'BLOG_AUTHOR_NAME_UNCONFIRMED: the author of post % has not confirmed their own name', NEW.id
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE FUNCTION public.blog_slug_lock() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF OLD.first_published_at IS NOT NULL
     AND (NEW.slug IS DISTINCT FROM OLD.slug
          OR NEW.locale_code IS DISTINCT FROM OLD.locale_code
          OR NEW.first_published_at IS DISTINCT FROM OLD.first_published_at) THEN
    RAISE EXCEPTION 'BLOG_SLUG_LOCKED: post % was published, so its URL never changes', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

-- A draft's stored hash follows its post's slug and author (both are hashed).
CREATE FUNCTION public.blog_post_rehash_drafts() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $fn$
BEGIN
  UPDATE public.blog_post_revision r
     SET value_hash = public.review_blog_revision_hash(
           r.title, NEW.slug, r.excerpt, r.seo_title, r.seo_description, r.body_md,
           r.cover_media_id, r.cover_alt, r.honesty_allow, NEW.author_id)
   WHERE r.post_id = NEW.id AND r.frozen_at IS NULL;
  RETURN NULL;
END;
$fn$;

CREATE TRIGGER blog_post_publish_guard
  BEFORE INSERT OR UPDATE ON public.blog_post
  FOR EACH ROW EXECUTE FUNCTION public.blog_publish_guard();
CREATE TRIGGER blog_post_slug_lock
  BEFORE UPDATE ON public.blog_post
  FOR EACH ROW EXECUTE FUNCTION public.blog_slug_lock();
CREATE TRIGGER blog_post_rehash_drafts
  AFTER UPDATE OF slug, author_id ON public.blog_post
  FOR EACH ROW EXECUTE FUNCTION public.blog_post_rehash_drafts();

/* ---------------------------------------------------------------------------
 * authors: the person's own name (§2.2, advisor fix 2)
 * ------------------------------------------------------------------------ */

CREATE FUNCTION public.blog_author_guard() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_profile_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- The byline is the person's own admin display name, copied at creation.
    SELECT p.display_name INTO v_profile_name
      FROM public.admin_profile p WHERE p.user_id = NEW.user_id;
    IF v_profile_name IS NULL OR btrim(v_profile_name) = '' THEN
      RAISE EXCEPTION 'BLOG_AUTHOR_NOT_ADMIN: an author is a person with an admin account and a display name'
        USING ERRCODE = 'restrict_violation';
    END IF;
    NEW.display_name := v_profile_name;
    IF NEW.own_name_confirmed_at IS NOT NULL
       AND public.app_current_user_id() IS DISTINCT FROM NEW.user_id THEN
      RAISE EXCEPTION 'BLOG_AUTHOR_NAME_NOT_OWN: only the person named confirms their own name'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'BLOG_AUTHOR_USER_LOCKED: an author record names one person for good'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.display_name IS DISTINCT FROM OLD.display_name THEN
    -- A changed name is not the name the person confirmed.
    NEW.own_name_confirmed_at := NULL;
    RETURN NEW;
  END IF;
  IF NEW.own_name_confirmed_at IS NOT NULL
     AND NEW.own_name_confirmed_at IS DISTINCT FROM OLD.own_name_confirmed_at
     AND public.app_current_user_id() IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'BLOG_AUTHOR_NAME_NOT_OWN: only the person named confirms their own name'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER blog_author_guard
  BEFORE INSERT OR UPDATE ON public.blog_author
  FOR EACH ROW EXECUTE FUNCTION public.blog_author_guard();

-- `display_name` follows the person's admin display name (§5.1 item 1).
CREATE FUNCTION public.blog_author_follow_profile() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $fn$
BEGIN
  UPDATE public.blog_author a
     SET display_name = NEW.display_name
   WHERE a.user_id = NEW.user_id AND a.display_name IS DISTINCT FROM NEW.display_name;
  RETURN NULL;
END;
$fn$;

CREATE TRIGGER admin_profile_blog_author_follow
  AFTER UPDATE OF display_name ON public.admin_profile
  FOR EACH ROW EXECUTE FUNCTION public.blog_author_follow_profile();

REVOKE EXECUTE ON FUNCTION public.review_blog_revision_current_hash(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.blog_revision_approved(uuid, text, text, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.blog_revision_hash() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.blog_revision_freeze() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.blog_publish_guard() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.blog_post_rehash_drafts() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.blog_author_guard() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.blog_author_follow_profile() FROM PUBLIC;

/* ---------------------------------------------------------------------------
 * the audit trail (`0016`) on all five tables
 * ------------------------------------------------------------------------ */

CREATE TRIGGER blog_author_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.blog_author
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('id');
CREATE TRIGGER blog_post_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.blog_post
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('id');
CREATE TRIGGER blog_post_revision_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.blog_post_revision
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('id');
CREATE TRIGGER blog_post_country_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.blog_post_country
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('post_id', 'country_id');
CREATE TRIGGER blog_post_occasion_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.blog_post_occasion
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('post_id', 'occasion_id');

CREATE TRIGGER blog_author_audit_source
  BEFORE INSERT OR UPDATE ON public.blog_author
  FOR EACH ROW EXECUTE FUNCTION public.audit_mark_real();
CREATE TRIGGER blog_post_audit_source
  BEFORE INSERT OR UPDATE ON public.blog_post
  FOR EACH ROW EXECUTE FUNCTION public.audit_mark_real();

/* ---------------------------------------------------------------------------
 * the public author view (§5.1 item 7)
 * ------------------------------------------------------------------------ */

CREATE VIEW public.blog_author_public WITH (security_barrier = true) AS
  SELECT a.id, a.display_name
  FROM public.blog_author a
  WHERE EXISTS (
    SELECT 1 FROM public.blog_post p
    WHERE p.author_id = a.id AND p.status = 'published'
  );

-- Read only: the default privileges of `0001` grant DML on every new relation to `app_web`, and a
-- simple view is updatable, so everything but SELECT is taken back.
REVOKE ALL ON public.blog_author_public FROM app_web;
GRANT SELECT ON public.blog_author_public TO app_web;
GRANT SELECT ON public.blog_author_public TO app_build;

/* ---------------------------------------------------------------------------
 * RLS (§5.1 item 7)
 * ------------------------------------------------------------------------ */

ALTER TABLE public.blog_author ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_post ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_post_revision ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_post_country ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_post_occasion ENABLE ROW LEVEL SECURITY;

CREATE POLICY blog_author_staff ON public.blog_author FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY blog_post_staff ON public.blog_post FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY blog_post_revision_staff ON public.blog_post_revision FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY blog_post_country_staff ON public.blog_post_country FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY blog_post_occasion_staff ON public.blog_post_occasion FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());

CREATE POLICY blog_post_read ON public.blog_post FOR SELECT TO app_web
  USING (status = 'published');
CREATE POLICY blog_post_revision_read ON public.blog_post_revision FOR SELECT TO app_web
  USING (EXISTS (SELECT 1 FROM public.blog_post p WHERE p.id = blog_post_revision.post_id AND p.status = 'published' AND p.published_revision_id = blog_post_revision.id));
CREATE POLICY blog_post_country_read ON public.blog_post_country FOR SELECT TO app_web
  USING (EXISTS (SELECT 1 FROM public.blog_post p WHERE p.id = blog_post_country.post_id AND p.status = 'published'));
CREATE POLICY blog_post_occasion_read ON public.blog_post_occasion FOR SELECT TO app_web
  USING (EXISTS (SELECT 1 FROM public.blog_post p WHERE p.id = blog_post_occasion.post_id AND p.status = 'published'));

-- The build reads what a public render reads (`0018`'s rule).
GRANT SELECT ON public.blog_post, public.blog_post_revision, public.blog_post_country,
  public.blog_post_occasion TO app_build;

CREATE POLICY blog_post_build_read ON public.blog_post FOR SELECT TO app_build
  USING (status = 'published');
CREATE POLICY blog_post_revision_build_read ON public.blog_post_revision FOR SELECT TO app_build
  USING (EXISTS (SELECT 1 FROM public.blog_post p WHERE p.id = blog_post_revision.post_id AND p.status = 'published' AND p.published_revision_id = blog_post_revision.id));
CREATE POLICY blog_post_country_build_read ON public.blog_post_country FOR SELECT TO app_build
  USING (EXISTS (SELECT 1 FROM public.blog_post p WHERE p.id = blog_post_country.post_id AND p.status = 'published'));
CREATE POLICY blog_post_occasion_build_read ON public.blog_post_occasion FOR SELECT TO app_build
  USING (EXISTS (SELECT 1 FROM public.blog_post p WHERE p.id = blog_post_occasion.post_id AND p.status = 'published'));

RESET ROLE;
