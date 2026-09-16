/**
 * Drizzle Kit configuration (spec 002 §2 "Provisioning, connection, configuration"; §13 Q2 and
 * Q6; TASK-014).
 *
 * `pnpm db:generate` writes forward SQL into `db/migrations/` from the table definitions in
 * `db/schema/`; `pnpm db:studio` opens the browser client against the same database. Applying
 * and rolling back are **not** Drizzle Kit's: every migration in this repository ships a
 * hand-written `NNNN_name.down.sql` (`CLAUDE.md`, spec 002 §5.1) and `scripts/db-migrate.ts` is
 * the runner that walks both directions.
 *
 * The URL is the direct one. Migrations and Studio need session state that a PgBouncer
 * transaction pooler does not keep (§13 Q6), and `DATABASE_URL` — the pooled string — belongs to
 * web requests and to `src/lib/db.ts` alone.
 *
 * `strict` and `verbose`: a generated migration is printed and confirmed before it is written,
 * because the file that lands has to be reviewable next to its rollback.
 */
import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

loadEnvConfig(process.cwd());

const url = process.env["DATABASE_URL_UNPOOLED"];

export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema",
  out: "./db/migrations",
  strict: true,
  verbose: true,
  // Named, never echoed: an error mentions the key and no value (spec 001 §5).
  dbCredentials: { url: url ?? "" },
});
