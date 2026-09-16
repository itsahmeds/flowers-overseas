/**
 * T-20 (spec 001 AC-19, TASK-002): pr-policy rules as pure functions. The live GitHub
 * check is exercised by the TASK-002 PR itself (run URL recorded in the PR body).
 */
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  BRANCH_PATTERN,
  GUARDED_PATHS,
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

  it("guarded paths are the §13 Q5 set", () => {
    expect([...GUARDED_PATHS]).toEqual([
      "src/",
      "tests/",
      "db/",
      "seed/",
      "emails/",
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
