/**
 * The product page's visual baselines (spec 009 AC-27, T-27; `docs/design/wireframes/
 * product-desktop.dc.html` and `-mobile.dc.html`; TASK-126, TASK-127).
 *
 * Seven PNGs: the three states a served build can reach — Poland's `preview` with a photograph,
 * the no-photo placeholder, and a destination with no `operations` block (`unavailable`) — at the
 * two artboard widths, plus the **sticky summary**: the viewport at 390 px, scrolled to the top,
 * with the summary's own total row docked at its bottom edge. `live` needs a florist, which no
 * served build has; it is the same template, asserted in `tests/unit/product-page.test.tsx`.
 *
 * The **geometry** is the assertion: a gallery that stopped being 1∶1, a date grid that stopped
 * being 7-up at 1440 and 4-up at 390, a block order that moved the price above the picker, or a
 * docked bar that grew into a second summary would all pass the text assertions in
 * `tests/e2e/product-page.spec.ts` and fail here.
 *
 * `main` rather than the whole document, for `country-shop.spec.ts`'s reason: the header and the
 * footer have their own baselines, and a shared-chrome change should fail one file.
 */
import type { BrowserContext, Page } from "@playwright/test";
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

const STATES = [
  { state: "preview", url: "/en/poland/product/amber-hour" },
  { state: "no-photo", url: "/en/poland/product/anthurium" },
  { state: "unavailable", url: "/en/germany/product/amber-hour" },
] as const;

const WIDTHS = [
  { width: "desktop", viewport: { width: 1440, height: 900 } },
  { width: "mobile", viewport: { width: 390, height: 844 } },
] as const;

for (const { state, url } of STATES) {
  for (const { width, viewport } of WIDTHS) {
    const name = `product-${width}-${state}`;
    test(`the product page (${state}) at ${String(viewport.width)}px matches ${name}`, async ({
      page,
      context,
      baseURL,
    }) => {
      await recordConsentRefusal(context, baseURL);
      await withoutLanguageHint(page);
      await page.setViewportSize(viewport);
      const response = await page.goto(url);
      expect(response?.status(), url).toBe(200);
      await expect(page.locator("[data-fo-price-summary]")).toBeVisible();
      await expect(page.locator("main")).toHaveScreenshot(`${name}.png`);
    });
  }
}

test("the sticky summary at 390px matches product-mobile-sticky", async ({
  page,
  context,
  baseURL,
}) => {
  await recordConsentRefusal(context, baseURL);
  await withoutLanguageHint(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const url = STATES[0].url;
  const response = await page.goto(url);
  expect(response?.status(), url).toBe(200);
  // The first screen a phone sees: the gallery, and the bar docked over its bottom edge.
  await expect(page.locator("[data-fo-summary-total]")).toBeVisible();
  await expect(page).toHaveScreenshot("product-mobile-sticky.png");
});
