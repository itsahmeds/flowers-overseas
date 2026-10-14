/**
 * **AC-30, site-wide half** (spec 041 §14 A-founder-2026-10-14, T-32 e2e; spec 010 AC-51's
 * rendered half for the pages a buyer reaches before checkout; TASK-226).
 *
 * The founder's ruling, 2026-10-14: buyers never learn that we relay an order to a florist. This
 * file reads what a buyer and a crawler receive on the six buyer page types (the home, a product,
 * a country shop, a country category, a country occasion and a guide) in `en`, `en-gb`, `de` and
 * `pl`, and runs `relayMatches` over it:
 *
 *  - the `<body>` text with scripts, styles and templates removed (so text a breakpoint hides
 *    still counts), with a blank line after every block element so a heading and the paragraph
 *    under it are two sentences, not one;
 *  - every `alt`, `aria-label` and `title` attribute, and the document `<title>` and meta
 *    description.
 *
 * `de` and `pl` have no guide: a locale with no authored guide has no corridor page at all, and
 * `tests/e2e/corridor.spec.ts` asserts those 404s. So the guide is read in `en` and `en-gb`, and
 * the matrix is 22 documents.
 *
 * `RELAY_EXEMPT` is the only exemption. The one decided string (the home sentence's "my partner",
 * decisions-log 2026-10-04) is cut out only where it renders as the whole text of an `<option>`,
 * so the same words anywhere else still fail. The last cases plant a phrase into one page and
 * require the same read to catch it.
 */
import { type Page, expect, test } from "@playwright/test";

import {
  decidedRenderedStrings,
  relayMatches,
} from "../../src/config/honesty.ts";

interface ScannedPage {
  readonly type: string;
  readonly locale: string;
  readonly path: string;
}

/** Per locale: the localized country, category, occasion and product segments. */
const SEGMENTS = {
  en: {
    country: "poland",
    shop: "flowers",
    category: "roses",
    occasions: "occasions",
    occasion: "mothers-day",
    product: "product",
  },
  de: {
    country: "polen",
    shop: "blumen",
    category: "rosen",
    occasions: "anlaesse",
    occasion: "muttertag",
    product: "produkt",
  },
  pl: {
    country: "polska",
    shop: "kwiaty",
    category: "roze",
    occasions: "okazje",
    occasion: "dzien-matki",
    product: "produkt",
  },
} as const;

const PAGES: readonly ScannedPage[] = (
  [
    ["en", SEGMENTS.en],
    ["en-gb", SEGMENTS.en],
    ["de", SEGMENTS.de],
    ["pl", SEGMENTS.pl],
  ] as const
).flatMap(([locale, s]) => [
  { type: "home", locale, path: `/${locale}` },
  {
    type: "product",
    locale,
    path: `/${locale}/${s.country}/${s.product}/amber-hour`,
  },
  {
    type: "country shop",
    locale,
    path: `/${locale}/${s.country}/${s.shop}`,
  },
  {
    type: "country category",
    locale,
    path: `/${locale}/${s.country}/${s.shop}/${s.category}`,
  },
  {
    type: "country occasion",
    locale,
    path: `/${locale}/${s.country}/${s.occasions}/${s.occasion}`,
  },
  ...(locale === "en" || locale === "en-gb"
    ? [
        {
          type: "guide",
          locale,
          path: `/${locale}/send-flowers-to/${s.country}`,
        },
      ]
    : []),
]);

/** The elements after which a blank line separates sentences in the read. */
const BLOCKS =
  "address, article, aside, blockquote, br, button, caption, dd, details, dialog, div, dl, dt, fieldset, figcaption, figure, footer, form, h1, h2, h3, h4, h5, h6, header, hr, label, legend, li, main, nav, ol, optgroup, option, p, pre, section, select, summary, table, td, th, tr, ul";

/**
 * The document's buyer-visible text and its `alt`, `aria-label` and `title` attributes, with the
 * decided strings cut out where they render as a whole `<option>`. `plant` appends a paragraph
 * or an attribute so the last cases can prove the read.
 */
async function servedText(
  page: Page,
  locale: string,
  plant?: { readonly text?: string; readonly altText?: string },
): Promise<string> {
  return page.evaluate(
    ({ blocks, decided, planted }) => {
      if (planted.text !== undefined) {
        const line = document.createElement("p");
        line.textContent = planted.text;
        document.body.append(line);
      }
      if (planted.altText !== undefined) {
        const image = document.createElement("img");
        image.setAttribute("alt", planted.altText);
        document.body.append(image);
      }
      const attributes = [
        ...document.querySelectorAll("[alt], [aria-label], [title]"),
      ]
        .flatMap((node) =>
          ["alt", "aria-label", "title"].map(
            (name) => node.getAttribute(name) ?? "",
          ),
        )
        .filter((value) => value.trim() !== "");
      const body = document.body.cloneNode(true) as HTMLElement;
      for (const node of body.querySelectorAll("script, style, template")) {
        node.remove();
      }
      for (const option of body.querySelectorAll("option")) {
        if (decided.includes((option.textContent ?? "").trim()))
          option.remove();
      }
      for (const node of body.querySelectorAll(blocks)) {
        node.after(document.createTextNode("\n\n"));
      }
      const description =
        document
          .querySelector('meta[name="description"]')
          ?.getAttribute("content") ?? "";
      return [
        document.title,
        description,
        ...attributes,
        body.textContent ?? "",
      ].join("\n\n");
    },
    {
      blocks: BLOCKS,
      decided: [...decidedRenderedStrings(locale)],
      planted: plant ?? {},
    },
  );
}

/** `pattern: sentence` for every match, so a failure names what tripped and where. */
function findings(text: string, locale: string): readonly string[] {
  return relayMatches(text, locale).map(
    (match) => `${match.id}: ${match.sentence.slice(0, 200)}`,
  );
}

test.describe("AC-30: no buyer page relays, in en, en-gb, de or pl (T-32)", () => {
  test("covers the six page types across the four locales", () => {
    expect(new Set(PAGES.map((page) => page.type)).size).toBe(6);
    expect(new Set(PAGES.map((page) => page.locale)).size).toBe(4);
    expect(PAGES).toHaveLength(22);
  });

  for (const { type, locale, path } of PAGES) {
    test(`${type} ${path}`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      const text = await servedText(page, locale);
      // A read of nothing passes; the floor makes an empty read red.
      expect(text.length, path).toBeGreaterThan(500);
      expect(findings(text, locale)).toEqual([]);
    });
  }

  test("the read catches a phrase planted into one page's text, and into an alt", async ({
    page,
  }) => {
    await page.goto("/en/poland/product/amber-hour");
    expect(
      findings(
        await servedText(page, "en", {
          text: "Free to cancel until our florist accepts your order.",
        }),
        "en",
      ),
    ).not.toEqual([]);
    await page.goto("/de/polen/produkt/amber-hour");
    expect(
      findings(
        await servedText(page, "de", { altText: "Unser Partnerflorist" }),
        "de",
      ),
    ).not.toEqual([]);
  });

  test("the decided string is cut out only as a whole option", async ({
    page,
  }) => {
    await page.goto("/en");
    // The home renders the who option, and the read does not report it…
    expect(
      await page.locator("option", { hasText: /^my partner$/u }).count(),
    ).toBeGreaterThan(0);
    expect(findings(await servedText(page, "en"), "en")).toEqual([]);
    // …while the same words in a paragraph are a match.
    expect(
      findings(await servedText(page, "en", { text: "Ask my partner." }), "en"),
    ).not.toEqual([]);
  });
});
