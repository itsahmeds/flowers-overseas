/**
 * Search abuse protection (spec 045 §2.8, §11, AC-26; TASK-403): the per-client rate limit and the
 * process's concurrency cap, in front of the results page and the suggestions route.
 *
 * **The client key.** An HMAC-SHA-256 of the connecting address (`CF-Connecting-IP`, the address
 * Cloudflare saw) under a key drawn at random when the process starts. The key is never written,
 * logged or exported, so the same address keys differently after a restart, and a key cannot be
 * turned back into an address without the process's memory. The map holds a key for its window
 * only (60 s): a window that has ended is swept on the next admission. Nothing here writes a log
 * line, a table or a file (GDPR Recital 49, `docs/compliance/ropa.md` "Search abuse protection").
 *
 * **This file is the only reader of `CF-Connecting-IP` in `src/`** (AC-14's scan). The address
 * decides one thing, whether this request is over the limit, and never what a page shows or in
 * what order (ADR-0006). `X-Forwarded-For` is never read: a client sets it. With no
 * `CF-Connecting-IP` (a laptop, a test, a request that did not come through Cloudflare) there is no
 * client limit and only the concurrency cap applies, rather than every such client sharing one
 * bucket.
 *
 * **Fixed windows.** 60 results requests and 120 suggestion requests per key per minute
 * (`SEARCH_CONFIG.rateLimit`); the next one answers 429 with `Retry-After` set to the seconds left
 * in the window. A refused request counts too, so hammering does not shorten the wait.
 *
 * **The concurrency cap.** At most 32 searches run at once in the process. The results page calls
 * `enter()` before its search and `leave()` after it (TASK-409's suggestions route will too); while
 * 32 are in, `admit()` answers 503 with `Retry-After: 5` to either kind. The proxy and the page are separate bundles in one Node process, so the one
 * limiter lives on `globalThis` under a registry symbol (`searchGate()`).
 *
 * No regular expression is built from input. Plain Node: `node:crypto`, the configuration, nothing
 * from Next or React, because the proxy imports this file directly (not through the barrel, which
 * carries the page's components).
 */
import { createHmac, randomBytes } from "node:crypto";

import { SEARCH_CONFIG, type SearchConfig } from "@/config/search";

/** The header the client address is read from (Cloudflare's, ADR-0018). */
export const CLIENT_ADDRESS_HEADER = "cf-connecting-ip";

/**
 * The request header the proxy sets on a refused results request it hands to the page, so the page
 * renders the "rate limited" state without searching. The proxy deletes any client-sent copy from
 * every request first, so only the proxy can set it.
 */
export const SEARCH_GATE_HEADER = "x-fo-search-gate";

/** The concurrency cap's `Retry-After`, in seconds (§2.8). */
export const CONCURRENCY_RETRY_AFTER_SECONDS = 5;

/** The window of the per-client limit. */
export const RATE_WINDOW_MS = 60_000;

/** Which limit a request is counted against. */
export type SearchRouteKind = "results" | "suggest";

/** Why a request was refused: §11's `search.rate_limited` `kind`. */
export type RefusalReason = "client" | "concurrency";

export type Admission =
  | { readonly admitted: true }
  | {
      readonly admitted: false;
      readonly status: 429 | 503;
      readonly retryAfterSeconds: number;
      readonly reason: RefusalReason;
    };

export interface RateLimiter {
  /** Count one request of `kind` from `address` (`null`: no client limit) and decide. */
  admit(address: string | null, kind: SearchRouteKind): Admission;
  /** One search starts. `false` when the cap is already reached (the search must not run). */
  enter(): boolean;
  /** One search ends (in a `finally`). */
  leave(): void;
  /** Searches running now. */
  inFlight(): number;
  /** Keys held now (windows not yet swept). */
  size(): number;
  /** The HMAC key of an address under this process's secret. Exposed for AC-26's restart check. */
  clientKey(address: string): string;
}

type RateConfig = SearchConfig["rateLimit"];

interface Window {
  start: number;
  count: number;
}

/**
 * A limiter with its own random secret. `clock` is injected so the window can be tested without
 * waiting; `secret` only so a test can pin it, never from configuration.
 */
export function rateLimiter(
  config: RateConfig = SEARCH_CONFIG.rateLimit,
  clock: () => number = Date.now,
  secret: Buffer = randomBytes(32),
): RateLimiter {
  const windows = new Map<string, Window>();
  let running = 0;
  let lastSweep = clock();

  function clientKey(address: string): string {
    return createHmac("sha256", secret).update(address).digest("base64url");
  }

  function sweep(now: number): void {
    if (now - lastSweep < RATE_WINDOW_MS) return;
    lastSweep = now;
    for (const [key, window] of windows) {
      if (now - window.start >= RATE_WINDOW_MS) windows.delete(key);
    }
  }

  function limitFor(kind: SearchRouteKind): number {
    return kind === "results"
      ? config.resultsPerMinute
      : config.suggestPerMinute;
  }

  return {
    admit(address, kind) {
      const now = clock();
      sweep(now);
      if (running >= config.maxConcurrent) {
        return {
          admitted: false,
          status: 503,
          retryAfterSeconds: CONCURRENCY_RETRY_AFTER_SECONDS,
          reason: "concurrency",
        };
      }
      if (address === null) return { admitted: true };
      // One bucket per kind: the suggestions island's keystrokes never use up the results budget.
      const key = `${kind}:${clientKey(address)}`;
      const current = windows.get(key);
      const window =
        current === undefined || now - current.start >= RATE_WINDOW_MS
          ? { start: now, count: 0 }
          : current;
      window.count += 1;
      windows.set(key, window);
      if (window.count <= limitFor(kind)) return { admitted: true };
      return {
        admitted: false,
        status: 429,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((window.start + RATE_WINDOW_MS - now) / 1000),
        ),
        reason: "client",
      };
    },
    enter() {
      if (running >= config.maxConcurrent) return false;
      running += 1;
      return true;
    },
    leave() {
      running = Math.max(0, running - 1);
    },
    inFlight: () => running,
    size: () => windows.size,
    clientKey,
  };
}

/**
 * The connecting address, or `null`. The one read of `CF-Connecting-IP` in `src/` (AC-14). Trimmed
 * and bounded (an IPv6 address is at most 45 characters), so an oversized header is not hashed.
 */
export function clientAddress(headers: Headers): string | null {
  const value = headers.get(CLIENT_ADDRESS_HEADER)?.trim() ?? "";
  return value === "" || value.length > 64 ? null : value;
}

const REGISTRY = Symbol.for("fo.search.gate");

type GateHolder = { [REGISTRY]?: RateLimiter };

/** The process's one limiter, shared by the proxy and the page through `globalThis`. */
export function searchGate(): RateLimiter {
  const holder = globalThis as GateHolder;
  holder[REGISTRY] ??= rateLimiter();
  return holder[REGISTRY];
}

/** Replace the process's limiter (tests only: an injected clock, a clean window). */
export function installSearchGate(limiter: RateLimiter): void {
  (globalThis as GateHolder)[REGISTRY] = limiter;
}
