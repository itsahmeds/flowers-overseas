/**
 * AC-36 / T-37 (TASK-086): the agent definitions send an agent to the map and the brief first.
 *
 * The three orientation artefacts only save anything if the definitions actually name them: an
 * implementer that still reads "the task row in `TASKS.md` and the spec it links" loads 344 KB and
 * 99 KB before its first useful action. This test is the guard on the instruction itself — the
 * files are prose, so the assertions are on the paths and the phrases the spec names, not on
 * wording.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { MAP_PATH } from "../../scripts/codebase-map.ts";
import { BRIEF_DIR } from "../../scripts/tasks-brief.ts";
import { INDEX_HEADING } from "../../scripts/specs-index.ts";

const repoRoot = resolve(__dirname, "../..");
const read = (path: string): string =>
  readFileSync(join(repoRoot, path), "utf8");

const AGENTS = [
  ".claude/agents/backend-implementer.md",
  ".claude/agents/frontend-implementer.md",
  ".claude/agents/reviewer.md",
] as const;

const SKILLS = [
  ".claude/skills/implement/SKILL.md",
  ".claude/skills/review/SKILL.md",
] as const;

describe("the agent definitions (AC-36)", () => {
  it.each(AGENTS)("%s names the codebase map", (path) => {
    expect(read(path)).toContain(MAP_PATH);
  });

  it.each(AGENTS)("%s names the task brief path", (path) => {
    expect(read(path)).toContain(`${BRIEF_DIR}/TASK-NNN.md`);
  });

  it.each(AGENTS)("%s names the spec index and scopes the reading", (path) => {
    const text = read(path);
    expect(text).toContain(INDEX_HEADING);
    expect(text).toMatch(/only the sections/i);
  });

  it.each(AGENTS)("%s still starts at CLAUDE.md", (path) => {
    expect(read(path)).toContain("`CLAUDE.md`");
  });

  it("scopes a round-2 review to the diff and to the suites it touches", () => {
    const reviewer = read(".claude/agents/reviewer.md");
    expect(reviewer).toMatch(/Round 2/i);
    expect(reviewer).toMatch(/only the suites the diff touches/i);
  });
});

describe("the skills (AC-36)", () => {
  it.each(SKILLS)("%s passes the brief path to the agent", (path) => {
    const text = read(path);
    expect(text).toContain(`${BRIEF_DIR}/TASK-NNN.md`);
    expect(text).toContain(MAP_PATH);
  });

  it("`/implement` scaffolds a missing brief instead of pasting prose into the row", () => {
    const skill = read(".claude/skills/implement/SKILL.md");
    expect(skill).toContain("pnpm tasks:brief TASK-NNN");
    expect(skill).toMatch(/400 characters/);
  });

  it("`/review` records required changes in the brief's carry-forwards", () => {
    expect(read(".claude/skills/review/SKILL.md")).toContain(
      "## Carry-forwards",
    );
  });
});

describe("CLAUDE.md (AC-36)", () => {
  const claude = read("CLAUDE.md");

  it("lists the map and the briefs under “Where state lives”", () => {
    const table = claude.slice(
      claude.indexOf("## Where state lives"),
      claude.indexOf("## Agents"),
    );
    expect(table).toContain(MAP_PATH);
    expect(table).toContain(`${BRIEF_DIR}/TASK-NNN.md`);
    expect(table).toContain(INDEX_HEADING);
  });

  it("points “How to start a session” at the map", () => {
    const section = claude.slice(claude.indexOf("## How to start a session"));
    expect(section).toContain(MAP_PATH);
    expect(section).toContain(`${BRIEF_DIR}/TASK-NNN.md`);
  });
});

describe("the templates the convention rests on", () => {
  it("the brief template carries the five fixed headings", () => {
    const template = read(`${BRIEF_DIR}/_template.md`);
    for (const heading of [
      "## Binding",
      "## Read",
      "## Carry-forwards",
      "## Escalations",
      "## Result",
    ]) {
      expect(template, heading).toContain(heading);
    }
  });

  it("the spec template carries the index block", () => {
    expect(read("specs/_template.md")).toContain(INDEX_HEADING);
  });
});
