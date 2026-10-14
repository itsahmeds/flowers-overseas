/**
 * The listing rewrite (spec 003 AC-8, spec 008 §5.4, §13 Q2, Q6, AC-15; TASK-170).
 *
 * A request to a country shop root that carries a parameter the listing honours goes to the
 * internal parameter route, so no route file reads the query string and the depth-3 route stays
 * prebuilt — the condition for the router's `dynamicParams = false` gate, and so for the localised
 * 404 document, at that depth (TASK-170 E-1). Asserted as values, like
 * `tests/unit/listing-cache-headers.test.ts`: the exact sources, keys and destinations, and the
 * fact that `next.config.ts` mounts them. The served half — the query reaching the parameter
 * route, an unknown parameter getting the prebuilt page, the 404 shapes — is
 * `tests/e2e/listing-params.spec.ts` and `tests/e2e/locale-routing.spec.ts`.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FACET_PARAMETERS } from "../../src/config/catalogue/schemas";
import { LOCALES, launchLocales } from "../../src/config/locales";
import { QUERY_KEYS } from "../../src/config/url-keys";
import { LISTING_CACHE_PATHS } from "../../src/lib/listing-cache-headers";
import {
  LISTING_REWRITE_KEYS,
  LISTING_REWRITE_LOCALES,
  PARAMETER_ROUTE_HEADER_SOURCE,
  PARAMETER_ROUTE_ROBOTS,
  PARAMETER_ROUTE_SEGMENT,
  PARAMETERISED_HUB_ROBOTS,
  listingRewriteRules,
  parameterRouteHeaderRules,
  parameterisedHubHeaderRules,
} from "../../src/lib/listing-rewrites";
import {
  listingLocales,
  listingRequest,
  resolveLocalePath,
} from "../../src/modules/catalog";

/**
 * **Next's own matcher**, built the way `buildCustomRoute()` builds a rewrite
 * (`next/dist/server/lib/router-utils/filesystem.js`): `strict`, unnamed params removed, and
 * `sensitive: false` — Next's default unless `experimental.caseSensitiveRoutes` is set, which this
 * config does not set. A hand-rolled regex here was case-sensitive and so could not see
 * `/break 143` hole 1 (`/EN/poland/FLOWERS?page=2` rewritten and served page 2).
 */
const nextMatch = (
  source: string,
  path: string,
): Record<string, string> | false => {
  const match = getPathMatch(source, {
    strict: true,
    removeUnnamedParams: true,
    sensitive: false,
  })(path);
  return match === false ? false : (match as Record<string, string>);
};

/** The destination a matched rule rewrites to: each `:name` replaced by its captured value. */
const destinationOf = (
  destination: string,
  params: Record<string, string>,
): string =>
  destination.replace(/:([a-z]+)/giu, (_, name: string) => params[name] ?? "");

/** The first rule that rewrites `path` (with a listing key on it), and where it sends it. */
const rewrite = (path: string): string | undefined => {
  for (const rule of listingRewriteRules()) {
    const params = nextMatch(rule.source, path);
    if (params !== false) return destinationOf(rule.destination, params);
  }
  return undefined;
};

describe("the listing rewrite (TASK-170)", () => {
  it("is keyed on exactly the listing's honoured keys and the six facet names", () => {
    expect([...LISTING_REWRITE_KEYS].sort()).toStrictEqual(
      [
        "page",
        "sort",
        "product-type",
        "occasion",
        "flower-type",
        "colour",
        "price-tier",
        "style",
      ].sort(),
    );
    // From the registries, not retyped: a new honoured key or facet brings its rule with it.
    expect(LISTING_REWRITE_KEYS).toStrictEqual([
      ...QUERY_KEYS,
      ...Object.values(FACET_PARAMETERS),
    ]);
    // A campaign or click id is answered by the prebuilt page (canonical stripping, spec 007
    // §14 A5): rewriting it would render per request for a page that is byte-for-byte the bare one.
    for (const key of ["utm_source", "gclid", "fbclid", "q"]) {
      expect(LISTING_REWRITE_KEYS, key).not.toContain(key);
    }
  });

  it("is three rules per routed listing locale and key, carrying the visitor's own spelling", () => {
    const rules = listingRewriteRules();
    expect(rules).toHaveLength(
      3 * LISTING_REWRITE_LOCALES.length * LISTING_REWRITE_KEYS.length,
    );
    for (const config of LOCALES.filter((locale) =>
      LISTING_REWRITE_LOCALES.includes(locale.code),
    )) {
      const shop = config.pathSegments.shopCategory;
      const occasions = config.pathSegments.occasions;
      const mine = rules.filter((rule) =>
        rule.source.startsWith(`/:locale(${config.code})/`),
      );
      // The three shapes (spec 008 §14 A13; A15 (a) adds the two depth-4 ones), each with its
      // destination, each keyed on every listing key.
      const shapes = [
        [
          `/:locale(${config.code})/:country/:shop(${shop})`,
          `/:locale/${PARAMETER_ROUTE_SEGMENT}/:country/:shop`,
        ],
        [
          `/:locale(${config.code})/:country/:shop(${shop})/:entity`,
          `/:locale/${PARAMETER_ROUTE_SEGMENT}/:country/:shop/:entity`,
        ],
        [
          `/:locale(${config.code})/:country/:occ(${occasions})/:entity`,
          `/:locale/${PARAMETER_ROUTE_SEGMENT}/:country/:occ/:entity`,
        ],
      ] as const;
      for (const [source, destination] of shapes) {
        const ofShape = mine.filter((rule) => rule.source === source);
        expect(
          ofShape.map((rule) => rule.has[0].key),
          `${config.code} ${source}`,
        ).toStrictEqual([...LISTING_REWRITE_KEYS]);
        for (const rule of ofShape) {
          // The captured values, never the registry's literals: the destination is what the
          // visitor typed, so the parameter route's strict resolver judges the visitor's casing.
          expect(rule.destination).toBe(destination);
          expect(rule.has).toStrictEqual([
            { type: "query", key: rule.has[0].key },
          ]);
        }
      }
      expect(mine, config.code).toHaveLength(
        shapes.length * LISTING_REWRITE_KEYS.length,
      );
    }
    // Fresh objects per call, like the header rules.
    expect(listingRewriteRules()[0]).not.toBe(rules[0]);
  });

  it("sends an uppercase address to a destination the parameter route refuses (`/break 143` hole 1)", async () => {
    // Next matches case-insensitively, so these **are** rewritten…
    for (const [path, destination] of [
      ["/EN/poland/flowers", "/EN/_query/poland/flowers"],
      ["/en/poland/FLOWERS", "/en/_query/poland/FLOWERS"],
      ["/DE/polen/BLUMEN", "/DE/_query/polen/BLUMEN"],
    ] as const) {
      expect(rewrite(path), path).toBe(destination);
      // …and the resolver the parameter route calls answers the visitor's spelling 404, the
      // same answer the router gives the bare uppercase address.
      const [, locale = "", , country = "", shop = ""] = destination.split("/");
      expect(
        (await resolveLocalePath(locale, [country, shop])).kind,
        path,
      ).toBe("notFound");
    }
    // The canonical lowercase address is the one that resolves.
    const [, locale = "", , country = "", shop = ""] = (
      rewrite("/en/poland/flowers") ?? ""
    ).split("/");
    expect((await resolveLocalePath(locale, [country, shop])).kind).toBe(
      "countryShopRoot",
    );
  });

  it("covers every shape the shared-cache header names, and no other page type", () => {
    // The parameterised response must carry the listing's `Cache-Control`, matched on the address
    // the visitor asked for — so every cached shape must also be a rewritten one.
    for (const cached of LISTING_CACHE_PATHS) {
      expect(
        rewrite(cached.replace(":country", "poland")),
        cached,
      ).toBeDefined();
    }
    expect(rewrite("/en/poland/flowers")).toBe("/en/_query/poland/flowers");
    expect(rewrite("/de/polen/blumen")).toBe("/de/_query/polen/blumen");
    // Depth 4 (spec 008 §14 A15 (a)): the country category and the country occasion.
    expect(rewrite("/en-gb/poland/flowers/roses")).toBe(
      "/en-gb/_query/poland/flowers/roses",
    );
    expect(rewrite("/en/poland/occasions/mothers-day")).toBe(
      "/en/_query/poland/occasions/mothers-day",
    );
    expect(rewrite("/pl/polska/okazje/dzien-matki")).toBe(
      "/pl/_query/polska/okazje/dzien-matki",
    );
    // The corridor, the hubs and the product page never leave their prebuilt route, whatever
    // the query: a product URL's `?tier=`/`?date=` are TASK-128's.
    for (const path of [
      "/en/send-flowers-to/poland",
      "/en/flowers/roses",
      "/en/occasions/mothers-day",
      "/en/poland/product/amber-hour",
      "/de/polen/produkt/amber-hour",
      "/en/poland/flowers/roses/extra",
      "/fr/poland/flowers",
      "/fr/poland/flowers/roses",
    ]) {
      expect(rewrite(path), path).toBeUndefined();
    }
  });

  it("sends every depth-4 listing that exists to a destination the depth-4 parameter route resolves", async () => {
    // The served half of A15 (a): what the rewrite captures is what `resolveLocalePath()` reads.
    for (const [path, kind] of [
      ["/en-gb/poland/flowers/roses", "countryCategory"],
      ["/en/poland/occasions/mothers-day", "countryOccasion"],
    ] as const) {
      const [, locale = "", , ...segments] = (rewrite(path) ?? "").split("/");
      expect((await resolveLocalePath(locale, segments)).kind, path).toBe(kind);
    }
    // An uppercase shop segment is rewritten and refused, as at depth 3.
    const [, locale = "", , ...segments] = (
      rewrite("/en/poland/FLOWERS/roses") ?? ""
    ).split("/");
    expect((await resolveLocalePath(locale, segments)).kind).toBe("notFound");
  });

  it("points at a route that exists, under a segment no slug can take", () => {
    // `%5F` is how Next spells a leading underscore in a folder name; a slug never starts with
    // one, so the internal segment cannot shadow a page at any depth.
    expect(PARAMETER_ROUTE_SEGMENT).toBe("_query");
    for (const route of [
      "../../src/app/[locale]/%5Fquery/[segment]/[child]/page.tsx",
      "../../src/app/[locale]/%5Fquery/[segment]/[child]/[grandchild]/page.tsx",
    ]) {
      expect(existsSync(resolve(import.meta.dirname, route)), route).toBe(true);
    }
  });

  it("is mounted by `next.config.ts` as `beforeFiles` (asserted from source)", () => {
    // `next.config.ts` calls `assertBuildEnv()` at import time, so the wiring is read rather
    // than imported — `tests/unit/csp.test.ts` establishes the pattern.
    const source = readFileSync(
      resolve(import.meta.dirname, "../../next.config.ts"),
      "utf8",
    );
    expect(source).toMatch(
      /import \{[^}]*\blistingRewriteRules\b[^}]*\} from "\.\/src\/lib\/listing-rewrites"/u,
    );
    expect(source).toMatch(/beforeFiles:\s*listingRewriteRules\(\)/u);
  });
});

describe("the rewrite's locales are the prebuilt shop roots' locales (`/break 143` hole 2)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("equals `listingLocales()` in this environment", () => {
    expect(LISTING_REWRITE_LOCALES).toStrictEqual([...listingLocales()]);
    for (const locale of launchLocales) {
      expect(LISTING_REWRITE_LOCALES, locale).toContain(locale);
    }
  });

  it("equals `listingLocales()` with the pseudo-locales routed, as in CI and on previews", async () => {
    vi.stubEnv("ENABLE_PSEUDO_LOCALES", "true");
    vi.resetModules();
    const rewrites = await import("../../src/lib/listing-rewrites");
    const catalog = await import("../../src/modules/catalog");
    expect(rewrites.LISTING_REWRITE_LOCALES).toStrictEqual([
      ...catalog.listingLocales(),
    ]);
    // The subject this case exists for: a pseudo-locale's parameters are honoured.
    expect(rewrites.LISTING_REWRITE_LOCALES).toContain("ar-XB");
    expect(rewrites.LISTING_REWRITE_LOCALES).toContain("en-XA");
    const arXB = rewrites
      .listingRewriteRules()
      .filter((rule) => rule.source.startsWith("/:locale(ar-XB)/"));
    // Three shapes (the shop root and the two depth-4 listings), each keyed on every key.
    expect(arXB.map((rule) => rule.has[0].key)).toStrictEqual([
      ...rewrites.LISTING_REWRITE_KEYS,
      ...rewrites.LISTING_REWRITE_KEYS,
      ...rewrites.LISTING_REWRITE_KEYS,
    ]);
  });
});

describe("the parameter route's own robots header (`/review 143`, TASK-170)", () => {
  /** A header source matched as Next matches it (same matcher, same options as a rewrite). */
  const headerMatches = (source: string, path: string): boolean =>
    nextMatch(source, path) !== false;

  it("matches a direct request to the internal path, and no address a visitor uses", () => {
    expect(PARAMETER_ROUTE_HEADER_SOURCE).toBe("/:locale/_query/:path*");
    for (const direct of [
      "/en/_query/poland/flowers",
      "/de/_query/polen/blumen",
      "/ar-XB/_query/poland/flowers",
    ]) {
      expect(headerMatches(PARAMETER_ROUTE_HEADER_SOURCE, direct), direct).toBe(
        true,
      );
    }
    // The addresses the rewrite serves from the parameter route keep their own path, which is
    // what the header source is matched against — so they never get this header.
    for (const cached of LISTING_CACHE_PATHS) {
      const visitor = cached.replace(":country", "poland");
      expect(rewrite(visitor), visitor).toBeDefined();
      expect(
        headerMatches(PARAMETER_ROUTE_HEADER_SOURCE, visitor),
        visitor,
      ).toBe(false);
    }
  });

  it("says `noindex, nofollow`, distinguishable from the environment's bare `noindex`", () => {
    expect(PARAMETER_ROUTE_ROBOTS).toBe("noindex, nofollow");
    expect(parameterRouteHeaderRules()).toStrictEqual([
      {
        source: PARAMETER_ROUTE_HEADER_SOURCE,
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ]);
    expect(parameterRouteHeaderRules()[0]).not.toBe(
      parameterRouteHeaderRules()[0],
    );
  });

  it("is mounted by `next.config.ts` after the environment's noindex rule (asserted from source)", () => {
    const source = readFileSync(
      resolve(import.meta.dirname, "../../next.config.ts"),
      "utf8",
    );
    const environment = source.indexOf("...noindexHeaderRules(environment)");
    const mine = source.indexOf("...parameterRouteHeaderRules()");
    expect(environment).toBeGreaterThan(-1);
    // Later rules win for the same key, so this order is what makes a direct hit's value ours.
    expect(mine).toBeGreaterThan(environment);
  });
});

describe("`listingRequest().keys`: what the parameter route's guard reads (TASK-170)", () => {
  it("lists every parameter name the request carried, honoured or not, and nothing else", () => {
    expect(listingRequest().keys).toStrictEqual([]);
    expect(listingRequest({ page: "2" }).keys).toStrictEqual(["page"]);
    // A malformed `page` is neutralised, but it was still carried.
    expect(listingRequest({ page: "abc" }).keys).toStrictEqual(["page"]);
    expect(
      listingRequest({ utm_source: "x", sort: "price-asc", colour: "red" })
        .keys,
    ).toStrictEqual(["colour", "sort", "utm_source"]);
    expect(
      listingRequest(new URLSearchParams("gclid=1&page=3")).keys,
    ).toStrictEqual(["gclid", "page"]);
  });
});

describe("the parameterised hub's robots header (TASK-146, TASK-114 E-7)", () => {
  /** The header value Next would serve for `path` with `key` in its query, or `undefined`. */
  const hubHeader = (path: string, key: string): string | undefined => {
    for (const rule of parameterisedHubHeaderRules()) {
      if (rule.has[0].key !== key) continue;
      if (nextMatch(rule.source, path) !== false) return rule.headers[0]?.value;
    }
    return undefined;
  };

  it("says `noindex, follow`, distinguishable from the environment's and the parameter route's", () => {
    expect(PARAMETERISED_HUB_ROBOTS).toBe("noindex, follow");
    expect(PARAMETERISED_HUB_ROBOTS).not.toBe(PARAMETER_ROUTE_ROBOTS);
    for (const rule of parameterisedHubHeaderRules()) {
      expect(rule.headers).toStrictEqual([
        { key: "X-Robots-Tag", value: "noindex, follow" },
      ]);
    }
    expect(parameterisedHubHeaderRules()[0]).not.toBe(
      parameterisedHubHeaderRules()[0],
    );
  });

  it("covers both hub shapes, in every routed locale, for every listing key", () => {
    for (const config of LOCALES.filter((locale) =>
      LISTING_REWRITE_LOCALES.includes(locale.code),
    )) {
      for (const segment of [
        config.pathSegments.shopCategory,
        config.pathSegments.occasions,
      ]) {
        for (const key of LISTING_REWRITE_KEYS) {
          expect(
            hubHeader(`/${config.code}/${segment}/some-entity`, key),
            `${config.code} ${segment} ${key}`,
          ).toBe("noindex, follow");
        }
      }
    }
    expect(hubHeader("/en/flowers/roses", "colour")).toBe("noindex, follow");
    expect(hubHeader("/de/anlaesse/muttertag", "sort")).toBe("noindex, follow");
  });

  it("names no other page type, and no parameter outside the listing keys", () => {
    // The country pages answer their own robots through the parameter route; the corridor, the
    // product page and a campaign id are not this rule's.
    for (const path of [
      "/en/poland/flowers",
      "/en/poland/flowers/roses",
      "/en/poland/occasions/birthday",
      "/en/send-flowers-to/poland",
      "/en/poland/product/amber-hour",
      "/en/occasions",
      "/en",
    ]) {
      for (const key of LISTING_REWRITE_KEYS) {
        expect(hubHeader(path, key), `${path} ${key}`).toBeUndefined();
      }
    }
    expect(hubHeader("/en/flowers/roses", "utm_source")).toBeUndefined();
    // A hub address is never rewritten: it keeps its prebuilt document (E-7).
    expect(rewrite("/en/flowers/roses")).toBeUndefined();
  });

  it("is mounted by `next.config.ts` after the environment's noindex rule (asserted from source)", () => {
    const source = readFileSync(
      resolve(import.meta.dirname, "../../next.config.ts"),
      "utf8",
    );
    const environment = source.indexOf("...noindexHeaderRules(environment)");
    const mine = source.indexOf("...parameterisedHubHeaderRules()");
    expect(environment).toBeGreaterThan(-1);
    expect(mine).toBeGreaterThan(environment);
  });
});
