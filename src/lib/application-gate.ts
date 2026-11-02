/**
 * The florist application's body bound (spec 011 §2 "Abuse controls"; AC-13; TASK-213).
 *
 * The apply page's form posts to its own URL, where Next's server action runtime parses the body
 * before the action runs, so the action can no longer bound it: the proxy is the last place that
 * sees the request before a byte is read. `applicationBodyGate` answers `too_large` for a `POST`
 * to an apply path that declares more than 64 KB, and the proxy answers `413` without reading the
 * body. Node reads exactly the declared length and no more, so a declared body is bounded by the
 * declaration.
 *
 * **Why the declaration and not `readBoundedBody`.** `readBoundedBody` (`src/lib/consent.ts`)
 * bounds a body the handler itself reads. Here the handler is Next's action runtime, and reading a
 * clone in the proxy would make the proxy asynchronous for every request of the site to serve one
 * form. A body with no declared length (chunked; no browser sends a form post that way) is
 * bounded by Next's own server action limit (`serverActions.bodySizeLimit`, 1 MB, answered `413`
 * by Next), and anything that gets through is refused field by field by the schema's bounds,
 * which write no row. A real application is a few kilobytes.
 *
 * It reads the method, the path and the declared length and nothing else: no IP address, no user
 * agent (spec 004 §8's rule for every form).
 */
import { type InfoPageId, infoPageSegments } from "@/config/info-pages";
import { localePath, routableLocaleCodes } from "@/modules/i18n/routing";

/** §2: 64 KB. `APPLICATION_MAX_BYTES` in `src/modules/partners/application/form.ts` agrees. */
export const APPLICATION_BODY_LIMIT = 64 * 1024;

const APPLY_PAGE: InfoPageId = "florist-apply";

let applyPaths: ReadonlySet<string> | undefined;

/** The apply page's path in every routable locale that has one, from the page registry. */
export function applicationPaths(): ReadonlySet<string> {
  applyPaths ??= new Set(
    routableLocaleCodes().flatMap((locale) => {
      try {
        const { segmentKey, leaves } = infoPageSegments(APPLY_PAGE, locale);
        return [localePath(locale, segmentKey, ...leaves)];
      } catch {
        return [];
      }
    }),
  );
  return applyPaths;
}

export interface ApplicationBodyRequest {
  readonly method: string;
  readonly pathname: string;
  /** The `Content-Length` header as sent, or `null`. */
  readonly contentLength: string | null;
}

/** `too_large` for a post to an apply path declaring more than 64 KB; `pass` for everything else. */
export function applicationBodyGate(
  request: ApplicationBodyRequest,
): "too_large" | "pass" {
  if (request.method !== "POST") return "pass";
  if (!applicationPaths().has(request.pathname)) return "pass";
  if (request.contentLength === null) return "pass";
  const declared = Number(request.contentLength.trim());
  if (!Number.isFinite(declared) || declared < 0) return "pass";
  return declared > APPLICATION_BODY_LIMIT ? "too_large" : "pass";
}
