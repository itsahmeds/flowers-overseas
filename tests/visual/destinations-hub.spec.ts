/**
 * The all-destinations hub's visual baselines (spec 007 AC-26, T-28's hub rows; TASK-092).
 *
 * Two PNGs per width: the head of the page (the `h1` and its intro) and the first region group,
 * which is where the artboards fix the geometry — the tile's rule, the state chip's placement and
 * the gap between the heading pair and the grid. `tests/visual/corridor.spec.ts`'s reasoning
 * applies unchanged: a full-page shot at the project's default width would show neither block at
 * the width it was drawn at.
 *
 * The German hub — every destination as text — has no baseline of its own: its geometry is the
 * same tile at a different element, and its content is text asserted in
 * `tests/unit/destinations-hub.test.tsx` and `tests/e2e/destinations-hub.spec.ts`.
 */
import { type BrowserContext, expect, test } from "@playwright/test";

/** The recorded refusal `./home.spec.ts` carries: no consent sheet on top of the screenshot. */
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

const PARTS = [
  { suffix: "head", selector: "[data-fo-destinations-hub] h1" },
  {
    suffix: "region",
    selector: "[data-fo-hub-region='centralEurope']",
  },
] as const;

const CASES = [
  {
    name: "all-destinations-desktop",
    viewport: { width: 1440, height: 900 },
  },
  {
    name: "all-destinations-mobile",
    viewport: { width: 390, height: 844 },
  },
] as const;

for (const { name, viewport } of CASES) {
  test(`/en/send-flowers-to at ${String(viewport.width)}px matches ${name}-*`, async ({
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

    const response = await page.goto("/en/send-flowers-to");
    expect(response?.status()).toBe(200);
    await expect(page.locator("[data-fo-consent]")).toHaveCount(0);

    for (const { suffix, selector } of PARTS) {
      await expect(page.locator(selector)).toHaveScreenshot(
        `${name}-${suffix}.png`,
      );
    }
  });
}
