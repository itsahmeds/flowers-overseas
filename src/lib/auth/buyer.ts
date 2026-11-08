/**
 * The buyer instance of the sign-in core (spec 018 §14 A-founder-2026-10-22 C.3, C.4, C.5, C.10;
 * AC-24 as amended, AC-25 as amended, AC-47 surface half, AC-48, AC-49, AC-50; TASK-344).
 *
 *  - Built by the core's factory (`createAuthSurface`) with TASK-351's additive fields; no second
 *    Auth.js configuration, adapter or mailer (AC-47's scan). `basePath` `/api/auth/buyer`; cookies
 *    `__Secure-fo-buyer.session-token`, `.csrf-token`, `.callback-url`, each `Path=/`, `Secure`,
 *    `HttpOnly`, `SameSite=Lax`, no `Domain`; database sessions of 30 days, rolling; tokens bound
 *    to the surface (`buyer.…`), so admin and florist sessions authenticate nothing here and the
 *    reverse.
 *  - Pages per request locale (`pagesFor`): the sign-in page and home are both `/{locale}/account`
 *    (C.5: one page that is the sign-in and the account), the confirm page
 *    `/{locale}/account/sign-in/confirm`.
 *  - **Open sign-up** (C.4, §13 Q20): any well-formed address may receive T14 except one under the
 *    `invalid` top-level domain (erased customers carry `redacted+{id}@invalid`). The core's 5 links
 *    per address per hour apply, and a global ceiling (`BUYER_LINK_HOURLY_CAP`): over it, the
 *    request goes on with an address the predicate refuses, so the answer is byte for byte the same
 *    `sent` page and nothing is mailed (AC-48).
 *  - **Address shapes** (TASK-351's carry-forward): the page refuses only an entry with no `@`
 *    shape at all (`?state=invalid`, the field error). An entry with the shape that spec 012's
 *    stricter form schema refuses (a single-label domain such as `redacted+x@invalid`, a unicode
 *    local part) answers the same `sent` page as every other address and receives nothing.
 *  - **First sign-in** (`afterSignIn`, one transaction, C.4, AC-49): the non-redacted `customer`
 *    with the normalised address gets `user_id`, or one is created holding only the address; each
 *    confirm sets `last_signed_in_at`. A redacted customer is never linked (the partial unique
 *    index admits a new row beside it).
 *  - **Return path** (C.4, AC-50): `/{locale}/account` and below, or `/{locale}/checkout`, stored by
 *    the core in the `callback-url` cookie and checked again at confirm.
 *  - `getBuyerContext()` / `requireBuyerContext()`: `{ userId, customerId }` read from the database
 *    on every request; `toDbContext()` gives the `customer` database context, so row-level security
 *    scopes every read of the account (AC-25).
 *
 * Logs carry no address, token or return path (C.10, AC-62): `auth.buyer.link_requested`,
 * `auth.buyer.signed_in {first}`, and the core's own events.
 */
import { and, count, eq, gt, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";

import { authEmailSend } from "../../../db/schema/admin";
import { customer } from "../../../db/schema/customers";
import {
  BUYER_LINK_ALERT_AT,
  BUYER_LINK_HOURLY_CAP,
  BUYER_SESSION_DAYS,
} from "@/config/auth";
import { isLocaleCode, type LocaleCode } from "@/config/locales";
import { renderAccountSignInEmail } from "@/modules/notifications/emails/account-sign-in";

import type { DbContext } from "../db";
import { authSecret } from "../env.auth";
import { logger } from "../logger";
import { captureAlert } from "../sentry";

import { type AuthRunner, systemAuthRunner } from "./adapter";
import {
  type AuthSurfaceConfig,
  SignInRequestSchema,
  type SurfacePages,
} from "./schema";
import { SEND_WINDOW_MS } from "./send-limit";
import {
  type AuthSurface,
  createAuthSurface,
  readCookie,
  isSafeReturnPath,
} from "./surface";
import { normaliseEmail } from "./tokens";

/** 30 days, rolling (C.3). */
export const BUYER_SESSION_MAX_AGE_SECONDS = BUYER_SESSION_DAYS * 24 * 60 * 60;

/** Where the buyer surface's Auth.js handlers answer (C.3). */
export const BUYER_AUTH_BASE = "/api/auth/buyer";

/** The surface's form endpoints (route handlers under `src/app/api/auth/buyer/`). */
export const BUYER_AUTH_PATHS = {
  request: `${BUYER_AUTH_BASE}/request`,
  confirm: `${BUYER_AUTH_BASE}/confirm`,
  signOut: `${BUYER_AUTH_BASE}/sign-out`,
} as const;

/** The locale of a request with none usable (the core's `pages`). */
const DEFAULT_LOCALE = "en";

/** `/{locale}/account`: the sign-in page and the account home at once (C.5). */
export function accountPath(locale: string): string {
  return `/${locale}/account`;
}

/** The pages of one locale (C.3). */
export function buyerPages(locale: string): SurfacePages {
  const home = accountPath(locale);
  return { signIn: home, confirm: `${home}/sign-in/confirm`, home };
}

/**
 * Whether `path` is a return path the buyer surface admits (C.4, AC-50): `/{locale}/account` or a
 * page below it (not the sign-in pages), or `/{locale}/checkout`, for a locale the site has. The
 * core has already refused anything that is not plain path segments (`isSafeReturnPath`): another
 * origin, `//`, a backslash, `%`, a dot segment, a query.
 */
export function isBuyerReturnPath(path: string): boolean {
  if (!isSafeReturnPath(path)) return false;
  const [, locale = "", area = "", ...rest] = path.split("/");
  if (!isLocaleCode(locale)) return false;
  if (area === "checkout") return rest.length === 0;
  if (area !== "account") return false;
  return rest[0] !== "sign-in";
}

/** An address shaped `local@domain`, nothing more (the page's only refusal; the DB's check). */
const ADDRESS_SHAPE = /^[^\s@]+@[^\s@]+$/u;

/** The address the request goes on with when it must not be mailed (the predicate refuses it). */
export const REFUSED_ADDRESS = "nobody@refused.invalid";

/**
 * Whether `email` (normalised) may receive a buyer link (C.4): spec 012's form schema accepts it,
 * and it is not under the `invalid` top-level domain.
 */
export function isBuyerAllowedAddress(email: string): boolean {
  const parsed = SignInRequestSchema.safeParse({ email });
  if (!parsed.success) return false;
  const domain = parsed.data.email.slice(
    parsed.data.email.lastIndexOf("@") + 1,
  );
  return !(domain === "invalid" || domain.endsWith(".invalid"));
}

/** The alert's name: a constant, carried as the `alert` tag (no PII). */
export const BUYER_CAP_ALERT = "auth.buyer.link_cap";

/**
 * Whether the global ceiling is reached (C.4): the core's send log holds `BUYER_LINK_HOURLY_CAP`
 * rows or more in the trailing hour. From `BUYER_LINK_ALERT_AT` rows on, the alert fires.
 */
export async function buyerCapReached(
  options: { run?: AuthRunner; now?: () => Date } = {},
): Promise<boolean> {
  const run = options.run ?? systemAuthRunner;
  const at = (options.now ?? (() => new Date()))();
  const since = new Date(at.getTime() - SEND_WINDOW_MS);
  const sent = await run(async (db) => {
    const [row] = await db
      .select({ sent: count() })
      .from(authEmailSend)
      .where(gt(authEmailSend.sentAt, since));
    return row?.sent ?? 0;
  });
  if (sent >= BUYER_LINK_ALERT_AT) {
    const reached = sent >= BUYER_LINK_HOURLY_CAP;
    logger.warn({ sent, reached }, "auth.buyer.link_cap_alert");
    captureAlert(
      BUYER_CAP_ALERT,
      { sent, reached },
      { fingerprint: [BUYER_CAP_ALERT] },
    );
    return reached;
  }
  return false;
}

/**
 * The first verified sign-in, and every later one (C.4, AC-49), in one transaction: the
 * non-redacted customer with this address is linked to the user, or one is created that holds
 * only the address; `last_signed_in_at` is set either way. Answers whether this was the first.
 */
export async function linkBuyerCustomer(
  userId: string,
  email: string,
  options: { run?: AuthRunner; now?: () => Date } = {},
): Promise<{ customerId: string; first: boolean }> {
  const run = options.run ?? systemAuthRunner;
  const at = (options.now ?? (() => new Date()))();
  const user = z.uuid().parse(userId);
  const address = normaliseEmail(email);
  return run(async (db) => {
    const [existing] = await db
      .select({ id: customer.id, userId: customer.userId })
      .from(customer)
      .where(
        and(
          sql`lower(${customer.emailNormalised}) = ${address}`,
          eq(customer.redacted, false),
        ),
      )
      .for("update");
    if (existing !== undefined) {
      await db
        .update(customer)
        .set({ userId: user, lastSignedInAt: at })
        .where(eq(customer.id, existing.id));
      return { customerId: existing.id, first: existing.userId !== user };
    }
    const [created] = await db
      .insert(customer)
      .values({ emailNormalised: address, userId: user, lastSignedInAt: at })
      .returning({ id: customer.id });
    if (created === undefined) throw new Error("buyer: no customer created");
    return { customerId: created.id, first: true };
  });
}

export const BUYER_SURFACE: AuthSurfaceConfig = {
  name: "buyer",
  basePath: BUYER_AUTH_BASE,
  cookiePath: "/",
  cookiePrefix: "__Secure-fo-buyer",
  sessionMaxAgeSeconds: BUYER_SESSION_MAX_AGE_SECONDS,
  rolling: true,
  pages: buyerPages(DEFAULT_LOCALE),
  pagesFor: (locale) =>
    buyerPages(isLocaleCode(locale) ? locale : DEFAULT_LOCALE),
  mailTag: "buyer_sign_in",
  allow: (email) => Promise.resolve(isBuyerAllowedAddress(email)),
  returnTo: (path) => isBuyerReturnPath(path),
};

/** The buyer instance, with injectable seams for the tests. */
export function createBuyerAuth(
  overrides: Partial<Parameters<typeof createAuthSurface>[1]> & {
    afterSignIn?: AuthSurfaceConfig["afterSignIn"];
  } = {},
): AuthSurface {
  const run = overrides.run ?? systemAuthRunner;
  const now = overrides.now;
  return createAuthSurface(
    {
      ...BUYER_SURFACE,
      afterSignIn:
        overrides.afterSignIn ??
        (async (userId, email) => {
          const { first } = await linkBuyerCustomer(userId, email, {
            run,
            ...(now === undefined ? {} : { now }),
          });
          logger.info({ first }, "auth.buyer.signed_in");
        }),
    },
    {
      secret: overrides.secret ?? (() => authSecret(process.env)),
      siteOrigin:
        overrides.siteOrigin ??
        (() => process.env["NEXT_PUBLIC_SITE_URL"] ?? "http://localhost:3000"),
      renderEmail:
        overrides.renderEmail ??
        ((link, _email, context) =>
          renderAccountSignInEmail({
            link,
            locale: localeOrDefault(context?.locale),
          })),
      run,
      ...(overrides.mailer === undefined ? {} : { mailer: overrides.mailer }),
      ...(now === undefined ? {} : { now }),
      ...(overrides.defer === undefined ? {} : { defer: overrides.defer }),
    },
  );
}

function localeOrDefault(locale: string | undefined): LocaleCode {
  return locale !== undefined && isLocaleCode(locale) ? locale : "en";
}

/** The process-wide buyer instance. */
export const buyerAuth: AuthSurface = createBuyerAuth();

/* -------------------------------------------------------------------------- */
/* The session's customer                                                     */
/* -------------------------------------------------------------------------- */

export const BuyerContextSchema = z
  .object({ userId: z.uuid(), customerId: z.uuid() })
  .strict();
export type BuyerContext = z.infer<typeof BuyerContextSchema>;

/**
 * The buyer context of a session token, read now: a live buyer session and the user's
 * non-redacted customer. Anything else (no session, an admin or florist token, a redacted or
 * missing customer) is `null`.
 */
export async function resolveBuyerContext(
  sessionToken: string | undefined,
  options: { auth?: AuthSurface; run?: AuthRunner } = {},
): Promise<BuyerContext | null> {
  const auth = options.auth ?? buyerAuth;
  const run = options.run ?? systemAuthRunner;
  const userId = await auth.sessionUserId(sessionToken);
  if (userId === null) return null;
  const [row] = await run((db) =>
    db
      .select({ id: customer.id })
      .from(customer)
      .where(and(eq(customer.userId, userId), eq(customer.redacted, false)))
      .limit(1),
  );
  if (row === undefined) return null;
  const parsed = BuyerContextSchema.safeParse({ userId, customerId: row.id });
  return parsed.success ? parsed.data : null;
}

/** The buyer session cookie's value in a `Cookie` header. */
export function buyerSessionToken(
  cookieHeader: string | null,
): string | undefined {
  return readCookie(cookieHeader, buyerAuth.cookies.sessionToken);
}

/** The buyer context of the current request, or `null` (server components, route handlers). */
export async function getBuyerContext(): Promise<BuyerContext | null> {
  const { headers } = await import("next/headers");
  return resolveBuyerContext(
    buyerSessionToken((await headers()).get("cookie")),
  );
}

/**
 * The buyer context of the current request; none answers 303 to `/{locale}/account` (AC-25 as
 * amended), with `returnTo` carried as `?return=` when it is a return path the surface admits.
 */
export async function requireBuyerContext(
  locale: string,
  returnTo?: string,
): Promise<BuyerContext> {
  const context = await getBuyerContext();
  if (context === null) redirect(signInHref(locale, returnTo));
  return context;
}

/** `/{locale}/account`, with `?return=` for an admitted return path (a reference at most). */
export function signInHref(locale: string, returnTo?: string): string {
  const home = accountPath(isLocaleCode(locale) ? locale : DEFAULT_LOCALE);
  if (returnTo === undefined || !isBuyerReturnPath(returnTo)) return home;
  return `${home}?${new URLSearchParams({ return: returnTo }).toString()}`;
}

/** The `customer` database context of a buyer: row-level security scopes it (AC-25). */
export function toDbContext(
  context: BuyerContext,
  requestId: string,
): DbContext {
  return {
    role: "customer",
    userId: context.userId,
    partnerIds: [],
    requestId,
  };
}

/* -------------------------------------------------------------------------- */
/* The route handlers' work                                                   */
/* -------------------------------------------------------------------------- */

const LocaleFieldSchema = z
  .string()
  .max(16)
  .refine((value) => isLocaleCode(value))
  .catch(DEFAULT_LOCALE);

/** The sign-in form (`/{locale}/account`): the address, the page's locale, a return path. */
export const BuyerSignInFormSchema = z
  .object({
    email: z.string().max(320).default(""),
    locale: LocaleFieldSchema.default(DEFAULT_LOCALE),
    return: z.string().max(512).optional(),
  })
  .strict();

/** The confirm form: the core's one parameter, plus the page's locale. */
export const BuyerConfirmFormSchema = z
  .object({
    t: z.string().max(256).default(""),
    locale: LocaleFieldSchema.default(DEFAULT_LOCALE),
  })
  .strict();

/** The sign-out form: the page's locale. */
export const BuyerSignOutFormSchema = z
  .object({ locale: LocaleFieldSchema.default(DEFAULT_LOCALE) })
  .strict();

/** The page state of an entry with no address shape (the field error); not a core state. */
export const BUYER_INVALID_STATE = "invalid";

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

/** The core's answer, sent to `location` instead. */
function relocated(response: Response, location: string): Response {
  const headers = new Headers(response.headers);
  headers.set("location", location);
  return new Response(null, { status: response.status, headers });
}

/**
 * The address the core is handed (AC-48): the normalised entry when spec 012's form schema takes
 * it; `REFUSED_ADDRESS` when it has the `local@domain` shape but that schema refuses it, or when
 * the global cap is reached, so the answer is the same `sent` page and nothing is mailed; `null`
 * when it has no address shape at all (the page's field error).
 */
export async function addressForCore(
  entry: string,
  capReached: () => Promise<boolean>,
): Promise<string | null> {
  const trimmed = entry.trim().toLowerCase();
  if (!ADDRESS_SHAPE.test(trimmed)) return null;
  if (!SignInRequestSchema.safeParse({ email: trimmed }).success) {
    return REFUSED_ADDRESS;
  }
  return (await capReached()) ? REFUSED_ADDRESS : trimmed;
}

/**
 * `POST /api/auth/buyer/request`: the core's identical `303` to `/{locale}/account?state=sent` for
 * every address (AC-48), written before anything address-dependent runs, with the return path
 * stored when the surface admits it (AC-50).
 */
export async function requestBuyerSignIn(
  request: Request,
  options: { auth?: AuthSurface; capReached?: () => Promise<boolean> } = {},
): Promise<Response> {
  const auth = options.auth ?? buyerAuth;
  const parsed = await readForm(request, BuyerSignInFormSchema);
  const locale = parsed.success ? parsed.data.locale : DEFAULT_LOCALE;
  const address = parsed.success
    ? await addressForCore(
        parsed.data.email,
        options.capReached ?? (() => buyerCapReached()),
      )
    : null;
  if (address === null) {
    const response = await auth.requestSignIn(
      withBody(request, { email: "" }),
      {
        locale,
      },
    );
    return relocated(
      response,
      `${auth.signInLocation(undefined, locale)}?state=${BUYER_INVALID_STATE}`,
    );
  }
  logger.info({ outcome: "queued" }, "auth.buyer.link_requested");
  const returnTo = parsed.success ? parsed.data.return : undefined;
  return auth.requestSignIn(withBody(request, { email: address }), {
    locale,
    ...(returnTo === undefined ? {} : { returnTo }),
  });
}

/** `POST /api/auth/buyer/confirm`: the core spends the token and lands where C.4 says. */
export async function confirmBuyerSignIn(
  request: Request,
  auth: AuthSurface = buyerAuth,
): Promise<Response> {
  const parsed = await readForm(request, BuyerConfirmFormSchema);
  const locale = parsed.success ? parsed.data.locale : DEFAULT_LOCALE;
  return auth.confirm(
    withBody(request, { t: parsed.success ? parsed.data.t : "" }),
    {
      locale,
    },
  );
}

/** `POST /api/auth/buyer/sign-out`: the session row goes, so a replayed cookie is nothing. */
export async function signOutBuyer(
  request: Request,
  auth: AuthSurface = buyerAuth,
): Promise<Response> {
  const parsed = await readForm(request.clone(), BuyerSignOutFormSchema);
  const locale = parsed.success ? parsed.data.locale : DEFAULT_LOCALE;
  return auth.signOut(request, { locale });
}
