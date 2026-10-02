/**
 * Make sure the photographs a screenshot is about to capture have actually arrived, and refuse to
 * take one that would be compared against a baseline it cannot match (TASK-138).
 *
 * Needed the day the images stopped being local. Until TASK-138 every variant was a file under
 * `public/media/`, served by the same process the test was driving, so an `<img>` was painted
 * within a frame of being scrolled into view and a screenshot could not race it. They are now
 * objects in `flowersoverseas-media`, fetched over the public internet from the
 * media origin (`media.flowersoverseas.com`).
 *
 * ## What the first version got wrong, and how that was found
 *
 * `/review 94` round 2 measured `listing-mobile-card-image` failing 2 runs in 9 — photograph
 * absent, 0.36 % of pixels different — and attributed it to the helper's 5 000 ms bound against
 * an origin whose burst max it measured at 5.34 s. Raising the bound to 20 s and making the
 * expiry loud instead of silent turned the flake into a **hard failure on every run**, which is
 * how the real cause surfaced: on `/dev/components`, at 1440 px, **19 of the page's 20 images
 * had never started loading at all**. They are `loading="lazy"`, the page is ~32 000 px tall, and
 * the whole-page scroll ran as one synchronous task — so the browser evaluated intersection only
 * at the final scroll position and never requested them. Measured directly: after the scroll,
 * those 19 have `complete === false` **and `currentSrc === ""`**, which is the browser saying "I
 * was never asked".
 *
 * So the old helper was very nearly a no-op, and the thing that made the baselines pass was
 * `toHaveScreenshot`'s own retry: Playwright scrolls the locator into view, which starts the
 * lazy load, and then re-shoots until the pixels match or its 5 s expect timeout runs out. The
 * flake was that race, not this file's bound. Waiting longer would never have fixed it.
 *
 * ## What it does instead
 *
 * Settle **the element about to be photographed**, not the page:
 *
 *  - scroll it into view — which is what starts a lazy load — and set its images to `eager`, so
 *    the request is a fact rather than an intersection heuristic;
 *  - wait for each of those images to reach a terminal state, then `decode()`, so the pixels are
 *    ready to paint rather than merely downloaded;
 *  - throw, naming the URLs, if any of them is still in flight at the deadline.
 *
 * Page mode (no selector) is kept for the specs that photograph a whole `main`, and there the
 * rule is narrower on purpose: it waits only for images that have **started** (`currentSrc` set)
 * and ignores lazy ones nobody triggered. Waiting for those would mean deciding to load images
 * the committed baselines were recorded without, which is a pixel change dressed as a test fix.
 *
 * ## The three states, and only one of them is this helper's to report
 *
 *  - **Loaded.** Terminal, and the state a screenshot wants.
 *  - **Failed.** A 404, a blocked request, a byte-less fixture asset: also terminal, and the
 *    helper returns on it deliberately — the screenshot then shows exactly what a buyer would
 *    see, the comparison goes red, and the failure names the baseline. **A genuinely missing
 *    image must keep failing red**; masking one here would be the worse bug, and it is the
 *    property `/review 94` passed this file on.
 *  - **In flight.** Started and not finished when the budget runs out. Screenshotting here
 *    produces a picture of a page that does not exist for longer than a second, compared against
 *    a baseline of the page that does — a diff whose cause is invisible in the report. This one
 *    throws.
 *
 * ## Why 20 s
 *
 * Measured, not raised until the red went away. Round 2 measured a 30-key burst at a median of
 * 0.74 s and a max of 5.34 s; re-measured here on 2026-09-21 at load average 5.66, three
 * cache-busted bursts of all 118 objects returned p50 1.25 / 1.56 / 2.51 s, p90 2.51–2.82 s and
 * max 2.67 / 3.10 / 3.72 s, every response a 200. Twenty seconds is about four times the worst
 * single-object latency either measurement saw. It is a ceiling, not a wait: a healthy element
 * settles in well under a second now that its image is requested on purpose, and CI — which
 * always starts cold, and is the gate of record — gets a one-line reason if it is ever reached.
 */
import type { Page } from "@playwright/test";

/**
 * How long to wait for an image to reach a terminal state, in milliseconds. See the header for
 * the measurement behind the number.
 */
const SETTLE_MS = 20_000;

/**
 * @param selector when given, the element about to be photographed: it is scrolled into view and
 *   its own images are loaded eagerly and waited for. Without it the whole page is settled, and
 *   only images that have already started loading are waited for.
 */
export async function settleImages(
  page: Page,
  selector?: string,
  timeout = SETTLE_MS,
): Promise<void> {
  const inFlight = await page.evaluate(
    async ({
      budget,
      target,
    }: {
      budget: number;
      target: string | undefined;
    }) => {
      let images: HTMLImageElement[];

      if (target === undefined) {
        // Page mode. The scroll is kept exactly as it was: it is what the committed baselines
        // were recorded under, and making it trigger more lazy loads would change their pixels.
        const height = document.body.scrollHeight;
        for (let y = 0; y <= height; y += window.innerHeight)
          window.scrollTo(0, y);
        window.scrollTo(0, 0);
        // Only images the browser has actually asked for. `currentSrc === ""` is a lazy image
        // that never intersected: not in flight, not this helper's business.
        images = [...document.images].filter(
          (image) => image.currentSrc !== "",
        );
      } else {
        const element = document.querySelector(target);
        if (element === null) {
          throw new Error(`settleImages: no element matches \`${target}\``);
        }
        element.scrollIntoView({ block: "center" });
        images = [
          ...(element instanceof HTMLImageElement ? [element] : []),
          ...element.querySelectorAll("img"),
        ];
        // Scrolling into view starts a lazy load by intersection; `eager` makes it a certainty
        // rather than a heuristic about a viewport this test is about to photograph anyway. It
        // changes no pixel — only whether the photograph the baseline already contains is there.
        for (const image of images) image.loading = "eager";
      }

      // `load` and `error` between them cover both terminal states; `complete` covers an image
      // that reached one before this ran. `decode()` alone cannot do this job — on an image whose
      // request has not started it simply never settles.
      const terminal = async (image: HTMLImageElement): Promise<void> => {
        if (image.complete) return;
        await new Promise<void>((resolve) => {
          const done = (): void => {
            image.removeEventListener("load", done);
            image.removeEventListener("error", done);
            resolve();
          };
          image.addEventListener("load", done);
          image.addEventListener("error", done);
        });
      };

      await Promise.race([
        Promise.all(images.map(terminal)),
        new Promise((resolve) => {
          setTimeout(resolve, budget);
        }),
      ]);

      // Decode what arrived, so the pixels are ready to paint rather than merely downloaded. A
      // failed image rejects here; that is the terminal-failure case and is the baseline's to
      // report, not this helper's.
      await Promise.all(
        images
          .filter((image) => image.complete)
          .map(async (image) => await image.decode().catch(() => undefined)),
      );

      return images
        .filter((image) => !image.complete)
        .map((image) => image.currentSrc || image.src);
    },
    { budget: timeout, target: selector },
  );

  if (inFlight.length > 0) {
    throw new Error(
      `settleImages: ${String(inFlight.length)} image(s) were still loading after ${String(timeout)} ms${selector === undefined ? "" : ` in \`${selector}\``}, so a screenshot now would compare a page that never existed against the baseline. Still in flight:\n  ${inFlight.slice(0, 10).join("\n  ")}`,
    );
  }
}
