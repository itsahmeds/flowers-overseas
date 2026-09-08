/**
 * `POST /api/csp-report` (spec 004 §5.2, AC-23, ADR-0016; TASK-046).
 *
 * Thin by design (`plan/01` §5): the whole contract — accepted content types, the two report
 * shapes, the redaction to `directive` + `blocked_origin`, the rate limit and the "never 5xx"
 * rule — lives in `@/lib/csp-report` where it is unit-testable without a server.
 *
 * `no-store` and `X-Robots-Tag: noindex` come from the handler's own headers rather than only
 * from the non-production `next.config` rule, so the endpoint can never be cached or indexed once
 * production is indexable; it is inside spec 001's `/api/` robots disallow either way.
 */
import { cspReportResponse } from "@/lib/csp-report";

/** Never cached, never prerendered: it is a write-only sink for browser reports. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export function POST(request: Request): Promise<Response> {
  return cspReportResponse(request);
}
