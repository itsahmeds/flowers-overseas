/**
 * The Cloudflare URL-purge adapter behind `src/lib/cache.ts` (spec 040 §5.4 "Tag invalidation →
 * URL purge", §5.7, §11 "Cache health", AC-22; TASK-102).
 *
 * Railway has no `revalidateTag`: once Cloudflare caches a document, the only way a content
 * change reaches a visitor before `s-maxage` runs out is a purge. Cache-Tag purge is an
 * Enterprise feature, so a tag is turned into the **URLs** that carry it and those are purged by
 * URL. This module is the HTTP half; the tag → URL half (`urlsForTag()`) lives in
 * `src/lib/cache.ts` beside the tag builders, because that file is the only one outside
 * `src/modules/catalog` allowed to spell a tag (`tests/unit/catalog-cache-tags.test.ts`), and it
 * is injected here as `resolve` so this file never imports `cache.ts` at run time (no cycle).
 *
 * Behaviour, clause by clause of §5.4:
 *  - tags are de-duplicated, each is resolved once, and the URLs are de-duplicated across tags;
 *  - URLs go out in chunks of at most `PURGE_CHUNK_SIZE` (30, the zone plan's limit, `plan/08`
 *    §3.1), at most `PURGE_CONCURRENCY` requests in flight;
 *  - a failed request — non-2xx, a body that is not `success: true`, a network error or a
 *    timeout — is retried `PURGE_RETRIES` (2) times with exponential backoff;
 *  - **one log line per `invalidate` call**: tag names, URL count, API call count (§11). `error`
 *    when any chunk still failed after its retries, `warn` when a tag resolved to no URL, `info`
 *    otherwise. Never a URL, never the token — a URL list in a log line is exactly what §5.4
 *    forbids, and the token is a secret;
 *  - `invalidate()` never rejects. A purge is a latency optimisation (stale-while-revalidate
 *    bounds the damage at `s-maxage`, ADR-0018), so a failed purge must not fail the admin edit
 *    or the job that asked for it.
 *
 * **Absent means off** (§12 "Feature flags"). `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ZONE_ID`
 * are environment-scoped switches like `STAGING_BASIC_AUTH`, not members of the 28-key contract
 * (`ENV_KEYS`, spec 040 AC-11): adding them to the zod env schemas would make every environment
 * *require* them. `parseCloudflarePurgeConfig()` is their validation, re-exported by
 * `src/lib/env.ts`; with either key absent or blank, `src/lib/cache.ts` keeps the no-op. A pair
 * that is present but malformed purges nothing and says so at `warn`, naming the key only.
 *
 * The purge goes to `api.cloudflare.com` and nowhere else (the token's `Cache Purge` scope,
 * spec 040 §5.4 "Token scopes, exactly").
 */
import { z } from "zod";

import type { CacheAdapter } from "./cache.ts";
import { type Logger, logger as processLogger } from "./logger.ts";

/** The token variable: an API token scoped to the single zone (spec 040 §5.4). */
export const CLOUDFLARE_API_TOKEN_KEY = "CLOUDFLARE_API_TOKEN";
/** The zone variable: the 32-hex-character id of `flowersoverseas.com`'s zone. */
export const CLOUDFLARE_ZONE_ID_KEY = "CLOUDFLARE_ZONE_ID";

/** The only host this adapter calls. */
export const CLOUDFLARE_API_ORIGIN = "https://api.cloudflare.com";
/** URLs per purge request: the Cloudflare limit `plan/08` §3.1 names for the zone's plan. */
export const PURGE_CHUNK_SIZE = 30;
/** Retries after the first attempt, per chunk (AC-22: "retries twice on failure"). */
export const PURGE_RETRIES = 2;
/** Requests in flight at once (§5.4 "bounded concurrency"); well under the API's rate limit. */
export const PURGE_CONCURRENCY = 3;
/** First backoff; each retry doubles it (250 ms, then 500 ms). */
export const PURGE_BACKOFF_MS = 250;
/** One request's budget before it counts as failed and is retried. */
export const PURGE_TIMEOUT_MS = 10_000;

/** `…/zones/{zone_id}/purge_cache` — the zone purge endpoint. */
export function purgeEndpoint(zoneId: string): string {
  return `${CLOUDFLARE_API_ORIGIN}/client/v4/zones/${encodeURIComponent(zoneId)}/purge_cache`;
}

type EnvSource = Readonly<Record<string, string | undefined>>;

const TokenSchema = z.string().regex(/^\S+$/u, "must contain no whitespace");
const ZoneIdSchema = z
  .string()
  .regex(/^[0-9a-f]{32}$/u, "must be 32 lower-case hex characters");

/** The two switches, read into a decision-ready state. Values never leave `configured`. */
export type CloudflarePurgeConfig =
  | { readonly kind: "absent" }
  | { readonly kind: "invalid"; readonly keys: readonly string[] }
  | {
      readonly kind: "configured";
      readonly token: string;
      readonly zoneId: string;
    };

/**
 * Read `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ZONE_ID`. Blank counts as absent, and either one
 * absent means `absent` (AC-22: "a no-op … when the token or zone id is absent").
 */
export function parseCloudflarePurgeConfig(
  source: EnvSource,
): CloudflarePurgeConfig {
  const token = source[CLOUDFLARE_API_TOKEN_KEY]?.trim() ?? "";
  const zoneId = source[CLOUDFLARE_ZONE_ID_KEY]?.trim() ?? "";
  if (token === "" || zoneId === "") return { kind: "absent" };

  const invalid: string[] = [];
  if (!TokenSchema.safeParse(token).success) {
    invalid.push(CLOUDFLARE_API_TOKEN_KEY);
  }
  if (!ZoneIdSchema.safeParse(zoneId).success) {
    invalid.push(CLOUDFLARE_ZONE_ID_KEY);
  }
  if (invalid.length > 0) return { kind: "invalid", keys: invalid };
  return { kind: "configured", token, zoneId };
}

/** Split `urls` into consecutive chunks of at most `size`, keeping order. */
export function chunkUrls(
  urls: readonly string[],
  size: number = PURGE_CHUNK_SIZE,
): string[][] {
  const chunks: string[][] = [];
  for (let start = 0; start < urls.length; start += size) {
    chunks.push(urls.slice(start, start + size));
  }
  return chunks;
}

/** The v4 envelope; only `success` decides anything here. */
const PurgeResponseSchema = z.object({ success: z.boolean() });

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

export interface CloudflareCacheAdapterOptions {
  readonly token: string;
  readonly zoneId: string;
  /** Tag → absolute URLs (`urlsForTag()` in production). Pure; never fetches. */
  readonly resolve: (tag: string) => readonly string[];
  readonly logger?: Logger;
  /** Injected in tests; defaults to the global `fetch` at call time (MSW patches it). */
  readonly fetch?: Fetch;
  /** Injected in tests so the backoff costs nothing. */
  readonly sleep?: (ms: number) => Promise<void>;
}

const ADAPTERS = new WeakSet<CacheAdapter>();

/** True for an adapter `createCloudflareCacheAdapter()` built (the wiring test reads it). */
export function isCloudflareCacheAdapter(adapter: CacheAdapter): boolean {
  return ADAPTERS.has(adapter);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Map `items` through `work` with at most `limit` promises pending. Order of results is kept. */
async function mapBounded<T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  async function lane(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await work(items[index] as T);
    }
  }
  const lanes = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: lanes }, lane));
  return results;
}

interface ChunkOutcome {
  readonly ok: boolean;
  readonly attempts: number;
}

export function createCloudflareCacheAdapter(
  options: CloudflareCacheAdapterOptions,
): CacheAdapter {
  const log = options.logger ?? processLogger;
  const sleep = options.sleep ?? wait;
  const send: Fetch =
    options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const endpoint = purgeEndpoint(options.zoneId);

  async function attempt(files: readonly string[]): Promise<boolean> {
    try {
      const response = await send(endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${options.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ files }),
        signal: AbortSignal.timeout(PURGE_TIMEOUT_MS),
      });
      if (!response.ok) return false;
      const body = PurgeResponseSchema.safeParse(await response.json());
      return body.success && body.data.success;
    } catch {
      // Network error, timeout or an unparseable body: a failure like any other. The error is
      // not logged — its message can carry the request URL — the count is (see `invalidate`).
      return false;
    }
  }

  async function purge(files: readonly string[]): Promise<ChunkOutcome> {
    for (let tries = 0; ; tries += 1) {
      if (await attempt(files)) return { ok: true, attempts: tries + 1 };
      if (tries === PURGE_RETRIES) return { ok: false, attempts: tries + 1 };
      await sleep(PURGE_BACKOFF_MS * 2 ** tries);
    }
  }

  const adapter: CacheAdapter = {
    async invalidate(tags: string[]): Promise<void> {
      const names = [...new Set(tags)];
      const unresolved: string[] = [];
      const urls = new Set<string>();
      try {
        for (const tag of names) {
          const resolved = options.resolve(tag);
          if (resolved.length === 0) unresolved.push(tag);
          for (const url of resolved) urls.add(url);
        }
      } catch {
        // A resolver that throws (a malformed site URL) purges nothing; say so without a URL.
        log.error(
          { event: "cache.purge", tags: names, url_count: 0, api_calls: 0 },
          "cache purge could not resolve its tags",
        );
        return;
      }

      const outcomes = await mapBounded(
        chunkUrls([...urls]),
        PURGE_CONCURRENCY,
        purge,
      );
      const fields = {
        event: "cache.purge",
        tags: names,
        url_count: urls.size,
        api_calls: outcomes.reduce((sum, outcome) => sum + outcome.attempts, 0),
        ...(unresolved.length > 0 ? { unresolved_tags: unresolved } : {}),
      };
      const failed = outcomes.filter((outcome) => !outcome.ok).length;
      if (failed > 0) {
        log.error({ ...fields, failed_calls: failed }, "cache purge failed");
      } else if (unresolved.length > 0) {
        log.warn(fields, "cache purge left tags unresolved");
      } else {
        log.info(fields, "cache purge");
      }
    },
  };
  ADAPTERS.add(adapter);
  return adapter;
}

/**
 * The adapter for a present-but-malformed pair: purges nothing (a wrong zone id cannot purge the
 * right zone) and says which key is wrong, by name, on every call — a silent no-op here would
 * hide a misconfiguration until a stale price was noticed.
 */
export function misconfiguredCloudflareCache(
  keys: readonly string[],
  log: Logger = processLogger,
): CacheAdapter {
  return {
    invalidate(tags: string[]): Promise<void> {
      log.warn(
        { event: "cache.purge", tags: [...new Set(tags)], invalid_keys: keys },
        "cache purge is misconfigured; nothing was purged",
      );
      return Promise.resolve();
    },
  };
}
