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
 *
 * **Step 3's policy** (spec 013 §5.4, AC-2; TASK-262): on `/{locale}/checkout`, and only there,
 * when both Stripe keys are configured, the proxy sends the pay-step content security policy with
 * a per-request nonce (`src/lib/checkout-csp.ts`). Every other path, and checkout without the
 * keys, keeps the static policy of `next.config.ts`.
 *
 * **Search abuse protection** (spec 045 §2.8, §11, AC-26; TASK-403): a search address and
 * `/api/search/*` pass the process's limiter (`src/modules/search/gate.ts`, the one reader of
 * `CF-Connecting-IP`). Over the per-client limit the answer is 429, over the concurrency cap 503,
 * each with `Retry-After`; a results request is then **rewritten** with that status to the results
 * route with `x-fo-search-gate` set, so the page renders the "rate limited" state and its form
 * without searching. The proxy deletes any client-sent `x-fo-search-gate` from every request. One
 * `search.rate_limited` line (route and kind, never the address or the query).
 */
import { type NextRequest, NextResponse } from "next/server";

import {
  BASIC_AUTH_CHALLENGE_HEADERS,
  STAGING_BASIC_AUTH_KEY,
  basicAuthDecision,
} from "@/lib/basic-auth";
import { FloristQuerySchema, isFloristPath } from "@/config/florists";
import { chooserAddress, chooserTargetPath } from "@/lib/chooser-routes";
import { checkoutCspHeaders } from "@/lib/checkout-csp";
import { CSP_HEADER, CSP_REPORT_ONLY_HEADER } from "@/lib/csp";
import { applicationBodyGate } from "@/lib/application-gate";
import { appEnvironment } from "@/lib/env.schema";
import {
  FLORIST_LANGUAGE_HEADER,
  FLORIST_SESSION_COOKIE,
  rollingCookie,
} from "@/lib/florist-headers";
import { logger } from "@/lib/logger";
import { REQUEST_ID_HEADER, resolveRequestId } from "@/lib/request-id";
import { NOINDEX_HEADER_NAME } from "@/lib/robots-headers";
import {
  SEARCH_CACHE_CONTROL,
  SEARCH_REFERRER_POLICY,
  SEARCH_ROBOTS,
  SEARCH_ROUTE_SEGMENT,
  searchRouteKind,
} from "@/lib/search-routes";
import { parseLocaleFromPath } from "@/modules/i18n/routing";
import {
  type Admission,
  SEARCH_GATE_HEADER,
  clientAddress,
  searchGate,
} from "@/modules/search/gate";

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

/**
 * A refused search (AC-26): the results page in its "rate limited" state with the refusal's status
 * (a rewrite, so the address stays the search address), or an empty answer for `/api/search/*`.
 * Both carry `Retry-After` and the search headers (§5.4: `noindex`, `private, no-store`,
 * `strict-origin`).
 */
function refusedSearch(
  request: NextRequest,
  path: string,
  kind: "results" | "suggest",
  admission: Extract<Admission, { admitted: false }>,
  headers: Headers,
): NextResponse {
  const init = {
    status: admission.status,
    headers: {
      "Retry-After": String(admission.retryAfterSeconds),
      [NOINDEX_HEADER_NAME]: SEARCH_ROBOTS,
      "Cache-Control": SEARCH_CACHE_CONTROL,
      "Referrer-Policy": SEARCH_REFERRER_POLICY,
    },
  };
  if (kind === "suggest") return new NextResponse(null, init);
  const locale = path.split("/")[1] ?? "";
  headers.set(SEARCH_GATE_HEADER, admission.reason);
  const target = new URL(`/${locale}/${SEARCH_ROUTE_SEGMENT}`, request.url);
  target.search = request.nextUrl.search;
  return NextResponse.rewrite(target, { ...init, request: { headers } });
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

  // The florist application's body bound (spec 011 §2, AC-13; TASK-213): a `POST` to an apply
  // path declaring more than 64 KB is a 413 before Next's server action runtime reads a byte of
  // it. The body itself is never read here (`src/lib/application-gate.ts` says why).
  if (
    applicationBodyGate({
      method,
      pathname: path,
      contentLength: request.headers.get("content-length"),
    }) === "too_large"
  ) {
    const refused = new NextResponse(null, {
      status: 413,
      headers: { "cache-control": "no-store" },
    });
    refused.headers.set(REQUEST_ID_HEADER, requestId);
    log.info(
      {
        method,
        path,
        status: refused.status,
        duration_ms: Date.now() - started,
      },
      "request end",
    );
    return refused;
  }

  const headers = new Headers(request.headers);
  headers.set(REQUEST_ID_HEADER, requestId);
  if (locale !== undefined) headers.set(LOCALE_HEADER, locale);
  // Only the proxy says a search was refused (below); a client-sent copy never reaches a page.
  headers.delete(SEARCH_GATE_HEADER);

  // Search abuse protection (spec 045 §2.8, AC-26): before anything renders or searches.
  const searchKind = searchRouteKind(path);
  if (searchKind !== null) {
    const admission = searchGate().admit(
      clientAddress(request.headers),
      searchKind,
    );
    if (!admission.admitted) {
      log.info(
        {
          event: "search.rate_limited",
          route: searchKind,
          kind: admission.reason,
        },
        "search rate limited",
      );
      const refused = refusedSearch(
        request,
        path,
        searchKind,
        admission,
        headers,
      );
      refused.headers.set(REQUEST_ID_HEADER, requestId);
      log.info(
        {
          method,
          path,
          status: refused.status,
          duration_ms: Date.now() - started,
        },
        "request end",
      );
      return refused;
    }
  }
  // Before sign-in the florist pages speak `?hl=` (spec 011 §7): handed to the florist layout,
  // which renders `<html lang>` and cannot read the query. Any client-sent copy is dropped first.
  headers.delete(FLORIST_LANGUAGE_HEADER);
  const query = isFloristPath(path)
    ? FloristQuerySchema.safeParse(
        Object.fromEntries(request.nextUrl.searchParams),
      )
    : undefined;
  if (query?.success === true && query.data.hl !== undefined) {
    headers.set(FLORIST_LANGUAGE_HEADER, query.data.hl);
  }
  // Step 3's policy on the checkout steps page when both Stripe keys are set (spec 013 §5.4,
  // AC-2 as ruled 2026-11-04; `src/lib/checkout-csp.ts`). On the request as well, because Next
  // reads the nonce from there; any client-sent copy is dropped first, so the nonce is ours.
  const checkoutCsp = checkoutCspHeaders(path, process.env);
  if (checkoutCsp !== null) {
    headers.delete(CSP_HEADER);
    headers.delete(CSP_REPORT_ONLY_HEADER);
    for (const { key, value } of checkoutCsp) headers.set(key, value);
  }
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
  for (const { key, value } of checkoutCsp ?? []) {
    response.headers.set(key, value);
  }
  // A florist page `GET` re-issues the session cookie for 30 more days (rolling, spec 011 §2).
  const rolled = rollingCookie({
    method,
    pathname: path,
    value: request.cookies.get(FLORIST_SESSION_COOKIE)?.value,
  });
  if (rolled !== null) {
    response.cookies.set(rolled.name, rolled.value, rolled.options);
  }

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
