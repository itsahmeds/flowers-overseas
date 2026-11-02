-- 0035_payouts_030a — florist payouts, Phase 1: the payout terms of a florist, the kind and the
-- lifecycle of a payout, the Wise export, and the four triggers that keep a florist's money honest
-- (spec 030a §5.1; AC-2, AC-3, AC-5, AC-31, AC-32; TASK-363).
--
--   1. `fulfillment_partner`: `payout_cadence` (`weekly` | `per_order`), `prepaid_order_limit`
--      (0 to 50, default 5: the founder's "first five orders paid up front" of 2026-10-19) and
--      `wise_recipient_id` (digits only: the florist's saved recipient in our Wise Business
--      account). **No bank detail of any kind is stored** (§13 Q7).
--   2. `payout_export`: which sent payouts went into which uploaded Wise file. No money column, so
--      `db:check`'s money gate is untouched. Staff (`admin`, `system`) only.
--   3. `payout`: `kind` (`weekly` | `prepaid` | `per_order`; a one-order payout has one date),
--      the lifecycle columns `closed_at`, `sent_at`, `paid_at`, `statement_number` (`P-NNNNNN`,
--      assigned at send from `payout_statement_number_seq`) and `export_id`, each tied to the
--      status by a check. `payout_partner_period_key` is replaced by `payout_weekly_period_idx`
--      (two one-order payouts of one florist may share a date), and `payout_open_weekly_idx` keeps
--      at most one open weekly payout per florist under concurrent accruals.
--   4. `payout_line`: the review flag of an order with add-on or surcharge lines
--      (`review_reason`, `reviewed_at`, `reviewed_by`) and `payout_line_note_check` (every manual
--      line says why).
--   5. Triggers:
--      - `payout_status_guard`: only `draft → statement_sent` and `statement_sent → paid`, else
--        `PAYOUT_STATUS_ILLEGAL`;
--      - `payout_line_frozen`: a line of a payout that is not `draft` is never inserted, changed or
--        deleted (`PAYOUT_NOT_DRAFT`), save an UPDATE of the review columns alone;
--      - `payout_total_sync`: `payout.total_minor` is the sum of its lines, written only when it
--        changes (so a payout's `updated_at` moves only when its total does);
--      - `order_line_payout_write_once`: the unit amount fixed at acceptance is final
--        (`ORDER_LINE_PAYOUT_FIXED`).
--   6. `feature_flag` `payouts.accrue` (global, on, high-risk; `src/config/feature-flags.ts`).
--
-- The new `payout` and `payout_line` columns fall under `0011`'s policies: staff all, a florist
-- reads its own rows (AC-32).
--
-- Rollback: `0035_payouts_030a.down.sql`, guarded by `PAYOUTS_030A_ROLLBACK_ROWS_IN_USE`.

SET LOCAL ROLE app_owner;

/* ---------------------------------------------------------------------------
 * 1. fulfillment_partner: payout terms
 * ------------------------------------------------------------------------ */

ALTER TABLE public.fulfillment_partner
  ADD COLUMN payout_cadence text NOT NULL DEFAULT 'weekly';
ALTER TABLE public.fulfillment_partner
  ADD CONSTRAINT fulfillment_partner_payout_cadence_check
  CHECK (payout_cadence IN ('weekly', 'per_order'));
ALTER TABLE public.fulfillment_partner
  ADD COLUMN prepaid_order_limit integer NOT NULL DEFAULT 5;
ALTER TABLE public.fulfillment_partner
  ADD CONSTRAINT fulfillment_partner_prepaid_order_limit_check
  CHECK (prepaid_order_limit BETWEEN 0 AND 50);
ALTER TABLE public.fulfillment_partner
  ADD COLUMN wise_recipient_id text NULL;
ALTER TABLE public.fulfillment_partner
  ADD CONSTRAINT fulfillment_partner_wise_recipient_id_check
  CHECK (wise_recipient_id ~ '^[0-9]{1,20}$');

COMMENT ON COLUMN public.fulfillment_partner.wise_recipient_id IS
  'Spec 030a §2.1: the florist''s saved-recipient id in our Wise Business account. No IBAN, account number or other bank detail is stored anywhere.';

/* ---------------------------------------------------------------------------
 * 2. payout_export
 * ------------------------------------------------------------------------ */

CREATE TABLE public.payout_export (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_currency_code text        NOT NULL,
  created_by           uuid        NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  cancelled_at         timestamptz NULL,
  CONSTRAINT payout_export_source_currency_code_currency_code_fk FOREIGN KEY (source_currency_code)
    REFERENCES public.currency (code) ON DELETE RESTRICT,
  CONSTRAINT payout_export_created_by_users_id_fk FOREIGN KEY (created_by)
    REFERENCES public.users (id) ON DELETE RESTRICT,
  CONSTRAINT payout_export_source_currency_code_check CHECK (source_currency_code ~ '^[A-Z]{3}$')
);

COMMENT ON TABLE public.payout_export IS
  'Spec 030a §2.6: which sent payouts went into which Wise bulk-payment file. The file itself is generated on request and never stored.';

ALTER TABLE public.payout_export ENABLE ROW LEVEL SECURITY;

CREATE POLICY payout_export_staff ON public.payout_export FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());

/* ---------------------------------------------------------------------------
 * 3. payout: kind and lifecycle
 * ------------------------------------------------------------------------ */

ALTER TABLE public.payout ADD COLUMN kind text NOT NULL DEFAULT 'weekly';
ALTER TABLE public.payout ADD CONSTRAINT payout_kind_check
  CHECK (kind IN ('weekly', 'prepaid', 'per_order'));
ALTER TABLE public.payout ADD CONSTRAINT payout_kind_period_check
  CHECK (kind = 'weekly' OR period_start = period_end);

ALTER TABLE public.payout DROP CONSTRAINT payout_partner_period_key;
CREATE UNIQUE INDEX payout_weekly_period_idx
  ON public.payout USING btree (partner_id, period_start, period_end) WHERE kind = 'weekly';

ALTER TABLE public.payout ADD COLUMN closed_at timestamptz NULL;
ALTER TABLE public.payout ADD COLUMN sent_at timestamptz NULL;
ALTER TABLE public.payout ADD COLUMN paid_at timestamptz NULL;
ALTER TABLE public.payout ADD COLUMN statement_number text NULL;
ALTER TABLE public.payout ADD COLUMN export_id uuid NULL;
ALTER TABLE public.payout ADD CONSTRAINT payout_statement_number_key UNIQUE (statement_number);
ALTER TABLE public.payout ADD CONSTRAINT payout_statement_number_check
  CHECK (statement_number ~ '^P-[0-9]{6}$');
ALTER TABLE public.payout ADD CONSTRAINT payout_export_id_payout_export_id_fk
  FOREIGN KEY (export_id) REFERENCES public.payout_export (id) ON DELETE RESTRICT;
ALTER TABLE public.payout ADD CONSTRAINT payout_sent_check
  CHECK ((status = 'draft') = (sent_at IS NULL));
ALTER TABLE public.payout ADD CONSTRAINT payout_statement_number_status_check
  CHECK ((status = 'draft') = (statement_number IS NULL));
ALTER TABLE public.payout ADD CONSTRAINT payout_paid_check
  CHECK ((status = 'paid') = (paid_at IS NOT NULL));
ALTER TABLE public.payout ADD CONSTRAINT payout_closed_check
  CHECK (status = 'draft' OR closed_at IS NOT NULL);
ALTER TABLE public.payout ADD CONSTRAINT payout_export_status_check
  CHECK (export_id IS NULL OR status <> 'draft');

CREATE INDEX payout_export_id_idx ON public.payout USING btree (export_id);

-- At most one open weekly payout per florist, even under concurrent accruals.
CREATE UNIQUE INDEX payout_open_weekly_idx
  ON public.payout USING btree (partner_id) WHERE kind = 'weekly' AND closed_at IS NULL;

CREATE SEQUENCE public.payout_statement_number_seq AS integer MINVALUE 1 MAXVALUE 999999 NO CYCLE;

/* ---------------------------------------------------------------------------
 * 4. payout_line: review flag, manual-line note
 * ------------------------------------------------------------------------ */

ALTER TABLE public.payout_line ADD COLUMN review_reason text NULL;
ALTER TABLE public.payout_line ADD COLUMN reviewed_at timestamptz NULL;
ALTER TABLE public.payout_line ADD COLUMN reviewed_by uuid NULL;
ALTER TABLE public.payout_line ADD CONSTRAINT payout_line_review_reason_check
  CHECK (review_reason IN ('unpriced_lines'));
ALTER TABLE public.payout_line ADD CONSTRAINT payout_line_reviewed_by_users_id_fk
  FOREIGN KEY (reviewed_by) REFERENCES public.users (id) ON DELETE RESTRICT;
ALTER TABLE public.payout_line ADD CONSTRAINT payout_line_reviewed_check
  CHECK (reviewed_at IS NULL OR review_reason IS NOT NULL);
ALTER TABLE public.payout_line ADD CONSTRAINT payout_line_reviewed_pair_check
  CHECK ((reviewed_at IS NULL) = (reviewed_by IS NULL));
ALTER TABLE public.payout_line ADD CONSTRAINT payout_line_note_check
  CHECK (kind = 'order' OR length(btrim(coalesce(note, ''))) > 0);

/* ---------------------------------------------------------------------------
 * 5. Triggers
 * ------------------------------------------------------------------------ */

-- The payout lifecycle: draft → statement_sent → paid, never skipped, never reversed.
CREATE FUNCTION public.payout_status_guard() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT (
       (OLD.status = 'draft' AND NEW.status = 'statement_sent')
       OR (OLD.status = 'statement_sent' AND NEW.status = 'paid')
     ) THEN
    RAISE EXCEPTION 'PAYOUT_STATUS_ILLEGAL: a payout may not go from % to %', OLD.status, NEW.status
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER payout_status_guard BEFORE UPDATE OF status ON public.payout
  FOR EACH ROW EXECUTE FUNCTION public.payout_status_guard();

-- A sent statement is never edited: lines change only while their payout is a draft. The one
-- exception is the founder resolving a review flag (the two review columns, nothing else).
CREATE FUNCTION public.payout_line_frozen() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_status text;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.payout_id = OLD.payout_id
     AND (to_jsonb(NEW) - ARRAY['reviewed_at', 'reviewed_by', 'updated_at'])
       = (to_jsonb(OLD) - ARRAY['reviewed_at', 'reviewed_by', 'updated_at']) THEN
    RETURN NEW;
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT status INTO v_status FROM public.payout WHERE id = OLD.payout_id;
    IF FOUND AND v_status <> 'draft' THEN
      RAISE EXCEPTION 'PAYOUT_NOT_DRAFT: the lines of a % payout are frozen', v_status
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT status INTO v_status FROM public.payout WHERE id = NEW.payout_id;
    IF FOUND AND v_status <> 'draft' THEN
      RAISE EXCEPTION 'PAYOUT_NOT_DRAFT: the lines of a % payout are frozen', v_status
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$fn$;

CREATE TRIGGER payout_line_frozen BEFORE INSERT OR UPDATE OR DELETE ON public.payout_line
  FOR EACH ROW EXECUTE FUNCTION public.payout_line_frozen();

-- The payout total is a database fact: the sum of its lines, rewritten only when it changes.
CREATE FUNCTION public.payout_total_sync() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_payout uuid;
BEGIN
  FOREACH v_payout IN ARRAY (
    CASE TG_OP
      WHEN 'INSERT' THEN ARRAY[NEW.payout_id]
      WHEN 'DELETE' THEN ARRAY[OLD.payout_id]
      ELSE ARRAY[OLD.payout_id, NEW.payout_id]
    END
  ) LOOP
    UPDATE public.payout p
    SET total_minor = s.total
    FROM (
      SELECT coalesce(sum(l.amount_minor), 0)::bigint AS total
      FROM public.payout_line l WHERE l.payout_id = v_payout
    ) s
    WHERE p.id = v_payout AND p.total_minor IS DISTINCT FROM s.total;
  END LOOP;
  RETURN NULL;
END;
$fn$;

CREATE TRIGGER payout_total_sync AFTER INSERT OR UPDATE OR DELETE ON public.payout_line
  FOR EACH ROW EXECUTE FUNCTION public.payout_total_sync();

-- The unit amount the florist accepted is final (spec 030a §2.2).
CREATE FUNCTION public.order_line_payout_write_once() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF OLD.partner_payout_minor IS NOT NULL
     AND (NEW.partner_payout_minor IS DISTINCT FROM OLD.partner_payout_minor
          OR NEW.payout_currency_code IS DISTINCT FROM OLD.payout_currency_code) THEN
    RAISE EXCEPTION 'ORDER_LINE_PAYOUT_FIXED: the payout of an order line is fixed at acceptance'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER order_line_payout_write_once
  BEFORE UPDATE OF partner_payout_minor, payout_currency_code ON public.order_line
  FOR EACH ROW EXECUTE FUNCTION public.order_line_payout_write_once();

/* ---------------------------------------------------------------------------
 * 6. Flag
 * ------------------------------------------------------------------------ */

INSERT INTO public.feature_flag (key, description, enabled_default) VALUES
  ('payouts.accrue', 'Florist payouts are written (spec 030a): the amount fixed at acceptance, prepaid payouts and payout lines. Off: the payouts outbox rows wait, held and never dropped, until it is on again.', true);

RESET ROLE;
