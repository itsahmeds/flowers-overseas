/**
 * The product page's visual baselines (spec 009 AC-27, T-27; `docs/design/wireframes/
 * product-desktop.dc.html` and `-mobile.dc.html`; TASK-126, TASK-127).
 *
 * **Blocks, not the whole of `main`.** The date grid is computed from the clock the page was
 * rendered at (a fourteen-day window from today, in Warsaw's zone), so which chip is a Sunday,
 * which row carries a reason and therefore how tall the picker is all move with the build date. A
 * baseline containing the grid would fail the next day — `corridor.spec.ts`'s reason for leaving
 * the corridor calendar out. The grid is asserted as text and as computed accessible names in
 * `tests/e2e/product-page.spec.ts` and over a fixed clock in `tests/unit/product-page.test.tsx`.
 *
 * What is photographed is what does not move: the gallery in both states (the 1∶1 box, the empty
 * thumbnails, the honesty label), the add-on rows, the price summary, the `unavailable` picker
 * (no dates at all) — each at both artboard widths — and the **sticky summary**: the first screen
 * of a phone at 390 px, with the summary's own total row docked at its bottom edge. In `preview`
 * the bar names the size and no date. `live` needs a florist, which no served build has; it is the
 * same template, asserted in the unit suite.
 *
 * **A block below the grid is not date-free by itself.** The grid's rows have fractional heights
 * that change with the window, so every block under it moved by a sub-pixel amount each day and a
 * line of text could round to a different pixel row. `product-blocks.css` takes the grid out of the
 * layout for the block shots, which fixes every block's offset; see that file for the measurement.
 */
import type { BrowserContext, Page } from "@playwright/test";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

/** A recorded refusal, so the consent banner is not in the photograph (`corridor.spec.ts`). */
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

/** No locale-suggestion banner either (spec 003's `i18n-suggestion-banner`). */
async function withoutLanguageHint(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "languages", {
      configurable: true,
      get: () => [],
    });
  });
}

/** Each block on the page that carries no computed date, and the URL whose state shows it. */
const BLOCKS = [
  {
    block: "gallery-photos",
    url: "/en/poland/product/amber-hour",
    selector: '[data-fo-gallery="photos"]',
  },
  {
    // Since TASK-168 every committed product is photographed, so no PDP reaches this state; the
    // PDP's own `Gallery` with `PRODUCT_GALLERY_PLACEHOLDER` on `/dev/components` does (the
    // orchestrator's ruling for `tests/e2e/product-page.spec.ts`'s no-photo case, applied here).
    block: "gallery-placeholder",
    url: "/dev/components",
    selector: '[data-fo-gallery="placeholder"]',
  },
  {
    block: "addons",
    url: "/en/poland/product/amber-hour",
    selector: "[data-fo-pdp-addons]",
  },
  {
    block: "summary",
    url: "/en/poland/product/amber-hour",
    selector: "[data-fo-price-summary]",
  },
  {
    block: "picker-unavailable",
    url: "/en/germany/product/amber-hour",
    selector: '[data-fo-picker-state="unavailable"]',
  },
] as const;

/** Hides the docked total row and takes the date grid out (see the file). */
const BLOCK_STYLE = fileURLToPath(
  new URL("./product-blocks.css", import.meta.url),
);

/**
 * Keeps the sticky header from painting over a block taller than the viewport — the v2 gallery at
 * 1440 px is 949 px (see `./static-header.css`).
 */
const HEADER_STYLE = fileURLToPath(
  new URL("./static-header.css", import.meta.url),
);

const WIDTHS = [
  { width: "desktop", viewport: { width: 1440, height: 900 } },
  { width: "mobile", viewport: { width: 390, height: 844 } },
] as const;

for (const { width, viewport } of WIDTHS) {
  test(`the product page's date-free blocks at ${String(viewport.width)}px match product-${width}-*`, async ({
    page,
    context,
    baseURL,
  }) => {
    await recordConsentRefusal(context, baseURL);
    await withoutLanguageHint(page);
    await page.setViewportSize(viewport);
    for (const { block, url, selector } of BLOCKS) {
      const response = await page.goto(url);
      expect(response?.status(), url).toBe(200);
      await expect(page.locator(selector)).toHaveScreenshot(
        `product-${width}-${block}.png`,
        // The docked total row would otherwise sit over a block at a scroll-dependent offset.
        { stylePath: [BLOCK_STYLE, HEADER_STYLE] },
      );
    }
  });
}

test("the sticky summary at 390px matches product-mobile-sticky", async ({
  page,
  context,
  baseURL,
}) => {
  await recordConsentRefusal(context, baseURL);
  await withoutLanguageHint(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const url = BLOCKS[0].url;
  const response = await page.goto(url);
  expect(response?.status(), url).toBe(200);
  // The first screen a phone sees: the gallery, and the bar docked over its bottom edge.
  await expect(page.locator("[data-fo-summary-total]")).toBeVisible();
  await expect(page).toHaveScreenshot("product-mobile-sticky.png");
});
