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
 * Cookies: `{prefix}.session-token`, `{prefix}.csrf-token`, `{prefix}.callback-url`, each
 * `Path={cookiePath}`, `Secure`, `HttpOnly`, `SameSite=Lax`, and **no `__Host-` name** (a
 * `__Host-` cookie must carry `Path=/`, which would contradict the surface's path). Sessions are
 * database sessions (TASK-022's `sessions`), `maxAge` from the surface, extended while used only
 * when the surface is `rolling`.
 *
 * Every write and read goes through `adapter.ts`'s runner, one `withSystemContext('auth', …)`
 * transaction each. Auth.js's logger is routed through `src/lib/logger.ts` (redaction applies).
 */
import { and, eq, gt } from "drizzle-orm";
import NextAuth, { type NextAuthConfig } from "next-auth";
import type { EmailConfig } from "next-auth/providers/email";
import { NextRequest } from "next/server";

import { sessions } from "../../../db/schema/auth";
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
} from "./schema";
import { claimSend } from "./send-limit";
import { hashIdentifier, hashSignInToken, newSignInToken } from "./tokens";

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
  /** The surface's sign-in message for a link. */
  readonly renderEmail: (link: string) => SignInEmail;
  /** The clock. */
  readonly now?: () => Date;
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
      return decodeURIComponent(part.slice(index + 1).trim());
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
  /** The Auth.js route handlers, for `{basePath}/[...nextauth]/route.ts`. */
  readonly handlers: {
    GET(request: NextRequest): Promise<Response>;
    POST(request: NextRequest): Promise<Response>;
  };
  /** `POST` of the email form. */
  requestSignIn(request: Request): Promise<Response>;
  /** `POST` of the confirm page's "Continue". */
  confirm(request: Request): Promise<Response>;
  /** `POST` of the sign-out button. */
  signOut(request: Request): Promise<Response>;
  /** The user id of a live session token, or null. */
  sessionUserId(sessionToken: string | undefined): Promise<string | null>;
  /** Where the sign-in page sends a state. */
  signInLocation(state?: SignInState): string;
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

  const signInLocation = (state?: SignInState): string =>
    state === undefined
      ? config.pages.signIn
      : `${config.pages.signIn}?state=${state}`;

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

  async function requestSignIn(request: Request): Promise<Response> {
    if (!sameOrigin(request)) return seeOther(signInLocation());
    let parsed: ReturnType<typeof SignInRequestSchema.safeParse>;
    try {
      parsed = SignInRequestSchema.safeParse(
        Object.fromEntries(await request.formData()),
      );
    } catch {
      return seeOther(signInLocation());
    }
    if (!parsed.success) return seeOther(signInLocation());
    const { email } = parsed.data;
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
          `${config.pages.confirm}?t=${token}`,
          deps.siteOrigin(),
        );
        const message = deps.renderEmail(link.toString());
        const mailer = (deps.mailer ?? getMailer)();
        await mailer.send({
          tag: config.mailTag as never,
          to: email,
          ...message,
        });
        log.info({ identifier_hash }, `${config.name}.sign_in.sent`);
      }
    } catch (error) {
      // The answer stays identical: a failure must not tell an outsider anything either.
      log.error(
        { error_name: error instanceof Error ? error.name : "unknown" },
        `${config.name}.sign_in.failed`,
      );
    }
    return seeOther(signInLocation("sent"));
  }

  async function confirm(request: Request): Promise<Response> {
    const expired = seeOther(signInLocation("expired"));
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
    return seeOther(config.pages.home, response.headers);
  }

  async function signOut(request: Request): Promise<Response> {
    if (!sameOrigin(request)) return seeOther(config.pages.home);
    const token = readCookie(request.headers.get("cookie"), names.sessionToken);
    if (token !== undefined) await adapter.deleteSession?.(token);
    const cleared = new Headers();
    cleared.append(
      "set-cookie",
      `${names.sessionToken}=; Path=${config.cookiePath}; Max-Age=0; Secure; HttpOnly; SameSite=Lax`,
    );
    log.info({}, `${config.name}.session.signed_out`);
    return seeOther(signInLocation("signed-out"), cleared);
  }

  async function sessionUserId(
    sessionToken: string | undefined,
  ): Promise<string | null> {
    if (sessionToken === undefined || sessionToken === "") return null;
    const at = now();
    return run(async (db) => {
      const [row] = await db
        .select({ userId: sessions.userId })
        .from(sessions)
        .where(
          and(
            eq(sessions.sessionToken, sessionToken),
            gt(sessions.expires, at),
          ),
        );
      return row?.userId ?? null;
    });
  }

  return {
    config,
    cookies: names,
    authConfig,
    handlers: {
      GET: (request) => lazy().handlers.GET(request),
      POST: (request) => lazy().handlers.POST(request),
    },
    requestSignIn,
    confirm,
    signOut,
    sessionUserId,
    signInLocation,
  };
}
