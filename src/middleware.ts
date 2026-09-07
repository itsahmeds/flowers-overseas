/**
 * Request-id middleware (spec 001 §5.2, §11, TASK-005).
 *
 * The only thing it does: give every request an `x-request-id` (UUID v4) and log one `info` line
 * at start and one at end with method, path, status, duration and that id — "nothing else"
 * (spec 001 §11). No locale logic (spec 003), no redirects and no geo reads at all (ADR-0006,
 * enforced by `fo/no-geo-redirect`).
 *
 * Runs on the edge runtime, hence `src/lib/logger.ts` must stay edge-safe (see its header).
 */
import { type NextRequest, NextResponse } from "next/server";

import { logger } from "@/lib/logger";

export const REQUEST_ID_HEADER = "x-request-id";

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Reuse a caller's id when it is a UUID v4 (so a client cannot inject arbitrary log content). */
export function resolveRequestId(incoming: string | null): string {
  return incoming !== null && UUID_V4.test(incoming)
    ? incoming
    : crypto.randomUUID();
}

export function middleware(request: NextRequest): NextResponse {
  const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));
  const log = logger.child({ request_id: requestId });
  const started = Date.now();
  const method = request.method;
  // `pathname` only: no query string, so no PII can enter a log line through a URL (spec 001 §8).
  const path = request.nextUrl.pathname;

  log.info({ method, path }, "request start");

  const headers = new Headers(request.headers);
  headers.set(REQUEST_ID_HEADER, requestId);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set(REQUEST_ID_HEADER, requestId);

  log.info(
    {
      method,
      path,
      status: response.status,
      duration_ms: Date.now() - started,
    },
    "request end",
  );

  return response;
}

export const config = {
  // Everything except Next's own static output; nothing to trace there.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
