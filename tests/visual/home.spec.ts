/**
 * The locale home's visual baselines (spec 004 AC-27's matrix, extended by TASK-052).
 *
 * Twenty PNGs — ten elements × the two artboard widths — because the full-page `en.png`/`de.png`
 * baselines of `./shell.spec.ts` cannot show any of them at their drawn geometry: they are taken
 * at the `visual` project's 1280 px, while the artboards are drawn at 1440 px and 390 px, and a
 * full-page shot of a growing page hides a 4 px change in an 820 px band.
 *
 *  - `home-hero-*` — the whole band clipped to its own box: the reserved photo slot with its
 *    caption, the paper card at the inline start (desktop) or overlapping the slot by 56 px
 *    (mobile), the eyebrow, the `H1` and the proposition;
 *  - `home-finder-*` — the finder card: three labelled fields, the neutral `Continue`, the help
 *    and cutoff lines and the destination list with its seven states;
 *  - `home-proof-*` — the four-fact strip, 4-up on the desktop artboard and 2-up on the mobile
 *    one;
 *  - `home-dates-*` — the "Coming up in Poland" band, with the cutoff line the mobile artboard
 *    omits;
 *  - `home-occasions-*` — the six occasion tiles with their square photo placeholders, 2-up
 *    mobile and 3-up desktop;
 *  - `home-how-it-works-*` — the explainer band, its photo placeholder and the three steps;
 *  - `home-faq-*` — the five disclosures, all closed;
 *  - `home-trust-*` — the three claims, 1-up mobile and 3-up desktop;
 *  - `home-trending-*` — the florists' picks with the honesty label, 2-up mobile and 5-up
 *    desktop, and no price element anywhere in the row (TASK-054);
 *  - `home-destinations-*` — the destinations grid: Poland with its five cities, the six guides
 *    and the copy-only "Somewhere else?" cell (TASK-054).
 *
 * The type-ahead's open state is deliberately **not** a baseline: it is a hydrated, transient
 * state whose contents depend on what was typed, and it is pinned by DOM assertions in
 * `tests/e2e/home.spec.ts` and by axe in `tests/a11y/home.spec.ts` instead. `navigator.languages`
 * is emptied first, for the reason `./shell.spec.ts` documents.
 */
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

const PARTS = [
  { suffix: "hero", selector: "[data-fo-hero]" },
  { suffix: "finder", selector: "[data-fo-finder]" },
  { suffix: "proof", selector: "[data-fo-proof-row]" },
  // TASK-053's five sections, each clipped to its own box for the reason the header gives: a
  // full-page shot at 1280 px shows none of them at the geometry the artboards were drawn at.
  { suffix: "dates", selector: "[data-fo-occasion-dates]" },
  { suffix: "occasions", selector: "[data-fo-occasions]" },
  { suffix: "how-it-works", selector: "[data-fo-how-it-works]" },
  { suffix: "faq", selector: "[data-fo-faq]" },
  { suffix: "trust", selector: "[data-fo-trust-strip]" },
  // TASK-054's two rendered gated sections. The verified-reviews band has **no** baseline,
  // because in Phase 0 it renders nothing and a screenshot of nothing is not a baseline; its
  // populated branch is covered by `/dev/components` and by the unit tests.
  { suffix: "trending", selector: "[data-fo-trending]" },
  { suffix: "destinations", selector: "[data-fo-destinations]" },
] as const;

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

    for (const { suffix, selector } of PARTS) {
      await expect(page.locator(selector)).toHaveScreenshot(
        `${name}-${suffix}.png`,
      );
    }
  });
}
