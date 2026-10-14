/**
 * The two internal routes, minus the env read (spec 002 §5.2, §5.4, §6 "Crawl efficiency", AC-23;
 * TASK-024): `GET /api/internal/db-health` and `POST /api/internal/jobs/tick`.
 *
 * Both are **secret-gated**: the caller sends `INTERNAL_CRON_SECRET` in the
 * `x-internal-cron-secret` header, compared in constant time; anything else is a 401 before any
 * database work starts. Every response — the 401 included — is `no-store` and
 * `X-Robots-Tag: noindex`, and both paths sit under spec 001's `/api/` robots disallow
 * (`src/modules/seo/robots.ts`), so neither can be cached by Cloudflare or indexed.
 *
 * The database work is injected (`probe`, `tick`), so this module is unit-testable with no
 * database and the route files in `src/app/api/internal/` stay one call each (`plan/01` §5).
 * Neither body carries PII: counts, a latency, a migration name.
 */
import { createHash, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { logger as defaultLogger, type Logger } from "../lib/logger";
import { REQUEST_ID_HEADER, resolveRequestId } from "../lib/request-id";

import type { DbHealthData, TickCounts } from "./runtime";

/** The header the cron caller puts `INTERNAL_CRON_SECRET` in. */
export const INTERNAL_SECRET_HEADER = "x-internal-cron-secret";

/** Headers of every internal response, the 401 included (AC-23). */
export const INTERNAL_HEADERS: Readonly<Record<string, string>> = Object.freeze(
  {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-robots-tag": "noindex",
  },
);

/** `GET /api/internal/db-health`, 200 (spec 002 §5.2 `DbHealthResponse`). */
export const DbHealthResponse = z
  .object({
    ok: z.boolean(),
    latency_ms: z.number(),
    latest_migration: z.string(),
    pending_jobs: z.number(),
  })
  .strict();
export type DbHealthResponse = z.infer<typeof DbHealthResponse>;

/** `POST /api/internal/jobs/tick`, 200: counts only (spec 002 §5.2). */
export const TickResponse = z
  .object({
    ok: z.literal(true),
    fetched: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
  })
  .strict();
export type TickResponse = z.infer<typeof TickResponse>;

/** Every non-200 body: a closed-set error code and nothing else. */
export const InternalError = z
  .object({
    ok: z.literal(false),
    error: z.enum(["unauthorized", "database_unavailable", "tick_failed"]),
  })
  .strict();
export type InternalError = z.infer<typeof InternalError>;

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/**
 * True when the request carries the secret. Constant time over equal-length digests, so neither
 * the secret's length nor a matching prefix leaks through timing. An empty configured secret
 * never matches (the env contract already refuses one).
 */
export function hasInternalSecret(request: Request, secret: string): boolean {
  const supplied = request.headers.get(INTERNAL_SECRET_HEADER);
  if (supplied === null || supplied === "" || secret === "") return false;
  return timingSafeEqual(digest(supplied), digest(secret));
}

function json(request: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...INTERNAL_HEADERS,
      [REQUEST_ID_HEADER]: resolveRequestId(
        request.headers.get(REQUEST_ID_HEADER),
      ),
    },
  });
}

function unauthorized(request: Request): Response {
  return json(
    request,
    401,
    InternalError.parse({ ok: false, error: "unauthorized" }),
  );
}

export interface DbHealthDeps {
  readonly secret: string;
  readonly probe: () => Promise<DbHealthData>;
  readonly log?: Logger;
}

/** The whole of `GET /api/internal/db-health`. */
export async function dbHealthResponse(
  request: Request,
  deps: DbHealthDeps,
): Promise<Response> {
  if (!hasInternalSecret(request, deps.secret)) return unauthorized(request);
  try {
    const data = await deps.probe();
    return json(request, 200, DbHealthResponse.parse({ ok: true, ...data }));
  } catch (error) {
    (deps.log ?? defaultLogger).error(
      {
        route: "db-health",
        error_name: error instanceof Error ? error.name : "Error",
      },
      "internal.db_health_failed",
    );
    return json(
      request,
      503,
      InternalError.parse({ ok: false, error: "database_unavailable" }),
    );
  }
}

export interface TickDeps {
  readonly secret: string;
  readonly tick: () => Promise<TickCounts>;
  readonly log?: Logger;
}

/** The whole of `POST /api/internal/jobs/tick`. */
export async function tickResponse(
  request: Request,
  deps: TickDeps,
): Promise<Response> {
  if (!hasInternalSecret(request, deps.secret)) return unauthorized(request);
  const log = deps.log ?? defaultLogger;
  try {
    const counts = await deps.tick();
    log.info({ route: "jobs-tick", ...counts }, "internal.tick");
    return json(request, 200, TickResponse.parse({ ok: true, ...counts }));
  } catch (error) {
    log.error(
      {
        route: "jobs-tick",
        error_name: error instanceof Error ? error.name : "Error",
      },
      "internal.tick_failed",
    );
    return json(
      request,
      500,
      InternalError.parse({ ok: false, error: "tick_failed" }),
    );
  }
}
