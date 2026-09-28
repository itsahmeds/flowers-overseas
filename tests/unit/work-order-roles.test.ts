/**
 * T-50 (spec 001 AC-48, TASK-153): the roles the work order lets commit have a shell.
 *
 * `.claude/templates/work-order.md` "Rules of the road" names the writing roles that may commit and
 * push; a role without `Bash` in its agent file's `tools:` line cannot do either, which is how the
 * spec writer came to be told to commit with no shell (§13 Q14). This test reads both texts so
 * they cannot disagree again. Like `framework-text.test.ts` it reads under `FRAMEWORK_ROOT`
 * (default: this repository), so a breaker can delete a subject in a scratch copy and watch red.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(process.env.FRAMEWORK_ROOT ?? resolve(__dirname, "../.."));
const WORK_ORDER = ".claude/templates/work-order.md";

const read = (path: string): string => readFileSync(join(ROOT, path), "utf8");

/** Work-order role names → the agent files that play them. A finisher is an implementer agent. */
const ROLE_AGENTS: Readonly<Record<string, readonly string[]>> = {
  implementer: ["backend-implementer", "frontend-implementer"],
  finisher: ["backend-implementer", "frontend-implementer"],
  designer: ["designer"],
  "spec writer": ["spec-writer"],
};

/** The roles in "**Writing roles** (…) may, without asking: …", which lets them commit. */
function committingRoles(workOrder: string): string[] {
  const match =
    /\*\*Writing roles\*\* \(([^)]*)\) may, without asking:([\s\S]*?)\n\n/.exec(
      workOrder,
    );
  const [, roles = "", grant = ""] = match ?? [];
  if (match === null || !/·\s*commit\s*·/.test(grant)) return [];
  return roles.split(",").map((role) => role.trim());
}

function tools(agent: string): string[] {
  const path = `.claude/agents/${agent}.md`;
  if (!existsSync(join(ROOT, path))) return [];
  const line = /^tools:(.*)$/m.exec(read(path))?.[1] ?? "";
  return line.split(",").map((tool) => tool.trim());
}

/**
 * The work order's text addressed to the spec writer: its `## Role: spec writer` section first,
 * then every paragraph or list item elsewhere that names the spec writer, except the "No role
 * ever" prohibition list. A block ends at a blank line or where the next item or heading starts.
 */
function addressedToSpecWriter(workOrder: string): string[] {
  const roleStart = workOrder.indexOf("## Role: spec writer");
  const afterRole = workOrder.indexOf("\n## ", roleStart + 1);
  const role =
    roleStart === -1
      ? ""
      : workOrder.slice(
          roleStart,
          afterRole === -1 ? workOrder.length : afterRole,
        );
  const rest =
    roleStart === -1
      ? workOrder
      : workOrder.slice(0, roleStart) +
        (afterRole === -1 ? "" : workOrder.slice(afterRole));
  const blocks: string[] = [];
  let block: string[] = [];
  const flush = () => {
    if (block.length > 0) blocks.push(block.join("\n"));
    block = [];
  };
  for (const line of rest.split("\n")) {
    if (line.trim() === "") flush();
    else if (/^(- |\d+\. |#)/.test(line)) {
      flush();
      block.push(line);
    } else block.push(line);
  }
  flush();
  return [
    role,
    ...blocks.filter(
      (b) => /spec writer/i.test(b) && !b.startsWith("**No role ever:**"),
    ),
  ];
}

describe("T-50: who may commit ↔ who has a shell (AC-48)", () => {
  const workOrder = read(WORK_ORDER);
  const roles = committingRoles(workOrder);

  it("the work order grants commit to a named set of writing roles", () => {
    expect(roles).toEqual(["implementer", "finisher", "designer"]);
  });

  it.each(["implementer", "finisher", "designer"])(
    "every agent playing %s has Bash in tools:",
    (role) => {
      expect(roles).toContain(role);
      const agents = ROLE_AGENTS[role] ?? [];
      expect(
        agents.length,
        `no agent file mapped for role "${role}"`,
      ).toBeGreaterThan(0);
      for (const agent of agents) expect(tools(agent), agent).toContain("Bash");
    },
  );

  it("every committing role maps to an agent file", () => {
    for (const role of roles) {
      expect(
        ROLE_AGENTS[role],
        `role "${role}" has no agent mapping`,
      ).toBeDefined();
    }
  });

  it("the spec writer is not a committing role and has no Bash", () => {
    expect(roles).not.toContain("spec writer");
    const specWriter = tools("spec-writer");
    expect(specWriter.length).toBeGreaterThan(0);
    expect(specWriter).not.toContain("Bash");
  });

  it("nothing tells the spec writer to commit, push or run git/gh", () => {
    // What is addressed to the spec writer: its role section, and every paragraph or list item
    // of the work order that names it (the rules paragraph, the time-limit bullet, …). In those,
    // only two statements may mention committing or pushing: the orchestrator doing it, and the
    // spec writer doing none of it. Any other `commit`, `push`, `git …` or `gh …` there is an
    // instruction to a role with no shell and contradicts §13 Q14. The "No role ever" list names
    // `gh workflow run` and pushing as prohibitions for every role, so it is not addressed to it.
    const allowed = [
      "the orchestrator commits the file, pushes it and runs `pnpm specs:index`",
      "The orchestrator commits that file, pushes it and runs `pnpm specs:index` for it",
      "you commit, push and index nothing",
      "the orchestrator commits it",
    ];
    const forbidden = /\b(commit|push)|(^|[\s`(])(git|gh)\s/i;
    const texts = addressedToSpecWriter(workOrder);
    const role = texts[0] ?? "";
    expect(role).toMatch(/^## Role: spec writer/);
    // The paragraph and the time-limit bullet are among what is read, not only the role section.
    expect(
      texts.some((t) => t.startsWith("**The spec writer** has no shell")),
    ).toBe(true);
    expect(texts.some((t) => t.startsWith("- **spec writer:**"))).toBe(true);
    for (const text of texts) {
      let rest = text.replace(/\s+/g, " ");
      for (const phrase of allowed) rest = rest.split(phrase).join("");
      expect(rest, text).not.toMatch(forbidden);
    }
  });

  it("the work order says the orchestrator commits, pushes and indexes for the spec writer", () => {
    const role = workOrder.slice(workOrder.indexOf("## Role: spec writer"));
    const section = role.slice(0, role.indexOf("\n## ", 1));
    expect(section).toMatch(
      /the orchestrator commits the file, pushes it and runs `pnpm specs:index`/,
    );
    expect(workOrder).toMatch(
      /\*\*The spec writer\*\* has no shell[\s\S]{0,120}?orchestrator\s+commits that file, pushes it and runs `pnpm specs:index`/,
    );
  });
});
