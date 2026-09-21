/**
 * Wait until every photograph on the page has arrived and decoded — but never longer than a
 * bounded moment (TASK-138).
 *
 * Needed the day the images stopped being local. Until TASK-138 every variant was a file under
 * `public/media/`, served by the same process the test was driving, so an `<img>` was painted
 * within a frame of being scrolled into view and a screenshot could not race it. They are now
 * objects in `flowersoverseas-media`, fetched over the public internet, and an element
 * screenshot of a lazily-loaded card can be taken before the bytes land — measured here as a
 * baseline that passed on one run and failed on the next with the photograph missing, which is
 * exactly the kind of flake that teaches a team to re-run a suite instead of reading it.
 *
 * Two details, both learned the hard way in the same hour:
 *
 *  - **Scroll the whole page first.** A `loading="lazy"` image is not fetched at all until it
 *    nears the viewport, and `decode()` on one that has not started never settles — it hangs,
 *    which turns a flaky screenshot into a 30-second test timeout.
 *  - **Bound the wait.** A variant that genuinely 404s (the gallery's deliberately byte-less
 *    fixture assets) must not hold the suite; after the deadline the screenshot is taken and
 *    shows exactly what a buyer would see, which is the honest outcome.
 */
import type { Page } from "@playwright/test";

/** How long to wait for the last image, in milliseconds. */
const SETTLE_MS = 5_000;

export async function settleImages(
  page: Page,
  timeout = SETTLE_MS,
): Promise<void> {
  await page.evaluate(async (budget: number) => {
    const height = document.body.scrollHeight;
    for (let y = 0; y <= height; y += window.innerHeight) window.scrollTo(0, y);
    window.scrollTo(0, 0);

    const deadline = Date.now() + budget;
    await Promise.all(
      [...document.images].map(async (image) =>
        Promise.race([
          image.decode().catch(() => undefined),
          new Promise((resolve) => {
            setTimeout(resolve, Math.max(0, deadline - Date.now()));
          }),
        ]),
      ),
    );
  }, timeout);
}
