/**
 * The admin guard (spec 012 §2.2, AC-1, AC-4; TASK-217).
 *
 *  - `requirePermission(permission)` — **the first statement of every admin server action and
 *    route handler** (T-02 scans for it). No session: Next's `unauthorized()` (401). A session
 *    without the permission: `forbidden()` (403). Both render admin's own `unauthorized.tsx` /
 *    `forbidden.tsx` with no data, and nothing after the call runs, so nothing is written.
 *  - `requireAdminPage(permission?)` — the same for a page, except that no session is a
 *    `redirect()` to `/admin/sign-in`: decided by session state, never by location (ADR-0006 is
 *    about geography; `src/proxy.ts` stays redirect-free).
 *
 * `next.config.ts` sets `experimental.authInterrupts` so that `unauthorized()` and `forbidden()`
 * exist.
 */
import { forbidden, redirect, unauthorized } from "next/navigation";

import {
  ADMIN_PATHS,
  type AdminSession,
  getAdminSession,
} from "@/lib/auth/admin";

import { type AdminPermission, can } from "./permissions";

/** How the guard reads the session; tests replace it. */
export interface GuardDeps {
  readonly session: () => Promise<AdminSession | null>;
}

const defaults: GuardDeps = { session: getAdminSession };

export async function requirePermission(
  permission: AdminPermission,
  deps: GuardDeps = defaults,
): Promise<AdminSession> {
  const session = await deps.session();
  if (session === null) unauthorized();
  if (!can(session.roles, permission)) forbidden();
  return session;
}

export async function requireAdminPage(
  permission?: AdminPermission,
  deps: GuardDeps = defaults,
): Promise<AdminSession> {
  const session = await deps.session();
  if (session === null) redirect(ADMIN_PATHS.signIn);
  if (permission !== undefined && !can(session.roles, permission)) forbidden();
  return session;
}
