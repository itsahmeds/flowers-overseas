-- 0022_florists_v0 — the florist inbox's schema delta (spec 011 §5.1, AC-14, AC-17; TASK-211).
--
-- What it adds, and why each piece is here rather than in an earlier migration:
--
--   1. `partner_application` gains the form's columns: `contact_name` (the person we call),
--      `weekend_delivery` (`plan/10` §6's weekend question), `privacy_notice_version` (which
--      Art. 13 notice the applicant saw) and `decided_at` (the sweep's and admin's clock for a
--      rejected or converted row). No row exists anywhere yet (the form ships `off`, nothing seeds
--      the table), so the three `NOT NULL` columns need no backfill; on a database that does hold
--      a row the `ALTER` fails and the whole file rolls back with nothing changed (the runner
--      wraps it in one transaction), which is the loud answer we want rather than an invented
--      contact name.
--   2. The constraints behind the zod schema (defence in depth): `country_id`, `contact_email` and
--      `contact_phone` become `NOT NULL`; `preferred_channel` and `weekend_delivery` are closed
--      lists; `capacity_per_day` is 1–500; every text column has a length bound; and
--      `cardinality(media_asset_ids) = 0`, because Phase 0 has no upload (§13 Q5) and nothing may
--      write the array until a later spec drops this check. `0005`'s media guards stay in place,
--      dormant, for that spec.
--   3. Row-level security: `partner_application_public_insert`, so a visitor (`app.role` unset or
--      `public`) may add an application **and read nothing back** — no `SELECT`, `UPDATE` or
--      `DELETE` policy for `public` or `partner`. The `WITH CHECK` pins what a public insert may
--      say about itself: `status = 'new'`, no converted partner, no decision time. `admin` and
--      `system` keep `0011`'s `partner_application_staff`. `app_web` already holds `INSERT`
--      (`0001`'s default privileges), so no grant is needed.
--   4. `partner_member.locale_code` (`en` | `pl` | `de`, default `en`): the florist's language for
--      the inbox and the sign-in email (§7). A foreign key to `locale` and a closed list, because
--      the florist surface speaks those three only (`FloristContextSchema`).
--   5. The partner read policy `0011` lacks, diffed against it: `media_asset` for `partner` where
--      the asset is the `delivery_proof` photo of an order the partner sees (an open or accepted
--      assignment, `app_partner_sees_order`), so a florist can see their own photo and nothing
--      else widens. `delivery_proof` already has its partner policy; `"order"` and `order_line`
--      are deliberately read through the views `partner_order` and `partner_order_line` (`0011`,
--      review round 1 item 1), so no row policy is added to them. The correlation is a
--      `SECURITY DEFINER` lookup owned by `app_owner`, as every ownership check of `0011` is.
--   6. Three `retention_policy` rows, the only copies of these rules (ruling R2; spec 012 keeps
--      none): `partner_application` deleted 365 days after its last change unless converted;
--      `auth_session` and `auth_verification_token` deleted one day after `expires` (both sign-in
--      surfaces, admin and florist). `retention.sweep` (`src/jobs/retention.ts`) gains a handler
--      for each.
--
-- **Not here, escalated (TASK-211 brief, "Escalations"):** the fourth row of §5.1, `demo_order`
-- (delete demo and test orders after 30 days). `0008` makes `order_event` refuse `DELETE`, and
-- every child of `"order"` references it `ON DELETE RESTRICT`, so no handler can delete a demo
-- order that has events without disabling a trigger, which the brief forbids. A policy row with no
-- working handler would put a promise in the generated retention table that nothing keeps, so the
-- row waits for the ruling.
--
-- No change to `order`, `order_event`, `order_assignment`, `delivery_proof` or `order_transition`.
--
-- Rollback: `0022_florists_v0.down.sql`.

SET LOCAL ROLE app_owner;

/* ---------------------------------------------------------------------------
 * 1–2. partner_application: the form's columns and constraints
 * ------------------------------------------------------------------------ */

-- One action per statement, so each reads on its own (and `tests/unit/support/migration-sql.ts`
-- folds them into the mirror comparison).
ALTER TABLE public.partner_application ADD COLUMN contact_name text NOT NULL;
ALTER TABLE public.partner_application ADD COLUMN weekend_delivery text NULL;
ALTER TABLE public.partner_application ADD COLUMN privacy_notice_version text NOT NULL;
ALTER TABLE public.partner_application ADD COLUMN decided_at timestamptz NULL;

ALTER TABLE public.partner_application ALTER COLUMN country_id SET NOT NULL;
ALTER TABLE public.partner_application ALTER COLUMN contact_email SET NOT NULL;
ALTER TABLE public.partner_application ALTER COLUMN contact_phone SET NOT NULL;

ALTER TABLE public.partner_application ADD CONSTRAINT partner_application_weekend_delivery_check
  CHECK (weekend_delivery IN ('yes', 'sometimes', 'no'));
ALTER TABLE public.partner_application ADD CONSTRAINT partner_application_preferred_channel_check
  CHECK (preferred_channel IN ('email', 'whatsapp', 'phone'));
ALTER TABLE public.partner_application ADD CONSTRAINT partner_application_capacity_per_day_range_check
  CHECK (capacity_per_day BETWEEN 1 AND 500);
ALTER TABLE public.partner_application ADD CONSTRAINT partner_application_media_asset_ids_empty_check
  CHECK (cardinality(media_asset_ids) = 0);
ALTER TABLE public.partner_application ADD CONSTRAINT partner_application_lengths_check CHECK (
  char_length(business_name) BETWEEN 1 AND 200
  AND char_length(contact_name) BETWEEN 1 AND 200
  AND char_length(city) BETWEEN 1 AND 200
  AND char_length(coverage_note) <= 1000
  AND char_length(registration_number) <= 100
  AND char_length(instagram_url) <= 300
  AND char_length(website_url) <= 300
  AND char_length(contact_email) BETWEEN 3 AND 254
  AND char_length(contact_phone) BETWEEN 7 AND 32
  AND char_length(privacy_notice_version) BETWEEN 1 AND 64
);

/* ---------------------------------------------------------------------------
 * 3. partner_application: a visitor inserts and reads nothing back
 * ------------------------------------------------------------------------ */

CREATE POLICY partner_application_public_insert ON public.partner_application
  FOR INSERT TO app_web
  WITH CHECK (
    app_current_role() = 'public'
    AND status = 'new'
    AND converted_partner_id IS NULL
    AND decided_at IS NULL
  );

/* ---------------------------------------------------------------------------
 * 4. partner_member.locale_code
 * ------------------------------------------------------------------------ */

ALTER TABLE public.partner_member ADD COLUMN locale_code text NOT NULL DEFAULT 'en';
ALTER TABLE public.partner_member ADD CONSTRAINT partner_member_locale_code_check
  CHECK (locale_code IN ('en', 'pl', 'de'));
ALTER TABLE public.partner_member
  ADD CONSTRAINT partner_member_locale_code_locale_code_fk FOREIGN KEY (locale_code)
    REFERENCES public.locale (code) ON DELETE RESTRICT;

/* ---------------------------------------------------------------------------
 * 5. media_asset: a partner sees the delivery photo of an order it sees
 * ------------------------------------------------------------------------ */

CREATE FUNCTION public.app_partner_sees_media(target uuid) RETURNS boolean
  LANGUAGE sql STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.delivery_proof p
    WHERE p.media_asset_id = target AND app_partner_sees_order(p.order_id)
  )
$fn$;

CREATE POLICY media_asset_partner ON public.media_asset FOR SELECT TO app_web
  USING (kind = 'delivery_proof' AND app_partner_sees_media(id));

/* ---------------------------------------------------------------------------
 * 6. retention_policy rows (applied by retention.sweep)
 * ------------------------------------------------------------------------ */

INSERT INTO public.retention_policy (key, entity_table, basis, retention_days, action, legal_note) VALUES
  ('partner_application', 'partner_application',
   'Art. 6(1)(b) steps taken at the data subject''s request before a contract', 365, 'delete',
   'spec 011 §8, §13 Q9: a florist application is deleted 12 months after its last change (updated_at) unless it was converted into a partner. The only copy of this rule (spec 012 keeps none).'),
  ('auth_session', 'sessions',
   'Art. 6(1)(b) contract (access for florists and staff)', 1, 'delete',
   'spec 011 §8: sign-in sessions of both surfaces (admin and florist) are deleted one day after they expire. The only copy of the session rule (spec 012 keeps none).'),
  ('auth_verification_token', 'verification_tokens',
   'Art. 6(1)(b) contract (access for florists and staff)', 1, 'delete',
   'spec 011 §8: sign-in link tokens (stored hashed) are deleted one day after they expire, used or not.');

RESET ROLE;
