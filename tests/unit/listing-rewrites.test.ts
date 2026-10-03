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

import { describe, expect, it } from "vitest";

import { FACET_PARAMETERS } from "../../src/config/catalogue/schemas";
import { launchLocales, localeConfig } from "../../src/config/locales";
import { QUERY_KEYS } from "../../src/config/url-keys";
import { LISTING_CACHE_PATHS } from "../../src/lib/listing-cache-headers";
import {
  LISTING_REWRITE_KEYS,
  PARAMETER_ROUTE_SEGMENT,
  listingRewriteRules,
} from "../../src/lib/listing-rewrites";
import { listingRequest } from "../../src/modules/catalog";

/** Next's path-to-regexp for a one-segment `:name`, enough for these sources. */
const matches = (source: string, path: string): boolean =>
  new RegExp(`^${source.replace(/:[a-z]+/giu, "[^/]+")}$`, "u").test(path);

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

  it("is one rule per launch locale and key, from the country shop root to the parameter route", () => {
    const rules = listingRewriteRules();
    expect(rules).toHaveLength(
      launchLocales.length * LISTING_REWRITE_KEYS.length,
    );
    for (const locale of launchLocales) {
      const shop = localeConfig(locale).pathSegments.shopCategory;
      const mine = rules.filter((rule) =>
        rule.source.startsWith(`/${locale}/`),
      );
      expect(
        mine.map((rule) => rule.has[0].key),
        locale,
      ).toStrictEqual([...LISTING_REWRITE_KEYS]);
      for (const rule of mine) {
        expect(rule.source).toBe(`/${locale}/:country/${shop}`);
        expect(rule.destination).toBe(
          `/${locale}/${PARAMETER_ROUTE_SEGMENT}/:country/${shop}`,
        );
        expect(rule.has).toStrictEqual([
          { type: "query", key: rule.has[0].key },
        ]);
      }
    }
    // Fresh objects per call, like the header rules.
    expect(listingRewriteRules()[0]).not.toBe(rules[0]);
  });

  it("matches the shapes the shared-cache header names, and no other page type", () => {
    // The parameterised response must carry the listing's `Cache-Control`, and that rule is
    // matched on the address the visitor asked for — so the two must name the same shapes.
    expect([
      ...new Set(listingRewriteRules().map((rule) => rule.source)),
    ]).toStrictEqual([...LISTING_CACHE_PATHS]);
    const anyMatch = (path: string): boolean =>
      listingRewriteRules().some((rule) => matches(rule.source, path));
    expect(anyMatch("/en/poland/flowers")).toBe(true);
    expect(anyMatch("/de/polen/blumen")).toBe(true);
    // The corridor, the hubs and depth 4 never leave their prebuilt route, whatever the query.
    for (const path of [
      "/en/send-flowers-to/poland",
      "/en/flowers/roses",
      "/en/occasions/mothers-day",
      "/en/poland/flowers/roses",
      "/en/poland/product/amber-hour",
      "/fr/poland/flowers",
    ]) {
      expect(anyMatch(path), path).toBe(false);
    }
  });

  it("points at a route that exists, under a segment no slug can take", () => {
    // `%5F` is how Next spells a leading underscore in a folder name; a slug never starts with
    // one, so the internal segment cannot shadow a page at any depth.
    expect(PARAMETER_ROUTE_SEGMENT).toBe("_query");
    expect(
      existsSync(
        resolve(
          import.meta.dirname,
          "../../src/app/[locale]/%5Fquery/[segment]/[child]/page.tsx",
        ),
      ),
    ).toBe(true);
  });

  it("is mounted by `next.config.ts` as `beforeFiles` (asserted from source)", () => {
    // `next.config.ts` calls `assertBuildEnv()` at import time, so the wiring is read rather
    // than imported — `tests/unit/csp.test.ts` establishes the pattern.
    const source = readFileSync(
      resolve(import.meta.dirname, "../../next.config.ts"),
      "utf8",
    );
    expect(source).toContain(
      'import { listingRewriteRules } from "./src/lib/listing-rewrites"',
    );
    expect(source).toMatch(/beforeFiles:\s*listingRewriteRules\(\)/u);
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
