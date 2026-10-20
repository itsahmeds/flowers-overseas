-- 0016_audit_trail — the audit of every admin write and the status-flip guard (spec 012 §2.3,
-- §5.1 `NNNN_audit_trail`, §11, AC-10, AC-11, AC-12, AC-13; TASK-218).
--
--   `audit_log`            gains `reason` (the optional `app.audit_reason`) and `channel` (`admin`
--                          by default, `cli` for `pnpm admin:grant`, `import`, `system`). It is
--                          already append-only (`0009`'s `audit_log_append_only()`: UPDATE,
--                          DELETE and TRUNCATE raise, with the one carve-out for the FK's
--                          `ON DELETE SET NULL` on `actor_user_id`); that function and its two
--                          triggers are kept exactly as they are (TASK-218 brief, carry-forward
--                          from PR 210), so no second append-only trigger is added here.
--                          A view of personal data (`order.viewed`, `application.viewed`,
--                          AC-13) is a row with no `before` and no `after`: `0009`'s
--                          `audit_log_change_check` is widened to admit exactly the actions
--                          ending `.viewed`, and `audit_log_view_check` makes such a row carry no
--                          values at all.
--   `audit_row_change()`   AFTER INSERT OR UPDATE OR DELETE, FOR EACH ROW, on the ten tables
--                          admin can write in v0. When `app.role = 'admin'` it writes one
--                          `audit_log` row per affected row in the same transaction: actor id
--                          and label, `app.audit_action`, table, row id, masked before/after,
--                          `app.request_id`, `app.audit_reason`, `app.audit_channel`. With no
--                          `app.audit_action` it raises `AUDIT_ACTION_MISSING` and the statement
--                          rolls back, so a new server action cannot ship unaudited. Any other
--                          `app.role` (the seed, a job, a migration) writes nothing.
--                          The trigger's arguments name the row's key columns; the row id is
--                          their values joined with `:`.
--                          An UPDATE records only the columns whose value changed (the column is
--                          named on both sides); an INSERT the whole new row as `after`, a
--                          DELETE the whole old row as `before`.
--   masking                the personal columns in `audit_mask_columns()` — the one list, a
--                          constant in the function — are written as the mask `[masked]`
--                          whenever they hold a value: the log records *that* they changed,
--                          never what they were (AC-11). A NULL stays NULL.
--   `audit_mark_real()`    the BEFORE INSERT OR UPDATE companion on the three tables that carry
--                          `source`: an admin write leaves `source = 'real'`, so the seed never
--                          overwrites it (spec 002 §2 "seed").
--   `status_flip_guard()`  BEFORE UPDATE on `country` and `fulfillment_partner`: a change of
--                          `status` outside `app.role = 'admin'` raises
--                          `STATUS_FLIP_OUTSIDE_ADMIN` — for every database role, `app_owner`
--                          and the migration runner included (`plan/10` §4: no PR flips a
--                          country or partner status through code or migration). It fires on
--                          every UPDATE rather than only `UPDATE OF status`, so a status set by
--                          another BEFORE trigger is caught too. Inserts (the seed) are not
--                          guarded.
--   `audit_record_view()`  the one way `logAdminRead` writes a view row, through the same actor,
--                          channel and request-id rules as the trigger.
--
-- The trigger functions are `SECURITY DEFINER` (owned by `app_owner`, which bypasses RLS) with a
-- fixed `search_path`, so the audit row is written whatever the caller's policies become; the
-- actor's display name is read from `admin_profile` at write time and kept in `actor_label`,
-- which outlives the account (`0009`).
--
-- Rollback: `0016_audit_trail.down.sql`.

SET LOCAL ROLE app_owner;

/* ---------------------------------------------------------------------------
 * audit_log: reason, channel, view rows
 * ------------------------------------------------------------------------ */

ALTER TABLE public.audit_log
  ADD COLUMN reason text NULL,
  ADD COLUMN channel text NOT NULL DEFAULT 'admin',
  ADD CONSTRAINT audit_log_channel_check CHECK (channel IN ('admin', 'cli', 'import', 'system')),
  ADD CONSTRAINT audit_log_reason_check CHECK (reason IS NULL OR btrim(reason) <> '');

ALTER TABLE public.audit_log DROP CONSTRAINT audit_log_change_check;
ALTER TABLE public.audit_log
  ADD CONSTRAINT audit_log_change_check CHECK (
    before IS NOT NULL OR after IS NOT NULL OR action ~ '[.]viewed$'
  ),
  ADD CONSTRAINT audit_log_view_check CHECK (
    action !~ '[.]viewed$' OR (before IS NULL AND after IS NULL)
  );

-- The filters of `/admin/audit` read newest first, by actor and by action.
CREATE INDEX audit_log_at_idx ON public.audit_log USING btree (at DESC);
CREATE INDEX audit_log_actor_idx ON public.audit_log USING btree (actor_user_id, at DESC);
CREATE INDEX audit_log_action_idx ON public.audit_log USING btree (action, at DESC);

/* ---------------------------------------------------------------------------
 * the masked-column list and the actor, shared by the trigger and the view writer
 * ------------------------------------------------------------------------ */

-- The personal columns of the audited tables. `partner_application.contact_name` arrives with
-- spec 011's `NNNN_florists_v0`; listing it now means it is masked from its first write.
CREATE FUNCTION public.audit_mask_columns(p_table text) RETURNS text[]
  LANGUAGE sql
  IMMUTABLE
  SET search_path = pg_catalog, public
AS $fn$
  SELECT CASE p_table
    WHEN 'fulfillment_partner' THEN
      ARRAY['legal_name', 'contact_email', 'contact_phone']
    WHEN 'partner_application' THEN
      ARRAY['business_name', 'contact_name', 'contact_email', 'contact_phone', 'registration_number']
    ELSE ARRAY[]::text[]
  END;
$fn$;

-- `p_row` with every masked column that holds a value replaced by the mask.
CREATE FUNCTION public.audit_mask(p_table text, p_row jsonb) RETURNS jsonb
  LANGUAGE plpgsql
  IMMUTABLE
  SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_column text;
  v_row    jsonb := p_row;
BEGIN
  IF v_row IS NULL THEN
    RETURN NULL;
  END IF;
  FOREACH v_column IN ARRAY public.audit_mask_columns(p_table) LOOP
    IF v_row ? v_column AND jsonb_typeof(v_row -> v_column) <> 'null' THEN
      v_row := jsonb_set(v_row, ARRAY[v_column], to_jsonb('[masked]'::text));
    END IF;
  END LOOP;
  RETURN v_row;
END;
$fn$;

-- Writes one audit row as the current admin actor. Shared by the trigger and the view writer, so
-- the actor, channel and request id are decided in one place.
CREATE FUNCTION public.audit_write(
  p_entity_table text,
  p_entity_id    text,
  p_before       jsonb,
  p_after        jsonb
) RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_action  text := nullif(current_setting('app.audit_action', true), '');
  v_user    text := nullif(current_setting('app.user_id', true), '');
  v_request text := coalesce(nullif(current_setting('app.request_id', true), ''), 'none');
  v_channel text := coalesce(nullif(current_setting('app.audit_channel', true), ''), 'admin');
  v_reason  text := nullif(btrim(coalesce(current_setting('app.audit_reason', true), '')), '');
  v_user_id uuid;
  v_label   text;
BEGIN
  IF v_action IS NULL THEN
    RAISE EXCEPTION 'AUDIT_ACTION_MISSING: an admin-context write to % needs app.audit_action', p_entity_table
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF v_user IS NOT NULL THEN
    -- The key is kept only when the account exists (a FK to `users`); the label always names
    -- the actor: their display name, or `admin:{uuid}` when they have no profile.
    SELECT u.id INTO v_user_id FROM public.users u WHERE u.id::text = v_user;
    SELECT p.display_name INTO v_label FROM public.admin_profile p WHERE p.user_id::text = v_user;
    v_label := coalesce(v_label, 'admin:' || v_user);
  ELSE
    -- No signed-in person: a CLI run (`cli:admin-grant`) or a scheduled admin task.
    v_label := v_request;
  END IF;
  -- `at` is the statement's own instant, not the transaction's start (`now()`, the column's
  -- default): the rows of one transaction then read in the order they were written.
  INSERT INTO public.audit_log (
    actor_user_id, actor_label, action, entity_table, entity_id, before, after, request_id,
    reason, channel, at
  ) VALUES (
    v_user_id, v_label, v_action, p_entity_table, p_entity_id, p_before, p_after, v_request,
    v_reason, v_channel, clock_timestamp()
  );
END;
$fn$;

/* ---------------------------------------------------------------------------
 * audit_row_change() — AFTER INSERT/UPDATE/DELETE on the ten v0 tables
 * ------------------------------------------------------------------------ */

CREATE FUNCTION public.audit_row_change() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_old    jsonb;
  v_new    jsonb;
  v_row    jsonb;
  v_before jsonb;
  v_after  jsonb;
  v_id     text := '';
  v_key    text;
  v_index  integer;
BEGIN
  IF coalesce(current_setting('app.role', true), '') <> 'admin' THEN
    RETURN NULL;
  END IF;
  IF TG_OP <> 'INSERT' THEN v_old := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN v_new := to_jsonb(NEW); END IF;
  v_row := coalesce(v_new, v_old);
  FOR v_index IN 0 .. TG_NARGS - 1 LOOP
    v_key := TG_ARGV[v_index];
    v_id := v_id || CASE WHEN v_index > 0 THEN ':' ELSE '' END || coalesce(v_row ->> v_key, '');
  END LOOP;
  IF TG_OP = 'UPDATE' THEN
    SELECT coalesce(jsonb_object_agg(n.key, o.value), '{}'::jsonb),
           coalesce(jsonb_object_agg(n.key, n.value), '{}'::jsonb)
      INTO v_before, v_after
      FROM jsonb_each(v_new) AS n
      JOIN jsonb_each(v_old) AS o USING (key)
     WHERE n.value IS DISTINCT FROM o.value;
  ELSE
    v_before := v_old;
    v_after := v_new;
  END IF;
  PERFORM public.audit_write(
    TG_TABLE_NAME,
    v_id,
    public.audit_mask(TG_TABLE_NAME, v_before),
    public.audit_mask(TG_TABLE_NAME, v_after)
  );
  RETURN NULL;
END;
$fn$;

CREATE TRIGGER country_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.country
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('id');
CREATE TRIGGER fulfillment_partner_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.fulfillment_partner
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('id');
CREATE TRIGGER partner_coverage_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.partner_coverage
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('id');
CREATE TRIGGER partner_blackout_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.partner_blackout
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('partner_id', 'date');
CREATE TRIGGER partner_catalog_mapping_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.partner_catalog_mapping
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('id');
CREATE TRIGGER partner_application_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.partner_application
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('id');
CREATE TRIGGER feature_flag_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.feature_flag
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('key');
CREATE TRIGGER feature_flag_scope_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.feature_flag_scope
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('id');
CREATE TRIGGER user_role_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.user_role
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('user_id', 'role');
CREATE TRIGGER admin_profile_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.admin_profile
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('user_id');

/* ---------------------------------------------------------------------------
 * audit_mark_real() — an admin write leaves `source = 'real'`
 * ------------------------------------------------------------------------ */

CREATE FUNCTION public.audit_mark_real() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF coalesce(current_setting('app.role', true), '') = 'admin' THEN
    NEW.source := 'real';
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER country_audit_source
  BEFORE INSERT OR UPDATE ON public.country
  FOR EACH ROW EXECUTE FUNCTION public.audit_mark_real();
CREATE TRIGGER fulfillment_partner_audit_source
  BEFORE INSERT OR UPDATE ON public.fulfillment_partner
  FOR EACH ROW EXECUTE FUNCTION public.audit_mark_real();
CREATE TRIGGER partner_catalog_mapping_audit_source
  BEFORE INSERT OR UPDATE ON public.partner_catalog_mapping
  FOR EACH ROW EXECUTE FUNCTION public.audit_mark_real();

/* ---------------------------------------------------------------------------
 * status_flip_guard() — go-live only in admin, enforced by Postgres
 * ------------------------------------------------------------------------ */

CREATE FUNCTION public.status_flip_guard() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND coalesce(current_setting('app.role', true), '') <> 'admin' THEN
    RAISE EXCEPTION 'STATUS_FLIP_OUTSIDE_ADMIN: %.status changes only in admin', TG_TABLE_NAME
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER country_status_flip_guard
  BEFORE UPDATE ON public.country
  FOR EACH ROW EXECUTE FUNCTION public.status_flip_guard();
CREATE TRIGGER fulfillment_partner_status_flip_guard
  BEFORE UPDATE ON public.fulfillment_partner
  FOR EACH ROW EXECUTE FUNCTION public.status_flip_guard();

/* ---------------------------------------------------------------------------
 * audit_record_view() — `logAdminRead`'s one write (AC-13)
 * ------------------------------------------------------------------------ */

CREATE FUNCTION public.audit_record_view(p_entity_table text, p_entity_id text) RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF coalesce(current_setting('app.role', true), '') <> 'admin' THEN
    RAISE EXCEPTION 'AUDIT_VIEW_OUTSIDE_ADMIN: a view is recorded only in admin context'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF coalesce(current_setting('app.audit_action', true), '') !~ '[.]viewed$' THEN
    RAISE EXCEPTION 'AUDIT_ACTION_MISSING: a view needs an app.audit_action ending .viewed'
      USING ERRCODE = 'restrict_violation';
  END IF;
  PERFORM public.audit_write(p_entity_table, p_entity_id, NULL, NULL);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.audit_write(text, text, jsonb, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.audit_write(text, text, jsonb, jsonb) FROM app_web;
REVOKE EXECUTE ON FUNCTION public.audit_row_change() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.audit_mark_real() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.status_flip_guard() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.audit_record_view(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.audit_record_view(text, text) TO app_web;

RESET ROLE;
