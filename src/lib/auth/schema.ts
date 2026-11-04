/**
 * The sign-in core's boundary schemas (spec 012 §2.2, §5.2; spec 011 §5.2; ruling R2; TASK-217).
 *
 * `AuthSurfaceSchema` is what a surface (admin here, the florist inbox in TASK-212, the buyer
 * account of spec 018 §14 C.3 with TASK-351's additive fields) hands the factory;
 * `SignInRequestSchema` is the email form; `ConfirmSignInSchema` is the emailed link's one
 * parameter, verbatim from spec 012 §5.2.
 */
import { z } from "zod";

import { mailTags } from "@/modules/notifications/mailer";

/** A path under the site: leading slash, no trailing slash, no query, nothing but path characters. */
const PathSchema = z
  .string()
  .regex(
    /^\/[a-z0-9/_-]*[a-z0-9_-]$/u,
    "a path with a leading slash and no trailing slash",
  );

/**
 * The path a surface's cookies are scoped to: a site path as above, or `/` (spec 018 §14 C.3: the
 * buyer's account lives under four locale prefixes and checkout reads its session).
 */
const CookiePathSchema = z.union([z.literal("/"), PathSchema]);

/** The three pages of a surface. */
export const SurfacePagesSchema = z
  .object({
    /** The sign-in page; its `?state=` names `sent`, `expired`, `signed-out`. */
    signIn: PathSchema,
    /** The confirm page the emailed link opens (`GET` renders "Continue"). */
    confirm: PathSchema,
    /** Where a confirmed sign-in lands. */
    home: PathSchema,
  })
  .strict();
export type SurfacePages = z.infer<typeof SurfacePagesSchema>;

/**
 * A request locale the core accepts for `pagesFor` and `renderEmail` (spec 018 §14 C.3): a
 * lower-case language tag such as `en`, `en-gb`, `de`, `pl`. Anything else uses `pages`.
 */
export const SurfaceLocaleSchema = z
  .string()
  .regex(/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/u);

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
    /** The surface's name, used in log events and the mail tag (`admin`, `florist`, `buyer`). */
    name: z.enum(["admin", "florist", "buyer"]),
    /** Where the Auth.js handlers answer, e.g. `/admin/api/auth`. */
    basePath: PathSchema,
    /** The path every cookie of the surface is scoped to, e.g. `/admin`; `/` covers every path. */
    cookiePath: CookiePathSchema,
    cookiePrefix: CookiePrefixSchema,
    /** Session length in seconds. */
    sessionMaxAgeSeconds: z.number().int().positive(),
    rolling: z.boolean(),
    /** The pages; for a surface with `pagesFor`, those of a request without a usable locale. */
    pages: SurfacePagesSchema,
    /**
     * The pages of one request locale (spec 018 §14 C.3: `/{locale}/account` and its confirm
     * page), used instead of `pages` when present. Its answer is parsed by the core; one that is
     * not a set of site paths under the cookie path falls back to `pages`.
     */
    pagesFor: z
      .custom<(locale: string) => SurfacePages>(
        (value) => typeof value === "function",
      )
      .optional(),
    /** The mail tag of the surface's sign-in email. */
    mailTag: z.enum(mailTags),
    /** May this normalised address receive a link? */
    allow: z.custom<(email: string) => Promise<boolean>>(
      (value) => typeof value === "function",
    ),
    /**
     * The pages a link minted by `createSignInLink` may land on (spec 016 §5.2; TASK-331): the
     * florist surface admits one order of its inbox. Absent: no callback is accepted, and every
     * sign-in lands on `pages.home`.
     */
    callbackAllowed: z
      .custom<(path: string) => boolean>((value) => typeof value === "function")
      .optional(),
    /**
     * The return paths a sign-in may land on (spec 018 §14 C.4). Present: `requestSignIn` stores
     * an admitted path in the surface's `callback-url` cookie (and clears it otherwise), and
     * `confirm` lands there when the path passes `isSafeReturnPath` and this predicate again.
     * Absent: no cookie is written and every sign-in lands on home.
     */
    returnTo: z
      .custom<(path: string) => boolean>((value) => typeof value === "function")
      .optional(),
    /**
     * Called once per successful `confirm` with the user and the normalised address (spec 018
     * §14 C.4, the first sign-in's customer). When it throws, the confirm commits nothing.
     */
    afterSignIn: z
      .custom<(userId: string, email: string) => Promise<void>>(
        (value) => typeof value === "function",
      )
      .optional(),
  })
  .strict()
  .refine(
    (surface) =>
      surface.cookiePath === "/" ||
      (surface.basePath.startsWith(`${surface.cookiePath}/`) &&
        surface.pages.signIn.startsWith(surface.cookiePath) &&
        surface.pages.confirm.startsWith(surface.cookiePath) &&
        surface.pages.home.startsWith(surface.cookiePath)),
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
