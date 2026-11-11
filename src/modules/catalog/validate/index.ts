/**
 * The catalogue's shared rules (spec 012b §2.5, AC-15; TASK-297): ids in `rules.ts`, the pure
 * checks in `catalogue.ts`. Read by the admin save, `pnpm catalogue:check` and `pnpm seed:check`.
 */
export * from "./rules.ts";
export * from "./catalogue.ts";
