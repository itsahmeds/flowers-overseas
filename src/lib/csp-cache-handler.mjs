// @ts-check
/**
 * Next's incremental cache, unchanged, plus one thing: every cached HTML document carries a
 * Content-Security-Policy that authorises **its own** inline scripts by hash (spec 004 §14 A2,
 * ADR-0016; TASK-058). Registered as `cacheHandler` in `next.config.ts`; the reasoning — hash per
 * response rather than nonce, and why this is the one place the body and the header meet — is in
 * `src/lib/csp-response.mjs`.
 *
 * It extends Next's own `FileSystemCache` and calls straight through, so storage, memory cache,
 * tags and revalidation behave exactly as they did without a custom handler. The two overrides
 * only stamp the entry value on its way in (`set`, which Next calls at build-time prerender, on
 * an ISR regeneration and on a first on-demand render) and on its way out (`get`, which is what
 * makes an entry written under one `CSP_REPORT_ONLY` value serve under the current one).
 *
 * **Fails open.** If the static policy cannot be read from `routes-manifest.json` the entry is
 * served without an enforcing header — the static Report-Only policy still applies. A cache
 * handler that throws takes every page down; a missing header costs protection the Report-Only
 * period never had. Nothing is printed from here: this file is loaded outside the bundle, where
 * `src/lib/logger.ts` (and its PII scan) cannot be imported, and no output may skip that scan
 * (spec 001 AC-56). What notices a missing header is `tests/e2e/csp-enforced.spec.ts` in CI and
 * step 4 of `docs/runbooks/csp-enforce.md` after the flip.
 *
 * Next constructs one handler **per request** (`server/next-server.js`), so the manifest read is
 * memoised per `serverDistDir` at module scope.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import FileSystemCacheModule from "next/dist/server/lib/incremental-cache/file-system-cache.js";

import {
  cspEnforced,
  stampCspHeaders,
  staticPolicyFromRoutesManifest,
} from "./csp-response.mjs";

/**
 * The slice of Next's `CacheHandler` contract this file relies on. Next's own types are not
 * exported from a public path, so the shape is written down here, as narrowly as it is used.
 *
 * @typedef {{ lastModified?: number, value: unknown }} CacheEntry
 * @typedef {{
 *   get(key: string, ctx: object): Promise<CacheEntry | null>;
 *   set(key: string, data: unknown, ctx: object): Promise<void>;
 * }} CacheHandlerLike
 * @typedef {{ serverDistDir?: string } & Record<string, unknown>} CacheHandlerContext
 */

/** @type {new (ctx: CacheHandlerContext) => CacheHandlerLike} */
const FileSystemCache =
  /** @type {{ default?: new (ctx: CacheHandlerContext) => CacheHandlerLike }} */ (
    FileSystemCacheModule
  ).default ??
  /** @type {new (ctx: CacheHandlerContext) => CacheHandlerLike} */ (
    /** @type {unknown} */ (FileSystemCacheModule)
  );

/** @type {Map<string, string | undefined>} */
const staticPolicies = new Map();

/**
 * @param {string | undefined} serverDistDir `.next/server`
 * @returns {string | undefined}
 */
function staticPolicyFor(serverDistDir) {
  if (serverDistDir === undefined) return undefined;
  if (staticPolicies.has(serverDistDir))
    return staticPolicies.get(serverDistDir);
  let policy;
  try {
    const manifest = JSON.parse(
      readFileSync(
        path.join(serverDistDir, "..", "routes-manifest.json"),
        "utf8",
      ),
    );
    policy = staticPolicyFromRoutesManifest(manifest);
  } catch {
    policy = undefined;
  }
  // A miss is not memoised: during `next build` the manifest may not be written yet, and the
  // runtime read is the one that matters.
  if (policy !== undefined) staticPolicies.set(serverDistDir, policy);
  return policy;
}

export default class CspCacheHandler extends FileSystemCache {
  /** @param {CacheHandlerContext} ctx */
  constructor(ctx) {
    super(ctx);
    /** @private */
    this.serverDistDir = ctx.serverDistDir;
    /** @private */
    this.enforce = cspEnforced(process.env);
  }

  /** @private @param {unknown} value */
  stamp(value) {
    stampCspHeaders(value, {
      staticPolicy: staticPolicyFor(this.serverDistDir),
      enforce: this.enforce,
    });
  }

  /**
   * @override
   * @param {string} key
   * @param {object} ctx
   * @returns {Promise<CacheEntry | null>}
   */
  async get(key, ctx) {
    const data = await super.get(key, ctx);
    if (data !== null && data !== undefined) this.stamp(data.value);
    return data;
  }

  /**
   * @override
   * @param {string} key
   * @param {unknown} data
   * @param {object} ctx
   * @returns {Promise<void>}
   */
  async set(key, data, ctx) {
    this.stamp(data);
    return super.set(key, data, ctx);
  }
}
