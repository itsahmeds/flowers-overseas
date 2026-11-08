/**
 * `postMp` (spec 023 §5.2 "The outbox target", "Validation on staging", AC-20, AC-23, AC-26,
 * AC-28; TASK-491): one `POST` to GA4's **EU** collection host, `region1.google-analytics.com`,
 * with a 5 s timeout.
 *
 *  - A network error or the timeout **throws** (the dispatcher retries); any HTTP answer is
 *    returned as its status, and the handler decides (2xx sent, 4xx rejected, 5xx throw).
 *  - With `validate`, the same body goes first to `/debug/mp/collect`; the answer's
 *    `validationMessages` are logged as a count and their `validationCode` values only, never a
 *    `fieldPath`, the body or the URL. A failed validation call never stops the real send.
 *  - The URL carries `api_secret`, so it is never logged; the logger and Sentry redact the key
 *    and the query value (`src/lib/logger.ts`, `src/lib/url-tokens.ts`).
 */
import { logger as defaultLogger, type Logger } from "@/lib/logger";

import { type MpBody, MpValidationResponseSchema } from "../events";

/** GA4's EU collection origin (Google [M1]). */
export const MP_ORIGIN = "https://region1.google-analytics.com";
export const MP_COLLECT_PATH = "/mp/collect";
export const MP_DEBUG_PATH = "/debug/mp/collect";
export const MP_TIMEOUT_MS = 5_000;

export interface MpTarget {
  readonly measurementId: string;
  readonly apiSecret: string;
}

export interface PostMpOptions {
  readonly validate: boolean;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
  readonly log?: Logger;
}

function mpUrl(path: string, target: MpTarget): string {
  const url = new URL(path, MP_ORIGIN);
  url.searchParams.set("measurement_id", target.measurementId);
  url.searchParams.set("api_secret", target.apiSecret);
  return url.toString();
}

async function post(
  doFetch: typeof fetch,
  url: string,
  body: MpBody,
  timeoutMs: number,
): Promise<Response> {
  return doFetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "error",
  });
}

/** Thrown for a network failure or the timeout: retryable, and it names no URL. */
export class MpTransportError extends Error {
  readonly code = "ANALYTICS_MP_TRANSPORT";

  constructor(kind: "timeout" | "network") {
    super(`ANALYTICS_MP_TRANSPORT: ${kind}`);
    this.name = "MpTransportError";
  }
}

/** Posts `body`; resolves to the HTTP status of the real send. */
export async function postMp(
  body: MpBody,
  target: MpTarget,
  options: PostMpOptions,
): Promise<number> {
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? MP_TIMEOUT_MS;
  const log = options.log ?? defaultLogger;
  if (options.validate) {
    try {
      const answer = await post(
        doFetch,
        mpUrl(MP_DEBUG_PATH, target),
        body,
        timeoutMs,
      );
      const parsed = MpValidationResponseSchema.safeParse(await answer.json());
      const messages = parsed.success ? parsed.data.validationMessages : [];
      log.info(
        {
          validation_count: messages.length,
          validation_codes: messages
            .map((message) => message.validationCode)
            .filter((code): code is string => code !== undefined),
        },
        "analytics.validation",
      );
    } catch (error) {
      log.warn(
        { error_class: error instanceof Error ? error.name : "unknown" },
        "analytics.validation_failed",
      );
    }
  }
  let response: Response;
  try {
    response = await post(
      doFetch,
      mpUrl(MP_COLLECT_PATH, target),
      body,
      timeoutMs,
    );
  } catch (error) {
    const timeout =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");
    throw new MpTransportError(timeout ? "timeout" : "network");
  }
  // The body is not read: GA4 answers 2xx with no content for a received hit.
  await response.body?.cancel().catch(() => undefined);
  return response.status;
}
