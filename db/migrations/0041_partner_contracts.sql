-- 0041_partner_contracts (spec 030b §14.3 `NNNN_partner_contracts`, §14.2 A, §13 Q15 to Q21;
-- AC-37, AC-38, AC-41, AC-43, AC-44, AC-57, AC-59; TASK-442).
--
-- The florist contract register: one row per stored PDF version (the file lives in the private
-- R2 bucket at `originals/contract/{id}`, the row holds its key, size and checksum; ADR-0015).
--
--   1. `partner_contract`: kind (`agreement`, `dpa_addendum`, `annex`), version per (florist,
--      kind), template version, language, dates, review date and notice, the Art. 28 flag, a
--      note, the object's key, bytes, pages and SHA-256, who uploaded it and when, and the
--      superseding link. At most one current `agreement` and one current `dpa_addendum` per
--      florist (partial unique index); an `annex` never supersedes.
--   2. `partner_contract_guard`: the file facts are immutable (`CONTRACT_FILE_IMMUTABLE`); a row
--      may be deleted only within 7 days of its upload (`CONTRACT_WITHDRAW_WINDOW_CLOSED`) and
--      never while it is the only agreement of an `active` florist
--      (`CONTRACT_ONLY_AGREEMENT_PARTNER_ACTIVE`); the retention sweep (system context) is exempt.
--   3. `partner_activation_requires_agreement` (founder, 2026-10-24, "Q21 blocks"): no move to
--      `active` without a current `agreement` row (`PARTNER_NO_SIGNED_AGREEMENT`), whatever the
--      write path. Florists already `active` are not touched (§14.8).
--   4. `audit_mask_columns()` gains `partner_contract.note`; the audit trigger is attached.
--   5. `retention_policy` row `partner_contract`: 10 years after the florist's `offboarded_at`
--      (§13 Q16), object first, then the row.
--   6. RLS: staff (`admin`, `system`) only; no grant to `app_build`.
--
-- Rollback: `0041_partner_contracts.down.sql`, guarded by `PARTNER_CONTRACTS_ROLLBACK_ROWS_IN_USE`.

SET LOCAL ROLE app_owner;

/* ---------------------------------------------------------------------------
 * 1. partner_contract
 * ------------------------------------------------------------------------ */

CREATE TABLE public.partner_contract (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id       uuid        NOT NULL,
  doc_kind         text        NOT NULL,
  version_no       integer     NOT NULL,
  template_version text        NOT NULL,
  language_code    text        NOT NULL,
  includes_dpa     boolean     NOT NULL DEFAULT false,
  signed_on        date        NOT NULL,
  effective_on     date        NOT NULL,
  review_on        date        NULL,
  notice_days      integer     NOT NULL DEFAULT 30,
  note             text        NULL,
  bucket           text        NOT NULL,
  object_key       text        NOT NULL,
  bytes            integer     NOT NULL,
  page_count       integer     NOT NULL,
  checksum_sha256  text        NOT NULL,
  uploaded_by      uuid        NOT NULL,
  uploaded_at      timestamptz NOT NULL DEFAULT now(),
  superseded_at    timestamptz NULL,
  superseded_by    uuid        NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_contract_partner_id_fulfillment_partner_id_fk FOREIGN KEY (partner_id)
    REFERENCES public.fulfillment_partner (id) ON DELETE RESTRICT,
  CONSTRAINT partner_contract_language_code_locale_code_fk FOREIGN KEY (language_code)
    REFERENCES public.locale (code) ON DELETE RESTRICT,
  CONSTRAINT partner_contract_uploaded_by_users_id_fk FOREIGN KEY (uploaded_by)
    REFERENCES public.users (id) ON DELETE RESTRICT,
  -- Deferred to commit: superseding marks the old row before the new one is inserted (the
  -- partial unique index allows one current row), and withdrawing deletes the new row before the
  -- old one is current again. At commit every link must resolve; `NO ACTION` is `RESTRICT` there.
  CONSTRAINT partner_contract_superseded_by_partner_contract_id_fk FOREIGN KEY (superseded_by)
    REFERENCES public.partner_contract (id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT partner_contract_object_key_key UNIQUE (object_key),
  CONSTRAINT partner_contract_partner_kind_version_key UNIQUE (partner_id, doc_kind, version_no),
  CONSTRAINT partner_contract_doc_kind_check
    CHECK (doc_kind IN ('agreement', 'dpa_addendum', 'annex')),
  CONSTRAINT partner_contract_version_no_check CHECK (version_no >= 1),
  CONSTRAINT partner_contract_template_version_check
    CHECK (template_version ~ '^[a-z0-9][a-z0-9.-]{0,39}$'),
  CONSTRAINT partner_contract_notice_days_check CHECK (notice_days BETWEEN 0 AND 365),
  CONSTRAINT partner_contract_note_check
    CHECK (note IS NULL OR char_length(btrim(note)) BETWEEN 1 AND 500),
  CONSTRAINT partner_contract_object_key_check
    CHECK (object_key ~ '^originals/contract/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  CONSTRAINT partner_contract_bytes_check CHECK (bytes BETWEEN 1 AND 10485760),
  CONSTRAINT partner_contract_page_count_check CHECK (page_count >= 1),
  CONSTRAINT partner_contract_checksum_sha256_check CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT partner_contract_review_on_check CHECK (review_on IS NULL OR review_on > effective_on),
  CONSTRAINT partner_contract_includes_dpa_check CHECK (doc_kind = 'agreement' OR NOT includes_dpa),
  CONSTRAINT partner_contract_superseded_check
    CHECK ((superseded_at IS NULL) = (superseded_by IS NULL)),
  CONSTRAINT partner_contract_annex_check CHECK (doc_kind <> 'annex' OR superseded_at IS NULL),
  CONSTRAINT partner_contract_superseded_self_check
    CHECK (superseded_by IS NULL OR superseded_by <> id)
);

CREATE UNIQUE INDEX partner_contract_current_idx
  ON public.partner_contract USING btree (partner_id, doc_kind)
  WHERE superseded_at IS NULL AND doc_kind IN ('agreement', 'dpa_addendum');

CREATE INDEX partner_contract_review_idx
  ON public.partner_contract USING btree (review_on)
  WHERE superseded_at IS NULL AND review_on IS NOT NULL;

CREATE INDEX partner_contract_superseded_by_idx
  ON public.partner_contract USING btree (superseded_by);

CREATE TRIGGER partner_contract_set_updated_at BEFORE UPDATE ON public.partner_contract
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

/* ---------------------------------------------------------------------------
 * 2. the guard: immutable file facts, the withdraw window, the only agreement
 * ------------------------------------------------------------------------ */

CREATE FUNCTION public.partner_contract_guard() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.partner_id IS DISTINCT FROM OLD.partner_id
       OR NEW.doc_kind IS DISTINCT FROM OLD.doc_kind
       OR NEW.version_no IS DISTINCT FROM OLD.version_no
       OR NEW.bucket IS DISTINCT FROM OLD.bucket
       OR NEW.object_key IS DISTINCT FROM OLD.object_key
       OR NEW.bytes IS DISTINCT FROM OLD.bytes
       OR NEW.page_count IS DISTINCT FROM OLD.page_count
       OR NEW.checksum_sha256 IS DISTINCT FROM OLD.checksum_sha256
       OR NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by
       OR NEW.uploaded_at IS DISTINCT FROM OLD.uploaded_at THEN
      RAISE EXCEPTION 'CONTRACT_FILE_IMMUTABLE: a stored contract''s file facts never change'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- DELETE. The retention sweep (system context) removes a florist's contracts 10 years after
  -- it was offboarded, whatever their age.
  IF coalesce(current_setting('app.role', true), '') = 'system'
     AND (coalesce(current_setting('app.audit_action', true), '') = 'retention.sweep'
          OR coalesce(current_setting('app.request_id', true), '') = 'system:retention.sweep') THEN
    RETURN OLD;
  END IF;
  IF OLD.uploaded_at < now() - interval '7 days' THEN
    RAISE EXCEPTION 'CONTRACT_WITHDRAW_WINDOW_CLOSED: a contract can be withdrawn only within 7 days of its upload'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.doc_kind = 'agreement' AND OLD.superseded_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.partner_contract c WHERE c.superseded_by = OLD.id)
     AND EXISTS (SELECT 1 FROM public.fulfillment_partner p
                 WHERE p.id = OLD.partner_id AND p.status = 'active') THEN
    RAISE EXCEPTION 'CONTRACT_ONLY_AGREEMENT_PARTNER_ACTIVE: pause the florist before withdrawing its only agreement'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END;
$fn$;

CREATE TRIGGER partner_contract_guard
  BEFORE UPDATE OR DELETE ON public.partner_contract
  FOR EACH ROW EXECUTE FUNCTION public.partner_contract_guard();

/* ---------------------------------------------------------------------------
 * 3. no going live without a current agreement (§13 Q21)
 * ------------------------------------------------------------------------ */

CREATE FUNCTION public.partner_activation_requires_agreement() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF NEW.status = 'active' AND OLD.status IS DISTINCT FROM 'active'
     AND NOT EXISTS (SELECT 1 FROM public.partner_contract c
                     WHERE c.partner_id = NEW.id AND c.doc_kind = 'agreement'
                       AND c.superseded_at IS NULL) THEN
    RAISE EXCEPTION 'PARTNER_NO_SIGNED_AGREEMENT: a florist goes live only with a signed agreement on file'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER partner_activation_requires_agreement
  BEFORE UPDATE OF status ON public.fulfillment_partner
  FOR EACH ROW EXECUTE FUNCTION public.partner_activation_requires_agreement();

/* ---------------------------------------------------------------------------
 * 4. the audit trail: the note masked, every write audited
 * ------------------------------------------------------------------------ */

CREATE OR REPLACE FUNCTION public.audit_mask_columns(p_table text) RETURNS text[]
  LANGUAGE sql
  IMMUTABLE
  SET search_path = pg_catalog, public
AS $fn$
  SELECT CASE p_table
    WHEN 'fulfillment_partner' THEN
      ARRAY['legal_name', 'contact_email', 'contact_phone', 'contact_name']
    WHEN 'partner_application' THEN
      ARRAY['business_name', 'contact_name', 'contact_email', 'contact_phone', 'registration_number']
    WHEN 'review' THEN
      ARRAY['text', 'display_name']
    WHEN 'partner_note' THEN
      ARRAY['body']
    WHEN 'partner_contact_log' THEN
      ARRAY['summary']
    WHEN 'partner_contract' THEN
      ARRAY['note']
    ELSE ARRAY[]::text[]
  END;
$fn$;

CREATE TRIGGER partner_contract_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.partner_contract
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('id');

/* ---------------------------------------------------------------------------
 * 5. retention
 * ------------------------------------------------------------------------ */

INSERT INTO public.retention_policy (key, entity_table, basis, retention_days, action, legal_note) VALUES
  ('partner_contract', 'partner_contract',
   'Art. 6(1)(b) contract, Art. 6(1)(c) record keeping, Art. 6(1)(f) legal claims', 3650, 'delete',
   'spec 030b §14.3, §13 Q16, plan/07 §1.2 (contract + 10 years): every version is kept while the florist is not offboarded and 10 years after fulfillment_partner.offboarded_at; then the object, then the row.');

/* ---------------------------------------------------------------------------
 * 6. RLS: staff only, no build grant
 * ------------------------------------------------------------------------ */

ALTER TABLE public.partner_contract ENABLE ROW LEVEL SECURITY;
CREATE POLICY partner_contract_staff ON public.partner_contract FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
REVOKE ALL ON public.partner_contract FROM app_build;

RESET ROLE;
