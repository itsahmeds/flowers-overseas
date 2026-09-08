/**
 * T-05 / AC-4 (TASK-045): the two families are self-hosted, preloaded, `swap`-ed, and no page
 * asks Google for a font.
 *
 * The unit half (`tests/unit/fonts.test.ts`) proves the committed subsets fit the ≤45 KB budget
 * and cover Latin-Ext. What only a browser can prove is on this side: that the served document
 * preloads them from our own origin, that the emitted `@font-face` carries `font-display: swap`
 * and the `size-adjust` fallback metrics, and that **zero** requests leave for
 * `fonts.googleapis.com` or `fonts.gstatic.com` — the CWV and German-court decision of `plan/07`
 * §1.4, which a single `next/font/google` import would silently undo.
 */
import { expect, test } from "@playwright/test";

const PAGES = ["/", "/en", "/de", "/pl"];

/** The committed faces (`src/modules/ui/fonts/subset.json`). */
const FACE_COUNT = 3;
/** AC-4's budget, in bytes. */
const FONT_BUDGET_BYTES = 45 * 1024;

for (const path of PAGES) {
  test(`${path} loads both families from our own origin only`, async ({
    page,
  }) => {
    const fontRequests: string[] = [];
    const googleRequests: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (
        url.includes("fonts.googleapis.com") ||
        url.includes("fonts.gstatic.com")
      ) {
        googleRequests.push(url);
      }
      if (request.resourceType() === "font") fontRequests.push(url);
    });

    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    // Fonts are fetched by the preload, so they are in flight by `load`; wait for quiet.
    await page.waitForLoadState("networkidle");

    expect(googleRequests, "a page requested a Google font").toEqual([]);
    expect(fontRequests.length).toBeGreaterThan(0);
    for (const url of fontRequests) {
      expect(url, url).toContain("/_next/static/media/");
      expect(url, url).toMatch(/\.woff2(\?|$)/);
    }
  });

  test(`${path} preloads the subsets and declares swap with fallback metrics`, async ({
    page,
  }) => {
    await page.goto(path);

    const preloads = page.locator('link[rel="preload"][as="font"]');
    expect(await preloads.count()).toBe(FACE_COUNT);
    // `crossorigin` is present and empty (which is `anonymous`), so it is asserted as an attribute
    // rather than by value; without it the browser would fetch each subset twice.
    const attributes = await preloads.evaluateAll((links) =>
      links.map((link) => ({
        crossorigin: link.hasAttribute("crossorigin"),
        type: link.getAttribute("type"),
        href: link.getAttribute("href"),
      })),
    );
    for (const link of attributes) {
      expect(link.crossorigin, link.href ?? "").toBe(true);
      expect(link.type).toBe("font/woff2");
      expect(link.href).toContain("/_next/static/media/");
    }

    // The generated `@font-face` rules, read from the document's own stylesheets.
    const faces = await page.evaluate(() =>
      [...document.styleSheets]
        .flatMap((sheet) => {
          try {
            return [...sheet.cssRules];
          } catch {
            return [];
          }
        })
        .filter((rule) => rule.constructor.name === "CSSFontFaceRule")
        .map((rule) => rule.cssText),
    );
    expect(faces.length).toBeGreaterThanOrEqual(FACE_COUNT);
    const declared = faces.join("\n");
    expect(declared).toContain("swap");
    // `adjustFontFallback` produces a metrics-overridden fallback face per family, which is what
    // makes the swap cost no layout shift.
    expect(declared).toContain("size-adjust");
  });
}

test("the whole font transfer of a page stays inside the 45 KB budget", async ({
  page,
}) => {
  const sizes = new Map<string, number>();
  page.on("response", async (response) => {
    if (response.request().resourceType() !== "font") return;
    const body = await response.body().catch(() => null);
    if (body !== null) sizes.set(response.url(), body.length);
  });

  await page.goto("/pl");
  await page.waitForLoadState("networkidle");

  const total = [...sizes.values()].reduce((sum, size) => sum + size, 0);
  expect(sizes.size).toBe(FACE_COUNT);
  expect(
    total,
    `font transfer is ${String(total)} B across ${String(sizes.size)} files, budget ${String(FONT_BUDGET_BYTES)} B`,
  ).toBeLessThanOrEqual(FONT_BUDGET_BYTES);
});

test("Polish diacritics are rendered by the webfont, not by a fallback (AC-4)", async ({
  page,
}) => {
  await page.goto("/pl");
  await page.waitForLoadState("networkidle");

  const result = await page.evaluate(async () => {
    await document.fonts.ready;
    const faces = [...document.fonts];
    const body = getComputedStyle(document.body);
    // The generated family name of the body face, taken from the document rather than guessed.
    const family = body.fontFamily.split(",")[0]?.trim() ?? "";
    return {
      faceCount: faces.length,
      // A face is only fetched when the page actually renders a glyph in it, and the
      // metric-adjusted fallbacks never are; what matters is that the *body* face loaded.
      loaded: faces.filter((face) => face.status === "loaded").length,
      family,
      // If the subset were missing the Latin-Ext block, the browser would substitute and this
      // would answer false.
      covers: document.fonts.check(`400 15px ${family}`, "ąćęłńóśźż"),
      selfHosted: !family.includes("Helvetica") && !family.includes("Arial"),
    };
  });

  expect(result.faceCount).toBeGreaterThanOrEqual(FACE_COUNT);
  expect(result.loaded).toBeGreaterThan(0);
  expect(result.selfHosted, `body renders in ${result.family}`).toBe(true);
  expect(result.covers, `${result.family} does not cover ąćęłńóśźż`).toBe(true);
});
