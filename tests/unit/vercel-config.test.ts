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
 * is blocking again. TASK-099 is that task: the evidence step is deleted, and what is left here
 * pins only that it stays deleted.
 */
describe("ci.yml preview gate (AC-29 / T-30)", () => {
  const workflow = parse(read(".github/workflows/ci.yml")) as Workflow;
  const preview = workflow.jobs["preview"];
  const steps = preview?.steps ?? [];
  it("declares a preview job that runs on labelled pull requests only (spec 001 §14 A14)", () => {
    expect(preview).toBeDefined();
    expect(preview?.name).toBe("preview");
    // A manual `workflow_dispatch` has no pull request to deploy, so the preview chain is gated on
    // both the event and the `ci:full` label the orchestrator adds when the run is worth its minutes.
    expect(preview?.if).toBe(
      "github.event_name == 'pull_request' && contains(github.event.pull_request.labels.*.name, 'ci:full')",
    );
  });

  it("no longer probes Vercel at all: AC-26 probes the Railway PR environment, blocking (spec 040 §14 A2 clause 1; TASK-099)", () => {
    // The `continue-on-error` evidence step is deleted in the AC-26 task's PR, "not left beside
    // it". What replaced it is pinned in `tests/unit/ci-workflow.test.ts`.
    const script = steps.map((step) => step.run ?? "").join("\n");
    expect(script).not.toContain("gh api");
    expect(script).not.toContain("x-vercel-id");
    expect(script).not.toContain("VERCEL_AUTOMATION_BYPASS_SECRET");
    expect(preview?.permissions?.["deployments"]).toBeUndefined();
    expect(script).toContain("scripts/railway-preview.ts --assert");
  });
});
