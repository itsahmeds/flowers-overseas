/**
 * The product page's one island in a browser, and the v2 error letter (spec 004 §14 A21 clauses 3
 * and 5; spec 009 AC-14 / T-14, the network half; TASK-179).
 *
 *  - Typing into the card field mirrors the words into the printed-card preview, in four locales.
 *  - **The message goes nowhere:** while it is typed, no request is made whose URL or body carries
 *    it, the page's URL does not change, and the field has no `name`.
 *  - The preview's line is set in Caveat, and only after the buyer types does the visible line
 *    change from the sample; one preview is visible at a time.
 *  - The 404 is the letter (the TASK-170 document, restyled), with its one `<h1>`.
 *
 * The unit halves — the island's import graph, the byte-free static checks — are
 * `tests/unit/product-card-preview.test.tsx`.
 */
import { expect, test } from "@playwright/test";

const POLAND_PDPS = [
  "/en/poland/product/amber-hour",
  "/en-gb/poland/product/amber-hour",
  "/de/polen/produkt/amber-hour",
  "/pl/polska/produkt/amber-hour",
] as const;

/** Latin-Ext on purpose: the Polish letters A21 clause 3's Latin-Ext subset exists for. */
const MESSAGE = "Kochana Mamo, ąćęłńóśźż — wszystkiego najlepszego";

for (const url of POLAND_PDPS) {
  test(`${url}: the typed card message reaches the preview and nothing else`, async ({
    page,
  }) => {
    await page.goto(url);
    const field = page.locator("#pdp-card-message");
    await expect(field).toBeVisible();
    expect(await field.getAttribute("name")).toBeNull();

    const visibleLine = page.locator("[data-fo-card-text]:visible");
    await expect(visibleLine).toHaveCount(1);
    const sample = (await visibleLine.textContent()) ?? "";
    expect(sample.length).toBeGreaterThan(0);

    const requests: { url: string; body: string; type: string }[] = [];
    page.on("request", (request) => {
      requests.push({
        url: request.url(),
        body: request.postData() ?? "",
        type: request.resourceType(),
      });
    });
    const before = page.url();

    await field.fill(MESSAGE);
    await expect(visibleLine).toHaveText(MESSAGE);
    await expect(visibleLine).toHaveAttribute("data-fo-card-text", "typed");
    // The counter counts what `maxLength` limits.
    await expect(page.locator("#pdp-card-message-count")).toContainText(
      String(MESSAGE.length),
    );

    // Clearing the field puts the sample back.
    await field.fill("");
    await expect(visibleLine).toHaveText(sample);
    await field.fill(MESSAGE);

    expect(page.url()).toBe(before);
    const encoded = encodeURIComponent(MESSAGE);
    for (const request of requests) {
      expect(request.url).not.toContain(encoded);
      expect(request.url).not.toContain("Kochana");
      expect(request.body).not.toContain("Kochana");
      // Typing may pull the hand face or a lazy image into view; it never calls a script API.
      expect(
        ["fetch", "xhr", "websocket", "eventsource"],
        request.url,
      ).not.toContain(request.type);
    }

    const family = await visibleLine.evaluate(
      (node) => getComputedStyle(node).fontFamily,
    );
    // `next/font/local` names the family after the export (`handFont`, `handFontExt`).
    expect(family.toLowerCase()).toMatch(/caveat|handfont/u);
  });
}

test("the 404 is the v2 letter, with its one heading and a way home", async ({
  page,
}) => {
  const response = await page.goto("/en/no-such-page-at-all");
  expect(response?.status()).toBe(404);
  const letter = page.locator("[data-fo-notice-letter]");
  await expect(letter).toHaveCount(1);
  await expect(letter.locator("h1")).toHaveCount(1);
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(letter.locator('a[href="/en"]')).toHaveCount(1);
});
