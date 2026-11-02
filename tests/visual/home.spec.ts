/**
 * The locale home's visual baselines (spec 004 AC-27's matrix, extended by TASK-052; the v3 home
 * of TASK-386 and TASK-387, `home-{desktop,mobile}.dc.html`).
 *
 * One PNG per section x the two artboard widths, because the full-page `en.png`/`de.png`
 * baselines of `./shell.spec.ts` are taken at the `visual` project's 1280 px, while the artboards
 * are drawn at 1440 px and 390 px, and a full-page shot of a growing page hides a 4 px change.
 *
 *  - `home-hero-*`: the first screen's band: the H1, the line, the picker card and, from `md`,
 *    the photograph and the two lines under it;
 *  - `home-selection-*`: "Our selection", the whole core range as country-less cards;
 *  - `home-occasions-*`: the occasion tabs, the first checked, and its panel;
 *  - `home-price-*`: the three price words;
 *  - `home-how-it-works-*`, `home-faq-*`, `home-destinations-*`: as before.
 *
 * "Coming up" has no baseline: it prints the calendar's next dates. **Every shot below it is taken
 * without it** (`./home-dates.css`). The v2 parts (the sentence, the promise band, the date
 * stamps, the occasion tiles, the trending row) left with the v2 home.
 *
 * `navigator.languages` is emptied first, for the reason `./shell.spec.ts` documents.
 */
import { fileURLToPath } from "node:url";

import { type BrowserContext, expect, test } from "@playwright/test";

/**
 * A recorded consent decision, seeded before the first navigation — the same helper
 * `./footer.spec.ts` and `./shell.spec.ts` carry, for the same reason. On the mobile artboard the
 * consent sheet is a bottom sheet that paints **over the finder card**, and an element screenshot
 * captures whatever is painted in the element's box, overlay included; without this the baseline
 * records whether the island's chunk had arrived yet rather than what the card looks like. It
 * made this file flake on the first run after the finder island grew (`/review 40` fix round).
 * With a refusal already in the jar the island renders nothing; the sheet has its own baselines
 * in `./consent.spec.ts`.
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

/**
 * Each section, clipped to its own box. `belowDates` marks a section the page renders under the
 * dated "Coming up", photographed with it out of the layout (the header).
 */
const PARTS = [
  { suffix: "hero", selector: "[data-fo-hero]", belowDates: false },
  {
    suffix: "selection",
    selector: '[data-fo-home-section="selection"]',
    belowDates: false,
  },
  {
    suffix: "occasions",
    selector: '[data-fo-home-section="occasions"]',
    belowDates: false,
  },
  {
    suffix: "price",
    selector: '[data-fo-home-section="price"]',
    belowDates: false,
  },
  {
    suffix: "how-it-works",
    selector: "[data-fo-how-it-works]",
    belowDates: true,
  },
  { suffix: "faq", selector: "[data-fo-faq]", belowDates: true },
  // The verified-reviews band has **no** baseline: in Phase 0 it renders nothing.
  {
    suffix: "destinations",
    selector: "[data-fo-destinations]",
    belowDates: true,
  },
] as const;

/** Takes the dated "Coming up" out of the layout (`./home-dates.css`). */
/** Unsticks the header, so it never paints over a part (`./static-header.css`). */
const HEADER_STYLE = fileURLToPath(
  new URL("./static-header.css", import.meta.url),
);

const HOME_DATES_STYLE = fileURLToPath(
  new URL("./home-dates.css", import.meta.url),
);

/** The two artboard widths, so a baseline is comparable with the design source. */
const CASES = [
  { name: "home-desktop", path: "/en", viewport: { width: 1440, height: 900 } },
  { name: "home-mobile", path: "/en", viewport: { width: 390, height: 844 } },
] as const;

for (const { name, path, viewport } of CASES) {
  test(`${path} at ${String(viewport.width)}px matches ${name}-*`, async ({
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
    expect(response?.status()).toBe(200);
    await expect(page.locator('[data-fo-banner="shown"]')).toHaveCount(0);
    await expect(page.locator("[data-fo-consent]")).toHaveCount(0);

    for (const { suffix, selector, belowDates } of PARTS) {
      await expect(page.locator(selector)).toHaveScreenshot(
        `${name}-${suffix}.png`,
        // The sticky header would paint over a part Playwright scrolls to (`./static-header.css`).
        {
          stylePath: belowDates
            ? [HEADER_STYLE, HOME_DATES_STYLE]
            : [HEADER_STYLE],
        },
      );
    }
  });
}
