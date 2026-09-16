-- Rollback of 0001_roles_grants_updated_at (spec 002 §5.1 "Rollbacks drop in reverse dependency
-- order; 0001.down.sql reassigns ownership before dropping roles", AC-4; TASK-014).
--
-- Reverse order: function, then default privileges, then schema grants, then the roles. The two
-- `DROP OWNED BY` calls are what makes the roles droppable — a role cannot be dropped while any
-- privilege or object still references it, and `ALTER DEFAULT PRIVILEGES` rows count. They are
-- safe here because this file only ever runs with every later migration already rolled back, so
-- `app_owner` owns nothing but what 0001 created. `db:rollback` enforces that order.
--
-- Not run inside `SET LOCAL ROLE app_owner`: a role cannot drop itself.

DROP FUNCTION IF EXISTS public.set_updated_at();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE app_owner IN SCHEMA public '
         || 'REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM app_web';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE app_owner IN SCHEMA public '
         || 'REVOKE USAGE, SELECT ON SEQUENCES FROM app_web';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE app_owner IN SCHEMA public '
         || 'REVOKE EXECUTE ON FUNCTIONS FROM app_web';
    EXECUTE 'REVOKE USAGE ON SCHEMA public FROM app_owner';
    EXECUTE 'REASSIGN OWNED BY app_owner TO CURRENT_USER';
    EXECUTE 'DROP OWNED BY app_owner';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_web') THEN
    EXECUTE 'REVOKE USAGE ON SCHEMA public FROM app_web';
    EXECUTE 'DROP OWNED BY app_web';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_web') THEN
    EXECUTE 'DROP ROLE app_web';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    EXECUTE 'DROP ROLE app_owner';
  END IF;
END
$$;
