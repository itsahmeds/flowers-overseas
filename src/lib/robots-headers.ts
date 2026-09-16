/**
 * Environment-level `noindex` headers for `next.config.ts` (spec 001 §5, §6, AC-15, TASK-006).
 *
 * "`next.config` `headers()` adds `X-Robots-Tag: noindex` on all responses when the
 * environment is not `production` (permanent; previews and staging are never indexable)"
 * (spec 001 §2). Factored out of `next.config.ts` — which calls `assertEnv()` at import time —
 * so the rule is unit-testable without a valid environment.
 *
 * Spec 040 (§5.2, AC-4; TASK-097) changed the **input**, not the rule: the environment now
 * comes from `appEnvironment()` rather than from `VERCEL_ENV`, so all five values are covered
 * and the two that are new to the header are `staging` (the florist demo environment, which is
 * production-like in everything except indexability) and the unset-`APP_ENV` case, which
 * resolves to `development`. That is the fail-closed direction: a host that injects nothing
 * gets `noindex`, not an indexable deployment.
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

/**
 * Fresh objects on every call: Next mutates nothing, but a shared literal would be a trap.
 *
 * `production` is the only value that gets no header, and it is spelled as an equality rather
 * than as a list of the other four so that a sixth environment value added later is `noindex` by
 * default (spec 040 AC-4).
 */
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
