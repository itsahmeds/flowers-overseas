/**
 * `TASKS.md` ledger parser — AC-31 / T-32 (spec 001 §2 "Documentation and ledger", TASK-012).
 *
 * `TASKS.md` is the single source of truth `CLAUDE.md` points every agent at, and `/status`
 * reads it rather than `plan/13`. Three things must therefore be true of the file mechanically,
 * not by inspection:
 *
 *  1. the "Open decisions blocking tasks" table mirrors `plan/13` §A — ten rows `A1`…`A10`, each
 *     with a question, what it blocks, an owner and the due date of `plan/09`'s Phase 0 window;
 *  2. the phase-progress row for Phase 0 reads `3 / 12` specs approved (specs 001, 002 and 003 are approved);
 *  3. every row of every table has exactly as many cells as its header. A markdown table row with
 *     one cell too many silently shifts every later column — the status of a task ends up in the
 *     owner column, `/status` reports nonsense and `.claude/bin/task.sh` stops finding the row.
 *     This has been broken and repaired once already (row 26, `/review 8`), so it is a test now.
 *
 * Pipes inside a cell must be escaped (`\|`) per GFM, including inside a code span; the parser
 * splits on unescaped pipes only, so an unescaped one shows up as a cell-count failure rather
 * than being quietly tolerated.
 *
 * Run directly (`node scripts/tasks-open-decisions.ts [path]`) for the human-readable report;
 * `tests/unit/tasks-open-decisions.test.ts` drives the pure functions.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The due date `plan/09` gives the Phase 0 open questions. */
export const OPEN_DECISIONS_DUE = "2026-09-21";
/** `plan/13` §A has ten questions, mirrored one-to-one. */
export const OPEN_DECISION_IDS = [
  "A1",
  "A2",
  "A3",
  "A4",
  "A5",
  "A6",
  "A7",
  "A8",
  "A9",
  "A10",
] as const;
/** Phase 0 has twelve specs; spec 001 is the only one approved so far (§12 exit signal). */
export const PHASE_0_SPECS_APPROVED = "3 / 12";
/** The nine columns of the task table, in order. */
export const TASK_COLUMNS = [
  "ID",
  "Title",
  "Spec / AC owned",
  "Phase",
  "Status",
  "Owner agent",
  "PR",
  "Depends on",
  "Blockers / notes",
] as const;
/** The statuses `TASKS.md`'s own preamble defines. */
export const TASK_STATUSES = [
  "todo",
  "in_progress",
  "in_review",
  "blocked",
  "done",
  "dropped",
] as const;

export interface Table {
  /** The `##` heading the table sits under. */
  readonly section: string;
  readonly header: string[];
  readonly rows: string[][];
  /** Rows whose cell count differs from the header's, with their 1-based file line number. */
  readonly malformed: { readonly line: number; readonly cells: number }[];
}

const DELIMITER = /^\|(?:\s*:?-+:?\s*\|)+$/;

/** Splits a markdown table row on unescaped pipes and unescapes `\|` in the results. */
export function splitRow(line: string): string[] {
  const trimmed = line.trim();
  const parts = trimmed.split(/(?<!\\)\|/);
  // A well-formed row starts and ends with a pipe, so the first and last parts are empty.
  return parts.slice(1, -1).map((cell) => cell.replace(/\\\|/g, "|").trim());
}

/**
 * Every pipe table in the document, keyed by the `##` section it appears in. A table is a header
 * row followed by a `|---|` delimiter followed by body rows.
 */
export function parseTables(markdown: string): Table[] {
  const lines = markdown.split("\n");
  const tables: Table[] = [];
  let section = "";
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.startsWith("## ")) {
      section = line.slice(3).trim();
      continue;
    }
    const next = lines[index + 1] ?? "";
    if (!line.trimStart().startsWith("|") || !DELIMITER.test(next.trim())) {
      continue;
    }
    const header = splitRow(line);
    const rows: string[][] = [];
    const malformed: { line: number; cells: number }[] = [];
    let cursor = index + 2;
    for (; cursor < lines.length; cursor += 1) {
      const body = lines[cursor] ?? "";
      if (!body.trimStart().startsWith("|")) break;
      const cells = splitRow(body);
      if (cells.length !== header.length) {
        malformed.push({ line: cursor + 1, cells: cells.length });
      }
      rows.push(cells);
    }
    tables.push({ section, header, rows, malformed });
    index = cursor - 1;
  }
  return tables;
}

/** The table under a `##` heading, or `undefined` when the section has none. */
export function tableIn(markdown: string, section: string): Table | undefined {
  return parseTables(markdown).find((table) => table.section === section);
}

export interface OpenDecision {
  readonly id: string;
  readonly question: string;
  readonly blocks: string;
  readonly owner: string;
  readonly due: string;
  readonly defaultIfUnanswered: string;
  readonly status: string;
}

export function parseOpenDecisions(markdown: string): OpenDecision[] {
  const table = tableIn(markdown, "Open decisions blocking tasks");
  if (table === undefined) return [];
  return table.rows.map((cells) => ({
    id: cells[0] ?? "",
    question: cells[1] ?? "",
    blocks: cells[2] ?? "",
    owner: cells[3] ?? "",
    due: cells[4] ?? "",
    defaultIfUnanswered: cells[5] ?? "",
    status: cells[6] ?? "",
  }));
}

export interface PhaseProgress {
  readonly phase: string;
  readonly specsApproved: string;
  readonly tasksDone: string;
  readonly gate: string;
}

export function parsePhaseProgress(markdown: string): PhaseProgress[] {
  const table = tableIn(markdown, "Phase progress");
  if (table === undefined) return [];
  return table.rows.map((cells) => ({
    phase: cells[0] ?? "",
    specsApproved: cells[1] ?? "",
    tasksDone: cells[2] ?? "",
    gate: cells[3] ?? "",
  }));
}

export interface TaskRow {
  readonly id: string;
  readonly title: string;
  readonly spec: string;
  readonly phase: string;
  readonly status: string;
  readonly owner: string;
  readonly pr: string;
  readonly dependsOn: string;
  readonly notes: string;
  /** Cell count as parsed, so a malformed row can be reported with its own shape. */
  readonly cellCount: number;
}

export function parseTaskRows(markdown: string): TaskRow[] {
  const table = tableIn(markdown, "Tasks");
  if (table === undefined) return [];
  return table.rows
    .filter((cells) => /^TASK-\d{3,}$/.test(cells[0] ?? ""))
    .map((cells) => ({
      id: cells[0] ?? "",
      title: cells[1] ?? "",
      spec: cells[2] ?? "",
      phase: cells[3] ?? "",
      status: cells[4] ?? "",
      owner: cells[5] ?? "",
      pr: cells[6] ?? "",
      dependsOn: cells[7] ?? "",
      notes: cells[8] ?? "",
      cellCount: cells.length,
    }));
}

/**
 * Everything the ledger must satisfy, as a list of problems (empty = healthy). Total rather than
 * throwing on the first failure: one run should tell the orchestrator everything to fix.
 */
export function checkLedger(markdown: string): string[] {
  const problems: string[] = [];

  for (const table of parseTables(markdown)) {
    for (const bad of table.malformed) {
      problems.push(
        `table "${table.section}": row at line ${String(bad.line)} has ${String(bad.cells)} ` +
          `cell(s), header has ${String(table.header.length)} (escape a literal pipe as \\|)`,
      );
    }
  }

  const decisions = parseOpenDecisions(markdown);
  if (decisions.length !== OPEN_DECISION_IDS.length) {
    problems.push(
      `open decisions: ${String(decisions.length)} row(s), expected ${String(OPEN_DECISION_IDS.length)} (plan/13 §A)`,
    );
  }
  const ids = decisions.map((decision) => decision.id);
  if (ids.join(",") !== OPEN_DECISION_IDS.join(",")) {
    problems.push(
      `open decisions: ids ${ids.join(", ") || "(none)"} do not mirror plan/13 §A ${OPEN_DECISION_IDS.join(", ")}`,
    );
  }
  for (const decision of decisions) {
    for (const [field, value] of [
      ["question", decision.question],
      ["blocks", decision.blocks],
      ["owner", decision.owner],
      ["default if unanswered", decision.defaultIfUnanswered],
      ["status", decision.status],
    ] as const) {
      if (value === "")
        problems.push(`open decision ${decision.id}: empty ${field}`);
    }
    if (decision.due !== OPEN_DECISIONS_DUE) {
      problems.push(
        `open decision ${decision.id}: due "${decision.due}", expected ${OPEN_DECISIONS_DUE}`,
      );
    }
  }

  const phases = parsePhaseProgress(markdown);
  const phase0 = phases.find((phase) => phase.phase.startsWith("0"));
  if (phase0 === undefined) {
    problems.push("phase progress: no Phase 0 row");
  } else if (phase0.specsApproved !== PHASE_0_SPECS_APPROVED) {
    problems.push(
      `phase progress: Phase 0 specs approved "${phase0.specsApproved}", expected ${PHASE_0_SPECS_APPROVED}`,
    );
  }

  const tasksTable = tableIn(markdown, "Tasks");
  if (tasksTable === undefined) {
    problems.push('no "Tasks" table');
  } else if (tasksTable.header.join(" | ") !== TASK_COLUMNS.join(" | ")) {
    problems.push(
      `tasks table header is "${tasksTable.header.join(" | ")}", expected "${TASK_COLUMNS.join(" | ")}"`,
    );
  }
  const seen = new Set<string>();
  const statuses: ReadonlySet<string> = new Set(TASK_STATUSES);
  for (const task of parseTaskRows(markdown)) {
    if (seen.has(task.id)) problems.push(`task ${task.id}: duplicate row`);
    seen.add(task.id);
    if (task.cellCount !== TASK_COLUMNS.length) {
      problems.push(
        `task ${task.id}: ${String(task.cellCount)} cell(s), expected ${String(TASK_COLUMNS.length)}`,
      );
    }
    if (!statuses.has(task.status)) {
      problems.push(
        `task ${task.id}: status "${task.status}" is not one of ${TASK_STATUSES.join(", ")}`,
      );
    }
  }

  return problems;
}

export function readLedger(repoRoot: string): string {
  return readFileSync(resolve(repoRoot, "TASKS.md"), "utf8");
}

const isMain =
  typeof process.argv[1] === "string" &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const root = resolve(process.argv[2] ?? process.cwd());
  const markdown = readLedger(root);
  const problems = checkLedger(markdown);
  const decisions = parseOpenDecisions(markdown);
  const tasks = parseTaskRows(markdown);
  if (problems.length > 0) {
    for (const problem of problems)
      process.stderr.write(`TASKS.md: ${problem}\n`);
    process.exit(1);
  }
  const open = decisions.filter((decision) =>
    decision.status.startsWith("open"),
  ).length;
  process.stdout.write(
    `TASKS.md ok: ${String(tasks.length)} task row(s), ${String(decisions.length)} open-decision ` +
      `row(s) (${String(open)} still open, due ${OPEN_DECISIONS_DUE})\n`,
  );
}
