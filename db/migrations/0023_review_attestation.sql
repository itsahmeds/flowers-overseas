-- 0023_review_attestation — the review ledger for catalogue text and photos (spec 012b §2.4,
-- §5.1 item 2 `NNNN_review_attestation`, AC-10, AC-11, AC-12, AC-13, AC-28; proposed ADR-0022,
-- Appendix B; TASK-293).
--
--   `reviewer_locale`       which locales a signed-in person may review (§13 Q7: the founder holds
--                           `en` and `en-gb`, a native reviewer `pl` or `de`). Granted and revoked
--                           by `pnpm admin:grant --locale / --revoke-locale`; a row is never
--                           needed for photos, which take the `media.review` permission instead.
--   `review_attestation`    the ledger. Append-only: one row per decision on one subject (kind,
--                           reference, locale), bound to the SHA-256 of the exact text or image
--                           reviewed (`value_hash`) and of the English source it was read against
--                           (`source_hash`), with the attester's user id and `display_name` and
--                           the database's `now()`. A subject is **reviewed** exactly when its
--                           latest decision is `approved` and that row's `value_hash` equals the
--                           hash of what is served now (`review_subject_hash`). UPDATE, DELETE
--                           and TRUNCATE raise `REVIEW_LEDGER_APPEND_ONLY`, with one carve-out:
--                           the retention sweep's pseudonymisation of `attester_name` (AC-28).
--   subjects in slice A     `product_translation` — reference the product's `sku`, locale the
--                           translation's; `media_asset` — reference the asset's
--                           `checksum_sha256` (a photo *is* its bytes, so the reference is the
--                           same on every database the ledger is replayed into), no locale. The
--                           other six kinds are admitted by the CHECK for slice B and have no
--                           hash function here.
--   `review_subject_hash()` the hash of what is served now: for product copy, the name, slug,
--                           description, SEO title and SEO description of the translation and the
--                           alt text, in that locale, of every image attached to the product
--                           (each length-prefixed, the alts ordered by the image's checksum, all
--                           in UTF-8, so `subjectHash()` in `src/modules/i18n/attestation.ts`
--                           computes the same 64 hex digits from the same fields); for a photo,
--                           its checksum.
--   `review_write_guard()`  BEFORE INSERT OR UPDATE on `product_translation` and `media_asset`.
--                           Their review columns (`reviewed`, `reviewed_by`, `reviewed_at`;
--                           `review_state`, `reviewed_by`, `reviewed_at`) change only under
--                           `SET LOCAL app.allow_review_write = 'on'`, else `REVIEW_DIRECT_WRITE`;
--                           and `reviewed = true` / `review_state = 'approved'` also needs an
--                           `approved` ledger row for that subject, for its current hash, written
--                           **in the same transaction** (the row's `xmin` is still in progress:
--                           `review_row_is_own()`), else `REVIEW_WITHOUT_ATTESTATION`. `attest()` in
--                           `src/modules/i18n/db/ledger.ts` is the only code that does both. An
--                           edit of the hashed text of a reviewed translation, or of a reviewed
--                           photo's checksum, un-reviews the row in the same statement (ADR-0022:
--                           "editing approved text un-approves it automatically"); the alt text
--                           lives in another table, so readers take the answer from the ledger
--                           (`reviewState()`), never from the column alone.
--   retention               `retention_policy` row `review_attestation`: `attester_name` becomes
--                           "Reviewer {n}" 3 years after the attester's
--                           `admin_profile.deactivated_at` (`retention.sweep`, AC-28).
--
-- RLS on both tables: staff only (`app_is_staff()`, admin and system), like every identity table;
-- the append-only trigger is what keeps the staff policy from meaning "update and delete". Runtime
-- review lookups run in `withSystemContext('attestations.read')` and select subject, hash, decision
-- and channel only, never the attester's name. The build role (`0018`) reads neither table.
--
-- Rollback: `0023_review_attestation.down.sql` (the guard triggers, the retention row, then the
-- tables and functions).

SET LOCAL ROLE app_owner;

/* ---------------------------------------------------------------------------
 * reviewer_locale — who may review which locale
 * ------------------------------------------------------------------------ */

CREATE TABLE public.reviewer_locale (
  user_id     uuid        NOT NULL,
  locale_code text        NOT NULL,
  granted_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reviewer_locale_user_id_users_id_fk FOREIGN KEY (user_id)
    REFERENCES public.users (id) ON DELETE CASCADE,
  CONSTRAINT reviewer_locale_locale_code_locale_code_fk FOREIGN KEY (locale_code)
    REFERENCES public.locale (code) ON DELETE RESTRICT,
  CONSTRAINT reviewer_locale_user_id_locale_code_key UNIQUE (user_id, locale_code)
);

/* ---------------------------------------------------------------------------
 * review_attestation — the ledger
 * ------------------------------------------------------------------------ */

CREATE TABLE public.review_attestation (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_kind     text        NOT NULL,
  subject_ref      text        NOT NULL,
  locale_code      text        NULL,
  value_hash       char(64)    NOT NULL,
  source_hash      char(64)    NULL,
  decision         text        NOT NULL,
  note             text        NULL,
  suggested_text   text        NULL,
  attester_user_id uuid        NULL,
  attester_name    text        NOT NULL,
  channel          text        NOT NULL,
  attested_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT review_attestation_locale_code_locale_code_fk FOREIGN KEY (locale_code)
    REFERENCES public.locale (code) ON DELETE RESTRICT,
  CONSTRAINT review_attestation_attester_user_id_users_id_fk FOREIGN KEY (attester_user_id)
    REFERENCES public.users (id) ON DELETE RESTRICT,
  CONSTRAINT review_attestation_subject_kind_check CHECK (subject_kind IN (
    'message', 'product_translation', 'category_translation', 'addon_translation',
    'occasion_translation', 'corridor_file', 'info_page_file', 'media_asset'
  )),
  CONSTRAINT review_attestation_decision_check CHECK (decision IN (
    'approved', 'changes_requested', 'rejected'
  )),
  CONSTRAINT review_attestation_channel_check CHECK (channel IN ('admin', 'import')),
  CONSTRAINT review_attestation_attester_check CHECK (
    channel = 'import' OR attester_user_id IS NOT NULL
  ),
  CONSTRAINT review_attestation_note_check CHECK (
    decision <> 'changes_requested' OR note IS NOT NULL
  ),
  CONSTRAINT review_attestation_value_hash_check CHECK (value_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT review_attestation_source_hash_check CHECK (
    source_hash IS NULL OR source_hash ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT review_attestation_subject_ref_check CHECK (btrim(subject_ref) <> ''),
  CONSTRAINT review_attestation_attester_name_check CHECK (btrim(attester_name) <> ''),
  CONSTRAINT review_attestation_note_text_check CHECK (note IS NULL OR btrim(note) <> ''),
  CONSTRAINT review_attestation_locale_check CHECK (
    (subject_kind = 'media_asset' AND locale_code IS NULL)
    OR (subject_kind <> 'media_asset' AND locale_code IS NOT NULL)
  )
);

-- A subject's history, newest first: what `reviewState()` and the guard read.
CREATE INDEX review_attestation_subject_idx
  ON public.review_attestation USING btree (subject_kind, subject_ref, locale_code, attested_at DESC);

-- The retention sweep's selection (AC-28).
CREATE INDEX review_attestation_attester_user_id_idx
  ON public.review_attestation USING btree (attester_user_id);

/* ---------------------------------------------------------------------------
 * append-only, with the one retention carve-out (AC-10, AC-28)
 * ------------------------------------------------------------------------ */

-- The pseudonym the retention sweep writes: "Reviewer {n}", n a positive integer.
CREATE FUNCTION public.review_attestation_append_only() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public
AS $fn$
BEGIN
  -- The one UPDATE allowed: the retention sweep (`app.role = 'system'` and
  -- `app.retention_policy = 'review_attestation'`) replacing a signed-in attester's name with
  -- its pseudonym, once, and nothing else in the row.
  IF TG_OP = 'UPDATE'
     AND coalesce(current_setting('app.role', true), '') = 'system'
     AND coalesce(current_setting('app.retention_policy', true), '') = 'review_attestation'
     AND OLD.attester_user_id IS NOT NULL
     AND OLD.attester_name !~ '^Reviewer [1-9][0-9]*$'
     AND NEW.attester_name ~ '^Reviewer [1-9][0-9]*$'
     AND (to_jsonb(NEW) - 'attester_name') = (to_jsonb(OLD) - 'attester_name') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'REVIEW_LEDGER_APPEND_ONLY: review_attestation is append-only (% refused)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$fn$;

CREATE TRIGGER review_attestation_append_only
  BEFORE UPDATE OR DELETE ON public.review_attestation
  FOR EACH ROW EXECUTE FUNCTION public.review_attestation_append_only();
CREATE TRIGGER review_attestation_no_truncate
  BEFORE TRUNCATE ON public.review_attestation
  FOR EACH STATEMENT EXECUTE FUNCTION public.review_attestation_append_only();

/* ---------------------------------------------------------------------------
 * the subject hash — the same 64 hex digits as `subjectHash()` in TypeScript
 * ------------------------------------------------------------------------ */

-- One field of the canonical text: `|~` for NULL, else `|{octet length}:{value}`. Length-prefixed,
-- so no choice of text in one field can imitate a boundary between two.
CREATE FUNCTION public.review_hash_part(p_value text) RETURNS text
  LANGUAGE sql
  IMMUTABLE
  SET search_path = pg_catalog
AS $fn$
  SELECT CASE WHEN p_value IS NULL THEN '|~'
              ELSE '|' || octet_length(p_value)::text || ':' || p_value END
$fn$;

-- The product copy subject (§2.4): five fields of the translation and the alt text, in that
-- locale, of every image attached to the product, ordered by the image's checksum (byte order).
CREATE FUNCTION public.review_product_copy_hash(
  p_product_id      uuid,
  p_locale_code     text,
  p_name            text,
  p_slug            text,
  p_description_md  text,
  p_seo_title       text,
  p_seo_description text
) RETURNS text
  LANGUAGE sql
  STABLE
  SET search_path = pg_catalog, public
AS $fn$
  SELECT encode(sha256(convert_to(
    'fo.review.product_translation.v1'
      || public.review_hash_part(p_name)
      || public.review_hash_part(p_slug)
      || public.review_hash_part(p_description_md)
      || public.review_hash_part(p_seo_title)
      || public.review_hash_part(p_seo_description)
      || '|alts'
      || coalesce((
        SELECT string_agg(
                 '|alt' || public.review_hash_part(a.checksum_sha256) || public.review_hash_part(x.alt),
                 '' ORDER BY a.checksum_sha256 COLLATE "C", x.alt COLLATE "C")
        FROM public.product_media pm
        JOIN public.media_asset a ON a.id = pm.media_asset_id
        JOIN public.product_media_alt x
          ON x.product_media_id = pm.id AND x.locale_code = p_locale_code
        WHERE pm.product_id = p_product_id
      ), ''),
    'UTF8')), 'hex')
$fn$;

-- The hash of what is served now for a subject, or NULL when the subject does not exist (or is a
-- slice B kind, which has no hash here yet).
CREATE FUNCTION public.review_subject_hash(p_kind text, p_ref text, p_locale_code text)
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

/* ---------------------------------------------------------------------------
 * "written in this transaction"
 * ------------------------------------------------------------------------ */

-- Whether a row the caller can see was inserted by the caller's own transaction (or one of its
-- savepoints): its `xmin` is still in progress. A visible row whose inserter has not committed
-- can only be one's own. `xmin` holds the low 32 bits of a 64-bit transaction id; the full id is
-- the one with those bits nearest the transaction's own id (a savepoint's id is a little above
-- it), so an epoch boundary between the two is handled.
CREATE FUNCTION public.review_row_is_own(p_xmin xid) RETURNS boolean
  LANGUAGE sql
  VOLATILE
  SET search_path = pg_catalog
AS $fn$
  WITH r AS (
    SELECT pg_current_xact_id()::text::bigint AS own, p_xmin::text::bigint AS low
  ), c AS (
    SELECT ((own >> 32) << 32) + low AS guess, own FROM r
  ), f AS (
    SELECT CASE WHEN guess > own + 2147483648 THEN guess - 4294967296
                WHEN guess < own - 2147483648 THEN guess + 4294967296
                ELSE guess END AS full_id
    FROM c
  )
  SELECT full_id >= 0 AND pg_xact_status(full_id::text::xid8) = 'in progress' FROM f
$fn$;

/* ---------------------------------------------------------------------------
 * review_write_guard() — one writer for the review columns (AC-10)
 * ------------------------------------------------------------------------ */

CREATE FUNCTION public.review_write_guard() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_written   boolean;
  v_approved  boolean;
  v_ref       text;
  v_locale    text;
  v_hash      text;
BEGIN
  IF TG_TABLE_NAME = 'product_translation' THEN
    IF TG_OP = 'INSERT' THEN
      v_written := NEW.reviewed OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL;
    ELSE
      v_written := (NEW.reviewed, NEW.reviewed_by, NEW.reviewed_at)
                   IS DISTINCT FROM (OLD.reviewed, OLD.reviewed_by, OLD.reviewed_at);
      -- An edit of the hashed text of a reviewed row that does not itself touch the review
      -- columns un-reviews it (the alt text is the ledger's to judge: it lives in another table).
      IF NOT v_written AND NEW.reviewed
         AND (NEW.name, NEW.slug, NEW.description_md, NEW.seo_title, NEW.seo_description)
             IS DISTINCT FROM (OLD.name, OLD.slug, OLD.description_md, OLD.seo_title, OLD.seo_description) THEN
        NEW.reviewed := false;
        RETURN NEW;
      END IF;
    END IF;
    v_approved := NEW.reviewed;
  ELSE
    IF TG_OP = 'INSERT' THEN
      v_written := NEW.review_state <> 'pending' OR NEW.reviewed_by IS NOT NULL
                   OR NEW.reviewed_at IS NOT NULL;
    ELSE
      v_written := (NEW.review_state, NEW.reviewed_by, NEW.reviewed_at)
                   IS DISTINCT FROM (OLD.review_state, OLD.reviewed_by, OLD.reviewed_at);
      -- New bytes under an approved asset are not what was approved.
      IF NOT v_written AND NEW.review_state = 'approved'
         AND NEW.checksum_sha256 IS DISTINCT FROM OLD.checksum_sha256 THEN
        NEW.review_state := 'pending';
        RETURN NEW;
      END IF;
    END IF;
    v_approved := NEW.review_state = 'approved';
  END IF;

  IF NOT v_written THEN
    RETURN NEW;
  END IF;

  IF coalesce(current_setting('app.allow_review_write', true), '') <> 'on' THEN
    RAISE EXCEPTION 'REVIEW_DIRECT_WRITE: %.% review columns change only through attest()',
      TG_TABLE_NAME, TG_OP
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_approved THEN
    IF TG_TABLE_NAME = 'product_translation' THEN
      SELECT p.sku INTO v_ref FROM public.product p WHERE p.id = NEW.product_id;
      v_locale := NEW.locale_code;
      v_hash := public.review_product_copy_hash(
        NEW.product_id, NEW.locale_code, NEW.name, NEW.slug, NEW.description_md, NEW.seo_title,
        NEW.seo_description);
    ELSE
      v_ref := NEW.checksum_sha256;
      v_locale := NULL;
      v_hash := NEW.checksum_sha256;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.review_attestation a
      WHERE a.subject_kind = TG_TABLE_NAME
        AND a.subject_ref = v_ref
        AND a.locale_code IS NOT DISTINCT FROM v_locale
        AND a.decision = 'approved'
        AND a.value_hash = v_hash
        -- written by this very transaction, in a savepoint or not
        AND public.review_row_is_own(a.xmin)
    ) THEN
      RAISE EXCEPTION 'REVIEW_WITHOUT_ATTESTATION: % needs an approved review_attestation row for its current hash in this transaction',
        TG_TABLE_NAME
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER product_translation_review_write_guard
  BEFORE INSERT OR UPDATE ON public.product_translation
  FOR EACH ROW EXECUTE FUNCTION public.review_write_guard();
CREATE TRIGGER media_asset_review_write_guard
  BEFORE INSERT OR UPDATE ON public.media_asset
  FOR EACH ROW EXECUTE FUNCTION public.review_write_guard();

REVOKE EXECUTE ON FUNCTION public.review_attestation_append_only() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.review_write_guard() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.review_row_is_own(xid) FROM PUBLIC;

/* ---------------------------------------------------------------------------
 * RLS: staff only
 * ------------------------------------------------------------------------ */

ALTER TABLE public.reviewer_locale ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_attestation ENABLE ROW LEVEL SECURITY;

CREATE POLICY reviewer_locale_staff ON public.reviewer_locale FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY review_attestation_staff ON public.review_attestation FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());

/* ---------------------------------------------------------------------------
 * retention (AC-28; spec 012b §8 data flow 1)
 * ------------------------------------------------------------------------ */

INSERT INTO public.retention_policy (key, entity_table, basis, retention_days, action, legal_note) VALUES
  ('review_attestation', 'review_attestation', 'Art. 6(1)(f) and Art. 5(2) accountability', 1095,
   'pseudonymise',
   'Spec 012b §8: attester names are pseudonymised to "Reviewer n" 3 years after the account is deactivated; the decision, the hashes and the time stay as the record of who approved published text.');

RESET ROLE;
