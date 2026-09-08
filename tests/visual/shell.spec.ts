/**
 * T-30 / AC-30 (TASK-042; extends the single-URL run of T-18 / AC-17, TASK-008): the LTR
 * templates match their committed baselines within 0.1 %.
 *
 * Three URLs, one per document shape spec 003 ships: `/` (the x-default chooser), `/en` (a locale
 * home with the switcher, LTR, English) and `/de` (the same template with German copy, which is
 * where a length or a diacritic regression shows up first). `/ar-XB` is the `pseudo-rtl`
 * project's, in `./pseudo-rtl.spec.ts`.
 *
 * Baselines are per platform (`snapshotPathTemplate` in `playwright.config.ts`): `darwin/` is
 * generated locally with `pnpm test:visual --update-snapshots`, `linux/` comes from the `visual`
 * CI job's failure artifact, and both are committed.
 */
import { expect, test } from "@playwright/test";

/** `{ path, baseline file }` — the baseline name is stable so a URL rename is a visible diff. */
const SCREENSHOTS = [
  { path: "/", name: "home.png" },
  { path: "/en", name: "en.png" },
  { path: "/de", name: "de.png" },
] as const;

for (const { path, name } of SCREENSHOTS) {
  test(`${path} matches the committed baseline`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");

    await expect(page).toHaveScreenshot(name, { fullPage: true });
  });
}
