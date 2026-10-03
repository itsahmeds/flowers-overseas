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
  shell?: string;
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
  defaults?: { run?: { shell?: string } };
  steps: Step[];
}

interface Workflow {
  name: string;
  on?: Record<string, unknown>;
  concurrency?: { group?: string; "cancel-in-progress"?: boolean };
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
  // spec 040 AC-29 (TASK-100): the Cloudflare zone against `config/cloudflare/zone-settings.json`,
  // on the `needs: typecheck` fan-out, with no `if:` so an unlabelled pull request that touches the
  // declaration is still checked; nightly as well.
  "cloudflare-check",
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
 * TASK-137 (carried in from `/review 84` round 2): `commitlint` must survive a `workflow_dispatch`
 * run.
 *
 * The job's `if` admits `workflow_dispatch` — an event the job has to survive, not a way to re-run
 * CI (W-4: a dispatch skips the browser chain) — but its command interpolated
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

/**
 * T-51 (spec 001 AC-49, TASK-153): two comments in `ci.yml` stated as current what is not. The
 * header presented a private repository's 2,000-minute budget and the reviewer's local re-run as
 * how CI works, and the `commitlint` comment called `workflow_dispatch` "how CI is re-fired on a
 * pull request", which W-4 forbids. Comments are matched with their line breaks and `#` markers
 * folded away, so a phrase wrapped across two comment lines is still found.
 */
describe("stale ci.yml comments stay gone (T-51)", () => {
  const folded = read(".github/workflows/ci.yml")
    .split("\n")
    .map((line) => line.replace(/^\s*#\s?/, "").trim())
    .join(" ");

  it.each([
    "2,000 minutes",
    "how CI is re-fired",
    "the reviewer runs the same suites locally",
    // Spec 040 AC-38 (TASK-155): `main` now has a push run, so the old promise is untrue.
    "nothing runs on push",
    // Spec 001 AC-50 (TASK-158): `pnpm lint:js` now passes `--max-warnings 0`.
    "is not passed because every rule",
  ])("no comment says %s", (phrase) => {
    expect(folded).not.toContain(phrase);
  });

  it("the trigger comment points at §14 A14 and W-2", () => {
    expect(folded).toMatch(
      /When CI runs\. Why the triggers are what they are: spec 001 §14 A14 and `docs\/framework\/why\.md` W-2/,
    );
  });
});

/**
 * Spec 040 §14 A3, AC-38 / T-39 (TASK-155): CI runs on every push to `main`, so a release can
 * name a commit that has a run of its own (AC-37's gate 1; a squash merge makes a commit no PR
 * run has seen).
 *
 * Adding the trigger is not enough on its own. On a push `github.event.pull_request` is null, so
 * a job whose `if:` reads only the `ci:full` label is skipped and the run still concludes
 * `success`. The job set is therefore **computed, not listed**: each job's `if:` is evaluated
 * against the event's context by the small evaluator below, and a job counts only when its `if:`
 * is true (or absent) and every job in its `needs:` counts too, which is GitHub's rule for a job
 * with no `always()`. The evaluator understands exactly the grammar the job-level `if:`s use
 * (`||`, `&&`, `==`, `!=`, `!`, parentheses, quoted strings, context paths with `.*.`, and
 * `contains`) and throws on anything else, so a new construct fails loudly instead of being
 * read as `false`.
 */
type ExprValue =
  | string
  | number
  | boolean
  | null
  | readonly ExprValue[]
  | { readonly [key: string]: ExprValue };

type Token =
  | { kind: "op"; value: "(" | ")" | "," | "&&" | "||" | "==" | "!=" | "!" }
  | { kind: "string"; value: string }
  | { kind: "ident"; value: string };

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const rest = source.slice(i);
    const space = /^\s+/.exec(rest);
    if (space) {
      i += space[0].length;
      continue;
    }
    const op = /^(&&|\|\||==|!=|!|\(|\)|,)/.exec(rest);
    if (op) {
      tokens.push({ kind: "op", value: op[0] as "(" });
      i += op[0].length;
      continue;
    }
    const quoted = /^'((?:[^']|'')*)'/.exec(rest);
    if (quoted) {
      tokens.push({
        kind: "string",
        value: (quoted[1] ?? "").replace(/''/g, "'"),
      });
      i += quoted[0].length;
      continue;
    }
    const ident = /^[A-Za-z_][\w-]*(?:\.(?:\*|[A-Za-z_][\w-]*))*/.exec(rest);
    if (ident) {
      tokens.push({ kind: "ident", value: ident[0] });
      i += ident[0].length;
      continue;
    }
    throw new Error(`unsupported expression syntax at: ${rest}`);
  }
  return tokens;
}

const truthy = (value: ExprValue): boolean =>
  !(value === null || value === false || value === 0 || value === "");

function resolvePath(value: ExprValue, segments: readonly string[]): ExprValue {
  const [head, ...rest] = segments;
  if (head === undefined) return value;
  if (head === "*") {
    const items: readonly ExprValue[] = Array.isArray(value)
      ? value
      : value !== null && typeof value === "object"
        ? Object.values(value)
        : [];
    return items.map((item) => resolvePath(item, rest));
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return resolvePath((value as Record<string, ExprValue>)[head] ?? null, rest);
}

/** GitHub's `==`: strings compare case-insensitively; everything else strictly. */
function looseEquals(left: ExprValue, right: ExprValue): boolean {
  if (typeof left === "string" && typeof right === "string") {
    return left.toLowerCase() === right.toLowerCase();
  }
  return left === right;
}

function evaluateExpression(
  source: string,
  context: Record<string, ExprValue>,
): ExprValue {
  const tokens = tokenize(source);
  let position = 0;
  const peek = (): Token | undefined => tokens[position];
  const isOp = (value: string): boolean => {
    const token = peek();
    return token?.kind === "op" && token.value === value;
  };
  const expectOp = (value: string): void => {
    if (!isOp(value)) throw new Error(`expected ${value} in: ${source}`);
    position += 1;
  };

  const primary = (): ExprValue => {
    const token = peek();
    if (token === undefined) throw new Error(`unexpected end of: ${source}`);
    position += 1;
    if (token.kind === "string") return token.value;
    if (token.kind === "op" && token.value === "(") {
      const inner = or();
      expectOp(")");
      return inner;
    }
    if (token.kind === "op" && token.value === "!") return !truthy(primary());
    if (token.kind === "ident") {
      if (token.value === "true") return true;
      if (token.value === "false") return false;
      if (token.value === "null") return null;
      if (isOp("(")) {
        if (token.value !== "contains") {
          throw new Error(
            `unsupported function ${token.value}() in: ${source}`,
          );
        }
        expectOp("(");
        const haystack = or();
        expectOp(",");
        const needle = or();
        expectOp(")");
        if (Array.isArray(haystack)) {
          return haystack.some((item: ExprValue) => looseEquals(item, needle));
        }
        return (
          typeof haystack === "string" &&
          typeof needle === "string" &&
          haystack.toLowerCase().includes(needle.toLowerCase())
        );
      }
      const [root, ...segments] = token.value.split(".");
      if (root === undefined || !(root in context)) {
        throw new Error(`unknown context ${String(root)} in: ${source}`);
      }
      return resolvePath(context[root] ?? null, segments);
    }
    throw new Error(`unexpected token ${token.value} in: ${source}`);
  };
  const comparison = (): ExprValue => {
    const left = primary();
    if (isOp("==") || isOp("!=")) {
      const negate = isOp("!=");
      position += 1;
      const equal = looseEquals(left, primary());
      return negate ? !equal : equal;
    }
    return left;
  };
  const and = (): ExprValue => {
    let left = comparison();
    while (isOp("&&")) {
      position += 1;
      const right = comparison();
      left = truthy(left) ? right : left;
    }
    return left;
  };
  function or(): ExprValue {
    let left = and();
    while (isOp("||")) {
      position += 1;
      const right = and();
      left = truthy(left) ? left : right;
    }
    return left;
  }

  const value = or();
  if (position !== tokens.length) {
    throw new Error(`trailing tokens in: ${source}`);
  }
  return value;
}

/** A job-level `if:`, with or without its `${{ }}` wrapper. Absent means "run". */
function evaluateIf(
  condition: string | undefined,
  context: Record<string, ExprValue>,
): boolean {
  if (condition === undefined) return true;
  const bare = /^\s*\$\{\{([\s\S]*)\}\}\s*$/.exec(condition)?.[1] ?? condition;
  return truthy(evaluateExpression(bare, context));
}

/** A string with `${{ }}` interpolations, such as the concurrency group. */
function interpolate(
  template: string,
  context: Record<string, ExprValue>,
): string {
  return template.replace(/\$\{\{([\s\S]*?)\}\}/g, (_, inner: string) => {
    const value = evaluateExpression(inner, context);
    return value === null ? "" : String(value);
  });
}

/** Every job the event runs, in file order: its `if:` holds and each of its `needs:` runs. */
function jobSet(context: Record<string, ExprValue>): string[] {
  const memo = new Map<string, boolean>();
  const runs = (key: string): boolean => {
    const known = memo.get(key);
    if (known !== undefined) return known;
    const job = ci.jobs[key];
    if (job === undefined) throw new Error(`needs: names no job ${key}`);
    const needs = job.needs === undefined ? [] : [job.needs].flat();
    const result = evaluateIf(job.if, context) && needs.every(runs);
    memo.set(key, result);
    return result;
  };
  return jobs.map(([key]) => key).filter(runs);
}

const githubContext = (github: Record<string, ExprValue>) => ({
  github: { workflow: "ci", ...github },
});

/** Two pushes to `main`: no pull request on the event (T-39's push context). */
const pushContext = githubContext({
  event_name: "push",
  ref: "refs/heads/main",
  event: { pull_request: null },
});
const pullRequestContext = (labels: readonly string[]) =>
  githubContext({
    event_name: "pull_request",
    ref: "refs/pull/107/merge",
    event: {
      pull_request: { number: 107, labels: labels.map((name) => ({ name })) },
    },
  });
const dispatchContext = githubContext({
  event_name: "workflow_dispatch",
  ref: "refs/heads/main",
  event: {},
});

/** The four jobs a push may skip: `preview` on its own `if:`, the rest through `needs: preview`. */
const PREVIEW_CHAIN = ["preview", "e2e", "visual", "a11y"] as const;
const SPINE = ["lint", "typecheck", "test-unit", "build"] as const;

describe("the evaluator T-39 relies on", () => {
  it("reads the label and the event the way GitHub does", () => {
    const labelled = pullRequestContext(["ci:full"]);
    const guard =
      "${{ github.event_name == 'workflow_dispatch' || contains(github.event.pull_request.labels.*.name, 'ci:full') }}";
    expect(evaluateIf(guard, labelled)).toBe(true);
    expect(evaluateIf(guard, pullRequestContext(["other"]))).toBe(false);
    expect(evaluateIf(guard, pushContext)).toBe(false);
    expect(evaluateIf(guard, dispatchContext)).toBe(true);
    expect(evaluateIf("github.event_name == 'PUSH'", pushContext)).toBe(true);
    expect(evaluateIf("!(github.event_name != 'push')", pushContext)).toBe(
      true,
    );
    expect(evaluateIf(undefined, pushContext)).toBe(true);
  });

  it("throws on syntax it does not understand instead of answering false", () => {
    expect(() => evaluateIf("always()", pushContext)).toThrow(
      /unsupported function/,
    );
    expect(() => evaluateIf("github.event_name >= 'a'", pushContext)).toThrow();
    expect(() => evaluateIf("secrets.X == 'y'", pushContext)).toThrow(
      /unknown context/,
    );
  });

  it("parses every job-level `if:` in ci.yml", () => {
    for (const context of [
      pushContext,
      pullRequestContext([]),
      dispatchContext,
    ]) {
      for (const [key, job] of jobs) {
        expect(() => evaluateIf(job.if, context), `job ${key}`).not.toThrow();
      }
    }
  });
});

describe("CI on every push to main (spec 040 AC-38, T-39)", () => {
  it("adds `push: branches: [main]` and leaves the other triggers as they were", () => {
    // `schedule` is spec 040 AC-29's nightly `cloudflare-check` (TASK-100).
    expect(ci.on).toEqual({
      pull_request: { types: ["ready_for_review", "labeled"] },
      push: { branches: ["main"] },
      workflow_dispatch: null,
      schedule: [{ cron: "17 3 * * *" }],
    });
  });

  it("runs every job on a push except exactly preview, e2e, visual and a11y", () => {
    const push = jobSet(pushContext);
    const skipped = jobs
      .map(([key]) => key)
      .filter((key) => !push.includes(key));
    expect(skipped).toEqual([...PREVIEW_CHAIN]);
    for (const key of SPINE) expect(push, key).toContain(key);
    expect(push).toHaveLength(EXPECTED_JOBS.length - PREVIEW_CHAIN.length);
  });

  it("skips `preview` on its own `if:` and the three browser jobs only through `needs: preview`", () => {
    expect(evaluateIf(ci.jobs.preview?.if, pushContext)).toBe(false);
    for (const key of ["e2e", "visual", "a11y"]) {
      const job = ci.jobs[key];
      expect(job?.if, key).toBeUndefined();
      expect([job?.needs].flat(), key).toContain("preview");
    }
  });

  it("runs `lighthouse` on a push through `needs: build`, so every release carries its budgets", () => {
    // AC-37: gate 1 requires `lighthouse` to conclude `success`, not `skipped`. A pull-request-only
    // `if:` here would take the budgets off every release and turn this case red.
    expect(ci.jobs.lighthouse?.if).toBeUndefined();
    expect(ci.jobs.lighthouse?.needs).toBe("build");
    expect(jobSet(pushContext)).toContain("lighthouse");
  });

  it("keeps the unlabelled pull-request set: the jobs with no `if:`", () => {
    const withoutIf = jobs
      .filter(([, job]) => job.if === undefined)
      .map(([key]) => key);
    const unlabelled = jobSet(pullRequestContext([]));
    expect(unlabelled).toEqual([
      "lint",
      "typecheck",
      "test-unit",
      "build",
      "container",
      // spec 040 AC-29 (TASK-100): starts on every pull request; its `scope` step checks the
      // zone only when `config/cloudflare/**` changed or the label is present.
      "cloudflare-check",
      "lighthouse",
    ]);
    // e2e, visual and a11y have no `if:` either, but `needs: preview` keeps them out.
    expect(withoutIf.filter((key) => !unlabelled.includes(key))).toEqual([
      "e2e",
      "visual",
      "a11y",
    ]);
  });

  it("keeps the labelled pull-request set: every job", () => {
    expect(jobSet(pullRequestContext(["ci:full"]))).toEqual([...EXPECTED_JOBS]);
  });

  it("keeps a dispatch off the browser chain (W-4)", () => {
    const dispatch = jobSet(dispatchContext);
    expect(
      jobs.map(([key]) => key).filter((key) => !dispatch.includes(key)),
    ).toEqual([...PREVIEW_CHAIN]);
  });

  it("pins the concurrency group and cancel-in-progress", () => {
    expect(ci.concurrency).toEqual({
      group:
        "ci-${{ github.workflow }}-${{ github.event.pull_request.number || (github.event_name == 'schedule' && 'nightly') || github.ref }}",
      "cancel-in-progress": true,
    });
  });

  it("gives the nightly run its own group, so it cancels no push run and no push cancels it (spec 040 §14 A6)", () => {
    const group = ci.concurrency?.group ?? "";
    const nightly = interpolate(
      group,
      githubContext({
        event_name: "schedule",
        ref: "refs/heads/main",
        event: {},
      }),
    );
    const push = interpolate(group, pushContext);
    const pullRequest = interpolate(group, pullRequestContext([]));
    expect(nightly).toBe("ci-ci-nightly");
    expect(push).toBe("ci-ci-refs/heads/main");
    expect(pullRequest).toBe("ci-ci-107");
    expect(new Set([nightly, push, pullRequest]).size).toBe(3);
  });

  it("puts two pushes to main in one group, so the later one cancels the earlier run", () => {
    // AC-38 accepts this: staging deploys the later commit, visit 1 names staging's commit, and
    // that commit's run is the one that survives. A cancelled run is not green (AC-37), and
    // `gh run rerun <id>` repeats that same push run on the same SHA.
    const group = ci.concurrency?.group ?? "";
    expect(interpolate(group, pushContext)).toBe("ci-ci-refs/heads/main");
    expect(interpolate(group, pullRequestContext(["ci:full"]))).toBe(
      "ci-ci-107",
    );
  });
});

/**
 * Spec 001 §14 A20, AC-61 / T-65 (TASK-158; the local clause is TASK-159's): every A20 check runs
 * on every PR, with or without `ci:full`. A20 adds no job: its lint checks run in `lint` through
 * `pnpm lint` (AC-51 folds the comment scan into it) and its tests in `test-unit` through the
 * whole unit suite. Neither job, nor the step that runs the check, may carry an `if:`, so both
 * run on every event that starts the workflow. The checker is a function so the red cases can
 * hand it a scratch workflow or a scratch `package.json`.
 */
interface PackageScripts {
  scripts: Record<string, string | undefined>;
}

/** The whole unit suite: the `unit` project, no file filter, no `--changed`, no shard. */
const WHOLE_UNIT_SUITE = /^vitest run --project unit(?: --coverage)?$/;
/** Flags the `test-unit` step may add; anything else could narrow the run. */
const REPORTING_FLAG = /^--(?:reporter|outputFile)=\S+$/;
/**
 * Every script `pnpm lint` runs, pinned exactly (/break 113 hole 3): a `|| true`, a `;` or a
 * `--rule … off` in any one of them would switch its check off without touching `lint` itself.
 */
const LINT_SCRIPTS = {
  lint: "pnpm lint:js && pnpm lint:css && pnpm check:no-literal-disable",
  "lint:js": "eslint . --max-warnings 0",
  "lint:css": 'stylelint "src/**/*.css"',
  "check:no-literal-disable": "node scripts/check-no-literal-disable.ts",
} as const;
/** The one form of the `lint` job's `pnpm lint` step; `pipefail` comes from `defaults.run`. */
const LINT_STEP_RUN = "pnpm lint 2>&1 | tee lint.log";
/** A shell idiom that turns a failing command into a passing one. */
const SWALLOWED = /\|\|\s*(?:true|:)(?=[\s;)]|$)/m;

function ac61Violations(workflow: Workflow, pkg: PackageScripts): string[] {
  const violations: string[] = [];
  const lint = workflow.jobs["lint"];
  const unit = workflow.jobs["test-unit"];
  if (lint === undefined) violations.push("lint: no such job");
  if (unit === undefined) violations.push("test-unit: no such job");
  if (lint?.if !== undefined) violations.push(`lint: has an if: ${lint.if}`);
  if (unit?.if !== undefined)
    violations.push(`test-unit: has an if: ${unit.if}`);

  const lintSteps = (lint?.steps ?? []).filter((step) =>
    /^pnpm lint(?:\s|$)/.test(step.run?.trim() ?? ""),
  );
  if (lintSteps.length === 0) violations.push("lint: no step runs pnpm lint");
  for (const step of lintSteps) {
    if (step.if !== undefined)
      violations.push(`lint: the pnpm lint step has an if: ${step.if}`);
    if (step.run?.trim() !== LINT_STEP_RUN)
      violations.push(
        `lint: the pnpm lint step runs ${JSON.stringify(step.run?.trim())}, not ${JSON.stringify(LINT_STEP_RUN)}`,
      );
  }
  // `pipefail` comes from the workflow's `defaults.run.shell: bash`; a job `defaults` or a step
  // `shell` (`sh`, `bash {0}`) replaces it, and `pnpm lint | tee` then exits with tee's status.
  if (lint?.defaults !== undefined)
    violations.push(
      `lint: the job sets defaults ${JSON.stringify(lint.defaults)}; the top-level bash with pipefail must apply`,
    );
  for (const step of lint?.steps ?? []) {
    const label = step.name ?? step.uses ?? step.id ?? "(unnamed)";
    if (step.shell !== undefined)
      violations.push(`lint: step ${label} sets shell: ${step.shell}`);
    if (step["continue-on-error"] !== undefined)
      violations.push(`lint: step ${label} has continue-on-error`);
    if (SWALLOWED.test(step.run ?? ""))
      violations.push(
        `lint: step ${label} swallows a failure with || true or || :`,
      );
  }

  const unitSteps = (unit?.steps ?? []).flatMap((step) => {
    const words = (step.run ?? "").trim().split(/\s+/);
    return words[0] === "pnpm" &&
      (words[1] === "test" || words[1] === "test:coverage")
      ? [{ step, script: words[1], flags: words.slice(2) }]
      : [];
  });
  if (unitSteps.length === 0)
    violations.push("test-unit: no step runs pnpm test or pnpm test:coverage");
  for (const { step, script, flags } of unitSteps) {
    if (step.if !== undefined)
      violations.push(`test-unit: the unit-suite step has an if: ${step.if}`);
    const narrowing = flags.filter((flag) => !REPORTING_FLAG.test(flag));
    if (narrowing.length > 0)
      violations.push(
        `test-unit: pnpm ${script} is narrowed by ${narrowing.join(" ")}`,
      );
    if (!WHOLE_UNIT_SUITE.test(pkg.scripts[script] ?? ""))
      violations.push(
        `package.json: ${script} is not the whole unit suite (${pkg.scripts[script] ?? "missing"})`,
      );
  }

  const lintScript = pkg.scripts["lint"] ?? "";
  const parts = lintScript.split("&&").map((part) => part.trim());
  for (const needed of [
    "pnpm lint:js",
    "pnpm lint:css",
    "pnpm check:no-literal-disable",
  ]) {
    if (!parts.includes(needed))
      violations.push(`package.json: lint does not run ${needed}`);
  }
  if (/\|\||;|&(?!&)/.test(lintScript.replaceAll("&&", "")))
    violations.push(
      `package.json: lint must chain with && only (${lintScript})`,
    );
  if (!/(?:^|\s)--max-warnings[= ]0(?:\s|$)/.test(pkg.scripts["lint:js"] ?? ""))
    violations.push("package.json: lint:js does not pass --max-warnings 0");
  for (const [script, expected] of Object.entries(LINT_SCRIPTS)) {
    const actual = pkg.scripts[script];
    if (actual !== expected)
      violations.push(
        `package.json: ${script} is ${JSON.stringify(actual)}, not ${JSON.stringify(expected)}`,
      );
  }
  return violations;
}

describe("every A20 check runs on every PR (spec 001 AC-61, T-65)", () => {
  const ciText = read(".github/workflows/ci.yml");
  const pkg = JSON.parse(read("package.json")) as PackageScripts;
  const guard =
    "    if: ${{ contains(github.event.pull_request.labels.*.name, 'ci:full') }}\n";
  /** `ci.yml` with the old label guard put back on one job, right under its `name:`. */
  const guarded = (job: "lint" | "test-unit"): Workflow => {
    const anchor = `\n  ${job}:\n    name: ${job}\n`;
    expect(ciText.split(anchor).length - 1, job).toBe(1);
    return parse(ciText.replace(anchor, `${anchor}${guard}`)) as Workflow;
  };
  const withScripts = (
    scripts: Record<string, string | undefined>,
  ): PackageScripts => ({ scripts: { ...pkg.scripts, ...scripts } });

  it("holds over the real ci.yml and package.json", () => {
    expect(ac61Violations(ci, pkg)).toEqual([]);
    expect(pkg.scripts["lint"]).toBe(
      "pnpm lint:js && pnpm lint:css && pnpm check:no-literal-disable",
    );
    expect(pkg.scripts["lint:js"]).toBe("eslint . --max-warnings 0");
  });

  it.each(["lint", "test-unit"] as const)(
    "goes red when %s gets the ci:full guard back",
    (job) => {
      const violations = ac61Violations(guarded(job), pkg);
      expect(violations).toEqual([
        `${job}: has an if: \${{ contains(github.event.pull_request.labels.*.name, 'ci:full') }}`,
      ]);
    },
  );

  it("goes red when the pnpm lint step or the unit-suite step gets an if:", () => {
    const workflow = parse(ciText) as Workflow;
    const lintStep = workflow.jobs["lint"]?.steps.find((step) =>
      /^pnpm lint(?:\s|$)/.test(step.run?.trim() ?? ""),
    );
    const unitStep = workflow.jobs["test-unit"]?.steps.find((step) =>
      (step.run ?? "").trim().startsWith("pnpm test:coverage"),
    );
    expect(lintStep).toBeDefined();
    expect(unitStep).toBeDefined();
    if (lintStep) lintStep.if = "github.event_name == 'push'";
    if (unitStep) unitStep.if = "github.event_name == 'push'";
    expect(ac61Violations(workflow, pkg)).toEqual([
      "lint: the pnpm lint step has an if: github.event_name == 'push'",
      "test-unit: the unit-suite step has an if: github.event_name == 'push'",
    ]);
  });

  it("goes red when package.json's lint drops check:no-literal-disable", () => {
    expect(
      ac61Violations(
        ci,
        withScripts({ lint: "pnpm lint:js && pnpm lint:css" }),
      ),
    ).toEqual([
      "package.json: lint does not run pnpm check:no-literal-disable",
      'package.json: lint is "pnpm lint:js && pnpm lint:css", not "pnpm lint:js && pnpm lint:css && pnpm check:no-literal-disable"',
    ]);
  });

  it("goes red when the scan is chained so its failure is swallowed", () => {
    expect(
      ac61Violations(
        ci,
        withScripts({
          lint: "pnpm lint:js && pnpm lint:css && pnpm check:no-literal-disable || true",
        }),
      ),
    ).toEqual([
      "package.json: lint does not run pnpm check:no-literal-disable",
      "package.json: lint must chain with && only (pnpm lint:js && pnpm lint:css && pnpm check:no-literal-disable || true)",
      'package.json: lint is "pnpm lint:js && pnpm lint:css && pnpm check:no-literal-disable || true", not "pnpm lint:js && pnpm lint:css && pnpm check:no-literal-disable"',
    ]);
  });

  it("goes red when lint:js drops --max-warnings 0", () => {
    expect(ac61Violations(ci, withScripts({ "lint:js": "eslint ." }))).toEqual([
      "package.json: lint:js does not pass --max-warnings 0",
      'package.json: lint:js is "eslint .", not "eslint . --max-warnings 0"',
    ]);
  });

  // /break 113 hole 3: each lint sub-script is pinned exactly, so none can swallow its own exit.
  it.each([
    [
      "check:no-literal-disable",
      "node scripts/check-no-literal-disable.ts || true",
    ],
    ["lint:css", 'stylelint "src/**/*.css" || true'],
    ["lint:js", "eslint . --max-warnings 0; true"],
    ["lint:js", "eslint . --max-warnings 0 --rule 'fo/no-float-money: off'"],
  ] as const)("goes red when %s becomes %s", (script, value) => {
    expect(ac61Violations(ci, withScripts({ [script]: value }))).toContain(
      `package.json: ${script} is ${JSON.stringify(value)}, not ${JSON.stringify(LINT_SCRIPTS[script])}`,
    );
  });

  // /break 113 hole 4: no step of the lint job may be made non-blocking.
  const lintJobWith = (edit: (steps: Step[]) => void): Workflow => {
    const workflow = parse(ciText) as Workflow;
    const steps = workflow.jobs["lint"]?.steps;
    expect(steps).toBeDefined();
    if (steps) edit(steps);
    return workflow;
  };
  const lintStepOf = (steps: Step[]): Step => {
    const step = steps.find((candidate) => candidate.id === "eslint");
    expect(step?.run).toBe("pnpm lint 2>&1 | tee lint.log");
    return step ?? {};
  };

  it("goes red when the pnpm lint step gets continue-on-error", () => {
    const workflow = lintJobWith((steps) => {
      lintStepOf(steps)["continue-on-error"] = true;
    });
    expect(ac61Violations(workflow, pkg)).toEqual([
      "lint: step ESLint, Stylelint and the comment scan (AC-50, AC-51) has continue-on-error",
    ]);
  });

  it("goes red when the pnpm lint step swallows its exit with || true", () => {
    const workflow = lintJobWith((steps) => {
      lintStepOf(steps).run = "pnpm lint 2>&1 | tee lint.log || true";
    });
    expect(ac61Violations(workflow, pkg)).toEqual([
      'lint: the pnpm lint step runs "pnpm lint 2>&1 | tee lint.log || true", not "pnpm lint 2>&1 | tee lint.log"',
      "lint: step ESLint, Stylelint and the comment scan (AC-50, AC-51) swallows a failure with || true or || :",
    ]);
  });

  // /break 113 round 2, hole 1: `shell: sh` or `bash {0}` drops pipefail, so
  // `pnpm lint 2>&1 | tee lint.log` exits with tee's status.
  it("goes red when the pnpm lint step sets its own shell", () => {
    const workflow = lintJobWith((steps) => {
      lintStepOf(steps).shell = "sh";
    });
    expect(ac61Violations(workflow, pkg)).toEqual([
      "lint: step ESLint, Stylelint and the comment scan (AC-50, AC-51) sets shell: sh",
    ]);
  });

  it("goes red when the lint job sets defaults", () => {
    const workflow = parse(ciText) as Workflow;
    const job = workflow.jobs["lint"];
    expect(job).toBeDefined();
    if (job) job.defaults = { run: { shell: "sh" } };
    expect(ac61Violations(workflow, pkg)).toEqual([
      'lint: the job sets defaults {"run":{"shell":"sh"}}; the top-level bash with pipefail must apply',
    ]);
  });

  it("goes red when any other step of the lint job gets continue-on-error or || :", () => {
    const workflow = lintJobWith((steps) => {
      const prettier = steps.find((step) => step.name === "Prettier");
      expect(prettier).toBeDefined();
      if (prettier) {
        prettier["continue-on-error"] = true;
        prettier.run = `${prettier.run ?? ""} || :`;
      }
    });
    expect(ac61Violations(workflow, pkg)).toEqual([
      "lint: step Prettier has continue-on-error",
      "lint: step Prettier swallows a failure with || true or || :",
    ]);
  });

  /**
   * The lint job's summary step, run under the flags GitHub gives `shell: bash`
   * (`--noprofile --norc -e -o pipefail`). With `|| true` banned from the job, a counting command
   * that exits 1 on no match (as `grep -c` does) fails the step on every green run: that is how
   * round 1 of this PR went red in CI (run 36466493420).
   */
  const runLintSummary = (
    log: string,
  ): { status: number | null; summary: string } => {
    const step = ci.jobs["lint"]?.steps.find(
      (candidate) => candidate.name === "Summarise the lint gate",
    );
    expect(step?.run).toBeDefined();
    const dir = mkdtempSync(join(tmpdir(), "fo-lint-summary-"));
    try {
      writeFileSync(join(dir, "lint.log"), log);
      const summaryFile = join(dir, "summary.md");
      writeFileSync(summaryFile, "");
      const script = (step?.run ?? "").replace(/\$\{\{[^}]*\}\}/g, "success");
      const result = spawnSync(
        "bash",
        ["--noprofile", "--norc", "-e", "-o", "pipefail", "-c", script],
        {
          cwd: dir,
          encoding: "utf8",
          env: { ...process.env, GITHUB_STEP_SUMMARY: summaryFile },
        },
      );
      return {
        status: result.status,
        summary: readFileSync(summaryFile, "utf8"),
      };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
  const SCAN_LINE =
    "check:no-literal-disable: 612 files, no bare or fo/ eslint directive and no stylelint-disable comment (spec 001 AC-51)";

  it("the lint summary step exits 0 on a clean log under CI's shell flags", () => {
    const { status, summary } = runLintSummary(
      `$ eslint . --max-warnings 0\n${SCAN_LINE}\n`,
    );
    expect(status).toBe(0);
    expect(summary).toContain("| `pnpm lint` | success, 0 problem(s) |");
    expect(summary).toContain(SCAN_LINE);
  });

  it("the lint summary step counts each problem line", () => {
    const { status, summary } = runLintSummary(
      "/x/src/a.ts\n  2:14  error  Money must be integer minor units  fo/no-float-money\n  1:1  warning  has no effect\n",
    );
    expect(status).toBe(0);
    expect(summary).toContain("success, 2 problem(s)");
  });

  it("goes red when the unit suite is narrowed", () => {
    expect(
      ac61Violations(
        ci,
        withScripts({ "test:coverage": "vitest run --project unit --changed" }),
      ),
    ).toEqual([
      "package.json: test:coverage is not the whole unit suite (vitest run --project unit --changed)",
    ]);
  });
});

/**
 * Spec 040 AC-29, T-27's `cloudflare-check` half (TASK-100): the job exists, `needs: typecheck`,
 * runs nightly as well as on pull requests and pushes, checks the zone on a pull request only
 * when `config/cloudflare/**` changed or `ci:full` is present, and fails rather than passes when
 * the two secrets are absent.
 */
describe("the cloudflare-check job (spec 040 AC-29, T-27)", () => {
  const job = ci.jobs["cloudflare-check"];
  const steps = job?.steps ?? [];
  const scheduleContext = githubContext({
    event_name: "schedule",
    ref: "refs/heads/main",
    event: {},
  });

  it("exists, `needs: typecheck`, and carries no job-level `if:`", () => {
    expect(job?.name).toBe("cloudflare-check");
    expect(job?.needs).toBe("typecheck");
    expect(job?.if).toBeUndefined();
  });

  it("runs nightly: the one `schedule` trigger starts it on main", () => {
    expect(ci.on?.["schedule"]).toEqual([{ cron: "17 3 * * *" }]);
    expect(jobSet(scheduleContext)).toContain("cloudflare-check");
  });

  it("starts on every other event too: push, dispatch, and pull requests with and without the label", () => {
    for (const context of [
      pushContext,
      dispatchContext,
      pullRequestContext([]),
      pullRequestContext(["ci:full"]),
    ]) {
      expect(jobSet(context)).toContain("cloudflare-check");
    }
  });

  it("puts the spine, the jobs with no `if:` and nothing else on the nightly run", () => {
    expect(jobSet(scheduleContext)).toEqual([
      "lint",
      "typecheck",
      "test-unit",
      "build",
      "container",
      "cloudflare-check",
      "lighthouse",
    ]);
  });

  it("runs `pnpm cloudflare:check --require-token` with the two secrets, gated on the scope step", () => {
    const check = steps.find((step) => step.id === "zone");
    expect(check?.run).toBe(
      "pnpm cloudflare:check --require-token 2>&1 | tee cloudflare-check.log",
    );
    expect(check?.if).toBe("steps.scope.outputs.run == 'true'");
    expect(check?.env).toEqual({
      CLOUDFLARE_API_TOKEN: "${{ secrets.CLOUDFLARE_API_TOKEN }}",
      CLOUDFLARE_ZONE_ID: "${{ secrets.CLOUDFLARE_ZONE_ID }}",
    });
    const pkg = JSON.parse(read("package.json")) as PackageScripts;
    expect(pkg.scripts["cloudflare:check"]).toBe(
      "node scripts/cloudflare/apply-zone-settings.ts --check",
    );
    expect(pkg.scripts["cloudflare:apply"]).toBe(
      "node scripts/cloudflare/apply-zone-settings.ts",
    );
  });

  it("fails, naming both secrets, when GitHub hands it empty ones: it never passes on `skipped`", () => {
    // An absent repository secret interpolates to the empty string, not to an unset variable.
    const result = spawnSync(
      process.execPath,
      [
        "scripts/cloudflare/apply-zone-settings.ts",
        "--check",
        "--require-token",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          PATH: process.env["PATH"] ?? "",
          NODE_ENV: "test",
          CLOUDFLARE_API_TOKEN: "",
          CLOUDFLARE_ZONE_ID: "",
        },
      },
    );
    expect(result.status).toBe(2);
    expect(result.stdout).not.toContain("skipped");
    expect(result.stderr).toContain(
      "cloudflare:check needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID, and neither is set.",
    );
  });

  /**
   * /break 126 holes 1 and 2: the zone step fails the job on drift only while nothing turns its
   * failure into a pass. `continue-on-error` (step or job) makes a failed step a green job, and a
   * `shell:` on the step or a job `defaults` replaces the workflow's `bash` (with `pipefail`), so
   * `pnpm cloudflare:check … | tee` would exit with `tee`'s 0.
   */
  describe("fails the job when the zone check fails", () => {
    const zoneStepOf = (workflow: Workflow): Step => {
      const step = workflow.jobs["cloudflare-check"]?.steps.find(
        (candidate) => candidate.id === "zone",
      );
      expect(step?.run).toBe(
        "pnpm cloudflare:check --require-token 2>&1 | tee cloudflare-check.log",
      );
      return step ?? {};
    };
    const mutated = (change: (workflow: Workflow) => void): Workflow => {
      const workflow = parse(read(".github/workflows/ci.yml")) as Workflow;
      change(workflow);
      return workflow;
    };

    it("has no continue-on-error, no step shell and no job defaults, under the workflow's bash", () => {
      expect(cloudflareCheckViolations(ci)).toEqual([]);
    });

    it("goes red when the zone step gets continue-on-error", () => {
      const workflow = mutated((w) => {
        zoneStepOf(w)["continue-on-error"] = true;
      });
      expect(cloudflareCheckViolations(workflow)).toEqual([
        "cloudflare-check: step zone has continue-on-error",
      ]);
    });

    it("goes red when the job gets continue-on-error", () => {
      const workflow = mutated((w) => {
        const job = w.jobs["cloudflare-check"];
        if (job) job["continue-on-error"] = true;
      });
      expect(cloudflareCheckViolations(workflow)).toEqual([
        "cloudflare-check: the job has continue-on-error",
      ]);
    });

    it("goes red when the zone step sets its own shell", () => {
      const workflow = mutated((w) => {
        zoneStepOf(w).shell = "bash {0}";
      });
      expect(cloudflareCheckViolations(workflow)).toEqual([
        "cloudflare-check: step zone sets shell: bash {0}",
      ]);
    });

    it("goes red when the job sets defaults", () => {
      const workflow = mutated((w) => {
        const job = w.jobs["cloudflare-check"];
        if (job) job.defaults = { run: { shell: "sh" } };
      });
      expect(cloudflareCheckViolations(workflow)).toEqual([
        'cloudflare-check: the job sets defaults {"run":{"shell":"sh"}}; the top-level bash with pipefail must apply',
      ]);
    });

    it("exits non-zero when `pnpm cloudflare:check` does, run under the step's effective shell", () => {
      const root = mkdtempSync(join(tmpdir(), "fo-cloudflare-zone-step-"));
      try {
        const bin = join(root, "bin");
        mkdirSync(bin);
        const pnpm = join(bin, "pnpm");
        writeFileSync(
          pnpm,
          '#!/bin/sh\necho "cloudflare:check: ssl differs"\nexit 1\n',
        );
        chmodSync(pnpm, 0o755);
        const step = zoneStepOf(ci);
        const script = join(root, "zone.sh");
        writeFileSync(script, step.run ?? "exit 0");
        const job = ci.jobs["cloudflare-check"];
        const [command, ...args] = shellArgv(
          step.shell ?? job?.defaults?.run?.shell ?? ci.defaults?.run?.shell,
          script,
        );
        const result = spawnSync(command ?? "false", args, {
          cwd: root,
          encoding: "utf8",
          env: {
            PATH: `${bin}:${process.env["PATH"] ?? ""}`,
            NODE_ENV: "test",
          },
        });
        expect(result.status).toBe(1);
        expect(readFileSync(join(root, "cloudflare-check.log"), "utf8")).toBe(
          "cloudflare:check: ssl differs\n",
        );
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  });

  /**
   * /break 126 holes 4 and 8: every case runs in a checkout shaped like `actions/checkout@v4`'s —
   * a fresh repository that fetched one commit at depth 1 from its origin — never in a full clone
   * or outside a repository. On a pull request that commit is GitHub's merge commit
   * (`refs/pull/1/merge`, first parent the base branch); on a push it is `main`'s tip. In every
   * pull request below, `main` also moved after the branch point and changed a file under
   * `config/cloudflare/`, which must not count as the pull request's change.
   */
  describe("the scope step, run as the runner runs it", () => {
    const scope = steps.find((step) => step.id === "scope");
    const roots: string[] = [];
    afterAll(() => {
      for (const root of roots) rmSync(root, { recursive: true, force: true });
    });
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

    const commit = (
      repo: string,
      files: readonly string[],
      message: string,
    ): void => {
      for (const file of files) {
        mkdirSync(join(repo, file, ".."), { recursive: true });
        writeFileSync(join(repo, file), `${message}\n`);
      }
      git(repo, "add", "-A");
      git(repo, "commit", "--quiet", "-m", message);
    };

    /** An origin whose `main` holds the declaration, serving reachable SHAs as GitHub does. */
    const origin = (): { root: string; origin: string } => {
      const root = mkdtempSync(join(tmpdir(), "fo-cloudflare-scope-"));
      roots.push(root);
      const repo = join(root, "origin");
      mkdirSync(repo);
      git(repo, "init", "--quiet", "--initial-branch=main");
      git(repo, "config", "uploadpack.allowReachableSHA1InWant", "true");
      commit(
        repo,
        ["README.md", "config/cloudflare/zone-settings.json"],
        "chore: base",
      );
      return { root, origin: repo };
    };

    /** `git merge --no-ff topic` onto `main`, kept only as `ref` (GitHub's merge ref) or as `main`. */
    const mergeTopic = (repo: string, ref: string): void => {
      git(repo, "checkout", "--quiet", "-b", "merge-tmp", "main");
      git(repo, "merge", "--quiet", "--no-ff", "--no-edit", "topic");
      git(repo, "update-ref", ref, "HEAD");
      git(repo, "checkout", "--quiet", "main");
      git(repo, "branch", "--quiet", "-D", "merge-tmp");
    };

    /** What `actions/checkout@v4` does: a new repository, one commit fetched at depth 1. */
    const ciCheckout = (root: string, repo: string, ref: string): string => {
      const sha = git(repo, "rev-parse", ref);
      const checkout = join(root, "checkout");
      mkdirSync(checkout);
      git(checkout, "init", "--quiet");
      git(checkout, "remote", "add", "origin", `file://${repo}`);
      git(
        checkout,
        "fetch",
        "--quiet",
        "--no-tags",
        "--depth=1",
        "origin",
        `+${sha}:refs/remotes/pull/1/merge`,
      );
      git(checkout, "checkout", "--quiet", "--detach", sha);
      expect(git(checkout, "rev-parse", "--is-shallow-repository")).toBe(
        "true",
      );
      return checkout;
    };

    /** A pull request changing `changed` off `main`, checked out as its merge commit (or `as`). */
    const pullRequest = (
      changed: readonly string[],
      as: "merge" | "head" = "merge",
    ): { root: string; origin: string; checkout: string } => {
      const { root, origin: repo } = origin();
      git(repo, "checkout", "--quiet", "-b", "topic");
      commit(repo, changed, "feat: change");
      git(repo, "checkout", "--quiet", "main");
      commit(
        repo,
        ["config/cloudflare/main-only.json"],
        "chore: main moves on",
      );
      mergeTopic(repo, "refs/pull/1/merge");
      const ref = as === "merge" ? "refs/pull/1/merge" : "refs/heads/topic";
      return { root, origin: repo, checkout: ciCheckout(root, repo, ref) };
    };

    /** `main` whose tip merged a docs-only branch: the commit a push run checks out. */
    const pushToMain = (): string => {
      const { root, origin: repo } = origin();
      git(repo, "checkout", "--quiet", "-b", "topic");
      commit(repo, ["docs/note.md"], "docs: note");
      git(repo, "checkout", "--quiet", "main");
      mergeTopic(repo, "refs/heads/main");
      git(repo, "reset", "--quiet", "--hard", "main");
      return ciCheckout(root, repo, "refs/heads/main");
    };

    const runScope = (
      cwd: string,
      env: Record<string, string>,
    ): { output: string; reason: string } => {
      const output = join(cwd, "..", "step-output.txt");
      writeFileSync(output, "");
      const script = join(cwd, "..", "scope.sh");
      writeFileSync(script, scope?.run ?? "exit 1");
      const result = spawnSync(
        "bash",
        ["--noprofile", "--norc", "-eo", "pipefail", script],
        {
          cwd,
          encoding: "utf8",
          env: {
            PATH: process.env["PATH"] ?? "",
            NODE_ENV: "test",
            GITHUB_OUTPUT: output,
            ...env,
          },
        },
      );
      expect(result.status, result.stderr).toBe(0);
      return {
        output: readFileSync(output, "utf8").trim(),
        reason: readFileSync(join(cwd, "scope.txt"), "utf8").trim(),
      };
    };
    const unlabelled = { EVENT_NAME: "pull_request", FULL_LABEL: "false" };

    it("passes no base ref to the step: it reads the merge commit, not a merge base", () => {
      expect(scope?.env).toEqual({
        EVENT_NAME: "${{ github.event_name }}",
        FULL_LABEL:
          "${{ contains(github.event.pull_request.labels.*.name, 'ci:full') }}",
      });
    });

    it("checks on a push, a dispatch and the nightly schedule, on main's merge-commit tip", () => {
      for (const event of ["push", "workflow_dispatch", "schedule"]) {
        expect(
          runScope(pushToMain(), { EVENT_NAME: event, FULL_LABEL: "false" }),
          event,
        ).toEqual({
          output: "run=true",
          reason: `A \`${event}\` run checks the zone unconditionally.`,
        });
      }
    });

    it("checks a pull request labelled `ci:full` whatever it changed", () => {
      expect(
        runScope(pullRequest(["docs/note.md"]).checkout, {
          EVENT_NAME: "pull_request",
          FULL_LABEL: "true",
        }),
      ).toEqual({
        output: "run=true",
        reason: "The `ci:full` label is present, so the zone is checked.",
      });
    });

    it("checks an unlabelled pull request that changes any file under config/cloudflare/", () => {
      for (const changed of [
        "config/cloudflare/zone-settings.json",
        "config/cloudflare/README.md",
        "config/cloudflare/rules/redirects.json",
      ]) {
        expect(
          runScope(pullRequest([changed, "docs/note.md"]).checkout, unlabelled),
          changed,
        ).toEqual({
          output: "run=true",
          reason: `The zone declaration changed:\n\n\`\`\`\n${changed}\n\`\`\``,
        });
      }
    });

    it("skips an unlabelled pull request that changes anything else, a look-alike path included", () => {
      for (const changed of ["docs/note.md", "config/cloudflare-notes.json"]) {
        expect(
          runScope(pullRequest([changed]).checkout, unlabelled),
          changed,
        ).toEqual({
          output: "run=false",
          reason:
            "No file under `config/cloudflare/` changed and the `ci:full` label is absent; the zone was not checked.",
        });
      }
    });

    it("checks anyway when the checkout is not a merge commit, or its parents cannot be fetched", () => {
      const notMerge = pullRequest(["docs/note.md"], "head");
      const unreachable = pullRequest(["docs/note.md"]);
      rmSync(unreachable.origin, { recursive: true, force: true });
      for (const checkout of [notMerge.checkout, unreachable.checkout]) {
        expect(runScope(checkout, unlabelled)).toEqual({
          output: "run=true",
          reason:
            "The checkout is not the pull request's merge commit, so what it changes is unknown and the zone is checked anyway.",
        });
      }
    });
  });
});

/**
 * /break 126 holes 1 and 2: what would let `cloudflare-check` pass while its zone step failed.
 * The same rules `ac61Violations` applies to the `lint` job, for this job.
 */
function cloudflareCheckViolations(workflow: Workflow): string[] {
  const violations: string[] = [];
  const job = workflow.jobs["cloudflare-check"];
  if (job === undefined) return ["cloudflare-check: no such job"];
  if (workflow.defaults?.run?.shell !== "bash")
    violations.push(
      `workflow: defaults.run.shell is ${JSON.stringify(workflow.defaults?.run?.shell)}, not bash`,
    );
  if (job["continue-on-error"] !== undefined)
    violations.push("cloudflare-check: the job has continue-on-error");
  if (job.defaults !== undefined)
    violations.push(
      `cloudflare-check: the job sets defaults ${JSON.stringify(job.defaults)}; the top-level bash with pipefail must apply`,
    );
  for (const step of job.steps) {
    const label = step.id ?? step.name ?? step.uses ?? "(unnamed)";
    if (step["continue-on-error"] !== undefined)
      violations.push(`cloudflare-check: step ${label} has continue-on-error`);
    if (step.shell !== undefined)
      violations.push(
        `cloudflare-check: step ${label} sets shell: ${step.shell}`,
      );
  }
  return violations;
}

/** The argv GitHub's Linux runner uses for a `shell:` value (docs: "Using a specific shell"). */
function shellArgv(shell: string | undefined, script: string): string[] {
  switch (shell) {
    case undefined:
      return ["bash", "-e", script];
    case "bash":
      return ["bash", "--noprofile", "--norc", "-eo", "pipefail", script];
    case "sh":
      return ["sh", "-e", script];
    default:
      if (shell.includes("{0}"))
        return shell
          .split(/\s+/)
          .map((part) => (part === "{0}" ? script : part));
      throw new Error(`unknown shell ${shell}`);
  }
}
