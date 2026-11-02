/**
 * The product page's parameters as served (spec 009 §5.2, §5.4, §6, §14 **A10**, AC-15, AC-24;
 * T-15's e2e half, T-24; TASK-128).
 *
 * **The trap this file is written around** (TASK-146's brief, again). In Phase 0 every product
 * page answers `noindex,follow` with its canonical on the bare URL, so "the `?tier=` URL says
 * `noindex`" passes whether or not the parameter was ever read. So the value cases assert what
 * only the parameter route can produce: the **checked** size radio and the price it prints, which
 * the prebuilt page (default size) cannot. The robots and canonical are compared with the bare
 * page's, and the routing is pinned by the headers only the parameterised addresses carry.
 *
 * The date cases run in `preview` here (Poland has its `operations` block and no florist), where
 * no date can be chosen, so a date never selects anything and the page is the default rendering:
 * that is the fallback half. The selecting half of `?date=` needs a live picker, which only the
 * unit suite can make (`tests/unit/product-params-route.test.tsx`, Poland live over a fixed clock).
 *
 * The build-output half of T-24 reads `.next/prerender-manifest.json` where the run has one: the
 * product route is prebuilt with `revalidate` 3600, and the parameter route is not prerendered
 * (it renders per request). Putting `searchParams` back into the product route takes its pages out
 * of `routes`, and that case goes red.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { type APIRequestContext, expect, test } from "@playwright/test";

const PRODUCT = "/en/poland/product/amber-hour";
const PRODUCTS = [
  PRODUCT,
  "/en-gb/poland/product/amber-hour",
  "/de/polen/produkt/amber-hour",
  "/pl/polska/produkt/amber-hour",
] as const;
const SHARED_CACHE = "public, s-maxage=3600, stale-while-revalidate=86400";
const COOKIES = "fo_locale=pl; fo_currency=PLN; fo_consent=all";

const canonicalOf = (html: string): string | undefined =>
  /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/iu.exec(html)?.[1];

const robotsOf = (html: string): string | undefined =>
  /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/iu.exec(
    html,
  )?.[1];

/** The size radios in document order, as `[value, checked]`. */
const tiersOf = (html: string): [string, boolean][] =>
  [...html.matchAll(/<input\b[^>]*\bname="tier"[^>]*>/gu)].map((match) => {
    const tag = match[0];
    return [
      /\bvalue="([^"]+)"/u.exec(tag)?.[1] ?? "",
      /\bchecked=""/u.test(tag),
    ];
  });

const checkedTierOf = (html: string): string | undefined =>
  tiersOf(html).find(([, checked]) => checked)?.[0];

/** The buy section's price, as printed (`data-fo-tier-slot="price"`). */
const priceOf = (html: string): string | undefined =>
  /data-fo-tier-slot="price"[^>]*>([^<]+)</u.exec(html)?.[1];

const checkedDates = (html: string): number =>
  [...html.matchAll(/<input\b[^>]*\bname="date"[^>]*>/gu)].filter((match) =>
    /\bchecked=""/u.test(match[0]),
  ).length;

async function get(
  request: APIRequestContext,
  url: string,
  cookie?: string,
): Promise<{ status: number; html: string; headers: Record<string, string> }> {
  const response = await request.get(url, {
    maxRedirects: 0,
    ...(cookie === undefined ? {} : { headers: { cookie } }),
  });
  return {
    status: response.status(),
    html: await response.text(),
    headers: response.headers(),
  };
}

test.describe("T-15: `?tier=` and `?date=` on the rewritten URL (AC-15)", () => {
  test("a valid `?tier=` re-renders the selection: that size checked, its price printed", async ({
    request,
  }) => {
    for (const url of PRODUCTS) {
      const bare = await get(request, url);
      expect(bare.status, url).toBe(200);
      const tiers = tiersOf(bare.html);
      expect(tiers.length, url).toBeGreaterThan(1);
      const base = checkedTierOf(bare.html);
      const other = tiers.find(([value]) => value !== base)?.[0] ?? "";
      const chosen = await get(request, `${url}?tier=${other}`);
      expect(chosen.status, url).toBe(200);
      // Only the parameter route can check a size the prebuilt page does not.
      expect(checkedTierOf(chosen.html), url).toBe(other);
      expect(priceOf(chosen.html), url).not.toBe(priceOf(bare.html));
      // Every URL that carries `tier` is `noindex,follow`, its canonical the bare page's.
      expect(robotsOf(chosen.html), url).toBe("noindex,follow");
      expect(canonicalOf(chosen.html), url).toBe(canonicalOf(bare.html));
      expect(canonicalOf(chosen.html) ?? "", url).not.toContain("?");
    }
  });

  test("an unknown tier, and a malformed, out-of-window or unselectable date, render the default with a 200", async ({
    request,
  }) => {
    const bare = await get(request, PRODUCT);
    for (const query of [
      "tier=stems_18",
      "tier=STEMS_15",
      "date=2026-02-30",
      "date=not-a-date",
      "date=2099-01-01",
      // A Sunday: Poland delivers Monday to Saturday, and nothing is selectable in `preview`.
      "date=2026-11-08",
      "tier=stems_18&date=2026-02-30&utm_source=x",
    ]) {
      const response = await get(request, `${PRODUCT}?${query}`);
      expect(response.status, query).toBe(200);
      expect(checkedTierOf(response.html), query).toBe(
        checkedTierOf(bare.html),
      );
      expect(priceOf(response.html), query).toBe(priceOf(bare.html));
      expect(checkedDates(response.html), query).toBe(0);
      expect(robotsOf(response.html), query).toBe("noindex,follow");
      expect(canonicalOf(response.html), query).toBe(canonicalOf(bare.html));
      // It went through the parameter route: only those addresses carry the shared-cache header.
      expect(response.headers["cache-control"], query).toBe(SHARED_CACHE);
    }
  });

  test("`?gclid=` and `?utm_source=` get the prebuilt page, canonical on the bare URL, the bare robots", async ({
    request,
  }) => {
    const bare = await get(request, PRODUCT);
    for (const query of ["gclid=abc", "utm_source=newsletter", "fbclid=x"]) {
      const response = await get(request, `${PRODUCT}?${query}`);
      expect(response.status, query).toBe(200);
      expect(canonicalOf(response.html), query).toBe(canonicalOf(bare.html));
      // The bare page's own directive, not a `noindex` of the parameter route's making.
      expect(robotsOf(response.html), query).toBe(robotsOf(bare.html));
      expect(response.headers["cache-control"], query).toBe(
        bare.headers["cache-control"],
      );
      expect(response.headers["cache-control"], query).not.toBe(SHARED_CACHE);
    }
  });

  test("the internal path 404s with no key, and carries `noindex, nofollow` on a direct hit", async ({
    request,
  }) => {
    const internal = "/en/_query/-product/poland/product/amber-hour";
    expect((await get(request, internal)).status).toBe(404);
    expect((await get(request, `${internal}?gclid=x`)).status).toBe(404);
    const direct = await get(request, `${internal}?tier=stems_15`);
    expect(direct.headers["x-robots-tag"] ?? "").toMatch(
      /noindex,\s*nofollow/u,
    );
    const visitor = await get(request, `${PRODUCT}?tier=stems_15`);
    expect(visitor.headers["x-robots-tag"] ?? "").not.toContain("nofollow");
  });

  test("an uppercase spelling with a parameter is a 404, as its bare form is", async ({
    request,
  }) => {
    for (const url of [
      "/EN/poland/product/amber-hour?tier=stems_15",
      "/en/poland/PRODUCT/amber-hour?tier=stems_15",
      "/en/POLAND/product/amber-hour?date=2026-11-03",
    ]) {
      const response = await get(request, url);
      expect(response.status, url).toBe(404);
      expect(response.headers["location"], url).toBeUndefined();
    }
  });

  test("no `<a href>` on the site's pages carries `tier` or `date`", async ({
    request,
  }) => {
    for (const url of [
      ...PRODUCTS,
      `${PRODUCT}?tier=stems_15`,
      "/en",
      "/en/poland/flowers",
      "/en/poland/flowers/roses",
      "/en/send-flowers-to/poland",
    ]) {
      const { status, html } = await get(request, url);
      expect(status, url).toBe(200);
      const hrefs = [...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/gu)].map(
        (match) => (match[1] ?? "").replaceAll("&amp;", "&"),
      );
      expect(hrefs.length, url).toBeGreaterThan(5);
      expect(
        hrefs.filter((href) => /[?&](?:tier|date)=/u.test(href)),
        url,
      ).toEqual([]);
    }
  });

  test("no sitemap lists a parameterised URL", async ({ request }) => {
    const seen = new Set<string>();
    const pages: string[] = [];
    const queue = ["/sitemap.xml"];
    while (queue.length > 0) {
      const next = queue.shift() ?? "";
      if (seen.has(next)) continue;
      seen.add(next);
      const response = await request.get(next);
      expect(response.status(), next).toBe(200);
      for (const match of (await response.text()).matchAll(
        /<loc>([^<]+)<\/loc>/gu,
      )) {
        const url = new URL((match[1] ?? "").trim().replaceAll("&amp;", "&"));
        if (url.pathname.endsWith(".xml")) queue.push(url.pathname);
        else pages.push(url.href);
      }
    }
    expect(seen.size).toBeGreaterThan(0);
    expect(pages.filter((url) => /[?&](?:tier|date)=/u.test(url))).toEqual([]);
  });
});

test.describe("T-24: headers, cookies and the build output (AC-24)", () => {
  for (const url of [PRODUCT, `${PRODUCT}?tier=stems_15`]) {
    test(`${url}: no Set-Cookie, no Vary on a request header, one body with and without the three cookies`, async ({
      request,
    }) => {
      const plain = await get(request, url);
      const withCookies = await get(request, url, COOKIES);
      for (const response of [plain, withCookies]) {
        expect(response.status).toBe(200);
        expect(response.headers["set-cookie"]).toBeUndefined();
        // Next's own `Vary` names its RSC routing headers and `Accept-Encoding`; what AC-24
        // forbids is a response that varies by a cookie or by who is asking.
        const vary = (response.headers["vary"] ?? "").toLowerCase();
        for (const forbidden of [
          "cookie",
          "accept-language",
          "cf-ipcountry",
          "user-agent",
        ]) {
          expect(vary, forbidden).not.toContain(forbidden);
        }
      }
      expect(withCookies.html).toBe(plain.html);
    });
  }

  test("a parameterised response carries the shared-cache header; the bare URL keeps its own", async ({
    request,
  }) => {
    for (const url of PRODUCTS) {
      for (const query of ["tier=stems_15", "date=2026-11-03"]) {
        expect(
          (await get(request, `${url}?${query}`)).headers["cache-control"],
          `${url}?${query}`,
        ).toBe(SHARED_CACHE);
      }
      expect((await get(request, url)).headers["cache-control"], url).not.toBe(
        SHARED_CACHE,
      );
    }
  });

  test("the build output: the product route prebuilt at 3600 s, the parameter route not prerendered", () => {
    const file = join(process.cwd(), ".next", "prerender-manifest.json");
    test.skip(!existsSync(file), "needs the build's prerender manifest");
    const manifest = JSON.parse(readFileSync(file, "utf8")) as {
      routes: Record<string, { initialRevalidateSeconds?: number | false }>;
      dynamicRoutes?: Record<string, unknown>;
    };
    const product = manifest.routes["/en/-product/poland/product/amber-hour"];
    expect(product, "the product route's page is prerendered").toBeDefined();
    expect(product?.initialRevalidateSeconds).toBe(3600);
    const parameterised = [
      ...Object.keys(manifest.routes),
      ...Object.keys(manifest.dynamicRoutes ?? {}),
    ].filter((route) => route.includes("_query/-product"));
    expect(parameterised).toEqual([]);
  });
});
