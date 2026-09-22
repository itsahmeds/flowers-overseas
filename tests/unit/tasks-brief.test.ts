/**
 * AC-34 / T-35 (TASK-086): per-task briefs, and a migration that loses nothing.
 *
 * The migration moves up to 11 KB of prose per task out of a table cell and into a file. The one
 * thing that must not happen is a sentence disappearing — a binding clause or a `/review`
 * carry-forward that no longer reaches the next implementer. So the round trip is asserted per
 * task id on a fixture ledger built from the shapes the real one uses (multiple appended review
 * fragments, an escaped pipe, an escalation, an empty cell), and the committed repository is
 * asserted to be fully migrated with every brief reproducing its row.
 *
 * The two new ledger checks — the 400-character cap and the brief-present rule — are driven from
 * fixture markdown in `tests/unit/tasks-open-decisions.test.ts`, beside the older ones.
 */
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  BRIEF_HEADINGS,
  briefPath,
  concatNotes,
  isMigrated,
  migrate,
  notesCell,
  NOTES_LIMIT,
  parseBrief,
  scaffold,
  splitNotes,
  summarise,
} from "../../scripts/tasks-brief.ts";
import {
  checkLedger,
  parseTaskRows,
  readLedger,
  TASK_COLUMNS,
  TASK_NOTES_LIMIT,
} from "../../scripts/tasks-open-decisions.ts";

const repoRoot = resolve(__dirname, "../..");
const ledger = readLedger(repoRoot);

/**
 * The fixture ledgers below carry only a Tasks table, so the open-decision and phase-progress
 * checks are filtered out; the task-level problems are what these cases are about.
 */
function taskProblems(
  markdown: string,
  options: Parameters<typeof checkLedger>[1] = {},
): string[] {
  return checkLedger(markdown, options).filter(
    (problem) => problem.startsWith("task ") || problem.includes('table "'),
  );
}

/** Notes cells covering every shape the real ledger uses. */
const NOTES: Record<string, string> = {
  "TASK-001":
    "Branch `task/TASK-001-x`. Spec 001 §2 is binding. Gates: lint, typecheck.",
  "TASK-002":
    "Branch `task/TASK-002-y`. Design source of truth: `docs/design/homepage-v1/README.md`. " +
    "**From `/review 7` (2026-09-01):** rename the token. **From `/review 9`:** add the missing " +
    "test for the `a | b` case. **Carried from `/review 9` item 2:** and the runbook row.",
  "TASK-003":
    "**ESCALATION — the budget cannot be met by this task** (accepted as informational). " +
    "Row left `in_review`. **From `/review 12` (2026-09-02):** measure it again after the rebase.",
  "TASK-004": "—",
};

function fixtureLedger(statuses: Record<string, string>): string {
  const rows = Object.entries(NOTES).map(
    ([id, notes]) =>
      `| ${id} | title ${id} | \`specs/001\` · AC-1 | 0 | ${statuses[id] ?? "done"} | backend-implementer | [#1](u) | — | ${notes.replace(/\|/g, "\\|")} |`,
  );
  return [
    "# ledger",
    "",
    "## Tasks",
    `| ${TASK_COLUMNS.join(" | ")} |`,
    `|${"---|".repeat(TASK_COLUMNS.length)}`,
    ...rows,
    "",
  ].join("\n");
}

function fixtureRepo(statuses: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), "fo-briefs-"));
  mkdirSync(join(root, "docs/tasks"), { recursive: true });
  writeFileSync(join(root, "TASKS.md"), fixtureLedger(statuses), "utf8");
  writeFileSync(
    join(root, "docs/tasks/_template.md"),
    readFileSync(join(repoRoot, "docs/tasks/_template.md"), "utf8"),
    "utf8",
  );
  return root;
}

describe("splitting and reassembling a notes cell", () => {
  it("keeps the binding prose and each `/review` fragment verbatim", () => {
    const notes = NOTES["TASK-002"] ?? "";
    const split = splitNotes(notes);
    expect(split.carryForwards).toHaveLength(3);
    expect(split.binding).toContain("Design source of truth");
    expect(split.binding).not.toContain("/review 7");
    expect(concatNotes(split)).toBe(notes);
  });

  it("round-trips a cell with no fragments and an empty cell", () => {
    for (const notes of [NOTES["TASK-001"] ?? "", "", "—"]) {
      expect(concatNotes(splitNotes(notes))).toBe(notes.trim());
    }
  });
});

describe("the migration is lossless (T-35)", () => {
  it("reproduces every task id's notes from its brief, byte for byte", () => {
    const root = fixtureRepo();
    const before = new Map(
      parseTaskRows(readLedger(root)).map((row) => [row.id, row.notes]),
    );
    const report = migrate(root);
    expect(report.problems).toEqual([]);
    expect(report.migrated).toEqual([...before.keys()]);

    for (const [id, notes] of before) {
      const brief = readFileSync(join(root, briefPath(id)), "utf8");
      const after = concatNotes(parseBrief(brief));
      expect(after, id).toBe(notes.trim() === "—" ? "—" : notes.trim());
    }
  });

  it("leaves the row with a link and a summary inside the 400-character cap", () => {
    const root = fixtureRepo();
    migrate(root);
    for (const row of parseTaskRows(readLedger(root))) {
      expect(isMigrated(row.notes), row.id).toBe(true);
      expect(row.notes, row.id).toContain(briefPath(row.id));
      expect(row.notes.length, row.id).toBeLessThanOrEqual(NOTES_LIMIT);
    }
  });

  it("keeps every row at nine cells even when the notes carried a pipe", () => {
    const root = fixtureRepo();
    migrate(root);
    expect(taskProblems(readLedger(root))).toEqual([]);
    expect(readFileSync(join(root, briefPath("TASK-002")), "utf8")).toContain(
      "`a | b`",
    );
  });

  it("is idempotent: a second run migrates nothing and changes no file", () => {
    const root = fixtureRepo();
    migrate(root);
    const ledgerAfterFirst = readLedger(root);
    const briefAfterFirst = readFileSync(
      join(root, briefPath("TASK-002")),
      "utf8",
    );
    const second = migrate(root);
    expect(second.migrated).toEqual([]);
    expect(second.problems).toEqual([]);
    expect(second.alreadyMigrated).toHaveLength(Object.keys(NOTES).length);
    expect(readLedger(root)).toBe(ledgerAfterFirst);
    expect(readFileSync(join(root, briefPath("TASK-002")), "utf8")).toBe(
      briefAfterFirst,
    );
  });

  it("reports a migrated row whose brief has since gone missing (TASK-143)", () => {
    // No case reached this rule: with its `problems.push` neutered every case stayed green, so a
    // deleted brief behind an already-migrated row would have been silently accepted.
    const root = fixtureRepo();
    migrate(root);
    rmSync(join(root, briefPath("TASK-002")));
    expect(migrate(root).problems).toEqual([
      "TASK-002: row points at docs/tasks/TASK-002.md, which is missing",
    ]);
  });

  it("refuses a row whose existing brief does not reproduce its notes", () => {
    const root = fixtureRepo();
    writeFileSync(
      join(root, briefPath("TASK-001")),
      "# TASK-001\n\n## Binding\n\nSomething else entirely.\n",
      "utf8",
    );
    const report = migrate(root);
    expect(report.problems.join("\n")).toContain("TASK-001");
    expect(report.problems.join("\n")).toContain("merge it by hand");
    expect(report.migrated).not.toContain("TASK-001");
  });

  it("writes every fixed heading, and one dated bullet per `/review`", () => {
    const root = fixtureRepo();
    migrate(root);
    const brief = readFileSync(join(root, briefPath("TASK-002")), "utf8");
    for (const heading of BRIEF_HEADINGS) {
      expect(brief, heading).toContain(`## ${heading}`);
    }
    const bullets = brief
      .split("\n")
      .filter(
        (line) => line.startsWith("- **From") || line.startsWith("- **Carried"),
      );
    expect(bullets).toHaveLength(3);
    expect(bullets[0]).toContain("2026-09-01");
  });

  it("points the escalation heading at a migrated escalation", () => {
    const root = fixtureRepo();
    migrate(root);
    const brief = readFileSync(join(root, briefPath("TASK-003")), "utf8");
    expect(brief.slice(brief.indexOf("## Escalations"))).toContain(
      "ESCALATION",
    );
  });

  it("gives every brief a Read list that starts at the spec index and the map", () => {
    const root = fixtureRepo();
    migrate(root);
    const brief = readFileSync(join(root, briefPath("TASK-002")), "utf8");
    const read = brief.slice(
      brief.indexOf("## Read"),
      brief.indexOf("## Carry-forwards"),
    );
    expect(read).toContain("`specs/001-*.md`");
    expect(read).toContain("## 0. Index");
    expect(read).toContain("docs/codebase-map.md");
    expect(read).toContain("docs/design/homepage-v1/README.md");
  });
});

describe("`pnpm tasks:brief`", () => {
  it("scaffolds a brief from the template with the id and title filled in", () => {
    const root = fixtureRepo();
    const path = scaffold(root, "TASK-004");
    const brief = readFileSync(join(root, path), "utf8");
    expect(brief).toContain("# TASK-004 — title TASK-004");
    expect(brief).not.toContain("TASK-NNN");
    for (const heading of BRIEF_HEADINGS)
      expect(brief).toContain(`## ${heading}`);
  });

  it("refuses to overwrite an existing brief", () => {
    const root = fixtureRepo();
    scaffold(root, "TASK-004");
    expect(() => scaffold(root, "TASK-004")).toThrow("already exists");
  });

  it("refuses anything that is not a task id", () => {
    expect(() => scaffold(fixtureRepo(), "TASK-x")).toThrow("not a task id");
  });
});

describe("the summary that stays in the row", () => {
  it("takes whole sentences and stops at the budget", () => {
    expect(summarise("One. Two. Three.", 8)).toBe("One.");
    expect(summarise("One. Two. Three.", 100)).toBe("One. Two. Three.");
  });

  it("truncates a single sentence that is longer than the budget", () => {
    expect(summarise("x".repeat(50), 10)).toBe(`${"x".repeat(9)}…`);
  });

  it("escapes a pipe so the row keeps nine cells", () => {
    expect(notesCell("TASK-002", "A | B.")).toContain("A \\| B.");
  });
});

describe("the committed repository", () => {
  it("has a brief for every task row, and every brief reproduces its row", () => {
    const report = migrate(repoRoot, false);
    expect(report.problems).toEqual([]);
    expect(report.migrated).toEqual([]);
    expect(report.alreadyMigrated.length).toBe(parseTaskRows(ledger).length);
  });

  it("keeps every notes cell inside the cap and pointing at its brief", () => {
    for (const row of parseTaskRows(ledger)) {
      expect(row.notes.length, row.id).toBeLessThanOrEqual(TASK_NOTES_LIMIT);
      expect(row.notes, row.id).toContain(briefPath(row.id));
    }
  });

  it("passes the whole ledger check with the brief probe wired in", () => {
    expect(
      checkLedger(ledger, {
        briefExists: (id) =>
          readFileSync(join(repoRoot, briefPath(id)), "utf8").length > 0,
      }).join("\n"),
    ).toBe("");
  });
});
