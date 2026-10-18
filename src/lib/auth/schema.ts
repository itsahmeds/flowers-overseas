/**
 * The sign-in core's boundary schemas (spec 012 §2.2, §5.2; spec 011 §5.2; ruling R2; TASK-217).
 *
 * `AuthSurfaceSchema` is what a surface (admin here, the florist inbox in TASK-212) hands the
 * factory; `SignInRequestSchema` is the email form; `ConfirmSignInSchema` is the emailed link's
 * one parameter, verbatim from spec 012 §5.2.
 */
import { z } from "zod";

/** A path under the site: leading slash, no trailing slash, no query, nothing but path characters. */
const PathSchema = z
  .string()
  .regex(
    /^\/[a-z0-9/_-]*[a-z0-9_-]$/u,
    "a path with a leading slash and no trailing slash",
  );

/** A cookie-name prefix: `__Secure-fo-admin` gives `__Secure-fo-admin.session-token`. */
const CookiePrefixSchema = z
  .string()
  .regex(
    /^__Secure-fo-[a-z]+$/u,
    "a `__Secure-fo-<surface>` prefix; never `__Host-`",
  );

/**
 * One surface of the core. `allow` is the surface's predicate: who may receive a link (spec 012
 * §2.2's table). `rolling` decides whether a session is extended while used.
 */
export const AuthSurfaceSchema = z
  .object({
    /** The surface's name, used in log events and the mail tag (`admin`, `florist`). */
    name: z.enum(["admin", "florist"]),
    /** Where the Auth.js handlers answer, e.g. `/admin/api/auth`. */
    basePath: PathSchema,
    /** The path every cookie of the surface is scoped to, e.g. `/admin`. */
    cookiePath: PathSchema,
    cookiePrefix: CookiePrefixSchema,
    /** Session length in seconds. */
    sessionMaxAgeSeconds: z.number().int().positive(),
    rolling: z.boolean(),
    pages: z
      .object({
        /** The sign-in page; its `?state=` names `sent`, `expired`, `signed-out`. */
        signIn: PathSchema,
        /** The confirm page the emailed link opens (`GET` renders "Continue"). */
        confirm: PathSchema,
        /** Where a confirmed sign-in lands. */
        home: PathSchema,
      })
      .strict(),
    /** The mail tag of the surface's sign-in email. */
    mailTag: z.string().regex(/^[a-z]+(?:_[a-z]+)*$/u),
    /** May this normalised address receive a link? */
    allow: z.custom<(email: string) => Promise<boolean>>(
      (value) => typeof value === "function",
    ),
  })
  .strict()
  .refine(
    (surface) =>
      surface.basePath.startsWith(`${surface.cookiePath}/`) &&
      surface.pages.signIn.startsWith(surface.cookiePath) &&
      surface.pages.confirm.startsWith(surface.cookiePath) &&
      surface.pages.home.startsWith(surface.cookiePath),
    { message: "every path of a surface lies under its cookie path" },
  );
export type AuthSurfaceConfig = z.infer<typeof AuthSurfaceSchema>;

/** The email form. The address is normalised (trimmed, lower-cased) by the schema itself. */
export const SignInRequestSchema = z
  .object({ email: z.string().trim().toLowerCase().pipe(z.email().max(254)) })
  .strict();
export type SignInRequest = z.infer<typeof SignInRequestSchema>;

/** The emailed link's one parameter (spec 012 §5.2, verbatim). */
export const ConfirmSignInSchema = z
  .object({ t: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/) })
  .strict();
export type ConfirmSignIn = z.infer<typeof ConfirmSignInSchema>;

/** The states the sign-in page renders from `?state=` (spec 012 §5.3). */
export const signInStates = ["sent", "expired", "signed-out"] as const;
export type SignInState = (typeof signInStates)[number];
