/**
 * AC-21 / T-22 (TASK-011): the branch-protection contract.
 *
 * T-22 as the spec writes it is a `gh api` contract test, and it cannot pass today: the private
 * repository is on GitHub Free, where the branch-protection endpoint answers
 * 403 "Upgrade to GitHub Pro or make this repository public to enable this feature"
 * (docs/runbooks/branch-protection.md records the options). What *can* be pinned — and is, here —
 * is everything the verifier decides:
 *
 *  - the required-check list is derived from the workflows, so a job a later spec adds is part of
 *    the contract without anyone editing a list;
 *  - `lighthouse` is excluded for exactly as long as it is `continue-on-error: true`;
 *  - every AC-21 assertion fires on the payload that violates it, against fixture JSON in both
 *    shapes the GitHub API returns;
 *  - a 403 on the plan is reported differently from a 404 "not protected", because one is a
 *    purchase and the other is a command to run.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  applyCommands,
  BRANCH,
  checkContract,
  classifyProtectionResponse,
  OWNER,
  parseWorkflowJobs,
  PLAN_MESSAGE,
  protectedContexts,
  readWorkflows,
  REPO,
  REQUIRED_APPROVING_REVIEW_COUNT,
  verifyProtection,
  type Protection,
  type RepoSettings,
} from "../../scripts/branch-protection.ts";

const repoRoot = resolve(__dirname, "../..");
const contract = checkContract(readWorkflows(repoRoot));

/** A protection payload that satisfies every AC-21 assertion, for the given contexts. */
function goodProtection(contexts: readonly string[]): Protection {
  return {
    required_status_checks: { strict: false, contexts: [...contexts] },
    required_pull_request_reviews: {
      required_approving_review_count: REQUIRED_APPROVING_REVIEW_COUNT,
      require_code_owner_reviews: false,
    },
    required_linear_history: { enabled: true },
    allow_force_pushes: { enabled: false },
    allow_deletions: { enabled: false },
  };
}

const goodRepo: RepoSettings = {
  allow_squash_merge: true,
  allow_merge_commit: false,
  allow_rebase_merge: false,
  squash_merge_commit_title: "PR_TITLE",
};

describe("job-name derivation from the workflows", () => {
  it("prefers the job's `name:` over its key", () => {
    const jobs = parseWorkflowJobs(
      "jobs:\n  key-only: {}\n  keyed:\n    name: reported\n",
    );
    expect(jobs).toEqual([
      { key: "key-only", checkName: "key-only", informational: false },
      { key: "keyed", checkName: "reported", informational: false },
    ]);
  });

  it("marks a `continue-on-error: true` job informational", () => {
    const jobs = parseWorkflowJobs(
      "jobs:\n  hard:\n    continue-on-error: false\n  soft:\n    continue-on-error: true\n",
    );
    expect(jobs.find((job) => job.key === "soft")?.informational).toBe(true);
    expect(jobs.find((job) => job.key === "hard")?.informational).toBe(false);
  });

  it("rejects a workflow with no `jobs:` instead of reporting an empty contract", () => {
    // An empty required-check set would silently turn branch protection into no protection.
    expect(() => parseWorkflowJobs("name: ci\non: push\n")).toThrow();
  });

  it("is parsed as YAML, not grepped: a job named in a comment is not a check", () => {
    const jobs = parseWorkflowJobs(
      "# jobs:\n#   commented-out: {}\njobs:\n  real: {}\n",
    );
    expect(jobs.map((job) => job.checkName)).toEqual(["real"]);
  });
});

describe("the required-check contract on the committed workflows (AC-21)", () => {
  it("requires every ci.yml job and pr-policy", () => {
    expect(contract.required).toEqual([
      "a11y",
      "audit",
      "build",
      "commitlint",
      "db-check",
      "dev-os-check",
      "e2e",
      "env-build-failure",
      "lint",
      "pr-policy",
      "preview",
      "seo-validate",
      "test-contract",
      "test-integration",
      "test-unit",
      "typecheck",
      "visual",
    ]);
  });

  it("requires the pull-request-only checks too", () => {
    // They never run on a push to `main`, which is the point: a required check that no push can
    // satisfy is what makes the PR the only way in.
    for (const name of [
      "preview",
      "e2e",
      "visual",
      "a11y",
      "commitlint",
      "pr-policy",
    ]) {
      expect(contract.required).toContain(name);
    }
  });

  it("excludes `lighthouse`, and says why", () => {
    expect(contract.required).not.toContain("lighthouse");
    expect(contract.excluded.map((exclusion) => exclusion.name)).toEqual([
      "lighthouse",
    ]);
    expect(contract.excluded[0]?.reason).toContain("continue-on-error");
    expect(contract.excluded[0]?.reason).toContain("spec 004");
  });

  it("would require `lighthouse` the moment spec 004 removes continue-on-error", () => {
    const ci = readFileSync(
      resolve(repoRoot, ".github/workflows/ci.yml"),
      "utf8",
    );
    const lifted = checkContract([
      ci.replace(/\n    continue-on-error: true\n/, "\n"),
    ]);
    expect(lifted.required).toContain("lighthouse");
    expect(lifted.excluded).toEqual([]);
  });

  it("names every job of ci.yml exactly once", () => {
    const ci = readFileSync(
      resolve(repoRoot, ".github/workflows/ci.yml"),
      "utf8",
    );
    const jobs = parseWorkflowJobs(ci);
    const names = jobs.map((job) => job.checkName);
    expect(new Set(names).size).toBe(names.length);
    // Every job either required or excluded — no third category.
    for (const name of names) {
      const known =
        contract.required.includes(name) ||
        contract.excluded.some((exclusion) => exclusion.name === name);
      expect(known).toBe(true);
    }
  });
});

describe("verifyProtection (AC-21 assertions)", () => {
  it("passes on a compliant payload", () => {
    expect(
      verifyProtection(contract, goodProtection(contract.required), goodRepo),
    ).toEqual([]);
  });

  it("reads the `checks` array shape as well as `contexts`", () => {
    const protection: Protection = {
      ...goodProtection([]),
      required_status_checks: {
        checks: contract.required.map((context) => ({ context })),
      },
    };
    expect(protectedContexts(protection)).toEqual(contract.required);
    expect(verifyProtection(contract, protection, goodRepo)).toEqual([]);
  });

  it("fails when a job is not a required check", () => {
    const [failure] = verifyProtection(
      contract,
      goodProtection(contract.required.filter((name) => name !== "audit")),
      goodRepo,
    );
    expect(failure?.what).toContain("missing");
  });

  it("fails when no check is required at all", () => {
    const failures = verifyProtection(contract, goodProtection([]), goodRepo);
    expect(failures.some((failure) => failure.actual === "(none)")).toBe(true);
  });

  it("fails on a required check no workflow produces", () => {
    const failures = verifyProtection(
      contract,
      goodProtection([...contract.required, "ghost"]),
      goodRepo,
    );
    expect(failures.map((failure) => failure.what).join()).toContain(
      "not produced by any workflow",
    );
    expect(failures.some((failure) => failure.actual === "ghost")).toBe(true);
  });

  it("fails when linear history is off", () => {
    const failures = verifyProtection(
      contract,
      {
        ...goodProtection(contract.required),
        required_linear_history: { enabled: false },
      },
      goodRepo,
    );
    expect(failures.map((failure) => failure.what)).toContain(
      "required_linear_history",
    );
  });

  it("fails when force pushes are allowed", () => {
    const failures = verifyProtection(
      contract,
      {
        ...goodProtection(contract.required),
        allow_force_pushes: { enabled: true },
      },
      goodRepo,
    );
    expect(failures.map((failure) => failure.what)).toContain(
      "allow_force_pushes",
    );
  });

  it("treats an absent protection block as a failure, not a default", () => {
    const failures = verifyProtection(contract, {}, goodRepo);
    expect(failures.map((failure) => failure.what)).toContain(
      "required_linear_history",
    );
    expect(failures.map((failure) => failure.what)).toContain(
      "allow_force_pushes",
    );
  });

  it.each([
    ["allow_squash_merge", { allow_squash_merge: false }],
    ["allow_merge_commit", { allow_merge_commit: true }],
    ["allow_rebase_merge", { allow_rebase_merge: true }],
    [
      "squash_merge_commit_title",
      { squash_merge_commit_title: "COMMIT_OR_PR_TITLE" },
    ],
  ])("fails when %s is wrong", (key, override) => {
    const failures = verifyProtection(
      contract,
      goodProtection(contract.required),
      {
        ...goodRepo,
        ...override,
      },
    );
    expect(failures.map((failure) => failure.what)).toContain(
      `repository setting ${key}`,
    );
  });

  it("fails when a merge setting is absent rather than assuming a default", () => {
    const failures = verifyProtection(
      contract,
      goodProtection(contract.required),
      {},
    );
    expect(failures).toHaveLength(4);
    expect(failures.every((failure) => failure.actual === "(absent)")).toBe(
      true,
    );
  });

  it("holds the recorded review-count deviation and names it", () => {
    const failures = verifyProtection(
      contract,
      {
        ...goodProtection(contract.required),
        required_pull_request_reviews: { required_approving_review_count: 1 },
      },
      goodRepo,
    );
    const failure = failures.find((candidate) =>
      candidate.what.startsWith("required_approving_review_count"),
    );
    expect(REQUIRED_APPROVING_REVIEW_COUNT).toBe(0);
    expect(failure?.what).toContain("recorded deviation");
    expect(failure?.what).toContain("cannot approve their own PR");
  });

  it("fails when code-owner review is required, for the same reason", () => {
    const failures = verifyProtection(
      contract,
      {
        ...goodProtection(contract.required),
        required_pull_request_reviews: {
          required_approving_review_count: REQUIRED_APPROVING_REVIEW_COUNT,
          require_code_owner_reviews: true,
        },
      },
      goodRepo,
    );
    expect(failures.map((failure) => failure.what).join()).toContain(
      "require_code_owner_reviews",
    );
  });

  it("reports every problem in one run", () => {
    const failures = verifyProtection(contract, {}, {});
    expect(failures.length).toBeGreaterThanOrEqual(6);
  });
});

describe("classifying the GitHub response", () => {
  it("reads 403 Upgrade to GitHub Pro as unavailable on the plan", () => {
    expect(
      classifyProtectionResponse({
        ok: false,
        status: 1,
        body: "Upgrade to GitHub Pro or make this repository public to enable this feature.",
      }),
    ).toEqual({ kind: "unavailable-on-plan" });
  });

  it("reads 404 Branch not protected as available but unset", () => {
    expect(
      classifyProtectionResponse({
        ok: false,
        status: 1,
        body: "Branch not protected (HTTP 404)",
      }),
    ).toEqual({ kind: "unset" });
  });

  it("keeps anything else as an error with the detail", () => {
    const result = classifyProtectionResponse({
      ok: false,
      status: 1,
      body: "Bad credentials",
    });
    expect(result.kind).toBe("error");
  });

  it("reads a success as available", () => {
    expect(
      classifyProtectionResponse({ ok: true, status: 0, body: "{}" }),
    ).toEqual({
      kind: "available",
    });
  });

  it("offers the three options and rejects making the repo public", () => {
    expect(PLAN_MESSAGE).toContain("Upgrade the account to GitHub Pro");
    expect(PLAN_MESSAGE).toContain("rejected: §13 Q1 decided private");
    expect(PLAN_MESSAGE).toContain("recorded deviation");
    expect(PLAN_MESSAGE).toContain("docs/runbooks/branch-protection.md");
  });
});

describe("--print-commands", () => {
  const commands = applyCommands(contract);

  it("targets the repository and branch from Q1", () => {
    expect(OWNER).toBe("itsahmeds");
    expect(REPO).toBe("flowers-overseas");
    expect(BRANCH).toBe("main");
    expect(commands).toContain(
      `repos/${OWNER}/${REPO}/branches/${BRANCH}/protection`,
    );
  });

  it("lists the derived contexts, so the command cannot drift from ci.yml", () => {
    for (const name of contract.required)
      expect(commands).toContain(`"${name}"`);
    expect(commands).not.toContain('"lighthouse"');
  });

  it("sets linear history, no force pushes and the squash-only merge method", () => {
    expect(commands).toContain('"required_linear_history": true');
    expect(commands).toContain('"allow_force_pushes": false');
    expect(commands).toContain("--enable-squash-merge");
    expect(commands).toContain("--enable-merge-commit=false");
    expect(commands).toContain("--enable-rebase-merge=false");
    expect(commands).toContain("--squash-merge-commit-title=PR_TITLE");
  });

  it("produces a protection body that its own verifier accepts", () => {
    // The strongest assertion available without the endpoint: what `--print-commands` applies is
    // exactly what `--verify` demands.
    const body = JSON.parse(
      commands.slice(commands.indexOf("{"), commands.lastIndexOf("}") + 1),
    ) as {
      required_status_checks: { contexts: string[] };
      required_pull_request_reviews: {
        required_approving_review_count: number;
      };
      required_linear_history: boolean;
      allow_force_pushes: boolean;
    };
    const asApiWouldReport: Protection = {
      required_status_checks: {
        contexts: body.required_status_checks.contexts,
      },
      required_pull_request_reviews: body.required_pull_request_reviews,
      required_linear_history: { enabled: body.required_linear_history },
      allow_force_pushes: { enabled: body.allow_force_pushes },
    };
    expect(verifyProtection(contract, asApiWouldReport, goodRepo)).toEqual([]);
  });

  it("ends with the verify command", () => {
    expect(commands.trimEnd().endsWith("pnpm branch-protection --verify")).toBe(
      true,
    );
  });
});
