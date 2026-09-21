/**
 * The country occasion as served (spec 008 **AC-1**, AC-6, AC-22, AC-23, the country half of
 * **AC-11**; T-01, T-11; §14 **A7**; TASK-111).
 *
 * What only a real request can prove: which URLs answer 200 and which 404 **with no `Location`**,
 * that a trailing slash is the one shape that redirects rather than 404s, that the document is the
 * same bytes for a visitor with cookies and one without, and that the dated line and the grid
 * render with JavaScript disabled — the honest form of "no client island", because a date that
 * needs a script to appear is one a crawler never sees.
 *
 * **The four locales are asserted as four different answers**, which is what the existence rule
 * produces today: `en` and `en-gb` have the page, `de` and `pl` have no authored occasion slug
 * (TASK-106), so their URLs are 404s rather than thin pages (§2 row 8, §13 Q10).
 */
import { type APIRequestContext, expect, test } from "@playwright/test";

const SERVED = [
  "/en/poland/occasions/mothers-day",
  "/en-gb/poland/occasions/mothers-day",
  "/en/germany/occasions/mothers-day",
  "/en-gb/france/occasions/mothers-day",
] as const;

async function status(
  request: APIRequestContext,
  url: string,
): Promise<number> {
  const response = await request.get(url, { maxRedirects: 0 });
  return response.status();
}

test.describe("existence and the 404 shapes (AC-1, T-01)", () => {
  for (const url of SERVED) {
    test(`${url} is served`, async ({ request }) => {
      expect(await status(request, url)).toBe(200);
    });
  }

  test("every shape AC-1 lists 404s with no Location header", async ({
    request,
  }) => {
    for (const url of [
      // an occasion the destination observes that is below the six-product floor
      "/en/poland/occasions/all-saints-day",
      "/en/poland/occasions/womens-day",
      // an occasion the destination does not observe
      "/en/france/occasions/name-day",
      // an unknown slug, an unknown destination, a country we do not deliver to
      "/en/poland/occasions/arbor-day",
      "/en/atlantis/occasions/mothers-day",
      "/en/belgium/occasions/mothers-day",
      // another locale's segment, and another locale's country slug
      "/en/poland/anlaesse/mothers-day",
      "/en/polska/occasions/mothers-day",
      // a locale with no authored occasion slug (TASK-106), in its own segments
      "/de/polen/anlaesse/muttertag",
      "/pl/polska/okazje/dzien-matki",
      // an unknown locale
      "/fr/poland/occasions/mothers-day",
      // the occasion hub and the occasions index are TASK-112/113's URLs, not this depth's
      "/en/occasions/mothers-day",
      "/en/occasions",
    ]) {
      const response = await request.get(url, { maxRedirects: 0 });
      expect(response.status(), url).toBe(404);
      expect(response.headers()["location"], url).toBeUndefined();
    }
  });

  test("an uppercase variant is not a page (ADR-0006: no case-fixing rewrite)", async ({
    request,
  }) => {
    // AC-1 names the uppercase variant as a 404 shape, so 404 is the assertion — not "200 or
    // 404", which the route could not fail. Next resolves a prerendered route by reading
    // `.next/server/app/<path>.html`, so on a case-insensitive volume (macOS APFS, the founder's
    // machine) the mis-cased path finds the real page's file and answers 200. On the
    // case-sensitive Linux of CI, the preview and production, the segment is not in
    // `generateStaticParams`, `dynamicParams = false` refuses it, and the 404 document answers.
    // The case is therefore skipped on darwin rather than weakened, per
    // `tests/e2e/corridor.spec.ts`. Do not probe this URL against a local build you are still
    // measuring — the 404 Next writes lands on the real page's file and serves "Page not found"
    // until you rebuild (carried forward in `docs/tasks/TASK-110.md` for TASK-118's
    // `docs/runbooks/shop-pages.md`).
    test.skip(
      process.platform === "darwin",
      "case-insensitive local filesystem (APFS) serves the mis-cased path from the real page's prerendered HTML",
    );
    const response = await request.get("/en/poland/occasions/Mothers-Day", {
      maxRedirects: 0,
    });
    // What must never happen anywhere is a **redirect** that fixes the casing.
    expect(
      response.headers()["location"],
      "/en/poland/occasions/Mothers-Day",
    ).toBeUndefined();
    expect(response.status(), "/en/poland/occasions/Mothers-Day").toBe(404);
  });

  test("a trailing slash is a permanent redirect to the bare URL (§14 A7)", async ({
    request,
  }) => {
    const response = await request.get("/en/poland/occasions/mothers-day/", {
      maxRedirects: 0,
    });
    expect([301, 308]).toContain(response.status());
    expect(response.headers()["location"]).toContain(
      "/en/poland/occasions/mothers-day",
    );
  });
});

test.describe("what the page renders (AC-6, AC-11, AC-23)", () => {
  test("prints the destination's own date and the priced grid", async ({
    page,
  }) => {
    await page.goto("/en/poland/occasions/mothers-day");
    await expect(page.locator("h1")).toHaveCount(1);
    // The date is data: the attribute carries the ISO date the view model resolved, and the
    // sentence beside it is `formatDate`'s rendering of that same value.
    const dated = page.locator("[data-fo-occasion-date]");
    await expect(dated).toHaveCount(1);
    await expect(dated).toHaveAttribute(
      "data-fo-occasion-date",
      /^\d{4}-\d{2}-\d{2}$/,
    );
    await expect(page.locator("[data-fo-listing-grid]")).toHaveCount(1);
    const cards = await page.locator("[data-fo-product-card]").count();
    expect(cards).toBeGreaterThanOrEqual(6);
    await expect(page.getByText("You cannot order yet")).toBeVisible();
    // No control that cannot act: the sort form and the pagination are TASK-114's (§14 A8 (c)).
    await expect(page.locator("main button")).toHaveCount(0);
    await expect(page.locator("main form")).toHaveCount(0);
  });

  test("the shop root's occasion table links here, and only here (§14 A10)", async ({
    page,
  }) => {
    await page.goto("/en/poland/flowers");
    const links = page.locator("[data-fo-occasion-page]");
    await expect(links).toHaveCount(1);
    await expect(links.first()).toHaveAttribute(
      "href",
      "/en/poland/occasions/mothers-day",
    );
    // The third column's header exists even where the cell is empty: the column is the table's,
    // not the row's.
    await expect(page.locator("table thead th")).toHaveCount(3);
  });

  test("renders with JavaScript disabled (AC-23)", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/en/poland/occasions/mothers-day");
    await expect(page.locator("[data-fo-occasion-date]")).toHaveCount(1);
    await expect(page.locator("[data-fo-product-card]").first()).toBeVisible();
    await context.close();
  });

  test("nominates at most one LCP image and preloads exactly that one (AC-24)", async ({
    page,
  }) => {
    await page.goto("/en/poland/occasions/mothers-day");
    const priority = await page.locator('img[fetchpriority="high"]').count();
    expect(priority).toBeLessThanOrEqual(1);
    const preloads = await page
      .locator('head link[rel="preload"][as="image"]')
      .count();
    expect(preloads).toBe(priority);
  });
});

test.describe("the cached response (AC-22)", () => {
  test("carries no Vary and no Set-Cookie, and is byte-identical with the cookies", async ({
    request,
  }) => {
    const url = "/en/poland/occasions/mothers-day";
    const plain = await request.get(url);
    const withCookies = await request.get(url, {
      headers: { cookie: "fo_locale=en; fo_currency=PLN; fo_consent=all" },
    });
    expect(plain.headers()["vary"] ?? "").not.toMatch(/cookie/iu);
    expect(plain.headers()["set-cookie"]).toBeUndefined();
    expect(await withCookies.text()).toBe(await plain.text());
  });
});
