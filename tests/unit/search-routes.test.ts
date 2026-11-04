/**
 * The search page's address and headers (spec 045 §5.2, §5.4, §6, AC-3's header and robots
 * halves; T-03's unit half; TASK-402), and its route file's metadata.
 *
 * The served-response half of AC-3 (status, the headers on a real `next start`, the sitemap
 * crawl) is the e2e suite's under `ci:full`; this file proves the rules that produce them: each
 * locale's search address is rewritten to the one per-request route and carries the three header
 * values, mounted after every rule that sets the same keys; `robots.txt` blocks none of the four
 * paths; the route's metadata is `noindex,follow`, canonical to the bare path, with no hreflang.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { LOCALES } from "../../src/config/locales.ts";
import {
  SEARCH_CACHE_CONTROL,
  SEARCH_REFERRER_POLICY,
  SEARCH_ROBOTS,
  SEARCH_ROUTE_SEGMENT,
  searchHeaderRules,
  searchRewriteRules,
} from "../../src/lib/search-routes.ts";
import { DISALLOWED_PATHS } from "../../src/modules/seo/robots.ts";

vi.mock("next-intl/server", () => ({
  setRequestLocale: (): void => undefined,
  getTranslations: ({ namespace }: { namespace: string }) =>
    Promise.resolve((key: string) => `${namespace}.${key}`),
}));

const ROOT = join(import.meta.dirname, "..", "..");
const PATHS = ["/en/search", "/en-gb/search", "/de/suche", "/pl/szukaj"];

/** A robots.txt rule as Google reads it: a prefix, `*` any run, `$` the end. */
function blocks(rule: string, path: string): boolean {
  const pattern = rule
    .split("")
    .map((char) =>
      char === "*"
        ? ".*"
        : char === "$"
          ? "$"
          : char.replace(/[.+?^{}()|[\]\\/]/gu, "\\$&"),
    )
    .join("");
  return new RegExp(`^${pattern}`, "u").test(path);
}

describe("the rewrite and the headers (AC-3)", () => {
  it("rewrites each launch locale's search address to the per-request route", () => {
    const rules = searchRewriteRules();
    expect(rules).toHaveLength(LOCALES.length);
    for (const path of PATHS) {
      const [, code, segment] = path.split("/");
      expect(rules).toContainEqual({
        source: `/:locale(${code ?? ""})/:search(${segment ?? ""})`,
        destination: `/:locale/${SEARCH_ROUTE_SEGMENT}`,
      });
    }
  });

  it("sets noindex, follow, private, no-store and strict-origin on every address and the route", () => {
    const rules = searchHeaderRules();
    const sources = rules.map((rule) => rule.source);
    for (const path of PATHS) {
      const [, code, segment] = path.split("/");
      expect(sources).toContain(
        `/:locale(${code ?? ""})/:search(${segment ?? ""})`,
      );
    }
    expect(sources).toContain(`/:locale/${SEARCH_ROUTE_SEGMENT}`);
    for (const rule of rules) {
      expect(rule.headers).toEqual([
        { key: "X-Robots-Tag", value: "noindex, follow" },
        { key: "Cache-Control", value: "private, no-store" },
        { key: "Referrer-Policy", value: "strict-origin" },
      ]);
    }
    expect([
      SEARCH_ROBOTS,
      SEARCH_CACHE_CONTROL,
      SEARCH_REFERRER_POLICY,
    ]).toEqual(["noindex, follow", "private, no-store", "strict-origin"]);
  });

  it("mounts the header rules after the security and environment rules, and the rewrite first", () => {
    const config = readFileSync(join(ROOT, "next.config.ts"), "utf8");
    const headers = config.slice(config.indexOf("const headerRules"));
    expect(headers.indexOf("...searchHeaderRules()")).toBeGreaterThan(
      headers.indexOf("...securityHeaderRules("),
    );
    expect(headers.indexOf("...searchHeaderRules()")).toBeGreaterThan(
      headers.indexOf("...noindexHeaderRules("),
    );
    const before = config.slice(config.indexOf("beforeFiles: ["));
    expect(before.indexOf("...searchRewriteRules()")).toBeLessThan(
      before.indexOf("...listingRewriteRules()"),
    );
  });

  it("robots.txt disallows none of the four paths, with or without q", () => {
    for (const path of PATHS) {
      for (const url of [path, `${path}?q=roses`]) {
        for (const rule of DISALLOWED_PATHS) {
          expect(blocks(rule, url), `${rule} ${url}`).toBe(false);
        }
      }
    }
    // The helper does block what it should (a red check for the check).
    expect(blocks("/search", "/search?q=x")).toBe(true);
  });
});

describe("the route's metadata (AC-3)", () => {
  it("is noindex,follow, canonical to the bare search path, no hreflang, the title never the query", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://flowersoverseas.com");
    const route =
      (await import("../../src/app/[locale]/-search/page.tsx")) as typeof import("../../src/app/[locale]/-search/page.tsx");
    expect(route.dynamic).toBe("force-dynamic");
    for (const path of PATHS) {
      const locale = path.split("/")[1] ?? "";
      const metadata = await route.generateMetadata({
        params: Promise.resolve({ locale }),
        searchParams: Promise.resolve({ q: "spam words" }),
      });
      expect(metadata.robots).toBe("noindex,follow");
      expect(String(metadata.alternates?.canonical)).toBe(
        `https://flowersoverseas.com${path}`,
      );
      expect(metadata.alternates?.languages).toBeUndefined();
      expect(metadata.title).toBe("search.meta.title");
      expect(JSON.stringify(metadata)).not.toContain("spam");
    }
    vi.unstubAllEnvs();
  });
});
