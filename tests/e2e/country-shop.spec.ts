/**
 * The country shop root as served (spec 008 **AC-1**, AC-6, **AC-8**, AC-22, AC-23, **AC-24**;
 * T-01, T-08, T-24; §14 **A7**; TASK-109).
 *
 * What only a real request can prove: which URLs answer 200 and which 404 **with no `Location`**,
 * that a trailing slash is the one shape that redirects rather than 404s, that the document is the
 * same bytes for a visitor with cookies and one without, and that the page renders with JavaScript
 * disabled — the honest form of "no client island", because a grid that needs a script to appear
 * has one whatever the bundle says.
 *
 * The empty state (AC-8) is **not** here: §2 row 6 gives a shop root only where ≥1 deliverable
 * product does, so no URL on the committed corpus reaches it. Spec 008 §14 **A8 (b)** allows the
 * dev gallery or a fixture provider swap; this task uses the gallery — TASK-108's
 * `/dev/components` renders `ListingEmpty` and `tests/a11y/dev-components.spec.ts` audits it —
 * plus the page-level unit assertion in `tests/unit/catalog-shop-page.test.tsx`. The scan below
 * checks the gallery's rendered empty state for the three things AC-8 names.
 */
import { type APIRequestContext, expect, test } from "@playwright/test";

const SHOP_URLS = [
  "/en/poland/flowers",
  "/en-gb/poland/flowers",
  "/de/polen/blumen",
  "/pl/polska/kwiaty",
] as const;

async function status(
  request: APIRequestContext,
  url: string,
): Promise<number> {
  const response = await request.get(url, { maxRedirects: 0 });
  return response.status();
}

test.describe("existence and the 404 shapes (AC-1, T-01)", () => {
  for (const url of SHOP_URLS) {
    test(`${url} is served`, async ({ request }) => {
      expect(await status(request, url)).toBe(200);
    });
  }

  test("an unknown slug, another locale's segment, casing and an unknown locale all 404 with no Location", async ({
    request,
  }) => {
    for (const url of [
      // an unknown country slug and a country that is not a destination
      "/en/atlantis/flowers",
      "/en/belgium/flowers",
      // another locale's segment and another locale's slug
      "/en/poland/blumen",
      "/en/polska/kwiaty",
      "/pl/poland/flowers",
      // an unknown page segment under a real destination
      "/en/poland/bouquets",
      // an unknown locale
      "/fr/poland/flowers",
      // the category hub and the bare page segment (§13 Q4) — TASK-112/113's URLs, and until they
      // exist, a 404 rather than a thin page
      "/en/flowers/roses",
      "/en/flowers",
    ]) {
      const response = await request.get(url, { maxRedirects: 0 });
      expect(response.status(), url).toBe(404);
      expect(response.headers()["location"], url).toBeUndefined();
    }
  });

  test("an uppercase variant is not a page (ADR-0006: no case-fixing rewrite)", async ({
    request,
  }) => {
    // Recorded, macOS-only: an APFS checkout answers 200 for an uppercase prebuilt path because
    // the filesystem is case-insensitive; Linux (and CI) answers 404. The assertion is the Linux
    // one — what must never happen anywhere is a **redirect** that fixes the casing.
    const response = await request.get("/en/Poland/flowers", {
      maxRedirects: 0,
    });
    expect(response.headers()["location"]).toBeUndefined();
    expect([200, 404]).toContain(response.status());
  });

  test("a trailing slash is a permanent redirect to the bare URL (§14 A7)", async ({
    request,
  }) => {
    const response = await request.get("/en/poland/flowers/", {
      maxRedirects: 0,
    });
    expect([301, 308]).toContain(response.status());
    expect(response.headers()["location"]).toContain("/en/poland/flowers");
  });
});

test.describe("what the page renders (AC-6, AC-24)", () => {
  test("opens with the priced grid, before any prose block", async ({
    page,
  }) => {
    await page.goto("/en/poland/flowers");
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("[data-fo-listing-grid]")).toHaveCount(1);
    await expect(page.locator("[data-fo-product-card]")).toHaveCount(12);
    // The demo sentence, the whole of the Phase 0 state: no control that cannot act.
    await expect(page.getByText("You cannot order yet")).toBeVisible();
    await expect(page.locator("main button")).toHaveCount(0);
    await expect(page.locator("main form")).toHaveCount(0);
  });

  test("nominates at most one LCP image and preloads exactly that one (AC-24)", async ({
    page,
  }) => {
    await page.goto("/en/poland/flowers");
    const priority = await page.locator('img[fetchpriority="high"]').count();
    expect(priority).toBeLessThanOrEqual(1);
    // The preload is emitted from the same manifest lookup as the `srcset`, and hoisted into
    // `<head>` by React's `preload()` — so there is one of it exactly when there is one of them.
    const preloads = await page
      .locator('head link[rel="preload"][as="image"]')
      .count();
    expect(preloads).toBe(priority);
  });

  test("renders with JavaScript disabled (AC-23)", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/en/poland/flowers");
    await expect(page.locator("[data-fo-product-card]")).toHaveCount(12);
    await expect(page.locator("[data-fo-category-tile]").first()).toBeVisible();
    await expect(page.locator("table caption")).toBeVisible();
    await context.close();
  });
});

test.describe("the cached response (AC-22)", () => {
  test("carries no Vary and no Set-Cookie, and is byte-identical with the cookies", async ({
    request,
  }) => {
    const plain = await request.get("/en/poland/flowers");
    const withCookies = await request.get("/en/poland/flowers", {
      headers: { cookie: "fo_locale=en; fo_currency=PLN; fo_consent=all" },
    });
    // Next's own `Vary` names the RSC routing headers and `Accept-Encoding`; what AC-22 forbids
    // is a response that varies by **cookie**, which is what would make a cached body differ per
    // visitor (`tests/e2e/corridor.spec.ts` reads AC-23 the same way).
    expect(plain.headers()["vary"] ?? "").not.toMatch(/cookie/iu);
    expect(plain.headers()["set-cookie"]).toBeUndefined();
    expect(await withCookies.text()).toBe(await plain.text());
  });
});

test.describe("the empty state, through the gallery (AC-8, T-08, §14 A8 (b))", () => {
  test("one sentence, the ways out, and no grid, skeleton or card", async ({
    page,
  }) => {
    const response = await page.goto("/dev/components");
    expect(
      response?.status(),
      "/dev/components must be served; is ENABLE_DEV_UI=true on the target?",
    ).toBe(200);

    const empty = page.locator("[data-fo-listing-empty]").first();
    await expect(empty).toBeVisible();
    await expect(empty.locator("ul")).toHaveCount(0);
    await expect(empty.locator("[data-fo-product-card]")).toHaveCount(0);
    await expect(empty.locator("[data-fo-listing-grid]")).toHaveCount(0);
    await expect(empty.locator("a")).not.toHaveCount(0);
    const text = await empty.innerText();
    expect(text).toMatch(/Nothing we can deliver/iu);
    expect(text).not.toMatch(/[£€]|PLN|zł/u);
  });
});
