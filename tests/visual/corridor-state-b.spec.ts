/**
 * The corridor page's state-B shop entry, with its chip row (spec 007 §14 A10; TASK-147).
 *
 * One PNG per artboard width of the **shop entry block** on the state-B fixture
 * (`/dev/components/corridor-state-b`): the heading, the body, the shop-root pill and the chip
 * row of the six categories and the occasion. The block is what the task changes, and a
 * full-page shot of a page this long would hide a four-pixel change in a five-thousand-pixel
 * image (`tests/visual/corridor.spec.ts` reasons the same way).
 */
import { expect, test } from "@playwright/test";

const FIXTURE = "/dev/components/corridor-state-b";

const CASES = [
  {
    name: "corridor-state-b-desktop",
    viewport: { width: 1440, height: 900 },
  },
  {
    name: "corridor-state-b-mobile",
    viewport: { width: 390, height: 844 },
  },
] as const;

for (const { name, viewport } of CASES) {
  test(`${FIXTURE} at ${String(viewport.width)}px matches ${name}-shop`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const response = await page.goto(FIXTURE);
    expect(response?.status()).toBe(200);
    await expect(page.locator("[data-fo-corridor-shop-chips]")).toBeVisible();
    await expect(page.locator("[data-fo-corridor-shop]")).toHaveScreenshot(
      `${name}-shop.png`,
    );
  });
}
