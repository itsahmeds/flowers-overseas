/**
 * The banner's place in the chrome, in the `consent-active` project (spec 004 §14
 * A-founder-2026-10-19d clause 8; TASK-279):
 *
 *  - **AC-48's overlay bullet (T-53):** at 390 × 844 on a page that renders the sticky action bar,
 *    the banner shown does not intersect the bar's action (the committed build's half, the panel
 *    opened from the footer, is `tests/e2e/action-bar.spec.ts`);
 *  - **AC-6 (T-08):** with `prefers-reduced-motion: reduce`, the banner's appearance changes no
 *    property over time but motion 10's reduced fade (opacity, 120 ms or less; A24 clause 9 (c)).
 *    Red with a transform transition left on the sheet under reduced motion (the last case).
 *
 * The fixture's GA4 tag is aborted (`abortGoogle`).
 */
import { type Page, expect, test } from "@playwright/test";

import { abortGoogle } from "../support/consent-active.ts";

const FIXTURE = "/dev/components/action-bar";
const ACTION = "[data-fo-action-bar] a";
const SHEET = '[data-fo-consent-sheet="fixed"] [data-fo-consent]';

interface Rect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

const intersects = (a: Rect, b: Rect): boolean =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

async function rectOf(page: Page, selector: string): Promise<Rect> {
  return page
    .locator(selector)
    .first()
    .evaluate((node) => {
      const box = node.getBoundingClientRect();
      return {
        left: box.left,
        top: box.top,
        right: box.right,
        bottom: box.bottom,
      };
    });
}

/** Every transition that starts on the consent sheet, from the first byte: property and ms. */
async function recordSheetTransitions(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __foSheetMotions: string[] }).__foSheetMotions =
      seen;
    document.addEventListener("transitionrun", (event) => {
      const target = event.target as Element;
      if (!target.closest?.('[data-fo-consent-sheet="fixed"]')) return;
      const running = target
        .getAnimations()
        .find(
          (animation) =>
            (animation as unknown as { transitionProperty?: string })
              .transitionProperty === event.propertyName,
        );
      const duration = Number(running?.effect?.getTiming().duration ?? 0);
      seen.push(`${event.propertyName} ${String(Math.round(duration))}`);
    });
  });
}

const sheetMotions = (page: Page): Promise<string[]> =>
  page.evaluate(
    () =>
      (window as unknown as { __foSheetMotions: string[] }).__foSheetMotions,
  );

/** What reduced motion forbids: anything but an opacity fade of 120 ms or less. */
const forbidden = (motions: readonly string[]): string[] =>
  motions.filter((motion) => {
    const [property, ms] = motion.split(" ");
    return !(property === "opacity" && Number(ms) <= 120);
  });

test.beforeEach(async ({ page }) => {
  await abortGoogle(page);
});

test("AC-48: at 390 × 844 the banner shown never covers the bar's action", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(FIXTURE);
  await expect(page.locator(SHEET)).toBeVisible();
  await expect(page.locator(ACTION)).toBeVisible();
  expect(
    intersects(await rectOf(page, SHEET), await rectOf(page, ACTION)),
  ).toBe(false);
});

test.describe("AC-6: under reduced motion the banner only fades in, in 120 ms or less", () => {
  for (const size of [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ] as const) {
    test(`/en at ${String(size.width)} × ${String(size.height)}`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.setViewportSize(size);
      await recordSheetTransitions(page);
      await page.goto("/en");
      await expect(page.locator('[data-fo-consent="shown"]')).toBeVisible();
      await page.waitForTimeout(600);
      const motions = await sheetMotions(page);
      expect(forbidden(motions)).toEqual([]);
      // The fade did run: the check is not vacuous.
      expect(motions.some((motion) => motion.startsWith("opacity "))).toBe(
        true,
      );
    });
  }

  test("goes red with a transform transition left on the sheet under reduced motion", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await recordSheetTransitions(page);
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent =
          '@layer base { @media (prefers-reduced-motion: reduce) { [data-fo-consent-sheet="fixed"] { transition-property: opacity, transform !important; transition-duration: 300ms !important; } @starting-style { [data-fo-consent-sheet="fixed"] { transform: translateY(40px); } } } }';
        document.head.append(style);
      });
    });
    await page.goto("/en");
    await expect(page.locator('[data-fo-consent="shown"]')).toBeVisible();
    await page.waitForTimeout(800);
    expect(forbidden(await sheetMotions(page))).toContain("transform 300");
  });
});
