/**
 * Environment-level `noindex` headers for `next.config.ts` (spec 001 §5, §6, AC-15, TASK-006).
 *
 * "`next.config` `headers()` adds `X-Robots-Tag: noindex` on all responses when
 * `VERCEL_ENV !== "production"` (permanent; previews and staging are never indexable)"
 * (spec 001 §2). Factored out of `next.config.ts` — which calls `assertEnv()` at import time —
 * so the rule is unit-testable without a valid environment.
 *
 * Production carries no header from here: `robots.ts` (disallow-all) and the root `noindex` meta
 * are what keep the 001 production alias out of the index, and spec 007 lifts exactly those two
 * for production when an indexable set exists (ADR-0007). `/api/*` sets its own `X-Robots-Tag`
 * in every environment (`src/lib/health.ts`).
 */
import type { DeploymentEnvironment } from "./env.schema";

/** Shape of one entry of `next.config`'s `headers()` (mutable, as Next's `Header` type is). */
export interface HeaderRule {
  source: string;
  headers: { key: string; value: string }[];
}

export const NOINDEX_HEADER_NAME = "X-Robots-Tag";
export const NOINDEX_HEADER_VALUE = "noindex";

/** Matches every path, including `/` and `/api/*` (Next's catch-all header source syntax). */
export const ALL_PATHS = "/(.*)";

/** Fresh objects on every call: Next mutates nothing, but a shared literal would be a trap. */
export function noindexHeaderRules(
  environment: DeploymentEnvironment,
): HeaderRule[] {
  if (environment === "production") return [];
  return [
    {
      source: ALL_PATHS,
      headers: [{ key: NOINDEX_HEADER_NAME, value: NOINDEX_HEADER_VALUE }],
    },
  ];
}
