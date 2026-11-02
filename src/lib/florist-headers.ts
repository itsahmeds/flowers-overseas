/**
 * The florist surface's response rules (spec 011 §5.4, §6, AC-22; spec 026a §5.4, AC-4;
 * TASK-212, TASK-354).
 *
 *  - `floristHeaderRules()` — `Cache-Control: private, no-store` and `X-Robots-Tag: noindex,
 *    nofollow` on every response under `FLORIST_BASE_PATH` (pages, sign-in, `api/auth/*`, the
 *    language form, redirects and 404s), set in `next.config.ts`'s `headers()` so no response
 *    class escapes it. Listed after the environment-wide `noindex` rule, as the admin rules are.
 *    Spec 026a removed Phase 0's environment gate: the surface answers in every environment, and
 *    who gets in is `signInPolicy` read against the partner's status on each request.
 *  - `floristLanguageHeader()` — before sign-in the page's language is `?hl=` (`en`, `pl`, `de`;
 *    default `en`), never `Accept-Language` or an IP (§7). The proxy hands the validated value to
 *    the florist layout, which renders `<html lang>` but cannot read the query itself.
 *  - `rollingCookie()` — the session cookie re-issued with a fresh 30-day `Max-Age` on a florist
 *    page `GET`, so the browser keeps a session the database keeps rolling (`sessionUserId()`).
 *    Never on `api/*` (sign-in, confirm and sign-out set or clear the cookie themselves).
 */
import {
  FLORIST_BASE_PATH,
  FLORIST_PATHS,
  isFloristPath,
} from "../config/florists";

export const FLORIST_ROBOTS_HEADER = {
  key: "X-Robots-Tag",
  value: "noindex, nofollow",
} as const;

export const FLORIST_CACHE_HEADER = {
  key: "Cache-Control",
  value: "private, no-store",
} as const;

export interface FloristHeaderRule {
  readonly source: string;
  readonly headers: { key: string; value: string }[];
}

export function floristHeaderRules(
  base: string = FLORIST_BASE_PATH,
): FloristHeaderRule[] {
  const headers = [{ ...FLORIST_ROBOTS_HEADER }, { ...FLORIST_CACHE_HEADER }];
  return [
    { source: base, headers },
    { source: `${base}/:path*`, headers },
  ];
}

/** The request header that carries the validated `?hl=` to the florist layout. */
export const FLORIST_LANGUAGE_HEADER = "x-fo-florist-hl";

/** The rolling session cookie's 30 days, in seconds (spec 011 §2). */
export const FLORIST_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/** The session cookie's name (the florist instance's `__Secure-fo-florist` prefix). */
export const FLORIST_SESSION_COOKIE = "__Secure-fo-florist.session-token";

/**
 * The `Set-Cookie` options that re-issue a florist session cookie on a page `GET`, or `null` when
 * the request is not one: another method, an `api/*` path, or no cookie to roll.
 */
export function rollingCookie(input: {
  readonly method: string;
  readonly pathname: string;
  readonly value: string | undefined;
}): {
  name: string;
  value: string;
  options: {
    path: string;
    maxAge: number;
    secure: true;
    httpOnly: true;
    sameSite: "lax";
  };
} | null {
  if (input.method !== "GET" || !isFloristPath(input.pathname)) return null;
  if (input.pathname.startsWith(`${FLORIST_PATHS.base}/api/`)) return null;
  if (input.value === undefined || input.value === "") return null;
  return {
    name: FLORIST_SESSION_COOKIE,
    value: input.value,
    options: {
      path: FLORIST_PATHS.base,
      maxAge: FLORIST_COOKIE_MAX_AGE_SECONDS,
      secure: true,
      httpOnly: true,
      sameSite: "lax",
    },
  };
}
