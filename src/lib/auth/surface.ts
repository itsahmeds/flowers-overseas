/**
 * The sign-in core's factory: `createAuthSurface(AuthSurfaceSchema)` (spec 012 §2.2, §5.2, AC-2,
 * AC-3, AC-8, AC-9; spec 011 §2 "Florist sign-in", §5.2; ruling R2; ADR-0019; TASK-217).
 *
 * One instance per surface — admin here (`admin.ts`), the florist inbox in TASK-212
 * (`florist.ts`) — each with its own base path, cookie names and path, session length, pages
 * and allow predicate, so a surface is added **without editing this file**. This is the only
 * place in the repository that configures Auth.js (AC-8's scan).
 *
 * The flow, end to end (spec 011 §5.2's link design, adopted for every surface):
 *
 *  1. `requestSignIn` — the email form's `POST`. The address is normalised; when the surface's
 *     predicate allows it **and** the send limit (5 per address per hour) admits it, the core
 *     draws a token, stores its hash (Auth.js's own scheme, `tokens.ts`) with a one-hour expiry
 *     and mails `{site}{confirm}?t={token}`: no address in the link. Whatever happened, the
 *     answer is the same empty `303` to `{signIn}?state=sent` (AC-2: byte-identical).
 *  2. `GET {confirm}?t=…` — a page that uses nothing up and renders one "Continue" button, so a
 *     mail scanner's or a chat app's preview cannot burn the token.
 *  3. `confirm` — the button's `POST`. It invokes Auth.js's email callback **in process** with the
 *     token alone; the adapter resolves the identifier from the hashed token, so the address never
 *     travels in a URL, a redirect or an access log. A used, unknown or expired token, or an
 *     address no longer allowed, lands on `{signIn}?state=expired`.
 *  4. `signOut` — deletes the session row and expires the cookie.
 *
 * **A link with a callback (spec 016 §5.2 "One-tap florist link", §12's request on spec 012;
 * TASK-331).** `createSignInLink(surface, userId, { callbackPath })` mints the same link for a
 * known member without the form (an order email): the token's hash is stored with the callback
 * path on the same row (`verification_tokens.callback_path`, `0031`), never in the URL. The path
 * must pass the surface's `callbackAllowed` (the florist surface: `{base}/orders/{uuid}`) when the
 * link is minted and again when it is used. `confirm` then lands on that path instead of home, and
 * `signedInLanding` lets the confirm page send a member who is already signed in (the same user)
 * straight there without spending the token. A used, unknown or expired token still lands on the
 * expired page.
 *
 * **The buyer extension (spec 018 §14 A-founder-2026-10-22 C.3, C.4; TASK-351), additive.** A
 * surface may name `buyer`, scope its cookies to `/` (which covers every path), and declare:
 *
 *  - `pagesFor(locale)`: the pages of a request locale, used instead of `pages` when the caller
 *    passes a locale (`requestSignIn`, `confirm`, `signOut`, `signInLocation`); its answer is
 *    parsed, and anything that is not a set of site paths falls back to `pages`. The email is
 *    rendered with `renderEmail(link, email, { locale })`.
 *  - `returnTo(path)`: the request may name a return path; one that passes `isSafeReturnPath` and
 *    the predicate is stored in the surface's `callback-url` cookie (`Max-Age` one hour, the
 *    link's life), anything else clears it. `confirm` reads the cookie, checks it again and lands
 *    there, else on the locale's home, and clears it. The answer still does not depend on the
 *    address (AC-2's bytes).
 *  - `afterSignIn(userId, email)`: run once per successful confirm. When it throws, the confirm
 *    commits nothing: the new session row is deleted, no cookie is sent, the token is put back
 *    and the answer is the expired page.
 *
 * and every surface gains `signOutEverywhere(userId)`, which deletes every `sessions` row of the
 * user. A surface that declares none of these (admin, florist) behaves exactly as before.
 *
 * Session tokens are surface-bound (`{surface}.{32 random bytes}`, TASK-212): the one `sessions`
 * table serves admin and florists, and a token minted by one surface authenticates nothing on the
 * other, even for a person who is both an admin and a florist member.
 *
 * Cookies: `{prefix}.session-token`, `{prefix}.csrf-token`, `{prefix}.callback-url`, each
 * `Path={cookiePath}`, `Secure`, `HttpOnly`, `SameSite=Lax`, and **no `__Host-` name** (a
 * `__Host-` cookie must carry `Path=/`, which would contradict the surface's path). Sessions are
 * database sessions (TASK-022's `sessions`), `maxAge` from the surface, extended while used only
 * when the surface is `rolling`: `sessionUserId()` pushes a rolling session's row back to a full
 * `maxAge` once it has less than `maxAge − one day` left (TASK-212; the core never calls Auth.js's
 * own session endpoint, so the extension lives here).
 *
 * Every write and read goes through `adapter.ts`'s runner, one `withSystemContext('auth', …)`
 * transaction each. Auth.js's logger is routed through `src/lib/logger.ts` (redaction applies).
 */
import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import NextAuth, { type NextAuthConfig } from "next-auth";
import type { EmailConfig } from "next-auth/providers/email";
import { NextRequest, after } from "next/server";

import { sessions, users, verificationTokens } from "../../../db/schema/auth";
import { logger } from "../logger";
import { type Mailer, getMailer } from "@/modules/notifications/mailer";

import {
  type AuthRunner,
  createAuthAdapter,
  systemAuthRunner,
} from "./adapter";
import {
  type AuthSurfaceConfig,
  AuthSurfaceSchema,
  ConfirmSignInSchema,
  SignInRequestSchema,
  type SignInState,
  SurfaceLocaleSchema,
  type SurfacePages,
  SurfacePagesSchema,
} from "./schema";
import { claimSend } from "./send-limit";
import {
  hashIdentifier,
  hashSignInToken,
  isSessionTokenOf,
  newSessionToken,
  newSignInToken,
  normaliseEmail,
} from "./tokens";

/** How long an emailed link is valid: one hour (spec 012 §2.2). */
export const SIGN_IN_LINK_MAX_AGE_MS = 60 * 60 * 1000;

/** The Auth.js provider id the core registers; its callback is `{basePath}/callback/email`. */
export const EMAIL_PROVIDER_ID = "email";

/** Headers on every response the core writes (spec 012 §2.2 "Never indexable", AC-5). */
export const AUTH_RESPONSE_HEADERS: Readonly<Record<string, string>> =
  Object.freeze({
    "cache-control": "no-store, private",
    "x-robots-tag": "noindex, nofollow",
  });

/** The rendered sign-in message of a surface. */
export interface SignInEmail {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

export interface AuthSurfaceDeps {
  /** One transaction per unit of work. Default: `withSystemContext('auth', …)`. */
  readonly run?: AuthRunner;
  /** The mailer. Default: the environment's (`getMailer()`), resolved at the first send. */
  readonly mailer?: () => Mailer;
  /** `AUTH_SECRET`, resolved at first use. */
  readonly secret: () => string;
  /** The site origin links are built on (`NEXT_PUBLIC_SITE_URL`). */
  readonly siteOrigin: () => string;
  /**
   * The surface's sign-in message for a link. The address is passed so a surface can write in the
   * member's language (spec 011 AC-32: the florist's `partner_member.locale_code`); it is never
   * put into the link or the message.
   */
  readonly renderEmail: (
    link: string,
    email: string,
    /** The locale of the page the link was requested from (spec 018 §14 C.3); absent if none. */
    context?: { readonly locale: string },
  ) => SignInEmail | Promise<SignInEmail>;
  /** The clock. */
  readonly now?: () => Date;
  /** Runs a task after the response. Default: Next's `after()`. */
  readonly defer?: (task: () => Promise<void>) => void;
}

/** Next's `after()`: the task runs once the response has been sent. */
function deferAfterResponse(task: () => Promise<void>): void {
  after(task);
}

/** How long a stored return path lives: one hour, the life of the link it belongs to. */
export const RETURN_PATH_MAX_AGE_SECONDS = 60 * 60;

/** The longest return path the core stores. */
const RETURN_PATH_MAX_LENGTH = 512;

/**
 * Whether `path` is a same-origin site path the core may store and land on (spec 018 §14 C.4):
 * one or more segments of `[A-Za-z0-9_-]` after single slashes, nothing else. So no origin, no
 * scheme, no `//`, no backslash, no `%` (an encoded anything), no dot segment, no query, no
 * fragment, no trailing slash, no root. The surface's `returnTo` then decides which of these it
 * admits.
 */
export function isSafeReturnPath(path: string): boolean {
  return (
    path.length <= RETURN_PATH_MAX_LENGTH &&
    /^(?:\/[A-Za-z0-9_-]+)+$/u.test(path)
  );
}

/** What the surface's route passes along with a request (spec 018 §14 C.3, C.4). */
export interface SignInOptions {
  /** The request's locale: the pages of `pagesFor(locale)` and the email's language. */
  readonly locale?: string;
  /** A return path for the sign-in to land on (`requestSignIn` only). */
  readonly returnTo?: string;
}

/** The three cookie names of a surface. */
export function cookieNames(prefix: string): {
  sessionToken: string;
  csrfToken: string;
  callbackUrl: string;
} {
  return {
    sessionToken: `${prefix}.session-token`,
    csrfToken: `${prefix}.csrf-token`,
    callbackUrl: `${prefix}.callback-url`,
  };
}

/** The cookie options every cookie of a surface carries. */
export function cookieOptions(cookiePath: string): {
  httpOnly: true;
  sameSite: "lax";
  path: string;
  secure: true;
} {
  return { httpOnly: true, sameSite: "lax", path: cookiePath, secure: true };
}

/** The value of cookie `name` in a `Cookie` header, or undefined. */
export function readCookie(
  header: string | null,
  name: string,
): string | undefined {
  if (header === null) return undefined;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      try {
        return decodeURIComponent(part.slice(index + 1).trim());
      } catch {
        // A malformed `%` sequence is no session: the caller redirects, it does not 500.
        return undefined;
      }
    }
  }
  return undefined;
}

/** True unless the request names a different origin than the host it reached (CSRF). */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin === null) return true;
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return host !== null && new URL(origin).host === host;
  } catch {
    return false;
  }
}

function seeOther(location: string, extra?: Headers): Response {
  const headers = new Headers(AUTH_RESPONSE_HEADERS);
  headers.set("location", location);
  for (const cookie of extra?.getSetCookie() ?? []) {
    headers.append("set-cookie", cookie);
  }
  return new Response(null, { status: 303, headers });
}

export interface AuthSurface {
  readonly config: AuthSurfaceConfig;
  readonly cookies: ReturnType<typeof cookieNames>;
  /** The Auth.js configuration (for the contract test and the route). */
  authConfig(): NextAuthConfig;
  /** `POST` of the email form. */
  requestSignIn(request: Request, options?: SignInOptions): Promise<Response>;
  /** `POST` of the confirm page's "Continue". */
  confirm(request: Request, options?: SignInOptions): Promise<Response>;
  /** `POST` of the sign-out button. */
  signOut(request: Request, options?: SignInOptions): Promise<Response>;
  /** The user id of a live session token, or null. */
  sessionUserId(sessionToken: string | undefined): Promise<string | null>;
  /** Where the sign-in page sends a state, in the locale's pages when given. */
  signInLocation(state?: SignInState, locale?: string): string;
  /** The pages of `locale` (`pagesFor`), or the surface's `pages`. */
  pagesOf(locale?: string): SurfacePages;
  /**
   * Deletes every `sessions` row of the user (spec 018 §14 C.3, C.7.2 "Sign out on all
   * devices"), on every surface; answers how many there were.
   */
  signOutEverywhere(userId: string): Promise<number>;
  /**
   * A link for `userId` that lands on `callbackPath` once confirmed (spec 016 §5.2), or `null`
   * when the user has no address or the surface does not allow it now. Throws when the path is
   * not one the surface admits.
   */
  createSignInLink(
    userId: string,
    options: { readonly callbackPath: string },
  ): Promise<string | null>;
  /**
   * Where the confirm page sends a member already signed in, without spending the token: the
   * token's callback when the session's user is the token's user, else `null`.
   */
  signedInLanding(
    token: string,
    sessionToken: string | undefined,
  ): Promise<string | null>;
}

/** The thrown refusal of a callback the surface does not admit (a programming error). */
export class SignInCallbackRefused extends Error {
  constructor(surface: string) {
    super(`SIGN_IN_CALLBACK_REFUSED: not a ${surface} callback path`);
    this.name = "SignInCallbackRefused";
  }
}

/**
 * `createSignInLink(surface, userId, { callbackPath })` of spec 016 §12: the link for one member,
 * landing on `callbackPath` (for the florist surface, `{FLORIST_BASE_PATH}/orders/{assignmentId}`).
 */
export function createSignInLink(
  surface: AuthSurface,
  userId: string,
  options: { readonly callbackPath: string },
): Promise<string | null> {
  return surface.createSignInLink(userId, options);
}

export function createAuthSurface(
  input: AuthSurfaceConfig,
  deps: AuthSurfaceDeps,
): AuthSurface {
  const config = AuthSurfaceSchema.parse(input);
  const run = deps.run ?? systemAuthRunner;
  const now = deps.now ?? (() => new Date());
  const names = cookieNames(config.cookiePrefix);
  const options = cookieOptions(config.cookiePath);
  const adapter = createAuthAdapter(run);
  const log = logger.child({ surface: config.name });

  const underCookiePath = (path: string): boolean =>
    config.cookiePath === "/" || path.startsWith(config.cookiePath);

  /**
   * The pages of `locale`: `pagesFor`'s answer when the locale is a tag and the answer is three
   * site paths under the cookie path with no `//` (never a scheme-relative `Location`); else
   * `pages`. A `pagesFor` that throws is a fallback too, never a 500.
   */
  function pagesOf(locale?: string): SurfacePages {
    if (config.pagesFor === undefined || locale === undefined) {
      return config.pages;
    }
    if (!SurfaceLocaleSchema.safeParse(locale).success) return config.pages;
    let answer: unknown;
    try {
      answer = config.pagesFor(locale);
    } catch {
      return config.pages;
    }
    const parsed = SurfacePagesSchema.safeParse(answer);
    if (!parsed.success) return config.pages;
    const paths = Object.values(parsed.data);
    return paths.every((path) => !path.includes("//") && underCookiePath(path))
      ? parsed.data
      : config.pages;
  }

  const signInLocation = (state?: SignInState, locale?: string): string => {
    const signIn = pagesOf(locale).signIn;
    return state === undefined ? signIn : `${signIn}?state=${state}`;
  };

  /** The usable locale of a request: a tag, on a surface with `pagesFor`; else none. */
  const localeOf = (locale: string | undefined): string | undefined =>
    config.pagesFor !== undefined &&
    locale !== undefined &&
    SurfaceLocaleSchema.safeParse(locale).success
      ? locale
      : undefined;

  /** A return path the surface admits: safe in shape, and passing its `returnTo`. */
  const returnPathAdmitted = (
    path: string | null | undefined,
  ): path is string =>
    typeof path === "string" &&
    config.returnTo !== undefined &&
    isSafeReturnPath(path) &&
    config.returnTo(path) === true;

  /** The `callback-url` cookie storing `path`, or clearing it. Admitted paths need no escaping. */
  const returnPathCookie = (path: string | undefined): string =>
    path === undefined
      ? `${names.callbackUrl}=; Path=${config.cookiePath}; Max-Age=0; Secure; HttpOnly; SameSite=Lax`
      : `${names.callbackUrl}=${path}; Path=${config.cookiePath}; Max-Age=${String(RETURN_PATH_MAX_AGE_SECONDS)}; Secure; HttpOnly; SameSite=Lax`;

  const emailProvider: EmailConfig = {
    id: EMAIL_PROVIDER_ID,
    type: "email",
    name: "Email",
    maxAge: SIGN_IN_LINK_MAX_AGE_MS / 1000,
    // The core sends its own link (`requestSignIn`); Auth.js's sign-in action is never used.
    sendVerificationRequest: () => {
      throw new Error("the sign-in core sends its own links");
    },
  };

  function authConfig(): NextAuthConfig {
    return {
      basePath: config.basePath,
      secret: deps.secret(),
      trustHost: true,
      adapter,
      providers: [emailProvider],
      session: {
        strategy: "database",
        // Surface-bound tokens (spec 011 §2: "A florist session never authenticates an admin
        // request, and the reverse"): one `sessions` table serves both surfaces, so the token
        // carries its surface and `sessionUserId()` accepts only its own.
        generateSessionToken: () => newSessionToken(config.name),
        maxAge: config.sessionMaxAgeSeconds,
        // Not rolling: a session is never extended, so it ends `maxAge` after sign-in.
        updateAge: config.rolling
          ? Math.min(24 * 60 * 60, config.sessionMaxAgeSeconds)
          : config.sessionMaxAgeSeconds,
      },
      cookies: {
        sessionToken: { name: names.sessionToken, options },
        csrfToken: { name: names.csrfToken, options },
        callbackUrl: { name: names.callbackUrl, options },
      },
      pages: {
        signIn: config.pages.signIn,
        error: config.pages.signIn,
        verifyRequest: signInLocation("sent"),
      },
      callbacks: {
        // Checked again at the callback: an address can lose access between send and click.
        signIn: async ({ user }) =>
          typeof user.email === "string" && (await config.allow(user.email)),
        redirect: ({ baseUrl }) =>
          new URL(config.pages.home, baseUrl).toString(),
      },
      logger: {
        error: (error) => {
          log.error({ error_name: error.name }, "auth.error");
        },
        warn: (code) => {
          log.warn({ code }, "auth.warn");
        },
        debug: () => undefined,
      },
    };
  }

  let nextAuth: ReturnType<typeof NextAuth> | undefined;
  const lazy = (): ReturnType<typeof NextAuth> =>
    (nextAuth ??= NextAuth(authConfig()));

  /**
   * Everything that depends on who the address is — the allowlist, the send limit, the token,
   * the mail — runs **after** the response (`defer`, Next's `after()` by default). The answer is
   * then the same bytes at the same moment for every address: no content and no timing oracle.
   */
  async function sendLink(email: string, locale?: string): Promise<void> {
    const identifier_hash = hashIdentifier(email);
    try {
      if (!(await config.allow(email))) {
        log.info(
          { reason: "not_allowlisted" },
          `${config.name}.sign_in.refused`,
        );
      } else if (!(await claimSend(email, { run, now }))) {
        log.info({ reason: "rate_limited" }, `${config.name}.sign_in.refused`);
      } else {
        const token = newSignInToken();
        await adapter.createVerificationToken?.({
          identifier: email,
          token: hashSignInToken(token, deps.secret()),
          expires: new Date(now().getTime() + SIGN_IN_LINK_MAX_AGE_MS),
        });
        // The token is base64url, so it needs no escaping in a query value.
        const link = new URL(
          `${pagesOf(locale).confirm}?t=${token}`,
          deps.siteOrigin(),
        );
        const message = await (locale === undefined
          ? deps.renderEmail(link.toString(), email)
          : deps.renderEmail(link.toString(), email, { locale }));
        const mailer = (deps.mailer ?? getMailer)();
        await mailer.send({ tag: config.mailTag, to: email, ...message });
        log.info({ identifier_hash }, `${config.name}.sign_in.sent`);
      }
    } catch (error) {
      log.error(
        { error_name: error instanceof Error ? error.name : "unknown" },
        `${config.name}.sign_in.failed`,
      );
    }
  }

  async function requestSignIn(
    request: Request,
    options: SignInOptions = {},
  ): Promise<Response> {
    const locale = localeOf(options.locale);
    if (!sameOrigin(request))
      return seeOther(signInLocation(undefined, locale));
    let parsed: ReturnType<typeof SignInRequestSchema.safeParse>;
    try {
      parsed = SignInRequestSchema.safeParse(
        Object.fromEntries(await request.formData()),
      );
    } catch {
      return seeOther(signInLocation(undefined, locale));
    }
    if (!parsed.success) return seeOther(signInLocation(undefined, locale));
    const { email } = parsed.data;
    (deps.defer ?? deferAfterResponse)(() => sendLink(email, locale));
    if (config.returnTo === undefined) {
      return seeOther(signInLocation("sent", locale));
    }
    // The return path depends on the request alone, never on the address (AC-2's bytes).
    const stored = new Headers();
    stored.append(
      "set-cookie",
      returnPathCookie(
        returnPathAdmitted(options.returnTo) ? options.returnTo : undefined,
      ),
    );
    return seeOther(signInLocation("sent", locale), stored);
  }

  const callbackAdmitted = (path: string | null | undefined): path is string =>
    typeof path === "string" && config.callbackAllowed?.(path) === true;

  async function createSignInLink(
    userId: string,
    options: { readonly callbackPath: string },
  ): Promise<string | null> {
    if (!callbackAdmitted(options.callbackPath)) {
      throw new SignInCallbackRefused(config.name);
    }
    const email = await run(async (db) => {
      const [row] = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, userId));
      return row?.email ?? null;
    });
    if (email === null || email === "") return null;
    const address = normaliseEmail(email);
    if (!(await config.allow(address))) return null;
    const token = newSignInToken();
    await run((db) =>
      db.insert(verificationTokens).values({
        identifier: address,
        token: hashSignInToken(token, deps.secret()),
        expires: new Date(now().getTime() + SIGN_IN_LINK_MAX_AGE_MS),
        callbackPath: options.callbackPath,
      }),
    );
    // The token is base64url, so it needs no escaping in a query value. No address, no path.
    return new URL(
      `${config.pages.confirm}?t=${token}`,
      deps.siteOrigin(),
    ).toString();
  }

  /** The live (unexpired, unused) row of a plain token: its address and its callback. */
  async function liveToken(
    token: string,
  ): Promise<{ identifier: string; callbackPath: string | null } | null> {
    const hashed = hashSignInToken(token, deps.secret());
    const at = now();
    return run(async (db) => {
      const [row] = await db
        .select({
          identifier: verificationTokens.identifier,
          callbackPath: verificationTokens.callbackPath,
        })
        .from(verificationTokens)
        .where(
          and(
            eq(verificationTokens.token, hashed),
            gt(verificationTokens.expires, at),
          ),
        );
      return row ?? null;
    });
  }

  async function signedInLanding(
    token: string,
    sessionToken: string | undefined,
  ): Promise<string | null> {
    if (!ConfirmSignInSchema.safeParse({ t: token }).success) return null;
    const userId = await sessionUserId(sessionToken);
    if (userId === null) return null;
    const row = await liveToken(token);
    if (row === null || !callbackAdmitted(row.callbackPath)) return null;
    const owner = await run(async (db) => {
      const [user] = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, userId));
      return user?.email ?? null;
    });
    if (owner === null || normaliseEmail(owner) !== row.identifier) {
      return null;
    }
    return row.callbackPath;
  }

  /** The live token row, for putting it back when `afterSignIn` fails. */
  async function tokenRow(token: string): Promise<{
    identifier: string;
    expires: Date;
    callbackPath: string | null;
  } | null> {
    const hashed = hashSignInToken(token, deps.secret());
    const at = now();
    return run(async (db) => {
      const [row] = await db
        .select({
          identifier: verificationTokens.identifier,
          expires: verificationTokens.expires,
          callbackPath: verificationTokens.callbackPath,
        })
        .from(verificationTokens)
        .where(
          and(
            eq(verificationTokens.token, hashed),
            gt(verificationTokens.expires, at),
          ),
        );
      return row ?? null;
    });
  }

  /**
   * Runs `afterSignIn` for the session Auth.js just created. On failure the confirm is undone:
   * the session row is deleted and the token row put back, so nothing is half-committed and the
   * same link works again. Answers whether the sign-in stands.
   */
  async function runAfterSignIn(
    response: Response,
    token: string,
    row: { identifier: string; expires: Date; callbackPath: string | null },
  ): Promise<boolean> {
    const hook = config.afterSignIn;
    if (hook === undefined) return true;
    const sessionToken = readCookie(
      response.headers
        .getSetCookie()
        .filter((cookie) => cookie.startsWith(`${names.sessionToken}=`))
        .map((cookie) => cookie.split(";", 1)[0] ?? "")
        .join("; "),
      names.sessionToken,
    );
    try {
      const owner =
        sessionToken === undefined
          ? undefined
          : await run(async (db) => {
              const [found] = await db
                .select({ userId: sessions.userId, email: users.email })
                .from(sessions)
                .innerJoin(users, eq(users.id, sessions.userId))
                .where(eq(sessions.sessionToken, sessionToken));
              return found;
            });
      if (owner === undefined) throw new Error("no session after confirm");
      await hook(owner.userId, normaliseEmail(owner.email));
      return true;
    } catch (error) {
      log.error(
        { error_name: error instanceof Error ? error.name : "unknown" },
        `${config.name}.sign_in.after_failed`,
      );
      if (sessionToken !== undefined)
        await adapter.deleteSession?.(sessionToken);
      await run((db) =>
        db
          .insert(verificationTokens)
          .values({
            identifier: row.identifier,
            token: hashSignInToken(token, deps.secret()),
            expires: row.expires,
            callbackPath: row.callbackPath,
          })
          .onConflictDoNothing(),
      );
      return false;
    }
  }

  async function confirm(
    request: Request,
    options: SignInOptions = {},
  ): Promise<Response> {
    const locale = localeOf(options.locale);
    const expired = seeOther(signInLocation("expired", locale));
    if (!sameOrigin(request)) return expired;
    let parsed: ReturnType<typeof ConfirmSignInSchema.safeParse>;
    try {
      parsed = ConfirmSignInSchema.safeParse(
        Object.fromEntries(await request.formData()),
      );
    } catch {
      return expired;
    }
    if (!parsed.success) return expired;
    // Read before Auth.js spends the token (its row, and the path with it, is deleted on use).
    let landing = pagesOf(locale).home;
    let fromToken = false;
    if (config.callbackAllowed !== undefined) {
      const path = (await liveToken(parsed.data.t))?.callbackPath;
      if (callbackAdmitted(path)) {
        landing = path;
        fromToken = true;
      }
    }
    // The return path stored at request time (C.4), checked again at use.
    if (!fromToken && config.returnTo !== undefined) {
      const stored = readCookie(
        request.headers.get("cookie"),
        names.callbackUrl,
      );
      if (returnPathAdmitted(stored)) landing = stored;
    }
    const spent =
      config.afterSignIn === undefined ? null : await tokenRow(parsed.data.t);
    // Built in process and handed to Auth.js directly: never sent, never logged.
    const callback = new URL(
      `${config.basePath}/callback/${EMAIL_PROVIDER_ID}?${new URLSearchParams({ token: parsed.data.t, callbackUrl: config.pages.home }).toString()}`,
      request.url,
    );
    const headers = new Headers();
    for (const name of [
      "cookie",
      "host",
      "x-forwarded-host",
      "x-forwarded-proto",
      "user-agent",
    ]) {
      const value = request.headers.get(name);
      if (value !== null) headers.set(name, value);
    }
    // A surface with a return path owns its `callback-url` cookie (read above): Auth.js never
    // sees it, so a malformed or planted value cannot fail the sign-in (`InvalidCallbackUrl`).
    const cookieHeader = headers.get("cookie");
    if (config.returnTo !== undefined && cookieHeader !== null) {
      const kept = cookieHeader
        .split(";")
        .filter((part) => part.split("=", 1)[0]?.trim() !== names.callbackUrl)
        .join(";");
      if (kept.trim() === "") headers.delete("cookie");
      else headers.set("cookie", kept);
    }
    let response: Response;
    try {
      response = await lazy().handlers.GET(
        new NextRequest(callback, { method: "GET", headers }),
      );
    } catch (error) {
      log.error(
        { error_name: error instanceof Error ? error.name : "unknown" },
        `${config.name}.sign_in.confirm_failed`,
      );
      return expired;
    }
    const location = response.headers.get("location");
    const signedIn =
      location !== null &&
      new URL(location, request.url).pathname === config.pages.home &&
      response.headers
        .getSetCookie()
        .some((cookie) => cookie.startsWith(`${names.sessionToken}=`));
    if (!signedIn) return expired;
    if (
      spent !== null &&
      !(await runAfterSignIn(response, parsed.data.t, spent))
    ) {
      return expired;
    }
    if (config.returnTo === undefined) {
      return seeOther(landing, response.headers);
    }
    // The return path is used up: Auth.js's own `callback-url` cookie is replaced by a clearing one.
    const landed = new Headers();
    for (const cookie of response.headers.getSetCookie()) {
      if (!cookie.startsWith(`${names.callbackUrl}=`)) {
        landed.append("set-cookie", cookie);
      }
    }
    landed.append("set-cookie", returnPathCookie(undefined));
    return seeOther(landing, landed);
  }

  async function signOut(
    request: Request,
    options: SignInOptions = {},
  ): Promise<Response> {
    const locale = localeOf(options.locale);
    if (!sameOrigin(request)) return seeOther(pagesOf(locale).home);
    const token = readCookie(request.headers.get("cookie"), names.sessionToken);
    if (token !== undefined) await adapter.deleteSession?.(token);
    const cleared = new Headers();
    cleared.append(
      "set-cookie",
      `${names.sessionToken}=; Path=${config.cookiePath}; Max-Age=0; Secure; HttpOnly; SameSite=Lax`,
    );
    log.info({}, `${config.name}.session.signed_out`);
    return seeOther(signInLocation("signed-out", locale), cleared);
  }

  async function signOutEverywhere(userId: string): Promise<number> {
    const id = z.uuid().parse(userId);
    const deleted = await run((db) =>
      db
        .delete(sessions)
        .where(eq(sessions.userId, id))
        .returning({ sessionToken: sessions.sessionToken }),
    );
    log.info(
      { count: deleted.length },
      `${config.name}.session.signed_out_everywhere`,
    );
    return deleted.length;
  }

  /** A rolling session is extended at most once a day (Auth.js's own `updateAge` rule). */
  const rollAfterMs =
    (config.sessionMaxAgeSeconds -
      Math.min(24 * 60 * 60, config.sessionMaxAgeSeconds)) *
    1000;

  async function sessionUserId(
    sessionToken: string | undefined,
  ): Promise<string | null> {
    if (sessionToken === undefined || sessionToken === "") return null;
    if (!isSessionTokenOf(config.name, sessionToken)) return null;
    const at = now();
    return run(async (db) => {
      const [row] = await db
        .select({ userId: sessions.userId, expires: sessions.expires })
        .from(sessions)
        .where(
          and(
            eq(sessions.sessionToken, sessionToken),
            gt(sessions.expires, at),
          ),
        );
      if (row === undefined) return null;
      // Rolling (spec 011 §2: the florist's 30 days): a session used with less than `maxAge −
      // one day` left is pushed back to a full `maxAge`. The row is what decides (database
      // sessions); the florist cookie's `Max-Age` is renewed by the proxy on a page `GET`
      // (`src/lib/florist-headers.ts`, `rollingCookie`).
      if (
        config.rolling &&
        row.expires.getTime() - at.getTime() < rollAfterMs
      ) {
        await db
          .update(sessions)
          .set({
            expires: new Date(
              at.getTime() + config.sessionMaxAgeSeconds * 1000,
            ),
          })
          .where(eq(sessions.sessionToken, sessionToken));
      }
      return row.userId;
    });
  }

  return {
    config,
    cookies: names,
    authConfig,
    requestSignIn,
    confirm,
    signOut,
    sessionUserId,
    signInLocation,
    pagesOf,
    signOutEverywhere,
    createSignInLink,
    signedInLanding,
  };
}
