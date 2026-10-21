/**
 * The header in a destination's context (spec 043 §5.3 A, §5.4, §6, AC-1, AC-2, AC-3, AC-4, AC-6;
 * T-01 to T-04 and T-06's e2e halves; TASK-288), against the built site.
 *
 *  - **T-01 / AC-1.** On the five pages AC-1 names and their `en-gb` twins, with JavaScript off,
 *    the row at 1440 × 900 and the phone Menu at 390 × 844 link the destination's own pages, each
 *    href asserted as the one value of the design band's table
 *    (`docs/design/wireframes/country-shop-desktop.dc.html`, "Spec 043 · the header in context").
 *  - **T-02 / AC-2.** Every header and Menu href on the crawl set (the shown locales' homes plus
 *    `/`) and on every in-context page of `en` and `en-gb` answers 200.
 *  - **T-03 / AC-3.** Out of context the row and the Menu equal main's hrefs, captured before the
 *    change (`tests/fixtures/header/out-of-context-hrefs.json`), on a full load **and** after a
 *    client-side navigation (`router.push`, proved soft by a window marker that survives), and
 *    after a client-side navigation into Poland the row is AC-1's.
 *  - **T-04 / AC-4.** No `Set-Cookie`, no `Vary` on a cookie, language or geo header, the body
 *    byte-identical across the cookie and header permutations, and each route prerendered in the
 *    build's manifest. `budget:client-js` is CI's own gate (`scripts/client-js-budget.ts`).
 *  - **T-06 / AC-6.** Every category and occasion hub answers 200, is at most three clicks from its
 *    locale home, and is linked from at least one out-of-context page that is not itself.
 *
 * The documents do not depend on the project's device, so the file runs once, in `e2e-desktop`,
 * and sets each viewport itself.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  type APIRequestContext,
  type Page,
  expect,
  test,
} from "@playwright/test";

const ROOT = join(import.meta.dirname, "..", "..");

/** Main's out-of-context hrefs, captured before the change (never regenerated from a branch). */
interface Baseline {
  readonly row: Record<string, string>;
  readonly menu: Record<string, string>;
  readonly send: string;
}
const baseline = JSON.parse(
  readFileSync(
    join(ROOT, "tests", "fixtures", "header", "out-of-context-hrefs.json"),
    "utf8",
  ),
) as Record<"en" | "en-gb", Baseline>;
const LOCALES = ["en", "en-gb"] as const;
type Locale = (typeof LOCALES)[number];
type Hrefs = Record<string, string>;

const ROW = '[data-fo-header-band="categories"] a[data-fo-header-item]';
const MENU_ITEM = "[data-fo-menu-item]";
const MENU_SUMMARY = "[data-fo-menu-summary]";

test.beforeEach(({}, testInfo) => {
  testInfo.skip(
    testInfo.project.name !== "e2e-desktop",
    "the documents do not depend on the device; the file sets both viewports itself",
  );
});

/** The design band's table: the six shop items in one destination, the rest unchanged. */
function inContext(locale: Locale, country: "poland" | "france"): Hrefs {
  const base = baseline[locale].row;
  return {
    "our-selection": `/${locale}/${country}/flowers`,
    birthday: `/${locale}/${country}/flowers/birthday-flowers`,
    sympathy: `/${locale}/${country}/flowers/sympathy-flowers`,
    occasions: base["occasions"] ?? "",
    bouquets: `/${locale}/${country}/flowers/hand-tied-bouquets`,
    roses: `/${locale}/${country}/flowers/roses`,
    plants: `/${locale}/${country}/flowers/plants`,
    destinations: base["destinations"] ?? "",
  };
}

/** AC-1's pages, per locale, with the destination each is in. */
function ac1Pages(
  locale: Locale,
): { path: string; country: "poland" | "france" }[] {
  return [
    { path: `/${locale}/poland/flowers`, country: "poland" },
    { path: `/${locale}/poland/flowers/roses`, country: "poland" },
    { path: `/${locale}/poland/product/amber-hour`, country: "poland" },
    { path: `/${locale}/send-flowers-to/poland`, country: "poland" },
    { path: `/${locale}/france/flowers`, country: "france" },
  ];
}

/** AC-3's out-of-context pages that need no catalogue lookup to name. */
function ac3Pages(locale: Locale): string[] {
  return [
    `/${locale}`,
    `/${locale}/occasions`,
    `/${locale}/send-flowers-to`,
    `/${locale}/flowers/roses`,
    `/${locale}/flowers/plants`,
    `/${locale}/flowers/hand-tied-bouquets`,
    `/${locale}/occasions/birthday`,
    `/${locale}/occasions/sympathy`,
  ];
}

async function hrefsOf(
  page: Page,
  selector: string,
  idAttribute: string,
): Promise<[string, string][]> {
  return page
    .locator(selector)
    .evaluateAll(
      (anchors, attribute) =>
        anchors.map((anchor) => [
          anchor.getAttribute(attribute) ?? "",
          anchor.getAttribute("href") ?? "",
        ]),
      idAttribute,
    );
}

/* -------------------------------------------------------------------------- */
/* Reading served HTML without a browser.                                      */
/* -------------------------------------------------------------------------- */

function attr(tag: string, name: string): string | undefined {
  return new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
}

function anchorsIn(html: string): string[] {
  return [...html.matchAll(/<a\b[^>]*>/g)].map(([tag]) => tag);
}

/** The header row's and the Menu's hrefs in a served document. */
function headerHrefsIn(html: string): string[] {
  return anchorsIn(html)
    .filter(
      (tag) =>
        attr(tag, "data-fo-header-item") !== undefined ||
        attr(tag, "data-fo-menu-item") !== undefined,
    )
    .map((tag) => attr(tag, "href") ?? "");
}

/** Every internal path a served document links, without its fragment or query. */
function internalPathsIn(html: string, locale: Locale): string[] {
  return anchorsIn(html)
    .map((tag) => (attr(tag, "href") ?? "").replace(/&amp;/g, "&"))
    .map((href) => href.split("#")[0]?.split("?")[0] ?? "")
    .filter((href) => href === `/${locale}` || href.startsWith(`/${locale}/`));
}

function manifestRoutes(): string[] | undefined {
  const file = join(ROOT, ".next", "prerender-manifest.json");
  if (!existsSync(file)) return undefined;
  return Object.keys(
    (
      JSON.parse(readFileSync(file, "utf8")) as {
        routes?: Record<string, unknown>;
      }
    ).routes ?? {},
  );
}

async function statusOf(
  request: APIRequestContext,
  path: string,
): Promise<number> {
  return (await request.get(path, { maxRedirects: 0 })).status();
}

/* -------------------------------------------------------------------------- */
/* T-01 / AC-1                                                                 */
/* -------------------------------------------------------------------------- */

test.describe("in context, the row links the destination's own pages (AC-1, T-01)", () => {
  test.use({ javaScriptEnabled: false });

  for (const locale of LOCALES) {
    for (const { path, country } of ac1Pages(locale)) {
      test(`${path}: the row at 1440 × 900`, async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        expect((await page.goto(path))?.status()).toBe(200);
        expect(await hrefsOf(page, ROW, "data-fo-header-item")).toEqual(
          Object.entries(inContext(locale, country)),
        );
        await expect(page.locator(ROW).first()).toBeVisible();
        await expect(
          page.locator('[data-fo-header] a[href$="#send"]').first(),
        ).toHaveAttribute("href", baseline[locale].send);
      });

      test(`${path}: the Menu at 390 × 844`, async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        expect((await page.goto(path))?.status()).toBe(200);
        // A `<details>`: it opens with no script.
        await page.locator(MENU_SUMMARY).click();
        await expect(page.locator(MENU_ITEM).first()).toBeVisible();
        expect(await hrefsOf(page, MENU_ITEM, "data-fo-menu-item")).toEqual(
          Object.entries(inContext(locale, country)),
        );
      });
    }
  }
});

/* -------------------------------------------------------------------------- */
/* T-03 / AC-3                                                                 */
/* -------------------------------------------------------------------------- */

test.describe("out of context, the row keeps main's hrefs (AC-3, T-03)", () => {
  test.use({ javaScriptEnabled: false });

  for (const locale of LOCALES) {
    for (const path of ac3Pages(locale)) {
      test(`${path}: row and Menu equal main's`, async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        expect((await page.goto(path))?.status()).toBe(200);
        expect(await hrefsOf(page, ROW, "data-fo-header-item")).toEqual(
          Object.entries(baseline[locale].row),
        );
        expect(await hrefsOf(page, MENU_ITEM, "data-fo-menu-item")).toEqual(
          Object.entries(baseline[locale].menu),
        );
      });
    }
  }

  test("a 404 page draws no header row, as on main", async ({ page }) => {
    const response = await page.goto("/en/no-such-page-at-all");
    expect(response?.status()).toBe(404);
    await expect(page.locator(ROW)).toHaveCount(0);
    await expect(page.locator(MENU_ITEM)).toHaveCount(0);
  });
});

test.describe("after a client-side navigation the row is the shown route's (AC-3, T-03)", () => {
  /** Navigate without a document load, and wait for the new route's `<main>` to be the one shown. */
  async function softNavigate(page: Page, path: string): Promise<void> {
    await page.evaluate((target) => {
      const next = (
        window as unknown as {
          next?: { router?: { push: (href: string) => void } };
        }
      ).next;
      if (next?.router === undefined) throw new Error("no window.next.router");
      next.router.push(target);
    }, path);
    await page.waitForURL((url) => url.pathname === path);
    await page.waitForLoadState("networkidle");
  }

  async function markerSurvives(page: Page): Promise<boolean> {
    return page.evaluate(
      () => (window as unknown as { __foSoftNav?: number }).__foSoftNav === 288,
    );
  }

  test("Poland → home → birthday hub, then home → Poland", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/en/poland/flowers");
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => {
      (window as unknown as { __foSoftNav?: number }).__foSoftNav = 288;
    });
    expect(await hrefsOf(page, ROW, "data-fo-header-item")).toEqual(
      Object.entries(inContext("en", "poland")),
    );

    await softNavigate(page, "/en");
    expect(await markerSurvives(page)).toBe(true);
    await expect
      .poll(() => hrefsOf(page, ROW, "data-fo-header-item"))
      .toEqual(Object.entries(baseline.en.row));
    expect(await hrefsOf(page, MENU_ITEM, "data-fo-menu-item")).toEqual(
      Object.entries(baseline.en.menu),
    );

    await softNavigate(page, "/en/occasions/birthday");
    expect(await markerSurvives(page)).toBe(true);
    await expect
      .poll(() => hrefsOf(page, ROW, "data-fo-header-item"))
      .toEqual(Object.entries(baseline.en.row));

    await softNavigate(page, "/en");
    await softNavigate(page, "/en/poland/flowers");
    expect(await markerSurvives(page)).toBe(true);
    await expect
      .poll(() => hrefsOf(page, ROW, "data-fo-header-item"))
      .toEqual(Object.entries(inContext("en", "poland")));
    expect(await hrefsOf(page, MENU_ITEM, "data-fo-menu-item")).toEqual(
      Object.entries(inContext("en", "poland")),
    );
  });
});

/* -------------------------------------------------------------------------- */
/* T-02 / AC-2                                                                 */
/* -------------------------------------------------------------------------- */

test.describe("no header or Menu link answers other than 200 (AC-2, T-02)", () => {
  test.describe.configure({ timeout: 300_000 });

  test("over the crawl set and every in-context page of en and en-gb", async ({
    request,
  }) => {
    const routes = manifestRoutes();
    test.skip(routes === undefined, "needs the build's prerender manifest");
    const countrySlugs = new Set([
      "poland",
      "germany",
      "france",
      "spain",
      "italy",
      "romania",
      "netherlands",
    ]);
    const pages = new Set<string>(["/", "/en", "/en-gb"]);
    const productRead = new Set<string>();
    for (const locale of LOCALES) {
      for (const route of routes ?? []) {
        const parts = route.split("/").filter(Boolean);
        if (parts[0] !== locale) continue;
        // In context: a country shop page (`/{locale}/{country}/…`), or a guide.
        if (
          countrySlugs.has(parts[1] ?? "") ||
          (parts[1] === "send-flowers-to" && parts.length === 3)
        ) {
          pages.add(route);
        }
        // The product pages are prebuilt under their internal route, hundreds of them, and the
        // header of each is its destination's (`tests/unit/header-slot.test.tsx`): one per
        // (locale, destination) is read here, at its public address.
        const country = parts[2] ?? "";
        if (
          parts[1] === "-product" &&
          countrySlugs.has(country) &&
          !productRead.has(`${locale}:${country}`)
        ) {
          productRead.add(`${locale}:${country}`);
          pages.add(`/${[locale, ...parts.slice(2)].join("/")}`);
        }
      }
    }
    expect(pages.size).toBeGreaterThan(20);

    const hrefs = new Set<string>();
    const unread: string[] = [];
    for (const path of pages) {
      const response = await request.get(path);
      if (response.status() !== 200) {
        unread.push(`${path} → ${String(response.status())}`);
        continue;
      }
      for (const href of headerHrefsIn(await response.text())) hrefs.add(href);
    }
    expect(unread).toEqual([]);
    // The two locales' header targets, and each destination's own pages, are in the set.
    expect(hrefs.has("/en/poland/flowers/roses")).toBe(true);
    expect(hrefs.has("/en-gb/france/flowers/roses")).toBe(true);

    const broken: string[] = [];
    for (const href of hrefs) {
      const status = await statusOf(request, href);
      if (status !== 200) broken.push(`${href} → ${String(status)}`);
    }
    expect(broken).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* T-04 / AC-4                                                                 */
/* -------------------------------------------------------------------------- */

const VARIANTS: readonly { name: string; headers: Record<string, string> }[] = [
  { name: "no cookie, no negotiation header", headers: {} },
  {
    name: "fo_locale, fo_currency and fo_consent cookies",
    headers: {
      cookie:
        "fo_locale=de; fo_currency=PLN; fo_consent=%7B%22v%22%3A1%2C%22a%22%3Afalse%7D",
    },
  },
  {
    name: "Accept-Language and cf-ipcountry",
    headers: { "Accept-Language": "pl-PL,pl;q=0.9", "cf-ipcountry": "PL" },
  },
];

test.describe("the pages stay static and the same for everyone (AC-4, T-04)", () => {
  const paths = LOCALES.flatMap((locale) => [
    ...ac1Pages(locale).map(({ path }) => path),
    ...ac3Pages(locale),
  ]);

  for (const path of paths) {
    test(`${path}: no Set-Cookie, no Vary on a request header, one body`, async ({
      request,
    }) => {
      const bodies: string[] = [];
      for (const variant of VARIANTS) {
        const response = await request.get(path, {
          headers: variant.headers,
          maxRedirects: 0,
        });
        expect(response.status(), variant.name).toBe(200);
        expect(response.headers()["set-cookie"], variant.name).toBeUndefined();
        const vary = (response.headers()["vary"] ?? "").toLowerCase();
        for (const forbidden of [
          "cookie",
          "accept-language",
          "cf-ipcountry",
          "user-agent",
        ]) {
          expect(vary, `${variant.name}: ${forbidden}`).not.toContain(
            forbidden,
          );
        }
        bodies.push(await response.text());
      }
      expect(bodies[1]).toBe(bodies[0]);
      expect(bodies[2]).toBe(bodies[0]);
    });
  }

  test("every one of those routes is prerendered in the build", () => {
    const routes = manifestRoutes();
    test.skip(routes === undefined, "needs the build's prerender manifest");
    const prerendered = new Set(routes);
    const missing = paths.filter((path) => {
      // A product address is served from its internal route (`src/lib/product-rewrites.ts`).
      const product = /^\/([^/]+)\/([^/]+)\/product\/([^/]+)$/.exec(path);
      const internal =
        product === null
          ? undefined
          : `/${product[1] ?? ""}/-product/${product[2] ?? ""}/product/${product[3] ?? ""}`;
      return (
        !prerendered.has(path) &&
        (internal === undefined || !prerendered.has(internal))
      );
    });
    expect(missing).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* T-06 / AC-6                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The category hubs that **main** already leaves unlinked (found by this crawl on TASK-288's
 * first build, 2026-10-21; escalated in `docs/tasks/TASK-288.md` `## Escalations`): no page of the
 * site links them except their own language alternates, so they are at no depth from any home,
 * on main as on this branch. This task moves no link to or from them (the header never named
 * them), so the crawl pins them by slug instead of failing on them, and any **other** hub that
 * loses its reachability or its last out-of-context link still turns the case red. The pin is a
 * subset, not an equality: the day a later task links them, nothing here has to change.
 */
const ORPHAN_CATEGORY_HUBS_ON_MAIN: ReadonlySet<string> = new Set([
  "anniversary-flowers",
  "arrangements",
  "birthday-flowers",
  "congratulations-flowers",
  "flowers-and-gift-sets",
  "funeral-and-sympathy-flowers",
  "gerberas",
  "get-well-flowers",
  "just-because-flowers",
  "lilies",
  "mixed-flowers",
  "new-baby-flowers",
  "orchids",
  "peonies",
  "romantic-flowers",
  "sorry-flowers",
  "sunflowers",
  "sympathy-flowers",
  "thank-you-flowers",
  "tulips",
]);

function isKnownOrphan(locale: Locale, hub: string): boolean {
  const slug = hub.slice(`/${locale}/flowers/`.length);
  return (
    hub.startsWith(`/${locale}/flowers/`) &&
    ORPHAN_CATEGORY_HUBS_ON_MAIN.has(slug)
  );
}

test.describe("every hub stays reachable and linked out of context (AC-6, T-06)", () => {
  test.describe.configure({ timeout: 300_000 });

  for (const locale of LOCALES) {
    test(`${locale}: each hub answers 200, is ≤ 3 clicks from /${locale} and has an out-of-context inbound link`, async ({
      request,
    }) => {
      const routes = manifestRoutes();
      test.skip(routes === undefined, "needs the build's prerender manifest");
      const hubs = (routes ?? []).filter((route) =>
        new RegExp(`^/${locale}/(flowers|occasions)/[^/]+$`).test(route),
      );
      expect(hubs.length).toBeGreaterThan(5);
      for (const hub of hubs)
        expect(await statusOf(request, hub), hub).toBe(200);

      const cache = new Map<string, string[]>();
      async function linksOf(path: string): Promise<string[]> {
        const cached = cache.get(path);
        if (cached !== undefined) return cached;
        const response = await request.get(path);
        const links =
          response.status() === 200
            ? internalPathsIn(await response.text(), locale)
            : [];
        cache.set(path, links);
        return links;
      }

      // Breadth first from the home, three clicks deep, stopping once every hub is seen.
      const unseen = new Set(hubs);
      let frontier = [`/${locale}`];
      const seen = new Set(frontier);
      for (let depth = 1; depth <= 3 && unseen.size > 0; depth += 1) {
        const next: string[] = [];
        for (const path of frontier) {
          for (const link of await linksOf(path)) {
            unseen.delete(link);
            if (!seen.has(link)) {
              seen.add(link);
              next.push(link);
            }
          }
          if (unseen.size === 0) break;
        }
        frontier = next;
      }
      expect([...unseen].filter((hub) => !isKnownOrphan(locale, hub))).toEqual(
        [],
      );
      // The five hubs the header names out of context: one click from the home, as on main.
      const headerHubs = ["birthday", "sympathy", "bouquets", "roses", "plants"]
        .map((id) => baseline[locale].row[id] ?? "")
        .filter((href) => hubs.includes(href));
      expect(headerHubs).toHaveLength(5);
      for (const hub of headerHubs) {
        expect((await linksOf(`/${locale}`)).includes(hub), hub).toBe(true);
      }

      // Out-of-context pages: the home, the destinations hub, the occasions index and the hubs.
      const outOfContext = [
        `/${locale}`,
        `/${locale}/send-flowers-to`,
        `/${locale}/occasions`,
        ...hubs,
      ];
      const orphans: string[] = [];
      for (const hub of hubs) {
        let linked = false;
        for (const page of outOfContext) {
          if (page === hub) continue;
          if ((await linksOf(page)).includes(hub)) {
            linked = true;
            break;
          }
        }
        if (!linked) orphans.push(hub);
      }
      expect(orphans.filter((hub) => !isKnownOrphan(locale, hub))).toEqual([]);
    });
  }
});
