/**
 * `memoryEngine`'s freshness and boundaries (spec 045 AC-31, T-31, §5.4, §11; TASK-401).
 *
 * The engine runs on the static catalogue providers with `DATABASE_URL` unset; `invalidate()`
 * through the real `src/lib/cache.ts` seam marks the index stale and the next search rebuilds it
 * (the build counter moves by one); an index older than 300 s on an injected clock is rebuilt; a
 * fixture price change and its invalidation reach the next results; `search.index_built` names no
 * query; the module reads no database and imports other modules only through their barrels.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MODULES } from "../../scripts/check-layout.ts";
import {
  findDatabaseImports,
  findDatabaseUrlReads,
} from "../../scripts/check-no-db-imports.ts";
import {
  type InvalidateDeps,
  invalidate,
  noopCache,
  onInvalidate,
} from "../../src/lib/cache.ts";
import { createLogger } from "../../src/lib/logger.ts";
import {
  CacheEntitySchema,
  cacheTagsFor,
} from "../../src/modules/catalog/index.ts";
import {
  type SearchSource,
  catalogSearchSource,
  memoryEngine,
} from "../../src/modules/search/index.ts";

const repoRoot = resolve(__dirname, "../..");

const quietDeps: Partial<InvalidateDeps> = {
  revalidate: () => undefined,
  edge: noopCache,
  log: createLogger({ level: "fatal", write: () => undefined }),
  report: () => undefined,
};

function catalogTag(iso2: string): string {
  const [tag] = cacheTagsFor(
    CacheEntitySchema.parse({ kind: "catalog", countryIso: iso2 }),
  );
  if (tag === undefined) throw new Error("no catalog tag");
  return tag;
}

const unsubscribes: (() => void)[] = [];

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  for (const unsubscribe of unsubscribes.splice(0)) unsubscribe();
});

function subscribe(listener: (tags: readonly string[]) => void): void {
  unsubscribes.push(onInvalidate(listener));
}

describe("AC-31 (T-31): the engine on static providers, with no database URL", () => {
  it("runs with DATABASE_URL unset", async () => {
    expect(process.env["DATABASE_URL"]).toBeUndefined();
    const engine = memoryEngine({ source: catalogSearchSource });
    const { view } = await engine.search({
      locale: "en",
      query: "roses",
      to: "pl",
    });
    expect(view.state).toBe("results");
    expect(view.count).toBe(18);
  });

  it("rebuilds once on the next search after invalidate(['catalog:PL'])", async () => {
    const engine = memoryEngine({ source: catalogSearchSource, subscribe });
    await engine.search({ locale: "en", query: "roses", to: "pl" });
    expect(engine.stats().generation).toBe(1);
    await engine.search({ locale: "en", query: "tulips", to: "pl" });
    expect(engine.stats().generation).toBe(1);

    await invalidate([catalogTag("PL")], quietDeps);
    expect(engine.stats().generation).toBe(1);
    await engine.search({ locale: "en", query: "roses", to: "pl" });
    expect(engine.stats().generation).toBe(2);
    await engine.search({ locale: "en", query: "roses", to: "pl" });
    expect(engine.stats().generation).toBe(2);
  });

  it("ignores tags that do not touch the catalogue", async () => {
    const engine = memoryEngine({ source: catalogSearchSource, subscribe });
    await engine.search({ locale: "en", query: "roses", to: "pl" });
    await invalidate(["home:en", "hub:en", "sitemap"], quietDeps);
    await engine.search({ locale: "en", query: "roses", to: "pl" });
    expect(engine.stats().generation).toBe(1);
  });

  it.each(["product:FO-BQ-001", "country:PL"])(
    "marks the index stale on %s",
    async (tag) => {
      const engine = memoryEngine({ source: catalogSearchSource, subscribe });
      await engine.search({ locale: "en", query: "roses", to: "pl" });
      await invalidate([tag], quietDeps);
      await engine.search({ locale: "en", query: "roses", to: "pl" });
      expect(engine.stats().generation).toBe(2);
    },
  );

  it("rebuilds an index older than 300 s on the next search, and not before", async () => {
    let now = 1_000_000;
    const entries: Record<string, unknown>[] = [];
    const engine = memoryEngine({
      source: catalogSearchSource,
      now: () => now,
      log: { info: (fields) => entries.push(fields) },
    });
    await engine.search({ locale: "en", query: "roses", to: "pl" });
    now += 300_000;
    await engine.search({ locale: "en", query: "roses", to: "pl" });
    expect(engine.stats().generation).toBe(1);
    expect(engine.stats().ageSeconds).toBe(300);
    now += 1_000;
    await engine.search({ locale: "en", query: "roses", to: "pl" });
    expect(engine.stats().generation).toBe(2);
    expect(engine.stats().ageSeconds).toBe(0);
    expect(entries.map((entry) => entry["trigger"])).toEqual([
      "initial",
      "ttl",
    ]);
  });

  it("shares one build between concurrent searches", async () => {
    const engine = memoryEngine({ source: catalogSearchSource });
    await Promise.all([
      engine.search({ locale: "en", query: "roses", to: "pl" }),
      engine.search({ locale: "de", query: "rosen", to: "pl" }),
      engine.search({ locale: "pl", query: "róże", to: "pl" }),
    ]);
    expect(engine.stats().generation).toBe(1);
  });

  it("shows a fixture price change on the next results after its invalidation", async () => {
    let amount = 0;
    const priced = (): SearchSource => {
      const source = catalogSearchSource();
      return {
        ...source,
        cards: async (locale, iso2, skus) =>
          (await source.cards(locale, iso2, skus)).map((card) =>
            card.productId === "FO-BQ-001" && amount > 0
              ? { ...card, price: { ...card.price, amountMinor: amount } }
              : card,
          ),
      };
    };
    const engine = memoryEngine({ source: priced, subscribe });
    const before = await engine.search({
      locale: "en",
      query: "FO-BQ-001",
      to: "pl",
    });
    const original = Number(before.view.cards[0]?.price.amountMinor ?? 0);
    expect(original).toBeGreaterThan(0);

    amount = original + 1000;
    await invalidate([catalogTag("PL")], quietDeps);
    const after = await engine.search({
      locale: "en",
      query: "FO-BQ-001",
      to: "pl",
    });
    expect(Number(after.view.cards[0]?.price.amountMinor)).toBe(
      original + 1000,
    );
    expect(engine.stats().generation).toBe(2);
  });

  it("reaches a renamed product only after the invalidation rebuilds the index", async () => {
    let renamed = false;
    const source = (): SearchSource => {
      const base = catalogSearchSource();
      return {
        ...base,
        products: async (locale, iso2) =>
          (await base.products(locale, iso2)).map((product) =>
            renamed && product.sku === "FO-BQ-001"
              ? { ...product, name: "Zinnober Morgen" }
              : product,
          ),
      };
    };
    const engine = memoryEngine({ source, subscribe });
    expect(
      (await engine.search({ locale: "en", query: "zinnober", to: "pl" })).view
        .count,
    ).toBe(0);
    renamed = true;
    expect(
      (await engine.search({ locale: "en", query: "zinnober", to: "pl" })).view
        .count,
    ).toBe(0);
    await invalidate([catalogTag("PL")], quietDeps);
    const found = await engine.search({
      locale: "en",
      query: "zinnober",
      to: "pl",
    });
    expect(found.view.cards.map((card) => card.productId)).toEqual([
      "FO-BQ-001",
    ]);
  });

  it("logs search.index_built with numbers and the trigger, never the query", async () => {
    const entries: Record<string, unknown>[] = [];
    const engine = memoryEngine({
      source: catalogSearchSource,
      subscribe,
      log: { info: (fields) => entries.push(fields) },
    });
    await engine.search({
      locale: "en",
      query: "anna.kowalska@example.com",
      to: "pl",
    });
    await invalidate([catalogTag("PL")], quietDeps);
    await engine.search({ locale: "en", query: "+48 600 100 200", to: "pl" });
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry["event"])).toEqual([
      "search.index_built",
      "search.index_built",
    ]);
    expect(entries.map((entry) => entry["trigger"])).toEqual([
      "initial",
      "invalidate",
    ]);
    expect(Object.keys(entries[0] ?? {}).sort()).toEqual(
      [
        "documents",
        "duration_ms",
        "event",
        "generation",
        "locales",
        "trigger",
      ].sort(),
    );
    expect(entries[0]?.["documents"]).toBe(engine.stats().documents);
    const text = JSON.stringify(entries);
    expect(text).not.toContain("kowalska");
    expect(text).not.toContain("600");
  });
});

describe("AC-31: the module's boundaries", () => {
  it("reads no database and no DATABASE_URL (`pnpm check:no-db`)", () => {
    const paths = ["src/modules/search", "src/config/search.ts"];
    expect(findDatabaseImports(repoRoot, paths)).toEqual([]);
    expect(findDatabaseUrlReads(repoRoot, paths)).toEqual([]);
  });

  it("is a registered module, so the boundary lint covers it", () => {
    expect(MODULES).toContain("search");
  });

  it("imports other modules only through their public index.ts", () => {
    const dir = join(repoRoot, "src/modules/search");
    const offending: string[] = [];
    for (const file of readdirSync(dir)) {
      const source = readFileSync(join(dir, file), "utf8");
      for (const match of source.matchAll(/from\s+"([^"]+)"/gu)) {
        const specifier = match[1] ?? "";
        if (specifier.startsWith("@/modules/")) {
          if (!/^@\/modules\/[a-z0-9]+$/u.test(specifier)) {
            offending.push(`${file}: ${specifier}`);
          }
        } else if (specifier.startsWith("../")) {
          offending.push(`${file}: ${specifier}`);
        }
      }
    }
    expect(offending).toEqual([]);
  });

  it("names no destination: no ISO code literal and no country name in its source", () => {
    const dir = join(repoRoot, "src/modules/search");
    for (const file of readdirSync(dir)) {
      const source = readFileSync(join(dir, file), "utf8");
      expect(source, file).not.toMatch(
        /"(PL|DE|FR|ES|IT|RO|NL|pl|de|fr|es|it|ro|nl)"/u,
      );
      expect(source, file).not.toMatch(
        /poland|polska|polen|germany|deutschland|france|spain|italy|romania|netherlands/iu,
      );
    }
  });
});
