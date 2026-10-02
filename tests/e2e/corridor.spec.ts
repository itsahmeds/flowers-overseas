/**
 * The corridor page as served (spec 007 AC-5, AC-8, AC-19, AC-22, AC-23, AC-24; T-06, T-09, T-23,
 * T-24, T-25; TASK-091).
 *
 * What only a real request can prove: which URLs answer 200 and which 404 **with no redirect**,
 * that the document is the same bytes for a visitor with cookies and one without, and that the
 * page renders with JavaScript disabled — which is the honest form of "no client island", because
 * a page that needs a script to show its FAQ has one whatever the bundle says.
 *
 * `/en` and `/en-gb` are the whole published set: `de` and `pl` have no authored corridor guide,
 * so they have no page, and the suite asserts that as a 404 rather than skipping it (§13 Q1).
 */
import { type APIRequestContext, expect, test } from "@playwright/test";

import { skipsOnCaseInsensitiveHost } from "../support/case-insensitive-host.ts";

const GUIDE_URL = "/en/send-flowers-to/poland";
const UK_GUIDE_URL = "/en-gb/send-flowers-to/poland";

/**
 * The four phrasings of the **state-B shop entry** (`corridor.shop.heading` and
 * `corridor.shop.body`, `/review 98` round 1): a florist *in* the destination, a thing that *can
 * arrive*, a thing we *can make*, a price *for* the destination. This is a list of four known
 * sentences and nothing more. It does not catch a paraphrase ("Bouquets made by florists in
 * Poland" passes it), so it is the **second** net. The first is the exact-text pin of the shop
 * section on every guide page below (spec 007 §14 A9; `/review 98` round 2, required change 1).
 * The unit twin is `tests/unit/corridor-page.test.tsx`.
 */
const GUIDE_STATE_CLAIMS = [
  /\bour florists? in\b/iu,
  /\bcan arrive\b/iu,
  /\bcan make\b/iu,
  /\bpriced for\b/iu,
] as const;

/** Every published corridor URL, both locales, all seven destinations. */
const SLUGS = [
  "poland",
  "germany",
  "france",
  "spain",
  "italy",
  "romania",
  "netherlands",
] as const;

/**
 * Each destination's English name as `corridor.shop.cta` interpolates it
 * (`destinations.{iso2}.name`; `en-gb` has no override). Written out rather than read from the
 * messages, so a renamed country is a diff here too.
 */
const COUNTRY_NAME: Readonly<Record<(typeof SLUGS)[number], string>> = {
  poland: "Poland",
  germany: "Germany",
  france: "France",
  spain: "Spain",
  italy: "Italy",
  romania: "Romania",
  netherlands: "Netherlands",
};

async function status(
  request: APIRequestContext,
  url: string,
): Promise<number> {
  const response = await request.get(url, { maxRedirects: 0 });
  return response.status();
}

test.describe("existence and 404s (AC-5, T-06)", () => {
  for (const slug of SLUGS) {
    test(`/en and /en-gb serve ${slug}`, async ({ request }) => {
      expect(await status(request, `/en/send-flowers-to/${slug}`)).toBe(200);
      expect(await status(request, `/en-gb/send-flowers-to/${slug}`)).toBe(200);
    });
  }

  test("a locale with no authored guide has no corridor page at all", async ({
    request,
  }) => {
    expect(await status(request, "/de/blumen-verschicken/polen")).toBe(404);
    expect(await status(request, "/pl/wyslij-kwiaty/polska")).toBe(404);
  });

  test("another locale's segment, another locale's slug, casing and junk all 404", async ({
    request,
  }) => {
    for (const url of [
      "/en/blumen-verschicken/poland",
      "/en/wyslij-kwiaty/poland",
      "/en/send-flowers-to/polska",
      "/en/send-flowers-to/narnia",
      "/fr/send-flowers-to/poland",
    ]) {
      const response = await request.get(url, { maxRedirects: 0 });
      expect(response.status(), url).toBe(404);
      // Never a redirect to a guessed form, never a lowercase-fixing rewrite (ADR-0006).
      expect(response.headers()["location"], url).toBeUndefined();
    }
  });

  test("a mis-cased destination slug 404s (ADR-0006: no case-fixing rewrite)", async ({
    request,
    baseURL,
  }) => {
    // Split out of the loop above and guarded (TASK-143). Unguarded, this request is what
    // corrupts a local build: on APFS, Next writes its 404 document into the correctly-cased
    // prerender file, and `/en/send-flowers-to/poland` then serves "Page not found" across server
    // restarts until `.next` is deleted. The loop's other five shapes are case-safe and stay there.
    //
    // The predicate is about the **target host**, so a run from a Mac against the preview or
    // Railway still executes this case — which is where it matters.
    test.skip(
      skipsOnCaseInsensitiveHost(baseURL),
      "case-insensitive target filesystem serves the mis-cased path from the real page's prerendered HTML",
    );
    const url = "/en/send-flowers-to/Poland";
    const response = await request.get(url, { maxRedirects: 0 });
    expect(response.status(), url).toBe(404);
    expect(response.headers()["location"], url).toBeUndefined();
  });

  test("the trailing-slash form permanently redirects to the bare URL (§14 A6)", async ({
    request,
  }) => {
    const response = await request.get(`${GUIDE_URL}/`, { maxRedirects: 0 });
    // Spec 007 §14 A6: AC-5's "404, no redirect" governs the unknown and mis-cased shapes;
    // a trailing slash resolves by a **permanent redirect to the bare URL** — Next's 308 today,
    // Cloudflare's 301 once spec 040 fronts the origin. What must never happen is a 200 at both
    // forms (two URLs for one page) or a redirect to some other, guessed, form.
    expect([301, 308], `status for ${GUIDE_URL}/`).toContain(response.status());
    expect(response.headers()["location"]).toBe(GUIDE_URL);
  });
});

test.describe("the guide state, rendered (AC-8, AC-19, T-09)", () => {
  test("claims no cutoff, date, price, city or florist", async ({ page }) => {
    await page.goto(GUIDE_URL);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("[data-fo-corridor-state=guide]")).toHaveCount(1);

    const body = (await page.locator("main").innerText()).replaceAll(
      /\s+/g,
      " ",
    );
    expect(body).toContain("no cutoff, because no florist has agreed to one");
    expect(body).not.toMatch(/\b\d{1,2}:\d{2}\b/u);
    expect(body).not.toMatch(/\d[\d\s.,]*\s?(?:zł|€|£|EUR|PLN|GBP)/u);
    expect(body).not.toMatch(/same[- ]day/iu);
    expect(body).not.toMatch(/Delivering now/u);
    // **The shop entry is here now, and it is the link and nothing else** (spec 008 AC-20;
    // TASK-113; `/review 98` round 1). This line used to assert `toHaveCount(0)` on the reasoning
    // "no link into a shop that does not exist" — true while nothing published
    // `country-shop-root`, and false from the moment `/en/poland/flowers` began serving 200 with
    // 84 priced products. The first inversion kept the live state's heading and body with the
    // link, and the body said "Bouquets our florists in Poland can make… with delivery and VAT
    // already in the price" beside "Not yet. We are choosing florists in Poland now". So the
    // section's whole text is pinned to the link label, and the claims below are refused over the
    // whole `main`. The corridor artboards' state A draws exactly this.
    const shop = page.locator("[data-fo-corridor-shop]");
    await expect(shop).toHaveCount(1);
    await expect(shop.locator("a")).toHaveCount(1);
    expect(await shop.locator("a").getAttribute("href")).toBe(
      "/en/poland/flowers",
    );
    expect((await shop.innerText()).trim()).toBe("See flowers for Poland");
    for (const claim of GUIDE_STATE_CLAIMS) {
      expect(body, String(claim)).not.toMatch(claim);
    }
  });

  // **The shop entry on every guide page is the shop-root link and its label, exactly** (spec 007
  // §14 A9; `/review 98` round 2, required change 1). One case per page, so a change to the
  // entry's text fails fourteen times and names each page. This is the guard that carries A9:
  // the phrase list below only knows four sentences, and a paraphrase added to this section
  // passed it on all fourteen pages while only Poland-en's pin above went red.
  for (const locale of ["en", "en-gb"]) {
    for (const slug of SLUGS) {
      test(`${locale}/${slug}: the shop entry is "See flowers for ${COUNTRY_NAME[slug]}" and nothing else (§14 A9)`, async ({
        page,
      }) => {
        await page.goto(`/${locale}/send-flowers-to/${slug}`);
        await expect(
          page.locator("[data-fo-corridor-state=guide]"),
        ).toHaveCount(1);
        const shop = page.locator("[data-fo-corridor-shop]");
        await expect(shop).toHaveCount(1);
        await expect(shop.locator("a")).toHaveCount(1);
        expect(await shop.locator("a").getAttribute("href")).toBe(
          `/${locale}/${slug}/flowers`,
        );
        expect((await shop.innerText()).replaceAll(/\s+/g, " ").trim()).toBe(
          `See flowers for ${COUNTRY_NAME[slug]}`,
        );
      });
    }
  }

  test("no guide page carries one of the four state-B shop-entry phrasings (a second net, not a completeness check)", async ({
    page,
  }) => {
    // Every published corridor page is in the guide state today (Poland has an `operations`
    // block since TASK-124, but no destination has a `live` content file or a signed florist),
    // so all fourteen are asked. This refuses the four sentences in
    // `GUIDE_STATE_CLAIMS` over `main` and nothing else: it does not prove the page makes no
    // florist claim (TASK-091's guide copy does make one, which is spec 007's owner's call), and
    // it does not catch a paraphrase. The exact-text cases above do that for the shop entry.
    for (const locale of ["en", "en-gb"]) {
      for (const slug of SLUGS) {
        await page.goto(`/${locale}/send-flowers-to/${slug}`);
        await expect(
          page.locator("[data-fo-corridor-state=guide]"),
          `${locale}/${slug}`,
        ).toHaveCount(1);
        const body = (await page.locator("main").innerText()).replaceAll(
          /\s+/g,
          " ",
        );
        for (const claim of GUIDE_STATE_CLAIMS) {
          expect(body, `${locale}/${slug} ${String(claim)}`).not.toMatch(claim);
        }
      }
    }
  });

  test("links only to pages that exist", async ({ page, request }) => {
    await page.goto(GUIDE_URL);
    const hrefs = await page
      .locator("main a[href^='/']")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("href") ?? ""),
      );
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of new Set(hrefs)) {
      expect(await status(request, href), href).toBe(200);
    }
  });

  test("renders the FAQ as visible headings with no accordion", async ({
    page,
  }) => {
    await page.goto(GUIDE_URL);
    const questions = page.locator("[data-fo-corridor-faq] h3");
    const count = await questions.count();
    expect(count).toBeGreaterThanOrEqual(8);
    expect(count).toBeLessThanOrEqual(12);
    await expect(page.locator("details")).toHaveCount(0);
    await expect(questions.first()).toBeVisible();
  });

  test("renders the calendar as a captioned table in date order (AC-22, T-23)", async ({
    page,
  }) => {
    await page.goto(GUIDE_URL);
    const table = page.locator("[data-fo-corridor-calendar] table");
    await expect(table.locator("caption")).toHaveCount(1);
    const rows = table.locator("tbody tr");
    expect(await rows.count()).toBeGreaterThan(0);
    // The dates are formatted by `formatDate` in the page's locale; the assertion is on the
    // *shape* rather than on a literal date, because the window moves with the build.
    const first = await rows.first().locator("td").first().innerText();
    expect(first).toMatch(/\d{4}/u);
  });
});

test.describe("both English locales differ (§13 Q9)", () => {
  test("the en-gb page is its own document", async ({ request }) => {
    const [en, uk] = await Promise.all([
      request.get(GUIDE_URL).then((response) => response.text()),
      request.get(UK_GUIDE_URL).then((response) => response.text()),
    ]);
    expect(en).not.toBe(uk);
    const title = (html: string) => /<title>([^<]*)<\/title>/u.exec(html)?.[1];
    expect(title(en)).not.toBe(title(uk));
  });
});

test.describe("the cached response (AC-23, T-24)", () => {
  test("carries no Vary, sets no cookie and is byte-identical with and without cookies", async ({
    request,
    baseURL,
  }) => {
    const plain = await request.get(GUIDE_URL, { maxRedirects: 0 });
    expect(plain.status()).toBe(200);
    expect(plain.headers()["set-cookie"]).toBeUndefined();
    expect(plain.headers()["vary"] ?? "").not.toMatch(/cookie/iu);

    const withCookies = await request.get(GUIDE_URL, {
      maxRedirects: 0,
      headers: {
        cookie:
          "fo_locale=de; fo_currency=PLN; fo_consent=%7B%22v%22%3A1%2C%22a%22%3Afalse%7D",
      },
    });
    expect(await withCookies.text()).toBe(await plain.text());
    expect(baseURL).toBeDefined();
  });
});

test.describe("no client island (AC-24, T-25)", () => {
  test("renders every block with JavaScript disabled", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(GUIDE_URL);
    for (const marker of [
      "[data-fo-breadcrumb]",
      "[data-fo-corridor-facts]",
      "[data-fo-corridor-calendar] table",
      "[data-fo-corridor-faq] h3",
      "[data-fo-corridor-related]",
    ]) {
      expect(await page.locator(marker).count(), marker).toBeGreaterThan(0);
    }
    await expect(page.locator("h1")).toHaveCount(1);
    await context.close();
  });
});
