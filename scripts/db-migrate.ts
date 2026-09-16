/**
 * `pnpm db:migrate` / `pnpm db:rollback` — the migration runner (spec 002 §2 "Provisioning,
 * connection, configuration", §5.1 "Migrations and rollback", AC-4; §13 Q2 and Q6; TASK-014).
 *
 * Why a runner of our own rather than `drizzle-kit migrate`: spec 002 requires a *rollback* for
 * every migration (`CLAUDE.md`: "versioned migrations with a rollback file each") and AC-4 asks
 * for `pnpm db:rollback --to 0000` to return the database to zero objects. Drizzle Kit generates
 * the forward SQL — that is what `pnpm db:generate` is for — but has no notion of a down file, so
 * the ordering, the bookkeeping and the reverse walk live here, in eighty lines that the unit
 * test drives without a database.
 *
 * Contract:
 *
 *  - migrations are `db/migrations/NNNN_name.sql`, applied in ascending version order, each in
 *    one transaction, each recorded in `public.schema_migrations`;
 *  - rollbacks are `NNNN_name.down.sql`, applied in *descending* order down to (and excluding)
 *    the `--to` version, each in one transaction, each un-recorded in the same transaction;
 *  - the connection is `DATABASE_URL_UNPOOLED` and never the pooled URL (§13 Q6: a transaction
 *    pooler has no session state, and DDL under one is a class of bug nobody debugs twice);
 *  - object ownership is the migration's own business: every file from `0002` on begins with
 *    `SET LOCAL ROLE app_owner;` so that `app_owner` owns every object (§2, `db/migrations/
 *    README.md`), and `pnpm db:check` fails the file that forgets. `0001` cannot: it is the file
 *    that creates the role.
 *
 * `public.schema_migrations` is runner bookkeeping, not an application table: it is owned by the
 * connecting role, carries no personal data, and is deliberately outside the schema the Drizzle
 * definitions describe.
 *
 * Usage:
 *   pnpm db:migrate [--dry-run]
 *   pnpm db:rollback --to 0000 [--dry-run]
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { MIGRATIONS_DIR, checkMigrations } from "./db-check.ts";

/** One forward migration and the rollback beside it. */
export interface Migration {
  readonly version: string;
  readonly name: string;
  readonly file: string;
  readonly downFile: string;
}

export interface RunnerOptions {
  readonly direction: "up" | "down";
  /** Rollbacks stop *above* this version; `0000` means "roll everything back". */
  readonly to?: string;
  readonly dryRun: boolean;
}

export const DEFAULT_ROLLBACK_TARGET = "0000";

/** The bookkeeping table. Created before the first migration, dropped by nobody. */
export const BOOKKEEPING_TABLE = "public.schema_migrations";

const argsSchema = z.object({
  direction: z.enum(["up", "down"]),
  to: z.string().regex(/^\d+$/, "must be a numeric migration version"),
  dryRun: z.boolean(),
});

/**
 * Parses the CLI. `--to` is meaningless for `up` (a forward run always applies everything) and
 * is rejected there rather than silently ignored.
 */
export function parseArgs(argv: readonly string[]): RunnerOptions {
  const direction = argv.includes("--down") ? "down" : "up";
  const dryRun = argv.includes("--dry-run");
  const toIndex = argv.indexOf("--to");
  const inline = argv.find((arg) => arg.startsWith("--to="));
  const to =
    toIndex >= 0
      ? argv[toIndex + 1]
      : inline !== undefined
        ? inline.slice("--to=".length)
        : undefined;

  if (direction === "up" && to !== undefined) {
    throw new Error(
      "--to applies to `db:rollback` only; `db:migrate` is always forward",
    );
  }

  const parsed = argsSchema.parse({
    direction,
    to: to ?? DEFAULT_ROLLBACK_TARGET,
    dryRun,
  });

  return direction === "down"
    ? { direction, to: parsed.to, dryRun: parsed.dryRun }
    : { direction, dryRun: parsed.dryRun };
}

/** Every migration in the directory, in ascending version order. Throws on an inconsistent set. */
export function readMigrations(dir: string): Migration[] {
  const report = checkMigrations(readdirSync(dir));
  if (!report.ok) {
    throw new Error(
      "the migration set is inconsistent; run `pnpm db:check` and fix it before migrating",
    );
  }
  return [...report.migrations].sort((a, b) =>
    a.version.localeCompare(b.version),
  );
}

/** Migrations not yet in `schema_migrations`, in the order they must be applied. */
export function planUp(
  available: readonly Migration[],
  applied: readonly string[],
): Migration[] {
  const done = new Set(applied);
  return available.filter((migration) => !done.has(migration.version));
}

/**
 * Migrations to roll back, newest first, down to but not including `to`. Only applied
 * migrations are rolled back, so a partial database is not "rolled back" into a worse state.
 */
export function planDown(
  available: readonly Migration[],
  applied: readonly string[],
  to: string,
): Migration[] {
  const done = new Set(applied);
  return available
    .filter(
      (migration) =>
        done.has(migration.version) && migration.version.localeCompare(to) > 0,
    )
    .sort((a, b) => b.version.localeCompare(a.version));
}

/** Human-readable plan, printed by `--dry-run` and by every real run before it starts. */
export function formatPlan(
  options: RunnerOptions,
  plan: readonly Migration[],
): string[] {
  if (plan.length === 0) {
    return [
      options.direction === "up"
        ? "db:migrate: nothing to apply"
        : "db:rollback: nothing to roll back",
    ];
  }
  const verb = options.direction === "up" ? "apply" : "roll back";
  return [
    `db:${options.direction === "up" ? "migrate" : "rollback"}: ${verb} ${String(plan.length)} migration(s)`,
    ...plan.map(
      (migration) =>
        `  ${options.direction === "up" ? migration.file : migration.downFile}`,
    ),
  ];
}

const urlSchema = z
  .string()
  .min(1)
  .refine(
    (value) =>
      value.startsWith("postgres://") || value.startsWith("postgresql://"),
    "DATABASE_URL_UNPOOLED must be a postgres:// connection string",
  );

/**
 * The direct connection string, validated at the boundary and never echoed: an error names the
 * key, never the value (spec 001 §5).
 */
export function resolveDirectUrl(
  environment: Readonly<Record<string, string | undefined>>,
): string {
  const parsed = urlSchema.safeParse(
    environment["DATABASE_URL_UNPOOLED"] ?? "",
  );
  if (!parsed.success) {
    throw new Error(
      "DATABASE_URL_UNPOOLED is missing or is not a postgres:// connection string (see .env.example)",
    );
  }
  return parsed.data;
}

/* c8 ignore start -- the connected half; exercised by the round trip in the PR, not in CI (T-01/T-02, TASK-022) */

async function main(): Promise<void> {
  const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const options = parseArgs(process.argv.slice(2));
  const dir = resolve(repoRoot, MIGRATIONS_DIR);
  const available = readMigrations(dir);

  // CommonJS interop: `@next/env` is a CJS module, so the named export lives on `default` when
  // it is reached through a dynamic `import()` from a `.ts` file Node type-strips.
  const nextEnv = await import("@next/env");
  const loadEnvConfig = (nextEnv as unknown as { default: typeof nextEnv })
    .default.loadEnvConfig;
  loadEnvConfig(repoRoot);
  const url = resolveDirectUrl(process.env);

  const { default: postgres } = await import("postgres");
  const sql = postgres(url, {
    max: 1,
    prepare: false,
    onnotice: () => undefined,
  });

  try {
    await sql.unsafe(
      `CREATE TABLE IF NOT EXISTS ${BOOKKEEPING_TABLE} (
         version text PRIMARY KEY,
         name text NOT NULL,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`,
    );
    const rows = await sql.unsafe<{ version: string }[]>(
      `SELECT version FROM ${BOOKKEEPING_TABLE} ORDER BY version`,
    );
    const applied = rows.map((row) => row.version);

    const plan =
      options.direction === "up"
        ? planUp(available, applied)
        : planDown(available, applied, options.to ?? DEFAULT_ROLLBACK_TARGET);

    for (const line of formatPlan(options, plan)) console.log(line);
    if (options.dryRun || plan.length === 0) return;

    for (const migration of plan) {
      const file =
        options.direction === "up" ? migration.file : migration.downFile;
      const body = readFileSync(resolve(dir, file), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        if (options.direction === "up") {
          await tx.unsafe(
            `INSERT INTO ${BOOKKEEPING_TABLE} (version, name) VALUES ($1, $2)`,
            [migration.version, migration.name],
          );
        } else {
          await tx.unsafe(
            `DELETE FROM ${BOOKKEEPING_TABLE} WHERE version = $1`,
            [migration.version],
          );
        }
      });
      console.log(`  ok ${file}`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(
      `db:${process.argv.includes("--down") ? "rollback" : "migrate"}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exit(1);
  });
}

/* c8 ignore stop */
