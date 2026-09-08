/**
 * Playwright harness (spec 001 §2 "Testing harness", §7, §8, AC-17, TASK-008).
 *
 * One config, five projects, three scripts:
 *   `pnpm test:e2e`    -> `e2e-desktop` + `e2e-mobile`  (tests/e2e/**)
 *   `pnpm test:visual` -> `visual` + `pseudo-rtl`       (tests/visual/**)
 *   `pnpm test:a11y`   -> `a11y`                        (tests/a11y/**)
 *
 * `baseURL` comes from `PLAYWRIGHT_BASE_URL`: the Vercel preview URL in CI (from the `preview`
 * job's output), `http://localhost:3000` locally against `pnpm build && pnpm start`. There is
 * deliberately no `webServer`: the target is a deployment, not a dev server, and a preview is
 * what AC-17 asks the suites to run against.
 *
 * Previews are behind Vercel Deployment Protection (AC-29), so every request carries
 * `x-vercel-protection-bypass` when `VERCEL_AUTOMATION_BYPASS_SECRET` is set, together with
 * `x-vercel-set-bypass-cookie: false` — without the latter Vercel answers with a `_vercel_jwt`
 * cookie and AC-15's "zero `Set-Cookie` on `/`" assertion would fail on the harness, not on the
 * application.
 */
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const isCI = process.env.CI === "true" || process.env.CI === "1";

/** Name of the RTL stub project; `tests/visual/pseudo-rtl.ts` documents what it is for. */
export const PSEUDO_RTL_PROJECT = "pseudo-rtl";

const protectionBypassHeaders: Record<string, string> =
  bypassSecret === undefined || bypassSecret === ""
    ? {}
    : {
        "x-vercel-protection-bypass": bypassSecret,
        "x-vercel-set-bypass-cookie": "false",
      };

export default defineConfig({
  testDir: "tests",
  // Playwright resolves specs itself; see the comment in that file for why the `@/*` alias is
  // restated there.
  tsconfig: "./tests/tsconfig.playwright.json",
  // Only Playwright specs: `tests/unit/**` and `tests/integration/**` are Vitest's `*.test.ts`.
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI
    ? [["github"], ["html", { open: "never" }], ["list"]]
    : [["list"]],
  timeout: 30_000,
  expect: {
    // spec 001 §2: visual screenshots at a 0.1 % threshold.
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.001,
      animations: "disabled",
      caret: "hide",
    },
  },
  // No `{platform}` token: the Phase 0 shell has no text, no fonts and no images (spec 001 §5.3),
  // so its rendering is identical on the macOS machine that generates the baseline and the Linux
  // runner that verifies it. `{projectName}` keeps `visual` and `pseudo-rtl` apart. Spec 004
  // introduces fonts and real templates: it must switch this template back to a per-platform
  // name and generate baselines in CI (`pnpm test:visual --update-snapshots`).
  snapshotPathTemplate:
    "{testDir}/{testFileDir}/__screenshots__/{projectName}/{arg}{ext}",
  use: {
    baseURL,
    extraHTTPHeaders: protectionBypassHeaders,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    ignoreHTTPSErrors: false,
  },
  projects: [
    {
      name: "e2e-desktop",
      testMatch: "e2e/**/*.spec.ts",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "e2e-mobile",
      testMatch: "e2e/**/*.spec.ts",
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "visual",
      testMatch: "visual/**/*.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      // spec 001 §7: the `visual` project ships a locale-less pseudo-RTL device stub so spec 003
      // only has to add URLs. See `tests/visual/pseudo-rtl.ts`.
      name: PSEUDO_RTL_PROJECT,
      testMatch: "visual/**/*.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: "a11y",
      testMatch: "a11y/**/*.spec.ts",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
