/**
 * The florist surface's configuration (spec 011 §5.2 "`src/config/florists.ts`", §2 "One mount
 * point", §13 Q4; TASK-212). No database (`check:no-db`).
 *
 *  - `basePath` — the one mount point every florist route derives from, `FLORIST_BASE_PATH`:
 *    `/demo/vendor-inbox` in Phase 0; spec 026 moves it to `/vendor`. Pages, the Auth.js base
 *    path, the cookie path and the response-header rules are all built from it
 *    (`floristPaths()`), and `tests/unit/florist-routes.test.ts` holds the route tree under
 *    `src/app` equal to it.
 *  - `signInPolicy(environment)` — which partner statuses' members may receive a sign-in link: a
 *    total function of the deployment environment. Phase 0 is `demo` partners everywhere but
 *    `production`, and nobody in `production` (§13 Q4), which is also what turns every florist
 *    route into a 404 there (`floristSurfaceOpen()`). Spec 026 widens production to `active`.
 *  - `languages` — the three languages the florist surface speaks (`partner_member.locale_code`,
 *    `0020_florists_v0`), with `en` the default before sign-in (§7: never `Accept-Language`,
 *    never an IP).
 *  - `inboxRefresh` — the list's refresh island: every 5 s while visible, stopping after 10
 *    minutes without interaction (§2, AC-26; TASK-214 reads it).
 *  - `applicationForm` — the apply page's switch (§2 "The form switch"); `off` until the
 *    production database has `0020` and TASK-213 turns it on.
 *
 * The payout example and the photo limits of §5.2 join this file with the tasks that use them
 * (TASK-210, TASK-215).
 */
import { z } from "zod";

/** `fulfillment_partner.status`, mirrored here because `src/config` reads no schema module. */
export const FLORIST_PARTNER_STATUSES = [
  "demo",
  "onboarding",
  "active",
  "paused",
  "offboarded",
] as const;
export type FloristPartnerStatus = (typeof FLORIST_PARTNER_STATUSES)[number];

/** The deployment environments, as `src/lib/env.schema.ts` names them. */
export const FLORIST_ENVIRONMENTS = [
  "development",
  "test",
  "preview",
  "staging",
  "production",
] as const;
export type FloristEnvironment = (typeof FLORIST_ENVIRONMENTS)[number];

/** The florist surface's languages (`partner_member.locale_code`). */
export const FLORIST_LANGUAGES = ["en", "pl", "de"] as const;
export type FloristLanguage = (typeof FLORIST_LANGUAGES)[number];
export const FloristLanguageSchema = z.enum(FLORIST_LANGUAGES);

/**
 * The florist pages' query before sign-in: `?hl=` among the three, anything else dropped (§7).
 * Other keys (`state`, `t`) are the sign-in core's and are read by the pages themselves.
 */
export const FloristQuerySchema = z.object({
  hl: FloristLanguageSchema.optional().catch(undefined),
});

/** Before sign-in, `?hl=` among the three, else this (§7). */
export const DEFAULT_FLORIST_LANGUAGE: FloristLanguage = "en";

const PathSchema = z
  .string()
  .regex(/^\/[a-z0-9/_-]*[a-z0-9_-]$/u, "a path, no trailing slash");

export const FloristsConfigSchema = z
  .object({
    basePath: PathSchema,
    applicationForm: z.enum(["off", "on"]),
    inboxRefresh: z
      .object({
        intervalMs: z.number().int().positive(),
        idleStopMs: z.number().int().positive(),
      })
      .strict(),
    /** Statuses whose members may sign in, per environment. */
    signIn: z.record(
      z.enum(FLORIST_ENVIRONMENTS),
      z.array(z.enum(FLORIST_PARTNER_STATUSES)),
    ),
  })
  .strict();

export const floristsConfig = FloristsConfigSchema.parse({
  basePath: "/demo/vendor-inbox",
  applicationForm: "off",
  inboxRefresh: { intervalMs: 5_000, idleStopMs: 600_000 },
  signIn: {
    development: ["demo"],
    test: ["demo"],
    preview: ["demo"],
    staging: ["demo"],
    // §13 Q4: nobody until spec 026 opens production to `active` partners.
    production: [],
  },
});

/** `FLORIST_BASE_PATH`: every florist route starts with it. */
export const FLORIST_BASE_PATH = floristsConfig.basePath;

/**
 * The partner statuses whose members may receive a link in `environment` (§2 "Who may sign in").
 * A total function: an environment outside the five is treated as `production` (fail closed).
 */
export function signInPolicy(
  environment: string,
): readonly FloristPartnerStatus[] {
  const parsed = z.enum(FLORIST_ENVIRONMENTS).safeParse(environment);
  return floristsConfig.signIn[parsed.success ? parsed.data : "production"];
}

/** Whether the florist surface answers at all in `environment` (§13 Q4: 404 while empty). */
export function floristSurfaceOpen(environment: string): boolean {
  return signInPolicy(environment).length > 0;
}

/** Every florist path, built from `FLORIST_BASE_PATH` and nothing else (AC-22). */
export function floristPaths(base: string = FLORIST_BASE_PATH) {
  return Object.freeze({
    base,
    authBase: `${base}/api/auth`,
    request: `${base}/api/auth/request`,
    confirmPost: `${base}/api/auth/confirm`,
    signOut: `${base}/api/auth/sign-out`,
    language: `${base}/api/language`,
    signIn: `${base}/sign-in`,
    confirm: `${base}/sign-in/confirm`,
    order: (assignmentId: string) => `${base}/orders/${assignmentId}`,
  });
}

export const FLORIST_PATHS = floristPaths();

/** True when `pathname` is the florist base or under it. */
export function isFloristPath(pathname: string): boolean {
  return (
    pathname === FLORIST_BASE_PATH ||
    pathname.startsWith(`${FLORIST_BASE_PATH}/`)
  );
}
