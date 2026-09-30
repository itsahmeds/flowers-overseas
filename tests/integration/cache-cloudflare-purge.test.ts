/**
 * `cloudflareCacheAdapter.invalidate()` against the purge endpoint, mocked with MSW (spec 040
 * §5.4 "Tag invalidation → URL purge", §11 "Cache health", AC-22 / T-23; TASK-102).
 *
 * The integration layer because the claim is about the adapter as assembled — resolver,
 * de-duplication, chunking, concurrency, retry and the one log line — talking HTTP to something
 * shaped like Cloudflare. The purge endpoint is `tests/msw/handlers/cloudflare.ts`; the server is
 * started here because the `integration` project has no MSW setup file (its other suites talk to
 * Postgres), and `onUnhandledRequest: "error"` keeps any call to a host other than
 * `api.cloudflare.com` a failure.
 *
 * What the log may contain is the point of half of these cases: tag names and counts, never a
 * URL (spec 040 §5.4: "never a URL list in a single log line"), and never the token.
 */
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  PURGE_CONCURRENCY,
  PURGE_RETRIES,
  createCloudflareCacheAdapter,
} from "../../src/lib/cache-cloudflare";
import { createLogger } from "../../src/lib/logger";
import {
  type RecordedPurge,
  cloudflarePurgeHandler,
} from "../msw/handlers/cloudflare";

const server = setupServer();

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

const TOKEN = "cf-test-token-0123456789abcdefghijklmnopq";
const ZONE_ID = "0123456789abcdef0123456789abcdef";
const ORIGIN = "https://flowersoverseas.com";

const url = (index: number): string => `${ORIGIN}/p/${String(index)}`;
const range = (from: number, to: number): string[] =>
  Array.from({ length: to - from }, (_, offset) => url(from + offset));

/**
 * Two tags whose URL sets overlap by nine: 50 + 30 − 9 = 71 distinct URLs. The overlap is what
 * makes "de-duplicated" observable — without it 80 URLs would need a fourth call.
 */
const TAG_URLS: Readonly<Record<string, readonly string[]>> = {
  "corridor:PL": range(0, 50),
  "hub:en": range(41, 71),
  "home:en": [url(0)],
};

interface Harness {
  readonly lines: string[];
  readonly delays: number[];
  readonly adapter: ReturnType<typeof createCloudflareCacheAdapter>;
}

function harness(): Harness {
  const lines: string[] = [];
  const delays: number[] = [];
  const adapter = createCloudflareCacheAdapter({
    token: TOKEN,
    zoneId: ZONE_ID,
    resolve: (tag) => TAG_URLS[tag] ?? [],
    logger: createLogger({ level: "trace", write: (line) => lines.push(line) }),
    sleep: (ms) => {
      delays.push(ms);
      return Promise.resolve();
    },
  });
  return { lines, delays, adapter };
}

const parsed = (lines: readonly string[]): Record<string, unknown>[] =>
  lines.map((line) => JSON.parse(line) as Record<string, unknown>);

describe("invalidate() with 71 URLs (T-23)", () => {
  it("makes exactly 3 purge calls of 30 + 30 + 11, covering all 71 URLs once", async () => {
    const recorded: RecordedPurge[] = [];
    server.use(cloudflarePurgeHandler({ recorded }));
    const { adapter } = harness();

    await expect(
      adapter.invalidate(["corridor:PL", "hub:en"]),
    ).resolves.toBeUndefined();

    expect(recorded).toHaveLength(3);
    expect(
      recorded.map((call) => call.files.length).sort((a, b) => b - a),
    ).toEqual([30, 30, 11]);
    const sent = recorded.flatMap((call) => call.files);
    expect(new Set(sent).size).toBe(71);
    expect(sent).toHaveLength(71);
    expect(new Set(sent)).toEqual(new Set(range(0, 71)));
  });

  it("calls the zone's purge endpoint with the bearer token and a JSON body", async () => {
    const recorded: RecordedPurge[] = [];
    server.use(cloudflarePurgeHandler({ recorded }));
    const { adapter } = harness();

    await adapter.invalidate(["home:en"]);

    expect(recorded).toEqual([
      {
        zoneId: ZONE_ID,
        authorization: `Bearer ${TOKEN}`,
        contentType: "application/json",
        files: [url(0)],
      },
    ]);
  });

  it("writes one info line with the tag names, the URL count and the call count — and no URL", async () => {
    server.use(cloudflarePurgeHandler());
    const { adapter, lines } = harness();

    await adapter.invalidate(["corridor:PL", "hub:en", "corridor:PL"]);

    expect(lines).toHaveLength(1);
    const [line] = parsed(lines);
    expect(line).toMatchObject({
      level: "info",
      tags: ["corridor:PL", "hub:en"],
      url_count: 71,
      api_calls: 3,
    });
    expect(lines[0]).not.toContain(ORIGIN);
    expect(lines[0]).not.toContain("/p/");
    expect(lines[0]).not.toContain(TOKEN);
  });

  it("keeps at most PURGE_CONCURRENCY calls in flight", async () => {
    let inFlight = 0;
    let peak = 0;
    server.use(
      cloudflarePurgeHandler({
        delayMs: 20,
        onEnter: () => {
          inFlight += 1;
          peak = Math.max(peak, inFlight);
        },
        onLeave: () => {
          inFlight -= 1;
        },
      }),
    );
    const many = Object.fromEntries(
      Array.from({ length: 8 }, (_, index) => [
        `t${String(index)}`,
        range(index * 30, index * 30 + 30),
      ]),
    );
    const wide = createCloudflareCacheAdapter({
      token: TOKEN,
      zoneId: ZONE_ID,
      resolve: (tag) => many[tag] ?? [],
      logger: createLogger({ write: () => undefined }),
    });

    await wide.invalidate(Object.keys(many));

    expect(PURGE_CONCURRENCY).toBeGreaterThan(1);
    expect(peak).toBe(PURGE_CONCURRENCY);
  });
});

describe("invalidate() when Cloudflare answers 500 (T-23)", () => {
  it("retries twice — three attempts — then writes one error line with counts and tag names and no URL", async () => {
    const recorded: RecordedPurge[] = [];
    server.use(cloudflarePurgeHandler({ recorded, respond: () => 500 }));
    const { adapter, lines, delays } = harness();

    await expect(adapter.invalidate(["home:en"])).resolves.toBeUndefined();

    expect(PURGE_RETRIES).toBe(2);
    expect(recorded).toHaveLength(3);
    expect(recorded.every((call) => call.files.length === 1)).toBe(true);
    expect(delays).toHaveLength(2);
    expect(delays[1] ?? 0).toBeGreaterThan(delays[0] ?? 0);

    expect(lines).toHaveLength(1);
    const [line] = parsed(lines);
    expect(line).toMatchObject({
      level: "error",
      tags: ["home:en"],
      url_count: 1,
      api_calls: 3,
      failed_calls: 1,
    });
    expect(lines[0]).not.toContain(ORIGIN);
    expect(lines[0]).not.toContain(TOKEN);
  });

  it("with 71 URLs and every attempt failing: 9 attempts, one error line, no URL", async () => {
    const recorded: RecordedPurge[] = [];
    server.use(cloudflarePurgeHandler({ recorded, respond: () => 500 }));
    const { adapter, lines } = harness();

    await adapter.invalidate(["corridor:PL", "hub:en"]);

    expect(recorded).toHaveLength(9);
    expect(lines).toHaveLength(1);
    const [line] = parsed(lines);
    expect(line).toMatchObject({
      level: "error",
      tags: ["corridor:PL", "hub:en"],
      url_count: 71,
      api_calls: 9,
      failed_calls: 3,
    });
    for (const sentUrl of range(0, 71)) {
      expect(lines[0]).not.toContain(sentUrl);
    }
    expect(lines[0]).not.toContain(ORIGIN);
  });

  it("recovers on the second attempt: two calls, one info line, no error", async () => {
    const recorded: RecordedPurge[] = [];
    server.use(
      cloudflarePurgeHandler({
        recorded,
        respond: (attempt) => (attempt === 0 ? 500 : 200),
      }),
    );
    const { adapter, lines } = harness();

    await adapter.invalidate(["home:en"]);

    expect(recorded).toHaveLength(2);
    expect(parsed(lines)).toEqual([
      expect.objectContaining({ level: "info", api_calls: 2, url_count: 1 }),
    ]);
  });

  it("treats a 200 whose body says `success: false` as a failure and retries it", async () => {
    const recorded: RecordedPurge[] = [];
    let attempt = 0;
    server.use(cloudflarePurgeHandler({ recorded }));
    const adapter = createCloudflareCacheAdapter({
      token: TOKEN,
      zoneId: ZONE_ID,
      resolve: (tag) => TAG_URLS[tag] ?? [],
      logger: createLogger({ write: () => undefined }),
      sleep: () => Promise.resolve(),
      fetch: (input, init) => {
        attempt += 1;
        if (attempt === 1) {
          return Promise.resolve(
            Response.json({ success: false, errors: [], messages: [] }),
          );
        }
        return globalThis.fetch(input, init);
      },
    });

    await adapter.invalidate(["home:en"]);

    expect(attempt).toBe(2);
    expect(recorded).toHaveLength(1);
  });

  it("treats a network error like a 500: retried, then logged, never thrown", async () => {
    const lines: string[] = [];
    let attempts = 0;
    const adapter = createCloudflareCacheAdapter({
      token: TOKEN,
      zoneId: ZONE_ID,
      resolve: (tag) => TAG_URLS[tag] ?? [],
      logger: createLogger({ write: (line) => lines.push(line) }),
      sleep: () => Promise.resolve(),
      fetch: () => {
        attempts += 1;
        return Promise.reject(new TypeError(`fetch failed for ${url(0)}`));
      },
    });

    await expect(adapter.invalidate(["home:en"])).resolves.toBeUndefined();

    expect(attempts).toBe(3);
    expect(parsed(lines)).toEqual([
      expect.objectContaining({
        level: "error",
        api_calls: 3,
        failed_calls: 1,
      }),
    ]);
    expect(lines[0]).not.toContain(ORIGIN);
  });
});

describe("invalidate() with tags that resolve to nothing", () => {
  it("makes no call and names the unresolved tags in its one line, at warn", async () => {
    const recorded: RecordedPurge[] = [];
    server.use(cloudflarePurgeHandler({ recorded }));
    const { adapter, lines } = harness();

    await adapter.invalidate(["sitemap", "home:en"]);

    expect(recorded).toHaveLength(1);
    expect(parsed(lines)).toEqual([
      expect.objectContaining({
        level: "warn",
        tags: ["sitemap", "home:en"],
        unresolved_tags: ["sitemap"],
        url_count: 1,
        api_calls: 1,
      }),
    ]);
  });

  it("with an empty tag list: no call, one info line with zero counts", async () => {
    const recorded: RecordedPurge[] = [];
    server.use(cloudflarePurgeHandler({ recorded }));
    const { adapter, lines } = harness();

    await adapter.invalidate([]);

    expect(recorded).toHaveLength(0);
    expect(parsed(lines)).toEqual([
      expect.objectContaining({ level: "info", url_count: 0, api_calls: 0 }),
    ]);
  });
});
