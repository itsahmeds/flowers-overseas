/**
 * Health endpoint contract (spec 001 §5.2, AC-14, TASK-006).
 *
 * Kept free of `server-only` (like `env.schema.ts`), so the whole response — body *and* headers —
 * is unit-testable and the route file in `src/app/` stays thin (plan/01 §5). No database access
 * in 001 (spec 001 §5.2).
 *
 * The deployment environment and the version are passed in by the caller, which reads them from
 * `@/lib/env`; nothing here touches `process.env`.
 */
import { z } from "zod";

import { CSP_ENFORCE_STATES, type CspEnforceState } from "./csp-state.ts";
import { deploymentEnvironments } from "./env.schema";
import { logger as defaultLogger, type Logger } from "./logger";
import { REQUEST_ID_HEADER, resolveRequestId } from "./request-id";

import type { DeploymentEnvironment } from "./env.schema";

/**
 * Response shape of `GET /api/health` (spec 001 §5.2; spec 040 §5.6, AC-31).
 *
 * Spec 040 **adds** `commit`, `appEnv` and `region` (§5.6: the endpoint "gains" them), and spec
 * 005 §14 A7 adds `fxAsOf` and `fxSource` (AC-33; spec 040 AC-31's list owes them, a carry-forward); `version`
 * and `env` stay, because spec 001 AC-14 pins them and the e2e suite and the launch skill read
 * them. `commit` is the same value as `version` under the name AC-31 uses; `appEnv` is the
 * unreduced five-value `appEnvironment()` result, while `env` keeps spec 001's four-value shape
 * (a `test` run reports `development`). No field is PII and none is a secret: a commit SHA, an
 * environment name and a cloud region (spec 040 §8), and no field costs a database call (§11).
 */
export const HealthResponse = z.object({
  status: z.literal("ok"),
  version: z.string(),
  // `staging` joined the set with spec 040 §5.2 (TASK-097): it is a real environment this
  // deployment can be in, and a health body that cannot name it would fail its own schema.
  env: z.enum(["development", "preview", "staging", "production"]),
  commit: z.string(),
  appEnv: z.enum(deploymentEnvironments),
  region: z.string(),
  // Spec 005 §14 A7 Corrected 2 (vi), AC-33 (TASK-181): which FX snapshot this deployment serves.
  // A date and a source name — no PII, no secret, no network call — read from the bundled module.
  // The weekday rebuild job (`scripts/fx-refresh.ts`) compares `fxAsOf` with the ECB's latest.
  fxAsOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  fxSource: z.enum(["ecb-build", "committed"]),
  // TASK-058 (`/review 196` item 4): whether the enforced CSP is actually applied —
  // `report-only`, `ok`, or `degraded` when the cache handler has failed open
  // (`src/lib/csp-state.ts`). A closed set; no policy text, no path, no PII. Optional so a body
  // from a deployment before TASK-058 still parses; the route always sends it, and a scheduled
  // check that finds it absent while enforcing must treat that as `degraded`. Public on purpose
  // (`/review 196` round 2 nit 4): any page's own response headers already show whether an
  // enforcing `Content-Security-Policy` is present, so `degraded` discloses nothing new.
  cspEnforce: z.enum(CSP_ENFORCE_STATES).optional(),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

/** Reported when no platform commit SHA is present, i.e. every local and CI build. */
export const HEALTH_VERSION_FALLBACK = "dev";

/** Reported when no platform names a region: a laptop, CI and a bare `docker run` (AC-31). */
export const HEALTH_REGION_FALLBACK = "local";

/**
 * Headers of every health response. `no-store` and `X-Robots-Tag: noindex` are AC-14; the
 * `X-Robots-Tag` is set by the route itself (not only by the non-production `next.config`
 * header) so `/api/*` can never enter the index once production is indexable (spec 001 §6
 * "Crawl efficiency").
 */
export const HEALTH_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-robots-tag": "noindex",
});

export interface HealthInput {
  /** Deployment environment from `@/lib/env` (`environment`). */
  readonly environment: DeploymentEnvironment;
  /** `commitSha(process.env)` from `@/lib/env`; absent off a platform that injects one. */
  readonly version: string | undefined;
  /** `deploymentRegion(process.env)`; absent off a platform that names one (spec 040 AC-31). */
  readonly region?: string | undefined;
  /** `fxSnapshotStatus()` from `@/modules/catalog`: the served FX snapshot (spec 005 AC-33). */
  readonly fx: {
    readonly fxAsOf: string;
    readonly fxSource: "ecb-build" | "committed";
  };
  /** `cspEnforceState(process.env)` from `./csp-state.ts` (TASK-058). */
  readonly cspEnforce?: CspEnforceState | undefined;
}

/**
 * `HealthResponse.env` omits `test` while the env module knows it (`NODE_ENV=test`); a test run is
 * a local run, so it reports `development`. Every other value — including spec 040's `staging` —
 * is reported as itself.
 */
function reportedEnvironment(
  environment: DeploymentEnvironment,
): HealthResponse["env"] {
  return environment === "test" ? "development" : environment;
}

/** Build and validate the body. Throws if it ever stops matching the schema. */
export function buildHealthResponse(input: HealthInput): HealthResponse {
  const commit = input.version ?? HEALTH_VERSION_FALLBACK;
  return HealthResponse.parse({
    status: "ok",
    version: commit,
    env: reportedEnvironment(input.environment),
    commit,
    appEnv: input.environment,
    region: input.region ?? HEALTH_REGION_FALLBACK,
    fxAsOf: input.fx.fxAsOf,
    fxSource: input.fx.fxSource,
    ...(input.cspEnforce === undefined ? {} : { cspEnforce: input.cspEnforce }),
  });
}

/**
 * The whole handler, minus the env read: 200 JSON with the headers above and the request's
 * `x-request-id` echoed back. `src/lib/request-id.ts` owns that contract and `src/proxy.ts` has
 * already put a validated UUID v4 on the request, so those helpers are imported rather than
 * re-declared here; `resolveRequestId` also covers a direct call that bypassed the proxy.
 */
export function healthResponse(request: Request, input: HealthInput): Response {
  const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));
  return new Response(JSON.stringify(buildHealthResponse(input)), {
    status: 200,
    headers: { ...HEALTH_HEADERS, [REQUEST_ID_HEADER]: requestId },
  });
}

/**
 * Pass the CSP enforcement state through, logging one `warn` line when it is `degraded`
 * (TASK-058, `/review 196` item 4). The cache handler that fails open cannot log — it runs outside
 * the bundle — so this is the line a log alert or the scheduled check of
 * `docs/runbooks/csp-enforce.md` keys on: `csp_enforce` is a closed-set value, nothing else is
 * written.
 */
export function reportCspEnforce(
  state: CspEnforceState,
  log: Logger = defaultLogger,
): CspEnforceState {
  if (state === "degraded") {
    log.warn({ csp_enforce: state }, "csp enforcement degraded");
  }
  return state;
}
