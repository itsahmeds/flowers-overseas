/**
 * The purge adapter's pure half (spec 040 §5.4 "Tag invalidation → URL purge", AC-22 / T-22;
 * TASK-102): `urlsForTag()` completeness against the registries, chunking at 30, and the no-op
 * when the token or the zone id is absent.
 *
 * Completeness is asserted against the **registries and the sitemap builders**, never against a
 * hand-written URL list: a list in this file would drift with the registry and pass while a real
 * page went unpurged. The corridor case goes further and reads the corridor sitemap itself (under
 * an indexing deployment, the only one where it lists anything), so "a page the sitemap lists
 * cannot be missed by a purge" is the assertion, not the intention.
 *
 * The HTTP half (3 calls for 71 URLs, two retries, one `error` line with no URL) is T-23 in
 * `tests/integration/cache-cloudflare-purge.test.ts`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SITEMAP_CACHE_TAG,
  cache,
  corridorCacheTags,
  homeCacheTag,
  hubCacheTags,
  noopCache,
  selectCacheAdapter,
  urlsForTag,
} from "../../src/lib/cache";
import {
  CLOUDFLARE_API_TOKEN_KEY,
  CLOUDFLARE_ZONE_ID_KEY,
  PURGE_CHUNK_SIZE,
  chunkUrls,
  createCloudflareCacheAdapter,
  isCloudflareCacheAdapter,
  parseCloudflarePurgeConfig,
} from "../../src/lib/cache-cloudflare";
import { createLogger } from "../../src/lib/logger";
import {
  corridorAlternatePaths,
  listCorridorPages,
} from "../../src/modules/geo";
import { localePath, routableLocaleCodes } from "../../src/modules/i18n";
import {
  absoluteUrl,
  corridorSitemapEntries,
  deploymentDescriptor,
  staticSitemapEntries,
} from "../../src/modules/seo";

const BASE_URL = "https://flowersoverseas.com";
const options = { baseUrl: BASE_URL } as const;

/** The one deployment where the sitemap builders list URLs (the canonical production host). */
const indexing = deploymentDescriptor({
  APP_ENV: "production",
  NEXT_PUBLIC_SITE_URL: BASE_URL,
});

const TOKEN = "cf-test-token-0123456789abcdefghijklmnopq";
const ZONE_ID = "0123456789abcdef0123456789abcdef";

describe("urlsForTag — home:{locale} (T-22)", () => {
  const locales = routableLocaleCodes();

  it("has locales to check (the registry is not empty)", () => {
    expect(locales.length).toBeGreaterThan(0);
  });

  it.each(locales)(
    "home:%s resolves to exactly that locale's home document",
    (locale) => {
      expect(urlsForTag(homeCacheTag(locale), options)).toEqual([
        absoluteUrl(localePath(locale, "home"), options),
      ]);
    },
  );

  it("covers every routable locale once, and no two locales share a URL", () => {
    const all = locales.flatMap((locale) =>
      urlsForTag(homeCacheTag(locale), options),
    );
    expect(all).toHaveLength(locales.length);
    expect(new Set(all).size).toBe(locales.length);
  });
});

describe("urlsForTag — a corridor tag (T-22)", () => {
  // Poland: the first registry destination, a corridor in every locale that has a guide.
  const iso2 = "PL";
  const corridorTag = corridorCacheTags(iso2, "en")[0];

  /** Every URL the corridor sitemaps list for this destination, across every locale. */
  function sitemapCorridorUrls(): string[] {
    const paths = new Set(Object.values(corridorAlternatePaths(iso2)));
    return routableLocaleCodes()
      .flatMap((locale) => corridorSitemapEntries(locale, indexing))
      .map((entry) => entry.loc)
      .filter((loc) => paths.has(new URL(loc).pathname));
  }

  it("names the destination-wide tag, not a per-locale one", () => {
    expect(corridorTag).toBe(`corridor:${iso2}`);
  });

  it("is listed by the corridor sitemap in at least two locales (so the case can fail)", () => {
    expect(sitemapCorridorUrls().length).toBeGreaterThan(1);
  });

  it("contains every URL the corridor sitemaps list for the destination", () => {
    const urls = urlsForTag(corridorTag ?? "", options);
    for (const loc of sitemapCorridorUrls()) expect(urls).toContain(loc);
  });

  it("is exactly the destination's corridor pages from the registry, in every routable locale", () => {
    const expected = listCorridorPages()
      .filter((page) => page.iso2 === iso2)
      .map((page) =>
        absoluteUrl(
          localePath(page.locale, "destinations", page.slug),
          options,
        ),
      );
    expect(urlsForTag(corridorTag ?? "", options)).toEqual(expected);
  });

  it("resolves the per-locale tag to that locale's corridor page alone", () => {
    const perLocale = corridorCacheTags(iso2, "en-gb")[1] ?? "";
    expect(urlsForTag(perLocale, options)).toEqual([
      absoluteUrl(corridorAlternatePaths(iso2)["en-gb"] ?? "", options),
    ]);
  });

  it("covers every corridor URL any sitemap lists, destination by destination", () => {
    const listed = routableLocaleCodes().flatMap((locale) =>
      corridorSitemapEntries(locale, indexing).map((entry) => entry.loc),
    );
    const purged = new Set(
      [...new Set(listCorridorPages().map((page) => page.iso2))].flatMap(
        (country) =>
          urlsForTag(corridorCacheTags(country, "en")[0] ?? "", options),
      ),
    );
    expect(listed.length).toBeGreaterThan(0);
    expect(listed.filter((loc) => !purged.has(loc))).toEqual([]);
  });
});

describe("urlsForTag — hub:{locale} and the rest of the vocabulary", () => {
  it.each(routableLocaleCodes())(
    "hub:%s resolves to exactly that locale's hub, which the static sitemap lists where indexable",
    (locale) => {
      const hubTag = hubCacheTags(locale)[0] ?? "";
      const urls = urlsForTag(hubTag, options);
      expect(urls).toEqual([
        absoluteUrl(localePath(locale, "destinations"), options),
      ]);
      for (const entry of staticSitemapEntries(locale, indexing)) {
        expect(urls).toContain(entry.loc);
      }
    },
  );

  it("leaves `sitemap` unresolved until the escalation in the brief is answered", () => {
    expect(urlsForTag(SITEMAP_CACHE_TAG, options)).toEqual([]);
  });

  it("resolves a tag nobody declares to nothing (never a guess)", () => {
    expect(urlsForTag("catalog:PL", options)).toEqual([]);
    expect(urlsForTag("corridor:ZZ", options)).toEqual([]);
  });

  it("returns no duplicate URL for any declared tag", () => {
    const tags = routableLocaleCodes().flatMap((locale) => [
      homeCacheTag(locale),
      ...hubCacheTags(locale),
      ...listCorridorPages().flatMap((page) =>
        corridorCacheTags(page.iso2, locale),
      ),
    ]);
    for (const tag of tags) {
      const urls = urlsForTag(tag, options);
      expect(new Set(urls).size).toBe(urls.length);
    }
  });

  it("does not double the slash when the site URL ends in one", () => {
    expect(
      urlsForTag(homeCacheTag("en"), {
        baseUrl: "https://flowersoverseas.com/",
      }),
    ).toEqual(["https://flowersoverseas.com/en"]);
  });

  it("builds absolute URLs on the deployment's own origin", () => {
    expect(
      urlsForTag(homeCacheTag("de"), {
        baseUrl: "https://staging.example.test",
      }),
    ).toEqual(["https://staging.example.test/de"]);
  });
});

describe("chunkUrls — at most 30 per purge call (T-22)", () => {
  const urls = (count: number): string[] =>
    Array.from(
      { length: count },
      (_, index) => `${BASE_URL}/p/${String(index)}`,
    );

  it("is 30, the zone plan's limit (plan/08 §3.1)", () => {
    expect(PURGE_CHUNK_SIZE).toBe(30);
  });

  it("keeps 30 URLs in one call", () => {
    expect(chunkUrls(urls(30)).map((chunk) => chunk.length)).toEqual([30]);
  });

  it("splits 31 URLs into 30 + 1", () => {
    expect(chunkUrls(urls(31)).map((chunk) => chunk.length)).toEqual([30, 1]);
  });

  it("splits 71 URLs into 30 + 30 + 11, losing and repeating none", () => {
    const input = urls(71);
    const chunks = chunkUrls(input);
    expect(chunks.map((chunk) => chunk.length)).toEqual([30, 30, 11]);
    expect(chunks.flat()).toEqual(input);
  });

  it("makes no call for no URLs", () => {
    expect(chunkUrls([])).toEqual([]);
  });
});

describe("the no-op without a token or a zone id (T-22)", () => {
  const both = {
    [CLOUDFLARE_API_TOKEN_KEY]: TOKEN,
    [CLOUDFLARE_ZONE_ID_KEY]: ZONE_ID,
    NEXT_PUBLIC_SITE_URL: BASE_URL,
  };

  it("names the two keys spec 040 §5.4 names", () => {
    expect(CLOUDFLARE_API_TOKEN_KEY).toBe("CLOUDFLARE_API_TOKEN");
    expect(CLOUDFLARE_ZONE_ID_KEY).toBe("CLOUDFLARE_ZONE_ID");
  });

  it.each([
    ["neither key", {}],
    ["the token alone", { [CLOUDFLARE_API_TOKEN_KEY]: TOKEN }],
    ["the zone id alone", { [CLOUDFLARE_ZONE_ID_KEY]: ZONE_ID }],
    ["a blank token", { ...both, [CLOUDFLARE_API_TOKEN_KEY]: "  " }],
    ["a blank zone id", { ...both, [CLOUDFLARE_ZONE_ID_KEY]: "" }],
  ])("is the no-op adapter with %s", (_label, source) => {
    expect(selectCacheAdapter(source)).toBe(noopCache);
  });

  it("is the Cloudflare adapter when both keys are present", () => {
    const adapter = selectCacheAdapter(both);
    expect(adapter).not.toBe(noopCache);
    expect(isCloudflareCacheAdapter(adapter)).toBe(true);
  });

  it("is the no-op in this test process, where neither key is set", () => {
    expect(cache).toBe(noopCache);
  });

  it("resolves to undefined and touches no network (MSW refuses unhandled requests)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      await expect(
        selectCacheAdapter({}).invalidate([homeCacheTag("en")]),
      ).resolves.toBeUndefined();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe("parseCloudflarePurgeConfig — absent means off, present must be well-formed", () => {
  it("reads both keys, trimmed", () => {
    expect(
      parseCloudflarePurgeConfig({
        [CLOUDFLARE_API_TOKEN_KEY]: ` ${TOKEN} `,
        [CLOUDFLARE_ZONE_ID_KEY]: ZONE_ID,
      }),
    ).toEqual({ kind: "configured", token: TOKEN, zoneId: ZONE_ID });
  });

  it("is absent when either key is missing", () => {
    expect(
      parseCloudflarePurgeConfig({ [CLOUDFLARE_ZONE_ID_KEY]: ZONE_ID }),
    ).toEqual({ kind: "absent" });
  });

  it("names the malformed key and never its value", () => {
    const state = parseCloudflarePurgeConfig({
      [CLOUDFLARE_API_TOKEN_KEY]: TOKEN,
      [CLOUDFLARE_ZONE_ID_KEY]: "not-a-zone-id",
    });
    expect(state).toEqual({ kind: "invalid", keys: [CLOUDFLARE_ZONE_ID_KEY] });
    expect(JSON.stringify(state)).not.toContain(TOKEN);
  });

  // Cloudflare zone ids are exactly 32 lower-case hex characters (the zone Overview's "Zone ID").
  it.each([
    ["31 characters", ZONE_ID.slice(1)],
    ["33 characters", `${ZONE_ID}0`],
    ["upper-case hex", ZONE_ID.toUpperCase()],
  ])("refuses a zone id of %s", (_label, zoneId) => {
    expect(
      parseCloudflarePurgeConfig({
        [CLOUDFLARE_API_TOKEN_KEY]: TOKEN,
        [CLOUDFLARE_ZONE_ID_KEY]: zoneId,
      }),
    ).toEqual({ kind: "invalid", keys: [CLOUDFLARE_ZONE_ID_KEY] });
  });

  it("refuses a token with whitespace inside it", () => {
    expect(
      parseCloudflarePurgeConfig({
        [CLOUDFLARE_API_TOKEN_KEY]: "two words",
        [CLOUDFLARE_ZONE_ID_KEY]: ZONE_ID,
      }),
    ).toEqual({ kind: "invalid", keys: [CLOUDFLARE_API_TOKEN_KEY] });
  });

  it("a malformed pair purges nothing and says which key, once per call, at warn", async () => {
    const lines: string[] = [];
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      const adapter = selectCacheAdapter(
        {
          [CLOUDFLARE_API_TOKEN_KEY]: TOKEN,
          [CLOUDFLARE_ZONE_ID_KEY]: "zone",
        },
        createLogger({ level: "info", write: (line) => lines.push(line) }),
      );
      await expect(adapter.invalidate(["home:en"])).resolves.toBeUndefined();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
    expect(lines).toHaveLength(1);
    const line = JSON.parse(lines[0] ?? "{}") as Record<string, unknown>;
    expect(line["level"]).toBe("warn");
    expect(line["invalid_keys"]).toEqual([CLOUDFLARE_ZONE_ID_KEY]);
    expect(lines[0]).not.toContain(TOKEN);
  });
});

describe("createCloudflareCacheAdapter — the resolver is injected", () => {
  it("asks the resolver for each distinct tag once", async () => {
    const asked: string[] = [];
    const adapter = createCloudflareCacheAdapter({
      token: TOKEN,
      zoneId: ZONE_ID,
      resolve: (tag) => {
        asked.push(tag);
        return [];
      },
      logger: createLogger({ write: () => undefined }),
    });
    await adapter.invalidate(["a", "b", "a"]);
    expect(asked).toEqual(["a", "b"]);
  });
});

describe("`cache` as exported: chosen from process.env at import (break 127 round 2)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("is the Cloudflare adapter when both keys are in the environment", async () => {
    vi.stubEnv(CLOUDFLARE_API_TOKEN_KEY, TOKEN);
    vi.stubEnv(CLOUDFLARE_ZONE_ID_KEY, ZONE_ID);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", BASE_URL);
    vi.resetModules();
    const fresh = await import("../../src/lib/cache");
    const adapters = await import("../../src/lib/cache-cloudflare");

    expect(adapters.isCloudflareCacheAdapter(fresh.cache)).toBe(true);
    expect(fresh.cache).not.toBe(fresh.noopCache);
  });

  it("is the no-op when neither key is in the environment", async () => {
    vi.stubEnv(CLOUDFLARE_API_TOKEN_KEY, "");
    vi.stubEnv(CLOUDFLARE_ZONE_ID_KEY, "");
    vi.resetModules();
    const fresh = await import("../../src/lib/cache");
    const adapters = await import("../../src/lib/cache-cloudflare");

    expect(fresh.cache).toBe(fresh.noopCache);
    expect(adapters.isCloudflareCacheAdapter(fresh.cache)).toBe(false);
  });
});
