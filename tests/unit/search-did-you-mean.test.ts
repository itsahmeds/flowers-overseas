/**
 * `didYouMean` (spec 045 §14 A-orchestrator-2026-10-24 item 2; TASK-401; the rendered button is
 * AC-37, TASK-402's): it fires only on zero results, searches one step wider than §2.3's typo
 * distance, and offers a suggestion only when the substituted query finds something.
 */
import { beforeAll, describe, expect, it } from "vitest";

import type { LocaleCode } from "../../src/config/locales.ts";
import {
  type DestinationIndex,
  buildIndex,
  catalogSearchSource,
  didYouMean,
  memoryEngine,
  parseQuery,
} from "../../src/modules/search/index.ts";

let shops: Map<LocaleCode, DestinationIndex>;

beforeAll(async () => {
  const index = await buildIndex(catalogSearchSource());
  shops = new Map();
  for (const [locale, entry] of index.locales) {
    const shop = entry.shops.get("PL");
    if (shop !== undefined) shops.set(locale, shop);
  }
}, 60_000);

function suggest(locale: LocaleCode, query: string): string | null {
  const shop = shops.get(locale);
  if (shop === undefined) throw new Error("no shop");
  return didYouMean(shop, parseQuery(query, locale, []).tokens, locale);
}

describe("didYouMean", () => {
  it("offers `tulips` for `tolaps` (distance 2, beyond §2.3's 1, within the widened 2)", () => {
    expect(suggest("en", "tolaps")).toBe("tulips");
  });

  it("is null when the query has results, typo results included", () => {
    expect(suggest("en", "sunflwers")).toBeNull();
    expect(suggest("en", "roses")).toBeNull();
  });

  it("is null when no vocabulary term is within the widened distance", () => {
    expect(suggest("en", "qqqqqq")).toBeNull();
  });

  it("is null for every T-06 to T-09 query that has a result", () => {
    const fixtures: readonly (readonly [LocaleCode, string])[] = [
      ["pl", "roza"],
      ["pl", "róża"],
      ["pl", "róże"],
      ["pl", "ROZE"],
      ["en", "krakow"],
      ["en", "Kraków"],
      ["de", "Rosen"],
      ["de", "Rose"],
      ["en", "rose"],
      ["pl", "tulipany"],
      ["pl", "tulipanów"],
      ["en", "sunfl"],
      ["en", "orchds"],
      ["en", "tulpis"],
      ["en", "red roses"],
      ["en", "róże"],
      ["en", "FO-BQ-001"],
    ];
    for (const [locale, query] of fixtures) {
      expect(suggest(locale, query), `${locale} ${query}`).toBeNull();
    }
  });

  it("keeps the words that matched and replaces only the one that did not", () => {
    expect(suggest("en", "red tolaps")).toBe("red tulips");
  });

  it("is null for an empty query", () => {
    const shop = shops.get("en");
    if (shop === undefined) throw new Error("no shop");
    expect(didYouMean(shop, [], "en")).toBeNull();
  });

  it("reaches the engine's no-results view, and only there", async () => {
    const engine = memoryEngine({ source: catalogSearchSource });
    const none = await engine.search({
      locale: "en",
      query: "tolaps",
      to: "pl",
    });
    expect(none.view.state).toBe("noResults");
    expect(none.view.didYouMean).toBe("tulips");
    const typo = await engine.search({
      locale: "en",
      query: "sunflwers",
      to: "pl",
    });
    expect(typo.view.state).toBe("results");
    expect(typo.view.didYouMean).toBeNull();
  });
});
