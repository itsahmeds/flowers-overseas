/**
 * `POST /api/consent` (spec 004 §5.2, AC-19; TASK-050).
 *
 * Thin by design (`plan/01` §5): the whole contract — the accepted content type, the decision
 * schema, the sink seam, the status codes and the "reads no IP, user agent, `Referer` or page
 * URL" rule of §8 — lives in `@/lib/consent`, where it is unit-testable without a server.
 *
 * `no-store` and `X-Robots-Tag: noindex` come from the handler's own headers rather than only
 * from the non-production `next.config` rule, so the endpoint can never be cached or indexed once
 * production is indexable; it is inside spec 001's `/api/` robots disallow either way.
 */
import { consentResponse } from "@/lib/consent";

/** Never cached, never prerendered: it is a write-only sink for a user's decision. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export function POST(request: Request): Promise<Response> {
  return consentResponse(request);
}
