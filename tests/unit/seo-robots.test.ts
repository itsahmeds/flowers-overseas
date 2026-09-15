/**
 * T-13 — `robots.txt` in a non-indexing and an indexing environment (spec 007 §2, §6, §12, AC-12;
 * `plan/02` §7, §10; spec 001 AC-15; TASK-090).
 *
 * T-13 asks for three things and gets a fourth:
 *
 *  1. **both strings, byte for byte.** They are written out as literals in this file rather than
 *     rebuilt from the module's own constants: a test that composes the expected body from
 *     `DISALLOWED_PATHS` would pass whatever that array said, which is the one thing worth
 *     pinning. A change to either string has to be made twice, on purpose.
 *  2. **the disallow list against `plan/02` §7**, read from `tests/fixtures/seo/robots/plan-02-disallow.json`
 *     — the closed universe of paths the plan permits blocking, with the sentence each comes from.
 *     Our list must be a subset: robots.txt may block less than the plan allows (specs 008/010/013
 *     still have to add the locale-prefixed `checkout`/`search`/`track` segments), never more.
 *  3. **exactly one `Sitemap:` line** (`plan/02` §10 "robots.txt lists only /sitemap.xml").
 *  4. **no URL that must be crawled is blocked** — the fixture's `mustStayCrawlable` set is run
 *     through a robots.txt path matcher, because AC-12's "disallows no facet URL that must be
 *     crawled to see its `noindex`" is a statement about *matching*, not about string equality:
 *     `Disallow: /search` would also block `/search-results`, and `/*?*colour=` would block the
 *     facet URLs `plan/02` §7 insists stay fetchable.
 *
 * The non-indexing body is spec 001's `Disallow: /` unchanged, so the `X-Robots-Tag` header, the
 * root `noindex` meta and this file still say the same thing everywhere until the §12 flip.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import robots from "../../src/app/robots.ts";
import {
  DISALLOWED_PATHS,
  SITEMAP_PATH,
  robotsMetadataRoute,
  robotsPolicy,
  robotsTxt,
} from "../../src/modules/seo/index.ts";

const INDEXING = {
  environment: "production",
  siteUrl: "https://flowersoverseas.com",
} as const;

/** Every deployment that is not production-on-the-canonical-host (§6 "The environment gate"). */
const NON_INDEXING = [
  { environment: "development", siteUrl: "http://localhost:3000" },
  { environment: "test", siteUrl: "http://localhost:3000" },
  { environment: "preview", siteUrl: "https://fo-git-main.vercel.app" },
  { environment: "production", siteUrl: "https://flowers-overseas.vercel.app" },
] as const;

/**
 * The two bodies, byte for byte (T-13). The format is Next's own (`User-Agent:` capitalised, a
 * blank line closing the rule block, `Sitemap:` last) and the last describe block pins it against
 * Next's real serialiser, so these literals are what a crawler receives.
 */
const CLOSED_BODY = `User-Agent: *
Disallow: /

`;

const OPEN_BODY = `User-Agent: *
Allow: /
Disallow: /api/
Disallow: /admin/
Disallow: /vendor/
Disallow: /account/
Disallow: /checkout/
Disallow: /track/
Disallow: /search
Disallow: /dev/
Disallow: /*?*sort=

Sitemap: https://flowersoverseas.com/sitemap.xml
`;

interface DisallowFixture {
  readonly mayDisallow: readonly { readonly path: string }[];
  readonly mustStayCrawlable: readonly { readonly url: string }[];
}

const fixture = JSON.parse(
  readFileSync(
    resolve(__dirname, "../fixtures/seo/robots/plan-02-disallow.json"),
    "utf8",
  ),
) as DisallowFixture;

/**
 * Does a `Disallow` pattern match a URL path? The subset of the robots.txt grammar our patterns
 * use: a literal prefix, `*` as "any sequence" and `$` as end-of-URL. Implemented here rather than
 * imported so the assertion is independent of the module under test.
 */
function matches(pattern: string, url: string): boolean {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const escaped = body
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${escaped}${anchored ? "$" : ""}`).test(url);
}

describe("robotsTxt(): the two bodies (AC-12, T-13)", () => {
  it("is `Disallow: /` in every non-indexing environment (spec 001 AC-15 unchanged)", () => {
    for (const deployment of NON_INDEXING) {
      expect(robotsTxt(deployment)).toBe(CLOSED_BODY);
    }
  });

  it("carries the plan/02 §7 policy on production at the canonical host", () => {
    expect(robotsTxt(INDEXING)).toBe(OPEN_BODY);
  });

  it("opens for the `www.` form of the canonical host too", () => {
    expect(
      robotsTxt({
        environment: "production",
        siteUrl: "https://www.flowersoverseas.com",
      }),
    ).toBe(OPEN_BODY);
  });

  it("names exactly one sitemap, absolute, at /sitemap.xml (plan/02 §10)", () => {
    const sitemapLines = robotsTxt(INDEXING)
      .split("\n")
      .filter((line) => line.startsWith("Sitemap:"));
    expect(sitemapLines).toEqual([
      `Sitemap: https://flowersoverseas.com${SITEMAP_PATH}`,
    ]);
    expect(robotsTxt(NON_INDEXING[0])).not.toContain("Sitemap:");
  });

  it("announces nothing while the site is closed", () => {
    const closed = robotsPolicy(NON_INDEXING[3]);
    expect(closed.open).toBe(false);
    expect(closed.sitemap).toBeUndefined();
    expect(closed.allow).toEqual([]);
  });
});

describe("the disallow list against plan/02 §7 (AC-12, T-13)", () => {
  const permitted = new Set(fixture.mayDisallow.map((entry) => entry.path));

  it("is a subset of the paths plan/02 §7 permits blocking", () => {
    for (const path of DISALLOWED_PATHS) {
      expect(permitted).toContain(path);
    }
  });

  it("blocks no URL that must be crawled to see its `noindex`", () => {
    for (const { url } of fixture.mustStayCrawlable) {
      const blocking = DISALLOWED_PATHS.filter((pattern) =>
        matches(pattern, url),
      );
      expect(blocking, `${url} must stay crawlable`).toEqual([]);
    }
  });

  it("does block the paths it claims to (the matcher is not vacuous)", () => {
    const blocked = [
      "/api/health",
      "/admin/orders",
      "/vendor/payouts",
      "/account/settings",
      "/checkout/payment",
      "/track/abc123",
      "/search?q=roses",
      "/dev/components",
      "/en-gb/poland/flowers?sort=price-asc",
    ];
    for (const url of blocked) {
      expect(
        DISALLOWED_PATHS.some((pattern) => matches(pattern, url)),
        `${url} must be blocked`,
      ).toBe(true);
    }
  });

  it("lists each path once", () => {
    expect(new Set(DISALLOWED_PATHS).size).toBe(DISALLOWED_PATHS.length);
  });
});

describe("the route serves the same policy (AC-12)", () => {
  it("is spec 001's object in a non-indexing environment", () => {
    for (const deployment of NON_INDEXING) {
      expect(robotsMetadataRoute(deployment)).toEqual({
        rules: [{ userAgent: "*", disallow: "/" }],
      });
    }
  });

  it("is the open policy, with the same paths as the body, at the canonical host", () => {
    expect(robotsMetadataRoute(INDEXING)).toEqual({
      rules: [
        {
          userAgent: "*",
          allow: ["/"],
          disallow: [...DISALLOWED_PATHS],
        },
      ],
      sitemap: `https://flowersoverseas.com${SITEMAP_PATH}`,
    });
  });

  it("`src/app/robots.ts` reads the environment and stays closed under test", () => {
    expect(robots()).toEqual({ rules: [{ userAgent: "*", disallow: "/" }] });
  });

  /**
   * The string this file asserts and the object the route returns are two representations of one
   * policy, and **Next writes the file**: the metadata route is serialised at build time by
   * `resolveRobots()`. Asserting `robotsTxt()` against that function — the real one, imported from
   * the installed Next — is what makes "the two exact strings" a statement about what a crawler
   * receives. A Next release that changed the format fails here, loudly, instead of silently
   * shipping a `robots.txt` no test describes.
   */
  it("serialises exactly as Next serialises the metadata route (T-13)", async () => {
    const { resolveRobots } =
      await import("next/dist/build/webpack/loaders/metadata/resolve-route-data.js");
    for (const deployment of [INDEXING, ...NON_INDEXING]) {
      expect(resolveRobots(robotsMetadataRoute(deployment))).toBe(
        robotsTxt(deployment),
      );
    }
  });
});
