/**
 * T-20 (spec 001 AC-19, TASK-002): pr-policy rules as pure functions. The live GitHub
 * check is exercised by the TASK-002 PR itself (run URL recorded in the PR body).
 * T-49 (AC-47, TASK-153): the `no-task` allow-list, renames, and the workflow's file listing.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import {
  BRANCH_PATTERN,
  NO_TASK_ALLOWED,
  TITLE_PATTERN,
  evaluate,
  factsFromEnv,
  type PullRequestFacts,
} from "../../scripts/pr-policy";

const repoRoot = resolve(__dirname, "../..");

const base: PullRequestFacts = {
  title: "feat(core): scaffold (TASK-001)",
  headRef: "task/TASK-001-scaffold",
  authorLogin: "itsahmeds",
  authorType: "User",
  repositoryOwner: "itsahmeds",
  labels: [],
  changedFiles: ["README.md"],
};

describe("pr-policy patterns", () => {
  it("title regex is exactly the spec 001 §2 pattern", () => {
    expect(TITLE_PATTERN.source).toBe(
      String.raw`^(feat|fix|chore|docs|refactor|test|perf|ci|build|revert)(\([a-z0-9-]+\))?: .+ \(TASK-\d{3,}\)$`,
    );
  });

  it("branch regex is exactly the spec 001 §2 pattern", () => {
    expect(BRANCH_PATTERN.source).toBe(
      String.raw`^task\/TASK-\d{3,}-[a-z0-9-]+$`,
    );
  });

  it("the no-task allow-list is exactly §13 Q12's answer (AC-47)", () => {
    expect([...NO_TASK_ALLOWED]).toEqual([
      "docs/",
      "specs/",
      "plan/",
      ".claude/agents/",
      ".claude/skills/",
      ".claude/templates/",
      "CLAUDE.md",
      "README.md",
      "TASKS.md",
      "LICENSE",
    ]);
  });
});

describe("AC-19: title and branch checks", () => {
  it("fails a title without (TASK-NNN)", () => {
    const result = evaluate({ ...base, title: "feat(core): scaffold" });
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('PR title "feat(core): scaffold"');
  });

  it("passes the same title retitled with (TASK-001)", () => {
    const result = evaluate({
      ...base,
      title: "feat(core): scaffold (TASK-001)",
    });
    expect(result).toEqual({ ok: true, errors: [] });
  });

  it("fails branch feature/foo", () => {
    const result = evaluate({ ...base, headRef: "feature/foo" });
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Head branch "feature/foo"');
  });

  it("passes branch task/TASK-001-scaffold", () => {
    expect(evaluate({ ...base, headRef: "task/TASK-001-scaffold" }).ok).toBe(
      true,
    );
  });

  it("reports both problems at once", () => {
    const result = evaluate({
      ...base,
      title: "Update stuff",
      headRef: "main",
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(2);
  });

  it.each([
    "feat: add thing (TASK-012)",
    "fix(orders-service): x (TASK-1234)",
    "revert: revert x (TASK-003)",
  ])("accepts title %s", (title) => {
    expect(evaluate({ ...base, title }).ok).toBe(true);
  });

  it.each([
    "feat(Core): scaffold (TASK-001)",
    "wip: scaffold (TASK-001)",
    "feat(core): scaffold (TASK-01)",
    "feat(core): scaffold (TASK-001) ",
    "feat(core):scaffold (TASK-001)",
  ])("rejects title %s", (title) => {
    expect(evaluate({ ...base, title }).ok).toBe(false);
  });

  it.each([
    "task/TASK-001-Scaffold",
    "task/TASK-01-scaffold",
    "task/TASK-001",
    "tasks/TASK-001-scaffold",
  ])("rejects branch %s", (headRef) => {
    expect(evaluate({ ...base, headRef }).ok).toBe(false);
  });
});

describe("§13 Q5 exemptions", () => {
  it("exempts a dependency-bot author regardless of title and branch", () => {
    const result = evaluate({
      ...base,
      title: "chore(deps): update all non-major dependencies",
      headRef: "renovate/all-minor-patch",
      authorLogin: "renovate[bot]",
      authorType: "Bot",
      changedFiles: ["package.json", "pnpm-lock.yaml"],
    });
    expect(result.ok).toBe(true);
    expect(result.exemption).toContain("dependency bot");
  });

  it("exempts a Bot-typed author with an unknown login", () => {
    expect(
      evaluate({
        ...base,
        title: "bump",
        headRef: "dependabot/npm_and_yarn/next-16",
        authorLogin: "some-other-bot[bot]",
        authorType: "Bot",
      }).ok,
    ).toBe(true);
  });

  it("allows renovate/ and dependabot/ head branches for a human when the title carries a task", () => {
    expect(evaluate({ ...base, headRef: "renovate/pin-dependencies" }).ok).toBe(
      true,
    );
    expect(evaluate({ ...base, headRef: "dependabot/npm_and_yarn/x" }).ok).toBe(
      true,
    );
  });

  it("exempts a no-task PR by the repo owner touching only docs", () => {
    const result = evaluate({
      ...base,
      title: "docs: fix typo in README",
      headRef: "docs/readme-typo",
      labels: ["no-task"],
      changedFiles: ["README.md", "docs/runbooks/local-setup.md"],
    });
    expect(result.ok).toBe(true);
    expect(result.exemption).toContain("no-task");
  });

  it("does not honour no-task when a guarded path changes", () => {
    const result = evaluate({
      ...base,
      title: "docs: fix typo",
      headRef: "docs/typo",
      labels: ["no-task"],
      changedFiles: ["README.md", "src/lib/env.ts", "tests/unit/x.test.ts"],
    });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("src/lib/env.ts, tests/unit/x.test.ts");
    // title and branch errors are still reported so the author knows how to fix it
    expect(result.errors).toHaveLength(3);
  });

  it("does not honour no-task from a non-owner", () => {
    const result = evaluate({
      ...base,
      title: "docs: fix typo",
      headRef: "docs/typo",
      authorLogin: "someone-else",
      labels: ["no-task"],
    });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("repository owner");
  });

  it("a no-task label that is not entitled fails even when title and branch are compliant", () => {
    // the label claims an exemption it is not entitled to; remove it to pass
    const result = evaluate({
      ...base,
      labels: ["no-task"],
      changedFiles: ["src/lib/env.ts"],
    });
    expect(result.ok).toBe(false);
    // documented behaviour: the label claims an exemption it is not entitled to
    expect(result.errors).toHaveLength(1);
  });
});

describe("T-49: what a no-task PR may touch (AC-47)", () => {
  const noTask = (changedFiles: string[]) =>
    evaluate({
      ...base,
      title: "docs: framework text",
      headRef: "docs/framework-text",
      labels: ["no-task"],
      changedFiles,
    });

  it.each([
    "docs/design/wireframes/checkout.dc.html",
    "docs/advice/2026-09-28-x.md",
    "specs/041-x.md",
    "plan/09-roadmap.md",
    ".claude/agents/breaker.md",
    ".claude/skills/break/SKILL.md",
    ".claude/templates/work-order.md",
    "CLAUDE.md",
    "README.md",
    "TASKS.md",
    "LICENSE",
  ])("allows %s", (path) => {
    const result = noTask([path]);
    expect(result).toEqual({
      ok: true,
      exemption:
        'label "no-task" by repository owner, every path on the no-task allow-list',
      errors: [],
    });
  });

  it.each([
    "package.json",
    "pnpm-lock.yaml",
    "scripts/x.ts",
    "app/x.ts",
    ".github/workflows/ci.yml",
    "messages/en.json",
    "content/corridors/en/pl-guide.md",
    ".claude/hooks/task-guard.sh",
    ".claude/settings.json",
    "foo.config.ts",
    "src/lib/env.ts",
    ".claude/bin/task.sh",
    ".prettierignore",
    "docs",
    "CLAUDE.md.bak",
    "specsx/a.md",
  ])("refuses %s, naming it", (path) => {
    const result = noTask(["README.md", path]);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain(`this PR touches: ${path}. `);
  });

  it("a rename src/x.ts → docs/x.ts (both names listed) is refused, naming src/x.ts only", () => {
    const result = noTask(["docs/x.ts", "src/x.ts"]);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("this PR touches: src/x.ts. ");
    expect(result.errors[0]).not.toContain("docs/x.ts");
  });

  it("a rename docs/a.md → specs/a.md is allowed", () => {
    expect(noTask(["specs/a.md", "docs/a.md"]).ok).toBe(true);
  });

  it("names each refused path once", () => {
    const result = noTask(["src/x.ts", "src/x.ts", "package.json"]);
    expect(result.errors[0]).toContain(
      "this PR touches: src/x.ts, package.json. ",
    );
  });

  it("the workflow's file listing emits previous_filename as well as filename", () => {
    const workflow = parse(
      readFileSync(join(repoRoot, ".github/workflows/pr-policy.yml"), "utf8"),
    ) as {
      jobs: Record<string, { steps: { id?: string; run?: string }[] }>;
    };
    const steps = Object.values(workflow.jobs).flatMap((job) => job.steps);
    const listing = steps.find((step) => step.id === "files");
    const jq = /--jq\s+'([^']*)'/.exec(listing?.run ?? "")?.[1] ?? "";
    expect(jq).toContain(".filename");
    expect(jq).toContain(".previous_filename");
  });

  it("the CLI refuses a rename out of src/ exactly as the workflow feeds it", () => {
    const facts = factsFromEnv({
      PR_TITLE: "docs: move",
      PR_HEAD_REF: "docs/move",
      PR_AUTHOR_LOGIN: "itsahmeds",
      PR_AUTHOR_TYPE: "User",
      REPOSITORY_OWNER: "itsahmeds",
      PR_LABELS: "no-task",
      PR_CHANGED_FILES: "docs/x.ts\nsrc/x.ts\n",
    });
    expect(evaluate(facts).errors[0]).toContain("this PR touches: src/x.ts. ");
  });
});

describe("CLI", () => {
  it("reads facts from the workflow environment", () => {
    const facts = factsFromEnv({
      PR_TITLE: "feat(core): scaffold (TASK-001)",
      PR_HEAD_REF: "task/TASK-001-scaffold",
      PR_AUTHOR_LOGIN: "itsahmeds",
      PR_AUTHOR_TYPE: "User",
      REPOSITORY_OWNER: "itsahmeds",
      PR_LABELS: "no-task,dependencies",
      PR_CHANGED_FILES: "README.md\nsrc/a.ts\n",
    });
    expect(facts.labels).toEqual(["no-task", "dependencies"]);
    expect(facts.changedFiles).toEqual(["README.md", "src/a.ts"]);
  });

  const runCli = (env: Record<string, string>) => {
    try {
      const stdout = execFileSync(
        process.execPath,
        [join(repoRoot, "scripts/pr-policy.ts")],
        {
          env: { ...process.env, ...env },
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      return { status: 0, stdout, stderr: "" };
    } catch (error) {
      const f = error as { status?: number; stdout?: string; stderr?: string };
      return {
        status: f.status ?? -1,
        stdout: f.stdout ?? "",
        stderr: f.stderr ?? "",
      };
    }
  };

  it("exits 1 with ::error:: annotations on a bad title", () => {
    const r = runCli({
      PR_TITLE: "feat(core): scaffold",
      PR_HEAD_REF: "task/TASK-001-scaffold",
      PR_AUTHOR_LOGIN: "itsahmeds",
      PR_AUTHOR_TYPE: "User",
      REPOSITORY_OWNER: "itsahmeds",
      PR_LABELS: "",
      PR_CHANGED_FILES: "",
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/^::error::PR title/m);
  });

  it("exits 0 on a compliant PR", () => {
    const r = runCli({
      PR_TITLE: "feat(core): scaffold (TASK-001)",
      PR_HEAD_REF: "task/TASK-001-scaffold",
      PR_AUTHOR_LOGIN: "itsahmeds",
      PR_AUTHOR_TYPE: "User",
      REPOSITORY_OWNER: "itsahmeds",
      PR_LABELS: "",
      PR_CHANGED_FILES: "",
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/^pr-policy ok/);
  });
});
