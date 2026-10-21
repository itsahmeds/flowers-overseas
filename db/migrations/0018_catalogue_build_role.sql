-- 0018_catalogue_build_role — the read-only database role `next build` connects as (spec 012b
-- §2.0 item 2, §5.1 item 1, §8 "Security", AC-4; TASK-292).
--
-- Once the database is the catalogue's master copy (ADR-0021, proposed), the build reads it: every
-- product, price, country and photo a prerendered page shows. It reads through `app_build` and
-- nothing else (`src/lib/db.ts`'s build-phase client, `DATABASE_BUILD_URL`):
--
--   * `NOLOGIN NOBYPASSRLS` here. The founder gives it `LOGIN` and a password in Neon (§12 founder
--     action 4), so no password is ever written into a migration, a file or an env example;
--   * `USAGE` on schema `public` and `SELECT` on exactly the public reference set (`db/rls.ts`
--     `BUILD_ROLE_READ_TABLES` and `BUILD_ROLE_FILTERED_TABLES`): spec 002's public catalogue and
--     geo reference tables, public media, published reviews, plus `feature_flag` and
--     `feature_flag_scope`. Not one partner, customer, recipient, order, payment, user, session or
--     audit table, and no `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, sequence or function grant;
--   * RLS applies to it as to a public page render: one `<table>_build_read` policy per table,
--     `TO app_build`, `FOR SELECT`, with the same condition as the table's `app_web` public read
--     policy of `0011` (`visibility = 'public'`, `moderation_status = 'published'`). The two flag
--     tables are staff-only for `app_web`; for `app_build` they are readable, because the build
--     decides which flagged routes exist (§5.1 item 1);
--   * a raw session as the login is already in the public context: `app.role` unset reads as
--     `public` (`app_current_role()`, `0011`), and the build policies above do not read it at all.
--     §5.1 item 1's `ALTER ROLE app_build SET app.role = 'public'` is **not** issued: on Postgres
--     15 and later only a superuser may set a role default for a placeholder parameter, and the
--     login that runs migrations on Neon is not one (`permission denied to set parameter
--     "app.role"`, reproduced on PG16 as a `CREATEROLE` login). TASK-292's brief records it.
--
-- Roles are cluster-wide, so creation is guarded like `0001`'s: a second database in the same
-- cluster (the CI scratch databases, a restored Neon branch) must not fail here. The grants and
-- policies are per database and always run.
--
-- The ownership preamble comes first (`db/migrations/README.md`); the role and the schema grant are
-- then made as the connecting login, which holds `CREATEROLE` (`app_owner` does not), and the table
-- grants and policies as `app_owner`, which owns the tables.
--
-- Rollback: `0018_catalogue_build_role.down.sql`.

SET LOCAL ROLE app_owner;
RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_build') THEN
    CREATE ROLE app_build
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO app_build;

SET LOCAL ROLE app_owner;

/* ---------------------------------------------------------------------------
 * SELECT on the public reference set, and nothing else
 * ------------------------------------------------------------------------ */

GRANT SELECT ON
  public.addon,
  public.addon_country_price,
  public.addon_translation,
  public.category,
  public.category_translation,
  public.city,
  public.city_translation,
  public.country,
  public.country_holiday,
  public.country_locale_content,
  public.country_price,
  public.country_translation,
  public.currency,
  public.feature_flag,
  public.feature_flag_scope,
  public.fx_rate,
  public.locale,
  public.media_asset,
  public.media_variant,
  public.occasion,
  public.occasion_country,
  public.occasion_translation,
  public.postcode_zone,
  public.product,
  public.product_category,
  public.product_media,
  public.product_media_alt,
  public.product_occasion,
  public.product_tier,
  public.product_translation,
  public.region,
  public.review
TO app_build;

/* ---------------------------------------------------------------------------
 * RLS for the build: what a public render sees
 * ------------------------------------------------------------------------ */

CREATE POLICY addon_build_read ON public.addon FOR SELECT TO app_build USING (true);
CREATE POLICY addon_country_price_build_read ON public.addon_country_price FOR SELECT TO app_build USING (true);
CREATE POLICY addon_translation_build_read ON public.addon_translation FOR SELECT TO app_build USING (true);
CREATE POLICY category_build_read ON public.category FOR SELECT TO app_build USING (true);
CREATE POLICY category_translation_build_read ON public.category_translation FOR SELECT TO app_build USING (true);
CREATE POLICY city_build_read ON public.city FOR SELECT TO app_build USING (true);
CREATE POLICY city_translation_build_read ON public.city_translation FOR SELECT TO app_build USING (true);
CREATE POLICY country_build_read ON public.country FOR SELECT TO app_build USING (true);
CREATE POLICY country_holiday_build_read ON public.country_holiday FOR SELECT TO app_build USING (true);
CREATE POLICY country_locale_content_build_read ON public.country_locale_content FOR SELECT TO app_build USING (true);
CREATE POLICY country_price_build_read ON public.country_price FOR SELECT TO app_build USING (true);
CREATE POLICY country_translation_build_read ON public.country_translation FOR SELECT TO app_build USING (true);
CREATE POLICY currency_build_read ON public.currency FOR SELECT TO app_build USING (true);
CREATE POLICY feature_flag_build_read ON public.feature_flag FOR SELECT TO app_build USING (true);
CREATE POLICY feature_flag_scope_build_read ON public.feature_flag_scope FOR SELECT TO app_build USING (true);
CREATE POLICY fx_rate_build_read ON public.fx_rate FOR SELECT TO app_build USING (true);
CREATE POLICY locale_build_read ON public.locale FOR SELECT TO app_build USING (true);
CREATE POLICY occasion_build_read ON public.occasion FOR SELECT TO app_build USING (true);
CREATE POLICY occasion_country_build_read ON public.occasion_country FOR SELECT TO app_build USING (true);
CREATE POLICY occasion_translation_build_read ON public.occasion_translation FOR SELECT TO app_build USING (true);
CREATE POLICY postcode_zone_build_read ON public.postcode_zone FOR SELECT TO app_build USING (true);
CREATE POLICY product_build_read ON public.product FOR SELECT TO app_build USING (true);
CREATE POLICY product_category_build_read ON public.product_category FOR SELECT TO app_build USING (true);
CREATE POLICY product_media_build_read ON public.product_media FOR SELECT TO app_build USING (true);
CREATE POLICY product_media_alt_build_read ON public.product_media_alt FOR SELECT TO app_build USING (true);
CREATE POLICY product_occasion_build_read ON public.product_occasion FOR SELECT TO app_build USING (true);
CREATE POLICY product_tier_build_read ON public.product_tier FOR SELECT TO app_build USING (true);
CREATE POLICY product_translation_build_read ON public.product_translation FOR SELECT TO app_build USING (true);
CREATE POLICY region_build_read ON public.region FOR SELECT TO app_build USING (true);

CREATE POLICY media_asset_build_read ON public.media_asset FOR SELECT TO app_build
  USING (visibility = 'public');
CREATE POLICY media_variant_build_read ON public.media_variant FOR SELECT TO app_build
  USING (EXISTS (
    SELECT 1 FROM public.media_asset a WHERE a.id = media_variant.media_asset_id AND a.visibility = 'public'
  ));
CREATE POLICY review_build_read ON public.review FOR SELECT TO app_build
  USING (moderation_status = 'published');

RESET ROLE;
