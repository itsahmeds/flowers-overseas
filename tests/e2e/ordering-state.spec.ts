/**
 * **Poland reads "Ordering opens soon", served** — the e2e halves of spec 007 §14
 * A-founder-2026-10-14c (founder ruling D2 A; TASK-239): T-34 (AC-33) and T-35 (AC-34). The unit
 * halves, with the Poland-open fixture, are `tests/unit/ordering-state.test.tsx`.
 *
 * **AC-34, the crawl.** With today's data (no country open), the built HTML of every prerendered
 * document in the four launch locales (`.next/prerender-manifest.json`: the homes, the
 * destinations hub, every guide and every listing), every product page in
 * `tests/fixtures/shop/product-urls.json` (all seven destinations, four locales), and every page
 * the four homes link to (spec 004 AC-14's crawl set), contains no value of a cutoff key (clause
 * 4's list, in every catalogue), no "Order by" and no time of day followed by a zone name. "Built
 * HTML" is the document a crawler indexes: its markup, the `<head>` and every JSON-LD block. The
 * framework's own `<script>` payloads are cut out first: they are not rendered, and they repeat
 * message values a page passes to its islands. A planted cutoff proves the read can fail.
 *
 * **AC-33, the surfaces.** The home and the destinations hub in four locales at 1440 and 390, every
 * guide, and the product page for Poland and for Germany: every country state line reads
 * "Ordering opens soon" in `en` and `en-gb`, none of the four old phrasings renders, and the home
 * finder lists every country, selectable, with "soon" beside its name.
 *
 * Both run once, in `e2e-desktop`: the crawl reads raw HTML, and the surface checks set their own
 * two viewports.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  type APIRequestContext,
  type Page,
  type TestInfo,
  expect,
  test,
} from "@playwright/test";

import { COUNTRIES } from "../../src/config/countries.ts";
import { localePath } from "../../src/modules/i18n/routing.ts";

const LOCALES = ["en", "en-gb", "de", "pl"] as const;
/** The two locales with authored guides (spec 007 §13 Q1). */
const GUIDE_LOCALES = ["en", "en-gb"] as const;
const ROOT = join(import.meta.dirname, "..", "..");

const SOON = "Ordering opens soon";
/** AC-33's four old phrasings. */
const OLD = [
  "not delivering yet",
  "Guide · not delivering yet",
  "Delivering now",
  "Ordering is not open yet",
] as const;

const DESKTOP = { width: 1440, height: 900 } as const;
const PHONE = { width: 390, height: 844 } as const;

/* -------------------------------------------------------------------------- */
/* The patterns.                                                              */
/* -------------------------------------------------------------------------- */

/** Clause 4's cutoff keys (spec 003 §14 A15 clause 4, as spec 007 restates it). */
const CUTOFF_KEYS = [
  "nav.utility.cutoff",
  "nav.utility.cutoffShort",
  "faq.whoDelivers.answerCutoff",
  "delivery.picker.live",
  "home.dates.orderBy",
] as const;

function catalogue(locale: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(ROOT, "messages", `${locale}.json`), "utf8"),
  ) as Record<string, unknown>;
}

function leaf(tree: Record<string, unknown>, key: string): string | undefined {
  let node: unknown = tree;
  for (const part of key.split(".")) {
    node = (node as Record<string, unknown> | undefined)?.[part];
  }
  return typeof node === "string" ? node : undefined;
}

/** A catalogue value as a pattern: literal text, each `{argument}` any short run of text. */
function valuePattern(value: string): RegExp {
  const parts = value
    .split(/\{[^}]*\}/u)
    .map((part) =>
      part
        .replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&")
        .replaceAll(/\s+/gu, "\\s+"),
    );
  return new RegExp(parts.join("[^<>]{1,40}?"), "u");
}

interface Pattern {
  readonly name: string;
  readonly pattern: RegExp;
}

/** Every cutoff key's value in every launch catalogue (`en-gb` inherits what it does not set). */
const CUTOFF_VALUES: readonly Pattern[] = (() => {
  const seen = new Set<string>();
  const patterns: Pattern[] = [];
  for (const locale of LOCALES) {
    const own = catalogue(locale);
    for (const key of CUTOFF_KEYS) {
      const value = leaf(own, key);
      if (value === undefined || seen.has(value)) continue;
      seen.add(value);
      patterns.push({ name: `${locale} ${key}`, pattern: valuePattern(value) });
    }
  }
  return patterns;
})();

/** Zone names a cutoff would print: the seven destinations' zone cities in four languages, and abbreviations. */
const ZONE_NAMES =
  "Warsaw|Warszaw\\w*|Warschau|Varsovie|Berlin\\w*|Paris|Pary\\w+|Madrid\\w*|Rome|Rom|Roma|Rzym\\w*|Bucharest|Bukarest|Bukareszt\\w*|Amsterdam\\w*|CES?T|EES?T|UTC|GMT|BST|Europe/[A-Z][a-z_]+";

const PATTERNS: readonly Pattern[] = [
  ...CUTOFF_VALUES,
  { name: "Order by", pattern: /\border by\b/iu },
  {
    name: "order-by (de, pl)",
    pattern:
      /\bbestellen sie bis\b|\bzam(?:ó|o)w do\b|\bbis \d{1,2}[:.]\d{2} uhr\b/iu,
  },
  {
    name: "time of day followed by a zone name",
    pattern: new RegExp(
      `\\b\\d{1,2}[:.]\\d{2}(?:\\s*Uhr)?[\\s,]+(?:(?:in|im|w|we|à|a|en)\\s+)?(?:${ZONE_NAMES})\\b`,
      "u",
    ),
  },
];

/** The document a crawler indexes: framework scripts and styles out, JSON-LD kept, entities read. */
function indexedText(html: string): string {
  return html
    .replaceAll(
      /<script(?![^>]*application\/ld\+json)[^>]*>[\s\S]*?<\/script>/giu,
      " ",
    )
    .replaceAll(/<style[^>]*>[\s\S]*?<\/style>/giu, " ")
    .replaceAll(/<[^>]+>/gu, " ")
    .replaceAll("&#x27;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&")
    .replaceAll("&nbsp;", " ")
    .replaceAll(/\s+/gu, " ");
}

/**
 * **The one excused "Order by"**: the guide's delivery-facts row in its honest-blank form, the
 * label with "None yet." (spec 007 §5.3: the facts-unknown form keeps every label and prints the
 * blank in words). It states that there is no cutoff, which is the opposite of an order-by
 * promise; whether AC-34's "no 'Order by' text" also removes this label is escalated in
 * `docs/tasks/TASK-239.md`. Cut out by its exact words, so any other "Order by" still fails.
 */
const EXCUSED_GUIDE_ROW: readonly string[] = (() => {
  const en = catalogue("en");
  const label = leaf(en, "corridor.facts.orderBy.label");
  const none = leaf(en, "corridor.facts.orderBy.none");
  return label === undefined || none === undefined ? [] : [`${label} ${none}`];
})();

/**
 * **Escalated, not accepted** (TASK-239 brief, Escalations 3): two sentences of the authored hub
 * copy in `seed/data/copy/en/` (the `birthday-flowers` and `sorry-flowers` category hubs, the
 * `easter` and `i-am-sorry` occasion hubs, `en` and `en-gb`) promise an order-by cutoff while no
 * country is open. Catalogue copy is spec 006's and the founder's; this crawl names the two exact
 * sentences so it stays a gate for everything else, and the brief carries the copy decision.
 */
const ESCALATED_HUB_COPY: readonly string[] = [
  "Order by the cutoff shown for the destination and it arrives on the date you pick.",
  "The destination page shows this year's date and the cutoff to order by.",
];

const EXCUSED: readonly string[] = [
  ...EXCUSED_GUIDE_ROW,
  ...ESCALATED_HUB_COPY,
];

function offences(path: string, html: string): string[] {
  let text = indexedText(html);
  for (const excused of EXCUSED) text = text.replaceAll(excused, " ");
  return PATTERNS.flatMap(({ name, pattern }) => {
    const match = pattern.exec(text);
    return match === null ? [] : [`${path}: ${name}: "${match[0]}"`];
  });
}

/* -------------------------------------------------------------------------- */
/* The documents.                                                             */
/* -------------------------------------------------------------------------- */

function manifestPaths(): readonly string[] {
  const manifest = JSON.parse(
    readFileSync(join(ROOT, ".next", "prerender-manifest.json"), "utf8"),
  ) as { routes?: Record<string, unknown> };
  return Object.keys(manifest.routes ?? {}).filter((path) =>
    (LOCALES as readonly string[]).includes(path.split("/")[1] ?? ""),
  );
}

function productPaths(): readonly string[] {
  const byLocale = JSON.parse(
    readFileSync(
      join(ROOT, "tests", "fixtures", "shop", "product-urls.json"),
      "utf8",
    ),
  ) as Readonly<Record<string, readonly string[]>>;
  return LOCALES.flatMap((locale) => byLocale[locale] ?? []);
}

function guidePaths(): readonly string[] {
  return GUIDE_LOCALES.flatMap((locale) =>
    COUNTRIES.map((country) =>
      localePath(
        locale,
        "destinations",
        (country.slugs as Record<string, string>)[locale] ?? "",
      ),
    ),
  );
}

/** Every internal `href` of a document, as a path. */
function internalHrefs(html: string): readonly string[] {
  return [...html.matchAll(/<a\b[^>]*\bhref="(\/[^"#?]*)/gu)].map(
    (match) => match[1] ?? "",
  );
}

async function fetchAll(
  request: APIRequestContext,
  paths: readonly string[],
): Promise<readonly { path: string; status: number; html: string }[]> {
  const results: { path: string; status: number; html: string }[] = [];
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < paths.length) {
      const path = paths[next];
      next += 1;
      if (path === undefined) continue;
      const response = await request.get(path, { maxRedirects: 0 });
      results.push({
        path,
        status: response.status(),
        html: response.status() === 200 ? await response.text() : "",
      });
    }
  };
  await Promise.all(Array.from({ length: 12 }, worker));
  return results;
}

test.describe("AC-34 (T-35): no cutoff or order-by text in any built document while no country is open", () => {
  test.describe.configure({ mode: "serial", timeout: 600_000 });

  let documents: readonly { path: string; status: number; html: string }[] = [];
  let expected = { manifest: 0, products: 0, guides: 0, linked: 0 };

  test.beforeAll(async ({ playwright }, testInfo) => {
    testInfo.skip(
      testInfo.project.name !== "e2e-desktop",
      "a request-level scan: one project",
    );
    testInfo.setTimeout(600_000);
    const request = await playwright.request.newContext({
      ...(testInfo.project.use.baseURL === undefined
        ? {}
        : { baseURL: testInfo.project.use.baseURL }),
      ...(testInfo.project.use.extraHTTPHeaders === undefined
        ? {}
        : { extraHTTPHeaders: testInfo.project.use.extraHTTPHeaders }),
    });
    const homes = LOCALES.map((locale) => `/${locale}`);
    const linked = new Set<string>();
    for (const home of await fetchAll(request, homes)) {
      for (const href of internalHrefs(home.html)) linked.add(href);
    }
    const manifest = manifestPaths();
    const products = productPaths();
    const guides = guidePaths();
    expected = {
      manifest: manifest.length,
      products: products.length,
      guides: guides.length,
      linked: linked.size,
    };
    const paths = [
      ...new Set([...homes, ...manifest, ...products, ...guides, ...linked]),
    ];
    documents = await fetchAll(request, paths);
    await request.dispose();
    console.log(
      `ordering-state: read ${String(documents.filter((entry) => entry.status === 200).length)} of ${String(documents.length)} documents (${String(expected.manifest)} prerendered, ${String(expected.products)} product pages, ${String(expected.guides)} guides, ${String(expected.linked)} linked from the homes)`,
    );
  });

  test("read every document it was given: the manifest, every product page, every guide and the homes' links", () => {
    // Every locale prerenders its homes, hubs and listings, and every destination has 84 product
    // pages in every locale, so a short or empty set cannot pass.
    expect(expected.manifest).toBeGreaterThan(4 * 84);
    expect(expected.products).toBe(4 * 7 * 84);
    expect(expected.guides).toBe(2 * 7);
    expect(expected.linked).toBeGreaterThan(0);
    expect(
      documents
        .filter((entry) => entry.status !== 200)
        .map((entry) => `${entry.path} answered ${String(entry.status)}`),
    ).toEqual([]);
    const read = new Set(documents.map((entry) => entry.path));
    for (const path of guidePaths()) expect(read.has(path), path).toBe(true);
  });

  test('no document carries a cutoff value, "Order by" or a time followed by a zone', () => {
    expect(
      documents.flatMap((entry) => offences(entry.path, entry.html)),
    ).toEqual([]);
  });

  test('the read catches a planted cutoff: each value, "Order by" and a time in a zone', () => {
    const en = catalogue("en");
    for (const key of CUTOFF_KEYS) {
      const planted = (leaf(en, key) ?? "")
        .replace("{time}", "14:00")
        .replace("{city}", "Warsaw");
      expect(
        offences("planted", `<main><p>${planted}</p></main>`),
        key,
      ).not.toEqual([]);
    }
    expect(offences("planted", "<p>Order by noon</p>")).not.toEqual([]);
    // The excused guide row passes by its exact words, and nothing else does.
    expect(EXCUSED_GUIDE_ROW).toEqual(["Order by None yet."]);
    expect(ESCALATED_HUB_COPY).toHaveLength(2);
    expect(
      offences("planted", "<dl><dt>Order by</dt><dd>None yet.</dd></dl>"),
    ).toEqual([]);
    expect(
      offences("planted", "<dl><dt>Order by</dt><dd>14:00 in Warsaw</dd></dl>"),
    ).not.toEqual([]);
    expect(
      offences("planted", "<p>Bestellen bis 14:00 Uhr in Warschau</p>"),
    ).not.toEqual([]);
    // JSON-LD is read; a framework payload is not.
    expect(
      offences(
        "planted",
        '<script type="application/ld+json">{"description":"Order by 14:00"}</script>',
      ),
    ).not.toEqual([]);
    expect(
      offences(
        "planted",
        '<script>self.__next_f.push([1,"Order by"])</script>',
      ),
    ).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* AC-33: the surfaces.                                                       */
/* -------------------------------------------------------------------------- */

async function visibleText(page: Page, path: string): Promise<string> {
  const response = await page.goto(path);
  expect(response?.status(), path).toBe(200);
  return (await page.locator("body").innerText()).replaceAll(/\s+/gu, " ");
}

/** The surface checks set their own viewports, so one project runs them. */
function desktopOnly(testInfo: TestInfo): void {
  test.skip(
    testInfo.project.name !== "e2e-desktop",
    "sets its own two viewports",
  );
}

function hubPath(locale: string): string {
  return localePath(locale, "destinations");
}

test.describe('AC-33 (T-34): every not-open state line reads "Ordering opens soon"', () => {
  for (const locale of LOCALES) {
    for (const [width, viewport] of [
      ["1440", DESKTOP],
      ["390", PHONE],
    ] as const) {
      test(`${locale} home and hub at ${width}: the not-open text, and no old phrasing`, async ({
        page,
      }, testInfo) => {
        desktopOnly(testInfo);
        await page.setViewportSize(viewport);
        for (const path of [`/${locale}`, hubPath(locale)]) {
          const text = await visibleText(page, path);
          // The `de`/`pl` hubs print no state line at all: no guide is written in those
          // languages, so each row says that instead (spec 007 §13 Q1). The homes do.
          if (path === `/${locale}` || locale === "en" || locale === "en-gb") {
            expect(text, path).toContain(SOON);
          }
          for (const phrase of OLD)
            expect(text, `${path}: ${phrase}`).not.toContain(phrase);
        }
        // The home finder: every country selectable, each with "soon" beside its name.
        await page.goto(`/${locale}`);
        const options = page.locator("[data-fo-sentence-country] option");
        await expect(options).toHaveCount(7);
        await expect(
          page.locator("[data-fo-sentence-country] option[disabled]"),
        ).toHaveCount(0);
        const labels = await options.allTextContents();
        expect(labels.filter((label) => !label.endsWith(" (soon)"))).toEqual(
          [],
        );
      });
    }
  }

  test("every guide's state line reads the not-open text, and no old phrasing", async ({
    page,
  }, testInfo) => {
    desktopOnly(testInfo);
    await page.setViewportSize(DESKTOP);
    for (const path of guidePaths()) {
      const text = await visibleText(page, path);
      await expect(
        page.locator("main[data-fo-corridor] h1 + p"),
        path,
      ).toHaveText(SOON);
      for (const phrase of OLD)
        expect(text, `${path}: ${phrase}`).not.toContain(phrase);
    }
  });

  for (const locale of GUIDE_LOCALES) {
    for (const country of ["poland", "germany"] as const) {
      test(`${locale} product page for ${country}: the primary action's status reads the not-open text`, async ({
        page,
      }, testInfo) => {
        desktopOnly(testInfo);
        await page.setViewportSize(DESKTOP);
        const path = `/${locale}/${country}/product/amber-hour`;
        const text = await visibleText(page, path);
        await expect(page.locator("[data-fo-pdp-status]")).toHaveText(SOON);
        for (const phrase of OLD)
          expect(text, `${path}: ${phrase}`).not.toContain(phrase);
      });
    }
  }
});
