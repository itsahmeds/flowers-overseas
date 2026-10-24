/**
 * Playwright harness (spec 001 §2 "Testing harness", §7, §8, AC-17, TASK-008).
 *
 * One config, five projects, three scripts:
 *   `pnpm test:e2e`    -> `e2e-desktop` + `e2e-mobile`  (tests/e2e/**)
 *   `pnpm test:visual` -> `visual` (`/`, `/en`, `/de`) + `pseudo-rtl` (`/ar-XB`)
 *   `pnpm test:a11y`   -> `a11y`                        (tests/a11y/**)
 *
 * `baseURL` comes from `PLAYWRIGHT_BASE_URL`: in CI, the `preview` job's `preview_url`, the pull
 * request's Railway environment through Cloudflare (`https://pr-<n>.flowersoverseas.com`, spec 040
 * AC-26, §14 A2; TASK-099); locally, `http://localhost:3000` against `pnpm build && pnpm start`.
 * There is deliberately no `webServer`: the target is a deployment, not a dev server.
 *
 * A PR environment sits behind the staging wall (spec 040 AC-25), so when `STAGING_BASIC_AUTH`
 * (`user:password`) is set, Playwright answers the wall's 401 with it, as HTTP credentials scoped to
 * the `baseURL` origin: they are never sent to another host, and no header is added to a request
 * that was not challenged. Unset (a local run), nothing is sent.
 */
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

/**
 * A returning visitor's recorded language choice, `fo_locale=en`, with the attributes the language
 * popup itself writes (spec 003 §14 A16; TASK-119). Inline rather than imported from `tests/`:
 * `next build` typechecks this file, and the container's build context carries no `tests/`.
 * `tests/support/locale-choice.ts` explains why every suite starts from it and how the popup
 * suites opt back into a first visit.
 */
function recordedLocaleChoice(target: string) {
  const url = new URL(target);
  return {
    cookies: [
      {
        name: "fo_locale",
        value: "en",
        domain: url.hostname,
        path: "/",
        expires: Math.floor(Date.now() / 1000) + 31_536_000,
        httpOnly: false,
        secure: url.protocol === "https:",
        sameSite: "Lax" as const,
      },
    ],
    origins: [],
  };
}
const isCI = process.env.CI === "true" || process.env.CI === "1";

/**
 * The RTL project. It stopped being a stub at TASK-042: it navigates `/ar-XB`, a real
 * `dir="rtl"` document served from the generated pseudo-locale, so the init script that used to
 * force `dir="rtl"` in the browser (`tests/visual/pseudo-rtl.ts`) is deleted (spec 003 AC-30).
 * Each project screenshots its own spec file, so no test has to ask which project it is in.
 */
export const PSEUDO_RTL_PROJECT = "pseudo-rtl";

/** The wall's credential as Playwright's `httpCredentials`, or `undefined` when unset or malformed. */
export function wallCredentials(
  raw: string | undefined,
  target: string,
):
  | { username: string; password: string; origin: string; send: "unauthorized" }
  | undefined {
  const match = /^([^\s:]+):(\S+)$/u.exec(raw?.trim() ?? "");
  if (match?.[1] === undefined || match[2] === undefined) return undefined;
  return {
    username: match[1],
    password: match[2],
    origin: new URL(target).origin,
    send: "unauthorized",
  };
}

const httpCredentials = wallCredentials(
  process.env.STAGING_BASIC_AUTH,
  baseURL,
);

// The two screenshot projects photograph a still: the page as a reader sees it once every entrance
// has played. Below the fold, motion 12 holds a section at opacity 0 until it is scrolled into view
// (spec 004 §14 A24 clause 9 (g); TASK-194), and a full-page shot scrolls nothing, so these two
// projects take their frames with `reduce`, where no section waits and nothing moves. Every other
// project runs with the browser's default, so the motions are what e2e and axe judge
// (`tests/support/at-rest.ts` waits for them to finish; `tests/e2e/motion.spec.ts` tests them).
const STILLS = { reducedMotion: "reduce" } as const;

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
  // `{platform}` is back (TASK-035). It was dropped in TASK-008 because the Phase 0 shell had no
  // text, no fonts and no images, so one baseline was byte-identical on the macOS machine that
  // generated it and on the Linux runner that verified it. Spec 003 gives `/` a heading, an intro
  // and four locale links, and text is rendered by the host's font stack and rasteriser: a macOS
  // baseline differs from a Linux one by far more than the 0.1 % threshold. Per-platform
  // baselines keep the gate honest instead of loosening the threshold until it stops catching
  // regressions. `{projectName}` still keeps `visual` and `pseudo-rtl` apart.
  //
  // Both baselines are committed. `darwin/` is generated locally
  // (`pnpm test:visual --update-snapshots`); `linux/` is generated by the `visual` CI job, which
  // uploads `tests/visual/__screenshots__/` in its failure artifact for exactly that purpose —
  // push, let the job write the missing baseline, download it, commit it. CI itself never passes
  // `--update-snapshots`, so a missing or changed baseline still fails the job.
  snapshotPathTemplate:
    "{testDir}/{testFileDir}/__screenshots__/{projectName}/{platform}/{arg}{ext}",
  use: {
    baseURL,
    // A returning visitor by default: the language popup (spec 003 §14 A16) is a modal dialog on
    // a first visit, and the popup's own suites opt back into a first visit with
    // `NO_LOCALE_CHOICE` (`tests/support/locale-choice.ts`).
    storageState: recordedLocaleChoice(baseURL),
    ...(httpCredentials === undefined ? {} : { httpCredentials }),
    // A trace records the request headers Playwright sent, the wall's `authorization` among
    // them, and CI uploads `test-results/` from a public repository. So with the credential in
    // scope no trace is recorded at all; `scripts/artifact-credential-check.ts` then checks every
    // uploaded file anyway (spec 040 AC-25; `/review 263` item 1, TASK-099).
    trace: httpCredentials === undefined ? "on-first-retry" : "off",
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
      // Every LTR visual spec (`/`, `/en`, `/de` in `shell.spec.ts`; the colophon's four element
      // baselines in `footer.spec.ts`, TASK-049). `/ar-XB` belongs to the project below, so the
      // RTL spec is the one file ignored here — a glob per file would make every 004 task that
      // adds a template edit this config.
      testMatch: "visual/*.spec.ts",
      testIgnore: "visual/pseudo-rtl.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
        contextOptions: STILLS,
      },
    },
    {
      // `/ar-XB` and nothing else: the real RTL gate of spec 003 AC-30.
      name: PSEUDO_RTL_PROJECT,
      testMatch: "visual/pseudo-rtl.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
        contextOptions: STILLS,
      },
    },
    {
      name: "a11y",
      testMatch: "a11y/**/*.spec.ts",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
