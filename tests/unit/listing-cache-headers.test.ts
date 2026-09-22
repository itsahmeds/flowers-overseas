/**
 * The shared-cache header on listing responses, and the `robots.txt` parameter policy beside it
 * (spec 008 §5.4, §6, §13 **Q2**, **AC-15**, **AC-22**; T-15, T-22; ADR-0018; TASK-114).
 *
 * Asserted here rather than only in e2e for `src/lib/media-headers.ts`'s reason: a header written
 * in `next.config.ts` can be read as a value, so the exact string, the exact path shapes and the
 * fact that the config actually mounts them are provable with no server, no build and no network.
 * The served half (a real `Cache-Control` on a real response) is `tests/e2e/listing-params.spec.ts`.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { launchLocales, localeConfig } from "../../src/config/locales";
import {
  LISTING_CACHE_CONTROL,
  LISTING_CACHE_PATHS,
  listingCacheHeaderRules,
} from "../../src/lib/listing-cache-headers";
import { DISALLOWED_PATHS, robotsTxt } from "../../src/modules/seo";

describe("`Cache-Control` for the listing routes (§5.4, AC-22)", () => {
  it("is the string §5.4 prints, to the byte", () => {
    expect(LISTING_CACHE_CONTROL).toBe(
      "public, s-maxage=3600, stale-while-revalidate=86400",
    );
  });

  it("names every launch locale's own shop segment and no literal", () => {
    expect(LISTING_CACHE_PATHS).toStrictEqual(
      launchLocales.map(
        (locale) =>
          `/${locale}/:country/${localeConfig(locale).pathSegments.shopCategory}`,
      ),
    );
    // The German and Polish segments are the registry's, so a locale whose URL words change
    // brings its cache rule with it (`/de/:country/blumen`, `/pl/:country/kwiaty`).
    expect(LISTING_CACHE_PATHS).toContain("/de/:country/blumen");
    expect(LISTING_CACHE_PATHS).toContain("/pl/:country/kwiaty");
  });

  it("matches the country shop root and no other page type", () => {
    const matches = (source: string, path: string): boolean => {
      const pattern = new RegExp(
        `^${source.replace(/:[a-z]+/giu, "[^/]+")}$`,
        "u",
      );
      return pattern.test(path);
    };
    const anyMatch = (path: string): boolean =>
      LISTING_CACHE_PATHS.some((source) => matches(source, path));

    expect(anyMatch("/en/poland/flowers")).toBe(true);
    expect(anyMatch("/en-gb/poland/flowers")).toBe(true);
    expect(anyMatch("/pl/polska/kwiaty")).toBe(true);
    // The corridor page (third segment is the country), the category hub (the shop segment is
    // second, not third), the destinations hub, the locale home and TASK-110/111's depth-4
    // listing URLs are all prerendered: none may lose its own `Cache-Control` to this rule. The
    // depth-4 rows were hypothetical when this case was written and are live as of the 2026-09-22
    // rebase — those routes exist now, read no `searchParams`, and so must stay unmatched until
    // some task makes them dynamic. The two **hub** rows became live in the same rebase
    // (TASK-112): they are branches of the depth-3 route, prerendered for the same reason, and
    // the shape below is what keeps their ISR header theirs.
    for (const path of [
      "/en/send-flowers-to/poland",
      "/en/flowers/roses",
      "/en/occasions/mothers-day",
      "/en/send-flowers-to",
      "/en",
      "/en/poland/flowers/roses",
      "/de/polen/blumen/rosen",
    ]) {
      expect(anyMatch(path), path).toBe(false);
    }
  });

  it("is mounted by `next.config.ts` (asserted from source, as the CSP rules are)", () => {
    // `next.config.ts` calls `assertBuildEnv()` at import time, so the wiring is read rather
    // than imported — `tests/unit/csp.test.ts` establishes the pattern.
    const source = readFileSync(
      resolve(import.meta.dirname, "../../next.config.ts"),
      "utf8",
    );
    expect(source).toContain("listingCacheHeaderRules()");
    expect(source).toContain(
      'import { listingCacheHeaderRules } from "./src/lib/listing-cache-headers"',
    );
  });

  it("is one rule per path, with one header each", () => {
    const rules = listingCacheHeaderRules();
    expect(rules).toHaveLength(LISTING_CACHE_PATHS.length);
    for (const rule of rules) {
      expect(rule.headers).toStrictEqual([
        { key: "Cache-Control", value: LISTING_CACHE_CONTROL },
      ]);
    }
    // Fresh objects per call, like `noindexHeaderRules()` and `mediaHeaderRules()`.
    expect(listingCacheHeaderRules()[0]).not.toBe(rules[0]);
  });
});

describe("`robots.txt` and the parameter shapes (AC-15, spec 007 §14 A5)", () => {
  const indexing = robotsTxt({
    environment: "production",
    siteUrl: "https://flowersoverseas.com",
  });

  /**
   * AC-15 asks `robots.txt` to "list the facet parameter shapes and not block the sorted URLs";
   * spec 007 §14 **A5** ruled the opposite pairing and shipped it — **sort only** — because a
   * facet URL must be fetched for its `noindex` to be seen (`plan/02` §7), while a sort URL is in
   * no indexable set at all and an unbounded sort space is pure crawl waste. The brief carries
   * that ruling forward for this task ("`robots.txt` facet shapes follow spec 007 §14 A5"), so
   * this file **asserts the shipped rule** rather than changing it, and records the conflict so a
   * reader of AC-15 finds the answer instead of re-deriving it.
   */
  it("blocks the sort shape, lists no facet shape, and is otherwise unchanged", () => {
    expect(DISALLOWED_PATHS.filter((path) => path.includes("?"))).toStrictEqual(
      ["/*?*sort="],
    );
    expect(indexing).toContain("Disallow: /*?*sort=");
    for (const facet of ["colour", "price", "size", "page"]) {
      expect(indexing, facet).not.toContain(`${facet}=`);
    }
  });

  it("says nothing at all outside the indexing environment", () => {
    expect(
      robotsTxt({ environment: "preview", siteUrl: "https://preview.example" }),
    ).toBe("User-Agent: *\nDisallow: /\n\n");
  });
});
