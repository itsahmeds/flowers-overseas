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
 *    migration, and the reverse";
 *  - **no recipient email** (AC-27, TASK-018) — no committed migration, forward or rollback, and
 *    no Drizzle module gives `recipient` or `recipient_address` a column matching
 *    `/e[-_]?mail/i`, and each problem line cites `plan/07` §1.3. The migrations are replayed in
 *    order through a small table model, so the column is caught however it arrives: `ADD`,
 *    `RENAME COLUMN`, a table renamed into a recipient name, `LIKE`, `INHERITS`/`INHERIT`,
 *    `PARTITION OF`, `CREATE TABLE … AS`, `SELECT … INTO`, or the same DDL inside a `DO` block's
 *    `EXECUTE` string. `recipientEmailViolations` is the same rule over a live catalogue, for
 *    TASK-027's connected half.
 *
 * What it deliberately does not do yet — **AC-26 proper is TASK-027's**, and needs a live
 * database over `DATABASE_URL_UNPOOLED` (§13 Q6): column-level drift by introspection, RLS
 * enabled and policy-present per table, the `*_minor`/currency pairing, the `bytea` ban, the
 * live-catalogue run of the recipient-email ban (AC-27, through `recipientEmailViolations`) and
 * the applied-migration/RLS-coverage summary. Each of those is a
 * rule over a connected catalogue, and each gets its own fixture there.
 *
 * Exit codes: 0 = the migration set is consistent (or empty); 1 = a problem, one line per
 * problem on stderr.
 */
import type { Dirent } from "node:fs";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

/* -------------------------------------------------------------------------- */
/* AC-27 — no recipient email column (plan/07 §1.3)                           */
/* -------------------------------------------------------------------------- */

/** The tables that hold recipient data, which may never hold an email (spec 002 §8, AC-27). */
export const RECIPIENT_TABLES: readonly string[] = [
  "recipient",
  "recipient_address",
];

/** AC-27's pattern, verbatim: `email`, `e_mail`, `e-mail`, any case, anywhere in the name. */
export const RECIPIENT_EMAIL_COLUMN = /e[-_]?mail/i;

/** The citation every AC-27 line carries. */
export const RECIPIENT_EMAIL_CITATION =
  'plan/07 §1.3: "no recipient email at all" (spec 002 §8, AC-27)';

/** One AC-27 problem line. */
function recipientEmailLine(
  file: string,
  table: string,
  column: string,
): string {
  return `${file}: column \`${column}\` on \`${table}\` — recipient data is minimised, and ${RECIPIENT_EMAIL_CITATION}`;
}

/**
 * The connected half of AC-27, for TASK-027's live `db:check`: given `information_schema.columns`
 * rows (or any `{ table, column }` list), the offending pairs as problem lines. Pure, so the
 * integration test drives it against a real catalogue and the unit test against a list.
 */
export function recipientEmailViolations(
  columns: readonly { readonly table: string; readonly column: string }[],
  where = "database",
): string[] {
  return columns
    .filter(
      ({ table, column }) =>
        RECIPIENT_TABLES.includes(table) && RECIPIENT_EMAIL_COLUMN.test(column),
    )
    .map(({ table, column }) => recipientEmailLine(where, table, column));
}

type SqlToken =
  | { readonly kind: "word"; readonly value: string }
  | { readonly kind: "ident"; readonly value: string }
  | { readonly kind: "string"; readonly value: string }
  | { readonly kind: "punct"; readonly value: string };

/**
 * A Postgres lexer just good enough to read DDL: comments (nested block comments too) are
 * dropped, string and dollar-quoted bodies are kept whole as `string` tokens (so the caller can
 * read dynamic SQL inside them), `"quoted"` and `U&"…"` identifiers keep their case, and bare
 * words are folded to lower case as Postgres folds them.
 */
const DOLLAR_TAG = /\$([A-Za-z_][A-Za-z0-9_]*)?\$/y;
const BARE_WORD = /[A-Za-z_\u0080-\uFFFF][A-Za-z0-9_$\u0080-\uFFFF]*/y;

export function lexSql(sql: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i] ?? "";
    const next = sql[i + 1] ?? "";
    if (/\s/.test(c)) {
      i += 1;
      continue;
    }
    if (c === "-" && next === "-") {
      while (i < n && sql[i] !== "\n") i += 1;
      continue;
    }
    if (c === "/" && next === "*") {
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (sql[i] === "/" && sql[i + 1] === "*") {
          depth += 1;
          i += 2;
        } else if (sql[i] === "*" && sql[i + 1] === "/") {
          depth -= 1;
          i += 2;
        } else i += 1;
      }
      continue;
    }
    DOLLAR_TAG.lastIndex = i;
    const dollar = DOLLAR_TAG.exec(sql);
    if (dollar !== null) {
      const tag = dollar[0];
      const end = sql.indexOf(tag, i + tag.length);
      const stop = end === -1 ? n : end;
      tokens.push({ kind: "string", value: sql.slice(i + tag.length, stop) });
      i = end === -1 ? n : end + tag.length;
      continue;
    }
    const escapeString = (c === "E" || c === "e") && next === "'";
    if (c === "'" || escapeString) {
      i += escapeString ? 2 : 1;
      let value = "";
      while (i < n) {
        const d = sql[i] ?? "";
        if (escapeString && d === "\\") {
          value += sql[i + 1] ?? "";
          i += 2;
          continue;
        }
        if (d === "'") {
          if (sql[i + 1] === "'") {
            value += "'";
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        value += d;
        i += 1;
      }
      tokens.push({ kind: "string", value });
      continue;
    }
    const unicode =
      (c === "U" || c === "u") && next === "&" && sql[i + 2] === '"';
    if (c === '"' || unicode) {
      i += unicode ? 3 : 1;
      let value = "";
      while (i < n) {
        const d = sql[i] ?? "";
        if (d === '"') {
          if (sql[i + 1] === '"') {
            value += '"';
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        value += d;
        i += 1;
      }
      if (unicode) {
        value = value
          .replace(/\\\+([0-9A-Fa-f]{6})/g, (_, hex: string) =>
            String.fromCodePoint(Number.parseInt(hex, 16)),
          )
          .replace(/\\([0-9A-Fa-f]{4})/g, (_, hex: string) =>
            String.fromCodePoint(Number.parseInt(hex, 16)),
          )
          .replace(/\\\\/g, "\\");
      }
      tokens.push({ kind: "ident", value });
      continue;
    }
    BARE_WORD.lastIndex = i;
    const word = BARE_WORD.exec(sql);
    if (word !== null) {
      tokens.push({ kind: "word", value: word[0].toLowerCase() });
      i += word[0].length;
      continue;
    }
    tokens.push({ kind: "punct", value: c });
    i += 1;
  }
  return tokens;
}

/** Tokens split at top-level `;`. */
function statementsOf(tokens: readonly SqlToken[]): SqlToken[][] {
  const statements: SqlToken[][] = [];
  let current: SqlToken[] = [];
  for (const token of tokens) {
    if (token.kind === "punct" && token.value === ";") {
      if (current.length > 0) statements.push(current);
      current = [];
    } else current.push(token);
  }
  if (current.length > 0) statements.push(current);
  return statements;
}

/** Splits at commas that are not inside parentheses. */
function topLevelCommaSplit(tokens: readonly SqlToken[]): SqlToken[][] {
  const parts: SqlToken[][] = [];
  let depth = 0;
  let current: SqlToken[] = [];
  for (const token of tokens) {
    if (token.kind === "punct" && token.value === "(") depth += 1;
    if (token.kind === "punct" && token.value === ")") depth -= 1;
    if (depth === 0 && token.kind === "punct" && token.value === ",") {
      parts.push(current);
      current = [];
    } else current.push(token);
  }
  if (current.length > 0) parts.push(current);
  return parts;
}

const isWord = (token: SqlToken | undefined, ...values: string[]): boolean =>
  token?.kind === "word" && values.includes(token.value);
const isPunct = (token: SqlToken | undefined, value: string): boolean =>
  token?.kind === "punct" && token.value === value;
const nameOf = (token: SqlToken | undefined): string | undefined =>
  token?.kind === "word" || token?.kind === "ident" ? token.value : undefined;

/**
 * A possibly schema-qualified name at `start`; returns the unqualified part (a recipient table
 * in any schema is still a recipient table) and the index after it.
 */
function qualifiedName(
  tokens: readonly SqlToken[],
  start: number,
): { name: string; end: number } | undefined {
  let name = nameOf(tokens[start]);
  if (name === undefined) return undefined;
  let end = start + 1;
  while (isPunct(tokens[end], ".") && nameOf(tokens[end + 1]) !== undefined) {
    name = nameOf(tokens[end + 1]) ?? name;
    end += 2;
  }
  return { name, end };
}

/** The tokens inside the parenthesis that opens at `open`, and the index after its close. */
function parenthesised(
  tokens: readonly SqlToken[],
  open: number,
): { inner: SqlToken[]; end: number } {
  let depth = 0;
  for (let j = open; j < tokens.length; j += 1) {
    if (isPunct(tokens[j], "(")) depth += 1;
    if (isPunct(tokens[j], ")")) {
      depth -= 1;
      if (depth === 0) return { inner: tokens.slice(open + 1, j), end: j + 1 };
    }
  }
  return { inner: tokens.slice(open + 1), end: tokens.length };
}

const TABLE_CONSTRAINT_HEADS = [
  "constraint",
  "primary",
  "unique",
  "check",
  "foreign",
  "exclude",
];

/**
 * The tables a migration chain builds, column by column, as far as AC-27 needs: `CREATE TABLE`
 * (with `LIKE`, `INHERITS` and `PARTITION OF`), `ALTER TABLE … ADD | DROP | RENAME [COLUMN]`,
 * `RENAME TO`, `INHERIT`, `DROP TABLE`. A column that reaches a recipient table by any of those
 * routes is reported where it arrives, and a table renamed *into* a recipient name brings its
 * columns with it.
 */
class TableModel {
  readonly columns = new Map<string, Set<string>>();
  readonly parents = new Map<string, Set<string>>();
  readonly problems: string[] = [];

  private readonly file: string;

  constructor(file: string) {
    this.file = file;
  }

  withFile(file: string): TableModel {
    const model = new TableModel(file);
    for (const [table, columns] of this.columns) {
      model.columns.set(table, new Set(columns));
    }
    for (const [table, parents] of this.parents) {
      model.parents.set(table, new Set(parents));
    }
    return model;
  }

  private children(table: string): string[] {
    const out: string[] = [];
    for (const [child, parents] of this.parents) {
      if (parents.has(table)) out.push(child, ...this.children(child));
    }
    return out;
  }

  private check(table: string, column: string): void {
    if (
      RECIPIENT_TABLES.includes(table) &&
      RECIPIENT_EMAIL_COLUMN.test(column)
    ) {
      this.problems.push(recipientEmailLine(this.file, table, column));
    }
  }

  addColumn(table: string, column: string): void {
    for (const target of [table, ...this.children(table)]) {
      const set = this.columns.get(target) ?? new Set<string>();
      set.add(column);
      this.columns.set(target, set);
      this.check(target, column);
    }
  }

  copyColumns(from: string, to: string): void {
    for (const column of this.columns.get(from) ?? [])
      this.addColumn(to, column);
  }

  /** A statement the model cannot follow: any matching identifier in it counts. */
  opaque(table: string, tokens: readonly SqlToken[]): void {
    if (!RECIPIENT_TABLES.includes(table)) return;
    for (const token of tokens) {
      if (token.kind === "word" || token.kind === "ident") {
        this.check(table, token.value);
      }
    }
  }

  renameTable(from: string, to: string): void {
    const columns = this.columns.get(from) ?? new Set<string>();
    this.columns.delete(from);
    this.columns.set(to, new Set<string>());
    for (const column of columns) this.addColumn(to, column);
    const parents = this.parents.get(from);
    this.parents.delete(from);
    if (parents !== undefined) this.parents.set(to, parents);
    for (const set of this.parents.values()) {
      if (set.delete(from)) set.add(to);
    }
  }

  dropTable(table: string): void {
    this.columns.delete(table);
    this.parents.delete(table);
  }

  inherit(child: string, parent: string): void {
    const set = this.parents.get(child) ?? new Set<string>();
    set.add(parent);
    this.parents.set(child, set);
    this.copyColumns(parent, child);
  }
}

/** Applies one statement to the model. */
function applyStatement(model: TableModel, tokens: readonly SqlToken[]): void {
  let i = 0;
  if (isWord(tokens[i], "create")) {
    i += 1;
    if (isWord(tokens[i], "or") && isWord(tokens[i + 1], "replace")) i += 2;
    while (
      isWord(tokens[i], "global", "local", "temp", "temporary", "unlogged")
    ) {
      i += 1;
    }
    if (!isWord(tokens[i], "table")) return;
    i += 1;
    if (isWord(tokens[i], "if") && isWord(tokens[i + 1], "not")) i += 3;
    const target = qualifiedName(tokens, i);
    if (target === undefined) return;
    const table = target.name;
    model.columns.set(table, new Set<string>());
    model.parents.delete(table);
    i = target.end;
    if (isWord(tokens[i], "partition") && isWord(tokens[i + 1], "of")) {
      const parent = qualifiedName(tokens, i + 2);
      if (parent !== undefined) model.inherit(table, parent.name);
      return;
    }
    if (isWord(tokens[i], "of")) {
      model.opaque(table, tokens.slice(i));
      return;
    }
    if (isPunct(tokens[i], "(")) {
      const { inner, end } = parenthesised(tokens, i);
      for (const element of topLevelCommaSplit(inner)) {
        const head = element[0];
        if (head === undefined) continue;
        if (
          head.kind === "word" &&
          TABLE_CONSTRAINT_HEADS.includes(head.value)
        ) {
          continue;
        }
        if (isWord(head, "like")) {
          const source = qualifiedName(element, 1);
          if (source !== undefined) model.copyColumns(source.name, table);
          continue;
        }
        const column = nameOf(head);
        if (column !== undefined) model.addColumn(table, column);
      }
      i = end;
    }
    if (isWord(tokens[i], "inherits") && isPunct(tokens[i + 1], "(")) {
      const { inner } = parenthesised(tokens, i + 1);
      for (const parent of topLevelCommaSplit(inner)) {
        const name = qualifiedName(parent, 0);
        if (name !== undefined) model.inherit(table, name.name);
      }
      return;
    }
    if (tokens.slice(i).some((token) => isWord(token, "as"))) {
      model.opaque(table, tokens.slice(i));
    }
    return;
  }

  if (isWord(tokens[0], "alter") && isWord(tokens[1], "table")) {
    i = 2;
    if (isWord(tokens[i], "if") && isWord(tokens[i + 1], "exists")) i += 2;
    if (isWord(tokens[i], "only")) i += 1;
    const target = qualifiedName(tokens, i);
    if (target === undefined) return;
    const table = target.name;
    i = target.end;
    if (isPunct(tokens[i], "*")) i += 1;
    for (const action of topLevelCommaSplit(tokens.slice(i))) {
      applyAlterAction(model, table, action);
    }
    return;
  }

  if (isWord(tokens[0], "drop") && isWord(tokens[1], "table")) {
    i = 2;
    if (isWord(tokens[i], "if") && isWord(tokens[i + 1], "exists")) i += 2;
    for (const part of topLevelCommaSplit(tokens.slice(i))) {
      const name = qualifiedName(part, 0);
      if (name !== undefined) model.dropTable(name.name);
    }
    return;
  }

  // `SELECT … INTO recipient …` creates a table the model cannot follow.
  if (isWord(tokens[0], "select", "with")) {
    const into = tokens.findIndex((token) => isWord(token, "into"));
    if (into === -1) return;
    let k = into + 1;
    while (isWord(tokens[k], "temp", "temporary", "unlogged", "table")) k += 1;
    const target = qualifiedName(tokens, k);
    if (target !== undefined) model.opaque(target.name, tokens);
  }
}

/** One `ALTER TABLE` action. */
function applyAlterAction(
  model: TableModel,
  table: string,
  action: readonly SqlToken[],
): void {
  let k = 0;
  if (isWord(action[k], "add")) {
    k += 1;
    if (
      action[k]?.kind === "word" &&
      TABLE_CONSTRAINT_HEADS.includes(action[k]?.value ?? "")
    ) {
      return;
    }
    if (isWord(action[k], "column")) k += 1;
    if (isWord(action[k], "if") && isWord(action[k + 1], "not")) k += 3;
    const column = nameOf(action[k]);
    if (column !== undefined) model.addColumn(table, column);
    return;
  }
  if (isWord(action[k], "drop")) {
    k += 1;
    if (isWord(action[k], "constraint")) return;
    if (isWord(action[k], "column")) k += 1;
    if (isWord(action[k], "if") && isWord(action[k + 1], "exists")) k += 2;
    const column = nameOf(action[k]);
    if (column !== undefined) model.columns.get(table)?.delete(column);
    return;
  }
  if (isWord(action[k], "rename")) {
    k += 1;
    if (isWord(action[k], "constraint")) return;
    if (isWord(action[k], "to")) {
      const target = qualifiedName(action, k + 1);
      if (target !== undefined) model.renameTable(table, target.name);
      return;
    }
    if (isWord(action[k], "column")) k += 1;
    const from = nameOf(action[k]);
    const to = nameOf(action[k + 2]);
    if (from !== undefined && to !== undefined && isWord(action[k + 1], "to")) {
      model.columns.get(table)?.delete(from);
      model.addColumn(table, to);
    }
    return;
  }
  if (isWord(action[k], "inherit")) {
    const parent = qualifiedName(action, k + 1);
    if (parent !== undefined) model.inherit(table, parent.name);
  }
}

/**
 * Runs every statement of a body through the model, then every string and dollar-quoted body in
 * it as SQL of its own (`DO $$ … EXECUTE '…' … $$`, a function body), up to three levels deep.
 */
function applySql(model: TableModel, sql: string, depth = 0): void {
  const tokens = lexSql(sql);
  for (const statement of statementsOf(tokens))
    applyStatement(model, statement);
  if (depth >= 3) return;
  for (const token of tokens) {
    if (token.kind === "string" && /\b(table|into)\b/i.test(token.value)) {
      applySql(model, token.value, depth + 1);
    }
  }
}

/** `pgTable("recipient", { … })` blocks in a Drizzle module: the table and its object body. */
function drizzleTableBodies(source: string): { table: string; body: string }[] {
  const out: { table: string; body: string }[] = [];
  for (const match of source.matchAll(
    /pgTable\s*\(\s*["'`]([a-z_][a-z0-9_]*)["'`]\s*,\s*\{/g,
  )) {
    const table = match[1] ?? "";
    let depth = 1;
    let j = (match.index ?? 0) + match[0].length;
    const start = j;
    while (j < source.length && depth > 0) {
      if (source[j] === "{") depth += 1;
      if (source[j] === "}") depth -= 1;
      j += 1;
    }
    out.push({ table, body: source.slice(start, j - 1) });
  }
  return out;
}

/**
 * AC-27, offline: the problem lines for every way a committed migration or the Drizzle mirror
 * gives `recipient` or `recipient_address` a column matching `/e[-_]?mail/i`. Forward migrations
 * are replayed in version order through one {@link TableModel}, so a column added to another
 * table that later becomes (or is inherited by) a recipient table is caught where it arrives;
 * each rollback is read on its own against the chain's final state. Every line cites
 * `plan/07` §1.3.
 */
export function checkRecipientEmail(
  migrationSources: ReadonlyMap<string, string>,
  schemaSources: ReadonlyMap<string, string> = new Map(),
): string[] {
  const problems: string[] = [];
  const ordered = [...migrationSources].sort(([a], [b]) => a.localeCompare(b));
  let chain = new TableModel("");
  for (const [file, body] of ordered) {
    if (file.endsWith(".down.sql")) continue;
    chain = chain.withFile(file);
    applySql(chain, body);
    problems.push(...chain.problems);
  }
  for (const [file, body] of ordered) {
    if (!file.endsWith(".down.sql")) continue;
    const model = chain.withFile(file);
    applySql(model, body);
    problems.push(...model.problems);
  }
  for (const [file, source] of [...schemaSources].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    for (const { table, body } of drizzleTableBodies(source)) {
      if (!RECIPIENT_TABLES.includes(table)) continue;
      const names = new Set<string>();
      for (const key of body.matchAll(
        /^\s*["'`]?([A-Za-z_$][\w$-]*)["'`]?\s*:/gm,
      )) {
        names.add(key[1] ?? "");
      }
      for (const arg of body.matchAll(/\b\w+\s*\(\s*["'`]([^"'`]+)["'`]/g)) {
        names.add(arg[1] ?? "");
      }
      for (const name of [...names].sort()) {
        if (RECIPIENT_EMAIL_COLUMN.test(name)) {
          problems.push(recipientEmailLine(file, table, name));
        }
      }
    }
  }
  return [...new Set(problems)];
}

export interface SourceReport {
  /** Forward migrations that do not open with `SET LOCAL ROLE app_owner;`. */
  readonly missingOwnerPreamble: readonly string[];
  /** Tables declared in `db/schema/` with no `CREATE TABLE` in any migration. */
  readonly driftMissingInMigrations: readonly string[];
  /** Tables created by a migration with no Drizzle declaration. */
  readonly driftMissingInSchema: readonly string[];
  /** AC-27: a recipient table given an email column, by a migration or by the mirror. */
  readonly recipientEmailColumns: readonly string[];
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

  const recipientEmailColumns = checkRecipientEmail(
    migrationSources,
    schemaSources,
  );

  return {
    missingOwnerPreamble,
    driftMissingInMigrations,
    driftMissingInSchema,
    recipientEmailColumns,
    ok:
      missingOwnerPreamble.length === 0 &&
      driftMissingInMigrations.length === 0 &&
      driftMissingInSchema.length === 0 &&
      recipientEmailColumns.length === 0,
  };
}

/** Human-readable lines for a source report; empty when everything agrees. */
export function formatSourceProblems(report: SourceReport): string[] {
  return [
    ...report.missingOwnerPreamble,
    ...report.driftMissingInMigrations,
    ...report.driftMissingInSchema,
    ...report.recipientEmailColumns,
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
    if (entry === DRIZZLE_META_DIR) continue;
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
  // recipient-email ban over the live catalogue (`recipientEmailViolations`) — over
  // `DATABASE_URL_UNPOOLED` (§13 Q6).
  process.exit(ok ? 0 : 1);
}
