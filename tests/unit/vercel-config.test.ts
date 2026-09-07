/**
 * Hosting configuration, code half of AC-29 (TASK-007).
 *
 * T-30 itself is a manual reviewer check against a real preview deployment; these tests pin the
 * two things that live in the repository and would otherwise silently regress: the `fra1` region
 * pin (spec 001 §5 "Hosting", §8 "Data residency") and the `preview` CI gate that asserts
 * Deployment Protection, the region and `X-Robots-Tag: noindex` on every preview.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

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

describe("ci.yml preview gate (AC-29 / T-30)", () => {
  const ci = read(".github/workflows/ci.yml");

  it("declares a preview job that runs on pull requests only", () => {
    expect(ci).toContain("  preview:");
    expect(ci).toMatch(
      /preview:\n[\s\S]*if: github\.event_name == 'pull_request'/,
    );
  });

  it("reads deployments to find the preview URL for the PR head SHA", () => {
    expect(ci).toContain("deployments: read");
    expect(ci).toContain("gh api");
    expect(ci).toContain("environment_url");
    expect(ci).toContain("pull_request.head.sha");
  });

  it("exports the preview URL as a job output and to the step summary", () => {
    expect(ci).toMatch(/outputs:\n\s+preview_url:/);
    expect(ci).toContain("GITHUB_STEP_SUMMARY");
  });

  it("asserts Deployment Protection blocks an unauthenticated request", () => {
    expect(ci).toContain("/api/health");
    expect(ci).toContain("401|403");
  });

  it("accepts the Vercel Authentication redirect to vercel.com/sso-api as protected", () => {
    // Vercel Authentication answers a plain GET with a 302 to the SSO endpoint, not 401/403.
    expect(ci).toContain("301|302|303|307|308");
    expect(ci).toContain(
      "https://vercel.com/sso-api|https://vercel.com/sso-api[?/]*",
    );
    // A redirect to any other location, and a 200, must still fail.
    expect(ci).toMatch(
      /::error::[^\n]*without the bypass header returned \$unprotected_status redirecting to/,
    );
  });

  it("asserts fra1 as a '::' segment of x-vercel-id, not as its prefix", () => {
    expect(ci).toContain("x-vercel-id");
    expect(ci).toContain('*"::fra1::"*');
    expect(ci).not.toContain("fra1*)");
  });

  it("asserts noindex and 200 with the protection-bypass header", () => {
    expect(ci).toContain("x-vercel-protection-bypass");
    expect(ci).toContain("secrets.VERCEL_AUTOMATION_BYPASS_SECRET");
    expect(ci).toContain("X-Robots-Tag");
    expect(ci.toLowerCase()).toContain("noindex");
  });

  it("fails loudly, naming the secret, instead of skipping when it is unset", () => {
    expect(ci).toMatch(
      /::error::[^\n]*VERCEL_AUTOMATION_BYPASS_SECRET[^\n]*\n/,
    );
  });
});
