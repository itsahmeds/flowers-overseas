/**
 * AC-27's **banner shown** baselines (TASK-051), in the `consent-active` project (spec 004 §14
 * A-founder-2026-10-19d clause 8, AC-27 and T-29 as amended; TASK-279): only a build with an
 * active consent source shows the sheet on load. Element screenshots of the sheet at the mobile
 * and desktop artboards, `en` and `de`. The settings-panel baselines are the committed build's
 * (`tests/visual/consent.spec.ts`). Taken as the `visual` project takes its stills: Desktop Chrome,
 * reduced motion, the viewport set per case. The fixture's GA4 tag is aborted (`abortGoogle`).
 *
 * The baselines live under `__screenshots__/consent-active/{platform}/` beside this file; the
 * `linux` set is the authoritative one, refreshed from this project's CI failure artifact
 * (`docs/runbooks/visual-baselines.md`).
 */
import { expect, test } from "@playwright/test";

import { abortGoogle } from "../support/consent-active.ts";

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

const SHEET = "[data-fo-consent]";
const SHOWN = '[data-fo-consent="shown"]';

test.use({ reducedMotion: "reduce" });

for (const locale of ["en", "de"] as const) {
  for (const viewport of VIEWPORTS) {
    test(`/${locale} consent sheet matches the ${viewport.name} baseline`, async ({
      page,
    }) => {
      await abortGoogle(page);
      await page.addInitScript(() => {
        Object.defineProperty(navigator, "languages", {
          configurable: true,
          get: () => [],
        });
      });
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      const response = await page.goto(`/${locale}`);
      expect(response?.status()).toBe(200);
      await expect(page.locator(SHOWN)).toBeVisible();
      await expect(page.locator(SHEET)).toHaveScreenshot(
        `consent-shown-${locale}-${viewport.name}.png`,
      );
    });
  }
}
