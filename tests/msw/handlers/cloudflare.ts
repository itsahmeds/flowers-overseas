/**
 * The Cloudflare zone purge endpoint, mocked (spec 040 §5.4 "Tag invalidation → URL purge",
 * AC-22, T-22 / T-23; TASK-102).
 *
 * `POST https://api.cloudflare.com/client/v4/zones/{zone_id}/purge_cache` with
 * `{ "files": [absolute URL, …] }` (at most 30 per request on the zone's plan, `plan/08` §3.1)
 * and `Authorization: Bearer <token>`. The success body is the envelope every v4 endpoint returns:
 * `{ success, errors, messages, result: { id } }`.
 *
 * `cloudflarePurgeHandler()` records every request it answers, so a test asserts on what the
 * adapter actually sent (how many calls, how many URLs each, which zone, which token) rather than
 * on what the adapter says it did. `respond` picks the status per attempt, so a test can answer
 * with a failure throughout or with a 500 then a 200.
 *
 * Not in the default `handlers` barrel on purpose: with `onUnhandledRequest: "error"`, a test
 * that purges without installing this handler fails, so no suite purges by accident.
 */
import { http, HttpResponse } from "msw";
import { z } from "zod";

export const CLOUDFLARE_PURGE_URL =
  "https://api.cloudflare.com/client/v4/zones/:zoneId/purge_cache";

/** One request the handler answered, as the test needs to read it back. */
export interface RecordedPurge {
  readonly zoneId: string;
  readonly authorization: string | null;
  readonly contentType: string | null;
  readonly files: readonly string[];
}

export interface PurgeHandlerOptions {
  /** Where each answered request is pushed. */
  readonly recorded?: RecordedPurge[];
  /**
   * The status for the n-th request (0-based, counted across the handler's lifetime). Defaults
   * to 200 for every request.
   */
  readonly respond?: (attempt: number) => number;
  /** Milliseconds to hold each response, so a test can observe concurrency. */
  readonly delayMs?: number;
  /** Called when a request arrives and when its response is sent (concurrency probes). */
  readonly onEnter?: () => void;
  readonly onLeave?: () => void;
}

/** The request body the purge endpoint accepts; anything else records as no files. */
const PurgeBody = z.object({ files: z.array(z.string()) });

export function cloudflarePurgeHandler(options: PurgeHandlerOptions = {}) {
  let attempt = 0;
  return http.post(CLOUDFLARE_PURGE_URL, async ({ request, params }) => {
    options.onEnter?.();
    const current = attempt;
    attempt += 1;
    const body = PurgeBody.safeParse(await request.json());
    const files = body.success ? body.data.files : [];
    options.recorded?.push({
      zoneId: String(params["zoneId"]),
      authorization: request.headers.get("authorization"),
      contentType: request.headers.get("content-type"),
      files,
    });
    if (options.delayMs !== undefined) {
      await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    }
    options.onLeave?.();
    const status = options.respond?.(current) ?? 200;
    if (status >= 200 && status < 300) {
      return HttpResponse.json(
        {
          success: true,
          errors: [],
          messages: [],
          result: { id: "9a7806061c88ada191ed06f989cc3dac" },
        },
        { status },
      );
    }
    return HttpResponse.json(
      {
        success: false,
        errors: [{ code: 10000, message: "Internal error" }],
        messages: [],
        result: null,
      },
      { status },
    );
  });
}
