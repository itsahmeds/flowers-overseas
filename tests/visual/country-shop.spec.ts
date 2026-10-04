/**
 * The country shop root's visual baselines (spec 008 AC-26, T-27;
 * `docs/design/wireframes/country-shop-desktop.dc.html` and `-mobile.dc.html`; TASK-109).
 *
 * Two PNGs, one per artboard width. The **geometry** is the assertion: a grid that stopped being
 * 2-up at 390 px or 4-up at 1440, a card box that stopped being 4∶5, or a block order that put
 * prose before the priced row would all pass the text assertions in `tests/e2e/country-shop.spec.ts`
 * and fail here. The occasion table is not photographed: its dates come from today's date
 * (`./listing-dates.css`); its rows and its place in the order are pinned by
 * `tests/unit/catalog-shop-page.test.tsx`.
 *
 * `main` rather than the whole document: the header and footer have their own baselines (TASK-050,
 * TASK-051), and a shared-chrome change should fail one file rather than every page's.
 */
import type { BrowserContext } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

import { settleImages } from "../support/settle-images.ts";

/**
 * A recorded refusal, so the consent banner is not in the photograph — `tests/visual/corridor.spec.ts`'s
 * helper, and for its reason: the banner has its own baseline (TASK-054) and a page shot that
 * contained it would fail on every banner change.
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

/** Takes the date-driven blocks out of the layout (see `./listing-dates.css`). */
const DATES_STYLE = fileURLToPath(
  new URL("./listing-dates.css", import.meta.url),
);

const SHOP_URL = "/en/poland/flowers";

const CASES = [
  { name: "country-shop-desktop", viewport: { width: 1440, height: 900 } },
  { name: "country-shop-mobile", viewport: { width: 390, height: 844 } },
] as const;

for (const { name, viewport } of CASES) {
  test(`the shop root at ${String(viewport.width)}px matches ${name}`, async ({
    page,
    context,
    baseURL,
  }) => {
    await recordConsentRefusal(context, baseURL);
    await page.setViewportSize(viewport);
    // No locale-suggestion banner in the photograph either (spec 003's `i18n-suggestion-banner`).
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "languages", {
        configurable: true,
        get: () => [],
      });
    });
    const response = await page.goto(SHOP_URL);
    expect(response?.status(), SHOP_URL).toBe(200);
    await expect(page.locator("[data-fo-listing-grid]")).toBeVisible();
    // The photographs come from the media bucket since TASK-138, so they have to be waited for
    // rather than assumed painted.
    await settleImages(page);
    // The occasion table's dates come from today's date; out of the layout, the intro below it
    // sits at the same offset on every day (`./listing-dates.css`).
    await expect(page.locator("main")).toHaveScreenshot(`${name}.png`, {
      stylePath: DATES_STYLE,
    });
  });
}
