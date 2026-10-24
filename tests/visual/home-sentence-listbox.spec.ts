/**
 * T-77 / AC-71 (spec 004 §14 A-founder-2026-10-21d; TASK-326): the home sentence's own listbox,
 * photographed at the desktop artboard's 1440 x 900
 * (`docs/design/wireframes/home-sentence-listbox-desktop.dc.html`, frames A and C).
 *
 *  - `home-sentence-closed-1440`: the sentence after the island has laid its triggers over the
 *    selects, every listbox closed. Frame A: indistinguishable from the native selects, which
 *    `tests/e2e/home-sentence-listbox.spec.ts` also proves pixel for pixel; the existing
 *    `home-desktop-sentence` baseline in `./home.spec.ts` stays as it was.
 *  - `home-sentence-open-1440`: the country listbox opened by keyboard, Poland selected and
 *    focused (the ring is `:focus-visible`), clipped to the hero card and the panel together,
 *    because the panel sits in the top layer over the card.
 *
 * The `visual` project takes its stills with reduced motion, so motion 10 is the 120 ms fade and
 * `animations: "disabled"` finishes it. Linux baselines come from the `visual:baselines` label
 * (`docs/runbooks/visual-baselines.md`), never by hand.
 */
import { type BrowserContext, expect, test } from "@playwright/test";

import { enhanceSentence, sentenceTrigger } from "../support/sentence.ts";

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

test("/en at 1440 px: the sentence with its listbox closed, and open on Poland", async ({
  page,
  context,
  baseURL,
}) => {
  await recordConsentRefusal(context, baseURL);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "languages", {
      configurable: true,
      get: () => [],
    });
  });
  expect((await page.goto("/en"))?.status()).toBe(200);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await expect(page.locator("[data-fo-consent]")).toHaveCount(0);
  await enhanceSentence(page);
  await page.mouse.move(1, 1);

  await expect(page.locator("[data-fo-sentence]")).toHaveScreenshot(
    "home-sentence-closed-1440.png",
  );

  const trigger = sentenceTrigger(page, "country");
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.locator("#send-country-listbox [tabindex='0']"),
  ).toBeFocused();
  const card = await page.locator("[data-fo-hero-card]").boundingBox();
  const panel = await page.locator("#send-country-listbox").boundingBox();
  if (card === null || panel === null) throw new Error("no card or panel");
  const top = Math.min(card.y, panel.y);
  const left = Math.min(card.x, panel.x);
  await expect(page).toHaveScreenshot("home-sentence-open-1440.png", {
    clip: {
      x: left,
      y: top,
      width: Math.max(card.x + card.width, panel.x + panel.width) - left,
      height:
        Math.min(900, Math.max(card.y + card.height, panel.y + panel.height)) -
        top,
    },
  });
});
