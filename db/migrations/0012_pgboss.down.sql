-- Rollback of 0012_pgboss (spec 002 §5.1, AC-4, AC-21; TASK-024).
--
-- The schema is pg-boss's alone, so it goes whole: `DROP SCHEMA … CASCADE` removes every table,
-- partition, type, function and grant `0012` created, and every queue and job row with them.
-- `app_owner` owns the schema, and the owner of a schema may drop it with everything in it
-- even where an object inside belongs to another role (a partition pg-boss maintenance created
-- as the connecting login), so nothing is left behind for `0001`'s rollback to trip on.

SET LOCAL ROLE app_owner;

DROP SCHEMA IF EXISTS pgboss CASCADE;

RESET ROLE;
