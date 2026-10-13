-- 0008_order_integrity — the database half of ADR-0009 (spec 002 §2 "Order integrity", §8,
-- AC-12, AC-13 as amended by §14 A6.7/A6.8, AC-15, AC-19, AC-35; spec 010 §5.1 A; spec 001 §14
-- A20; TASK-020).
--
-- The lint rule `fo/no-direct-order-status-write` has guarded application code since spec 001.
-- What lint cannot see — SQL assembled at run time, a table re-exported under another name, a raw
-- statement from a console or a test — Postgres refuses here:
--
--   1. `order_event` is append-only: `UPDATE`, `DELETE` and `TRUNCATE` raise
--      `ORDER_EVENT_APPEND_ONLY`, naming the table (AC-12).
--   2. `"order".status` changes only inside the transaction that set the switch
--      `app.allow_status_write = 'on'` **and** the event `app.transition_event`, both
--      transaction-locally (`SET LOCAL` / `set_config(…, true)`, A6.7 (a)). Without the switch:
--      `ORDER_STATUS_DIRECT_WRITE`. With it, but with no event, or with a `(from, event, to)`
--      triple absent from `order_transition`: `ORDER_TRANSITION_ILLEGAL` (AC-13). `''` counts as
--      unset. After the one row it allowed, the trigger itself sets both back to `''`, so a second
--      raw status write in the same transaction is refused even if the engine forgot its reset
--      (A6.7's F1, AC-35).
--   3. Only `orderService.place` creates an order, and every order starts at the start (spec 010
--      §5.1 A): an insert without the switch raises `ORDER_INSERT_OUTSIDE_SERVICE`, one whose
--      status is not `placed` raises `ORDER_INITIAL_STATUS`. The insert needs no event (A6.10 (3)).
--   4. A real buyer's order never reaches a demo florist and a demo order never reaches a real one
--      (spec 010 §5.1 A): `order_assignment` raises `ASSIGNMENT_MODE_MISMATCH` unless a `live`
--      order goes to an `active` partner and a `demo`/`test` order to a `demo` one. An order's
--      `mode` cannot change afterwards (`ORDER_MODE_IMMUTABLE`), which is what keeps the rule true.
--   5. A delivery photo is private and EXIF-stripped (§8, `plan/07` §1.2): a `delivery_proof` row
--      may reference only a `delivery_proof` asset with `visibility = 'private'` and
--      `exif_stripped = true` (`DELIVERY_PROOF_ASSET`, AC-19), and such an asset cannot be made
--      public or un-stripped while a proof references it.
--
-- The functions that read another table are `SECURITY DEFINER` as `app_owner` with a pinned
-- `search_path`, as `0005`'s are, so they see every row whatever the caller's RLS policy (`0011`)
-- shows. Integration tests set an order's state only through `tests/fixtures/order-state.ts`,
-- which walks legal rows with the switch set transaction-locally and never disables a trigger
-- (A6.7 (b), AC-36).
--
-- Rollback: `0008_order_integrity.down.sql`.

SET LOCAL ROLE app_owner;

/* ---------------------------------------------------------------------------
 * 1. order_event is append-only (AC-12)
 * ------------------------------------------------------------------------ */

CREATE FUNCTION public.order_event_append_only() RETURNS trigger
  LANGUAGE plpgsql
AS $fn$
BEGIN
  RAISE EXCEPTION 'ORDER_EVENT_APPEND_ONLY: order_event is append-only; % is refused', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$fn$;

CREATE TRIGGER order_event_append_only
  BEFORE UPDATE OR DELETE ON public.order_event
  FOR EACH ROW EXECUTE FUNCTION public.order_event_append_only();

CREATE TRIGGER order_event_append_only_statement
  BEFORE TRUNCATE ON public.order_event
  FOR EACH STATEMENT EXECUTE FUNCTION public.order_event_append_only();

REVOKE EXECUTE ON FUNCTION public.order_event_append_only() FROM PUBLIC;

/* ---------------------------------------------------------------------------
 * 2. "order".status: the switch, the event, the legal triple (AC-13, AC-35)
 * ------------------------------------------------------------------------ */

CREATE FUNCTION public.order_status_guard() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $fn$
DECLARE
  event_name text := coalesce(current_setting('app.transition_event', true), '');
BEGIN
  IF coalesce(current_setting('app.allow_status_write', true), '') <> 'on' THEN
    RAISE EXCEPTION 'ORDER_STATUS_DIRECT_WRITE: "order".status changes only through orderService.transition (ADR-0009)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF event_name = '' OR NOT EXISTS (
    SELECT 1 FROM public.order_transition t
    WHERE t.from_status = OLD.status AND t.event = event_name AND t.to_status = NEW.status
  ) THEN
    RAISE EXCEPTION 'ORDER_TRANSITION_ILLEGAL: (%, %, %) is not a row of order_transition',
      OLD.status, nullif(event_name, ''), NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  -- One switch, one row: a later raw status write in this transaction is refused again.
  PERFORM set_config('app.allow_status_write', '', true);
  PERFORM set_config('app.transition_event', '', true);
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER order_status_guard
  BEFORE UPDATE OF status ON public."order"
  FOR EACH ROW EXECUTE FUNCTION public.order_status_guard();

REVOKE EXECUTE ON FUNCTION public.order_status_guard() FROM PUBLIC;

/* ---------------------------------------------------------------------------
 * 3. only the engine inserts, and only at `placed`; the mode never changes
 * ------------------------------------------------------------------------ */

CREATE FUNCTION public.order_insert_guard() RETURNS trigger
  LANGUAGE plpgsql
AS $fn$
BEGIN
  IF coalesce(current_setting('app.allow_status_write', true), '') <> 'on' THEN
    RAISE EXCEPTION 'ORDER_INSERT_OUTSIDE_SERVICE: an order is created only by orderService.place (ADR-0009)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.status IS DISTINCT FROM 'placed' THEN
    RAISE EXCEPTION 'ORDER_INITIAL_STATUS: an order starts at placed, not %', NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER order_insert_guard
  BEFORE INSERT ON public."order"
  FOR EACH ROW EXECUTE FUNCTION public.order_insert_guard();

REVOKE EXECUTE ON FUNCTION public.order_insert_guard() FROM PUBLIC;

CREATE FUNCTION public.order_mode_immutable() RETURNS trigger
  LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NEW.mode IS DISTINCT FROM OLD.mode THEN
    RAISE EXCEPTION 'ORDER_MODE_IMMUTABLE: an order stays %', OLD.mode
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER order_mode_immutable
  BEFORE UPDATE OF mode ON public."order"
  FOR EACH ROW EXECUTE FUNCTION public.order_mode_immutable();

REVOKE EXECUTE ON FUNCTION public.order_mode_immutable() FROM PUBLIC;

/* ---------------------------------------------------------------------------
 * 4. live orders to active partners, demo and test orders to demo partners
 * ------------------------------------------------------------------------ */

CREATE FUNCTION public.order_assignment_mode_check() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $fn$
DECLARE
  order_mode text;
  partner_status text;
BEGIN
  SELECT mode INTO order_mode FROM public."order" WHERE id = NEW.order_id FOR SHARE;
  -- FOR SHARE: the partner's status cannot change under an offer being written.
  SELECT status INTO partner_status
  FROM public.fulfillment_partner WHERE id = NEW.partner_id
  FOR SHARE;
  -- A missing order or partner is the foreign key's to report.
  IF order_mode IS NOT NULL AND partner_status IS NOT NULL AND (
    (order_mode = 'live' AND partner_status <> 'active')
    OR (order_mode <> 'live' AND partner_status <> 'demo')
  ) THEN
    RAISE EXCEPTION 'ASSIGNMENT_MODE_MISMATCH: a % order cannot be offered to a % partner',
      order_mode, partner_status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER order_assignment_mode_check
  BEFORE INSERT OR UPDATE OF order_id, partner_id ON public.order_assignment
  FOR EACH ROW EXECUTE FUNCTION public.order_assignment_mode_check();

REVOKE EXECUTE ON FUNCTION public.order_assignment_mode_check() FROM PUBLIC;

/* ---------------------------------------------------------------------------
 * 5. a delivery photo is private and EXIF-stripped (AC-19)
 * ------------------------------------------------------------------------ */

CREATE FUNCTION public.delivery_proof_asset_check() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $fn$
BEGIN
  -- FOR SHARE: the asset cannot be made public under a proof being written.
  PERFORM 1 FROM public.media_asset
  WHERE id = NEW.media_asset_id
    AND NOT (kind = 'delivery_proof' AND visibility = 'private' AND exif_stripped)
  FOR SHARE;
  IF FOUND THEN
    RAISE EXCEPTION 'DELIVERY_PROOF_ASSET: a delivery photo must be a private, EXIF-stripped delivery_proof asset'
      USING ERRCODE = 'check_violation';
  END IF;
  -- A missing asset is the foreign key's to report.
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER delivery_proof_asset_check
  BEFORE INSERT OR UPDATE OF media_asset_id ON public.delivery_proof
  FOR EACH ROW EXECUTE FUNCTION public.delivery_proof_asset_check();

REVOKE EXECUTE ON FUNCTION public.delivery_proof_asset_check() FROM PUBLIC;

CREATE FUNCTION public.media_asset_delivery_proof_guard() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF NOT (NEW.kind = 'delivery_proof' AND NEW.visibility = 'private' AND NEW.exif_stripped)
     AND EXISTS (SELECT 1 FROM public.delivery_proof WHERE media_asset_id = NEW.id) THEN
    RAISE EXCEPTION 'DELIVERY_PROOF_ASSET: an asset used as a delivery photo stays a private, EXIF-stripped delivery_proof asset'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER media_asset_delivery_proof_guard
  BEFORE UPDATE OF kind, visibility, exif_stripped ON public.media_asset
  FOR EACH ROW EXECUTE FUNCTION public.media_asset_delivery_proof_guard();

REVOKE EXECUTE ON FUNCTION public.media_asset_delivery_proof_guard() FROM PUBLIC;

RESET ROLE;
