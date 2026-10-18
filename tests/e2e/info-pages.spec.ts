/**
 * Spec 041's trust pages, built and served (TASK-182): T-01 (AC-1, trust half), T-08 (AC-8),
 * T-24 (AC-24), T-26 (AC-26) and T-32's rendered half (AC-30) over every (page, locale) that
 * exists before registration in `en` and `en-gb`. The `de` and `pl` drafts are TASK-184's, so
 * their URLs are asserted to be 404s here and join the scans when their files land.
 */
import { expect, test } from "@playwright/test";

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
        "regulamin/regulamin",
        "regulamin/polityka-prywatnosci",
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
