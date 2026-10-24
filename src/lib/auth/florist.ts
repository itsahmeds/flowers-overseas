/**
 * The florist instance of the sign-in core (spec 011 §2 "Florist sign-in", §5.2, AC-18 to AC-22,
 * AC-32; spec 012 AC-9, florist-route half; ADR-0019; ruling R2; TASK-212).
 *
 *  - Built by the core's factory (`createAuthSurface`); no second Auth.js configuration, adapter or
 *    mailer (AC-22's scan). `basePath` `{FLORIST_BASE_PATH}/api/auth`; pages under
 *    `{FLORIST_BASE_PATH}/sign-in`; cookies `__Secure-fo-florist.session-token`, `.csrf-token`,
 *    `.callback-url`, each `Path={FLORIST_BASE_PATH}`, `Secure`, `HttpOnly`, `SameSite=Lax`, no
 *    `__Host-` name; database sessions of 30 days, rolling; session tokens bound to the surface
 *    (`florist.…`), so an admin session authenticates nothing here and the reverse.
 *  - Who may receive a link (AC-18): an address whose `users` row is a `partner_member` of a
 *    partner whose status `signInPolicy(environment)` allows: `demo` outside production, nobody in
 *    production (§13 Q4). Every other address gets the same page and no email.
 *  - `resolveFloristContext()` / `requireFloristContext()` (AC-20): the session's member and their
 *    memberships, read from the database **on every request**, and only memberships of partners
 *    the policy still allows. No session, or no such membership, is no context: a page redirects
 *    to sign-in. `toDbContext()` turns it into the `partner` database context, so Postgres
 *    row-level security does the scoping (TASK-023).
 *  - The member's language (AC-32): `partner_member.locale_code`, the email included.
 */
import { and, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";

import { users } from "../../../db/schema/auth";
import {
  fulfillmentPartner,
  partnerMember,
  partnerMemberRoles,
  partnerTranslation,
} from "../../../db/schema/partners";
import {
  FLORIST_PARTNER_STATUSES,
  FLORIST_PATHS,
  type FloristLanguage,
  FloristLanguageSchema,
  signInPolicy,
} from "@/config/florists";
import { floristLanguageOf } from "@/modules/partners/auth/copy";
import { renderFloristSignInEmail } from "@/modules/partners/auth/sign-in-email";

import type { DbContext } from "../db";
import { authSecret } from "../env.auth";
import { appEnvironment } from "../env.schema";

import { type AuthRunner, systemAuthRunner } from "./adapter";
import type { AuthSurfaceConfig } from "./schema";
import {
  AUTH_RESPONSE_HEADERS,
  type AuthSurface,
  createAuthSurface,
  readCookie,
  sameOrigin,
} from "./surface";
import { normaliseEmail } from "./tokens";

/** 30 days, rolling (spec 011 §2). */
export const FLORIST_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/** The deployment environment the policy is read for. */
function currentEnvironment(): string {
  return appEnvironment(process.env);
}

/**
 * The statuses the policy allows in `environment`, as a non-empty list, or `null` when nobody may
 * sign in there (production in Phase 0): the query is never run with an empty `IN ()`.
 */
function allowedStatuses(environment: string): string[] | null {
  const statuses = [...signInPolicy(environment)];
  return statuses.length === 0 ? null : statuses;
}

/** Whether `email` may receive a florist sign-in link in `environment` (AC-18). */
export async function isFloristAllowed(
  email: string,
  options: { run?: AuthRunner; environment?: string } = {},
): Promise<boolean> {
  const statuses = allowedStatuses(options.environment ?? currentEnvironment());
  if (statuses === null) return false;
  const run = options.run ?? systemAuthRunner;
  const address = normaliseEmail(email);
  return run(async (db) => {
    const rows = await db
      .select({ partnerId: partnerMember.partnerId })
      .from(users)
      .innerJoin(partnerMember, eq(partnerMember.userId, users.id))
      .innerJoin(
        fulfillmentPartner,
        eq(fulfillmentPartner.id, partnerMember.partnerId),
      )
      .where(
        and(
          eq(users.email, address),
          inArray(fulfillmentPartner.status, statuses),
        ),
      )
      .limit(1);
    return rows.length > 0;
  });
}

/** The language of the member behind `email` (their first membership's), else `en`. */
export async function floristLanguageForEmail(
  email: string,
  run: AuthRunner = systemAuthRunner,
): Promise<FloristLanguage> {
  const address = normaliseEmail(email);
  return run(async (db) => {
    const [row] = await db
      .select({ localeCode: partnerMember.localeCode })
      .from(users)
      .innerJoin(partnerMember, eq(partnerMember.userId, users.id))
      .where(eq(users.email, address))
      .orderBy(partnerMember.createdAt)
      .limit(1);
    return floristLanguageOf(row?.localeCode);
  });
}

export const FLORIST_SURFACE: AuthSurfaceConfig = {
  name: "florist",
  basePath: FLORIST_PATHS.authBase,
  cookiePath: FLORIST_PATHS.base,
  cookiePrefix: "__Secure-fo-florist",
  sessionMaxAgeSeconds: FLORIST_SESSION_MAX_AGE_SECONDS,
  rolling: true,
  pages: {
    signIn: FLORIST_PATHS.signIn,
    confirm: FLORIST_PATHS.confirm,
    home: FLORIST_PATHS.base,
  },
  mailTag: "florist_sign_in",
  allow: (email) => isFloristAllowed(email),
};

/** The florist instance, with injectable seams for the integration suite. */
export function createFloristAuth(
  overrides: Partial<Parameters<typeof createAuthSurface>[1]> & {
    allow?: AuthSurfaceConfig["allow"];
    environment?: string;
  } = {},
): AuthSurface {
  const run = overrides.run ?? systemAuthRunner;
  const environment = overrides.environment;
  return createAuthSurface(
    {
      ...FLORIST_SURFACE,
      allow:
        overrides.allow ??
        ((email) =>
          isFloristAllowed(email, {
            run,
            ...(environment === undefined ? {} : { environment }),
          })),
    },
    {
      secret: overrides.secret ?? (() => authSecret(process.env)),
      siteOrigin:
        overrides.siteOrigin ??
        (() => process.env["NEXT_PUBLIC_SITE_URL"] ?? "http://localhost:3000"),
      renderEmail:
        overrides.renderEmail ??
        (async (link, email) =>
          renderFloristSignInEmail(
            link,
            await floristLanguageForEmail(email, run),
          )),
      run,
      ...(overrides.mailer === undefined ? {} : { mailer: overrides.mailer }),
      ...(overrides.now === undefined ? {} : { now: overrides.now }),
      ...(overrides.defer === undefined ? {} : { defer: overrides.defer }),
    },
  );
}

/** The process-wide florist instance. */
export const floristAuth: AuthSurface = createFloristAuth();

export const FloristMembershipSchema = z
  .object({
    partnerId: z.uuid(),
    role: z.enum(partnerMemberRoles),
    partnerStatus: z.enum(FLORIST_PARTNER_STATUSES),
    displayName: z.string().min(1),
  })
  .strict();

export const FloristContextSchema = z
  .object({
    userId: z.uuid(),
    locale: FloristLanguageSchema,
    memberships: z.array(FloristMembershipSchema).min(1),
  })
  .strict();
export type FloristContext = z.infer<typeof FloristContextSchema>;

/**
 * The florist context of a session token, read now: a live florist session, and at least one
 * membership of a partner the policy allows in this environment. Anything else is `null`.
 */
export async function resolveFloristContext(
  sessionToken: string | undefined,
  options: { auth?: AuthSurface; run?: AuthRunner; environment?: string } = {},
): Promise<FloristContext | null> {
  const statuses = allowedStatuses(options.environment ?? currentEnvironment());
  if (statuses === null) return null;
  const auth = options.auth ?? floristAuth;
  const run = options.run ?? systemAuthRunner;
  const userId = await auth.sessionUserId(sessionToken);
  if (userId === null) return null;
  return run(async (db) => {
    const rows = await db
      .select({
        partnerId: partnerMember.partnerId,
        role: partnerMember.role,
        localeCode: partnerMember.localeCode,
        partnerStatus: fulfillmentPartner.status,
        code: fulfillmentPartner.code,
        displayName: partnerTranslation.displayName,
      })
      .from(partnerMember)
      .innerJoin(
        fulfillmentPartner,
        eq(fulfillmentPartner.id, partnerMember.partnerId),
      )
      .leftJoin(
        partnerTranslation,
        and(
          eq(partnerTranslation.partnerId, partnerMember.partnerId),
          eq(partnerTranslation.localeCode, partnerMember.localeCode),
        ),
      )
      .where(
        and(
          eq(partnerMember.userId, userId),
          inArray(fulfillmentPartner.status, statuses),
        ),
      )
      .orderBy(partnerMember.createdAt);
    const [first] = rows;
    if (first === undefined) return null;
    const parsed = FloristContextSchema.safeParse({
      userId,
      locale: floristLanguageOf(first.localeCode),
      memberships: rows.map((row) => ({
        partnerId: row.partnerId,
        role: row.role,
        partnerStatus: row.partnerStatus,
        displayName: row.displayName ?? row.code,
      })),
    });
    return parsed.success ? parsed.data : null;
  });
}

/** The session cookie's value in a `Cookie` header. */
export function floristSessionToken(
  cookieHeader: string | null,
): string | undefined {
  return readCookie(cookieHeader, floristAuth.cookies.sessionToken);
}

/** The florist context of the current request, or `null` (server components, route handlers). */
export async function getFloristContext(): Promise<FloristContext | null> {
  const { headers } = await import("next/headers");
  return resolveFloristContext(
    floristSessionToken((await headers()).get("cookie")),
  );
}

/** The florist context of the current request; no context redirects to sign-in (AC-20). */
export async function requireFloristContext(): Promise<FloristContext> {
  const context = await getFloristContext();
  if (context === null) redirect(FLORIST_PATHS.signIn);
  return context;
}

/** The `partner` database context of a florist (TASK-023's row-level security scopes it). */
export function toDbContext(
  context: FloristContext,
  requestId: string,
): DbContext {
  return {
    role: "partner",
    userId: context.userId,
    partnerIds: context.memberships.map((membership) => membership.partnerId),
    requestId,
  };
}

/** Whether a member of a `demo` partner is signed in (the demo notice, spec 011 §2). */
export function isDemoMember(context: FloristContext): boolean {
  return context.memberships.some(
    (membership) => membership.partnerStatus === "demo",
  );
}

/**
 * The florist sign-in form (spec 011 §5.2 `SignInRequestSchema`): the address and the page's
 * language. The core validates the address; `hl` only chooses the language of the next page.
 */
export const FloristSignInFormSchema = z
  .object({
    email: z.string().max(320),
    hl: FloristLanguageSchema.default("en"),
  })
  .strict();

/** The confirm form: the core's one parameter, plus the page's language. */
export const FloristConfirmFormSchema = z
  .object({
    t: z.string().max(256),
    hl: FloristLanguageSchema.default("en"),
  })
  .strict();

/** `location` with `?hl=` added when the language is not the default (no address, ever). */
export function withLanguage(
  location: string,
  language: FloristLanguage,
): string {
  if (language === "en") return location;
  const [path = "", search = ""] = location.split("?", 2);
  const query = new URLSearchParams(search);
  query.set("hl", language);
  return `${path}?${query.toString()}`;
}

/** A copy of `request` whose urlencoded body is `fields` and nothing else. */
function withBody(request: Request, fields: Record<string, string>): Request {
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/x-www-form-urlencoded");
  return new Request(request.url, {
    method: "POST",
    headers,
    body: new URLSearchParams(fields).toString(),
  });
}

/** The request's urlencoded form, parsed by `schema` (a body that is no form fails the parse). */
async function readForm<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.ZodSafeParseResult<z.output<T>>> {
  try {
    return schema.safeParse(Object.fromEntries(await request.formData()));
  } catch {
    return schema.safeParse(null);
  }
}

function relocated(response: Response, location: string): Response {
  const headers = new Headers(response.headers);
  headers.set("location", location);
  return new Response(null, { status: response.status, headers });
}

/**
 * `POST {base}/api/auth/request`: the core's identical answer for every address (AC-18), with the
 * page's language carried to the next page. Only the address reaches the core.
 */
export async function requestFloristSignIn(
  request: Request,
  auth: AuthSurface = floristAuth,
): Promise<Response> {
  const parsed = await readForm(request, FloristSignInFormSchema);
  const language = parsed.success ? parsed.data.hl : "en";
  const response = await auth.requestSignIn(
    withBody(request, { email: parsed.success ? parsed.data.email : "" }),
  );
  const location = response.headers.get("location") ?? auth.signInLocation();
  return relocated(response, withLanguage(location, language));
}

/**
 * `POST {base}/api/auth/confirm`: the core consumes the token (AC-19); a failure lands on the
 * expired page in the language the confirm page was shown in.
 */
export async function confirmFloristSignIn(
  request: Request,
  auth: AuthSurface = floristAuth,
): Promise<Response> {
  const parsed = await readForm(request, FloristConfirmFormSchema);
  const language = parsed.success ? parsed.data.hl : "en";
  const response = await auth.confirm(
    withBody(request, { t: parsed.success ? parsed.data.t : "" }),
  );
  const location =
    response.headers.get("location") ?? auth.signInLocation("expired");
  if (location === auth.config.pages.home) return response;
  return relocated(response, withLanguage(location, language));
}

/** The language form (AC-32): one of the three, and the florist page to return to. */
export const FloristLanguageFormSchema = z
  .object({
    locale: FloristLanguageSchema,
    back: z.string().max(512).default(FLORIST_PATHS.base),
  })
  .strict();

/** `back` when it is a florist path with no query, host or `//`; else the inbox. */
export function safeFloristBack(back: string): string {
  const shaped = /^\/[A-Za-z0-9/_-]*$/u.test(back) && !back.includes("//");
  return shaped &&
    (back === FLORIST_PATHS.base || back.startsWith(`${FLORIST_PATHS.base}/`))
    ? back
    : FLORIST_PATHS.base;
}

function seeOther(location: string): Response {
  return new Response(null, {
    status: 303,
    headers: { ...AUTH_RESPONSE_HEADERS, location },
  });
}

/**
 * `POST {base}/api/language`: stores the member's language on every membership of theirs, and
 * returns to the page they were on, which then renders in it (AC-32). No session: sign-in.
 */
export async function setFloristLanguage(
  request: Request,
  options: { auth?: AuthSurface; run?: AuthRunner; environment?: string } = {},
): Promise<Response> {
  if (!sameOrigin(request)) return seeOther(FLORIST_PATHS.base);
  const context = await resolveFloristContext(
    floristSessionToken(request.headers.get("cookie")),
    options,
  );
  if (context === null) return seeOther(FLORIST_PATHS.signIn);
  const parsed = await readForm(request, FloristLanguageFormSchema);
  if (!parsed.success) return seeOther(FLORIST_PATHS.base);
  const run = options.run ?? systemAuthRunner;
  await run((db) =>
    db
      .update(partnerMember)
      .set({ localeCode: parsed.data.locale })
      .where(eq(partnerMember.userId, context.userId)),
  );
  return seeOther(safeFloristBack(parsed.data.back));
}
