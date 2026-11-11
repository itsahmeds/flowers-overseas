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
  // spec 030a §5.2 (TASK-363): every payouts command but `savePayoutTerms` (`partner.payout`).
  "payouts.manage",
  "orders.view",
  "orders.view_pii",
  "orders.reroute",
  "orders.cancel",
  "orders.refund",
  "orders.resend",
  // spec 012b §5.2 (TASK-293): the two rows the review ledger reads.
  "translation.attest",
  "media.review",
  // spec 047 §5.2 (TASK-446): the discount codes pages and their three actions.
  "discounts.read",
  "discounts.write",
  // spec 030b §5.2 (TASK-440): money figures and their export (admin only), and the florist
  // relationship record (admin and ops), which TASK-441's tabs read.
  "finance.view",
  "finance.export",
  "partner.crm.view",
  "partner.crm.write",
  // spec 030b §14.4 (TASK-442): the florist contract register, admin only (§13 Q15).
  "partner.contract.view",
  "partner.contract.write",
  // spec 021 §5.2 "Permissions" (TASK-494): the review queue, the blocklist, the evidence pack.
  "risk.review",
  "risk.blocklist",
  "risk.evidence",
  // spec 012b §5.2 (TASK-295): Publish, the rebuild of the tracked branch head.
  "catalogue.publish",
  // spec 022a §2 "Moderation" (TASK-372): the reviews queue, a review, and the four actions.
  "reviews.moderate",
  // spec 012b §5.2 (TASK-297, TASK-298): the product editor, its supplier florist, its prices.
  "catalogue.edit",
  "catalogue.supplier",
  "price.edit",
  // spec 012b §5.2 (TASK-300): the go-live flip and the two go-live fiscal fields.
  "country.status",
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
  "payouts.manage": ["admin", "finance"],
  "orders.view": ["admin", "ops", "finance"],
  "orders.view_pii": ["admin", "ops"],
  "orders.reroute": ["admin", "ops"],
  "orders.cancel": ["admin"],
  "orders.refund": ["admin"],
  "orders.resend": ["admin", "ops"],
  // spec 012b §5.2: any admin may attest copy, but only in a locale `reviewer_locale` grants them
  // (`attest()` checks the grant); photos need `media.review`.
  "translation.attest": ["admin", "ops", "finance", "content"],
  "media.review": ["admin", "content"],
  // spec 047 §13 Q12: `admin` creates and edits; `admin` and `finance` read.
  "discounts.read": ["admin", "finance"],
  "discounts.write": ["admin"],
  // spec 030b §5.2, §13 Q1 and Q2: money is admin only; ops read and write the relationship.
  "finance.view": ["admin"],
  "finance.export": ["admin"],
  "partner.crm.view": ["admin", "ops"],
  "partner.crm.write": ["admin", "ops"],
  // spec 030b §13 Q15: who sees and uploads contracts? Admin only.
  "partner.contract.view": ["admin"],
  "partner.contract.write": ["admin"],
  // spec 021 §5.2: ops may approve or cancel a held order; blocking and evidence are admin only.
  "risk.review": ["admin", "ops"],
  "risk.blocklist": ["admin"],
  "risk.evidence": ["admin"],
  "catalogue.publish": ["admin", "content"],
  // spec 022a §2: moderation is admin and ops; the order link inside it still needs `orders.view`.
  "reviews.moderate": ["admin", "ops"],
  // spec 012b §5.2: products, sizes, copy (admin, content); the supplier florist and its payout
  // (admin, finance; also `partner.payout`); prices (admin, finance).
  "catalogue.edit": ["admin", "content"],
  "catalogue.supplier": ["admin", "finance"],
  "price.edit": ["admin", "finance"],
  // spec 012b §5.2: the go-live flip is admin only.
  "country.status": ["admin"],
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
