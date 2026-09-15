/**
 * T-24 / AC-23, repository half (TASK-009).
 *
 * The other half of T-24 is the `lighthouse` CI job running `lhci autorun` against the preview
 * `/` — that cannot be asserted from a unit test. What can be asserted, and would otherwise rot
 * silently, is that `lighthouserc.json` still encodes the `plan/01` §7 budgets as **errors** and
 * nothing else, that the URL list is a non-empty set of root-relative paths, and that the CI job
 * is wired the way §13 Q4 decided (runs on every PR, informational until spec 004).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  collectUrlArgs,
  DEFAULT_BASE_URL,
  lighthouseUrlsSchema,
  parseUrlList,
  resolveBaseUrl,
} from "../../scripts/seo/lighthouse-urls";

const repoRoot = resolve(__dirname, "../..");
const read = (relative: string): string =>
  readFileSync(resolve(repoRoot, relative), "utf8");

interface LighthouseRc {
  "//"?: string[];
  ci: {
    collect: {
      numberOfRuns?: number;
      settings?: { formFactor?: string; throttlingMethod?: string };
    };
    assert: { assertions: Record<string, unknown> };
    upload: { target?: string; outputDir?: string };
  };
}

const rc = JSON.parse(read("lighthouserc.json")) as LighthouseRc;

describe("lighthouserc.json budgets (AC-23)", () => {
  it("asserts exactly the plan/01 §7 budgets, all as errors", () => {
    expect(rc.ci.assert.assertions).toEqual({
      "categories:performance": ["error", { minScore: 0.95 }],
      // TASK-056: AC-24 names three categories, not one. `accessibility` and `best-practices`
      // were collected and never asserted, so a 404 favicon and an axe regression were both
      // invisible to the gate that publishes their scores.
      "categories:accessibility": ["error", { minScore: 0.95 }],
      "categories:best-practices": ["error", { minScore: 0.95 }],
      "largest-contentful-paint": ["error", { maxNumericValue: 2000 }],
      "cumulative-layout-shift": ["error", { maxNumericValue: 0.05 }],
      // 120 KB and 200 KB in bytes: **transfer** size, i.e. Brotli over the wire on Vercel
      // (spec 004 §13 Q13's restatement; the `//` note in the file spells it out).
      // 128 KB Brotli: spec 004 §13 Q13's restatement as corrected by §14 A1 (TASK-050 carried
      // the number here and into `scripts/client-js-budget.ts`; the job stays informational until
      // TASK-056 flips it).
      "resource-summary:script:size": ["error", { maxNumericValue: 131072 }],
      "resource-summary:image:size": ["error", { maxNumericValue: 204800 }],
    });
  });

  it("collects three mobile runs, so one noisy run cannot fail or pass the PR", () => {
    expect(rc.ci.collect.numberOfRuns).toBe(3);
    expect(rc.ci.collect.settings?.formFactor).toBe("mobile");
    expect(rc.ci.collect.settings?.throttlingMethod).toBe("simulate");
  });

  it("keeps reports on the filesystem rather than temporary public storage", () => {
    // The preview is behind Deployment Protection; uploading its report to
    // `temporary-public-storage` would publish a copy of a protected deployment.
    expect(rc.ci.upload.target).toBe("filesystem");
    expect(rc.ci.upload.outputDir).toContain(".lighthouseci");
  });

  it("pins no URL in the config: the list is data (spec 007 extends it)", () => {
    expect(JSON.stringify(rc.ci.collect)).not.toContain("url");
  });

  /**
   * TASK-046. JSON has no comments and this file carries two decisions a reader will otherwise
   * get wrong: which encoding `resource-summary:script:size` counts, and why `categories:seo` is
   * collected but not asserted. Both are recorded in a `//` key, which `@lhci/cli` ignores
   * because it reads `.ci`; the test is here so the note cannot be deleted with the reasoning.
   */
  describe("the `//` note (spec 004 §13 Q13, AC-24)", () => {
    const note = (rc["//"] ?? []).join(" ");

    it("says the script budget is transfer size, and Brotli on Vercel", () => {
      expect(note).toMatch(/transfer/i);
      expect(note).toContain("Brotli");
      expect(note).toContain("131 072");
      expect(note).toContain("§13 Q13");
      // The correction, not just the original restatement (spec 004 §14 A1, TASK-050).
      expect(note).toContain("§14 A1");
    });

    it("records the `noindex` reason for not asserting categories:seo", () => {
      expect(note).toContain("categories:seo");
      expect(note).toContain("noindex");
      expect(rc.ci.assert.assertions["categories:seo"]).toBeUndefined();
    });

    it("is read by nothing: the config the CLI consumes is `ci`", () => {
      expect(Object.keys(rc).sort()).toEqual(["//", "ci"]);
    });
  });
});

describe("tests/fixtures/seo/lighthouse-urls.json (AC-23)", () => {
  const raw = read("tests/fixtures/seo/lighthouse-urls.json");

  it("is a non-empty array of root-relative paths", () => {
    const parsed = lighthouseUrlsSchema.safeParse(JSON.parse(raw));
    expect(parsed.success).toBe(true);
    expect(parsed.data?.length).toBeGreaterThan(0);
    for (const path of parsed.data ?? []) {
      expect(path.startsWith("/")).toBe(true);
      expect(path.startsWith("//")).toBe(false);
    }
  });

  it("measures the chooser and all four locale homes (spec 004 AC-24)", () => {
    // AC-27 words the budget as "`/` and `/en`"; `/de` is measured too because it is the locale
    // whose catalogue is an unreviewed echo — the one whose document could differ from `/en` by
    // accident rather than by design. Spec 004 §2 extends the list to all four launch locales.
    expect(parseUrlList(raw)).toEqual(["/", "/en", "/en-gb", "/de", "/pl"]);
  });

  it("rejects an empty list and an absolute URL", () => {
    expect(lighthouseUrlsSchema.safeParse([]).success).toBe(false);
    expect(
      lighthouseUrlsSchema.safeParse(["https://example.test/"]).success,
    ).toBe(false);
    expect(lighthouseUrlsSchema.safeParse(["//example.test/"]).success).toBe(
      false,
    );
  });
});

describe("lighthouse-urls base URL resolution", () => {
  it("prefers LHCI_BASE_URL, then PLAYWRIGHT_BASE_URL, then localhost", () => {
    expect(
      resolveBaseUrl({
        LHCI_BASE_URL: "https://lhci.test",
        PLAYWRIGHT_BASE_URL: "https://preview.test",
      }),
    ).toBe("https://lhci.test");
    expect(
      resolveBaseUrl({ PLAYWRIGHT_BASE_URL: "https://preview.test/" }),
    ).toBe("https://preview.test");
    expect(resolveBaseUrl({})).toBe(DEFAULT_BASE_URL);
  });

  it("emits one --collect.url argument per path", () => {
    expect(collectUrlArgs("https://preview.test", ["/", "/de/"])).toEqual([
      "--collect.url=https://preview.test/",
      "--collect.url=https://preview.test/de/",
    ]);
  });
});

describe("ci.yml lighthouse and seo-validate jobs (AC-22, AC-23)", () => {
  const ci = read(".github/workflows/ci.yml");

  it("runs the three validators in a job gated on typecheck", () => {
    expect(ci).toMatch(/ {2}seo-validate:\n[\s\S]*?needs: typecheck/);
    expect(ci).toContain("pnpm seo:validate");
  });

  it("measures this repository's own bytes, Brotli-encoded, not a preview (AC-24)", () => {
    // TASK-056's answer to the question `lighthouserc.json` left open: `resource-summary:script:
    // size` is transfer size, `next start` sends gzip and a protected preview sends Brotli plus
    // tens of KB of `vercel.live` that is in no build output of ours. So the job builds, serves
    // and measures itself.
    const job = ci.slice(ci.indexOf("  lighthouse:"));
    expect(job).toMatch(/needs: build/);
    expect(job).toContain("pnpm lighthouse:origin");
    expect(job).toContain("LHCI_BASE_URL: http://127.0.0.1:3001");
    expect(job).toContain("lighthouserc.json");
    expect(job).not.toContain("needs.preview.outputs.preview_url");
  });

  it("blocks: the `lighthouse` job carries no continue-on-error (AC-24)", () => {
    // Spec 001 §13 Q4 made the job informational "until spec 004"; spec 003 §14 A12 recorded the
    // measured reason a date was not enough. TASK-056 is the flip, and this is the assertion that
    // it cannot come back by accident.
    const job = ci.slice(ci.indexOf("  lighthouse:"));
    const nextJob = job.indexOf("\n  ", job.indexOf("steps:"));
    expect(job.slice(0, nextJob === -1 ? undefined : nextJob)).not.toContain(
      "continue-on-error",
    );
  });

  it("writes the per-URL table spec 004 §11 asks for, so a regression names its locale", () => {
    const job = ci.slice(ci.indexOf("  lighthouse:"));
    expect(job).toContain(
      "| URL | perf | a11y | best-practices | LCP (ms) | CLS | script (B, br) |",
    );
    expect(job).toContain("largest-contentful-paint");
    expect(job).toContain("resource-summary");
  });

  it("writes the step summary after the run, not before it", () => {
    // A summary printed before `lhci autorun` cannot know what the run found, so the old
    // "the step result below is the honest verdict" wording must not come back.
    expect(ci).not.toContain("honest verdict");
    const job = ci.slice(ci.indexOf("  lighthouse:"));
    const runIndex = job.indexOf(
      "name: Run Lighthouse CI against the Brotli origin",
    );
    const summaryIndex = job.indexOf(
      "name: Summarise what Lighthouse actually measured",
    );
    expect(runIndex).toBeGreaterThan(-1);
    expect(summaryIndex).toBeGreaterThan(runIndex);
    expect(job.slice(summaryIndex)).toMatch(/^[\s\S]{0,200}if: always\(\)/);
  });

  it("still distinguishes a NO_FCP run from a budget verdict", () => {
    // `/` paints since TASK-035, so `NO_FCP` is no longer the expected outcome — but it is still
    // the one outcome that must not be read as a verdict, so the branch and its wording stay.
    expect(ci).toContain("NO_FCP");
    expect(ci).toContain(
      "**No budget was measured: this is neither a budget breach nor a pass.**",
    );
  });

  it("treats an empty .lighthouseci/ as expected, not as a warning", () => {
    const job = ci.slice(ci.indexOf("  lighthouse:"));
    expect(job).toContain("if-no-files-found: ignore");
    expect(job).not.toContain("if-no-files-found: warn");
  });

  it("needs no deployment secret at all now that it serves what it measures", () => {
    // The bypass header was how the job reached a protected preview. It measures a local origin
    // since TASK-056, so the secret is neither needed nor present in this job — one fewer place a
    // secret can leak into a log line. The Playwright jobs still carry it.
    const job = ci.slice(ci.indexOf("  lighthouse:"));
    expect(job).not.toContain("VERCEL_AUTOMATION_BYPASS_SECRET");
    expect(job).not.toContain("x-vercel-protection-bypass");
    expect(ci).toContain("x-vercel-protection-bypass");
  });
});
