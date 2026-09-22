/**
 * Sort, pagination and the parameter policy as served (spec 008 **AC-9**, **AC-10**, **AC-15**,
 * **AC-22**; T-09, T-10, T-15, T-22; TASK-114).
 *
 * What only a real request can prove: the status code and `Location` of `?page=1`, that a page
 * past the last is a **404** and not an empty grid, that the canonical and the robots meta of a
 * sorted URL point away from it, that the sort form submits and reorders with **JavaScript
 * disabled**, that the pagination is keyboard-operable, and that a parameterised response carries
 * §5.4's shared-cache header, no `Vary: Cookie` and no `Set-Cookie`.
 *
 * `?page=1` answers **308**, not the 301 AC-10 names: a Next page render cannot choose a status
 * code, a `next.config` redirect cannot strip the parameter it matched, and `src/proxy.ts` is
 * closed to redirects (spec 001 §11). Spec 007 §14 **A6** ruled this exact shape for the trailing
 * slash — "Next's 308 today; Cloudflare's 301 once spec 040 fronts the origin" — and its e2e
 * asserts `301|308` with the `Location`, which is what this file does too. The escalation is
 * recorded in `docs/tasks/TASK-114.md`.
 */
import { type APIRequestContext, expect, test } from "@playwright/test";

/** The one country shop root that exists in every launch locale today. */
const SHOP = "/en/poland/flowers";

/** Every launch locale's own shop root, for the rules that are locale-independent. */
const SHOP_URLS = [
  "/en/poland/flowers",
  "/en-gb/poland/flowers",
  "/de/polen/blumen",
  "/pl/polska/kwiaty",
] as const;

const canonicalOf = (html: string): string | undefined =>
  /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/iu.exec(html)?.[1];

const robotsOf = (html: string): string | undefined =>
  /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/iu.exec(
    html,
  )?.[1];

const titleOf = (html: string): string =>
  /<title[^>]*>([^<]*)<\/title>/iu.exec(html)?.[1] ?? "";

async function body(
  request: APIRequestContext,
  url: string,
): Promise<{ status: number; html: string; headers: Record<string, string> }> {
  const response = await request.get(url, { maxRedirects: 0 });
  return {
    status: response.status(),
    html: response.status() === 200 ? await response.text() : "",
    headers: response.headers(),
  };
}

test.describe("pagination (AC-10, T-10)", () => {
  for (const url of SHOP_URLS) {
    test(`${url}?page=1 permanently redirects to the bare URL`, async ({
      request,
    }) => {
      const response = await request.get(`${url}?page=1`, { maxRedirects: 0 });
      expect([301, 308]).toContain(response.status());
      expect(response.headers()["location"]).toBe(url);
    });
  }

  test("a page number riding with a sort or a facet redirects to the bare URL too", async ({
    request,
  }) => {
    for (const query of ["page=1&sort=price-asc", "page=1&colour=red"]) {
      const response = await request.get(`${SHOP}?${query}`, {
        maxRedirects: 0,
      });
      expect([301, 308], query).toContain(response.status());
      // One hop, and the target is the 200 that should be indexed — never a second parameterised
      // URL (§6 "no redirect chains").
      expect(response.headers()["location"], query).toBe(SHOP);
    }
  });

  test("?page=2 renders the next twelve, self-canonical, with a `· Page N` title", async ({
    request,
  }) => {
    const first = await body(request, SHOP);
    const second = await body(request, `${SHOP}?page=2`);
    expect(second.status).toBe(200);

    const cards = (html: string): string[] =>
      [...html.matchAll(/data-fo-product-card="([^"]+)"/gu)].map(
        (match) => match[1] ?? "",
      );
    expect(cards(second.html)).toHaveLength(12);
    // A different twelve: page 2 is a page, not the same grid under another URL.
    expect(cards(second.html)).not.toEqual(cards(first.html));
    expect(
      cards(second.html).filter((sku) => cards(first.html).includes(sku)),
    ).toHaveLength(0);

    expect(canonicalOf(second.html)).toMatch(/\/en\/poland\/flowers\?page=2$/u);
    expect(titleOf(second.html)).toContain("· Page 2");
    expect(titleOf(first.html)).not.toContain("· Page");
    // The base page's directive, inherited: pagination is not a duplication signal.
    expect(robotsOf(second.html)).toBe(robotsOf(first.html));
  });

  test("a page past the last is a real 404, never an empty grid", async ({
    request,
  }) => {
    const response = await request.get(`${SHOP}?page=99`, { maxRedirects: 0 });
    expect(response.status()).toBe(404);
    expect(response.headers()["location"]).toBeUndefined();
    expect(await response.text()).not.toContain("data-fo-listing-grid");
  });

  test("a malformed page renders page 1 at a `noindex` URL and redirects nowhere", async ({
    request,
  }) => {
    for (const value of ["0", "-1", "1.5", "abc"]) {
      const response = await request.get(`${SHOP}?page=${value}`, {
        maxRedirects: 0,
      });
      expect(response.status(), value).toBe(200);
      const html = await response.text();
      expect(robotsOf(html), value).toBe("noindex,follow");
      expect(canonicalOf(html), value).toMatch(/\/en\/poland\/flowers$/u);
    }
  });

  test("the control is a labelled nav of real links, and it works with JavaScript off", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(SHOP);
    const nav = page.locator("nav[data-fo-pagination]");
    await expect(nav).toBeVisible();
    await expect(nav).toHaveAttribute("aria-label", /.+/u);
    // Every control is an `<a href>`; the current page is not a link.
    await expect(nav.locator("button")).toHaveCount(0);
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
    await nav.getByRole("link", { name: /page 2/iu }).click();
    await expect(page).toHaveURL(/\?page=2$/u);
    await expect(page.locator("[data-fo-product-card]")).toHaveCount(12);
    await context.close();
  });
});

test.describe("sorting (AC-9, T-09)", () => {
  test("the form submits and reorders with JavaScript disabled", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(SHOP);

    const skus = async (): Promise<string[]> =>
      page
        .locator("[data-fo-product-card]")
        .evaluateAll((cards) =>
          cards.map((card) => card.getAttribute("data-fo-product-card") ?? ""),
        );
    const before = await skus();

    await page.getByLabel(/sort by/iu).selectOption("price-asc");
    await page.getByRole("button", { name: /^sort$/iu }).click();

    await expect(page).toHaveURL(/\?sort=price-asc$/u);
    await expect(page.locator("[data-fo-listing-toolbar]")).toHaveAttribute(
      "data-fo-listing-toolbar",
      "price-asc",
    );
    expect(await skus()).not.toEqual(before);
    await context.close();
  });

  test("the whole control is reachable and operable from the keyboard alone", async ({
    page,
  }) => {
    await page.goto(SHOP);
    const select = page.getByLabel(/sort by/iu);
    await select.focus();
    await expect(select).toBeFocused();
    await select.selectOption("price-desc");
    // Tab from the select lands on the submit button, and Enter submits the GET form.
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: /^sort$/iu })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\?sort=price-desc$/u);
  });

  test("the default order is labelled plainly and disclosed, never as a ranking", async ({
    page,
  }) => {
    await page.goto(SHOP);
    const toolbar = page.locator("[data-fo-listing-toolbar]");
    await expect(toolbar).toHaveAttribute("data-fo-listing-toolbar", "default");
    await expect(toolbar).toContainText("It is not a ranking by sales");
    const text = (await page.locator("body").innerText()).toLowerCase();
    for (const claim of ["bestseller", "most popular", "recommended for you"]) {
      expect(text, claim).not.toContain(claim);
    }
  });
});

test.describe("the parameter policy (AC-15, T-15)", () => {
  test("a sorted or faceted URL is `noindex,follow` and canonicals to the base", async ({
    request,
  }) => {
    for (const query of [
      "sort=price-asc",
      "sort=default",
      "sort=banana",
      "colour=red",
      "utm_source=newsletter",
      "page=2&sort=price-desc",
    ]) {
      const { status, html } = await body(request, `${SHOP}?${query}`);
      expect(status, query).toBe(200);
      expect(robotsOf(html), query).toBe("noindex,follow");
      expect(canonicalOf(html), query).toMatch(/\/en\/poland\/flowers$/u);
      expect(canonicalOf(html), query).not.toContain("sort=");
    }
  });

  test("no `<a href>` anywhere on the site carries a sort or facet parameter", async ({
    page,
  }) => {
    // AC-15's "no parameterised URL appears as an `<a href>`" is §6 (d)'s rule: a **sorted or
    // faceted** URL is produced by a form submission, never by a link a crawler follows. `?page=N`
    // is the exception AC-10 requires — a paginated URL is a page — and it may appear only inside
    // the pagination nav, which is asserted below.
    for (const url of [
      ...SHOP_URLS,
      `${SHOP}?page=2`,
      `${SHOP}?sort=price-asc`,
    ]) {
      await page.goto(url);
      const hrefs = await page
        .locator("a[href]")
        .evaluateAll((links) =>
          links.map((link) => link.getAttribute("href") ?? ""),
        );
      for (const href of hrefs) {
        const query = href.includes("?")
          ? href.slice(href.indexOf("?") + 1)
          : "";
        expect(query, `${url} → ${href}`).toMatch(/^$|^page=[2-9][0-9]*$/u);
      }
      const paged = await page
        .locator("a[href*='?']")
        .evaluateAll((links) => links.length);
      const inNav = await page
        .locator("nav[data-fo-pagination] a[href*='?']")
        .evaluateAll((links) => links.length);
      expect(paged, url).toBe(inNav);
    }
  });
});

test.describe("the parameterised response (AC-22, T-22)", () => {
  test("carries the shared-cache header, no `Vary: Cookie` and no `Set-Cookie`", async ({
    request,
  }) => {
    for (const url of [SHOP, `${SHOP}?page=2`, `${SHOP}?sort=price-asc`]) {
      const response = await request.get(url, { maxRedirects: 0 });
      const headers = response.headers();
      expect(headers["cache-control"], url).toBe(
        "public, s-maxage=3600, stale-while-revalidate=86400",
      );
      // Next's own `Vary` names the RSC routing headers and `Accept-Encoding`; what AC-22 forbids
      // is a response that varies by **cookie** (`tests/e2e/country-shop.spec.ts` reads it the
      // same way).
      expect(headers["vary"] ?? "", url).not.toMatch(/cookie/iu);
      expect(headers["set-cookie"], url).toBeUndefined();
    }
  });

  test("is byte-identical with and without the three cookies", async ({
    request,
  }) => {
    for (const url of [`${SHOP}?page=2`, `${SHOP}?sort=price-asc`]) {
      const plain = await request.get(url);
      const withCookies = await request.get(url, {
        headers: { cookie: "fo_locale=en; fo_currency=PLN; fo_consent=all" },
      });
      expect(await withCookies.text(), url).toBe(await plain.text());
    }
  });
});
