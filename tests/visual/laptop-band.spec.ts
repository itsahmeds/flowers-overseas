/**
 * T-46 / AC-41 (spec 004 §14 A23 clause 9; TASK-186): the first screen at 1280 × 800, the 13-14"
 * laptop window the founder judged "big", for the home, the country shop, the country category,
 * an occasion hub, a category hub and the guide.
 *
 * The **viewport** is the assertion, not `main`: what clause 9 changes is how much of each page a
 * laptop shows before the fold (the type steps, the section rhythm and the photograph cap), and
 * only a shot of the window sees that. Both platforms' baselines are taken through the `ci:full`
 * label flow (the `visual` job uploads the Linux PNGs it is missing). Date-driven rows are taken
 * out of the layout by `./dated-blocks.css`, for the reason that file gives.
 */
import { fileURLToPath } from "node:url";

import { type BrowserContext, expect, test } from "@playwright/test";

import { settleImages } from "../support/settle-images.ts";

/** A recorded refusal, so the consent sheet is not in the photograph (`hubs.spec.ts`'s helper). */
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

const DATES_STYLE = fileURLToPath(
  new URL("./dated-blocks.css", import.meta.url),
);

const CASES = [
  { name: "laptop-home", path: "/en-gb" },
  { name: "laptop-country-shop", path: "/en-gb/poland/flowers" },
  { name: "laptop-country-category", path: "/en-gb/poland/flowers/roses" },
  { name: "laptop-occasion-hub", path: "/en-gb/occasions/birthday" },
  { name: "laptop-category-hub", path: "/en-gb/flowers/roses" },
  { name: "laptop-guide", path: "/en-gb/send-flowers-to/poland" },
] as const;

for (const { name, path } of CASES) {
  test(`${path} at 1280 × 800 matches ${name}`, async ({
    page,
    context,
    baseURL,
  }) => {
    await recordConsentRefusal(context, baseURL);
    await page.setViewportSize({ width: 1280, height: 800 });
    // No language suggestion over the page: the browser offers no other language.
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
    await page.evaluate(() => document.fonts.ready);
    await settleImages(page);

    await expect(page).toHaveScreenshot(`${name}.png`, {
      stylePath: DATES_STYLE,
    });
  });
}
