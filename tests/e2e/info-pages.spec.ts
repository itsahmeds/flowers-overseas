/**
 * Spec 041's trust and legal pages, built and served (TASK-182, TASK-183): T-01 (AC-1), T-08
 * (AC-8), T-13 (AC-13, the page's own re-open button), T-24 (AC-24), T-26 (AC-26) and T-32's
 * rendered half (AC-30) over every (page, locale) that exists before registration in `en` and
 * `en-gb`, and the footer crawl of the legal links (AC-21). The `de` and `pl` drafts are
 * TASK-184's, so their URLs are asserted to be 404s here and join the scans when their files land.
 */
import { type BrowserContext, expect, test } from "@playwright/test";

import {
  CLAIM_PATTERNS,
  PRICE_LITERAL_PATTERN,
  SCALE_CLAIM_PATTERN,
  relayMatches,
  sentencesOf,
} from "../../src/config/honesty.ts";
import { INFO_CONTENT_FILES } from "../../src/modules/content/corpus.generated.ts";
import { parseInfoFile } from "../../src/modules/content/parse.ts";

const TRUST_PATHS = {
  "how-it-works": "how-it-works",
  guarantee: "guarantee",
  help: "help",
  about: "about",
  delivery: "delivery",
} as const;

const LANG = { en: "en", "en-gb": "en-GB" } as const;

const PAGES = (["en", "en-gb"] as const).flatMap((locale) =>
  Object.entries(TRUST_PATHS).map(([pageId, segment]) => ({
    pageId,
    locale,
    path: `/${locale}/${segment}`,
  })),
);

/** The two legal pages that exist before registration (TASK-183). */
const LEGAL_PAGES = (["en", "en-gb"] as const).flatMap((locale) =>
  ["cookies", "cancellation"].map((leaf) => ({
    leaf,
    locale,
    path: `/${locale}/legal/${leaf}`,
  })),
);

/** The sentences each page's own file lists in `honestyAllow` (en-gb extends en). */
function allowedSentences(pageId: string): ReadonlySet<string> {
  const file = INFO_CONTENT_FILES.find(
    (candidate) => candidate.path === `pages/en/${pageId}.md`,
  );
  if (file === undefined) return new Set();
  const parsed = parseInfoFile(file.path, file.source);
  if (!parsed.ok || parsed.file.kind !== "trust") return new Set();
  return new Set(
    parsed.file.content.honestyAllow.map((entry) => entry.sentence),
  );
}

test.describe("T-01 / AC-1: the trust pages exist, and nothing else does", () => {
  for (const { path, locale } of PAGES) {
    test(`${path} is 200 with one h1 and lang ${LANG[locale]}`, async ({
      page,
    }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("html")).toHaveAttribute("lang", LANG[locale]);
    });
  }

  for (const locale of ["en", "en-gb", "de", "pl"]) {
    const segments: Record<string, readonly string[]> = {
      en: ["imprint", "legal/terms", "legal/privacy"],
      "en-gb": ["imprint", "legal/terms", "legal/privacy"],
      de: ["impressum", "rechtliches/agb", "rechtliches/datenschutz"],
      pl: [
        "dane-firmy",
        "informacje-prawne/regulamin",
        "informacje-prawne/polityka-prywatnosci",
      ],
    };
    for (const segment of segments[locale] ?? []) {
      test(`/${locale}/${segment} is 404 while the company is not registered`, async ({
        request,
      }) => {
        const response = await request.get(`/${locale}/${segment}`, {
          maxRedirects: 0,
        });
        expect(response.status()).toBe(404);
      });
    }
  }

  for (const path of [
    "/en/contact",
    "/en/legal",
    "/en/legal/company",
    "/en/legal/substitution",
    "/en/legal/Terms",
    "/en/legal/nope",
  ]) {
    test(`${path} is 404`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status()).toBe(404);
    });
  }

  test("/en/help/ redirects permanently to /en/help", async ({ request }) => {
    const response = await request.get("/en/help/", { maxRedirects: 0 });
    expect([301, 308]).toContain(response.status());
    expect(response.headers()["location"]).toBe("/en/help");
  });
});

test.describe("T-08, T-26, T-32: what a crawler reads on each page", () => {
  for (const { pageId, path, locale } of PAGES) {
    test(`${path}: no review, rating, count or price, no relay language, no form`, async ({
      page,
    }) => {
      await page.goto(path);
      const main = await page.locator("main").innerText();
      const allowed = allowedSentences(pageId);
      for (const sentence of sentencesOf(main)) {
        if (allowed.has(sentence)) continue;
        for (const claim of CLAIM_PATTERNS) {
          if (
            !["rating", "review", "florist count", "delivery photo"].includes(
              claim.label,
            )
          )
            continue;
          expect(
            claim.pattern.test(sentence),
            `${claim.label}: ${sentence}`,
          ).toBe(false);
        }
        expect(PRICE_LITERAL_PATTERN.test(sentence), sentence).toBe(false);
        expect(SCALE_CLAIM_PATTERN.test(sentence), sentence).toBe(false);
      }
      const body = await page.locator("body").innerText();
      expect(relayMatches(body, locale)).toEqual([]);
      await expect(page.locator("main form, main input")).toHaveCount(0);
    });
  }
});

test.describe("T-24 / AC-24: one response for every visitor", () => {
  for (const { path } of PAGES) {
    test(`${path}: no Vary, no Set-Cookie, byte-identical with cookies`, async ({
      request,
    }) => {
      const plain = await request.get(path, { maxRedirects: 0 });
      expect(plain.status()).toBe(200);
      expect(plain.headers()["set-cookie"]).toBeUndefined();
      expect(plain.headers()["vary"] ?? "").not.toMatch(/cookie/iu);
      const withCookies = await request.get(path, {
        maxRedirects: 0,
        headers: {
          cookie:
            "fo_locale=de; fo_currency=PLN; fo_consent=%7B%22v%22%3A1%2C%22a%22%3Afalse%7D",
        },
      });
      expect(await withCookies.text()).toBe(await plain.text());
    });
  }
});

test.describe("AC-21: the footer and the home link to the pages", () => {
  test("the en footer links the four trust pages and no imprint, terms or privacy", async ({
    page,
  }) => {
    await page.goto("/en");
    const footer = page.locator("footer");
    for (const href of [
      "/en/how-it-works",
      "/en/guarantee",
      "/en/help",
      "/en/delivery",
    ]) {
      await expect(footer.locator(`a[href="${href}"]`)).toHaveCount(1);
    }
    for (const href of [
      "/en/imprint",
      "/en/legal/terms",
      "/en/legal/privacy",
    ]) {
      await expect(footer.locator(`a[href="${href}"]`)).toHaveCount(0);
    }
    await expect(
      page.locator('[data-fo-faq-all-topics][href="/en/help"]'),
    ).toHaveCount(1);
  });

  test("the de footer links none of them: no German file exists yet", async ({
    page,
  }) => {
    await page.goto("/de");
    await expect(
      page.locator(
        'footer a[href^="/de/hilfe"], footer a[href^="/de/garantie"]',
      ),
    ).toHaveCount(0);
  });
});

test.describe("T-01 / AC-1 (legal half): the two legal pages that exist before registration", () => {
  for (const { path, locale } of LEGAL_PAGES) {
    test(`${path} is 200 with one h1 and lang ${LANG[locale]}, a draft line and no form`, async ({
      page,
    }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("html")).toHaveAttribute("lang", LANG[locale]);
      await expect(page.locator("[data-fo-legal-draft-line]")).toHaveCount(1);
      await expect(page.locator("[data-fo-legal-toc] a")).not.toHaveCount(0);
      await expect(page.locator("main form, main input")).toHaveCount(0);
      const body = await page.locator("body").innerText();
      expect(relayMatches(body, locale)).toEqual([]);
      for (const sentence of sentencesOf(
        await page.locator("main").innerText(),
      )) {
        expect(PRICE_LITERAL_PATTERN.test(sentence), sentence).toBe(false);
        expect(SCALE_CLAIM_PATTERN.test(sentence), sentence).toBe(false);
      }
      expect(body).not.toMatch(/Hameed|Sheikh|Tahoor/u);
    });

    test(`${path}: no Vary, no Set-Cookie, byte-identical with cookies`, async ({
      request,
    }) => {
      const plain = await request.get(path, { maxRedirects: 0 });
      expect(plain.status()).toBe(200);
      expect(plain.headers()["set-cookie"]).toBeUndefined();
      expect(plain.headers()["vary"] ?? "").not.toMatch(/cookie/iu);
      const withCookies = await request.get(path, {
        maxRedirects: 0,
        headers: {
          cookie:
            "fo_locale=de; fo_currency=PLN; fo_consent=%7B%22v%22%3A1%2C%22a%22%3Afalse%7D",
        },
      });
      expect(await withCookies.text()).toBe(await plain.text());
    });
  }
});

test.describe("AC-21 (legal half): the footer crawl reaches the published legal pages", () => {
  for (const locale of ["en", "en-gb"] as const) {
    test(`the ${locale} footer links cookies and withdrawal and refunds, each a 200`, async ({
      page,
      request,
    }) => {
      await page.goto(`/${locale}`);
      const footer = page.locator("footer");
      for (const leaf of ["cookies", "cancellation"]) {
        const href = `/${locale}/legal/${leaf}`;
        await expect(footer.locator(`a[href="${href}"]`)).toHaveCount(1);
        const response = await request.get(href, { maxRedirects: 0 });
        expect(response.status(), href).toBe(200);
      }
      for (const href of [
        `/${locale}/imprint`,
        `/${locale}/legal/terms`,
        `/${locale}/legal/privacy`,
      ]) {
        await expect(footer.locator(`a[href="${href}"]`)).toHaveCount(0);
      }
    });
  }
});

/** The `fo_consent` value the browser holds, parsed, or `null`. */
async function consentCookie(
  context: BrowserContext,
): Promise<{ a: boolean; m: boolean } | null> {
  const cookie = (await context.cookies()).find(
    (candidate) => candidate.name === "fo_consent",
  );
  if (cookie === undefined || cookie.value === "") return null;
  return JSON.parse(decodeURIComponent(cookie.value)) as {
    a: boolean;
    m: boolean;
  };
}

test.describe("T-13 / AC-13: the cookie page's own button changes the answer", () => {
  test("after Reject all, Change cookie settings reaches the panel and saving analytics on sets a: true", async ({
    page,
    context,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "languages", {
        configurable: true,
        get: () => [],
      });
    });
    await page.goto("/en/legal/cookies");
    await page.waitForLoadState("networkidle");
    const rows = page.locator("[data-fo-cookie-row]");
    await expect(rows).not.toHaveCount(0);
    // Reject all first, wherever the first layer is offered on this build (spec 004 §14
    // A-founder-2026-10-19d: with no category active there is no banner on load, and the button
    // opens the panel directly; with one active, it re-opens the banner, whose Choose opens it).
    const reject = page.locator('[data-fo-consent-action="reject"]');
    if (await reject.isVisible()) {
      await reject.click();
      const close = page.locator('[data-fo-consent-action="close"]');
      if (await close.isVisible()) await close.click();
    }
    const dock = page.locator("[data-fo-legal-dock] [data-fo-consent-reopen]");
    const button = (await dock.isVisible())
      ? dock
      : page.locator("main [data-fo-consent-reopen]").first();
    await expect(button).toHaveText("Change cookie settings");
    await button.click();
    const panel = page.locator("[data-fo-consent-panel]");
    if (!(await panel.isVisible())) {
      await page.locator('[data-fo-consent-action="settings"]').click();
    }
    await expect(panel).toBeVisible();
    await page.locator('[data-fo-consent-category="analytics"]').check();
    await page.locator('[data-fo-consent-action="save"]').click();
    await expect.poll(() => consentCookie(context)).toMatchObject({ a: true });
  });
});
