-- 0013_admin_identity — the admin profile and the sign-in send log of the shared sign-in core
-- (spec 012 §2.2, §5.1 `NNNN_admin_identity`, AC-2, AC-3; TASK-217).
--
--   `admin_profile`    one row per person who may sign in to admin: the name the audit log shows
--                      and the zone admin shows instants in. A `users` row is allowlisted for
--                      the admin surface exactly when it has a profile with `deactivated_at IS
--                      NULL` **and** at least one `user_role` row (spec 012 §2.2). `ON DELETE
--                      RESTRICT`: a user with an admin history is deactivated, never deleted.
--   `auth_email_send`  one row per sign-in link sent, on either surface (admin and the florist
--                      inbox, spec 011), keyed by the SHA-256 of the normalised address and
--                      never the address itself: the send limit counts these (5 per address per
--                      hour), and nothing else reads them. No IP is stored. Kept 7 days; the
--                      retention row is spec 012 task 11's (`NNNN_partner_terms_and_retention`).
--
-- RLS on both: staff only (`app_is_staff()`, i.e. `app.role` admin or system), like every other
-- identity table in `0011`. The core's adapter runs under `withSystemContext('auth', …)`.
--
-- Rollback: `0013_admin_identity.down.sql` (drops the two tables).

SET LOCAL ROLE app_owner;

CREATE TABLE public.admin_profile (
  user_id        uuid PRIMARY KEY,
  display_name   text        NOT NULL,
  time_zone      text        NOT NULL DEFAULT 'Europe/Tallinn',
  deactivated_at timestamptz NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_profile_user_id_users_id_fk FOREIGN KEY (user_id)
    REFERENCES public.users (id) ON DELETE RESTRICT,
  CONSTRAINT admin_profile_display_name_check CHECK (
    char_length(display_name) BETWEEN 2 AND 80
  )
);

CREATE TRIGGER admin_profile_set_updated_at BEFORE UPDATE ON public.admin_profile
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.auth_email_send (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier_hash char(64)    NOT NULL,
  sent_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_email_send_identifier_hash_check CHECK (identifier_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX auth_email_send_identifier_hash_sent_at_idx
  ON public.auth_email_send USING btree (identifier_hash, sent_at);

ALTER TABLE public.admin_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_email_send ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_profile_staff ON public.admin_profile FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY auth_email_send_staff ON public.auth_email_send FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());

RESET ROLE;
