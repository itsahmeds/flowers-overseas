/**
 * AC-27's consent baseline on the committed build (TASK-051; restated by TASK-279 for spec 004
 * §14 A-founder-2026-10-19d): **the settings panel open**, opened from the footer's "Cookie
 * settings", as an element screenshot of the sheet subtree at the mobile and desktop artboards.
 * Nothing asks on the committed build, so the **banner shown** baselines are taken in the
 * `consent-active` project (`tests/consent-active/consent-visual.spec.ts`).
 *
 * Element screenshots, for the reason `./footer.spec.ts` gives: the full-page baselines of
 * `./shell.spec.ts` change with every section a later 004 task adds, so a consent regression would
 * be one diff among many. What these PNGs gate is a settings panel whose non-essential toggles are
 * visibly off and whose three answers are of visibly identical weight.
 *
 * `de` is screenshotted alongside `en` because German compounds are the length case the controls
 * are specified to wrap for (§7). `navigator.languages` is emptied so no language island can put
 * the runner's language configuration into a committed PNG.
 */
import { expect, test } from "@playwright/test";

import { openConsentSettings } from "../support/consent.ts";

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

const SHEET = "[data-fo-consent]";
const SETTINGS_OPEN = '[data-fo-consent="settings"]';
/**
 * The gate that the panel is actually **there**: the panel is a `next/dynamic` chunk, so wait for
 * something inside it (`/review 40`: a sheet that said `settings` while still drawing the banner).
 */
const PANEL = "[data-fo-consent-panel]";
const ANALYTICS_TOGGLE = '[data-fo-consent-category="analytics"]';
const SAVE = '[data-fo-consent-action="save"]';
const COOKIE_ROW = "[data-fo-consent-panel] dl dt code";

for (const locale of ["en", "de"] as const) {
  for (const viewport of VIEWPORTS) {
    test(`/${locale} consent settings panel matches the ${viewport.name} baseline`, async ({
      page,
    }) => {
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
      await expect(page.locator(SHEET)).toHaveCount(0);

      await openConsentSettings(page);
      await expect(page.locator(SETTINGS_OPEN)).toBeVisible();
      await expect(page.locator(PANEL)).toBeVisible();
      await expect(page.locator(ANALYTICS_TOGGLE)).toBeVisible();
      await expect(page.locator(COOKIE_ROW).first()).toBeVisible();
      await expect(page.locator(SAVE)).toBeVisible();
      // No pointer resting on a control: the photograph is of the panel, not of a hover state.
      await page.mouse.move(0, 0);
      await expect(page.locator(SHEET)).toHaveScreenshot(
        `consent-settings-${locale}-${viewport.name}.png`,
      );
    });
  }
}
