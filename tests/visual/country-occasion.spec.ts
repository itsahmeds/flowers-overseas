/**
 * The country occasion's visual baselines (spec 008 AC-26, T-27;
 * `docs/design/wireframes/country-occasion-desktop.dc.html` and `-mobile.dc.html`; TASK-111).
 *
 * Two PNGs, one per artboard width. The **geometry** is the assertion: a dated line that stopped
 * standing above the grid, a grid that stopped being 2-up at 390 px or 4-up at 1440, a card box
 * that stopped being 4∶5, or a block order that put the links row before the products would all
 * pass the text assertions in `tests/e2e/country-occasion.spec.ts` and fail here.
 *
 * `main` rather than the whole document: the header and footer have their own baselines (TASK-050,
 * TASK-051), and a shared-chrome change should fail one file rather than every page's.
 */
import type { BrowserContext } from "@playwright/test";
import { expect, test } from "@playwright/test";

/**
 * A recorded refusal, so the consent banner is not in the photograph — `tests/visual/country-shop.spec.ts`'s
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

const OCCASION_URL = "/en/poland/occasions/mothers-day";

const CASES = [
  { name: "country-occasion-desktop", viewport: { width: 1440, height: 900 } },
  { name: "country-occasion-mobile", viewport: { width: 390, height: 844 } },
] as const;

for (const { name, viewport } of CASES) {
  test(`the country occasion at ${String(viewport.width)}px matches ${name}`, async ({
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
    const response = await page.goto(OCCASION_URL);
    expect(response?.status(), OCCASION_URL).toBe(200);
    await expect(page.locator("[data-fo-listing-grid]")).toBeVisible();
    await expect(page.locator("main")).toHaveScreenshot(`${name}.png`);
  });
}
