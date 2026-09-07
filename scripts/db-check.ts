/**
 * `pnpm db:check` — the migration gate (spec 001 §2 "Scripts", §5.1; TASK-011).
 *
 * **Stub in spec 001, by design.** 001 touches no database: `supabase/migrations/` is created
 * empty with a `.gitkeep` and the whole of the schema — Drizzle config, migrations, RLS, rollback
 * files, generated types, drift detection — is spec 002 (§3 "Non-goals"). So this script's job
 * here is to exist, be wired into CI, and print `no migrations`, so that spec 002 replaces a body
 * rather than adding a gate nobody remembers.
 *
 * What it already enforces, because it costs nothing and would otherwise be forgotten:
 *
 *  - every forward migration has a checked-in rollback (`CLAUDE.md`: "Versioned migrations with a
 *    rollback file each"): `NNNN_name.sql` requires `NNNN_name.down.sql`;
 *  - version prefixes are unique and ordered, so two branches cannot both claim `0003`;
 *  - a `.down.sql` without its forward migration is an error too (a rollback nobody can reach).
 *
 * What it deliberately does not do until 002: connect to Postgres, diff the Drizzle schema
 * against the database, or check RLS. Schema drift needs a database URL and generated types,
 * both of which arrive with 002; this file's TODO is the marker.
 *
 * Exit codes: 0 = the migration set is consistent (or empty); 1 = a problem, one line per
 * problem on stderr.
 */
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** A forward migration and the rollback the rules require next to it. */
export interface MigrationFile {
  readonly version: string;
  readonly name: string;
  readonly file: string;
  readonly downFile: string;
}

export interface DbCheckReport {
  readonly migrations: readonly MigrationFile[];
  /** Forward migrations with no `.down.sql` next to them. */
  readonly missingRollbacks: readonly string[];
  /** `.down.sql` files with no forward migration. */
  readonly orphanRollbacks: readonly string[];
  /** Version prefixes claimed by more than one migration. */
  readonly duplicateVersions: readonly string[];
  /** Files that are neither `NNN_name.sql` nor `NNN_name.down.sql`. */
  readonly unparseableFiles: readonly string[];
  readonly ok: boolean;
}

const MIGRATION = /^(\d+)_([a-z0-9_-]+)\.sql$/;
const ROLLBACK = /^(\d+)_([a-z0-9_-]+)\.down\.sql$/;
/** Files that are not migrations and are never reported: directory keepers and editor noise. */
const IGNORED = new Set([".gitkeep", ".DS_Store", "README.md"]);

/**
 * Applies the rules above to a directory listing. Pure, so the unit test can drive every failure
 * mode without writing SQL files.
 */
export function checkMigrations(entries: readonly string[]): DbCheckReport {
  const migrations: MigrationFile[] = [];
  const rollbacks = new Map<string, string>();
  const unparseableFiles: string[] = [];

  for (const entry of [...entries].sort()) {
    if (IGNORED.has(entry)) continue;
    const rollback = ROLLBACK.exec(entry);
    if (rollback?.[1] !== undefined && rollback[2] !== undefined) {
      rollbacks.set(`${rollback[1]}_${rollback[2]}`, entry);
      continue;
    }
    const forward = MIGRATION.exec(entry);
    if (forward?.[1] !== undefined && forward[2] !== undefined) {
      migrations.push({
        version: forward[1],
        name: forward[2],
        file: entry,
        downFile: `${forward[1]}_${forward[2]}.down.sql`,
      });
      continue;
    }
    unparseableFiles.push(entry);
  }

  const missingRollbacks = migrations
    .filter(
      (migration) => !rollbacks.has(`${migration.version}_${migration.name}`),
    )
    .map((migration) => migration.file);

  const forwardKeys = new Set(
    migrations.map((migration) => `${migration.version}_${migration.name}`),
  );
  const orphanRollbacks = [...rollbacks.entries()]
    .filter(([key]) => !forwardKeys.has(key))
    .map(([, file]) => file);

  const seen = new Set<string>();
  const duplicateVersions = [
    ...new Set(
      migrations
        .filter((migration) => {
          if (seen.has(migration.version)) return true;
          seen.add(migration.version);
          return false;
        })
        .map((migration) => migration.version),
    ),
  ];

  return {
    migrations,
    missingRollbacks,
    orphanRollbacks,
    duplicateVersions,
    unparseableFiles,
    ok:
      missingRollbacks.length === 0 &&
      orphanRollbacks.length === 0 &&
      duplicateVersions.length === 0 &&
      unparseableFiles.length === 0,
  };
}

/** Human-readable lines for a report; empty when everything is consistent. */
export function formatProblems(report: DbCheckReport): string[] {
  const lines: string[] = [];
  for (const file of report.missingRollbacks) {
    lines.push(
      `${file}: no rollback file. Every migration needs a checked-in "${file.replace(/\.sql$/, ".down.sql")}" (CLAUDE.md).`,
    );
  }
  for (const file of report.orphanRollbacks) {
    lines.push(
      `${file}: rollback with no forward migration of the same version and name.`,
    );
  }
  for (const version of report.duplicateVersions) {
    lines.push(
      `version ${version} is claimed by more than one migration; renumber so the order is total.`,
    );
  }
  for (const file of report.unparseableFiles) {
    lines.push(
      `${file}: not a migration filename (expected NNN_name.sql or NNN_name.down.sql).`,
    );
  }
  return lines;
}

/** `readdirSync` on the migrations directory, or `[]` when it does not exist yet. */
export function readMigrationDir(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

/** The one line `db:check` prints on success, and the one CI puts in its step summary. */
export function formatSummary(report: DbCheckReport): string {
  if (report.migrations.length === 0) {
    // The literal string spec 001 §5.1 asks for, so the CI job and TASK-012's docs can grep it.
    return "no migrations";
  }
  return `${report.migrations.length} migration(s), each with a rollback`;
}

export function runDbCheck(migrationsDir: string): {
  ok: boolean;
  output: string[];
} {
  const report = checkMigrations(readMigrationDir(migrationsDir));
  if (report.ok) return { ok: true, output: [formatSummary(report)] };
  return { ok: false, output: formatProblems(report) };
}

export const MIGRATIONS_DIR = "supabase/migrations";

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const { ok, output } = runDbCheck(resolve(repoRoot, MIGRATIONS_DIR));
  for (const line of output) {
    if (ok) console.log(line);
    else console.error(`db:check: ${line}`);
  }
  // TODO(spec 002): replace the body of this script with the real gate — Drizzle schema vs.
  // database drift, RLS policy presence per table, and `supabase/migrations` applied in order.
  process.exit(ok ? 0 : 1);
}
