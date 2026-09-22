/**
 * Hosting configuration, code half of AC-29 (TASK-007).
 *
 * T-30 itself is a manual reviewer check against a real preview deployment; these tests pin the
 * two things that live in the repository and would otherwise silently regress: the `fra1` region
 * pin (spec 001 §5 "Hosting", §8 "Data residency") and the `preview` CI gate that asserts
 * Deployment Protection, the region and `X-Robots-Tag: noindex` on every preview.
 *
 * The workflow is **parsed as YAML** (TASK-011, carried from the review of PR #7): the earlier
 * version of this file matched substrings against the whole file, so an assertion about the
 * `preview` job would have been satisfied by the same text appearing in a comment or in any other
 * job. Everything below is scoped to the `preview` job's own steps.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const repoRoot = resolve(__dirname, "../..");
const read = (relative: string): string =>
  readFileSync(resolve(repoRoot, relative), "utf8");

interface VercelConfig {
  $schema?: string;
  framework?: string;
  regions?: string[];
}

describe("vercel.json (AC-29)", () => {
  const config = JSON.parse(read("vercel.json")) as VercelConfig;

  it("pins the function region to fra1 for EU data residency", () => {
    expect(config.regions).toEqual(["fra1"]);
  });

  it("declares the Next.js framework preset and the schema", () => {
    expect(config.framework).toBe("nextjs");
    expect(config.$schema).toBe("https://openapi.vercel.sh/vercel.json");
  });

  it("stays minimal: no other keys, so dashboard settings are not shadowed", () => {
    expect(Object.keys(config).sort()).toEqual([
      "$schema",
      "framework",
      "regions",
    ]);
  });
});

interface WorkflowStep {
  name?: string;
  uses?: string;
  run?: string;
  id?: string;
  "continue-on-error"?: boolean;
  env?: Record<string, string>;
  with?: Record<string, string>;
}

interface WorkflowJob {
  name?: string;
  if?: string;
  needs?: string | string[];
  outputs?: Record<string, string>;
  permissions?: Record<string, string>;
  env?: Record<string, string>;
  steps: WorkflowStep[];
}

interface Workflow {
  jobs: Record<string, WorkflowJob>;
}

/**
 * The `preview` job's Vercel probe (AC-29 / T-30), as TASK-137 left it.
 *
 * Until 2026-09-21 the whole job was this probe: find the Vercel preview deployment for the head
 * SHA and hand its URL to `e2e`, `visual` and `a11y`. On this repository that deployment answers
 * `/api/health` with 500 — ADR-0018 keeps the Vercel project as a cold fallback with an empty
 * environment store — so the three suites never ran at all (PRs 84, 85, 87). The origin the
 * suites use is CI's own since TASK-137 (`tests/unit/ci-workflow.test.ts` pins that half), and
 * what survives here is the AC-29 evidence: the same three assertions about Deployment
 * Protection, the `fra1` function region and `X-Robots-Tag: noindex`, made against whatever
 * Vercel deployed and reported in the step summary — but no longer able to deny four suites an
 * origin. The `Vercel` check itself still sits on the pull request and still means what it says.
 *
 * Since 2026-09-21 that demotion has a spec behind it rather than only a workflow comment:
 * **spec 001 §14 A18 supersedes AC-29 / T-30**, and spec 040 §14 A2 puts the three properties —
 * authentication in front of a non-production environment, an Amsterdam origin, and
 * `X-Robots-Tag: noindex` — on spec 040 AC-26, against the Railway PR environment, where the probe
 * is blocking again. So the assertions below are deliberately assertions about *evidence*: they
 * pin that the step records the three facts and cannot fail the job, and the AC they once enforced
 * is enforced by the AC-26 task, not by this file.
 */
describe("ci.yml preview gate (AC-29 / T-30)", () => {
  const workflow = parse(read(".github/workflows/ci.yml")) as Workflow;
  const preview = workflow.jobs["preview"];
  const steps = preview?.steps ?? [];
  /** The Vercel evidence step alone: no comment and no other step can satisfy these. */
  const probe = steps.find((step) => (step.run ?? "").includes("gh api"));
  const script = probe?.run ?? "";

  it("declares a preview job that runs on labelled pull requests only (spec 001 §14 A14)", () => {
    expect(preview).toBeDefined();
    expect(preview?.name).toBe("preview");
    // A manual `workflow_dispatch` has no pull request to deploy, so the preview chain is gated on
    // both the event and the `ci:full` label the orchestrator adds when the run is worth its minutes.
    expect(preview?.if).toBe(
      "github.event_name == 'pull_request' && contains(github.event.pull_request.labels.*.name, 'ci:full')",
    );
  });

  it("reads deployments to find the Vercel URL for the PR head SHA", () => {
    expect(preview?.permissions?.["deployments"]).toBe("read");
    expect(script).toContain("gh api");
    expect(script).toContain("environment_url");
    const env = Object.values(probe?.env ?? {}).join("\n");
    expect(env).toContain("pull_request.head.sha");
  });

  it("cannot block the browser suites, whatever Vercel did (TASK-137)", () => {
    // The measured defect: 45 x 20 s of polling, then a hard failure, then three skipped suites.
    // The probe is now a single short look, marked `continue-on-error`, and its verdict is text.
    expect(probe?.["continue-on-error"]).toBe(true);
    expect(script).toContain("GITHUB_STEP_SUMMARY");
  });

  it("asserts Deployment Protection blocks an unauthenticated request", () => {
    expect(script).toContain("/api/health");
    expect(script).toContain("401|403");
  });

  it("accepts the Vercel Authentication redirect to vercel.com/sso-api as protected", () => {
    // Vercel Authentication answers a plain GET with a 302 to the SSO endpoint, not 401/403.
    expect(script).toContain("301|302|303|307|308");
    expect(script).toContain(
      "https://vercel.com/sso-api|https://vercel.com/sso-api[?/]*",
    );
    // A redirect to any other location, and a 200, must still be reported as a failure.
    expect(script).toMatch(
      /::error::[^\n]*without the bypass header returned \$unprotected_status redirecting to/,
    );
  });

  it("asserts fra1 as a '::' segment of x-vercel-id, not as its prefix", () => {
    expect(script).toContain("x-vercel-id");
    expect(script).toContain('*"::fra1::"*');
    expect(script).not.toContain("fra1*)");
  });

  it("asserts noindex and 200 with the protection-bypass header", () => {
    expect(script).toContain("x-vercel-protection-bypass");
    const secrets = Object.values(probe?.env ?? {}).join("\n");
    expect(secrets).toContain("secrets.VERCEL_AUTOMATION_BYPASS_SECRET");
    expect(script).toContain("X-Robots-Tag");
    expect(script.toLowerCase()).toContain("noindex");
  });

  it("says so in the summary, rather than failing, when there is nothing to probe", () => {
    // Two absences are facts about the platform, not defects in this pull request: no
    // `VERCEL_AUTOMATION_BYPASS_SECRET` in the repository, and no non-production deployment for
    // the head SHA. Both used to fail the job and take the three browser suites with them.
    expect(script).toContain("VERCEL_AUTOMATION_BYPASS_SECRET");
    expect(script).toContain("no non-production Vercel deployment");
  });

  it("hands the CI-owned origin to the browser jobs rather than letting them guess", () => {
    // `lighthouse` is deliberately not in this list since TASK-056: it builds and serves what it
    // measures behind `scripts/seo/brotli-origin.ts`, because the budget is Brotli transfer and a
    // protected preview adds tens of KB of `vercel.live` to the script total (spec 004 AC-24).
    for (const name of ["e2e", "visual", "a11y"]) {
      const job = workflow.jobs[name];
      expect(job?.needs).toBe("preview");
      expect(job?.env?.["PLAYWRIGHT_BASE_URL"]).toBe(
        "${{ needs.preview.outputs.preview_url }}",
      );
    }
  });
});
