/**
 * AC-21 and spec 001 §11 (TASK-011): the shape of `ci.yml` itself.
 *
 * AC-21 says `ci.yml` "exposes exactly the job names listed in §2" and §11 says "every job writes
 * a GitHub step summary". Both are properties of the workflow file, so both are asserted here
 * rather than discovered on a pull request. Parsed as YAML, never grepped: a job name in a comment
 * is not a job, and this file is the reason the comment block at the top of `ci.yml` cannot drift
 * from the jobs below it.
 */
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterAll, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";

import { GITLEAKS_VERSION } from "../../scripts/audit-secrets.ts";

const repoRoot = resolve(__dirname, "../..");
const read = (relative: string): string =>
  readFileSync(resolve(repoRoot, relative), "utf8");

interface Step {
  name?: string;
  id?: string;
  uses?: string;
  run?: string;
  if?: string;
  "continue-on-error"?: boolean;
  env?: Record<string, string>;
  with?: Record<string, string>;
}

interface Job {
  name?: string;
  env?: Record<string, string>;
  outputs?: Record<string, string>;
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

/** The origin the browser suites run against, served by CI itself (TASK-137). */
const PREVIEW_ORIGIN_SCRIPT = ".github/actions/preview-origin/serve.sh";
/** The build the `preview` job publishes and the three browser jobs re-serve (TASK-137). */
const PREVIEW_ARTIFACT = "preview-build";

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

/**
 * TASK-137: the origin the Playwright suites run against is CI's own.
 *
 * Measured on PRs 84, 85 and 87: `preview` polled the GitHub Deployments API for a Vercel
 * preview, and the deployment either never appeared or answered `/api/health` with 500 — the
 * cold fallback of ADR-0018 carries an empty environment store. `e2e`, `visual` and `a11y` are
 * each `needs: preview`, so **no Playwright suite had ever run in CI on this project**.
 *
 * The job now builds the app on the runner from the committed `.env.example` placeholders,
 * publishes that build as an artifact, serves it and gates on `/api/health` 200 before handing
 * the origin to the three browser jobs, which serve the same bytes through
 * `.github/actions/preview-origin`. No secret is a build input (spec 001 §14 A17, spec 040 §14
 * A1): the values are the ones `.env.example` publishes.
 */
describe("the preview job serves an origin CI owns (TASK-137)", () => {
  const preview = ci.jobs["preview"];
  const steps = preview?.steps ?? [];
  const script = steps.map((step) => step.run ?? "").join("\n");
  const BROWSER_JOBS = ["e2e", "visual", "a11y"] as const;

  it("builds the app on the runner rather than waiting for a third party to deploy it", () => {
    expect(script).toContain("pnpm build");
    // The 15-minute Deployments-API poll that produced no origin is gone from the critical path:
    // no step of this job may block the browser suites on a deployment we do not control.
    const blocking = steps.filter(
      (step) =>
        (step.run ?? "").includes("gh api") &&
        step["continue-on-error"] !== true,
    );
    expect(blocking).toEqual([]);
  });

  it("gives the build only the committed placeholders — no secret is a build input", () => {
    expect(script).toContain("cp .env.example .env.local");
    const envValues = steps
      .flatMap((step) => Object.values(step.env ?? {}))
      .join("\n");
    // `VERCEL_AUTOMATION_BYPASS_SECRET` may still reach the evidence step below; nothing else may.
    const otherSecrets = envValues
      .split("\n")
      .filter(
        (value) =>
          value.includes("secrets.") &&
          !value.includes("secrets.VERCEL_AUTOMATION_BYPASS_SECRET"),
      );
    expect(otherSecrets).toEqual([]);
    expect(script).not.toMatch(/--build-arg/u);
  });

  it("gates on /api/health 200 before it can declare an origin healthy", () => {
    const serve = steps.find((step) => step.id === "serve");
    expect(serve).toBeDefined();
    const serveScript = (serve?.run ?? "") + (serve?.uses ?? "");
    expect(serveScript).toContain(PREVIEW_ORIGIN_SCRIPT);
    const gate = read(PREVIEW_ORIGIN_SCRIPT);
    expect(gate).toContain("/api/health");
    expect(gate).toContain('"status":"ok"');
    expect(gate).toMatch(/::error::[^\n]*\/api\/health/);
  });

  it("publishes the served origin as `preview_url`", () => {
    expect(preview?.outputs?.["preview_url"]).toBe(
      "${{ steps.serve.outputs.preview_url }}",
    );
    expect(read(PREVIEW_ORIGIN_SCRIPT)).toContain(
      'preview_url=$origin" >> "$GITHUB_OUTPUT',
    );
  });

  it("publishes the build so the browser jobs measure the same bytes, not three of their own", () => {
    const upload = steps.find((step) =>
      (step.uses ?? "").startsWith("actions/upload-artifact"),
    );
    expect(upload?.with?.["name"]).toBe(PREVIEW_ARTIFACT);
    const action = read(".github/actions/preview-origin/action.yml");
    expect(action).toContain("actions/download-artifact");
    expect(action).toContain(PREVIEW_ARTIFACT);
    expect(action).toContain(PREVIEW_ORIGIN_SCRIPT);
  });

  it.each(BROWSER_JOBS)(
    "%s starts that origin through the shared action and targets the job's output",
    (name) => {
      const job = ci.jobs[name];
      expect(job?.needs).toBe("preview");
      expect(job?.env?.["PLAYWRIGHT_BASE_URL"]).toBe(
        "${{ needs.preview.outputs.preview_url }}",
      );
      expect((job?.steps ?? []).map((step) => step.uses)).toContain(
        "./.github/actions/preview-origin",
      );
    },
  );

  it("keeps the Vercel probe as evidence and never as a blocker (ADR-0018)", () => {
    // The `Vercel` check stays on the pull request and keeps meaning what it says; what changed
    // is that a host we are leaving can no longer deny four suites an origin. The probe still
    // asserts Deployment Protection, `fra1` and `noindex` when a deployment exists, and its
    // verdict is written to the step summary either way.
    const probe = steps.find((step) => (step.run ?? "").includes("gh api"));
    expect(probe?.["continue-on-error"]).toBe(true);
    expect(script).toContain("GITHUB_STEP_SUMMARY");
  });
});

/**
 * TASK-137 (carried in from `/review 84` round 2): `commitlint` must be runnable on the event CI
 * is actually re-fired with.
 *
 * The job's `if` admits `workflow_dispatch` — the only way to re-run CI on a pull request that is
 * already ready and already labelled — but its command interpolated
 * `github.event.pull_request.base.sha` and `.head.sha`, which that event does not carry. Both
 * resolved to the empty string, so every dispatch run ended in exit 9 ("--from and --to point to
 * the same commit") and the summary step ran `git rev-list --count ..`: a guaranteed red job on a
 * range it was never given.
 *
 * The three cases below execute the job's own scripts rather than reading them, because the defect
 * was in what the shell did with an empty variable, not in what the YAML said. Each script is run
 * the way the runner runs it (`bash --noprofile --norc -eo pipefail`, values through `env:`), so a
 * regression here is a failing test and not a red check discovered on the next dispatch.
 */
describe("the commitlint job resolves its own commit range (TASK-137)", () => {
  const commitlint = ci.jobs["commitlint"];
  const steps = commitlint?.steps ?? [];
  const stepById = (id: string): Step => {
    const step = steps.find((candidate) => candidate.id === id);
    if (!step?.run)
      throw new Error(`commitlint has no \`${id}\` step with a script`);
    return step;
  };

  const tmpRoots: string[] = [];
  const git = (cwd: string, ...args: string[]): string =>
    execFileSync(
      "git",
      [
        "-c",
        "user.name=ci-test",
        "-c",
        "user.email=ci-test@example.invalid",
        "-c",
        "commit.gpgsign=false",
        ...args,
      ],
      { cwd, encoding: "utf8" },
    ).trim();

  /** A repository shaped like a pull request: `main`, then a branch of two commits off it. */
  const fixtureRepo = (): {
    clone: string;
    mergeBase: string;
    head: string;
    mainTip: string;
  } => {
    const root = mkdtempSync(join(tmpdir(), "fo-commitlint-range-"));
    tmpRoots.push(root);
    const origin = join(root, "origin");
    mkdirSync(origin);
    git(origin, "init", "--quiet", "--initial-branch=main");
    for (const subject of ["feat: one", "fix: two"]) {
      writeFileSync(join(origin, "file.txt"), `${subject}\n`);
      git(origin, "add", "-A");
      git(origin, "commit", "--quiet", "-m", subject);
    }
    const mainTip = git(origin, "rev-parse", "HEAD");
    const clone = join(root, "clone");
    git(root, "clone", "--quiet", origin, "clone");
    git(clone, "checkout", "--quiet", "-b", "topic");
    for (const subject of ["feat: three", "chore: four"]) {
      writeFileSync(join(clone, "file.txt"), `${subject}\n`);
      git(clone, "add", "-A");
      git(clone, "commit", "--quiet", "-m", subject);
    }
    return {
      clone,
      mergeBase: mainTip,
      head: git(clone, "rev-parse", "HEAD"),
      mainTip,
    };
  };

  /** Runs a step's script exactly as the runner does, and returns what it wrote. */
  const runStep = (
    step: Step,
    options: { cwd: string; env?: Record<string, string> },
  ): {
    status: number | null;
    stdout: string;
    outputs: string;
    summary: string;
  } => {
    const outputFile = join(options.cwd, "step-output.txt");
    const summaryFile = join(options.cwd, "step-summary.md");
    writeFileSync(outputFile, "");
    writeFileSync(summaryFile, "");
    const scriptFile = join(options.cwd, "step.sh");
    writeFileSync(scriptFile, step.run ?? "");
    const result = spawnSync(
      "bash",
      ["--noprofile", "--norc", "-eo", "pipefail", scriptFile],
      {
        cwd: options.cwd,
        encoding: "utf8",
        env: {
          ...process.env,
          GITHUB_OUTPUT: outputFile,
          GITHUB_STEP_SUMMARY: summaryFile,
          ...options.env,
        },
      },
    );
    return {
      status: result.status,
      stdout: `${result.stdout}${result.stderr}`,
      outputs: readFileSync(outputFile, "utf8"),
      summary: readFileSync(summaryFile, "utf8"),
    };
  };

  /** A `pnpm` on PATH that records its arguments instead of linting. */
  const stubPnpm = (
    cwd: string,
  ): { env: Record<string, string>; calls: () => string } => {
    const bin = join(cwd, "stub-bin");
    mkdirSync(bin, { recursive: true });
    const log = join(cwd, "pnpm-calls.txt");
    writeFileSync(
      join(bin, "pnpm"),
      `#!/bin/sh\nprintf '%s\\n' "$*" >> ${JSON.stringify(log)}\n`,
    );
    chmodSync(join(bin, "pnpm"), 0o755);
    return {
      env: { PATH: `${bin}:${process.env["PATH"] ?? ""}` },
      calls: () => (existsSync(log) ? readFileSync(log, "utf8") : ""),
    };
  };

  afterAll(() => {
    for (const root of tmpRoots) rmSync(root, { recursive: true, force: true });
  });

  it("hands no step a value the event may not carry: the range comes from one resolver", () => {
    // The defect in one assertion. A pull-request SHA interpolated into a command is empty on the
    // `workflow_dispatch` this job's own `if` admits, and an empty `--from`/`--to` is exit 9.
    expect(commitlint?.if).toContain("workflow_dispatch");
    for (const step of steps) {
      expect(step.run ?? "").not.toContain("github.event");
      expect(step.run ?? "").not.toContain("${{");
    }
    const eventSHAs = steps
      .filter((step) => step.id !== "range")
      .flatMap((step) => Object.values(step.env ?? {}))
      .filter((value) => value.includes("github.event.pull_request"));
    expect(eventSHAs).toEqual([]);
    for (const id of ["commitlint"]) {
      expect(stepById(id).env?.["BASE_SHA"]).toBe(
        "${{ steps.range.outputs.base }}",
      );
      expect(stepById(id).env?.["HEAD_SHA"]).toBe(
        "${{ steps.range.outputs.head }}",
      );
    }
  });

  it("resolves the range from the merge base when the event carries no pull request", () => {
    const repo = fixtureRepo();
    const run = runStep(stepById("range"), {
      cwd: repo.clone,
      env: { EVENT_BASE_SHA: "", EVENT_HEAD_SHA: "", DEFAULT_BRANCH: "main" },
    });
    expect(run.status).toBe(0);
    expect(run.outputs).toContain(`base=${repo.mergeBase}`);
    expect(run.outputs).toContain(`head=${repo.head}`);
    expect(run.outputs).toContain("source=the merge base with main");
  });

  it("keeps the pull-request event's own range when it has one", () => {
    const repo = fixtureRepo();
    const run = runStep(stepById("range"), {
      cwd: repo.clone,
      env: {
        EVENT_BASE_SHA: repo.mergeBase,
        EVENT_HEAD_SHA: repo.head,
        DEFAULT_BRANCH: "main",
      },
    });
    expect(run.status).toBe(0);
    expect(run.outputs).toContain(`base=${repo.mergeBase}`);
    expect(run.outputs).toContain("source=the pull_request event");
  });

  it("lints the resolved range, and lints nothing rather than failing on an empty one", () => {
    const repo = fixtureRepo();
    const stub = stubPnpm(repo.clone);
    const empty = runStep(stepById("commitlint"), {
      cwd: repo.clone,
      env: { ...stub.env, BASE_SHA: repo.head, HEAD_SHA: repo.head },
    });
    expect(empty.status).toBe(0);
    expect(stub.calls()).toBe("");

    const real = runStep(stepById("commitlint"), {
      cwd: repo.clone,
      env: { ...stub.env, BASE_SHA: repo.mergeBase, HEAD_SHA: repo.head },
    });
    expect(real.status).toBe(0);
    expect(stub.calls()).toContain(
      `exec commitlint --from ${repo.mergeBase} --to ${repo.head} --verbose`,
    );
  });

  it("summarises an unresolved range as zero commits instead of running `git rev-list ..`", () => {
    const repo = fixtureRepo();
    const run = runStep(stepById("summary"), {
      cwd: repo.clone,
      env: { BASE_SHA: "", HEAD_SHA: "", RANGE_SOURCE: "", RESULT: "skipped" },
    });
    expect(run.status).toBe(0);
    expect(run.stdout).not.toContain("fatal");
    expect(run.summary).toContain("commits linted: 0");
  });
});
