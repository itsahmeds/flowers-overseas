/**
 * The Drizzle table definitions (spec 002 §5.1; TASK-014).
 *
 * Empty by design today: migration `0001` creates roles, grants and one trigger function and no
 * table at all, so there is nothing to declare yet. `drizzle.config.ts` points its `schema` glob
 * here and `pnpm db:check` reads this directory for the table-level drift rule, so the first
 * task that writes a table — TASK-015, migration `0002` (`i18n` + `geo`) — adds a module beside
 * this one, exports it from here, and the gate starts comparing the two sides immediately.
 *
 * Why `db/schema/` rather than `src/db/`: spec 002 §13 Q2 option A puts the data layer under the
 * repository-root `db/` (a guarded root — `.claude/hooks/task-guard.sh`), which keeps `.sql` out
 * of `src/` and keeps the definitions next to the migrations they describe.
 */
export {};
