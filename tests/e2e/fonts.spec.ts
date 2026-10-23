/**
 * T-05 / AC-4 as amended by spec 004 §14 A21 clause 3 (TASK-045, TASK-175): the page faces are
 * self-hosted, `swap`-ed with fallback metrics, split into Latin and Latin-Ext `unicode-range`
 * files, preloaded at most two at a time, inside A21's per-locale budgets — and no page asks
 * Google for a font.
 *
 * The unit half (`tests/unit/fonts.test.ts`) proves the committed files, the manifest and the
 * `localFont()` declarations. What only a served page can prove is here: the preload links Next
 * writes, the `@font-face` rules it emits, which files a real `en` and `pl` page fetch, how many
 * bytes they come to, and that the Polish letters come from the webfont.
 */
import { expect, test, type Page } from "@playwright/test";

const PAGES = ["/en", "/de", "/pl"];

const KB = 1024;
/** A21 clause 3's budgets (`scripts/fonts/build-fonts.ts` `FONT_BUDGETS`). */
const LATIN_PAGE_BUDGET = 90 * KB;
const LATIN_EXT_PAGE_BUDGET = 120 * KB;
const PRELOAD_BUDGET = 50 * KB;
const MAX_PRELOADS = 2;

/** Next keeps the source file's stem in the emitted name (`alegreya_sans_400_latin-s.p.<hash>`). */
const PRELOADABLE = /alegreya_sans_(?:400|700)_latin[-.]/;

/** Every font response a page makes until the network is quiet, with its byte length. */
async function fontsFetched(
  page: Page,
  path: string,
): Promise<Map<string, number>> {
  const sizes = new Map<string, number>();
  page.on("response", async (response) => {
    if (response.request().resourceType() !== "font") return;
    const body = await response.body().catch(() => null);
    if (body !== null) sizes.set(response.url(), body.length);
  });
  const response = await page.goto(path);
  expect(response?.status()).toBe(200);
  await page.waitForLoadState("networkidle");
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  return sizes;
}

for (const path of PAGES) {
  test(`${path} loads its fonts from our own origin only`, async ({ page }) => {
    const googleRequests: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (
        url.includes("fonts.googleapis.com") ||
        url.includes("fonts.gstatic.com")
      ) {
        googleRequests.push(url);
      }
    });
    const fetched = await fontsFetched(page, path);

    expect(googleRequests, "a page requested a Google font").toEqual([]);
    expect(fetched.size).toBeGreaterThan(0);
    for (const url of fetched.keys()) {
      // Vercel serves Next's fingerprinted assets from `/_next/static/immutable/media/` while a
      // local `next start` uses `/_next/static/media/`; both are our own origin.
      expect(url, url).toMatch(/\/_next\/static\/(?:immutable\/)?media\//);
      expect(url, url).toMatch(/\.woff2(\?|$)/);
      // Caveat is the product page's alone, and Newsreader and Plex ship nowhere.
      expect(url, url).not.toMatch(/caveat|newsreader|plex/i);
    }
  });

  test(`${path} preloads at most two files, the Alegreya Sans Latin ones, and declares swap, metrics and ranges`, async ({
    page,
  }) => {
    await page.goto(path);

    const preloads = page.locator('link[rel="preload"][as="font"]');
    const links = await preloads.evaluateAll((elements) =>
      elements.map((link) => ({
        crossorigin: link.hasAttribute("crossorigin"),
        type: link.getAttribute("type"),
        href: link.getAttribute("href") ?? "",
      })),
    );
    expect(links.length).toBeGreaterThan(0);
    expect(links.length).toBeLessThanOrEqual(MAX_PRELOADS);
    for (const link of links) {
      // `crossorigin` present (empty is `anonymous`); without it the file is fetched twice.
      expect(link.crossorigin, link.href).toBe(true);
      expect(link.type).toBe("font/woff2");
      expect(link.href, link.href).toMatch(PRELOADABLE);
    }

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
    const declared = faces.join("\n");
    expect(declared).toContain("swap");
    // `adjustFontFallback` writes a metrics-overridden fallback face, so the swap costs no CLS.
    expect(declared).toContain("size-adjust");
    // Latin and Latin-Ext are separate files with separate ranges (A21 clause 3).
    expect(declared).toMatch(
      /unicode-range:\s*U\+(?:0-FF|0000-00FF|\?\?)[,\s]/i,
    );
    // Since A-orchestrator-2026-10-23 Latin-Ext starts at U+0100-0103: Ą ą Ć ć moved to Latin.
    expect(declared).toMatch(
      /unicode-range:\s*U\+100-103|unicode-range:\s*U\+0100-0103/i,
    );
  });
}

test("an en page stays inside the 90 KB budget, Poland's own names included, and preloads inside 50 KB", async ({
  page,
}) => {
  // `/en` names Wrocław, Gdańsk and Dzień Kobiet, from the Latin files since
  // A-orchestrator-2026-10-23; the budget is charged on everything it fetches.
  const fetched = await fontsFetched(page, "/en");
  const total = [...fetched.values()].reduce((sum, size) => sum + size, 0);
  expect(total, `font transfer is ${String(total)} B`).toBeLessThanOrEqual(
    LATIN_PAGE_BUDGET,
  );
  const preloaded = [...fetched.entries()]
    .filter(([url]) => PRELOADABLE.test(url))
    .reduce((sum, [, size]) => sum + size, 0);
  expect(preloaded).toBeLessThanOrEqual(PRELOAD_BUDGET);
});

/** Next keeps the stem: `alegreya_sans_400_latin_ext-s.p.<hash>`, never in a Latin file's name. */
const LATIN_EXT_FILE = /_latin_ext/;

/**
 * T-64, AC-59 (spec 004 §14 A-orchestrator-2026-10-23): the Polish letters ride in the Latin
 * files, so `/pl` renders its Polish text (the header's labels on a translated catalogue, the
 * home's place names today) from the two preloaded Alegreya Sans files and fetches no Latin-Ext
 * file at all. (d), the header's shift of exactly 0 on `/pl`, is `./header.spec.ts`, unchanged.
 */
test("a pl page stays inside the 120 KB budget and renders ą ć ę ł ń ś ź ż from the preloaded Latin webfont, fetching no Latin-Ext file (AC-4, AC-59)", async ({
  page,
}) => {
  const requested: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "font") requested.push(request.url());
  });
  const fetched = await fontsFetched(page, "/pl");
  // AC-59 (a): through load and the same 500 ms settle the header case waits.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, 500);
      }),
  );
  const total = [...fetched.values()].reduce((sum, size) => sum + size, 0);
  expect(total, `font transfer is ${String(total)} B`).toBeLessThanOrEqual(
    LATIN_EXT_PAGE_BUDGET,
  );
  expect(requested.length).toBeGreaterThan(0);
  expect(
    requested.filter((url) => LATIN_EXT_FILE.test(url)),
    "a Latin-Ext font file was requested on /pl",
  ).toEqual([]);

  // AC-59 (c): exactly the two Alegreya Sans Latin files are preloaded, 400 and 700.
  const preloads = await page
    .locator('link[rel="preload"][as="font"]')
    .evaluateAll((elements) =>
      elements.map((link) => link.getAttribute("href") ?? ""),
    );
  expect(preloads, preloads.join(", ")).toHaveLength(2);
  expect(
    preloads.filter((href) => /alegreya_sans_400_latin[-.]/.test(href)),
  ).toHaveLength(1);
  expect(
    preloads.filter((href) => /alegreya_sans_700_latin[-.]/.test(href)),
  ).toHaveLength(1);

  // AC-59 (b): the webfont, not the stack. `document.fonts.check()` over the whole computed stack
  // also weighs its `local()` fallback faces, and on Linux `local("Arial")` is an `error` face, so
  // the stack answers false however loaded the webfont is. So the family is the Alegreya Sans
  // Latin call's own (`--font-alegreya`, the preloaded one), and its 400 face must be loaded and
  // cover the Polish letters on its own.
  const result = await page.evaluate(async () => {
    await document.fonts.ready;
    const stack = getComputedStyle(document.documentElement).getPropertyValue(
      "--font-alegreya",
    );
    const family = (stack.split(",")[0] ?? "").trim();
    const bare = family.replaceAll(/["']/g, "");
    const faces = [...document.fonts].filter(
      (face) => face.family.replaceAll(/["']/g, "") === bare,
    );
    return {
      family,
      statuses: faces.map((face) => `${face.weight} ${face.status}`),
      regularLoaded: faces.some(
        (face) => face.weight === "400" && face.status === "loaded",
      ),
      covers:
        family !== "" && document.fonts.check(`400 17px ${family}`, "ąćęłńśźż"),
    };
  });
  expect(result.family, result.family).not.toBe("");
  expect(result.family, result.family).not.toMatch(
    /arial|helvetica|serif|sans-serif|fallback/i,
  );
  expect(
    result.regularLoaded,
    `${result.family}: ${result.statuses.join(", ")}`,
  ).toBe(true);
  expect(
    result.covers,
    `${result.family} does not cover ąćęłńśźż (${result.statuses.join(", ")})`,
  ).toBe(true);
});
