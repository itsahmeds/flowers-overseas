/**
 * Images are served from the origin their slot names, and the page's own policy allows them
 * (spec 006 §2.6, AC-27; ADR-0015, ADR-0016; TASK-138).
 *
 * This is the assertion that the R2 flip — and its one exception — is real rather than merely
 * coded. Three facts, and each of them has failed silently in some project somewhere:
 *
 *  1. **The rendered page points at the right origin, per photograph.** On a locale home the
 *     `hero` photograph (`home-hero`, the LCP image) is served from the application's own origin,
 *     committed under `public/media/` (founder, 2026-10-03, option (a)); every other photograph
 *     comes from the media bucket. Not one image URL names a third origin.
 *  2. **Each file is really there, with the promise on it.** A `GET` of one URL from each origin
 *     returns `200`, an `image/*` content type and
 *     `Cache-Control: public, max-age=31536000, immutable` — set on the object at upload for the
 *     bucket, and by the `/media/*` rule of `next.config.ts` for this origin.
 *  3. **The policy and the images agree.** The document's own CSP `img-src` contains the origin
 *     the document's own `<img>` elements load from. A policy that blocked them would still
 *     render an HTML page full of broken photographs, and Report-Only would hide it entirely.
 *
 * The bucket is a third-party origin, so this file needs the public internet. That dependency
 * is real and is stated here rather than discovered: it exists the moment the bytes leave the
 * repository, and `tests/e2e/media-budgets.spec.ts` already measures those same cross-origin
 * responses.
 */
import { type Page, expect, test } from "@playwright/test";

import { MEDIA_ORIGIN } from "../../src/lib/media-origin";

const PAGE = "/en";

/** The asset of the `hero` slot — the one photograph served from this origin. */
const SITE_ORIGIN_ASSET = "home-hero";

/** Every image URL each `<picture>` names (`srcset` candidates and the `<img>`'s `src`), by asset. */
async function urlsByAsset(page: Page): Promise<Map<string, string[]>> {
  const pairs = await page.evaluate(() =>
    [...document.querySelectorAll("picture")].map((picture) => {
      const asset =
        picture
          .closest("[data-fo-media-asset]")
          ?.getAttribute("data-fo-media-asset") ?? "";
      const urls = [...picture.querySelectorAll("img, source")].flatMap(
        (element) => [
          ...(element.getAttribute("srcset") ?? "")
            .split(",")
            .map((candidate) => candidate.trim().split(/\s+/u)[0] ?? ""),
          element.getAttribute("src") ?? "",
        ],
      );
      return [asset, urls.filter((url) => url !== "")] as const;
    }),
  );
  const byAsset = new Map<string, string[]>();
  for (const [asset, urls] of pairs) {
    byAsset.set(asset, [...(byAsset.get(asset) ?? []), ...urls]);
  }
  return byAsset;
}

test.describe("R2 delivery, with the home hero on this origin (AC-27; founder, 2026-10-03)", () => {
  test("serves the hero from this origin and every other photograph from the media bucket", async ({
    page,
  }) => {
    await page.goto(PAGE, { waitUntil: "networkidle" });
    const byAsset = await urlsByAsset(page);

    const hero = byAsset.get(SITE_ORIGIN_ASSET) ?? [];
    expect(hero.length, "the home hero rendered no image URL").toBeGreaterThan(
      0,
    );
    for (const url of hero) {
      expect(url.startsWith(`/media/${SITE_ORIGIN_ASSET}/`), url).toBe(true);
    }

    const others = [...byAsset].filter(
      ([asset]) => asset !== SITE_ORIGIN_ASSET,
    );
    expect(
      others.length,
      "no photograph besides the hero on the page",
    ).toBeGreaterThan(0);
    for (const [asset, urls] of others) {
      expect(urls.length, asset).toBeGreaterThan(0);
      for (const url of urls) {
        expect(url.startsWith(`${MEDIA_ORIGIN}/`), `${asset}: ${url}`).toBe(
          true,
        );
      }
    }
  });

  test("the file each origin is asked for exists, with the immutable year on it", async ({
    page,
    request,
  }) => {
    await page.goto(PAGE, { waitUntil: "networkidle" });
    const byAsset = await urlsByAsset(page);
    const onSite = (byAsset.get(SITE_ORIGIN_ASSET) ?? [])[0] ?? "";
    const onBucket =
      [...byAsset].find(([asset]) => asset !== SITE_ORIGIN_ASSET)?.[1][0] ?? "";
    expect(onSite.startsWith("/media/"), onSite).toBe(true);
    expect(onBucket.startsWith(`${MEDIA_ORIGIN}/`), onBucket).toBe(true);

    for (const url of [onSite, onBucket]) {
      const response = await request.get(url);

      expect(response.status(), url).toBe(200);
      expect(response.headers()["content-type"], url).toMatch(/^image\//u);
      expect(response.headers()["cache-control"], url).toBe(
        "public, max-age=31536000, immutable",
      );
    }
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
