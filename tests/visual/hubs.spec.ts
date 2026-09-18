/**
 * The two hubs' visual baselines (spec 008 AC-26, T-27;
 * `docs/design/wireframes/category-hub-{desktop,mobile}.dc.html` and
 * `occasion-hub-{desktop,mobile}.dc.html`; TASK-112).
 *
 * Four PNGs, one per artboard. The **geometry** is the assertion: a destination picker that stopped
 * being 3-up at 1440 or 1-up at 390, a card box that stopped being 4∶5, a date table that stopped
 * being a table, or a block order that put the products before the destinations would all pass the
 * text assertions in `tests/e2e/hubs.spec.ts` and fail here.
 *
 * `main` rather than the whole document: the header and footer have their own baselines (TASK-050,
 * TASK-051), and a shared-chrome change should fail one file rather than every page's.
 */
import type { BrowserContext } from "@playwright/test";
import { expect, test } from "@playwright/test";

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

const CASES = [
  {
    name: "category-hub-desktop",
    url: "/en/flowers/roses",
    viewport: { width: 1440, height: 900 },
  },
  {
    name: "category-hub-mobile",
    url: "/en/flowers/roses",
    viewport: { width: 390, height: 844 },
  },
  {
    name: "occasion-hub-desktop",
    url: "/en/occasions/mothers-day",
    viewport: { width: 1440, height: 900 },
  },
  {
    name: "occasion-hub-mobile",
    url: "/en/occasions/mothers-day",
    viewport: { width: 390, height: 844 },
  },
] as const;

for (const { name, url, viewport } of CASES) {
  test(`${name} matches its artboard at ${String(viewport.width)}px`, async ({
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
    const response = await page.goto(url);
    expect(response?.status(), url).toBe(200);
    await expect(page.locator("[data-fo-listing-grid]")).toBeVisible();
    await expect(page.locator("main")).toHaveScreenshot(`${name}.png`);
  });
}
