/**
 * The basket's SEO and caching rules (spec 010 §14 A-founder-2026-10-22 items 8 and 12; AC-72
 * render half; T-72 unit half; TASK-349).
 *
 * `basket` is a registered `SeoPageType` whose policy is `"never"`; its metadata is a title and
 * `noindex,nofollow` with no canonical, no hreflang and nothing else; every basket response
 * carries `X-Robots-Tag: noindex, nofollow` and `Cache-Control: no-store, private`; `robots.txt`
 * disallows `/*\/basket` and the prefix blocks no catalogue URL. The served headers and meta are
 * TASK-208's e2e; `cf-cache-status` on staging is TASK-208's too.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { launchLocales } from "../../src/config/locales.ts";
import {
  BASKET_CACHE_HEADER,
  BASKET_ROBOTS_HEADER,
  basketHeaderRules,
} from "../../src/lib/transactional-headers.ts";
import {
  DISALLOWED_PATHS,
  PAGE_TYPE_POLICY,
  TRANSACTIONAL_PAGE_TYPES,
  TRANSACTIONAL_ROBOTS,
  pageIndexability,
  robotsTxt,
  transactionalMetadata,
} from "../../src/modules/seo";
import { listingPages } from "../../src/modules/catalog";

const ROOT = join(import.meta.dirname, "..", "..");

const INDEXING = {
  environment: "production",
  siteUrl: "https://flowersoverseas.com",
} as const;

/** The robots grammar our patterns use: literal prefix, `*` any sequence. */
function blocks(pattern: string, url: string): boolean {
  const escaped = pattern
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"))
    .join(".*");
  return new RegExp(`^${escaped}`, "u").test(url);
}

describe("the basket page type (AC-72)", () => {
  it("is registered, transactional and never indexable", () => {
    expect(PAGE_TYPE_POLICY.basket).toBe("never");
    expect([...TRANSACTIONAL_PAGE_TYPES]).toEqual(["basket"]);
  });

  it("answers noindex even with every data term true, in the indexing environment", () => {
    for (const code of launchLocales) {
      const verdict = pageIndexability(
        { pageType: "basket", locale: code, exists: true, reviewed: true },
        INDEXING,
      );
      expect(verdict.indexable, code).toBe(false);
    }
  });

  it("has a title and noindex,nofollow, and no canonical, hreflang or description", () => {
    expect(transactionalMetadata("basket", "Your basket")).toStrictEqual({
      title: "Your basket",
      robots: "noindex,nofollow",
    });
    expect(TRANSACTIONAL_ROBOTS).toBe("noindex,nofollow");
  });

  it("the route builds its metadata only from transactionalMetadata and emits no JSON-LD", () => {
    const route = readFileSync(
      join(ROOT, "src/app/[locale]/(checkout)/basket/page.tsx"),
      "utf8",
    );
    const view = readFileSync(
      join(ROOT, "src/app/[locale]/(checkout)/basket/BasketView.tsx"),
      "utf8",
    );
    expect(route).toContain('transactionalMetadata("basket"');
    expect(route).toContain('export const dynamic = "force-dynamic"');
    for (const source of [route, view]) {
      expect(source).not.toMatch(
        /alternates|canonical|application\/ld\+json|JsonLd/u,
      );
      // AC-76: nothing about the visitor but the basket cookie.
      expect(source).not.toMatch(
        /headers\(\)|accept-language|cf-ipcountry|x-vercel-ip-country|searchParams/iu,
      );
    }
  });
});

describe("every basket response's headers (AC-72)", () => {
  it("sets noindex, nofollow and no-store, private on the bare and the localised path", () => {
    expect(basketHeaderRules()).toEqual([
      {
        source: "/basket",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "no-store, private" },
        ],
      },
      {
        source: "/:locale/basket",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "no-store, private" },
        ],
      },
    ]);
    expect(BASKET_ROBOTS_HEADER.value).toBe("noindex, nofollow");
    expect(BASKET_CACHE_HEADER.value).toContain("no-store");
  });

  it("is wired into next.config after the environment-wide rule", () => {
    const config = readFileSync(join(ROOT, "next.config.ts"), "utf8");
    const noindex = config.indexOf("...noindexHeaderRules(environment)");
    const basket = config.indexOf("...basketHeaderRules()");
    expect(noindex).toBeGreaterThan(-1);
    expect(basket).toBeGreaterThan(noindex);
  });
});

describe("robots.txt disallows the basket and nothing a shopper must find (AC-72)", () => {
  it("prints Disallow: /*/basket in the indexing environment", () => {
    expect(DISALLOWED_PATHS).toContain("/*/basket");
    expect(robotsTxt(INDEXING).split("\n")).toContain("Disallow: /*/basket");
  });

  it("blocks the basket under every locale prefix", () => {
    for (const code of launchLocales) {
      expect(blocks("/*/basket", `/${code}/basket`), code).toBe(true);
    }
  });

  it("blocks no listing URL of the catalogue (no slug starts with `basket`)", async () => {
    for (const code of launchLocales) {
      for (const page of await listingPages(code)) {
        expect(blocks("/*/basket", page.path), page.path).toBe(false);
      }
    }
  });
});
