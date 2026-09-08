/**
 * AC-31 / T-32 (TASK-012): `TASKS.md` is machine-readable and mirrors `plan/13` §A.
 *
 * The ledger is the file `CLAUDE.md` sends every agent to and `/status` reports from. Two failure
 * modes are invisible to a human skim and fatal to an agent: an open-decision row that drifted
 * from `plan/13` §A (so a blocker is reported as resolved, or not at all), and a table row with
 * one cell too many, which shifts every later column — the status of a task lands in the owner
 * column and `.claude/bin/task.sh` stops finding the row. Both are asserted here, and the parser
 * is driven from fixture markdown so the failure paths are proven, not assumed.
 */
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  checkLedger,
  OPEN_DECISION_IDS,
  OPEN_DECISIONS_DUE,
  PHASE_0_SPECS_APPROVED,
  parseOpenDecisions,
  parsePhaseProgress,
  parseTables,
  parseTaskRows,
  readLedger,
  splitRow,
  TASK_COLUMNS,
  tableIn,
} from "../../scripts/tasks-open-decisions.ts";

const repoRoot = resolve(__dirname, "../..");
const ledger = readLedger(repoRoot);

describe("the committed TASKS.md (AC-31 / T-32)", () => {
  it("has ten open decisions, A1 to A10, in plan/13 §A order", () => {
    const decisions = parseOpenDecisions(ledger);
    expect(decisions).toHaveLength(10);
    expect(decisions.map((decision) => decision.id)).toEqual([
      ...OPEN_DECISION_IDS,
    ]);
  });

  it("gives every decision a question, what it blocks, an owner, a default and a status", () => {
    for (const decision of parseOpenDecisions(ledger)) {
      expect(decision.question, decision.id).not.toBe("");
      expect(decision.blocks, decision.id).not.toBe("");
      expect(decision.owner, decision.id).not.toBe("");
      expect(decision.defaultIfUnanswered, decision.id).not.toBe("");
      expect(decision.status, decision.id).not.toBe("");
    }
  });

  it("dates every decision 2026-09-21 (plan/09 Phase 0 window)", () => {
    expect(OPEN_DECISIONS_DUE).toBe("2026-09-21");
    for (const decision of parseOpenDecisions(ledger)) {
      expect(decision.due, decision.id).toBe(OPEN_DECISIONS_DUE);
    }
  });

  it("reports Phase 0 as 1 / 12 specs approved", () => {
    const phase0 = parsePhaseProgress(ledger).find((phase) =>
      phase.phase.startsWith("0"),
    );
    expect(phase0?.specsApproved).toBe(PHASE_0_SPECS_APPROVED);
    expect(PHASE_0_SPECS_APPROVED).toBe("2 / 12");
  });

  it("gives every TASK row exactly nine cells, in the documented column order", () => {
    const tasks = parseTaskRows(ledger);
    expect(tasks.length).toBeGreaterThanOrEqual(12);
    expect(tableIn(ledger, "Tasks")?.header).toEqual([...TASK_COLUMNS]);
    for (const task of tasks) {
      expect(task.cellCount, `${task.id} (${task.title.slice(0, 40)})`).toBe(9);
    }
  });

  it("has no malformed row in any of its tables", () => {
    for (const table of parseTables(ledger)) {
      expect(table.malformed, `section "${table.section}"`).toEqual([]);
    }
  });

  it("passes the whole ledger check", () => {
    expect(checkLedger(ledger).join("\n")).toBe("");
  });

  it("carries a row for TASK-012 owned by the backend implementer", () => {
    const task = parseTaskRows(ledger).find((row) => row.id === "TASK-012");
    expect(task?.spec).toContain("AC-30");
    expect(task?.spec).toContain("AC-31");
    expect(task?.owner).toBe("backend-implementer");
  });
});

// --- the parser's own failure paths -------------------------------------------------------------

const fixture = [
  "# ledger",
  "",
  "## Phase progress",
  "| Phase | Specs approved | Tasks done / total | Gate status |",
  "|---|---|---|---|",
  "| 0 Demo | 1 / 12 | 12 / 12 | in progress |",
  "",
  "## Tasks",
  `| ${TASK_COLUMNS.join(" | ")} |`,
  `|${"---|".repeat(TASK_COLUMNS.length)}`,
  "| TASK-001 | t | `specs/001` · AC-1 | 0 | done | backend-implementer | [#1](u) | — | n |",
  "",
  "## Open decisions blocking tasks",
  "| # | Question | Blocks | Owner | Due | Default if unanswered | Status |",
  "|---|---|---|---|---|---|---|",
  ...OPEN_DECISION_IDS.map(
    (id) =>
      `| ${id} | q | spec 003 | Ahmed | ${OPEN_DECISIONS_DUE} | d | open |`,
  ),
  "",
].join("\n");

describe("parsing", () => {
  it("splits on unescaped pipes and unescapes the rest", () => {
    expect(splitRow("| a | `x \\| y` | c |")).toEqual(["a", "`x | y`", "c"]);
  });

  it("finds one table per section", () => {
    expect(parseTables(fixture).map((table) => table.section)).toEqual([
      "Phase progress",
      "Tasks",
      "Open decisions blocking tasks",
    ]);
  });

  it("accepts the healthy fixture", () => {
    expect(checkLedger(fixture)).toEqual([]);
  });

  it("does not treat a paragraph starting with a pipe as a table", () => {
    expect(parseTables("## s\n| not a table\n")).toEqual([]);
  });
});

describe("checkLedger failure paths", () => {
  it("reports a nine-cell row that gained a tenth cell from an unescaped pipe", () => {
    const broken = fixture.replace(
      "| — | n |",
      "| — | anchor the `| TASK-NNN |` grep |",
    );
    const problems = checkLedger(broken);
    expect(problems.join("\n")).toContain("escape a literal pipe as \\|");
    expect(problems.some((problem) => problem.includes("TASK-001"))).toBe(true);
  });

  it("reports a missing open decision", () => {
    const broken = fixture.replace(
      `| A10 | q | spec 003 | Ahmed | ${OPEN_DECISIONS_DUE} | d | open |\n`,
      "",
    );
    expect(checkLedger(broken).join("\n")).toContain(
      "9 row(s), expected 10 (plan/13 §A)",
    );
  });

  it("reports a renumbered open decision", () => {
    const broken = fixture.replace("| A7 |", "| A11 |");
    expect(checkLedger(broken).join("\n")).toContain(
      "do not mirror plan/13 §A",
    );
  });

  it("reports an empty question, blocks or owner", () => {
    const broken = fixture.replace(
      `| A3 | q | spec 003 | Ahmed |`,
      `| A3 |  | spec 003 |  |`,
    );
    const problems = checkLedger(broken).join("\n");
    expect(problems).toContain("open decision A3: empty question");
    expect(problems).toContain("open decision A3: empty owner");
  });

  it("reports a due date that is not 2026-09-21", () => {
    const broken = fixture.replace(
      `| A5 | q | spec 003 | Ahmed | ${OPEN_DECISIONS_DUE} |`,
      "| A5 | q | spec 003 | Ahmed | 2026-10-01 |",
    );
    expect(checkLedger(broken).join("\n")).toContain(
      'open decision A5: due "2026-10-01", expected 2026-09-21',
    );
  });

  it("reports a Phase 0 progress row that no longer says 1 / 12", () => {
    const broken = fixture.replace(
      "| 0 Demo | 1 / 12 |",
      "| 0 Demo | 2 / 12 |",
    );
    expect(checkLedger(broken).join("\n")).toContain(
      'Phase 0 specs approved "2 / 12"',
    );
  });

  it("reports an unknown task status and a duplicate task row", () => {
    const row =
      "| TASK-001 | t | `specs/001` · AC-1 | 0 | done | backend-implementer | [#1](u) | — | n |";
    const broken = fixture.replace(
      row,
      `${row}\n${row.replace("done", "wip")}`,
    );
    const problems = checkLedger(broken).join("\n");
    expect(problems).toContain("duplicate row");
    expect(problems).toContain('status "wip" is not one of');
  });

  it("reports a renamed task column", () => {
    const broken = fixture.replace("| Owner agent |", "| Agent |");
    expect(checkLedger(broken).join("\n")).toContain("tasks table header is");
  });
});

describe("the CLI", () => {
  it("exits 0 on the committed ledger and prints the counts", () => {
    const out = execFileSync(
      process.execPath,
      [join(repoRoot, "scripts/tasks-open-decisions.ts"), repoRoot],
      { encoding: "utf8" },
    );
    expect(out).toMatch(
      /^TASKS\.md ok: \d+ task row\(s\), 10 open-decision row\(s\)/,
    );
    expect(out).toContain(OPEN_DECISIONS_DUE);
  });
});
