/**
 * The corridor page's visual baselines (spec 007 AC-26, T-28's corridor rows; TASK-091 — the
 * guide state at both artboard widths; the live state, the hub and `/ar-XB` join the matrix with
 * TASK-092/TASK-095).
 *
 * Four PNGs: the two blocks whose geometry the artboards actually fix — the hero band with the
 * `h1`, the status chip, the intro and the reserved photo slot, and the delivery-facts list with
 * its labels and its honest blanks — at 1440 px and at 390 px. `tests/visual/home.spec.ts`'s
 * reasoning applies unchanged: a full-page shot at the project's 1280 px would show neither at
 * the width it was drawn at, and on a page this long it would hide a four-pixel change inside a
 * five-thousand-pixel image.
 *
 * The calendar and the FAQ have **no** baseline on purpose: the calendar's rows move with the
 * build date (it is a twelve-month window from today), so a committed screenshot of it would fail
 * the day the window rolls, and the FAQ is authored prose whose correctness is text, asserted in
 * `tests/unit/corridor-page.test.tsx` and `tests/e2e/corridor.spec.ts`.
 */
import { type BrowserContext, expect, test } from "@playwright/test";

/** The recorded refusal `./home.spec.ts` carries, for the same reason: no consent sheet on top. */
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
  { suffix: "hero", selector: "[data-fo-corridor] h1" },
  { suffix: "facts", selector: "[data-fo-corridor-facts]" },
] as const;

const CASES = [
  {
    name: "corridor-country-desktop",
    path: "/en/send-flowers-to/poland",
    viewport: { width: 1440, height: 900 },
  },
  {
    name: "corridor-country-mobile",
    path: "/en/send-flowers-to/poland",
    viewport: { width: 390, height: 844 },
  },
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
    await expect(page.locator("[data-fo-consent]")).toHaveCount(0);

    for (const { suffix, selector } of PARTS) {
      await expect(page.locator(selector)).toHaveScreenshot(
        `${name}-${suffix}.png`,
      );
    }
  });
}
