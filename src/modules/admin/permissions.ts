/**
 * The admin permission matrix, `ADMIN_PERMISSIONS` (spec 012 §2.2, §5.2, AC-4; TASK-217).
 *
 * One constant, read by the guard (`requirePermission`), the navigation and the tests. v0's rows
 * only: spec 012b adds its rows (§15.8), and spec 020a's four order actions (§2.1, §13 Q2, AC-1)
 * replace the single `orders.transition` spec 012 §5.2 anticipated: money moves (cancel, refund)
 * are admin only; reroute and resend also `ops`, so a helper can save an order without refunding
 * it. A cell is allowed only where the spec marks it; there is no implicit "admin can do
 * everything".
 */
import type { adminRoles } from "../../../db/schema/auth";

export type AdminRole = (typeof adminRoles)[number];

export const adminPermissions = [
  "users.manage",
  "audit.read",
  "flags.toggle",
  "partner.edit",
  "partner.status",
  "application.manage",
  "partner.payout",
  "orders.view",
  "orders.view_pii",
  "orders.reroute",
  "orders.cancel",
  "orders.refund",
  "orders.resend",
] as const;
export type AdminPermission = (typeof adminPermissions)[number];

export const ADMIN_PERMISSIONS: Readonly<
  Record<AdminPermission, readonly AdminRole[]>
> = Object.freeze({
  "users.manage": ["admin"],
  "audit.read": ["admin"],
  // High-risk flags are admin-only too (spec 012 §2.4); the flags page checks the risk level.
  "flags.toggle": ["admin"],
  "partner.edit": ["admin", "ops"],
  "partner.status": ["admin", "ops"],
  "application.manage": ["admin", "ops"],
  "partner.payout": ["admin", "finance"],
  "orders.view": ["admin", "ops", "finance"],
  "orders.view_pii": ["admin", "ops"],
  "orders.reroute": ["admin", "ops"],
  "orders.cancel": ["admin"],
  "orders.refund": ["admin"],
  "orders.resend": ["admin", "ops"],
});

/** Whether any of `roles` holds `permission`. An unknown permission is refused. */
export function can(
  roles: readonly string[],
  permission: AdminPermission,
): boolean {
  const allowed: readonly string[] | undefined = Object.hasOwn(
    ADMIN_PERMISSIONS,
    permission,
  )
    ? ADMIN_PERMISSIONS[permission]
    : undefined;
  return allowed !== undefined && roles.some((role) => allowed.includes(role));
}
