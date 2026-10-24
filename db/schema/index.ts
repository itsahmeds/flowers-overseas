/**
 * The Drizzle table definitions (spec 002 §5.1; TASK-014, first filled by TASK-015).
 *
 * One module per owning module of spec 002 §2, re-exported here because `drizzle.config.ts`
 * points its `schema` glob at this directory and `pnpm db:check` reads it for the table-level
 * drift rule: every `pgTable` declared under `db/schema/` must have a `CREATE TABLE` in a
 * migration and every `CREATE TABLE` in a migration must have a `pgTable` here.
 *
 * These declarations are the typed mirror of the hand-written SQL in `db/migrations/`, never its
 * source: the migration is what is applied, the rollback next to it is hand-written, and
 * `pnpm db:generate` output is a draft to fold in and then delete (`db/migrations/README.md`).
 *
 * Why `db/schema/` rather than `src/db/`: spec 002 §13 Q2 option A puts the data layer under the
 * repository-root `db/` (a guarded root — `.claude/hooks/task-guard.sh`), which keeps `.sql` out
 * of `src/` and keeps the definitions next to the migrations they describe.
 *
 * Filled: `i18n` and `geo` (migration `0002`), `catalog` (`0003`), media (`0004`), `partners`
 * (`0005`), `customers` (`0006`), `orders` and `payments` (`0007`), notifications and ops
 * (`0009`), `auth` (`0010`), the admin identity (`0014`, spec 012), the checkout draft
 * (`0015`, spec 010), the invoice tables (`0021`, spec 018) and the review ledger (`0023`,
 * spec 012b).
 */
export * from "./admin.ts";
export * from "./auth.ts";
export * from "./catalog.ts";
export * from "./checkout.ts";
export * from "./customers.ts";
export * from "./geo.ts";
export * from "./i18n.ts";
export * from "./invoices.ts";
export * from "./media.ts";
export * from "./notifications.ts";
export * from "./ops.ts";
export * from "./orders.ts";
export * from "./partners.ts";
export * from "./payments.ts";
export * from "./review.ts";
