/**
 * Images are served from the bucket, and the page's own policy allows them (spec 006 §2.6,
 * AC-27; ADR-0015, ADR-0016; TASK-138).
 *
 * This is the assertion that the R2 flip is real rather than merely coded. Three facts, and each
 * of them has failed silently in some project somewhere:
 *
 *  1. **The rendered page points at the bucket.** Every image URL in a locale home comes from
 *     the media origin, and nothing is served from the application's own origin any more — the
 *     6 MB of derived bytes that used to sit in `public/media/` are gone, which is what lets all
 *     84 products carry photographs instead of twelve.
 *  2. **The object is really there, with the promise on it.** A `GET` of the first URL the page
 *     names returns `200`, an `image/*` content type and
 *     `Cache-Control: public, max-age=31536000, immutable` — set on the object at upload, since
 *     no `next.config.ts` rule can set a header on a host we do not serve.
 *  3. **The policy and the images agree.** The document's own CSP `img-src` contains the origin
 *     the document's own `<img>` elements load from. A policy that blocked them would still
 *     render an HTML page full of broken photographs, and Report-Only would hide it entirely.
 *
 * The images are a third-party origin, so this file needs the public internet. That dependency
 * is real and is stated here rather than discovered: it exists the moment the bytes leave the
 * repository, and `tests/e2e/media-budgets.spec.ts` already measures those same cross-origin
 * responses.
 */
import { expect, test } from "@playwright/test";

import { MEDIA_ORIGIN } from "../../src/lib/media-origin";

const PAGE = "/en";

test.describe("R2 delivery (AC-27)", () => {
  test("serves every photograph from the media bucket and none from this origin", async ({
    page,
  }) => {
    await page.goto(PAGE, { waitUntil: "networkidle" });

    const sources = await page.evaluate(() =>
      [...document.querySelectorAll("picture img, picture source")].flatMap(
        (element) => {
          const srcSet = element.getAttribute("srcset") ?? "";
          const src = element.getAttribute("src") ?? "";
          return [
            ...srcSet
              .split(",")
              .map((candidate) => candidate.trim().split(/\s+/u)[0] ?? ""),
            src,
          ].filter((value) => value !== "");
        },
      ),
    );

    expect(sources.length).toBeGreaterThan(0);
    for (const source of sources) {
      expect(source, "an image URL that is not on the media origin").toContain(
        `${MEDIA_ORIGIN}/`,
      );
    }
  });

  test("the object the page asks for exists, with the immutable year on it", async ({
    page,
    request,
  }) => {
    await page.goto(PAGE, { waitUntil: "networkidle" });
    const first = await page.locator("picture img").first().getAttribute("src");
    expect(first).toContain(MEDIA_ORIGIN);

    const response = await request.get(first ?? "");

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toMatch(/^image\//u);
    expect(response.headers()["cache-control"]).toBe(
      "public, max-age=31536000, immutable",
    );
  });

  test("the document's own policy allows the origin its images come from", async ({
    page,
  }) => {
    const response = await page.goto(PAGE, { waitUntil: "domcontentloaded" });
    const headers = response?.headers() ?? {};
    const policy =
      headers["content-security-policy-report-only"] ??
      headers["content-security-policy"] ??
      "";

    const imgSrc = policy
      .split(";")
      .map((directive) => directive.trim())
      .find((directive) => directive.startsWith("img-src"));

    expect(
      imgSrc,
      "no img-src directive in the document's policy",
    ).toBeDefined();
    expect(imgSrc).toContain(MEDIA_ORIGIN);
  });

  test("the document hints the connection its images need, before the document is parsed", async ({
    page,
  }) => {
    // The third-party handshake TASK-138 introduced is on the LCP critical path, and the only
    // place a hint can be emitted ahead of the hero preload is the response itself: a rendered
    // `<link rel="preconnect">` flushes after React's image preloads, and `preconnect()` from
    // `react-dom` does not cross the RSC boundary under Next at all (both measured — see
    // `src/lib/media-headers.ts`). So the assertion is on the header, on the same document whose
    // `img-src` the test above checks, and the two name the same origin.
    const response = await page.goto(PAGE, { waitUntil: "domcontentloaded" });
    const link = response?.headers()["link"] ?? "";

    expect(link, "no Link header on the document").toContain(
      `<${MEDIA_ORIGIN}>; rel=preconnect`,
    );
    // No `crossorigin`: the images and the hero preload are credentialed non-CORS fetches, and an
    // anonymous connection is not the connection they would reuse.
    const hint = link
      .split(",")
      .map((part) => part.trim())
      .find((part) => part.includes("rel=preconnect"));

    expect(hint).not.toContain("crossorigin");
  });
});
