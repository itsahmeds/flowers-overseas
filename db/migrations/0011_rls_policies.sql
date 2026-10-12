-- 0011_rls_policies — row-level security on every table, deny by default (spec 002 §2 "RLS and
-- roles", §8, §13 Q4, AC-16, AC-17, AC-18; `plan/07` §1.1; `plan/12` §4; TASK-023).
--
-- The mechanism (§13 Q4, resolved): one runtime role, `app_web` (`0001`: `NOSUPERUSER`,
-- `NOBYPASSRLS`, DML only), entered with `SET LOCAL ROLE` by `src/lib/db.ts`, and four
-- transaction-local session variables every policy reads through `current_setting(…, true)`:
-- `app.role` (`public` | `customer` | `partner` | `admin` | `system`), `app.user_id`,
-- `app.partner_ids` (comma-separated) and `app.request_id`. Admin is `app.role = 'admin'`, not a
-- second connection string, so there is no service-role key to leak. Nothing reads a JWT.
--
-- What each table allows is `db/rls.ts`, and this file is that map written as policies:
--
--   * every table: RLS enabled, and `<table>_staff` (`admin` and `system`: everything);
--   * the public reference set (catalogue and geo, the order machine's reference rows):
--     `<table>_read` for everyone; `media_asset` only where `visibility = 'public'`,
--     `media_variant` only for such an asset, `review` only where published (AC-17);
--   * partner-scoped (AC-16): readable only when the row's partner is in `app.partner_ids` and
--     `app.role = 'partner'` — directly by `partner_id`, `payout_line` through `payout`, `"order"`,
--     `order_line`, `delivery_proof` and `substitution_note` through an `order_assignment` of that
--     partner (an order offered to them, `plan/07` §1.1). The partner's own configuration
--     (coverage, blackouts, catalogue mapping) is theirs to write; order and money records are
--     read-only to them (spec 011 §2), so an `UPDATE`/`DELETE` as partner B affects 0 rows and as
--     partner A changes nothing outside A's configuration;
--   * customer-scoped: through `customer.user_id = app.user_id` with `app.role = 'customer'`; the
--     address book is the buyer's to edit, orders and payments read-only;
--   * self: a signed-in person reads their own `users` row, `user_role` rows and memberships;
--   * everything else (sessions, accounts, tokens, the outbox, flags, the audit log, retention,
--     consent records, webhook payloads, applications, usage samples, the message catalogue):
--     staff only.
--
-- Not `FORCE ROW LEVEL SECURITY`: the table owner `app_owner` keeps bypassing RLS, which is what
-- the `SECURITY DEFINER` trigger functions of `0005` and `0008` rely on to see every row (the
-- TASK-018 carry-forward). Nobody connects or `SET ROLE`s as `app_owner` at runtime.
--
-- Also here (AC-18): `REVOKE CREATE ON SCHEMA public FROM PUBLIC` — `app_web` may create nothing.
-- PG15+ already defaults to that; the statement makes it a fact on any server a dump lands on.
--
-- Rollback: `0011_rls_policies.down.sql`.

SET LOCAL ROLE app_owner;

/* ---------------------------------------------------------------------------
 * the session variables, read once each (STABLE: constant within a statement)
 * ------------------------------------------------------------------------ */

CREATE FUNCTION public.app_current_role() RETURNS text
  LANGUAGE sql STABLE
  SET search_path = pg_catalog
AS $fn$
  SELECT coalesce(nullif(current_setting('app.role', true), ''), 'public')
$fn$;

CREATE FUNCTION public.app_current_user_id() RETURNS uuid
  LANGUAGE sql STABLE
  SET search_path = pg_catalog
AS $fn$
  SELECT CASE
    WHEN current_setting('app.user_id', true) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN current_setting('app.user_id', true)::uuid
  END
$fn$;

CREATE FUNCTION public.app_current_partner_ids() RETURNS uuid[]
  LANGUAGE sql STABLE
  SET search_path = pg_catalog
AS $fn$
  SELECT coalesce(array_agg(part::uuid), '{}'::uuid[])
  FROM unnest(string_to_array(btrim(coalesce(current_setting('app.partner_ids', true), ''), '{} '), ',')) AS part
  WHERE btrim(part) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
$fn$;

CREATE FUNCTION public.app_is_staff() RETURNS boolean
  LANGUAGE sql STABLE
  SET search_path = pg_catalog, public
AS $fn$
  SELECT app_current_role() IN ('admin', 'system')
$fn$;

CREATE FUNCTION public.app_is_partner_of(partner uuid) RETURNS boolean
  LANGUAGE sql STABLE
  SET search_path = pg_catalog, public
AS $fn$
  SELECT app_current_role() = 'partner' AND partner = ANY (app_current_partner_ids())
$fn$;

CREATE FUNCTION public.app_is_customer_user(owner uuid) RETURNS boolean
  LANGUAGE sql STABLE
  SET search_path = pg_catalog, public
AS $fn$
  SELECT app_current_role() = 'customer' AND owner IS NOT NULL AND owner = app_current_user_id()
$fn$;

/* ---------------------------------------------------------------------------
 * AC-18: app_web creates nothing
 * ------------------------------------------------------------------------ */

REVOKE CREATE ON SCHEMA public FROM PUBLIC;

/* ---------------------------------------------------------------------------
 * every table: RLS on, staff see and write everything
 * ------------------------------------------------------------------------ */

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addon ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addon_country_price ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addon_translation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.address ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category_translation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.city ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.city_translation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.country ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.country_holiday ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.country_locale_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.country_price ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.country_translation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.currency ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.db_usage_sample ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_proof ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flag ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flag_scope ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fulfillment_partner ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fx_rate ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locale ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_asset ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_variant ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.occasion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.occasion_country ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.occasion_translation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_assignment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_transition ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbox_attempt ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_application ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_blackout ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_catalog_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_coverage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_member ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_translation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.postcode_zone ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_category ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_media_alt ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_occasion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_tier ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_translation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipient ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipient_address ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refund ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.region ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retention_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.substitution_note ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_role ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_inbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY accounts_staff ON public.accounts FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY addon_staff ON public.addon FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY addon_country_price_staff ON public.addon_country_price FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY addon_translation_staff ON public.addon_translation FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY address_staff ON public.address FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY audit_log_staff ON public.audit_log FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY category_staff ON public.category FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY category_translation_staff ON public.category_translation FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY city_staff ON public.city FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY city_translation_staff ON public.city_translation FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY consent_log_staff ON public.consent_log FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY country_staff ON public.country FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY country_holiday_staff ON public.country_holiday FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY country_locale_content_staff ON public.country_locale_content FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY country_price_staff ON public.country_price FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY country_translation_staff ON public.country_translation FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY currency_staff ON public.currency FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY customer_staff ON public.customer FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY db_usage_sample_staff ON public.db_usage_sample FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY delivery_proof_staff ON public.delivery_proof FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY feature_flag_staff ON public.feature_flag FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY feature_flag_scope_staff ON public.feature_flag_scope FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY fulfillment_partner_staff ON public.fulfillment_partner FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY fx_rate_staff ON public.fx_rate FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY locale_staff ON public.locale FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY media_asset_staff ON public.media_asset FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY media_variant_staff ON public.media_variant FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY message_catalog_staff ON public.message_catalog FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY occasion_staff ON public.occasion FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY occasion_country_staff ON public.occasion_country FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY occasion_translation_staff ON public.occasion_translation FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY order_staff ON public."order" FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY order_assignment_staff ON public.order_assignment FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY order_event_staff ON public.order_event FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY order_line_staff ON public.order_line FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY order_status_staff ON public.order_status FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY order_transition_staff ON public.order_transition FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY outbox_staff ON public.outbox FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY outbox_attempt_staff ON public.outbox_attempt FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY partner_application_staff ON public.partner_application FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY partner_blackout_staff ON public.partner_blackout FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY partner_catalog_mapping_staff ON public.partner_catalog_mapping FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY partner_coverage_staff ON public.partner_coverage FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY partner_member_staff ON public.partner_member FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY partner_translation_staff ON public.partner_translation FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY payment_staff ON public.payment FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY payout_staff ON public.payout FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY payout_line_staff ON public.payout_line FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY postcode_zone_staff ON public.postcode_zone FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY product_staff ON public.product FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY product_category_staff ON public.product_category FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY product_media_staff ON public.product_media FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY product_media_alt_staff ON public.product_media_alt FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY product_occasion_staff ON public.product_occasion FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY product_tier_staff ON public.product_tier FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY product_translation_staff ON public.product_translation FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY recipient_staff ON public.recipient FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY recipient_address_staff ON public.recipient_address FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY refund_staff ON public.refund FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY region_staff ON public.region FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY retention_policy_staff ON public.retention_policy FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY review_staff ON public.review FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY sessions_staff ON public.sessions FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY substitution_note_staff ON public.substitution_note FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY user_role_staff ON public.user_role FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY users_staff ON public.users FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY verification_tokens_staff ON public.verification_tokens FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY webhook_inbox_staff ON public.webhook_inbox FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());

/* ---------------------------------------------------------------------------
 * the public reference set (AC-17)
 * ------------------------------------------------------------------------ */

CREATE POLICY addon_read ON public.addon FOR SELECT TO app_web USING (true);
CREATE POLICY addon_country_price_read ON public.addon_country_price FOR SELECT TO app_web USING (true);
CREATE POLICY addon_translation_read ON public.addon_translation FOR SELECT TO app_web USING (true);
CREATE POLICY category_read ON public.category FOR SELECT TO app_web USING (true);
CREATE POLICY category_translation_read ON public.category_translation FOR SELECT TO app_web USING (true);
CREATE POLICY city_read ON public.city FOR SELECT TO app_web USING (true);
CREATE POLICY city_translation_read ON public.city_translation FOR SELECT TO app_web USING (true);
CREATE POLICY country_read ON public.country FOR SELECT TO app_web USING (true);
CREATE POLICY country_holiday_read ON public.country_holiday FOR SELECT TO app_web USING (true);
CREATE POLICY country_locale_content_read ON public.country_locale_content FOR SELECT TO app_web USING (true);
CREATE POLICY country_price_read ON public.country_price FOR SELECT TO app_web USING (true);
CREATE POLICY country_translation_read ON public.country_translation FOR SELECT TO app_web USING (true);
CREATE POLICY currency_read ON public.currency FOR SELECT TO app_web USING (true);
CREATE POLICY fx_rate_read ON public.fx_rate FOR SELECT TO app_web USING (true);
CREATE POLICY locale_read ON public.locale FOR SELECT TO app_web USING (true);
CREATE POLICY occasion_read ON public.occasion FOR SELECT TO app_web USING (true);
CREATE POLICY occasion_country_read ON public.occasion_country FOR SELECT TO app_web USING (true);
CREATE POLICY occasion_translation_read ON public.occasion_translation FOR SELECT TO app_web USING (true);
CREATE POLICY order_status_read ON public.order_status FOR SELECT TO app_web USING (true);
CREATE POLICY order_transition_read ON public.order_transition FOR SELECT TO app_web USING (true);
CREATE POLICY postcode_zone_read ON public.postcode_zone FOR SELECT TO app_web USING (true);
CREATE POLICY product_read ON public.product FOR SELECT TO app_web USING (true);
CREATE POLICY product_category_read ON public.product_category FOR SELECT TO app_web USING (true);
CREATE POLICY product_media_read ON public.product_media FOR SELECT TO app_web USING (true);
CREATE POLICY product_media_alt_read ON public.product_media_alt FOR SELECT TO app_web USING (true);
CREATE POLICY product_occasion_read ON public.product_occasion FOR SELECT TO app_web USING (true);
CREATE POLICY product_tier_read ON public.product_tier FOR SELECT TO app_web USING (true);
CREATE POLICY product_translation_read ON public.product_translation FOR SELECT TO app_web USING (true);
CREATE POLICY region_read ON public.region FOR SELECT TO app_web USING (true);

CREATE POLICY media_asset_read ON public.media_asset FOR SELECT TO app_web
  USING (visibility = 'public');
CREATE POLICY media_variant_read ON public.media_variant FOR SELECT TO app_web
  USING (EXISTS (
    SELECT 1 FROM public.media_asset a WHERE a.id = media_variant.media_asset_id AND a.visibility = 'public'
  ));
CREATE POLICY review_read ON public.review FOR SELECT TO app_web
  USING (moderation_status = 'published');

/* ---------------------------------------------------------------------------
 * partner-scoped (AC-16)
 * ------------------------------------------------------------------------ */

CREATE POLICY fulfillment_partner_partner ON public.fulfillment_partner FOR SELECT TO app_web
  USING (app_is_partner_of(id));
CREATE POLICY partner_translation_partner ON public.partner_translation FOR SELECT TO app_web
  USING (app_is_partner_of(partner_id));
CREATE POLICY partner_member_partner ON public.partner_member FOR SELECT TO app_web
  USING (app_is_partner_of(partner_id));
CREATE POLICY partner_coverage_partner ON public.partner_coverage FOR ALL TO app_web
  USING (app_is_partner_of(partner_id)) WITH CHECK (app_is_partner_of(partner_id));
CREATE POLICY partner_blackout_partner ON public.partner_blackout FOR ALL TO app_web
  USING (app_is_partner_of(partner_id)) WITH CHECK (app_is_partner_of(partner_id));
CREATE POLICY partner_catalog_mapping_partner ON public.partner_catalog_mapping FOR ALL TO app_web
  USING (app_is_partner_of(partner_id)) WITH CHECK (app_is_partner_of(partner_id));
CREATE POLICY payout_partner ON public.payout FOR SELECT TO app_web
  USING (app_is_partner_of(partner_id));
CREATE POLICY payout_line_partner ON public.payout_line FOR SELECT TO app_web
  USING (EXISTS (
    SELECT 1 FROM public.payout p WHERE p.id = payout_line.payout_id AND app_is_partner_of(p.partner_id)
  ));
CREATE POLICY order_assignment_partner ON public.order_assignment FOR SELECT TO app_web
  USING (app_is_partner_of(partner_id));
CREATE POLICY order_partner ON public."order" FOR SELECT TO app_web
  USING (EXISTS (
    SELECT 1 FROM public.order_assignment a WHERE a.order_id = "order".id AND app_is_partner_of(a.partner_id)
  ));
CREATE POLICY order_line_partner ON public.order_line FOR SELECT TO app_web
  USING (EXISTS (
    SELECT 1 FROM public.order_assignment a WHERE a.order_id = order_line.order_id AND app_is_partner_of(a.partner_id)
  ));
CREATE POLICY delivery_proof_partner ON public.delivery_proof FOR SELECT TO app_web
  USING (EXISTS (
    SELECT 1 FROM public.order_assignment a WHERE a.order_id = delivery_proof.order_id AND app_is_partner_of(a.partner_id)
  ));
CREATE POLICY substitution_note_partner ON public.substitution_note FOR SELECT TO app_web
  USING (EXISTS (
    SELECT 1 FROM public.order_assignment a WHERE a.order_id = substitution_note.order_id AND app_is_partner_of(a.partner_id)
  ));

/* ---------------------------------------------------------------------------
 * customer-scoped, through customer.user_id = app.user_id
 * ------------------------------------------------------------------------ */

CREATE POLICY customer_customer ON public.customer FOR SELECT TO app_web
  USING (app_is_customer_user(user_id));
CREATE POLICY customer_customer_update ON public.customer FOR UPDATE TO app_web
  USING (app_is_customer_user(user_id)) WITH CHECK (app_is_customer_user(user_id));
CREATE POLICY address_customer ON public.address FOR ALL TO app_web
  USING (EXISTS (
    SELECT 1 FROM public.customer c WHERE c.id = address.customer_id AND app_is_customer_user(c.user_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.customer c WHERE c.id = address.customer_id AND app_is_customer_user(c.user_id)
  ));
CREATE POLICY recipient_customer ON public.recipient FOR ALL TO app_web
  USING (EXISTS (
    SELECT 1 FROM public.customer c WHERE c.id = recipient.customer_id AND app_is_customer_user(c.user_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.customer c WHERE c.id = recipient.customer_id AND app_is_customer_user(c.user_id)
  ));
CREATE POLICY recipient_address_customer ON public.recipient_address FOR ALL TO app_web
  USING (EXISTS (
    SELECT 1 FROM public.recipient r JOIN public.customer c ON c.id = r.customer_id
    WHERE r.id = recipient_address.recipient_id AND app_is_customer_user(c.user_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.recipient r JOIN public.customer c ON c.id = r.customer_id
    WHERE r.id = recipient_address.recipient_id AND app_is_customer_user(c.user_id)
  ));
CREATE POLICY order_customer ON public."order" FOR SELECT TO app_web
  USING (EXISTS (
    SELECT 1 FROM public.customer c WHERE c.id = "order".customer_id AND app_is_customer_user(c.user_id)
  ));
CREATE POLICY order_line_customer ON public.order_line FOR SELECT TO app_web
  USING (EXISTS (
    SELECT 1 FROM public."order" o JOIN public.customer c ON c.id = o.customer_id
    WHERE o.id = order_line.order_id AND app_is_customer_user(c.user_id)
  ));
CREATE POLICY order_event_customer ON public.order_event FOR SELECT TO app_web
  USING (EXISTS (
    SELECT 1 FROM public."order" o JOIN public.customer c ON c.id = o.customer_id
    WHERE o.id = order_event.order_id AND app_is_customer_user(c.user_id)
  ));
CREATE POLICY delivery_proof_customer ON public.delivery_proof FOR SELECT TO app_web
  USING (EXISTS (
    SELECT 1 FROM public."order" o JOIN public.customer c ON c.id = o.customer_id
    WHERE o.id = delivery_proof.order_id AND app_is_customer_user(c.user_id)
  ));
CREATE POLICY substitution_note_customer ON public.substitution_note FOR SELECT TO app_web
  USING (EXISTS (
    SELECT 1 FROM public."order" o JOIN public.customer c ON c.id = o.customer_id
    WHERE o.id = substitution_note.order_id AND app_is_customer_user(c.user_id)
  ));
CREATE POLICY payment_customer ON public.payment FOR SELECT TO app_web
  USING (EXISTS (
    SELECT 1 FROM public."order" o JOIN public.customer c ON c.id = o.customer_id
    WHERE o.id = payment.order_id AND app_is_customer_user(c.user_id)
  ));
CREATE POLICY refund_customer ON public.refund FOR SELECT TO app_web
  USING (EXISTS (
    SELECT 1 FROM public.payment p JOIN public."order" o ON o.id = p.order_id
    JOIN public.customer c ON c.id = o.customer_id
    WHERE p.id = refund.payment_id AND app_is_customer_user(c.user_id)
  ));

/* ---------------------------------------------------------------------------
 * self: the signed-in person's own identity rows, whatever the role
 * ------------------------------------------------------------------------ */

CREATE POLICY users_self ON public.users FOR SELECT TO app_web
  USING (id = app_current_user_id());
CREATE POLICY user_role_self ON public.user_role FOR SELECT TO app_web
  USING (user_id = app_current_user_id());
CREATE POLICY partner_member_self ON public.partner_member FOR SELECT TO app_web
  USING (user_id = app_current_user_id());

RESET ROLE;
