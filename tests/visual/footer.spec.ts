/**
 * AC-27 for the colophon (TASK-049): element baselines of the footer at the mobile and desktop
 * artboards, in the two locales that break layouts — `en` (the source copy) and `de` (compound
 * nouns, the longest strings in the catalogue).
 *
 * **Element screenshots, not full pages.** The full-page baselines of `./shell.spec.ts` already
 * change with every task that adds a section, so a footer regression would be one diff among many
 * and would be re-baselined away by the next task. Four tight screenshots of the `contentinfo`
 * subtree are what actually gate the canvas's colophon: the five-column grid and its collapse,
 * the two link columns as *text* rather than links, the absence of a payment logo, and the legal
 * row.
 *
 * Baselines are per platform (`snapshotPathTemplate`): `darwin/` is generated locally with
 * `pnpm test:visual --update-snapshots`, `linux/` comes from the `visual` CI job's failure
 * artifact, and both are committed — the procedure TASK-042 established.
 *
 * `navigator.languages` is emptied for the reason `./shell.spec.ts` documents: the suggestion
 * island would otherwise put the runner's language configuration into a committed PNG.
 */
import { expect, test } from "@playwright/test";

/** The two artboards of `docs/design/homepage-v1/`. */
const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

const LOCALES = ["en", "de"] as const;

for (const locale of LOCALES) {
  for (const viewport of VIEWPORTS) {
    test(`/${locale} footer matches the ${viewport.name} baseline`, async ({
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

      const footer = page.getByRole("contentinfo");
      await expect(footer).toBeVisible();
      await expect(footer).toHaveScreenshot(
        `footer-${locale}-${viewport.name}.png`,
      );
    });
  }
}
