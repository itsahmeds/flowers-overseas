/**
 * The consent decision, its sink, and the `POST /api/consent` contract (spec 004 §2 "Consent",
 * §5.2, §8, §11, AC-19; TASK-050).
 *
 * Kept free of `server-only` and of any Next import, like `src/lib/health.ts` and
 * `src/lib/csp-report.ts`, so the whole response — status, headers and the log line — is
 * unit-testable and the route file under `src/app/` stays thin (`plan/01` §5).
 *
 * ## What a consent record is, and what it deliberately is not
 *
 * GDPR Art. 7(1) requires us to be able to *demonstrate* that consent was given, which is why
 * the lawful basis for this record is **legal obligation** and not consent itself (you cannot ask
 * for consent to store the proof of consent). The record is therefore the minimum that proves the
 * fact: an unlinkable random `cid` the browser generated, the moment of the decision, the two
 * category answers and the policy version they answered.
 *
 * It is **not** a visitor profile. No IP address, no user agent, no `Referer`, no page URL and no
 * cookie is read — not redacted afterwards, *not read*: `consentResponse()` touches exactly two
 * request headers (`content-type` and `content-length`) and `tests/unit/consent-route.test.ts`
 * spies on `Headers.get` to prove it. That is what makes the record unlinkable to a person by us,
 * which is the sentence `docs/compliance/ropa.md` row 3 stands on.
 *
 * ## The sink seam
 *
 * Phase 0 ships `logConsentSink`: one structured line per decision, which is all the durability a
 * demo needs and the only counter the founder has before analytics exist (§11). Spec 002's
 * `consent_log` table arrives as a **second implementation of the same interface** with no change
 * to this file or to the route — the same seam shape spec 003 used for the locale registry.
 *
 * ## Status codes, and why an invalid body is not an error
 *
 * `405` for a method other than `POST` (with `Allow`), `415` for a content type that is not JSON,
 * `413` for a body that declares **or streams** more than `CONSENT_MAX_BYTES` — a declared length
 * is refused unread and a chunked body is cut off at the first byte over the limit — `400` for
 * anything that does not parse under `ConsentDecisionSchema` — logged as a **count**, never as
 * content, because the body is attacker-influenced and a zod message can quote it — and `204` on
 * success. `500` is reserved for a sink that could not record: with the log sink that cannot
 * happen, but spec 002's table can be down, and silently answering `204` would tell a browser that
 * a decision was stored when it was not.
 */
import { z } from "zod";

import { logger as defaultLogger, type Logger } from "./logger";

/**
 * The version of the consent notice a decision answered. Bumped by the spec that changes the
 * categories or the disclosure text, so a stored `fo_consent` from before the change is
 * recognisably stale and the banner asks again (TASK-051 reads it).
 */
export const CONSENT_POLICY_VERSION = 1;

/** A real decision is ~200 bytes. Anything that declares more than this is refused unread. */
export const CONSENT_MAX_BYTES = 4 * 1024;

/** The only content type the endpoint accepts. */
export const CONSENT_CONTENT_TYPE = "application/json";

export const CONSENT_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  "cache-control": "no-store",
  "x-robots-tag": "noindex",
});

/**
 * The body of `POST /api/consent` (spec 004 §5.2), and the shape the `fo_consent` cookie's JSON
 * projects onto. `.strict()` matters here rather than being a habit: a field this schema does not
 * know is a field the island invented, and the one field an island must never send is anything
 * that identifies a person.
 */
export const ConsentDecisionSchema = z
  .object({
    /** Unlinkable random id, generated in the browser with `crypto.randomUUID()`. */
    cid: z.uuid(),
    /** The `CONSENT_POLICY_VERSION` the visitor answered. */
    policyVersion: z.number().int().positive(),
    analytics: z.boolean(),
    marketing: z.boolean(),
    /** ISO-8601 instant, from the browser's clock. */
    decidedAt: z.iso.datetime(),
  })
  .strict();

export type ConsentDecision = z.infer<typeof ConsentDecisionSchema>;

/**
 * Where a decision goes. One method, so spec 002's `consent_log` writer is a drop-in
 * (`plan/07` §5).
 */
export interface ConsentSink {
  record(decision: ConsentDecision): Promise<void>;
}

/**
 * Phase 0's sink: one `info` line, five fields, snake_case like every other log field. The field
 * list is written out rather than spread from the decision, so a field added to the schema
 * tomorrow cannot reach a log line without someone editing this function.
 */
export function logConsentSink(logger: Logger = defaultLogger): ConsentSink {
  return {
    record(decision) {
      logger.info(
        {
          cid: decision.cid,
          policy_version: decision.policyVersion,
          analytics: decision.analytics,
          marketing: decision.marketing,
          decided_at: decision.decidedAt,
        },
        "consent decision",
      );
      return Promise.resolve();
    },
  };
}

/** True when the request's `Content-Type` is JSON, parameters allowed. */
export function acceptsContentType(contentType: string | null): boolean {
  const type = (contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  return type === CONSENT_CONTENT_TYPE;
}

/**
 * True when the request declares more than `CONSENT_MAX_BYTES`. An absent or unparsable header is
 * `false` — "no declaration", not "too big" — and such a body is bounded by the schema instead.
 */
export function declaredTooLarge(contentLength: string | null): boolean {
  if (contentLength === null) return false;
  const declared = Number(contentLength.trim());
  if (!Number.isFinite(declared) || declared < 0) return false;
  return declared > CONSENT_MAX_BYTES;
}

/**
 * Read at most `limit` bytes of the request body, or refuse. A chunked request declares no
 * `Content-Length`, so `declaredTooLarge` alone would let a 200 KB body be buffered in full
 * before zod refused it (`/review 28` item 5): this reads the stream chunk by chunk, stops at
 * the first byte over the limit, cancels the rest and returns `null`, which the caller answers
 * `413`. A body with no stream (`request.body === null`, and the mocked requests of some
 * runtimes) falls back to `text()` and is checked after the fact — still bounded, because such a
 * request either declared its length or carries no body at all.
 */
export async function readBoundedBody(
  request: Request,
  limit: number = CONSENT_MAX_BYTES,
): Promise<string | null> {
  const body = request.body;
  if (!body) {
    const text = await request.text();
    return new TextEncoder().encode(text).byteLength > limit ? null : text;
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(buffer);
}

export interface ConsentResponseOptions {
  readonly sink?: ConsentSink;
  readonly logger?: Logger;
}

function empty(status: number, extra: Record<string, string> = {}): Response {
  return new Response(null, {
    status,
    headers: { ...CONSENT_HEADERS, ...extra },
  });
}

/**
 * Handle one decision. Reads `content-type` and `content-length` and no other header (§8).
 */
export async function consentResponse(
  request: Request,
  options: ConsentResponseOptions = {},
): Promise<Response> {
  const log = options.logger ?? defaultLogger;
  const sink = options.sink ?? logConsentSink(log);

  if (request.method !== "POST") return empty(405, { allow: "POST" });
  if (!acceptsContentType(request.headers.get("content-type"))) {
    return empty(415);
  }
  if (declaredTooLarge(request.headers.get("content-length"))) {
    return empty(413);
  }

  // Bounded read: `content-length` is a declaration, and a chunked request makes none.
  const raw = await readBoundedBody(request);
  if (raw === null) return empty(413);

  let decision: ConsentDecision;
  try {
    decision = ConsentDecisionSchema.parse(JSON.parse(raw));
  } catch {
    // A count, not the body, and not the zod message: both can quote the input (§8).
    log.warn({ consent_invalid: 1 }, "consent decision unparsable");
    return empty(400);
  }

  try {
    await sink.record(decision);
  } catch {
    // No error message: a sink failure can quote the row it tried to write.
    log.error({ consent_sink_failed: 1 }, "consent decision not recorded");
    return empty(500);
  }
  return empty(204);
}
