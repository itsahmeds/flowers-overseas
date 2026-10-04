/**
 * **T-47, served** (spec 004 §14 A23 clause 12, open item (vii), AC-37's phrase bullet; TASK-193).
 *
 * The unit half (`tests/unit/neutral-ordering-copy.test.ts`) scans the copy at rest. This file
 * scans what a buyer and a crawler receive: the `en` and `en-gb` documents of the home, the seven
 * listing types, the guide and one product page, `<body>` text with scripts and styles removed
 * (so text a breakpoint hides still counts) plus the `<title>` and the meta description.
 *
 * The named exception list (`tests/support/forbidden-phrases.ts`) is cut out of the text first,
 * as the strings it excuses render, so a page may print an excepted string and nothing else that
 * matches. The last case plants a phrase and requires the same read to catch it.
 */
import { type Page, expect, test } from "@playwright/test";

import {
  exceptionTexts,
  forbiddenPhrasesIn,
  normaliseSpace,
} from "../support/forbidden-phrases.ts";

/** The home, the seven listing types, the guide and one product page, in `en` and `en-gb`. */
const PAGES: readonly { readonly type: string; readonly path: string }[] = [
  "en",
  "en-gb",
].flatMap((locale) => [
  { type: "home", path: `/${locale}` },
  { type: "country shop root", path: `/${locale}/poland/flowers` },
  { type: "country category", path: `/${locale}/poland/flowers/roses` },
  {
    type: "country occasion",
    path: `/${locale}/poland/occasions/mothers-day`,
  },
  { type: "category hub", path: `/${locale}/flowers/roses` },
  { type: "occasion hub", path: `/${locale}/occasions/mothers-day` },
  { type: "occasions index", path: `/${locale}/occasions` },
  { type: "destinations hub", path: `/${locale}/send-flowers-to` },
  { type: "guide", path: `/${locale}/send-flowers-to/poland` },
  // A destination with no delivery dates: the page that prints N2 and N3.
  { type: "product page", path: `/${locale}/germany/product/amber-hour` },
]);

const EXCUSED = exceptionTexts();

/** The document's copy, whitespace collapsed, with the excused strings cut out. */
async function servedCopy(page: Page, plant?: string): Promise<string> {
  const raw = await page.evaluate((planted) => {
    const body = document.body.cloneNode(true) as HTMLElement;
    for (const node of body.querySelectorAll("script, style, template")) {
      node.remove();
    }
    if (planted !== undefined) {
      const line = document.createElement("p");
      line.textContent = planted;
      body.append(line);
    }
    const description =
      document
        .querySelector('meta[name="description"]')
        ?.getAttribute("content") ?? "";
    return [document.title, description, body.textContent ?? ""].join("\n");
  }, plant);
  let text = normaliseSpace(raw);
  for (const excused of EXCUSED) text = text.replaceAll(excused, " ");
  return text;
}

test.describe("AC-37: no en/en-gb document says we have no florists yet (T-47)", () => {
  test("the exception list resolves to text", () => {
    // `corridor.facts.orderBy.none` and five FAQ answers: a list that resolved to nothing would
    // excuse nothing and hide a broken read.
    expect(EXCUSED).toHaveLength(6);
  });

  for (const { type, path } of PAGES) {
    test(`${type} ${path}`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      const text = await servedCopy(page);
      expect(forbiddenPhrasesIn(text), text.slice(0, 600)).toEqual([]);
    });
  }

  test("the read catches a phrase planted into the served DOM", async ({
    page,
  }) => {
    await page.goto("/en/germany/product/amber-hour");
    const text = await servedCopy(
      page,
      "We are still choosing florists in Germany.",
    );
    expect(forbiddenPhrasesIn(text)).toEqual([
      "still choosing",
      "choosing florists",
    ]);
  });
});
