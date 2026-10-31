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

import { skipsOnCaseInsensitiveHost } from "../support/case-insensitive-host.ts";

const SERVED = [
  "/en/poland/occasions/mothers-day",
  // spec 008 A-founder-2026-10-21c (TASK-316): over the floor since the Appendix A tags
  "/en/poland/occasions/all-saints-day",
  "/en/poland/occasions/grandparents-day",
  "/en/spain/occasions/sant-jordi",
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

test.describe("Poland's Grandparents' Day prints both days (spec 008 AC-76, T-76)", () => {
  test("the dated line holds 21 and 22 January of one year, with JavaScript off", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    const response = await page.goto("/en/poland/occasions/grandparents-day");
    expect(response?.status()).toBe(200);
    const line = await page.locator("p[data-fo-occasion-date]").innerText();
    expect(line).toMatch(/\b21 January (\d{4}) and \w+, 22 January \1\b/u);
    await context.close();
  });
});

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
      // an occasion the destination does not observe (since spec 008 A-founder-2026-10-21c no
      // observed occasion sits below the six-product floor; that boundary is unit-tested in
      // `tests/unit/catalog-listing.test.ts`)
      "/en/france/occasions/name-day",
      "/en/netherlands/occasions/all-saints-day",
      // an evergreen occasion, which no destination keeps as a dated day
      "/en/poland/occasions/birthday",
      // an unknown slug, an unknown destination, a country we do not deliver to
      "/en/poland/occasions/arbor-day",
      "/en/atlantis/occasions/mothers-day",
      "/en/belgium/occasions/mothers-day",
      // another locale's segment, and another locale's country slug
      "/en/poland/anlaesse/mothers-day",
      "/en/polska/occasions/mothers-day",
      // the English slug under a locale that authored its own (`muttertag`, `dzien-matki`; TASK-106)
      "/de/polen/anlaesse/mothers-day",
      "/pl/polska/okazje/mothers-day",
      // an unknown locale
      "/fr/poland/occasions/mothers-day",
      // Nothing about the depth-2 URLs `/en/occasions/{slug}` or `/en/occasions` belongs here any
      // more. Both used to sit in this list on the reasoning "that is TASK-112/113's URL, not this
      // depth's", and both tasks then shipped their page — the hub in PR 88, the index in
      // TASK-113 — so for an hour on 2026-09-22 two merged PRs contradicted each other and this
      // case asserted a 404 on a page that answered 200. **A 404 list is a claim about what the
      // site does *not* serve, so an entry must be retired the moment another task starts serving
      // it.** Their 200s are asserted in `tests/e2e/hubs.spec.ts` and
      // `tests/e2e/occasions-index.spec.ts`; this file asserts only its own depth.
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
    // AC-1 names the uppercase variant as a 404 shape, so 404 is the assertion — not "200 or
    // 404", which the route could not fail. The skip is about the **target**, not about the
    // machine Playwright runs on: `skipsOnCaseInsensitiveHost` (the shape of
    // `tests/e2e/locale-routing.spec.ts:45`, TASK-034) stands the case down only when the URL
    // points at a local macOS `pnpm start`, where Next resolves the mis-cased path out of the
    // correctly-cased prerendered file and answers 200 — a fact about APFS, not about this
    // repository. Pointed at the preview, Railway or CI's Linux it runs, including from a Mac,
    // which a `process.platform === "darwin"` predicate would have dropped in silence. The same
    // guard on every platform and every run is `tests/unit/catalog-routes-depth4.test.ts`'s six
    // uppercase rows. Do not probe this URL against a local build you are still measuring — the
    // 404 Next writes lands on the real page's file and serves "Page not found" until you rebuild
    // (carried forward in `docs/tasks/TASK-110.md` for TASK-118's `docs/runbooks/shop-pages.md`).
    test.skip(
      skipsOnCaseInsensitiveHost(baseURL),
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
    // The exact bare URL: a self-redirect would satisfy a `toContain` (TASK-146 carry-forward
    // from `/review 99`).
    expect(response.headers()["location"]).toBe(
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
    // N1 is rendered once per band (spec 004 §14 A-founder-2026-10-18c clause 3): in the hero
    // from `md` up, after the grid below, the other copy `display: none`. The one `note` in the
    // accessibility tree carries it at this project's size.
    await expect(
      page
        .locator("main")
        .getByRole("note")
        .getByText(
          "Ordering opens soon. Every price here is the price you will pay, with VAT and delivery included.",
        ),
    ).toBeVisible();
    // The sort form is the one control (spec 008 §14 A15 (a); TASK-187): a `GET` form that can
    // act with no JavaScript. Seven products are one page, so there is no pager.
    await expect(page.locator("main button")).toHaveCount(1);
    await expect(page.locator('main form[method="get"]')).toHaveCount(1);
    await expect(page.locator("main nav[data-fo-pagination]")).toHaveCount(0);
  });

  test("the shop root's occasion table links here, and only here (§14 A10)", async ({
    page,
  }) => {
    await page.goto("/en/poland/flowers");
    const links = page.locator("[data-fo-occasion-page]");
    // Since spec 008 A-founder-2026-10-21c every occasion Poland keeps has a page, so every row
    // of the table (the upcoming window moves with the date, so the count is not pinned) carries
    // a link in its third column, and each link is that row's own Polish occasion page.
    const rows = await page.locator("table tbody tr").count();
    expect(rows).toBeGreaterThan(0);
    await expect(links).toHaveCount(rows);
    const hrefs = await links.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("href") ?? ""),
    );
    for (const href of hrefs) {
      expect(href).toMatch(/^\/en\/poland\/occasions\/[a-z-]+$/u);
    }
    expect(new Set(hrefs).size, "one link per occasion").toBe(rows);
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

  test("nominates exactly one, the first card's photograph, out of seven (AC-24)", async ({
    page,
  }) => {
    // **The stated number, and why it is 1.** Until TASK-168 no Mother's Day SKU had an approved
    // photograph and this case pinned 0; since TASK-168 all seven cards carry one, so AC-24's
    // "exactly one image per page carries `priority`" has seven candidates and must pick the
    // first — the nomination follows **the first card's photograph and nothing else**, so no
    // preload of a photograph further down the grid or of an asset the page never rendered. The
    // no-photograph state is the unit twin's (`withPhotographAt` over `placeholders`).
    //
    // Nothing below is counted from the page's own nominations (`preloads === priority` would
    // read 0 === 0 and pass with the page's `<head>` emptied). The expectation is derived from
    // the **first card**, and `EXPECTED_NOMINATIONS` is pinned to today's corpus: if the first
    // card's photograph is withdrawn the third assertion goes red and the real number has to be
    // written here. The unit twin (`tests/unit/catalog-occasion-page.test.tsx`, "the one LCP
    // nomination") proves what this page does with no photograph, on views built in the test.
    const EXPECTED_NOMINATIONS = 1;
    await page.goto("/en/poland/occasions/mothers-day");

    const firstCard = page.locator("[data-fo-product-card]").first();
    await expect(firstCard).toBeVisible();
    const firstPhotograph = await firstCard
      .locator("picture source")
      .first()
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("srcset") ?? ""),
      );
    expect(firstPhotograph).toHaveLength(EXPECTED_NOMINATIONS);

    const preloaded = await page
      .locator('head link[rel="preload"][as="image"]')
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("imagesrcset") ?? ""),
      );
    // One `toEqual` that can fail on either side: a missing nomination, a second one, or one
    // built from a different lookup than the first card's own `<picture>`.
    expect(preloaded).toEqual(firstPhotograph);
    await expect(page.locator('img[fetchpriority="high"]')).toHaveCount(
      EXPECTED_NOMINATIONS,
    );
    await expect(page.locator('img[loading="eager"]')).toHaveCount(
      EXPECTED_NOMINATIONS,
    );
    // The other six photographs are lazy, which is the "and nothing else" half.
    await expect(page.locator("[data-fo-product-card] img")).toHaveCount(7);
    // Scoped to `<main>`: the header's mega menu carries its own lazy featured photographs in its
    // closed panels (TASK-383), which are not this page's.
    await expect(page.locator('main img[loading="lazy"]')).toHaveCount(6);
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
