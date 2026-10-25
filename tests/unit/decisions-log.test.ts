/**
 * TASK-399 (spec 001 §14 A15's orientation gates; founder 2026-10-25 "log fix ok"): one decision
 * file per PR, collected into `docs/decisions-log.md` by `scripts/decisions-log.ts`.
 *
 * What must hold: a file is exactly the log's row and nothing else; rows are collected in
 * date-then-name order; `--check` is red on a log behind its files while `--lint` (what a pull
 * request runs) is not; and no row is ever lost: a row written into the log by hand, or a
 * hand-written row changed, is red on `--lint`, and the write refuses rather than drop it.
 */
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  checkProblems,
  COLLECTED_MARKER,
  DECISIONS_DIR,
  evaluate,
  frozenHash,
  lintProblems,
  LOG_PATH,
  parseDecision,
  readState,
  renderLog,
  splitLog,
  TABLE_HEADER,
  TABLE_SEPARATOR,
} from "../../scripts/decisions-log.ts";

const repoRoot = resolve(__dirname, "../..");
const script = join(repoRoot, "scripts/decisions-log.ts");

const FROZEN = [
  "# Decisions log",
  "",
  "| Date | ADR | Decision | Trigger |",
  "|---|---|---|---|",
  "| 2026-09-05 | ADR-0001 | One .com domain, locale subfolders | Planning session |",
].join("\n");
const FROZEN_SHA = frozenHash(FROZEN);

const ROW_A = "| 2026-10-25 | none | Decision A. | TASK-399 |";
const ROW_B = "| 2026-10-25 | ADR-0021 | Decision B. |";
const ROW_EARLY = "| 2026-10-24 | none | An earlier decision. |";

function ok(name: string, content: string) {
  const parsed = parseDecision(name, content);
  if (!parsed.ok) throw new Error(parsed.problem);
  return parsed.decision;
}

function problemOf(name: string, content: string): string {
  const parsed = parseDecision(name, content);
  return parsed.ok ? "" : parsed.problem;
}

describe("parseDecision: a file is exactly one row of the log", () => {
  it("takes the log's three-cell row and its four-cell row with the trigger", () => {
    expect(ok("2026-10-25-b.md", `${ROW_B}\n`)).toEqual({
      file: `${DECISIONS_DIR}/2026-10-25-b.md`,
      date: "2026-10-25",
      row: ROW_B,
    });
    expect(ok("2026-10-25-a.md", `${ROW_A}\n`).row).toBe(ROW_A);
  });

  it("counts an escaped pipe as text, not a cell", () => {
    const row = "| 2026-10-25 | none | `a \\| b` is one cell. |";
    expect(ok("2026-10-25-pipe.md", `${row}\n`).row).toBe(row);
  });

  it("refuses a name that is not YYYY-MM-DD-<slug>.md", () => {
    expect(problemOf("decision.md", `${ROW_A}\n`)).toMatch(
      /YYYY-MM-DD-<slug>\.md/,
    );
    expect(problemOf("2026-10-25-Upper.md", `${ROW_A}\n`)).toMatch(
      /YYYY-MM-DD-<slug>\.md/,
    );
    expect(problemOf("2026-10-25-a.txt", `${ROW_A}\n`)).toMatch(
      /YYYY-MM-DD-<slug>\.md/,
    );
  });

  it("refuses a date that is not on the calendar", () => {
    expect(problemOf("2026-02-30-a.md", "| 2026-02-30 | none | x |\n")).toBe(
      `${DECISIONS_DIR}/2026-02-30-a.md: 2026-02-30 is not a calendar date`,
    );
  });

  it("refuses a row whose date differs from the file name", () => {
    expect(problemOf("2026-10-24-a.md", `${ROW_A}\n`)).toBe(
      `${DECISIONS_DIR}/2026-10-24-a.md: the row's date "2026-10-25" differs from the file name's 2026-10-24`,
    );
  });

  it("refuses a second line, a missing newline and a trailing blank line", () => {
    expect(problemOf("2026-10-25-a.md", `${ROW_A}\n${ROW_B}\n`)).toMatch(
      /exactly one line/,
    );
    expect(problemOf("2026-10-25-a.md", ROW_A)).toMatch(
      /ending in one newline/,
    );
    expect(problemOf("2026-10-25-a.md", `${ROW_A}\n\n`)).toMatch(
      /ending in one newline/,
    );
  });

  it("refuses prose, too few or too many cells, and an empty cell", () => {
    expect(problemOf("2026-10-25-a.md", "We decided A.\n")).toMatch(
      /start with "\|"/,
    );
    expect(problemOf("2026-10-25-a.md", "| 2026-10-25 | none |\n")).toMatch(
      /has 2 cell\(s\)/,
    );
    expect(
      problemOf("2026-10-25-a.md", "| 2026-10-25 | a | b | c | d |\n"),
    ).toMatch(/has 5 cell\(s\)/);
    expect(problemOf("2026-10-25-a.md", "| 2026-10-25 |  | b |\n")).toMatch(
      /cell 2 is empty/,
    );
  });
});

describe("renderLog: the collected table follows the hand-written rows, date then name", () => {
  it("orders by date first, then by file name, whatever order the files come in", () => {
    const log = renderLog(FROZEN, [
      ok("2026-10-25-b.md", `${ROW_B}\n`),
      ok("2026-10-25-a.md", `${ROW_A}\n`),
      ok("2026-10-24-zz.md", `${ROW_EARLY}\n`),
    ]);
    expect(log).toBe(
      [
        FROZEN,
        "",
        COLLECTED_MARKER,
        "",
        TABLE_HEADER,
        TABLE_SEPARATOR,
        ROW_EARLY,
        ROW_A,
        ROW_B,
        "",
      ].join("\n"),
    );
  });

  it("writes the marker alone when there is no file, and keeps the hand-written part byte for byte", () => {
    expect(renderLog(FROZEN, [])).toBe(`${FROZEN}\n\n${COLLECTED_MARKER}\n`);
    expect(
      splitLog(renderLog(FROZEN, [ok("2026-10-25-a.md", `${ROW_A}\n`)])),
    ).toEqual({ frozen: FROZEN, collected: [ROW_A], stray: [] });
  });
});

describe("evaluate: --check, --lint, and no row lost", () => {
  const files: [string, string][] = [
    ["2026-10-25-a.md", `${ROW_A}\n`],
    ["2026-10-24-zz.md", `${ROW_EARLY}\n`],
  ];
  const current = renderLog(
    FROZEN,
    files.map(([name, content]) => ok(name, content)),
  );

  it("passes --check and --lint on a log the files produce", () => {
    const state = evaluate(current, files, FROZEN_SHA);
    expect(checkProblems(state)).toEqual([]);
    expect(lintProblems(state)).toEqual([]);
  });

  it("is red on --check, and green on --lint, when a new file is not collected yet (a pull request)", () => {
    const state = evaluate(
      current,
      [...files, ["2026-10-25-b.md", `${ROW_B}\n`]],
      FROZEN_SHA,
    );
    expect(lintProblems(state)).toEqual([]);
    expect(checkProblems(state)).toEqual([
      `${LOG_PATH} is out of date with ${DECISIONS_DIR}/: run \`pnpm decisions:log\` (CI on main does)`,
    ]);
  });

  it("is red on --check for a log that predates the marker", () => {
    const problems = checkProblems(evaluate(`${FROZEN}\n`, files, FROZEN_SHA));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/out of date/);
  });

  it("is red on --lint and --check for a malformed file", () => {
    const state = evaluate(
      current,
      [...files, ["2026-10-25-c.md", "We decided C.\n"]],
      FROZEN_SHA,
    );
    expect(lintProblems(state)).toEqual([
      `${DECISIONS_DIR}/2026-10-25-c.md: the row must start with "|" and end with "|"`,
    ]);
    expect(checkProblems(state)).toContain(lintProblems(state)[0]);
  });

  it("is red on --lint for a row appended to the hand-written table", () => {
    const edited = current.replace(FROZEN, `${FROZEN}\n${ROW_B}`);
    const problems = lintProblems(evaluate(edited, files, FROZEN_SHA));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(
      /hand-written rows above the collected block changed/,
    );
  });

  it("is red on --lint for a row written by hand into the collected table", () => {
    const problems = lintProblems(
      evaluate(`${current}${ROW_B}\n`, files, FROZEN_SHA),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(
      /collected row "\| 2026-10-25 \| ADR-0021 .* has no file/,
    );
  });

  it("is red on --lint when a collected file is deleted", () => {
    const kept = files.slice(0, 1);
    const problems = lintProblems(evaluate(current, kept, FROZEN_SHA));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/"\| 2026-10-24 \| none \| An earlier/);
    expect(problems[0]).toMatch(/append-only/);
  });

  it("is red on --lint for prose below the marker and for two files with one row", () => {
    expect(
      lintProblems(evaluate(`${current}A note.\n`, files, FROZEN_SHA)),
    ).toEqual([
      `${LOG_PATH}: "A note." below the collected marker is not a table row`,
    ]);
    const twins = lintProblems(
      evaluate(
        current,
        [...files, ["2026-10-25-again.md", `${ROW_A}\n`]],
        FROZEN_SHA,
      ),
    );
    expect(twins).toEqual([
      `${DECISIONS_DIR}/2026-10-25-again.md: the same row as ${DECISIONS_DIR}/2026-10-25-a.md`,
    ]);
  });
});

describe("the repository and the command", () => {
  it("the repository's log and files pass --lint (CI on main collects; --check may lag a PR)", () => {
    expect(lintProblems(readState(repoRoot))).toEqual([]);
  });

  describe("pnpm decisions:log on a scratch repository", () => {
    let root = "";
    afterEach(() => {
      if (root !== "") rmSync(root, { recursive: true, force: true });
      root = "";
    });

    function scratch(log: string, files: [string, string][]): string {
      root = mkdtempSync(join(tmpdir(), "decisions-log-"));
      mkdirSync(join(root, DECISIONS_DIR), { recursive: true });
      writeFileSync(join(root, LOG_PATH), log);
      for (const [name, content] of files) {
        writeFileSync(join(root, DECISIONS_DIR, name), content);
      }
      return root;
    }

    function run(dir: string, ...args: string[]) {
      return spawnSync(process.execPath, [script, dir, ...args], {
        encoding: "utf8",
      });
    }

    const { frozen } = splitLog(readFileSync(join(repoRoot, LOG_PATH), "utf8"));

    it("collects: --check red before the write, green after, and the write is idempotent", () => {
      const dir = scratch(`${frozen}\n`, [
        ["2026-10-25-b.md", `${ROW_B}\n`],
        ["2026-10-24-zz.md", `${ROW_EARLY}\n`],
        ["README.md", "not a decision\n"],
      ]);
      expect(run(dir, "--check").status).toBe(1);
      expect(run(dir, "--lint").status).toBe(0);
      const write = run(dir);
      expect(write.status).toBe(0);
      expect(write.stdout).toBe(
        `decisions log: wrote ${LOG_PATH} (2 collected file(s))\n`,
      );
      expect(
        splitLog(readFileSync(join(dir, LOG_PATH), "utf8")).collected,
      ).toEqual([ROW_EARLY, ROW_B]);
      expect(run(dir, "--check").status).toBe(0);
      expect(run(dir).stdout).toBe(
        "decisions log: already current (2 collected file(s))\n",
      );
    });

    it("refuses to write, and writes nothing, over a row it would drop", () => {
      const log = `${renderLog(frozen, [])}\n${TABLE_HEADER}\n${TABLE_SEPARATOR}\n${ROW_A}\n`;
      const dir = scratch(log, [["2026-10-25-b.md", `${ROW_B}\n`]]);
      const write = run(dir);
      expect(write.status).toBe(1);
      expect(write.stderr).toMatch(/has no file/);
      expect(write.stderr).toMatch(/nothing written/);
      expect(readFileSync(join(dir, LOG_PATH), "utf8")).toBe(log);
    });
  });
});
