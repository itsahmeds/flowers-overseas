/**
 * The header's visual baselines (spec 004 AC-27's matrix, extended by TASK-048).
 *
 * Eight PNGs — four cases × the two elements the chrome is made of since §14 A4's addendum (the
 * utility strip, which scrolls with the page, and the sticky `banner` holding the masthead and the
 * category row). Each case exists because a full-page baseline of `/en` cannot show it:
 *
 *  - `header-desktop.png` / `header-mobile.png` — the header **clipped to its own box** at the two
 *    artboard widths (1440 px and 390 px, the widths `docs/design/homepage-v1/*.dc.html` were
 *    drawn at), so the reserved bands, the search field's two treatments and the account cluster's
 *    icon-only-to-labelled switch are pinned per breakpoint;
 *  - `header-de.png` — the same desktop box in German, which is where a compound label wraps the
 *    category row first;
 *  - `header-rtl.png` — `/ar-XB`, where the whole header mirrors and the mirroring intent of the
 *    icon set becomes observable.
 *
 * `navigator.languages` is emptied first, for the reason `./shell.spec.ts` documents: the
 * suggestion banner is a client island that decides from the runner's language list, and a
 * baseline must record the template rather than the machine.
 */
import { expect, test } from "@playwright/test";

/** The two elements of the chrome, each clipped to its own box (§14 A4's addendum). */
const PARTS = [
  { suffix: "utility", selector: "[data-fo-utility]" },
  { suffix: "banner", selector: "[data-fo-header]" },
] as const;

/** The two artboard widths, so a baseline is comparable with the design source. */
const DESKTOP = { width: 1440, height: 900 } as const;
const MOBILE = { width: 390, height: 844 } as const;

const CASES = [
  { name: "header-desktop", path: "/en", viewport: DESKTOP },
  { name: "header-de", path: "/de", viewport: DESKTOP },
  { name: "header-mobile", path: "/en", viewport: MOBILE },
  { name: "header-rtl", path: "/ar-XB", viewport: DESKTOP },
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
    expect(
      response?.status(),
      `${path} must be served; is ENABLE_PSEUDO_LOCALES=true on the target?`,
    ).toBe(200);
    await expect(page.locator('[data-fo-banner="shown"]')).toHaveCount(0);

    for (const { suffix, selector } of PARTS) {
      await expect(page.locator(selector)).toHaveScreenshot(
        `${name}-${suffix}.png`,
      );
    }
  });
}
