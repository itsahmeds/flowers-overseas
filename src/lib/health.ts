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

import { REQUEST_ID_HEADER, resolveRequestId } from "./request-id";

import type { DeploymentEnvironment } from "./env.schema";

/** Response shape of `GET /api/health` (spec 001 §5.2). */
export const HealthResponse = z.object({
  status: z.literal("ok"),
  version: z.string(),
  // `staging` joined the set with spec 040 §5.2 (TASK-097): it is a real environment this
  // deployment can be in, and a health body that cannot name it would fail its own schema.
  env: z.enum(["development", "preview", "staging", "production"]),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

/** Reported when no platform commit SHA is present, i.e. every local and CI build. */
export const HEALTH_VERSION_FALLBACK = "dev";

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
  return HealthResponse.parse({
    status: "ok",
    version: input.version ?? HEALTH_VERSION_FALLBACK,
    env: reportedEnvironment(input.environment),
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
