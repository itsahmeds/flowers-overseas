/**
 * Next's incremental cache, unchanged, plus one thing: every cached HTML document carries a
 * Content-Security-Policy that authorises **its own** flight blocks by hash (spec 004 §14 A2,
 * ADR-0016; TASK-058). Registered as `cacheHandler` in `next.config.ts`; the reasoning — hash per
 * response rather than nonce, and why this is the one place the body and the header meet — is in
 * `src/lib/csp-response.ts`, which also explains why both files run on Node's type stripping
 * rather than through the bundler (erasable syntax, `.ts` import specifiers, no alias, no app
 * imports).
 *
 * It extends Next's own `FileSystemCache` and calls straight through, so storage, memory cache,
 * tags and revalidation behave exactly as they did without a custom handler. The two overrides
 * only stamp the entry value on its way in (`set`, which Next calls at build-time prerender, on
 * an ISR regeneration and on a first on-demand render) and on its way out (`get`, which is what
 * makes an entry written under one `CSP_REPORT_ONLY` value serve under the current one).
 *
 * **Fails open, visibly.** If the static policy cannot be read from `routes-manifest.json` the
 * entry is served without an enforcing header — the static Report-Only policy still applies. A
 * cache handler that throws takes every page down; a missing header costs protection the
 * Report-Only period never had. Each such page is counted in `src/lib/csp-state.ts`, and
 * `/api/health` reports `cspEnforce: "degraded"` and logs a `warn` line (`/review 196` item 4).
 * Nothing is printed from here: `src/lib/logger.ts` cannot be imported outside the bundle, and no
 * output may skip its PII scan (spec 001 AC-56).
 *
 * Next constructs one handler **per request** (`server/next-server.js`), so the manifest read is
 * memoised per `serverDistDir` (`readStaticPolicy`).
 */
import FileSystemCacheModule from "next/dist/server/lib/incremental-cache/file-system-cache.js";

import { cspEnforced, stampCspHeaders } from "./csp-response.ts";
import {
  noteCspFailedOpen,
  noteCspHandler,
  readStaticPolicy,
} from "./csp-state.ts";

/**
 * The slice of Next's `CacheHandler` contract this file relies on. Next does not export its own
 * types from a public path, so the shape is written down here, as narrowly as it is used.
 */
export interface CacheEntry {
  readonly lastModified?: number;
  readonly value: unknown;
}

export type CacheHandlerContext = { readonly serverDistDir?: string } & Record<
  string,
  unknown
>;

interface CacheHandlerLike {
  get(key: string, ctx: object): Promise<CacheEntry | null>;
  set(key: string, data: unknown, ctx: object): Promise<void>;
}

type CacheHandlerClass = new (ctx: CacheHandlerContext) => CacheHandlerLike;

// Next compiles the class to CommonJS with `exports.default`; Node's ESM loader hands that whole
// `exports` object over as the default import, the bundler (vitest) hands over the class.
const FileSystemCache: CacheHandlerClass =
  (FileSystemCacheModule as unknown as { default?: CacheHandlerClass })
    .default ?? (FileSystemCacheModule as unknown as CacheHandlerClass);

export default class CspCacheHandler extends FileSystemCache {
  private readonly cspDistDir: string | undefined;
  private readonly cspEnforce: boolean;

  constructor(ctx: CacheHandlerContext) {
    super(ctx);
    this.cspDistDir = ctx.serverDistDir;
    this.cspEnforce = cspEnforced(process.env);
    noteCspHandler(ctx.serverDistDir);
  }

  private stamp(value: unknown): void {
    const outcome = stampCspHeaders(value, {
      staticPolicy: readStaticPolicy(this.cspDistDir),
      enforce: this.cspEnforce,
    });
    if (outcome === "failed-open") noteCspFailedOpen();
  }

  override async get(key: string, ctx: object): Promise<CacheEntry | null> {
    const data = await super.get(key, ctx);
    if (data) this.stamp(data.value);
    return data;
  }

  override async set(key: string, data: unknown, ctx: object): Promise<void> {
    this.stamp(data);
    return super.set(key, data, ctx);
  }
}
