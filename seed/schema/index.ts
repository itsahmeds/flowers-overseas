/**
 * The seed dataset's public surface (spec 006 §2.2's `seed/schema/*.ts`, §5.2's file map;
 * TASK-072).
 *
 * Owned by: spec 006. Everything the gate (`pnpm seed:check`, TASK-075), the differ
 * (`pnpm seed:diff`, TASK-076), the variant CLI (TASK-078) and spec 002's importer (TASK-083)
 * need in order to read `seed/data/**` is exported here: the `Seed*Schema` parsers, the media and
 * alt manifests, and the `to*Row()` projections onto spec 002 §5.1's columns.
 *
 * **Nothing in this directory reads a database, and `pnpm check:no-db` asserts it** (spec 006
 * AC-1). Nothing in it is reachable from a client entry point either: it is CLI and importer code
 * that happens to share its schemas with tests.
 */
export * from "./header.ts";
export * from "./catalogue.ts";
export * from "./copy.ts";
export * from "./media.ts";
export * from "./prompts.ts";
export * from "./files.ts";
