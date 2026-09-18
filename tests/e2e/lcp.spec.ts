/**
 * The LCP element of a locale home, pinned (spec 004 AC-24's `largest-contentful-paint < 2000 ms`;
 * TASK-056).
 *
 * TASK-056 flips the `lighthouse` job to blocking, and the assertion that was red is this one. The
 * cause was not a slow page: `/de` reported LCP 2.66–2.82 s while FCP was 1.06 s and the hero
 * heading had been painted since 104 ms. The *largest* contentful element was the consent sheet's
 * body paragraph — an `ssr: false` island, so everything it paints lands after hydration, 2.36 s
 * of render delay on Lighthouse's throttled mobile profile — because as one 187-character block it
 * measured 20 748 px² against the heading's 16 461 px².
 *
 * The fix (`bodyParagraphs` in `src/modules/ui/consent/ConsentBannerView.tsx`) is that the body is
 * two paragraphs, i.e. two text blocks, neither of them larger than the heading. It is a property
 * of *copy length*, so it is exactly the kind of fix that a later translation silently undoes: the
 * German and Polish catalogues are English echoes today (`pnpm i18n:check`), and a real
 * translation is typically 20–35 % longer. This file is the guard. It fails on the growth rather
 * than three weeks later on a red required check nobody can attribute.
 *
 * Measured in the browser with the `largest-contentful-paint` PerformanceObserver at Lighthouse's
 * own emulated viewport (412 × 823, the `moto-g-power` profile `lighthouserc.json` configures), so
 * the element this asserts is the element that job will score. Throttling is deliberately **not**
 * emulated: which element wins is a question of geometry, not of network speed, and the timing
 * half of the budget is Lighthouse's to measure.
 *
 * `navigator.languages` is left alone here — unlike in the visual suite, the suggestion banner is
 * *wanted* in frame: on a locale whose language the browser does not prefer it is another island
 * that paints after hydration, and it must not be the largest element either.
 */
import { expect, test } from "@playwright/test";

import { recordLocaleChoice } from "../support/locale-choice.ts";

/** Lighthouse's mobile emulation (`lighthouserc.json` → `collect.settings.screenEmulation`). */
const LIGHTHOUSE_VIEWPORT = { width: 412, height: 823 } as const;

const LOCALES = ["en", "en-gb", "de", "pl"] as const;

interface LcpCandidate {
  readonly startTime: number;
  readonly size: number;
  readonly tag: string;
  readonly text: string;
}

test.describe("the largest contentful paint is the page's own main content", () => {
  test.use({ viewport: LIGHTHOUSE_VIEWPORT });

  for (const locale of LOCALES) {
    test(`/${locale}: the LCP element is the hero heading, not an overlay`, async ({
      page,
      context,
      baseURL,
    }) => {
      // A returning visitor, so the locale suggestion of §14 A14 is silent and the two overlays
      // this test does care about — the consent sheet and the header — are the only ones on
      // screen. Without it, an `en-US` runner meets a modal dialog on `/de` and the sheet it
      // waits for below is deliberately withheld until that question is answered (TASK-119).
      await recordLocaleChoice(context, locale, baseURL);
      await page.addInitScript(() => {
        const candidates: unknown[] = [];
        (window as unknown as { __lcp: unknown[] }).__lcp = candidates;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const element = (entry as unknown as { element?: Element }).element;
            candidates.push({
              startTime: entry.startTime,
              size: (entry as unknown as { size: number }).size,
              tag: element?.tagName ?? "",
              text: (element?.textContent ?? "").slice(0, 80),
            });
          }
        }).observe({ type: "largest-contentful-paint", buffered: true });
      });

      const response = await page.goto(`/${locale}`);
      expect(response?.status()).toBe(200);

      // Both islands have to be on screen before the last candidate can be trusted: the consent
      // sheet is the one that used to win, and the suggestion banner paints in the same corner.
      await expect(page.locator('[data-fo-consent="shown"]')).toBeVisible();
      await page.waitForLoadState("networkidle");
      await page.evaluate(
        async () =>
          new Promise<void>((resolve) => {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                resolve();
              });
            });
          }),
      );

      const candidates = await page.evaluate(
        () => (window as unknown as { __lcp: LcpCandidate[] }).__lcp,
      );
      expect(candidates.length).toBeGreaterThan(0);

      const winner = candidates.at(-1)!;
      expect(
        winner.tag,
        `the last LCP candidate on /${locale} is <${winner.tag}> "${winner.text}" at ${String(
          Math.round(winner.startTime),
        )} ms (${String(winner.size)} px²) — every candidate: ${candidates
          .map(
            (candidate) =>
              `<${candidate.tag}> ${String(candidate.size)} px² @ ${String(
                Math.round(candidate.startTime),
              )} ms`,
          )
          .join("; ")}`,
      ).toBe("H1");
    });
  }
});
