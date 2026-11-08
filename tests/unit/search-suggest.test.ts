/**
 * Search everything (spec 045 §14 A-founder-2026-11-08a; TASK-520): the suggest route's method,
 * body, schema and headers (AC-44's route half, AC-45's no-words-in-a-URL half), the engine's
 * mixed suggestions on the committed catalogue, the four link groups on a fixture source with an
 * added registry country and info pages (AC-39's last clause), and the chip's remove words
 * (AC-40, `withoutDestinationWords`). Units of T-39, T-40, T-44, T-45.
 *
 * Countries are test data here; nothing under `src/` names one.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it, vi } from "vitest";

import { coreRange } from "../../src/modules/catalog/index.ts";
import {
  type SearchSource,
  SUGGEST_HEADERS,
  SuggestResponseSchema,
  catalogSearchSource,
  destinationPhrase,
  memoryEngine,
  rateLimiter,
  searchEngine,
  suggestRoute,
  withoutDestinationWords,
} from "../../src/modules/search/index.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const ENDPOINT = "https://example.test/api/search/suggest";

function post(body: unknown): Request {
  return new Request(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeAll(async () => {
  await searchEngine().search({ locale: "en", query: "roses", to: "pl" });
}, 120_000);

describe("POST /api/search/suggest (AC-44, AC-45)", () => {
  it("answers GET with 405 and Allow: POST, so the words never travel in a URL", async () => {
    const response = await suggestRoute(
      new Request(`${ENDPOINT}?q=ros`, { method: "GET" }),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    // The route file exports GET only to refuse it.
    const route = readFileSync(
      join(ROOT, "src/app/api/search/suggest/route.ts"),
      "utf8",
    );
    expect(route).toMatch(
      /export function GET\(\): Response \{\s+return suggestMethodNotAllowed\(\);/u,
    );
  });

  it("refuses a body that is not the strict schema (400), and answers 404 with the config off", async () => {
    expect((await suggestRoute(post("not json"))).status).toBe(400);
    expect((await suggestRoute(post({ locale: "en" }))).status).toBe(400);
    expect(
      (await suggestRoute(post({ locale: "en", q: "ros", extra: 1 }))).status,
    ).toBe(400);
    expect((await suggestRoute(post({ locale: "xx", q: "ros" }))).status).toBe(
      400,
    );
    expect(
      (
        await suggestRoute(post({ locale: "en", q: "ros" }), {
          config: { suggestions: false },
        })
      ).status,
    ).toBe(404);
  });

  it("answers JSON valid under SuggestItemSchema[] with private, no-store and noindex", async () => {
    const response = await suggestRoute(post({ locale: "en", q: "ros" }));
    expect(response.status).toBe(200);
    for (const [name, value] of Object.entries(SUGGEST_HEADERS)) {
      expect(response.headers.get(name)).toBe(value);
    }
    const items = SuggestResponseSchema.parse(await response.json());
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThanOrEqual(6);
  });

  it("answers 503 when the concurrency cap is reached, and leaves the cap as it found it", async () => {
    const gate = rateLimiter({
      resultsPerMinute: 60,
      suggestPerMinute: 120,
      maxConcurrent: 1,
    });
    gate.enter();
    expect(
      (await suggestRoute(post({ locale: "en", q: "ros" }), { gate })).status,
    ).toBe(503);
    gate.leave();
    const engine = {
      search: vi.fn(),
      suggest: vi.fn(() => Promise.reject(new Error("boom"))),
    };
    const failed = await suggestRoute(post({ locale: "en", q: "ros" }), {
      gate,
      engine,
    });
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual([]);
    expect(gate.inFlight()).toBe(0);
  });

  it("never logs, reports or measures the body: the module has no logger, Sentry or analytics import", () => {
    const source = readFileSync(
      join(ROOT, "src/modules/search/suggest.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/logger|sentry|analytics|console\./iu);
    expect(source).not.toMatch(
      /cf-ipcountry|accept-language|fo_dest|x-vercel-ip-country/iu,
    );
    const island = readFileSync(
      join(ROOT, "src/modules/ui/search/SearchSuggest.tsx"),
      "utf8",
    );
    expect(island).toContain('method: "POST"');
    expect(island).not.toMatch(/[?&]q=|URLSearchParams|console\./u);
  });
});

describe("the engine's suggestions (AC-44)", () => {
  it("no country: at most 3 bouquets, each a chooser link of a coreRange member, then the other kinds, never a price", async () => {
    const items = await searchEngine().suggest({ locale: "en", q: "ros" });
    const skus = (await coreRange("en")).map((entry) => entry.sku);
    const cards =
      (await catalogSearchSource().countryLessCards?.("en", skus)) ?? [];
    const core = new Set(cards.map((card) => card.href));
    const products = items.filter((item) => item.kind === "product");
    expect(products.length).toBeGreaterThan(0);
    expect(products.length).toBeLessThanOrEqual(3);
    for (const item of products) {
      expect(item.href).toMatch(/^\/en\/choose-country\/product\/[a-z0-9-]+$/u);
      expect(core.has(item.href), item.href).toBe(true);
    }
    // Bouquets first, then occasions, flowers, countries, help.
    const order = ["product", "occasion", "category", "destination", "page"];
    const kinds = items.map((item) => order.indexOf(item.kind));
    expect([...kinds].sort((a, b) => a - b)).toEqual(kinds);
    expect(items.length).toBeLessThanOrEqual(6);
    for (const item of items) {
      expect(Object.keys(item).sort()).toEqual(["href", "kind", "label"]);
      expect(item.label).not.toMatch(/€|£|zł|PLN|EUR|GBP|\d+[.,]\d{2}/u);
      expect(item.href).not.toContain("?");
    }
  });

  it("with to=pl the bouquets are Poland's product pages", async () => {
    const items = await searchEngine().suggest({
      locale: "en",
      q: "ros",
      to: "pl",
    });
    const products = items.filter((item) => item.kind === "product");
    expect(products.length).toBeGreaterThan(0);
    for (const item of products) {
      expect(item.href).toMatch(/^\/en\/poland\/product\//u);
    }
  });

  it("fewer than two letters suggest nothing", async () => {
    expect(await searchEngine().suggest({ locale: "en", q: "r" })).toEqual([]);
    expect(await searchEngine().suggest({ locale: "en", q: "  " })).toEqual([]);
  });
});

/** The committed catalogue's source, plus one registry country and two info pages (test data). */
function fixtureSource(): () => SearchSource {
  return () => {
    const base = catalogSearchSource();
    return {
      ...base,
      async destinations(locale) {
        return [
          ...(await base.destinations(locale)),
          {
            iso2: "QZ",
            words: ["Zedland", "Zedlandia", "Zedlandland"],
            name: "Zedland",
            names: [
              { locale: "en", text: "Zedland" },
              { locale: "de", text: "Zedlandia" },
              { locale: "pl", text: "Zedlandland" },
            ],
            // A guide and no shop: the fixture country has no products to index.
            shopHref: undefined,
            corridorHref: "/en/zedland/guide",
          },
        ];
      },
      async infoPages() {
        return [
          {
            id: "a",
            title: "Delivery and payment",
            href: "/en/delivery",
            texts: ["When the flowers arrive"],
            order: 0,
          },
          {
            id: "b",
            title: "Help",
            href: "/en/help",
            texts: ["Questions about delivery"],
            order: 1,
          },
          {
            id: "c",
            title: "About us",
            href: "/en/about",
            texts: ["Who we are"],
            order: 2,
          },
        ];
      },
    };
  };
}

describe("the link groups (AC-39, AC-40)", () => {
  it("an added registry country (a guide, no shop) is listed under Countries with no src/ change, and by prefix", async () => {
    const engine = memoryEngine({ source: fixtureSource() });
    const named = await engine.search({ locale: "en", query: "zedlandia" });
    expect(named.view.groups.destinations).toEqual([
      { label: "Zedland", href: "/en/zedland/guide" },
    ]);
    // Named in full it also sets the destination (§2.4 item 1).
    expect(named.view.destination).toBe("QZ");
    const prefix = await engine.search({ locale: "en", query: "zed" });
    expect(prefix.view.groups.destinations.map((link) => link.href)).toEqual([
      "/en/zedland/guide",
    ]);
    expect(prefix.view.destination).toBeNull();
  }, 120_000);

  it("Help: the title before the body, then the page order; at most 3", async () => {
    const engine = memoryEngine({ source: fixtureSource() });
    const { view } = await engine.search({ locale: "en", query: "delivery" });
    expect(view.groups.help.map((link) => link.href)).toEqual([
      "/en/delivery",
      "/en/help",
    ]);
    expect(view.groups.help.length).toBeLessThanOrEqual(3);
  }, 120_000);

  it("every group holds at most 3 links and none has a query string", async () => {
    for (const query of ["flowers", "roses", "birthday", "pol", "a b c"]) {
      const { view } = await searchEngine().search({ locale: "en", query });
      for (const links of Object.values(view.groups)) {
        expect(links.length, query).toBeLessThanOrEqual(3);
        for (const link of links) expect(link.href).not.toContain("?");
      }
    }
  });

  it("nothing searched, nothing grouped: empty and too short", async () => {
    for (const query of ["", "r"]) {
      const { view } = await searchEngine().search({ locale: "en", query });
      expect(Object.values(view.groups).flat()).toEqual([]);
    }
  });
});

describe("withoutDestinationWords (the chip's remove, AC-40)", () => {
  const words = [
    {
      iso2: "QZ",
      phrases: [destinationPhrase("Zedland"), destinationPhrase("Upper Zed")],
    },
  ];
  it.each([
    ["roses zedland", "roses"],
    ["Zedland roses", "roses"],
    ["Róże upper ZED", "Róże"],
    ["flowers to zedland", "flowers to"],
    ["roses", "roses"],
    ["zedland", ""],
    ["upper roses", "upper roses"],
  ])("%s -> %s", (raw, expected) => {
    expect(withoutDestinationWords(raw, words)).toBe(expected);
  });
});
