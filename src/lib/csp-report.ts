/**
 * `POST /api/csp-report` — the contract (spec 004 §5.2, AC-23, ADR-0016; TASK-046).
 *
 * Kept free of `server-only` and of any Next import, like `src/lib/health.ts`, so the whole
 * response — status, headers and the log line — is unit-testable and the route file under
 * `src/app/` stays thin (`plan/01` §5).
 *
 * ## What is logged, and what is deliberately thrown away
 *
 * A violation report is attacker-influenced data about a page a real person was looking at, so
 * §8's "no PII in logs" is not advice here. Exactly two fields survive:
 *
 *  - `directive` — the `effective-directive` (or `violated-directive`, which is what older
 *    Chromium sends), from a **closed set**: an unrecognised value is logged as `other`, so a
 *    report cannot write arbitrary text into a log line;
 *  - `blocked_origin` — the **origin** of `blocked-uri`, never the path and never the query. The
 *    CSP keyword forms (`inline`, `eval`, `data`, `blob`, `wasm-eval`) pass through as themselves
 *    because they are not URLs.
 *
 * Dropped without being read: `document-uri` / `documentURL` (the page URL, which in this product
 * can carry a recipient's town in a path segment and always could carry a query), `referrer`,
 * `script-sample` / `sample` (a slice of the offending script, i.e. potentially user content),
 * `source-file`, `line-number`, `column-number`, `status-code`, and the whole `User-Agent` — the
 * request's headers are not read at all, so there is nothing to redact.
 *
 * ## Why it never fails
 *
 * A route that 500s on a malformed body hands an attacker a way to fill the error budget, and a
 * browser retries nothing, so the 500 buys no information either. An unparsable body increments a
 * counter and answers `204`. A flood is dropped by a per-instance, per-minute counter — trivially
 * evadable across instances, and that is fine: the purpose is to keep one misconfigured deploy
 * from writing a million log lines, not to stop an attacker who has nothing to gain. The
 * consequence for whoever reads the reports is recorded in ADR-0016: because the window is
 * per-instance and instances scale out, the log is a **floor** on violations, so "quiet enough to
 * enforce" is a judgement over a period of real traffic and not the absence of 60 lines in a
 * minute.
 *
 * A body that declares more than `CSP_REPORT_MAX_BYTES` is answered `204` without being read
 * (`/review 26`): `request.json()` would otherwise parse a megabyte before the schema rejected
 * it. A request that declares no length is still parsed, and is bounded by the counter above.
 */
import { z } from "zod";

import { logger as defaultLogger, type Logger } from "./logger";

/** Content types a browser actually uses. Anything else is a 415 (spec 004 §5.2). */
export const CSP_REPORT_CONTENT_TYPES = [
  // `report-uri` (deprecated, still the only shape Safari and older Chromium send).
  "application/csp-report",
  // The Reporting API (`Reporting-Endpoints` + `report-to`).
  "application/reports+json",
] as const;

/** Reports dropped after this many in one window, per running instance. */
/**
 * The largest body this endpoint will read, in bytes (`/review 26`, non-blocking note 1).
 *
 * A real report is a few hundred bytes; the two schemas cap what is *kept* but `request.json()`
 * would happily parse megabytes before the parse rejects them. So an oversized declared
 * `Content-Length` is answered `204` — like every other unusable report — without reading the
 * body. It is a bound on work, not a security boundary: a chunked request declares no length and
 * is still parsed, which the rate limiter above bounds to 60 bodies a minute per instance.
 */
export const CSP_REPORT_MAX_BYTES = 16 * 1024;

export const CSP_REPORT_RATE_LIMIT = 60;
export const CSP_REPORT_WINDOW_MS = 60_000;

export const CSP_REPORT_HEADERS: Readonly<Record<string, string>> =
  Object.freeze({
    "cache-control": "no-store",
    "x-robots-tag": "noindex",
  });

/**
 * The directives this policy actually contains (`src/lib/csp.ts`), plus `other`. A closed set is
 * what keeps attacker-controlled text out of the log line; `other` is what keeps a directive
 * added tomorrow from being reported as nothing.
 */
export const CSP_DIRECTIVES = [
  "default-src",
  "script-src",
  "script-src-elem",
  "script-src-attr",
  "style-src",
  "style-src-elem",
  "style-src-attr",
  "img-src",
  "font-src",
  "connect-src",
  "frame-src",
  "frame-ancestors",
  "base-uri",
  "object-src",
  "form-action",
  "other",
] as const;
export type CspDirective = (typeof CSP_DIRECTIVES)[number];

/** Non-URL `blocked-uri` values the CSP grammar uses. Passed through verbatim. */
export const CSP_BLOCKED_KEYWORDS = [
  "inline",
  "eval",
  "wasm-eval",
  "data",
  "blob",
  "filesystem",
  "self",
] as const;

/** Reported when `blocked-uri` is absent, unparsable or not a keyword. */
export const UNKNOWN_ORIGIN = "unknown";

/**
 * `report-uri` shape. Every field is optional and unknown fields are ignored rather than
 * rejected: browsers differ, and a report we cannot fully parse is still worth one line.
 */
const ReportUriBody = z.object({
  "csp-report": z.object({
    "effective-directive": z.string().optional(),
    "violated-directive": z.string().optional(),
    "blocked-uri": z.string().optional(),
  }),
});

/** Reporting-API shape: a batch of reports, of which only the CSP ones are ours. */
const ReportingApiBody = z.array(
  z.object({
    type: z.string().optional(),
    body: z
      .object({
        effectiveDirective: z.string().optional(),
        violatedDirective: z.string().optional(),
        blockedURL: z.string().optional(),
      })
      .optional(),
  }),
);

export const CspReportSchema = z.union([ReportUriBody, ReportingApiBody]);

/** One log-worthy violation: two fields, both from closed or normalised vocabularies. */
export interface RedactedViolation {
  readonly directive: CspDirective;
  readonly blocked_origin: string;
}

function normaliseDirective(value: string | undefined): CspDirective {
  // `violated-directive` is historically the whole directive (`script-src 'self'`), so only the
  // first token is considered.
  const name = (value ?? "").trim().split(/\s+/)[0] ?? "";
  return (CSP_DIRECTIVES as readonly string[]).includes(name)
    ? (name as CspDirective)
    : "other";
}

/**
 * The origin of a blocked URL, or a CSP keyword, or `unknown`. Never a path, never a query: the
 * only thing worth knowing from a report is *which origin* the policy would have blocked.
 */
export function blockedOrigin(value: string | undefined): string {
  const raw = (value ?? "").trim();
  if (raw === "") return UNKNOWN_ORIGIN;
  if ((CSP_BLOCKED_KEYWORDS as readonly string[]).includes(raw)) return raw;
  try {
    return new URL(raw).origin;
  } catch {
    return UNKNOWN_ORIGIN;
  }
}

/** Project a parsed body onto the fields that may be logged. */
export function redactCspReport(
  report: z.infer<typeof CspReportSchema>,
): readonly RedactedViolation[] {
  if (Array.isArray(report)) {
    return report
      .filter(
        (entry) => entry.type === undefined || entry.type === "csp-violation",
      )
      .map((entry) => ({
        directive: normaliseDirective(
          entry.body?.effectiveDirective ?? entry.body?.violatedDirective,
        ),
        blocked_origin: blockedOrigin(entry.body?.blockedURL),
      }));
  }
  const body = report["csp-report"];
  return [
    {
      directive: normaliseDirective(
        body["effective-directive"] ?? body["violated-directive"],
      ),
      blocked_origin: blockedOrigin(body["blocked-uri"]),
    },
  ];
}

/** True when the request's `Content-Type` is one a browser sends for a violation report. */
export function acceptsContentType(contentType: string | null): boolean {
  const type = (contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  return (CSP_REPORT_CONTENT_TYPES as readonly string[]).includes(type);
}

export interface RateLimiter {
  /** `true` when this report is within the window's allowance. */
  allow(): boolean;
}

/**
 * A fixed-window counter. Per instance, on purpose (see the header): it bounds the log volume of
 * one bad deploy and claims nothing more.
 */
export function createRateLimiter(
  limit: number = CSP_REPORT_RATE_LIMIT,
  windowMs: number = CSP_REPORT_WINDOW_MS,
  now: () => number = () => Date.now(),
): RateLimiter {
  let windowStart = now();
  let count = 0;
  return {
    allow() {
      const current = now();
      if (current - windowStart >= windowMs) {
        windowStart = current;
        count = 0;
      }
      count += 1;
      return count <= limit;
    },
  };
}

/**
 * True when the request declares more than `CSP_REPORT_MAX_BYTES`. An absent, empty or
 * unparsable header is `false`: it means "no declaration", not "too big", and the body is then
 * bounded by the rate limit rather than by a number nobody sent.
 */
export function declaredTooLarge(contentLength: string | null): boolean {
  if (contentLength === null) return false;
  const declared = Number(contentLength.trim());
  if (!Number.isFinite(declared) || declared < 0) return false;
  return declared > CSP_REPORT_MAX_BYTES;
}

/** The process-wide limiter the route uses. */
const limiter = createRateLimiter();

export interface CspReportOptions {
  readonly logger?: Logger;
  readonly limiter?: RateLimiter;
}

/**
 * Handle one report. Answers `415` for a content type no browser sends, `204` for everything
 * else — accepted, malformed and rate-limited alike — and never 5xx (AC-23).
 */
export async function cspReportResponse(
  request: Request,
  options: CspReportOptions = {},
): Promise<Response> {
  const log = options.logger ?? defaultLogger;
  const gate = options.limiter ?? limiter;
  const headers = { ...CSP_REPORT_HEADERS };

  if (!acceptsContentType(request.headers.get("content-type"))) {
    return new Response(null, { status: 415, headers });
  }
  if (!gate.allow()) {
    return new Response(null, { status: 204, headers });
  }
  if (declaredTooLarge(request.headers.get("content-length"))) {
    log.warn({ csp_report_oversized: 1 }, "csp report too large");
    return new Response(null, { status: 204, headers });
  }

  let parsed: z.infer<typeof CspReportSchema>;
  try {
    parsed = CspReportSchema.parse(await request.json());
  } catch {
    // A count, not the body: the body is the thing that must not be logged (spec 004 §5.2).
    log.warn({ csp_report_invalid: 1 }, "csp report unparsable");
    return new Response(null, { status: 204, headers });
  }

  for (const violation of redactCspReport(parsed)) {
    // Spread into a fresh record: `LogFields` is an index signature, and passing the interface
    // straight through would need a cast, which is the kind of thing that later hides a field.
    log.warn(
      {
        directive: violation.directive,
        blocked_origin: violation.blocked_origin,
      },
      "csp violation",
    );
  }
  return new Response(null, { status: 204, headers });
}
