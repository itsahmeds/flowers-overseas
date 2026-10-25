/**
 * Decision files collected into `docs/decisions-log.md` — `pnpm decisions:log`
 * (spec 001 §14 A15's orientation gates; TASK-399, founder 2026-10-25 "log fix ok").
 *
 * Every docs PR used to append a row to the log, so each merge made every other open PR conflict.
 * Now a decision is one file, `docs/decisions/YYYY-MM-DD-<slug>.md`, holding exactly the table row
 * the log has always used (`| date | ADR | decision |`, optionally `| trigger |`). The log keeps
 * its hand-written rows as they are; under `COLLECTED_MARKER` this script appends one table with
 * every file's row, in date-then-name order. CI on `main` (`.github/workflows/decisions-log.yml`)
 * runs the write; no pull request edits the log.
 *
 *     pnpm decisions:log            rewrite the collected block (refuses on any problem below)
 *     pnpm decisions:log --check    red when a file is malformed or the log is out of date
 *     pnpm decisions:log --lint     what a pull request can satisfy: files well formed, the
 *                                   hand-written part unchanged, no collected row without a file
 *
 * The hand-written part (everything above the marker) is frozen: its SHA-256 is pinned in
 * `FROZEN_LOG_SHA256`, so a PR that still appends a row by hand is caught by `--lint` instead of
 * being lost. `tests/unit/decisions-log.test.ts` drives the pure functions.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const LOG_PATH = "docs/decisions-log.md";
export const DECISIONS_DIR = "docs/decisions";
/** Files in `docs/decisions/` that are not decisions. */
export const NOT_A_DECISION = ["README.md"] as const;

/** The line the collected block starts at; everything from it to the end of the log is generated. */
export const COLLECTED_MARKER =
  "<!-- decisions:collected: the rows below are generated from docs/decisions/ by `pnpm decisions:log`. Add a file there; never edit below this line. -->";

export const TABLE_HEADER = "| Date | ADR | Decision | Trigger |";
export const TABLE_SEPARATOR = "|---|---|---|---|";

/**
 * SHA-256 of the hand-written part of the log (see `frozenPart`). It changes only on a deliberate
 * correction of an old row, made in the same PR as this constant.
 */
export const FROZEN_LOG_SHA256 =
  "8b8c152f70bcb0b97b84ce4be07de6dce96fc3121751193141bb48548ac2d882";

const FILE_NAME = /^(\d{4}-\d{2}-\d{2})-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;

export interface Decision {
  /** Repository-relative path of the file. */
  readonly file: string;
  /** `YYYY-MM-DD` from the file name, equal to the row's first cell. */
  readonly date: string;
  /** The row exactly as the file holds it, without the trailing newline. */
  readonly row: string;
}

export type Parsed =
  | { readonly ok: true; readonly decision: Decision }
  | { readonly ok: false; readonly problem: string };

function isCalendarDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

/** The cells of a table row, splitting on `|` that is not escaped with a backslash. */
export function cellsOf(row: string): string[] | null {
  const trimmed = row.trim();
  if (
    !trimmed.startsWith("|") ||
    !trimmed.endsWith("|") ||
    trimmed.length < 2
  ) {
    return null;
  }
  if (trimmed.endsWith("\\|")) return null;
  return trimmed
    .slice(1, -1)
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim());
}

/** One file under `docs/decisions/`: its name and its content, checked. */
export function parseDecision(name: string, content: string): Parsed {
  const file = `${DECISIONS_DIR}/${name}`;
  const named = FILE_NAME.exec(name);
  if (named === null) {
    return {
      ok: false,
      problem: `${file}: the name must be YYYY-MM-DD-<slug>.md, slug in lower-case words joined by "-"`,
    };
  }
  const date = named[1] ?? "";
  if (!isCalendarDate(date)) {
    return { ok: false, problem: `${file}: ${date} is not a calendar date` };
  }
  if (!content.endsWith("\n") || content.endsWith("\n\n")) {
    return {
      ok: false,
      problem: `${file}: the file must be exactly one table row ending in one newline`,
    };
  }
  const row = content.slice(0, -1);
  if (row.includes("\n") || row.includes("\r")) {
    return {
      ok: false,
      problem: `${file}: the file must be exactly one line, the log's table row`,
    };
  }
  if (row !== row.trim()) {
    return {
      ok: false,
      problem: `${file}: the row must start with "|" and end with "|", no space around it`,
    };
  }
  const cells = cellsOf(row);
  if (cells === null) {
    return {
      ok: false,
      problem: `${file}: the row must start with "|" and end with "|"`,
    };
  }
  if (cells.length !== 3 && cells.length !== 4) {
    return {
      ok: false,
      problem: `${file}: the row has ${String(cells.length)} cell(s); the log's row is | date | ADR | decision | with an optional | trigger | (escape a literal pipe as \\|)`,
    };
  }
  if (cells[0] !== date) {
    return {
      ok: false,
      problem: `${file}: the row's date "${cells[0] ?? ""}" differs from the file name's ${date}`,
    };
  }
  const empty = cells.findIndex((cell) => cell === "");
  if (empty !== -1) {
    return {
      ok: false,
      problem: `${file}: cell ${String(empty + 1)} is empty (write "none" for no ADR)`,
    };
  }
  return { ok: true, decision: { file, date, row } };
}

/** Date first, then file name: the order the collected rows are written in. */
export function compareDecisions(a: Decision, b: Decision): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.file === b.file) return 0;
  return a.file < b.file ? -1 : 1;
}

export interface Split {
  /** Everything above the marker, without trailing blank lines. */
  readonly frozen: string;
  /** The rows of the collected block, in file order; empty when there is no marker. */
  readonly collected: readonly string[];
  /** Lines in the collected block that are neither the header, the separator nor a row. */
  readonly stray: readonly string[];
}

/** The log split at the marker. */
export function splitLog(log: string): Split {
  const lines = log.split("\n");
  const at = lines.indexOf(COLLECTED_MARKER);
  const above = at === -1 ? lines : lines.slice(0, at);
  const frozen = above.join("\n").replace(/\s+$/, "");
  if (at === -1) return { frozen, collected: [], stray: [] };
  const collected: string[] = [];
  const stray: string[] = [];
  for (const line of lines.slice(at + 1)) {
    if (line === "" || line === TABLE_HEADER || line === TABLE_SEPARATOR)
      continue;
    if (line.startsWith("|")) collected.push(line);
    else stray.push(line);
  }
  return { frozen, collected, stray };
}

/** The hand-written part's fingerprint, compared with `FROZEN_LOG_SHA256`. */
export function frozenHash(frozen: string): string {
  return createHash("sha256").update(frozen, "utf8").digest("hex");
}

/** The whole log: the frozen part, the marker, and one table of the decisions in order. */
export function renderLog(
  frozen: string,
  decisions: readonly Decision[],
): string {
  const rows = [...decisions]
    .sort(compareDecisions)
    .map((decision) => decision.row);
  const table =
    rows.length === 0 ? [] : ["", TABLE_HEADER, TABLE_SEPARATOR, ...rows];
  return [frozen, "", COLLECTED_MARKER, ...table].join("\n") + "\n";
}

export interface State {
  readonly decisions: readonly Decision[];
  /** Malformed files, a changed frozen part, collected rows without a file, stray lines. */
  readonly problems: readonly string[];
  /** The log as `pnpm decisions:log` would write it. */
  readonly expected: string;
  /** The log as it is on disk. */
  readonly current: string;
}

/** Reads a log and a list of `[name, content]` files; pure, so the test drives it directly. */
export function evaluate(
  log: string,
  files: readonly (readonly [string, string])[],
  frozenSha256: string = FROZEN_LOG_SHA256,
): State {
  const problems: string[] = [];
  const decisions: Decision[] = [];
  for (const [name, content] of files) {
    const parsed = parseDecision(name, content);
    if (parsed.ok) decisions.push(parsed.decision);
    else problems.push(parsed.problem);
  }
  const split = splitLog(log);
  if (frozenHash(split.frozen) !== frozenSha256) {
    problems.push(
      `${LOG_PATH}: the hand-written rows above the collected block changed. ` +
        `Restore them from origin/main and add docs/decisions/<date>-<slug>.md instead`,
    );
  }
  const known = new Set(decisions.map((decision) => decision.row));
  for (const row of split.collected) {
    if (!known.has(row)) {
      problems.push(
        `${LOG_PATH}: the collected row "${row.slice(0, 80)}" has no file in ${DECISIONS_DIR}/ ` +
          `(a row added to the log by hand, or a merged decision file edited or deleted). ` +
          `Decision files are append-only: add docs/decisions/<date>-<slug>.md instead`,
      );
    }
  }
  for (const line of split.stray) {
    problems.push(
      `${LOG_PATH}: "${line.slice(0, 80)}" below the collected marker is not a table row`,
    );
  }
  const seen = new Map<string, string>();
  for (const decision of decisions) {
    const twin = seen.get(decision.row);
    if (twin !== undefined) {
      problems.push(`${decision.file}: the same row as ${twin}`);
    }
    seen.set(decision.row, decision.file);
  }
  return {
    decisions,
    problems,
    expected: renderLog(split.frozen, decisions),
    current: log,
  };
}

/** `--lint`: the problems a pull request must not have (its own row may still be uncollected). */
export function lintProblems(state: State): string[] {
  return [...state.problems];
}

/** `--check`: `--lint` plus a log that is exactly what the files produce. */
export function checkProblems(state: State): string[] {
  const problems = [...state.problems];
  if (state.current !== state.expected) {
    problems.push(
      `${LOG_PATH} is out of date with ${DECISIONS_DIR}/: run \`pnpm decisions:log\` (CI on main does)`,
    );
  }
  return problems;
}

/** Every `[name, content]` under `docs/decisions/`, sorted by name. */
export function readDecisionFiles(root: string): [string, string][] {
  const skip: ReadonlySet<string> = new Set(NOT_A_DECISION);
  return readdirSync(join(root, DECISIONS_DIR))
    .filter((name) => !skip.has(name) && !name.startsWith("."))
    .sort()
    .map((name) => [
      name,
      readFileSync(join(root, DECISIONS_DIR, name), "utf8"),
    ]);
}

export function readState(root: string): State {
  return evaluate(
    readFileSync(join(root, LOG_PATH), "utf8"),
    readDecisionFiles(root),
  );
}

const isMain =
  typeof process.argv[1] === "string" &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const args = process.argv.slice(2);
  const root = resolve(
    args.find((arg) => !arg.startsWith("--")) ?? process.cwd(),
  );
  const state = readState(root);
  const mode = args.includes("--check")
    ? "check"
    : args.includes("--lint")
      ? "lint"
      : "write";
  const problems =
    mode === "check" ? checkProblems(state) : lintProblems(state);
  if (problems.length > 0) {
    for (const problem of problems)
      process.stderr.write(`decisions log: ${problem}\n`);
    if (mode === "write")
      process.stderr.write("decisions log: nothing written\n");
    process.exit(1);
  }
  const count = String(state.decisions.length);
  if (mode === "write") {
    if (state.current === state.expected) {
      process.stdout.write(
        `decisions log: already current (${count} collected file(s))\n`,
      );
    } else {
      writeFileSync(join(root, LOG_PATH), state.expected, "utf8");
      process.stdout.write(
        `decisions log: wrote ${LOG_PATH} (${count} collected file(s))\n`,
      );
    }
  } else {
    process.stdout.write(
      mode === "check"
        ? `decisions log ok: current, ${count} collected file(s)\n`
        : `decisions log lint ok: ${count} file(s) well formed, hand-written rows unchanged\n`,
    );
  }
}
