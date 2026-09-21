/**
 * The listing primitives' visual baselines (spec 008 §5.3, AC-6; TASK-108;
 * `docs/design/system/components.dc.html`, "Listing and card blocks").
 *
 * Six PNGs: the card's four states, the grid and the toolbar, at the two artboard widths. They
 * are taken on `/dev/components` because that is the only surface that reaches them until
 * TASK-109 builds the shop root — and because the states that matter most here are the ones a
 * page cannot show (the tile→link flip, the placeholder→photograph swap), which is exactly what
 * spec 004 §2 built the gallery for.
 *
 * The **geometry** is the assertion. A card whose box stopped being 4∶5, a grid that stopped
 * being 2-up on the mobile artboard, or a toolbar whose submit button dropped below the 44 px
 * target would all pass every text assertion in the suite and fail here.
 */
import { expect, test } from "@playwright/test";

import { settleImages } from "../support/settle-images.ts";

const GALLERY = "/dev/components";

const PARTS = [
  { suffix: "card-image", selector: '[data-fo-listing-state="cardImage"]' },
  {
    suffix: "card-placeholder",
    selector: '[data-fo-listing-state="cardPlaceholder"]',
  },
  { suffix: "card-tile", selector: '[data-fo-listing-state="cardTile"]' },
  { suffix: "card-link", selector: '[data-fo-listing-state="cardLink"]' },
  { suffix: "grid", selector: '[data-fo-listing-state="gridDesktop"]' },
  {
    suffix: "toolbar",
    selector: '[data-fo-listing-state="toolbarDefault"]',
  },
] as const;

const CASES = [
  { name: "listing-desktop", viewport: { width: 1440, height: 900 } },
  { name: "listing-mobile", viewport: { width: 390, height: 844 } },
] as const;

for (const { name, viewport } of CASES) {
  test(`the listing primitives at ${String(viewport.width)}px match ${name}-*`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const response = await page.goto(GALLERY);
    expect(
      response?.status(),
      `${GALLERY} must be served; is ENABLE_DEV_UI=true on the target?`,
    ).toBe(200);

    // Cross-origin photographs (TASK-138): wait for them, or an element screenshot can be taken
    // of a card whose image has not landed.
    await settleImages(page);

    for (const { suffix, selector } of PARTS) {
      await expect(page.locator(selector)).toHaveScreenshot(
        `${name}-${suffix}.png`,
      );
    }
  });
}
