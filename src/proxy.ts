/**
 * Request-id proxy (spec 001 §5.2, §11, TASK-005; renamed from `middleware.ts` in TASK-032).
 *
 * Next 16 replaces the `middleware` file convention with `proxy` (same request/response API and
 * `config.matcher`, always the Node.js runtime, no route segment config); the named export is
 * `proxy`.
 *
 * The only thing it does: give every request an `x-request-id` (UUID v4) and log one `info` line
 * at start and one at end with method, path, status, duration and that id — "nothing else"
 * (spec 001 §11). No locale logic yet (spec 003 TASK-034 attaches `locale`), no redirects and no
 * geo reads at all (ADR-0006, enforced by `fo/no-geo-redirect`, which matches this filename).
 */
import { type NextRequest, NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { REQUEST_ID_HEADER, resolveRequestId } from "@/lib/request-id";

export function proxy(request: NextRequest): NextResponse {
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
