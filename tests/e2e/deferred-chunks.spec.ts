/**
 * T-60, the e2e half (spec 004 §14 A-founder-2026-10-15b, AC-55; TASK-244): on every audited URL,
 * no chunk of the deferred set starts before the page's largest contentful paint, and a tap
 * before the islands have loaded still works.
 *
 * **How a chunk is found.** Each deferred island's `marker` (`src/modules/ui/deferred/deferredSet.ts`)
 * is a literal written in the island's module and in no other client module
 * (`tests/unit/deferred-set.test.tsx`). So the chunk that carries an island is the script response
 * whose body contains its marker. An island imported eagerly again puts its marker into a chunk
 * the document requests at once, which starts before the LCP: T-60's red case.
 *
 * **What is measured.** Lighthouse's mobile profile (`lighthouserc.json`: 412 × 823 at 1.75,
 * Slow 4G and a 4× CPU slowdown), applied here through the DevTools protocol, with no cookie, as
 * Lighthouse loads the page (so the first-visit popup opens, as it does in the audit). The LCP is
 * the last `largest-contentful-paint` entry before any input.
 *
 *  - An island with `trigger: "paint"` (the popup; the motions, which carry the Menu's `Esc`) must
 *    load by itself, and its chunk's resource-timing `startTime` must be later than the LCP's (its
 *    render time). Red with the motion module imported eagerly again (spec 004 §14
 *    A-founder-2026-10-19a, T-60 amended): its chunk then starts before the LCP.
 *  - An island with `trigger: "interaction"` (the sentence) must not be
 *    requested at all by a page load nobody touches, the popup's own focus included. After the
 *    first interaction with its control it loads, and its chunk starts after the LCP too.
 *
 * The URL set is `tests/fixtures/seo/lighthouse-urls.json`, the one the `lighthouse` job audits.
 */
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import { type Page, type Route, expect, test } from "@playwright/test";

import {
  parseClientReferences,
  parseScriptTags,
} from "../../scripts/client-js-budget.ts";
import {
  DEFERRED_ISLANDS,
  type DeferredIslandId,
} from "../../src/modules/ui/deferred/deferredSet.ts";
import { lazyChunksCarrying } from "../support/consent.ts";

const URLS = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, "../fixtures/seo/lighthouse-urls.json"),
    "utf8",
  ),
) as string[];

/** `lighthouserc.json` → `collect.settings.screenEmulation`. */
const LIGHTHOUSE_VIEWPORT = { width: 412, height: 823 } as const;

/** Lighthouse's mobile throttling (Slow 4G, 4× CPU), as DevTools applies it. */
const SLOW_4G = {
  offline: false,
  latency: 150,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
} as const;
const CPU_SLOWDOWN = 4;

const ACTIVE = DEFERRED_ISLANDS.filter(
  (island) => island.status === "deferred",
);
const markerOf = (id: DeferredIslandId): string =>
  ACTIVE.find((island) => island.id === id)?.marker ?? `missing:${id}`;
const LOCALE_HOMES = new Set(["/en", "/en-gb", "/de", "/pl"]);

const SCRIPT = /\/_next\/static\/.+\.js(?:\?|$)/u;

/**
 * Clause 9 (spec 004 §14 A-founder-2026-10-19d): the language popup island's chunk, named by the
 * file the build output records for it — the lazy chunk a Turbopack loader stub requests whose
 * bytes carry the island's marker (`lazyChunksCarrying`; `React.lazy` writes no
 * `react-loadable-manifest.json` since TASK-376) — after asserting exactly one exists and is
 * non-empty, so a wrong marker cannot pass as "never requested".
 */
function popupChunkFile(): string {
  const dist = resolve(import.meta.dirname, "../../.next");
  const carrying = lazyChunksCarrying(markerOf("language-popup"), dist);
  expect(carrying).toHaveLength(1);
  expect(statSync(resolve(dist, carrying[0]!)).size).toBeGreaterThan(0);
  return carrying[0]!;
}

interface Measured {
  readonly lcp: { startTime: number; tag: string } | null;
  readonly resources: { name: string; startTime: number }[];
}

async function throttle(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", SLOW_4G);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_SLOWDOWN });
}

async function measure(page: Page): Promise<Measured> {
  return page.evaluate((): Measured => {
    const lcp = (
      window as unknown as { __foLcp: { startTime: number; tag: string }[] }
    ).__foLcp;
    return {
      lcp: lcp.at(-1) ?? null,
      resources: performance
        .getEntriesByType("resource")
        .map((entry) => ({ name: entry.name, startTime: entry.startTime })),
    };
  });
}

test.describe("no deferred chunk starts before the LCP (AC-55, T-60)", () => {
  test.use({
    viewport: LIGHTHOUSE_VIEWPORT,
    deviceScaleFactor: 1.75,
    // Lighthouse loads the page with no cookie: the first-visit popup opens there, so here too.
    storageState: { cookies: [], origins: [] },
  });

  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "e2e-mobile",
      "Lighthouse's mobile profile: run once, in e2e-mobile",
    );
  });

  test("the URL set is the lighthouse job's, and the set has islands of both kinds to check", () => {
    expect(URLS).toContain("/en");
    expect(URLS).toContain("/en-gb");
    expect(URLS).toContain("/de");
    expect(URLS).toContain("/pl");
    expect(
      ACTIVE.map((island) => `${island.id}:${String(island.trigger)}`),
    ).toEqual([
      "motions:paint",
      "language-popup:paint",
      "home-sentence:interaction",
    ]);
  });

  for (const url of URLS) {
    test(`${url}: every deferred chunk starts after the LCP render time`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(90_000);
      await page.addInitScript(() => {
        const entries: { startTime: number; tag: string }[] = [];
        (window as unknown as { __foLcp: typeof entries }).__foLcp = entries;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const element = (entry as unknown as { element?: Element }).element;
            entries.push({
              startTime: entry.startTime,
              tag: element?.tagName ?? "",
            });
          }
        }).observe({ type: "largest-contentful-paint", buffered: true });
      });

      const bodies: Promise<{ url: string; body: string }>[] = [];
      page.on("response", (response) => {
        if (!SCRIPT.test(response.url())) return;
        bodies.push(
          response
            .text()
            .then((body) => ({ url: response.url(), body }))
            .catch(() => ({ url: response.url(), body: "" })),
        );
      });

      await throttle(page);
      const response = await page.goto(url, { waitUntil: "load" });
      expect(response?.status()).toBe(200);

      // The motions load by themselves (after the paint): the module marks `<html>` when it runs.
      // The popup does not load at all: on the committed registry no page offers another language
      // (spec 003 §14 A-founder-2026-10-19d; T-60 as spec 004 §14 19d amends it, below).
      await expect(page.locator("html[data-fo-motion]")).toHaveCount(1, {
        timeout: 60_000,
      });
      // Let anything else the load would fetch arrive before reading the untouched page.
      await page.waitForLoadState("networkidle");
      const untouched = await Promise.all(bodies);
      const atRest = await measure(page);

      expect(atRest.lcp, "a largest-contentful-paint entry").not.toBeNull();
      const lcpAt = atRest.lcp?.startTime ?? Number.POSITIVE_INFINITY;

      // The interaction islands, and the popup on the committed registry: not one byte of them on
      // a load nobody touched.
      for (const id of ["home-sentence", "language-popup"] as const) {
        expect
          .soft(
            untouched
              .filter((script) => script.body.includes(markerOf(id)))
              .map((script) => script.url),
            `${url}: ${id} was requested by a page load nobody touched`,
          )
          .toEqual([]);
      }

      // The first interaction with its control loads each interaction island. The sentence's was
      // the home's; the v3 home draws no sentence (TASK-386), so no audited page has one today.
      const interaction: readonly DeferredIslandId[] = [];
      await page.waitForFunction(
        (marks) =>
          marks.every((mark) => performance.getEntriesByName(mark).length > 0),
        interaction.map(markerOf),
        { timeout: 30_000 },
      );
      const after = await measure(page);
      const scripts = await Promise.all(bodies);

      // T-60 (spec 004 §14 A-founder-2026-10-19d): the popup's chunk has no resource-timing
      // entry on any audited URL, even after the interactions; clause 9's existence check on that
      // chunk is the build-output describe at the end of this file.
      const popupFile = popupChunkFile();
      expect(
        after.resources
          .map((entry) => entry.name)
          .filter((name) => new URL(name).pathname === `/_next/${popupFile}`),
        `${url}: the language popup's chunk ${popupFile} was requested`,
      ).toEqual([]);

      for (const id of ["motions", ...interaction] as const) {
        const marker = markerOf(id);
        const chunks = scripts
          .filter((script) => script.body.includes(marker))
          .map((script) => script.url);
        expect(
          chunks.length,
          `${id}: the chunk carrying "${marker}"`,
        ).toBeGreaterThan(0);
        for (const chunk of chunks) {
          const timing = after.resources.find((entry) => entry.name === chunk);
          expect(timing, `${chunk} has a resource-timing entry`).toBeDefined();
          testInfo.annotations.push({
            type: "T-60",
            description: `${id}: chunk start ${String(Math.round(timing?.startTime ?? -1))} ms, LCP (${String(atRest.lcp?.tag)}) ${String(Math.round(lcpAt))} ms`,
          });
          // Soft: every island of the page reports, not only the first one late.
          expect
            .soft(
              timing?.startTime ?? Number.NEGATIVE_INFINITY,
              `${url}: ${id}'s chunk ${chunk} started at ${String(timing?.startTime)} ms, the LCP (${String(atRest.lcp?.tag)}) rendered at ${String(lcpAt)} ms`,
            )
            .toBeGreaterThan(lcpAt);
        }
      }
    });
  }
});

/**
 * Holds every script whose body carries a deferred island's marker until `release()`: the island
 * has not loaded, whatever the clock says, so a tap now is a tap "before idle".
 */
async function holdDeferredChunks(
  page: Page,
): Promise<{ release: () => void }> {
  let release: () => void = () => undefined;
  const released = new Promise<void>((resolveRelease) => {
    release = resolveRelease;
  });
  const marks = ACTIVE.map((island) => island.marker);
  await page.route(SCRIPT, async (route: Route) => {
    const response = await route.fetch();
    const body = await response.text();
    if (marks.some((mark) => body.includes(mark))) await released;
    await route.fulfill({ response, body });
  });
  return { release };
}

async function islandsLoaded(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    performance
      .getEntriesByType("mark")
      .map((mark) => mark.name)
      .filter((name) => name.startsWith("fo:deferred:")),
  );
}

test.describe("a tap before the islands load still works (clause 3)", () => {
  test("phone: Menu opens, its language link navigates, and Esc works once the island lands", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "e2e-mobile", "the phone Menu");
    await page.setViewportSize({ width: 390, height: 844 });
    const hold = await holdDeferredChunks(page);
    await page.goto("/en-gb", { waitUntil: "load" });

    await page.locator("[data-fo-menu-summary]").click();
    await expect(page.locator("[data-fo-menu][open]")).toHaveCount(1);
    expect(await islandsLoaded(page)).toEqual([]);

    // The island arrives: the motion module, which carries the Menu's `Esc`. The tap above is a
    // first interaction, so it asked for it at once (`whenReady()` with no control).
    hold.release();
    await expect
      .poll(async () => islandsLoaded(page))
      .toContain("fo:deferred:motions");
    // The module has run: it adds its `Esc` listener before it marks `<html>`.
    await expect(page.locator("html[data-fo-motion]")).toHaveCount(1);
    await page.locator("[data-fo-menu-item]").first().focus();
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-fo-menu][open]")).toHaveCount(0);
  });

  test("phone: the language link inside the Menu navigates before any island has loaded", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "e2e-mobile", "the phone Menu");
    await page.setViewportSize({ width: 390, height: 844 });
    await holdDeferredChunks(page);
    await page.goto("/en-gb", { waitUntil: "load" });

    await page.locator("[data-fo-menu-summary]").click();
    const link = page.locator("[data-fo-menu-switcher] nav a").first();
    const href = await link.getAttribute("href");
    expect(href).toMatch(/^\/en(?:\/|$)/u);
    expect(await islandsLoaded(page)).toEqual([]);
    // The held chunks are abandoned by the navigation: stop holding without failing on them.
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await link.click();
    await expect(page).toHaveURL(
      new RegExp(`${(href ?? "").replace(/[/]/gu, "\\/")}$`, "u"),
    );
  });

  test("desktop: the header's language link navigates before any island has loaded", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "e2e-desktop", "the desktop strip");
    await page.setViewportSize({ width: 1440, height: 900 });
    await holdDeferredChunks(page);
    await page.goto("/en-gb", { waitUntil: "load" });

    const link = page.locator("[data-fo-header-switcher] nav a").first();
    const href = await link.getAttribute("href");
    expect(href).toMatch(/^\/en(?:\/|$)/u);
    expect(await islandsLoaded(page)).toEqual([]);
    // The held chunks are abandoned by the navigation: stop holding without failing on them.
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await link.click();
    await expect(page).toHaveURL(
      new RegExp(`${(href ?? "").replace(/[/]/gu, "\\/")}$`, "u"),
    );
  });
});

/**
 * T-60 as spec 004 §14 A-founder-2026-10-19d amends it, the build-output half (AC-55's popup
 * bullet; TASK-279): the language popup island's module is in **no route's initial chunk set**.
 * Read from the build the suite runs against (`.next` in the checkout), not from a browser: the
 * initial set of a locale document is its `<script src>` list and the chunks of every client
 * reference its flight payload names (`parseScriptTags`, `parseClientReferences`, the parsers
 * `pnpm budget:client-js` uses). Clause 9's positive control first: the popup's chunk is resolved
 * from the lazy chunks the build's loader stubs request (`lazyChunksCarrying`; no
 * `react-loadable-manifest.json` since TASK-376) by its marker and must exist, non-empty,
 * so a wrong marker cannot pass as "absent". Red when `LanguagePopupLoader` imports the island
 * statically: its marker then rides in the loader's chunk, which the flight payload names.
 *
 * The other half, "no resource-timing entry for the popup's chunk on any audited URL", needs the
 * popup never to open on the committed registry: spec 003 §14 A-founder-2026-10-19d, TASK-280.
 */
test.describe("T-60: the popup island is in no initial chunk set (build output)", () => {
  const DIST = resolve(import.meta.dirname, "../../.next");
  const MARKER = markerOf("language-popup");
  const read = (asset: string): string =>
    readFileSync(resolve(DIST, asset), "utf8");

  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "e2e-desktop",
      "reads the build output once",
    );
  });

  test("the popup's deferred chunk exists in the build output (clause 9)", () => {
    const carrying = lazyChunksCarrying(MARKER, DIST);
    expect(carrying).toHaveLength(1);
    expect(statSync(resolve(DIST, carrying[0]!)).size).toBeGreaterThan(0);
  });

  for (const url of URLS.filter((candidate) => LOCALE_HOMES.has(candidate))) {
    test(`${url}: no chunk of the initial set carries the popup island`, () => {
      const html = read(`server/app${url}.html`);
      const initial = new Set([
        ...parseScriptTags(html).map((tag) => tag.asset),
        ...parseClientReferences(html).flatMap((reference) => reference.chunks),
      ]);
      expect(initial.size).toBeGreaterThan(0);
      expect(
        [...initial].filter((asset) => read(asset).includes(MARKER)),
      ).toEqual([]);
    });
  }
});
