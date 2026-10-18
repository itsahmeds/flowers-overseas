/**
 * **AC-51, the built-site scan** (spec 003 §14 A-founder-2026-10-15a, T-51; TASK-242), with the
 * named cases of the specs that cite it: spec 004 T-59 (the locale homes), spec 007 T-37 (the
 * guides and the destinations hub), spec 008 T-38 (the listings) and spec 009 T-40 (the product
 * sample).
 *
 * The founder approved the copy "just no em dash" (2026-10-05) and banned the spaced hyphen and
 * the spaced en dash with it ("dashes yes", 2026-10-15). This file reads what a crawler receives
 * and holds every head string to `headDashesIn()`, the rule the three source gates share:
 *
 *  - the `<title>`, `<meta name="description">`, and every `og:` and `twitter:` title and
 *    description in the document's `<head>`;
 *  - every `name` and `headline` string in every `application/ld+json` block.
 *
 * **The documents.** Every route `.next/prerender-manifest.json` lists under `en`, `en-gb`, `de`
 * and `pl` (the pseudo-locales are out of scope: generated from `en`, never in production), plus
 * one product page per SKU for Poland in each of the four locales, plus the localised 404 in each,
 * plus page 2 of the Polish shop root and of one Polish country category in each (spec 008 AC-34:
 * the paged title is a query on a prerendered route, so the manifest does not list it). The scan
 * prints how many documents it read and fails unless that count is the sum of those four sets, so
 * an empty or short list cannot pass.
 *
 * It reads the manifest of the build it is pointed at: CI's `e2e` job serves the `preview` job's
 * build from the same checkout (`.github/actions/preview-origin`); locally, `pnpm build && pnpm
 * start`. It runs once, in `e2e-desktop`: the documents do not depend on the viewport.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { type APIRequestContext, expect, test } from "@playwright/test";

import { COUNTRIES } from "../../src/config/countries.ts";
import { localePath } from "../../src/modules/i18n/routing.ts";
import {
  describeHeadDashes,
  headDashesIn,
} from "../../src/modules/i18n/head-punctuation.ts";

const LOCALES = ["en", "en-gb", "de", "pl"] as const;

const ROOT = join(import.meta.dirname, "..", "..");

/* -------------------------------------------------------------------------- */
/* The read: head strings out of a served document.                           */
/* -------------------------------------------------------------------------- */

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  middot: "·",
};

/** HTML character references, so `&#8212;` and `&mdash;` read as the dash they render as. */
function decodeEntities(text: string): string {
  return text.replace(
    /&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/giu,
    (whole, body: string) => {
      if (body.startsWith("#x") || body.startsWith("#X")) {
        return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
      }
      if (body.startsWith("#")) {
        return String.fromCodePoint(Number.parseInt(body.slice(1), 10));
      }
      return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
    },
  );
}

function attributesOf(tag: string): Map<string, string> {
  const attributes = new Map<string, string>();
  for (const match of tag.matchAll(
    /([a-zA-Z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gu,
  )) {
    attributes.set(
      (match[1] ?? "").toLowerCase(),
      decodeEntities(match[2] ?? match[3] ?? ""),
    );
  }
  return attributes;
}

/** Every `name` and `headline` string anywhere in a JSON-LD value. */
function structuredNames(value: unknown, out: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) structuredNames(item, out);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, child] of Object.entries(value)) {
    if ((key === "name" || key === "headline") && typeof child === "string") {
      out.push(child);
    } else {
      structuredNames(child, out);
    }
  }
}

interface HeadString {
  readonly where: string;
  readonly value: string;
}

/** The head strings of one document, each labelled with where it came from. */
function headStringsOf(html: string): readonly HeadString[] {
  const strings: HeadString[] = [];
  const head = html.slice(0, Math.max(html.indexOf("</head>"), 0));
  const title = /<title[^>]*>([^<]*)<\/title>/iu.exec(head);
  if (title !== null) {
    strings.push({ where: "<title>", value: decodeEntities(title[1] ?? "") });
  }
  for (const match of head.matchAll(/<meta\b[^>]*>/giu)) {
    const attributes = attributesOf(match[0]);
    const key = attributes.get("name") ?? attributes.get("property") ?? "";
    if (
      key === "description" ||
      /^(og|twitter):(title|description)$/u.test(key)
    ) {
      strings.push({
        where: `<meta ${key}>`,
        value: attributes.get("content") ?? "",
      });
    }
  }
  for (const match of html.matchAll(
    /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/giu,
  )) {
    const names: string[] = [];
    structuredNames(JSON.parse(match[1] ?? "null"), names);
    for (const name of names)
      strings.push({ where: "JSON-LD name", value: name });
  }
  return strings;
}

/* -------------------------------------------------------------------------- */
/* The documents.                                                             */
/* -------------------------------------------------------------------------- */

/** Which set a document came from, and the status it must answer with to count as read. */
type Group = "manifest" | "product" | "notFound" | "paged";
const EXPECTED_STATUS: Readonly<Record<Group, number>> = {
  manifest: 200,
  product: 200,
  notFound: 404,
  paged: 200,
};

/**
 * The prerendered documents per launch locale on this catalogue (breaker r1 on PR 266, hole 8):
 * the home, the destinations hub, the guides, the hubs and the occasions index, and per published
 * country its shop root, country categories, country occasions and product pages. A short
 * manifest, or a scan that drops one locale's documents, fails against these numbers. A change
 * to the catalogue that adds or removes a page changes them: update them from the build's
 * `.next/prerender-manifest.json` in the same PR, and say why in its description.
 */
const EXPECTED_PRERENDERED: Readonly<Record<string, number>> = {
  en: 803,
  "en-gb": 803,
  de: 796,
  pl: 796,
};

interface Scanned {
  readonly path: string;
  readonly group: Group;
  readonly status: number;
  /** The document answered with its group's expected status; only then is it counted as read. */
  readonly read: boolean;
  readonly title: string | undefined;
  readonly strings: readonly HeadString[];
  /** One line per dash found, `path: where "value" carries …`. */
  readonly faults: readonly string[];
}

function manifestPaths(): readonly string[] {
  const manifest = JSON.parse(
    readFileSync(join(ROOT, ".next", "prerender-manifest.json"), "utf8"),
  ) as { routes?: Record<string, unknown> };
  return Object.keys(manifest.routes ?? {})
    .filter((path) =>
      (LOCALES as readonly string[]).includes(path.split("/")[1] ?? ""),
    )
    .sort();
}

/** One product page per SKU, for Poland, in each launch locale (spec 009 AC-36's sample). */
function productSample(): readonly string[] {
  const english = seedSlugs("en", "products.json");
  return LOCALES.flatMap((locale) => {
    const own = seedSlugs(locale, "products.json");
    return [...english.keys()].map((sku) =>
      localePath(locale, {
        pageType: "product",
        country: polandIn(locale),
        segments: [own.get(sku) ?? english.get(sku) ?? ""],
      }),
    );
  });
}

/** The localised 404 document of each locale. */
const NOT_FOUND = LOCALES.map((locale) => `/${locale}/no-such-page-head-scan`);

/** The `key` -> `slug` map of a locale's seed copy file (`en-gb` carries the English slugs). */
function seedSlugs(locale: string, file: string): Map<string, string> {
  const rows = (
    JSON.parse(
      readFileSync(
        join(
          ROOT,
          "seed",
          "data",
          "copy",
          locale === "en-gb" ? "en" : locale,
          file,
        ),
        "utf8",
      ),
    ) as { rows: { key: string; slug?: string }[] }
  ).rows;
  return new Map(
    rows.flatMap((row) =>
      row.slug === undefined ? [] : [[row.key, row.slug] as const],
    ),
  );
}

/** Poland's URL segment in a locale. */
function polandIn(locale: string): string {
  const poland = COUNTRIES.find((country) => country.iso2 === "PL");
  const slug = (poland?.slugs as Record<string, string> | undefined)?.[locale];
  if (slug === undefined) throw new Error(`no Polish slug for ${locale}`);
  return slug;
}

/**
 * Page 2 of the Polish shop root and of the Polish bouquet category, per locale (spec 008 AC-34:
 * "`?page=2` where it exists"; both have more than one page of products).
 */
function pagedSample(): readonly string[] {
  return LOCALES.flatMap((locale) => {
    const shop = localePath(locale, "shopCategory", "x").split("/")[2] ?? "";
    const root = `/${locale}/${polandIn(locale)}/${shop}`;
    const bouquets = seedSlugs(locale, "categories.json").get("bouquet") ?? "";
    return [`${root}?page=2`, `${root}/${bouquets}?page=2`];
  });
}

async function scanOne(
  request: APIRequestContext,
  path: string,
  group: Group,
): Promise<Scanned> {
  const response = await request.get(path, { maxRedirects: 0 });
  const html = await response.text();
  const strings = headStringsOf(html);
  const faults = strings.flatMap((entry) => {
    const found = headDashesIn(entry.value);
    return found.length === 0
      ? []
      : [
          `${path}: ${entry.where} ${JSON.stringify(entry.value)} carries ${describeHeadDashes(found)}`,
        ];
  });
  return {
    path,
    group,
    status: response.status(),
    read: response.status() === EXPECTED_STATUS[group],
    title: strings.find((entry) => entry.where === "<title>")?.value,
    strings,
    faults,
  };
}

async function scanAll(
  request: APIRequestContext,
  documents: readonly { readonly path: string; readonly group: Group }[],
): Promise<readonly Scanned[]> {
  const results: Scanned[] = [];
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < documents.length) {
      const document = documents[next];
      next += 1;
      if (document === undefined) continue;
      results.push(await scanOne(request, document.path, document.group));
    }
  };
  await Promise.all(Array.from({ length: 12 }, worker));
  return results;
}

/** Documents per locale, by the first path segment. */
function perLocale(paths: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const path of paths) {
    const locale = path.split("/")[1] ?? "";
    counts[locale] = (counts[locale] ?? 0) + 1;
  }
  return counts;
}

/* -------------------------------------------------------------------------- */
/* The cases.                                                                 */
/* -------------------------------------------------------------------------- */

test.describe("spec 003 AC-51 / T-51: no dash in any head string of the built site", () => {
  test.describe.configure({ mode: "serial", timeout: 600_000 });

  let scanned: readonly Scanned[] = [];
  const byPath = new Map<string, Scanned>();
  let counts = { manifest: 0, products: 0, notFound: 0, paged: 0 };
  let manifestByLocale: Record<string, number> = {};

  test.beforeAll(async ({ playwright }, testInfo) => {
    testInfo.skip(
      testInfo.project.name !== "e2e-desktop",
      "the documents do not depend on the viewport; one read is enough",
    );
    // Thousands of documents: the hook gets the describe's budget, not the 30 s default.
    testInfo.setTimeout(600_000);
    const request = await playwright.request.newContext({
      ...(testInfo.project.use.baseURL === undefined
        ? {}
        : { baseURL: testInfo.project.use.baseURL }),
      ...(testInfo.project.use.extraHTTPHeaders === undefined
        ? {}
        : { extraHTTPHeaders: testInfo.project.use.extraHTTPHeaders }),
    });
    const manifest = manifestPaths();
    const products = productSample();
    const paged = pagedSample();
    counts = {
      manifest: manifest.length,
      products: products.length,
      notFound: NOT_FOUND.length,
      paged: paged.length,
    };
    manifestByLocale = perLocale(manifest);
    scanned = await scanAll(request, [
      ...manifest.map((path) => ({ path, group: "manifest" as const })),
      ...products.map((path) => ({ path, group: "product" as const })),
      ...NOT_FOUND.map((path) => ({ path, group: "notFound" as const })),
      ...paged.map((path) => ({ path, group: "paged" as const })),
    ]);
    for (const entry of scanned) byPath.set(entry.path, entry);
    await request.dispose();
    console.log(
      `head-dash-scan: read ${String(scanned.filter((entry) => entry.read).length)} of ${String(scanned.length)} documents (${String(counts.manifest)} prerendered in en, en-gb, de, pl; ${String(counts.products)} Polish product pages; ${String(counts.notFound)} 404s; ${String(counts.paged)} page-2 listings)`,
    );
  });

  test("read every prerendered document, the product sample, the 404s and the page-2 listings", () => {
    // The manifest lists each locale's prerendered documents, pinned per locale (hole 8): a
    // missing, emptied or one-locale-short list fails here rather than passing on less.
    expect(manifestByLocale).toEqual(EXPECTED_PRERENDERED);
    expect(counts.products).toBe(4 * 84);
    expect(counts.notFound).toBe(4);
    expect(counts.paged).toBe(8);
    // Every document answered as it must (200, or 404 for the not-found documents), so an error
    // page is never counted as read (hole 9).
    expect(
      scanned
        .filter((entry) => !entry.read)
        .map((entry) => `${entry.path} answered ${String(entry.status)}`),
    ).toEqual([]);
    expect(
      perLocale(
        scanned
          .filter((entry) => entry.read && entry.group === "manifest")
          .map((entry) => entry.path),
      ),
    ).toEqual(EXPECTED_PRERENDERED);
    const expectedTotal =
      Object.values(EXPECTED_PRERENDERED).reduce(
        (sum, count) => sum + count,
        0,
      ) +
      4 * 84 +
      4 +
      8;
    expect(scanned.filter((entry) => entry.read)).toHaveLength(expectedTotal);
    expect(
      scanned
        .filter((entry) => entry.title === undefined)
        .map((entry) => entry.path),
    ).toEqual([]);
  });

  test("no document's head carries an em dash, a spaced hyphen or a spaced en dash", () => {
    expect(scanned.flatMap((entry) => entry.faults)).toEqual([]);
  });

  test("the read catches a dash: a planted em dash in a title and a JSON-LD name is found", () => {
    const planted = headStringsOf(
      '<html><head><title>Flowers Overseas — send flowers to Europe</title><meta property="og:title" content="A &mdash; B"></head><body><script type="application/ld+json">{"@type":"BreadcrumbList","itemListElement":[{"name":"Roses - red"}]}</script></body></html>',
    ).filter((entry) => headDashesIn(entry.value).length > 0);
    expect(planted.map((entry) => entry.where)).toEqual([
      "<title>",
      "<meta og:title>",
      "JSON-LD name",
    ]);
  });

  test("spec 004 T-59: the four locale homes, the title the resolved `meta.home.title`", () => {
    for (const locale of LOCALES) {
      const home = byPath.get(`/${locale}`);
      expect(home?.status, locale).toBe(200);
      expect(home?.faults, locale).toEqual([]);
      const catalogue = JSON.parse(
        readFileSync(
          join(ROOT, "messages", `${locale === "en-gb" ? "en" : locale}.json`),
          "utf8",
        ),
      ) as { meta: { home: { title: string } } };
      expect(home?.title, locale).toBe(catalogue.meta.home.title);
    }
    expect(byPath.get("/en")?.title).toBe(
      "Flowers Overseas | Send Flowers Abroad",
    );
    expect(byPath.get("/en-gb")?.title).toBe(
      "Flowers Overseas | Send Flowers Abroad",
    );
  });

  test("spec 007 T-37: every guide and the destinations hub in each launch locale", () => {
    for (const locale of LOCALES) {
      const hub = localePath(locale, "destinations", "x").replace(/\/x$/u, "");
      const pages = scanned.filter(
        (entry) => entry.path === hub || entry.path.startsWith(`${hub}/`),
      );
      expect(byPath.get(hub)?.status, hub).toBe(200);
      expect(
        pages.flatMap((entry) => entry.faults),
        locale,
      ).toEqual([]);
    }
    // The guides are authored in `en` (and inherited by `en-gb`): seven of them each.
    expect(
      scanned.filter((entry) =>
        /^\/en\/send-flowers-to\/[a-z-]+$/u.test(entry.path),
      ),
    ).toHaveLength(7);
  });

  test("spec 008 T-38: shop roots, country categories and occasions, hubs, the occasions index, page 2", () => {
    const listing = scanned.filter((entry) => {
      const segments = entry.path.split("?")[0]?.split("/") ?? [];
      return segments.length >= 3 && !entry.path.includes("/no-such-page");
    });
    expect(listing.flatMap((entry) => entry.faults)).toEqual([]);
    expect(byPath.get("/en/poland/flowers")?.title).toBe(
      "Send flowers to Poland: what we can make there",
    );
    expect(byPath.get("/en/poland/flowers?page=2")?.title).toBe(
      "Send flowers to Poland: what we can make there · Page 2",
    );
    for (const path of [
      "/en/poland/flowers/roses",
      "/en/poland/occasions/mothers-day",
      "/en/flowers/roses",
      "/en/occasions/mothers-day",
      "/en/occasions",
    ]) {
      expect(byPath.get(path)?.status, path).toBe(200);
      expect(byPath.get(path)?.faults, path).toEqual([]);
    }
  });

  test("spec 009 T-40: one product page per SKU for Poland in each locale", () => {
    const products = scanned.filter((entry) =>
      /^\/[a-z-]+\/(poland|polen|polska)\/(product|produkt)\//u.test(
        entry.path,
      ),
    );
    expect(products.length).toBeGreaterThanOrEqual(4 * 84);
    expect(
      products
        .filter((entry) => entry.status !== 200)
        .map((entry) => entry.path),
    ).toEqual([]);
    expect(products.flatMap((entry) => entry.faults)).toEqual([]);
    expect(byPath.get("/en/poland/product/amber-hour")?.title).toBe(
      "Amber Hour: hand-tied rose bouquet",
    );
  });

  test("the localised 404 in each locale", () => {
    for (const path of NOT_FOUND) {
      expect(byPath.get(path)?.status, path).toBe(404);
      expect(byPath.get(path)?.faults, path).toEqual([]);
    }
    expect(byPath.get("/en/no-such-page-head-scan")?.title).toBe(
      "Page not found. Flowers Overseas",
    );
  });
});
