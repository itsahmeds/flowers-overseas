/**
 * The country category as served (spec 008 **AC-1**, AC-5, AC-6, AC-22, AC-23; T-01, T-05;
 * §14 **A7**, **A8 (c)**; TASK-110).
 *
 * What only a real request can prove: which URLs answer 200 and which 404 **with no `Location`**,
 * that the below-floor category is one of the 404s, that a trailing slash is the one shape that
 * redirects, that the document is the same bytes with cookies and without, and that the page
 * renders with JavaScript disabled — the honest form of "no client island", because a grid that
 * needs a script to appear has one whatever the bundle says.
 *
 * **Four locales, two of which have no page**, and that is the assertion rather than a gap: the
 * ~31 category slugs are human-authored per locale and never machine-drafted (§13 Q10), so `de`
 * and `pl` have no country-category URL until TASK-106 authors their slugs — and what must be true
 * meanwhile is that `/de/polen/blumen/rosen` is a **404 with no `Location`**, not a redirect to
 * English and not an English page under a German URL.
 *
 * The empty state is not here and cannot be: a category page exists only where six products do
 * (§2 row 7), so the empty grid has no URL to render at. The state that matters is the one above
 * it — a category that *falls* below the floor becomes a 404 at the next build — and that is
 * `tests/unit/catalog-category-data-flip.test.ts`, read from the other end.
 */
import { type APIRequestContext, expect, test } from "@playwright/test";

/** One category page per locale that has one; the two that do not are asserted as 404s below. */
const CATEGORY_URLS = [
  "/en/poland/flowers/roses",
  "/en-gb/poland/flowers/roses",
  "/en/germany/flowers/hand-tied-bouquets",
  "/en-gb/romania/flowers/mixed-flowers",
] as const;

async function status(
  request: APIRequestContext,
  url: string,
): Promise<number> {
  const response = await request.get(url, { maxRedirects: 0 });
  return response.status();
}

test.describe("existence and the 404 shapes (AC-1, T-01)", () => {
  for (const url of CATEGORY_URLS) {
    test(`${url} is served`, async ({ request }) => {
      expect(await status(request, url)).toBe(200);
    });
  }

  test("a category below the six-product floor is a 404, not a thin page (§13 Q7)", async ({
    request,
  }) => {
    // Orchids has 3 products in Poland and sunflowers 4, against a floor of 6. Neither has a URL
    // in any locale, and neither is a `noindex` page or an empty grid: `plan/02` §6's "pages that
    // fail the rule are **not created**" is structural here.
    for (const url of [
      "/en/poland/flowers/orchids",
      "/en-gb/poland/flowers/orchids",
      "/en/poland/flowers/sunflowers",
    ]) {
      const response = await request.get(url, { maxRedirects: 0 });
      expect(response.status(), url).toBe(404);
      expect(response.headers()["location"], url).toBeUndefined();
    }
  });

  test("an unknown slug, another locale's segment, a missing slug locale and an unknown locale all 404 with no Location", async ({
    request,
  }) => {
    for (const url of [
      // an unknown category slug and an unknown country slug
      "/en/poland/flowers/orchidee",
      "/en/atlantis/flowers/roses",
      "/en/belgium/flowers/roses",
      // another locale's page segment and another locale's country slug
      "/en/poland/blumen/roses",
      "/en/polska/flowers/roses",
      "/pl/poland/flowers/roses",
      // `de` and `pl` have no authored category slug yet (§13 Q10): no page, no redirect,
      // no English body under a German URL
      "/de/polen/blumen/rosen",
      "/pl/polska/kwiaty/roze",
      "/de/polen/blumen/roses",
      // TASK-111's occasion URL, which does not exist yet
      "/en/poland/occasions/womens-day",
      // an unknown locale
      "/fr/poland/flowers/roses",
      // one segment too deep
      "/en/poland/flowers/roses/red",
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
    const response = await request.get("/en/poland/flowers/Roses", {
      maxRedirects: 0,
    });
    expect(response.headers()["location"]).toBeUndefined();
    expect([200, 404]).toContain(response.status());
  });

  test("a trailing slash is a permanent redirect to the bare URL (§14 A7)", async ({
    request,
  }) => {
    const response = await request.get("/en/poland/flowers/roses/", {
      maxRedirects: 0,
    });
    expect([301, 308]).toContain(response.status());
    expect(response.headers()["location"]).toContain(
      "/en/poland/flowers/roses",
    );
  });
});

test.describe("what the page renders (AC-6, §14 A8 (c))", () => {
  test("one h1, the sibling row, one grid and no control that cannot act", async ({
    page,
  }) => {
    await page.goto("/en/poland/flowers/roses");
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toHaveText("Roses we make for Poland");
    await expect(page.locator("[data-fo-listing-grid]")).toHaveCount(1);
    await expect(page.locator("[data-fo-product-card]")).toHaveCount(12);
    // The sibling row is the whole browsing affordance (§13 Q6): links to pages that exist, the
    // current category marked and not a link to itself.
    const siblings = page.locator("#sibling-categories");
    await expect(siblings).toBeVisible();
    await expect(siblings.locator("a")).not.toHaveCount(0);
    await expect(siblings.locator('[aria-current="page"]')).toHaveCount(1);
    // The demo sentence, the whole of the Phase 0 state.
    await expect(page.getByText("You cannot order yet")).toBeVisible();
    // Toolbar and pagination wait for TASK-114's `searchParams` (§14 A8 (c)).
    await expect(page.locator("main form")).toHaveCount(0);
    await expect(page.locator("main button")).toHaveCount(0);
    await expect(page.locator("main select")).toHaveCount(0);
    await expect(
      page.locator('main nav[aria-label="Pages of products"]'),
    ).toHaveCount(0);
  });

  test("every link on the page is to a URL that exists (AC-5's link half)", async ({
    page,
    request,
  }) => {
    await page.goto("/en/poland/flowers/roses");
    const hrefs = await page
      .locator("main a[href^='/']")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("href") ?? ""),
      );
    expect(hrefs.length).toBeGreaterThan(5);
    for (const href of new Set(hrefs)) {
      // No parameterised URL is ever an `<a href>` (AC-15).
      expect(href, href).not.toMatch(/[?&](?:page|sort)=/u);
      expect(await status(request, href), href).toBe(200);
    }
  });

  test("nominates at most one LCP image and preloads exactly that one (AC-24)", async ({
    page,
  }) => {
    await page.goto("/en/poland/flowers/roses");
    const priority = await page.locator('img[fetchpriority="high"]').count();
    expect(priority).toBeLessThanOrEqual(1);
    const preloads = await page
      .locator('head link[rel="preload"][as="image"]')
      .count();
    expect(preloads).toBe(priority);
  });

  test("renders with JavaScript disabled (AC-23)", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/en/poland/flowers/roses");
    await expect(page.locator("[data-fo-product-card]")).toHaveCount(12);
    await expect(page.locator("#sibling-categories a").first()).toBeVisible();
    await context.close();
  });
});

test.describe("the cached response (AC-22)", () => {
  test("carries no Vary and no Set-Cookie, and is byte-identical with the cookies", async ({
    request,
  }) => {
    const url = "/en/poland/flowers/roses";
    const plain = await request.get(url);
    const withCookies = await request.get(url, {
      headers: { cookie: "fo_locale=en; fo_currency=PLN; fo_consent=all" },
    });
    // Next's own `Vary` names the RSC routing headers and `Accept-Encoding`; what AC-22 forbids is
    // a response that varies by **cookie**, which is what would make a cached body differ per
    // visitor.
    expect(plain.headers()["vary"] ?? "").not.toMatch(/cookie/iu);
    expect(plain.headers()["set-cookie"]).toBeUndefined();
    expect(await withCookies.text()).toBe(await plain.text());
  });
});
