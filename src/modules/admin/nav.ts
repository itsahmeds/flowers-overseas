/**
 * The admin navigation, by role (spec 012 §5.3; artboard `admin-home-desktop.dc.html`
 * "Permission"; TASK-217).
 *
 * Each entry names the permission that shows it, read from `ADMIN_PERMISSIONS`, and whether its
 * page exists yet. An entry whose page a later task builds (`orders` TASK-222, `applications` and
 * `partners` TASK-221, `flags` TASK-220, `audit` TASK-218) is **absent** until that task flips
 * `built`: a link to a page that does not exist is a dead link, and controls that cannot act are
 * absent, not disabled (spec 004 §14 A20).
 */
import { type AdminPermission, can } from "./permissions";

export interface AdminNavItem {
  readonly key:
    | "home"
    | "orders"
    | "applications"
    | "partners"
    | "flags"
    | "audit"
    | "users";
  readonly href: string;
  /** Any of these shows the entry; empty means every signed-in role. */
  readonly permissions: readonly AdminPermission[];
  readonly built: boolean;
}

export const ADMIN_NAV: readonly AdminNavItem[] = Object.freeze([
  { key: "home", href: "/admin", permissions: [], built: true },
  {
    key: "orders",
    href: "/admin/orders",
    permissions: ["orders.view"],
    built: true,
  },
  {
    key: "applications",
    href: "/admin/applications",
    permissions: ["application.manage"],
    built: false,
  },
  {
    key: "partners",
    href: "/admin/partners",
    permissions: ["partner.edit", "partner.payout"],
    built: false,
  },
  {
    key: "flags",
    href: "/admin/flags",
    permissions: ["flags.toggle"],
    built: true,
  },
  {
    key: "audit",
    href: "/admin/audit",
    permissions: ["audit.read"],
    built: true,
  },
  {
    key: "users",
    href: "/admin/users",
    permissions: ["users.manage"],
    built: true,
  },
]);

/** The entries `roles` may see, in order, built pages only. */
export function adminNavFor(roles: readonly string[]): AdminNavItem[] {
  return ADMIN_NAV.filter(
    (item) =>
      item.built &&
      (item.permissions.length === 0 ||
        item.permissions.some((permission) => can(roles, permission))),
  );
}
