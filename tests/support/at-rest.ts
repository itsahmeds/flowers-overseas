/**
 * The page at rest, with the approved motions on (spec 004 §14 A24 clause 9, AC-44; TASK-194).
 *
 * The suites run with the browser's default `prefers-reduced-motion: no-preference`, so a reader
 * who has not asked for less motion is what they judge. Two moments are not that reader's page at
 * rest, and a measurement taken in them reads a box or a colour no one is left looking at:
 *
 *  - **An opening.** The language popup, the Menu and the consent sheet open with a fade and a
 *    short rise (motion 10). A box read in the same frame the dialog opens is mid-rise, and axe
 *    reads a sheet mid-fade as low-contrast text.
 *  - **A section below the fold** (motion 12) waits at opacity 0 until it is scrolled into view,
 *    so axe would skip its text as hidden.
 *
 * `motionsSettled` waits for every finite transition and animation running on the document clock
 * to end; the bloom (infinite, and only while a navigation waits) and the product page's
 * scroll-driven bar (on a view timeline, which never "finishes") are not waited for.
 * `atRest` first lets the motion module mount (it marks `<html data-fo-motion>`), scrolls the page
 * through so every section and image plays its entrance once, as a reader scrolling would, returns
 * to the top, and then waits for the motions to settle.
 */
import type { Page } from "@playwright/test";

/** Waits two frames (so a transition the last change started is running), then for it to end. */
export async function motionsSettled(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    await Promise.all(
      document
        .getAnimations()
        .filter(
          (animation) =>
            animation.timeline === document.timeline &&
            animation.effect?.getComputedTiming().iterations !== Infinity,
        )
        .map((animation) => animation.finished.catch(() => undefined)),
    );
  });
}

/** Hydrated, every entrance played, scrolled back to the top, nothing moving. */
export async function atRest(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    document.documentElement.hasAttribute("data-fo-motion"),
  );
  await page.evaluate(async () => {
    const frame = (): Promise<unknown> =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    for (
      let top = 0;
      top < document.documentElement.scrollHeight;
      top += Math.max(1, Math.floor(innerHeight / 2))
    ) {
      scrollTo({ top, behavior: "instant" });
      await frame();
    }
    scrollTo({ top: 0, behavior: "instant" });
    await frame();
  });
  await page.waitForFunction(
    () => document.querySelector('[data-fo-reveal="pending"]') === null,
  );
  await motionsSettled(page);
}
