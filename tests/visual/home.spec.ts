/**
 * The locale home's visual baselines (spec 004 AC-27's matrix, extended by TASK-052).
 *
 * Six PNGs — three elements × the two artboard widths — because the full-page `en.png`/`de.png`
 * baselines of `./shell.spec.ts` cannot show any of them at their drawn geometry: they are taken
 * at the `visual` project's 1280 px, while the artboards are drawn at 1440 px and 390 px, and a
 * full-page shot of a growing page hides a 4 px change in an 820 px band.
 *
 *  - `home-hero-*` — the whole band clipped to its own box: the reserved photo slot with its
 *    caption, the paper card at the inline start (desktop) or overlapping the slot by 56 px
 *    (mobile), the eyebrow, the `H1` and the proposition;
 *  - `home-finder-*` — the finder card: three labelled fields, the neutral `Continue`, the help
 *    and cutoff lines and the destination list with its seven states;
 *  - `home-proof-*` — the four-fact strip, 4-up on the desktop artboard and 2-up on the mobile
 *    one.
 *
 * The type-ahead's open state is deliberately **not** a baseline: it is a hydrated, transient
 * state whose contents depend on what was typed, and it is pinned by DOM assertions in
 * `tests/e2e/home.spec.ts` and by axe in `tests/a11y/home.spec.ts` instead. `navigator.languages`
 * is emptied first, for the reason `./shell.spec.ts` documents.
 */
import { expect, test } from "@playwright/test";

const PARTS = [
  { suffix: "hero", selector: "[data-fo-hero]" },
  { suffix: "finder", selector: "[data-fo-finder]" },
  { suffix: "proof", selector: "[data-fo-proof-row]" },
] as const;

/** The two artboard widths, so a baseline is comparable with the design source. */
const CASES = [
  { name: "home-desktop", path: "/en", viewport: { width: 1440, height: 900 } },
  { name: "home-mobile", path: "/en", viewport: { width: 390, height: 844 } },
] as const;

for (const { name, path, viewport } of CASES) {
  test(`${path} at ${String(viewport.width)}px matches ${name}-*`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "languages", {
        configurable: true,
        get: () => [],
      });
    });

    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.locator('[data-fo-banner="shown"]')).toHaveCount(0);

    for (const { suffix, selector } of PARTS) {
      await expect(page.locator(selector)).toHaveScreenshot(
        `${name}-${suffix}.png`,
      );
    }
  });
}
