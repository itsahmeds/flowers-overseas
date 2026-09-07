/**
 * Sentry options and the PII scrubber (spec 001 §5, §8 item 1, AC-13, TASK-005).
 *
 * Exported separately from the `sentry.*.config.ts` entrypoints so `beforeSend` is unit-testable
 * without initialising the SDK (T-14).
 *
 * Facts encoded here:
 * - Sentry is a **no-op when the DSN is unset**: `sentryOptions()` returns `undefined` and the
 *   entrypoints skip `Sentry.init`, so `Sentry.getClient()` stays `undefined` and `pnpm build`
 *   needs neither network nor auth token.
 * - `sendDefaultPii: false`, release = `VERCEL_GIT_COMMIT_SHA`, environment = `VERCEL_ENV`
 *   (spec 001 §11).
 * - `beforeSend` drops request cookies, request bodies and IPs, and redacts every `extra`/`tags`
 *   key on the logger's PII list — the same list, imported, never re-typed (spec 001 §8).
 * - Org region: EU (`de.sentry.io`), spec 001 §13 Q6. The region lives in the DSN the founder
 *   pastes into the Vercel env store; no code depends on it.
 */
import type { ErrorEvent, EventHint } from "@sentry/nextjs";

import { REDACTED, isRedactedKey } from "./logger";

/** The subset of a Sentry event this module touches. Structural, so no SDK types are needed. */
export interface ScrubbableEvent {
  request?: {
    cookies?: unknown;
    data?: unknown;
    headers?: Record<string, unknown>;
    query_string?: unknown;
    url?: string;
    method?: string;
  };
  user?: { ip_address?: string | null; [key: string]: unknown };
  extra?: Record<string, unknown>;
  tags?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Copy without the named keys. Avoids unused destructuring bindings. */
function omit(value: object, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {
    ...(value as Record<string, unknown>),
  };
  for (const key of keys) delete out[key];
  return out;
}

function scrubRecord(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    out[key] = isRedactedKey(key) ? REDACTED : value;
  }
  return out;
}

/** Remove PII from an event before it leaves the process. Returns a scrubbed copy. */
export function beforeSend<T extends ScrubbableEvent>(event: T): T {
  const scrubbed: T = { ...event };

  if (scrubbed.request) {
    const { headers } = scrubbed.request;
    // Cookies, bodies and query strings can carry anything; drop rather than parse.
    scrubbed.request = {
      ...omit(scrubbed.request, ["cookies", "data", "query_string", "headers"]),
      ...(headers === undefined ? {} : { headers: scrubRecord(headers) }),
    };
  }

  if (scrubbed.user) {
    scrubbed.user = scrubRecord(omit(scrubbed.user, ["ip_address"]));
  }

  if (scrubbed.extra) scrubbed.extra = scrubRecord(scrubbed.extra);
  if (scrubbed.tags) scrubbed.tags = scrubRecord(scrubbed.tags);

  return scrubbed;
}

/**
 * `beforeSend` in the shape `Sentry.init` expects. The generic `beforeSend` above stays free of
 * SDK types so T-14 can assert on plain objects.
 */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  return beforeSend(
    event as unknown as ScrubbableEvent,
  ) as unknown as ErrorEvent;
}

export interface SentryOptions {
  readonly dsn: string;
  readonly environment: string;
  readonly release: string | undefined;
  readonly sendDefaultPii: false;
  readonly tracesSampleRate: number;
  readonly beforeSend: (event: ErrorEvent, hint: EventHint) => ErrorEvent;
}

/**
 * Options for `Sentry.init`, or `undefined` when no DSN is configured (the Phase 0 default).
 * `dsnKey` differs per runtime: the browser bundle can only read `NEXT_PUBLIC_SENTRY_DSN`.
 */
export function sentryOptions(
  dsn: string | undefined,
): SentryOptions | undefined {
  if (dsn === undefined || dsn.trim() === "") return undefined;
  return {
    dsn,
    environment:
      process.env.VERCEL_ENV ??
      process.env.NEXT_PUBLIC_VERCEL_ENV ??
      "development",
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    sendDefaultPii: false,
    // No performance data in Phase 0; spec 025 sets a real rate when alerts exist.
    tracesSampleRate: 0,
    beforeSend: scrubEvent,
  };
}
