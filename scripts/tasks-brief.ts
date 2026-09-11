/**
 * Per-task brief files — AC-34 / T-35 (spec 001 §14 A15, TASK-086).
 *
 * A task row used to carry up to 12 KB of prose in its "Blockers / notes" cell: every binding
 * clause, every carry-forward from every `/review`, every escalation, on one markdown line. That
 * made `TASKS.md` 344 KB, made an unescaped `|` a red test, and made an agent read a wall of text
 * to find the three sentences that bind it.
 *
 * The notes now live in `docs/tasks/TASK-NNN.md` under fixed headings and the cell keeps a link
 * plus one summary sentence, at most 400 characters (`scripts/tasks-open-decisions.ts` enforces
 * both the cap and the presence of the brief).
 *
 * Two entry points:
 *   `pnpm tasks:brief TASK-NNN`  scaffolds a brief from `docs/tasks/_template.md`;
 *   `pnpm tasks:migrate`         moves every un-migrated row's notes into its brief and rewrites
 *                                the cell. It is idempotent: a row already in brief form is left
 *                                alone, so it can be re-run after a rebase or a merge conflict.
 *
 * The migration is **lossless**: `concatNotes(parseBrief(brief))` reproduces the original cell
 * byte for byte, and `tests/unit/tasks-brief.test.ts` asserts that for every task id in the
 * committed ledger.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseTaskRows,
  readLedger,
  TASK_NOTES_LIMIT,
  type TaskRow,
} from "./tasks-open-decisions.ts";

/** Where briefs live, relative to the repository root. */
export const BRIEF_DIR = "docs/tasks";
/** The scaffold `pnpm tasks:brief` copies. */
export const BRIEF_TEMPLATE = `${BRIEF_DIR}/_template.md`;
/** The maximum length of a "Blockers / notes" cell (AC-34), from the ledger parser. */
export const NOTES_LIMIT = TASK_NOTES_LIMIT;
/** The headings every brief carries, in order. */
export const BRIEF_HEADINGS = [
  "Binding",
  "Read",
  "Carry-forwards",
  "Escalations",
  "Result",
] as const;
/** Placeholder body for a section with nothing in it yet. */
export const EMPTY_SECTION = "_None recorded._";

/**
 * The appended `/review` fragments. Only the three shapes the ledger actually uses are treated as
 * carry-forwards; anything else stays in `## Binding` verbatim, because moving prose the parser
 * does not understand is how a migration loses text.
 */
export const CARRY_FORWARD_MARKER =
  /\*\*(?:From|Carried from|Inherited from) `\/review [^*]*?\*\*/g;

export function briefPath(id: string): string {
  return `${BRIEF_DIR}/${id}.md`;
}

export interface Notes {
  /** Everything before the first carry-forward marker, verbatim. */
  readonly binding: string;
  /** One fragment per appended `/review` note, verbatim, marker included. */
  readonly carryForwards: string[];
}

/** Splits a notes cell into its binding prose and its appended `/review` fragments. */
export function splitNotes(notes: string): Notes {
  const starts = [...notes.matchAll(CARRY_FORWARD_MARKER)].map(
    (match) => match.index,
  );
  if (starts.length === 0) return { binding: notes.trim(), carryForwards: [] };
  const first = starts[0] ?? 0;
  const carryForwards = starts.map((start, index) =>
    notes.slice(start, starts[index + 1] ?? notes.length).trim(),
  );
  return { binding: notes.slice(0, first).trim(), carryForwards };
}

/** The inverse of `splitNotes`: the original cell, reassembled. */
export function concatNotes(notes: Notes): string {
  return [notes.binding, ...notes.carryForwards]
    .filter((part) => part !== "")
    .join(" ");
}

/** The `## <heading>` body of a brief, trimmed, or `""` when the section is absent or empty. */
export function sectionOf(markdown: string, heading: string): string {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start === -1) return "";
  const body: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.startsWith("## ")) break;
    body.push(line);
  }
  const text = body.join("\n").trim();
  return text === EMPTY_SECTION || text === "_Pending._" ? "" : text;
}

/** Reads back what `renderBrief` wrote, so the migration can be proved lossless. */
export function parseBrief(markdown: string): Notes {
  const binding = sectionOf(markdown, "Binding");
  const carryForwards = sectionOf(markdown, "Carry-forwards")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim());
  return { binding, carryForwards };
}

/**
 * The paths a brief points the agent at: the spec the row owns, the codebase map, and every
 * backticked path the notes already name. Derived by **copy**, never by moving text out of
 * `## Binding`, so it cannot make the migration lossy.
 */
export function readList(row: TaskRow): string[] {
  const paths = new Set<string>();
  const specMatch = /specs?\/(\d{3})/.exec(row.spec);
  if (specMatch?.[1] !== undefined) {
    paths.add(
      `\`specs/${specMatch[1]}-*.md\` — read \`## 0. Index\` first, then only the sections the ACs below name`,
    );
  }
  paths.add("`docs/codebase-map.md` — where everything lives");
  for (const match of row.notes.matchAll(
    /`((?:src|tests|docs|scripts|seed|supabase|messages|content|plan|specs)\/[\w./*[\]{}()-]+)`/g,
  )) {
    if (match[1] !== undefined) paths.add(`\`${match[1]}\``);
    if (paths.size >= 14) break;
  }
  return [...paths];
}

/** The brief for a row, with the notes split across the fixed headings. */
export function renderBrief(row: TaskRow, notes: Notes): string {
  const escalated = /\*\*ESCALATION/.test(notes.binding);
  const sections = [
    `# ${row.id} — ${row.title}`,
    "",
    `Row: \`TASKS.md\` → ${row.id}. Brief written by \`pnpm tasks:migrate\` (spec 001 §14 A15, AC-34);`,
    "keep it current by editing this file, not the row.",
    "",
    "## Binding",
    "",
    notes.binding === "" ? EMPTY_SECTION : notes.binding,
    "",
    "## Read",
    "",
    ...readList(row).map((path) => `- ${path}`),
    "",
    "## Carry-forwards",
    "",
    notes.carryForwards.length === 0
      ? EMPTY_SECTION
      : notes.carryForwards.map((fragment) => `- ${fragment}`).join("\n"),
    "",
    "## Escalations",
    "",
    escalated
      ? "An escalation is recorded in the migrated prose under **Binding** (search `ESCALATION`). New escalations go here, one dated bullet each."
      : EMPTY_SECTION,
    "",
    "## Result",
    "",
    row.status === "done"
      ? `Done. PR ${row.pr}; \`/review\` pass recorded in \`TASKS.md\`.`
      : "_Pending._",
    "",
  ];
  return sections.join("\n");
}

/** The `<first sentence(s)>` summary that stays in the row, within the character budget. */
export function summarise(notes: string, budget: number): string {
  const sentences = notes.split(/(?<=[.!?])\s+/);
  let summary = "";
  for (const sentence of sentences) {
    const next = summary === "" ? sentence : `${summary} ${sentence}`;
    if (next.length > budget) break;
    summary = next;
  }
  if (summary === "") {
    summary = `${notes.slice(0, Math.max(budget - 1, 0)).trimEnd()}…`;
  }
  return summary;
}

/** The migrated cell: the brief link plus a summary, escaped for a markdown table. */
export function notesCell(id: string, notes: string): string {
  const link = `Brief: \`${briefPath(id)}\`.`;
  if (notes.trim() === "" || notes.trim() === "—") return link;
  const budget = NOTES_LIMIT - link.length - 1;
  const summary = summarise(notes.trim(), budget).replace(/\|/g, "\\|");
  return `${link} ${summary}`;
}

/** Whether a cell has already been migrated. */
export function isMigrated(notes: string): boolean {
  return notes.startsWith(`Brief: \`${BRIEF_DIR}/`);
}

/** Replaces the ninth cell of a task row in the raw ledger text. */
export function replaceNotesCell(
  markdown: string,
  id: string,
  cell: string,
): string {
  const lines = markdown.split("\n");
  const index = lines.findIndex((line) => line.startsWith(`| ${id} |`));
  if (index === -1) throw new Error(`no row for ${id}`);
  const line = lines[index] ?? "";
  const parts = line.trim().split(/(?<!\\)\|/);
  if (parts.length !== 11) {
    throw new Error(
      `row ${id} has ${String(parts.length - 2)} cell(s); refusing to rewrite it`,
    );
  }
  parts[9] = ` ${cell} `;
  lines[index] = parts.join("|");
  return lines.join("\n");
}

export interface MigrationReport {
  readonly migrated: string[];
  readonly alreadyMigrated: string[];
  readonly problems: string[];
}

/**
 * Moves every un-migrated row's notes into its brief. Writes nothing when `write` is false, so the
 * check can run in a test. A row whose brief already exists is only rewritten when the brief
 * reproduces the cell exactly — otherwise the row is reported and left untouched.
 */
export function migrate(root: string, write = true): MigrationReport {
  const markdown = readLedger(root);
  const rows = parseTaskRows(markdown);
  const migrated: string[] = [];
  const alreadyMigrated: string[] = [];
  const problems: string[] = [];
  let ledger = markdown;

  mkdirSync(join(root, BRIEF_DIR), { recursive: true });

  for (const row of rows) {
    const path = join(root, briefPath(row.id));
    if (isMigrated(row.notes)) {
      alreadyMigrated.push(row.id);
      if (!existsSync(path)) {
        problems.push(
          `${row.id}: row points at ${briefPath(row.id)}, which is missing`,
        );
      }
      continue;
    }
    const notes = splitNotes(row.notes);
    if (concatNotes(notes) !== row.notes.trim()) {
      problems.push(
        `${row.id}: notes would not survive the split — migration refused`,
      );
      continue;
    }
    if (existsSync(path)) {
      const existing = parseBrief(readFileSync(path, "utf8"));
      if (concatNotes(existing) !== row.notes.trim()) {
        problems.push(
          `${row.id}: ${briefPath(row.id)} exists and does not reproduce the row's notes — merge it by hand`,
        );
        continue;
      }
    } else if (write) {
      writeFileSync(path, renderBrief(row, notes), "utf8");
    }
    ledger = replaceNotesCell(ledger, row.id, notesCell(row.id, row.notes));
    migrated.push(row.id);
  }

  if (write && migrated.length > 0) {
    writeFileSync(join(root, "TASKS.md"), ledger, "utf8");
  }
  return { migrated, alreadyMigrated, problems };
}

/** Scaffolds one brief from the template. */
export function scaffold(root: string, id: string): string {
  if (!/^TASK-\d{3,}$/.test(id)) throw new Error(`not a task id: ${id}`);
  const path = join(root, briefPath(id));
  if (existsSync(path)) throw new Error(`${briefPath(id)} already exists`);
  const row = parseTaskRows(readLedger(root)).find((task) => task.id === id);
  const template = readFileSync(join(root, BRIEF_TEMPLATE), "utf8");
  const body = template
    .replace(/TASK-NNN/g, id)
    .replace("<task title>", row?.title ?? "<task title>");
  mkdirSync(join(root, BRIEF_DIR), { recursive: true });
  writeFileSync(path, body, "utf8");
  return briefPath(id);
}

const isMain =
  typeof process.argv[1] === "string" &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const args = process.argv.slice(2);
  const root = resolve(process.env["REPO_ROOT"] ?? process.cwd());
  if (args.includes("--migrate")) {
    const report = migrate(root, !args.includes("--dry-run"));
    for (const problem of report.problems)
      process.stderr.write(`tasks:migrate: ${problem}\n`);
    process.stdout.write(
      `tasks:migrate: ${String(report.migrated.length)} row(s) migrated, ` +
        `${String(report.alreadyMigrated.length)} already in brief form\n`,
    );
    if (report.problems.length > 0) process.exit(1);
  } else {
    const id = args.find((arg) => arg.startsWith("TASK-"));
    if (id === undefined) {
      process.stderr.write("usage: pnpm tasks:brief TASK-NNN\n");
      process.exit(1);
    }
    process.stdout.write(`wrote ${scaffold(root, id)}\n`);
  }
}
