/** Public barrel for `admin` (admin queries and actions). Owned by: spec 012. */
export {
  ADMIN_PERMISSIONS,
  type AdminPermission,
  type AdminRole,
  adminPermissions,
  can,
} from "./permissions";
export { type GuardDeps, requireAdminPage, requirePermission } from "./guard";
export {
  type AdminGrant,
  AdminDeactivateSchema,
  AdminGrantSchema,
  AdminRevokeSchema,
  type AdminRunner,
  type AdminUserRow,
  type UserCommandResult,
  adminRunner,
  deactivateUser,
  grantRole,
  listAdminUsers,
  revokeRole,
} from "./users";
export {
  type AdminHomeCounts,
  AdminHomeCountsSchema,
  adminHomeCounts,
} from "./home";
export { ADMIN_LOCALE, adminMessages, adminT } from "./messages";
export { ADMIN_NAV, type AdminNavItem, adminNavFor } from "./nav";
export { adminRequestId } from "./request";
