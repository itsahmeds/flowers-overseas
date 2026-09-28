/**
 * T-46 (spec 001 AC-44, TASK-152) and the drift half of T-45 (AC-43): tests that read the
 * framework's own text, so deleting a rule from it turns a check red.
 *
 * Every file is read relative to one root, `FRAMEWORK_ROOT` (default: this repository). A breaker
 * who may not mutate `CLAUDE.md` or `.claude/` in place (founder, 2026-09-28) copies `CLAUDE.md`,
 * `.claude/`, `docs/framework/` and `docs/tasks/_template.md` into a scratch directory, deletes a
 * subject there, and runs `FRAMEWORK_ROOT=<scratch> pnpm exec vitest run
 * tests/unit/framework-text.test.ts` to watch the case go red with the real tree untouched
 * (advisor fix 5, W-13). The "red by deletion" block below does the same for every case on every
 * run, so no case can pass with its subject removed.
 *
 * The checks return a list of problems rather than asserting inside, so each red-by-deletion case
 * asserts the one problem its deletion causes, not merely "something failed".
 */
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { CHEAP_SENTENCE_START, gateDrift } from "../../scripts/gates-cheap.ts";

const REPO_ROOT = resolve(__dirname, "../..");
const ROOT = resolve(process.env.FRAMEWORK_ROOT ?? REPO_ROOT);

const WORK_ORDER = ".claude/templates/work-order.md";
const TEMPLATE = "docs/tasks/_template.md";
const WHY = "docs/framework/why.md";

const read = (root: string, path: string): string =>
  readFileSync(join(root, path), "utf8");

/** The body of `## <heading>` up to the next `## ` heading. */
function section(text: string, heading: string): string {
  const start = text.indexOf(`\n## ${heading}`);
  if (start === -1) return "";
  const body = text.indexOf("\n", start + 1);
  const next = text.indexOf("\n## ", body);
  return text.slice(body, next === -1 ? text.length : next);
}

/** Item `n.` of a numbered list, up to the next numbered item. */
function numbered(text: string, n: number): string {
  return (
    new RegExp(
      `^${String(n)}\\. [\\s\\S]*?(?=^\\d+\\. |(?![\\s\\S]))`,
      "m",
    ).exec(text)?.[0] ?? ""
  );
}

function skillFiles(root: string): string[] {
  const dir = join(root, ".claude/skills");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() && existsSync(join(dir, entry.name, "SKILL.md")),
    )
    .map((entry) => `.claude/skills/${entry.name}/SKILL.md`)
    .sort();
}

function agentNames(root: string): string[] {
  const dir = join(root, ".claude/agents");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => name.slice(0, -".md".length))
    .sort();
}

/** Case 1: a skill that dispatches an agent (other than the orchestrator) points at the work order. */
function skillPointerProblems(root: string): string[] {
  const problems: string[] = [];
  const skills = skillFiles(root);
  if (skills.length === 0) problems.push("no .claude/skills/*/SKILL.md found");
  for (const path of skills) {
    const text = read(root, path);
    const agentLine = text
      .split("\n")
      .find((line) => line.startsWith("**Agent:**"));
    if (agentLine === undefined) {
      problems.push(`${path}: no **Agent:** line`);
      continue;
    }
    // `**Agent:** none (inline)` (the `/adr` skill) dispatches nobody, whatever it names after.
    const agents = /^\*\*Agent:\*\*\s*none\b/.test(agentLine)
      ? []
      : [...agentLine.matchAll(/`([a-z][a-z0-9-]*)`/g)].map((m) => m[1] ?? "");
    const dispatches = agents.some((agent) => agent !== "orchestrator");
    if (dispatches && !text.includes(WORK_ORDER)) {
      problems.push(
        `${path}: launches ${agents.join(", ")} but does not reference ${WORK_ORDER}`,
      );
    }
  }
  const orchestrator = ".claude/agents/orchestrator.md";
  if (
    !existsSync(join(root, orchestrator)) ||
    !read(root, orchestrator).includes(WORK_ORDER)
  ) {
    problems.push(`${orchestrator}: does not reference ${WORK_ORDER}`);
  }
  return problems;
}

/** Case 2: the brief template carries `## Progress` above `## Result`. */
function templateProblems(root: string): string[] {
  const text = existsSync(join(root, TEMPLATE)) ? read(root, TEMPLATE) : "";
  const progress = text.search(/^## Progress$/m);
  const result = text.search(/^## Result$/m);
  if (progress === -1) return [`${TEMPLATE}: no "## Progress" heading`];
  if (result === -1) return [`${TEMPLATE}: no "## Result" heading`];
  return progress < result
    ? []
    : [`${TEMPLATE}: "## Progress" is not above "## Result"`];
}

/** Case 3: the breaker in DoD §4 and in the merge rule, and the reviewer as the only acceptor. */
function breakerProblems(root: string): string[] {
  const claude = read(root, "CLAUDE.md");
  const dod4 = numbered(section(claude, "Definition of done"), 4);
  const merging =
    /^- \*\*Merging\.\*\*[^\n]*/m.exec(section(claude, "Conventions"))?.[0] ??
    "";
  const problems: string[] = [];
  if (dod4 === "")
    problems.push('CLAUDE.md: "Definition of done" has no item 4');
  if (merging === "")
    problems.push('CLAUDE.md: "Conventions" has no "Merging" bullet');
  for (const word of ["`/break`", "`HOLDS`"]) {
    if (dod4 !== "" && !dod4.includes(word))
      problems.push(`CLAUDE.md DoD §4 does not name ${word}`);
    if (merging !== "" && !merging.includes(word))
      problems.push(`CLAUDE.md "Merging" does not name ${word}`);
  }
  if (dod4 !== "" && !/accepted\*{0,2} only by the reviewer/.test(dod4)) {
    problems.push(
      "CLAUDE.md DoD §4 does not say a hole is accepted only by the reviewer",
    );
  }
  if (dod4 !== "" && !dod4.includes("The orchestrator never accepts a hole")) {
    problems.push(
      "CLAUDE.md DoD §4 does not say the orchestrator never accepts a hole",
    );
  }
  if (merging !== "" && !/accepted by the reviewer/.test(merging)) {
    problems.push(
      'CLAUDE.md "Merging" does not name the reviewer as the one who accepts a hole',
    );
  }
  return problems;
}

/** A table row's cells; a `|` inside backticks (`<PR|TASK-ID>`) does not split a cell. */
function cells(row: string): string[] {
  const out: string[] = [];
  let cell = "";
  let inTicks = false;
  for (const char of row.trim().slice(1)) {
    if (char === "`") inTicks = !inTicks;
    if (char === "|" && !inTicks) {
      out.push(cell.trim());
      cell = "";
    } else cell += char;
  }
  return out;
}

/** Case 4: `CLAUDE.md`'s Agents table and `.claude/agents/`, `.claude/skills/` agree both ways. */
function agentTableProblems(root: string): string[] {
  const table = section(
    read(root, "CLAUDE.md"),
    "Agents (`.claude/agents/`) and skills (`.claude/skills/`)",
  );
  const rows = table
    .split("\n")
    .filter(
      (line) =>
        line.startsWith("|") &&
        !/^\|\s*-/.test(line) &&
        !/^\|\s*Skill\s*\|/.test(line),
    );
  const problems: string[] = [];
  if (rows.length === 0) return ["CLAUDE.md: the Agents table has no rows"];
  const listed = new Set<string>();
  for (const row of rows) {
    const [skillCell = "", agentCell = ""] = cells(row);
    const userLevel = agentCell === "user-level";
    const exempt = userLevel || agentCell === "(inline)";
    if (!exempt) {
      for (const agent of agentCell.split(" / ").map((a) => a.trim())) {
        if (!/^[a-z][a-z0-9-]*$/.test(agent)) {
          problems.push(
            `CLAUDE.md Agents table: "${agent}" is not an agent name`,
          );
          continue;
        }
        listed.add(agent);
        if (!existsSync(join(root, `.claude/agents/${agent}.md`))) {
          problems.push(
            `CLAUDE.md Agents table names ${agent}; .claude/agents/${agent}.md does not exist`,
          );
        }
      }
    }
    if (userLevel) continue;
    for (const match of skillCell.matchAll(/`\/([a-z][a-z0-9-]*)/g)) {
      const skill = match[1] ?? "";
      if (!existsSync(join(root, `.claude/skills/${skill}/SKILL.md`))) {
        problems.push(
          `CLAUDE.md Agents table names /${skill}; .claude/skills/${skill}/SKILL.md does not exist`,
        );
      }
    }
  }
  for (const agent of agentNames(root)) {
    if (!listed.has(agent))
      problems.push(
        `.claude/agents/${agent}.md is not in CLAUDE.md's Agents table`,
      );
  }
  return problems;
}

/** Case 5: every `(why: W-n)` resolves to a `## W-n ·` heading in `docs/framework/why.md`. */
function whyProblems(root: string): string[] {
  const files = [
    "CLAUDE.md",
    ...agentNames(root).map((agent) => `.claude/agents/${agent}.md`),
    ...skillFiles(root),
  ];
  const why = existsSync(join(root, WHY)) ? read(root, WHY) : "";
  const headings = new Set(
    [...why.matchAll(/^## (W-\d+) · /gm)].map((m) => m[1]),
  );
  const problems: string[] = [];
  let references = 0;
  for (const path of files) {
    for (const group of read(root, path).matchAll(/\(why: ([^)]*)\)/g)) {
      for (const ref of (group[1] ?? "").match(/W-\d+/g) ?? []) {
        references += 1;
        if (!headings.has(ref))
          problems.push(
            `${path}: (why: ${ref}) has no "## ${ref} ·" heading in ${WHY}`,
          );
      }
    }
  }
  if (references === 0)
    problems.push(
      "no (why: W-n) reference found; the check would pass vacuously",
    );
  return problems;
}

/** AC-43's owed DoD §2 line, and the cheap-gate sentence the drift test reads. */
function gatesLineProblems(root: string): string[] {
  const claude = read(root, "CLAUDE.md");
  const dod2 = numbered(section(claude, "Definition of done"), 2);
  const problems = gateDrift(claude);
  if (!/run `pnpm gates:cheap` and paste its block/i.test(dod2)) {
    problems.push(
      'CLAUDE.md DoD §2 does not say "run `pnpm gates:cheap` and paste its block"',
    );
  }
  return problems;
}

const CHECKS = {
  "1 · skills that dispatch point at the work order": skillPointerProblems,
  "2 · the brief template has ## Progress above ## Result": templateProblems,
  "3 · DoD §4 and Merging name /break, HOLDS and the reviewer": breakerProblems,
  "4 · the Agents table matches the agent and skill files": agentTableProblems,
  "5 · every (why: W-n) resolves": whyProblems,
  "AC-43 · DoD §2 names gates:cheap and its gates match the script":
    gatesLineProblems,
} as const;

describe(`the framework text (AC-44) under ${ROOT === REPO_ROOT ? "the repository" : `FRAMEWORK_ROOT=${ROOT}`}`, () => {
  it.each(Object.entries(CHECKS))("%s", (_name, check) => {
    expect(check(ROOT)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// Red by deletion, on scratch copies only. The real tree is never written.

const scratches: string[] = [];
afterAll(() => {
  for (const dir of scratches) rmSync(dir, { recursive: true, force: true });
});

/** A scratch copy of exactly the files AC-44 reads, taken from `ROOT`. */
function scratchCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), "framework-text-"));
  scratches.push(dir);
  cpSync(join(ROOT, "CLAUDE.md"), join(dir, "CLAUDE.md"));
  cpSync(join(ROOT, ".claude"), join(dir, ".claude"), {
    recursive: true,
    filter: (src) => !src.includes(`${join(ROOT, ".claude", "state")}`),
  });
  cpSync(join(ROOT, "docs/framework"), join(dir, "docs/framework"), {
    recursive: true,
  });
  cpSync(join(ROOT, TEMPLATE), join(dir, TEMPLATE));
  return dir;
}

/** Replaces `subject` in `path` under `root`; fails when the subject is not there to delete. */
function mutate(
  root: string,
  path: string,
  subject: string | RegExp,
  replacement = "",
): void {
  const text = read(root, path);
  const next = text.replace(subject, replacement);
  expect(next, `subject ${String(subject)} not found in ${path}`).not.toBe(
    text,
  );
  writeFileSync(join(root, path), next);
}

describe("each case goes red when its subject is deleted in a scratch copy (T-46, W-13)", () => {
  it("an unmodified scratch copy is green on every case", () => {
    const copy = scratchCopy();
    for (const check of Object.values(CHECKS)) expect(check(copy)).toEqual([]);
  });

  it("1 · a skill's work-order pointer deleted → red, naming the skill", () => {
    const copy = scratchCopy();
    mutate(
      copy,
      ".claude/skills/review/SKILL.md",
      /\.claude\/templates\/work-order\.md/g,
      "the order",
    );
    expect(skillPointerProblems(copy)).toEqual([
      ".claude/skills/review/SKILL.md: launches reviewer but does not reference .claude/templates/work-order.md",
    ]);
  });

  it("1 · the orchestrator's pointer deleted → red", () => {
    const copy = scratchCopy();
    mutate(
      copy,
      ".claude/agents/orchestrator.md",
      /\.claude\/templates\/work-order\.md/g,
      "the order",
    );
    expect(skillPointerProblems(copy)).toEqual([
      ".claude/agents/orchestrator.md: does not reference .claude/templates/work-order.md",
    ]);
  });

  it("1 · a skill's **Agent:** line deleted → red, not exempt", () => {
    const copy = scratchCopy();
    mutate(copy, ".claude/skills/break/SKILL.md", /^\*\*Agent:\*\*.*$/m);
    expect(skillPointerProblems(copy)).toEqual([
      ".claude/skills/break/SKILL.md: no **Agent:** line",
    ]);
  });

  it("2 · ## Progress deleted from the template → red", () => {
    const copy = scratchCopy();
    mutate(copy, TEMPLATE, /^## Progress$/m);
    expect(templateProblems(copy)).toEqual([
      `${TEMPLATE}: no "## Progress" heading`,
    ]);
  });

  it("2 · ## Progress moved below ## Result → red", () => {
    const copy = scratchCopy();
    mutate(copy, TEMPLATE, /^## Progress$/m, "## Notes");
    writeFileSync(
      join(copy, TEMPLATE),
      `${read(copy, TEMPLATE)}\n## Progress\n`,
    );
    expect(templateProblems(copy)).toEqual([
      `${TEMPLATE}: "## Progress" is not above "## Result"`,
    ]);
  });

  it("3 · /break deleted from DoD §4 → red", () => {
    const copy = scratchCopy();
    mutate(copy, "CLAUDE.md", "**and** a `/break` verdict", "verdict");
    expect(breakerProblems(copy)).toEqual([
      "CLAUDE.md DoD §4 does not name `/break`",
    ]);
  });

  it("3 · HOLDS deleted from Merging → red", () => {
    const copy = scratchCopy();
    mutate(copy, "CLAUDE.md", "is `HOLDS`, or", "is fine, or");
    expect(breakerProblems(copy)).toEqual([
      'CLAUDE.md "Merging" does not name `HOLDS`',
    ]);
  });

  it("3 · the reviewer-only acceptance deleted from DoD §4 → red", () => {
    const copy = scratchCopy();
    mutate(
      copy,
      "CLAUDE.md",
      /accepted\*{0,2} only by the reviewer/,
      "accepted by anyone",
    );
    expect(breakerProblems(copy)).toEqual([
      "CLAUDE.md DoD §4 does not say a hole is accepted only by the reviewer",
    ]);
  });

  it("4 · one agent file deleted → red, naming it", () => {
    const copy = scratchCopy();
    rmSync(join(copy, ".claude/agents/breaker.md"));
    expect(agentTableProblems(copy)).toEqual([
      "CLAUDE.md Agents table names breaker; .claude/agents/breaker.md does not exist",
    ]);
  });

  it("4 · an agent file missing from the table → red", () => {
    const copy = scratchCopy();
    writeFileSync(
      join(copy, ".claude/agents/ghost.md"),
      "---\nname: ghost\n---\n",
    );
    expect(agentTableProblems(copy)).toEqual([
      ".claude/agents/ghost.md is not in CLAUDE.md's Agents table",
    ]);
  });

  it("4 · a skill directory deleted → red", () => {
    const copy = scratchCopy();
    rmSync(join(copy, ".claude/skills/advise"), { recursive: true });
    expect(agentTableProblems(copy)).toEqual([
      "CLAUDE.md Agents table names /advise; .claude/skills/advise/SKILL.md does not exist",
    ]);
  });

  it("5 · one W-n heading deleted → red at every reference to it", () => {
    const copy = scratchCopy();
    mutate(copy, WHY, /^## W-12 · /m, "## W-12 removed ");
    const problems = whyProblems(copy);
    expect(problems.length).toBeGreaterThan(0);
    for (const problem of problems)
      expect(problem).toMatch(/\(why: W-12\) has no "## W-12 ·" heading/);
  });
});

describe("T-45 drift: the one DoD §2 sentence and CHEAP_GATES agree", () => {
  const claude = read(ROOT, "CLAUDE.md");

  it("a gate removed from the cheap-gate sentence → red, naming it", () => {
    const edited = claude.replace("`typecheck`, `lint`, ", "`typecheck`, ");
    expect(edited).not.toBe(claude);
    expect(gateDrift(edited)).toEqual([
      "gates:cheap runs `lint`; CLAUDE.md's cheap-gate sentence does not name it",
    ]);
  });

  it("a gate added to the cheap-gate sentence → red, naming it", () => {
    const edited = claude.replace(
      "`check:no-db`, ",
      "`check:no-db`, `seed:check`, ",
    );
    expect(edited).not.toBe(claude);
    expect(gateDrift(edited)).toEqual([
      "CLAUDE.md names `seed:check`; gates:cheap does not run it",
    ]);
  });

  it("the sentence reworded so it no longer begins as it does → red, sentence not found", () => {
    const edited = claude.replace(
      CHEAP_SENTENCE_START,
      "Implementers run the cheap gates",
    );
    expect(edited).not.toBe(claude);
    expect(gateDrift(edited)).toEqual([
      `sentence not found: CLAUDE.md "Definition of done" item 2 has no sentence beginning "${CHEAP_SENTENCE_START}"`,
    ]);
  });

  it("a backticked name added only to the expensive-gates sentence → still green", () => {
    const edited = claude.replace(
      "`build`, `e2e`,",
      "`build`, `seo:validate`, `e2e`,",
    );
    expect(edited).not.toBe(claude);
    expect(gateDrift(edited)).toEqual([]);
  });
});
