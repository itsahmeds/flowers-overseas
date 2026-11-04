/**
 * Search abuse protection (spec 045 §2.8, §2.7 "Rate limited", §11, AC-26; T-26; TASK-403).
 *
 * T-26 is an integration test with an injected clock: the limiter itself (61st results request,
 * 121st suggest request, a second address, 33 in flight, two process starts), then the proxy that
 * wears it (the status, `Retry-After`, the rewrite to the results route with the proxy's own
 * request header, the `search.rate_limited` line), then the page it hands the request to (the
 * resolved `search.rateLimited`, the form, nothing searched). "No log line, table or file holds
 * either address" is read off every line the proxy writes and off the limiter's source.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { NextRequest } from "next/server";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SEARCH_CONFIG } from "../../src/config/search.ts";
import { MESSAGE_NAMESPACES } from "../../src/modules/i18n/messages.ts";
import { loadMessages } from "../../src/modules/i18n/index.ts";
import {
  CONCURRENCY_RETRY_AFTER_SECONDS,
  type RateLimiter,
  SEARCH_GATE_HEADER,
  SearchResultsPage,
  installSearchGate,
  rateLimiter,
  searchRoutePage,
} from "../../src/modules/search/index.ts";
import { proxy } from "../../src/proxy.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const ORIGIN = "https://example.com";
const ADDRESS_A = "203.0.113.7";
const ADDRESS_B = "2001:db8::42";
const { resultsPerMinute, suggestPerMinute, maxConcurrent } =
  SEARCH_CONFIG.rateLimit;

/** A clock the test moves. */
function clock(start = 1_700_000_000_000): {
  now: () => number;
  advance: (ms: number) => void;
} {
  let time = start;
  return { now: () => time, advance: (ms) => (time += ms) };
}

let lines: string[] = [];

beforeEach(() => {
  lines = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    lines.push(String(chunk));
    return true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  installSearchGate(rateLimiter());
});

function call(
  path: string,
  headers: Record<string, string> = {},
): Response & { headers: Headers } {
  return proxy(new NextRequest(new Request(`${ORIGIN}${path}`, { headers })));
}

describe("rateLimiter() (AC-26)", () => {
  it("admits 60 results requests a minute from one address and answers the 61st 429 with Retry-After", () => {
    const time = clock();
    const limiter = rateLimiter(undefined, time.now);
    for (let n = 1; n <= resultsPerMinute; n += 1) {
      expect(limiter.admit(ADDRESS_A, "results"), `request ${n}`).toEqual({
        admitted: true,
      });
      time.advance(500);
    }
    // 60 requests took 30 s of the window: 30 s are left.
    expect(limiter.admit(ADDRESS_A, "results")).toEqual({
      admitted: false,
      status: 429,
      retryAfterSeconds: 30,
      reason: "client",
    });
    // A second address in the same window is untouched.
    expect(limiter.admit(ADDRESS_B, "results")).toEqual({ admitted: true });
    // The window ends: the first address is admitted again.
    time.advance(30_000);
    expect(limiter.admit(ADDRESS_A, "results")).toEqual({ admitted: true });
  });

  it("admits 120 suggest requests a minute and answers the 121st 429, in its own bucket", () => {
    const time = clock();
    const limiter = rateLimiter(undefined, time.now);
    for (let n = 1; n <= suggestPerMinute; n += 1) {
      expect(limiter.admit(ADDRESS_A, "suggest").admitted, `${n}`).toBe(true);
    }
    const refused = limiter.admit(ADDRESS_A, "suggest");
    expect(refused).toMatchObject({ admitted: false, status: 429 });
    expect(limiter.admit(ADDRESS_A, "results")).toEqual({ admitted: true });
  });

  it("answers 503 with Retry-After: 5 while 32 searches are in flight, and admits again when one ends", () => {
    const limiter = rateLimiter(undefined, clock().now);
    for (let n = 1; n <= maxConcurrent; n += 1) {
      expect(limiter.enter(), `search ${n}`).toBe(true);
    }
    expect(limiter.inFlight()).toBe(32);
    expect(limiter.enter()).toBe(false);
    expect(limiter.admit(ADDRESS_A, "results")).toEqual({
      admitted: false,
      status: 503,
      retryAfterSeconds: CONCURRENCY_RETRY_AFTER_SECONDS,
      reason: "concurrency",
    });
    expect(CONCURRENCY_RETRY_AFTER_SECONDS).toBe(5);
    limiter.leave();
    expect(limiter.admit(ADDRESS_A, "results")).toEqual({ admitted: true });
  });

  it("keys an address by an HMAC under a per-process secret: two starts key it differently, neither key holds it", () => {
    const first = rateLimiter();
    const second = rateLimiter();
    const one = first.clientKey(ADDRESS_A);
    expect(one).toBe(first.clientKey(ADDRESS_A));
    expect(second.clientKey(ADDRESS_A)).not.toBe(one);
    for (const key of [one, second.clientKey(ADDRESS_A)]) {
      expect(key).not.toContain(ADDRESS_A);
      expect(key).not.toContain("203");
    }
  });

  it("holds a key for its window only", () => {
    const time = clock();
    const limiter = rateLimiter(undefined, time.now);
    limiter.admit(ADDRESS_A, "results");
    limiter.admit(ADDRESS_B, "suggest");
    expect(limiter.size()).toBe(2);
    time.advance(60_000);
    limiter.admit(null, "results");
    expect(limiter.size()).toBe(0);
  });

  it("writes no log line, table or file: the source imports no logger, database or file system", () => {
    const source = readFileSync(
      join(ROOT, "src", "modules", "search", "gate.ts"),
      "utf8",
    );
    const imports = [...source.matchAll(/^import[^;]*from "([^"]+)";/gmu)].map(
      (match) => match[1],
    );
    expect(imports.sort()).toEqual(["@/config/search", "node:crypto"]);
  });
});

describe("the proxy wears the limiter (AC-26)", () => {
  function install(): { limiter: RateLimiter; time: ReturnType<typeof clock> } {
    const time = clock();
    const limiter = rateLimiter(undefined, time.now);
    installSearchGate(limiter);
    return { limiter, time };
  }

  it("the 61st results request from one address is 429 with Retry-After, rewritten to the rate-limited page; a second address is 200", () => {
    install();
    const path = "/en/search?q=roses&to=pl";
    for (let n = 1; n <= resultsPerMinute; n += 1) {
      const response = call(path, { "cf-connecting-ip": ADDRESS_A });
      expect(response.status, `request ${n}`).toBe(200);
      expect(response.headers.get("x-middleware-rewrite")).toBeNull();
      expect(
        response.headers.get(`x-middleware-request-${SEARCH_GATE_HEADER}`),
      ).toBeNull();
    }
    const refused = call(path, { "cf-connecting-ip": ADDRESS_A });
    expect(refused.status).toBe(429);
    expect(refused.headers.get("retry-after")).toBe("60");
    expect(refused.headers.get("x-robots-tag")).toBe("noindex, follow");
    expect(refused.headers.get("cache-control")).toBe("private, no-store");
    expect(refused.headers.get("referrer-policy")).toBe("strict-origin");
    expect(refused.headers.get("x-middleware-rewrite")).toBe(
      `${ORIGIN}/en/-search?q=roses&to=pl`,
    );
    expect(
      refused.headers.get(`x-middleware-request-${SEARCH_GATE_HEADER}`),
    ).toBe("client");

    const other = call(path, { "cf-connecting-ip": ADDRESS_B });
    expect(other.status).toBe(200);
    expect(other.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("counts every locale's search address and the internal route, and nothing else", () => {
    const { limiter } = install();
    const spy = vi.spyOn(limiter, "admit");
    for (const path of [
      "/en/search",
      "/de/suche",
      "/pl/szukaj",
      "/en-gb/search",
      "/en/-search",
    ]) {
      call(path, { "cf-connecting-ip": ADDRESS_A });
    }
    expect(spy).toHaveBeenCalledTimes(5);
    for (const path of [
      "/en",
      "/en/poland/flowers",
      "/de/search",
      "/EN/SEARCH",
      "/en/search/x",
    ]) {
      call(path, { "cf-connecting-ip": ADDRESS_A });
    }
    expect(spy).toHaveBeenCalledTimes(5);
  });

  it("the 121st suggest request is 429 with Retry-After and no body", async () => {
    install();
    for (let n = 1; n <= suggestPerMinute; n += 1) {
      expect(
        call("/api/search/suggest?q=ro", { "cf-connecting-ip": ADDRESS_A })
          .status,
      ).toBe(200);
    }
    const refused = call("/api/search/suggest?q=ro", {
      "cf-connecting-ip": ADDRESS_A,
    });
    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(refused.headers.get("x-middleware-rewrite")).toBeNull();
    expect(await refused.text()).toBe("");
  });

  it("with 32 searches held in flight the 33rd is 503 with Retry-After: 5", () => {
    const { limiter } = install();
    for (let n = 0; n < maxConcurrent; n += 1) limiter.enter();
    const refused = call("/pl/szukaj?q=roze", {
      "cf-connecting-ip": ADDRESS_B,
    });
    expect(refused.status).toBe(503);
    expect(refused.headers.get("retry-after")).toBe("5");
    expect(
      refused.headers.get(`x-middleware-request-${SEARCH_GATE_HEADER}`),
    ).toBe("concurrency");
    limiter.leave();
    expect(call("/pl/szukaj?q=roze").status).toBe(200);
  });

  it("reads the address from CF-Connecting-IP only: X-Forwarded-For does not open a new bucket", () => {
    install();
    for (let n = 0; n < resultsPerMinute; n += 1) {
      call("/en/search", {
        "cf-connecting-ip": ADDRESS_A,
        "x-forwarded-for": `198.51.100.${n}`,
      });
    }
    expect(
      call("/en/search", {
        "cf-connecting-ip": ADDRESS_A,
        "x-forwarded-for": "198.51.100.250",
      }).status,
    ).toBe(429);
  });

  it("drops a client-sent x-fo-search-gate, so only the proxy can ask for the rate-limited page", () => {
    install();
    const response = call("/en/search?q=roses", {
      "cf-connecting-ip": ADDRESS_A,
      [SEARCH_GATE_HEADER]: "client",
    });
    expect(response.status).toBe(200);
    expect(
      response.headers.get(`x-middleware-request-${SEARCH_GATE_HEADER}`),
    ).toBeNull();
    expect(
      response.headers.get("x-middleware-override-headers") ?? "",
    ).not.toContain(SEARCH_GATE_HEADER);
  });

  it("logs search.rate_limited with the route and kind, and no line holds either address or the query", () => {
    const { limiter } = install();
    for (let n = 0; n <= resultsPerMinute; n += 1) {
      call("/en/search?q=anna%40example.pl", { "cf-connecting-ip": ADDRESS_A });
    }
    for (let n = 0; n < maxConcurrent; n += 1) limiter.enter();
    call("/en/search", { "cf-connecting-ip": ADDRESS_B });
    const records = lines.map(
      (line) => JSON.parse(line) as Record<string, unknown>,
    );
    expect(
      records
        .filter((record) => record["event"] === "search.rate_limited")
        .map(({ route, kind }) => ({ route, kind })),
    ).toEqual([
      { route: "results", kind: "client" },
      { route: "results", kind: "concurrency" },
    ]);
    expect(
      records
        .filter(
          (record) =>
            record["msg"] === "request end" && record["status"] !== undefined,
        )
        .map((record) => record["status"]),
    ).toEqual([429, 503]);
    const all = lines.join("\n");
    for (const needle of [ADDRESS_A, ADDRESS_B, "anna", "example.pl", "?"]) {
      expect(all, needle).not.toContain(needle);
    }
    expect(all).not.toContain(limiter.clientKey(ADDRESS_A));
  });
});

describe("the page the proxy hands a refused request to (§2.7, AC-26)", () => {
  const messages = loadMessages("en", MESSAGE_NAMESPACES) as {
    search: { rateLimited: string; heading: string };
    nav: { search: { submit: string } };
  };

  function render(
    view: Parameters<typeof SearchResultsPage>[0]["view"],
  ): string {
    return renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <SearchResultsPage rateLimited view={view} />
      </NextIntlClientProvider>,
    );
  }

  it("renders the resolved search.rateLimited as a status, the form with the words and the destination, and nothing searched", async () => {
    const engine = { search: vi.fn(), suggest: vi.fn() };
    const outcome = await searchRoutePage(
      "en",
      { q: "roses", to: "pl" },
      { refused: true, deps: { engine } },
    );
    expect(outcome.kind).toBe("rateLimited");
    if (outcome.kind === "notFound") throw new Error("unreachable");
    expect(engine.search).not.toHaveBeenCalled();
    expect(outcome.view.analytics).toBeNull();
    const markup = render(outcome.view);
    expect(markup).toContain(
      `role="status"><p class="text-ink m-0 text-[17px] leading-[1.45] md:text-[19px]">${messages.search.rateLimited}</p>`,
    );
    expect(markup).toContain(`>${messages.search.heading}</h1>`);
    expect(markup).toMatch(
      /<form [^>]*role="search" action="\/en\/search" method="get">/u,
    );
    expect(markup).toContain('type="search" name="q" value="roses"');
    expect(markup).toContain('<option value="pl" selected="">');
    expect(markup).not.toContain("data-fo-search-results");
    expect(markup).not.toContain("data-fo-analytics");
    expect(markup).not.toContain("data-fo-card");
  });

  it("renders the rate-limited state, not a search, when the cap is reached after the proxy let the request through", async () => {
    const limiter = rateLimiter(undefined, clock().now);
    for (let n = 0; n < maxConcurrent; n += 1) limiter.enter();
    const engine = { search: vi.fn(), suggest: vi.fn() };
    const outcome = await searchRoutePage(
      "en",
      { q: "roses" },
      { refused: false, gate: limiter, deps: { engine } },
    );
    expect(outcome.kind).toBe("rateLimited");
    expect(engine.search).not.toHaveBeenCalled();
    expect(limiter.inFlight()).toBe(maxConcurrent);
  });

  it("counts one search in flight while it runs and releases it even when the search throws", async () => {
    const limiter = rateLimiter(undefined, clock().now);
    let during = -1;
    const engine = {
      search: vi.fn(() => {
        during = limiter.inFlight();
        return Promise.reject(new Error("index down"));
      }),
      suggest: vi.fn(),
    };
    await expect(
      searchRoutePage(
        "en",
        { q: "roses", to: "pl" },
        {
          refused: false,
          gate: limiter,
          deps: { engine, log: { info: () => undefined } },
        },
      ),
    ).rejects.toThrow("index down");
    expect(during).toBe(1);
    expect(limiter.inFlight()).toBe(0);
  });
});
