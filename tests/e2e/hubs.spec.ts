/**
 * The two destination-less hubs as served (spec 008 **AC-1**, **AC-7**, **AC-11**, AC-22, AC-23;
 * T-01, T-07, T-11; §14 **A7**; TASK-112).
 *
 * What only a real request can prove: which URLs answer 200 and which 404 **with no `Location`**,
 * that a trailing slash is the one shape that redirects rather than 404s, that `/en/flowers` — the
 * country-less categories index §13 Q4 refuses — is still a 404, that the document carries **no
 * currency symbol at all**, and that every block renders with JavaScript disabled.
 *
 * **Four locales, and two of them by their absence.** `de` and `pl` carry machine-drafted
 * catalogue copy, so they have no authored category or occasion slug and therefore **no hub at
 * any URL** (§13 Q10; `slugs.ts`'s rule that a draft is not a URL). The honest assertion for those
 * two locales is a 404 on the URL they would have, and it is below with the rest of the matrix.
 */
import { type APIRequestContext, expect, test } from "@playwright/test";

import { skipsOnCaseInsensitiveHost } from "../support/case-insensitive-host.ts";

/** The hubs that exist on the committed corpus: `en` and `en-gb`, one of each type. */
const HUB_URLS = [
  "/en/flowers/roses",
  "/en-gb/flowers/roses",
  "/en/occasions/mothers-day",
  "/en-gb/occasions/mothers-day",
] as const;

/** Money, in every shape the four launch locales can print it (AC-7). */
const MONEY = /[€£]|\bPLN\b|zł/u;

async function status(
  request: APIRequestContext,
  url: string,
): Promise<number> {
  const response = await request.get(url, { maxRedirects: 0 });
  return response.status();
}

test.describe("existence and the 404 shapes (AC-1, T-01)", () => {
  for (const url of HUB_URLS) {
    test(`${url} is served`, async ({ request }) => {
      expect(await status(request, url)).toBe(200);
    });
  }

  test("every other shape 404s with no Location header", async ({
    request,
  }) => {
    for (const url of [
      // `/{locale}/{shopCategory}` with no category: no country-less categories index ships
      // (§13 Q4), and `/{locale}/{occasions}` is the occasions index, TASK-113's
      "/en/flowers",
      "/en/occasions",
      // an unknown slug in either namespace
      "/en/flowers/atlantis",
      "/en/occasions/atlantis",
      // the other namespace's slug under a hub segment — an occasion is not a category
      "/en/flowers/mothers-day",
      "/en/occasions/roses",
      // a category below the floor everywhere still has a hub; one that has no authored slug in
      // this locale has none — `de` and `pl` have neither, in either namespace (§13 Q10)
      "/de/blumen/rosen",
      "/de/blumen/roses",
      "/de/anlaesse/muttertag",
      "/pl/kwiaty/roze",
      "/pl/kwiaty/roses",
      "/pl/okazje/dzien-matki",
      // another locale's page segment, and an unknown locale
      "/en/blumen/roses",
      "/en/okazje/mothers-day",
      "/fr/flowers/roses",
    ]) {
      const response = await request.get(url, { maxRedirects: 0 });
      expect(response.status(), url).toBe(404);
      expect(response.headers()["location"], url).toBeUndefined();
    }
  });

  test("an uppercase variant is not a page (ADR-0006: no case-fixing rewrite)", async ({
    baseURL,
    request,
  }) => {
    // The predicate is about the **target host**, not the machine Playwright runs on: an APFS
    // checkout answers 200 for a mis-cased prebuilt path because Next resolves it out of the
    // correctly-cased prerendered file, which is a fact about the filesystem and not about this
    // repository. `skipsOnCaseInsensitiveHost` (TASK-110's helper, itself the shape of
    // `tests/e2e/locale-routing.spec.ts:45`) stands the case down only for a local macOS
    // `pnpm start`; pointed at the preview, Railway or CI's Linux it runs and asserts the 404,
    // including from a Mac. The `[200, 404]` this case used to accept would never have caught a
    // regression anywhere.
    test.skip(
      skipsOnCaseInsensitiveHost(baseURL),
      "case-insensitive local filesystem (APFS) serves the mis-cased path from the real page's prerendered HTML",
    );
    const response = await request.get("/en/flowers/Roses", {
      maxRedirects: 0,
    });
    // What must never happen anywhere is a **redirect** that fixes the casing.
    expect(response.headers()["location"]).toBeUndefined();
    expect(response.status()).toBe(404);
  });

  test("a trailing slash is a permanent redirect to the bare URL (§14 A7)", async ({
    request,
  }) => {
    for (const url of ["/en/flowers/roses/", "/en/occasions/mothers-day/"]) {
      const response = await request.get(url, { maxRedirects: 0 });
      expect([301, 308], url).toContain(response.status());
      expect(response.headers()["location"], url).toContain(
        url.replace(/\/$/u, ""),
      );
    }
  });
});

test.describe("a hub shows no money (AC-7, T-07)", () => {
  for (const url of HUB_URLS) {
    test(`${url} prints no currency and says why`, async ({ page }) => {
      const response = await page.goto(url);
      expect(response?.status(), url).toBe(200);
      const main = await page.locator("main").innerText();
      expect(main, url).not.toMatch(MONEY);
      expect(main, url).toContain("We show no price on this page");
      // Every card on the page is on the priceless branch, and there are cards.
      await expect(
        page.locator('[data-fo-product-card-money="priced"]'),
      ).toHaveCount(0);
      await expect(
        page.locator('[data-fo-product-card-money="none"]').first(),
      ).toBeVisible();
      // No purchase affordance and no control that cannot act (§8, §14 A8 (c)).
      await expect(page.locator("main button")).toHaveCount(0);
      await expect(page.locator("main form")).toHaveCount(0);
    });
  }
});

test.describe("what the hubs render (AC-11, §13 Q4)", () => {
  test("the category hub puts the destinations before the products", async ({
    page,
  }) => {
    await page.goto("/en/flowers/roses");
    await expect(page.locator("h1")).toHaveCount(1);
    const blocks = await page
      .locator("[data-fo-hub-destinations], [data-fo-hub-products]")
      .evaluateAll((nodes) =>
        nodes.map((node) =>
          node.hasAttribute("data-fo-hub-destinations")
            ? "destinations"
            : "products",
        ),
      );
    expect(blocks).toEqual(["destinations", "products"]);
    await expect(page.locator("[data-fo-hub-destination]")).toHaveCount(7);
  });

  test("the occasion hub's table is the destination's own computed date", async ({
    page,
  }) => {
    await page.goto("/en/occasions/mothers-day");
    await expect(page.locator("table caption")).toBeVisible();
    // Seven countries, seven rules, four different dates — none of them typed anywhere.
    await expect(page.locator("[data-fo-hub-date]")).toHaveCount(7);
    const table = await page.locator("table").innerText();
    expect(table).toMatch(/\d{1,2} May 2027/u);
    // The third column ("which of these is a link") is TASK-111's (§14 A10).
    await expect(page.locator("table thead th")).toHaveCount(2);
  });

  test("an evergreen occasion has no date table at all (§14 A1)", async ({
    page,
  }) => {
    // Birthday is observed in no country by design, so a table would be seven blank rows.
    const response = await page.goto("/en/occasions/birthday");
    expect(response?.status()).toBe(200);
    await expect(page.locator("[data-fo-hub-dates]")).toHaveCount(0);
    await expect(page.locator("main table")).toHaveCount(0);
    await expect(page.locator("[data-fo-listing-grid]")).toHaveCount(1);
  });

  test("every link out of a hub points at a page the existence rule claims", async ({
    page,
    request,
  }) => {
    // The destination picker's targets are the **country** pages of this entity
    // (`/{locale}/{country}/{shopCategory}/{slug}`), whose route is TASK-110's and TASK-111's.
    // Two assertions: the shape and the source — the hub links at a country-scoped listing URL
    // built by `listingPath()` for a destination `listingExists()` claimed, never at an invented
    // one — and, since PR #89 landed the depth-4 route, the **status**. This task's escalation
    // E-1 was exactly that the seven targets 404'd while the two page types were unmerged; the
    // merge order resolved it, and this loop is what keeps it resolved.
    await page.goto("/en/flowers/roses");
    const hrefs = await page
      .locator("[data-fo-hub-destination] a, a[data-fo-hub-destination]")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("href") ?? ""),
      );
    expect(hrefs).toHaveLength(7);
    for (const href of hrefs) {
      expect(href).toMatch(/^\/en\/[a-z-]+\/flowers\/roses$/u);
      expect(await status(request, href), href).toBe(200);
    }
  });

  test("renders with JavaScript disabled (AC-23)", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/en/occasions/mothers-day");
    await expect(page.locator("[data-fo-product-card]").first()).toBeVisible();
    await expect(page.locator("table caption")).toBeVisible();
    await expect(page.locator("[data-fo-hub-date]")).toHaveCount(7);
    await context.close();
  });
});

test.describe("the cached response (AC-22)", () => {
  test("carries no Vary on cookie and no Set-Cookie, and is byte-identical with them", async ({
    request,
  }) => {
    const url = "/en/flowers/roses";
    const plain = await request.get(url);
    const withCookies = await request.get(url, {
      headers: { cookie: "fo_locale=en; fo_currency=PLN; fo_consent=all" },
    });
    expect(plain.headers()["vary"] ?? "").not.toMatch(/cookie/iu);
    expect(plain.headers()["set-cookie"]).toBeUndefined();
    expect(await withCookies.text()).toBe(await plain.text());
  });
});
