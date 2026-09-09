/**
 * AC-27's two consent baselines (TASK-051): **the sheet shown** and **the settings panel open**,
 * as element screenshots of the sheet subtree at the mobile and desktop artboards.
 *
 * Element screenshots, for the reason `./footer.spec.ts` gives: the full-page baselines of
 * `./shell.spec.ts` change with every section a later 004 task adds, so a consent regression would
 * be one diff among many and would be re-baselined away by the next task. What these four PNGs
 * gate is what the sheet is *for*: a bottom sheet on the phone and an inline card on the desktop,
 * three controls of visibly identical weight with no accented "Accept", and a settings panel whose
 * non-essential toggles are visibly off.
 *
 * `de` is screenshotted alongside `en` because German compounds are the length case the controls
 * are specified to wrap for (§7).
 *
 * `navigator.languages` is emptied so the language-suggestion island — which paints in the same
 * corner — cannot put the runner's language configuration into a committed PNG.
 *
 * Baselines are per platform (`snapshotPathTemplate`): `darwin/` is committed from a local
 * `pnpm test:visual --update-snapshots`; the `linux/` set is refreshed once from a `ci:full`
 * visual-job artifact, which the orchestrator's `/review 30` ruling assigns to TASK-053's PR.
 */
import { expect, test } from "@playwright/test";

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

const SHEET = "[data-fo-consent]";
const SHOWN = '[data-fo-consent="shown"]';
const SETTINGS_OPEN = '[data-fo-consent="settings"]';
const CHOOSE = '[data-fo-consent-action="settings"]';

for (const locale of ["en", "de"] as const) {
  for (const viewport of VIEWPORTS) {
    test(`/${locale} consent sheet matches the ${viewport.name} baseline`, async ({
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
      await expect(page.locator('[data-fo-banner="shown"]')).toHaveCount(0);

      const sheet = page.locator(SHOWN);
      await expect(sheet).toBeVisible();
      await expect(page.locator(SHEET)).toHaveScreenshot(
        `consent-shown-${locale}-${viewport.name}.png`,
      );

      await page.locator(CHOOSE).click();
      await expect(page.locator(SETTINGS_OPEN)).toBeVisible();
      await expect(page.locator(SHEET)).toHaveScreenshot(
        `consent-settings-${locale}-${viewport.name}.png`,
      );
    });
  }
}
