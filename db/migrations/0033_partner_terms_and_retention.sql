-- 0033_partner_terms_and_retention — a florist's signed terms, the reason an application was
-- rejected, and the two retention rows of spec 012 (spec 012 §5.1
-- `NNNN_partner_terms_and_retention`, §2.5, §13 Q5; AC-16, AC-17; TASK-221).
--
-- Numbered 0033 (orchestrator, 2026-11-03): PR 449 renumbers after this merges.
--
--   1. `fulfillment_partner.terms_signed_at` (a calendar date) and `terms_version`, set together
--      or not at all (`fulfillment_partner_terms_pair_check`). Signed terms, with the Art. 28
--      processor clauses, are the first precondition of `→ active` (`plan/07` §1.1, §1.3); the
--      preflight is TypeScript's (`partnerStatusPreflight`), the guard on the flip itself is
--      `0016`'s `status_flip_guard()`.
--   2. `partner_application.status_reason`: why an application was rejected, written by spec
--      011's `setFloristApplicationStatus` in the same admin transaction as the status, so
--      `0016`'s `audit_row_change()` records both in one row.
--   3. `retention_policy` rows `audit_log` (delete after 3 years; personal values are already
--      masked by `0016`) and `auth_email_send` (delete after 7 days). `retention.sweep` gains one
--      handler per row (`src/jobs/retention.ts`). No `partner_application` row and no session
--      row: those rules are spec 011's (`0022`), and this spec keeps no copy (§13 Q5, ruling R2).
--   4. `audit_log_append_only()` gains the one DELETE the `audit_log` row needs, and nothing
--      else: in the sweep's own session (`app.role = 'system'` and
--      `app.retention_policy = 'audit_log'`), of a row whose `at` is older than the policy's
--      period **by the database's own clock**. An injected clock in TypeScript cannot reach a
--      younger row, an UPDATE is still refused, TRUNCATE is still refused, and the 0009 carve-out
--      for the actor's `ON DELETE SET NULL` is kept word for word.
--
-- Rollback: `0033_partner_terms_and_retention.down.sql` (restores `0009`'s function body).

SET LOCAL ROLE app_owner;

/* ---------------------------------------------------------------------------
 * 1. fulfillment_partner: signed terms
 * ------------------------------------------------------------------------ */

ALTER TABLE public.fulfillment_partner ADD COLUMN terms_signed_at date NULL;
ALTER TABLE public.fulfillment_partner ADD COLUMN terms_version text NULL;
ALTER TABLE public.fulfillment_partner ADD CONSTRAINT fulfillment_partner_terms_pair_check
  CHECK ((terms_signed_at IS NULL) = (terms_version IS NULL));

COMMENT ON COLUMN public.fulfillment_partner.terms_signed_at IS
  'The day the florist signed the partner agreement with its Art. 28 processor clauses (plan/07 §1.1). Set with terms_version or not at all. Required before status active (spec 012 §2.5).';

/* ---------------------------------------------------------------------------
 * 2. partner_application: the reason for a rejection
 * ------------------------------------------------------------------------ */

ALTER TABLE public.partner_application ADD COLUMN status_reason text NULL;

COMMENT ON COLUMN public.partner_application.status_reason IS
  'Why the application was rejected (spec 012 §2.5), written with the status in one admin transaction.';

/* ---------------------------------------------------------------------------
 * 3. retention_policy rows
 * ------------------------------------------------------------------------ */

INSERT INTO public.retention_policy (key, entity_table, basis, retention_days, action, legal_note) VALUES
  ('audit_log', 'audit_log',
   'Art. 6(1)(f) legitimate interest and Art. 5(2), 32 accountability', 1095, 'delete',
   'spec 012 §8 item 4, §13 Q5: audit rows are deleted 3 years after they were written; personal values in before/after are masked at write time.'),
  ('auth_email_send', 'auth_email_send',
   'Art. 6(1)(f) legitimate interest (abuse prevention)', 7, 'delete',
   'spec 012 §2.2, §8 item 1: the sign-in send log (hashed address and time, both surfaces) is deleted 7 days after the send.');

/* ---------------------------------------------------------------------------
 * 4. audit_log: the retention DELETE, and nothing else
 * ------------------------------------------------------------------------ */

CREATE OR REPLACE FUNCTION public.audit_log_append_only() RETURNS trigger
  LANGUAGE plpgsql
AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.actor_user_id IS NOT NULL
       AND NEW.actor_user_id IS NULL
       AND (to_jsonb(NEW) - 'actor_user_id') = (to_jsonb(OLD) - 'actor_user_id')
       AND to_regclass('public.users') IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = OLD.actor_user_id) THEN
        RETURN NEW;
      END IF;
    END IF;
  END IF;
  -- spec 012 §5.1 (0033): the retention sweep deletes a row older than the `audit_log` policy's
  -- period, measured by this database's clock, in its own session and nowhere else.
  IF TG_OP = 'DELETE'
     AND coalesce(current_setting('app.role', true), '') = 'system'
     AND coalesce(current_setting('app.retention_policy', true), '') = 'audit_log'
     AND EXISTS (
       SELECT 1 FROM public.retention_policy p
       WHERE p.key = 'audit_log'
         AND p.action = 'delete'
         AND p.retention_days IS NOT NULL
         AND OLD.at <= now() - make_interval(days => p.retention_days)
     ) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'AUDIT_LOG_APPEND_ONLY: audit_log is append-only; % is refused', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$fn$;

RESET ROLE;
