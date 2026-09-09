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
 *
 * **All four baselines changed with TASK-045** and were regenerated on purpose: spec 004's
 * `@layer base` reset gives every document the two self-hosted families, the paper/ink pair and
 * the type scale, so every pixel of text moved. `darwin/` was regenerated locally and verified by
 * a second, non-updating run; `linux/` was taken from the `visual` CI job's artifact, which is the
 * procedure TASK-042 established and `README.md` documents.
 *
 * **`navigator.languages` is emptied first (TASK-041).** The suggestion banner is a client island
 * that decides from the *browser's* language list, so a full-page baseline of `/de` taken by an
 * English-configured runner contains an English "would you rather read this in English?" overlay,
 * and the same baseline taken by a German-configured one does not. That makes the committed PNG a
 * record of the runner's `navigator.languages` rather than of the template, which is the opposite
 * of what AC-30 gates: a machine's language setting would show up as a layout regression, and a
 * real layout regression could hide behind it. With an empty list `preferredLocale` answers
 * `null`, `decideSuggestion` returns `noBetterLocale`, and every URL here renders the document
 * the template produces. The banner has its own coverage where the visitor's language is the
 * subject rather than the noise: `tests/e2e/banner.spec.ts` (the appearance matrix, CLS delta and
 * cookie) and `tests/a11y/banner.spec.ts` (axe with it forced on screen).
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
    // Before any script of ours runs, and therefore before the island mounts. See the header.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "languages", {
        configurable: true,
        get: () => [],
      });
    });

    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    // The template and nothing situational: no suggestion overlay is in the frame.
    await expect(page.locator('[data-fo-banner="shown"]')).toHaveCount(0);

    await expect(page).toHaveScreenshot(name, { fullPage: true });
  });
}
