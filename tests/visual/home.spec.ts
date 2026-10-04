/**
 * The locale home's visual baselines (spec 004 AC-27's matrix, extended by TASK-052).
 *
 * Twenty PNGs — ten elements × the two artboard widths — because the full-page `en.png`/`de.png`
 * baselines of `./shell.spec.ts` cannot show any of them at their drawn geometry: they are taken
 * at the `visual` project's 1280 px, while the artboards are drawn at 1440 px and 390 px, and a
 * full-page shot of a growing page hides a 4 px change in an 820 px band.
 *
 *  - `home-hero-*` — the v2 hero band clipped to its own box: the copy, the photograph and the
 *    sentence picker;
 *  - `home-sentence-*` — the sentence picker (spec 004 §14 A21 clause 4; TASK-177), which
 *    replaced the finder card;
 *  - `home-proof-*` — the promise band, v2's form of the proof row and AC-10's trust strip;
 *  - `home-dates-*` — Poland's dates as stamps;
 *  - `home-occasions-*` — the occasion tiles, 2-up mobile and 3-up desktop;
 *  - `home-how-it-works-*` — the explainer band and its steps;
 *  - `home-faq-*` — the disclosures, all closed;
 *  - `home-trending-*` — Popular choices with the honesty label, and no price element anywhere in
 *    the row (TASK-054);
 *  - `home-destinations-*` — the destinations grid (TASK-054).
 *
 * **Every shot below the dates band is taken without it** (`./home-dates.css`, the reason in its
 * header): the band prints a calendar, and a calendar edit must not move the FAQ's pixels. The
 * band's own shot, and the hero, sentence and trending shots above it, are taken as rendered.
 *
 * `navigator.languages` is emptied first, for the reason `./shell.spec.ts` documents.
 */
import { fileURLToPath } from "node:url";

import { type BrowserContext, expect, test } from "@playwright/test";

/**
 * A recorded consent decision, seeded before the first navigation — the same helper
 * `./footer.spec.ts` and `./shell.spec.ts` carry, for the same reason. On the mobile artboard the
 * consent sheet is a bottom sheet that paints **over the finder card**, and an element screenshot
 * captures whatever is painted in the element's box, overlay included; without this the baseline
 * records whether the island's chunk had arrived yet rather than what the card looks like. It
 * made this file flake on the first run after the finder island grew (`/review 40` fix round).
 * With a refusal already in the jar the island renders nothing; the sheet has its own baselines
 * in `./consent.spec.ts`.
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

/**
 * Each section, clipped to its own box. `belowDates` marks a section the page renders under the
 * occasion-dates band, photographed with the band out of the layout (the header).
 */
const PARTS = [
  { suffix: "hero", selector: "[data-fo-hero]", belowDates: false },
  // v2 (TASK-177): the sentence picker replaced the finder, and the promise band is both the
  // proof row and AC-10's trust strip, so it has one baseline, `proof`.
  { suffix: "sentence", selector: "[data-fo-sentence]", belowDates: false },
  { suffix: "proof", selector: "[data-fo-proof-row]", belowDates: true },
  // TASK-053's five sections, each clipped to its own box for the reason the header gives: a
  // full-page shot at 1280 px shows none of them at the geometry the artboards were drawn at.
  { suffix: "dates", selector: "[data-fo-occasion-dates]", belowDates: false },
  { suffix: "occasions", selector: "[data-fo-occasions]", belowDates: true },
  {
    suffix: "how-it-works",
    selector: "[data-fo-how-it-works]",
    belowDates: true,
  },
  { suffix: "faq", selector: "[data-fo-faq]", belowDates: true },
  // TASK-054's two rendered gated sections. The verified-reviews band has **no** baseline,
  // because in Phase 0 it renders nothing and a screenshot of nothing is not a baseline; its
  // populated branch is covered by `/dev/components` and by the unit tests. Popular choices sits
  // above the dates band (v2 order); the destinations grid closes the page.
  { suffix: "trending", selector: "[data-fo-trending]", belowDates: false },
  {
    suffix: "destinations",
    selector: "[data-fo-destinations]",
    belowDates: true,
  },
] as const;

/** Takes the occasion-dates band out of the layout (`./home-dates.css`). */
const HOME_DATES_STYLE = fileURLToPath(
  new URL("./home-dates.css", import.meta.url),
);

/** The two artboard widths, so a baseline is comparable with the design source. */
const CASES = [
  { name: "home-desktop", path: "/en", viewport: { width: 1440, height: 900 } },
  { name: "home-mobile", path: "/en", viewport: { width: 390, height: 844 } },
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
    await expect(page.locator('[data-fo-banner="shown"]')).toHaveCount(0);
    await expect(page.locator("[data-fo-consent]")).toHaveCount(0);

    for (const { suffix, selector, belowDates } of PARTS) {
      await expect(page.locator(selector)).toHaveScreenshot(
        `${name}-${suffix}.png`,
        belowDates ? { stylePath: HOME_DATES_STYLE } : {},
      );
    }
  });
}
