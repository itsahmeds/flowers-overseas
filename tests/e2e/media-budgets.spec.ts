/**
 * Image transfer per page, measured in a real browser (spec 006 §2.5 "Budgets", **AC-15**; T-15;
 * TASK-080).
 *
 * `tests/unit/media-budgets.test.tsx` asserts the *manifest's* byte column against the per-slot
 * caps, which is the gate that fires before anything is served. (The 6 MB repository total it
 * used to assert beside them went with the committed bytes in TASK-138: nothing derived is in the
 * repository any more, so a cap on the repository would measure nothing.) This file asserts the
 * other half of AC-15 — **≤ 204 800 B of image transfer per page at a mobile viewport** — which
 * only a browser can answer, because it is the browser that picks a step out of the `srcset` at
 * its own viewport and device-pixel ratio, and it is the browser that declines to fetch anything
 * below the fold until it is scrolled to.
 *
 * Two deliberate choices in how it measures:
 *
 *  - **Every image response, whatever its origin.** The filter is the response's `content-type`,
 *    not a URL pattern, so a photograph served from somewhere other than `/media/` — the day
 *    TASK-083 flips the loader to R2 — is still counted and still has to fit. A budget that only
 *    counted the origin we happen to use today would pass the moment we changed it.
 *  - **After a full scroll.** Lazy images below the fold are the whole point of the lazy attribute
 *    and Lighthouse never fetches them, so a budget measured on first paint would be a budget on
 *    the hero alone. Scrolling to the bottom and settling the network measures what a buyer who
 *    reads the page actually downloads — the honest worst case.
 *
 * `e2e-mobile` is the Pixel 7 profile of `playwright.config.ts`; the desktop project runs the same
 * file, and the assertion is the same number, because §2.5 states one page budget rather than one
 * per breakpoint.
 */
import { expect, test } from "@playwright/test";

/** Spec 006 §2.5 and spec 004 AC-24: the whole-page image budget. */
const PAGE_IMAGE_BUDGET_BYTES = 204_800;

/** Spec 006 §2.5: the hero LCP candidate at the mobile width. */
const HERO_BUDGET_BYTES = 90_000;

/**
 * The pages that carry photographs in Phase 0. The locale home is the one indexable page with
 * imagery; `/dev/components` is the demo-product surface — spec 009's PDP does not exist yet, so
 * the gallery section of the component catalogue is where a product image and its provenance note
 * are rendered together, and it is the surface AC-23's axe run uses for the same reason.
 */
const PAGES = ["/en", "/de", "/pl"] as const;

interface ImageTransfer {
  readonly total: number;
  readonly largest: number;
  readonly byUrl: ReadonlyMap<string, number>;
}

async function measureImages(
  page: import("@playwright/test").Page,
  path: string,
): Promise<ImageTransfer> {
  const byUrl = new Map<string, number>();
  page.on("response", (response) => {
    const type = response.headers()["content-type"] ?? "";
    if (!type.startsWith("image/")) return;
    void response
      .body()
      .then((body) => byUrl.set(response.url(), body.byteLength))
      .catch(() => {
        // A response whose body the browser discarded (a cancelled preload) transfers nothing we
        // can measure; ignoring it cannot hide bytes, because a body we cannot read is one the
        // page never decoded either.
      });
  });

  await page.goto(path, { waitUntil: "networkidle" });
  // Everything below the fold, then settle: the honest worst case (see the header).
  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);
  });
  await page.waitForLoadState("networkidle");

  let total = 0;
  let largest = 0;
  for (const bytes of byUrl.values()) {
    total += bytes;
    largest = Math.max(largest, bytes);
  }
  return { total, largest, byUrl };
}

test.describe("image transfer stays inside the page budget (AC-15)", () => {
  for (const path of PAGES) {
    test(`${path} transfers no more than 204 800 B of images`, async ({
      page,
    }) => {
      const measured = await measureImages(page, path);

      // The page must actually be showing photographs, or the budget is trivially met by a page
      // that shows none — which is exactly the state this task replaced.
      expect(
        await page.locator("picture img").count(),
        "the locale home renders the founder's imagery",
      ).toBeGreaterThan(0);

      const breakdown = [...measured.byUrl.entries()]
        .sort(([, left], [, right]) => right - left)
        .slice(0, 5)
        .map(([url, bytes]) => `${url} ${String(bytes)} B`)
        .join("\n");
      expect(
        measured.total,
        `${path}: ${String(measured.total)} B of images\n${breakdown}`,
      ).toBeLessThanOrEqual(PAGE_IMAGE_BUDGET_BYTES);
    });
  }

  test("the hero LCP candidate is inside its own share of the budget", async ({
    page,
  }) => {
    const measured = await measureImages(page, "/en");
    // The largest single image on the page is the hero band — the one eager, `fetchpriority=high`
    // request — and §2.5 caps it at 90 000 B at the mobile width. Asserting the *largest* rather
    // than looking the hero up by URL keeps the assertion true when the loader origin changes.
    expect(
      measured.largest,
      `largest image response on /en is ${String(measured.largest)} B`,
    ).toBeLessThanOrEqual(HERO_BUDGET_BYTES);
  });

  test("the demo-product surface is inside the same budget", async ({
    page,
  }) => {
    // `/dev/components` is gated on `ENABLE_DEV_UI`; where it is off there is no demo-product
    // surface to measure and the assertion would be about the gate rather than about bytes.
    const response = await page.goto("/dev/components");
    test.skip(
      response === null || response.status() === 404,
      "/dev/components is not enabled on this target",
    );
    const measured = await measureImages(page, "/dev/components");
    expect(measured.total).toBeLessThanOrEqual(PAGE_IMAGE_BUDGET_BYTES);
  });
});
