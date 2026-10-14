/**
 * The parameter policy at depth 4, as served (spec 008 §14 **A15 (a)**, AC-29, AC-15, AC-10, T-33;
 * TASK-146, TASK-187), and on the hubs (TASK-114 E-7's residual, closed by a header).
 *
 * **The trap this file is written around** (TASK-146's brief). In Phase 0 every listing answers
 * `noindex,follow`, so "the sorted URL says `noindex`" passes whether or not the parameter was ever
 * read. Each case therefore asserts something only the parameter route can produce: page 2's
 * products are not page 1's, a sorted page's order is not the bare page's, `?page=2` carries a
 * self-canonical the prebuilt page cannot, a page past the last is a 404 the prebuilt page cannot
 * give. And it compares the parameterised response with the bare one, not with a literal: the
 * robots meta of `?page=2` equals the bare page's (AC-29), and a sorted page's canonical is the
 * bare URL. The wiring that makes a sorted URL `noindex` the day a country goes live is pinned in
 * `tests/unit/listing-params.test.ts` (each pass-through, read as source, goes red when cut).
 *
 * The hub half: a hub honours no parameter and keeps its prebuilt document, so a listing key on a
 * hub address is answered with `X-Robots-Tag: noindex, follow`, a value no other rule serves
 * (the environment's is `noindex`, the parameter route's `noindex, nofollow`).
 */
import { type APIRequestContext, expect, test } from "@playwright/test";

/** A country category over twelve products (15 roses in Poland), in two launch locales. */
const ROSES = "/en-gb/poland/flowers/roses";
const ROSES_DE = "/de/polen/blumen/rosen";
/** The corpus's country occasions hold seven products at most: one page, so no pager. */
const OCCASION = "/en-gb/poland/occasions/mothers-day";
const HUB = "/en/flowers/roses";

const canonicalOf = (html: string): string | undefined =>
  /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/iu.exec(html)?.[1];

const robotsOf = (html: string): string | undefined =>
  /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/iu.exec(
    html,
  )?.[1];

const titleOf = (html: string): string =>
  /<title[^>]*>([^<]*)<\/title>/iu.exec(html)?.[1] ?? "";

/** The product ids of the cards in a document, in order. */
const cardsOf = (html: string): string[] =>
  [...html.matchAll(/data-fo-product-card="([^"]+)"/gu)].map(
    (match) => match[1] ?? "",
  );

async function get(
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

test.describe("pagination at depth 4 (AC-29, T-33)", () => {
  for (const url of [ROSES, ROSES_DE]) {
    test(`${url}: page 2 continues page 1, and the two pages hold every product once`, async ({
      request,
    }) => {
      const first = await get(request, url);
      const second = await get(request, `${url}?page=2`);
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      const one = cardsOf(first.html);
      const two = cardsOf(second.html);
      // Page 1 is twelve products; page 2 the rest (red with the depth-4 rewrite removed: the
      // prebuilt page would answer `?page=2` with page 1's twelve again).
      expect(one).toHaveLength(12);
      expect(two.length).toBeGreaterThan(0);
      expect(two[0]).not.toBe(one[0]);
      const union = [...one, ...two];
      expect(new Set(union).size).toBe(union.length);
      // The count line prints the total, and the two pages hold exactly that many.
      expect(first.html).toContain(`data-fo-pagination="2"`);
      expect(union.length).toBe(15);
    });
  }

  test("`?page=2` is self-canonical, titled `· Page 2`, and carries the bare page's robots", async ({
    request,
  }) => {
    const bare = await get(request, ROSES);
    const second = await get(request, `${ROSES}?page=2`);
    expect(canonicalOf(bare.html)).toMatch(/\/en-gb\/poland\/flowers\/roses$/u);
    expect(canonicalOf(second.html)).toBe(`${canonicalOf(bare.html)}?page=2`);
    expect(titleOf(second.html)).toBe(`${titleOf(bare.html)} · Page 2`);
    expect(robotsOf(second.html)).toBe(robotsOf(bare.html));
  });

  test("`?page=1` redirects to the bare URL and the page after the last is a 404", async ({
    request,
  }) => {
    const one = await request.get(`${ROSES}?page=1`, { maxRedirects: 0 });
    expect([301, 308]).toContain(one.status());
    expect(one.headers()["location"]).toBe(ROSES);
    expect((await get(request, `${ROSES}?page=3`)).status).toBe(404);
    // The occasion has one page, so its page 2 is past the last.
    expect((await get(request, `${OCCASION}?page=2`)).status).toBe(404);
  });

  test("the pager is real links that work with JavaScript off", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(ROSES);
    const first = await page
      .locator("main [data-fo-product-card]")
      .first()
      .getAttribute("data-fo-product-card");
    const nav = page.locator("main nav[data-fo-pagination]");
    await expect(nav).toHaveCount(1);
    // The displayed link: the numbered links from `md` up, the compact pager's "Next" on a
    // phone (P3). Both are the same `<a href>` in the one pager `<nav>`.
    await nav.locator(`a[href="${ROSES}?page=2"]:visible`).first().click();
    await expect(page).toHaveURL(`${ROSES}?page=2`);
    await expect(page.locator("main [data-fo-product-card]")).toHaveCount(3);
    expect(
      await page
        .locator("main [data-fo-product-card]")
        .first()
        .getAttribute("data-fo-product-card"),
    ).not.toBe(first);
    await context.close();
  });

  test("the prebuilt depth-4 page carries the shared-cache header, as the shop root does", async ({
    request,
  }) => {
    for (const url of [ROSES, `${ROSES}?page=2`, OCCASION]) {
      expect((await request.get(url)).headers()["cache-control"], url).toBe(
        "public, s-maxage=3600, stale-while-revalidate=86400",
      );
    }
  });
});

test.describe("sort and facets at depth 4 (AC-15; TASK-146)", () => {
  test("a sorted country category is sorted, canonicals to the bare URL and is `noindex,follow`", async ({
    request,
  }) => {
    const bare = await get(request, ROSES);
    const sorted = await get(request, `${ROSES}?sort=price-desc`);
    expect(sorted.status).toBe(200);
    // Only the parameter route can produce this order: the prebuilt page ignores the query.
    expect(cardsOf(sorted.html)).not.toStrictEqual(cardsOf(bare.html));
    expect(sorted.html).toContain('<option value="price-desc" selected=""');
    expect(canonicalOf(sorted.html)).toBe(canonicalOf(bare.html));
    expect(robotsOf(sorted.html)).toBe("noindex,follow");
  });

  test("a sorted country occasion is sorted too: the occasion source is rewritten", async ({
    request,
  }) => {
    const asc = await get(request, `${OCCASION}?sort=price-asc`);
    const desc = await get(request, `${OCCASION}?sort=price-desc`);
    expect(asc.status).toBe(200);
    expect(desc.status).toBe(200);
    // Two different orders of the same seven: the query reached the parameter route.
    expect(cardsOf(asc.html)).not.toStrictEqual(cardsOf(desc.html));
    expect([...cardsOf(asc.html)].sort()).toStrictEqual(
      [...cardsOf(desc.html)].sort(),
    );
    expect(canonicalOf(asc.html)).toMatch(/\/occasions\/mothers-day$/u);
  });

  test("a facet on a country category canonicals to the bare URL", async ({
    request,
  }) => {
    const faceted = await get(request, `${ROSES}?colour=red`);
    expect(faceted.status).toBe(200);
    expect(canonicalOf(faceted.html)).toMatch(
      /\/en-gb\/poland\/flowers\/roses$/u,
    );
    expect(robotsOf(faceted.html)).toBe("noindex,follow");
  });

  test("a product URL is never rewritten: its parameters stay TASK-128's", async ({
    request,
  }) => {
    const product = "/en-gb/poland/product/amber-hour";
    const bare = await get(request, product);
    const sorted = await get(request, `${product}?sort=price-asc`);
    expect(bare.status).toBe(200);
    expect(sorted.status).toBe(200);
    expect(sorted.headers["x-robots-tag"] ?? "").not.toContain("nofollow");
    expect(sorted.headers["cache-control"]).not.toBe(
      "public, s-maxage=3600, stale-while-revalidate=86400",
    );
  });

  test("a direct hit on the depth-4 parameter route carries `noindex, nofollow`; the rewritten request does not", async ({
    request,
  }) => {
    const direct = await request.get(
      "/en-gb/_query/poland/flowers/roses?page=2",
    );
    expect(direct.headers()["x-robots-tag"] ?? "").toMatch(
      /noindex,\s*nofollow/u,
    );
    const visitor = await request.get(`${ROSES}?page=2`);
    expect(visitor.headers()["x-robots-tag"] ?? "").not.toContain("nofollow");
    // With no listing key, the internal path serves nothing at all.
    expect(
      (await request.get("/en-gb/_query/poland/flowers/roses")).status(),
    ).toBe(404);
  });
});

test.describe("a parameterised hub address (TASK-114 E-7, TASK-146)", () => {
  test("carries `X-Robots-Tag: noindex, follow`, and the bare hub does not", async ({
    request,
  }) => {
    const bare = await request.get(HUB);
    expect(bare.status()).toBe(200);
    expect(bare.headers()["x-robots-tag"] ?? "").not.toContain("follow");
    for (const query of ["sort=price-asc", "colour=red", "page=2"]) {
      const response = await request.get(`${HUB}?${query}`);
      expect(response.status(), query).toBe(200);
      expect(response.headers()["x-robots-tag"], query).toBe("noindex, follow");
    }
    // The occasion hub's shape too.
    const occasionHub = await request.get("/en/occasions/birthday?sort=x");
    expect(occasionHub.status()).toBe(200);
    expect(occasionHub.headers()["x-robots-tag"]).toBe("noindex, follow");
  });
});
