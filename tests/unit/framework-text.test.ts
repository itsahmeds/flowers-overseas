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

// ---------------------------------------------------------------------------------------------
// T-41 (spec 040 AC-41, AC-37; TASK-157): the launch texts say what the process is under §14 A3.
// Production deploys from `release`, which only the orchestrator's `pnpm release:promote` moves;
// `main` deploys to staging.

const LAUNCH_AGENT = ".claude/agents/launch.md";
const LAUNCH_SKILL = ".claude/skills/launch/SKILL.md";
const PREVIEW_CHAIN = ["preview", "e2e", "visual", "a11y"] as const;

/** Reads `path` under `root`, or "" when it is missing (the check then reports what it lacks). */
const readIfAny = (root: string, path: string): string =>
  existsSync(join(root, path)) ? read(root, path) : "";

/** `**bold**` markers removed, so a phrase check does not depend on emphasis. */
const plain = (text: string): string => text.replace(/\*\*/g, "");

/** `text` as sentences: wrapped lines joined, split after a full stop or at a blank line. */
function sentences(text: string): string[] {
  return plain(text)
    .replace(/\n(?!\n)/g, " ")
    .split(/(?<=\.)\s+|\n\n/);
}

/** AC-37 / AC-41: gate 1 names the SHA and reads the run job by job. */
function gate1Problems(root: string): string[] {
  const gates = section(readIfAny(root, LAUNCH_AGENT), "Pre-deploy gates");
  const gate1 = numbered(gates, 1);
  if (gate1 === "")
    return [`${LAUNCH_AGENT}: "Pre-deploy gates" has no gate 1`];
  const said = sentences(gate1);
  const problems: string[] = [];
  if (!gate1.includes("`head_sha`"))
    problems.push(
      `${LAUNCH_AGENT} gate 1: does not match the run on its \`head_sha\``,
    );
  if (!gate1.includes("gh run view <id> --json jobs"))
    problems.push(
      `${LAUNCH_AGENT} gate 1: does not read the run's jobs (\`gh run view <id> --json jobs\`)`,
    );
  if (!plain(gate1).includes("job by job"))
    problems.push(
      `${LAUNCH_AGENT} gate 1: does not say green is read job by job`,
    );
  const skippedFour = said.some(
    (s) =>
      PREVIEW_CHAIN.every((job) => s.includes(`\`${job}\``)) &&
      s.includes("`skipped`"),
  );
  if (!skippedFour)
    problems.push(
      `${LAUNCH_AGENT} gate 1: no sentence names \`preview\`, \`e2e\`, \`visual\` and \`a11y\` as \`skipped\``,
    );
  const lighthouse = said.some((s) =>
    /`lighthouse`[^.]*must conclude `success`/.test(s),
  );
  if (!lighthouse)
    problems.push(
      `${LAUNCH_AGENT} gate 1: does not say \`lighthouse\` must conclude \`success\``,
    );
  if (!gate1.includes("RELEASE: HALTED <sha>: gate 1 (<job> <conclusion>)"))
    problems.push(
      `${LAUNCH_AGENT} gate 1: does not name its halt, \`RELEASE: HALTED <sha>: gate 1 (<job> <conclusion>)\``,
    );
  return problems;
}

/** AC-37 / AC-41: gates 4–6 run against staging at the named SHA, not a preview. */
function stagingGatesProblems(root: string): string[] {
  const gates = section(readIfAny(root, LAUNCH_AGENT), "Pre-deploy gates");
  const problems: string[] = [];
  for (const n of [4, 5, 6]) {
    const gate = plain(numbered(gates, n)).replace(/\s+/g, " ");
    if (!gate.includes("staging at the named SHA"))
      problems.push(
        `${LAUNCH_AGENT} gate ${String(n)}: does not run against staging at the named SHA`,
      );
    if (/\bpreview\b/i.test(gate))
      problems.push(`${LAUNCH_AGENT} gate ${String(n)}: still names a preview`);
  }
  return problems;
}

/** AC-41: staging's result is `RELEASE: VERIFIED | HALTED`, in all three texts. */
function stagingResultProblems(root: string): string[] {
  const texts: [string, string][] = [
    [LAUNCH_AGENT, readIfAny(root, LAUNCH_AGENT)],
    [LAUNCH_SKILL, readIfAny(root, LAUNCH_SKILL)],
    [
      `${WORK_ORDER} Role: launch`,
      section(readIfAny(root, WORK_ORDER), "Role: launch"),
    ],
  ];
  const problems: string[] = [];
  for (const [name, text] of texts) {
    if (!text.includes("`RELEASE: VERIFIED | HALTED`"))
      problems.push(
        `${name}: staging's result is not \`RELEASE: VERIFIED | HALTED\``,
      );
    if (text.includes("PROMOTED | HALTED"))
      problems.push(`${name}: still reports \`PROMOTED | HALTED\``);
  }
  return problems;
}

/** AC-37 / AC-41: promotion is `release:promote` on the READY SHA; a merge deploys only staging. */
function promotionProblems(root: string): string[] {
  const agent = readIfAny(root, LAUNCH_AGENT);
  const flat = plain(agent).replace(/\s+/g, " ");
  const promotion = plain(section(agent, "Promotion")).replace(/\s+/g, " ");
  const output = plain(section(agent, "Output contract")).replace(/\s+/g, " ");
  const problems: string[] = [];
  if (
    !promotion.includes("`pnpm release:promote --sha <sha> --expect <old-sha>`")
  )
    problems.push(
      `${LAUNCH_AGENT} "Promotion": does not name \`pnpm release:promote\``,
    );
  if (
    /merge to `main`[^.]*deploys to Railway|promotion is the orchestrator's merge/.test(
      flat,
    )
  )
    problems.push(
      `${LAUNCH_AGENT}: still says a merge to \`main\` deploys production`,
    );
  if (!promotion.includes("A merge to `main` deploys only to staging"))
    problems.push(
      `${LAUNCH_AGENT} "Promotion": does not say a merge to \`main\` deploys only to staging`,
    );
  if (!agent.includes("`RELEASE: READY <40-char sha> (release at <old-sha>)`"))
    problems.push(
      `${LAUNCH_AGENT}: READY does not name its SHA and the release it moves from`,
    );
  if (
    !flat.includes(
      "read at the start of visit 1 and again at the end; a difference halts",
    )
  )
    problems.push(
      `${LAUNCH_AGENT}: does not re-read staging's commit at the end of visit 1`,
    );
  if (!output.includes("written on every outcome, `HALTED` included"))
    problems.push(
      `${LAUNCH_AGENT} "Output contract": the release note is not written on every outcome`,
    );
  return problems;
}

/** AC-41: SKILL step 4 runs `release:promote` with the READY SHA; the note is committed after every visit. */
function skillPromoteProblems(root: string): string[] {
  const skill = readIfAny(root, LAUNCH_SKILL);
  const flat = plain(skill).replace(/\s+/g, " ");
  const step4 = plain(numbered(section(skill, "Steps"), 4)).replace(
    /\s+/g,
    " ",
  );
  const problems: string[] = [];
  if (!step4.includes("`pnpm release:promote --sha <sha> --expect <old-sha>`"))
    problems.push(
      `${LAUNCH_SKILL} step 4: does not run \`pnpm release:promote --sha <sha> --expect <old-sha>\``,
    );
  if (!step4.includes("with exactly the SHAs of the READY line"))
    problems.push(`${LAUNCH_SKILL} step 4: does not take the SHA from READY`);
  if (/--match-head-commit|\(the promotion\)/.test(step4))
    problems.push(`${LAUNCH_SKILL} step 4: still promotes by merging`);
  if (
    !flat.includes(
      "commits the release note (and the audit report) after every visit, `HALTED` included",
    )
  )
    problems.push(
      `${LAUNCH_SKILL}: does not commit the release note after every visit, \`HALTED\` included`,
    );
  return problems;
}

/** AC-41: the launch agent may redeploy the previous image but never moves `release`. */
function neverMovesReleaseProblems(root: string): string[] {
  const role = plain(
    section(readIfAny(root, WORK_ORDER), "Role: launch"),
  ).replace(/\s+/g, " ");
  const agent = plain(readIfAny(root, LAUNCH_AGENT)).replace(/\s+/g, " ");
  const where = `${WORK_ORDER} Role: launch`;
  const problems: string[] = [];
  if (role.includes("promote to the target"))
    problems.push(`${where}: still says the agent may promote to the target`);
  if (
    !role.includes("the promotion is the orchestrator's `pnpm release:promote`")
  )
    problems.push(
      `${where}: does not say the promotion is the orchestrator's \`pnpm release:promote\``,
    );
  if (!role.includes("roll production back by redeploying the previous image"))
    problems.push(
      `${where}: does not let the agent roll back by redeploying the previous image`,
    );
  if (!/never moves `release`/i.test(role))
    problems.push(
      `${where}: does not say the launch agent never moves \`release\``,
    );
  if (!/never move `release`/i.test(agent))
    problems.push(
      `${LAUNCH_AGENT}: does not say the launch agent never moves \`release\``,
    );
  return problems;
}

/** AC-37: the orchestrator holds merges and pushes to `main` from dispatch until visit 1 reports. */
function holdMainProblems(root: string): string[] {
  const skill = plain(readIfAny(root, LAUNCH_SKILL)).replace(/\s+/g, " ");
  return skill.includes(
    "holds every merge and push to `main` from dispatch until visit 1 reports",
  )
    ? []
    : [
        `${LAUNCH_SKILL}: the orchestrator does not hold merges to \`main\` from dispatch until visit 1 reports`,
      ];
}

const CHECKS = {
  "1 · skills that dispatch point at the work order": skillPointerProblems,
  "2 · the brief template has ## Progress above ## Result": templateProblems,
  "3 · DoD §4 and Merging name /break, HOLDS and the reviewer": breakerProblems,
  "4 · the Agents table matches the agent and skill files": agentTableProblems,
  "5 · every (why: W-n) resolves": whyProblems,
  "AC-43 · DoD §2 names gates:cheap and its gates match the script":
    gatesLineProblems,
  "T-41 · gate 1 reads the run job by job, four skipped and lighthouse success":
    gate1Problems,
  "T-41 · gates 4–6 run against staging at the named SHA": stagingGatesProblems,
  "T-41 · staging reports RELEASE: VERIFIED | HALTED": stagingResultProblems,
  "T-41 · promotion is release:promote on the READY SHA, the note on every outcome":
    promotionProblems,
  "T-41 · /launch step 4 runs release:promote, the note committed after every visit":
    skillPromoteProblems,
  "T-41 · the launch agent may redeploy the previous image, never moves release":
    neverMovesReleaseProblems,
  "T-41 · the orchestrator holds main from dispatch until visit 1 reports":
    holdMainProblems,
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

describe("T-41: each launch-text case goes red when one sentence is reverted in a scratch copy (spec 040 AC-41, W-13)", () => {
  const WHERE = `${WORK_ORDER} Role: launch`;

  it("gate 1 · the `lighthouse` sentence deleted → red", () => {
    const copy = scratchCopy();
    mutate(
      copy,
      LAUNCH_AGENT,
      "`lighthouse` is not one of them and must conclude `success`: it is `needs: build` with no `if:`, so it runs on the push, and every release carries its budgets. ",
    );
    expect(gate1Problems(copy)).toEqual([
      `${LAUNCH_AGENT} gate 1: does not say \`lighthouse\` must conclude \`success\``,
    ]);
  });

  it("gate 1 · the four skipped jobs reverted to 'every job success' → red", () => {
    const copy = scratchCopy();
    mutate(
      copy,
      LAUNCH_AGENT,
      "Every job must conclude `success`, except the four `preview`-chain jobs `preview`, `e2e`, `visual` and `a11y`, which must conclude `skipped`, because a push to `main` has no PR environment.",
      "Every job must conclude `success`.",
    );
    expect(gate1Problems(copy)).toEqual([
      `${LAUNCH_AGENT} gate 1: no sentence names \`preview\`, \`e2e\`, \`visual\` and \`a11y\` as \`skipped\``,
    ]);
  });

  it("gate 1 · the jobs read reverted to the run list → red", () => {
    const copy = scratchCopy();
    mutate(
      copy,
      LAUNCH_AGENT,
      "Then read that run's jobs with `gh run view <id> --json jobs`:",
      "Then read that run with `gh run list`:",
    );
    expect(gate1Problems(copy)).toEqual([
      `${LAUNCH_AGENT} gate 1: does not read the run's jobs (\`gh run view <id> --json jobs\`)`,
    ]);
  });

  it("gate 1 · the run found by `head_sha` reverted to `main` CI green → red", () => {
    const copy = scratchCopy();
    mutate(
      copy,
      LAUNCH_AGENT,
      /Find the push run of the `ci` workflow whose `head_sha` is the SHA: [^\n]*?\.(?= `gh run list` on)/,
      "`main` CI green (`gh run list`).",
    );
    expect(gate1Problems(copy)).toEqual([
      `${LAUNCH_AGENT} gate 1: does not match the run on its \`head_sha\``,
    ]);
  });

  it("gates 4–6 · gate 5 reverted to the preview → red, naming gate 5", () => {
    const copy = scratchCopy();
    mutate(
      copy,
      LAUNCH_AGENT,
      "`seo-auditor` run against staging at the named SHA:",
      "`seo-auditor` run on the preview:",
    );
    expect(stagingGatesProblems(copy)).toEqual([
      `${LAUNCH_AGENT} gate 5: does not run against staging at the named SHA`,
      `${LAUNCH_AGENT} gate 5: still names a preview`,
    ]);
  });

  it("staging · the work order's VERIFIED reverted to PROMOTED → red", () => {
    const copy = scratchCopy();
    mutate(
      copy,
      WORK_ORDER,
      "`RELEASE: VERIFIED | HALTED`",
      "`RELEASE: PROMOTED | HALTED`",
    );
    expect(stagingResultProblems(copy)).toEqual([
      `${WHERE}: staging's result is not \`RELEASE: VERIFIED | HALTED\``,
      `${WHERE}: still reports \`PROMOTED | HALTED\``,
    ]);
  });

  it("promotion · 'a merge deploys only to staging' reverted to the merge promotion → red", () => {
    const copy = scratchCopy();
    mutate(
      copy,
      LAUNCH_AGENT,
      "A merge to `main` deploys only to staging.",
      "The promotion is the orchestrator's merge to `main`, which deploys to Railway.",
    );
    expect(promotionProblems(copy)).toEqual([
      `${LAUNCH_AGENT}: still says a merge to \`main\` deploys production`,
      `${LAUNCH_AGENT} "Promotion": does not say a merge to \`main\` deploys only to staging`,
    ]);
  });

  it("promotion · READY reverted to the bare `READY | HALTED` → red", () => {
    const copy = scratchCopy();
    mutate(
      copy,
      LAUNCH_AGENT,
      /`RELEASE: READY <40-char sha> \(release at <old-sha>\)`/g,
      "`RELEASE: READY | HALTED`",
    );
    expect(promotionProblems(copy)).toEqual([
      `${LAUNCH_AGENT}: READY does not name its SHA and the release it moves from`,
    ]);
  });

  it("promotion · the end-of-visit re-read of staging deleted → red", () => {
    const copy = scratchCopy();
    mutate(
      copy,
      LAUNCH_AGENT,
      "It is read at the start of visit 1 and again at the end; a difference halts (`RELEASE: HALTED <sha>: staging moved to <other-sha>`). ",
    );
    expect(promotionProblems(copy)).toEqual([
      `${LAUNCH_AGENT}: does not re-read staging's commit at the end of visit 1`,
    ]);
  });

  it("promotion · 'on every outcome' deleted from the output contract → red", () => {
    const copy = scratchCopy();
    mutate(
      copy,
      LAUNCH_AGENT,
      "is written on every outcome, `HALTED` included, with",
      "is written with",
    );
    expect(promotionProblems(copy)).toEqual([
      `${LAUNCH_AGENT} "Output contract": the release note is not written on every outcome`,
    ]);
  });

  it("/launch · step 4 reverted to the merge → red", () => {
    const copy = scratchCopy();
    mutate(
      copy,
      LAUNCH_SKILL,
      /^4\. [\s\S]*$/m,
      "4. **Production only**, on `RELEASE: READY`: merge with `--match-head-commit` (the promotion), then dispatch `launch` again with the **watch** visit. Relay `PROMOTED | ROLLED BACK`, and commit the release note and the audit report.\n",
    );
    expect(skillPromoteProblems(copy)).toEqual([
      `${LAUNCH_SKILL} step 4: does not run \`pnpm release:promote --sha <sha> --expect <old-sha>\``,
      `${LAUNCH_SKILL} step 4: does not take the SHA from READY`,
      `${LAUNCH_SKILL} step 4: still promotes by merging`,
    ]);
  });

  it("/launch · the commit after every visit deleted → red", () => {
    const copy = scratchCopy();
    mutate(
      copy,
      LAUNCH_SKILL,
      "The orchestrator commits the release note (and the audit report) after **every** visit, `HALTED` included. ",
    );
    expect(skillPromoteProblems(copy)).toEqual([
      `${LAUNCH_SKILL}: does not commit the release note after every visit, \`HALTED\` included`,
    ]);
  });

  it("work order · the May bullet reverted to 'promote to the target' → red", () => {
    const copy = scratchCopy();
    mutate(
      copy,
      WORK_ORDER,
      /^- \*\*May\*\*[\s\S]*?halt instead\.$/m,
      "- **May**, and only as `.claude/agents/launch.md` sets out, gate by gate: promote to the target,\n  and roll back on a failed post-deploy check. Never skip or reorder a gate; halt instead.",
    );
    expect(neverMovesReleaseProblems(copy)).toEqual([
      `${WHERE}: still says the agent may promote to the target`,
      `${WHERE}: does not let the agent roll back by redeploying the previous image`,
      `${WHERE}: does not say the launch agent never moves \`release\``,
    ]);
  });

  it("launch.md · 'you never move `release`' deleted → red", () => {
    const copy = scratchCopy();
    mutate(
      copy,
      LAUNCH_AGENT,
      /You never move `release`: [^\n]*?\(spec 040 AC-40\)\./,
    );
    expect(neverMovesReleaseProblems(copy)).toEqual([
      `${LAUNCH_AGENT}: does not say the launch agent never moves \`release\``,
    ]);
  });

  it("/launch · the hold on `main` deleted → red", () => {
    const copy = scratchCopy();
    mutate(
      copy,
      LAUNCH_SKILL,
      "The orchestrator holds every merge and push to `main` from dispatch until visit 1 reports, docs commits included: any new commit would redeploy staging under the gates. ",
    );
    expect(holdMainProblems(copy)).toEqual([
      `${LAUNCH_SKILL}: the orchestrator does not hold merges to \`main\` from dispatch until visit 1 reports`,
    ]);
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
