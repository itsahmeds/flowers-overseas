/**
 * The notice documents' visual baselines (spec 004 AC-12, AC-27's matrix; TASK-055).
 *
 * Four PNGs — the chooser and the 404, at the two artboard widths — because the full-page
 * `home.png` of `./shell.spec.ts` is taken at the `visual` project's 1280 px, and what this task
 * changed is a *layout* whose two states are the 390 and 1440 the design is drawn at: the lockup
 * scales (26/40 px mark, 19/26 px wordmark), the locale list goes from one column to two, and the
 * action row wraps.
 *
 * The 500 documents have no baseline here, for the reason `tests/e2e/notices.spec.ts` records:
 * reaching an error boundary in a browser needs a route that throws on purpose, which this task
 * was not asked to add. They render the same shell — asserted class for class in
 * `tests/unit/ui-notice-shell.test.ts` — and TASK-056's AC-26/AC-27 matrix, which already lists
 * "the 500 boundary", is where a reachable one belongs.
 *
 * `navigator.languages` is emptied and a consent refusal is seeded before the first navigation,
 * for the two reasons `./shell.spec.ts` and `./home.spec.ts` give: without them a committed PNG
 * records the runner's language configuration and how fast its consent chunk arrived rather than
 * what the template looks like. Neither overlay can appear on `/` at all — that is what
 * `tests/e2e/notices.spec.ts` asserts — but the 404 is a document like any other.
 *
 * Baselines are per platform (`snapshotPathTemplate`). `darwin/` is committed from a local
 * `pnpm test:visual --update-snapshots`; the `linux/` set is written by the CI `visual` job's
 * failure artifact, which is blocked while the Actions budget is (project memory, 2026-09-09), so
 * these four land as `darwin/` only and the Linux half is taken with the next CI run.
 */
import { type BrowserContext, expect, test } from "@playwright/test";

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

const DOCUMENTS = [
  { name: "chooser", path: "/", status: 200 },
  { name: "not-found", path: "/nope", status: 404 },
] as const;

async function recordConsentRefusal(
  context: BrowserContext,
  baseURL: string | undefined,
): Promise<void> {
  await context.addCookies([
    {
      name: "fo_consent",
      value: encodeURIComponent(
        JSON.stringify({
          v: 1,
          a: false,
          m: false,
          ts: "2026-09-09T00:00:00.000Z",
          cid: "6f1e6e6a-1d3a-4b5e-9c2f-8f0a1b2c3d4e",
        }),
      ),
      url: baseURL ?? "http://localhost:3000",
    },
  ]);
}

for (const { name, path, status } of DOCUMENTS) {
  for (const viewport of VIEWPORTS) {
    test(`${path} matches the ${viewport.name} baseline`, async ({
      page,
      context,
      baseURL,
    }) => {
      await recordConsentRefusal(context, baseURL);
      await page.setViewportSize(viewport);
      await page.addInitScript(() => {
        Object.defineProperty(navigator, "languages", {
          configurable: true,
          get: () => [],
        });
      });

      const response = await page.goto(path);
      expect(response?.status()).toBe(status);
      await expect(page.locator('[data-fo-banner="shown"]')).toHaveCount(0);
      await expect(page.locator("[data-fo-consent]")).toHaveCount(0);

      await expect(page).toHaveScreenshot(`${name}-${viewport.name}.png`, {
        fullPage: true,
      });
    });
  }
}

/**
 * The restyled suggestion banner (AC-13), as an element screenshot of the panel at both artboard
 * widths — the state `./shell.spec.ts` deliberately suppresses, so the restyle has a gate of its
 * own instead of being invisible to the suite that is supposed to catch it. A German browser on
 * `/en` is the matrix row that shows it (spec 003 AC-28), and the consent question is answered
 * first because the sheet paints over it by design.
 */
test.describe("the language-suggestion banner", () => {
  test.use({ locale: "de-DE" });

  for (const viewport of VIEWPORTS) {
    test(`matches the ${viewport.name} baseline`, async ({
      page,
      context,
      baseURL,
    }) => {
      await recordConsentRefusal(context, baseURL);
      await page.setViewportSize(viewport);
      await page.addInitScript(() => {
        Object.defineProperty(navigator, "languages", {
          configurable: true,
          get: () => ["de-DE", "de"],
        });
      });

      await page.goto("/en");
      const banner = page.locator('[data-fo-banner="shown"]');
      await expect(banner).toBeVisible();

      await expect(banner).toHaveScreenshot(
        `suggestion-banner-${viewport.name}.png`,
      );
    });
  }
});
