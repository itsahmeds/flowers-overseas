/**
 * The language links keep the page, in the served HTML (spec 003 §2 L79 "`localePath()`-built
 * links to the same path in every launch locale, falling back to the locale home; no JS
 * required", §5.3 L194; spec 004 §14 A24 AC-47, AC-14; spec 008 AC-21; TASK-233).
 *
 * One page of each of the ten types (`tests/support/language-links.ts`), opened in every locale
 * that has it, at 1440 × 900 and at 390 × 844, **with JavaScript off**: the links are plain `<a>`
 * from the server. At 1440 the utility strip and the footer row are read, at 390 the phone Menu
 * (opened by its native `<summary>`) and the footer row. In each, every link's `hreflang` → `href`
 * map equals the page's own path in each **shown** locale (`shownLocales()`, today `en` and
 * `en-gb`; spec 003 §14 A-founder-2026-10-14c), or that locale's home where the page does not
 * exist there, and the current locale is the one `aria-current` entry. On a hidden locale's page
 * (`/de`, `/pl`, reached by URL) the rows list the shown locales and no entry is current (AC-46). Every distinct target then answers 200 with no redirect, so no language
 * link reaches a 404 (AC-14).
 *
 * Red when the switcher points back at the homes, and red when an alternate names an unpublished
 * guide (the expected map, then the 404).
 *
 * The viewports are set here, so the suite runs in the `e2e-desktop` project only.
 */
import { type Page, expect, test } from "@playwright/test";

// By path and not through the barrel, as `links.spec.ts` does: `routing.ts` imports only the
// registry.
import { shownLocales } from "../../src/modules/i18n/routing.ts";
import {
  LANGUAGE_LINK_PAGES,
  LOCALE_HOMES,
  LOCALE_TAGS,
} from "../support/language-links.ts";

/** The locales every language row offers (TASK-237): the registry's, not a restated list. */
const SHOWN = shownLocales().map((locale) => locale.code);

test.use({ javaScriptEnabled: false });

test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "e2e-desktop",
    "sets its own viewports; run once, in e2e-desktop",
  );
});

const VIEWPORTS = [
  { width: 1440, height: 900, rows: ["[data-fo-header-switcher]"] },
  { width: 390, height: 844, rows: ["[data-fo-menu-switcher]"] },
] as const;

const FOOTER_ROW = "[data-fo-footer-languages]";

/** The links one switcher row draws: `hreflang` → `href`, and its current locale's `lang`. */
async function rowOf(
  page: Page,
  row: string,
): Promise<{ links: Record<string, string>; current: string[] }> {
  const nav = page.locator(`${row} nav`);
  await expect(nav).toHaveCount(1);
  const links = await nav
    .locator("a")
    .evaluateAll((nodes) =>
      Object.fromEntries(
        nodes.map((node) => [
          node.getAttribute("hreflang") ?? "",
          node.getAttribute("href") ?? "",
        ]),
      ),
    );
  const current = await nav
    .locator('[aria-current="page"]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("lang")));
  return { links, current: current.map((lang) => lang ?? "") };
}

/** What every row on `cluster`'s page in `locale` must link: the page, else the home. */
function expectedLinks(
  cluster: Readonly<Record<string, string>>,
  locale: string,
): Record<string, string> {
  return Object.fromEntries(
    SHOWN.filter((code) => code !== locale).map((code) => [
      LOCALE_TAGS[code] ?? code,
      cluster[code] ?? LOCALE_HOMES[code] ?? "",
    ]),
  );
}

test("offers English and English (UK), and not German or Polish (spec 003 AC-46)", () => {
  expect(SHOWN).toEqual(["en", "en-gb"]);
});

for (const [type, cluster] of Object.entries(LANGUAGE_LINK_PAGES)) {
  for (const viewport of VIEWPORTS) {
    test(`${type} at ${String(viewport.width)} px: every language link is this page in that locale, or its home`, async ({
      page,
      request,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      const targets = new Set<string>();

      for (const [locale, path] of Object.entries(cluster)) {
        const response = await page.goto(path);
        expect(response?.status(), path).toBe(200);
        if (viewport.width < 768) {
          await page.locator("[data-fo-menu-summary]").click();
          await expect(page.locator("[data-fo-menu][open]")).toHaveCount(1);
        }
        const expected = expectedLinks(cluster, locale);
        for (const row of [...viewport.rows, FOOTER_ROW]) {
          const drawn = await rowOf(page, row);
          expect(drawn.links, `${path} ${row}`).toEqual(expected);
          expect(drawn.current, `${path} ${row}`).toEqual(
            SHOWN.includes(locale) ? [LOCALE_TAGS[locale]] : [],
          );
        }
        await expect(page.locator(viewport.rows[0]).first()).toBeVisible();
        for (const href of Object.values(expected)) targets.add(href);
      }

      // No language link reaches a 404 or a redirect (spec 004 AC-14, spec 008 AC-21).
      for (const href of targets) {
        const answer = await request.get(href, { maxRedirects: 0 });
        expect(answer.status(), href).toBe(200);
      }
    });
  }
}
