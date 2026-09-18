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

import { describe, expect, it, vi } from "vitest";
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
  // spec 040 AC-8 / T-08 (TASK-135, from TASK-099's carry-forward): the daemon half of the
  // container criterion — `docker build` with no credential in the environment, then the running
  // image. On the spine beside `build`, with its expensive steps scoped to the pull requests that
  // touch the container contract (spec 001 §14 A14, A16).
  "container",
  "env-build-failure",
  "commitlint",
  "seo-validate",
  "i18n-check",
  // spec 005 AC-5 (TASK-062): the catalogue and price gate, on the same `needs: typecheck`
  // fan-out as `i18n-check` for the same reason (spec 001 §14 A9).
  "catalogue-check",
  // spec 007 AC-2 (TASK-087): the corridor content gate, on the same fan-out — it reads
  // `content/corridors/**` and writes the §11 published-set summary.
  "corridor-check",
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

  it("marks no job continue-on-error: every gate blocks (spec 004 AC-24)", () => {
    // Spec 001 §13 Q4 made `lighthouse` informational "until spec 004", and it was the only such
    // job. TASK-056 measured the finished pages, fixed the last red assertion and deleted the
    // line, so the set is now empty — and an empty set is the assertion, so a later "just for
    // now" cannot be added without changing this test and saying why in the PR.
    const informational = jobs
      .filter(([, job]) => job["continue-on-error"] === true)
      .map(([key]) => key);
    expect(informational).toEqual([]);
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

  // Spec 040 AC-2 / AC-28 (TASK-097). Two pins, both about the same claim: the application is
  // host-agnostic. The `lint` step is what keeps it that way; the `env-build-failure` env is what
  // proves the failure mode still works when the signal is `APP_ENV` rather than `VERCEL_ENV`,
  // which is the only version of that job a Railway deployment could ever reproduce.
  it("runs check:no-vercel-env as a step of the lint job (spec 040 AC-2)", () => {
    const steps = ci.jobs["lint"]?.steps ?? [];
    const scripts = steps.map((step) => step.run ?? "").join("\n");
    expect(scripts).toContain("pnpm check:no-vercel-env");
    // Beside `check:no-db`, in the same job, and both before the summary step.
    expect(scripts).toContain("pnpm check:no-db");
    const index = (needle: string): number =>
      steps.findIndex((step) => (step.run ?? "").includes(needle));
    expect(index("pnpm check:no-vercel-env")).toBeGreaterThan(
      index("pnpm check:no-db"),
    );
    expect(index("pnpm check:no-vercel-env")).toBeLessThan(
      index("GITHUB_STEP_SUMMARY"),
    );
  });

  it("summarises the host-agnostic gate like every other lint step (§11)", () => {
    const summary = (ci.jobs["lint"]?.steps ?? [])
      .map((step) => step.run ?? "")
      .find((script) => script.includes("GITHUB_STEP_SUMMARY"));
    expect(summary).toContain("check:no-vercel-env");
  });

  it("builds env-build-failure with APP_ENV, not VERCEL_ENV (spec 040 AC-28)", () => {
    const job = ci.jobs["env-build-failure"];
    const envs = (job?.steps ?? []).map(
      (step) => (step as { env?: Record<string, string> }).env ?? {},
    );
    expect(envs.some((env) => env["APP_ENV"] === "production")).toBe(true);
    expect(envs.some((env) => "VERCEL_ENV" in env)).toBe(false);
    // The three assertions the job makes about its own output (AC-28): non-zero exit, the key
    // named, and no other variable's value echoed.
    const scripts = (job?.steps ?? []).map((step) => step.run ?? "").join("\n");
    expect(scripts).toContain(
      "exited 0 with a placeholder NEXT_PUBLIC_SITE_URL in production",
    );
    expect(scripts).toContain(
      "NEXT_PUBLIC_SITE_URL: must be a real value in production",
    );
    expect(scripts).toContain("$SENTINEL");
  });

  // Spec 001 §14 A17 / spec 040 §14 A1 (TASK-135) moved the server half of the contract from the
  // build to server start, so the two assertions that used to live in `env-build-failure` — a
  // missing server key and a placeholder `DATABASE_URL` in a deployed environment — are now made
  // against the running image. Both jobs are checked here so the pair cannot drift apart.
  it("asserts the server half against the container, not against the build (spec 001 §14 A17)", () => {
    const buildJob = (ci.jobs["env-build-failure"]?.steps ?? [])
      .map((step) => step.run ?? "")
      .join("\n");
    expect(buildJob).toContain(
      "pnpm build failed with R2_BUCKET missing; the build gate still demands a server key",
    );

    const containerJob = (ci.jobs["container"]?.steps ?? [])
      .map((step) => step.run ?? "")
      .join("\n");
    expect(containerJob).toContain("docker build");
    expect(containerJob).toContain("answered 200 with no server variable set");
    expect(containerJob).toContain(
      "exited 0 with a placeholder DATABASE_URL in production (spec 002 AC-2)",
    );
    expect(containerJob).toContain(
      "DATABASE_URL: must be a real value in production",
    );
    // No credential may be handed to `docker build` — a build argument survives in layer history.
    expect(containerJob).toContain(
      "a server credential is present in the build environment",
    );
    expect(containerJob).not.toMatch(/--build-arg/u);
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

describe("the lighthouse job's step summary (spec 004 §11, AC-24; TASK-056)", () => {
  const job = ci.jobs["lighthouse"];
  const summaryStep = (job?.steps ?? []).find((step) =>
    (step.run ?? "").includes("GITHUB_STEP_SUMMARY"),
  );

  /**
   * `@lhci/cli`'s `filesystem` upload target writes `manifest.json` **inside**
   * `upload.outputDir`; the root of `.lighthouseci/` holds the collect step's raw `lhr-*.json`
   * and no manifest at all. The summary guards on that file, so a wrong path does not fail the
   * job — it silently drops §11's per-URL table from every run, green and red alike
   * (`/review 61`). These two values live in different files, so this is where they are held
   * together.
   */
  it("reads the manifest from `lighthouserc.json`'s own `upload.outputDir`", () => {
    const lighthouserc = JSON.parse(read("lighthouserc.json")) as {
      ci: { upload: { target: string; outputDir: string } };
    };
    expect(lighthouserc.ci.upload.target).toBe("filesystem");
    const outputDir = lighthouserc.ci.upload.outputDir;
    expect(outputDir).toBeTruthy();
    const run = summaryStep?.run ?? "";
    expect(run).toContain(`${outputDir}/manifest.json`);
    // And never the path LHCI does not write, which is what made the table disappear.
    expect(run).not.toMatch(/(^|[^/])\.lighthouseci\/manifest\.json/);
  });

  it("prints the per-URL table from the representative run of each URL (§11)", () => {
    const run = summaryStep?.run ?? "";
    expect(summaryStep?.if).toBe("always()");
    expect(run).toContain("| URL | perf | a11y | best-practices |");
    expect(run).toContain("isRepresentativeRun");
  });

  it("says so in the summary when the manifest is missing, instead of printing nothing", () => {
    expect(summaryStep?.run ?? "").toContain("No per-URL table");
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

/**
 * TASK-134 (spec 001 AC-16 / T-17): `test-unit` runs `pnpm test:coverage` on `ubuntu-latest`, and
 * under V8 instrumentation two CPU-bound cases cross Vitest's 5 000 ms default there while
 * finishing in under a second locally. The budget therefore has to depend on `CI`, and it is a
 * property of the config file rather than of any one test — so it is asserted by loading the
 * config twice, once with `CI` set and once without.
 */
describe("the unit project's test budget (TASK-134)", () => {
  const unitTimeoutFor = async (ci: string | undefined): Promise<unknown> => {
    const previous = process.env["CI"];
    if (ci === undefined) {
      delete process.env["CI"];
    } else {
      process.env["CI"] = ci;
    }
    vi.resetModules();
    try {
      const loaded = (
        await import(`${repoRoot}/vitest.config.ts?task-134=${ci ?? "unset"}`)
      ).default as {
        test?: {
          projects?: { test?: { name?: string; testTimeout?: number } }[];
        };
      };
      const unit = (loaded.test?.projects ?? []).find(
        (project) => project.test?.name === "unit",
      );
      expect(unit).toBeDefined();
      return unit?.test?.testTimeout;
    } finally {
      if (previous === undefined) {
        delete process.env["CI"];
      } else {
        process.env["CI"] = previous;
      }
      vi.resetModules();
    }
  };

  it("raises the unit timeout to 30 s when CI is set", async () => {
    await expect(unitTimeoutFor("true")).resolves.toBe(30_000);
  });

  it("leaves the tight Vitest default in place locally, where slow means hung", async () => {
    await expect(unitTimeoutFor(undefined)).resolves.toBeUndefined();
  });
});
