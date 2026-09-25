/**
 * The **occasions index** `/{locale}/{occasions}` as served (spec 008 §2 row 14, **AC-20**,
 * AC-11, AC-23, §14 **A7**, **Q3** and **Q4**; T-20; TASK-113).
 *
 * What only a real request can prove, and what this file is *for*: until this task, `/en/occasions`
 * was named in **two** merged 404 lists — `tests/e2e/hubs.spec.ts` and
 * `tests/e2e/country-occasion.spec.ts` — each on the reasoning "that URL is TASK-113's, not this
 * depth's". A 404 list is a claim about what the site does **not** serve, so those two entries had
 * to be retired in the commit that starts serving it, and the claim has to land somewhere it is
 * asserted in the positive. That somewhere is this file. (The same pair of specs contradicted each
 * other for an hour on `main` over `/en/occasions/mothers-day` on 2026-09-22; the lesson is
 * written into `docs/decisions-log.md` and is why the retirement and the 200 ship together.)
 *
 * The page's content is proven where content is cheap to prove: `tests/unit/catalog-occasions-index.test.tsx`
 * renders it over the real messages and the real view model and checks every hub is listed and no
 * link points at a page that does not exist. Here: status, redirect shape, no money, and that the
 * document is complete with JavaScript switched off.
 *
 * **Two locales and two absences.** `de` and `pl` carry machine-drafted catalogue copy, so no
 * occasion has an authored slug there, so no occasion hub exists there, so the index has nothing
 * to list and **is not a page** — `/de/anlaesse` and `/pl/okazje` 404, and that asymmetry is the
 * reason `occasionsIndexHref()` gates on existence as well as on publication (spec 004 AC-14).
 */
import { type APIRequestContext, expect, test } from "@playwright/test";

import { skipsOnCaseInsensitiveHost } from "../support/case-insensitive-host.ts";

/** The locales whose catalogue copy is authored, and therefore the ones with an index. */
const SERVED = ["/en/occasions", "/en-gb/occasions"] as const;

/** Money, in every shape the four launch locales can print it (AC-7's pattern). */
const MONEY = /[€£]|\bPLN\b|zł/u;

/** Every occasion hub `listingPages()` claims in `en` — `tests/fixtures/shop/listing-urls.json`. */
const HUBS_IN_EN = 28;

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

  test("a locale with no authored occasion slug has no index at all", async ({
    request,
  }) => {
    for (const url of [
      // the index's own segment in the two draft locales (§13 Q10)
      "/de/anlaesse",
      "/pl/okazje",
      // another locale's segment under an authored locale, and an unknown locale
      "/en/anlaesse",
      "/en/okazje",
      "/fr/occasions",
      // `/{locale}/{shopCategory}` stays a 404: no country-less categories index ships (§13 Q4),
      // so "the segment with no slug is a page" is true of exactly one of the two namespaces.
      "/en/flowers",
    ]) {
      const response = await request.get(url, { maxRedirects: 0 });
      expect(response.status(), url).toBe(404);
      expect(response.headers()["location"], url).toBeUndefined();
    }
  });

  test("a trailing slash is a permanent redirect to the bare URL (§14 A7)", async ({
    request,
  }) => {
    const response = await request.get("/en/occasions/", { maxRedirects: 0 });
    expect([301, 308]).toContain(response.status());
    expect(response.headers()["location"]).toContain("/en/occasions");
  });

  test("an uppercase variant is not a page (ADR-0006: no case-fixing rewrite)", async ({
    baseURL,
    request,
  }) => {
    // The predicate is about the **target host**, not the machine Playwright runs on: a local
    // macOS `pnpm start` answers 200 for a mis-cased prebuilt path out of the correctly-cased
    // prerendered file. See `tests/support/case-insensitive-host.ts`.
    test.skip(
      skipsOnCaseInsensitiveHost(baseURL),
      "case-insensitive local filesystem (APFS) serves the mis-cased path from the real page's prerendered HTML",
    );
    const response = await request.get("/en/Occasions", { maxRedirects: 0 });
    expect(response.headers()["location"]).toBeUndefined();
    expect(response.status()).toBe(404);
  });
});

test.describe("what the index renders (AC-11, AC-7, §14 Q4)", () => {
  test("lists every occasion hub as a link, and shows no money", async ({
    page,
  }) => {
    const response = await page.goto("/en/occasions");
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1")).toHaveCount(1);
    // One entry per hub that exists, each one an `<a>` — the page exists to make twenty-eight
    // hubs reachable, so "twenty-seven of them" is a failure and not a rounding.
    await expect(page.locator("main a[data-fo-occasion]")).toHaveCount(
      HUBS_IN_EN,
    );
    const main = await page.locator("main").innerText();
    expect(main).not.toMatch(MONEY);
    // No purchase affordance and no control that cannot act (§8, §14 A8 (c)).
    await expect(page.locator("main button")).toHaveCount(0);
    await expect(page.locator("main form")).toHaveCount(0);
  });

  test("every link out of it answers 200 (spec 004 AC-14)", async ({
    page,
    request,
  }) => {
    await page.goto("/en/occasions");
    const hrefs = await page
      .locator("main a[data-fo-occasion]")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("href") ?? ""),
      );
    expect(hrefs).toHaveLength(HUBS_IN_EN);
    for (const href of hrefs) {
      expect(href).toMatch(/^\/en\/occasions\/[a-z0-9-]+$/u);
      expect(await status(request, href), href).toBe(200);
    }
  });

  test("the dated table names the country its dates came from (§14 Q4)", async ({
    page,
  }) => {
    await page.goto("/en/occasions");
    const caption = await page.locator("main table caption").innerText();
    // Poland is the destination the dates are computed in (the first published one whose registry
    // status is `live`; all seven are published), so it is the calendar the table quotes — read out
    // of the document rather than asserted as a constant, so a page that printed Poland's dates
    // under another country's name fails here. Case-insensitively, because the caption carries the
    // canvas's `.label` voice and `innerText` returns what `text-transform: uppercase` rendered.
    expect(caption).toMatch(/poland/iu);
    const table = await page.locator("main table").innerText();
    expect(table).toMatch(/\d{1,2} \w+ 20\d{2}/u);
    // Every dated row is a link, and the undated groups carry no date cell at all — the three
    // honest states of §14 Q6, proven in full in the unit test.
    await expect(page.locator("main table tbody tr")).not.toHaveCount(0);
  });

  test("renders with JavaScript disabled (AC-23)", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/en/occasions");
    await expect(page.locator("main a[data-fo-occasion]")).toHaveCount(
      HUBS_IN_EN,
    );
    await expect(page.locator("main table caption")).toBeVisible();
    await context.close();
  });
});

test.describe("the colophon links here, and only where the page exists (AC-20)", () => {
  // The footer is the index's inbound link — the edge that makes AC-21's depth bound close for
  // twenty-eight hubs from *any* document on the site. **Permission is not existence**: the link
  // id is published in every locale, and the row is a plain label in the two locales where the
  // page is not there. Both branches are asserted, so neither is dead.
  test("English: a link", async ({ page }) => {
    await page.goto("/en");
    await expect(
      page.locator('footer a[href="/en/occasions"]').first(),
    ).toBeVisible();
  });

  test("German: the same row as text, pointing nowhere", async ({ page }) => {
    await page.goto("/de");
    await expect(page.locator('footer a[href="/de/anlaesse"]')).toHaveCount(0);
    // And the row has not silently vanished either: an unavailable target renders as its
    // **label**, which is spec 004 AC-14's rule and not "hide it". The German chrome copy is
    // still the English draft, so the word is the same one — the assertion is about the element,
    // not the translation.
    await expect(
      page.locator("footer span", { hasText: /^Occasions$/u }),
    ).toHaveCount(1);
  });
});
