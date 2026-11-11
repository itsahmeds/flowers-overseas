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
    | "risk"
    | "reviews"
    | "applications"
    | "partners"
    | "payouts"
    | "discounts"
    | "finance"
    | "basketReminders"
    | "catalogue"
    | "publish"
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
    // Spec 021 §5.3 (TASK-494): the risk review queue, for `risk.review` (admin, ops).
    key: "risk",
    href: "/admin/risk",
    permissions: ["risk.review"],
    built: true,
  },
  {
    // Spec 022a §5.3 (TASK-372): the reviews queue, for `reviews.moderate` (admin, ops).
    key: "reviews",
    href: "/admin/reviews",
    permissions: ["reviews.moderate"],
    built: true,
  },
  {
    key: "applications",
    href: "/admin/applications",
    permissions: ["application.manage"],
    built: true,
  },
  {
    key: "partners",
    href: "/admin/partners",
    permissions: ["partner.edit", "partner.payout"],
    built: true,
  },
  {
    // Spec 030a §2.8 (TASK-367): the payouts pages, for `payouts.manage` (admin, finance).
    key: "payouts",
    href: "/admin/payouts",
    permissions: ["payouts.manage"],
    built: true,
  },
  {
    // Spec 047 §5.3 (TASK-446): the discount codes, for `discounts.read` (admin, finance).
    key: "discounts",
    href: "/admin/discounts",
    permissions: ["discounts.read"],
    built: true,
  },
  {
    // Spec 030b §5.3 (TASK-440): the finance overview and order list, for `finance.view` (admin).
    key: "finance",
    href: "/admin/finance",
    permissions: ["finance.view"],
    built: true,
  },
  {
    // Spec 034 §14 item 4, §13 Q12 (TASK-452): "Basket emails", the admin role only (revenue
    // figures included), through `finance.view`, which only `admin` holds.
    key: "basketReminders",
    href: "/admin/basket-reminders",
    permissions: ["finance.view"],
    built: true,
  },
  // Spec 012b §2.5 (TASK-297): the product editor. Every role reads the list; editing is
  // `catalogue.edit`, prices `price.edit`.
  {
    key: "catalogue",
    href: "/admin/catalogue/products",
    permissions: ["catalogue.edit", "price.edit"],
    built: true,
  },
  // Spec 012b §2.3 (TASK-295): structural changes go out here.
  {
    key: "publish",
    href: "/admin/publish",
    permissions: ["catalogue.publish"],
    built: true,
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
