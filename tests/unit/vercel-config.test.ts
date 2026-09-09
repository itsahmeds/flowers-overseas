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

describe("ci.yml preview gate (AC-29 / T-30)", () => {
  const workflow = parse(read(".github/workflows/ci.yml")) as Workflow;
  const preview = workflow.jobs["preview"];
  /** Only the shell of the `preview` job's steps: no comment and no other job can satisfy these. */
  const script = (preview?.steps ?? [])
    .map((step) => step.run ?? "")
    .join("\n");

  it("declares a preview job that runs on labelled pull requests only (spec 001 §14 A14)", () => {
    expect(preview).toBeDefined();
    expect(preview?.name).toBe("preview");
    // A manual `workflow_dispatch` has no pull request to deploy, so the preview chain is gated on
    // both the event and the `ci:full` label the orchestrator adds when the run is worth its minutes.
    expect(preview?.if).toBe(
      "github.event_name == 'pull_request' && contains(github.event.pull_request.labels.*.name, 'ci:full')",
    );
  });

  it("reads deployments to find the preview URL for the PR head SHA", () => {
    expect(preview?.permissions?.["deployments"]).toBe("read");
    expect(script).toContain("gh api");
    expect(script).toContain("environment_url");
    const env = (preview?.steps ?? []).flatMap((step) =>
      Object.values(step.env ?? {}),
    );
    expect(env.join("\n")).toContain("pull_request.head.sha");
  });

  it("exports the preview URL as a job output and to the step summary", () => {
    expect(preview?.outputs?.["preview_url"]).toBe(
      "${{ steps.wait.outputs.preview_url }}",
    );
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
    // A redirect to any other location, and a 200, must still fail.
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
    const secrets = (preview?.steps ?? [])
      .flatMap((step) => Object.values(step.env ?? {}))
      .join("\n");
    expect(secrets).toContain("secrets.VERCEL_AUTOMATION_BYPASS_SECRET");
    expect(script).toContain("X-Robots-Tag");
    expect(script.toLowerCase()).toContain("noindex");
  });

  it("fails loudly, naming the secret, instead of skipping when it is unset", () => {
    expect(script).toMatch(/::error::[^\n]*VERCEL_AUTOMATION_BYPASS_SECRET/);
  });

  it("hands the resolved URL to the browser jobs rather than letting them guess", () => {
    for (const name of ["e2e", "visual", "a11y", "lighthouse"]) {
      const job = workflow.jobs[name];
      expect(job?.needs).toBe("preview");
      expect(job?.env?.["PLAYWRIGHT_BASE_URL"]).toBe(
        "${{ needs.preview.outputs.preview_url }}",
      );
    }
  });
});
