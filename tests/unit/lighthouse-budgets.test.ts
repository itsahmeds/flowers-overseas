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
    assert: {
      assertions?: Record<string, unknown>;
      assertMatrix: {
        matchingUrlPattern?: string;
        assertions: Record<string, unknown>;
      }[];
    };
    upload: { target?: string; outputDir?: string };
  };
}

const rc = JSON.parse(read("lighthouserc.json")) as LighthouseRc;

/**
 * The assertions that bind every URL: the matrix entry with no URL pattern (spec 004
 * A-founder-2026-10-18a moved the budgets into `assertMatrix`, because LHCI refuses `assertions`
 * beside it). The script budget is per URL now; `tests/unit/product-script-budget.test.ts` owns it.
 */
const everyUrl =
  rc.ci.assert.assertMatrix.find(
    (entry) => entry.matchingUrlPattern === undefined,
  )?.assertions ?? {};

describe("lighthouserc.json budgets (AC-23)", () => {
  it("asserts exactly the plan/01 §7 budgets, all as errors", () => {
    // `assertions` beside `assertMatrix` makes LHCI throw before it asserts anything.
    expect(rc.ci.assert.assertions).toBeUndefined();
    expect(rc.ci.assert.assertMatrix).toHaveLength(3);
    expect(everyUrl).toEqual({
      "categories:performance": [
        "error",
        { minScore: 0.95, aggregationMethod: "median" },
      ],
      // TASK-056: AC-24 names three categories, not one. `accessibility` and `best-practices`
      // were collected and never asserted, so a 404 favicon and an axe regression were both
      // invisible to the gate that publishes their scores.
      "categories:accessibility": [
        "error",
        { minScore: 0.95, aggregationMethod: "median" },
      ],
      "categories:best-practices": [
        "error",
        { minScore: 0.95, aggregationMethod: "median" },
      ],
      "largest-contentful-paint": [
        "error",
        { maxNumericValue: 2000, aggregationMethod: "median" },
      ],
      "cumulative-layout-shift": [
        "error",
        { maxNumericValue: 0.05, aggregationMethod: "median" },
      ],
      // 120 KB and 200 KB in bytes: **transfer** size, i.e. Brotli over the wire on Vercel
      // (spec 004 §13 Q13's restatement; the `//` note in the file spells it out).
      // 128 KB Brotli: spec 004 §13 Q13's restatement as corrected by §14 A1 (TASK-050 carried
      // the number here and into `scripts/client-js-budget.ts`; the job stays informational until
      // TASK-056 flips it). Per URL since spec 004 A-founder-2026-10-18a: 131 072 B on every URL
      // but a product address, 133 120 B there (`product-script-budget.test.ts`).
      "resource-summary:image:size": [
        "error",
        { maxNumericValue: 204800, aggregationMethod: "median" },
      ],
    });
  });

  /**
   * spec 040 AC-27 / T-28 (TASK-103), spec 004 §14 A18's ruling. `@lhci/cli` reads
   * `aggregationMethod` from each assertion's own options and defaults it to `optimistic`, which
   * for a `maxNumericValue` assertion takes the **fastest** run: one lucky run passed a page whose
   * median was over budget, and one unlucky run could not fail it. `median` is set on every
   * assertion of every `assertMatrix` entry (the per-URL script budgets included), so no budget is
   * judged by its best run.
   */
  it("aggregates every assertion by the median of the runs (AC-27), never the optimistic default", () => {
    const entries = rc.ci.assert.assertMatrix.flatMap((entry) =>
      Object.entries(entry.assertions),
    );
    // 6 every-URL assertions + the 131 072 B and 133 120 B script budgets.
    expect(entries.length).toBe(8);
    for (const [name, assertion] of entries) {
      expect(Array.isArray(assertion), name).toBe(true);
      const [level, options] = assertion as [string, Record<string, unknown>];
      expect(level, name).toBe("error");
      expect(options["aggregationMethod"], name).toBe("median");
    }
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
      expect(everyUrl["categories:seo"]).toBeUndefined();
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

  it("measures four homes, both hubs, one corridor, one shop root and one occasion hub per English locale, and not `/`", () => {
    // AC-27 words the budget as "`/` and `/en`"; `/de` is measured too because it is the locale
    // whose catalogue is an unreviewed echo — the one whose document could differ from `/en` by
    // accident rather than by design. Spec 004 §2 extends the list to all four launch locales,
    // and spec 007 AC-25 extends it again to "hub + one corridor per indexable locale" — which
    // today is the two locales with an authored guide (TASK-091, TASK-092). The German and Polish
    // hubs are deliberately absent: they are the same template in its empty state, and the two
    // locale homes already measure that chrome.
    // `/` left the set with spec 003 §14 A16 (AC-27 as restated): it is one 308 to `/en`, and a
    // redirect has no document to measure.
    expect(parseUrlList(raw)).toEqual([
      "/en",
      "/en-gb",
      "/de",
      "/pl",
      "/en/send-flowers-to",
      "/en-gb/send-flowers-to",
      "/en/send-flowers-to/poland",
      "/en-gb/send-flowers-to/poland",
      // Spec 008 §6 L89 extends it once more: **one country shop root per indexable locale**
      // (TASK-109). It is the heaviest document in the site — twelve product cards, twenty
      // category tiles and a date table — so it is the one that would spend the LCP and image
      // budgets first. `de` and `pl` are not indexable locales and are not measured here.
      "/en/poland/flowers",
      "/en-gb/poland/flowers",
      // And **one country category per indexable locale** (spec 008 AC-25's list; TASK-110): the
      // same twelve cards under a sibling chip row, so its number must equal the shop root's and
      // the sort form TASK-114 adds is measured against this line rather than against a hope. The
      // country **occasion** is deliberately absent — AC-25 names the shop root, the category, the
      // occasion hub and the occasions index, and the occasion page is the category's template
      // with one dated line.
      "/en/poland/flowers/roses",
      "/en-gb/poland/flowers/roses",
      // …and once more for **one occasion hub per indexable locale** (TASK-112). It is the page
      // type §6 names in the extended set and the one whose LCP is a grid of photographs under a
      // computed date table; the category hub renders the same two blocks in the other order, and
      // the occasions index joins with TASK-113.
      "/en/occasions/mothers-day",
      "/en-gb/occasions/mothers-day",
      // …and the two hub types spec 004 AC-36 adds, "Lighthouse mobile: one URL per page type"
      // (TASK-188): the category hub, whose phone LCP is now the first grid card under the pill
      // row, and the occasions index, whose LCP is the `<h1>` beside the "next six" cards. One
      // locale each: the template is the same in `en`, and the occasion hub already measures both.
      "/en-gb/flowers/roses",
      "/en-gb/occasions",
    ]);
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

  it("measures the PR's Railway environment on a pull request and its own Brotli origin otherwise (spec 040 AC-26, AC-27; TASK-099)", () => {
    // A pull request: `pr-<n>.flowersoverseas.com` through Cloudflare, which serves the Brotli
    // the budget is written in. Any other event: TASK-056's own build behind the Brotli proxy,
    // because there is no PR environment and staging waits for this very run (TASK-103 E-1).
    const job = ci.slice(ci.indexOf("  lighthouse:"));
    expect(job).toMatch(/needs: build/);
    expect(job).toContain('if [ "$EVENT_NAME" = "pull_request" ]; then');
    expect(job).toContain(
      'node scripts/railway-preview.ts --provision --pr "$PR_NUMBER" --sha "$HEAD_SHA"',
    );
    expect(job).toContain("pnpm lighthouse:origin");
    expect(job).toContain('echo "LHCI_BASE_URL=http://127.0.0.1:3001"');
    expect(job).toContain('echo "LHCI_BASE_URL=$url"');
    expect(job).toContain("lighthouserc.json");
    // It resolves the environment itself: `needs: preview` would skip it on every push (AC-38).
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
      "name: Run Lighthouse CI against the measured origin",
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

  it("carries no Vercel secret, and the wall's credential only into the origin and scrub steps", () => {
    // The bypass header was how the job reached a protected Vercel preview; that host is gone
    // from CI (spec 040 §14 A2). The PR environment's wall takes `STAGING_BASIC_AUTH`, read in
    // the origin step (masked in its Basic form) and by the scrub step, which reads the secret
    // itself before the reports are uploaded (/break 263 hole 3).
    const job = ci.slice(ci.indexOf("  lighthouse:"));
    expect(job).not.toContain("VERCEL_AUTOMATION_BYPASS_SECRET");
    expect(job).not.toContain("x-vercel-protection-bypass");
    expect(job.match(/secrets\.STAGING_BASIC_AUTH/gu)?.length).toBe(2);
    expect(job).toContain('echo "::add-mask::$basic"');
    expect(job).toContain("name: Scrub the wall's credential from the reports");
  });
});
