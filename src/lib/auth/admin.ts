/**
 * The admin instance of the sign-in core (spec 012 §2.2, §5.2, AC-2, AC-3, AC-9; TASK-217).
 *
 *  - `basePath` `/admin/api/auth`; cookies `__Secure-fo-admin.session-token`, `.csrf-token`,
 *    `.callback-url`, each `Path=/admin`, `Secure`, `HttpOnly`, `SameSite=Lax`; 12-hour sessions,
 *    never extended (§13 Q6).
 *  - The allowlist: an address whose `users` row has an `admin_profile` with no `deactivated_at`
 *    **and** at least one `user_role`. Anyone else gets the identical page and no email.
 *  - `getAdminSession()` → `AdminSessionSchema` (`userId`, `displayName`, `roles[]`, `timeZone`),
 *    or `null`. Read on every request from the database, so revoking the last role or
 *    deactivating a person makes their next request unauthenticated even before their session
 *    rows are deleted (they are, in the same transaction, by `src/modules/admin/users.ts`).
 */
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { adminProfile } from "../../../db/schema/admin";
import { userRole, users } from "../../../db/schema/auth";
import { authSecret } from "../env.schema";
import { renderAdminSignInEmail } from "../../../emails/admin-sign-in";

import { type AuthRunner, systemAuthRunner } from "./adapter";
import type { AuthSurfaceConfig } from "./schema";
import { type AuthSurface, createAuthSurface, readCookie } from "./surface";
import { normaliseEmail } from "./tokens";

/** 12 hours (spec 012 §13 Q6). */
export const ADMIN_SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

export const ADMIN_PATHS = Object.freeze({
  root: "/admin",
  basePath: "/admin/api/auth",
  signIn: "/admin/sign-in",
  confirm: "/admin/sign-in/confirm",
});

/** Whether `email` may receive an admin sign-in link. */
export async function isAdminAllowed(
  email: string,
  run: AuthRunner = systemAuthRunner,
): Promise<boolean> {
  const address = normaliseEmail(email);
  return run(async (db) => {
    const rows = await db
      .select({ role: userRole.role })
      .from(users)
      .innerJoin(adminProfile, eq(adminProfile.userId, users.id))
      .innerJoin(userRole, eq(userRole.userId, users.id))
      .where(and(eq(users.email, address), isNull(adminProfile.deactivatedAt)))
      .limit(1);
    return rows.length > 0;
  });
}

export const ADMIN_SURFACE: AuthSurfaceConfig = {
  name: "admin",
  basePath: ADMIN_PATHS.basePath,
  cookiePath: ADMIN_PATHS.root,
  cookiePrefix: "__Secure-fo-admin",
  sessionMaxAgeSeconds: ADMIN_SESSION_MAX_AGE_SECONDS,
  rolling: false,
  pages: {
    signIn: ADMIN_PATHS.signIn,
    confirm: ADMIN_PATHS.confirm,
    home: ADMIN_PATHS.root,
  },
  mailTag: "admin_sign_in",
  allow: (email) => isAdminAllowed(email),
};

/** The admin instance, with injectable seams for the integration suite. */
export function createAdminAuth(
  overrides: Partial<Parameters<typeof createAuthSurface>[1]> & {
    allow?: AuthSurfaceConfig["allow"];
  } = {},
): AuthSurface {
  const run = overrides.run ?? systemAuthRunner;
  return createAuthSurface(
    {
      ...ADMIN_SURFACE,
      allow: overrides.allow ?? ((email) => isAdminAllowed(email, run)),
    },
    {
      secret: overrides.secret ?? (() => authSecret(process.env)),
      siteOrigin:
        overrides.siteOrigin ??
        (() => process.env["NEXT_PUBLIC_SITE_URL"] ?? "http://localhost:3000"),
      renderEmail: overrides.renderEmail ?? renderAdminSignInEmail,
      run,
      ...(overrides.mailer === undefined ? {} : { mailer: overrides.mailer }),
      ...(overrides.now === undefined ? {} : { now: overrides.now }),
    },
  );
}

/** The process-wide admin instance. */
export const adminAuth: AuthSurface = createAdminAuth();

export const AdminSessionSchema = z
  .object({
    userId: z.uuid(),
    displayName: z.string().min(2).max(80),
    roles: z.array(z.enum(["admin", "ops", "finance", "content"])).min(1),
    timeZone: z.string().min(1),
  })
  .strict();
export type AdminSession = z.infer<typeof AdminSessionSchema>;

/**
 * The admin session of a session token: the token must be live, and its user allowlisted now
 * (an active profile and at least one role). Anything else is `null`.
 */
export async function resolveAdminSession(
  sessionToken: string | undefined,
  options: { auth?: AuthSurface; run?: AuthRunner } = {},
): Promise<AdminSession | null> {
  const auth = options.auth ?? adminAuth;
  const run = options.run ?? systemAuthRunner;
  const userId = await auth.sessionUserId(sessionToken);
  if (userId === null) return null;
  return run(async (db) => {
    const rows = await db
      .select({
        displayName: adminProfile.displayName,
        timeZone: adminProfile.timeZone,
        role: userRole.role,
      })
      .from(adminProfile)
      .innerJoin(userRole, eq(userRole.userId, adminProfile.userId))
      .where(
        and(
          eq(adminProfile.userId, userId),
          isNull(adminProfile.deactivatedAt),
        ),
      );
    const [first] = rows;
    if (first === undefined) return null;
    const parsed = AdminSessionSchema.safeParse({
      userId,
      displayName: first.displayName,
      timeZone: first.timeZone,
      roles: [...new Set(rows.map((row) => row.role))].sort(),
    });
    return parsed.success ? parsed.data : null;
  });
}

/** The admin session of the current request (server components, actions, route handlers). */
export async function getAdminSession(): Promise<AdminSession | null> {
  const { headers } = await import("next/headers");
  const cookie = (await headers()).get("cookie");
  return resolveAdminSession(
    readCookie(cookie, adminAuth.cookies.sessionToken),
  );
}
