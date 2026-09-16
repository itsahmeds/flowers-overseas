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
 * - `sendDefaultPii: false`, release = the commit SHA of whichever platform built the image
 *   (`RAILWAY_GIT_COMMIT_SHA`, else `VERCEL_GIT_COMMIT_SHA`, else its `NEXT_PUBLIC_` mirror,
 *   which is the only one a browser bundle can read), environment = `APP_ENV` (spec 001 §11,
 *   spec 040 §5.2 / AC-32; TASK-097).
 * - **Server and edge only.** TASK-043 deleted `instrumentation-client.ts` and
 *   `sentry.client.config.ts`: the browser SDK, plus the copy of zod it pulled in through this
 *   module's `./logger` import, measured 72 KB gzipped of the 297 KB `/` shipped, against a
 *   120 KB client-JS budget (spec 004 §13 Q8, accepted; recorded in `docs/architecture.md` §4 and
 *   spec 003 §14 A12). Nothing in this file changed for it — `sentryOptions()`, the `NEXT_PUBLIC_` release
 *   mirror and `beforeSend` are runtime-agnostic on purpose, so spec 013 re-adds a client
 *   entrypoint scoped to the checkout routes without touching the scrubber. `setLocaleTag` is
 *   called from a Server Component (`src/app/[locale]/layout.tsx`), so importing this module
 *   there adds nothing to the client bundle.
 * - `beforeSend` drops request cookies, request bodies and IPs, and redacts every key on the
 *   logger's PII list — the same list, imported, never re-typed (spec 001 §8) — **at any depth**
 *   in `extra`, `tags`, `user`, `contexts`, `breadcrumbs[].data` and the request headers
 *   (hardening from the review of PR #5, TASK-007).
 * - Free-text fields that can quote user input (`message`, `breadcrumbs[].message`,
 *   `exception.values[].value`) are replaced wholesale with `"[REDACTED]"`. That is the same rule
 *   `redact()` already applies to `Error.message` in the logger, and §8's key list spells
 *   `message` (the gift message) explicitly. The cost is that a captured event groups by
 *   exception `type` and stack rather than by text; the alternative is shipping an untested
 *   pattern matcher and hoping. Spec 025 revisits this when alerts exist.
 * - Org region: EU (`de.sentry.io`), spec 001 §13 Q6. The region lives in the DSN the founder
 *   pastes into the Vercel env store; no code depends on it.
 */
import { captureMessage, getCurrentScope } from "@sentry/nextjs";
import type { ErrorEvent, EventHint } from "@sentry/nextjs";

import { REDACTED, isRedactedKey, redact } from "./logger";

/**
 * Tags that may be attached to an event, with the reason each is not PII (spec 003 §11).
 * `locale` is one of a handful of language codes taken from the URL path — it identifies a
 * language, not a person, and it is already a first-class logger field (spec 001 §5.2). It
 * survives `beforeSend` because it is absent from the PII key list, which is asserted rather than
 * assumed (`tests/unit/sentry-before-send.test.ts`).
 *
 * `signal` is the second, added by spec 005 §11 (TASK-069): the name of a business condition
 * (`catalog.fx_stale`, …) taken from a **closed set of constants in the source**, never from
 * input. It has to be a tag rather than the event message because `beforeSend` replaces free text
 * wholesale with `"[REDACTED]"` — a deliberate rule (the gift message is free text too), so the
 * only way a signal stays groupable in Sentry is a key nobody can put a person's data into.
 */
export const NON_PII_TAGS = ["locale", "signal"] as const;

/**
 * Tag the current Sentry scope with the resolved locale so error volumes can be read per locale
 * (spec 003 §11). A no-op when no client is initialised, which is the Phase 0 default (no DSN).
 * Nothing else about the request is tagged: no country, no user agent, no header value.
 */
export function setLocaleTag(locale: string): void {
  getCurrentScope().setTag("locale", locale);
}

/**
 * Report a condition that is not an error but silently produces a wrong result if nobody looks
 * (spec 005 §11's three pricing signals are the first three: a stale FX snapshot, a missing price
 * row, an ambiguous one).
 *
 * A no-op when no client is initialised, which is the Phase 0 default (no DSN) — the SDK's
 * `captureMessage` returns an event id and sends nothing. The caller logs the same fields through
 * `src/lib/logger.ts` regardless, so the signal is never *only* in Sentry.
 *
 * `signal` is a **constant** at every call site and is carried as the `signal` tag as well as the
 * message: `beforeSend` replaces free text wholesale with `"[REDACTED]"` (the gift message is free
 * text too, so the rule is right), and the tag is what survives it and keeps the three conditions
 * apart in Sentry. `fields` are attached as `extra` and pass the same key-based scrubber as any
 * other event data; callers pass a bounded field set of their own (spec 005's is
 * `CATALOG_LOG_FIELDS`).
 */
export function captureWarning(
  signal: string,
  fields: Readonly<Record<string, unknown>> = {},
): void {
  captureMessage(signal, {
    level: "warning",
    tags: { signal },
    extra: { ...fields },
  });
}

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
  contexts?: Record<string, unknown>;
  breadcrumbs?: unknown;
  exception?: { values?: unknown };
  message?: unknown;
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

/**
 * Deep key-based scrub of a record: every PII key becomes `"[REDACTED]"` at any depth, using the
 * logger's list and its cycle handling (`redact()`), not a second implementation.
 */
function scrubRecord(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    out[key] = isRedactedKey(key) ? REDACTED : redact(value);
  }
  return out;
}

/** `breadcrumbs[]`: deep-scrub `data` and drop the free-text `message` (see the module note). */
function scrubBreadcrumbs(breadcrumbs: unknown): unknown {
  if (!Array.isArray(breadcrumbs)) return redact(breadcrumbs);
  return breadcrumbs.map((crumb) => {
    if (crumb === null || typeof crumb !== "object") return redact(crumb);
    const record = crumb as Record<string, unknown>;
    return {
      ...scrubRecord(record),
      ...("message" in record ? { message: REDACTED } : {}),
    };
  });
}

/** `exception.values[]`: keep `type` and `stacktrace`, drop the free-text `value`. */
function scrubException(exception: { values?: unknown }): {
  values?: unknown;
} {
  const { values } = exception;
  if (!Array.isArray(values)) return { ...exception, values: redact(values) };
  return {
    ...exception,
    values: values.map((value) => {
      if (value === null || typeof value !== "object") return redact(value);
      const record = value as Record<string, unknown>;
      return {
        ...scrubRecord(record),
        ...("value" in record ? { value: REDACTED } : {}),
      };
    }),
  };
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
  if (scrubbed.contexts) scrubbed.contexts = scrubRecord(scrubbed.contexts);
  if (scrubbed.breadcrumbs !== undefined) {
    scrubbed.breadcrumbs = scrubBreadcrumbs(scrubbed.breadcrumbs);
  }
  if (scrubbed.exception) {
    scrubbed.exception = scrubException(scrubbed.exception);
  }
  if (scrubbed.message !== undefined) scrubbed.message = REDACTED;

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
 * Options for `Sentry.init`, or `undefined` when no DSN is configured (the Phase 0 default). The
 * DSN is passed in rather than read here because it differs per runtime: `SENTRY_DSN` on the
 * server and the edge, and `NEXT_PUBLIC_SENTRY_DSN` for a browser bundle — which is why the
 * public key stays in the env schema even with no client entrypoint (`next.config.ts` also reads
 * it to decide whether to run the source-map plugin).
 */
/** Blank env values behave as unset, so a release is either a real SHA or `undefined`. */
function nonEmpty(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === "" ? undefined : value;
}

/**
 * Release = commit SHA (spec 001 §11, spec 040 §5.2). Railway injects `RAILWAY_GIT_COMMIT_SHA`,
 * Vercel `VERCEL_GIT_COMMIT_SHA`; both are server-only, so the browser bundle falls back to
 * `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA`, which Next inlines, and client events get a release too
 * (TASK-007). This module and `src/lib/env.schema.ts` are the only two `pnpm check:no-vercel-env`
 * exempts, which is what makes the eventual Vercel unlink (§13 Q5) a two-file diff.
 */
function release(): string | undefined {
  return (
    nonEmpty(process.env.RAILWAY_GIT_COMMIT_SHA) ??
    nonEmpty(process.env.VERCEL_GIT_COMMIT_SHA) ??
    nonEmpty(process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA)
  );
}

export function sentryOptions(
  dsn: string | undefined,
): SentryOptions | undefined {
  if (dsn === undefined || dsn.trim() === "") return undefined;
  return {
    dsn,
    // Spec 040 §5.2 / AC-32: the environment tag is `APP_ENV`, mirrored to the browser as
    // `NEXT_PUBLIC_APP_ENV`. Unset ⇒ `development`, the same fail-closed default
    // `appEnvironment()` uses; the literal member expressions are what Next inlines.
    environment:
      nonEmpty(process.env.APP_ENV) ??
      nonEmpty(process.env.NEXT_PUBLIC_APP_ENV) ??
      "development",
    release: release(),
    sendDefaultPii: false,
    // No performance data in Phase 0; spec 025 sets a real rate when alerts exist.
    tracesSampleRate: 0,
    beforeSend: scrubEvent,
  };
}
