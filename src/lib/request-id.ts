/**
 * `x-request-id` contract (spec 001 §5.2, §11, AC-14; extracted in TASK-032).
 *
 * The header name and the validation live here rather than in `src/proxy.ts` so that both writers
 * of the header — the proxy (every request) and `src/lib/health.ts` (a direct call that bypassed
 * the proxy) — share one definition instead of importing an application entry point from a
 * library module (`/review 6`).
 *
 * Dependency-free on purpose: imported by the proxy, so nothing here may reach for Node built-ins
 * beyond the Web `crypto` global.
 */

/** Header carrying the per-request correlation id (spec 001 §5.2). */
export const REQUEST_ID_HEADER = "x-request-id";

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Reuse a caller's id when it is a UUID v4 (so a client cannot inject arbitrary log content). */
export function resolveRequestId(incoming: string | null): string {
  return incoming !== null && UUID_V4.test(incoming)
    ? incoming
    : crypto.randomUUID();
}
