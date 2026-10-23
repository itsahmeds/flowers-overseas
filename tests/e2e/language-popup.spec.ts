/**
 * The language popup on the committed registry (spec 003 §14 A-founder-2026-10-19d; AC-28 (a) and
 * (h)'s repo checks, AC-46's popup half, spec 004 AC-39 and T-41's e2e half; TASK-280).
 *
 * `en` and `en-gb` are the shown locales and share one primary language, so `languageOffer()` is
 * empty on every page: the popup never opens. On `/en`, `/en-gb`, `/de` and `/pl`, at 390 × 844 and
 * 1280 × 800, with no `fo_locale` and each of the four browser-language sets (and once with
 * `cf-ipcountry: DE` on the document request), after hydration and network idle:
 *
 *  - no `[data-fo-language-popup]` element exists;
 *  - no request is made for the popup island's chunk — resolved first from the build output
 *    (clause 9: the locale page's `react-loadable-manifest.json` entry carrying the island's
 *    marker, asserted to exist and be non-empty) — and none to `/api/geo`;
 *  - `<html>` carries no `data-fo-locale-gate`;
 *  - no `fo_locale` cookie exists, the URL is unchanged and no main-frame navigation fired.
 *
 * The rule itself, the opening cases and the props are unit and integration tests under a fixture
 * registry with `de` shown (`tests/unit/i18n-hints.test.ts`, `tests/unit/i18n-language-offer.test.tsx`,
 * `tests/unit/i18n-language-popup.test.tsx`). The dialog's shape, closing and choosing in a browser
 * move to the task that shows `de` or `pl` again and builds the slim bar (clause 4).
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { type Page, expect, test } from "@playwright/test";

import { NO_LOCALE_CHOICE } from "../support/locale-choice.ts";

import { DEFERRED_ISLANDS } from "../../src/modules/ui/deferred/deferredSet.ts";

const PAGES = ["/en", "/en-gb", "/de", "/pl"] as const;
const SIZES = [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
] as const;
const LANGUAGES = [["de-DE", "de"], ["pl-PL"], ["en-GB"], ["en-US"]] as const;

const DIST = resolve(import.meta.dirname, "../../.next");
const MARKER =
  DEFERRED_ISLANDS.find((island) => island.id === "language-popup")?.marker ??
  "missing:language-popup";

/** Clause 9: the popup island's chunk, by the file the build output records for it. */
function popupChunk(): string {
  const manifest = join(
    DIST,
    "server/app/[locale]/page/react-loadable-manifest.json",
  );
  if (!existsSync(manifest)) throw new Error(`no ${manifest}`);
  const entries = JSON.parse(readFileSync(manifest, "utf8")) as Record<
    string,
    { files?: readonly string[] }
  >;
  const carrying = [
    ...new Set(Object.values(entries).flatMap((entry) => entry.files ?? [])),
  ].filter(
    (file) =>
      file.endsWith(".js") &&
      existsSync(join(DIST, file)) &&
      readFileSync(join(DIST, file), "utf8").includes(MARKER),
  );
  if (carrying.length !== 1) {
    throw new Error(
      `expected one chunk carrying ${MARKER}, found ${String(carrying.length)}`,
    );
  }
  const chunk = carrying[0]!;
  if (statSync(join(DIST, chunk)).size === 0) {
    throw new Error(`${chunk} is empty`);
  }
  return chunk;
}

async function forceLanguages(
  page: Page,
  languages: readonly string[],
): Promise<void> {
  await page.addInitScript((values: readonly string[]) => {
    Object.defineProperty(navigator, "languages", {
      configurable: true,
      get: () => values,
    });
    Object.defineProperty(navigator, "language", {
      configurable: true,
      get: () => values[0],
    });
  }, languages);
}

/** Everything the visit did that AC-28 (a) forbids, in one record. */
async function visit(
  page: Page,
  path: string,
  languages: readonly string[],
  headers: Record<string, string> = {},
) {
  const chunk = popupChunk();
  const requests: string[] = [];
  const navigations: string[] = [];
  page.on("request", (request) => {
    requests.push(request.url());
    // A document request of the main frame: a navigation that loads a page. Next's own
    // same-document history updates are not navigations and do not appear here.
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      navigations.push(request.url());
    }
  });
  await forceLanguages(page, languages);
  if (Object.keys(headers).length > 0) {
    await page.route(`**${path}`, async (route) =>
      route.continue({ headers: { ...route.request().headers(), ...headers } }),
    );
  }
  const response = await page.goto(path);
  expect(response?.status()).toBe(200);
  await page.waitForLoadState("networkidle");
  return {
    chunk,
    popups: await page.locator("[data-fo-language-popup]").count(),
    chunkRequested: requests.some(
      (url) => new URL(url).pathname === `/_next/${chunk}`,
    ),
    geo: requests.filter((url) => new URL(url).pathname.startsWith("/api/geo")),
    gate: await page.evaluate(() =>
      document.documentElement.getAttribute("data-fo-locale-gate"),
    ),
    localeCookie: (await page.context().cookies()).find(
      (cookie) => cookie.name === "fo_locale",
    ),
    pathname: new URL(page.url()).pathname,
    navigations: navigations.length,
  };
}

test.use({ storageState: NO_LOCALE_CHOICE });

test.describe("AC-28 (a): the committed registry offers nothing, so nothing opens", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "e2e-desktop",
      "sizes and languages are set per case; one project runs them",
    );
  });

  test("the popup's chunk is in the build output (clause 9's existence check)", () => {
    expect(popupChunk()).toMatch(/^static\/chunks\/.+\.js$/u);
  });

  for (const path of PAGES) {
    for (const size of SIZES) {
      test(`${path} at ${String(size.width)} × ${String(size.height)}: no popup, no chunk, no gate, no cookie, no navigation for any browser language`, async ({
        browser,
      }) => {
        test.setTimeout(90_000);
        for (const languages of LANGUAGES) {
          const context = await browser.newContext({
            viewport: size,
            storageState: NO_LOCALE_CHOICE,
          });
          try {
            const page = await context.newPage();
            const seen = await visit(page, path, languages);
            const label = `${path} ${languages.join(",")}`;
            expect(seen.popups, label).toBe(0);
            expect(seen.chunkRequested, `${label}: ${seen.chunk}`).toBe(false);
            expect(seen.geo, label).toEqual([]);
            expect(seen.gate, label).toBeNull();
            expect(seen.localeCookie, label).toBeUndefined();
            expect(seen.pathname, label).toBe(path);
            expect(seen.navigations, label).toBe(1);
          } finally {
            await context.close();
          }
        }
      });
    }
  }

  test("a country header on the document request changes nothing (browser language only)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const seen = await visit(page, "/en", ["de-DE", "de"], {
      "cf-ipcountry": "DE",
    });
    expect(seen.popups).toBe(0);
    expect(seen.chunkRequested).toBe(false);
    expect(seen.geo).toEqual([]);
    expect(seen.gate).toBeNull();
    expect(seen.localeCookie).toBeUndefined();
  });
});

test.describe("AC-28 (h)'s repo checks: the old strip is gone", () => {
  test("no `LocaleSuggestionBanner*` file exists under src/", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
          ? walk(join(dir, entry.name))
          : [join(dir, entry.name)],
      );
    expect(
      walk(resolve(import.meta.dirname, "../../src")).filter((file) =>
        /LocaleSuggestionBanner/u.test(file),
      ),
    ).toEqual([]);
  });

  test("no element of the old strip is in the DOM", async ({ page }) => {
    await page.goto("/en");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("[data-fo-banner]")).toHaveCount(0);
  });
});
