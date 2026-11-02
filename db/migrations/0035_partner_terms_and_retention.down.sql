SET LOCAL ROLE app_owner;

-- Rollback of 0035_partner_terms_and_retention (spec 012 §5.1), in reverse order. `audit_log` rows
-- the sweep deleted stay deleted; the rows still there are untouched.

/* 4. audit_log_append_only(): 0009's body, word for word */
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
  RAISE EXCEPTION 'AUDIT_LOG_APPEND_ONLY: audit_log is append-only; % is refused', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$fn$;

/* 3. retention rows */
DELETE FROM public.retention_policy WHERE key IN ('audit_log', 'auth_email_send');

/* 2. partner_application.status_reason */
ALTER TABLE public.partner_application DROP COLUMN IF EXISTS status_reason;

/* 1. fulfillment_partner terms */
ALTER TABLE public.fulfillment_partner DROP CONSTRAINT IF EXISTS fulfillment_partner_terms_pair_check;
ALTER TABLE public.fulfillment_partner DROP COLUMN IF EXISTS terms_version;
ALTER TABLE public.fulfillment_partner DROP COLUMN IF EXISTS terms_signed_at;

RESET ROLE;
