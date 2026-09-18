/**
 * The all-destinations hub as served, and the link crawl the published set now makes possible
 * (spec 007 AC-7, AC-17, AC-20, AC-23, AC-24; **T-18**, T-21; §14 A6; TASK-092).
 *
 * What only a real request can prove:
 *
 *  - the hub answers 200 in **every** locale, including the two with no authored guide, because
 *    its URL is in their own footer and breadcrumb and a 404 there would be a broken site;
 *  - every `<a href>` on the hub, on the locale home and on a corridor page resolves to a 200
 *    document and to no unpublished `site-links.ts` target (AC-17's crawl, spec 004 AC-14
 *    extended to the new routes);
 *  - crawl depth from a locale home to any corridor page is **two**: home → hub → country, and in
 *    fact one, because the home's destinations grid links the corridor directly;
 *  - the trailing-slash form is a permanent redirect to the bare URL (§14 A6) while every other
 *    shape is a hard 404 with no `Location`;
 *  - the document is the same bytes with and without cookies and renders with JavaScript off.
 */
import { type APIRequestContext, expect, test } from "@playwright/test";

import { SITE_LINKS, type SiteLink, isPublished } from "@/config/site-links";
// By path and not through the barrel, for `tests/e2e/links.spec.ts`'s reason: the i18n barrel
// re-exports a `next/dynamic` loader Playwright's ESM loader cannot resolve outside the build.
import { localePath } from "@/modules/i18n/routing";
// The country registry's own slug builder, so an unpublished corridor id contributes the path it
// would occupy rather than nothing (`/review 74` nit). It is `countrySlug` and not
// `geo`'s `corridorSlug` for the import reason above — `geo/corridor` reaches the i18n barrel —
// and the two agree on every launch locale, which is the only set crawled here.
import { countrySlug, isCountryIso2 } from "@/config/countries";

const LOCALES = ["en", "en-gb", "de", "pl"] as const;

/** The hub's URL in each locale, from the one URL builder. */
const HUBS = LOCALES.map((locale) => localePath(locale, "destinations"));

async function status(
  request: APIRequestContext,
  url: string,
): Promise<number> {
  const response = await request.get(url, { maxRedirects: 0 });
  return response.status();
}

/**
 * The paths every unpublished registry target would occupy — nothing may link to one.
 *
 * Both target kinds that have a URL are covered: a `route` occupies one path per locale, and a
 * `corridor` occupies its own per-locale slug under the destinations segment. (`pending` has no
 * route shape at all, so there is no path it could occupy.) `/review 74` found the corridor half
 * missing here: with all seven corridor ids published today the set is the same either way, but
 * withdrawing one must make this crawl fail, which is the whole point of the assertion.
 */
function unpublishedPaths(): ReadonlySet<string> {
  const paths = new Set<string>();
  for (const link of SITE_LINKS as readonly SiteLink[]) {
    if (isPublished(link.id)) continue;
    for (const locale of LOCALES) {
      if (link.target.kind === "route") {
        paths.add(localePath(locale, link.target.pageType));
      } else if (
        link.target.kind === "corridor" &&
        isCountryIso2(link.target.iso2)
      ) {
        paths.add(
          localePath(
            locale,
            "destinations",
            countrySlug(link.target.iso2, locale),
          ),
        );
      }
    }
  }
  return paths;
}

async function internalHrefs(
  page: import("@playwright/test").Page,
): Promise<string[]> {
  return page
    .locator("a[href^='/']")
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("href") ?? ""),
    );
}

test.describe("the hub exists in every locale (AC-20)", () => {
  for (const hub of HUBS) {
    test(`${hub} answers 200`, async ({ page }) => {
      const response = await page.goto(hub);
      expect(response?.status()).toBe(200);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("[data-fo-destinations-hub]")).toHaveCount(1);
    });
  }

  test("the English hubs link every destination; the German and Polish ones link none", async ({
    page,
  }) => {
    await page.goto("/en/send-flowers-to");
    await expect(page.locator("[data-fo-hub-linked=true]")).toHaveCount(7);
    await expect(page.locator("[data-fo-hub-linked=false]")).toHaveCount(0);

    await page.goto("/de/blumen-verschicken");
    // Every destination is still named — this is the one page that lists a destination we have
    // no page for — but as text with one state line, never as a link (§5.3).
    await expect(page.locator("[data-fo-hub-linked=false]")).toHaveCount(7);
    await expect(page.locator("[data-fo-hub-linked=true]")).toHaveCount(0);
    await expect(page.locator("[data-fo-hub-empty]")).toHaveCount(1);
  });
});

test.describe("the 404 shapes and the trailing slash (AC-5, §14 A6)", () => {
  test("another locale's segment, an unknown locale and junk all 404 with no Location", async ({
    request,
  }) => {
    for (const url of [
      "/en/blumen-verschicken",
      "/de/send-flowers-to",
      "/pl/send-flowers-to",
      "/en/Send-Flowers-To",
      "/fr/send-flowers-to",
      "/en/send-flowers-to/narnia",
    ]) {
      const response = await request.get(url, { maxRedirects: 0 });
      expect(response.status(), url).toBe(404);
      expect(response.headers()["location"], url).toBeUndefined();
    }
  });

  test("the trailing-slash form permanently redirects to the bare URL", async ({
    request,
  }) => {
    const response = await request.get("/en/send-flowers-to/", {
      maxRedirects: 0,
    });
    expect([301, 308]).toContain(response.status());
    expect(response.headers()["location"]).toBe("/en/send-flowers-to");
  });
});

test.describe("the link crawl (AC-17, T-18)", () => {
  const unpublished = unpublishedPaths();

  for (const path of [...HUBS, "/en", "/en-gb", "/de", "/pl"]) {
    test(`${path} links only to 200 documents, none of them unpublished`, async ({
      page,
      request,
    }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      const hrefs = new Set(await internalHrefs(page));
      expect(hrefs.size).toBeGreaterThan(0);
      for (const href of hrefs) {
        const target = href.split("#")[0] ?? "";
        if (target === "") continue;
        expect(unpublished.has(target), `${path} → ${href}`).toBe(false);
        expect(await status(request, target), `${path} → ${href}`).toBe(200);
      }
    });
  }

  test("a corridor page's links all resolve, hub crumb included", async ({
    page,
    request,
  }) => {
    await page.goto("/en/send-flowers-to/poland");
    const hrefs = new Set(await internalHrefs(page));
    expect(hrefs).toContain("/en/send-flowers-to");
    for (const href of hrefs) {
      const target = href.split("#")[0] ?? "";
      if (target === "") continue;
      expect(await status(request, target), href).toBe(200);
    }
  });

  test("every corridor page is at most two clicks from its locale home", async ({
    page,
  }) => {
    await page.goto("/en");
    const fromHome = new Set(await internalHrefs(page));
    // Depth 1: the destinations grid links each corridor directly. Depth 2 via the hub holds by
    // construction, since the hub links the same set.
    for (const slug of [
      "poland",
      "germany",
      "france",
      "spain",
      "italy",
      "romania",
      "netherlands",
    ]) {
      expect(fromHome.has(`/en/send-flowers-to/${slug}`), slug).toBe(true);
    }
  });
});

test.describe("the cached response and the no-script render (AC-23, AC-24)", () => {
  test("carries no cookie-varying header and is byte-identical with and without cookies", async ({
    request,
  }) => {
    const plain = await request.get("/en/send-flowers-to", { maxRedirects: 0 });
    expect(plain.status()).toBe(200);
    expect(plain.headers()["set-cookie"]).toBeUndefined();
    expect(plain.headers()["vary"] ?? "").not.toMatch(/cookie/iu);

    const withCookies = await request.get("/en/send-flowers-to", {
      maxRedirects: 0,
      headers: {
        cookie:
          "fo_locale=de; fo_currency=PLN; fo_consent=%7B%22v%22%3A1%2C%22a%22%3Afalse%7D",
      },
    });
    expect(await withCookies.text()).toBe(await plain.text());
  });

  test("renders every block with JavaScript disabled", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/en/send-flowers-to");
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("[data-fo-breadcrumb]")).toHaveCount(1);
    await expect(page.locator("[data-fo-hub-linked=true]")).toHaveCount(7);
    await context.close();
  });
});
