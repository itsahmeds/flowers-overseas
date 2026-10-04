/**
 * The Cloudflare edge as a visitor and a crawler meet it, on `staging.` (spec 040 §12 step 4;
 * AC-16 / T-16, AC-18 / T-18, AC-19 / T-19, AC-20 / T-20, AC-21 / T-21; TASK-101).
 *
 * The suite ignores `PLAYWRIGHT_BASE_URL`: it reads its own targets, and it never touches
 * production.
 *
 *  - `STAGING_URL`: staging **through Cloudflare** (`https://staging.flowersoverseas.com`). Unset,
 *    or not reachable from this runner → every case skips, naming why. Set to a production host
 *    → every case fails: this suite must not run there.
 *  - `STAGING_ORIGIN_URL`: the same deployment **directly**, its Railway domain (Railway → staging
 *    → `web` → Settings → Public Networking). Needed by the two byte-identity checks only.
 *  - `STAGING_BASIC_AUTH`: the wall's `user:password` (spec 040 AC-25), from the founder's shell,
 *    never from a file. Without it the documents answer 401 and the document cases skip.
 *  - `EDGE_HIT_URL`: the one opt-in to a cached host, for T-16's HIT half. Staging is never
 *    cached (a shared cache would serve its walled pages to anyone; TASK-101 E-4), so the HIT
 *    half runs at the cutover (TASK-104), on the host it names.
 *
 * Desktop project only: the rate-limit case trips a 10-second block per IP, and running the file
 * twice in one minute would make the second project's cases meaningless.
 *
 *     STAGING_URL=https://staging.flowersoverseas.com \
 *     STAGING_ORIGIN_URL=https://<staging's Railway domain> \
 *     STAGING_BASIC_AUTH="$STAGING_BASIC_AUTH" \
 *       pnpm exec playwright test --project=e2e-desktop tests/e2e/cloudflare-edge.spec.ts
 */
import { createHash } from "node:crypto";

import { type APIRequestContext, expect, test } from "@playwright/test";

const STAGING_URL = process.env.STAGING_URL ?? "";
const ORIGIN_URL = process.env.STAGING_ORIGIN_URL ?? "";
const CREDENTIAL = process.env.STAGING_BASIC_AUTH ?? "";
const EDGE_HIT_URL = process.env.EDGE_HIT_URL ?? "";

/** The hosts this suite refuses: production is never a test target here. */
const PRODUCTION_HOSTS = ["flowersoverseas.com", "www.flowersoverseas.com"];

/** `/`, a locale home and a corridor page (AC-18). */
const DOCUMENTS = ["/", "/en", "/en/send-flowers-to/poland"];
const CORRIDOR = "/en/send-flowers-to/poland";

/** The three cookies of spec 007 AC-23, as `corridor.spec.ts` sends them. */
const THREE_COOKIES =
  "fo_locale=de; fo_currency=PLN; fo_consent=%7B%22v%22%3A1%2C%22a%22%3Afalse%7D";

/** The six agents of AC-20, each as it identifies itself. */
const AGENTS: readonly (readonly [string, string])[] = [
  [
    "Googlebot",
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  ],
  [
    "Bingbot",
    "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
  ],
  [
    "ClaudeBot",
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
  ],
  [
    "GPTBot",
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.1; +https://openai.com/gptbot)",
  ],
  [
    "PerplexityBot",
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
  ],
  [
    "headless Chrome",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0.0.0 Safari/537.36",
  ],
];

/** Paths the bypass rule covers, bare and under locale prefixes (`config/cloudflare/edge.json`). */
const BYPASSED = [
  "/api/health",
  "/checkout",
  "/en/checkout",
  "/de/account",
  "/pl/admin",
  "/en-gb/track",
  "/vendor",
];

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
};

const sha256 = (bytes: Buffer): string =>
  createHash("sha256").update(bytes).digest("hex");

const [username = "", password = ""] = CREDENTIAL.split(":");

async function context(
  playwright: {
    request: { newContext: (options: object) => Promise<APIRequestContext> };
  },
  baseURL: string,
  headers: Record<string, string> = {},
): Promise<APIRequestContext> {
  return playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: headers,
    ...(CREDENTIAL === ""
      ? {}
      : { httpCredentials: { username, password, send: "always" } }),
  });
}

let unreachable = "";

test.describe
  .serial("the Cloudflare edge on staging (spec 040 AC-16, AC-18–AC-21)", () => {
  test.beforeAll(async ({}, testInfo) => {
    testInfo.skip(
      testInfo.project.name !== "e2e-desktop",
      "desktop project only: the rate-limit case blocks this IP for 10 seconds",
    );
    testInfo.skip(
      STAGING_URL === "",
      "STAGING_URL is not set: the edge checks run against staging. through Cloudflare only, never against production (spec 040 §12 step 4)",
    );
    if (PRODUCTION_HOSTS.includes(hostOf(STAGING_URL))) {
      throw new Error(
        `STAGING_URL names production (${hostOf(STAGING_URL)}): this suite never runs there`,
      );
    }
    try {
      const response = await fetch(new URL("/api/health", STAGING_URL), {
        signal: AbortSignal.timeout(10_000),
      });
      await response.arrayBuffer();
    } catch (error) {
      unreachable = `STAGING_URL (${hostOf(STAGING_URL)}) is not reachable from this runner (${error instanceof Error ? error.name : "unknown error"})`;
    }
    testInfo.skip(unreachable !== "", unreachable);
  });

  test("STAGING_URL is served through Cloudflare, not straight from the origin", async ({
    playwright,
  }) => {
    const edge = await context(playwright, STAGING_URL);
    const response = await edge.get("/api/health");
    expect(response.headers()["server"]).toBe("cloudflare");
    expect(response.headers()["cf-ray"]).toBeTruthy();
    await edge.dispose();
  });

  test("T-16: every dynamic path, bare and under a locale prefix, bypasses the cache", async ({
    playwright,
  }) => {
    const edge = await context(playwright, STAGING_URL);
    for (const path of BYPASSED) {
      for (const attempt of [1, 2]) {
        const response = await edge.get(path, { maxRedirects: 0 });
        expect(
          response.headers()["cf-cache-status"],
          `${path} (request ${String(attempt)})`,
        ).toBe("BYPASS");
      }
    }
    await edge.dispose();
  });

  test.describe("documents (need STAGING_BASIC_AUTH)", () => {
    test.beforeAll(({}, testInfo) => {
      testInfo.skip(
        CREDENTIAL === "",
        "STAGING_BASIC_AUTH is not set: staging's documents answer 401 behind the wall (AC-25)",
      );
    });

    test("T-18: the body through Cloudflare is byte-identical to the origin's, 3 URLs × {no cookies, three cookies}", async ({
      playwright,
    }) => {
      test.skip(
        ORIGIN_URL === "",
        "STAGING_ORIGIN_URL is not set: the origin side of the comparison is unknown",
      );
      for (const cookies of [{}, { cookie: THREE_COOKIES }]) {
        const edge = await context(playwright, STAGING_URL, cookies);
        const origin = await context(playwright, ORIGIN_URL, cookies);
        for (const path of DOCUMENTS) {
          const label = `${path} ${"cookie" in cookies ? "with" : "without"} the three cookies`;
          const [viaEdge, direct] = await Promise.all([
            edge.get(path, { maxRedirects: 0 }),
            origin.get(path, { maxRedirects: 0 }),
          ]);
          expect(viaEdge.status(), label).toBe(200);
          expect(direct.status(), label).toBe(200);
          expect(sha256(await viaEdge.body()), label).toBe(
            sha256(await direct.body()),
          );
        }
        await edge.dispose();
        await origin.dispose();
      }
    });

    test("T-19: robots.txt through Cloudflare is the origin's, byte for byte, with one Sitemap: line and Disallow: /", async ({
      playwright,
    }) => {
      test.skip(
        ORIGIN_URL === "",
        "STAGING_ORIGIN_URL is not set: the origin side of the comparison is unknown",
      );
      const edge = await context(playwright, STAGING_URL);
      const origin = await context(playwright, ORIGIN_URL);
      const viaEdge = await edge.get("/robots.txt");
      const direct = await origin.get("/robots.txt");
      expect(viaEdge.status()).toBe(200);
      const body = await viaEdge.body();
      expect(sha256(body)).toBe(sha256(await direct.body()));
      const lines = body.toString("utf8").split("\n");
      expect(lines.filter((line) => line.startsWith("Sitemap:"))).toHaveLength(
        1,
      );
      // Staging is never indexable (spec 040 AC-4, spec 007 AC-12).
      expect(lines).toContain("Disallow: /");
      await edge.dispose();
      await origin.dispose();
    });

    for (const [agent, userAgent] of AGENTS) {
      test(`T-20: ${agent} gets 200 and the document, with no challenge`, async ({
        playwright,
      }) => {
        const edge = await context(playwright, STAGING_URL, {
          "user-agent": userAgent,
        });
        const response = await edge.get(CORRIDOR, { maxRedirects: 0 });
        expect(response.status()).toBe(200);
        expect(response.headers()["cf-mitigated"]).toBeUndefined();
        expect(response.headers()["content-type"]).toContain("text/html");
        const html = await response.text();
        expect(html).toContain("<html");
        expect(html).not.toContain("/cdn-cgi/challenge-platform/");
        await edge.dispose();
      });
    }

    test("T-21: 100 GETs of distinct documents from one IP within a minute are all 200", async ({
      playwright,
    }) => {
      test.setTimeout(150_000);
      const edge = await context(playwright, STAGING_URL);
      const index = await edge.get("/sitemap.xml");
      expect(index.status()).toBe(200);
      const locs = (xml: string): string[] =>
        [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
          (match) => match[1] ?? "",
        );
      const paths = new Set<string>();
      for (const child of locs(await index.text())) {
        const sitemap = await edge.get(new URL(child).pathname);
        for (const url of locs(await sitemap.text())) {
          paths.add(new URL(url).pathname);
        }
      }
      const documents = [...paths].slice(0, 100);
      expect(
        documents,
        "the sitemaps list at least 100 documents",
      ).toHaveLength(100);

      const started = Date.now();
      const failures: string[] = [];
      for (const path of documents) {
        const response = await edge.get(path, { maxRedirects: 0 });
        if (response.status() !== 200) {
          failures.push(`${path} → ${String(response.status())}`);
        }
      }
      const elapsed = Date.now() - started;
      expect(failures).toEqual([]);
      expect(elapsed, "the 100 GETs fell within one minute").toBeLessThan(
        60_000,
      );
      await edge.dispose();
    });
  });

  // Last: it blocks this IP's /api/ requests for the rule's 10-second timeout.
  test("T-21: POSTs to /api/consent are rate-limited (429) within two 10-second windows", async ({
    playwright,
  }) => {
    test.setTimeout(90_000);
    const edge = await context(playwright, STAGING_URL);
    const statuses: number[] = [];
    // An unparsable decision: the origin answers 400 and records nothing (src/lib/consent.ts).
    for (let sent = 0; sent < 200 && !statuses.includes(429); sent += 1) {
      const response = await edge.post("/api/consent", {
        data: "{}",
        headers: { "content-type": "application/json" },
        maxRedirects: 0,
      });
      statuses.push(response.status());
    }
    const firstBlocked = statuses.indexOf(429);
    expect(firstBlocked, `statuses: ${statuses.join(",")}`).toBeGreaterThan(-1);
    // 10 requests per 10 seconds: a count that straddles two windows lets at most 20 through.
    expect(firstBlocked).toBeLessThanOrEqual(20);
    await edge.dispose();
  });
});

test.describe("T-16 HIT half: a cached host (opt-in, the cutover's)", () => {
  test.beforeAll(({}, testInfo) => {
    testInfo.skip(
      testInfo.project.name !== "e2e-desktop",
      "desktop project only",
    );
    testInfo.skip(
      EDGE_HIT_URL === "",
      "EDGE_HIT_URL is not set: staging is never cached (its basic-auth wall, TASK-101 E-4); the HIT half runs at the cutover (TASK-104) against the host it names",
    );
  });

  test("a corridor document is a HIT on the second request, with no Set-Cookie and no Vary", async ({
    playwright,
  }) => {
    const edge = await context(playwright, EDGE_HIT_URL);
    await edge.get(CORRIDOR);
    const second = await edge.get(CORRIDOR);
    expect(second.status()).toBe(200);
    expect(second.headers()["cf-cache-status"]).toBe("HIT");
    expect(second.headers()["set-cookie"]).toBeUndefined();
    expect(second.headers()["vary"]).toBeUndefined();
    await edge.dispose();
  });

  test("?utm_source=x is served from the same cache entry", () => {
    test.fixme(
      true,
      "TASK-101 E-1: excluding utm_*, gclid and fbclid from the cache key is an Enterprise-plan feature; open until the spec 040 ruling",
    );
  });
});
