/**
 * The migration set, as files on disk: the naming, pairing and ordering rules, and nothing else
 * (spec 002 §5.1, AC-4; TASK-011, TASK-014; split out of `./db-check.ts` by TASK-505).
 *
 * Why its own module: `./db-migrate.ts` is also the deploy step (spec 002 §14
 * A-orchestrator-2026-11-08c). Railway runs it in the shipped image, which carries no Drizzle
 * schema and no development `node_modules`, so the runner's path must not import `drizzle-orm`
 * or `db/schema/**`, which `./db-check.ts` needs for its drift rule. This file imports Node
 * built-ins only; `./db-check.ts` re-exports everything here, so its callers did not change.
 */
import type { Dirent } from "node:fs";
import { readdirSync } from "node:fs";

/** Spec 002 §13 Q2 option A (ADR-0015): migrations live in `db/`, not in a vendor's directory. */
export const MIGRATIONS_DIR = "db/migrations";

/**
 * One entry of the migrations directory. `checkMigrations` stays pure and name-driven, but it has
 * to tell a *file* called `0002_x.sql` from a *directory* of that name, so a caller may pass
 * either a bare name (taken to be a file) or this pair.
 */
export interface DirEntry {
  readonly name: string;
  readonly isFile: boolean;
}

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
  /**
   * Directories whose name parses as a migration filename. A directory is not a migration the
   * runner can apply, and a silent skip would hide `0002_x.sql/` from `db:migrate`.
   */
  readonly directoryEntries: readonly string[];
  readonly ok: boolean;
}

const MIGRATION = /^(\d+)_([a-z0-9_-]+)\.sql$/;
const ROLLBACK = /^(\d+)_([a-z0-9_-]+)\.down\.sql$/;
/** Files that are not migrations and are never reported: directory keepers and editor noise. */
const IGNORED = new Set([".gitkeep", ".DS_Store", "README.md"]);
/**
 * Drizzle Kit's bookkeeping directory (`_journal.json` plus one snapshot per generated migration).
 * It is committed — drizzle-kit needs the journal to generate the *next* migration incrementally —
 * and it is not a migration, so the gate ignores it by name, whatever it contains. See
 * `db/migrations/README.md` for how generated SQL is reconciled with the hand-written pairs.
 */
export const DRIZZLE_META_DIR = "meta";

/**
 * Applies the rules above to a directory listing. Pure, so the unit test can drive every failure
 * mode without writing SQL files. Entries may be bare names (files) or {@link DirEntry} pairs;
 * directories are skipped unless their name claims to be a migration, which is an error.
 */
export function checkMigrations(
  entries: readonly (string | DirEntry)[],
): DbCheckReport {
  const migrations: MigrationFile[] = [];
  const rollbacks = new Map<string, string>();
  const unparseableFiles: string[] = [];
  const directoryEntries: string[] = [];

  const normalised: DirEntry[] = entries
    .map((entry) =>
      typeof entry === "string" ? { name: entry, isFile: true } : entry,
    )
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  for (const { name: entry, isFile } of normalised) {
    if (IGNORED.has(entry)) continue;
    if (entry === DRIZZLE_META_DIR) continue;
    if (!isFile) {
      // A plain subdirectory is someone's scratch space and none of the gate's business; one
      // named like a migration is reported, because `db:migrate` would never read it.
      if (MIGRATION.test(entry) || ROLLBACK.test(entry)) {
        directoryEntries.push(entry);
      }
      continue;
    }
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
    directoryEntries,
    ok:
      missingRollbacks.length === 0 &&
      orphanRollbacks.length === 0 &&
      duplicateVersions.length === 0 &&
      versionGaps.length === 0 &&
      unparseableFiles.length === 0 &&
      directoryEntries.length === 0,
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
  for (const dir of report.directoryEntries) {
    lines.push(
      `${dir}: is a directory, not a migration file; db:migrate reads files only.`,
    );
  }
  return lines;
}

/**
 * The migrations directory as name/kind pairs, or `[]` when it does not exist yet. Drizzle Kit's
 * committed `meta/` is dropped here as well as in `checkMigrations`, so nothing under it is ever
 * read as a migration — the listing is not recursive, so a stray `meta/0009_x.sql` never reaches
 * the rules either.
 */
export function readMigrationDir(dir: string): DirEntry[] {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.name !== DRIZZLE_META_DIR)
    .map((entry) => ({ name: entry.name, isFile: entry.isFile() }));
}
