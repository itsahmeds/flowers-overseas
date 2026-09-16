/**
 * `pnpm db:check` — the migration gate (spec 001 §2 "Scripts", §5.1; spec 002 §2, AC-26;
 * TASK-011, extended by TASK-014).
 *
 * The offline half of the gate: every rule that can be decided from the repository tree alone,
 * with no database and no credentials, so that it runs on every pull request and in every
 * worktree. Spec 002's migrations live in `db/migrations/` (§13 Q2 option A, ADR-0015 — the name
 * `supabase/` became actively misleading the day Supabase left the stack).
 *
 * What it enforces today:
 *
 *  - **rollback pairing** — every forward migration has a checked-in rollback (`CLAUDE.md`:
 *    "Versioned migrations with a rollback file each"): `NNNN_name.sql` requires
 *    `NNNN_name.down.sql`, and a `.down.sql` with no forward migration is an error too (a
 *    rollback nobody can reach);
 *  - **versions** — prefixes are unique, ordered and contiguous from `0001`, so two branches
 *    cannot both claim `0003` and a gap cannot hide a migration that was never committed;
 *  - **ownership preamble** — every migration except `0001` begins with `SET LOCAL ROLE
 *    app_owner;`, which is how "`app_owner` owns every object" (spec 002 §2 "RLS and roles") is
 *    enforced rather than hoped for. `0001` is exempt because it is the file that creates the
 *    role, and its rollback is exempt because a role cannot drop itself;
 *  - **drift, table level** — every table declared in the Drizzle schema (`db/schema/*.ts`) has a
 *    `CREATE TABLE` in some migration, and every `CREATE TABLE` in a migration has a Drizzle
 *    declaration. This is the offline half of AC-26's "a column added in TS but not in a
 *    migration, and the reverse".
 *
 * What it deliberately does not do yet — **AC-26 proper is TASK-027's**, and needs a live
 * database over `DATABASE_URL_UNPOOLED` (§13 Q6): column-level drift by introspection, RLS
 * enabled and policy-present per table, the `*_minor`/currency pairing, the `bytea` ban, the
 * recipient-email ban (AC-27) and the applied-migration/RLS-coverage summary. Each of those is a
 * rule over a connected catalogue, and each gets its own fixture there.
 *
 * Exit codes: 0 = the migration set is consistent (or empty); 1 = a problem, one line per
 * problem on stderr.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
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
  /**
   * Migrations whose version does not continue the sequence: the set must be `0001`, `0002`, …
   * with no gap, so that "apply everything in order" and "roll back to `0000`" are the same walk
   * in both directions (spec 002 AC-4) and a migration that was never committed is visible.
   */
  readonly versionGaps: readonly string[];
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

  // Silent when a version is duplicated: the duplicate is the problem to fix, and reporting a
  // "does not continue the sequence" line for every file after it helps nobody.
  const versionGaps: string[] = [];
  let expected = 1;
  for (const migration of duplicateVersions.length > 0 ? [] : migrations) {
    const version = Number(migration.version);
    if (version !== expected) {
      versionGaps.push(
        `${migration.file}: version ${migration.version} does not continue the sequence (expected ${String(expected).padStart(migration.version.length, "0")})`,
      );
    }
    expected = version + 1;
  }

  return {
    migrations,
    missingRollbacks,
    orphanRollbacks,
    duplicateVersions,
    versionGaps,
    unparseableFiles,
    ok:
      missingRollbacks.length === 0 &&
      orphanRollbacks.length === 0 &&
      duplicateVersions.length === 0 &&
      versionGaps.length === 0 &&
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
  for (const line of report.versionGaps) {
    lines.push(line);
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

/**
 * The preamble every migration except `0001` must open with, so that `app_owner` owns every
 * object it creates (spec 002 §2 "RLS and roles"). `SET LOCAL`, not `SET`: the runner wraps each
 * file in one transaction, and a role left set on a pooled connection is a security bug.
 */
export const OWNER_PREAMBLE = "SET LOCAL ROLE app_owner;";

/** The bootstrap migration: it creates the roles, so it cannot assume one, and neither can its
 * rollback (a role cannot drop itself). */
export const BOOTSTRAP_VERSION = "0001";

/** `CREATE TABLE [IF NOT EXISTS] [schema.]name` in a migration, however it is quoted. */
const CREATE_TABLE =
  /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:"?public"?\.)?"?([a-z_][a-z0-9_]*)"?/gi;
/** `pgTable("name"` in a Drizzle schema module. */
const PG_TABLE = /pgTable\s*\(\s*["'`]([a-z_][a-z0-9_]*)["'`]/g;

/** Table names a body declares, deduplicated and sorted. */
function tableNames(body: string, pattern: RegExp): string[] {
  const names = new Set<string>();
  for (const match of body.matchAll(pattern)) {
    if (match[1] !== undefined) names.add(match[1]);
  }
  return [...names].sort();
}

export interface SourceReport {
  /** Forward migrations that do not open with `SET LOCAL ROLE app_owner;`. */
  readonly missingOwnerPreamble: readonly string[];
  /** Tables declared in `db/schema/` with no `CREATE TABLE` in any migration. */
  readonly driftMissingInMigrations: readonly string[];
  /** Tables created by a migration with no Drizzle declaration. */
  readonly driftMissingInSchema: readonly string[];
  readonly ok: boolean;
}

/**
 * The rules that need file *contents* rather than file names. Pure, so the unit test drives every
 * failure mode from two maps and no filesystem.
 *
 * Drift is table-level here and deliberately so: a column added in TS but not in a migration is
 * only decidable against a live catalogue, which is TASK-027's connected half of AC-26. A *table*
 * that exists on one side and not the other is decidable from the tree, is the commonest drift in
 * practice, and is worth catching on every pull request rather than once in CI.
 */
export function checkSources(
  migrationSources: ReadonlyMap<string, string>,
  schemaSources: ReadonlyMap<string, string>,
): SourceReport {
  const missingOwnerPreamble: string[] = [];
  const createdTables = new Map<string, string>();

  for (const [file, body] of [...migrationSources].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (file.endsWith(".down.sql")) continue;
    const version = /^(\d+)_/.exec(file)?.[1];
    const statements = body
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "" && !line.startsWith("--"));
    if (version !== BOOTSTRAP_VERSION && statements[0] !== OWNER_PREAMBLE) {
      missingOwnerPreamble.push(
        `${file}: must open with \`${OWNER_PREAMBLE}\` so app_owner owns what it creates (spec 002 §2)`,
      );
    }
    for (const table of tableNames(body, CREATE_TABLE)) {
      if (!createdTables.has(table)) createdTables.set(table, file);
    }
  }

  const declared = new Map<string, string>();
  for (const [file, body] of schemaSources) {
    for (const table of tableNames(body, PG_TABLE)) {
      if (!declared.has(table)) declared.set(table, file);
    }
  }

  const driftMissingInMigrations = [...declared.entries()]
    .filter(([table]) => !createdTables.has(table))
    .map(
      ([table, file]) =>
        `${file}: table \`${table}\` is declared in the Drizzle schema but no migration creates it`,
    )
    .sort();

  const driftMissingInSchema = [...createdTables.entries()]
    .filter(([table]) => !declared.has(table))
    .map(
      ([table, file]) =>
        `${file}: table \`${table}\` is created by a migration but is declared in no Drizzle schema module`,
    )
    .sort();

  return {
    missingOwnerPreamble,
    driftMissingInMigrations,
    driftMissingInSchema,
    ok:
      missingOwnerPreamble.length === 0 &&
      driftMissingInMigrations.length === 0 &&
      driftMissingInSchema.length === 0,
  };
}

/** Human-readable lines for a source report; empty when everything agrees. */
export function formatSourceProblems(report: SourceReport): string[] {
  return [
    ...report.missingOwnerPreamble,
    ...report.driftMissingInMigrations,
    ...report.driftMissingInSchema,
  ];
}

/** `*.sql` (or `*.ts`) files in a directory, keyed by filename. `{}` when the directory is absent. */
export function readSources(
  dir: string,
  extension: string,
): Map<string, string> {
  const sources = new Map<string, string>();
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return sources;
  }
  for (const entry of entries.sort()) {
    const path = join(dir, entry);
    if (!entry.endsWith(extension)) continue;
    if (!statSync(path).isFile()) continue;
    sources.set(entry, readFileSync(path, "utf8"));
  }
  return sources;
}

/** The one line `db:check` prints on success, and the one CI puts in its step summary. */
export function formatSummary(report: DbCheckReport): string {
  if (report.migrations.length === 0) {
    // The literal string spec 001 §5.1 asks for, so the CI job and TASK-012's docs can grep it.
    return "no migrations";
  }
  return `${report.migrations.length} migration(s), each with a rollback`;
}

export function runDbCheck(
  migrationsDir: string,
  schemaDir?: string,
): {
  ok: boolean;
  output: string[];
} {
  const report = checkMigrations(readMigrationDir(migrationsDir));
  const sources = checkSources(
    readSources(migrationsDir, ".sql"),
    schemaDir === undefined ? new Map() : readSources(schemaDir, ".ts"),
  );
  if (report.ok && sources.ok) {
    return { ok: true, output: [formatSummary(report)] };
  }
  return {
    ok: false,
    output: [...formatProblems(report), ...formatSourceProblems(sources)],
  };
}

/** Spec 002 §13 Q2 option A (ADR-0015): migrations live in `db/`, not in a vendor's directory. */
export const MIGRATIONS_DIR = "db/migrations";
/** The Drizzle table definitions the drift rule reads. Empty until TASK-015 writes `0002`. */
export const SCHEMA_DIR = "db/schema";

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const { ok, output } = runDbCheck(
    resolve(repoRoot, MIGRATIONS_DIR),
    resolve(repoRoot, SCHEMA_DIR),
  );
  for (const line of output) {
    if (ok) console.log(line);
    else console.error(`db:check: ${line}`);
  }
  // TODO(spec 002 AC-26, TASK-027): the connected half — column-level drift, RLS enabled and a
  // policy present per table, the `*_minor`/currency pairing, the `bytea` ban and AC-27's
  // recipient-email ban — over `DATABASE_URL_UNPOOLED` (§13 Q6).
  process.exit(ok ? 0 : 1);
}
