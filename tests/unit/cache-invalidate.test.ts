/**
 * `invalidate()` and the `catalog:{iso2}` tag (spec 012 §2.4, §5.4 "Invalidation", §11, AC-14
 * invalidation half; spec 040 §5.4; TASK-220).
 *
 *  - `urlsForTag("catalog:PL")` is exactly Poland's country shop listings and product pages, in
 *    every locale, from the catalogue's own existence sets — never a hand-written list — and no
 *    other destination's;
 *  - `invalidate()` revalidates every one of those documents at the origin (a product page also by
 *    its internal rewrite route) **before** it purges the edge, and purges the edge once with the
 *    tag names;
 *  - either half failing is one `warn` line with the tags and both outcomes, and one Sentry warning
 *    with the tags; success is one `info` line and no report; it never rejects.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

// The production defaults of `invalidate()` (`/break 306` hole 2): Next's `revalidatePath` and
// Sentry's `captureWarning` are mocked at their module boundary, and the `cache` edge adapter is
// spied on, so a call with no overrides is observed end to end.
const defaults = vi.hoisted(() => ({
  revalidated: [] as string[],
  warnings: [] as { signal: string; fields: unknown }[],
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => {
    defaults.revalidated.push(path);
  },
}));

vi.mock("../../src/lib/sentry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/sentry")>();
  return {
    ...actual,
    captureWarning: (signal: string, fields: unknown) => {
      defaults.warnings.push({ signal, fields });
    },
  };
});

import {
  CACHE_INVALIDATE_FAILED_SIGNAL,
  type CacheAdapter,
  cache,
  homeCacheTag,
  invalidate,
  pathsForTag,
  urlsForTag,
} from "../../src/lib/cache";
import { createLogger } from "../../src/lib/logger";
import { productRoutePathFor } from "../../src/lib/product-rewrites";
import {
  CacheEntitySchema,
  cacheTagsFor,
  listProductPages,
  listingPages,
} from "../../src/modules/catalog";
import { localePath } from "../../src/modules/i18n";
import { absoluteUrl } from "../../src/modules/seo";

const BASE_URL = "https://flowersoverseas.com";
const options = { baseUrl: BASE_URL } as const;

function catalogTag(iso2: string): string {
  const [tag] = cacheTagsFor(
    CacheEntitySchema.parse({ kind: "catalog", countryIso: iso2 }),
  );
  if (tag === undefined) throw new Error("no catalog tag");
  return tag;
}

async function destinationPaths(iso2: string): Promise<string[]> {
  const listings = (await listingPages()).filter(
    (page) => page.countryIso === iso2,
  );
  const products = (await listProductPages()).filter(
    (page) => page.countryIso === iso2,
  );
  return [...listings, ...products].map((page) => page.path);
}

describe("urlsForTag — catalog:{iso2} (spec 012 §2.4)", () => {
  it("is spelled by spec 005's builder as catalog:PL", () => {
    expect(catalogTag("PL")).toBe("catalog:PL");
  });

  it("resolves catalog:PL to exactly Poland's listings and product pages, in every locale", async () => {
    const expected = await destinationPaths("PL");
    const products = (await listProductPages()).filter(
      (page) => page.countryIso === "PL",
    );
    // The case can fail: Poland has listings and product pages, in more than one locale.
    expect(products.length).toBeGreaterThan(0);
    expect(new Set(products.map((page) => page.locale)).size).toBeGreaterThan(
      1,
    );
    expect(await urlsForTag(catalogTag("PL"), options)).toEqual(
      [...new Set(expected)].map((path) => absoluteUrl(path, options)),
    );
  });

  it("contains Poland's shop root in every locale that has one", async () => {
    const roots = (await listingPages()).filter(
      (page) => page.countryIso === "PL" && page.pageType === "countryShopRoot",
    );
    const urls = await urlsForTag(catalogTag("PL"), options);
    expect(roots.length).toBeGreaterThan(0);
    for (const root of roots) {
      expect(urls).toContain(absoluteUrl(root.path, options));
    }
  });

  it("holds no other destination's page", async () => {
    const pl = new Set(await urlsForTag(catalogTag("PL"), options));
    const de = await destinationPaths("DE");
    for (const path of de) {
      expect(pl.has(absoluteUrl(path, options))).toBe(false);
    }
  });

  it("does not resolve a lower-case or unknown destination (compared as the builder spells it)", async () => {
    expect(await pathsForTag("catalog:pl")).toEqual([]);
    expect(await pathsForTag("catalog:ZZ")).toEqual([]);
  });

  it("leaves the home tag as it was (no catalogue page carries it)", async () => {
    expect(await pathsForTag(homeCacheTag("en"))).toEqual([
      localePath("en", "home"),
    ]);
  });
});

interface Recorder {
  readonly calls: string[];
  readonly lines: string[];
  readonly reports: { signal: string; fields: Record<string, unknown> }[];
}

function harness(
  edgeResult: () => Promise<{ ok: boolean }>,
  revalidate?: (path: string) => void,
): Recorder & { deps: Parameters<typeof invalidate>[1] } {
  const calls: string[] = [];
  const lines: string[] = [];
  const reports: Recorder["reports"] = [];
  const edge: CacheAdapter = {
    invalidate: (tags) => {
      calls.push(`edge:${tags.join(",")}`);
      return edgeResult();
    },
  };
  return {
    calls,
    lines,
    reports,
    deps: {
      edge,
      revalidate: (path) => {
        calls.push(`origin:${path}`);
        revalidate?.(path);
      },
      log: createLogger({ write: (line) => lines.push(line) }),
      report: (signal, fields) => reports.push({ signal, fields }),
    },
  };
}

const parsed = (lines: readonly string[]): Record<string, unknown>[] =>
  lines.map((line) => JSON.parse(line) as Record<string, unknown>);

describe("invalidate() — origin, then edge (spec 012 §5.4)", () => {
  it("revalidates every catalog:PL document, product pages by their route too, then purges the edge once", async () => {
    const run = harness(() => Promise.resolve({ ok: true }));
    const outcome = await invalidate(["catalog:PL"], run.deps);

    const paths = await pathsForTag("catalog:PL");
    const internal = paths
      .map((path) => productRoutePathFor(path))
      .filter((path): path is string => path !== null);
    expect(internal.length).toBeGreaterThan(0);
    const origin = run.calls.filter((call) => call.startsWith("origin:"));
    expect(new Set(origin)).toEqual(
      new Set([...paths, ...internal].map((path) => `origin:${path}`)),
    );
    // The edge comes last, once, with exactly the tag.
    expect(run.calls.at(-1)).toBe("edge:catalog:PL");
    expect(run.calls.filter((call) => call.startsWith("edge:"))).toHaveLength(
      1,
    );
    expect(outcome).toEqual({
      origin: "ok",
      edge: "ok",
      urlCount: paths.length,
    });
    expect(run.reports).toEqual([]);
    expect(parsed(run.lines)).toEqual([
      expect.objectContaining({
        level: "info",
        event: "cache.invalidate",
        tags: ["catalog:PL"],
        url_count: paths.length,
        origin: "ok",
        edge: "ok",
      }),
    ]);
    expect(run.lines[0]).not.toContain(BASE_URL);
    expect(run.lines[0]).not.toContain("/en/");
  });

  it("de-duplicates the tags it is given", async () => {
    const run = harness(() => Promise.resolve({ ok: true }));
    await invalidate(["home:en", "home:en"], run.deps);
    expect(run.calls).toEqual(["origin:/en", "edge:home:en"]);
  });

  it("an origin failure still purges the edge, then warns and reports with the tags", async () => {
    const run = harness(
      () => Promise.resolve({ ok: true }),
      () => {
        throw new Error("revalidatePath outside a request");
      },
    );
    const outcome = await invalidate(["catalog:PL"], run.deps);
    expect(outcome).toMatchObject({ origin: "failed", edge: "ok" });
    expect(run.calls.at(-1)).toBe("edge:catalog:PL");
    expect(run.reports).toEqual([
      {
        signal: CACHE_INVALIDATE_FAILED_SIGNAL,
        fields: { tags: ["catalog:PL"], origin: "failed", edge: "ok" },
      },
    ]);
    expect(parsed(run.lines)).toEqual([
      expect.objectContaining({
        level: "warn",
        event: "cache.invalidate",
        tags: ["catalog:PL"],
        origin: "failed",
        edge: "ok",
      }),
    ]);
  });

  it("an edge purge that did not land warns and reports with the tags", async () => {
    const run = harness(() => Promise.resolve({ ok: false }));
    const outcome = await invalidate(["catalog:PL"], run.deps);
    expect(outcome).toMatchObject({ origin: "ok", edge: "failed" });
    expect(run.reports).toEqual([
      {
        signal: CACHE_INVALIDATE_FAILED_SIGNAL,
        fields: { tags: ["catalog:PL"], origin: "ok", edge: "failed" },
      },
    ]);
    expect(parsed(run.lines)[0]).toMatchObject({
      level: "warn",
      edge: "failed",
    });
  });

  it("an edge adapter that rejects is a failure too, and invalidate() still resolves", async () => {
    const run = harness(() => Promise.reject(new Error("network")));
    await expect(invalidate(["catalog:PL"], run.deps)).resolves.toMatchObject({
      edge: "failed",
    });
    expect(run.reports).toHaveLength(1);
  });
});

describe("invalidate() with its production defaults (spec 012 §11)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    defaults.revalidated = [];
    defaults.warnings = [];
  });

  it("revalidates Poland's paths through revalidatePath and purges the edge through cache", async () => {
    const edge = vi.spyOn(cache, "invalidate").mockResolvedValue({ ok: true });
    await invalidate(["catalog:PL"]);

    const paths = await pathsForTag("catalog:PL");
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) expect(defaults.revalidated).toContain(path);
    expect(edge.mock.calls).toEqual([[["catalog:PL"]]]);
    expect(defaults.warnings).toEqual([]);
  });

  it("reports a failing edge to Sentry once, as cache.invalidate.failed with the tags", async () => {
    vi.spyOn(cache, "invalidate").mockResolvedValue({ ok: false });
    await invalidate(["catalog:PL"]);
    expect(defaults.warnings).toEqual([
      {
        signal: "cache.invalidate.failed",
        fields: { tags: ["catalog:PL"], origin: "ok", edge: "failed" },
      },
    ]);
  });
});
