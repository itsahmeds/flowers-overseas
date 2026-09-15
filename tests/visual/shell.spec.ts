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
import { type BrowserContext, type Page, expect, test } from "@playwright/test";

/**
 * Everything still in flight after `goto` resolves, waited out before the shutter: the last
 * request, the webfaces (`document.fonts.ready`) and two animation frames — the first frame whose
 * layout is the one the font metrics produced. Without it a committed PNG can be a mid-load frame
 * that passes only because the diff sits under `maxDiffPixelRatio` (`/review 55`, which asked for
 * this wait on the notice documents; TASK-056 gives it to every full-page baseline).
 */
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    });
  });
}

/**
 * A recorded consent decision, seeded before the first navigation (TASK-051).
 *
 * The consent sheet is a client island that appears **after hydration** when no decision is
 * stored, so a full-page baseline taken by a fast machine has no sheet in it and one taken by a
 * slow machine does. That is the same class of non-determinism the empty `navigator.languages`
 * above removes for the suggestion banner: the committed PNG would record how quickly a chunk
 * arrived rather than what the template looks like. With a refusal already in the jar the island
 * renders nothing at all, and the sheet has its own baselines in `./consent.spec.ts`.
 */
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

/** `{ path, baseline file }` — the baseline name is stable so a URL rename is a visible diff. */
const SCREENSHOTS = [
  { path: "/", name: "home.png" },
  { path: "/en", name: "en.png" },
  { path: "/de", name: "de.png" },
] as const;

/**
 * AC-27's own words: "each locale home at **mobile and desktop**", with every section this spec
 * added in frame (TASK-056).
 *
 * The three baselines above are taken at the `visual` project's 1280 px, which is neither artboard
 * and which no section of `docs/design/homepage-v1/` was drawn at; and they cover two locales of
 * four, so a length regression in `en-gb`'s overrides or in `pl`'s diacritics had no baseline at
 * all. These eight are the matrix the AC asks for: four locales × the two drawn widths, full page,
 * so the utility strip, masthead, category row, hero, finder, proof row, occasion dates, occasion
 * tiles, explainer, FAQ, trust strip, trending row, destinations grid and colophon are all in one
 * frame per locale. The element-level baselines of `./home.spec.ts` stay: a full-page shot of a
 * 6 000 px document cannot show a 4 px change inside an 820 px band, and a band-level shot cannot
 * show a section that disappeared between two others. The two answer different questions.
 */
const LOCALE_HOMES = ["en", "en-gb", "de", "pl"] as const;
const ARTBOARDS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

for (const locale of LOCALE_HOMES) {
  for (const artboard of ARTBOARDS) {
    test(`/${locale} matches the ${artboard.name} artboard baseline`, async ({
      page,
      context,
      baseURL,
    }) => {
      await recordConsentRefusal(context, baseURL);
      await page.addInitScript(() => {
        Object.defineProperty(navigator, "languages", {
          configurable: true,
          get: () => [],
        });
      });
      await page.setViewportSize({
        width: artboard.width,
        height: artboard.height,
      });

      const response = await page.goto(`/${locale}`);
      expect(response?.status()).toBe(200);
      await expect(page.locator('[data-fo-banner="shown"]')).toHaveCount(0);
      await expect(page.locator("[data-fo-consent]")).toHaveCount(0);
      // The webfaces before the shutter: the lockup, every heading and every label are drawn in
      // them, so a frame taken before they swap records the fallback's metrics (`/review 55`).
      await settle(page);

      await expect(page).toHaveScreenshot(
        `home-${locale}-${artboard.name}.png`,
        { fullPage: true },
      );
    });
  }
}

for (const { path, name } of SCREENSHOTS) {
  test(`${path} matches the committed baseline`, async ({
    page,
    context,
    baseURL,
  }) => {
    await recordConsentRefusal(context, baseURL);
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
    // The template and nothing situational: neither overlay is in the frame.
    await expect(page.locator('[data-fo-banner="shown"]')).toHaveCount(0);
    await expect(page.locator("[data-fo-consent]")).toHaveCount(0);
    await settle(page);

    await expect(page).toHaveScreenshot(name, { fullPage: true });
  });
}
