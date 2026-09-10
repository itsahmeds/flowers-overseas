/**
 * AC-21 and spec 001 §11 (TASK-011): the shape of `ci.yml` itself.
 *
 * AC-21 says `ci.yml` "exposes exactly the job names listed in §2" and §11 says "every job writes
 * a GitHub step summary". Both are properties of the workflow file, so both are asserted here
 * rather than discovered on a pull request. Parsed as YAML, never grepped: a job name in a comment
 * is not a job, and this file is the reason the comment block at the top of `ci.yml` cannot drift
 * from the jobs below it.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import { GITLEAKS_VERSION } from "../../scripts/audit-secrets.ts";

const repoRoot = resolve(__dirname, "../..");
const read = (relative: string): string =>
  readFileSync(resolve(repoRoot, relative), "utf8");

interface Step {
  name?: string;
  uses?: string;
  run?: string;
  if?: string;
  with?: Record<string, string>;
}

interface Job {
  name?: string;
  needs?: string | string[];
  if?: string;
  "runs-on"?: string;
  "timeout-minutes"?: number;
  "continue-on-error"?: boolean;
  permissions?: Record<string, string>;
  steps: Step[];
}

interface Workflow {
  name: string;
  permissions?: Record<string, string>;
  defaults?: { run?: { shell?: string } };
  jobs: Record<string, Job>;
}

const ci = parse(read(".github/workflows/ci.yml")) as Workflow;
const jobs = Object.entries(ci.jobs);

/** The job set of spec 001 §2 "CI", by the name each job reports as a status check. */
const EXPECTED_JOBS = [
  "lint",
  "typecheck",
  "test-unit",
  "test-integration",
  "test-contract",
  "db-check",
  "audit",
  "build",
  "env-build-failure",
  "commitlint",
  "seo-validate",
  "i18n-check",
  // spec 005 AC-5 (TASK-062): the catalogue and price gate, on the same `needs: typecheck`
  // fan-out as `i18n-check` for the same reason (spec 001 §14 A9).
  "catalogue-check",
  // spec 006 AC-10, AC-30 (TASK-075): the seed-dataset gate, on the same fan-out for the same
  // reason — it reads `seed/data/**` and writes the §11 catalogue-health report.
  "seed-check",
  "dev-os-check",
  "preview",
  "e2e",
  "visual",
  "a11y",
  "lighthouse",
] as const;

describe("ci.yml job set (AC-21)", () => {
  it("has exactly the jobs spec 001 §2 lists", () => {
    expect(jobs.map(([key]) => key)).toEqual([...EXPECTED_JOBS]);
  });

  it("gives every job a `name:` matching its key, so a check name never surprises anybody", () => {
    // `scripts/branch-protection.ts` falls back to the key when `name:` is absent; keeping them
    // identical means the branch-protection contexts read the same as the file.
    for (const [key, job] of jobs) {
      expect(job.name, `job ${key}`).toBe(key);
    }
  });

  it("names every job in the header comment", () => {
    const header = read(".github/workflows/ci.yml").split("name: ci")[0] ?? "";
    for (const key of EXPECTED_JOBS) expect(header).toContain(key);
    expect(header).toContain(`Jobs (${String(EXPECTED_JOBS.length)})`);
  });

  it("bounds every job with a timeout", () => {
    for (const [key, job] of jobs) {
      expect(job["timeout-minutes"], `job ${key}`).toBeGreaterThan(0);
    }
  });

  it("keeps `permissions` minimal: read-only at the workflow level", () => {
    expect(ci.permissions).toEqual({ contents: "read" });
    for (const [key, job] of jobs) {
      for (const [scope, level] of Object.entries(job.permissions ?? {})) {
        // `deployments: read` in `preview` is the only elevation, and it is still read.
        expect(level, `job ${key} scope ${scope}`).toBe("read");
      }
    }
  });

  it("runs every step under `bash -eo pipefail`", () => {
    // Several summary steps pipe into `tee`; without `pipefail` a failing gate would report the
    // exit status of `tee` and show green.
    expect(ci.defaults?.run?.shell).toBe("bash");
  });

  it("marks only `lighthouse` continue-on-error (spec 001 §13 Q4)", () => {
    const informational = jobs
      .filter(([, job]) => job["continue-on-error"] === true)
      .map(([key]) => key);
    expect(informational).toEqual(["lighthouse"]);
  });
});

describe("every job writes a step summary (spec 001 §11)", () => {
  /**
   * A job satisfies §11 when one of its steps writes to `$GITHUB_STEP_SUMMARY`, or runs a script
   * that does. `pnpm dev-os:check` writes its own table (`scripts/dev-os-check.ts`) and
   * `pnpm audit:secrets` appends its findings section (`scripts/audit-secrets.ts`), so both count.
   */
  const WRITES_ITS_OWN_SUMMARY = ["pnpm dev-os:check", "pnpm audit:secrets"];

  it.each(jobs.map(([key]) => key))("%s", (key) => {
    const job = ci.jobs[key];
    const scripts = (job?.steps ?? []).map((step) => step.run ?? "");
    const writes = scripts.some(
      (script) =>
        script.includes("GITHUB_STEP_SUMMARY") ||
        WRITES_ITS_OWN_SUMMARY.some((command) => script.includes(command)),
    );
    expect(writes).toBe(true);
  });

  it("writes the summary even when the job failed, so a red check still reports what it saw", () => {
    // Every summary step that follows a step that can fail carries `if: always()`. The exceptions
    // are the ones that *are* the assertion (they only make sense on the path that reached them).
    const summarySteps = jobs.flatMap(([key, job]) =>
      (job.steps ?? [])
        .filter((step) => (step.run ?? "").includes("GITHUB_STEP_SUMMARY"))
        .map((step) => ({ key, step })),
    );
    expect(summarySteps.length).toBeGreaterThanOrEqual(
      EXPECTED_JOBS.length - 2,
    );
    const alwaysRun = summarySteps.filter(({ step }) => step.if === "always()");
    expect(alwaysRun.length).toBeGreaterThanOrEqual(8);
  });
});

describe("the jobs TASK-011 adds", () => {
  it("runs the contract suite with --passWithNoTests via the package script", () => {
    const pkg = JSON.parse(read("package.json")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts["test:contract"]).toBe(
      "vitest run --project contract --passWithNoTests",
    );
    const scripts = (ci.jobs["test-contract"]?.steps ?? []).map(
      (step) => step.run ?? "",
    );
    expect(scripts.join("\n")).toContain("pnpm test:contract");
  });

  it("declares the `contract` Vitest project over tests/contract", () => {
    const config = read("vitest.config.ts");
    expect(config).toContain('name: "contract"');
    expect(config).toContain('include: ["tests/contract/**/*.test.ts"]');
  });

  it("runs db:check in its own job", () => {
    const scripts = (ci.jobs["db-check"]?.steps ?? []).map(
      (step) => step.run ?? "",
    );
    expect(scripts.join("\n")).toContain("pnpm db:check");
  });

  it("runs both halves of the audit and installs the pinned gitleaks first", () => {
    const audit = ci.jobs["audit"];
    expect((audit?.steps ?? []).map((step) => step.uses)).toContain(
      "./.github/actions/gitleaks",
    );
    const scripts = (audit?.steps ?? [])
      .map((step) => step.run ?? "")
      .join("\n");
    expect(scripts).toContain("pnpm audit --prod --audit-level=high");
    expect(scripts).toContain("pnpm audit:secrets");
  });

  it("installs gitleaks in test-unit too, so T-28 never skips in CI", () => {
    // The `test-unit` summary step fails the job on any skipped test; without the binary the
    // gitleaks scans would skip and take the job with them.
    expect(
      (ci.jobs["test-unit"]?.steps ?? []).map((step) => step.uses),
    ).toContain("./.github/actions/gitleaks");
  });

  it("pins the gitleaks version and digest, and keeps them in step with the script", () => {
    const action = read(".github/actions/gitleaks/action.yml");
    expect(action).toContain(`GITLEAKS_VERSION: "${GITLEAKS_VERSION}"`);
    expect(action).toMatch(/GITLEAKS_SHA256: [0-9a-f]{64}/);
    expect(action).toContain("sha256sum --check --strict");
  });

  it("keeps env:check in the lint job, as the header comment documents", () => {
    const scripts = (ci.jobs["lint"]?.steps ?? [])
      .map((step) => step.run ?? "")
      .join("\n");
    expect(scripts).toContain("pnpm env:check");
    const header = read(".github/workflows/ci.yml").split("name: ci")[0] ?? "";
    expect(header).toContain("`env:check` has no job of its own");
  });
});

describe("the i18n-check job (spec 003 AC-30's CI half, TASK-040)", () => {
  const job = ci.jobs["i18n-check"];

  it("runs `pnpm i18n:check --summary`", () => {
    const scripts = (job?.steps ?? []).map((step) => step.run ?? "").join("\n");
    expect(scripts).toContain("pnpm i18n:check --summary");
  });

  it("hangs off typecheck, not off the preview chain (spec 001 §14 A9)", () => {
    // The check reads committed JSON and greps `src/`; making it wait for a Vercel deployment
    // would hide the translation-debt table behind fifteen minutes of unrelated work.
    expect(job?.needs).toBe("typecheck");
  });

  it("is a required check, so the gate cannot be merged past", () => {
    // `scripts/branch-protection.ts` derives the contexts from this file, and only `lighthouse`
    // is informational (asserted above).
    expect(job?.["continue-on-error"]).toBeUndefined();
  });

  it("writes the per-locale share table to the step summary (§11, AC-30)", () => {
    // Half of it is written by the script itself (`--summary` appends to `$GITHUB_STEP_SUMMARY`),
    // the verdict half by the job, `if: always()` so a red run still reports what it saw.
    const summaryStep = (job?.steps ?? []).find((step) =>
      (step.run ?? "").includes("GITHUB_STEP_SUMMARY"),
    );
    expect(summaryStep?.if).toBe("always()");
    expect(summaryStep?.run).toContain("i18n:check failed");
  });
});

describe("the catalogue-check job (spec 005 AC-5's CI half, TASK-062)", () => {
  const job = ci.jobs["catalogue-check"];

  it("runs `pnpm catalogue:check --summary`", () => {
    const scripts = (job?.steps ?? []).map((step) => step.run ?? "").join("\n");
    expect(scripts).toContain("pnpm catalogue:check --summary");
  });

  it("hangs off typecheck, not off the preview chain (spec 001 §14 A9)", () => {
    // It reads committed dataset files and `messages/en.json`: no browser, no database, no
    // preview deployment, so it belongs in the fast fan-out beside `i18n-check`.
    expect(job?.needs).toBe("typecheck");
  });

  it("is a required check, so a wrong price cannot be merged past it", () => {
    expect(job?.["continue-on-error"]).toBeUndefined();
  });

  it("writes the per-destination coverage table to the step summary (§11, AC-5)", () => {
    const summaryStep = (job?.steps ?? []).find((step) =>
      (step.run ?? "").includes("GITHUB_STEP_SUMMARY"),
    );
    expect(summaryStep?.if).toBe("always()");
    expect(summaryStep?.run).toContain("catalogue:check --summary");
  });
});

describe("pr-policy.yml", () => {
  const prPolicy = parse(read(".github/workflows/pr-policy.yml")) as Workflow;

  it("exposes exactly one job, named `pr-policy` (AC-21's extra required check)", () => {
    expect(Object.keys(prPolicy.jobs)).toEqual(["pr-policy"]);
    expect(prPolicy.jobs["pr-policy"]?.name).toBe("pr-policy");
  });
});
