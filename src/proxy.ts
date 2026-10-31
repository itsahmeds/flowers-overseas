/**
 * Request-id proxy (spec 001 §5.2, §11, TASK-005; renamed from `middleware.ts` in TASK-032).
 *
 * Next 16 replaces the `middleware` file convention with `proxy` (same request/response API and
 * `config.matcher`, always the Node.js runtime, no route segment config); the named export is
 * `proxy`.
 *
 * What it does: give every request an `x-request-id` (UUID v4), attach the URL locale as
 * `x-fo-locale`, and log one `info` line at start and one at end with method, path, status,
 * duration, that id and the locale — "nothing else" (spec 001 §11).
 *
 * The locale comes from the **first path segment and nothing else** (spec 003 §11): never from
 * `Accept-Language`, never from a cookie, never from a geo header, so no response varies by
 * request header and none carries `Vary` (spec 003 AC-9, ADR-0006, enforced by
 * `fo/no-geo-redirect`, which matches this filename). A path with no launch-locale prefix (`/`,
 * `/robots.txt`, `/api/health`, `/nope`) gets no header and no `locale` log field rather than a
 * guessed one. Still no redirects of any kind.
 *
 * **The country chooser** (spec 004 §14 A-founder-2026-10-24a item 3; TASK-385) is the one address
 * the proxy routes: `/{locale}/{chooseSegment}/...` is served by the chooser page, except the path
 * form `/{locale}/{chooseSegment}/{iso2}/{next}`, which is a choice and is served by the choice
 * route (its `303` and its `Set-Cookie: fo_dest`). The split reads the path and the country
 * registry only (`src/lib/chooser-routes.ts`), and it is a **rewrite**: the proxy redirects
 * nothing and sets no cookie.
 */
import { type NextRequest, NextResponse } from "next/server";

import {
  BASIC_AUTH_CHALLENGE_HEADERS,
  STAGING_BASIC_AUTH_KEY,
  basicAuthDecision,
} from "@/lib/basic-auth";
import { chooserAddress, chooserTargetPath } from "@/lib/chooser-routes";
import { appEnvironment } from "@/lib/env.schema";
import { logger } from "@/lib/logger";
import { REQUEST_ID_HEADER, resolveRequestId } from "@/lib/request-id";
import { parseLocaleFromPath } from "@/modules/i18n";

/** Downstream request header carrying the locale parsed from the path (spec 003 §11). */
export const LOCALE_HEADER = "x-fo-locale";

/**
 * The environment and the access credential, read once at module load (spec 040 §5.3, AC-25;
 * TASK-098). `appEnvironment()` is the only environment reader (§5.2) and `STAGING_BASIC_AUTH` is
 * absent-means-off (§12), so a laptop, CI and `production` all behave exactly as before this
 * task. The decision is a pure function in `@/lib/basic-auth`; nothing about the credential is
 * logged (spec 001 §8).
 */
const environment = appEnvironment(process.env);
const credential = process.env[STAGING_BASIC_AUTH_KEY];

/** The rewrite's URL: the target path with the request's own query (the form's `to`). */
function chooserTarget(request: NextRequest, path: string): URL {
  const target = new URL(path, request.url);
  target.search = request.nextUrl.search;
  return target;
}

export function proxy(request: NextRequest): NextResponse {
  const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));
  const started = Date.now();
  const method = request.method;
  // `pathname` only: no query string, so no PII can enter a log line through a URL (spec 001 §8).
  const path = request.nextUrl.pathname;
  const { locale } = parseLocaleFromPath(path);
  const log = logger.child({
    request_id: requestId,
    ...(locale === undefined ? {} : { locale }),
  });

  log.info({ method, path }, "request start");

  // The non-production access gate (AC-25): 401 before anything renders, `/api/health` exempt.
  if (
    basicAuthDecision({
      environment,
      credential,
      pathname: path,
      authorization: request.headers.get("authorization"),
    }) === "challenge"
  ) {
    const challenge = new NextResponse(null, {
      status: 401,
      headers: { ...BASIC_AUTH_CHALLENGE_HEADERS },
    });
    challenge.headers.set(REQUEST_ID_HEADER, requestId);
    log.info(
      {
        method,
        path,
        status: challenge.status,
        duration_ms: Date.now() - started,
      },
      "request end",
    );
    return challenge;
  }

  const headers = new Headers(request.headers);
  headers.set(REQUEST_ID_HEADER, requestId);
  if (locale !== undefined) headers.set(LOCALE_HEADER, locale);
  const chooser = chooserAddress(path);
  const response =
    chooser === undefined
      ? NextResponse.next({ request: { headers } })
      : NextResponse.rewrite(
          chooserTarget(request, chooserTargetPath(chooser)),
          {
            request: { headers },
          },
        );
  response.headers.set(REQUEST_ID_HEADER, requestId);

  // No `status` here (`/review 26` nit, TASK-058): `NextResponse.next()` is always 200, because
  // the proxy runs **before** the route, so logging `response.status` reported 200 for every 204,
  // 404 and 415 the route went on to answer. A field the proxy cannot know is omitted rather than
  // invented; the one response the proxy does answer itself, the 401 above, still logs its status.
  log.info(
    {
      method,
      path,
      duration_ms: Date.now() - started,
    },
    "request end",
  );

  return response;
}

export const config = {
  // Everything except Next's own static output; nothing to trace there.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
